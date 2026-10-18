-- Schéma v3 : 4 profils — superadmin (Wise Design), admin (centre), trainer (formateur du centre), student.
-- SQLite ne sait pas modifier un CHECK : reconstruction de la table users (foreign_keys désactivé par db.js pendant la migration).
-- Les anciens comptes 'admin' deviennent « admin du centre » ; les superadmins sont créés par db.js.
CREATE TABLE users_new (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  username             TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash        TEXT    NOT NULL,
  role                 TEXT    NOT NULL CHECK (role IN ('student','trainer','admin','superadmin')),
  full_name            TEXT    NOT NULL DEFAULT '',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  active               INTEGER NOT NULL DEFAULT 1,
  created_at           INTEGER NOT NULL,
  last_login_at        INTEGER,
  class_id             INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  lang                 TEXT
);
INSERT INTO users_new (id,username,password_hash,role,full_name,must_change_password,active,created_at,last_login_at,class_id,lang)
  SELECT id,username,password_hash,role,full_name,must_change_password,active,created_at,last_login_at,class_id,lang FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE INDEX idx_users_class ON users (class_id);
