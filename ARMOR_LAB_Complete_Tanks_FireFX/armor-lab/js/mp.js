// ARMOR LAB — клиент мультиплеера: соединение, лобби, удалённые танки (интерполяция), урон/убийства по событиям сервера,
// табло, чат, килфид, респавн, конец матча. Все игровые операции с миром идут через ctx (см. game.js).
import { buildLayout, MAP_INFO } from './shared/world.js';
import { SHELLS } from './shared/rules.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const TEAM_COL = ['#63b0ff', '#ff6f5e'], TEAM_NAME = ['СИНИЕ', 'КРАСНЫЕ'];
const MODE_NAME = { ffa: 'Все против всех', tdm: 'Команды' };
const TANK_SHORT = { t90: 'Т-90М', abrams: 'M1A2', leopard: 'Leopard 2A7', merkava: 'Merkava', custom: 'Своя' };
const lerp = (a, b, k) => a + (b - a) * k;

export function createMultiplayer(ctx) {
  const { THREE, scene, targets } = ctx;
  let ws = null, status = 'offline', joined = false, me = null, token = null, room = null, myTeam = 0;
  let rtt = 0, pingTimer = null, sendAcc = 0, seq = 0, sidSeq = 1, uiAcc = 0, retry = 0, retryTimer = null, intentionalClose = false;
  let board = [], teamScore = [0, 0], leftSec = 0, leftAt = 0, over = null, respawnAt = 0, protUntil = 0, selfAlive = true, wantJoin = null, lobbyRooms = [], online = 0;
  const remotes = new Map();
  const chatLog = [];
  let fps = 60, fpsAcc = 0, fpsN = 0;

  // ───────────── DOM ─────────────
  const root = document.createElement('div'); root.id = 'mpRoot';
  root.innerHTML = `
  <div class="modal" id="mpLobby"><div class="modalcard mp-lobby">
    <div class="modalhead"><h2>ОНЛАЙН · КОМНАТЫ</h2><button class="button" id="mpLobbyClose">ЗАКРЫТЬ ✕</button></div>
    <div class="mp-status"><span id="mpConn" class="mp-dot"></span><b id="mpConnText">Подключение…</b><span class="muted" id="mpOnline"></span></div>
    <div class="mp-actions"><button class="button primary" id="mpQuick">БЫСТРАЯ ИГРА</button><button class="button" id="mpRefresh">ОБНОВИТЬ</button></div>
    <div id="mpRooms" class="mp-rooms"></div>
    <details class="mp-create"><summary>Создать свою комнату</summary>
      <div class="mp-create-grid"><label>Название<input id="mpNewName" maxlength="28" value="Моя комната"></label>
      <label>Карта<select id="mpNewMap"><option value="range">Учебный полигон</option><option value="desert">Пустыня</option><option value="dusk">Сумерки</option></select></label>
      <label>Режим<select id="mpNewMode"><option value="ffa">Все против всех (15 фрагов)</option><option value="tdm">Команды (30 фрагов)</option></select></label>
      <button class="button primary" id="mpCreate">СОЗДАТЬ И ВОЙТИ</button></div></details>
    <p class="note">Все игроки комнаты видят одну и ту же карту, укрытия и техники друг друга. Техника: <b id="mpMyTank">—</b> (меняется на экране «Выбор танка» до входа в комнату).</p>
  </div></div>
  <div id="mpBar" class="mp-bar"><span id="mpBarMain"></span><span id="mpBarInfo" class="muted"></span><button class="button" id="mpBoardBtn">ТАБЛО</button><button class="button" id="mpChatBtn">ЧАТ</button><button class="button" id="mpSuicide" title="Самоуничтожение (если застрял)">САМОУНИЧТ.</button><button class="button" id="mpLeave">ВЫЙТИ</button></div>
  <div id="mpFeed" class="mp-feed"></div>
  <div id="mpChat" class="mp-chat"><div id="mpChatLog"></div><input id="mpChatInput" maxlength="160" placeholder="Сообщение (Enter — отправить, Esc — отмена)" autocomplete="off"></div>
  <div id="mpBoard" class="mp-board"></div>
  <div id="mpDead" class="mp-center"><b>УНИЧТОЖЕН</b><span id="mpDeadSub"></span></div>
  <div id="mpOver" class="mp-center mp-over"></div>
  <div id="mpNet" class="mp-net"></div>`;
  document.body.appendChild(root);
  const el = id => document.getElementById(id);

  // ───────────── соединение ─────────────
  function url() {
    const o = new URLSearchParams(location.search).get('ws'); if (o) return o;
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }
  function setStatus(s, text) {
    status = s; const d = el('mpConn'); if (d) d.className = 'mp-dot ' + s; const t = el('mpConnText'); if (t) t.textContent = text || ({ open: 'Сервер доступен', connecting: 'Подключение…', offline: 'Нет соединения' }[s]);
  }
  function connect() {
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    setStatus('connecting'); intentionalClose = false;
    try { ws = new WebSocket(url()); } catch (e) { setStatus('offline', 'Неверный адрес сервера'); return; }
    const mine = ws;
    ws.onopen = () => {
      retry = 0; setStatus('open'); clearInterval(pingTimer); pingTimer = setInterval(ping, 2000); ping();
      if (joined && token) send({ t: 'join', token });               // восстановление после обрыва
      else if (wantJoin) { send(wantJoin); }
    };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
    ws.onclose = () => {
      if (mine !== ws) return; clearInterval(pingTimer);
      if (intentionalClose) { setStatus('offline'); return; }
      if (joined) {
        setStatus('offline', 'Связь потеряна'); showNet('СВЯЗЬ ПОТЕРЯНА · переподключение…');
        if (retry < 8) { retryTimer = setTimeout(connect, Math.min(4000, 500 * ++retry)); }
        else { showNet(''); notifyMsg('Не удалось переподключиться'); leave(true); }
      } else setStatus('offline', 'Нет соединения с сервером (запущен ли server.cjs?)');
    };
    ws.onerror = () => { };
  }
  const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const ping = () => send({ t: 'ping', c: performance.now() });
  const notifyMsg = s => ctx.notify(s);
  function showNet(text) { const n = el('mpNet'); n.textContent = text; n.classList.toggle('show', !!text); }

  // ───────────── лобби ─────────────
  function openLobby() {
    el('mpLobby').classList.add('show'); el('mpMyTank').textContent = ctx.getLoadout().label;
    connect(); if (status === 'open') send({ t: 'rooms' });
    renderRooms();
  }
  function closeLobby() { el('mpLobby').classList.remove('show'); }
  function renderRooms() {
    el('mpOnline').textContent = online ? ' · игроков онлайн: ' + online : '';
    const box = el('mpRooms');
    if (!lobbyRooms.length) { box.innerHTML = '<div class="mp-empty">' + (status === 'open' ? 'Комнат нет — создайте свою или нажмите «Быстрая игра».' : 'Ожидание сервера…') + '</div>'; return; }
    box.innerHTML = lobbyRooms.map(r => `<div class="mp-room"><div><b>${esc(r.name)}</b><small>${esc(r.mapName)} · ${MODE_NAME[r.mode]} · ${r.state === 'over' ? 'итоги матча' : 'до конца ' + mmss(r.left)}</small></div><span class="mp-count ${r.players >= r.max ? 'full' : ''}">${r.players}/${r.max}</span><button class="button primary" data-room="${r.id}" ${r.players >= r.max ? 'disabled' : ''}>ВОЙТИ</button></div>`).join('');
    box.querySelectorAll('[data-room]').forEach(b => b.onclick = () => doJoin({ room: b.dataset.room }));
  }
  function doJoin(extra) {
    const lo = ctx.getLoadout();
    wantJoin = { t: 'join', name: ctx.getNick(), tank: lo.tank, design: lo.design, traits: lo.traits, ...extra };
    if (status !== 'open') { connect(); notifyMsg('Подключение к серверу…'); return; }
    send(wantJoin);
  }
  el('mpLobbyClose').onclick = closeLobby; el('mpRefresh').onclick = () => { connect(); send({ t: 'rooms' }); };
  el('mpQuick').onclick = () => doJoin({});
  el('mpCreate').onclick = () => doJoin({ create: { name: el('mpNewName').value, map: el('mpNewMap').value, mode: el('mpNewMode').value } });
  setInterval(() => { if (el('mpLobby').classList.contains('show') && status === 'open') send({ t: 'rooms' }); }, 4000);

  // ───────────── удалённые игроки ─────────────
  function makeTag(name, team, friend) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 72; const g = c.getContext('2d');
    g.font = '700 30px system-ui,Segoe UI,sans-serif'; g.textAlign = 'center'; g.lineJoin = 'round'; g.lineWidth = 7; g.strokeStyle = 'rgba(8,12,9,.9)';
    g.strokeText(name, 160, 44); g.fillStyle = room && room.mode === 'tdm' ? TEAM_COL[team] : '#ffe08a'; g.fillText(name, 160, 44);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: !friend, depthWrite: false }));
    sp.scale.set(6.4, 1.44, 1); sp.position.y = 4.1; sp.renderOrder = 10; return sp;
  }
  function applyStates(t, st) {
    t.hp = st.hp; t.engine = st.engine; t.track = st.track; t.gunHp = st.gun; t.crew = st.crew; t.ammo = st.ammo; t.fuel = st.fuel;
  }
  function addRemote(p) {
    let key = p.tank;
    if (p.tank === 'custom') { key = 'custom@' + p.id; try { ctx.vehicleFactories[key] = ctx.customFactory(p.design); } catch (e) { key = 't90'; } }
    let g;
    try { g = ctx.makeTarget(p.x, p.z, null, key); }
    catch (e) { console.warn('remote model failed', e); key = 't90'; g = ctx.makeTarget(p.x, p.z, null, key); }
    const t = targets[targets.length - 1];
    const friend = room.mode === 'tdm' && p.team === myTeam;
    t.net = { id: p.id, name: p.name, team: p.team, buf: [], v: 0, w: 0, key };
    t.botName = p.name; t.alive = !!p.alive; applyStates(t, p.states || { hp: 100, engine: 100, track: 100, gun: 100, crew: 100, ammo: 100, fuel: 100 });
    g.position.set(p.x, 0, p.z); g.rotation.set(0, p.yaw || 0, 0); g.visible = true;
    t.tag = makeTag(p.name, p.team, friend); g.add(t.tag);
    if (!p.alive) { g.rotation.z = .35; g.position.y = -.2; t.tag.visible = false; }
    remotes.set(p.id, t);
    return t;
  }
  function removeRemote(id) {
    const t = remotes.get(id); if (!t) return; remotes.delete(id);
    const i = targets.indexOf(t); if (i >= 0) targets.splice(i, 1);
    scene.remove(t.group);
    t.group.traverse(o => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose?.(); m.dispose?.(); }); });
    if (t.net.key.startsWith('custom@')) { delete ctx.vehicleFactories[t.net.key]; ctx.xr.invalidate(t.net.key); }
  }
  function clearRemotes() { for (const id of [...remotes.keys()]) removeRemote(id); }
  const nameOf = id => id === me ? 'Вы' : (remotes.get(id)?.net.name || (board.find(b => b.id === id) || {}).name || '???');
  const colOf = id => { const b = board.find(x => x.id === id); return room && room.mode === 'tdm' && b ? TEAM_COL[b.team] : '#e8ecd9'; };
  const isFriend = t => !!(t && t.net && room && room.mode === 'tdm' && t.net.team === myTeam);

  // ───────────── входящие сообщения ─────────────
  function onMsg(m) {
    switch (m.t) {
      case 'hello': lobbyRooms = m.rooms; online = m.online; renderRooms(); break;
      case 'rooms': lobbyRooms = m.rooms; online = m.online; renderRooms(); break;
      case 'pong': rtt = Math.round(performance.now() - m.c); send({ t: 'rtt', v: rtt }); break;
      case 'err': notifyMsg(m.text); wantJoin = null; break;
      case 'joined': enterRoom(m); break;
      case 'pjoin': if (joined && m.p.id !== me && !remotes.has(m.p.id)) addRemote(m.p); break;
      case 'pleave': removeRemote(m.id); break;
      case 'snap': onSnap(m); break;
      case 'shot': ctx.remoteShot(m, remotes.get(m.by)); break;
      case 'dmg': onDmg(m); break;
      case 'kill': onKill(m); break;
      case 'spawn': onSpawn(m); break;
      case 'cover': ctx.removeCover(m.id, true); break;
      case 'correct': ctx.setSelfPose(m.x, m.z, m.yaw); break;
      case 'denied': ctx.setShells(m.shells); if (m.why === 'ammo') notifyMsg('Боекомплект пуст'); break;
      case 'chat': addChat(m); break;
      case 'sys': addChat({ sys: true, text: m.text }); break;
      case 'over': onOver(m); break;
    }
  }
  function enterRoom(m) {
    wantJoin = null; token = m.token; me = m.you; room = m.room; joined = true; over = null; retry = 0; showNet('');
    closeLobby(); el('mpOver').classList.remove('show'); el('mpDead').classList.remove('show');
    clearRemotes();
    const ys = m.you_state; myTeam = ys.team; board = m.board; teamScore = m.room.teamScore; leftSec = m.room.left; leftAt = performance.now();
    ctx.setMpActive(true, room);
    ctx.applyLayout(buildLayout(room.map, room.seed), m.dead, room.map);
    for (const p of m.players) if (p.id !== me) addRemote(p);
    selfAlive = ys.alive;
    if (ys.alive) { ctx.selfRespawn(ys.x, ys.z, ys.yaw, ys.st, ys.shells, true); protUntil = performance.now() + 2500; }
    else { ctx.selfRespawn(ys.x, ys.z, ys.yaw, ys.st, ys.shells, true); ctx.selfDie(null, true); showDead('', Math.max(0, (ys.respawnAt - Date.now()) / 1000)); }
    root.classList.add('in-room'); document.body.classList.add('mp-on');
    if (!m.resumed) addChat({ sys: true, text: 'Вы в комнате «' + room.name + '» · ' + MAP_INFO[room.map].name + ' · ' + MODE_NAME[room.mode] + (room.mode === 'tdm' ? ' · ваша команда: ' + TEAM_NAME[myTeam] : '') });
    updateBar(true);
  }
  function onSnap(m) {
    const at = performance.now();
    for (const e of m.p) {
      const t = remotes.get(e[0]); if (!t || !t.alive) continue;
      const b = t.net.buf; b.push({ at, x: e[1], z: e[2], yaw: e[3], ty: e[4], gp: e[5], v: e[6], w: e[7] });
      if (b.length > 14) b.shift();
    }
    if (m.board) { board = m.board; leftSec = m.left; leftAt = at; teamScore = m.ts || teamScore; if (el('mpBoard').classList.contains('show')) renderBoard(); }
  }
  function onDmg(m) {
    const self = m.tid === me, t = self ? null : remotes.get(m.tid); if (!self && !t) return;
    if (t) applyStates(t, m.st); else ctx.setSelfStates(m.st);
    const root3 = self ? ctx.selfRoot() : t.model.root;
    if (m.xi && m.xi.pointL && m.by !== me) { const p = root3.localToWorld(new THREE.Vector3(...m.xi.pointL)); ctx.impactFx(p, m.r.penetrates); }
    if (self || m.by === me) {
      ctx.showImpact(m, self ? ctx.selfType() : t.type, self ? 'ПО ВАМ' : t.net.name, nameOf(m.by));
      if (self) { ctx.hitFlash(); notifyMsg(m.r.ricochet ? 'Рикошет от вашей брони' : !m.r.penetrates ? 'Броня выдержала (' + nameOf(m.by) + ')' : 'Попадание от ' + nameOf(m.by) + ': ' + m.text); }
      else if (m.r.penetrates) notifyMsg('Пробитие: ' + m.text);
      else notifyMsg(m.r.ricochet ? 'Рикошет' : 'Броня не пробита');
    }
  }
  function feed(html) { const f = el('mpFeed'), d = document.createElement('div'); d.className = 'mp-feed-row'; d.innerHTML = html; f.prepend(d); while (f.children.length > 6) f.lastChild.remove(); setTimeout(() => d.remove(), 9000); }
  function onKill(m) {
    board = m.board || board; teamScore = m.teamScore || teamScore;
    const w = m.weapon ? ' <i>[' + esc(m.weapon) + (m.cookoff ? ' · детонация' : '') + ']</i>' : '';
    if (m.self) feed(`<b style="color:${colOf(m.tid)}">${esc(nameOf(m.tid))}</b> самоуничтожился`);
    else feed(`<b style="color:${colOf(m.by)}">${esc(nameOf(m.by))}</b> ▸ <b style="color:${colOf(m.tid)}">${esc(nameOf(m.tid))}</b>${w}`);
    if (m.tid === me) { selfAlive = false; ctx.selfDie(m.cookoff, false); showDead(m.self ? 'Самоуничтожение' : 'Вас уничтожил ' + nameOf(m.by) + (m.weapon ? ' · ' + m.weapon : ''), m.respawnIn); }
    else { const t = remotes.get(m.tid); if (t) { t.alive = false; t.net.buf.length = 0; if (t.tag) t.tag.visible = false; ctx.destroyRemote(t, m.cookoff); } }
    if (m.by === me && !m.self) { notifyMsg('УНИЧТОЖЕН ' + nameOf(m.tid) + (m.cookoff ? ' · детонация БК' : '')); ctx.scorePing(); }
    updateBar(true);
  }
  function onSpawn(m) {
    if (m.id === me) {
      selfAlive = true; protUntil = performance.now() + 3000; el('mpDead').classList.remove('show'); ctx.selfRespawn(m.x, m.z, m.yaw, m.st, m.shells, false);
    } else {
      const t = remotes.get(m.id); if (!t) return; t.alive = true; t.net.buf.length = 0; applyStates(t, m.st);
      ctx.reviveRemote(t, m.x, m.z, m.yaw); if (t.tag) t.tag.visible = true;
    }
  }
  function onOver(m) {
    over = m; board = m.board; teamScore = m.teamScore || teamScore; over.until = performance.now() + m.nextIn * 1000;
    el('mpDead').classList.remove('show');
    const w = room.mode === 'tdm' ? (m.winner === 'draw' ? 'НИЧЬЯ' : m.winner === 'blue' ? 'ПОБЕДА СИНИХ' : 'ПОБЕДА КРАСНЫХ') : ('ПОБЕДИТЕЛЬ: ' + esc(m.winner || '—'));
    el('mpOver').innerHTML = `<b>МАТЧ ОКОНЧЕН</b><span class="mp-win">${w}</span>${boardHtml(m.board)}<span id="mpOverTimer" class="muted"></span>`;
    el('mpOver').classList.add('show');
  }
  function showDead(sub, secs) { el('mpDeadSub').textContent = sub; el('mpDead').dataset.until = String(performance.now() + secs * 1000); el('mpDead').classList.add('show'); }

  // ───────────── табло / чат / HUD ─────────────
  function boardHtml(b) {
    const tdm = room && room.mode === 'tdm';
    const rows = b.map((p, i) => `<tr class="${p.id === me ? 'me' : ''} ${p.alive ? '' : 'dead'}"><td>${i + 1}</td><td style="color:${tdm ? TEAM_COL[p.team] : '#e8ecd9'}">${esc(p.name)}${p.off ? ' <i>(нет связи)</i>' : ''}</td><td>${esc(TANK_SHORT[p.tank] || p.tank)}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.score}</td><td>${p.ping || '—'}</td></tr>`).join('');
    return `<table><thead><tr><th>#</th><th>Игрок</th><th>Техника</th><th>Фраги</th><th>Смерти</th><th>Очки</th><th>Пинг</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function renderBoard() {
    const head = room.mode === 'tdm' ? `<div class="mp-tscore"><b style="color:${TEAM_COL[0]}">СИНИЕ ${teamScore[0]}</b> : <b style="color:${TEAM_COL[1]}">${teamScore[1]} КРАСНЫЕ</b></div>` : '';
    el('mpBoard').innerHTML = `<h3>${esc(room.name)} · ${MAP_INFO[room.map].name}</h3>${head}${boardHtml(board)}`;
  }
  function addChat(m) {
    chatLog.push({ ...m, at: performance.now() }); if (chatLog.length > 40) chatLog.shift(); renderChat();
  }
  function renderChat() {
    const t = performance.now(), open = el('mpChat').classList.contains('open');
    el('mpChatLog').innerHTML = chatLog.filter(c => open || t - c.at < 9000).slice(-8).map(c => c.sys ? `<div class="sys">${esc(c.text)}</div>` : `<div><b style="color:${room && room.mode === 'tdm' ? TEAM_COL[c.team] : '#ffe08a'}">${esc(c.name)}:</b> ${esc(c.text)}</div>`).join('');
  }
  function updateBar(force) {
    if (!joined) return;
    const left = Math.max(0, leftSec - (performance.now() - leftAt) / 1000);
    const main = room.mode === 'tdm' ? `<b style="color:${TEAM_COL[0]}">${teamScore[0]}</b> : <b style="color:${TEAM_COL[1]}">${teamScore[1]}</b>` : (() => { const top = board.slice().sort((a, b) => b.kills - a.kills)[0]; return top ? 'Лидер: <b>' + esc(top.name) + '</b> · ' + top.kills + ' / ' + room.killLimit : 'Бой'; })();
    el('mpBarMain').innerHTML = main + ' · ' + mmss(over ? 0 : left);
    const mine = board.find(b => b.id === me);
    el('mpBarInfo').textContent = (room.mode === 'tdm' ? 'Команда: ' + TEAM_NAME[myTeam] + ' · ' : '') + 'до ' + room.killLimit + ' фрагов · ' + board.filter(b => !b.off).length + ' игр.';
    ctx.setScoreText(mine ? mine.score + ' / ' + mine.kills : '0 / 0'); ctx.setRoundText(mmss(over ? 0 : left));
  }

  // chat input / scoreboard keys (capture: перехватываем до игровых обработчиков)
  const chatIn = el('mpChatInput');
  const typing = () => document.activeElement === chatIn;
  function closeChat() { chatIn.blur(); chatIn.value = ''; el('mpChat').classList.remove('open'); renderChat(); }
  addEventListener('keydown', e => {
    if (!joined) return;
    if (typing()) {
      e.stopPropagation();
      if (e.key === 'Enter') { const text = chatIn.value.trim(); if (text) send({ t: 'chat', text, all: true }); closeChat(); }
      else if (e.key === 'Escape') closeChat();
      return;
    }
    if (e.key === 'Enter' && !e.repeat && !document.querySelector('.modal.show')) { e.preventDefault(); e.stopPropagation(); if (document.pointerLockElement) document.exitPointerLock(); el('mpChat').classList.add('open'); renderChat(); chatIn.focus(); }
    else if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); if (!el('mpBoard').classList.contains('show')) { renderBoard(); el('mpBoard').classList.add('show'); } }
  }, true);
  addEventListener('keyup', e => {
    if (typing()) { e.stopPropagation(); return; }
    if (e.key === 'Tab') el('mpBoard').classList.remove('show');
  }, true);

  el('mpBoardBtn').onclick = () => { const b = el('mpBoard'); if (b.classList.toggle('show')) renderBoard(); };
  el('mpChatBtn').onclick = () => { if (document.pointerLockElement) document.exitPointerLock(); el('mpChat').classList.add('open'); renderChat(); chatIn.focus(); };
  el('mpLeave').onclick = () => leave();
  el('mpSuicide').onclick = () => { if (selfAlive) send({ t: 'suicide' }); };

  // ───────────── выход ─────────────
  function leave(silent) {
    if (joined) send({ t: 'leave' });
    joined = false; token = null; intentionalClose = true; clearTimeout(retryTimer); showNet('');
    clearRemotes(); room = null; over = null; wantJoin = null;
    root.classList.remove('in-room'); document.body.classList.remove('mp-on');
    for (const id of ['mpDead', 'mpOver', 'mpBoard']) el(id).classList.remove('show');
    try { ws && ws.close(); } catch { } ws = null; setStatus('offline'); chatLog.length = 0; renderChat();
    ctx.setMpActive(false, null);
    if (!silent) notifyMsg('Вы вышли из онлайн-комнаты · одиночный полигон');
  }

  // ───────────── кадр ─────────────
  function update(dt) {
    fpsAcc += dt; fpsN++; if (fpsAcc > 1) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    if (!joined) return;
    const now = performance.now(), rt = now - 110;
    for (const t of remotes.values()) {
      if (!t.alive) continue; const b = t.net.buf; if (!b.length) continue;
      let a = null, c = null;
      for (let i = b.length - 1; i >= 0; i--) if (b[i].at <= rt) { a = b[i]; c = b[i + 1] || null; break; }
      let s;
      if (!a) s = b[0];
      else if (c) { const k = Math.min(1, Math.max(0, (rt - a.at) / Math.max(1, c.at - a.at))); s = { x: lerp(a.x, c.x, k), z: lerp(a.z, c.z, k), yaw: lerp(a.yaw, c.yaw, k), ty: lerp(a.ty, c.ty, k), gp: lerp(a.gp, c.gp, k), v: lerp(a.v, c.v, k), w: lerp(a.w, c.w, k) }; }
      else { const d = Math.min(.15, (rt - a.at) / 1000); s = { ...a, x: a.x - Math.sin(a.yaw) * a.v * d, z: a.z - Math.cos(a.yaw) * a.v * d }; }
      t.group.position.set(s.x, 0, s.z); t.group.rotation.set(0, s.yaw, 0);
      if (t.botTurret) t.botTurret.rotation.y = s.ty; if (t.model.gun) t.model.gun.rotation.x = s.gp;
      ctx.trackUpdate(t.model, dt, s.v, s.w);
    }
    sendAcc += dt;
    if (sendAcc >= .05 && selfAlive && !over) { sendAcc = 0; const s = ctx.getSelf(); send({ t: 'state', seq: ++seq, x: +s.x.toFixed(2), z: +s.z.toFixed(2), yaw: +s.yaw.toFixed(3), ty: +s.ty.toFixed(3), gp: +s.gp.toFixed(3), v: +s.v.toFixed(2), w: +s.w.toFixed(3) }); }
    uiAcc += dt;
    if (uiAcc > .25) {
      uiAcc = 0; updateBar();
      el('mpNet').classList.contains('show') || (el('mpNet').textContent = '');
      const ch = el('mpChat'); if (!ch.classList.contains('open')) renderChat();
      const d = el('mpDead'); if (d.classList.contains('show')) { const left = Math.max(0, (Number(d.dataset.until) - now) / 1000); el('mpDeadSub').dataset.s = left.toFixed(1); d.querySelector('em')?.remove(); const em = document.createElement('em'); em.textContent = 'Возрождение через ' + Math.ceil(left) + ' с'; d.appendChild(em); }
      if (over) { const s = Math.max(0, Math.ceil((over.until - now) / 1000)); const tEl = el('mpOverTimer'); if (tEl) tEl.textContent = 'Следующий матч через ' + s + ' с · карта сменится'; }
      el('mpNet').dataset.info = ''; const prot = now < protUntil && selfAlive ? ' · ЗАЩИТА' : '';
      el('mpBarInfo').title = 'Пинг ' + rtt + ' мс · ' + fps + ' FPS';
      const net = el('mpNet'); if (!net.classList.contains('show')) { net.classList.add('stat'); net.textContent = 'ПИНГ ' + rtt + ' мс · ' + fps + ' FPS' + prot; }
    }
  }

  return {
    get active() { return joined; }, get alive() { return selfAlive; }, get room() { return room; }, get myId() { return me; },
    openLobby, update, leave, typing, isFriend, nextSid: () => sidSeq++,
    sendFire(sid, o, d, s) { send({ t: 'fire', sid, s, o: [o.x, o.y, o.z], d: [d.x, d.y, d.z] }); },
    sendHit(sid, t, r, xi) { send({ t: 'hit', sid, tid: t.net.id, r, xi }); },
    sendCover(sid, id) { send({ t: 'cover', sid, id }); },
    remoteOf: t => t && t.net ? t.net.id : null,
    suicide() { if (selfAlive) send({ t: 'suicide' }); }
  };
}
