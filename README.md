# Samper Consulting — Application web

Application web de consulting F&B multi-établissements pour Samper Consulting.

## Stack

- **Frontend** : Vite 5 + React 18
- **Backend** : Supabase (auth + realtime + storage)
- **Déploiement** : Vercel
- **Build** : `npm run build` → `dist-vite/`

## Modules

15 modules opérationnels, accessibles selon les rôles :

| Module | Rôles | Fonction |
|---|---|---|
| Dashboard | tous | KPIs et accès rapide |
| Planning | tous | Plannings hebdo + pointage |
| Recettes | chef, consultant | Fiches techniques, food cost, scaling |
| Cartes | chef, consultant | Composition de cartes |
| Inventaire | responsable, chef, consultant | Stocks théoriques/réels, écarts |
| Pertes | responsable, chef, consultant | Saisie pertes par cause |
| HACCP | tous (selon perm) | Relevés de température, traçabilité |
| Fiches salle | serveur, responsable, consultant | Briefs et notes service |
| Documents | tous (selon perm) | GED hiérarchique avec lecture inline |
| Factures | consultant | Émission de factures de prestation |
| Rôles & Accès | consultant | CRUD utilisateurs, gestion permissions |
| Paramètres | tous | Préférences utilisateur |
| Outils consultant | consultant | Établissements, outils internes |
| Catalogue | chef, consultant | Base produits / fournisseurs |
| Kit cuisinier | chef, consultant | Bibliothèque de kits SOP |

## Logique multi-établissements

L'application gère plusieurs établissements (Woodland Village, Hôtel Panorama, etc.) avec un sélecteur global. Toutes les données métier (planning, recettes, inventaire, etc.) sont filtrées par `etablissementId`.

## Rôles et permissions

- **consultant** — accès total
- **chef** — accès cuisine, recettes, inventaire, HACCP
- **responsable** — accès opérationnel et inventaire
- **serveur** — accès limité salle et planning

Les modules sont **cachés** dans la navigation si la permission n'est pas accordée (`perms[key] !== true`).

## Démarrage local

```bash
# Installation des dépendances
npm install

# Copier .env.example en .env et remplir les valeurs Supabase
cp .env.example .env

# Lancer le serveur de dev
npm run dev
```

L'app est servie sur `http://127.0.0.1:5173/vite-index.html`.

Voir [DEMARRAGE.md](./DEMARRAGE.md) pour les détails Windows / Git Bash / Node portable.

## Build production

```bash
npm run build
npm run preview
```

Le build est généré dans `dist-vite/`. Vercel utilise cette configuration via `vercel.json`.

## Configuration Supabase

Les variables d'environnement requises sont dans `.env.example`. Les schémas SQL sont dans :

- `supabase-setup-user-settings.sql`
- `supabase-setup-factures-compteurs.sql`

Et dans le code à `src/services/supabase.js`.

## Workflow de contribution

1. **Toujours** travailler sur une branche dédiée (jamais sur `main`)
2. Format de branche : `feature/nom-court`, `fix/bug-description`, `audit/sprint-N`
3. Pull Request vers `main` avec description structurée
4. Validation manuelle avant merge
5. Vercel redéploie automatiquement après merge sur `main`

## Documentation interne

- [DEMARRAGE.md](./DEMARRAGE.md) — guide de démarrage local Windows
- [DEPLOIEMENT.md](./DEPLOIEMENT.md) — procédure de déploiement Vercel
- [MIGRATION_VITE.md](./MIGRATION_VITE.md) — historique de la migration vers Vite
- [MIGRATION_FINALISEE.md](./MIGRATION_FINALISEE.md) — état actuel de l'architecture
- [MODIFICATIONS.md](./MODIFICATIONS.md) — journal des modifications

## Contact

Jeremy Samper — Samper Consulting — jeremysamper.pro@gmail.com
