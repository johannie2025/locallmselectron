# Clé de maintenance Wise Design (v1.6)

Une clé USB de Wise Design déverrouille **tous les postes** pour la maintenance / mise à jour, sans connexion, et les reverrouille au retrait.

## Mise en place (une seule fois par poste)
1. Installer la v1.6 avec l'installeur habituel sur chaque PC (c'est la dernière installation « à la main »).
2. Sur un PC non verrouillé, brancher VOTRE clé et lancer `scripts\Identifier-Ma-Cle.cmd` ; copier les lignes affichées dans `scripts\allowed-usb.txt`, puis recompiler l'installeur (GitHub Actions). Seules les clés listées fonctionnent, toutes les autres sont bloquées.

## Préparer la clé (poste de l'émetteur, clé privée présente)
```
node tools/license-keygen.js maintenance --hours 24 --installer release/Wise-Design-Learning-Systems-Setup-1.6.0.exe
```
Copier le dossier `WLS-Maintenance` créé à la racine de la clé. Il contient `maintenance.json` (signé, valable pour tous les postes, 24 h par défaut, 31 jours maximum) et l'installeur (son hash SHA-256 est signé : un installeur remplacé est refusé).

## Sur un poste
- Brancher la clé : en moins d'une minute, les applications lèvent le kiosque, les restrictions Windows, le blocage USB, et ouvrent le bureau (l'Explorateur de fichiers, le Gestionnaire des tâches redeviennent utilisables).
- Si la clé contient un installeur nouveau pour ce poste, il est installé en silence puis le PC redémarre (après 60 s). Au redémarrage, tant que la clé est branchée, le poste reste en maintenance.
- Retirer la clé : l'application se relance en kiosque avec toutes les restrictions et le blocage USB.

## Maintenance = bureau complètement restauré
Quand la maintenance est activée (clé branchée ou case « maintenance » avec mot de passe), l'application fait l'équivalent de `Restaurer-Bureau.cmd` pour la session : restrictions du compte levées (lecteurs, Exécuter, Panneau de configuration, Gestionnaire des tâches, touches Windows, Ctrl+Alt+Suppr), garde-clavier arrêté, barre des tâches et Explorateur relancés, USB autorisé, et la tâche système remet `explorer.exe` comme shell. Au retour du kiosque (retrait de la clé / prochain lancement), l'application redevient le shell.

## Kiosque sans voir le bureau
L'installeur définit l'application comme **shell Windows** de la machine (`Winlogon\Shell`) : l'Explorateur ne démarre pas, le bureau n'apparaît jamais avant le kiosque. Sortie : mot de passe admin/super-admin avec « maintenance », ou clé de maintenance. Désinstaller rétablit `explorer.exe`. **Secours** (écran noir, application indisponible) : démarrer en mode sans échec / invite de récupération et lancer `scripts\Restaurer-Bureau.cmd`.

## Sécurité
- Le drapeau de maintenance de la clé est écrit par une tâche SYSTEM dans `C:\ProgramData\WiseDesignLMS\sys` (lecture seule pour les utilisateurs) : un élève ne peut pas le fabriquer.
- Quiconque possède la clé (et un fichier encore valide) contrôle le poste : gardez-la sur vous, durée courte.
- L'ouverture USB par mot de passe admin (case « maintenance ») passe par un drapeau modifiable par les utilisateurs ; il expire au bout d'une heure.
- La politique USB repose sur les règles Windows d'installation de périphériques (selon version de Windows) : à valider sur un poste de test.

## Créer la clé depuis l'application (v1.8)
Connecté en **super-administrateur** : Paramètres > « Clé de maintenance » — saisir le lecteur de la clé (ex. `E:\`), le chemin complet de l'installeur (facultatif), la durée, charger votre clé privée (jamais conservée), puis *Créer*. Le dossier `WLS-Maintenance` (clé signée + installeur) est écrit sur la clé. Sans installeur : simple déverrouillage.

## allowed-usb.txt
Les identifiants génériques (`USBSTOR\GenDisk`, `GenDisk`) sont ignorés : ils autoriseraient toutes les clés. Pour restreindre à VOTRE clé précise, relancer `Identifier-Ma-Cle.cmd` et ajouter les lignes `instance:…` (numéro de série).

## Générer les quiz avec Gemini (v1.9)
`node tools/gemini-quiz.js tools/quiz-sources.exemple.csv --root C:\formations_wls --lang fr` (Node 18+, variable `GEMINI_API_KEY` = clé Google AI Studio). Chaque ligne du CSV associe une leçon (ou un module) à ses vidéos YouTube ; l'outil écrit `<leçon>.quiz.json` / `quiz.json` au bon endroit, validés par le moteur de l'application, sans écraser l'existant (`--force` pour régénérer). L'application elle-même reste hors ligne. Relire les questions avant déploiement.
