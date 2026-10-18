'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

// v1 = schema.sql, v2 = schema_v2.sql, … (suivi via PRAGMA user_version)
const MIGRATIONS = ['schema.sql', 'schema_v2.sql'];

function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  seedAdmin(db);
  return db;
}

function migrate(db) {
  let v = db.pragma('user_version', { simple: true });
  while (v < MIGRATIONS.length) {
    const sql = fs.readFileSync(path.join(__dirname, MIGRATIONS[v]), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      v += 1;
      db.pragma(`user_version = ${v}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

/** Premier démarrage : compte admin par défaut, changement de mot de passe obligatoire. */
function seedAdmin(db) {
  const n = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (n > 0) return;
  db.prepare(
    `INSERT INTO users(username,password_hash,role,full_name,must_change_password,created_at)
     VALUES('admin',?, 'admin','Administrateur',1,?)`
  ).run(bcrypt.hashSync('Admin@1234', 10), Date.now());
}

module.exports = { openDb };
