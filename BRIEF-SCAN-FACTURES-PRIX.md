# BRIEF — Scan factures, alias fournisseurs et prix vivants

Chantier : automatiser la mise à jour des prix produits par photo de facture / bon de livraison,
créer les produits manquants, mémoriser les libellés fournisseurs, et propager le prix résolu
vers le coût matière des recettes sans jamais renommer les ingrédients.

Auteur : Jérémie Samper · Date : 10.08.2026 · Statut : à valider avant exécution

---

## 0. État des lieux vérifié en production (10.08.2026)

Chiffres relevés sur la base prod, ils conditionnent tout le séquencement.

| Fait | Valeur | Conséquence |
|---|---|---|
| `produits` | 803 lignes | catalogue déjà nourri |
| `fournisseurs` | 6 lignes | peu de fournisseurs, alias gérables |
| `produit_fournisseurs` | **0 ligne** | la table multi-fournisseurs existe mais n'a JAMAIS servi. Aucune donnée à migrer, terrain vierge |
| `recettes` | 477 lignes | |
| ingrédients de recettes | 2 763 | stockés en JSONB dans `recettes.ingredients` |
| ingrédients liés à un produit (`produitId`) | **79 (2,9 %)** | la propagation de prix ne sert à rien tant que ce taux ne monte pas |
| ingrédients avec `prixUnit > 0` | 97 | prix **gelés** au moment du lien |

**Conclusion de séquencement** : le scan n'est pas le premier maillon utile. Sans liaison massive
ingrédient → produit, un prix parfaitement scanné n'atteint aucune recette. Le sprint 2 (liaison
en masse + prix vivant) doit précéder le sprint 4 (scan).

### Ce qui existe déjà et doit être réutilisé, pas réécrit

- `src/services/recipeProductMatching.js` : matching 3 passes (exact / Levenshtein / Jaccard), synonymes, statuts `matched | ambiguous | none | excluded`.
- `supabase/functions/ai-proxy/index.ts` : supporte déjà la **vision** (`ocr-recipe` prend `imageBase64` + `mediaType`), le parsing structuré (`parse-catalogue`), le matching IA (`match-product`), et le gate de rôle serveur `TASK_ROLES`.
- `src/services/aiProxy.js` : `callAiProxy(task, payload)`, appel générique.
- `src/modules/catalogue/import/CatalogueAiImporter.jsx` + `CatalogueImportPreview.jsx` : écran d'import IA avec revue avant écriture. **Modèle d'UX à reprendre.**
- `src/modules/haccp/Tracabilite.jsx:222` : capture caméra iPad, `<input type="file" accept="image/*" capture="environment">`.
- `src/modules/consultant-tools/ConsultantTools.constants.js` : `convertFactor` (g↔kg, ml↔L↔cl seulement) et `adjustPrixUnitForUnit`.
- RLS : helper existant `user_can_access_etab(etablissement_id)`, utilisé par `produits`, `fournisseurs`, `produit_fournisseurs`.

### Deux contraintes de `produit_fournisseurs` relevées à l'application de la migration

Elles n'étaient documentées nulle part et changent l'écriture du sprint 4.

1. **`prix_unitaire` est une colonne GÉNÉRÉE**, pas une colonne saisie. Son expression :
   `prix_achat / (quantite_cond × 1000)` pour `kg` et `L`, `prix_achat / quantite_cond` sinon,
   et `prix_achat` seul quand le conditionnement est absent. Toute tentative d'y écrire une
   valeur échoue avec `cannot insert a non-DEFAULT value into column "prix_unitaire"`.
   Le scan doit donc renseigner `prix_achat` + `quantite_cond` + `unite_cond` et laisser
   Postgres calculer. Le bridge `upsertProduitFournisseur` respecte déjà cette règle.
2. **Index unique `idx_pf_unique (produit_id, fournisseur_id)`** : un produit ne peut avoir
   qu'UNE référence par fournisseur. « Plusieurs références » veut donc dire « plusieurs
   fournisseurs ». Le scan met à jour la ligne existante du fournisseur plutôt que d'en
   insérer une seconde, sinon il se heurte à cette contrainte dès la deuxième facture.

### Schéma existant (IDs en TEXT, pas UUID)

```
produits(id text pk, etablissement_id text, nom, categorie, sous_categorie,
         unite_ref text default 'g', prix_unitaire numeric, fournisseur_id text,
         reference_fourn text, conditionnement text, actif bool, notes, allergenes text[])

produit_fournisseurs(id text pk, produit_id text, fournisseur_id text,
         prix_achat numeric not null, conditionnement text, quantite_cond numeric,
         unite_cond text, prix_unitaire numeric GENERATED, est_principal bool default false,
         reference text, delai_livraison text, notes text, updated_at timestamptz)
         -- index unique idx_pf_unique (produit_id, fournisseur_id)

fournisseurs(id text pk, etablissement_id text, nom, contact, tel, email, adresse, notes, actif)
```

---

## 1. Décisions verrouillées

Ces points ne sont pas à rediscuter pendant l'exécution.

| # | Décision | Justification |
|---|---|---|
| D1 | **Le nom de l'ingrédient de recette ne change JAMAIS.** Lier un produit pose `produitId`, rien d'autre côté libellé. | Demande explicite. Bug actuel : `applyProductToIngredient` (`ConsultantTools.jsx:96`) fait `nom: product.nom` et écrase le nom de cuisine par le nom fournisseur. |
| D2 | **Prix résolu à la lecture**, jamais recopié en base dans le JSONB. `prixUnit` reste en repli pour les ingrédients non liés et pour l'offline. | Un prix recopié dans 477 recettes est un prix qui diverge le jour où on oublie un recalcul. |
| D3 | **Stratégie de prix par défaut : `max`** (la référence active la plus chère). Surcharge possible par produit : `max`, `principal`, `moyenne`, `manuel`. | Demande explicite, avec contre-indication possible. |
| D4 | **Aucune écriture en base sans validation humaine** sur le flux scan. L'IA propose, Jérémy tranche. | Un OCR qui écrit tout seul dans le catalogue de prod est une bombe. |
| D5 | **Le module Recettes n'affiche aucun CHF**, même après ce chantier. Le chiffrage reste dans Outils consultant. | Règle projet établie (mémoire `budget-hors-cartes-recettes`). |
| D6 | **Le scan est consultant-only**, gate client ET serveur (`TASK_ROLES`). | Règle projet (mémoire `ia-consultant-only`), cohérent avec `parse-catalogue` déjà `CONSULTANT_ONLY`. |
| D7 | **Un alias validé est définitif** et réutilisé sans appel IA. La correction d'un alias est possible, la re-demande à l'IA non. | C'est le cœur de l'économie : on paie l'IA une fois par libellé, pas une fois par facture. |
| D8 | **Historisation systématique** de tout changement de prix, avec source (`scan`, `manuel`, `import`). | Traçabilité, courbe d'évolution, détection de hausse anormale. |
| D9 | Le scan **ne touche pas aux stocks ni aux quantités**. Il ne fait que prix + catalogue. | Périmètre. L'entrée en stock est un autre chantier. |

## 2. Questions ouvertes (à trancher par Jérémy avant sprint 3)

| # | Question | Option par défaut si pas de réponse |
|---|---|---|
| Q1 | Prix scannés HT ou TTC ? Les factures suisses affichent souvent les deux. | On stocke le **HT** et on note le taux TVA détecté dans `notes` |
| Q2 | Que faire d'une référence fournisseur non revue depuis plus de 6 mois dans le calcul du `max` ? | Elle reste active et compte dans le `max`, mais l'UI la signale « prix ancien » |
| Q3 | Multi-pages : une facture Transgourmet fait souvent 3 pages. Une session = N photos ? | Oui, N photos dans une même session de scan, agrégées avant revue |
| Q4 | Seuil d'alerte de hausse de prix | +15 % vs dernier prix connu déclenche un badge « hausse » dans la revue |

---

## 3. Commande

```
/Samper Web Builder
```

Sprint 1 uniquement : `/Samper Supabase Specialist`
Sprint 3 uniquement : `/Samper Supabase Specialist` (Edge Function Deno)

## 4. Workflow

1. `/context` — charger l'état du repo
2. Plan détaillé fichier par fichier
3. **STOP — validation Jérémy**
4. Exécution bloc par bloc (diff présenté)
5. Lint + build
6. Commit (message anglais) + push

**Le SQL fait l'objet d'un commit séparé du front, et la migration est appliquée AVANT le
déploiement du front qui en dépend** (expand/contract, règle `CLAUDE.md` §Deployment safety).

---

# SPRINT 1 — Fondation SQL (migration)

Type D. Aucun front. Livrable : 1 fichier de migration idempotent, appliqué par Jérémy.

Fichier : `supabase/migrations/20260811_scan_factures_prix.sql`

### 1.1 Table `produit_alias`

Mémorise « ce libellé fournisseur désigne ce produit ». C'est le maillon qui règle le problème
des noms qui changent selon les fournisseurs.

```
produit_alias(
  id            text primary key,
  produit_id    text not null references produits(id) on delete cascade,
  fournisseur_id text null references fournisseurs(id) on delete set null,
  libelle       text not null,          -- libellé brut tel qu'il figure sur la facture
  libelle_norm  text not null,          -- normalisé (minuscule, sans accents, alphanum)
  reference_fourn text null,            -- référence article fournisseur si lisible
  source        text not null default 'manuel',  -- 'manuel' | 'scan' | 'import'
  created_at    timestamptz default now(),
  created_by    text null
)
```

Contraintes et index :
- `unique (produit_id, fournisseur_id, libelle_norm)` (idempotence des ré-ingestions)
- index partiel unique sur `(fournisseur_id, reference_fourn)` where `reference_fourn is not null` : une référence article ne peut pointer que vers un produit
- index sur `libelle_norm` (recherche)
- index sur `produit_id` (FK)

RLS : `user_can_access_etab` via le produit parent, exactement le motif de `produit_fournisseurs`
(`exists (select 1 from produits p where p.id = produit_alias.produit_id and user_can_access_etab(p.etablissement_id))`), sur les 4 commandes.

### 1.2 Table `produit_prix_historique`

```
produit_prix_historique(
  id            text primary key,
  produit_id    text not null references produits(id) on delete cascade,
  fournisseur_id text null references fournisseurs(id) on delete set null,
  prix_unitaire numeric not null,       -- CHF par unite_ref du produit
  prix_achat    numeric null,           -- prix du colis tel que facturé
  quantite_cond numeric null,
  unite_cond    text null,
  source        text not null,          -- 'scan' | 'manuel' | 'import'
  scan_id       text null,              -- lien vers la session de scan
  document_url  text null,              -- photo de la facture archivée
  releve_le     date not null,          -- date de la facture, pas date d'import
  created_at    timestamptz default now(),
  created_by    text null
)
```

Index : `(produit_id, releve_le desc)`, `(fournisseur_id)`, `(scan_id)`.
RLS : même motif via `produits`.

### 1.3 Colonnes ajoutées à `produits`

```
alter table produits
  add column if not exists strategie_prix text not null default 'max',
  add column if not exists prix_verrouille boolean not null default false,
  add column if not exists prix_maj_le timestamptz null;

alter table produits
  add constraint produits_strategie_prix_chk
  check (strategie_prix in ('max','principal','moyenne','manuel'));
```

- `strategie_prix` : D3. `max` par défaut sur tout le parc existant.
- `prix_verrouille` : quand `true`, aucun scan ne peut modifier le prix. C'est la contre-indication manuelle.
- `prix_maj_le` : date du dernier changement effectif, pour l'UI.

Ajouter la contrainte via `do $$ ... exception when duplicate_object then null; end $$;` pour rester rejouable.

### 1.4 Table `scans_facture` (session de scan)

```
scans_facture(
  id             text primary key,
  etablissement_id text not null,
  fournisseur_id text null,
  statut         text not null default 'brouillon',  -- 'brouillon'|'valide'|'abandonne'
  document_urls  text[] default '{}',     -- photos archivées (bucket documents)
  date_facture   date null,
  numero_facture text null,
  total_facture  numeric null,
  lignes         jsonb not null default '[]',  -- lignes parsées + décisions de revue
  nb_lignes      int default 0,
  nb_appliquees  int default 0,
  created_at     timestamptz default now(),
  created_by     text null,
  valide_le      timestamptz null
)
```

Contrainte anti-doublon (idempotence, une facture ne s'ingère pas deux fois) :
index partiel unique sur `(etablissement_id, fournisseur_id, numero_facture)`
where `numero_facture is not null and statut = 'valide'`.

RLS : `user_can_access_etab(etablissement_id)` sur les 4 commandes.
Index FK sur `etablissement_id` et `fournisseur_id`.

### 1.5 Fonction de résolution de prix

```
create or replace function produit_prix_resolu(p_produit_id text)
returns numeric
language sql stable
security invoker            -- surtout PAS definer, cf. audit sécurité brief 3
set search_path = public
as $$ ... $$;
```

Logique : lit `produits.strategie_prix`, agrège `produit_fournisseurs` (lignes actives), applique
`max` / `principal` / `moyenne`, et retombe sur `produits.prix_unitaire` si aucune ligne fournisseur
ou si stratégie `manuel`.

`security invoker` obligatoire : la RLS de l'appelant doit s'appliquer. Ne pas rejouer l'incident
`v_produits_avec_fourn` (migration `20260712_drop_v_produits_avec_fourn.sql`).

Ne pas accorder `execute` à `anon`. Vérifier avec `get_advisors` après application.

### Critères de validation sprint 1 — APPLIQUÉE EN PRODUCTION LE 11.08.2026

- [x] Migration rejouable : contraintes et colonnes rejouées sans erreur, 3 contraintes toujours uniques
- [x] `get_advisors` security : aucune nouvelle alerte. Les WARN restants sont des `SECURITY DEFINER` antérieurs (`user_can_access_etab`, `pointer_*`, `kds_*`). `produit_prix_resolu` n'y figure pas, étant en `invoker`
- [x] RLS testée en `begin / set local request.jwt.claims / rollback` : un membre de `etab-2` voit ses lignes (1/1/1), un membre de `etab-1` ne voit rien (0/0/0) sur les trois nouvelles tables
- [x] Aucun `DROP`, aucun `RENAME` : 3 colonnes ajoutées à `produits`, les 803 produits basculés en `strategie_prix = 'max'`, aucun verrouillé
- [x] `execute` sur `produit_prix_resolu` : refusé à `anon`, accordé à `authenticated`
- [x] Sémantique des 4 stratégies vérifiée sur données réelles (transaction annulée) : `max` 0,052100 · `principal` 0,049000 · `moyenne` 0,048617 · `manuel` 0,001100. Concorde avec l'implémentation JS `resolvePrixProduit`
- [x] Aucune donnée de test n'a persisté

---

# SPRINT 2 — Prix vivant et liaison en masse (front, sans IA)

Type C + A. **C'est le sprint qui crée la valeur.** Il est autonome : livrable et utile même si
les sprints 3 et 4 ne sortent jamais.

### 2.1 Correction du renommage (D1)

Fichiers : `src/modules/consultant-tools/ConsultantTools.jsx:85-105`, `src/modules/recettes/AmbiguousMatchReview.jsx:9-16`.

Retirer `nom: product.nom` des deux implémentations de `applyProductToIngredient`. Le lien pose
`produitId`, ajuste `unite` et `prixUnit` (repli), et laisse `nom` intact.

Les deux fonctions sont dupliquées quasi à l'identique : les factoriser dans
`src/services/recipeProductMatching.js` (ou un module voisin) et les importer aux deux endroits.

Migration de données : aucune. Les 79 ingrédients déjà liés gardent leur nom actuel, on ne
cherche pas à restaurer les noms d'avant.

### 2.2 Résolution de prix côté client

Nouveau fichier : `src/services/prixResolution.js`

```
resolvePrixProduit(produit)         -> CHF par produit.uniteRef, applique strategie_prix
resolvePrixIngredient(ing, index)   -> CHF par ing.unite, applique convertFactor
buildProduitIndex(produits)         -> Map id -> produit, pour éviter le O(n²)
```

Règles :
- si `ing.produitId` résout vers un produit connu : prix du catalogue converti dans `ing.unite`
- si `convertFactor` renvoie `null` (ex. produit en `g`, ingrédient en `pcs`) : **on ne convertit pas**, on retombe sur `ing.prixUnit` et on signale l'ingrédient comme « unité non convertible » dans l'UI consultant
- si pas de `produitId` ou produit introuvable (produit supprimé, chargement partiel) : `ing.prixUnit`
- jamais d'exception : la fonction renvoie toujours un nombre

Point de vigilance : `convertFactor` ne franchit pas les familles (poids / volume / unitaire). Ne pas
inventer de densité. Le repli est silencieux côté brigade, visible côté consultant.

### 2.3 Branchement du calcul de coût

Fichiers : `ConsultantTools.jsx:290` et `:1136`, `ConsultantOverview.jsx`.

Remplacer `(Number(i.prixUnit) || 0)` par `resolvePrixIngredient(i, index)`.
Ne toucher à aucun affichage du module Recettes (D5).

Attention lecture vide : l'index produits doit venir d'une lecture **réussie**. Si la liste produits
est vide parce que la lecture a échoué, on retombe sur `prixUnit` et on n'affiche pas un coût à 0
comme s'il était vrai (mémoire `lecture-vide-vs-echec`).

### 2.4 Écran « Lier les ingrédients au catalogue »

Emplacement : Outils consultant, sous l'onglet `recettes`. Consultant-only.

C'est l'outil qui fait passer le taux de liaison de 2,9 % à quelque chose d'exploitable.
Il tourne **sans IA** : `matchIngredient` suffit pour l'écrasante majorité des cas.

- balaye les 2 763 ingrédients, dédupe par nom normalisé (on traite ~N noms distincts, pas 2 763 lignes)
- trois piles : **auto** (`matched`, confiance ≥ 85), **à trancher** (`ambiguous`, suggestions classées), **sans correspondance** (`none`)
- action par nom distinct : lier toutes les occurrences d'un coup, avec le compte des recettes touchées affiché avant validation
- « sans correspondance » propose de créer le produit au catalogue
- écriture par lots avec barre de progression, annulable, jamais un `Promise.all` de 500 requêtes
- réutiliser `useSelection` et `SelectionToolbar` déjà en place

### 2.5 UI catalogue : stratégie et verrou — LIVRÉ

Défaut trouvé et corrigé à la vérification : le champ « Prix unitaire » de la fiche
produit était lié à `prixUnitaire` de `mapProduitFromDB`, qui est un prix **déjà résolu**
(celui du fournisseur principal). Ouvrir puis enregistrer une fiche à références écrasait
donc `produits.prix_unitaire` par un prix fournisseur, et la stratégie « manuel » affichait
0,0521 au lieu de 0,0400. Le champ édite maintenant `prixUnitaireManuel`, la vraie colonne.

Second défaut, préexistant : la table des références fournisseurs débordait sa modale en
375 px avec `overflow-x: visible`, donc rognée. Les deux tables (fournisseurs et historique)
scrollent maintenant dans leur propre conteneur.


Fichier : `src/modules/catalogue/Catalogue.jsx`

Sur la fiche produit : sélecteur `strategie_prix`, bascule `prix_verrouille`, prix résolu affiché
avec sa provenance (« le plus cher, Transgourmet, relevé le 04.08 »), et la liste des références
fournisseurs avec leurs prix respectifs.

Bridge : ajouter dans `src/services/legacySupabase.js`
- lecture des nouvelles colonnes dans `mapProduitFromDB` (`strategiePrix`, `prixVerrouille`, `prixMajLe`)
- écriture dans `upsertProduit`
- `listProduitAlias`, `upsertProduitAlias`, `deleteProduitAlias`
- `listPrixHistorique(produitId)`

Garde de compatibilité : `mapProduitFromDB` ne doit exposer les nouvelles colonnes que si elles
existent côté DB, et `upsertProduit` ne doit les écrire que si l'appelant les porte. Motif déjà en
place pour `20260730_recettes_durees_vie`, à reproduire. Sinon un front déployé avant la migration
casse l'upsert produit en production.

### Critères de validation sprint 2

- [x] Lier un produit à un ingrédient **ne change plus son nom** (3 implémentations dupliquées fusionnées, 34 assertions)
- [x] Changer le prix d'un produit au catalogue change le coût matière affiché dans Outils consultant, sans réenregistrer les recettes
- [x] Un ingrédient en `pcs` lié à un produit en `g` tombe en repli et le signale (statut `incompatible`)
- [x] Le module Recettes n'affiche toujours aucun CHF
- [x] Front déployé avant migration : gardes `hasOwnProperty` à l'écriture, `!== undefined` à la lecture, motif `20260730`
- [x] Liaison en masse à volume réel (800 produits, 470 recettes, 2 583 ingrédients) : rapprochement par tranches sans gel, progression visible, interruption nette à 28/470
- [x] Lint vert, build vert
- [x] Les 4 stratégies concordent entre SQL et JS sur les mêmes données
- [ ] Non régression Commande / Inventaire / Pertes / MEP : à valider en session réelle, ces modules lisent `produits` mais n'ont pas été exercés faute de compte de test

---

# SPRINT 3 — Tâche IA `parse-facture` (Edge Function)

Type E. Fichier : `supabase/functions/ai-proxy/index.ts`, en extension du motif existant.

### Déclenchement
Appel UI depuis l'écran de scan. JWT **on** (comme toutes les tâches ai-proxy).
Rôle : `CONSULTANT_ONLY` dans `TASK_ROLES` (D6).

### Inputs
```
{ task: 'parse-facture',
  payload: { imageBase64, mediaType, fournisseurHint?, produitsConnus? } }
```
`produitsConnus` : liste courte `[{id, nom}]` optionnelle pour aider le rapprochement. Borner
comme `parse-catalogue` borne `rows` à 32 000 caractères. Si le catalogue dépasse, ne pas
l'envoyer : le matching local du sprint 4 s'en charge.

### Sortie attendue (JSON strict, motif `CATALOGUE_SYSTEM`)
```
{ "fournisseur": "Transgourmet", "numeroFacture": "FA-2026-12345",
  "dateFacture": "2026-08-04", "totalHT": 412.60, "devise": "CHF",
  "lignes": [ { "libelle": "FILET BOEUF IRL 2KG VAC", "referenceFourn": "84512",
                "quantite": 2, "conditionnement": "2 kg", "quantiteCond": 2,
                "uniteCond": "kg", "prixAchat": 89.50, "prixUnitaire": 44.75,
                "confidence": 92, "issues": [] } ] }
```

Règles de prompt (reprendre le ton strict de `CATALOGUE_SYSTEM`) :
- n'inventer aucune ligne, uniquement ce qui est lisible sur l'image
- `confidence` par ligne, `issues` en français court : « prix illisible », « quantité ambiguë », « ligne partiellement masquée », « total incohérent »
- ne pas remplir un champ deviné : mieux vaut `null` et une `issue`
- ignorer les lignes non-produit (frais de port, consigne, remise globale, TVA), ou les marquer `issues: ["ligne non produit"]`
- dates au format ISO `YYYY-MM-DD`, montants en nombre sans symbole
- `maxTokens: 8192`

### Points de vigilance
- **Compression image avant envoi**, côté client, motif déjà présent dans `aiService.js`. Une photo iPad brute fait 4-6 Mo et explose la limite de payload.
- Timezone : `dateFacture` est une date de document, pas un timestamp. Pas de conversion Zurich, on stocke la date telle que lue.
- Gestion d'erreur : image illisible, format non supporté, réponse non-JSON. Message français exploitable, jamais une stack.
- Mode dry-run : la fonction ne fait que parser, elle n'écrit **rien** en base. Toute écriture est au sprint 4, après validation humaine.

### Test
```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/ai-proxy" \
  -H "Authorization: Bearer $JWT_CONSULTANT" -H "Content-Type: application/json" \
  -d @fixture-facture.json --ssl-no-revoke -L
```
Fixture : une vraie facture Transgourmet ou Metro anonymisée, plus un cas dégradé (photo floue, facture pliée) pour vérifier que `confidence` et `issues` remontent honnêtement.

### Critères de validation sprint 3
- [ ] `./node_modules/.bin/esbuild supabase/functions/ai-proxy/index.ts --outfile=<tmp>` parse sans erreur
- [ ] Un rôle non-consultant reçoit un 403 côté serveur, pas seulement un bouton caché
- [ ] Photo illisible : retourne `{lignes: []}` avec une erreur explicite, ne plante pas
- [ ] Les 9 autres tâches ai-proxy fonctionnent toujours (non-régression du dispatch)

---

# SPRINT 4 — Écran de scan et apprentissage des alias (front)

Type A. Emplacement : module **Catalogue produits**, nouvel onglet « Scanner une facture ».
Consultant-only côté client, en plus du gate serveur.

Nouveaux fichiers sous `src/modules/catalogue/scan/` :
`ScanFactureLauncher.jsx`, `ScanFactureReview.jsx`, `scanFactureLogic.js`.

### Flux

**Capture** — `<input type="file" accept="image/*" capture="environment" multiple>`, motif
`Tracabilite.jsx:222`. Plusieurs photos par session (Q3). Miniatures, suppression avant envoi.
Compression client avant `parse-facture`.

**Parsing** — une session `scans_facture` en statut `brouillon` est créée, les photos sont
archivées dans le bucket `documents` sous `<etablissementId>/factures/<timestamp>-<n>.jpg`.
Rappel : le bucket `documents` est PDF-only aujourd'hui, vérifier et étendre les types MIME
autorisés, ou utiliser un chemin dédié. **Ne pas réutiliser `recette-photos`** (public).

**Rapprochement, en 3 niveaux, du moins cher au plus cher** :
1. `reference_fourn` + `fournisseur_id` dans `produit_alias` → certitude, zéro appel IA
2. `libelle_norm` dans `produit_alias` → certitude, zéro appel IA
3. `matchIngredient(libelle, catalogue)` (local, gratuit) → `matched` / `ambiguous` / `none`
4. seulement si `none` et si Jérémy le demande explicitement : tâche IA `match-product`

**Revue en 3 piles** (motif `CatalogueImportPreview.jsx`) :

| Pile | Contenu | Action |
|---|---|---|
| Reconnues | alias connu, produit identifié | prix appliqué au clic, ligne pliée par défaut |
| À confirmer | matching flou, suggestions classées par confiance | on tranche une fois → **création de l'alias** (D7) |
| Nouveaux | aucune correspondance | création du produit au catalogue, avec catégorie et `unite_ref` à choisir |

Sur chaque ligne : libellé facture, produit cible, ancien prix, nouveau prix, **delta en % avec
badge si > 15 %** (Q4), et un interrupteur « appliquer ». Les lignes avec `issues` remontent en
tête. Les produits `prix_verrouille` s'affichent barrés avec la mention « verrouillé », non
applicables.

**Validation** — un seul bouton, qui en une transaction logique :
1. crée / met à jour les lignes `produit_fournisseurs` en écrivant `prix_achat`, `quantite_cond`, `unite_cond` et `reference`. **Jamais `prix_unitaire`**, qui est généré. Mise à jour de la ligne existante du couple (produit, fournisseur), jamais d'insertion d'une seconde
2. crée les `produit_alias` des lignes tranchées manuellement
3. insère les lignes `produit_prix_historique` avec `source='scan'`, `scan_id`, `document_url`, `releve_le = dateFacture`
4. met à jour `produits.prix_maj_le`
5. passe la session en `statut='valide'`

Aucune écriture avant ce clic (D4). Écriture par lots, progression visible, et en cas d'échec
partiel : la session reste en `brouillon` et affiche ce qui a été appliqué. Pas de rollback
silencieux qui laisse Jérémy dans le flou.

**Après validation** — récapitulatif : N prix mis à jour, N produits créés, N alias appris,
N lignes ignorées. Lien vers l'historique des prix du produit le plus impacté.

### Écran « Historique des prix »
Sur la fiche produit du catalogue : tableau `date | fournisseur | prix | source | facture`,
avec lien vers la photo archivée. Pas de graphique dans ce sprint, le tableau suffit.

### Contraintes UI
- iPad et mobile d'abord : c'est là que la photo se prend. Coque mobile, pas de scroll horizontal (mémoire `ecran-cadre-no-horizontal-scroll`), cibles tactiles 44 px, checkbox enveloppée dans un label 44×44 (mémoire `checkbox-cible-tactile-ipad`).
- Onglets via `SegmentedTabs`, actions via `.module-actions`. Pas de barre flottante.
- Tokens CSS uniquement, aucune couleur en dur, dark mode vérifié.
- Traduction : le module reste écrit en français, `domTranslator` s'en charge. Envelopper dans `data-no-translate` les libellés bruts de facture, qui sont de la donnée et non de l'UI.

### Critères de validation sprint 4
- [ ] Scan d'une vraie facture sur iPad de bout en bout, prix appliqués, vérifiés dans le catalogue
- [ ] Rescanner la même facture ne crée pas de doublon (contrainte `numero_facture`)
- [ ] Un alias appris au scan 1 est reconnu sans IA au scan 2
- [ ] Un produit `prix_verrouille` n'est jamais modifié par un scan
- [ ] Abandonner une session ne laisse aucune écriture en base
- [ ] Le coût matière d'une recette liée bouge après validation du scan, sans réenregistrer la recette
- [ ] Aucun scroll horizontal en 375 px, 768 px et 1024 px
- [ ] Lint vert, build vert, `/index.html` et `/vite-index.html` chargent toujours

---

## 5. Points de vigilance transverses

| Contexte | Point |
|---|---|
| Nouvelle table | RLS sur les 4 commandes + index sur chaque FK |
| RLS / SQL | `user_can_access_etab(...)`, `auth.uid()::text` (`profiles.id` est TEXT) |
| Fonction SQL | `security invoker`, `set search_path = public`, jamais `execute` à `anon` |
| Ré-ingestion | Idempotence : contraintes UNIQUE sur alias et numéro de facture |
| Données temporelles | `releve_le` = date de la facture. Les timestamps techniques en UTC, affichage Zurich via `zurichTime.js` |
| API IA | Compression image obligatoire, payload borné, mode parsing pur sans écriture |
| Toute modif | Ne pas casser Commande, Inventaire, Pertes, MEP, Catalogue, qui lisent tous `produits` |
| Déploiement | SQL commité et **appliqué** avant le front qui en dépend. Sprint 4 sur branche + preview Vercel |
| Legacy | Ne pas toucher `components/`. Écritures `window.*` confinées à `src/legacy/legacyApi.js` |

## 6. Ordre de livraison recommandé

```
Sprint 1 (SQL)  ──►  appliqué par Jérémy, vérifié get_advisors
      │
Sprint 2 (front) ──►  main, valeur immédiate : prix vivants + liaison en masse
      │                (le taux de liaison passe de 2,9 % à utilisable)
Sprint 3 (edge)  ──►  déployé, testé au curl, inerte tant que le sprint 4 n'appelle pas
      │
Sprint 4 (front) ──►  branche + preview Vercel, recette sur iPad, puis main
```

Le sprint 2 est le seul qui soit indispensable. Les sprints 3 et 4 sont du confort de saisie
posé sur une fondation qui, elle, doit être juste.
