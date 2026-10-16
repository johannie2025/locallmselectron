# LMS Langues — hors-ligne / kiosque Windows

Electron 32 · React 18 · Tailwind · SQLite (better-sqlite3) · bcryptjs.

## Arborescence
```
.github/workflows/build.yml   CI : tests + installeur Windows (.exe)
electron/
  main.js          kiosque, raccourcis, protocoles, blocage réseau
  preload.js       pont sécurisé (liste blanche de canaux)
  ipc.js           services : auth, cours, progression, quiz, admin
  courseScanner.js scanner récursif autonome (Node pur)
  quizEngine.js    validation / correction / auto-quiz
  gating.js        règles de déblocage
  db.js, schema.sql, config.js
src/               interface React (login, cours, lecteur vidéo/PDF, quiz, admin)
docs/              quiz.schema.json, FRONTFACE.md
tests/             node --test
```

## Contenu des cours
```
C:\Formation_Langues\
  Anglais_Niveau_A1\
    Module_01_Grammaire\   cours.mp4, fiche.pdf, quiz.json, manifest.json (facultatifs)
    Module_02_Vocabulaire\
```
- `.pptx` : non affichable hors-ligne ; déposez un `.pdf` du même nom à côté (il remplace le .pptx).
- `manifest.json` (cours ou module) : `{ "title", "description", "order", "prerequisites": ["Module_01_Grammaire"], "minScore", "items": ["a.mp4","b.pdf"] }`.
- `quiz.json` : voir `docs/quiz.schema.json` (QCM `mcq`, `true_false`, `fill_blank`). L'éditeur Admin fournit un modèle.

## Développement / build
```
npm install
npm run dev     # mode fenêtré (LMS_NO_KIOSK=1)
npm test
npm run dist    # nécessite Windows
```
Sur GitHub : poussez sur `main` → onglet **Actions** → artefact `LMS-Langues-windows`. Un tag `v1.0.0` crée aussi une Release.

## Notes de production
- Base SQLite **non chiffrée** : mots de passe en bcrypt ; pour chiffrer le fichier, utilisez BitLocker/ACL NTFS ou remplacez par `better-sqlite3-multiple-ciphers`.
- Installeur non signé → avertissement SmartScreen ; signez avec un certificat de code si besoin.
- Le correcteur de quiz tourne dans le processus principal (le renderer ne reçoit jamais les réponses).
