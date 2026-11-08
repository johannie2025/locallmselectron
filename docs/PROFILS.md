# Profils et droits

| Profil | Qui | Droits |
|---|---|---|
| **Super-administrateur** | Wise Design | Tout : comptes de tous niveaux (y compris les autres super-admins), licences (émission sur site), réseau serveur/client, applications, mode maintenance (lève les restrictions Windows / ouvre le bureau en mode cybercafé). Invisible pour le centre. |
| **Administrateur** | Direction du centre | Crée/gère les formateurs et étudiants, personnalisation (logo, nom, couleurs), paramètres généraux, applications autorisées, licence (lecture + activation d'une clé reçue), sortie du kiosque (sans le mode maintenance). |
| **Formateur** | Équipe pédagogique | Tableau de bord et statistiques, classes, inscriptions, ordre des modules, éditeur de quiz, relevés de notes et certificats imprimables, création de comptes **étudiants** uniquement. Pas de paramètres ni de licence. |
| **Étudiant** | Apprenants | Ses cours, sa progression, les quiz, ses certificats, les applications mises à disposition. |

Règle de fond : un profil ne voit, ne modifie, ne désactive, ne supprime et ne promeut que des comptes de rang **strictement inférieur** (le super-administrateur peut aussi gérer d'autres super-administrateurs). Un administrateur ne peut donc ni se promouvoir, ni toucher au compte Wise Design. Ces règles sont appliquées côté serveur de l'application (pas seulement masquées dans l'interface) et couvertes par `tests/roles.test.js`.

## Comptes créés au premier démarrage
- `superadmin` / `Super@1234` — Wise Design (changement de mot de passe obligatoire à la première connexion).
- `admin` / `Admin@1234` — administrateur du centre (idem).

**À l'installation, connectez-vous d'abord en `superadmin` et changez son mot de passe**, avant de remettre le poste au centre. Mise à jour depuis une version précédente : les anciens comptes « admin » deviennent « administrateur du centre » et un compte `superadmin` est ajouté automatiquement.
