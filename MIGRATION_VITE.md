# Migration Vite - Samper Consulting

Cette migration est volontairement progressive.

L'application historique reste disponible via `index.html` et n'a pas ete modifiee.
La nouvelle entree Vite est `vite-index.html`.

## Commandes

```bash
npm install
npm run dev
```

Vite ouvre `/vite-index.html`. L'application historique reste testable sur `/index.html`.
Sous PowerShell, utiliser `npm.cmd` si `npm.ps1` est bloque par la policy Windows.
Le fichier `.npmrc` desactive audit/fund/progress et reduit le bruit des logs pour stabiliser l'installation Windows.
Si `npm install` boucle sans creer `node_modules`, verifier `node --version` : Node `v25.9.0` a fait bloquer npm pendant les tests. Utiliser Node LTS 22 ou 20 pour installer les dependances.
Sur cette machine, une version portable Node `v22.22.2` a ete installee dans `tools-node/` pour lancer npm sans modifier le Node global.

## Etat de cette livraison

- Ajout du socle Vite + React.
- Ajout de `src/main.jsx` et `src/App.jsx`.
- Ajout d'un service Supabase centralise dans `src/services/supabase.js`.
- `React.StrictMode` est volontairement desactive au debut pour eviter les doubles effets en dev.
- Ajout des hooks de base :
  - `useAuth`
  - `useCurrentEtablissement`
  - `useUserSettings`
  - `useIsMobile`
- Migration Vite initiale de :
  - `components/toast.jsx` vers `src/components/toast/`
  - `components/auth.jsx` vers `src/modules/auth/Auth.jsx`
  - `components/layout.jsx` vers `src/layouts/AppLayout.jsx`
  - `components/dashboard.jsx` vers `src/modules/dashboard/Dashboard.jsx`
  - `components/dashboard-mobile.jsx` vers `src/modules/dashboard/DashboardMobile.jsx`
  - `components/catalogue.jsx` vers `src/modules/catalogue/Catalogue.jsx`
  - `components/recettes.jsx` vers `src/modules/recettes/Recettes.jsx`
  - `components/inventaire.jsx` vers `src/modules/inventaire/Inventaire.jsx`
  - `components/pertes.jsx` vers `src/modules/pertes/Pertes.jsx`
  - `components/documents.jsx` vers `src/modules/documents/Documents.jsx`
  - `components/fiches_salle.jsx` vers `src/modules/fiches-salle/FichesSalle.jsx`
  - `components/haccp.jsx` vers `src/modules/haccp/HACCP.jsx`
  - `components/kit-cuisinier.jsx` vers `src/modules/kit-cuisinier/KitCuisinier.jsx`
  - `components/sop.jsx` vers `src/modules/sop/SOP.jsx`
  - `components/factures.jsx` vers `src/modules/factures/Factures.jsx`
  - `components/planning.jsx` vers `src/modules/planning/Planning.jsx`
  - `components/parametres.jsx` vers `src/modules/parametres/Parametres.jsx`
  - `components/roles.jsx` vers `src/modules/roles/Roles.jsx`
  - `components/consultant-tools.jsx` vers `src/modules/consultant-tools/ConsultantTools.jsx`
  - `components/data.js` vers `src/data/legacyData.js`
  - `components/sop-templates.js` vers `src/data/sopTemplates.js`
  - `components/pdf-utils.js` vers `src/services/pdf.js`
  - `components/supabase.js` vers `src/services/legacySupabase.js`
- Le loader de compatibilite `src/legacy/loadLegacyModules.js` n'importe plus de fichier `components/*`.
  Il initialise seulement Supabase, l'hydratation des donnees et quelques ponts temporaires (`SB`, `DEMO_DATA`, `SOP_TEMPLATES`, `scRead/scWrite`).
- Les anciens globals tiers (`React`, `supabase`, `XLSX`, `html2canvas`, `jspdf`) ne sont plus injectes par la cible Vite : les modules les utilisent via imports explicites.
- Extraction du routage metier Vite dans `src/modules/LegacyModuleHost.jsx`.
- Creation de la structure cible `src/modules/*`.
- Ajout de `.env.example` pour la configuration Vite.
- `vite-index.html` reprend les fonts/icones de l'entree historique.
- Le dashboard Vite est maintenant importe directement, sans repasser par `window.Dashboard`.
- Recettes/cartes est maintenant importe directement, sans repasser par `window.Recettes`.
- Catalogue est maintenant importe directement, sans repasser par `window.Catalogue`.
- Inventaire et pertes sont maintenant importes directement, sans repasser par `window.Inventaire` / `window.Pertes`.
- Documents est maintenant importe directement, sans repasser par `window.Documents`.
- Fiches salle est maintenant importe directement, sans repasser par `window.FichesSalle`.
- HACCP est maintenant importe directement, sans repasser par `window.HACCP`.
- Kit cuisinier est maintenant importe directement, sans repasser par `window.KitCuisinier`.
- SOP est maintenant importe directement, sans repasser par `window.SOP`.
- Planning et pointage sont maintenant importes directement, sans repasser par `window.Planning`.
- Parametres, roles et factures sont maintenant importes directement par les routes Vite et par ConsultantTools.
- ConsultantTools est maintenant importe directement, sans repasser par `window.ConsultantTools`.
- PDFUtils, XLSX, SOP_TEMPLATES et les donnees de demo sont maintenant des imports Vite explicites.
- Le contrat DB historique `SB.db.*` est installe depuis `src/services/legacySupabase.js`, sans charger `components/supabase.js`.
- `getLegacySB()` utilise maintenant un pont memoire module-first ; `window.SB` reste seulement un filet de compatibilite temporaire.
- `LegacyModuleHost` ne cherche plus les composants sur `window.*`.
- Le choix desktop/mobile du dashboard passe par `useIsMobile`, donc il suit les redimensionnements.
- `src/layouts/AppLayout.jsx` reprend les styles inline de `components/layout.jsx` : sidebar pliable, topbar, drawer mobile, alertes et menu logo.
- `src/modules/auth/Auth.jsx` reprend le style inline de `components/auth.jsx` : gradient sombre, panneau, logo, formulaire et footer.
- `src/styles/app.css` reprend les variables globales `oklch(...)`, le focus, les scrollbars et les optimisations mobiles de `index.html`.
- `vite.config.js` sert les anciens fichiers `components/*` sans transformation Vite, afin que `index.html` continue de fonctionner sous le serveur Vite pendant la transition.
- `useAuth` contient un timeout de demarrage pour eviter qu'une session Supabase bloquee laisse l'app sur "Chargement de la session".
- Les modules metier sont charges a la demande avec `React.lazy`, afin de reduire fortement le bundle initial.
- Les donnees legacy completes sont chargees dynamiquement par `loadLegacyModules()` au lieu d'etre importees dans le premier bundle.
- Le build production copie `vite-index.html` vers `dist-vite/index.html`, pour permettre un deploiement a la racine d'un domaine.
- Aucun fichier legacy critique n'a ete modifie.

## Verification effectuee

- `npm install` OK avec Node portable LTS 22.
- `vite build` OK.
- `/index.html` affiche l'ecran de connexion historique sous Vite.
- `/vite-index.html` affiche l'ecran de connexion Vite avec le meme visuel que l'historique.
- Le bundle initial est decoupe : les modules metier, XLSX et PDF ne sont plus charges dans l'entree HTML.

## Ce que tu dois tester

1. `http://127.0.0.1:5173/index.html` : application historique, doit rester identique.
2. `http://127.0.0.1:5173/vite-index.html` : nouvelle coque Vite avec login, layout et modules metier importes en ES modules.
3. Connexion Supabase.
4. Navigation principale.
5. Changement d'etablissement.
6. Un export/import simple si le module utilise XLSX/PDF.

## Regles pour les prochaines etapes

1. Migrer un fichier a la fois.
2. Remplacer les globals par imports explicites.
3. Garder `window.*` seulement dans `src/legacy/*` pendant la phase de transition.
4. Garder `localStorage` uniquement pour les preferences UI locales.
5. Tester `/index.html` apres chaque etape pour confirmer que l'existant n'est pas casse.
6. Tester `/vite-index.html` apres chaque etape pour confirmer que la cible compile.

## Ordre recommande

1. Valider le build Vite complet apres installation des dependances.
2. Fusionner progressivement `src/services/legacySupabase.js` dans `src/services/supabase.js`, methode par methode.
3. Remplacer les derniers ponts `window.*` temporaires de `src/legacy/legacyApi.js` par des hooks/services directs.
4. Extraire les abonnements realtime repetes dans des hooks partages.
5. Reactiver `React.StrictMode` quand les effets realtime auront ete stabilises.

## Points de vigilance

- Ne pas supprimer les fallbacks localStorage tant que la migration DB n'est pas validee en production.
- Ne pas deplacer le compteur de factures sans test de concurrence.
- Eviter les abonnements realtime directement dans les composants migrés : creer un hook partage.
- Ne pas importer un module legacy qui depend encore implicitement d'un autre global non migre.
