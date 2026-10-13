'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = __dirname;
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0';
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.cjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const rooms = new Map();
const peers = new Set();
const projectiles = new Map();
const MAX_PLAYERS_PER_ROOM = 16;
const MAX_MESSAGE_BYTES = 64 * 1024;
const RESPAWN_COOLDOWN_MS = 8000;

function json(res, code, body) { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); }
const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (urlPath === '/') urlPath = '/index.html';
  const full = path.resolve(root, '.' + urlPath);
  if (full !== root && !full.startsWith(root + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); return res.end('Not found: ' + urlPath); }
    res.writeHead(200, {'Content-Type':MIME[path.extname(full).toLowerCase()] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(data);
  });
});
function frame(opcode, payload) {
  const p = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let head;
  if (p.length < 126) { head = Buffer.from([0x80 | opcode, p.length]); }
  else if (p.length <= 65535) { head = Buffer.alloc(4); head[0]=0x80|opcode; head[1]=126; head.writeUInt16BE(p.length,2); }
  else { head=Buffer.alloc(10); head[0]=0x80|opcode; head[1]=127; head.writeBigUInt64BE(BigInt(p.length),2); }
  return Buffer.concat([head,p]);
}
function sendRaw(peer, opcode, payload) { if (!peer.closed && !peer.socket.destroyed) peer.socket.write(frame(opcode,payload)); }
function send(peer, data) { try { sendRaw(peer, 1, Buffer.from(JSON.stringify(data))); } catch {} }
function roomPlayers(room) { const now=Date.now(); return [...room.players.values()].map(p => ({id:p.id,nickname:p.nickname,tank:p.tank,team:p.team,x:p.x,y:p.y,z:p.z,yaw:p.yaw,turretYaw:p.turretYaw,gunPitch:p.gunPitch,velocity:p.velocity,health:p.health,alive:p.alive,fatalReason:p.fatalReason||null,respawnAt:p.respawnAt||null,respawnIn:p.alive?0:Math.max(0,((p.respawnAt||now)-now)/1000),modules:{...p.modules}})); }
function broadcast(room, data, exceptId=null) { const text=JSON.stringify(data); const f=frame(1,Buffer.from(text)); for(const p of room.players.values()) if(p.id!==exceptId&&!p.closed&&!p.socket.destroyed) p.socket.write(f); }
function getRoom(code) { if(!rooms.has(code)) rooms.set(code,{code,players:new Map(),nextTeam:0}); return rooms.get(code); }
function cleanNick(value) { const s=String(value||'').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,24); return s || 'Tanker'; }
function cleanRoom(value) { const s=String(value||'POLYGON').toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,16); return s.length>=2?s:'POLYGON'; }
function clampNum(n, min, max, fallback=0) { n=Number(n); return Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : fallback; }
// Randomized spawn pads spread around the playable area. Small jitter prevents exact overlap.
const SPAWNS = [[-25,-20],[-13,-24],[0,-25],[13,-24],[25,-20],[-29,-6],[-18,-5],[-7,-8],[7,-8],[18,-5],[29,-6],[-28,10],[-17,15],[-6,18],[6,18],[17,15],[28,10],[-20,27],[-8,29],[8,29],[20,27],[-30,23],[30,23],[-2,8]];
function spawnFor(room, peer) {
  const others=[...room.players.values()].filter(p=>p.id!==peer.id);
  const candidates=SPAWNS.map(([sx,sz],index)=>{
    const x=sx+(Math.random()-.5)*2.4, z=sz+(Math.random()-.5)*2.4;
    const clearance=others.length?Math.min(...others.map(p=>Math.hypot(x-(Number(p.x)||0),z-(Number(p.z)||0)))):Infinity;
    return {x,z,index,clearance};
  });
  // Prefer pads far from both active tanks and their persistent wrecks; avoid immediately reusing the previous pad.
  let pool=candidates.filter(c=>c.clearance>=18&&c.index!==peer.lastSpawnIndex);
  if(!pool.length)pool=candidates.filter(c=>c.clearance>=18);
  if(!pool.length){const best=Math.max(...candidates.map(c=>c.clearance));pool=candidates.filter(c=>c.clearance>=best-4&&c.index!==peer.lastSpawnIndex);if(!pool.length)pool=candidates.filter(c=>c.clearance>=best-4);}
  const chosen=pool[Math.floor(Math.random()*pool.length)];
  peer.lastSpawnIndex=chosen.index;
  return {x:chosen.x,y:0,z:chosen.z,yaw:Math.random()*Math.PI*2,turretYaw:0,gunPitch:0,velocity:0};
}
function resetModules(){return {engine:100,track:100,gun:100,crew:100,ammo:100,optics:100};}
function respawnPlayer(room, peer) {
  if(!peer||peer.alive) return false;
  if(peer.respawnAt&&Date.now()<peer.respawnAt) return false;
  const spawn=spawnFor(room,peer);
  Object.assign(peer,spawn,{health:100,alive:true,modules:resetModules(),deadAt:null,respawnAt:null,fatalReason:null,lastState:Date.now()});
  const player=roomPlayers(room).find(p=>p.id===peer.id);
  send(peer,{type:'respawned',player});
  broadcast(room,{type:'player_respawned',id:peer.id,player});
  return true;
}
function leaveRoom(peer) {
  if(!peer.room) return;
  const room=peer.room; room.players.delete(peer.id); peer.room=null;
  broadcast(room,{type:'player_left',id:peer.id,nickname:peer.nickname,players:roomPlayers(room)});
  for (const [id, shot] of projectiles) if(shot.room===room.code && shot.shooterId===peer.id) projectiles.delete(id);
  if(room.players.size===0) rooms.delete(room.code); else broadcast(room,{type:'roster',players:roomPlayers(room),room:room.code});
}
function joinRoom(peer, msg) {
  if(peer.room) leaveRoom(peer);
  const roomCode=cleanRoom(msg.room);
  const room=getRoom(roomCode);
  if(room.players.size>=MAX_PLAYERS_PER_ROOM) { send(peer,{type:'error',message:'Комната заполнена (максимум '+MAX_PLAYERS_PER_ROOM+')'}); return; }
  peer.id=crypto.randomUUID(); peer.nickname=cleanNick(msg.nickname); peer.tank=['t90','abrams','leopard','merkava'].includes(msg.tank)?msg.tank:'t90'; peer.room=room; peer.spawnSlot=room.players.size; peer.team=(room.nextTeam++%2===0?'blue':'red');
  const spawn=spawnFor(room,peer);
  Object.assign(peer,spawn,{health:100,alive:true,modules:{engine:100,track:100,gun:100,crew:100,ammo:100,optics:100},fatalReason:null,lastState:Date.now()});
  room.players.set(peer.id,peer);
  send(peer,{type:'welcome',id:peer.id,room:room.code,playerCount:room.players.size,player:roomPlayers(room).find(p=>p.id===peer.id),players:roomPlayers(room)});
  broadcast(room,{type:'player_joined',player:roomPlayers(room).find(p=>p.id===peer.id),players:roomPlayers(room)},peer.id);
}
function handleMessage(peer, data) {
  let msg; try { msg=JSON.parse(data.toString('utf8')); } catch { send(peer,{type:'error',message:'Некорректный JSON'}); return; }
  if(!msg||typeof msg!=='object'||typeof msg.type!=='string') return;
  if(msg.type==='hello'||msg.type==='join') { joinRoom(peer,msg); return; }
  if(!peer.room) { send(peer,{type:'error',message:'Сначала подключись к комнате'}); return; }
  const room=peer.room;
  if(msg.type==='state') {
    if(!peer.alive) return;
    peer.x=clampNum(msg.x,-500,500,peer.x); peer.y=clampNum(msg.y,-5,20,peer.y); peer.z=clampNum(msg.z,-500,500,peer.z);
    peer.yaw=clampNum(msg.yaw,-1000,1000,peer.yaw); peer.turretYaw=clampNum(msg.turretYaw,-20,20,peer.turretYaw); peer.gunPitch=clampNum(msg.gunPitch,-2,2,peer.gunPitch); peer.velocity=clampNum(msg.velocity,-40,60,peer.velocity);
    const tank=String(msg.tank||peer.tank); if(['t90','abrams','leopard','merkava'].includes(tank)) peer.tank=tank;
    peer.lastState=Date.now(); return;
  }
  if(msg.type==='change_tank') { const t=String(msg.tank||''); if(['t90','abrams','leopard','merkava'].includes(t)){peer.tank=t;broadcast(room,{type:'tank_changed',id:peer.id,tank:t,nickname:peer.nickname});} return; }
  if(msg.type==='fire') {
    if(!peer.alive) { send(peer,{type:'error',message:'Танк уничтожен — дождись возрождения'}); return; }
    const projectileId=String(msg.projectileId||'');
    if(!projectileId || projectileId.length>100 || !projectileId.startsWith(peer.id+':')) return;
    const origin=msg.origin, direction=msg.direction;
    if(!Array.isArray(origin)||origin.length!==3||!Array.isArray(direction)||direction.length!==3) return;
    const o=origin.map((n)=>clampNum(n,-1000,1000,0)); const d=direction.map((n)=>clampNum(n,-1,1,0)); const len=Math.hypot(...d); if(len<.1) return;
    const shot={id:projectileId,room:room.code,shooterId:peer.id,created:Date.now(),hit:false}; projectiles.set(projectileId,shot);
    const fireMsg={type:'fire',id:peer.id,projectileId,origin:o,direction:d.map(n=>n/len),shellType:clampNum(msg.shellType,0,2,0)|0};
    broadcast(room,fireMsg,peer.id); send(peer,{type:'fire_ack',projectileId}); return;
  }
  if(msg.type==='impact') {
    const projectileId=String(msg.projectileId||''), shot=projectiles.get(projectileId); if(!shot||shot.room!==room.code||shot.hit) return;
    if(shot.shooterId!==peer.id) return;
    shot.hit=true; broadcast(room,{type:'impact',projectileId}); return;
  }
  if(msg.type==='hit') {
    const projectileId=String(msg.projectileId||''), shot=projectiles.get(projectileId); if(!shot||shot.room!==room.code||shot.hit) return;
    const targetId=String(msg.targetId||''); const target=room.players.get(targetId); if(!target||!target.alive) return;
    const isShooter=shot.shooterId===peer.id, isVictim=targetId===peer.id;
    if(!isShooter&&!isVictim) return; // only shooter or victim can report the collision
    if(isShooter&&targetId===peer.id) return;
    shot.hit=true;
    const moduleName=['engine','track','gun','optics','ammo','crew'].includes(msg.module)?msg.module:'engine';
    const penetrates=!!msg.penetrates;
    let loss=0,fatalReason=null,turretEjected=false;
    const wasAlive=target.alive;
    if(penetrates){
      // Module-based damage: there is no generic pool of vehicle hit points.
      // A rack penetration cooks the ammunition off; crew loss is cumulative; other modules impair their systems.
      const before=target.modules[moduleName]??100;
      if(moduleName==='ammo'){loss=before;target.modules.ammo=0;target.alive=false;fatalReason='ammo';turretEjected=true;}
      else if(moduleName==='crew'){loss=Math.min(before,55);target.modules.crew=Math.max(0,before-loss);if(target.modules.crew<=0){target.alive=false;fatalReason='crew';}}
      else {loss=({engine:62,track:100,gun:68,optics:70}[moduleName]||45);target.modules[moduleName]=Math.max(0,before-loss);}
      target.health=target.alive?100:0;
      if(!target.alive)target.fatalReason=fatalReason;
    }
    if(wasAlive&&!target.alive){target.deadAt=Date.now();target.respawnAt=target.deadAt+RESPAWN_COOLDOWN_MS;target.velocity=0;}
    const hitMsg={type:'damage',projectileId,shooterId:shot.shooterId,targetId,module:moduleName,penetrates,loss,health:target.health,alive:target.alive,fatalReason:target.fatalReason||fatalReason,turretEjected,modules:{...target.modules},respawnAt:target.respawnAt||null,respawnIn:target.respawnAt?Math.max(0,(target.respawnAt-Date.now())/1000):0,point:Array.isArray(msg.point)?msg.point.map(n=>clampNum(n,-1000,1000,0)):null};
    broadcast(room,hitMsg);
    for(const [id,p] of projectiles) if(p.created<Date.now()-7000) projectiles.delete(id);
    return;
  }
  if(msg.type==='respawn') {
    if(peer.alive){send(peer,{type:'respawn_wait',remaining:0,respawnAt:null,alive:true});return;}
    const remaining=Math.max(0,(peer.respawnAt||Date.now())-Date.now());
    if(remaining>0){send(peer,{type:'respawn_wait',remaining:remaining/1000,respawnAt:peer.respawnAt});return;}
    respawnPlayer(room,peer);return;
  }
  if(msg.type==='chat') { const text=String(msg.text||'').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,180); if(text) broadcast(room,{type:'chat',id:peer.id,nickname:peer.nickname,text,at:Date.now()}); return; }
  if(msg.type==='ping') { send(peer,{type:'pong',at:msg.at||Date.now()}); }
}
function handleFrameData(peer, chunk) {
  if(peer.closed) return;
  peer.buffer=Buffer.concat([peer.buffer,chunk]);
  if(peer.buffer.length>MAX_MESSAGE_BYTES+14) { peer.socket.destroy(); peer.closed=true; leaveRoom(peer); return; }
  while(peer.buffer.length>=2) {
    const b0=peer.buffer[0], b1=peer.buffer[1], opcode=b0&0x0f, masked=(b1&0x80)!==0;
    let len=b1&0x7f, offset=2;
    if(len===126){if(peer.buffer.length<4)return;len=peer.buffer.readUInt16BE(2);offset=4;}
    else if(len===127){if(peer.buffer.length<10)return;const n=peer.buffer.readBigUInt64BE(2);if(n>BigInt(MAX_MESSAGE_BYTES)){peer.socket.destroy();peer.closed=true;leaveRoom(peer);return;}len=Number(n);offset=10;}
    if(len>MAX_MESSAGE_BYTES){peer.socket.destroy();peer.closed=true;leaveRoom(peer);return;}
    let mask;if(masked){if(peer.buffer.length<offset+4)return;mask=peer.buffer.subarray(offset,offset+4);offset+=4;}
    if(peer.buffer.length<offset+len)return;
    const payload=Buffer.from(peer.buffer.subarray(offset,offset+len));peer.buffer=peer.buffer.subarray(offset+len);
    if(masked) for(let i=0;i<payload.length;i++) payload[i]^=mask[i&3];
    if(opcode===0x8){if(!peer.closed)sendRaw(peer,0x8,payload);peer.socket.end();peer.closed=true;leaveRoom(peer);return;}
    if(opcode===0x9){sendRaw(peer,0xA,payload);continue;}
    if(opcode===0x1) handleMessage(peer,payload);
  }
}
server.on('upgrade',(req,socket,head)=>{
  const upgrade=String(req.headers.upgrade||'').toLowerCase();const key=req.headers['sec-websocket-key'];
  if(upgrade!=='websocket'||!key||req.headers['sec-websocket-version']!=='13'){socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');socket.destroy();return;}
  const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  const peer={socket,buffer:Buffer.alloc(0),closed:false,id:null,nickname:'Tanker',room:null};peers.add(peer);
  socket.on('data',chunk=>handleFrameData(peer,chunk));
  socket.on('close',()=>{if(!peer.closed){peer.closed=true;leaveRoom(peer);}peers.delete(peer);});
  socket.on('error',()=>{if(!peer.closed){peer.closed=true;leaveRoom(peer);}peers.delete(peer);});
  if(head&&head.length)handleFrameData(peer,head);
});
setInterval(()=>{
  const now=Date.now();
  for(const [id,p] of projectiles) if(now-p.created>7000) projectiles.delete(id);
  for(const room of rooms.values()) if(room.players.size) {
    // Destroyed vehicles stay in the room as visible wrecks until their cooldown expires.
    for(const peer of room.players.values()) if(!peer.alive&&peer.respawnAt&&peer.respawnAt<=now) respawnPlayer(room,peer);
    broadcast(room,{type:'snapshot',room:room.code,serverTime:now,players:roomPlayers(room)});
  }
},100).unref();
server.listen(PORT,HOST,()=>console.log(`ARMOR LAB multiplayer server listening at http://localhost:${PORT} (LAN: port ${PORT})`));
