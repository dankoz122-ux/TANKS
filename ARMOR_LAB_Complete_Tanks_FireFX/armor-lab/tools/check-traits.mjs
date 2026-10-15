// Проверка: эталонные параметры серийных танков на сервере совпадают с теми, что описаны в файлах моделей.
import fs from 'node:fs'; import { STOCK } from '../js/shared/rules.js';
let bad = 0;
for (const [t, st] of Object.entries(STOCK)) {
  const src = fs.readFileSync(new URL(`../js/tanks/${t}.js`, import.meta.url), 'utf8');
  const g = k => { const m = src.match(new RegExp(k + ':\\s*([\\w.\'-]+)')); return m ? m[1].replace(/'/g, '') : null; };
  for (const k of ['ammo', 'reload', 'maxSpeed', 'cookoff']) {
    const v = g(k), want = String(st[k]); if (!(v === want || Number(v) === Number(want))) { console.error(`✗ ${t}.${k}: модель=${v}, сервер=${want}`); bad++; }
  }
}
if (bad) process.exit(1); console.log('✓ параметры серийных танков на сервере совпадают с моделями');
