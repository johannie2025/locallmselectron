'use strict';
// Remplace electron / better-sqlite3 / bcryptjs (non installables ici) par de petites doublures pour tester la logique pure.
const Module = require('module');
const crypto = require('crypto');

const handlers = new Map();
const electron = { ipcMain: { handle: (ch, fn) => handlers.set(ch, fn), on() {}, removeHandler() {} }, app: { getPath: () => require('os').tmpdir() } };
const bcrypt = {
  hashSync: (p) => 'h$' + crypto.createHash('sha256').update(String(p)).digest('hex'),
  compareSync: (p, h) => h === 'h$' + crypto.createHash('sha256').update(String(p)).digest('hex'),
};

class Database {
  constructor(file) { let DatabaseSync; try { ({ DatabaseSync } = require('node:sqlite')); } catch { throw new Error('Ces tests exigent Node >= 22.13 (module node:sqlite)'); } this.d = new DatabaseSync(file || ':memory:'); }
  exec(sql) { this.d.exec(sql); return this; }
  prepare(sql) {
    const st = this.d.prepare(sql);
    const flat = (a) => (a.length === 1 && Array.isArray(a[0]) ? a[0] : a);
    return { get: (...a) => st.get(...flat(a)), all: (...a) => st.all(...flat(a)), run: (...a) => { const r = st.run(...flat(a)); return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }; } };
  }
  pragma(s, opt) {
    const [k, v] = s.split('=').map((x) => x.trim());
    if (v !== undefined) { this.d.exec(`PRAGMA ${k} = ${v}`); return undefined; }
    const rows = this.d.prepare(`PRAGMA ${k}`).all();
    return opt && opt.simple ? Object.values(rows[0] || {})[0] : rows;
  }
  transaction(fn) { return (...a) => { this.d.exec('BEGIN'); try { const r = fn(...a); this.d.exec('COMMIT'); return r; } catch (e) { this.d.exec('ROLLBACK'); throw e; } }; }
  close() { this.d.close(); }
}

const orig = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'electron') return electron;
  if (req === 'bcryptjs') return bcrypt;
  if (req === 'better-sqlite3') return Database;
  return orig.call(this, req, ...rest);
};
process.removeAllListeners('warning'); // avertissement « SQLite expérimental »
module.exports = { handlers, bcrypt, Database };
