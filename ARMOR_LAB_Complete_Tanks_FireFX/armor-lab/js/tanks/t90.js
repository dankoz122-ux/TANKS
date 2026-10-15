// Т-90М «Прорыв» — сварная башня с «Реликтом», 6 катков, 3 поддерживающих ролика, ведущее колесо сзади.
import { createKit, camoTexture, finishModel, bounds } from './kit.js';
export const meta = { id: 't90', name: 'Т-90М «Прорыв»', description: 'Россия · 125 мм · автомат заряжания, «Реликт»' };

export function createTank(T) {
  const camo = camoTexture(T, 't90', '#5b6747', [
    { c: '#6e5d3b', n: 9, r: 46, flat: .6 }, { c: '#2f3a2b', n: 7, r: 34, flat: .7 }, { c: '#7f7a55', n: 5, r: 26 }
  ], 90);
  const K = createKit(T, {
    hull: '#ffffff', camo, turret: '#ffffff', armor: '#f2f2f2', era: '#46543d', track: '#24251f', wheel: '#2c2d27',
    metal: '#80846f', barrel: '#4c5642', dark: '#1f231f', optic: '#233b3a', cloth: '#5b5a40', cargo: '#6d6246'
  });
  const root = new T.Group(), hull = new T.Group(); root.add(hull);
  const ringY = 1.27, ringZ = -.15;
  const glacisY = z => .84 + (z + 3.43) / 1.43 * .43;

  // ───── корпус ─────
  const H = K.acc();
  const taperNose = (x, y, z) => { const t = z < -2.1 ? Math.max(0, Math.min(1, (-2.1 - z) / 1.33)) : 0; return [x * (1 - .14 * t), y, z]; };
  const hullZY = [[-3.05, .47], [-3.43, .72], [-3.43, .84], [-2.0, 1.27], [2.35, 1.27], [3.1, 1.15], [3.43, 1.05], [3.43, .62], [3.15, .47]], hullHW = 1.25;
  H.prism(hullZY, hullHW, 'hull', taperNose);
  // крылья и подкрылки
  H.pair(s => {
    H.box(.46, .06, 5.7, 'hull', [s * 1.48, 1.0, .35]);
    H.box(.46, .06, .95, 'hull', [s * 1.48, 1.07, -3.0], [.32, 0, 0]);          // передний брызговик
    H.box(.05, .5, 4.4, 'armor', [s * 1.73, .78, -.3]);                          // борт-экран
    H.box(.05, .26, 1.0, 'dark', [s * 1.73, .56, 2.4]);                          // низ экрана сзади
    for (let i = 0; i < 9; i++) H.box(.14, .46, .3, 'era', [s * 1.81, .79, -2.15 + i * .42]);   // ДЗ на борту
    // ящики ЗИП и топливные бочки
    H.box(.34, .3, 1.0, 'cargo', [s * 1.55, 1.2, 1.9]);
  });
  H.tubeZ(.2, .2, 1.1, 2.6, 'dark', 1.5, 1.28, 12).tubeZ(.2, .2, -.3, 1.0, 'dark', 1.5, 1.28, 12);   // внешние баки справа
  H.box(.06, .1, 1.7, 'metal', [1.5, 1.04, 1.9]);
  // ДЗ «Реликт» на лобовой детали: 2 ряда плиток вдоль наклона
  const ang = -Math.atan2(.43, 1.43);
  for (const zz of [-3.18, -2.7, -2.22]) for (const xx of [-1.0, -.6, -.2, .2, .6, 1.0]) {
    if (zz > -2.5 && Math.abs(xx) < .3) continue;           // люк механика
    H.box(.38, .09, .42, 'era', [xx * (1 - .07 * (zz < -2.1 ? 1 : 0)), glacisY(zz) + .06, zz], [ang, 0, 0]);
  }
  // люк механика, приборы наблюдения
  H.cyl(.3, .32, .09, 'armor', [0, 1.33, -2.05], [0, 0, 0], 14);
  H.box(.5, .08, .14, 'optic', [0, 1.4, -2.3], [ang, 0, 0]);
  H.box(2.5, .55, .05, 'armor', [0, .66, -3.5], [.34, 0, 0]);                    // бульдозерный отвал
  H.box(.08, .4, .55, 'metal', [-.9, .72, -3.3], [.34, 0, 0]).box(.08, .4, .55, 'metal', [.9, .72, -3.3], [.34, 0, 0]);
  H.box(.5, .2, .06, 'dark', [-.7, .86, -3.42]).box(.5, .2, .06, 'dark', [.7, .86, -3.42]);   // фары
  // моторное отделение: жалюзи, выхлоп
  for (let i = 0; i < 5; i++) H.box(1.3, .04, .22, 'dark', [0, 1.185 - i * .03 + 0, 2.45 + i * .12], [-.1, 0, 0]);
  H.box(.7, .1, .5, 'dark', [0, 1.22, 2.1]);
  H.tubeX(.12, .12, -1.3, -.85, 'dark', 1.0, 3.5, 10);                            // выхлопная труба слева сзади
  H.cyl(.13, .13, 2.5, 'cargo', [0, 1.34, 3.32], [0, 0, Math.PI / 2], 10);        // бревно самовытаскивания
  H.box(.09, .09, 1.9, 'metal', [-.55, 1.33, 2.9]);                               // шноркель (в сложенном виде)
  H.build(hull, { name: 'hull-' });

  // ───── ходовая ─────
  const trackX = 1.41, trackW = .58, wz = [-2.45, -1.48, -.51, .46, 1.43, 2.4];
  const circles = [{ z: 3.05, y: .62, r: .36 }, { z: -3.1, y: .6, r: .33 }, ...wz.map(z => ({ z, y: .43, r: .405 }))];
  const trackData = K.tracks(hull, { x: trackX, width: trackW, circles, thick: .07, pitch: .165 });
  const spinList = [{ z: 3.05, y: .62, r: .3, w: .62 }, { z: -3.1, y: .6, r: .27, w: .6 }];
  wz.forEach(z => spinList.push({ z, y: .43, r: .34, w: .64 }));
  [-1.6, -.05, 1.55].forEach(z => spinList.push({ z, y: .83, r: .11, w: .6 }));
  const spin = K.spinners(hull, spinList, trackX);
  // шины катков (резиновый бандаж) — статичные диски вокруг ступиц
  const W = K.acc();
  W.pair(s => {
    for (const z of wz) { W.tubeX(.405, .405, s * 1.18, s * 1.3, 'rubber', .43, z, 16); W.tubeX(.405, .405, s * 1.52, s * 1.64, 'rubber', .43, z, 16); }
    for (const z of [-1.6, -.05, 1.55]) W.tubeX(.11, .11, s * 1.15, s * 1.67, 'rubber', .83, z, 10);
    W.tubeX(.2, .2, s * 1.0, s * 1.75, 'metal', .43, wz[0], 8);
  });
  W.build(hull, { name: 'wheels-' });

  // ───── башня (сварная, клиновидная) ─────
  const turret = new T.Group(); turret.position.set(0, ringY, ringZ); root.add(turret);
  const Tt = K.acc();
  const turretWarp = (x, y, z) => { const f = z < -.4 ? Math.max(0, Math.min(1, (-.4 - z) / 1.35)) : 0; return [x * (1 - .36 * f) * (1 - .16 * (y / .95)), y, z]; };
  const turZY = [[-1.55, .0], [-1.78, .32], [-1.72, .7], [-1.25, .93], [.9, .93], [1.3, .85], [1.52, .55], [1.52, 0]], turHW = 1.2;
  Tt.prism(turZY, turHW, 'turret', turretWarp);
  // клинья брони по бокам и ДЗ на крыше башни
  Tt.pair(s => {
    Tt.box(.55, .62, .85, 'era', [s * .92, .5, -1.05], [0, s * .42, 0]);
    Tt.box(.4, .1, .55, 'era', [s * .62, .98, -1.1]);
    Tt.box(.4, .1, .55, 'era', [s * .22, .98, -1.1]);
    for (let i = 0; i < 3; i++) Tt.cyl(.045, .045, .3, 'dark', [s * (1.0 + .02 * i), .62 + i * .0, -.25 - i * .11], [0, 0, 0], 8);    // дымовые гранатомёты
    Tt.box(.1, .5, 1.5, 'era', [s * 1.03, .4, .75]);                                            // ДЗ на борту башни
  });
  Tt.box(2.4, .55, .95, 'turret', [0, .32, 1.72]);                                              // кормовая ниша
  Tt.box(2.4, .1, .95, 'dark', [0, .62, 1.72]);
  for (let i = 0; i < 6; i++) Tt.box(.04, .5, .95, 'dark', [-1.0 + i * .4, .32, 1.76]);        // решётка ниши
  Tt.cyl(.16, .16, 1.9, 'cargo', [0, .78, 1.98], [0, 0, Math.PI / 2], 10);                       // брезентовый свёрток
  // прицелы и люки
  Tt.box(.46, .26, .42, 'optic', [-.58, 1.08, -.9]);                                              // прицел наводчика
  Tt.box(.5, .3, .5, 'armor', [-.58, .97, -.9]);
  Tt.cyl(.34, .36, .18, 'armor', [.62, .99, .2], [0, 0, 0], 14);                                  // командирская башенка
  Tt.box(.34, .22, .34, 'optic', [.62, 1.19, .2]);
  Tt.box(.2, .15, .3, 'dark', [.62, 1.35, .3]);                                                   // ДУ-пулемёт «Корд»
  Tt.tubeZ(.025, .025, -.35, .3, 'barrel', .62, 1.37, 8);
  Tt.cyl(.3, .31, .08, 'armor', [-.55, .97, .65], [0, 0, 0], 14);                                 // люк заряжающего
  Tt.tubeZ(.012, .015, 1.5, 1.5, 'dark', .9, 1.5, 6);
  Tt.cyl(.012, .016, 2.3, 'dark', [.95, 1.75, 1.6], [0, 0, 0], 6);                                // антенна
  // маска орудия
  Tt.box(.95, .56, .4, 'armor', [0, .52, -1.78]);
  Tt.build(turret, { name: 'turret-' });

  // ───── орудие 2А46М-5 ─────
  const gun = new T.Group(); gun.position.set(0, .52, -1.55); turret.add(gun);
  const G = K.acc();
  G.tubeZ(.13, .1, -.3, -2.6, 'barrel', 0, 0, 14);
  G.tubeZ(.1, .075, -2.6, -4.55, 'barrel', 0, 0, 14);
  G.tubeZ(.17, .17, -2.5, -3.35, 'sleeve', 0, 0, 14);                                             // эжектор
  G.tubeZ(.1, .1, -4.4, -4.55, 'dark', 0, 0, 12);
  G.cyl(.2, .2, .2, 'dark', [0, 0, -.2], [Math.PI / 2, 0, 0], 12);
  const gm = G.build(gun, { name: 'gun-' });

  const internals = [
    { id: 'engine', label: 'Двигатель В-92С2', module: 'engine', box: [0, .88, 2.22, 1.85, .72, 1.5], parent: 'hull', color: '#7ea0c2' },
    { id: 'trans', label: 'Трансмиссия', module: 'engine', box: [0, .85, 3.05, 1.6, .55, .5], parent: 'hull', color: '#8aa5b8' },
    { id: 'ammo', label: 'Автомат заряжания (карусель)', module: 'ammo', box: [0, .83, -.12, 1.75, .3, 1.75], parent: 'hull', color: '#e0b25a' },
    { id: 'ammoB', label: 'Боеукладка в нише', module: 'ammo', box: [0, .3, 1.7, 1.7, .35, .55], parent: 'turret', color: '#e0b25a' },
    { id: 'driver', label: 'Механик-водитель', module: 'crew', box: [0, .92, -2.3, .6, .6, .8], parent: 'hull', color: '#9fd37a' },
    { id: 'gunner', label: 'Наводчик', module: 'crew', box: [-.58, .32, -.1, .5, .7, .6], parent: 'turret', color: '#9fd37a' },
    { id: 'cmdr', label: 'Командир', module: 'crew', box: [.58, .32, .15, .5, .7, .6], parent: 'turret', color: '#9fd37a' },
    { id: 'breech', label: 'Казённик и привод орудия', module: 'gun', box: [0, .5, -.75, .5, .45, 1.1], parent: 'turret', color: '#d98a6a' },
    { id: 'fuelL', label: 'Топливо', module: 'fuel', box: [-.85, .78, -1.5, .7, .4, 1.5], parent: 'hull', color: '#c27ae0' },
    { id: 'fuelR', label: 'Топливо', module: 'fuel', box: [.85, .78, -1.5, .7, .4, 1.5], parent: 'hull', color: '#c27ae0' }
  ];
  return finishModel(T, K, {
    name: 't90', root, hull, turret, gun, barrelMesh: gm[0], muzzleZ: -4.58, trackData, spin,
    collision: [
      { kind: 'prism', zone: 'hull', parent: 'hull', zy: hullZY, hw: hullHW, warp: taperNose },
      { kind: 'prism', zone: 'turret', parent: 'turret', zy: turZY, hw: turHW, warp: turretWarp }, { kind: 'box', zone: 'turret', parent: 'turret', size: [2.4,.55,.95], pos: [0,.32,1.72], bounds: bounds(turZY) }
    ],
    colliders: [
      { zone: 'track', size: [.62, .6, 6.4], pos: [-1.41, .4, 0], side: -1 }, { zone: 'track', size: [.62, .6, 6.4], pos: [1.41, .4, 0], side: 1 }
    ],
    internals,
    // игровые значения защиты, мм условной стали: [кинетика, кумулятив]
    armor: { hullF: [480, 440], turF: [540, 500], hullS: [95, 75], turS: [150, 120], hullR: [45, 40], turR: [65, 55], roof: [38, 32], track: [22, 22] },
    traits: { ammo: 22, gunDepress: 0.09, gunElev: .30, loader: 'carousel', cookoff: 'catastrophic', era: true, reload: 6.2, turretRate: .68, gunRate: .38, maxSpeed: 15.0, label: 'Автомат заряжания: детонация БК срывает башню' },
    dims: { hullL: 6.86, width: 3.78 }
  });
}
