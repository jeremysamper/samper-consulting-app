# Audit technique — Samper Consulting App

**Branche auditée :** `claude/audit-samper-app-dduQD`
**Date :** 2026-05-03
**Auditeur :** Claude (Anthropic)
**Stack réelle vs documentée :** conforme — Vite 5.4.21 + React 18.3.1 + Supabase 2.45.4 + jsPDF 2.5.1 + xlsx 0.18.5

---

## 🔴 Bloquants

**AUCUN bloquant identifié.** `npm run lint` et `npm run build` passent sans erreur ni warning.

Le build produit `dist-vite/` proprement. Taille bundle gzip (top chunks) : pdf 169 kB, xlsx 142 kB, app 115 kB.

---

## 🟠 Majeurs

### M1 — Credentials Supabase hardcodées dans deux fichiers commités

- **Fichier :** `src/services/supabase.js:5-8`
- **Fichier :** `components/config.js:9-10`
- **Symptôme :** L'URL du projet Supabase (`ppmtoiqgajwcdkbnrcll.supabase.co`) et la clé anon (`sb_publishable_Vp4K1VX34PBe4lID0qFS1w_JD2sc5Ov`) sont codées en dur dans deux fichiers versionnés.
- **Impact :** La clé est de type `sb_publishable_` (clé publique intentionnellement lisible côté client), donc pas de fuite de données directe. Mais : (1) elle est dans l'historique Git, impossible à révoquer sans réécrire l'historique ; (2) l'URL révèle le projet Supabase à quiconque consulte le dépôt ; (3) une future rotation de clé ne serait pas automatique.
- **Fix appliqué :** `src/services/supabase.js` — suppression du `fallbackConfig` hardcodé, remplacement par un warning clair si les env vars sont absentes. `components/config.js` — remplacement des valeurs réelles par des placeholders explicites.
- **Action requise par Jérémy :** Tourner la clé anon dans le Supabase Dashboard > Settings > API > Rotate keys (optionnel mais recommandé si des accès non souhaités sont détectés). S'assurer que `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont bien configurés dans Vercel (Settings > Environment Variables).

---

### M2 — `jspdf@2.5.1` — 7 CVEs sur la dépendance DOMPurify embarquée

- **Fichier :** `package.json:17`
- **Symptôme :** `npm audit` rapporte 1 critique + 6 modérées via `dompurify <= 3.3.3` bundlé dans jsPDF 2.x.
- **CVEs principaux :** GHSA-vhxf-7vqr-mrjg (XSS critical), GHSA-h8r8-wccr-v5f2 (mutation-XSS), GHSA-cjmm-f4jc-qw8r (URI bypass).
- **Impact :** Si du contenu HTML non maîtrisé passe dans la génération PDF (ex. `innerHTML` d'éléments contenant des données utilisateur), une injection XSS est théoriquement possible. Risque modéré dans ce contexte (app interne, utilisateurs authentifiés), mais surface d'attaque réelle.
- **Fix disponible :** `jspdf@4.2.1` (via `npm audit fix --force`) — mais breaking change API à valider.
- **Statut Sprint 1 :** Non appliqué car l'upgrade nécessite des tests fonctionnels des exports PDF. Documenté pour Sprint 2.

---

### M3 — `xlsx@0.18.5` — Prototype Pollution (high) et ReDoS (moderate)

- **Fichier :** `package.json:19`
- **Symptôme :** `npm audit` rapporte GHSA-4r6h-8v6p-xvw6 (Prototype Pollution, high) et GHSA-5pgg-2g8v-p4x9 (ReDoS, moderate).
- **Impact :** Un fichier Excel malicieux importé via les modules Catalogue ou ConsultantTools pourrait exploiter la Prototype Pollution pour altérer le comportement JS global de l'app. Risque concret si des utilisateurs importent des fichiers de fournisseurs externes.
- **Fix disponible :** Aucun sur npm. Le paquet `xlsx` (SheetJS Community) n'est plus maintenu après la v0.18.5. Alternatives : `exceljs`, ou SheetJS Pro (commercial).
- **Statut Sprint 1 :** Non applicable en l'état — remplacement de bibliothèque hors périmètre sprint. Documenté pour Sprint 2.

---

### M4 — `console.log` de debug visibles en production pour tous les utilisateurs

- **Fichier :** `src/services/legacySupabase.js:1500` — s'exécute à CHAQUE chargement d'app
- **Fichier :** `src/data/legacyData.js:378` — s'exécute à chaque login
- **Fichier :** `src/layouts/AppLayout.jsx:54` — s'exécute si migration logo localStorage
- **Fichier :** `src/modules/consultant-tools/ConsultantTools.jsx:446,590,594,596,618` — 5 logs à chaque import Excel
- **Fichier :** `src/modules/parametres/Parametres.jsx:166` — à chaque sauvegarde d'établissement
- **Impact :** Pollue la console des navigateurs utilisateurs, révèle des infos d'architecture (noms de tables, IDs internes), et peut impacter les performances DevTools des utilisateurs en mode inspection.
- **Fix appliqué :** Suppression des 5 `console.log` (en conservant les `console.warn` et `console.error` qui restent utiles pour le débogage).

---

## 🟡 Mineurs

### mn1 — `react-hooks/exhaustive-deps` désactivé sur tous les modules

- `eslint.config.js:32-40` — La règle `exhaustive-deps` est `off` pour `src/modules/**/*` et `src/layouts/AppLayout.jsx`.
- Risque de stale closures ou boucles infinies non détectées. Acceptable pendant la migration mais à réactiver progressivement après stabilisation.

### mn2 — Pas de Content-Security-Policy dans `vercel.json`

- `vercel.json:5-14` — X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy sont présents, mais pas de `Content-Security-Policy`.
- Sans CSP, les injections XSS côté contenu ne sont pas bloquées au niveau navigateur. À ajouter avec une politique `default-src 'self'` + whitelist minimale (fonts.googleapis.com, supabase).

### mn3 — Google Fonts sans Subresource Integrity (SRI)

- `vite-index.html:12` — La feuille de style Google Fonts est chargée sans hash SRI ni `crossorigin`.
- Risque théorique si Google Fonts est compromis (MITM). Acceptable pour une app interne mais à noter.

### mn4 — `components/` exclu du lint

- `eslint.config.js:9` — Le code legacy dans `components/` n'est jamais analysé par ESLint.
- Les bugs dans les composants legacy ne remontent pas lors d'un `npm run lint`.

### mn5 — Duplication massive entre `components/supabase.js` et `src/services/legacySupabase.js`

- Les deux fichiers partagent ~90% du même code (helpers DB, realtime, mappers).
- Double maintenance : toute correction de bug doit être faite dans les deux fichiers. Source de divergence lors de la migration.

### mn6 — IDs générés avec `Date.now()` — collision possible

- `src/services/legacySupabase.js` et `components/supabase.js` — Des IDs comme `'rec-' + Date.now() + Math.floor(Math.random() * 1000)` sont non-uniques si deux créations surviennent dans la même milliseconde (rare mais possible sur multi-device).
- Utiliser `crypto.randomUUID()` (disponible nativement en HTTPS) ou un UUID v4.

### mn7 — `esbuild <= 0.24.2` — dev server vulnerability (moderate)

- Via `vite@5.4.21` (devDependency). N'affecte que le serveur de développement local, pas le build de production.
- Fix via `vite@8.0.10` (breaking change majeur). À planifier.

---

## ⚙️ Recommandations d'architecture

### A1 — Calendrier de fin de migration legacy → src/

Les 15 modules sont tous présents dans `src/modules/`. Le dossier `components/` et `index.html` sont encore nécessaires uniquement si des utilisateurs accèdent encore à l'ancienne URL `/index.html`. Une fois confirmé que tout le trafic passe par `/` (Vite), on peut :
1. Supprimer `legacyRawComponentsPlugin` de `vite.config.js`
2. Supprimer `components/` et `index.html`
3. Simplifier `src/legacy/` (ne garder que le bridge)

**Question pour Jérémy :** Est-ce que `/index.html` est encore utilisé en production ou le trafic passe-t-il exclusivement par `/` (Vite) ?

### A2 — ESLint v10 — stratégie de mise à jour

`"eslint": "^10.2.1"` est stable pour ce projet (lint passe proprement). Le `eslint-plugin-react-hooks@7.1.1` est compatible. En revanche, `eslint-plugin-react` (règles JSX, prop-types) n'est pas installé — à considérer si la qualité JSX doit être auditée.

### A3 — Upgrade jspdf v2 → v4 (Sprint 2)

L'API `new jsPDF(...)` devrait rester compatible mais il faut tester les 3 exports (printElement, exportElementToPdf, elementToBlobPDF) dans les modules Factures, Planning, SOP, Recettes, HACCP. À planifier avec tests manuels sur un environnement de staging.

### A4 — Remplacement de xlsx (Sprint 2+)

Options :
- **`exceljs`** : API riche, maintenu actif, mais migration non triviale (API très différente).
- **Verrouiller xlsx@0.18.5 + monitoring CVE** : Acceptable à court terme si l'import Excel est réservé au consultant (fichiers maîtrisés).

**Question pour Jérémy :** Les imports Excel (Catalogue, ConsultantTools) sont-ils utilisés avec des fichiers de fournisseurs externes (non maîtrisés) ?

### A5 — Consolider les couches Supabase

Actuellement : `components/supabase.js` (legacy browser) + `src/services/legacySupabase.js` (Vite compat) + `src/services/supabase.js` (Vite natif). Après migration legacy → src/, ne conserver que `src/services/supabase.js` et supprimer les deux autres.

---

## Résumé des corrections appliquées dans Sprint 1

| # | Fichier | Action |
|---|---------|--------|
| M1a | `src/services/supabase.js:4-8` | Suppression du `fallbackConfig` avec credentials hardcodés |
| M1b | `components/config.js:8-11` | Remplacement des credentials réels par des placeholders |
| M4a | `src/services/legacySupabase.js:1500` | Suppression `console.log('[Supabase] Client initialisé ✓')` |
| M4b | `src/data/legacyData.js:378` | Suppression `console.log('[Data] Hydraté depuis Supabase ✓')` |
| M4c | `src/layouts/AppLayout.jsx:54` | Suppression `console.log('[Migration] sc_app_logo ...')` |
| M4d | `src/modules/consultant-tools/ConsultantTools.jsx:446,590,594,596,618` | Suppression de 5 `console.log` de debug Excel |
| M4e | `src/modules/parametres/Parametres.jsx:166` | Suppression `console.log('[Parametres] Établissement sauvegardé:...')` |
