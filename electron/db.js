'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

// v1 = schema.sql, v2 = schema_v2.sql, … (suivi via PRAGMA user_version)
const MIGRATIONS = ['schema.sql', 'schema_v2.sql', 'schema_v3.sql'];

function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  seedAdmin(db);
  ensureSuperadmin(db);
  return db;
}

function migrate(db) {
  let v = db.pragma('user_version', { simple: true });
  if (v >= MIGRATIONS.length) return;
  db.pragma('foreign_keys = OFF'); // requis pour reconstruire une table référencée (ne s'applique pas dans une transaction)
  try { runMigrations(db, v); } finally { db.pragma('foreign_keys = ON'); }
  if (db.pragma('foreign_key_check').length) throw new Error('MIGRATION_FK_CHECK');
}

function runMigrations(db, v) {
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

/** Profil Wise Design : toujours au moins un superadmin (créé au premier démarrage ou à la mise à jour). */
function ensureSuperadmin(db) {
  if (db.prepare("SELECT 1 FROM users WHERE role='superadmin'").get()) return;
  const name = db.prepare("SELECT 1 FROM users WHERE username='superadmin'").get() ? 'wisedesign' : 'superadmin';
  db.prepare(
    `INSERT INTO users(username,password_hash,role,full_name,must_change_password,created_at)
     VALUES(?,?, 'superadmin','Wise Design',1,?)`
  ).run(name, bcrypt.hashSync('Super@1234', 10), Date.now());
}

module.exports = { openDb, migrate, ensureSuperadmin };
