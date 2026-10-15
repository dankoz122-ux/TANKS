// бот-противник: заходит в комнату с игроком из браузера, стреляет по нему, проверяет синхронизацию
const PORT = process.argv[2], sleep = ms => new Promise(r => setTimeout(r, ms));
const rooms = (await (await fetch(`http://127.0.0.1:${PORT}/api/rooms`)).json()).rooms;
const room = rooms.sort((a, b) => b.players - a.players)[0];
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = [];
ws.onmessage = e => msgs.push(JSON.parse(e.data)); await new Promise(r => ws.onopen = r);
const send = o => ws.send(JSON.stringify(o)); const wait = async (t, ms = 5000) => { const s = Date.now(); for (;;) { const i = msgs.findIndex(m => m.t === t); if (i >= 0) return msgs.splice(i, 1)[0]; if (Date.now() - s > ms) throw new Error('timeout ' + t); await sleep(20); } };
send({ t: 'join', name: 'BotKiller', tank: 'leopard', room: room.id }); const j = await wait('joined');
const target = j.players.find(p => p.name !== 'BotKiller'); const out = { room: room.name, players: j.players.map(p => p.name + ':' + p.tank), seed: j.room.seed };
// движение страницы: следим за снимками
const xs = []; const t0 = Date.now(); while (Date.now() - t0 < 2500) { const s = msgs.filter(m => m.t === 'snap').pop(); const e = s && s.p.find(q => q[0] === target.id); if (e) xs.push([e[1], e[2]]); msgs.length = 0; await sleep(100); }
out.pageMoved = xs.length ? Math.hypot(xs.at(-1)[0] - xs[0][0], xs.at(-1)[1] - xs[0][1]).toFixed(1) : 'no-snaps';
await sleep(3000); // защита после возрождения
let sid = 1; const fireHit = async (mod, id) => { send({ t: 'fire', sid, s: 0, o: [j.you_state.x, 2, j.you_state.z], d: [0, 0, -1] }); await sleep(60); send({ t: 'hit', sid, tid: target.id, r: { zone: 'hull', key: 'hullF', face: 'F', module: mod, moduleId: id, penetrates: true, angle: 15, effective: 300 }, xi: { pointL: [0, 1.2, 2], dirL: [0, 0, -1], normalL: [0, 0, 1], pathLen: 1.5, turretYaw: 0, gunPitch: 0 } }); sid++; await sleep(5400); };
await fireHit('ammo', 'ammo'); await fireHit('ammo', 'ammo');
const kill = await wait('kill', 3000); out.kill = { by: kill.by === j.you, cookoff: kill.cookoff };
send({ t: 'chat', text: 'привет из бота' }); await sleep(500);
await sleep(6500); const sp = msgs.find(m => m.t === 'spawn' && m.id === target.id); out.respawned = !!sp;
console.log('RESULT ' + JSON.stringify(out)); ws.close(); process.exit(0);
