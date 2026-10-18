-- Schéma v2 : classes, inscriptions, certificats, langue par utilisateur

CREATE TABLE classes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  created_at INTEGER NOT NULL
);

-- Cours (dossiers) assignés à toute une classe
CREATE TABLE class_courses (
  class_id  INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  course_id TEXT    NOT NULL,
  PRIMARY KEY (class_id, course_id)
);

-- Inscriptions individuelles étudiant → cours (course_id = nom du dossier du cours)
CREATE TABLE enrollments (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id   TEXT    NOT NULL,
  enrolled_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, course_id)
);

-- Certificat délivré automatiquement quand tous les modules d'un cours sont terminés
CREATE TABLE certificates (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  number    TEXT    NOT NULL UNIQUE,                     -- WLS-2026-00012
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT    NOT NULL,
  avg_score REAL,
  issued_at INTEGER NOT NULL,
  UNIQUE (user_id, course_id)
);

ALTER TABLE users ADD COLUMN class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN lang TEXT;                  -- 'fr' | 'en' | 'es'
CREATE INDEX idx_users_class ON users (class_id);
