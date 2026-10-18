import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROWS = new Function(fs.readFileSync(path.join(root, 'src/i18n/strings.js'), 'utf8').replace('export const ROWS', 'const ROWS') + '\nreturn ROWS;')();
const keys = new Set(ROWS.map((r) => r[0]));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const vars = (s) => (s.match(/\{[a-z]+\}/g) || []).sort().join(',');

test('i18n : chaque clé a FR, EN et ES non vides, sans doublon', () => {
  assert.strictEqual(keys.size, ROWS.length, 'clés en double');
  for (const [k, fr, en, es] of ROWS) for (const [l, v] of [['fr', fr], ['en', en], ['es', es]]) assert.ok(typeof v === 'string' && v.trim(), `${k} manquant en ${l}`);
});

test('i18n : mêmes variables {x} dans les 3 langues', () => {
  for (const [k, fr, en, es] of ROWS) { assert.strictEqual(vars(en), vars(fr), `${k} (en)`); assert.strictEqual(vars(es), vars(fr), `${k} (es)`); }
});

test('i18n : toutes les clés utilisées dans src/ existent', () => {
  const ns = new Set([...keys].map((k) => k.split('.')[0]));
  const used = new Map();
  for (const f of walk(path.join(root, 'src')).filter((x) => x.endsWith('.jsx'))) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"`]([a-z]+\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)['"`]/g)) if (ns.has(m[1].split('.')[0])) used.set(m[1], f);
  }
  const missing = [...used].filter(([k]) => !keys.has(k)).map(([k, f]) => `${k} (${path.basename(f)})`);
  assert.deepStrictEqual(missing, []);
  assert.ok(used.size > 150, 'le scan doit trouver les clés');
});

test('i18n : clés dynamiques (erreurs, formules, états, types de question)', () => {
  const need = [];
  for (const f of walk(path.join(root, 'electron')).filter((x) => x.endsWith('.js') && !x.endsWith('courseScanner.js'))) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/new Error\('([A-Z_]+)'\)/g)) need.push(`err.${m[1]}`);
    for (const m of s.matchAll(/\{ error: '([A-Z_]+)' \}/g)) need.push(`err.${m[1]}`);
  }
  need.push('err.UNKNOWN');
  for (const p of ['monthly', 'quarterly', 'semester', 'annual', 'trial']) need.push(`lic.plan.${p}`);
  for (const s of ['active', 'trial', 'expired', 'trial_expired', 'none', 'invalid', 'clock', 'noid']) need.push(`lic.state.${s}`);
  for (const q of ['mcq', 'true_false', 'fill_blank']) need.push(`qtype.${q}`);
  assert.deepStrictEqual([...new Set(need)].filter((k) => !keys.has(k)), []);
});
