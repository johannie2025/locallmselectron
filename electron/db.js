'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const SCHEMA_VERSION = 1;

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
  if (v >= SCHEMA_VERSION) return;
  // v1 = schema.sql ; futures migrations : ajouter schema_v2.sql, etc.
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec('BEGIN');
  try {
    if (v < 1) db.exec(sql);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
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
