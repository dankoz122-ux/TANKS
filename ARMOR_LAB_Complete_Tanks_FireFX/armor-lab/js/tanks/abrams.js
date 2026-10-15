// M1A2 SEP Abrams — низкий широкий корпус, клиновидная башня с огромной кормовой нишей, газовая турбина.
import { createKit, camoTexture, finishModel, bounds } from './kit.js';
export const meta = { id: 'abrams', name: 'M1A2 Abrams', description: 'США · 120 мм · кормовая ниша с вышибными панелями' };

export function createTank(T) {
  const camo = camoTexture(T, 'abrams', '#8a7a58', [
    { c: '#6f6446', n: 8, r: 50, flat: .55 }, { c: '#9a8c68', n: 6, r: 30 }, { c: '#5b5a3f', n: 3, r: 28 }
  ], 1);
  const K = createKit(T, {
    hull: '#ffffff', camo, turret: '#ffffff', armor: '#f4f4f4', era: '#6b6248', track: '#25231f', wheel: '#2a2924',
    metal: '#8c8774', barrel: '#6a6446', dark: '#262521', optic: '#2b3f3a', cloth: '#6a5f46', cargo: '#7a6b4a', sleeve: '#58533d'
  });
  const root = new T.Group(), hull = new T.Group(); root.add(hull);
  const ringY = 1.22, ringZ = -.25;
  const glY = z => .84 + (z + 3.96) / 1.96 * .38;

  // ───── корпус: длинный и низкий ─────
  const H = K.acc();
  const warp = (x, y, z) => { const t = z < -2.4 ? Math.max(0, Math.min(1, (-2.4 - z) / 1.56)) : 0; const r = z > 3 ? Math.max(0, (z - 3) / .96) : 0; return [x * (1 - .17 * t - .05 * r), y, z]; };
  const hullZY = [[-3.5, .48], [-3.96, .74], [-3.96, .84], [-2.0, 1.22], [2.4, 1.22], [3.2, 1.1], [3.96, .98], [3.96, .55], [3.6, .48]], hullHW = 1.3;
  H.prism(hullZY, hullHW, 'hull', warp);
  H.pair(s => {
    // бортовые экраны — секционные, поверх ходовой
    for (let i = 0; i < 8; i++) {
      const z0 = -3.35 + i * .84;
      H.box(.13, .72, .8, 'armor', [s * 1.73, .87, z0 + .42]);
      H.box(.15, .06, .04, 'dark', [s * 1.73, .56, z0 + .02]);
    }
    H.box(.1, .62, .5, 'armor', [s * 1.68, .78, -3.62], [0, s * .45, 0]);        // скошенный носовой экран
    H.box(.34, .06, .4, 'armor', [s * 1.55, 1.2, -3.6], [.2, 0, 0]);
    H.box(.46, .1, 6.2, 'hull', [s * 1.52, 1.18, .0]);                          // верхняя полка бортов
    H.box(.26, .2, 1.3, 'cargo', [s * 1.58, 1.34, 2.3]);                          // ящики на полке
  });
  // носовая часть: ступенчатые детали, буксирные проушины, фары
  H.box(1.9, .1, .65, 'armor', [0, glY(-3.3) + .06, -3.3], [-Math.atan2(.38, 1.96), 0, 0]);
  H.cyl(.28, .3, .1, 'armor', [0, 1.28, -2.4], [0, 0, 0], 14);                  // люк механика
  H.box(.55, .1, .16, 'optic', [0, 1.33, -2.65], [-.15, 0, 0]);
  for (const x of [-.8, .8]) H.box(.3, .22, .08, 'dark', [x, .96, -4.0]);
  H.box(.18, .2, .1, 'metal', [-.4, .64, -4.02]).box(.18, .2, .1, 'metal', [.4, .64, -4.02]);
  // моторный отсек: две решётки и большой выхлоп (ГТД)
  H.box(1.7, .06, 1.2, 'dark', [0, 1.22, 2.45]);
  for (let i = 0; i < 9; i++) H.box(1.7, .05, .06, 'armor', [0, 1.26, 1.9 + i * .13]);
  H.box(2.0, .14, .9, 'dark', [0, 1.1, 3.55], [.35, 0, 0]);                       // выхлопная решётка
  H.box(.8, .12, .8, 'dark', [0, 1.24, 1.0]);
  H.build(hull, { name: 'hull-' });

  // ───── ходовая: 7 катков ─────
  const trackX = 1.36, trackW = .635, wz = [-2.88, -1.92, -.96, 0, .96, 1.92, 2.88];
  const circles = [{ z: 3.5, y: .6, r: .38 }, { z: -3.5, y: .52, r: .33 }, ...wz.map(z => ({ z, y: .38, r: .365 })), { z: -1.9, y: .88, r: .08 }];
  const trackData = K.tracks(hull, { x: trackX, width: trackW, circles, thick: .075, pitch: .175 });
  const spinList = [{ z: 3.5, y: .6, r: .3, w: .66 }, { z: -3.5, y: .52, r: .26, w: .66 }];
  wz.forEach(z => spinList.push({ z, y: .38, r: .3, w: .68 }));
  const spin = K.spinners(hull, spinList, trackX);
  const W = K.acc();
  W.pair(s => {
    for (const z of wz) { W.tubeX(.365, .365, s * 1.1, s * 1.22, 'rubber', .38, z, 16); W.tubeX(.365, .365, s * 1.5, s * 1.62, 'rubber', .38, z, 16); }
    W.tubeX(.12, .12, s * 1.1, s * 1.62, 'metal', .86, -1.7, 8).tubeX(.12, .12, s * 1.1, s * 1.62, 'metal', .86, 1.7, 8);
  });
  W.build(hull, { name: 'wheels-' });

  // ───── башня: плоская, угловатая, с глубокой кормовой нишей ─────
  const turret = new T.Group(); turret.position.set(0, ringY, ringZ); root.add(turret);
  const Tt = K.acc();
  const wedge = (x, y, z) => { const f = z < -.5 ? Math.max(0, Math.min(1, (-.5 - z) / 1.5)) : 0; return [x * (1 - .34 * f) * (1 - .1 * (y / .95)), y, z]; };
  const turZY = [[-1.95, 0], [-2.0, .35], [-1.85, .78], [-1.35, .93], [1.15, .93], [1.35, .86], [1.5, .6], [1.5, 0]], turHW = 1.5;
  Tt.prism(turZY, turHW, 'turret', wedge);
  // клинья и «стенки» бронемодулей на лобовой части (форма Abrams)
  Tt.pair(s => {
    Tt.box(.95, .78, .22, 'armor', [s * .72, .46, -1.72], [0, s * .66, 0]);
    Tt.box(.34, .72, .6, 'armor', [s * 1.22, .42, -1.02], [0, s * .22, 0]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) Tt.cyl(.04, .04, .24, 'dark', [s * (1.25 + .05 * j), .66 + .0, -.55 - i * .1 - j * .0], [0, 0, 0], 8);   // ДГ
    Tt.box(.14, .8, 1.4, 'armor', [s * 1.55, .38, .9]);
  });
  // кормовая ниша (боеукладка) — крупный коробчатый блок с вышибными панелями
  Tt.box(3.1, .86, 1.5, 'turret', [0, .43, 2.1]);
  Tt.box(2.9, .05, 1.3, 'dark', [0, .88, 2.1]);
  for (let i = 0; i < 4; i++) Tt.box(.62, .06, .5, 'armor', [-1.0 + i * .66, .9, 2.35]);
  Tt.box(3.0, .06, .12, 'cargo', [0, .5, 2.9]);   // решётка снабжения
  Tt.box(2.9, .5, .18, 'cargo', [0, .36, 2.92]);
  // оптика, люки
  Tt.box(.78, .55, .65, 'armor', [-.72, 1.15, -.55]);                            // ПАНОРАМА КОМАНДИРА (CITV) / ОНС
  Tt.box(.62, .28, .05, 'optic', [-.72, 1.2, -.9]);
  Tt.box(.5, .32, .4, 'armor', [.5, 1.0, -.95]);                                 // прицел наводчика GPS
  Tt.box(.4, .12, .05, 'optic', [.5, 1.05, -1.17]);
  Tt.cyl(.38, .4, .22, 'armor', [.72, 1.0, .35], [0, 0, 0], 14);                 // башенка командира
  Tt.box(.36, .24, .5, 'dark', [.72, 1.22, .35]);
  Tt.tubeZ(.035, .035, -.6, .25, 'dark', .72, 1.32, 8);                           // М2 .50
  Tt.cyl(.34, .36, .1, 'armor', [-.45, .96, .55], [0, 0, 0], 14);                // люк заряжающего
  Tt.tubeZ(.03, .03, .1, .75, 'dark', -.45, 1.12, 8);                              // М240
  Tt.box(.2, .1, .2, 'dark', [-1.1, .98, 1.05]);
  Tt.cyl(.014, .02, 3.0, 'dark', [-1.3, 2.0, 2.65], [0, 0, 0], 6);               // антенна
  Tt.cyl(.014, .02, 2.6, 'dark', [1.3, 1.9, 2.65], [0, 0, 0], 6);
  Tt.box(1.0, .62, .36, 'armor', [0, .5, -1.98]);                                 // маска орудия
  Tt.build(turret, { name: 'turret-' });

  // ───── орудие M256 в термокожухе ─────
  const gun = new T.Group(); gun.position.set(0, .52, -1.7); turret.add(gun);
  const G = K.acc();
  G.tubeZ(.14, .125, -.2, -.5, 'barrel', 0, 0, 14);
  G.tubeZ(.145, .125, -.5, -2.0, 'sleeve', 0, 0, 14);
  G.tubeZ(.125, .11, -2.0, -4.1, 'sleeve', 0, 0, 14);
  G.tubeZ(.1, .1, -4.1, -4.2, 'barrel', 0, 0, 12);
  G.box(.12, .1, .14, 'metal', [-.18, 0, -4.1]);                                    // датчик положения дульного среза
  G.tubeZ(.15, .15, -.8, -.9, 'dark', 0, 0, 14);
  const gm = G.build(gun, { name: 'gun-' });

  const internals = [
    { id: 'engine', label: 'Газовая турбина AGT-1500', module: 'engine', box: [0, .85, 2.25, 1.9, .8, 1.9], parent: 'hull', color: '#7ea0c2' },
    { id: 'trans', label: 'Трансмиссия', module: 'engine', box: [0, .78, 3.4, 1.4, .5, .5], parent: 'hull', color: '#8aa5b8' },
    { id: 'ammo', label: 'Боеукладка в нише (вышибные панели)', module: 'ammo', box: [0, .42, 2.1, 2.8, .66, 1.1], parent: 'turret', color: '#e0b25a' },
    { id: 'ammoH', label: 'Укладка в корпусе', module: 'ammo', box: [.85, .85, -1.9, .6, .4, .7], parent: 'hull', color: '#e0b25a' },
    { id: 'driver', label: 'Механик-водитель', module: 'crew', box: [0, .92, -2.5, .6, .5, .9], parent: 'hull', color: '#9fd37a' },
    { id: 'gunner', label: 'Наводчик', module: 'crew', box: [.5, .3, -.15, .55, .72, .6], parent: 'turret', color: '#9fd37a' },
    { id: 'cmdr', label: 'Командир', module: 'crew', box: [.72, .3, .5, .5, .7, .55], parent: 'turret', color: '#9fd37a' },
    { id: 'loader', label: 'Заряжающий', module: 'crew', box: [-.5, .3, .7, .55, .7, .6], parent: 'turret', color: '#9fd37a' },
    { id: 'breech', label: 'Казённик и привод орудия', module: 'gun', box: [0, .52, -.8, .55, .5, 1.35], parent: 'turret', color: '#d98a6a' },
    { id: 'fuelL', label: 'Топливо', module: 'fuel', box: [-1.0, .78, -.4, .6, .45, 2.4], parent: 'hull', color: '#c27ae0' },
    { id: 'fuelR', label: 'Топливо', module: 'fuel', box: [1.0, .78, -.4, .6, .45, 2.4], parent: 'hull', color: '#c27ae0' }
  ];
  return finishModel(T, K, {
    name: 'abrams', root, hull, turret, gun, barrelMesh: gm[0], muzzleZ: -4.25, trackData, spin,
    collision: [
      { kind: 'prism', zone: 'hull', parent: 'hull', zy: hullZY, hw: hullHW, warp: warp },
      { kind: 'prism', zone: 'turret', parent: 'turret', zy: turZY, hw: turHW, warp: wedge }, { kind: 'box', zone: 'turret', parent: 'turret', size: [3.1,.86,1.5], pos: [0,.43,2.1], bounds: bounds(turZY) }
    ],
    colliders: [
      { zone: 'track', size: [.68, .6, 7.1], pos: [-1.36, .4, 0], side: -1 }, { zone: 'track', size: [.68, .6, 7.1], pos: [1.36, .4, 0], side: 1 }
    ],
    internals,
    armor: { hullF: [560, 540], turF: [620, 600], hullS: [105, 85], turS: [165, 140], hullR: [50, 42], turR: [70, 60], roof: [40, 34], track: [22, 22] },
    traits: { ammo: 40, gunDepress: 0.175, gunElev: .30, loader: 'human', cookoff: 'blowout', era: false, reload: 4.8, turretRate: .78, gunRate: .45, maxSpeed: 16.4, label: 'Ниша с вышибными панелями: взрыв БК уходит вверх' },
    dims: { hullL: 7.93, width: 3.66 }
  });
}
