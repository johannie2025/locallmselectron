# Wise Design Learning Systems

LMS 100 % hors-ligne pour centres de formation en langues (Electron + React/Tailwind + SQLite).
Conçu et intégré par **Wise Design — Intégrateur et Solutions & Automatisation IA** · WhatsApp +240 555 593 398 / +240 555 445 514.

## Fonctions
- Scan du dossier `C:\formations_wls` : formation > module > mp4/webm/mp3/pdf/pptx, `manifest.json` et `quiz.json` optionnels.
- Progression automatique ; module N+1 verrouillé tant que N n'est pas vu à 100 % et le test ≥ 80 % (seuil réglable).
- 4 profils (bcrypt) : **superadmin** (Wise Design) / **admin** (centre) / **formateur** (centre) / **étudiant** : voir `docs/PROFILS.md`. Comptes initiaux `superadmin` / `Super@1234` et `admin` / `Admin@1234` (changement obligatoire à la première connexion).
- Classes, inscriptions d'un étudiant à une ou plusieurs formations, ordre des modules modifiable.
- Éditeur de quiz par formulaire (QCM, vrai/faux, texte à trous) enregistré automatiquement en JSON.
- Tableau de bord (effectifs par classe, progression, certificats, graphiques), relevés de notes et certificats imprimables / PDF.
- Application trilingue FR / EN / ES, personnalisation du centre (logo, nom, couleurs tirées du logo).
- Lecteur sans bouton de téléchargement ; bouton « Présentation » avec contacts Wise Design.
- Licence par poste (mensuelle / trimestrielle / semestrielle / annuelle), liée à l'identifiant matériel : voir `docs/LICENCES.md`.
- Mode kiosque Windows : démarrage automatique, USB bloqué, explorateur/raccourcis bloqués ; **mode cybercafé** (l'application remplace le bureau, par compte Windows) ; boutons Fermer la session / Redémarrer / Éteindre : voir `docs/POSTE-WINDOWS.md`.
- **Version portable** (un seul .exe, données à côté) en plus de l'installeur.
- **Applications du centre** (Word, Excel, LibreOffice, VS Code…) lancées depuis l'application, liste blanche choisie par l'administrateur.
- **Mode serveur / client** en réseau local, jumelage par code : voir `docs/RESEAU.md`.
- **Licence émise sur site** par le superadmin (clé privée jamais enregistrée) : voir `docs/LICENCES.md`.
- Fond animé : salutations en plusieurs langues, formules de maths/physique, extraits de code.

## Construire avec GitHub Actions
1. Créer un dépôt GitHub, y déposer le contenu de ce zip (sans clé privée), pousser sur `main`.
2. L'action **Build Windows** lance les tests puis produit **l'installeur et la version portable** (`.exe`, artefact « Wise-Design-Learning-Systems-windows »).
3. Pour une Release publique : `git tag v1.3.0 && git push --tags`.

## Développement
`npm install`, `npm test`, `npm run dev`, `npm run dist`.
