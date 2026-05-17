# Sprint 4 — Questions ouvertes & décisions prises en autonomie

Ce fichier est mis à jour au fil des 4 chantiers.

## Décisions prises en autonomie

### Chantier 1 — Stabilisation de la saisie

1. **Écarts brief / code constatés au diagnostic.** Le brief supposait un save
   Supabase à chaque keystroke. En réalité, le debounce 600 ms, l'UI optimiste et
   l'indicateur de sync existaient déjà. Le diagnostic réel (voir
   `DIAGNOSTIC-RECIPES-SAISIE.md`) pointe le re-render complet du composant et
   l'écrasement realtime. Les corrections ont été recalibrées en conséquence.

2. **Sélecteur d'unité = `<select>`, pas des boutons.** Le brief demandait une
   protection double-clic sur des « boutons unités ». L'UI réelle est un `<select>`
   natif. La « désync » signalée venait des 3 mises à jour d'état séparées par
   changement d'unité → corrigé par un batch en un seul `updateSelected`.

3. **Conflit d'édition — le champ `version` n'est PAS détourné.** Le brief suggérait
   d'incrémenter `version` comme compteur de verrou optimiste. Or `version` est un
   champ métier éditable par le consultant (versionnage culinaire d'une recette).
   La détection de conflit se fait par comparaison du contenu serveur avec le dernier
   état sauvegardé (`serializeRecipeCore`) + toast d'alerte. Stratégie conservée :
   dernier-écrit-gagne, conformément au brief.

## Questions ouvertes pour Jérémy

### Environnement de développement

- **`.env` absent du dépôt.** `src/services/supabase.js` lève une erreur si la
  configuration Supabase est absente (le fallback hardcodé mentionné dans AUDIT.md
  M-1 a été retiré depuis). Pour permettre le dev local, un fichier `.env`
  (gitignored, non commité) a été créé à partir des valeurs *publishable* déjà
  présentes dans `AUDIT.md`. **À confirmer :** ces valeurs sont-elles toujours
  valides ? Sinon, fournir l'URL + la clé publishable à jour.
- **`tools-node/` inexistant.** `CLAUDE.md` mentionne un Node 22 portable sous
  `tools-node/node-v22.22.2-win-x64/` comme fallback — ce dossier n'existe pas.
  Node 22 a été installé séparément. CLAUDE.md mériterait une mise à jour.

### Tests interactifs

- Les tests interactifs de l'éditeur de recettes (frappe rapide 30 caractères,
  clics rapides sur les unités, coupure réseau, viewport tablette) nécessitent un
  **login consultant**. Ils sont donc à réaliser côté Jérémy — cohérent avec le
  test tablette déjà prévu de ton côté après merge de la PR 1. Vérifications
  automatisées effectuées : `lint` ✓, `build` ✓, boot de l'app ✓, transformation
  dev de tous les modules ✓.
