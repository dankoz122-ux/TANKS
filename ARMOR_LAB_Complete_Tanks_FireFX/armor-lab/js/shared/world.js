// ARMOR LAB — общий для сервера и клиента модуль мира: детерминированные карты, коллизии, точки возрождения.
// Не импортирует three.js: работает и в Node (сервер), и в браузере.
export const ARENA = { x0: -100, x1: 100, z0: -190, z1: 55 };
export const MAP_ORDER = ['range', 'desert', 'dusk'];
export const MAP_INFO = {
  range: { name: 'Учебный полигон', bg: '#7e948d', fog: '#879b91', ground: '#64705b' },
  desert: { name: 'Пустыня', bg: '#c4a783', fog: '#c4a783', ground: '#99876b' },
  dusk: { name: 'Сумерки', bg: '#354653', fog: '#46545c', ground: '#434b43' }
};

export function mulberry32(a) {
  a >>>= 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Точки возрождения: сторона A (z>0) смотрит на -Z, сторона B (z<0) смотрит на +Z
const XS = [-70, -45, -22, 0, 22, 45, 70];
export const SPAWNS = {
  A: XS.map((x, i) => ({ x, z: 14 + (i % 2) * 10, yaw: 0, side: 'A' })),
  B: XS.map((x, i) => ({ x, z: -150 - (i % 2) * 10, yaw: Math.PI, side: 'B' }))
};
export const ALL_SPAWNS = [...SPAWNS.A, ...SPAWNS.B];

// Возвращает {map, seed, objects:[{id,kind,sz,color,x,y,z,rot,cover,fp}]}
// fp — коллизионный след: {t:'b',hx,hz} (прямоугольник, поворачивается на rot) или {t:'c',r}
export function buildLayout(map, seed) {
  if (!MAP_INFO[map]) map = 'range';
  const rnd = mulberry32(seed), R = (a, b) => a + (b - a) * rnd();
  const objects = [];
  const add = (kind, sz, color, x, y, z, rot, extra = {}) => {
    let fp;
    if (kind === 'box') fp = { t: 'b', hx: sz[0] / 2, hz: sz[2] / 2 };
    else if (kind === 'dode') fp = { t: 'c', r: sz[0] * .95 };
    else fp = { t: 'c', r: Math.max(sz[0], sz[1]) };
    const o = { id: objects.length, kind, sz, color, x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3), rot: +rot.toFixed(4), cover: false, fp, ...extra };
    objects.push(o); return o;
  };
  if (map === 'desert') {
    for (let i = 0; i < 8; i++) {
      const x = (i % 2 ? 1 : -1) * (22 + Math.floor(i / 2) * 8), z = -24 - Math.floor(i / 2) * 30;
      add('dode', [3 + R(0, 3)], '#786b55', x, 1.5, z, R(0, 3));
      add('box', [10, 1.1, 2], '#8d795c', x * .55, .55, z - 8, R(0, .3));
    }
    for (let i = 0; i < 4; i++) add('cyl', [1.2, 1.5, 3.5], '#a18a68', -38 + i * 25, 1.75, -110 + R(0, 12), 0);
  } else if (map === 'dusk') {
    for (let i = 0; i < 7; i++) {
      const x = (i % 2 ? 1 : -1) * (18 + Math.floor(i / 2) * 9), z = -30 - Math.floor(i / 2) * 27;
      add('box', [8, 3.5, 7], '#343b3a', x, 1.75, z, R(0, .25));
      add('box', [10, .35, 1], '#555b57', x, 3.6, z, R(0, .2), { nosolid: true });
    }
    for (let i = 0; i < 5; i++) add('cyl', [.35, .45, 8], '#252d30', -45 + i * 22, 4, -85, 0);
  } else {
    for (let i = 0; i < 6; i++) {
      const x = (i % 2 ? 1 : -1) * (20 + Math.floor(i / 2) * 7), z = -35 - Math.floor(i / 2) * 29;
      add('box', [9, 1.8, 2], '#737b68', x, .9, z, R(0, .2));
      add('box', [2, 2.7, 8], '#606d5b', x + (x > 0 ? -5 : 5), 1.35, z - 7, R(0, .25));
    }
    for (let i = 0; i < 5; i++) add('cyl', [.7, .9, 2.4], '#777b6b', -40 + i * 20, 1.2, -118, 0);
  }
  // укрытия: разрушаемые, не ближе 12 м к точкам возрождения
  for (let i = 0, tries = 0; i < 10 && tries < 200; tries++) {
    const w = 1.8 + R(0, 3.5), h = .7 + R(0, 1.5), d = 1 + R(0, 2);
    const x = R(-.5, .5) * 130, z = R(-.5, .5) * 150 - 70;
    if (ALL_SPAWNS.some(s => Math.hypot(s.x - x, s.z - z) < 12 + Math.max(w, d))) continue;
    add('box', [w, h, d], i % 2 ? '#625f4c' : '#76715a', x, h / 2, z, R(0, Math.PI), { cover: true });
    i++;
  }
  return { map, seed: seed >>> 0, objects };
}

// Круг радиуса r в точке (x,z) пересекает след объекта?
export function hitsObject(o, x, z, r) {
  if (o.nosolid) return false;
  const dx = x - o.x, dz = z - o.z, fp = o.fp;
  if (fp.t === 'c') return dx * dx + dz * dz < (fp.r + r) * (fp.r + r);
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;      // мир → локальные (поворот вокруг Y)
  const qx = Math.max(-fp.hx, Math.min(fp.hx, lx)), qz = Math.max(-fp.hz, Math.min(fp.hz, lz));
  return (lx - qx) ** 2 + (lz - qz) ** 2 < r * r;
}
export function layoutSolidAt(layout, dead, x, z, r) {
  if (x < ARENA.x0 + r || x > ARENA.x1 - r || z < ARENA.z0 + r || z > ARENA.z1 - r) return true;
  for (const o of layout.objects) { if (dead && dead.has(o.id)) continue; if (hitsObject(o, x, z, r)) return true; }
  return false;
}
export const PLAYER_RADIUS = 2.15;

// Лучшая точка возрождения: команда → своя сторона, иначе самая удалённая от живых игроков
export function pickSpawn(layout, dead, team, mode, others) {
  let pool = mode === 'tdm' ? (team === 0 ? SPAWNS.A : SPAWNS.B) : ALL_SPAWNS;
  let best = null, bs = -1;
  for (const s of pool) {
    if (layoutSolidAt(layout, dead, s.x, s.z, PLAYER_RADIUS + .5)) continue;
    let d = 1e9; for (const o of others) d = Math.min(d, Math.hypot(o.x - s.x, o.z - s.z));
    d += Math.random() * 12;
    if (d > bs) { bs = d; best = s; }
  }
  return best || pool[0];
}
