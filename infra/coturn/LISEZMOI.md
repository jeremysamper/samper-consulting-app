# Relais d'appels coturn chez Infomaniak : LISEZMOI

Pour Jérémy. Ce dossier installe le relais des appels audio de l'app (lot C2b, amendement A10 du brief) : un serveur à toi, en Suisse chez Infomaniak, avec coturn, un logiciel libre. Aucune autre société dans la chaîne, sauf Let's Encrypt pour le certificat du nom de domaine.

À quoi il sert : deux appareils qui s'appellent essaient d'abord de se joindre en direct. Quand un réseau l'empêche (Wi-Fi d'hôtel, 4G), le son passe par ce relais. Le son reste chiffré de bout en bout : le relais ne transporte que des paquets qu'il ne peut pas lire. Tant que le relais n'est pas en place, l'app reste en connexion directe seule.

Contenu du dossier :

| Fichier | Rôle |
|---|---|
| `installer.sh` | installe et configure tout sur le serveur |
| `turnserver.conf` | configuration de coturn, commentée ligne par ligne, sans secret |
| `verifier.sh` | vérifie le relais sur le serveur et donne un identifiant d'essai |
| `essai-relais.html` | essai du relais depuis ton navigateur, en local |

## 1. Commander le serveur chez Infomaniak

Un serveur virtuel (VPS) Infomaniak, centre de données en Suisse, le plus petit modèle qui offre au moins :

- 1 processeur virtuel, 1 Go de mémoire (2 Go si l'écart de prix est faible), 10 Go de disque ;
- une adresse IPv4 publique fixe ;
- le système Debian 12 ou Ubuntu 24.04 LTS ;
- l'accès SSH par clé (Infomaniak propose de déposer ta clé publique à la création).

Pourquoi c'est assez : un appel relayé consomme environ 104 kbit/s dans les deux sens (audit C5, section 6). Vingt appels relayés en même temps font environ 2 Mbit/s. Le pire mois chiffré par l'audit fait 10,5 Go de trafic. coturn tient en quelques dizaines de Mo de mémoire et le processeur ne fait que recopier des paquets. Un modèle plus gros ne servirait à rien à cette échelle. Le prix se lit dans le Manager au moment de commander.

Noter : l'adresse IPv4 du serveur et le nom d'utilisateur SSH (souvent `debian` ou `ubuntu`).

Si le Manager Infomaniak propose un pare-feu pour ce serveur, y ouvrir les mêmes ports que la table « Ports » plus bas, port 80 compris.

## 2. Le nom du relais (DNS)

1. Choisir un nom, par exemple `relais.samperconsulting-app.com`.
2. Chez le gestionnaire DNS du domaine, créer un enregistrement **A** : nom `relais`, valeur l'adresse IPv4 du serveur, durée 3600 (ou 300 le temps de l'installation).
3. Vérifier depuis ton ordinateur, quelques minutes plus tard :

```powershell
nslookup relais.samperconsulting-app.com
```

La réponse doit être l'adresse du serveur. Aucun enregistrement AAAA n'est nécessaire.

## 3. Installer

Depuis ton ordinateur, dans le dossier de l'app (PowerShell) :

```powershell
scp -r infra/coturn debian@ADRESSE_DU_SERVEUR:~/
ssh debian@ADRESSE_DU_SERVEUR
```

Puis, sur le serveur :

```bash
cd coturn
sudo bash installer.sh relais.samperconsulting-app.com ton-adresse@exemple.ch
```

- Remplacer `debian` par l'utilisateur noté à l'étape 1, et le nom et le courriel par les tiens.
- Le courriel sert à Let's Encrypt (avis avant expiration du certificat). En lançant le script, tu acceptes leurs conditions d'utilisation.
- Si bash répond `$'\r': command not found`, la copie a des fins de ligne Windows : sur le serveur, `sed -i 's/\r$//' *.sh turnserver.conf`, puis relancer. (Le dépôt les force en LF, `infra/coturn/.gitattributes`.)
- Quelques minutes. Le script s'arrête au premier problème avec une ligne `ARRET :` qui dit quoi corriger ; on peut le relancer autant de fois que nécessaire.
- À la fin, il affiche la vérification (étape 5) et la commande des secrets (étape 4).

Le secret partagé est tiré sur le serveur par le script. Il n'est envoyé nulle part : tu le copies toi-même dans Supabase.

## 4. Poser les secrets dans Supabase

Deux valeurs : `COTURN_DOMAINE` (le nom du relais) et `COTURN_SECRET` (affiché par le script ; le relire plus tard avec `sudo cat /etc/relais-turn/auth-secret`).

Au choix :

- tableau de bord Supabase, projet de l'app, Edge Functions, Secrets : ajouter les deux (rien ne reste dans l'historique de ton terminal) ;
- ou la commande affichée par le script, sur ton ordinateur, dans le dossier de l'app (PowerShell : `npx.cmd` au lieu de `npx`) :

```powershell
npx.cmd supabase secrets set COTURN_DOMAINE=relais.samperconsulting-app.com COTURN_SECRET=LE_SECRET --project-ref ppmtoiqgajwcdkbnrcll
```

Effet immédiat, sans redéploiement : la fonction `appel-turn` passe de « relais non configuré » (503) à des identifiants temporaires.

## 5. Vérifier

Sur le serveur :

```bash
sudo bash verifier.sh relais.samperconsulting-app.com
```

Toutes les lignes doivent dire `ok`. Le script imprime ensuite trois valeurs valables dix minutes. Sur ton ordinateur, ouvrir `infra/coturn/essai-relais.html` (double clic, le fichier reste local), coller les trois valeurs, Tester : quatre lignes `ok` attendues (découverte d'adresse, relais UDP, TCP et TLS).

Le dernier essai, un vrai appel entre deux appareils, se fait avec le lot C4.

## Ports

| Port | Protocole | Rôle |
|---|---|---|
| 22 (ou le port SSH du serveur) | TCP | ta connexion SSH |
| 3478 | UDP et TCP | découverte d'adresse et relais |
| 5349 | TCP | relais sur TLS (réseaux qui filtrent le reste) |
| 49152 à 50151 | UDP | ports des relais |
| 80 | TCP | ouvert seulement pendant le défi Let's Encrypt (création et renouvellements), refermé aussitôt |

Tout le reste est fermé par le pare-feu du serveur (ufw).

## Ce que le serveur garde (pour la note nLPD)

- **Journal du relais** : `/var/log/relais-turn/turnserver.log`, un fichier par jour, sept jours gardés, puis effacés (rotation quotidienne). Pour chaque session de relais : l'heure, l'adresse IP et le port publics de l'appareil, le nom d'utilisateur temporaire (heure d'expiration et identifiant du compte dans l'app, donc le lien entre une adresse IP et une personne), le volume échangé et la raison de la fin. Les adresses du correspondant peuvent y figurer selon les messages de coturn : à confirmer sur le premier journal réel. Jamais le son, qui reste chiffré de bout en bout.
- **Journal du système** (démarrages du service, connexions SSH) : sept jours (réglage posé par le kit).
- Sur Ubuntu, le système tient aussi `/var/log/auth.log` et `/var/log/syslog` selon sa rotation par défaut (plusieurs semaines), que le kit ne change pas ; Debian 12 n'a pas ces fichiers par défaut.
- **Let's Encrypt** reçoit le nom du relais (public, inscrit dans les registres de transparence des certificats) et ton courriel. Aucune adresse IP de l'équipe.
- **Infomaniak** héberge le serveur en Suisse, comme tout hébergeur voit passer le trafic réseau, sans pouvoir lire le son.
- Aucune console d'administration : ni telnet, ni page web, ni métriques.

## Entretien

- Mises à jour de sécurité : automatiques (dépôts de Debian ou d'Ubuntu).
- Certificat : renouvelé automatiquement ; le relais le recharge sans couper les appels en cours.
- Changer le secret, hors des heures de service (un appel en cours peut tomber) :

```bash
sudo rm /etc/relais-turn/auth-secret
sudo bash installer.sh relais.samperconsulting-app.com ton-adresse@exemple.ch
```

  puis reposer `COTURN_SECRET` dans Supabase (étape 4).
- Arrêter le relais : supprimer les deux secrets dans Supabase (l'app revient à la connexion directe seule), puis sur le serveur `sudo systemctl disable --now relais-turn`.

## Jamais vu

Le kit n'a jamais tourné sur un vrai serveur : la session qui l'a écrit n'avait pas de machine Linux. Ta première installation est son premier essai. Si une ligne `ARRET :` ou un `ECHEC` apparaît, copie-la telle quelle à la session qui suit le lot.
