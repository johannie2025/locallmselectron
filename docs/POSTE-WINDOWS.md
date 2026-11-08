# Poste Windows verrouillé

L'installeur NSIS (droits administrateur) effectue :
- **Démarrage automatique** de l'application à l'ouverture de session (clé `HKLM\...\Run`).
- **Blocage USB** : service `USBSTOR` désactivé (Start=4) et accès refusé aux périphériques de stockage amovibles.
- Création de `C:\formations_wls` (dossier des formations) et `C:\ProgramData\WiseDesignLMS` (données), droits via `icacls`.

Au lancement, pour les comptes Windows non administrateurs, l'application applique des restrictions utilisateur (HKCU) : lecteurs masqués/inaccessibles, Exécuter, Panneau de configuration, Options des dossiers, raccourcis Windows, Gestionnaire des tâches désactivés. Par défaut, cela s'applique à TOUS les comptes Windows, standard comme administrateur, sans exception (`lockdown: "always"`). Pour épargner les administrateurs : `lms-config.json` > `{ "kiosk": "auto", "lockdown": "auto" }`.

Dans l'application : mode kiosque plein écran pour tous les comptes (standard et administrateur), dès l'installation (l'application se lance à la fin de l'installation) et à chaque ouverture de session, raccourcis (Alt+F4, Ctrl+W, F11, DevTools…) bloqués, fermeture impossible sans la sortie administrateur (Paramètres > Quitter, mot de passe formateur, option « mode maintenance » : le bureau Windows s'ouvre après saisie du mot de passe admin ou super-admin), aucun accès réseau, téléchargements bloqués.

**Hors de portée de l'application** : Ctrl+Alt+Suppr, Alt+Tab, Win+L. Utiliser un compte Windows standard et les stratégies de groupe si nécessaire.

## Maintenance
- `scripts/Deverrouiller-USB.cmd` / `Reverrouiller-USB.cmd` (en administrateur) : réactiver/bloquer temporairement l'USB.
- `scripts/Lever-Restrictions-Utilisateur.cmd` : retirer les restrictions HKCU d'un compte.

## Version portable
`Wise-Design-Learning-Systems-Portable-<version>.exe` : un seul fichier, sans installation, pour démonstration, clé de Wise Design ou poste sans droits d'installation. Tout est stocké à côté du fichier : `WLS-Data\` (base, journaux) et `formations_wls\` (cours). Par défaut : **pas de kiosque ni de restrictions Windows** (`lms-config.json` à côté du .exe pour les activer : `{ "kiosk": true, "lockdown": "always" }`). Elle ne pose pas non plus le démarrage automatique ni le blocage USB (ils exigent l'installeur). La licence reste liée au matériel : le portable copié sur un autre PC est refusé. Le premier lancement est un peu plus lent (extraction temporaire).

## Mode cybercafé (l'application remplace le bureau Windows)
Pour un poste qui s'ouvre **directement sur l'application, sans bureau ni barre des tâches**, comme un poste de cybercafé :
1. Menu Démarrer > *Wise Design - Maintenance* > *Comptes Windows et mode cybercafe* (ou `scripts\Mode-Cybercafe.cmd`, il demande les droits administrateur).
2. *Créer un compte élève* (compte Windows **standard**), puis ouvrez une session une fois avec ce compte (création du profil).
3. *ACTIVER le mode cybercafé* pour ce compte. À sa prochaine ouverture de session, Windows lance l'application à la place de `explorer.exe`.
Le mode est **par compte Windows** : les comptes administrateurs gardent leur bureau (le script refuse de l'activer sur un administrateur). *DÉSACTIVER* rétablit le bureau normal.

Dans ce mode, « Quitter » ferme la session Windows ; le bouton ⏻ (écran de connexion et en-tête) propose Fermer la session / Redémarrer / Éteindre ; le super-administrateur peut cocher « mode maintenance » pour ouvrir le bureau Windows (explorer.exe) et lever les restrictions. Secours : Ctrl+Alt+Suppr > Se déconnecter. Pour une ouverture de session automatique, utilisez Sysinternals *Autologon* (mot de passe chiffré) plutôt qu'un mot de passe en clair dans le registre.

## Applications du centre (Word, Excel, LibreOffice, VS Code…)
Paramètres > Applications : *Détecter* les logiciels installés puis cocher ceux qui sont proposés aux étudiants (bouton « Applications » en haut). Un clic ouvre le logiciel ; l'application se masque et une petite barre **« ◀ Wise Design Learning Systems »** reste en haut de l'écran pour revenir (retour automatique quand le dernier logiciel est fermé). Les consoles, l'explorateur, le registre, etc. sont **refusés**. Les outils de développement permettent d'exécuter des commandes : réservez-les aux classes d'informatique. Les logiciels s'ouvrent **à côté** de l'application (on ne peut pas incruster Word dans une fenêtre tierce) ; les boîtes « Enregistrer sous » d'Office restent limitées par les restrictions de lecteurs du compte.


## Maintenance, USB et mises à jour (v1.4) — voir aussi MAINTENANCE-CLE.md
- Cocher **mode maintenance** à la sortie (admin ou super-admin, mot de passe requis) : le kiosque est désactivé, les restrictions du compte levées, l'Explorateur de fichiers s'ouvre, le Gestionnaire des tâches redevient disponible et les clés USB sont autorisées (tâche planifiée SYSTEM `WLS-USB-Policy`, effet immédiat ou en moins d'une minute).
- Au **prochain lancement** de l'application (ouverture de session ou raccourci) : kiosque, restrictions Windows et blocage USB sont réappliqués automatiquement.
- Une **nouvelle installation / mise à jour** ne supprime pas les comptes, centres et progressions : ils sont dans `C:\ProgramData\WiseDesignLMS` (l'installeur n'y touche pas) et sauvegardés chaque jour dans `backups\` (7 derniers jours).
- Vidéos : formats lus = MP4 (H.264 + AAC), WebM, M4V, MOV, MKV, OGV. Les vidéos H.265/HEVC, AVI, WMV ne sont pas lues par le moteur : les convertir en MP4 H.264 (HandBrake, VLC…).

## Kiosque renforcé, applications et PowerPoint (v1.5)
- Garde-clavier (`scripts/wls-keyguard.ps1`, lancé avec l'application, sans droits admin) : touches Windows, Alt+Tab, Alt+Échap, Ctrl+Échap bloqués, barre des tâches masquée. Stratégies ajoutées : pas de verrouillage / changement de mot de passe / déconnexion / arrêt depuis Ctrl+Alt+Suppr. Windows ne permet pas de supprimer l'écran Ctrl+Alt+Suppr lui-même.
- Applications autorisées (Calculatrice, Word…) : la fenêtre du kiosque reste affichée derrière ; le bureau n'apparaît plus.
- PowerPoint (v1.10) : les .pptx sont lus directement dans l'application. Microsoft PowerPoint (installé sur le poste) exporte chaque diapositive en image, affichée plein écran avec flèches/clavier. Si PowerPoint est absent ou échoue : conversion en PDF par LibreOffice. Images/PDF en cache dans `.wls-cache` à côté du fichier (premier affichage : quelques secondes). Les .pptx ne sont pas obligatoires pour la progression.
- Leçons en séquence : dans un module, l'étudiant doit terminer chaque leçon (vue à 98 %+) pour ouvrir la suivante ; contrôlé aussi côté serveur (lecture et progression refusées si la leçon précédente n'est pas terminée). Formateurs et admins : tout est ouvert.

## Tests de leçon et test final de module (v1.7)
- Test de **leçon** : placer `<nom-de-la-leçon>.quiz.json` à côté du contenu (ex. `01-intro.mp4` + `01-intro.quiz.json`). Après avoir terminé la leçon, l'étudiant passe le test (note minimale du fichier, sinon celle du module/cours/réglages) avant d'accéder à la leçon suivante.
- Test **final** du module : `quiz.json` dans le dossier du module (inchangé) ; il n'est accessible qu'une fois toutes les leçons terminées et leurs tests réussis.
- Les tests de leçon s'éditent dans l'éditeur de quiz (« test de la leçon »).
- Relevés et certificats : nom, logo, couleurs, slogan et contacts du centre (adresse, téléphone, e-mail, site : Paramètres > Personnalisation).

## Quiz multilingues, traduction, portions, activation (v1.9)
**Test multilingue** : tout texte (`title`, `text`, `options[i]`, `explanation`) peut être une chaîne OU `{ "fr": "…", "en": "…", "es": "…" }` ; `answers` (texte à compléter) peut être `{ "fr": ["un"], "en": ["one"] }`. L'étudiant change de langue dans l'application : le test passe dans la langue choisie (réponses déjà saisies conservées). Les options doivent rester dans le même ordre dans les trois langues (`answer` = indices communs). Repli : langue choisie → français → anglais → espagnol. Un test multilingue se modifie dans le fichier JSON (l'éditeur en formulaire l'affiche en lecture seule pour ne pas écraser les autres langues).
**Type « traduction »** : `{ "id":"q4", "type":"translate", "text":"Je mange une pomme.", "to":"en", "answers":["I eat an apple.","I am eating an apple."] }` — l'étudiant tape la traduction ; casse, accents, ponctuation et apostrophes sont ignorés. Disponible dans l'éditeur (« Traduction »).
**Leçons : portion & tests** (Contenu > « Leçons : portion & tests ») : portion de vidéo/audio visible par l'étudiant (début/fin, avec aperçu et « position actuelle »), tests de leçon et test final du module activés/désactivés. Enregistré dans le `manifest.json` du module : `{ "quizEnabled": false, "lessons": { "01-intro.mp4": { "clip": { "start": 10, "end": 70 }, "quiz": false } } }`. La portion est appliquée par le lecteur (pas de découpe du fichier) ; formateurs et admins voient toujours la vidéo entière.
**Avance rapide** : désactivée = l'étudiant ne peut pas sauter au-delà de ce qu'il a déjà vu ; la lecture normale n'est plus jamais bloquée, et les formateurs/admins ne sont pas concernés.

## Sous-titres et transcription (v1.10)
Placer, à côté de la vidéo (ou de l'audio), un fichier par langue : `<nom-du-média>.<langue>.vtt` ou `.srt`, par ex. `01-intro.mp4` + `01-intro.fr.vtt` + `01-intro.en.vtt` + `01-intro.es.srt`. Codes reconnus : fr, en, es (et fra, english, en-US, pt, ar…). Dans le lecteur : menu 💬 (sous-titres, choisis automatiquement selon la langue de l'interface) et bouton 📄 Transcription (texte défilant, cliquable pour revenir à l'instant ; suit la portion autorisée). Génération : YouTube Studio (télécharger les sous-titres), Whisper, ou Gemini (`tools/gemini-quiz.js` peut être adapté).

## Éditeur de tests (v1.10)
Contenu > Éditeur de quiz : cours → module (clic pour déplier) → test final 🏁 ou test d'une leçon. Bouton « Tester comme l'étudiant » : le test s'ouvre tel que l'étudiant le voit (même désactivé), sans verrou ni enregistrement, avec les bonnes réponses à la correction. Les formateurs/admins qui ouvrent un test depuis le tableau de bord sont aussi en aperçu.
