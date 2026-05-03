# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
# Install dependencies (use npm.cmd in PowerShell — npm.ps1 may be blocked by execution policy)
npm.cmd install

# Start dev server
npm.cmd run dev
# Then open: http://127.0.0.1:5173/vite-index.html

# Production build
npm.cmd run build

# Lint (src/ only — no test suite)
npm.cmd run lint
```

> Node LTS 22 is required. Node v25+ causes npm to loop without creating `node_modules`. A portable Node 22 is installed under `tools-node/node-v22.22.2-win-x64/` as a fallback.

There are two entry points served by the same Vite dev server:
- `/index.html` — the untouched legacy vanilla-JS app
- `/vite-index.html` — the Vite + React migration (the active development target)

## Architecture overview

This is a multi-tenant culinary management SaaS for a consulting firm. The app is mid-migration from a vanilla-JS legacy app to Vite + React. The `src/` tree is the new Vite app; `components/` contains the original files and is still served raw by Vite so `index.html` keeps working.

### Navigation / routing

There is no client-side router. Page state is a string (e.g. `'dashboard'`, `'cartes'`, `'haccp'`) held in `App.jsx` and persisted to `localStorage`. `LegacyModuleHost.jsx` is a switch statement that lazy-imports and renders the correct module for the current page.

All navigation happens by calling `setPage(pageId)`. Page IDs and their permission keys are defined in `src/modules/moduleConfig.js` alongside aliases (e.g. `recettes` → `cartes`). Calling `setPage` with an alias normalizes it automatically.

For programmatic navigation from within a module (or from legacy code that doesn't have `setPage` in scope), use `navigateToPage(pageId)` from `src/services/navigationService.js`. It calls the registered React handler if one is set, otherwise falls back to writing localStorage and reloading.

### Auth and tenancy

`useAuth` (`src/hooks/useAuth.js`) bootstraps Supabase session on mount and exposes `profile`, `signIn`, `signOut`. A profile has a `role` and `etablissementIds` (array of restaurant/site IDs the user may access).

`useCurrentEtablissement` resolves the active establishment from Supabase, falling back to localStorage for legacy compatibility. The selected establishment flows down as an `etablissement` prop to every module.

### Two database layers

**Clean layer** (`src/services/supabase.js`): typed service objects (`authService`, `profileService`, `etablissementService`, `settingsService`) used by the new hooks.

**Legacy bridge** (`src/services/legacySupabase.js`): a large `SB` object (`SB.db.*`, `SB.realtime`) installed globally on `window` and also stored in a module-level variable. This is what the majority of business modules still call directly via `dbService.getDb()` or `dbService.getBridge()`.

`dbService` (`src/services/dbService.js`) is a thin facade over the legacy bridge. New modules should import it instead of reading `window.SB` directly.

The DB API follows snake_case in Postgres and camelCase in JS; every entity has a `map*FromDB` helper in `legacySupabase.js` that handles the conversion.

Supabase credentials are resolved in order: env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` → `window.SUPABASE_CONFIG` → hardcoded fallback in `src/services/supabase.js`. A `.env` file with these vars is optional but will override the fallback for local overrides.

### Legacy compatibility layer

`src/legacy/legacyApi.js` — reads and writes `window.*` globals for backward compatibility. Key globals: `SB` (database bridge), `DEMO_DATA`, `SOP_TEMPLATES`, `scRead`/`scWrite` (localStorage helpers), `hydrateFromSupabase`, `setPage`.

`src/legacy/loadLegacyModules.js` — runs once on startup (before the user sees the app) to install `SB`, load demo data, SOP templates, and the storage bridge.

`src/legacy/SafeModule.jsx` — error boundary wrapping every lazy module so a crash in one module doesn't crash the entire shell.

### DEMO_DATA

`window.DEMO_DATA` is populated by `loadLegacyModules` and hydrated from Supabase after login. It contains: `permissions`, `roles`, `etablissements`, `utilisateurs`, `planning`, `pertes`, `inventaires`, `recettes`, `cartes`. Access it via `getDemoData()` from `src/data/demoData.js`. New modules should use `dbService` or the typed Supabase services instead of reading `DEMO_DATA` directly.

The `legacyVersion` prop passed to every module increments once after post-login Supabase hydration completes. If a module needs to re-fetch data after login, include it as a `useEffect` dependency.

### Permissions

Roles: `consultant`, `patron`, `resp_cuisine`, `cuisinier`, `serveur`. Per-role permissions (which nav items/modules are visible) are stored in the `permissions` Supabase table and cached in `DEMO_DATA.permissions` after login. `getPermissionsForRole` from `src/data/demoData.js` is the runtime accessor. `consultant` is the only role with access to `factures`, `parametres`, and `roles` pages.

### Realtime

Modules subscribe to Postgres changes via `SB.realtime.subscribe(tableName, callback)`. Each call creates a uniquely named Supabase channel and returns an unsubscribe function. Use in a `useEffect` cleanup to avoid channel leaks.

### Storage

`localStorage` is used for UI preferences (`sc_current_etab`, `sc_theme`, `sc_page`, etc.) via `src/utils/storage.js`. Business data lives in Supabase. The migration is progressively moving remaining localStorage data to `user_settings` (Supabase) for multi-device sync.

### PDF and file exports

`src/services/pdf.js` wraps `jsPDF` + `html2canvas`. Files (PDFs, images) are stored in the Supabase `documents` storage bucket under `<etablissementId>/<timestamp>-<filename>`. Signed URLs are generated per-request (1h expiry for documents, 1-year for recipe photos).

### Styling

All styles are plain JS objects (inline `style={...}` props) — no CSS modules, no Tailwind. Theming is driven by CSS variables set on `<html data-theme="light|dark">` via `useTheme` (`src/hooks/useTheme.js`). Key tokens used throughout: `var(--accent)`, `var(--surface)`, `var(--bg)`, `var(--text)`, `var(--text2)`, `var(--text3)`, `var(--border)`, `var(--nav)`, `var(--nav-text)`, `var(--nav-active)`, `var(--font)`, `var(--font-serif)`.

### UI primitives

`src/components/ui/index.jsx` exports shared components used by new modules:
- `Card` — bordered surface card
- `Btn` — button with variants: `primary`, `ghost`, `danger`, `success`, `tab`, `tabActive`
- `Input` — themed text input
- `TabBar` — horizontal tab row from `[{ id, label, icon? }]`
- `SectionHeader` — title + optional subtitle + optional action slot
- `KpiCard` — metric card with value, delta, and optional chart slot

### Toast notifications

`notify(message, type)` (types: `'info'`, `'success'`, `'warning'`, `'error'`) is installed as a global in `App.jsx` via `installToastGlobals()`. In new React modules, import `notify` directly from `src/components/toast/index.js`. In legacy components, `window.notify` is available.

## Adding a new module

1. Create `src/modules/<name>/` with a main JSX component and an `index.js` re-export.
2. Add a `lazy()` import and a `case` in `LegacyModuleHost.jsx`. Guard with the permission check pattern already used there.
3. Add an entry to `navItems` in `moduleConfig.js` (include `id`, `label`, `icon`, `group`, and `permKey`).
4. Add the `permKey` to `defaultPermissions` for each role in `moduleConfig.js`.
5. If the module is consultant-only, guard via `user.role === 'consultant'` in `LegacyModuleHost.jsx` (see `factures`, `parametres`, `roles` cases).

## Migration rules (ongoing)

1. Keep `window.*` writes confined to `src/legacy/legacyApi.js`.
2. New modules import services via `dbService` or the typed services in `src/services/supabase.js`, not `window.SB` directly.
3. Do not remove `localStorage` fallbacks until DB migration is confirmed in production.
4. Do not touch `components/` files — the legacy app must stay unmodified.
5. After any change, verify both `/index.html` and `/vite-index.html` still load.
