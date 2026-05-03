# Samper Consulting — Modifications apportées

## Résumé

Version mise à jour de l'application avec base de données persistante (localStorage),
boutons fonctionnels, gestion des permissions, et module consultant complet.

## Modifications par fichier

### `components/data.js`
- **Hydratation au boot** : au chargement de la page, `DEMO_DATA` est automatiquement
  rechargé depuis le localStorage (permissions, recettes, cartes, planning,
  inventaires, pertes, utilisateurs, établissements). Tous les modules voient donc
  une base cohérente dès le démarrage.
- **Version des données** passée à `3`. Ne réinitialise plus les données métier,
  seulement la session.
- **Fonction globale `scResetAllData()`** pour tout remettre à zéro (peut être
  appelée depuis la console : `scResetAllData()`).
- **Permissions étendues** : ajout de `fiches_salle` et `haccp` pour tous les rôles.
- **Champs ajoutés aux recettes** : `tempsPreparation`, `tempsCuisson`, `tempsTotal`
  (minutes). Les 3 recettes de démo ont été renseignées.

### `index.html`
- Chargement des composants `fiches_salle.jsx` et `parametres.jsx` qui existaient
  mais n'étaient pas câblés.
- Routes ajoutées dans le switch du router : `fiches_salle`, `parametres`.
- Les gardes `typeof X !== 'undefined'` empêchent tout crash si un composant
  n'a pas encore été chargé.

### `components/planning.jsx` (réécrit)
- **Date du jour par défaut** : ouvre automatiquement sur le lundi de la semaine
  courante (plus de date figée sur avril 2026).
- **Bouton "+ Ajouter horaire"** : vraie modale d'ajout avec champs employé,
  date, début, fin, pause, poste, statut. Durée calculée en direct.
- **Cliquer sur une case vide** ouvre la modale d'ajout pré-remplie avec le bon
  employé et la bonne date.
- **Boutons "Pointer arrivée" / "Pointer départ"** fonctionnels dans la modale
  détail (prennent l'heure système actuelle).
- **Bouton "Réinitialiser pointage"** pour corriger une erreur.
- **Bouton "Modifier"** qui rouvre la modale d'édition sur l'horaire existant.
- Persistance automatique dans `sc_planning`.

### `components/recettes.jsx`
- Lit les recettes depuis le store partagé `sc_recettes` (plus depuis
  `DEMO_DATA.recettes` directement), donc les recettes créées/modifiées par le
  consultant apparaissent immédiatement.
- Re-synchronisation automatique sur `focus` et `storage` (changement depuis
  un autre onglet).
- **Affichage des temps** prépa, cuisson, total dans la fiche recette.

### `components/consultant-tools.jsx` (réécrit — module complet)
Module consultant culinaire entièrement revu, simple d'utilisation :

- **Liste à gauche** : recherche, food cost par recette, sélection active.
- **Éditeur à droite** :
  - Nom, catégorie, statut (brouillon/active/archivée), version
  - Portions, prix de vente
  - Temps de préparation, temps de cuisson, **temps total calculé automatiquement**
  - **Analyse économique live** : coût matière total, coût par portion, food cost
    coloré (vert <30%, orange <35%, rouge >35%), marge brute
  - **Allergènes** : multi-sélection parmi 14 allergènes (gluten, lactose, œufs,
    poissons, crustacés, fruits à coque, sulfites, arachides, soja, céleri,
    moutarde, sésame, mollusques, lupin)
  - **Ingrédients** : ajout/édition/suppression, coût calculé ligne par ligne
  - **Étapes** : ajout, édition, réordonnancement (▲/▼), suppression
  - **Notes du consultant**, dressage, conservation
- **Boutons d'action** : Dupliquer, Supprimer (avec confirmation), Imprimer,
  Export PDF
- **Persistance automatique** : chaque changement est sauvegardé dans
  `sc_recettes` en temps réel.

## Comptes de démonstration

Login par e-mail : `jeremysamper.pro@gmail.com` (consultant)

Ou via le panneau Tweaks (clic en bas à droite) :
- Consultant (Jérémy) — accès total, y compris outils consultant
- Patron — presque tout sauf outils consultant et rôles
- Resp. cuisine — planning, recettes, inventaire, pertes, HACCP
- Cuisinier — planning, recettes, pertes, HACCP
- Serveur — planning, cartes (lecture), fiches salle

## Réinitialiser les données

Pour repartir à zéro, ouvrir la console du navigateur (F12) et taper :

```js
scResetAllData()
```

Cela efface tout le localStorage applicatif et recharge la page.

## Clés localStorage utilisées

- `sc_user` — utilisateur connecté
- `sc_page` — dernière page visitée
- `sc_data_version` — version de la structure de données
- `sc_permissions` — permissions par rôle
- `sc_recettes` — recettes (partagées entre Consultant Tools et Recettes)
- `sc_cartes` — cartes
- `sc_planning` — horaires + pointages
- `sc_inventaires`, `sc_inventaire_selected` — inventaires
- `sc_pertes` — pertes
- `sc_utilisateurs`, `sc_etablissements` — équipe et lieux
- `sc_haccp_zones`, `sc_haccp_tpls`, `sc_haccp_releves`, `sc_haccp_controls` — HACCP
- `sc_fiches_salle` — fiches techniques salle

## Déploiement

Le dossier est prêt pour Vercel, Netlify ou tout hébergeur statique.
Aucun build n'est nécessaire — il suffit d'héberger les fichiers tels quels.
