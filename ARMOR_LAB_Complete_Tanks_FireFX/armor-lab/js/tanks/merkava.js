// Merkava Mk.3 — двигатель спереди, башня сдвинута назад, низкая плоская башня-клин с цепной защитой «Баз».
import { createKit, camoTexture, finishModel, bounds } from './kit.js';
export const meta = { id: 'merkava', name: 'Merkava Mk.3', description: 'Израиль · 120 мм · двигатель спереди, задняя дверь' };

export function createTank(T) {
  const camo = camoTexture(T, 'merkava', '#7d7b62', [
    { c: '#6a674f', n: 8, r: 48, flat: .6 }, { c: '#8e8869', n: 6, r: 30 }
  ], 33);
  const K = createKit(T, {
    hull: '#ffffff', camo, turret: '#ffffff', armor: '#f2f2f2', era: '#5f5d47', track: '#262620', wheel: '#2a2a25',
    metal: '#8c8c7a', barrel: '#54563f', dark: '#23241f', optic: '#26403c', cloth: '#5e5d46', cargo: '#6f6549', sleeve: '#43443a'
  });
  const root = new T.Group(), hull = new T.Group(); root.add(hull);
  const ringY = 1.6, ringZ = 1.0;

  // ───── корпус: массивный, высокий нос с моторным блоком ─────
  const H = K.acc();
  const warp = (x, y, z) => { const t = z < -2.2 ? Math.max(0, Math.min(1, (-2.2 - z) / 1.5)) : 0; return [x * (1 - .26 * t), y, z]; };
  const hullZY = [[-3.3, .5], [-3.72, .9], [-3.72, 1.1], [-2.4, 1.5], [-.2, 1.62], [3.0, 1.62], [3.72, 1.5], [3.72, .65], [3.4, .5]], hullHW = 1.32;
  H.prism(hullZY, hullHW, 'hull', warp);
  H.pair(s => {
    H.box(.3, .56, 6.9, 'armor', [s * 1.62, 1.12, .0]);                             // боковой бронемодуль над гусеницей
    for (let i = 0; i < 7; i++) H.box(.16, .52, .84, 'armor', [s * 1.82, .86, -2.9 + i * .9], [0, 0, 0]);   // навесные секции экрана
    for (let i = 0; i < 7; i++) H.box(.04, .54, .05, 'dark', [s * 1.9, .86, -3.34 + i * .9]);
    H.box(.34, .12, .95, 'hull', [s * 1.6, 1.0, -3.3], [.3, 0, 0]);                  // брызговик
    H.box(.4, .24, 1.2, 'cargo', [s * 1.45, 1.8, 2.7]);                              // ящики на моторном… на корме
  });
  // моторный блок на носу: жалюзи, фары, вертикальные приборы водителя
  for (let i = 0; i < 6; i++) H.box(1.5, .05, .22, 'dark', [0, 1.5 + i * .02 + .05, -2.2 + i * .35], [-.12, 0, 0]);
  H.box(.55, .26, .5, 'armor', [-.62, 1.66, -2.65]);                                // люк и перископы механика
  H.box(.5, .1, .05, 'optic', [-.62, 1.71, -2.9]);
  for (const x of [-1.0, 1.0]) H.box(.3, .22, .08, 'dark', [x, 1.05, -3.74]);
  H.box(2.0, .14, .6, 'armor', [0, 1.12, -3.7], [.5, 0, 0]);
  // кормовая дверь и поручни
  H.box(1.5, .75, .08, 'armor', [0, 1.0, 3.76]);
  H.box(1.3, .6, .04, 'dark', [0, 1.0, 3.8]);
  H.tubeX(.07, .07, -.6, .6, 'metal', 1.35, 3.8, 8);
  H.box(1.6, .1, 1.2, 'armor', [0, 1.69, 3.3]);
  H.build(hull, { name: 'hull-' });

  // ───── ходовая: 6 катков с большим шагом, поддерживающие катки ─────
  const trackX = 1.45, trackW = .64, wz = [-2.75, -1.65, -.55, .55, 1.65, 2.75];
  const circles = [{ z: 3.4, y: .66, r: .4 }, { z: -3.3, y: .62, r: .34 }, ...wz.map(z => ({ z, y: .4, r: .385 }))];
  const trackData = K.tracks(hull, { x: trackX, width: trackW, circles, thick: .075, pitch: .18 });
  const spinList = [{ z: 3.4, y: .66, r: .32, w: .68 }, { z: -3.3, y: .62, r: .28, w: .66 }];
  wz.forEach(z => spinList.push({ z, y: .4, r: .32, w: .7 }));
  const spin = K.spinners(hull, spinList, trackX);
  const W = K.acc();
  W.pair(s => {
    for (const z of wz) { W.tubeX(.385, .385, s * 1.12, s * 1.24, 'rubber', .4, z, 16); W.tubeX(.385, .385, s * 1.66, s * 1.78, 'rubber', .4, z, 16); }
    for (const z of [-2.2, -1.1, 0, 1.1, 2.2]) W.tubeX(.1, .1, s * 1.12, s * 1.75, 'metal', .93, z, 8);
  });
  W.build(hull, { name: 'wheels-' });

  // ───── башня: низкий клин, смещена к корме ─────
  const turret = new T.Group(); turret.position.set(0, ringY, ringZ); root.add(turret);
  const Tt = K.acc();
  const warpT = (x, y, z) => { const f = z < .2 ? Math.max(0, Math.min(1, (.2 - z) / 2.1)) : 0; const r = z > 1.4 ? Math.min(1, (z - 1.4) / .7) : 0; return [x * (1 - .55 * f - .12 * r) * (1 - .08 * (y / .9)), y, z]; };
  const turZY = [[-2.15, 0], [-2.2, .32], [-1.8, .62], [-.6, .9], [1.3, .9], [1.85, .66], [2.1, .3], [2.1, 0]], turHW = 1.4;
  Tt.prism(turZY, turHW, 'turret', warpT);
  Tt.pair(s => {
    Tt.box(.36, .62, 1.0, 'armor', [s * .72, .4, -1.4], [0, s * .5, 0]);
    for (let i = 0; i < 3; i++) Tt.cyl(.045, .045, .26, 'dark', [s * (.9 + .0 * i), .86, -.6 - i * .12], [0, 0, 0], 8);
    Tt.box(.12, .62, 1.7, 'armor', [s * 1.18, .35, .5]);
  });
  // «Баз»: цепные завесы сзади и по бортам башни
  for (let i = 0; i < 9; i++) Tt.box(.18, .5, .06, 'dark', [-1.3 + i * .32, .3, 2.2]);
  Tt.box(2.8, .1, .12, 'metal', [0, .62, 2.17]);
  Tt.box(2.2, .3, .9, 'turret', [0, .4, 1.55]);                                       // кормовой контейнер
  Tt.box(.5, .24, .5, 'armor', [-.62, .98, -.1]);                                       // прицел наводчика
  Tt.box(.36, .12, .05, 'optic', [-.62, 1.02, -.34]);
  Tt.cyl(.34, .36, .16, 'armor', [.6, .96, .6], [0, 0, 0], 14);
  Tt.box(.32, .2, .3, 'optic', [.6, 1.12, .6]);
  Tt.box(.16, .12, .26, 'dark', [.6, 1.26, .72]); Tt.tubeZ(.025, .025, .15, .7, 'dark', .6, 1.28, 8);
  Tt.cyl(.3, .32, .08, 'armor', [-.55, .93, 1.1], [0, 0, 0], 14);
  Tt.cyl(.012, .016, 2.4, 'dark', [1.0, 1.6, 1.9], [0, 0, 0], 6);
  Tt.box(.85, .5, .38, 'armor', [0, .5, -2.2]);                                           // маска
  Tt.build(turret, { name: 'turret-' });

  // ───── орудие ─────
  const gun = new T.Group(); gun.position.set(0, .5, -1.95); turret.add(gun);
  const G = K.acc();
  G.tubeZ(.14, .125, -.15, -.45, 'barrel', 0, 0, 14);
  G.tubeZ(.145, .125, -.45, -1.85, 'sleeve', 0, 0, 14);
  G.tubeZ(.125, .105, -1.85, -3.7, 'sleeve', 0, 0, 14);
  G.tubeZ(.095, .095, -3.7, -3.78, 'barrel', 0, 0, 12);
  G.tubeZ(.15, .15, -.6, -.7, 'dark', 0, 0, 14);
  const gm = G.build(gun, { name: 'gun-' });

  const internals = [
    { id: 'engine', label: 'Двигатель в носу (броня-щит)', module: 'engine', box: [0, 1.0, -2.3, 2.0, .85, 1.8], parent: 'hull', color: '#7ea0c2' },
    { id: 'trans', label: 'Трансмиссия', module: 'engine', box: [0, .85, -.9, 1.3, .55, .8], parent: 'hull', color: '#8aa5b8' },
    { id: 'ammo', label: 'Боеукладка в задней части корпуса', module: 'ammo', box: [0, 1.0, 2.75, 2.0, .6, 1.4], parent: 'hull', color: '#e0b25a' },
    { id: 'ammoT', label: 'Укладка в башне', module: 'ammo', box: [0, .3, 1.6, 1.8, .4, .6], parent: 'turret', color: '#e0b25a' },
    { id: 'driver', label: 'Механик-водитель', module: 'crew', box: [-.62, 1.28, -2.55, .55, .5, .8], parent: 'hull', color: '#9fd37a' },
    { id: 'gunner', label: 'Наводчик', module: 'crew', box: [-.6, .3, -.1, .5, .62, .6], parent: 'turret', color: '#9fd37a' },
    { id: 'cmdr', label: 'Командир', module: 'crew', box: [.6, .3, .6, .5, .62, .55], parent: 'turret', color: '#9fd37a' },
    { id: 'loader', label: 'Заряжающий', module: 'crew', box: [-.55, .3, 1.1, .5, .6, .55], parent: 'turret', color: '#9fd37a' },
    { id: 'breech', label: 'Казённик и привод орудия', module: 'gun', box: [0, .5, -1.1, .55, .45, 1.2], parent: 'turret', color: '#d98a6a' },
    { id: 'fuelL', label: 'Топливо', module: 'fuel', box: [-1.0, .85, 0.2, .6, .5, 2.2], parent: 'hull', color: '#c27ae0' },
    { id: 'fuelR', label: 'Топливо', module: 'fuel', box: [1.0, .85, 0.2, .6, .5, 2.2], parent: 'hull', color: '#c27ae0' }
  ];
  return finishModel(T, K, {
    name: 'merkava', root, hull, turret, gun, barrelMesh: gm[0], muzzleZ: -3.8, trackData, spin,
    collision: [
      { kind: 'prism', zone: 'hull', parent: 'hull', zy: hullZY, hw: hullHW, warp: warp },
      { kind: 'prism', zone: 'turret', parent: 'turret', zy: turZY, hw: turHW, warp: warpT }, { kind: 'box', zone: 'turret', parent: 'turret', size: [2.2,.3,.9], pos: [0,.4,1.55], bounds: bounds(turZY) }
    ],
    colliders: [
      { zone: 'track', size: [.68, .6, 6.9], pos: [-1.45, .4, 0], side: -1 }, { zone: 'track', size: [.68, .6, 6.9], pos: [1.45, .4, 0], side: 1 }
    ],
    internals,
    armor: { hullF: [600, 560], turF: [590, 560], hullS: [118, 98], turS: [160, 135], hullR: [58, 50], turR: [78, 66], roof: [40, 34], track: [22, 22] },
    traits: { ammo: 48, gunDepress: 0.15, gunElev: .30, loader: 'human', cookoff: 'safe', era: false, reload: 5.4, turretRate: .66, gunRate: .36, maxSpeed: 14.6, label: 'Двигатель спереди — защита; БК в изолированных контейнерах' },
    dims: { hullL: 7.45, width: 3.7 }
  });
}
