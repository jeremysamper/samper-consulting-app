# Architecture — Recettes partagées multi-établissements

> Sprint 3 — 2026-05-14
> Auteur : Claude Code (mode autonome)
> Statut : **Architecture documentée, implémentation reportée Sprint 4**
> Justification du report : cf. SPRINT-3-QUESTIONS.md Q2.

---

## 1. Contexte et besoin métier

Aujourd'hui, chaque établissement Samper a son propre catalogue de recettes
isolé dans la table `recettes` (colonne `etablissement_id`). Pour pousser une
recette du Comptoir d'Évolène vers Le Rucher d'Évolène, on doit la dupliquer
manuellement — ce qui est faisable depuis Sprint 2 via la feature **"🔀
Dupliquer la recette vers…"** dans `RecetteDetail`.

**Limite de la duplication actuelle** : les copies sont indépendantes. Si
Jérémy met à jour la recette maître (ex: corriger un ratio bouillon/riz),
les copies déjà importées par les établissements ne reçoivent pas la mise
à jour.

**Besoin Chantier 7** : un vrai système de **templates partagés** avec :
- Une bibliothèque centrale de recettes-templates (propriété du consultant)
- Chaque établissement peut **importer** un template dans son catalogue
- L'établissement peut **personnaliser** (ses quantités, ses fournisseurs)
- Optionnellement : suivi du "lien" pour proposer un **re-sync** quand le
  template est mis à jour

---

## 2. Modèle de données proposé

### Tables nouvelles

#### `recipe_templates`
La bibliothèque centrale. Propriété : consultant uniquement.

| Colonne | Type | Note |
|---|---|---|
| `id` | text PK | `'tpl-' + timestamp` |
| `nom` | text NOT NULL | Nom de la recette template |
| `categorie` | text | Entrée / Plat / Dessert / Fromage |
| `portions` | int | Default 4 |
| `ingredients` | jsonb | Même schéma que `recettes.ingredients` |
| `etapes` | jsonb (text[]) | Liste ordonnée |
| `dressage` | text | Optionnel |
| `conservation` | text | Optionnel |
| `notes_consultant` | text | Pédagogie |
| `allergenes_ids` | text[] | |
| `temps_preparation`, `temps_cuisson`, `temps_total` | int | |
| `photo_url` | text | Stockage signed URL |
| `tags` | text[] | Saison, technique, etc. |
| `published` | bool | Si false : draft, invisible aux établissements |
| `version` | int | Incrémenté à chaque modif majeure |
| `created_by` | uuid → profiles | Qui a créé le template |
| `created_at`, `updated_at` | timestamptz | |

#### `template_subscriptions` (optionnelle, Sprint 4.5+)
Lien faible entre une recette importée et son template d'origine. Permet le
re-sync proposé à l'établissement.

| Colonne | Type | Note |
|---|---|---|
| `id` | text PK | |
| `recette_id` | text → recettes.id | La recette locale dérivée |
| `template_id` | text → recipe_templates.id | Le template source |
| `template_version_imported` | int | Version au moment de l'import |
| `imported_at` | timestamptz | |
| `imported_by` | uuid → profiles | |
| `sync_dismissed_version` | int | Si l'établissement a dit "non merci" pour une version |

### Tables modifiées

#### `recettes` — ajout optionnel
Ajout d'une colonne `template_id` (nullable) pour traçabilité simple sans
table de subscription. Une recette locale "vit sa vie" même si son template
est supprimé (FK ON DELETE SET NULL).

```sql
ALTER TABLE recettes
ADD COLUMN template_id text REFERENCES recipe_templates(id) ON DELETE SET NULL,
ADD COLUMN template_version_imported int;
```

---

## 3. Policies RLS

```sql
-- Lecture : tout authentifié peut lire les templates publiés
CREATE POLICY "Read published templates"
  ON recipe_templates FOR SELECT
  USING (published = true OR auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'consultant'
  ));

-- Écriture : seul le consultant peut créer / modifier / supprimer
CREATE POLICY "Consultant manages templates"
  ON recipe_templates FOR ALL
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'consultant'))
  WITH CHECK (auth.uid() IN (SELECT id FROM profiles WHERE role = 'consultant'));
```

---

## 4. Workflow utilisateur

### Côté consultant (Jérémy)

1. **Outils consultant > nouvel onglet "Bibliothèque templates"**
2. Liste des templates avec statut (publié / draft) + nombre d'imports par template
3. Bouton "Nouveau template" → même formulaire que recette mais sans
   `etablissement_id` (puisqu'un template est universel)
4. Action "Publier" / "Dépublier" sur chaque template
5. Action "Voir qui utilise ce template" → liste des établissements + version
   importée + lien vers la recette locale

### Côté établissement (chef / patron / resp_cuisine)

1. **Module Recettes > bouton "Importer depuis bibliothèque"** dans la barre
   d'actions
2. Modale liste les templates publiés, filtrables par catégorie/tag/recherche
3. Au clic sur un template → preview rapide (ingrédients, étapes)
4. Bouton "Importer dans mon établissement" → crée une `recette` locale avec
   `template_id` rempli + `template_version_imported = template.version`
5. La recette importée apparaît dans le catalogue local, modifiable comme
   n'importe quelle autre recette

### Re-sync (optionnel, Sprint 4.5+)

1. Quand le consultant **met à jour un template publié** (changement majeur),
   il incrémente la `version` (peut-être un bouton "Publier nouvelle version").
2. Pour chaque établissement ayant importé une version antérieure, un badge
   "⚠ Mise à jour disponible" apparaît sur la recette locale.
3. L'établissement peut :
   - **Re-sync** : remplace les champs non-customisés par les nouveaux
     (les champs personnalisés — quantités modifiées, prix locaux — sont
     préservés)
   - **Ignorer cette version** : `sync_dismissed_version = nouvelle_version`,
     plus de badge tant que la version ne re-monte pas

---

## 5. Plan de déploiement

### Étape 1 — DB (1 demi-journée)
- Migration SQL : créer `recipe_templates`, `template_subscriptions` (si
  v2 voulue), ajouter colonnes à `recettes`
- Policies RLS
- Activer realtime sur `recipe_templates`

### Étape 2 — Services client (1 demi-journée)
- `src/services/recipeTemplates.js` — CRUD + listing + import
- Tests : import vers 2 établissements, vérifier isolation

### Étape 3 — UI consultant (1 jour)
- Nouvel onglet dans `ConsultantTools.jsx` : "Bibliothèque templates"
- Liste, création, publication, vue "qui utilise"

### Étape 4 — UI établissement (1 jour)
- Bouton "Importer depuis bibliothèque" dans `Recettes.jsx`
- Modale de browsing + import
- Affichage badge "Importé depuis template X (v3)" sur les recettes liées

### Étape 5 — v2 Re-sync (optionnel, 1-2 jours additionnels)
- Détection version supérieure côté établissement
- UI re-sync avec preview des changements
- Logique de merge (préserver les champs customisés)

**Total v1** : ~3 jours (sans re-sync)
**Total v2** : ~5 jours (avec re-sync)

---

## 6. Risques et décisions à arbitrer

| Risque | Mitigation |
|---|---|
| Doublon avec la feature "Dupliquer vers" actuelle | Décision Jérémy : garder les deux (duplication = one-shot, templates = liens vivants) OU remplacer (templates = nouvelle façon, duplication retirée) |
| Surface d'attaque RLS (template visible cross-tenant) | Policies validées strictes : lecture limitée aux templates `published=true` ; écriture limitée au rôle consultant ; pas d'accès en update pour les autres rôles |
| Performance liste templates si volume élevé | Pagination + filtre par tag dès le départ |
| Migration des recettes existantes | Pas nécessaire : `template_id` est nullable, les recettes actuelles restent `template_id = null` |
| Conflits de noms entre établissements à l'import | Gérer côté UI : suffixe " (depuis template)" automatique en cas de conflit, comme déjà fait dans la duplication actuelle |

---

## 7. Décision Sprint 3

**Architecture documentée. Implémentation reportée Sprint 4** car :

- La feature de duplication actuelle (Sprint 2) couvre le besoin urgent de
  Jérémy pour Le Rucher d'Évolène (vendredi 15 mai 2026)
- Implémenter le full template-system demande 3-5 jours dédiés et de tester
  contre 2 établissements réels — incompatible avec la fenêtre Sprint 3
- Le besoin de re-sync n'est pas encore validé en pratique : à confirmer
  après 1-2 mois d'usage de la duplication

**Action Jérémy** : retour de terrain après 2 semaines d'usage de la
duplication → décider si la sophistication templates est nécessaire.
