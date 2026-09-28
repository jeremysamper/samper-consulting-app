#!/usr/bin/env bash
# Hook SessionStart : démarre le protocole task-observer à chaque session.
# En session cloud (Claude Code sur le web), le journal Windows
# C:\Users\jerem\Documents\Samper Consulting\skill-observations n'est jamais
# monté : on le dit d'emblée pour passer en mode handoff sans demander un
# accès impossible. En local, la consigne habituelle s'applique.

JOURNAL='C:\Users\jerem\Documents\Samper Consulting\skill-observations'

if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  MSG="Task Observer : avant le premier appel d'outil et avant tout plan, invoque le skill task-observer et exécute son Session Start Protocol, en un seul lot avec un ls du journal (${JOURNAL}). Session CLOUD détectée (conteneur Linux) : ce chemin Windows n'y est jamais monté. Si le ls échoue, passe directement en mode handoff sans demander l'accès ; ne crée jamais de second journal. En fin de session, enregistre le handoff dans Google Drive sous le nom handoff-task-observer-AAAA-MM-JJ (sans écraser un handoff du même jour), sinon affiche-le."
else
  MSG="Task Observer : avant le premier appel d'outil et avant tout plan, invoque le skill task-observer et exécute son Session Start Protocol, en un seul lot avec un ls du journal (${JOURNAL}). Si le ls échoue, demande l'accès au dossier Documents\\Samper Consulting ; ne crée jamais de second journal."
fi

jq -n --arg msg "$MSG" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $msg}}'
