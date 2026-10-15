// ARMOR LAB — мастерская (конструктор танка в духе Sprocket).
// Отдельная 3D-сцена, редактируемый профиль корпуса и башни, ходовая, орудие, отсеки, детали с гизмо,
// карта брони с замером угла, живые характеристики, история правок и запуск машины в бой.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { collisionMesh } from './tanks/kit.js';
import {
  createCustomTank, customFactory, defaultDesign, normalizeDesign, computeStats, PRESETS, PART_TYPES, PART_MATS,
  COMP_KINDS, CAMO_NAMES, polyIsSimple, topAt, taperWarp, clamp
} from './custom.js';

const LS_CUR = 'armorLabDesignV2', LS_LIB = 'armorLabLibraryV2';
const $ = (s, r = document) => r.querySelector(s);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
const safe = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } } };
const fmt = (v, d = 2) => Number(v).toFixed(d);
const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 7);

const TABS = [['hull', 'Корпус'], ['turret', 'Башня'], ['chassis', 'Ходовая'], ['gun', 'Орудие'], ['comps', 'Отсеки'], ['parts', 'Детали'], ['paint', 'Краска']];
const SL = (label, path, min, max, step, unit = '') => ({ type: 'range', label, path, min, max, step, unit });
const CK = (label, path) => ({ type: 'check', label, path });
const SEL = (label, path, options, num = false) => ({ type: 'select', label, path, options, num });
const SCHEMA = {
  hull: [
    SL('Полуширина корпуса', 'hull.halfWidth', .8, 2.0, .01, ' м'), SL('Сужение носа', 'hull.noseTaper', 0, .6, .01), SL('Сужение кормы', 'hull.rearTaper', 0, .5, .01), SL('Наклон бортов', 'hull.slope', 0, .4, .01),
    { type: 'title', label: 'Броня корпуса (мм стали)' }, SL('Лоб / скаты носа', 'hull.armor.F', 20, 1000, 5, ' мм'), SL('Борт', 'hull.armor.S', 10, 400, 5, ' мм'), SL('Корма', 'hull.armor.R', 10, 300, 5, ' мм'), SL('Крыша / днище', 'hull.armor.roof', 10, 200, 5, ' мм')
  ],
  turret: [
    SL('Полуширина башни', 'turret.halfWidth', .7, 2.0, .01, ' м'), SL('Сужение лба', 'turret.noseTaper', 0, .7, .01), SL('Сужение кормы', 'turret.rearTaper', 0, .5, .01), SL('Наклон бортов', 'turret.slope', 0, .4, .01),
    SL('Высота погона', 'turret.ringY', .8, 2.0, .01, ' м'), SL('Положение погона по Z', 'turret.ringZ', -1.5, 1.5, .01, ' м'),
    { type: 'title', label: 'Броня башни (мм стали)' }, SL('Лоб / маска', 'turret.armor.F', 20, 1200, 5, ' мм'), SL('Борт', 'turret.armor.S', 10, 450, 5, ' мм'), SL('Корма', 'turret.armor.R', 10, 300, 5, ' мм'), SL('Крыша', 'turret.armor.roof', 10, 200, 5, ' мм')
  ],
  chassis: [
    SL('Опорных катков', 'running.wheels', 3, 10, 1), SL('Радиус катка', 'running.wheelRadius', .26, .5, .005, ' м'), SL('Поддерживающих роликов', 'running.rollers', 0, 6, 1),
    SL('Длина гусеницы', 'running.trackLen', 3.5, 9, .05, ' м'), SL('Ширина гусеницы', 'running.trackWidth', .35, .95, .01, ' м'), SL('Колея (X гусеницы)', 'running.trackX', .9, 2.1, .01, ' м'), SL('Сдвиг ходовой по Z', 'running.offsetZ', -1, 1, .05, ' м'),
    SEL('Ведущее колесо', 'running.sprocket', [['rear', 'Сзади'], ['front', 'Спереди']]), CK('Бортовые экраны', 'running.skirts'), SL('Мощность двигателя', 'engine.power', 400, 2200, 10, ' л.с.')
  ],
  gun: [
    SEL('Калибр', 'gun.caliber', [[75, '75 мм'], [90, '90 мм'], [105, '105 мм'], [120, '120 мм'], [125, '125 мм'], [130, '130 мм'], [140, '140 мм'], [152, '152 мм']], true),
    SL('Длина ствола', 'gun.length', 2.5, 7.5, .05, ' м'), SL('Высота установки', 'gun.mountY', .2, 1.0, .01, ' м'), SL('Вынос вперёд (Z)', 'gun.mountZ', -3, -.8, .01, ' м'), SL('Угол склонения', 'gun.depress', 3, 14, .5, '°'),
    CK('Термокожух', 'gun.sleeve'), CK('Эжектор', 'gun.evac'), CK('Дульный тормоз', 'gun.brake'), CK('Автомат заряжания', 'gun.autoloader')
  ],
  paint: [SEL('Камуфляж', 'paint.camo', Object.entries(CAMO_NAMES)), { type: 'color', label: 'Основной цвет', path: 'paint.base' }]
};

export function initBuilder(ctx) {
  const { renderer, canvas, notify, onOpen, onClose, onUse } = ctx;
  let inited = false, isOpen = false;
  let design = null, history = [], hIdx = -1, tab = 'hull', sel = null;
  let scene, camera, orbit, tc, holder, model = null, helpers = [], overlays = [], armorView = false, showComps = false, snapOn = true, playTrack = false;
  let rebuildQueued = false, saveTimer = 0, profDrag = null, profRedraw = () => { }, partParent = 'turret';
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const root = $('#builder');

  // ───────────────────────── данные ─────────────────────────
  const getPath = (p) => p.split('.').reduce((o, k) => o?.[k], design);
  const setPath = (p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], design)[last] = v; };
  function loadInitial() {
    const raw = safe.get(LS_CUR);
    try { design = normalizeDesign(raw ? JSON.parse(raw) : PRESETS.balanced.make()); } catch { design = normalizeDesign(PRESETS.balanced.make()); }
    history = [JSON.stringify(design)]; hIdx = 0;
  }
  function commit() {
    const j = JSON.stringify(design);
    if (history[hIdx] === j) return;
    history = history.slice(0, hIdx + 1); history.push(j); if (history.length > 100) history.shift(); hIdx = history.length - 1;
    clearTimeout(saveTimer); saveTimer = setTimeout(() => safe.set(LS_CUR, j), 300);
    refreshStats(); updateUndoButtons();
  }
  function applyHistory(i) {
    if (i < 0 || i >= history.length) return;
    hIdx = i; design = JSON.parse(history[i]); const nm = $('#bName'); if (nm) nm.value = design.name;
    if (sel && !findItem(sel)) sel = null;
    rebuild(); renderTab(); refreshStats(); updateUndoButtons();
  }
  const findItem = (s) => s.kind === 'part' ? design.parts.find(p => p.id === s.id) : design.compartments.find(c => c.id === s.id);
  function updateUndoButtons() { $('#bUndo').disabled = hIdx <= 0; $('#bRedo').disabled = hIdx >= history.length - 1; }

  // ───────────────────────── сцена ─────────────────────────
  function initScene() {
    scene = new THREE.Scene(); scene.background = new THREE.Color('#141f19');
    camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .1, 200); camera.position.set(9, 5.5, 10);
    scene.add(new THREE.HemisphereLight(0xdce8dd, 0x2a352c, 1.9));
    const sun = new THREE.DirectionalLight(0xfff1dc, 3); sun.position.set(-7, 12, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 }); sun.shadow.bias = -.0004; scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9cc3ff, .8); rim.position.set(8, 4, -8); scene.add(rim);
    const grid = new THREE.GridHelper(24, 48, 0x4f6f58, 0x273529); grid.position.y = .002; scene.add(grid);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .4 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const axes = new THREE.Group(); // метки носа
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.18, .5, 12), new THREE.MeshBasicMaterial({ color: 0xe2a24a })); arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, .02, -6.3); axes.add(arrow); scene.add(axes);
    holder = new THREE.Group(); scene.add(holder);
    orbit = new OrbitControls(camera, canvas); orbit.target.set(0, 1, 0); orbit.enableDamping = true; orbit.dampingFactor = .12; orbit.maxPolarAngle = Math.PI * .495; orbit.minDistance = 3; orbit.maxDistance = 30;
    tc = new TransformControls(camera, canvas); tc.setSize(.85); scene.add(typeof tc.getHelper === "function" ? tc.getHelper() : tc);
    tc.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; });
    tc.addEventListener('objectChange', onGizmoChange);
    tc.addEventListener('mouseUp', () => { commit(); refreshInspector(); });
    applySnap();
    canvas.addEventListener('pointerdown', onPointerDown); canvas.addEventListener('pointerup', onPointerUp); canvas.addEventListener('pointermove', onPointerMove);
  }
  function applySnap() { tc.setTranslationSnap(snapOn ? .05 : null); tc.setRotationSnap(snapOn ? THREE.MathUtils.degToRad(5) : null); tc.setScaleSnap(snapOn ? .05 : null); }

  function disposeModel() {
    if (!model) return;
    holder.remove(model.root);
    model.root.traverse(o => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => { if (!x.map) x.dispose?.(); }); });
    model = null; helpers = []; overlays = [];
  }
  function rebuild() {
    rebuildQueued = false;
    const keepSel = sel; if (tc) tc.detach();
    disposeModel();
    model = createCustomTank(THREE, design);
    model.root.scale.setScalar(1);                 // в мастерской работаем в реальных метрах
    holder.add(model.root);
    buildHelpers(); buildOverlays();
    sel = keepSel && findItem(keepSel) ? keepSel : null;
    attachSelection(); profRedraw();
  }
  function queueRebuild() { if (!rebuildQueued) { rebuildQueued = true; requestAnimationFrame(() => { if (rebuildQueued && isOpen) rebuild(); }); } }

  // отсеки — полупрозрачные объёмы, их можно двигать и масштабировать
  function buildHelpers() {
    helpers = [];
    for (const c of design.compartments) {
      const info = COMP_KINDS[c.kind] || COMP_KINDS.crew;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: info.color, transparent: true, opacity: .32, depthWrite: false }));
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: info.color })));
      m.position.set(...c.pos); m.scale.set(...c.size); m.userData.compId = c.id; m.visible = (tab === 'comps' || showComps);
      (c.parent === 'turret' ? model.turret : model.hull).add(m); helpers.push(m);
    }
  }
  // карта брони: поверх корпуса и башни — окраска плит по толщине
  const RAMP = [[0, [59, 91, 219]], [100, [47, 181, 196]], [250, [76, 194, 106]], [400, [230, 217, 58]], [600, [240, 140, 46]], [800, [224, 49, 49]]];
  function armorRGB(mm) {
    for (let i = 1; i < RAMP.length; i++) if (mm <= RAMP[i][0] || i === RAMP.length - 1) { const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], t = clamp((mm - a) / (b - a), 0, 1); return ca.map((v, k) => (v + (cb[k] - v) * t) / 255); }
  }
  function plateMM(which, plate) { const a = design[which].armor; return plate === 'F' ? a.F : plate === 'S' ? a.S : plate === 'R' ? a.R : a.roof; }
  function buildOverlays() {
    overlays = [];
    const specs = model.collisionSpecs;
    for (const which of ['hull', 'turret']) {
      const s = specs[which], { geometry, plates } = collisionMesh(THREE, { kind: 'prism', zy: s.zy, hw: s.hw, warp: s.warp });
      const col = []; for (let t = 0; t < plates.length; t++) { const c = armorRGB(plateMM(which, plates[t])); for (let k = 0; k < 3; k++) col.push(...c); }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, transparent: true, opacity: .93 }));
      m.userData.plates = plates; m.userData.which = which; m.visible = armorView; m.userData.overlay = true;
      (which === 'turret' ? model.turret : model.hull).add(m); overlays.push(m);
    }
  }
  function setArmorView(on) { armorView = on; overlays.forEach(o => o.visible = on); $('#bArmorBtn').classList.toggle('on', on); $('#bLegend').style.display = on ? 'block' : 'none'; if (!on) $('#bTip').style.display = 'none'; }
  function setHelpersVisible() { const v = tab === 'comps' || showComps; helpers.forEach(h => h.visible = v); $('#bCompsBtn').classList.toggle('on', showComps); }

  // ───────────────────────── выбор и гизмо ─────────────────────────
  function attachSelection() {
    if (!tc) return;
    tc.detach();
    if (!sel) return;
    let obj = null;
    if (sel.kind === 'part') obj = model.partMeshes.find(m => m.userData.itemId === sel.id && !m.userData.mirror);
    else obj = helpers.find(h => h.userData.compId === sel.id);
    if (obj) { tc.attach(obj); tc.setSpace(tc.mode === 'translate' ? 'world' : 'local'); }
  }
  function select(s) { sel = s; attachSelection(); renderTab(); }
  function onGizmoChange() {
    const o = tc.object; if (!o || !sel) return;
    const it = findItem(sel); if (!it) return;
    const r = v => +v.toFixed(3);
    it.pos = [r(o.position.x), r(o.position.y), r(o.position.z)];
    if (sel.kind === 'part') {
      it.rot = [r(o.rotation.x), r(o.rotation.y), r(o.rotation.z)]; it.size = [r(Math.max(.02, o.scale.x)), r(Math.max(.02, o.scale.y)), r(Math.max(.02, o.scale.z))];
      const mir = model.partMeshes.find(m => m.userData.itemId === sel.id && m.userData.mirror);
      if (mir) { mir.position.set(-o.position.x, o.position.y, o.position.z); mir.rotation.set(o.rotation.x, -o.rotation.y, -o.rotation.z); mir.scale.copy(o.scale); }
    } else it.size = [r(Math.max(.1, o.scale.x)), r(Math.max(.1, o.scale.y)), r(Math.max(.1, o.scale.z))];
    refreshInspector(true);
  }
  let downX = 0, downY = 0;
  function onPointerDown(e) { if (!isOpen) return; downX = e.clientX; downY = e.clientY; }
  function pickables() {
    if (tab === 'parts') return model.partMeshes;
    if (tab === 'comps' || showComps) return helpers;
    return [];
  }
  function onPointerUp(e) {
    if (!isOpen || e.button !== 0 || Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
    if (tc.axis) return;                                    // клик по самому гизмо
    mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
    const list = pickables(); if (!list.length) return;
    const hit = ray.intersectObjects(list, false)[0];
    if (hit) { const o = hit.object; select(o.userData.part ? { kind: 'part', id: o.userData.itemId } : { kind: 'comp', id: o.userData.compId }); }
    else if (sel) { sel = null; attachSelection(); renderTab(); }
  }
  function onPointerMove(e) {
    if (!isOpen || !armorView) return;
    mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(overlays, false)[0], tip = $('#bTip');
    if (!hit) { tip.style.display = 'none'; return; }
    const o = hit.object, plate = o.userData.plates[hit.faceIndex], mm = plateMM(o.userData.which, plate);
    const n = hit.face.normal.clone().transformDirection(o.matrixWorld); if (n.dot(ray.ray.direction) > 0) n.negate();
    const horiz = ray.ray.direction.clone(); horiz.y = 0; horiz.normalize();             // выстрел «с земли» по горизонтали
    const ang = Math.acos(clamp(Math.abs(horiz.dot(n)), 0, 1)) * 180 / Math.PI, eff = mm / Math.max(.16, Math.cos(THREE.MathUtils.degToRad(Math.min(ang, 80))));
    const nm = { F: 'лоб', S: 'борт', R: 'корма', roof: 'крыша' }[plate];
    tip.innerHTML = `<b>${o.userData.which === 'turret' ? 'Башня' : 'Корпус'} · ${nm}</b><br>Плита: ${mm} мм<br>Угол к горизонтальному выстрелу: ${ang.toFixed(0)}°<br>Эффективно: <b>${eff.toFixed(0)} мм</b>`;
    tip.style.left = Math.min(innerWidth - 230, e.clientX + 16) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; tip.style.display = 'block';
  }
  function setMode(m) { if (!tc) return; tc.setMode(m); tc.setSpace(m === 'translate' ? 'world' : 'local'); document.querySelectorAll('[data-gmode]').forEach(b => b.classList.toggle('on', b.dataset.gmode === m)); }

  // ───────────────────────── UI: каркас ─────────────────────────
  function buildShell() {
    root.innerHTML = `
    <div class="b-top">
      <div class="b-brand"><b>МАСТЕРСКАЯ</b><small>конструктор · ARMOR LAB</small></div>
      <input id="bName" class="b-name" maxlength="28" spellcheck="false">
      <div class="b-group"><button id="bUndo" title="Ctrl+Z">↶</button><button id="bRedo" title="Ctrl+Y">↷</button></div>
      <div class="b-group">
        <button data-gmode="translate" class="on" title="G">Перенос</button><button data-gmode="rotate" title="R">Поворот</button><button data-gmode="scale" title="S">Размер</button>
        <button id="bSnap" class="on" title="Привязка к сетке">Сетка</button>
      </div>
      <div class="b-group"><button data-view="persp">3D</button><button data-view="side">Сбоку</button><button data-view="front">Спереди</button><button data-view="top">Сверху</button></div>
      <div class="b-group"><button id="bArmorBtn" title="A">Карта брони</button><button id="bCompsBtn">Отсеки</button><button id="bTrackBtn">Ход</button></div>
      <div class="b-spacer"></div>
      <button id="bUse" class="b-go">В БОЙ ▶</button><button id="bExit">Закрыть ✕</button>
    </div>
    <div class="b-panel" id="bLeft"><div class="b-tabs" id="bTabs"></div><div id="bBody" class="b-body"></div></div>
    <div class="b-panel" id="bRight">
      <div class="b-sec">ХАРАКТЕРИСТИКИ</div><div id="bStats"></div>
      <div class="b-sec">ПРОЕКТ</div>
      <div class="b-row2"><select id="bPreset"><option value="">Шаблон…</option>${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select><select id="bLib"><option value="">Мои проекты…</option></select></div>
      <div class="b-actions"><button id="bSave">Сохранить</button><button id="bLoad">Загрузить</button><button id="bDel">Удалить</button><button id="bExport">Экспорт JSON</button><button id="bImport">Импорт JSON</button></div>
      <input id="bFile" type="file" accept="application/json,.json" style="display:none">
    </div>
    <div id="bLegend" class="b-legend"><b>КАРТА БРОНИ</b><i></i><span>0</span><span>200</span><span>400</span><span>600</span><span>800+ мм</span><small>Наведи курсор на корпус или башню — покажу эффективную толщину.</small></div>
    <div id="bTip" class="b-tip"></div>
    <div class="b-hint">ЛКМ по детали/отсеку — выбрать · ЛКМ-drag — орбита · ПКМ-drag — сдвиг · колесо — зум · G/R/S — перенос/поворот/размер · Del — удалить · Ctrl+Z / Ctrl+Y — история · Ctrl+D — копия · A — карта брони · 1–4 — виды</div>`;
    $('#bTabs').innerHTML = TABS.map(([k, n]) => `<button data-tab="${k}">${n}</button>`).join('');
    $('#bTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; sel = null; attachSelection(); setHelpersVisible(); renderTab(); } });
    $('#bName').addEventListener('input', e => { design.name = e.target.value; }); $('#bName').addEventListener('change', commit);
    $('#bUndo').onclick = () => applyHistory(hIdx - 1); $('#bRedo').onclick = () => applyHistory(hIdx + 1);
    root.querySelectorAll('[data-gmode]').forEach(b => b.onclick = () => setMode(b.dataset.gmode));
    $('#bSnap').onclick = () => { snapOn = !snapOn; $('#bSnap').classList.toggle('on', snapOn); applySnap(); };
    root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
    $('#bArmorBtn').onclick = () => setArmorView(!armorView);
    $('#bCompsBtn').onclick = () => { showComps = !showComps; setHelpersVisible(); };
    $('#bTrackBtn').onclick = () => { playTrack = !playTrack; $('#bTrackBtn').classList.toggle('on', playTrack); };
    $('#bExit').onclick = close; $('#bUse').onclick = useInBattle;
    $('#bPreset').onchange = e => { const k = e.target.value; if (!k) return; design = normalizeDesign(PRESETS[k].make()); sel = null; e.target.value = ''; commit(); rebuild(); renderTab(); notify('Шаблон: ' + design.name); };
    $('#bSave').onclick = saveToLib; $('#bLoad').onclick = loadFromLib; $('#bDel').onclick = delFromLib; refreshLib();
    $('#bExport').onclick = () => { const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (design.name || 'tank').replace(/[^\wа-яё-]+/gi, '_') + '.armorlab.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    $('#bImport').onclick = () => $('#bFile').click();
    $('#bFile').addEventListener('change', async e => { const f = e.target.files?.[0]; if (!f) return; try { const d = JSON.parse(await f.text()); if (d.format !== 'ARMOR-LAB-DESIGN' || d.version !== 2) throw 0; design = normalizeDesign(d); sel = null; commit(); rebuild(); renderTab(); notify('Проект импортирован'); } catch { notify('Не удалось импортировать: нужен проект ARMOR LAB версии 2'); } e.target.value = ''; });
    addEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (!isOpen) return;
    const tag = document.activeElement?.tagName; if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) && !(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); applyHistory(e.shiftKey ? hIdx + 1 : hIdx - 1); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); applyHistory(hIdx + 1); }
    else if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicateSel(); }
    else if (k === 'g') setMode('translate'); else if (k === 'r') setMode('rotate'); else if (k === 's') setMode('scale');
    else if (k === 'a') setArmorView(!armorView);
    else if (k === 'delete' || k === 'backspace') deleteSel();
    else if (k === 'escape') { sel = null; attachSelection(); renderTab(); }
    else if (k === '1') setView('persp'); else if (k === '2') setView('side'); else if (k === '3') setView('front'); else if (k === '4') setView('top');
    else if (k === 'f') { orbit.target.set(0, 1, 0); }
  }
  function setView(v) {
    const t = orbit.target, d = 13;
    const pos = { persp: [9, 5.5, 10], side: [d, 1.4, 0], front: [0, 1.6, -d], top: [0, d + 2, .01] }[v];
    camera.position.set(t.x + pos[0], t.y + pos[1] - 1, t.z + pos[2]); orbit.update();
  }

  // ───────────────────────── UI: вкладки ─────────────────────────
  function renderTab() {
    document.querySelectorAll('#bTabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const body = $('#bBody'); body.innerHTML = ''; profRedraw = () => { };
    if (tab === 'hull' || tab === 'turret') {
      body.append(el(`<div class="b-note">${tab === 'hull' ? 'Контур корпуса сбоку: тяни вершины, двойной клик по ребру — добавить, ПКМ по вершине — удалить. Нос справа.' : 'Контур башни сбоку (показан от погона). Двигай вершины — форма и бронирование пересчитаются сразу.'}</div>`));
      body.append(profileEditor(tab));
    }
    if (SCHEMA[tab]) body.append(controls(SCHEMA[tab]));
    if (tab === 'comps') body.append(compsPanel());
    if (tab === 'parts') body.append(partsPanel());
    if (tab === 'chassis') body.append(el('<div class="b-note">Совет: чем шире гусеница и длиннее опорная база, тем ниже давление на грунт и выше проходимость; масса и мощность видны справа.</div>'));
  }
  function controls(list) {
    const f = document.createDocumentFragment();
    for (const c of list) {
      if (c.type === 'title') { f.append(el(`<div class="b-sec">${c.label.toUpperCase()}</div>`)); continue; }
      const val = getPath(c.path);
      if (c.type === 'range') {
        const row = el(`<label class="b-field"><span>${c.label}</span><input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${val}"><output>${fmt(val, c.step >= 1 ? 0 : 2)}${c.unit}</output></label>`);
        const inp = row.querySelector('input'), out = row.querySelector('output');
        inp.addEventListener('input', () => { const v = +inp.value; setPath(c.path, v); out.textContent = fmt(v, c.step >= 1 ? 0 : 2) + c.unit; if (/armor/.test(c.path)) { recolorOverlays(); refreshStats(); } else queueRebuild(); refreshStats(); });
        inp.addEventListener('change', commit); f.append(row);
      } else if (c.type === 'check') {
        const row = el(`<label class="b-field b-check"><input type="checkbox" ${val ? 'checked' : ''}><span>${c.label}</span></label>`);
        row.querySelector('input').addEventListener('change', e => { setPath(c.path, e.target.checked); commit(); queueRebuild(); }); f.append(row);
      } else if (c.type === 'select') {
        const row = el(`<label class="b-field"><span>${c.label}</span><select>${c.options.map(([v, n]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`);
        row.querySelector('select').addEventListener('change', e => { setPath(c.path, c.num ? +e.target.value : e.target.value); commit(); queueRebuild(); }); f.append(row);
      } else if (c.type === 'color') {
        const row = el(`<label class="b-field"><span>${c.label}</span><input type="color" value="${val}"></label>`);
        const inp = row.querySelector('input'); inp.addEventListener('input', () => { setPath(c.path, inp.value); queueRebuild(); }); inp.addEventListener('change', commit); f.append(row);
      }
    }
    return f;
  }
  function recolorOverlays() {
    for (const o of overlays) { const pl = o.userData.plates, col = []; for (let t = 0; t < pl.length; t++) { const c = armorRGB(plateMM(o.userData.which, pl[t])); for (let k = 0; k < 3; k++) col.push(...c); } o.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); }
  }

  // отсеки
  function compsPanel() {
    const w = document.createElement('div');
    w.append(el('<div class="b-sec">ДОБАВИТЬ ОТСЕК</div>'));
    const pal = el('<div class="b-pal"></div>');
    for (const [k, v] of Object.entries(COMP_KINDS)) { const b = el(`<button style="border-left:3px solid ${v.color}">${v.label}</button>`); b.onclick = () => addComp(k); pal.append(b); }
    w.append(pal, el('<div class="b-sec">СПИСОК</div>'));
    const list = el('<div class="b-list"></div>');
    for (const c of design.compartments) {
      const b = el(`<button class="b-item ${sel?.kind === 'comp' && sel.id === c.id ? 'on' : ''}"><i style="background:${COMP_KINDS[c.kind]?.color}"></i>${c.name}<small>${c.parent === 'turret' ? 'башня' : 'корпус'}</small></button>`);
      b.onclick = () => select({ kind: 'comp', id: c.id }); list.append(b);
    }
    w.append(list);
    if (sel?.kind === 'comp') {
      const c = findItem(sel);
      if (c) {
        const insp = el(`<div class="b-insp"><div class="b-sec">ВЫБРАННЫЙ ОТСЕК</div>
          <label class="b-field"><span>Название</span><input id="iName" value="${c.name}"></label>
          <label class="b-field"><span>Находится в</span><select id="iPar"><option value="hull" ${c.parent === 'hull' ? 'selected' : ''}>Корпус</option><option value="turret" ${c.parent === 'turret' ? 'selected' : ''}>Башня</option></select></label>
          ${c.kind === 'ammo' ? `<label class="b-field b-check"><input id="iArm" type="checkbox" ${c.armored ? 'checked' : ''}><span>Бронированный отсек (вышибные панели/двери)</span></label>` : ''}
          <div id="iXYZ"></div><div class="b-actions"><button id="iDup">Дублировать</button><button id="iDel">Удалить</button></div></div>`);
        insp.querySelector('#iName').addEventListener('input', e => { c.name = e.target.value; }); insp.querySelector('#iName').addEventListener('change', () => { commit(); renderTab(); });
        insp.querySelector('#iPar').addEventListener('change', e => { c.parent = e.target.value; commit(); rebuild(); renderTab(); });
        insp.querySelector('#iArm')?.addEventListener('change', e => { c.armored = e.target.checked; commit(); refreshStats(); });
        insp.querySelector('#iDup').onclick = duplicateSel; insp.querySelector('#iDel').onclick = deleteSel;
        insp.querySelector('#iXYZ').append(numFields([['X', c, 'pos', 0], ['Y', c, 'pos', 1], ['Z', c, 'pos', 2], ['Ш', c, 'size', 0], ['В', c, 'size', 1], ['Д', c, 'size', 2]], true));
        w.append(insp);
      }
    }
    w.append(el('<div class="b-note">Отсеки определяют, что именно заденет снаряд после пробития: попал в двигатель — теряешь ход, в боекомплект — риск детонации, в экипаж — гибнет расчёт.</div>'));
    return w;
  }
  function addComp(kind) {
    const info = COMP_KINDS[kind], parent = (kind === 'breech' || kind === 'crew') ? 'turret' : 'hull';
    const c = { id: uid('c'), kind, name: info.label, parent, pos: [0, parent === 'turret' ? .4 : .9, 0], size: kind === 'crew' ? [.55, .7, .55] : [.8, .6, .8], armored: kind === 'ammo' ? true : undefined };
    design.compartments.push(c); commit(); rebuild(); select({ kind: 'comp', id: c.id });
  }

  // детали
  function partsPanel() {
    const w = document.createElement('div');
    w.append(el('<div class="b-sec">ДОБАВИТЬ ДЕТАЛЬ</div>'));
    w.append(el(`<label class="b-field"><span>Установить на</span><select id="pPar"><option value="turret" ${partParent === 'turret' ? 'selected' : ''}>Башня</option><option value="hull" ${partParent === 'hull' ? 'selected' : ''}>Корпус</option><option value="gun" ${partParent === 'gun' ? 'selected' : ''}>Орудие</option></select></label>`));
    w.querySelector('#pPar').addEventListener('change', e => { partParent = e.target.value; });
    const pal = el('<div class="b-pal"></div>');
    for (const [k, v] of Object.entries(PART_TYPES)) { const b = el(`<button>${v.label}</button>`); b.onclick = () => addPart(k); pal.append(b); }
    w.append(pal, el('<div class="b-sec">ДЕТАЛИ</div>'));
    const list = el('<div class="b-list"></div>');
    for (const p of design.parts) {
      const b = el(`<button class="b-item ${sel?.kind === 'part' && sel.id === p.id ? 'on' : ''}">${PART_TYPES[p.type]?.label || p.type}${p.mirror ? ' ⇋' : ''}<small>${({ hull: 'корпус', turret: 'башня', gun: 'орудие' })[p.parent]}</small></button>`);
      b.onclick = () => select({ kind: 'part', id: p.id }); list.append(b);
    }
    if (!design.parts.length) list.append(el('<div class="b-note">Деталей пока нет. Добавь люк, ящик, броневую плиту, ДЗ или антенну.</div>'));
    w.append(list);
    if (sel?.kind === 'part') {
      const p = findItem(sel);
      if (p) {
        const insp = el(`<div class="b-insp"><div class="b-sec">ВЫБРАННАЯ ДЕТАЛЬ</div>
          <label class="b-field"><span>Материал</span><select id="iMat">${Object.entries(PART_MATS).map(([k, n]) => `<option value="${k}" ${p.mat === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="b-field"><span>Свой цвет</span><span class="b-colorrow"><input id="iColOn" type="checkbox" ${p.color ? 'checked' : ''}><input id="iCol" type="color" value="${p.color || '#6a7a58'}"></span></label>
          <label class="b-field"><span>Установлена на</span><select id="iPar"><option value="turret" ${p.parent === 'turret' ? 'selected' : ''}>Башня</option><option value="hull" ${p.parent === 'hull' ? 'selected' : ''}>Корпус</option><option value="gun" ${p.parent === 'gun' ? 'selected' : ''}>Орудие</option></select></label>
          <label class="b-field b-check"><input id="iMir" type="checkbox" ${p.mirror ? 'checked' : ''}><span>Симметрия (зеркальная копия по X)</span></label>
          <div id="iXYZ"></div><div class="b-actions"><button id="iDup">Дублировать</button><button id="iDel">Удалить</button></div></div>`);
        const upd = () => { commit(); rebuild(); };
        insp.querySelector('#iMat').addEventListener('change', e => { p.mat = e.target.value; upd(); });
        insp.querySelector('#iColOn').addEventListener('change', e => { p.color = e.target.checked ? insp.querySelector('#iCol').value : null; upd(); });
        insp.querySelector('#iCol').addEventListener('change', e => { if (insp.querySelector('#iColOn').checked) { p.color = e.target.value; upd(); } });
        insp.querySelector('#iPar').addEventListener('change', e => { p.parent = e.target.value; upd(); renderTab(); });
        insp.querySelector('#iMir').addEventListener('change', e => { p.mirror = e.target.checked; upd(); });
        insp.querySelector('#iDup').onclick = duplicateSel; insp.querySelector('#iDel').onclick = deleteSel;
        insp.querySelector('#iXYZ').append(numFields([['X', p, 'pos', 0], ['Y', p, 'pos', 1], ['Z', p, 'pos', 2], ['Наклон X°', p, 'rot', 0, 57.2958], ['Поворот Y°', p, 'rot', 1, 57.2958], ['Крен Z°', p, 'rot', 2, 57.2958], ['Размер X', p, 'size', 0], ['Размер Y', p, 'size', 1], ['Размер Z', p, 'size', 2]], false));
        w.append(insp);
      }
    }
    return w;
  }
  function addPart(type) {
    const t = PART_TYPES[type], par = partParent;
    const pos = par === 'hull' ? [0, topAt(design.hull.profile, 0) + t.size[1] / 2, 0] : par === 'turret' ? [0, topAt(design.turret.profile, 0) + t.size[1] / 2, 0] : [0, 0, -1.6];
    const p = { id: uid('p'), type, parent: par, pos, rot: [0, 0, 0], size: [...t.size], mat: t.mat, color: null, mirror: false };
    design.parts.push(p); commit(); rebuild(); select({ kind: 'part', id: p.id });
  }
  // числовые поля положения/размера (для точной подстройки)
  function numFields(defs, rebuildOnChange) {
    const g = el('<div class="b-grid"></div>');
    for (const [lab, obj, key, idx, mul = 1] of defs) {
      const f = el(`<label><span>${lab}</span><input type="number" step="${mul === 1 ? .05 : 1}" value="${fmt(obj[key][idx] * mul, mul === 1 ? 2 : 0)}"></label>`);
      f.querySelector('input').dataset.k = key + idx;
      f.querySelector('input').addEventListener('change', e => { const v = parseFloat(e.target.value); if (!isFinite(v)) return; obj[key][idx] = key === 'size' ? Math.max(.02, v / mul) : v / mul; commit(); rebuild(); });
      g.append(f);
    }
    return g;
  }
  function refreshInspector(liveOnly) {
    const it = sel && findItem(sel); if (!it) return;
    document.querySelectorAll('#bBody .b-grid input').forEach(i => { const k = i.dataset.k; if (!k) return; const key = k.slice(0, -1), idx = +k.slice(-1); const mul = key === 'rot' ? 57.2958 : 1; if (document.activeElement !== i) i.value = fmt(it[key][idx] * mul, mul === 1 ? 2 : 0); });
  }
  function duplicateSel() {
    if (!sel) return; const it = findItem(sel); if (!it) return;
    const c = JSON.parse(JSON.stringify(it)); c.id = uid(sel.kind === 'part' ? 'p' : 'c'); c.pos[2] += .3; c.pos[0] += (c.pos[0] === 0 ? .3 : 0);
    (sel.kind === 'part' ? design.parts : design.compartments).push(c); commit(); rebuild(); select({ kind: sel.kind, id: c.id });
  }
  function deleteSel() {
    if (!sel) return; const arr = sel.kind === 'part' ? design.parts : design.compartments, i = arr.findIndex(x => x.id === sel.id); if (i < 0) return;
    arr.splice(i, 1); sel = null; commit(); rebuild(); renderTab();
  }

  // ───────────────────────── редактор профиля ─────────────────────────
  function profileEditor(which) {
    const W = 312, Hh = 176, SC = 29, GY = Hh - 26, dpr = Math.min(2, devicePixelRatio || 1);
    const wrap = el(`<div class="b-prof"><canvas></canvas><div class="b-profinfo"></div><canvas class="b-plan"></canvas></div>`);
    const cv = wrap.querySelector('canvas'), info = wrap.querySelector('.b-profinfo'), plan = wrap.querySelector('.b-plan');
    cv.width = W * dpr; cv.height = Hh * dpr; cv.style.width = W + 'px'; cv.style.height = Hh + 'px';
    plan.width = W * dpr; plan.height = 80 * dpr; plan.style.width = W + 'px'; plan.style.height = '80px';
    const ctx = cv.getContext('2d'), pctx = plan.getContext('2d'); ctx.scale(dpr, dpr); pctx.scale(dpr, dpr);
    const other = which === 'hull' ? 'turret' : 'hull';
    const off = (wh) => wh === 'turret' ? [design.turret.ringZ, design.turret.ringY] : [0, 0];
    const toS = (wh, p) => { const [oz, oy] = off(wh); return [W / 2 - (p[0] + oz) * SC, GY - (p[1] + oy) * SC]; };
    const toW = (sx, sy) => { const [oz, oy] = off(which); return [(W / 2 - sx) / SC - oz, (GY - sy) / SC - oy]; };
    const snap = (v, free) => free ? Math.round(v * 100) / 100 : Math.round(v / .05) * .05;
    let selV = -1;
    function draw() {
      ctx.clearRect(0, 0, W, Hh); ctx.fillStyle = '#0d1510'; ctx.fillRect(0, 0, W, Hh);
      ctx.strokeStyle = '#1f2f24'; ctx.lineWidth = 1;
      for (let z = -5; z <= 5; z += .5) { const x = W / 2 - z * SC; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, Hh); ctx.strokeStyle = z % 1 === 0 ? '#243629' : '#182419'; ctx.stroke(); }
      for (let y = 0; y <= 3.2; y += .5) { const yy = GY - y * SC; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.strokeStyle = y % 1 === 0 ? '#243629' : '#182419'; ctx.stroke(); }
      ctx.strokeStyle = '#5c7a62'; ctx.beginPath(); ctx.moveTo(0, GY); ctx.lineTo(W, GY); ctx.stroke();
      // колёса
      const R = design.running, zs = (design.hull.profile.reduce((a, p) => Math.min(a, p[0]), 9) + design.hull.profile.reduce((a, p) => Math.max(a, p[0]), -9)) / 2 + R.offsetZ;
      ctx.strokeStyle = '#3a4d3f'; for (let i = 0; i < R.wheels; i++) { const z = zs - R.trackLen / 2 + .97 + (R.trackLen - 1.94) * i / Math.max(1, R.wheels - 1), sx = W / 2 - z * SC; ctx.beginPath(); ctx.arc(sx, GY - (R.wheelRadius + .01) * SC, R.wheelRadius * SC, 0, 6.283); ctx.stroke(); }
      // второй корпус бледно
      const op = design[other].profile; ctx.strokeStyle = '#3d5a45'; ctx.fillStyle = 'rgba(80,110,90,.12)'; ctx.beginPath(); op.forEach((p, i) => { const [x, y] = toS(other, p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill(); ctx.stroke();
      const pts = design[which].profile, ok = polyIsSimple(pts);
      ctx.strokeStyle = ok ? '#b7d87b' : '#ed785e'; ctx.fillStyle = ok ? 'rgba(183,216,123,.16)' : 'rgba(237,120,94,.2)'; ctx.lineWidth = 2; ctx.beginPath();
      pts.forEach((p, i) => { const [x, y] = toS(which, p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill(); ctx.stroke();
      pts.forEach((p, i) => { const [x, y] = toS(which, p); ctx.fillStyle = i === selV ? '#fff3c4' : '#e2f2c0'; ctx.strokeStyle = '#1a2a1e'; ctx.beginPath(); ctx.arc(x, y, i === selV ? 6 : 4.5, 0, 6.283); ctx.fill(); ctx.stroke(); });
      ctx.fillStyle = '#7f9a85'; ctx.font = '10px system-ui'; ctx.fillText('◀ корма', 6, 12); ctx.textAlign = 'right'; ctx.fillText('нос ▶', W - 6, 12); ctx.textAlign = 'left';
      const zsv = pts.map(p => p[0]), ysv = pts.map(p => p[1]);
      info.textContent = ok ? `Длина ${fmt(Math.max(...zsv) - Math.min(...zsv))} м · высота ${fmt(Math.max(...ysv) - Math.min(...ysv))} м · вершин ${pts.length}` + (selV >= 0 ? ` · [${fmt(pts[selV][0])}; ${fmt(pts[selV][1])}]` : '') : 'Контур самопересекается — исправь вершину';
      info.style.color = ok ? '' : '#ed785e';
      // вид сверху
      pctx.clearRect(0, 0, W, 80); pctx.fillStyle = '#0d1510'; pctx.fillRect(0, 0, W, 80);
      const d = design[which], wp = taperWarp(d.profile, d.noseTaper, d.rearTaper, d.slope, which === 'hull' ? 1.6 : 1.4, which === 'hull' ? 1 : .8);
      const b0 = Math.min(...zsv), b1 = Math.max(...zsv), left = [], right = [];
      for (let k = 0; k <= 40; k++) { const z = b0 + (b1 - b0) * k / 40, hx = wp(d.halfWidth, (Math.min(...ysv) + Math.max(...ysv)) / 2, z)[0], sx = W / 2 - (z + off(which)[0]) * SC; left.push([sx, 40 - hx * SC * .8]); right.push([sx, 40 + hx * SC * .8]); }
      pctx.fillStyle = 'rgba(183,216,123,.18)'; pctx.strokeStyle = '#b7d87b'; pctx.lineWidth = 1.5; pctx.beginPath(); left.forEach((p, i) => i ? pctx.lineTo(...p) : pctx.moveTo(...p)); right.reverse().forEach(p => pctx.lineTo(...p)); pctx.closePath(); pctx.fill(); pctx.stroke();
      pctx.fillStyle = '#7f9a85'; pctx.font = '10px system-ui'; pctx.fillText('вид сверху · ширина ' + fmt(d.halfWidth * 2) + ' м', 6, 12);
    }
    profRedraw = draw; draw();
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const nearV = (x, y) => { const pts = design[which].profile; let best = -1, bd = 11; pts.forEach((p, i) => { const [sx, sy] = toS(which, p), dd = Math.hypot(sx - x, sy - y); if (dd < bd) { bd = dd; best = i; } }); return best; };
    const nearEdge = (x, y) => { const pts = design[which].profile; for (let i = 0; i < pts.length; i++) { const a = toS(which, pts[i]), b = toS(which, pts[(i + 1) % pts.length]), dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l2, .05, .95), px = a[0] + dx * t, py = a[1] + dy * t; if (Math.hypot(px - x, py - y) < 8) return { i, px, py }; } return null; };
    cv.addEventListener('pointerdown', e => { const [x, y] = pos(e); if (e.button !== 0) return; const v = nearV(x, y); if (v >= 0) { selV = v; profDrag = v; cv.setPointerCapture(e.pointerId); draw(); } });
    cv.addEventListener('pointermove', e => {
      if (profDrag === null) return; const [x, y] = pos(e), w = toW(x, y), pts = design[which].profile, old = pts[profDrag].slice();
      pts[profDrag] = [snap(clamp(w[0], -6, 6), e.shiftKey), snap(clamp(w[1], which === 'hull' ? .05 : -.3, 3), e.shiftKey)];
      if (!polyIsSimple(pts)) { pts[profDrag] = old; } draw(); queueRebuild(); refreshStats();
    });
    const end = () => { if (profDrag !== null) { profDrag = null; commit(); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('dblclick', e => { const [x, y] = pos(e); if (nearV(x, y) >= 0) return; const ed = nearEdge(x, y); if (!ed) return; const w = toW(ed.px, ed.py); design[which].profile.splice(ed.i + 1, 0, [snap(w[0]), snap(w[1])]); selV = ed.i + 1; commit(); draw(); queueRebuild(); });
    cv.addEventListener('contextmenu', e => { e.preventDefault(); const [x, y] = pos(e), v = nearV(x, y); const pts = design[which].profile; if (v >= 0 && pts.length > 4) { const c = pts.slice(); c.splice(v, 1); if (polyIsSimple(c)) { pts.splice(v, 1); selV = -1; commit(); draw(); queueRebuild(); } else notify('Нельзя удалить: контур станет самопересекающимся'); } });
    return wrap;
  }

  // ───────────────────────── характеристики ─────────────────────────
  function refreshStats() {
    const s = computeStats(design), box = $('#bStats'); if (!box) return;
    const bar = (label, v, total, c) => `<div class="b-bar"><span>${label}</span><i><b style="width:${clamp(v / total * 100, 1, 100)}%;background:${c}"></b></i><em>${fmt(v, 1)}</em></div>`;
    const row = (a, b, warn) => `<div class="b-stat${warn ? ' warn' : ''}"><span>${a}</span><b>${b}</b></div>`;
    const a = design.hull.armor, t = design.turret.armor;
    box.innerHTML =
      row('Масса', fmt(s.mass, 1) + ' т', s.mass > 90) + row('Мощность / удельная', `${s.power} л.с. · ${fmt(s.pw, 1)} л.с./т`) + row('Макс. скорость', Math.round(s.speedKmh) + ' км/ч') +
      row('Давление на грунт', fmt(s.pressure, 2) + ' кг/см²', s.pressure > 1.3) + row('Габариты Д×Ш×В', `${fmt(s.length, 1)} × ${fmt(s.width, 1)} × ${fmt(s.height, 1)} м`) +
      row('Орудие', `${s.caliber} мм · L/${Math.round(design.gun.length * 1000 / s.caliber)}`) + row('Бронепробитие (БПС)', s.pen + ' мм') + row('Перезарядка', fmt(s.reload, 1) + ' с' + (design.gun.autoloader ? ' · автомат' : '')) +
      row('Боекомплект / экипаж', `${s.ammo} выстр. · ${s.crew} чел.`) + row('Лоб корпуса / башни', `${a.F} / ${t.F} мм`) + row('Борт корпуса / башни', `${a.S} / ${t.S} мм`) +
      `<div class="b-sec">РАСПРЕДЕЛЕНИЕ МАССЫ, т</div>` + bar('Корпус', s.hullMass, s.mass, '#8fb36a') + bar('Башня', s.turMass, s.mass, '#b7d87b') + bar('Орудие', s.gunMass, s.mass, '#d98a6a') + bar('Ходовая', s.runMass, s.mass, '#7ea0c2') + bar('Двигатель', s.engMass, s.mass, '#c27ae0') + bar('Прочее', s.mass - s.hullMass - s.turMass - s.gunMass - s.runMass - s.engMass, s.mass, '#e0b25a') +
      `<div class="b-verdict ${s.valid ? 'ok' : 'bad'}">${s.valid ? '✔ Машина готова к бою<br><small>' + s.label + '</small>' : '✖ ' + s.issues.join('<br>✖ ')}</div>`;
    $('#bUse').disabled = !s.valid;
  }

  // ───────────────────────── библиотека проектов ─────────────────────────
  const readLib = () => { try { return JSON.parse(safe.get(LS_LIB) || '{}'); } catch { return {}; } };
  function refreshLib() { const l = readLib(), sel = $('#bLib'); sel.innerHTML = '<option value="">Мои проекты…</option>' + Object.keys(l).map(k => `<option>${k}</option>`).join(''); }
  function saveToLib() { const l = readLib(); const n = (design.name || 'Моя машина').trim() || 'Моя машина'; l[n] = design; if (safe.set(LS_LIB, JSON.stringify(l))) { notify('Сохранено: ' + n); refreshLib(); $('#bLib').value = n; } else notify('Не удалось сохранить на этом устройстве'); }
  function loadFromLib() { const n = $('#bLib').value; if (!n) return; const d = readLib()[n]; if (!d) return; design = normalizeDesign(d); $('#bName').value = design.name; sel = null; commit(); rebuild(); renderTab(); notify('Загружено: ' + n); }
  function delFromLib() { const n = $('#bLib').value; if (!n) return; const l = readLib(); delete l[n]; safe.set(LS_LIB, JSON.stringify(l)); refreshLib(); notify('Удалено: ' + n); }

  function useInBattle() {
    const s = computeStats(design); if (!s.valid) { notify('Машина не готова: ' + s.issues[0]); return; }
    safe.set(LS_CUR, JSON.stringify(design));
    const d = JSON.parse(JSON.stringify(design)); close(); onUse(customFactory(d), d.name);
  }

  // ───────────────────────── жизненный цикл ─────────────────────────
  function ensureInit() {
    if (inited) return; inited = true;
    loadInitial(); buildShell(); initScene();
  }
  function open() {
    ensureInit(); isOpen = true; onOpen?.();
    root.classList.add('show'); orbit.enabled = true; tc.enabled = true;
    $('#bName').value = design.name; setHelpersVisible();
    rebuild(); renderTab(); refreshStats(); updateUndoButtons(); setMode('translate');
    notify('Мастерская: выбирай вкладки слева, смотри характеристики справа');
  }
  function close() {
    if (!isOpen) return; isOpen = false; root.classList.remove('show'); tc.detach(); orbit.enabled = false; tc.enabled = false;
    safe.set(LS_CUR, JSON.stringify(design)); onClose?.();
  }
  let lastW = 0, lastH = 0;
  function frame(dt) {
    if (!isOpen) return;
    if (innerWidth !== lastW || innerHeight !== lastH) { lastW = innerWidth; lastH = innerHeight; camera.aspect = lastW / lastH; camera.updateProjectionMatrix(); }
    orbit.update();
    if (playTrack && model) model.update(dt, 4, 4);
    renderer.render(scene, camera);
  }
  return { open, close, frame, get isOpen() { return isOpen; } };
}
