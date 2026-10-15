// ARMOR LAB — собственные танки из мастерской. Чертёж (JSON) → та же модель, что у стоковых машин:
// реальная геометрия корпуса/башни, ходовая с анимированными траками, модули, броня, коллайдеры и характеристики.
import { createKit, camoTexture, finishModel, collisionMesh, bounds, rawBox, rawCyl, rawPrism, eulerMat, xform } from './tanks/kit.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ───────────────────────── чертёж по умолчанию ─────────────────────────
export function defaultDesign() {
  return {
    format: 'ARMOR-LAB-DESIGN', version: 2, name: 'Моя машина',
    hull: {
      profile: [[-3.4, .5], [-3.86, .86], [-3.86, .97], [-1.9, 1.32], [2.2, 1.32], [3.2, 1.2], [3.86, 1.1], [3.86, .6], [3.5, .5]],
      halfWidth: 1.3, noseTaper: .22, rearTaper: .05, slope: 0, armor: { F: 500, S: 90, R: 45, roof: 35 }
    },
    turret: {
      profile: [[-1.88, 0], [-1.9, .76], [-1.6, 1.0], [.85, 1.0], [1.35, .92], [1.75, .45], [1.75, 0]],
      halfWidth: 1.4, noseTaper: .3, rearTaper: 0, slope: .07, ringZ: -.1, ringY: 1.32, armor: { F: 600, S: 140, R: 60, roof: 38 }
    },
    gun: { caliber: 120, length: 5.3, mountY: .55, mountZ: -1.72, sleeve: true, evac: true, brake: false, autoloader: false, depress: 8 },
    running: { wheels: 7, wheelRadius: .37, trackLen: 6.2, trackWidth: .64, trackX: 1.42, offsetZ: 0, rollers: 4, sprocket: 'rear', skirts: true },
    engine: { power: 1500 },
    compartments: [
      { id: 'c_eng', kind: 'engine', name: 'Двигатель', parent: 'hull', pos: [0, .9, 2.25], size: [1.9, .8, 1.9] },
      { id: 'c_trn', kind: 'engine', name: 'Трансмиссия', parent: 'hull', pos: [0, .85, 3.4], size: [1.5, .55, .5] },
      { id: 'c_amT', kind: 'ammo', name: 'Боеукладка в нише', parent: 'turret', pos: [0, .4, 2.1], size: [2.6, .62, .8], armored: true },
      { id: 'c_amH', kind: 'ammo', name: 'Боеукладка в корпусе', parent: 'hull', pos: [-.85, .98, -2.1], size: [.8, .5, 1.1], armored: false },
      { id: 'c_drv', kind: 'crew', name: 'Механик-водитель', parent: 'hull', pos: [.3, 1.0, -2.6], size: [.6, .5, .9] },
      { id: 'c_gun', kind: 'crew', name: 'Наводчик', parent: 'turret', pos: [.6, .3, -.2], size: [.55, .72, .6] },
      { id: 'c_cmd', kind: 'crew', name: 'Командир', parent: 'turret', pos: [.62, .32, .55], size: [.5, .7, .55] },
      { id: 'c_ldr', kind: 'crew', name: 'Заряжающий', parent: 'turret', pos: [-.6, .3, .6], size: [.55, .7, .6] },
      { id: 'c_brc', kind: 'breech', name: 'Казённик и привод', parent: 'turret', pos: [0, .55, -.85], size: [.55, .5, 1.4] },
      { id: 'c_fL', kind: 'fuel', name: 'Топливо', parent: 'hull', pos: [-1.05, .85, -.5], size: [.6, .5, 2.2] },
      { id: 'c_fR', kind: 'fuel', name: 'Топливо', parent: 'hull', pos: [1.05, .85, -.5], size: [.6, .5, 2.2] }
    ],
    parts: [
      { id: 'p_niche', type: 'box', parent: 'turret', pos: [0, .4, 2.1], rot: [0, 0, 0], size: [2.9, .8, 1.0], mat: 'turret', color: null, mirror: false },
      { id: 'p_box', type: 'box', parent: 'hull', pos: [1.62, 1.44, 2.15], rot: [0, 0, 0], size: [.34, .3, 1.2], mat: 'cargo', color: null, mirror: true },
      { id: 'p_ant', type: 'antenna', parent: 'turret', pos: [-1.2, 1.9, 2.3], rot: [0, 0, 0], size: [.03, 1.8, .03], mat: 'dark', color: null, mirror: false },
      { id: 'p_ws', type: 'wedge', parent: 'turret', pos: [.88, .5, -1.62], rot: [0, .62, 0], size: [.55, .98, .95], mat: 'armor', color: null, mirror: true }
    ],
    paint: { base: '#59684b', camo: 'woodland' }
  };
}
function merge(a, b) {
  if (Array.isArray(a)) return b !== undefined ? JSON.parse(JSON.stringify(b)) : JSON.parse(JSON.stringify(a));
  if (a && typeof a === 'object') { const o = {}; for (const k of Object.keys(a)) o[k] = merge(a[k], b?.[k]); for (const k of Object.keys(b || {})) if (!(k in o)) o[k] = b[k]; return o; }
  return b !== undefined ? b : a;
}
export function normalizeDesign(d) { return merge(defaultDesign(), d || {}); }

export const PART_TYPES = {
  box: { label: 'Ящик', mat: 'cargo', size: [.6, .4, .8] },
  plate: { label: 'Бронеплита', mat: 'armor', size: [1.6, .08, 1.0] },
  wedge: { label: 'Клин', mat: 'armor', size: [1.0, .4, 1.0] },
  cyl: { label: 'Цилиндр', mat: 'metal', size: [.5, .5, .5] },
  hatch: { label: 'Люк', mat: 'armor', size: [.6, .1, .6] },
  tube: { label: 'Труба', mat: 'dark', size: [.18, .18, 1.5] },
  exhaust: { label: 'Выхлоп', mat: 'dark', size: [.25, .25, .5] },
  optic: { label: 'Оптика', mat: 'optic', size: [.4, .25, .4] },
  era: { label: 'Блок ДЗ', mat: 'era', size: [.5, .1, .5] },
  grille: { label: 'Решётка', mat: 'dark', size: [1.2, .05, .8] },
  antenna: { label: 'Антенна', mat: 'dark', size: [.03, 2, .03] }
};
export const PART_MATS = { turret: 'Краска', hull: 'Краска корпуса', armor: 'Броня', dark: 'Тёмный', metal: 'Металл', optic: 'Оптика', era: 'ДЗ', cargo: 'Ящик/ЗИП', cloth: 'Брезент', rubber: 'Резина' };
export const COMP_KINDS = {
  engine: { label: 'Двигатель/трансмиссия', module: 'engine', color: '#7ea0c2' },
  ammo: { label: 'Боеукладка', module: 'ammo', color: '#e0b25a' },
  crew: { label: 'Член экипажа', module: 'crew', color: '#9fd37a' },
  fuel: { label: 'Топливо', module: 'fuel', color: '#c27ae0' },
  breech: { label: 'Казённик/привод', module: 'gun', color: '#d98a6a' }
};

const camoDefs = {
  woodland: { base: '#56653f', colors: [{ c: '#6b5636', n: 9, r: 46, flat: .6 }, { c: '#2c3727', n: 7, r: 34, flat: .7 }, { c: '#7a7650', n: 5, r: 26 }], seed: 11 },
  desert: { base: '#a28f68', colors: [{ c: '#85734f', n: 8, r: 48, flat: .55 }, { c: '#b9a77f', n: 6, r: 30 }, { c: '#6a6246', n: 3, r: 26 }], seed: 5 },
  arctic: { base: '#cfd3d0', colors: [{ c: '#9aa1a0', n: 8, r: 44, flat: .6 }, { c: '#eef1ef', n: 6, r: 30 }], seed: 21 },
  dark: { base: '#3b4238', colors: [{ c: '#2a2f28', n: 8, r: 40 }, { c: '#50584a', n: 5, r: 28 }], seed: 8 }
};
export const CAMO_NAMES = { none: 'Однотонный', woodland: 'Лесной', desert: 'Пустынный', arctic: 'Зимний', dark: 'Тёмный' };
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = clamp(Math.round((n >> 16 & 255) * f), 0, 255), g = clamp(Math.round((n >> 8 & 255) * f), 0, 255), b = clamp(Math.round((n & 255) * f), 0, 255);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ───────────────────────── геометрические вспомогательные ─────────────────────────
export function polyArea(zy) { let a = 0; for (let i = 0; i < zy.length; i++) { const p = zy[i], q = zy[(i + 1) % zy.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; }
function segInter(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return (o1 * o2 < 0) && (o3 * o4 < 0);
}
export function polyIsSimple(zy) {
  const n = zy.length; if (n < 3) return false;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (Math.abs(i - j) === 1 || (i === 0 && j === n - 1)) continue;
    if (segInter(zy[i], zy[(i + 1) % n], zy[j], zy[(j + 1) % n])) return false;
  }
  return polyArea(zy) > .05;
}
// высота верхней границы профиля на заданном z
export function topAt(zy, z) {
  let best = -1e9; const n = zy.length;
  for (let i = 0; i < n; i++) {
    const a = zy[i], b = zy[(i + 1) % n];
    if ((a[0] <= z && b[0] >= z) || (b[0] <= z && a[0] >= z)) {
      const dz = b[0] - a[0], y = Math.abs(dz) < 1e-6 ? Math.max(a[1], b[1]) : a[1] + (b[1] - a[1]) * (z - a[0]) / dz;
      best = Math.max(best, y);
    }
  }
  return best < -1e8 ? Math.max(...zy.map(p => p[1])) : best;
}
export function taperWarp(zy, front, rear, slope, fLen, rLen) {
  const b = bounds(zy); let y0 = 1e9, y1 = -1e9; for (const p of zy) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const L = b.zmax - b.zmin, fl = Math.min(fLen, L * .45), rl = Math.min(rLen, L * .35);
  return (x, y, z) => {
    const tn = clamp((b.zmin + fl - z) / fl, 0, 1), tr = clamp((z - (b.zmax - rl)) / rl, 0, 1), hy = (y - y0) / Math.max(.01, y1 - y0);
    return [x * (1 - front * tn - rear * tr) * (1 - slope * hy), y, z];
  };
}
function rotX90(raw) { const m = eulerMat(Math.PI / 2, 0, 0), out = []; for (let i = 0; i < raw.length; i += 3) { const q = xform([raw[i], raw[i + 1], raw[i + 2]], m, [1, 1, 1], [0, 0, 0]); out.push(q[0], q[1], q[2]); } return out; }
const unitRaw = {};
function partRaw(type) {
  if (unitRaw[type]) return unitRaw[type];
  let r;
  if (type === 'wedge') r = rawPrism([[-.5, -.5], [.5, -.5], [.5, .5]], .5);
  else if (type === 'cyl' || type === 'hatch' || type === 'antenna') r = rawCyl(.5, .5, 1, 16);
  else if (type === 'tube' || type === 'exhaust') r = rotX90(rawCyl(.5, .5, 1, 16));
  else r = rawBox(1, 1, 1);
  return unitRaw[type] = r;
}

// ───────────────────────── характеристики ─────────────────────────
export function computeStats(design) {
  const d = normalizeDesign(design);
  const hb = bounds(d.hull.profile), tb = bounds(d.turret.profile);
  const ys = a => { let lo = 1e9, hi = -1e9; for (const p of a) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); } return [lo, hi]; };
  const [hy0, hy1] = ys(d.hull.profile), [ty0, ty1] = ys(d.turret.profile);
  const HL = hb.zmax - hb.zmin, HH = hy1 - hy0, HW = d.hull.halfWidth * 2, TL = tb.zmax - tb.zmin, TH = ty1 - ty0, TW = d.turret.halfWidth * 2;
  const a = d.hull.armor, t = d.turret.armor, ST = 7.85e-3;
  const hullMass = ST * (HW * HH * .6 * a.F + 2 * polyArea(d.hull.profile) * a.S * .68 + HW * HL * .5 * a.roof + HW * HH * .45 * a.R + HW * HL * 20);
  const turMass = ST * (TW * TH * .75 * t.F + 2 * polyArea(d.turret.profile) * t.S * .7 + TW * TL * .5 * t.roof + TW * TH * .5 * t.R);
  const g = d.gun, gunMass = .5 + g.caliber * g.caliber * g.length * 4.5e-5;
  const R = d.running, runMass = R.trackLen * 1.1 + R.wheels * .26 + (R.skirts ? 1.0 + HL * .12 : 0);
  const engMass = 1.6 + d.engine.power * .0016;
  const comp = d.compartments, crew = comp.filter(c => c.kind === 'crew').length;
  const vol = c => c.size[0] * c.size[1] * c.size[2];
  const roundVol = .034 * Math.pow(g.caliber / 120, 3);
  const ammoRounds = clamp(Math.floor(comp.filter(c => c.kind === 'ammo').reduce((s, c) => s + vol(c), 0) / roundVol), 0, 60);
  const fuelComps = comp.filter(c => c.kind === 'fuel').length;
  let partsMass = 0;
  for (const p of d.parts) { const v = p.size[0] * p.size[1] * p.size[2] * (p.mirror ? 2 : 1); partsMass += v * ((p.type === 'plate' || p.type === 'wedge' || p.type === 'era') ? 6.5 : 1.2); }
  const mass = hullMass + turMass + gunMass + runMass + engMass + ammoRounds * .026 + crew * .09 + fuelComps * .5 + partsMass;
  const pw = d.engine.power / Math.max(1, mass);
  const contact = 2 * (R.trackWidth * 100) * (R.trackLen * 100 * .65);
  const pressure = mass * 1000 / Math.max(1, contact);
  let speed = 22 + 1.9 * pw; if (pressure > 1.15) speed *= .94; if (mass > 75) speed *= .9; speed = clamp(speed, 10, 72);
  const pen = Math.round(.155 * g.length * 1000 * Math.pow(g.caliber / 120, .35));
  const reload = g.autoloader ? 6.2 : 3.4 + g.caliber * .014;
  const issues = [];
  if (!comp.some(c => c.kind === 'engine')) issues.push('Нет двигателя');
  if (crew < 1) issues.push('Нет экипажа');
  if (!comp.some(c => c.kind === 'ammo')) issues.push('Нет боеукладки');
  if (!comp.some(c => c.kind === 'breech')) issues.push('Нет казённика/привода орудия');
  if (!polyIsSimple(d.hull.profile)) issues.push('Контур корпуса самопересекается');
  if (!polyIsSimple(d.turret.profile)) issues.push('Контур башни самопересекается');
  if (mass > 90) issues.push('Масса выше 90 т — машина практически неподвижна');
  const ammoComps = comp.filter(c => c.kind === 'ammo');
  let cookoff = 'safe';
  if (ammoComps.some(c => !c.armored)) cookoff = (g.autoloader || ammoComps.some(c => !c.armored && c.parent === 'hull')) ? 'catastrophic' : 'blowout';
  const label = { safe: 'БК в изолированных отсеках: детонация исключена', blowout: 'Вышибные панели: взрыв БК уходит вверх, башня уцелеет', catastrophic: 'Опасная укладка: детонация БК срывает башню' }[cookoff];
  return {
    mass, hullMass, turMass, gunMass, runMass, engMass, partsMass, power: d.engine.power, pw, pressure, speedKmh: speed, pen, reload, ammo: ammoRounds, crew,
    length: HL + 0, width: Math.max(HW, (R.trackX + R.trackWidth / 2) * 2), height: Math.max(hy1, d.turret.ringY + ty1), caliber: g.caliber, cookoff, label, issues,
    valid: issues.length === 0
  };
}

// ───────────────────────── сборка модели ─────────────────────────
export function createCustomTank(T, design, opts = {}) {
  const d = normalizeDesign(design), st = computeStats(d);
  const P = d.paint, camo = camoDefs[P.camo];
  const base = P.base || '#59684b';
  const tex = camo ? camoTexture(T, 'custom-' + P.camo, camo.base, camo.colors, camo.seed) : null;
  const K = createKit(T, {
    hull: tex ? '#ffffff' : base, camo: tex, turret: tex ? '#ffffff' : shade(base, 1.06), armor: tex ? '#f2f2f2' : shade(base, 1.12), era: shade(base, .78),
    track: '#24251f', wheel: '#2c2d27', metal: '#848a76', barrel: shade(base, .8), dark: '#1f231f', optic: '#233b3a', cloth: shade(base, .95), cargo: shade(base, 1.1), sleeve: shade(base, .72)
  });
  const root = new T.Group(), hull = new T.Group(); root.add(hull);
  const hz = d.hull.profile, tz = d.turret.profile, hb = bounds(hz), tb = bounds(tz);
  const HL = hb.zmax - hb.zmin, hw = d.hull.halfWidth, tw = d.turret.halfWidth, zc = (hb.zmin + hb.zmax) / 2;
  const R = d.running, r = R.wheelRadius, wy = r + .01, trackOuter = R.trackX + R.trackWidth / 2;
  const hullWarp = taperWarp(hz, d.hull.noseTaper, d.hull.rearTaper, d.hull.slope, 1.6, 1.0);
  const turWarp = taperWarp(tz, d.turret.noseTaper, d.turret.rearTaper, d.turret.slope, 1.4, .8);
  const hMinY = Math.min(...hz.map(p => p[1]));
  let noseY = 0, nn = 0; for (const p of hz) if (p[0] < hb.zmin + .05) { noseY += p[1]; nn++; } noseY = noseY / Math.max(1, nn);

  // ── корпус ──
  const H = K.acc();
  H.prism(hz, hw, 'hull', hullWarp);
  const fenderY = wy + r + .1, fenderW = Math.max(.12, trackOuter - hw + .12);
  H.pair(s => {
    H.box(fenderW, .06, HL * .8, 'hull', [s * (hw + fenderW / 2 - .04), fenderY, zc]);
    if (R.skirts) H.box(.1, .6, HL * .7, 'armor', [s * (trackOuter + .06), wy + .28, zc]);
    H.box(.28, .2, .08, 'dark', [s * hw * .72, noseY + .05, hb.zmin - .02]);
  });
  const zDrv = hb.zmin + HL * .2, yDrv = topAt(hz, zDrv);
  H.cyl(.3, .32, .09, 'armor', [hw * .0, yDrv + .02, zDrv], [0, 0, 0], 14);
  H.box(.5, .08, .14, 'optic', [0, yDrv + .08, zDrv - .24]);
  for (let i = 0; i < 5; i++) { const zz = hb.zmax - HL * .22 + i * .16; H.box(hw * 1.3, .04, .1, 'dark', [0, topAt(hz, zz) + .02, zz]); }
  H.tubeX(.12, .12, -hw * .6, -hw * .15, 'dark', hMinY + .5, hb.zmax + .02, 10);
  H.build(hull, { name: 'hull-' });

  // ── ходовая ──
  const rearZ = zc + R.offsetZ + R.trackLen / 2 - .4, frontZ = zc + R.offsetZ - R.trackLen / 2 + .35;
  const sprZ = R.sprocket === 'rear' ? rearZ : frontZ, idlZ = R.sprocket === 'rear' ? frontZ : rearZ;
  const sprY = wy + .22, idlY = wy + .18, nW = clamp(Math.round(R.wheels), 3, 10);
  const w0 = frontZ + .62, w1 = rearZ - .62, wz = []; for (let i = 0; i < nW; i++) wz.push(nW === 1 ? (w0 + w1) / 2 : w0 + (w1 - w0) * i / (nW - 1));
  const circles = [{ z: sprZ, y: sprY, r: .38 }, { z: idlZ, y: idlY, r: .34 }, ...wz.map(z => ({ z, y: wy, r: r + .03 }))];
  const trackData = K.tracks(hull, { x: R.trackX, width: R.trackWidth, circles, thick: .07, pitch: .17 });
  const spinList = [{ z: sprZ, y: sprY, r: .3, w: R.trackWidth + .03 }, { z: idlZ, y: idlY, r: .27, w: R.trackWidth + .02 }];
  wz.forEach(z => spinList.push({ z, y: wy, r: r * .84, w: R.trackWidth + .05 }));
  const nR = clamp(Math.round(R.rollers), 0, 6), rollY = Math.max(sprY + .38, idlY + .34) - .17;
  for (let i = 0; i < nR; i++) spinList.push({ z: frontZ + .45 + (rearZ - frontZ - .9) * (nR === 1 ? .5 : i / (nR - 1)), y: rollY, r: .11, w: R.trackWidth - .02 });
  const spin = K.spinners(hull, spinList, R.trackX);
  const W = K.acc(), a1 = R.trackWidth / 2 - .07, a0 = R.trackWidth / 2 - .19;
  W.pair(s => {
    for (const z of wz) { W.tubeX(r, r, s * (R.trackX - a1), s * (R.trackX - a0), 'rubber', wy, z, 16); W.tubeX(r, r, s * (R.trackX + a0), s * (R.trackX + a1), 'rubber', wy, z, 16); }
    W.tubeX(.2, .2, s * (R.trackX - a1), s * (R.trackX + a1), 'metal', wy, wz[0], 8);
  });
  W.build(hull, { name: 'wheels-' });

  // ── башня ──
  const turret = new T.Group(); turret.position.set(0, d.turret.ringY, d.turret.ringZ); root.add(turret);
  const Tt = K.acc(), TL = tb.zmax - tb.zmin;
  Tt.prism(tz, tw, 'turret', turWarp);
  const zCm = tb.zmin + TL * .58, yCm = topAt(tz, zCm), zGs = tb.zmin + TL * .3, yGs = topAt(tz, zGs), zLd = tb.zmin + TL * .72, yLd = topAt(tz, zLd);
  Tt.box(.5, .3, .5, 'armor', [-tw * .4, yGs + .1, zGs]).box(.4, .12, .06, 'optic', [-tw * .4, yGs + .13, zGs - .27]);
  Tt.cyl(.34, .36, .18, 'armor', [tw * .44, yCm + .06, zCm], [0, 0, 0], 14).box(.34, .2, .34, 'optic', [tw * .44, yCm + .22, zCm]);
  Tt.cyl(.3, .31, .08, 'armor', [-tw * .4, yLd + .03, zLd], [0, 0, 0], 14);
  const mw = Math.min(1.1, .6 + d.gun.caliber / 300);
  Tt.box(mw, .62, .38, 'armor', [0, d.gun.mountY - .02, d.gun.mountZ - .17]);
  Tt.build(turret, { name: 'turret-' });

  // ── орудие ──
  const g = d.gun, gun = new T.Group(); gun.position.set(0, g.mountY, g.mountZ); turret.add(gun);
  const G = K.acc(), gr = g.caliber / 1000 * .92, Lt = g.length;
  G.cyl(.2, .2, .22, 'dark', [0, 0, -.2], [Math.PI / 2, 0, 0], 12);
  if (g.sleeve) { G.tubeZ(gr * 1.5, gr * 1.35, -.3, -.55, 'barrel', 0, 0, 14); G.tubeZ(gr * 1.4, gr * 1.28, -.55, -(Lt - .9), 'sleeve', 0, 0, 14); G.tubeZ(gr * 1.1, gr, -(Lt - .9), -Lt, 'barrel', 0, 0, 14); }
  else G.tubeZ(gr * 1.4, gr, -.3, -Lt, 'barrel', 0, 0, 14);
  if (g.evac) G.tubeZ(gr * 1.4, gr * 1.4, -Lt * .58, -Lt * .58 - .3, 'barrel', 0, 0, 14);
  if (g.brake) G.box(gr * 3.4, gr * 3.0, .34, 'dark', [0, 0, -Lt - .12]);
  const gm = G.build(gun, { name: 'gun-' });
  const muzzleZ = -(Lt + (g.brake ? .3 : .03));

  // ── детали (каждая — отдельный меш; можно выбирать и двигать в мастерской) ──
  const partMeshes = [], groups = { hull, turret, gun };
  const partMat = (p) => {
    const baseMat = K.mats[p.mat] || K.mats.armor;
    if (!p.color) return baseMat;
    const m = baseMat.clone(); m.map = null; m.color.set(p.color); return m;
  };
  const addPart = (p, mirror) => {
    const m = new T.Mesh(K.toGeometry(partRaw(p.type).slice()), partMat(p));
    const x = mirror ? -p.pos[0] : p.pos[0];
    m.position.set(x, p.pos[1], p.pos[2]); m.rotation.set(p.rot[0], mirror ? -p.rot[1] : p.rot[1], mirror ? -p.rot[2] : p.rot[2]);
    m.scale.set(p.size[0], p.size[1], p.size[2]); m.castShadow = m.receiveShadow = true;
    m.userData.itemId = p.id; m.userData.mirror = !!mirror; m.userData.part = true; m.name = 'part-' + p.id;
    (groups[p.parent] || hull).add(m); partMeshes.push(m);
  };
  for (const p of d.parts) { addPart(p, false); if (p.mirror && Math.abs(p.pos[0]) > .02) addPart(p, true); }

  // ── модули, броня, игровые параметры ──
  const internals = d.compartments.map(c => ({ id: c.id, label: c.name, module: COMP_KINDS[c.kind]?.module || 'crew', box: [...c.pos, ...c.size], parent: c.parent === 'turret' ? 'turret' : 'hull', color: COMP_KINDS[c.kind]?.color || '#9fd37a' }));
  const arm = (a, k = .95) => [a, Math.round(a * k)];
  const ha = d.hull.armor, ta = d.turret.armor;
  const armor = { hullF: arm(ha.F), hullS: arm(ha.S), hullR: arm(ha.R), hullRoof: arm(ha.roof), turF: arm(ta.F), turS: arm(ta.S), turR: arm(ta.R), turRoof: arm(ta.roof), roof: arm(Math.min(ha.roof, ta.roof)), track: [22, 22] };
  const trackLenBox = R.trackLen + .2;
  const model = finishModel(T, K, {
    name: 'custom', root, hull, turret, gun, barrelMesh: gm[0], muzzleZ, trackData, spin,
    collision: [
      { kind: 'prism', zone: 'hull', parent: 'hull', zy: hz, hw, warp: hullWarp },
      { kind: 'prism', zone: 'turret', parent: 'turret', zy: tz, hw: tw, warp: turWarp }
    ],
    colliders: [
      { zone: 'track', size: [R.trackWidth + .04, r * 1.5, trackLenBox], pos: [-R.trackX, r * .9, zc + R.offsetZ], side: -1 },
      { zone: 'track', size: [R.trackWidth + .04, r * 1.5, trackLenBox], pos: [R.trackX, r * .9, zc + R.offsetZ], side: 1 }
    ],
    internals, armor,
    traits: {
      gunDepress: clamp(g.depress, 3, 14) * Math.PI / 180, gunElev: .3, loader: g.autoloader ? 'carousel' : 'human', cookoff: st.cookoff, era: false,
      reload: st.reload, turretRate: clamp(.95 - st.mass * .005, .38, .9), gunRate: g.caliber < 110 ? .46 : .4, maxSpeed: Math.min(18, st.speedKmh / 3.6), ammo: Math.max(6, st.ammo),
      penMul: st.pen / 820, label: st.label
    },
    dims: { hullL: +(HL).toFixed(2), width: +st.width.toFixed(2) }
  });
  model.stats = st; model.design = d; model.partMeshes = partMeshes; model.title = d.name;
  model.collisionSpecs = { hull: { zy: hz, hw, warp: hullWarp, bounds: hb }, turret: { zy: tz, hw: tw, warp: turWarp, bounds: tb } };
  return model;
}

// фабрика для игры: (THREE) → модель
export function customFactory(design) { return T => createCustomTank(T, design); }

export const PRESETS = {
  balanced: { name: 'Средний МБТ', make: () => defaultDesign() },
  light: {
    name: 'Лёгкий разведчик', make: () => {
      const d = defaultDesign(); d.name = 'Лёгкий разведчик';
      d.hull.profile = [[-2.9, .45], [-3.3, .78], [-3.3, .88], [-1.6, 1.15], [1.8, 1.15], [2.6, 1.05], [3.2, .96], [3.2, .55], [2.9, .45]]; d.hull.halfWidth = 1.1; d.hull.armor = { F: 220, S: 40, R: 25, roof: 18 };
      d.turret.profile = [[-1.5, 0], [-1.52, .6], [-1.25, .8], [.7, .8], [1.1, .72], [1.4, .38], [1.4, 0]]; d.turret.halfWidth = 1.15; d.turret.armor = { F: 260, S: 60, R: 30, roof: 20 }; d.turret.ringY = 1.15; d.turret.ringZ = -.1;
      d.gun.caliber = 105; d.gun.length = 4.6; d.gun.mountZ = -1.4; d.gun.mountY = .45; d.running.wheels = 6; d.running.wheelRadius = .33; d.running.trackLen = 5.4; d.running.trackWidth = .5; d.running.trackX = 1.22; d.running.rollers = 3; d.engine.power = 1100; d.running.skirts = false;
      d.compartments = d.compartments.filter(c => c.id !== 'c_ldr' && c.id !== 'c_amH'); d.compartments.find(c => c.id === 'c_eng').pos = [0, .85, 1.9]; d.compartments.find(c => c.id === 'c_eng').size = [1.6, .7, 1.6]; d.compartments.find(c => c.id === 'c_trn').pos = [0, .8, 2.95]; d.compartments.find(c => c.id === 'c_amT').size = [2.1, .55, .7]; d.compartments.find(c => c.id === 'c_amT').pos = [0, .35, 1.75];
      d.compartments.find(c => c.id === 'c_drv').pos = [0, .92, -2.2]; d.compartments.find(c => c.id === 'c_fL').pos = [-.85, .8, -.5]; d.compartments.find(c => c.id === 'c_fR').pos = [.85, .8, -.5]; d.compartments.find(c => c.id === 'c_fL').size = [.5, .45, 1.8]; d.compartments.find(c => c.id === 'c_fR').size = [.5, .45, 1.8];
      d.parts = d.parts.filter(p => p.id !== 'p_niche'); d.parts.find(p => p.id === 'p_box').pos = [1.4, 1.22, 1.7]; d.parts.find(p => p.id === 'p_ws').pos = [.78, .45, -1.38]; d.parts.find(p => p.id === 'p_ant').pos = [-1.0, 1.75, 1.2]; d.paint = { base: '#a28f68', camo: 'desert' }; return d;
    }
  },
  heavy: {
    name: 'Тяжёлый прорыва', make: () => {
      const d = defaultDesign(); d.name = 'Тяжёлый прорыва';
      d.hull.profile = [[-3.7, .52], [-4.1, .9], [-4.1, 1.0], [-2.1, 1.4], [2.4, 1.4], [3.4, 1.26], [4.1, 1.12], [4.1, .62], [3.7, .52]]; d.hull.halfWidth = 1.5; d.hull.armor = { F: 700, S: 150, R: 70, roof: 50 };
      d.turret.halfWidth = 1.6; d.turret.armor = { F: 800, S: 190, R: 80, roof: 50 }; d.gun.caliber = 140; d.gun.length = 6.2; d.gun.mountZ = -1.8; d.gun.brake = true; d.gun.sleeve = false;
      d.running.wheels = 8; d.running.wheelRadius = .4; d.running.trackLen = 6.9; d.running.trackWidth = .78; d.running.trackX = 1.6; d.running.rollers = 5; d.engine.power = 1800; d.paint = { base: '#3b4238', camo: 'dark' };
      d.compartments.find(c => c.id === 'c_amH').armored = true; return d;
    }
  }
};
