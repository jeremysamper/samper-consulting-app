# Migration Vite finalisee

## Etat

- Application servie par Vite + React depuis `src/main.jsx`.
- Build production publie dans `dist-vite/`.
- Deploiement Vercel configure via `vercel.json`.
- Supabase centralise dans `src/services/supabase.js`.
- Acces DB legacy isole derriere `src/services/dbService.js`.
- Navigation applicative isolee derriere `src/services/navigationService.js`.
- React Hooks lint actif avec `react-hooks/rules-of-hooks` strict.

## Modules decoupes

- `consultant-tools` :
  - `CarteCreator.jsx`
  - `CarteSimulation.jsx`
  - `ConsultantTools.constants.js`
  - `ConsultantTools.styles.js`
  - `PhotoUploader.jsx`
- `planning` :
  - `Planning.styles.js`
  - `ShiftCell.jsx`
- `haccp` :
  - `HACCP.constants.js`
  - `HACCP.styles.js`
  - `ZoneForms.jsx`
  - `ZoneTile.jsx`

## Validations

```bash
./tools-node/node-v22.22.2-win-x64/npm.cmd run lint
./tools-node/node-v22.22.2-win-x64/npm.cmd run build
```

Les deux commandes doivent passer avant chaque deploiement.

## Notes restantes

- `localStorage` reste autorise uniquement pour les preferences UI locales et les fallbacks legacy documentes.
- Les modules metier historiques restent compatibles via `dbService` pendant la fin du remplacement progressif des helpers legacy.
- Les prochains decoupages utiles, hors urgence, sont `Catalogue.jsx`, `SOP.jsx`, `Factures.jsx`, `Inventaire.jsx` et `Recettes.jsx`.
