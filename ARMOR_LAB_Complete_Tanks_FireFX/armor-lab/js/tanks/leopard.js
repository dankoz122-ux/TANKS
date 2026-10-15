// Leopard 2A7 — высокий угловатый корпус, вертикальный лоб башни с клиньями, длинная Rh-120 L/55.
import { createKit, camoTexture, finishModel, bounds } from './kit.js';
export const meta = { id: 'leopard', name: 'Leopard 2A7', description: 'Германия · 120 мм L/55 · клиновая броня' };

export function createTank(T) {
  const camo = camoTexture(T, 'leopard', '#4f5c3b', [
    { c: '#5f4a2e', n: 9, r: 44, flat: .6, stretch: 1.5 }, { c: '#1d201a', n: 6, r: 30, flat: .5, stretch: 1.4 }
  ], 7);
  const K = createKit(T, {
    hull: '#ffffff', camo, turret: '#ffffff', armor: '#f0f0f0', era: '#3f4a33', track: '#202119', wheel: '#282a25',
    metal: '#848a78', barrel: '#454e3a', dark: '#1e211c', optic: '#22403c', cloth: '#505840', cargo: '#5d5740', sleeve: '#394233'
  });
  const root = new T.Group(), hull = new T.Group(); root.add(hull);
  const ringY = 1.32, ringZ = -.1;
  const glY = z => .96 + (z + 3.86) / 1.96 * .36;

  // ───── корпус ─────
  const H = K.acc();
  const warp = (x, y, z) => { const t = z < -2.2 ? Math.max(0, Math.min(1, (-2.2 - z) / 1.66)) : 0; return [x * (1 - .22 * t), y, z]; };
  const hullZY = [[-3.4, .5], [-3.86, .86], [-3.86, .97], [-1.9, 1.32], [2.2, 1.32], [3.2, 1.2], [3.86, 1.1], [3.86, .6], [3.5, .5]], hullHW = 1.3;
  H.prism(hullZY, hullHW, 'hull', warp);
  H.pair(s => {
    // тяжёлые бортовые экраны: массивные бронемодули + резиновые фартуки спереди
    H.box(.2, .72, 5.8, 'armor', [s * 1.76, .96, .35]);
    H.box(.07, .5, 1.5, 'dark', [s * 1.7, .42, -2.7]);                              // резиновый фартук
    H.box(.18, .62, .9, 'armor', [s * 1.72, .88, -3.55], [0, s * .5, 0]);
    H.box(.5, .08, 6.0, 'hull', [s * 1.55, 1.25, .0]);                             // полка крыльев
    for (let i = 0; i < 7; i++) H.box(.04, .6, .06, 'dark', [s * 1.87, .96, -2.3 + i * .85]);   // стыки модулей
    H.box(.34, .3, 1.2, 'cargo', [s * 1.62, 1.44, 2.15]);
  });
  // ступенчатый нос и лобовая плита
  H.box(2.0, .1, .7, 'armor', [0, glY(-3.45) + .07, -3.45], [-Math.atan2(.36, 1.96), 0, 0]);
  H.cyl(.3, .32, .1, 'armor', [0, 1.4, -2.3], [0, 0, 0], 14);                    // люк механика
  H.box(.55, .08, .16, 'optic', [0, 1.45, -2.55]);
  for (const x of [-.95, .95]) H.box(.28, .2, .08, 'dark', [x, 1.0, -3.9]);
  H.box(.22, .14, .1, 'metal', [-.5, .7, -3.88]).box(.22, .14, .1, 'metal', [.5, .7, -3.88]);
  // моторный отсек
  H.box(1.9, .06, 1.1, 'dark', [0, 1.34, 2.55]);
  for (let i = 0; i < 8; i++) H.box(1.9, .05, .06, 'armor', [0, 1.38, 2.05 + i * .14]);
  H.box(1.4, .12, .6, 'dark', [0, 1.16, 3.5], [.5, 0, 0]);
  H.cyl(.12, .12, 1.9, 'dark', [-.5, 1.3, 3.3], [0, 0, Math.PI / 2], 10);
  H.build(hull, { name: 'hull-' });

  // ───── ходовая: 7 катков + 4 поддерживающих ─────
  const trackX = 1.42, trackW = .635, wz = [-2.85, -1.9, -.95, 0, .95, 1.9, 2.85];
  const circles = [{ z: 3.45, y: .68, r: .4 }, { z: -3.4, y: .6, r: .34 }, ...wz.map(z => ({ z, y: .38, r: .37 }))];
  const trackData = K.tracks(hull, { x: trackX, width: trackW, circles, thick: .075, pitch: .175 });
  const spinList = [{ z: 3.45, y: .68, r: .32, w: .68 }, { z: -3.4, y: .6, r: .27, w: .66 }];
  wz.forEach(z => spinList.push({ z, y: .38, r: .3, w: .7 }));
  const spin = K.spinners(hull, spinList, trackX);
  const W = K.acc();
  W.pair(s => {
    for (const z of wz) { W.tubeX(.37, .37, s * 1.1, s * 1.22, 'rubber', .38, z, 16); W.tubeX(.37, .37, s * 1.62, s * 1.74, 'rubber', .38, z, 16); }
    for (const z of [-2.2, -.75, .75, 2.2]) W.tubeX(.12, .12, s * 1.1, s * 1.7, 'metal', .86, z, 8);
  });
  W.build(hull, { name: 'wheels-' });

  // ───── башня: вертикальный лоб, клинья, тяжёлая ниша ─────
  const turret = new T.Group(); turret.position.set(0, ringY, ringZ); root.add(turret);
  const Tt = K.acc();
  const wedge = (x, y, z) => { const f = z < -.2 ? Math.max(0, Math.min(1, (-.2 - z) / 1.6)) : 0; return [x * (1 - .3 * f) * (1 - .07 * (y / 1.0)), y, z]; };
  const turZY = [[-1.88, 0], [-1.9, .76], [-1.6, 1.0], [.85, 1.0], [1.35, .92], [1.75, .45], [1.75, 0]], turHW = 1.4;
  Tt.prism(turZY, turHW, 'turret', wedge);
  Tt.pair(s => {
    Tt.box(.95, .98, .55, 'armor', [s * .88, .5, -1.62], [0, s * .62, 0]);         // боковые клинья лба
    Tt.box(.35, .85, .75, 'armor', [s * 1.3, .45, -.95], [0, s * .2, 0]);
    for (let i = 0; i < 4; i++) Tt.cyl(.045, .045, .26, 'dark', [s * (1.18 + .06 * (i % 2)), .84, -1.05 - Math.floor(i / 2) * .12], [0, 0, 0], 8);   // 8 ДГ
    Tt.box(.12, .78, 1.5, 'armor', [s * 1.45, .4, .75]);
  });
  Tt.box(2.9, .8, 1.0, 'turret', [0, .4, 2.1]);                                    // кормовая ниша
  Tt.box(2.8, .06, .95, 'dark', [0, .82, 2.1]);
  for (let i = 0; i < 5; i++) Tt.box(.04, .75, 1.0, 'dark', [-1.1 + i * .55, .4, 2.12]);
  Tt.box(2.9, .4, .1, 'cargo', [0, .32, 2.65]);
  // приборы: PERI-R17, EMES-15, дистанционная башенка
  Tt.box(.55, .34, .55, 'armor', [-.55, 1.12, -.85]);
  Tt.box(.4, .14, .06, 'optic', [-.55, 1.15, -1.12]);
  Tt.cyl(.36, .38, .2, 'armor', [.62, 1.1, .1], [0, 0, 0], 14);
  Tt.box(.42, .2, .34, 'optic', [.62, 1.3, .1]);
  Tt.box(.5, .26, .6, 'dark', [.7, 1.2, .95]);                                      // FLW 200
  Tt.tubeZ(.03, .03, .55, 1.15, 'dark', .7, 1.22, 8);
  Tt.cyl(.32, .34, .1, 'armor', [-.62, 1.02, .8], [0, 0, 0], 14);
  Tt.box(.26, .18, .26, 'dark', [-1.15, 1.04, 1.25]);
  Tt.cyl(.014, .02, 2.8, 'dark', [-1.2, 1.9, 2.4], [0, 0, 0], 6);
  Tt.box(.95, .7, .38, 'armor', [0, .52, -1.93]);                                   // маска
  Tt.build(turret, { name: 'turret-' });

  // ───── орудие Rh-120 L/55 ─────
  const gun = new T.Group(); gun.position.set(0, .55, -1.72); turret.add(gun);
  const G = K.acc();
  G.tubeZ(.15, .135, -.2, -.5, 'barrel', 0, 0, 14);
  G.tubeZ(.145, .125, -.5, -2.3, 'sleeve', 0, 0, 14);
  G.tubeZ(.125, .105, -2.3, -3.6, 'sleeve', 0, 0, 14);
  G.tubeZ(.12, .12, -2.95, -3.2, 'barrel', 0, 0, 14);                               // эжектор
  G.tubeZ(.105, .095, -3.6, -5.15, 'barrel', 0, 0, 14);
  G.tubeZ(.11, .11, -5.0, -5.18, 'dark', 0, 0, 12);
  G.tubeZ(.17, .17, -.8, -.92, 'dark', 0, 0, 14);
  const gm = G.build(gun, { name: 'gun-' });

  const internals = [
    { id: 'engine', label: 'Двигатель MB 873', module: 'engine', box: [0, .9, 2.25, 1.9, .8, 1.9], parent: 'hull', color: '#7ea0c2' },
    { id: 'trans', label: 'Трансмиссия', module: 'engine', box: [0, .85, 3.4, 1.5, .55, .5], parent: 'hull', color: '#8aa5b8' },
    { id: 'ammoH', label: 'Боеукладка в корпусе (слева от механика)', module: 'ammo', box: [-.85, .98, -2.1, .8, .5, 1.1], parent: 'hull', color: '#e0b25a' },
    { id: 'ammo', label: 'Боеукладка в нише (блок-двери)', module: 'ammo', box: [0, .4, 2.1, 2.6, .62, .8], parent: 'turret', color: '#e0b25a' },
    { id: 'driver', label: 'Механик-водитель', module: 'crew', box: [.3, 1.0, -2.6, .6, .5, .9], parent: 'hull', color: '#9fd37a' },
    { id: 'gunner', label: 'Наводчик', module: 'crew', box: [.6, .3, -.2, .55, .72, .6], parent: 'turret', color: '#9fd37a' },
    { id: 'cmdr', label: 'Командир', module: 'crew', box: [.62, .32, .55, .5, .7, .55], parent: 'turret', color: '#9fd37a' },
    { id: 'loader', label: 'Заряжающий', module: 'crew', box: [-.6, .3, .6, .55, .7, .6], parent: 'turret', color: '#9fd37a' },
    { id: 'breech', label: 'Казённик и привод орудия', module: 'gun', box: [0, .55, -.85, .55, .5, 1.4], parent: 'turret', color: '#d98a6a' },
    { id: 'fuelL', label: 'Топливо', module: 'fuel', box: [-1.05, .85, -.5, .6, .5, 2.2], parent: 'hull', color: '#c27ae0' },
    { id: 'fuelR', label: 'Топливо', module: 'fuel', box: [1.05, .85, -.5, .6, .5, 2.2], parent: 'hull', color: '#c27ae0' }
  ];
  return finishModel(T, K, {
    name: 'leopard', root, hull, turret, gun, barrelMesh: gm[0], muzzleZ: -5.2, trackData, spin,
    collision: [
      { kind: 'prism', zone: 'hull', parent: 'hull', zy: hullZY, hw: hullHW, warp: warp },
      { kind: 'prism', zone: 'turret', parent: 'turret', zy: turZY, hw: turHW, warp: wedge }, { kind: 'box', zone: 'turret', parent: 'turret', size: [2.9,.8,1.0], pos: [0,.4,2.1], bounds: bounds(turZY) }
    ],
    colliders: [
      { zone: 'track', size: [.68, .6, 7.1], pos: [-1.42, .4, 0], side: -1 }, { zone: 'track', size: [.68, .6, 7.1], pos: [1.42, .4, 0], side: 1 }
    ],
    internals,
    armor: { hullF: [550, 530], turF: [650, 640], hullS: [110, 92], turS: [175, 150], hullR: [48, 42], turR: [72, 62], roof: [40, 34], track: [22, 22] },
    traits: { ammo: 42, gunDepress: 0.16, gunElev: .30, loader: 'human', cookoff: 'blowout', era: false, reload: 5.2, turretRate: .74, gunRate: .42, maxSpeed: 15.6, label: 'Блок-двери ниши: БК в корпусе опаснее укладки в башне' },
    dims: { hullL: 7.72, width: 3.75 }
  });
}
