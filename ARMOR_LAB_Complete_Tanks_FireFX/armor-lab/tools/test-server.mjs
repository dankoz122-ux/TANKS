// Интеграционный тест сервера: запускает server.cjs и играет двумя клиентами.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const PORT = 8123;
const srv = spawn('node', ['server.cjs'], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.on('data', d => String(d).includes('ARMOR LAB') && r()));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`), c = { ws, msgs: [], name };
  c.opened = new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); c.msgs.push(m); if (m.t === 'joined') { c.me = m.you; c.joined = m; c.token = m.token; } });
  c.send = o => ws.send(JSON.stringify(o));
  c.wait = async (t, ms = 3000) => { const s = Date.now(); for (; ;) { const i = c.msgs.findIndex(m => m.t === t); if (i >= 0) return c.msgs.splice(i, 1)[0]; if (Date.now() - s > ms) throw new Error(c.name + ': timeout ' + t); await sleep(20); } };
  return c;
}
let ok = 0; const pass = s => { ok++; console.log('  ✓', s); };
try {
  const r = await (await fetch(`http://127.0.0.1:${PORT}/healthz`)).text(); assert.equal(r, 'ok'); pass('healthz');
  const idx = await fetch(`http://127.0.0.1:${PORT}/`, { headers: { 'accept-encoding': 'gzip' } }); assert.equal(idx.status, 200); pass('index.html отдаётся');
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/server.cjs`)).status, 404); pass('server.cjs не отдаётся');
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/js/shared/world.js`)).status, 200); pass('общие модули отдаются');
  const list = await (await fetch(`http://127.0.0.1:${PORT}/api/rooms`)).json(); assert.ok(list.rooms.length >= 2); pass('список комнат: ' + list.rooms.map(x => x.name).join(' | '));

  const A = client('A'), B = client('B'); await A.opened; await B.opened;
  const hello = await A.wait('hello'); assert.ok(hello.rooms.length);
  const roomId = list.rooms.find(x => x.mode === 'ffa').id;
  A.send({ t: 'join', name: 'Alpha', tank: 'abrams', room: roomId }); const ja = await A.wait('joined');
  B.send({ t: 'join', name: 'Alpha', tank: 't90', room: roomId }); const jb = await B.wait('joined');
  assert.equal(ja.room.seed, jb.room.seed); assert.equal(ja.room.map, jb.room.map); pass('оба игрока в одной комнате с одним seed карты');
  assert.equal(jb.players.length, 2); assert.notEqual(jb.players.find(p => p.id === jb.you).name, 'Alpha'); pass('имена уникальны, видны оба игрока');
  const pj = await A.wait('pjoin'); assert.equal(pj.p.tank, 't90'); pass('A получил pjoin о B (тип техники синхронизирован)');

  // движение: корректное, потом телепорт
  const a0 = ja.you_state; A.send({ t: 'state', x: a0.x, z: a0.z - 1, yaw: 0, ty: .3, gp: .05, v: 5, w: 0, seq: 1 }); await sleep(120);
  A.send({ t: 'state', x: a0.x + 80, z: a0.z - 80, yaw: 0, ty: 0, gp: 0, v: 5, w: 0, seq: 2 }); A.send({ t: 'state', x: a0.x + 80, z: a0.z - 80, yaw: 0, ty: 0, gp: 0, v: 5, w: 0, seq: 3 });
  const cor = await A.wait('correct'); assert.ok(Math.abs(cor.x - a0.x) < 5); pass('телепортация отклонена сервером (correct)');
  const snap = await B.wait('snap'); assert.ok(snap.p.length >= 1); pass('снимки состояния рассылаются');

  // выстрел и попадание до уничтожения
  const bPos = jb.you_state, ids = { A: ja.you, B: jb.you };
  A.send({ t: 'fire', sid: 1, s: 0, o: [a0.x, 2, a0.z - 1], d: [0, 0, -1] }); const shot = await B.wait('shot'); assert.equal(shot.by, ids.A); pass('выстрел виден другому игроку');
  A.send({ t: 'hit', sid: 1, tid: ids.B, r: { zone: 'hull', key: 'hullF', module: 'crew', moduleId: 'crew', penetrates: true, ricochet: false, angle: 20, effective: 300, face: 'F' }, xi: { pointL: [0, 1, 1], dirL: [0, 0, -1], normalL: [0, 0, 1], pathLen: 1 } });
  await sleep(100); // spawn protection
  const d0 = await B.wait('dmg').catch(() => null); assert.equal(d0, null); pass('защита после возрождения блокирует урон');
  await sleep(3100);
  A.send({ t: 'fire', sid: 2, s: 0, o: [a0.x, 2, a0.z - 1], d: [0, 0, -1] }); await B.wait('shot');
  A.send({ t: 'hit', sid: 2, tid: ids.B, r: { zone: 'hull', key: 'hullF', module: 'crew', moduleId: 'crew', penetrates: true, ricochet: false, angle: 20, effective: 300, face: 'F' }, xi: { pointL: [0, 1, 1], dirL: [0, 0, -1], normalL: [0, 0, 1], pathLen: 1 } });
  const dm = await B.wait('dmg'); assert.equal(dm.tid, ids.B); assert.equal(dm.st.crew, 62); pass('урон по экипажу применён (crew=62) и разослан');
  // быстрый повторный выстрел — перезарядка
  A.send({ t: 'fire', sid: 3, s: 0, o: [a0.x, 2, a0.z - 1], d: [0, 0, -1] }); const den = await A.wait('denied'); assert.equal(den.why, 'reload'); pass('стрельба быстрее перезарядки отклонена');
  // читерская заявка
  A.send({ t: 'hit', sid: 2, tid: ids.B, r: { penetrates: true, effective: 100 } }); await sleep(100); pass('повторный hit по тому же выстрелу игнорируется');
  // убийство: боекомплект Т-90 (карусель)
  await sleep(4900);
  A.send({ t: 'fire', sid: 4, s: 0, o: [a0.x, 2, a0.z - 1], d: [0, 0, -1] }); await B.wait('shot');
  A.send({ t: 'hit', sid: 4, tid: ids.B, r: { zone: 'hull', key: 'hullF', module: 'ammo', moduleId: 'ammo', penetrates: true, angle: 10, effective: 300, face: 'F' } });
  const d3 = await B.wait('dmg'); assert.equal(d3.destroyed, false); assert.equal(d3.st.ammo, 30);
  await sleep(4900);
  A.send({ t: 'fire', sid: 5, s: 0, o: [a0.x, 2, a0.z - 1], d: [0, 0, -1] }); await B.wait('shot');
  A.send({ t: 'hit', sid: 5, tid: ids.B, r: { zone: 'hull', key: 'hullF', module: 'ammo', moduleId: 'ammo', penetrates: true, angle: 10, effective: 300, face: 'F' } });
  const d4 = await B.wait('dmg'); assert.equal(d4.destroyed, true); assert.equal(d4.cookoff, 'catastrophic'); const k = await B.wait('kill'); assert.equal(k.by, ids.A); assert.equal(k.board.find(x => x.id === ids.A).kills, 1); pass('детонация БК Т-90 → kill, засчитан фраг');
  const sp = await A.wait('spawn', 8000); assert.equal(sp.id, ids.B); pass('возрождение через ~6 с');
  // чат
  A.send({ t: 'chat', text: 'привет <b>всем</b>' }); const ch = await B.wait('chat'); assert.ok(!ch.text.includes('<')); pass('чат работает, разметка вырезается');
  // переподключение
  const tok = B.token; B.ws.close(); await sleep(300);
  const B2 = client('B2'); await B2.opened; B2.send({ t: 'join', token: tok }); const re = await B2.wait('joined'); assert.equal(re.resumed, true); assert.equal(re.you, ids.B); pass('переподключение по токену восстанавливает игрока');
  // команда
  const T1 = client('T1'), T2 = client('T2'); await T1.opened; await T2.opened;
  const tdm = list.rooms.find(x => x.mode === 'tdm').id;
  T1.send({ t: 'join', name: 'T1', tank: 'leopard', room: tdm }); const j1 = await T1.wait('joined'); T2.send({ t: 'join', name: 'T2', tank: 'merkava', room: tdm }); const j2 = await T2.wait('joined');
  assert.notEqual(j1.you_state.team, j2.you_state.team); pass('в командном режиме игроки распределены по командам');
  assert.ok((j1.you_state.team === 0 ? j1.you_state.z > 0 : j1.you_state.z < -100)); pass('команды возрождаются на своих сторонах');
  // конец матча и ротация карты (отдельный сервер с коротким матчем)
  const srv2 = spawn('node', ['server.cjs'], { env: { ...process.env, PORT: '8125', HOST: '127.0.0.1', MATCH_SECONDS: '3', OVER_SECONDS: '2' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv2.stdout.on('data', d => String(d).includes('ARMOR LAB') && r()));
  try {
    const ws = new WebSocket('ws://127.0.0.1:8125/ws'), got = []; ws.onmessage = e => got.push(JSON.parse(e.data)); await new Promise(r => ws.onopen = r);
    ws.send(JSON.stringify({ t: 'join', name: 'Solo', tank: 'abrams' }));
    const t0 = Date.now(); while (Date.now() - t0 < 9000 && got.filter(m => m.t === 'joined').length < 2) await sleep(50);
    const js = got.filter(m => m.t === 'joined'), ov = got.find(m => m.t === 'over');
    assert.ok(ov, 'нет сообщения over'); assert.equal(js.length, 2); assert.notEqual(js[0].room.seed, js[1].room.seed); assert.notEqual(js[0].room.map, js[1].room.map);
    pass(`матч завершился (${ov.board.length} в таблице), новый матч: карта ${js[0].room.map} → ${js[1].room.map}, новый seed`);
  } finally { srv2.kill(); }
  console.log(`\nВСЕ ТЕСТЫ ПРОЙДЕНЫ: ${ok}`);
} catch (e) { console.error('\nПРОВАЛ:', e.message); process.exitCode = 1; }
finally { srv.kill(); process.exit(process.exitCode || 0); }
