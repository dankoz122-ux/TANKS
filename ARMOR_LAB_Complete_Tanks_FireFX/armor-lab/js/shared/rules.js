// ARMOR LAB — общие правила боя (сервер и клиент): снаряды, характеристики техники, урон по модулям.
export const SHELLS = [
  { name: 'БПС', penetration: 820, energy: 1.0, kind: 0, speed: 105 },
  { name: 'КС', penetration: 700, energy: 1.0, kind: 1, speed: 82 },
  { name: 'ОФС', penetration: 90, energy: 1.0, kind: 0, speed: 58, he: true }
];
// Эталонные параметры серийных машин (сервер им доверяет; кастомным — после ограничений)
export const STOCK = {
  t90: { cookoff: 'catastrophic', ammo: 22, reload: 6.2, maxSpeed: 15.0, penMul: 1 },
  abrams: { cookoff: 'blowout', ammo: 40, reload: 4.8, maxSpeed: 16.4, penMul: 1 },
  leopard: { cookoff: 'blowout', ammo: 42, reload: 5.2, maxSpeed: 15.6, penMul: 1 },
  merkava: { cookoff: 'safe', ammo: 48, reload: 5.4, maxSpeed: 14.6, penMul: 1 }
};
const cl = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(+v) ? +v : a));
export function sanitizeTraits(tank, t) {
  if (STOCK[tank]) return { ...STOCK[tank] };
  t = t || {};
  return {
    cookoff: ['safe', 'blowout', 'catastrophic'].includes(t.cookoff) ? t.cookoff : 'catastrophic',
    ammo: Math.round(cl(t.ammo, 6, 60)), reload: cl(t.reload, 3.4, 8), maxSpeed: cl(t.maxSpeed, 8, 20), penMul: cl(t.penMul, .7, 1.25)
  };
}
export const newStates = () => ({ hp: 100, engine: 100, track: 100, gun: 100, crew: 100, ammo: 100, fuel: 100, optics: 100 });
export const MODULE_KEYS = ['engine', 'track', 'gun', 'crew', 'ammo', 'fuel', 'optics'];

// r: {zone,module,moduleId,penetrates}; возвращает {text,destroyed,cookoff}; st изменяется
export function applyHit(st, traits, r, shell) {
  if (!r.penetrates) return { text: '', destroyed: false, cookoff: null };
  const d = (k, v) => { st[k] = Math.max(0, st[k] - v); };
  const m = r.module, he = !!shell.he; let text = '', cookoff = null;
  if (r.zone === 'track') { d('track', he ? 18 : 42); text = 'ходовая часть'; }
  else if (he) { d('hp', 12); if (m === 'crew') d('crew', 10); text = m ? m + ' (осколки)' : 'внешнее повреждение'; }
  else if (m === 'engine') { d('engine', 45); text = 'двигатель'; }
  else if (m === 'ammo') { d('ammo', 70); text = 'боекомплект'; }
  else if (m === 'crew') { d('crew', 38); text = 'экипаж'; }
  else if (m === 'gun') { d('gun', 55); d('hp', 10); text = 'орудие'; }
  else if (m === 'fuel') { d('fuel', 55); d('engine', 12); text = 'топливо'; }
  else { d('hp', 10); d('optics', 14); text = 'пробитие без поражения модулей'; }
  if (st.ammo <= 0) {
    if (traits.cookoff === 'safe') st.gun = 0;
    else cookoff = (r.moduleId === 'ammoH' && traits.cookoff === 'blowout') ? 'catastrophic' : traits.cookoff;
  }
  return { text, destroyed: st.crew <= 0 || st.hp <= 0 || !!cookoff, cookoff };
}
