-- Schéma SQLite v1 (appliqué par electron/db.js, suivi via PRAGMA user_version)

CREATE TABLE users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  username             TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash        TEXT    NOT NULL,                 -- bcrypt
  role                 TEXT    NOT NULL CHECK (role IN ('student','admin')),
  full_name            TEXT    NOT NULL DEFAULT '',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  active               INTEGER NOT NULL DEFAULT 1,
  created_at           INTEGER NOT NULL,                 -- epoch ms
  last_login_at        INTEGER
);

-- Progression par fichier (item_id = chemin relatif POSIX du fichier dans la racine des cours)
CREATE TABLE progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id      TEXT    NOT NULL,
  percent      REAL    NOT NULL DEFAULT 0,               -- 0..100, monotone croissant
  position_sec REAL    NOT NULL DEFAULT 0,               -- reprise vidéo / page PDF
  completed    INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

-- Une ligne par tentative de quiz (module_id = "<cours>/<module>")
CREATE TABLE quiz_results (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id    TEXT    NOT NULL,
  score        REAL    NOT NULL,                         -- 0..100
  passed       INTEGER NOT NULL,
  answers_json TEXT    NOT NULL,
  duration_sec INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_quiz_user_module ON quiz_results (user_id, module_id);

-- Dernier scan valide (permet de démarrer même si le dossier des cours est momentanément absent)
CREATE TABLE course_cache (
  id          TEXT PRIMARY KEY,                          -- 'tree'
  payload     TEXT NOT NULL,
  fingerprint TEXT,
  scanned_at  INTEGER NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                                    -- JSON
);
