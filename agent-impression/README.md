# Agent d'impression des étiquettes DLC

Envoie les étiquettes directement à la Brother QL-820NWB, sans fenêtre d'impression.

## Pourquoi une machine en plus

Un iPad ne peut pas parler à une imprimante réseau. Aucun navigateur iOS n'expose
de socket TCP, l'IPP direct est bloqué par le contenu mixte et CORS, et le
Bluetooth de la QL-820NWB est du 2.1 classique que Web Bluetooth ne sait pas
adresser. Il faut donc une machine sur le réseau du restaurant qui, elle, sait
parler à l'imprimante.

N'importe quel Linux allumé pendant le service fait l'affaire : un Raspberry Pi
à une trentaine de francs suffit largement.

```
iPad ──(HTTPS)──> file d'attente Supabase <──(sortant)── agent ──(réseau local)──> QL-820NWB
```

L'agent va chercher le travail. **Aucun port à ouvrir**, aucune redirection sur
la box, aucun certificat, et l'imprimante n'est jamais exposée sur internet.

## Prérequis

- Node.js 18 ou plus (`fetch` natif, aucune dépendance npm à installer)
- CUPS avec l'imprimante déclarée en file d'impression

CUPS fait la conversion du PDF vers le format attendu par l'imprimante. C'est la
raison de ce choix : une imprimante AirPrint n'est pas tenue d'accepter un PDF
brut en IPP, et cette conversion ne se réécrit pas à la main.

## Installation

### 1. CUPS et l'imprimante

```bash
sudo apt update && sudo apt install -y cups
sudo usermod -aG lpadmin $USER
```

Déclarer la QL-820NWB en pilote universel (`everywhere` = IPP Everywhere, ce qui
fait fonctionner AirPrint) — remplacer l'IP par celle de l'imprimante :

```bash
sudo lpadmin -p QL820 -E -v ipp://192.168.1.50/ipp/print -m everywhere
```

Vérifier, puis imprimer une étiquette de test :

```bash
lpstat -p QL820
echo "test" | lp -d QL820
```

Si cette étiquette de test ne sort pas, inutile d'aller plus loin : le problème
est entre CUPS et l'imprimante, pas dans l'agent.

> Donnez une **IP fixe** à l'imprimante (réservation DHCP sur la box). Sinon elle
> changera d'adresse un jour et la file CUPS pointera dans le vide.

### 2. Déclarer l'agent dans la base

Générer un jeton et enregistrer l'agent (SQL Editor du dashboard Supabase).
Remplacer `etab-xxx` par l'identifiant de l'établissement :

```sql
-- Génère le jeton et l'enregistre en une passe. Le jeton en clair n'est affiché
-- QU'UNE FOIS par cette requête : la table n'en garde que l'empreinte sha256.
with nouveau as (select encode(gen_random_bytes(32), 'hex') as jeton)
insert into print_agents (etablissement_id, nom, token_sha256, imprimante_label)
select 'etab-xxx', 'Cuisine - Raspberry Pi', encode(sha256(jeton::bytea), 'hex'), 'QL820'
from nouveau
returning (select jeton from nouveau) as jeton_a_recopier;
```

Recopier le jeton : il n'est plus consultable ensuite. En cas de perte, refaire
la requête et supprimer l'ancienne ligne.

### 3. Configurer l'agent

```bash
cp .env.example .env
```

Renseigner :

| Variable | Valeur |
|---|---|
| `PRINT_AGENT_URL` | `https://<projet>.supabase.co/functions/v1/print-agent` |
| `PRINT_AGENT_TOKEN` | le jeton de l'étape 2 |
| `PRINT_QUEUE` | le nom de la file CUPS (`QL820` ci-dessus) |
| `POLL_MS` | intervalle de relève, 2000 par défaut |
| `LP_OPTIONS` | options `lp` supplémentaires, vide par défaut |

`LP_OPTIONS` reste vide dans le cas normal : sans option, CUPS utilise le media
chargé dans l'imprimante, c'est-à-dire le rouleau en place, donc le bon format.
N'y toucher que si une étiquette sort mal cadrée (`lpoptions -p QL820 -l` liste
les valeurs acceptées).

### 4. Lancer

```bash
node agent.js
```

L'agent refuse de démarrer si la file CUPS n'existe pas, et s'arrête si son jeton
est refusé : mieux vaut un échec au démarrage qu'une découverte en plein service.

### 5. Démarrage automatique

`/etc/systemd/system/etiquettes-agent.service` :

```ini
[Unit]
Description=Agent d'impression des etiquettes DLC
After=network-online.target cups.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/agent-impression
EnvironmentFile=/home/pi/agent-impression/.env
ExecStart=/usr/bin/node /home/pi/agent-impression/agent.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now etiquettes-agent
journalctl -u etiquettes-agent -f
```

## Exploitation

L'onglet Étiquettes DLC affiche l'état de l'agent. Tant qu'il a donné signe de
vie dans les deux dernières minutes, le bouton envoie directement à l'imprimante.
Sinon l'app repasse d'elle-même à la feuille d'impression : **la brigade n'est
jamais bloquée** parce que le Raspberry Pi a redémarré.

Suivre les lots :

```sql
select created_at, statut, nb_etiquettes, mode, erreur
from print_jobs order by created_at desc limit 20;
```

Les lots terminés sont purgés au bout de 7 jours — la file porte des PDF, ce
n'est pas un journal. Le registre d'impression, si un jour il en faut un, est un
autre sujet.

## En cas de panne

| Symptôme | Piste |
|---|---|
| « File d'impression introuvable » | `lpstat -p` ; la file a disparu ou change de nom |
| « Jeton refusé » | ligne `print_agents` supprimée ou `actif = false` |
| Rien ne sort, aucune erreur | l'imprimante a la file en pause : `cupsenable QL820` |
| Étiquette rognée ou mal cadrée | zone imprimable du DK-11209 : 58,9 × 22,9 mm, cf. `src/utils/etiquettesDlc.js` |
| Lots bloqués en `en_cours` | l'agent s'est arrêté en cours d'impression ; les repasser en `en_attente` |
