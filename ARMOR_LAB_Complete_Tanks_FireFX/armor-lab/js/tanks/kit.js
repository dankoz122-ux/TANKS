// ARMOR LAB — общий набор для сборки моделей танков.
// Все размеры в метрах (реальные габариты). Корень модели масштабируется на UNIT, чтобы вписаться в игровой мир.
// Ось −Z — нос, +Y — вверх, +X — правый борт. Геометрия собирается собственными примитивами
// (плоские нормали, граненая броня) и склеивается по материалам: десятки деталей = несколько draw call'ов.

export const UNIT = 0.62;

// ───────────────────────── математика ─────────────────────────
function eulerMat(rx, ry, rz) {
  // порядок XYZ, как в THREE.Euler по умолчанию: R = Rx * Ry * Rz
  const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [
    c * e, -c * f, d,
    af + be * d, ae - bf * d, -b * c,
    bf - ae * d, be + af * d, a * c
  ];
}
function xform(p, m, s, t) {
  const x = p[0] * s[0], y = p[1] * s[1], z = p[2] * s[2];
  return [m[0] * x + m[1] * y + m[2] * z + t[0], m[3] * x + m[4] * y + m[5] * z + t[1], m[6] * x + m[7] * y + m[8] * z + t[2]];
}
function mulPoly(arr) { return arr; }

// ───────────────────────── «сырые» меши: массивы треугольников ─────────────────────────
// raw = {pos:[x,y,z,...]} — каждые 9 чисел один треугольник (без индексов)
function rawBox(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2, p = [];
  const quad = (a, b, c, e) => p.push(...a, ...b, ...c, ...a, ...c, ...e);
  quad([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]);       // +Z
  quad([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]);   // -Z
  quad([x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]);       // +X
  quad([-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]);   // -X
  quad([-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]);       // +Y
  quad([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]);   // -Y
  return p;
}
// усечённый конус вдоль оси Y (rt — верх, rb — низ), n граней, flat — плоские грани
function rawCyl(rt, rb, h, n = 12, caps = true) {
  const p = [], y0 = -h / 2, y1 = h / 2;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    const b0 = [Math.cos(a0) * rb, y0, Math.sin(a0) * rb], b1 = [Math.cos(a1) * rb, y0, Math.sin(a1) * rb];
    const t0 = [Math.cos(a0) * rt, y1, Math.sin(a0) * rt], t1 = [Math.cos(a1) * rt, y1, Math.sin(a1) * rt];
    p.push(...b0, ...t0, ...b1, ...b1, ...t0, ...t1);
    if (caps) {
      if (rt > 0) p.push(...t0, 0, y1, 0, ...t1);
      if (rb > 0) p.push(...b1, 0, y0, 0, ...b0);
    }
  }
  return p;
}
// триангуляция простого полигона (ear clipping), pts: [[u,v],...] → индексы треугольников
function earClip(pts) {
  const n = pts.length, idx = [...Array(n).keys()];
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) idx.reverse();
  const out = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      if (cross(a, b, c) <= 1e-9) continue;
      let ok = true;
      for (const j of idx) { if (j === ia || j === ib || j === ic) continue; if (inTri(pts[j], a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push(ia, ib, ic); idx.splice(i, 1); clipped = true; break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}
// призма: полигон в плоскости (z,y), выдавлен по X от −hw до +hw. warp(x,y,z)→[x,y,z] — деформация (плановая сужка, наклон бортов).
// Намотка граней задана аналитически (наружу для любого простого полигона, в том числе вогнутого).
function rawPrism(zy, hw, warp) {
  const p = [], n = zy.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = zy[i], b = zy[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const pts = area < 0 ? zy.slice().reverse() : zy;           // CCW в осях (z,y)
  const tri = earClip(pts);
  const V = (i, x) => [x, pts[i][1], pts[i][0]];
  for (let k = 0; k < tri.length; k += 3) {
    const a = tri[k], b = tri[k + 1], c = tri[k + 2];
    p.push(...V(a, hw), ...V(c, hw), ...V(b, hw));            // +X
    p.push(...V(a, -hw), ...V(b, -hw), ...V(c, -hw));         // −X
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    p.push(...V(i, -hw), ...V(i, hw), ...V(j, hw), ...V(i, -hw), ...V(j, hw), ...V(j, -hw));
  }
  if (warp) for (let i = 0; i < p.length; i += 3) { const q = warp(p[i], p[i + 1], p[i + 2]); p[i] = q[0]; p[i + 1] = q[1]; p[i + 2] = q[2]; }
  return p;
}
// сечения вдоль Z: sections=[{z, pts:[[x,y],…]}] — одинаковое число точек; торцы закрываются веером
function rawLoft(sections) {
  const p = [], n = sections[0].pts.length;
  const V = (s, i) => [sections[s].pts[i][0], sections[s].pts[i][1], sections[s].z];
  for (let s = 0; s < sections.length - 1; s++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    p.push(...V(s, i), ...V(s + 1, i), ...V(s + 1, j), ...V(s, i), ...V(s + 1, j), ...V(s, j));
  }
  for (const s of [0, sections.length - 1]) for (let i = 1; i < n - 1; i++) p.push(...V(s, 0), ...V(s, i), ...V(s, i + 1));
  return flipOutward(p);
}
// ориентирует треугольники наружу относительно центра масс (для выпуклых/почти выпуклых тел)
function flipOutward(p) {
  let cx = 0, cy = 0, cz = 0; const n = p.length / 3;
  for (let i = 0; i < p.length; i += 3) { cx += p[i]; cy += p[i + 1]; cz += p[i + 2]; }
  cx /= n; cy /= n; cz /= n;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const mx = (p[i] + p[i + 3] + p[i + 6]) / 3 - cx, my = (p[i + 1] + p[i + 4] + p[i + 7]) / 3 - cy, mz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3 - cz;
    if (nx * mx + ny * my + nz * mz < 0) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
  }
  return p;
}
// сечение-эллипс (для литых башен); flatBottom — срез снизу
export function ellipse(cx, cy, rx, ry, n = 14, cutBottom = 0.0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    let y = cy + Math.sin(a) * ry; if (cutBottom && y < cy - ry * (1 - cutBottom)) y = cy - ry * (1 - cutBottom);
    pts.push([cx + Math.cos(a) * rx, y]);
  }
  return pts;
}
// сечение-«восьмигранник» башни: низ, плечи, крыша
export function octa(wBot, wShoulder, wTop, yBot, yShoulder, yTop) {
  return [[-wBot, yBot], [wBot, yBot], [wShoulder, yShoulder], [wTop, yTop], [-wTop, yTop], [-wShoulder, yShoulder]];
}

// ───────────────────────── камуфляж (процедурная текстура) ─────────────────────────
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const texCache = new Map();
export function camoTexture(T, key, base, colors, seed = 1, grime = true) {
  if (typeof document === 'undefined') return null;
  if (texCache.has(key)) return texCache.get(key);
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (const col of colors) {
    g.fillStyle = col.c;
    for (let k = 0; k < col.n; k++) {
      const bx = R() * S, by = R() * S, r = col.r * (.55 + R() * .9), pts = [];
      const m = 9, ph = R() * 6.28;
      for (let i = 0; i < m; i++) { const a = i / m * 6.28, rr = r * (.55 + .6 * R()) * (col.stretch && i % 2 ? col.stretch : 1); pts.push([bx + Math.cos(a + ph) * rr, by + Math.sin(a + ph) * rr * (col.flat || 1)]); }
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.beginPath();
        for (let i = 0; i < m; i++) {
          const p0 = pts[i], p1 = pts[(i + 1) % m], mx = (p0[0] + p1[0]) / 2 + ox, my = (p0[1] + p1[1]) / 2 + oy;
          if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(p0[0] + ox, p0[1] + oy, mx, my);
        }
        g.closePath(); g.fill();
      }
    }
  }
  if (grime) {
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${R() < .5 ? '20,16,10' : '230,220,190'},${(.03 + R() * .06).toFixed(3)})`; g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2); }
  }
  const tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

// ───────────────────────── аккумулятор геометрии ─────────────────────────
export function createKit(T, palette) {
  // материалы: palette = {hull,turret,armor,era,track,wheel,metal,barrel,dark,optic,rubber,cloth,cargo,glass}
  const mk = (color, rough = .9, metal = .06, map = null) => { const m = new T.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); if (map) { m.map = map; } return m; };
  const mats = {};
  const P = palette;
  mats.hull = mk(P.hull, .9, .05, P.camo || null);
  mats.turret = mk(P.turret || P.hull, .88, .05, P.camo || null);
  mats.armor = mk(P.armor || P.hull, .9, .05, P.camo || null);
  mats.era = mk(P.era || '#4b5a41', .92, .04);
  mats.track = mk(P.track || '#262620', .98, .2);
  mats.wheel = mk(P.wheel || '#2b2b27', .95, .05);
  mats.metal = mk(P.metal || '#8a8a7e', .5, .45);
  mats.barrel = mk(P.barrel || P.hull, .7, .25);
  mats.dark = mk(P.dark || '#222622', .8, .1);
  mats.optic = mk(P.optic || '#27423f', .25, .35);
  mats.cloth = mk(P.cloth || '#5a5a45', 1, 0);
  mats.cargo = mk(P.cargo || '#6a5f48', .95, .05);
  mats.rubber = mk('#171917', 1, 0);
  mats.sleeve = mk(P.sleeve || '#3c403a', .85, .12);
  const uvScale = .28;
  function autoUV(pos, uv) {
    for (let i = 0; i < pos.length; i += 9) {
      const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
      const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
      const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx);
      for (let k = 0; k < 3; k++) {
        const x = pos[i + k * 3], y = pos[i + k * 3 + 1], z = pos[i + k * 3 + 2];
        let u, v;
        if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
        uv.push(u * uvScale, v * uvScale);
      }
    }
  }
  function flatNormals(pos) {
    const n = new Array(pos.length);
    for (let i = 0; i < pos.length; i += 9) {
      const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
      const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) { n[i + k * 3] = nx; n[i + k * 3 + 1] = ny; n[i + k * 3 + 2] = nz; }
    }
    return n;
  }
  function toGeometry(pos) {
    const g = new T.BufferGeometry(), uv = [];
    autoUV(pos, uv);
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(flatNormals(pos), 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    return g;
  }

  function acc() {
    const buckets = {}; // matKey → number[]
    const put = (raw, key, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) => {
      const m = eulerMat(rot[0], rot[1], rot[2]), out = buckets[key] || (buckets[key] = []);
      for (let i = 0; i < raw.length; i += 3) { const q = xform([raw[i], raw[i + 1], raw[i + 2]], m, scl, pos); out.push(q[0], q[1], q[2]); }
      // отражение (отрицательный масштаб) переворачивает обход — исправим
      if (scl[0] * scl[1] * scl[2] < 0) { const s = out.length - raw.length; for (let i = s; i < out.length; i += 9) for (let k = 0; k < 3; k++) { const t = out[i + 3 + k]; out[i + 3 + k] = out[i + 6 + k]; out[i + 6 + k] = t; } }
    };
    const api = {
      box(w, h, d, key, pos, rot, scl) { put(rawBox(w, h, d), key, pos, rot, scl); return api; },
      cyl(rt, rb, h, key, pos, rot, n = 12, scl) { put(rawCyl(rt, rb, h, n), key, pos, rot, scl); return api; },
      // цилиндр вдоль Z (стволы, трубы) от z0 до z1
      // r0 — радиус на конце z0, r1 — на конце z1 (ось +Y цилиндра после поворота смотрит в +Z)
      tubeZ(r0, r1, z0, z1, key, x = 0, y = 0, n = 14) { const rHi = z0 > z1 ? r0 : r1, rLo = z0 > z1 ? r1 : r0; put(rawCyl(rHi, rLo, Math.abs(z1 - z0), n), key, [x, y, (z0 + z1) / 2], [Math.PI / 2, 0, 0]); return api; },
      // цилиндр вдоль X (катки, оси)
      tubeX(r0, r1, x0, x1, key, y = 0, z = 0, n = 14) { put(rawCyl(r1, r0, Math.abs(x1 - x0), n), key, [(x0 + x1) / 2, y, z], [0, 0, Math.PI / 2]); return api; },
      prism(zy, hw, key, warp, pos, rot) { put(rawPrism(zy, hw, warp), key, pos, rot); return api; },
      loft(sections, key, pos, rot, scl) { put(rawLoft(sections), key, pos, rot, scl); return api; },
      raw(raw, key, pos, rot, scl) { put(raw, key, pos, rot, scl); return api; },
      // симметричные пары по X
      pair(fn) { fn(1); fn(-1); return api; },
      build(parent, { cast = true, receive = true, name = '' } = {}) {
        const meshes = [];
        for (const key of Object.keys(buckets)) {
          const mesh = new T.Mesh(toGeometry(buckets[key]), mats[key]);
          mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.name = name + key;
          parent.add(mesh); meshes.push(mesh);
        }
        return meshes;
      }
    };
    return api;
  }

  // ───────────────────────── ходовая: гусеницы-звенья, катки, звёздочки ─────────────────────────
  // circles: [{z,y,r}] — контур гусеницы (выпуклая оболочка окружностей). Возвращает {update(dt,v), group}
  function hullOfCircles(circles, step = 18) {
    const pts = [];
    for (const c of circles) for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; pts.push([c.z + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r]); }
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop();
    return lo.concat(up); // против часовой в (z,y): нижняя ветка слева направо (−Z→+Z)
  }
  function resample(loop, step) {
    const n = loop.length, seg = [], cum = [0];
    for (let i = 0; i < n; i++) { const a = loop[i], b = loop[(i + 1) % n]; seg.push(Math.hypot(b[0] - a[0], b[1] - a[1])); cum.push(cum[i] + seg[i]); }
    const L = cum[n], count = Math.max(8, Math.round(L / step)), table = [], M = 720;
    for (let k = 0; k < M; k++) {
      const s = k / M * L; let i = 0; while (i < n - 1 && cum[i + 1] <= s) i++;
      const a = loop[i], b = loop[(i + 1) % n], t = (s - cum[i]) / (seg[i] || 1);
      const dz = (b[0] - a[0]) / (seg[i] || 1), dy = (b[1] - a[1]) / (seg[i] || 1);
      table.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(-dy, dz)]);
    }
    return { L, count, table };
  }
  function tracks(parent, o) {
    // o: {x, width, circles, thick, pitch}; создаёт InstancedMesh для каждого борта
    const sides = [];
    const linkRaw = [];
    const thick = o.thick || .07, w = o.width;
    const part = (raw, pos) => { for (let i = 0; i < raw.length; i += 3) linkRaw.push(raw[i] + pos[0], raw[i + 1] + pos[1], raw[i + 2] + pos[2]); };
    const loop0 = hullOfCircles(o.circles), rs0 = resample(loop0, o.pitch || .17), pitch = rs0.L / rs0.count;
    part(rawBox(w, thick * .5, pitch * .94), [0, 0, 0]);
    part(rawBox(w * .92, thick * .45, pitch * .3), [0, -thick * .45, -pitch * .15]);
    part(rawBox(w * .14, thick * 1.1, pitch * .46), [0, thick * .55, 0]);
    const geo = toGeometry(linkRaw);
    for (const side of [-1, 1]) {
      const inst = new T.InstancedMesh(geo, mats.track, rs0.count);
      inst.castShadow = true; inst.receiveShadow = true; inst.frustumCulled = false; inst.name = 'track-links';
      inst.userData.trackSide = side;
      parent.add(inst);
      sides.push({ inst, side, off: 0 });
    }
    const dummyM = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), pv = new T.Vector3(), sv = new T.Vector3(1, 1, 1);
    const M = rs0.table.length;
    function layoutSide(sd) {
      const s = sd.off;
      for (let k = 0; k < rs0.count; k++) {
        const f = ((((s / rs0.L) + k / rs0.count) % 1) + 1) % 1 * M, i0 = Math.floor(f) % M, i1 = (i0 + 1) % M, t = f - Math.floor(f);
        const A = rs0.table[i0], B = rs0.table[i1];
        let da = B[2] - A[2]; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
        pv.set(o.x * sd.side, A[1] + (B[1] - A[1]) * t, A[0] + (B[0] - A[0]) * t);
        e.set(A[2] + da * t, 0, 0); q.setFromEuler(e);
        dummyM.compose(pv, q, sv); sd.inst.setMatrixAt(k, dummyM);
      }
      sd.inst.instanceMatrix.needsUpdate = true;
    }
    sides.forEach(layoutSide);
    return { sides, L: rs0.L, layoutSide, loop: loop0 };
  }

  // вращающиеся диски (катки, ленивец, звёздочка): один InstancedMesh на борт, геометрия единичного радиуса
  function spinners(parent, list, x, o = {}) {
    // list: [{z,y,r,w}] ; ось по X
    const raw = [], disc = rawCyl(1, 1, 1, 18), m = eulerMat(0, 0, Math.PI / 2);
    for (let i = 0; i < disc.length; i += 3) { const q = xform([disc[i], disc[i + 1], disc[i + 2]], m, [1, 1, 1], [0, 0, 0]); raw.push(q[0], q[1], q[2]); }
    for (let k = 0; k < 6; k++) {   // болты на ободе ступицы — по ним видно вращение
      const a = k / 6 * Math.PI * 2, b = rawBox(1.12, .24, .24);
      for (let i = 0; i < b.length; i += 3) raw.push(b[i], b[i + 1] + Math.cos(a) * .66, b[i + 2] + Math.sin(a) * .66);
    }
    const geo = toGeometry(raw), res = [];
    for (const side of [-1, 1]) {
      const inst = new T.InstancedMesh(geo, o.mat || mats.metal, list.length);
      inst.castShadow = true; inst.receiveShadow = true; inst.frustumCulled = false; inst.name = 'spinners';
      parent.add(inst); res.push({ inst, side, ang: list.map(() => 0) });
    }
    const dm = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), pv = new T.Vector3(), sv = new T.Vector3();
    function advance(sd, dist) {   // dist — путь борта (м); вперёд (−Z) → вращение по часовой
      for (let k = 0; k < list.length; k++) {
        const it = list[k]; sd.ang[k] -= dist / (it.r * 1.0);
        pv.set(x * sd.side, it.y, it.z); e.set(sd.ang[k], 0, 0); q.setFromEuler(e);
        sv.set(it.w, it.r, it.r); dm.compose(pv, q, sv); sd.inst.setMatrixAt(k, dm);
      }
      sd.inst.instanceMatrix.needsUpdate = true;
    }
    res.forEach(sd => advance(sd, 0));
    return { sides: res, advance };
  }

  return { mats, acc, tracks, spinners, hullOfCircles, toGeometry, T };
}

// универсальные части
export function makeMuzzle(T, gun, z) {
  const muzzle = new T.Object3D(); muzzle.position.set(0, 0, z); gun.add(muzzle);
  const glow = new T.Mesh(new T.SphereGeometry(.35, 8, 6), new T.MeshBasicMaterial({ color: '#ffb35c', transparent: true, opacity: 0, depthWrite: false }));
  glow.position.copy(muzzle.position); gun.add(glow);
  return { muzzle, muzzleGlow: glow };
}


// ───────────────────────── коллизионные меши по реальной форме корпуса/башни ─────────────────────────
// По нормали и положению каждого треугольника определяем тип плиты: F (лоб/скаты носа), S (борт), R (корма), roof (крыша/днище).
export function classifyPlates(pos, b) {
  const out = [], L = (b.zmax - b.zmin) || 1;
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
    const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const cz = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3, rel = (cz - b.zmin) / L;
    let k;
    if (Math.abs(nx) > .7) k = 'S';
    else if (ny < -.5) k = 'roof';
    else if (ny > .5) k = (ny > .55 && rel < .3) ? 'F' : 'roof';
    else k = nz < 0 ? 'F' : 'R';
    out.push(k);
  }
  return out;
}
export function bounds(zy) { let a = 1e9, b = -1e9; for (const p of zy) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); } return { zmin: a, zmax: b }; }
// spec: {kind:'prism', zy, hw, warp, zone, parent} | {kind:'box', size, pos, zone, parent, bounds}
export function collisionMesh(T, spec) {
  let raw, b;
  if (spec.kind === 'box') { raw = rawBox(...spec.size).slice(); for (let i = 0; i < raw.length; i += 3) { raw[i] += spec.pos[0]; raw[i + 1] += spec.pos[1]; raw[i + 2] += spec.pos[2]; } b = spec.bounds; }
  else { raw = rawPrism(spec.zy, spec.hw, spec.warp); b = bounds(spec.zy); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(raw, 3));
  const flat = []; for (let i = 0; i < raw.length; i += 9) { const ax = raw[i + 3] - raw[i], ay = raw[i + 4] - raw[i + 1], az = raw[i + 5] - raw[i + 2], bx = raw[i + 6] - raw[i], by = raw[i + 7] - raw[i + 1], bz = raw[i + 8] - raw[i + 2]; const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = Math.hypot(nx, ny, nz) || 1; for (let k = 0; k < 3; k++) flat.push(nx / l, ny / l, nz / l); }
  g.setAttribute('normal', new T.Float32BufferAttribute(flat, 3));
  return { geometry: g, plates: classifyPlates(raw, b) };
}

// ───────────────────────── сборка модели: коллайдеры, update, возвращаемый интерфейс ─────────────────────────
// o: {name, root, hull, turret, gun, barrelMesh, muzzleZ, trackData, spin, colliders, internals, armor, traits, dims}
export function finishModel(T, K, o) {
  const { root, hull, turret, gun } = o;
  const hitMat = new T.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, depthWrite: false });
  hitMat.visible = false;
  const hitMatDS = new T.MeshBasicMaterial({ color: '#000000', side: T.DoubleSide, transparent: true, opacity: 0, depthWrite: false });
  hitMatDS.visible = false;
  for (const c of o.collision || []) {
    const { geometry, plates } = collisionMesh(T, c);
    const m = new T.Mesh(geometry, hitMatDS);
    m.userData.zone = c.zone; m.userData.hitCollider = true; m.userData.plates = plates; m.name = 'collision-' + c.zone;
    (c.parent === 'turret' ? turret : hull).add(m);
  }
  for (const c of o.colliders || []) {
    const m = new T.Mesh(new T.BoxGeometry(c.size[0], c.size[1], c.size[2]), hitMat);
    m.position.set(c.pos[0], c.pos[1], c.pos[2]);
    m.userData.zone = c.zone; m.userData.hitCollider = true; m.userData.side = c.side || 0;
    (c.parent === 'turret' ? turret : hull).add(m);
  }
  // скрытые объёмы внутренних модулей — по ним игра считает, что именно задел снаряд после пробития
  const hitIn = new T.MeshBasicMaterial({ color: '#000000', side: T.DoubleSide });
  hitIn.visible = false;
  const internalMeshes = [];
  for (const it of o.internals || []) {
    const [cx, cy, cz, sx, sy, sz] = it.box;
    const m = new T.Mesh(new T.BoxGeometry(sx, sy, sz), hitIn);
    m.position.set(cx, cy, cz); m.visible = false;
    m.userData.internalHit = true; m.userData.moduleId = it.id; m.userData.module = it.module;
    (it.parent === 'turret' ? turret : hull).add(m); internalMeshes.push(m);
  }
  const { muzzle, muzzleGlow } = makeMuzzle(T, gun, o.muzzleZ);
  root.scale.setScalar(UNIT);
  const update = (dt, vl, vr) => {
    // vl / vr — линейная скорость бортов в игровых м/с → в метры модели
    const dl = vl * dt / UNIT, dr = vr * dt / UNIT;
    if (o.trackData) for (const sd of o.trackData.sides) { sd.off -= sd.side < 0 ? dl : dr; o.trackData.layoutSide(sd); }
    if (o.spin) for (const sd of o.spin.sides) o.spin.advance(sd, sd.side < 0 ? dl : dr);
  };
  return {
    name: o.name, root, turret, gun, hull, barrel: o.barrelMesh || null, muzzle, muzzleGlow,
    modules: { engine: [0, .9, 1.55], track: [1.48, .6, 0], ammo: [0, 1.55, .72], gun: [0, 1.7, -.8] },
    internals: o.internals || [], internalMeshes, armor: o.armor, traits: o.traits || {}, dims: o.dims || {}, update
  };
}

export { rawBox, rawCyl, rawPrism, rawLoft, eulerMat, xform };
