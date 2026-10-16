# Intégration FrontFace Lockdown Tool

> À valider sur votre version de FrontFace : les libellés exacts des menus peuvent différer.

1. Installez `LMS-Langues-Setup-x.y.z.exe` (installation « pour tous les utilisateurs »).
2. Dans FrontFace, déclarez comme **application/shell de démarrage** :
   `C:\Program Files\LMS Langues\LMS Langues.exe`
3. Autorisez en lecture le dossier des cours (ex. `C:\Formation_Langues\`) et en **écriture** le dossier de données :
   `%APPDATA%\lms-langues-offline\` (base `lms.sqlite`, `logs\`, `exports\`) — ou fixez `dataDir` dans `lms-config.json`.
4. Si FrontFace relance le shell à sa fermeture, la sortie admin (Administration → Quitter) redémarrera l'appli : c'est voulu.
5. Ce que l'application ne bloque pas (niveau OS, à configurer dans FrontFace) : Ctrl+Alt+Suppr, touche Windows, Alt+Tab, Win+L, gestionnaire des tâches.

## Fichier optionnel `lms-config.json` (à côté de l'exe)
```json
{ "courseRoot": "D:\\Formation_Langues", "dataDir": "C:\\ProgramData\\LMS_Langues" }
```

## Premier démarrage
Compte `admin` / `Admin@1234` — changement de mot de passe imposé à la première connexion.

## Export des résultats
Les CSV sont écrits dans `<dataDir>\exports\` (pas d'USB sur le poste : récupérez-les en mode maintenance FrontFace).
