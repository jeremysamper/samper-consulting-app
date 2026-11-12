---
paths:
  - "src/**/*.jsx"
  - "src/**/*.js"
  - "src/**/*.css"
---

# Direction Office

Direction d'apparence de l'app, choisie par Jérémy le 11.11.2026 : menu latéral clair, panneaux légers sur fond gris, titres sans serif, boutons secondaires à contour, rayon de 8 px, accent réservé à l'action principale. Les valeurs sont dans `src/styles/app.css` (bloc `:root` et les deux blocs sombres, identiques entre eux). Tout écran neuf naît dans cette direction.

## Échelle
- Tailles de texte : `--t1` 12 px, `--t2` 14, `--t3` 17, `--t4` 20, `--t5` 24, `--t6` 29. Rien sous 12 px.
- Graisses : `--g1` 400, `--g2` 500, `--g3` 600. Jamais 700 ni plus. Chiffres mis en avant : `--font-num`, graisse `--g-chiffre` (400), zéro simple.
- Rayon : 8 px (`--r-sm`, `--r`, `--r-lg` et `--r-xl` valent tous 8 px). La pilule `--r-full` reste aux étiquettes.
- Hauteurs : contrôle `--controle` (40 px), cible de 44 px au doigt, ligne de liste `--ligne`.

## Jetons par rôle
- Action principale : fond `--accent`, texte `--on-accent`. C'est le seul aplat d'accent, avec le mode actif de la caisse.
- Bouton secondaire : `--btn-fond`, `--btn-texte`, contour `--btn-bord`.
- Survol, ligne ou entrée choisie, puce active : `--selection` avec `--text`. Jamais `--surface2`, qui vaut la surface.
- Panneau : fond `--zone`, filet `--rule-soft`. Champ : contour `--champ-bord`, fond `--surface`.
- Onglet actif et marqueur du jour : `--onglet`. Texte qui portait l'accent : `--lien` ou `--text`.
- Toast ou bandeau sombre : `--toast-fond` et `--toast-texte` ; le statut est porté par le picto (`--toast-succes`, `--toast-danger`, `--toast-alerte`).
- Statuts, services, caisse, IA : leurs jetons d'avant (`--success-*`, `--danger-*`, `--warning-*`, `--info-*`, `--svc-*`, `--caisse-*`, `--ai-*`). Un marqueur d'état peut changer de couleur, il ne disparaît pas.

## Interdits
- Lire `--nav*` hors de la coque (`src/layouts/AppLayout.jsx`, `src/components/nav/`, règles `.sc-nav-*` et `.nav-organizer*`). Un texte blanc littéral sur `--nav` est refusé par `npm.cmd run lint:on-color`.
- Couleur en dur, `gradient(`, `blur(`, `text-shadow`, `uppercase`, `backdrop-filter` autre que `none`, halo coloré, émoji.
- Une règle globale qui reprend une couleur ne vise que la valeur neutre nommée (`--border`, `--border2`), jamais tout élément qui porte la propriété.
- Un jeton de couleur nouveau sans son miroir dans `THEME_VAR_OVERRIDES` (`src/design/brandTokens.js`), ou sans ses deux valeurs sombres identiques.
- Restyler le Spa, le KDS, la FAQ ou `src/reservation/`, qui gardent leur système.

## Primitives
- Passer par `src/components/ui/` (`Btn`, `Input`, `Card`, `SectionHeader`, `Fenetre`) plutôt que redessiner un bouton, un champ ou un panneau.
- Un bloc qui doit garder son cadre porte `data-cadre` ; sans lui, la règle « Plus de carrés » d'`app.css` l'aplatit.

## Béquilles
La section « Direction Office », en fin d'`app.css`, rattrape les styles en ligne d'avant : taille sous 12 px, graisse 700, rayons, accent en texte, contour des champs. Elle ne s'applique pas dans une vue capturée en PDF. Un module repris écrit ses valeurs à la source ; une béquille tombe quand plus aucun élément ne l'atteint.
