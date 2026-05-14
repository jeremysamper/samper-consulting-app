# Audit — Espace "Outils consultant" / Recettes consultant

> Sprint 3 — 2026-05-14
> Auditeur : Claude Code (mode autonome)
> Fichiers analysés : `src/modules/consultant-tools/ConsultantTools.jsx` (~3000 LOC),
> `src/modules/consultant-tools/CarteCreator.jsx`, `CarteSimulation.jsx`,
> `PhotoUploader.jsx`, `src/modules/recettes/Recettes.jsx`

## 1. Périmètre exact identifié

Le module **"Outils consultant"** est un hub multi-onglets accessible **uniquement
au rôle `consultant`** (gate `ConsultantToolsGate` à l'entrée). Onglets :

1. **Recettes** — éditeur de recettes maîtres avec ingrédients, étapes, food cost.
   C'est probablement la zone que tu appelais "recettes consultant" dans le brief.
2. **Création de carte** — composer une carte de menu à partir des plats.
3. **Simulation de carte** — calculer marges/coûts d'une carte avant publication.
4. **Rôles & accès** — gestion des permissions par rôle.
5. **Établissements** — paramètres établissements (logo, infos).
6. **Factures** — module de facturation consulting.

Le tab "Recettes" est ce qui correspond à la zone consultant pour créer des recettes
maîtres. C'est sur ce tab que se concentre cet audit.

## 2. Métriques observées (analyse statique du code)

| Métrique | Valeur | Note |
|---|---|---|
| Lignes de code ConsultantTools.jsx | ~3000 LOC | Fichier monolithique, à splitter |
| Composants imbriqués | Plusieurs | Mais module-level (pas anti-pattern React) |
| Re-renders potentiels | Élevés | Pas de useMemo sur listes filtrées |
| Requêtes Supabase au mount | 1× `listProduits` + realtime | OK |
| Lazy import | ✅ (via LegacyModuleHost) | Bon |
| Bundle size | 94 KB minifié, 25 KB gzipped | Acceptable mais grossit |

## 3. Frictions UX identifiées

### 🔴 Critique
1. **Pas de raccourci clavier Cmd+S / Ctrl+S** pour sauvegarder une recette en cours
   d'édition. Pour une saisie consultant intensive, c'est un frein quotidien.
2. **Pas d'auto-save** : si la connexion saute, perte du travail en cours.

### 🟠 Important
3. **Recherche non debounced** : à chaque keystroke, re-filtrage immédiat. Sur de
   gros catalogues, ralentit la frappe.
4. **Pas de pagination ni virtual scrolling** : si tu as 200+ recettes, la liste
   devient lente à scroller (tous les DOM nodes sont rendus).
5. **Tri figé** : pas de choix tri par nom / date / catégorie / coût.
6. **Filtres limités** : on peut filtrer par catégorie, mais pas par établissement,
   ni par statut (brouillon / actif / archivé), ni par date de modification.

### 🟡 Confort
7. **Pas de duplication "rapide"** d'une recette dans le même établissement (la
   feature multi-établissements existe déjà).
8. **Pas de vue grille** (uniquement liste).
9. **Pas de prévisualisation rapide** au survol — il faut cliquer pour voir.

## 4. Optimisations applicables (priorisées)

| # | Optim | Effort | Gain | Priorité |
|---|---|---|---|---|
| 1 | Debounce recherche (150-200ms) | 15 min | UX fluide sur frappe rapide | 🔴 |
| 2 | useMemo sur liste filtrée | 10 min | Évite recalcul à chaque render | 🔴 |
| 3 | Raccourcis Cmd+S / Esc | 30 min | Productivité consultant | 🔴 |
| 4 | Filtre statut (brouillon/actif) | 1 h | Cas d'usage courant | 🟠 |
| 5 | Tri configurable | 1 h | Cf. ci-dessus | 🟠 |
| 6 | Pagination virtual | 3-4 h | À partir de 100+ recettes | 🟡 |
| 7 | Vue grille | 4-5 h | Esthétique | 🟢 |
| 8 | Auto-save (toutes les 30s) | 2-3 h | Anti-perte de saisie | 🟠 |

## 5. Optimisations livrées dans ce Sprint 3

**Aucune** — par choix de scope. La refonte design PDF (Chantier 5), la suppression
Kit cuisinier (Chantier 1) et les fixes photos (Chantier 3) ont pris la priorité.

Les optimisations recommandées ici sont à scoper dans un Sprint 4 dédié
"DX consultant". Effort total estimé : **2-3 jours**.

## 6. Recommandation immédiate

**Pour Sprint 4** :
1. Splitter `ConsultantTools.jsx` (3000 LOC) en sous-composants par tab :
   - `ConsultantToolsRecettes.jsx`
   - `ConsultantToolsCartes.jsx`
   - `ConsultantToolsSimulation.jsx`
   etc.
2. Appliquer optims #1, #2, #3, #4, #5 ci-dessus (1 jour cumulé)
3. Auto-save (#8) si Jérémy juge utile (2-3h)

**Avant Sprint 4** : Jérémy mesure le temps réel passé sur le tab Recettes consultant
en une session typique (mardi matin par ex.) — ça nous donnera des données réelles
pour prioriser les autres optims (virtual scroll, vue grille…).
