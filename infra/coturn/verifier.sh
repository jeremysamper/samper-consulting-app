#!/usr/bin/env bash
# ================================================================
# Vérification du relais coturn, sur le serveur : service, ports, réponse
# STUN, certificat TLS, secret, pare-feu, console fermée. Imprime ensuite un
# identifiant d'essai valable dix minutes pour essai-relais.html (essai du
# relais depuis un navigateur, à faire sur son ordinateur).
#
# Usage, sur le serveur : sudo bash verifier.sh <nom du relais>
# Lancé aussi à la fin d'installer.sh.
# ================================================================
# Sans pipefail : « commande | grep -q » rendrait un faux échec si grep
# s'arrête avant la fin de la sortie (signal SIGPIPE de la commande).
set -u

D="${1:-}"
[ -n "$D" ] || { echo "usage : sudo bash verifier.sh <nom du relais>"; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "lancer avec sudo"; exit 1; }
S=/etc/relais-turn/auth-secret
ok=0
ko=0

verdict() {
  if [ "$2" -eq 0 ]; then echo "  ok      $1"; ok=$((ok + 1)); else echo "  ECHEC   $1"; ko=$((ko + 1)); fi
}

systemctl is-active --quiet relais-turn.service; verdict "service relais-turn actif" $?
systemctl is-enabled --quiet relais-turn.service; verdict "service lancé au démarrage de la machine" $?
ss -lnu | grep -q ':3478 '; verdict "écoute 3478/udp (STUN et TURN)" $?
ss -lnt | grep -q ':3478 '; verdict "écoute 3478/tcp (STUN et TURN)" $?
ss -lnt | grep -q ':5349 '; verdict "écoute 5349/tcp (TURN sur TLS)" $?
! ss -lnt | grep -q ':5766 '; verdict "console telnet fermée (5766)" $?
! ss -lnt | grep -q ':8080 '; verdict "console web fermée (8080)" $?
timeout 8 turnutils_stunclient -p 3478 "$D" 2>&1 | grep -qi 'reflexive'; verdict "réponse STUN de $D" $?
echo | timeout 8 openssl s_client -connect "$D:5349" -servername "$D" -verify_hostname "$D" -verify_return_error >/dev/null 2>&1
verdict "certificat TLS valide pour $D sur 5349" $?
[ "$(stat -c '%a %U %G' "$S" 2>/dev/null)" = "600 root root" ]; verdict "secret réservé à root (0600 root:root)" $?
! grep -q '^static-auth-secret' /etc/relais-turn/turnserver.conf; verdict "aucun secret dans /etc/relais-turn/turnserver.conf" $?
ufw status | grep -q '^Status: active'; verdict "pare-feu actif" $?
[ -f /etc/logrotate.d/relais-turn ]; verdict "rotation des journaux posée (sept jours)" $?

echo
echo "  $ok ok, $ko échec(s)"

if [ -s "$S" ]; then
  EXP=$(( $(date +%s) + 600 ))
  NOM="$EXP:essai-verifier"
  MDP="$(printf '%s' "$NOM" | openssl dgst -sha1 -hmac "$(cat "$S")" -binary | base64)"
  echo
  echo "Essai depuis un navigateur (dix minutes) : ouvrir infra/coturn/essai-relais.html"
  echo "sur votre ordinateur et y coller :"
  echo "  nom du relais : $D"
  echo "  identifiant   : $NOM"
  echo "  mot de passe  : $MDP"
fi

[ "$ko" -eq 0 ]
