# Diagnostic — instabilité de la saisie dans le module Recettes

Sprint 4 · Chantier 1 · Établi avant correction.

## Périmètre

Éditeur de recettes côté consultant : `src/modules/consultant-tools/ConsultantTools.jsx`
(composant `ConsultantToolsInner`, ~1940 lignes). C'est là que se fait toute la saisie
de recettes (nom, ingrédients, étapes, prix, allergènes).

## Méthode

Revue du code dans l'ordre du brief : state React → controlled/uncontrolled →
fréquence des saves Supabase → race conditions → optimistic UI → handlers d'unités.

## Ce qui fonctionne déjà (hypothèses du brief corrigées)

Le brief supposait un save Supabase à chaque keystroke. **C'est faux.** L'éditeur
dispose déjà de :

- **Debounce de sauvegarde 600 ms** — `updateSelected()` (l. 183-206) : le state local
  est mis à jour immédiatement, l'`upsertRecette` Supabase est différé de 600 ms après
  la dernière frappe via `saveTimerRef`.
- **UI optimiste** — `setRecettes(...)` est appelé avant toute requête réseau ;
  l'utilisateur voit sa valeur instantanément côté state.
- **Indicateur de sync** — `saveStatus` (`idle`/`saving`/`saved`/`error`) affiché dans
  la barre d'action (l. 1047-1049).
- **Inputs strictement contrôlés** — tous les `<input>`/`<select>`/`<textarea>` utilisent
  `value=` (jamais `defaultValue`). Pas de mélange controlled/uncontrolled.

## Causes racines réelles de l'instabilité

### C1 — Re-render complet du composant à chaque frappe (cause principale)

L'état `recettes` (tableau de toutes les recettes) vit à la racine de
`ConsultantToolsInner`. Chaque frappe appelle `updateSelected()` → `setRecettes()` →
**re-render de la totalité du composant de 1940 lignes** (liste, éditeur, grille
d'ingrédients, étapes, KPIs, modales…).

Sur une frappe rapide, ou sur tablette (CPU plus faible, clavier virtuel), ce
re-render n'a pas le temps de se terminer entre deux `keydown`. React traite alors
les événements sur un DOM en cours de reconciliation → **caractères perdus ou inversés**.
C'est le symptôme « globalement instable » rapporté.

### C2 — Le realtime écrase les éditions en cours

L'abonnement realtime (l. 133-137) re-fetch `listRecettes()` et remplace **tout** le
tableau `recettes` à chaque changement de la table `recettes` — y compris l'écho de la
propre sauvegarde de l'utilisateur. Si l'utilisateur a tapé d'autres caractères entre
le déclenchement d'un save et l'arrivée de son écho, `setRecettes(fresh)` **remplace
la recette en cours d'édition par la version serveur** → les caractères tapés entre
les deux sont perdus, d'où le « rafraîchissement nécessaire ».

### C3 — Le changement d'unité déclenche 3 mises à jour d'état séparées

Le sélecteur d'unité est un `<select>` (l. 1297-1314), pas des boutons — la prémisse
« double-clic » du brief ne s'applique pas. En revanche, son `onChange` enchaîne **3
appels `updateIngredient`** consécutifs (`unite`, `quantite`, `prixUnit`). Chacun fait
un `setRecettes` complet + un reset du timer de save → 3 re-renders + 3 reports du
debounce pour une seule action. États intermédiaires incohérents possibles, et
sensation de « désync ».

### C4 — Pas de flush de la sauvegarde en attente avant navigation

Si l'utilisateur change de recette, change d'établissement ou quitte le module dans
les 600 ms qui suivent une frappe, le timer de debounce est simplement écrasé/perdu :
**la dernière modification n'est jamais persistée**.

### C5 — Aucun filet de sécurité en cas de crash navigateur ou coupure réseau

Aucun backup `localStorage`. En cas de crash de l'onglet ou d'échec réseau du
`upsertRecette`, le travail en cours est perdu. L'erreur est affichée mais sans
reprise automatique au retour du réseau.

### C6 — Pas de détection d'édition concurrente

`upsertRecette` est un dernier-écrit-gagne silencieux. Deux utilisateurs sur la même
recette s'écrasent mutuellement sans aucune alerte.

## Synthèse — ce qui est corrigé en Chantier 1

| Cause | Correction |
|---|---|
| C1 | Champs de saisie à **état local instantané** (`DebouncedField`) : la frappe ne re-render plus tout le composant, seulement le champ. Propagation au parent débouncée 400 ms + flush au blur. |
| C2 | **Anti-clobber realtime** : si la recette sélectionnée est « sale », sa version locale est préservée lors du re-fetch. |
| C3 | **Batch** : le changement d'unité applique `unite`+`quantite`+`prixUnit` en un seul `updateSelected`. |
| C4 | `flushSave()` appelé au changement de recette/établissement et au démontage. |
| C5 | Backup `localStorage` (`sc_recipe_draft_<id>`) + bannière de restauration + retry auto à l'événement `online`. |
| C6 | Détection d'édition concurrente via comparaison du contenu serveur vs dernier état sauvé → toast d'alerte, dernier-écrit-gagne conservé. |
