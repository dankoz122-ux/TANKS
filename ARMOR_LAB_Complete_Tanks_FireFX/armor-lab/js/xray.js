// ARMOR LAB — динамический 3D-рентген: прозрачная модель, внутренние модули, траектория снаряда,
// осколки, огонь и детонация. Рисуется той же WebGL-сценой во вьюпорт панели (без второго canvas).
import * as THREE from 'three';

const STATE_COLORS = { ok: null, damaged: '#ffbd70', destroyed: '#e24a3b' };
const MODULE_NAMES = { engine: 'Двигатель', ammo: 'Боекомплект', crew: 'Экипаж', gun: 'Орудие', fuel: 'Топливо', track: 'Ходовая' };

function disposeDeep(o) { o.traverse(c => { c.geometry?.dispose?.(); if (c.material) { (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose?.()); } }); }

export class XrayView {
  constructor(el, factories, opts = {}) {
    this.el = el; this.factories = factories; this.opts = opts;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1.6, .1, 200);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(5, 9, 4); this.scene.add(d);
    // «чертёжный» пол
    const grid = new THREE.GridHelper(14, 28, 0x3f5a47, 0x233428); grid.position.y = 0; this.scene.add(grid);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.28, 64), new THREE.MeshBasicMaterial({ color: 0x5f7f66, transparent: true, opacity: .5, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .01; this.scene.add(ring);
    this.stage = new THREE.Group(); this.scene.add(this.stage);
    this.cache = new Map();
    this.bundle = null; this.type = null; this.t = 0; this.azimuth = .6; this.elev = .42; this.dist = 11.5; this.spin = true;
    this.fx = new THREE.Group(); this.scene.add(this.fx);
    this.shot = null; this.particles = []; this.states = {}; this.highlight = null; this.flameT = 0; this.catastrophe = null;
    this.center = new THREE.Vector3(0, 1.0, 0);
  }

  // ───── подготовка прозрачной модели + модулей ─────
  _build(type) {
    if (this.cache.has(type)) return this.cache.get(type);
    const factory = this.factories[type] || this.factories.t90;
    const model = factory(THREE);
    const ghost = new THREE.MeshBasicMaterial({ color: 0x9db89a, transparent: true, opacity: .11, depthWrite: false });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xa8c4a3, transparent: true, opacity: .42 });
    const toRemove = [];
    model.root.traverse(o => {
      if (!o.isMesh) return;
      if (o.userData.hitCollider) { toRemove.push(o); return; }
      if (o.name === 'track-links' || o.name === 'spinners') { o.material = new THREE.MeshBasicMaterial({ color: 0x6b7f6d, transparent: true, opacity: .35, depthWrite: false }); return; }
      const g = o.geometry;
      if (g && g.attributes.position.count < 60000) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 28), edgeMat);
        o.add(edges);
      }
      o.material = ghost; o.castShadow = o.receiveShadow = false;
    });
    toRemove.forEach(o => o.parent.remove(o));
    const mods = [];
    for (const it of model.internals) {
      const [cx, cy, cz, sx, sy, sz] = it.box;
      const mat = new THREE.MeshStandardMaterial({ color: it.color, emissive: it.color, emissiveIntensity: .4, transparent: true, opacity: .82, roughness: .6, depthWrite: true });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      mesh.position.set(cx, cy, cz);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55 }));
      mesh.add(edges);
      (it.parent === 'turret' ? model.turret : model.hull).add(mesh);
      mods.push({ it, mesh, mat, base: it.color, edges });
    }
    const bundle = { model, mods };
    this.cache.set(type, bundle);
    return bundle;
  }

  setModel(type, turretYaw = 0, gunPitch = 0) {
    if (this.bundle) this.stage.remove(this.bundle.model.root);
    this.type = type; this.bundle = this._build(type);
    this.stage.add(this.bundle.model.root);
    this.bundle.model.turret.rotation.y = turretYaw; this.bundle.model.gun.rotation.x = gunPitch;
    this.bundle.model.turret.position.y = this.bundle.model.turret.userData.homeY ?? (this.bundle.model.turret.userData.homeY = this.bundle.model.turret.position.y);
    this.catastrophe = null; this.bundle.model.turret.rotation.x = 0; this.bundle.model.turret.rotation.z = 0;
    this.bundle.model.turret.position.set(0, this.bundle.model.turret.userData.homeY, this.bundle.model.turret.position.z);
    this.clearFx();
  }
  clearFx() { while (this.fx.children.length) { const c = this.fx.children.pop(); disposeDeep(c); } this.shot = null; this.particles = []; this.highlight = null; }

  setStates(states) { this.states = states || {}; }

  // ───── выстрел: info из game.js (локальные координаты корпуса модели) ─────
  playShot(info) {
    this.setModel(info.type, info.turretYaw, info.gunPitch);
    this.setStates(info.states);
    const P = new THREE.Vector3(...info.pointL), D = new THREE.Vector3(...info.dirL).normalize(), N = new THREE.Vector3(...info.normalL).normalize();
    // камера — с той стороны, куда попали
    const hitAz = Math.atan2(P.x, P.z);
    this.azimuth = hitAz + (Math.abs(P.x) > Math.abs(P.z) ? .55 * Math.sign(P.x || 1) : .55);
    this.elev = .38; this.t = 0; this.spin = true;
    const start = P.clone().addScaledVector(D, -4.5);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1b8 }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: .45, depthWrite: false }));
    head.add(glow);
    const trailGeo = new THREE.BufferGeometry(); const TL = 40; trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TL * 3), 3));
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: .9 }));
    trail.frustumCulled = false;
    const group = new THREE.Group(); group.add(head); this.fx.add(group, trail);
    // отметка точки удара (кольцо по нормали)
    const mark = new THREE.Mesh(new THREE.RingGeometry(.16, .22, 24), new THREE.MeshBasicMaterial({ color: info.penetrates ? 0xff8f5a : 0xd8d5a5, side: THREE.DoubleSide, transparent: true, opacity: 0 }));
    mark.position.copy(P).addScaledVector(N, .02); mark.lookAt(P.clone().add(N)); this.fx.add(mark);
    const end = info.ricochet ? P.clone().addScaledVector(D.clone().reflect(N), 2.2) : P.clone().addScaledVector(D, info.penetrates ? Math.max(.4, info.pathLen) : 0);
    this.shot = { P, D, N, start, end, head, glow, trail, TL, pts: [], phase: 0, time: 0, info, mark, afterburst: false, ricochetDir: info.ricochet ? D.clone().reflect(N) : null };
    this.highlight = info.hitModule || null;
    if (info.penetrates && info.cookoff && info.destroyed) this.catastrophe = { kind: info.cookoff, t: 0, started: false };
  }

  _burst(origin, dir, count, speed, spread, color = 0xffc76b, size = .06) {
    const geo = new THREE.BufferGeometry(); const pos = new Float32Array(count * 3); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 1, depthWrite: false, sizeAttenuation: true }));
    pts.frustumCulled = false;
    const vel = [], life = [];
    for (let i = 0; i < count; i++) {
      const v = dir.clone().add(new THREE.Vector3((Math.random() - .5) * spread, (Math.random() - .5) * spread, (Math.random() - .5) * spread)).normalize().multiplyScalar(speed * (.35 + Math.random() * .9));
      vel.push(v); life.push(.8 + Math.random() * .9); pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y; pos[i * 3 + 2] = origin.z;
    }
    this.fx.add(pts); this.particles.push({ pts, pos, vel, life, age: 0, count, gravity: 2.4 });
  }
  _fireball(at, color = 0xff6a2b, r = .7) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false }));
    m.position.copy(at); this.fx.add(m); this.particles.push({ fireball: m, age: 0, life: 1.4, r });
  }

  update(dt) {
    this.t += dt; this.flameT += dt;
    if (this.spin) this.azimuth += dt * .12;
    const R = this.dist, cy = this.center.y * .72;
    this.camera.position.set(Math.sin(this.azimuth) * Math.cos(this.elev) * R, cy + Math.sin(this.elev) * R, Math.cos(this.azimuth) * Math.cos(this.elev) * R);
    this.camera.lookAt(0, cy, 0);
    // состояния модулей
    if (this.bundle) {
      for (const m of this.bundle.mods) {
        const mod = m.it.module, v = this.states?.[mod];
        const col = v === undefined ? null : v <= 0 ? STATE_COLORS.destroyed : v < 70 ? STATE_COLORS.damaged : null;
        m.mat.color.set(col || m.base); m.mat.emissive.set(col || m.base);
        let k = .4;
        if (v !== undefined && v <= 0) k = .15 + .35 * Math.abs(Math.sin(this.flameT * 9 + m.mesh.id));
        else if (v !== undefined && v < 70) k = .4 + .25 * Math.sin(this.flameT * 5);
        if (this.highlight === m.it.id && this.shot && this.shot.phase >= 2) k = .7 + .5 * Math.abs(Math.sin(this.flameT * 12));
        m.mat.emissiveIntensity = k;
        m.mat.opacity = v !== undefined && v <= 0 ? .6 : .82;
      }
    }
    // анимация снаряда: подлёт → пробитие → осколки
    const s = this.shot;
    if (s) {
      s.time += dt;
      const info = s.info;
      const tIn = .55, tThrough = info.penetrates ? .55 : .0, total = tIn + tThrough;
      let pos;
      if (s.time < tIn) { const u = s.time / tIn; pos = s.start.clone().lerp(s.P, u * u * .4 + u * .6); s.phase = 1; }
      else if (info.ricochet) { const u = Math.min(1, (s.time - tIn) / .5); pos = s.P.clone().lerp(s.end, u); s.phase = 2; s.glow.material.opacity = .45 * (1 - u); }
      else if (info.penetrates) {
        const u = Math.min(1, (s.time - tIn) / tThrough); pos = s.P.clone().lerp(s.end, u * (2 - u)); s.phase = u >= 1 ? 3 : 2;
        s.mark.material.opacity = .9;
        if (u >= 1 && !s.afterburst) {
          s.afterburst = true; s.phase = 3;
          const spallDir = s.D.clone();
          const mod = info.hitModule;
          this._burst(s.end, spallDir, 70, 3.4, 1.8, 0xffcf7a, .07);
          this._burst(s.end, spallDir, 30, 2.0, 2.6, 0xff7a3b, .09);
          if (info.moduleKind === 'ammo') this._fireball(s.end, 0xff7a2b, info.destroyed ? 1.4 : .6);
          if (info.moduleKind === 'fuel') this._fireball(s.end, 0xff9a3b, .55);
          if (info.moduleKind === 'crew') this._burst(s.end, spallDir, 40, 2.4, 3.4, 0xff5a4a, .08);
          if (info.destroyed) this._fireball(s.end, 0xffb347, 1.1);
        }
      } else { pos = s.P.clone(); s.phase = 2; if (s.time - tIn < dt * 2) this._burst(s.P, s.N, 24, 1.6, 2.4, 0xd8d5a5, .05); s.mark.material.opacity = .9; }
      s.head.parent.position.copy(pos);
      s.glow.scale.setScalar(1 + .3 * Math.sin(this.t * 40));
      if (s.phase >= 2 && s.time > tIn + (info.ricochet ? .55 : tThrough) + .15) s.head.visible = false;
      // след
      s.pts.push(pos.x, pos.y, pos.z); while (s.pts.length > s.TL * 3) s.pts.splice(0, 3);
      const arr = s.trail.geometry.attributes.position.array, n = s.pts.length / 3;
      for (let i = 0; i < s.TL; i++) { const k = Math.min(n - 1, i); arr[i * 3] = s.pts[k * 3]; arr[i * 3 + 1] = s.pts[k * 3 + 1]; arr[i * 3 + 2] = s.pts[k * 3 + 2]; }
      s.trail.geometry.attributes.position.needsUpdate = true;
      s.trail.material.opacity = Math.max(0, .9 - Math.max(0, s.time - total - .4) * .8);
    }
    // частицы
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.age += dt;
      if (p.fireball) {
        const u = p.age / p.life; p.fireball.scale.setScalar(1 + u * 1.8); p.fireball.material.opacity = Math.max(0, .8 * (1 - u));
        if (u >= 1) { this.fx.remove(p.fireball); p.fireball.geometry.dispose(); p.fireball.material.dispose(); this.particles.splice(i, 1); }
        continue;
      }
      for (let k = 0; k < p.count; k++) {
        p.vel[k].y -= p.gravity * dt; p.vel[k].multiplyScalar(1 - .8 * dt);
        p.pos[k * 3] += p.vel[k].x * dt; p.pos[k * 3 + 1] += p.vel[k].y * dt; p.pos[k * 3 + 2] += p.vel[k].z * dt;
      }
      p.pts.geometry.attributes.position.needsUpdate = true;
      p.pts.material.opacity = Math.max(0, 1 - p.age / 1.5);
      if (p.age > 1.6) { this.fx.remove(p.pts); disposeDeep(p.pts); this.particles.splice(i, 1); }
    }
    // детонация БК: башня подлетает (только катастрофический исход)
    const c = this.catastrophe;
    if (c && this.shot && this.shot.afterburst) {
      c.t += dt;
      const tur = this.bundle.model.turret;
      if (c.kind === 'catastrophic') {
        if (c.t > .25) { const u = c.t - .25; tur.position.y = tur.userData.homeY + 6 * u - 5 * u * u; tur.rotation.x = u * .9; tur.rotation.z = u * .6; if (!c.started) { c.started = true; this._fireball(new THREE.Vector3(0, 1.2, 0), 0xff6a2b, 1.6); this._burst(new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(0, 1, 0), 90, 5.5, 1.4, 0xffa04a, .1); } }
      } else if (c.kind === 'blowout') {
        if (c.t > .2 && !c.started) { c.started = true; this._burst(tur.localToWorld(new THREE.Vector3(0, .9, 1.6)), new THREE.Vector3(0, 1, 0), 60, 4.6, .8, 0xff9a3b, .09); this._fireball(tur.localToWorld(new THREE.Vector3(0, 1.0, 1.6)), 0xff7a2b, .9); }
      }
    }
    // индикаторы повреждений (мерцающий огонь у уничтоженного топлива/БК)
    if (this.states && this.bundle && Math.random() < dt * 14) {
      for (const m of this.bundle.mods) {
        const v = this.states[m.it.module];
        if ((m.it.module === 'ammo' || m.it.module === 'fuel' || m.it.module === 'engine') && v !== undefined && v <= 0 && this.particles.length < 12) {
          const w = m.mesh.getWorldPosition(new THREE.Vector3()); w.y += .1;
          this._burst(w, new THREE.Vector3(0, 1, 0), 6, .8, 1.2, m.it.module === 'engine' ? 0x666666 : 0xff7a2b, .07);
        }
      }
    }
  }

  // Рисуем в левый нижний угол главного холста и копируем в 2D-canvas панели (панели полупрозрачные,
  // поэтому показывать главный холст «сквозь» них нельзя). Вызывать ДО основного render() кадра.
  render(renderer) {
    const r = this.el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return;
    const pr = renderer.getPixelRatio(), main = renderer.domElement;
    const cw = Math.min(Math.round(r.width), Math.floor(main.width / pr)), ch = Math.min(Math.round(r.height), Math.floor(main.height / pr));
    this.camera.aspect = cw / ch; this.camera.updateProjectionMatrix();
    renderer.setViewport(0, 0, cw, ch); renderer.setScissor(0, 0, cw, ch); renderer.setScissorTest(true);
    renderer.setClearColor(0x0b130e, 1); renderer.clear(true, true, false);
    const prevAuto = renderer.autoClear; renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prevAuto; renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
    const w = Math.round(cw * pr), h = Math.round(ch * pr);
    if (this.el.width !== w || this.el.height !== h) { this.el.width = w; this.el.height = h; }
    this.el.getContext('2d').drawImage(main, 0, main.height - h, w, h, 0, 0, w, h);
  }
}

// ───── панель: связывает вьюпорт с DOM ─────
export function createXrayPanel(factories) {
  const panel = document.querySelector('#hitXray'), viewEl = document.querySelector('#xrView');
  const hit = new XrayView(viewEl, factories);
  const selfEl = document.querySelector('#xrSelfView');
  const self = selfEl ? new XrayView(selfEl, factories) : null;
  if (self) { self.dist = 12.5; self.elev = .5; }
  let hideTimer = 0, big = false;
  const el = id => document.querySelector(id);
  function modsHtml(states) {
    return Object.keys(MODULE_NAMES).filter(k => states[k] !== undefined).map(k => {
      const v = Math.round(states[k]), col = v <= 0 ? '#e24a3b' : v < 70 ? '#ffbd70' : '#b7d87b';
      return `<div class="xrmod"><span>${MODULE_NAMES[k]}</span><i><b style="width:${v}%;background:${col}"></b></i><em>${v}</em></div>`;
    }).join('');
  }
  const api = {
    hit, self,
    show(info) {
      panel.classList.add('show'); hit.playShot(info); hideTimer = 16;
      el('#xrPen').textContent = info.ricochet ? 'РИКОШЕТ' : info.penetrates ? 'ПРОБИТИЕ' : 'БЕЗ ПРОБИТИЯ';
      el('#xrPen').style.color = info.ricochet ? '#d8d5a5' : info.penetrates ? '#ffbd70' : '#b7d87b';
      el('#xrLabel').textContent = info.title; el('#xrSub').textContent = info.sub;
      el('#xrMods').innerHTML = modsHtml(info.states);
    },
    refreshStates(states) { hit.setStates(states); el('#xrMods').innerHTML = modsHtml(states); },
    toggleBig() { big = !big; panel.classList.toggle('big', big); },
    showSelf(type, states, turretYaw = 0) { if (!self) return; self.setModel(type, turretYaw, 0); self.setStates(states); },
    update(dt) {
      if (panel.classList.contains('show')) { hit.update(dt); hideTimer -= dt; if (hideTimer <= 0 && !big) panel.classList.remove('show'); }
      if (self && selfEl && selfEl.offsetParent !== null) self.update(dt);
    },
    render(renderer) {
      if (panel.classList.contains('show')) hit.render(renderer);
      if (self && selfEl && selfEl.offsetParent !== null) self.render(renderer);
    },
    invalidate(type) { hit.cache.delete(type); self?.cache.delete(type); if (hit.type === type) hit.bundle = null; if (self && self.type === type) self.bundle = null; },
    hide() { panel.classList.remove('show'); hit.clearFx(); }
  };
  document.querySelector('#xrBig')?.addEventListener('click', () => api.toggleBig());
  document.querySelector('#xrClose')?.addEventListener('click', () => { big = false; panel.classList.remove('big'); api.hide(); });
  return api;
}
