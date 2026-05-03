# AUDIT.md — Sprint 1 — Stabilisation Samper Consulting

**Date :** 3 mai 2026  
**Branche :** `audit/stabilization-sprint-1`  
**Stack auditée :** Vite 5.4.21 · React 18.3.1 · Supabase 2.45.4 · ESLint 10.2 · Vercel

---

## 🔴 Bloquants

> Aucun bloquant identifié. Le build (`npm run build`) et le linter (`npm run lint`) passent tous les deux proprement — 0 erreur, 0 warning. L'application est buildable et deployable sans aucune modification préalable.

---

## 🟠 Majeurs

### M-1 — Credentials Supabase codés en dur dans le source
- **Fichier :** `src/services/supabase.js:5-6`
- **Symptôme :** L'URL Supabase (`https://ppmtoiqgajwcdkbnrcll.supabase.co`) et la clé anon (`sb_publishable_Vp4K1VX34PBe4lID0qFS1w_JD2sc5Ov`) sont hardcodées dans le `fallbackConfig`. Elles se retrouvent dans le bundle JS final — visibles par tout utilisateur via les DevTools.
- **Impact :** Toute copie/fork du repo (ou tout déploiement sans `.env`) pointe silencieusement vers le projet Supabase de production. Risque de pollution de données ou d'accès involontaire à la prod.
- **Fix appliqué :** Ajout d'un `console.warn` explicite quand le fallback est actif. La clé `sb_publishable_` est une anon key (conçue pour être publique) donc pas de rotation immédiate nécessaire. À terme : supprimer le fallback hardcodé et rendre les variables `.env` obligatoires.

### M-2 — `.claude/` non ignoré par git
- **Fichier :** `.gitignore`
- **Symptôme :** Le répertoire `.claude/` (Claude Code — mémoire, settings locaux, historique de session) n'était pas listé dans `.gitignore`. Tout `git add .` pouvait commettre des fichiers d'IA contenant du contexte de session sensible.
- **Impact :** Fuite potentielle du contexte de conversation, des préférences locales et de la mémoire projet vers le dépôt public/privé.
- **Fix appliqué :** `.claude/` ajouté au `.gitignore`.

### M-3 — Console.log de debug en production
- **Fichiers concernés :**
  - `src/services/legacySupabase.js:1500` — `[Supabase] Client initialisé ✓`
  - `src/data/legacyData.js:378` — `[Data] Hydraté depuis Supabase ✓ { etabs, users }`  
  - `src/layouts/AppLayout.jsx:54` — `[Migration] sc_app_logo localStorage → DB`
  - `src/modules/parametres/Parametres.jsx:166` — `[Parametres] Établissement sauvegardé: <id> <nom>`
  - `src/modules/consultant-tools/ConsultantTools.jsx:446,590,594,596,599,618` — logs de parsing Excel internes
- **Symptôme :** Ces `console.log` exposent dans la console navigateur des IDs d'entités, des noms d'établissements, des comptes d'utilisateurs et de la logique interne de parsing.
- **Impact :** Fuite d'informations opérationnelles, facilite le reverse-engineering de la logique métier, peut confondre les utilisateurs finaux qui ouvrent la console.
- **Fix appliqué :** Tous ces `console.log` supprimés. Les `console.error` et `console.warn` des blocs catch ont été maintenus (nécessaires pour le diagnostic d'erreurs).

### M-4 — Absence de Content-Security-Policy (Vercel)
- **Fichier :** `vercel.json`
- **Symptôme :** Les headers de sécurité (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) sont bien en place, mais il n'y a pas de `Content-Security-Policy`.
- **Impact :** Sans CSP, une injection XSS éventuelle n'est pas contenue. Pour une SaaS gérant des données restauration sensibles (planning, pertes, factures), c'est un écart de posture sécurité.
- **Fix proposé :** Ajouter dans `vercel.json` un header CSP minimal compatible avec le build Vite (modules externes, Google Fonts, Supabase websockets). Nécessite tests de non-régression sur les deux entrées HTML avant merge en prod. **Non implémenté dans ce sprint** — décision à valider avec Jérémy avant d'appliquer (risque de casser des assets si mal configuré).

---

## 🟡 Mineurs

### m-1 — Pas de Subresource Integrity (SRI) sur les CDN de l'app legacy
- **Fichier :** `index.html`
- **Symptôme :** Les scripts chargés depuis `unpkg.com` et `jsdelivr.net` (React, ReactDOM, Babel, xlsx, html2canvas, jsPDF, Supabase) n'ont pas d'attribut `integrity`. Un CDN compromis pourrait injecter du code malveillant.
- **Fix proposé :** Ajouter des hashes SRI sur chaque balise `<script src="...">` de `index.html`. Accepté pour la durée de la migration (le legacy est voué à disparaître).

### m-2 — Bundle `xlsx` et `pdf` très volumineux (non splitté)
- **Observation :** `xlsx` = 424 KB (141 KB gzip), `pdf` (jsPDF + html2canvas) = 570 KB (169 KB gzip). Ces chunks sont chargés de manière lazy uniquement via les modules qui les importent, mais leur taille rallonge le premier chargement de Recettes, ConsultantTools et Documents.
- **Fix proposé :** Dynamic import de `xlsx` et `jsPDF` au moment de l'action (export/import), pas au chargement du module. Réduit de ~50-70% le JS initial des modules concernés. À planifier en Sprint 2.

### m-3 — `chunkSizeWarningLimit` relevé à 650 KB dans `vite.config.js`
- **Fichier :** `vite.config.js:72`
- **Symptôme :** Le seuil d'alerte Vite pour les chunks volumineux a été monté à 650 KB pour masquer les warnings liés à xlsx et pdf. La limite par défaut est 500 KB.
- **Fix proposé :** Implémenter le dynamic import (m-2 ci-dessus) et redescendre la limite à 500 KB.

### m-4 — `FAQAssistant` : avatar codé en dur `'JS'`
- **Fichier :** `src/modules/faq/FAQAssistant.jsx:54`
- **Symptôme :** Le composant affiche `'JS'` hardcodé dans l'avatar plutôt que `user?.avatar`.
- **Fix proposé :** Remplacer par `{user?.avatar || 'SC'}`. Fix trivial (1 ligne).

### m-5 — `console.error` dans `handleLogout` de `index.html` sans message utilisateur
- **Fichier :** `index.html:288`
- **Symptôme :** `catch (e) { console.error(e); }` sur le logout Supabase — l'utilisateur ne reçoit pas de feedback visuel en cas d'échec de déconnexion.
- **Note :** Concerne l'app legacy (`index.html`) — hors périmètre de modification selon les règles du sprint.

### m-6 — CSS dupliqué entre `index.html` et `src/styles/app.css`
- **Observation :** Les variables CSS (palette, police, reset), les animations et les media queries sont définies deux fois — une fois en inline dans `index.html` (legacy) et une fois dans `src/styles/app.css` (Vite). Toute modification de thème doit être synchronisée manuellement dans les deux fichiers.
- **Fix proposé :** Acceptable pendant la migration. À résoudre lors de la dépréciaton de `index.html`.

### m-7 — `xlsx` v0.18.5 — version ancienne (2020)
- **Fichier :** `package.json`
- **Symptôme :** La version 0.18.x de `xlsx` (SheetJS Community Edition) date de 2020-2021. Des CVEs ont été publiées sur des versions antérieures. Le package a changé de licensing depuis.
- **Fix proposé :** Évaluer la migration vers `SheetJS Pro` (si l'usage commercial le justifie) ou `exceljs` (MIT, maintenu activement). Décision à prendre avec Jérémy.

---

## ⚙️ Recommandations d'architecture

### A-1 — Finaliser la migration legacy → `src/` : quel calendrier ?
L'architecture actuelle maintient deux systèmes complets en parallèle : `index.html` + `components/*.jsx` (legacy Babel/CDN) et `vite-index.html` + `src/` (Vite/React). Les 15 modules sont désormais implémentés des deux côtés. La coexistence alourdit la maintenance (CSS dupliqué, logique de permissions en double, `legacyRawComponentsPlugin` dans `vite.config.js`). **Recommandation :** fixer une date de dépréciation de `index.html` (suggéré : après 30 jours de stabilité Vercel sur `vite-index.html`), puis retirer `components/`, `legacyRawComponentsPlugin`, et `productionIndexPlugin` d'un coup.

### A-2 — ESLint v10 : stable ou revenir à v9 ?
`package.json` déclare `"eslint": "^10.2.1"`. Le lint fonctionne correctement avec cette version sur la base de code actuelle. ESLint v10 a introduit des breaking changes sur les config files (le projet utilise déjà le format `eslint.config.js` flat config, donc compatible). **Recommandation :** maintenir v10 tant que le lint passe ; surveiller les release notes pour les breaking changes lors des prochaines mises à jour.

### A-3 — Retirer `legacyRawComponentsPlugin` après fin de migration
Ce plugin Vite ne sert qu'en `dev` (uniquement dans `configureServer`) et n'a aucun impact sur le build de production. Il peut être retiré dès que `index.html` est déprécié. Aucun risque à l'actuel si on le laisse en place — il sert à maintenir le serveur de dev compatible avec les deux entrées.

### A-4 — Consolider la couche d'accès données
Trois points d'accès à Supabase coexistent : `src/services/supabase.js` (services typés), `src/services/legacySupabase.js` (bridge legacy `SB`), et `src/services/dbService.js` (façade). Les nouveaux modules appellent `dbService.getDb()` qui retourne le bridge legacy. **Recommandation à long terme :** migrer progressivement vers les services typés (`authService`, `etablissementService`, etc.) et créer des services équivalents pour les entités manquantes (recettes, planning, haccp...). Pas urgent, mais chaque nouveau module devrait cibler les services typés.

### A-5 — Content-Security-Policy (suite de M-4)
Une CSP compatible avec ce build Vite devrait inclure :
```
default-src 'self';
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob:;
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
```
Le `'unsafe-inline'` sur `style-src` est nécessaire pour les inline styles React. Tester impérativement sur les deux entrées HTML et via `npm run preview` avant d'activer en production.
