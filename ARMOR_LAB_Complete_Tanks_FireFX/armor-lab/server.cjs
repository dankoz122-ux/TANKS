// ARMOR LAB — сервер: раздача статики + мультиплеер по WebSocket (без внешних зависимостей).
// Запуск: node server.cjs   (Render: PORT задаётся окружением)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 12;
const MAX_ROOMS = 16;
const TICK_MS = 50;                 // 20 Гц снимки
const RESPAWN_S = 6, PROTECT_S = 3;
const MATCH_S = Number(process.env.MATCH_SECONDS) || 600, OVER_S = Number(process.env.OVER_SECONDS) || 14;
const KILL_LIMIT = { ffa: 15, tdm: 30 };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const PUBLIC = [/^\/index\.html$/, /^\/css\/[\w.\-]+$/, /^\/js\/[\w.\-\/]+\.js$/, /^\/favicon\.ico$/];

let W, R;   // общие модули (ESM) — world.js, rules.js
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const now = () => Date.now();
const rid = n => crypto.randomBytes(n).toString('hex');

// ───────────────────────── HTTP ─────────────────────────
const fileCache = new Map();
function sendFile(req, res, full) {
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const headers = { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag, 'X-Content-Type-Options': 'nosniff', Vary: 'Accept-Encoding' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && /\.(html|js|css|json|svg)$/.test(full);
    let c = fileCache.get(full);
    const ready = (body, enc) => { if (enc) headers['Content-Encoding'] = enc; headers['Content-Length'] = body.length; res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : body); };
    if (c && c.etag === etag) return ready(gz ? c.gz : c.raw, gz ? 'gzip' : null);
    fs.readFile(full, (e, raw) => {
      if (e) { res.writeHead(500); return res.end(); }
      c = { etag, raw, gz: zlib.gzipSync(raw, { level: 6 }) }; fileCache.set(full, c);
      ready(gz ? c.gz : raw, gz ? 'gzip' : null);
    });
  });
}
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (p === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (p === '/api/rooms') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ rooms: roomList(), online: onlineCount() })); }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (p === '/') p = '/index.html';
  if (!PUBLIC.some(rx => rx.test(p)) || p.includes('..')) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
  sendFile(req, res, path.join(ROOT, p));
});

// ───────────────────────── WebSocket (RFC 6455, минимальная реализация) ─────────────────────────
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 256 * 1024;
const ipCount = new Map();
class Conn {
  constructor(socket, ip) {
    this.socket = socket; this.ip = ip; this.buf = Buffer.alloc(0); this.frag = null; this.fragSize = 0;
    this.id = rid(4); this.alive = true; this.lastRx = now(); this.tokens = 120; this.lastTok = now(); this.player = null; this.onmessage = null; this.onclose = null;
    socket.on('data', d => this.feed(d));
    socket.on('close', () => this.closed());
    socket.on('error', () => { try { socket.destroy(); } catch { } });
    socket.setNoDelay(true);
  }
  feed(d) {
    this.lastRx = now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    if (this.buf.length > MAX_FRAME * 2) return this.close(1009);
    for (; ;) {
      const b = this.buf; if (b.length < 2) return;
      const fin = !!(b[0] & 0x80), op = b[0] & 15, masked = !!(b[1] & 0x80); let len = b[1] & 127, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; const hi = b.readUInt32BE(2), lo = b.readUInt32BE(6); if (hi) return this.close(1009); len = lo; off = 10; }
      if (!masked) return this.close(1002);
      if (len > MAX_FRAME) return this.close(1009);
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4), data = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 8) return this.close(1000);
      if (op === 9) { this.raw(0xA, data); continue; }
      if (op === 0xA) continue;
      if (op === 1 || op === 2 || op === 0) {
        if (op !== 0) { this.frag = []; this.fragSize = 0; this.fragOp = op; }
        if (!this.frag) return this.close(1002);
        this.frag.push(data); this.fragSize += len;
        if (this.fragSize > MAX_FRAME) return this.close(1009);
        if (fin) { const full = Buffer.concat(this.frag); this.frag = null; if (this.fragOp === 1) this.text(full.toString('utf8')); }
      }
    }
  }
  text(s) {
    const t = now(); this.tokens = Math.min(120, this.tokens + (t - this.lastTok) / 1000 * 80); this.lastTok = t;
    if (--this.tokens < 0) { if (this.tokens < -200) this.close(1008); return; }   // антифлуд
    if (this.onmessage) { try { this.onmessage(s); } catch (e) { log('handler error', e && e.stack || e); } }
  }
  raw(op, payload) {
    if (!this.alive) return;
    const n = payload.length; let h;
    if (n < 126) { h = Buffer.alloc(2); h[1] = n; } else if (n < 65536) { h = Buffer.alloc(4); h[1] = 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[1] = 127; h.writeUInt32BE(n, 6); }
    h[0] = 0x80 | op;
    try { this.socket.write(Buffer.concat([h, payload])); } catch { }
  }
  send(obj, droppable) {
    if (!this.alive) return;
    if (droppable && this.socket.writableLength > 96 * 1024) return;   // медленный клиент: пропускаем снимки
    this.raw(1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)));
  }
  close(code = 1000) { if (!this.alive) return; try { const b = Buffer.alloc(2); b.writeUInt16BE(code); this.raw(8, b); this.socket.end(); } catch { } setTimeout(() => { try { this.socket.destroy(); } catch { } }, 500); this.closed(); }
  closed() { if (!this.alive) return; this.alive = false; const c = ipCount.get(this.ip) || 1; if (c <= 1) ipCount.delete(this.ip); else ipCount.set(this.ip, c - 1); if (this.onclose) this.onclose(); }
}
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.url || '').split('?')[0] !== '/ws' || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?').split(',')[0].trim();
  if ((ipCount.get(ip) || 0) >= 8) { socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return; }
  ipCount.set(ip, (ipCount.get(ip) || 0) + 1);
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  onConnect(new Conn(socket, ip));
});

// ───────────────────────── игровая логика ─────────────────────────
const rooms = new Map();
const players = new Map();     // token → player
let roomSeq = 1;

const clampN = (v, a, b, d = 0) => { v = Number(v); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
const cleanText = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
const num3 = a => Array.isArray(a) && a.length === 3 && a.every(v => Number.isFinite(v)) ? a.map(v => +v.toFixed(3)) : null;

function makeRoom(opts = {}) {
  const map = W.MAP_INFO[opts.map] ? opts.map : 'range';
  const room = {
    id: 'r' + (roomSeq++), name: cleanText(opts.name, 28) || ('Комната ' + roomSeq), map, mode: opts.mode === 'tdm' ? 'tdm' : 'ffa',
    perm: !!opts.perm, players: new Map(), dead: new Set(), shots: new Map(), state: 'play', teamScore: [0, 0], emptySince: now(), created: now(), shotSeq: 1
  };
  newMatch(room, false);
  rooms.set(room.id, room); log('room', room.id, room.name, room.map, room.mode);
  return room;
}
function newMatch(room, rotate) {
  if (rotate) { const i = W.MAP_ORDER.indexOf(room.map); room.map = W.MAP_ORDER[(i + 1) % W.MAP_ORDER.length]; }
  room.seed = (Math.random() * 4294967295) >>> 0; room.layout = W.buildLayout(room.map, room.seed);
  room.dead.clear(); room.shots.clear(); room.state = 'play'; room.teamScore = [0, 0]; room.endsAt = now() + MATCH_S * 1000; room.overAt = 0; room.winner = null;
}
function roomList() {
  return [...rooms.values()].map(r => ({ id: r.id, name: r.name, map: r.map, mapName: W.MAP_INFO[r.map].name, mode: r.mode, players: [...r.players.values()].filter(p => p.conn).length, max: MAX_PLAYERS, state: r.state, left: Math.max(0, Math.round((r.endsAt - now()) / 1000)) }));
}
const onlineCount = () => [...players.values()].filter(p => p.conn).length;
function bcast(room, obj, except, droppable) {
  const s = JSON.stringify(obj);
  for (const p of room.players.values()) if (p.conn && p !== except) p.conn.send(s, droppable);
}
const pub = p => ({ id: p.id, name: p.name, tank: p.tank, design: p.design, team: p.team, x: p.x, z: p.z, yaw: p.yaw, ty: p.ty, gp: p.gp, alive: p.alive, states: p.st, kills: p.kills, deaths: p.deaths });
function board(room) {
  return [...room.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, kills: p.kills, deaths: p.deaths, score: p.score, tank: p.tank, alive: p.alive, ping: p.ping | 0, off: !p.conn })).sort((a, b) => b.score - a.score || b.kills - a.kills);
}
function spawnPlayer(room, p, first) {
  const others = [...room.players.values()].filter(o => o !== p && o.alive);
  const s = W.pickSpawn(room.layout, room.dead, p.team, room.mode, others);
  p.x = s.x; p.z = s.z; p.yaw = s.yaw; p.ty = 0; p.gp = 0; p.v = 0; p.w = 0;
  p.st = R.newStates(); p.alive = true; p.shells = p.traits.ammo; p.reloadUntil = 0; p.protUntil = now() + PROTECT_S * 1000; p.lastMove = now(); p.respawnAt = 0; p.spawnedAt = now();
  return s;
}

function sanitizeDesign(d) {
  if (!d || typeof d !== 'object') return null;
  let s; try { s = JSON.stringify(d); } catch { return null; }
  if (s.length > 48000) return null;
  const arrOk = a => !Array.isArray(a) || a.length <= 80;
  if (!arrOk(d.parts) || !arrOk(d.compartments) || !arrOk(d.hull && d.hull.profile) || !arrOk(d.turret && d.turret.profile)) return null;
  return JSON.parse(s);
}

function onConnect(conn) {
  conn.send({ t: 'hello', id: conn.id, rooms: roomList(), online: onlineCount(), max: MAX_PLAYERS });
  conn.onmessage = s => { let m; try { m = JSON.parse(s); } catch { return; } if (m && typeof m.t === 'string') handle(conn, m); };
  conn.onclose = () => {
    const p = conn.player; if (!p || p.conn !== conn) return;
    p.conn = null; p.dropAt = now();      // грейс 20 с на переподключение
  };
}

function handle(conn, m) {
  const p = conn.player;
  switch (m.t) {
    case 'ping': return conn.send({ t: 'pong', c: m.c, s: now() });
    case 'rooms': return conn.send({ t: 'rooms', rooms: roomList(), online: onlineCount() });
    case 'join': return doJoin(conn, m);
  }
  if (!p || !p.room) return;
  const room = p.room;
  switch (m.t) {
    case 'rtt': p.ping = clampN(m.v, 0, 5000); return;
    case 'leave': return removePlayer(p, 'вышел');
    case 'chat': {
      const text = cleanText(m.text, 160); if (!text) return;
      if (now() - p.lastChat < 700) return; p.lastChat = now();
      bcast(room, { t: 'chat', id: p.id, name: p.name, team: p.team, text, all: !!m.all || room.mode !== 'tdm' }, null);   // в командном режиме по умолчанию общий чат
      return;
    }
    case 'state': return onState(room, p, m);
    case 'fire': return onFire(room, p, m);
    case 'hit': return onHit(room, p, m);
    case 'cover': return onCover(room, p, m);
    case 'suicide': if (p.alive && now() - p.spawnedAt > 8000) kill(room, p, p, null, 'self'); return;
  }
}

function doJoin(conn, m) {
  if (conn.player && conn.player.room) return;
  // переподключение
  if (m.token && players.has(m.token)) {
    const p = players.get(m.token);
    if (p.room) {
      if (p.conn) { const old = p.conn; old.onclose = null; old.player = null; old.close(1000); }   // старое соединение ещё не заметило обрыв
      p.conn = conn; conn.player = p; p.dropAt = 0; p.lastState = now(); p.lastMove = now();
      sendJoined(p, true); bcast(p.room, { t: 'sys', text: p.name + ' вернулся в бой' }, p);
      return;
    }
  }
  let room = null;
  if (m.create) {
    if ([...rooms.values()].filter(r => !r.perm).length >= MAX_ROOMS) return conn.send({ t: 'err', text: 'Достигнут лимит комнат' });
    room = makeRoom({ name: m.create.name, map: m.create.map, mode: m.create.mode });
  } else if (m.room && rooms.has(m.room)) room = rooms.get(m.room);
  else {   // быстрый старт: самая заполненная неполная комната
    const open = [...rooms.values()].filter(r => r.players.size < MAX_PLAYERS && r.state === 'play').sort((a, b) => b.players.size - a.players.size);
    room = open[0] || makeRoom({ name: 'Быстрая игра', map: 'range', mode: 'ffa' });
  }
  if ([...room.players.values()].filter(x => x.conn).length >= MAX_PLAYERS) return conn.send({ t: 'err', text: 'Комната заполнена' });
  const tank = ['t90', 'abrams', 'leopard', 'merkava', 'custom'].includes(m.tank) ? m.tank : 't90';
  let design = null;
  if (tank === 'custom') { design = sanitizeDesign(m.design); if (!design) return conn.send({ t: 'err', text: 'Некорректный проект танка' }); }
  let name = cleanText(m.name, 20) || 'Танкист'; const names = new Set([...room.players.values()].map(x => x.name));
  for (let i = 2; names.has(name); i++) name = cleanText(m.name, 16) + '_' + i;
  const counts = [0, 0]; for (const x of room.players.values()) counts[x.team] = (counts[x.team] || 0) + 1;
  const p = {
    id: rid(2) + (room.players.size + 1), token: rid(12), conn, room, name, tank, design, traits: R.sanitizeTraits(tank, m.traits),
    team: room.mode === 'tdm' ? (counts[0] <= counts[1] ? 0 : 1) : 0, kills: 0, deaths: 0, score: 0, ping: 0, lastChat: 0, lastState: now(), spawnedAt: now(), st: R.newStates()
  };
  conn.player = p; players.set(p.token, p); room.players.set(p.id, p); room.emptySince = 0;
  spawnPlayer(room, p, true);
  sendJoined(p, false);
  bcast(room, { t: 'pjoin', p: pub(p) }, p);
  bcast(room, { t: 'sys', text: p.name + ' присоединился (' + tankLabel(p) + ')' }, null);
  log('join', p.name, room.id, 'online', onlineCount());
}
const tankLabel = p => ({ t90: 'Т-90М', abrams: 'M1A2', leopard: 'Leopard 2A7', merkava: 'Merkava', custom: 'своя машина' }[p.tank]);

function sendJoined(p, resumed) {
  const r = p.room;
  p.conn.send({
    t: 'joined', you: p.id, token: p.token, resumed, now: now(),
    room: { id: r.id, name: r.name, map: r.map, seed: r.seed, mode: r.mode, state: r.state, endsAt: r.endsAt, left: Math.round((r.endsAt - now()) / 1000), teamScore: r.teamScore, killLimit: KILL_LIMIT[r.mode] },
    dead: [...r.dead], players: [...r.players.values()].map(pub), you_state: { x: p.x, z: p.z, yaw: p.yaw, st: p.st, shells: p.shells, alive: p.alive, team: p.team, respawnAt: p.respawnAt, traits: p.traits }, board: board(r)
  });
}

function onState(room, p, m) {
  if (!p.alive || room.state !== 'play') return;
  const t = now(), dt = Math.min(0.5, Math.max(0.02, (t - p.lastMove) / 1000));
  let x = clampN(m.x, -1000, 1000), z = clampN(m.z, -1000, 1000);
  const maxD = (p.traits.maxSpeed * 1.35 + 1.5) * dt + 1.0;
  const d = Math.hypot(x - p.x, z - p.z);
  const bad = d > maxD + (p.slack || 0) || W.layoutSolidAt(room.layout, room.dead, x, z, W.PLAYER_RADIUS - .35);
  if (bad) {
    p.bad = (p.bad || 0) + 1;
    if (p.bad >= 2) { p.bad = 0; p.slack = 0; p.conn && p.conn.send({ t: 'correct', x: p.x, z: p.z, yaw: p.yaw, seq: m.seq }); p.lastMove = t; }
    return;
  }
  p.bad = 0; p.lastMove = t; p.slack = 0;
  p.x = x; p.z = z; p.yaw = clampN(m.yaw, -1e4, 1e4); p.ty = clampN(m.ty, -4, 4); p.gp = clampN(m.gp, -.6, .6); p.v = clampN(m.v, -30, 30); p.w = clampN(m.w, -3, 3);
  p.lastState = t;
}

function onFire(room, p, m) {
  const t = now(), sh = R.SHELLS[m.s | 0]; if (!sh || !p.alive || room.state !== 'play') return;
  const deny = why => p.conn && p.conn.send({ t: 'denied', sid: m.sid, why, shells: p.shells });
  if (p.st.gun <= 0 || p.st.crew <= 0) return deny('gun');
  if (p.shells <= 0) return deny('ammo');
  if (t < p.reloadUntil - 250) return deny('reload');
  const o = num3(m.o), d = num3(m.d); if (!o || !d) return;
  if (Math.hypot(o[0] - p.x, o[2] - p.z) > 12) return deny('pos');
  const len = Math.hypot(...d) || 1;
  p.shells--; p.reloadUntil = t + p.traits.reload * 1000 * (p.st.gun < 40 ? 1.0 : 0.97);
  const sid = Number(m.sid) | 0, shotId = room.shotSeq++;
  room.shots.set(p.id + ':' + sid, { by: p.id, t, o, sh: m.s | 0, done: false });
  if (room.shots.size > 400) for (const k of room.shots.keys()) { room.shots.delete(k); if (room.shots.size < 300) break; }
  bcast(room, { t: 'shot', by: p.id, sid, o, d: d.map(v => +(v / len).toFixed(4)), s: m.s | 0 }, p);
}

const keepFinite = (o, keys) => { const r = {}; for (const k of keys) { const v = o && o[k]; if (num3(v)) r[k] = num3(v); else if (typeof v === 'number' && Number.isFinite(v)) r[k] = +v.toFixed(3); } return r; };

function onHit(room, p, m) {
  const t = now(), key = p.id + ':' + (Number(m.sid) | 0), shot = room.shots.get(key);
  if (!shot || shot.done || t - shot.t > 7000 || room.state !== 'play') return;
  const tg = room.players.get(m.tid); if (!tg || !tg.alive || tg === p) return;
  if (room.mode === 'tdm' && tg.team === p.team) return;
  if (t < tg.protUntil) return;
  shot.done = true;
  if (Math.hypot(shot.o[0] - tg.x, shot.o[2] - tg.z) > 600) return;
  const sh = R.SHELLS[shot.sh], rr = m.r || {};
  const MODS = ['engine', 'ammo', 'crew', 'gun', 'fuel', 'track', 'ammoH'];
  const r = {
    zone: rr.zone === 'turret' ? 'turret' : rr.zone === 'track' ? 'track' : 'hull',
    key: cleanText(rr.key, 12), module: ['engine', 'ammo', 'crew', 'gun', 'fuel', 'track'].includes(rr.module) ? rr.module : null,
    moduleId: MODS.includes(rr.moduleId) ? rr.moduleId : null, penetrates: !!rr.penetrates, ricochet: !!rr.ricochet,
    angle: clampN(rr.angle, 0, 90), effective: clampN(rr.effective, 0, 3000), face: cleanText(rr.face, 1)
  };
  const pen = sh.penetration * sh.energy * p.traits.penMul;
  if (r.penetrates && (r.effective > pen * 1.12 || r.ricochet)) { r.penetrates = false; }       // читерская «пробивающая» заявка
  if (r.penetrates && r.zone === 'track') { r.module = 'track'; r.moduleId = 'track'; }
  const res = R.applyHit(tg.st, tg.traits, r, sh);
  const xi = keepFinite(m.xi, ['pointL', 'dirL', 'normalL', 'pathLen', 'turretYaw', 'gunPitch']);
  bcast(room, { t: 'dmg', by: p.id, tid: tg.id, r, pen: Math.round(pen), shell: shot.sh, text: res.text, st: tg.st, destroyed: res.destroyed, cookoff: res.cookoff, xi }, null);
  if (res.destroyed) kill(room, tg, p, res.cookoff, sh.name);
}
function onCover(room, p, m) {
  const t = now(), shot = room.shots.get(p.id + ':' + (Number(m.sid) | 0));
  if (!shot || t - shot.t > 7000) return;
  const id = Number(m.id) | 0, o = room.layout.objects[id];
  if (!o || !o.cover || room.dead.has(id)) return;
  room.dead.add(id); bcast(room, { t: 'cover', id }, null);
}

function kill(room, v, by, cookoff, weapon) {
  if (!v.alive) return;
  v.alive = false; v.deaths++; v.respawnAt = now() + RESPAWN_S * 1000; v.v = 0; v.w = 0;
  const self = v === by;
  if (!self) {
    if (room.mode === 'tdm' && by.team === v.team) { by.score -= 50; } else { by.kills++; by.score += 100; if (room.mode === 'tdm') room.teamScore[by.team]++; }
  } else v.score = Math.max(0, v.score - 25);
  bcast(room, { t: 'kill', tid: v.id, by: by.id, self, cookoff: cookoff || null, weapon: weapon || '', respawnIn: RESPAWN_S, board: board(room), teamScore: room.teamScore }, null);
  const lim = KILL_LIMIT[room.mode], top = room.mode === 'tdm' ? Math.max(...room.teamScore) : Math.max(0, ...[...room.players.values()].map(x => x.kills));
  if (top >= lim) endMatch(room);
}
function endMatch(room) {
  if (room.state !== 'play') return; room.state = 'over'; room.overAt = now() + OVER_S * 1000;
  const b = board(room); let winner = null;
  if (room.mode === 'tdm') winner = room.teamScore[0] === room.teamScore[1] ? 'draw' : (room.teamScore[0] > room.teamScore[1] ? 'blue' : 'red'); else winner = b[0] ? b[0].name : null;
  room.winner = winner;
  bcast(room, { t: 'over', board: b, winner, teamScore: room.teamScore, nextIn: OVER_S }, null);
}
function removePlayer(p, why) {
  const room = p.room; if (!room) return;
  room.players.delete(p.id); players.delete(p.token); p.room = null;
  if (p.conn) { p.conn.player = null; }
  bcast(room, { t: 'pleave', id: p.id, name: p.name }, null);
  if (why) bcast(room, { t: 'sys', text: p.name + ' ' + why }, null);
  if (!room.players.size) room.emptySince = now();
  log('leave', p.name, why || '');
}

// ───────────────────────── главный цикл ─────────────────────────
let tickN = 0;
function tick() {
  const t = now(); tickN++;
  for (const room of rooms.values()) {
    for (const p of [...room.players.values()]) {
      if (!p.conn && p.dropAt && t - p.dropAt > 20000) { removePlayer(p, 'отключился'); continue; }
      if (!p.alive && room.state === 'play' && p.respawnAt && t >= p.respawnAt) {
        const s = spawnPlayer(room, p);
        bcast(room, { t: 'spawn', id: p.id, x: p.x, z: p.z, yaw: p.yaw, st: p.st, shells: p.shells }, null);
      }
    }
    if (room.state === 'play' && t >= room.endsAt) endMatch(room);
    if (room.state === 'over' && t >= room.overAt) {
      newMatch(room, true);
      for (const p of room.players.values()) { p.kills = 0; p.deaths = 0; p.score = 0; spawnPlayer(room, p); }
      for (const p of room.players.values()) if (p.conn) sendJoined(p, true);
      bcast(room, { t: 'sys', text: 'Новый матч · ' + W.MAP_INFO[room.map].name }, null);
    }
    if (!room.players.size) { if (!room.perm && room.emptySince && t - room.emptySince > 60000) { rooms.delete(room.id); log('room closed', room.id); } continue; }
    const snap = [];
    for (const p of room.players.values()) if (p.alive) snap.push([p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(3), +p.ty.toFixed(3), +p.gp.toFixed(3), +p.v.toFixed(2), +p.w.toFixed(3)]);
    const msg = { t: 'snap', s: t, p: snap };
    if (tickN % 20 === 0) { msg.board = board(room); msg.left = Math.round((room.endsAt - t) / 1000); msg.ts = room.teamScore; }
    bcast(room, msg, null, true);
  }
  if (tickN % 400 === 0) for (const p of players.values()) { if (p.conn && t - p.conn.lastRx > 45000) p.conn.close(1001); }
  if (tickN % 300 === 0) for (const p of players.values()) if (p.conn) p.conn.raw(9, Buffer.alloc(0));    // keep-alive ping
}

async function main() {
  W = await import(pathToFileURL(path.join(ROOT, 'js/shared/world.js')).href);
  R = await import(pathToFileURL(path.join(ROOT, 'js/shared/rules.js')).href);
  makeRoom({ name: 'Полигон · все против всех', map: 'range', mode: 'ffa', perm: true });
  makeRoom({ name: 'Пустыня · команды', map: 'desert', mode: 'tdm', perm: true });
  setInterval(tick, TICK_MS);
  server.listen(PORT, HOST, () => console.log(`ARMOR LAB: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (Ctrl+C to stop)`));
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { main };
process.on('uncaughtException', e => console.error('uncaught', e));
