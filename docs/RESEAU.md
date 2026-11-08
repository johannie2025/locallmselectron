# Mode serveur / client (réseau local)

Par défaut chaque poste est **autonome** (ses propres cours, comptes et résultats). Pour un centre avec plusieurs PC, un poste devient **serveur** : il héberge `C:\formations_wls`, la base de données (comptes, progression, résultats, certificats) ; les autres postes sont **clients** et affichent les mêmes données. Un formateur inscrit un étudiant ou publie un cours sur n'importe quel poste : tout le monde le voit.

## Mettre en place (super-administrateur)
1. **Serveur** : Paramètres > Réseau > *Serveur* > nom + port (47800 par défaut) > *Activer le mode serveur* > *Redémarrer l'application*. Les adresses IP à saisir sur les clients s'affichent ; l'état « Serveur à l'écoute » doit passer au vert. L'installeur crée la règle de pare-feu entrante (`Wise Design Learning Systems (serveur)`). Pour une IP stable : réservation DHCP sur le routeur, ou IP fixe.
2. **Code de jumelage** (sur le serveur) : *Générer un code de jumelage*. Valable 15 minutes, à usage unique, jamais stocké en clair.
3. **Chaque client** (connecté en `superadmin` local) : Paramètres > Réseau > *Client* > adresse du serveur + code + nom du poste > *Jumeler* > *Redémarrer*. Le poste reçoit un jeton secret propre ; le serveur n'en garde que l'empreinte.
4. **Révoquer** un poste (vol, remplacement) : Paramètres > Réseau sur le serveur > *Révoquer*.

Retour à l'état autonome : Paramètres > Réseau > *Autonome* puis redémarrer (sur un client : le poste retrouve sa base locale d'origine).

## Ce qui est partagé / ce qui reste propre à chaque poste
- **Partagé (serveur)** : cours et médias (streaming avec avance rapide), comptes, classes, inscriptions, progression, quiz, certificats, personnalisation du centre, paramètres généraux, relevés.
- **Propre à chaque poste** : **licence** (liée au matériel de chaque PC, voir LICENCES.md), applications autorisées et leurs chemins (Word, Excel… ne sont pas installés au même endroit partout), alimentation, kiosque / cybercafé, impression.
- Chaque poste client garde son écran de verrouillage de licence : un client dont la licence est expirée est verrouillé même si le serveur fonctionne. Le serveur, lui, doit aussi avoir une licence valide pour servir les clients.

## Sécurité — à lire
- Les sessions sont **par poste client** (deux postes = deux utilisateurs connectés indépendants). Les droits (profils) sont appliqués par le serveur.
- Les canaux « poste » (licence, impression, alimentation, sortie du kiosque, réseau, applications) ne sont **jamais** exécutables à distance.
- La liaison est en **HTTP non chiffré** : à utiliser sur un réseau local de confiance (pas de Wi-Fi public / invité). Mots de passe et progression circulent en clair sur ce réseau.
- Un étudiant ayant un accès Windows non verrouillé sur un client pourrait lire le jeton du poste (`net.json`) ; il ne peut rien faire de plus qu'ouvrir l'application elle-même, car chaque action exige une connexion avec un compte. Gardez les comptes Windows étudiants verrouillés (voir POSTE-WINDOWS.md).
- Sortie du kiosque d'un client : les identifiants admin sont vérifiés par le serveur. Serveur éteint : seul le `superadmin` **local** du poste (dont le mot de passe doit avoir été changé à l'installation) peut encore faire sortir l'application.
- Coupure du serveur : les clients affichent « Serveur du centre injoignable » ; rien n'est perdu, la progression déjà enregistrée est sur le serveur. Une vidéo en cours de lecture s'arrête.

Testé automatiquement (`tests/network.test.js`) : jumelage, sessions simultanées, streaming Range, isolation entre postes, révocation, repli hors-ligne. Non testé ici : le comportement réel sous Windows (pare-feu, Wi-Fi).
