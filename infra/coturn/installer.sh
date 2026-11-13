#!/usr/bin/env bash
# ================================================================
# Installation du relais coturn de Samper Consulting (lot C2b, amendement
# A10) sur un serveur virtuel Debian 12 ou Ubuntu 22.04 / 24.04 chez
# Infomaniak. Tout vient des dépôts de la distribution ; aucun autre
# fournisseur que Let's Encrypt (certificat du nom de domaine).
#
# Usage, sur le serveur, dans le dossier du kit :
#   sudo bash installer.sh <nom du relais> <courriel pour Let's Encrypt>
#   exemple : sudo bash installer.sh relais.exemple.ch jeremy@exemple.ch
#
# Ce que fait le script, dans l'ordre :
#   1. vérifie que le nom du relais pointe sur ce serveur ;
#   2. installe coturn, certbot, ufw, openssl, unattended-upgrades ;
#   3. tire le secret partagé sur ce serveur (gardé s'il existe déjà) ;
#   4. pose la configuration (sans secret) et le service relais-turn ;
#   5. ferme le pare-feu sauf SSH et les ports du relais ;
#   6. obtient le certificat Let's Encrypt (port 80 ouvert le temps du
#      défi seulement, à la création comme à chaque renouvellement) ;
#   7. limite les journaux à sept jours ;
#   8. démarre le service au démarrage de la machine ;
#   9. vérifie (verifier.sh) et affiche la commande `supabase secrets set`
#      que Jérémy lance lui-même sur son ordinateur.
#
# Rejouable : rejouer réapplique configuration, pare-feu, service et
# certificat ; le secret existant n'est jamais remplacé (LISEZMOI.md,
# « Changer le secret »). Le script n'envoie le secret nulle part.
# ================================================================
set -euo pipefail
# Une substitution qui échoue arrête le script (set -e) : celles dont l'échec
# est attendu (nom qui ne résout pas, sshd absent) finissent par || true.

ICI="$(cd "$(dirname "$0")" && pwd)"
DOMAINE="${1:-}"
COURRIEL="${2:-}"
ETC=/etc/relais-turn
LOG=/var/log/relais-turn
RELAIS_MIN=49152
RELAIS_MAX=50151
PROJET=ppmtoiqgajwcdkbnrcll

arret() { echo "ARRET : $*" >&2; exit 1; }
etape() { echo; echo "== $*"; }

[ "$(id -u)" -eq 0 ] || arret "lancer avec sudo : sudo bash installer.sh <nom du relais> <courriel>"
[ -n "$DOMAINE" ] && [ -n "$COURRIEL" ] || arret "usage : sudo bash installer.sh <nom du relais> <courriel>"
DOMAINE="$(printf '%s' "$DOMAINE" | tr 'A-Z' 'a-z')"
printf '%s' "$DOMAINE" | grep -Eq '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' || arret "nom de relais invalide : $DOMAINE"
printf '%s' "$COURRIEL" | grep -Eq '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' || arret "courriel invalide : $COURRIEL"
[ -f "$ICI/turnserver.conf" ] || arret "turnserver.conf introuvable à côté du script ($ICI)"
[ -f "$ICI/verifier.sh" ] || arret "verifier.sh introuvable à côté du script ($ICI)"
# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}" in
  debian|ubuntu) ;;
  *) arret "système non prévu : ${ID:-inconnu} (Debian ou Ubuntu attendu)" ;;
esac

# ── 1. Nom et adresse ──────────────────────────────────────────────
etape "1. Le nom $DOMAINE pointe-t-il sur ce serveur ?"
IP_DNS="$(getent ahostsv4 "$DOMAINE" | awk 'NR==1 {print $1}' || true)"
[ -n "$IP_DNS" ] || arret "$DOMAINE ne résout pas. Créer l'enregistrement A (LISEZMOI.md, étape 2), attendre quelques minutes, relancer."
IPS_LOCALES="$(ip -4 -o addr show scope global | awk '{split($4, a, "/"); print a[1]}' || true)"
IP_LOCALE="$(printf '%s\n' "$IPS_LOCALES" | head -n 1)"
[ -n "$IP_LOCALE" ] || arret "aucune adresse IPv4 sur ce serveur"
EXTERNE=""
if printf '%s\n' "$IPS_LOCALES" | grep -qxF "$IP_DNS"; then
  echo "  $DOMAINE -> $IP_DNS, adresse portée par ce serveur."
else
  EXTERNE="external-ip=$IP_DNS/$IP_LOCALE"
  echo "  $DOMAINE -> $IP_DNS ; ce serveur porte $IP_LOCALE : adresse publique traduite, external-ip posé."
  echo "  Si $IP_DNS n'est pas l'adresse publique de ce serveur, le certificat échouera à l'étape 6 : corriger le DNS."
fi

# ── 2. Paquets ─────────────────────────────────────────────────────
etape "2. Paquets (dépôts de la distribution)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q coturn certbot ufw openssl unattended-upgrades logrotate
id turnserver >/dev/null 2>&1 || arret "le paquet coturn n'a pas créé l'utilisateur turnserver"
# Le service du paquet est remplacé par relais-turn (étape 4).
systemctl disable --now coturn.service >/dev/null 2>&1 || true
systemctl mask coturn.service >/dev/null 2>&1 || true
echo "  coturn $(dpkg-query -W -f='${Version}' coturn)"
# Mises à jour de sécurité automatiques (dépôts de la distribution).
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'FIN'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
FIN

# ── 3. Secret partagé ──────────────────────────────────────────────
etape "3. Secret partagé (tiré sur ce serveur)"
install -d -m 0755 -o root -g root "$ETC"
if [ -s "$ETC/auth-secret" ]; then
  echo "  secret existant gardé"
else
  ( umask 077; openssl rand -hex 32 > "$ETC/auth-secret" )
  echo "  secret tiré"
fi
chown root:root "$ETC/auth-secret"
chmod 0600 "$ETC/auth-secret"
grep -Eqx '[0-9a-f]{64}' "$ETC/auth-secret" || arret "$ETC/auth-secret n'a pas la forme attendue (64 caractères hexadécimaux)"

# ── 4. Configuration et service ────────────────────────────────────
etape "4. Configuration et service relais-turn"
sed "s/__DOMAINE__/$DOMAINE/g" "$ICI/turnserver.conf" > "$ETC/turnserver.conf.neuf"
if [ -n "$EXTERNE" ]; then
  printf '\n# Ajouté par installer.sh : adresse publique traduite.\n%s\n' "$EXTERNE" >> "$ETC/turnserver.conf.neuf"
fi
grep -q '^static-auth-secret' "$ETC/turnserver.conf.neuf" && arret "la configuration ne doit contenir aucun secret"
grep -q '__DOMAINE__' "$ETC/turnserver.conf.neuf" && arret "marque __DOMAINE__ restée dans la configuration"
chmod 0644 "$ETC/turnserver.conf.neuf"
mv "$ETC/turnserver.conf.neuf" "$ETC/turnserver.conf"
install -d -m 0750 -o turnserver -g turnserver "$LOG"

# Assemble la configuration complète en mémoire au démarrage du service.
cat > /usr/local/sbin/relais-turn-assembler <<'FIN'
#!/bin/sh
# Lancé par relais-turn.service (ExecStartPre, en root) : configuration
# publique plus le secret, dans /run/relais-turn, lisible par le service seul.
set -eu
S=/etc/relais-turn/auth-secret
C=/run/relais-turn/turnserver.conf
[ -s "$S" ] || { echo "secret absent : $S" >&2; exit 1; }
umask 077
{ cat /etc/relais-turn/turnserver.conf; printf '\nstatic-auth-secret=%s\n' "$(cat "$S")"; } > "$C"
chown turnserver:turnserver "$C"
chmod 0600 "$C"
FIN
chmod 0755 /usr/local/sbin/relais-turn-assembler

cat > /etc/systemd/system/relais-turn.service <<'FIN'
[Unit]
Description=Relais coturn de Samper Consulting (appels dans l'app)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=turnserver
Group=turnserver
RuntimeDirectory=relais-turn
RuntimeDirectoryMode=0700
ExecStartPre=+/usr/local/sbin/relais-turn-assembler
ExecStart=/usr/bin/turnserver -c /run/relais-turn/turnserver.conf --pidfile /run/relais-turn/turnserver.pid
Restart=on-failure
RestartSec=5
LimitNOFILE=65536
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=full

[Install]
WantedBy=multi-user.target
FIN

# ── 5. Pare-feu ────────────────────────────────────────────────────
etape "5. Pare-feu : SSH et les ports du relais, rien d'autre"
PORTS_SSH="$(sshd -T 2>/dev/null | awk '$1 == "port" {print $2}' | sort -u || true)"
[ -n "$PORTS_SSH" ] || PORTS_SSH=22
ufw default deny incoming
ufw default allow outgoing
for p in $PORTS_SSH; do ufw allow "$p/tcp" comment 'SSH'; done
ufw allow 3478/udp comment 'STUN et TURN (UDP)'
ufw allow 3478/tcp comment 'STUN et TURN (TCP)'
ufw allow 5349/tcp comment 'TURN sur TLS'
ufw allow "$RELAIS_MIN:$RELAIS_MAX/udp" comment 'ports des relais'
ufw --force enable
ufw status verbose

# ── 6. Certificat ──────────────────────────────────────────────────
etape "6. Certificat Let's Encrypt pour $DOMAINE"
cat > /usr/local/sbin/relais-turn-certificat <<'FIN'
#!/bin/sh
# Lancé par certbot à chaque obtention ou renouvellement (deploy-hook), et par
# installer.sh : copie le certificat pour l'utilisateur du service, puis
# demande à coturn de le recharger (SIGUSR2, coturn 4.6.1) sans couper les
# appels en cours.
set -eu
L="${RENEWED_LINEAGE:?RENEWED_LINEAGE absent}"
install -d -m 0750 -o root -g turnserver /etc/relais-turn/tls
install -m 0644 -o root -g turnserver "$L/fullchain.pem" /etc/relais-turn/tls/fullchain.pem
install -m 0640 -o root -g turnserver "$L/privkey.pem" /etc/relais-turn/tls/privkey.pem
if systemctl is-active --quiet relais-turn.service; then
  systemctl kill -s USR2 relais-turn.service
fi
FIN
chmod 0755 /usr/local/sbin/relais-turn-certificat
certbot certonly --standalone --preferred-challenges http \
  -d "$DOMAINE" -m "$COURRIEL" --agree-tos --no-eff-email --non-interactive \
  --pre-hook "ufw allow 80/tcp comment 'defi Lets Encrypt'" \
  --post-hook "ufw delete allow 80/tcp" \
  --deploy-hook /usr/local/sbin/relais-turn-certificat
# Certificat déjà valide : certbot ne relance pas le deploy-hook, on copie ici.
RENEWED_LINEAGE="/etc/letsencrypt/live/$DOMAINE" /usr/local/sbin/relais-turn-certificat
systemctl enable --now certbot.timer >/dev/null 2>&1 || true

# ── 7. Journaux ────────────────────────────────────────────────────
etape "7. Journaux : sept jours au plus"
cat > /etc/logrotate.d/relais-turn <<'FIN'
# Journal du relais : un fichier par jour, sept gardés, puis effacés.
/var/log/relais-turn/turnserver.log {
  su turnserver turnserver
  daily
  rotate 7
  maxage 7
  missingok
  notifempty
  compress
  delaycompress
  create 0640 turnserver turnserver
  postrotate
    systemctl kill -s HUP relais-turn.service >/dev/null 2>&1 || true
  endscript
}
FIN
install -d -m 0755 /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/relais-turn.conf <<'FIN'
# Journal du système (démarrages du service, connexions SSH) : sept jours.
[Journal]
MaxRetentionSec=7day
FIN
systemctl restart systemd-journald

# ── 8. Service ─────────────────────────────────────────────────────
etape "8. Démarrage du service, et à chaque démarrage de la machine"
systemctl daemon-reload
systemctl enable relais-turn.service >/dev/null
systemctl restart relais-turn.service
sleep 3
if ! systemctl is-active --quiet relais-turn.service; then
  journalctl -u relais-turn.service -n 40 --no-pager || true
  arret "le service relais-turn ne démarre pas (journal ci-dessus)"
fi
echo "  relais-turn actif"

# ── 9. Vérification et secret ──────────────────────────────────────
etape "9. Vérification"
bash "$ICI/verifier.sh" "$DOMAINE" || true

echo
echo "================================================================"
echo "Dernière étape, sur VOTRE ordinateur (pas sur ce serveur), dans le"
echo "dossier de l'app, avec la CLI Supabase déjà connectée :"
echo
echo "  npx supabase secrets set COTURN_DOMAINE=$DOMAINE COTURN_SECRET=$(cat "$ETC/auth-secret") --project-ref $PROJET"
echo
echo "(PowerShell : npx.cmd au lieu de npx.) Le secret reste sur ce serveur"
echo "dans $ETC/auth-secret ; le relire : sudo cat $ETC/auth-secret"
echo "================================================================"
