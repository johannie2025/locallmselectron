# Licences par poste

## Principe
Chaque PC calcule un **identifiant machine** (5 groupes de 4 caractères) à partir de son matériel (UUID carte mère, n° de série carte/BIOS ; à défaut, MachineGuid Windows = identifiant « faible », signalé à l'écran). La clé de licence `WLS1.…` est signée Ed25519 et contient cet identifiant. L'application ne contient que la **clé publique** : elle peut vérifier, jamais émettre.

Conséquences : copier le `.exe`, le dossier d'installation, la base de données ou la clé sur un autre PC ne sert à rien, l'identifiant diffère et la clé est refusée (« Licence invalide »). Cloner un disque Windows sur un autre PC change aussi l'identifiant, car il vient du matériel.

## Émettre une clé (poste de l'émetteur uniquement)
1. Le client ouvre l'application : l'écran verrouillé affiche son identifiant machine.
2. `node tools/license-keygen.js issue --machine XXXX-XXXX-XXXX-XXXX-XXXX --plan monthly|quarterly|semester|annual --customer "Centre X" --start 2026-11-01 --key license-private.pem`
3. Envoyer la clé au client : Paramètres > Licence > Activer (ou depuis l'écran de verrouillage).
Renouvellement : émettre une nouvelle clé (date `--start` récente) pour le même identifiant.

## Émettre sur site depuis l'application (super-administrateur)
- **Poste verrouillé** (licence absente / expirée) : sur l'écran de verrouillage, bouton *Wise Design : émettre une licence* → identifiants superadmin + formule + client + fichier `.pem` → la clé est générée **et activée** sur ce poste.
- **Poste ouvert** : Paramètres > Licence (superadmin) → saisir l'ID de **n'importe quel poste** → *Générer la clé* à transmettre (WhatsApp…) ; si l'ID est celui du poste, *Générer et activer*.
La clé privée est collée ou chargée à chaque fois, **utilisée en mémoire** pour signer et immédiatement effacée : elle n'est jamais enregistrée par l'application (test automatique à l'appui). Une clé privée qui ne correspond pas à la version de l'application est refusée (`KEY_MISMATCH`). Sur un poste client réseau, les identifiants sont vérifiés par le serveur. **Prudence** : saisir la clé privée sur un PC du centre l'expose à un enregistreur de frappe ou à une capture d'écran ; préférez votre propre ordinateur pour émettre, et ne l'utilisez sur site qu'en cas de besoin.

## Clé privée
`license-private.pem` ne doit **jamais** être dans le dépôt ni dans l'installeur. Sauvegardez-la en lieu sûr. Perdue, plus aucune clé ne peut être émise : il faudrait régénérer une paire (`init`), recompiler et redéployer l'application.

## Protection contre le contournement
- Pas d'essai gratuit (pour une démo, émettre une clé mensuelle).
- Retour d'horloge : la dernière date vue est stockée en 3 endroits signés (base, fichier caché, registre). Tolérance 6 h ; au-delà, état « Horloge incohérente » : seule une clé émise plus récemment le lève.
- Expiration : verrouillage total, seuls l'activation et la sortie administrateur restent accessibles.

## Limites (à connaître)
Une licence hors-ligne n'est jamais inviolable. Un utilisateur disposant des droits administrateur Windows et de compétences techniques peut modifier le code de l'application (remplacer la clé publique) ou effacer les 3 traces d'horloge. Mesures recommandées : comptes Windows étudiants non administrateurs, application installée dans Program Files, signature de code, et (après un premier build validé) activation des fuses Electron / intégrité asar.
- Remplacement de carte mère : nouvel identifiant, donc nouvelle clé.
- Identifiant « faible » (MachineGuid) : deux PC issus du même clone Windows pourraient partager l'ID ; préférer des PC où l'UUID matériel est lisible.
- État « Identifiant illisible » (`noid`) : PowerShell/WMI bloqués pour le compte Windows de l'application ; les autoriser.
