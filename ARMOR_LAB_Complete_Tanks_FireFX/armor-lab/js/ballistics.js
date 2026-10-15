// ARMOR LAB — игровая баллистика попаданий по моделям танков.
// Игровая аппроксимация (не инженерный расчёт): броня зависит от направления (лоб/борт/корма/крыша),
// от типа боеприпаса (кинетика/кумулятив), угла встречи; остаточная энергия определяет глубину пролёта осколков/струи
// внутри корпуса, а луч внутрь проверяется по объёмам модулей модели.
import * as THREE from 'three';

import { SHELLS } from './shared/rules.js';
export { SHELLS };

const _q = new THREE.Quaternion(), _inv = new THREE.Matrix4(), _n = new THREE.Vector3();

export function armorKey(zone, face) {
  if (zone === 'track') return 'track';
  const n = face;
  if (Math.abs(n.y) > .6) return 'roof';
  const pre = zone === 'turret' ? 'tur' : 'hull';
  if (n.z < -.5) return pre + 'F';
  if (n.z > .5) return pre + 'R';
  return pre + 'S';
}
export const FACE_NAMES = { F: 'лоб', S: 'борт', R: 'корма' };

// hit — результат Raycaster по коллайдеру; vehicle — модель из createTank; dir — мировое направление снаряда
export function analyzeHit({ vehicle, hit, dir, shell, penetration }) {
  const obj = hit.object, zone = obj.userData.zone || 'hull';
  const localN = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);
  const worldN = localN.clone().transformDirection(obj.matrixWorld).normalize();
  if (worldN.dot(dir) > 0) worldN.negate();                     // нормаль всегда смотрит на стрелка
  const angle = Math.acos(THREE.MathUtils.clamp(Math.abs(dir.dot(worldN)), 0, 1)) * 180 / Math.PI;
  const plate = obj.userData.plates ? obj.userData.plates[hit.faceIndex] : null;   // тип плиты рассчитан при сборке модели по её реальной форме
  const key = zone === 'track' ? 'track' : plate ? (plate === 'roof' ? 'roof' : (zone === 'turret' ? 'tur' : 'hull') + plate) : armorKey(zone, localN);
  const roofKey = zone === 'turret' ? 'turRoof' : 'hullRoof';
  const table = (key === 'roof' && vehicle.armor?.[roofKey]) || vehicle.armor?.[key] || [120, 100];
  const nominal = (table[shell.kind] ?? table[0]) * (.93 + Math.random() * .14);
  const cos = Math.max(.16, Math.cos(THREE.MathUtils.degToRad(Math.min(angle, 80))));
  const effective = nominal / cos;
  // кумулятивная струя хуже реагирует на наклон, но чувствительна к динамической защите (уже учтена в таблице)
  const effAdj = shell.kind === 1 ? nominal / Math.max(.3, Math.cos(THREE.MathUtils.degToRad(Math.min(angle, 80))) * .6 + .4) : effective;
  const ricochet = angle > 72 && !shell.he && shell.kind === 0;
  const penetrates = !ricochet && penetration > effAdj;
  const res = {
    zone, key, face: key.slice(-1), angle, nominal, effective: effAdj, ricochet, penetrates,
    normalWorld: worldN, point: hit.point.clone(), module: null, moduleId: null, pathLen: 0, hitDist: 0
  };
  if (!penetrates) return res;
  if (zone === 'track') { res.module = 'track'; res.moduleId = 'track'; res.pathLen = .3; res.hitDist = .3; return res; }
  const residual = penetration - effAdj;
  let path = THREE.MathUtils.clamp(residual / (shell.he ? 400 : 140), shell.he ? .5 : .7, 7);
  res.pathLen = path;
  const root = vehicle.root; root.updateMatrixWorld(true);
  const start = hit.point.clone().addScaledVector(dir, .03);
  const rc = new THREE.Raycaster(start, dir.clone().normalize(), 0, path);
  const hits = rc.intersectObjects(vehicle.internalMeshes || [], false);
  if (hits.length) { const h = hits[0]; res.module = h.object.userData.module; res.moduleId = h.object.userData.moduleId; res.hitDist = h.distance; res.moduleHit = h; }
  else res.hitDist = path;
  return res;
}

// информация для 3D-рентгена (координаты — в локальной системе корня модели, метры модели)
export function buildXrayInfo({ vehicle, type, res, hit, dir, states, turretYaw, gunPitch, title, sub, destroyed, cookoff }) {
  const root = vehicle.root; root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const P = hit.point.clone().applyMatrix4(_inv);
  const D = dir.clone().transformDirection(_inv).normalize();
  const N = res.normalWorld.clone().transformDirection(_inv).normalize();
  const sc = root.getWorldScale(_n).x || 1;
  return {
    type, pointL: [P.x, P.y, P.z], dirL: [D.x, D.y, D.z], normalL: [N.x, N.y, N.z],
    penetrates: res.penetrates, ricochet: res.ricochet, pathLen: res.hitDist / sc,
    hitModule: res.moduleId, moduleKind: res.module, destroyed: !!destroyed, cookoff: cookoff || null,
    states, turretYaw: turretYaw || 0, gunPitch: gunPitch || 0, title, sub
  };
}

export const MODULE_RU = { engine: 'двигатель', ammo: 'боекомплект', crew: 'экипаж', gun: 'орудие', fuel: 'топливо', track: 'ходовая часть' };
