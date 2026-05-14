# Brief produit — Module "Mise en place"

> Sprint 3 — 2026-05-14
> Auteur : Claude Code (mode autonome)
> Statut : **Brief — pas de code, attente validation Jérémy avant Sprint 4**

---

## 1. Définition métier

**Mise en place** (terme F&B intraduisible précisément en français quotidien
malgré son origine francophone) :

> Ensemble des préparations effectuées en amont du service pour permettre
> aux équipes cuisine ET salle d'envoyer rapidement et avec qualité pendant
> les coups de feu.

**Concrètement, une mise en place couvre** :

- **Préparations froides** : tartare préparé, mayonnaises, salades lavées et
  taillées, vinaigrettes, beurres composés, mises en bouche pré-dressées
- **Préparations chaudes** : fonds, sauces de base, légumes blanchis, viandes
  marinées, jus, déglaçages préparés
- **Pâtisserie** : pâtes à étaler, crèmes pâtissières, confits de fruits, biscuits
- **Salle** : couverts polis, verres alignés, ardoises propres, cartes redressées,
  fleurs fraîches, bougies en place, mise en bouche cuisine briefing serveurs

**Timing typique** :
- **Veille au soir** (post-service) : tâches longues sans temps critique
  (fonds, marinades, pré-cuissons sous-vide)
- **Matin avant ouverture** (8h-11h pour service midi) : tâches rapides et
  fragiles (taillage, dressage pré-assiettes)
- **Pré-service** (1h avant) : finitions, mise en température, vérifications

**Risque opérationnel** : une mise en place incomplète ou loupée détruit le
service. C'est le "métier dans le métier" en F&B haut de gamme.

---

## 2. Hypothèses fonctionnelles à challenger

### H1 — Génération auto depuis la carte du jour ?

> "À partir des plats prévus au menu du jour, l'app génère une checklist
> mise en place automatique."

**Pour** : zéro saisie manuelle pour le chef. Si la carte change, la check-list
suit. Aligne mise en place avec la réalité du service.

**Contre** : ne couvre pas les préparations transverses (fonds, sauces de base,
beurres composés) qui ne sont pas attachées à un plat unique. Ne couvre pas la
mise en place salle.

**Recommandation** : **partielle** — auto-génération pour les éléments cuisine
liés aux plats, manuelle pour le reste (templates réutilisables).

---

### H2 — Affectation par membre de brigade ?

> "Le chef coche qui fait quoi : Pierre s'occupe des sauces, Sarah des
> garnitures, Tom de la salle."

**Pour** : clarté équipe, responsabilisation, pas d'oubli.

**Contre** : la brigade est petite (3-5 personnes) et les rôles sont souvent
fluides. Risque de sur-formalisme = friction.

**Recommandation** : **optionnelle** — possibilité d'affecter sans contrainte.
Une tâche sans assigné apparaît à tous.

---

### H3 — Estimation cumulée des temps ?

> "L'app affiche '4h30 de mise en place totale ce matin' pour aider à
> calibrer l'arrivée des équipes."

**Pour** : permet d'anticiper si on est tendu (besoin de renforts ou
simplification carte).

**Contre** : les temps sont approximatifs et dépendent énormément du contexte
(état frigos, fraîcheur produits, expérience du commis). Risque de fausse
précision.

**Recommandation** : **garder** mais marquer "estimation indicative" et offrir
de raffiner les temps par tâche au fur et à mesure de l'usage.

---

### H4 — Lien avec inventaire (sortir les produits) ?

> "Pour chaque tâche mise en place, lister les produits à prélever du stock."

**Pour** : préparation produit avant tâche = gain de temps. Trace les sorties.

**Contre** : double tenue de stock (un autre flux existe via le module
Inventaire). Risque de désynchronisation.

**Recommandation** : **lien informatif uniquement** (afficher "Pour cette
tâche : 500g de bœuf, 200g d'échalotes…" sans déduire automatiquement du stock).
La déduction de stock se fera via le module Pertes/Sorties habituel.

---

### H5 — Lien avec HACCP (DLC, températures) ?

> "Une préparation mise en place déclenche automatiquement un suivi HACCP :
> DLC = aujourd'hui + 48h, vérification température à T+2h."

**Pour** : conformité réglementaire automatique. Pas d'oubli de traçabilité.

**Contre** : peut alourdir l'UX si trop systématique. Pas tout requiert un
suivi HACCP formel (un beurre composé est moins risqué qu'un tartare).

**Recommandation** : **conditionnel par catégorie de préparation** — chaque
tâche mise en place a un flag "criticité HACCP" (faible / moyenne / élevée).
Critique → entrée auto dans HACCP. Faible → simple horodatage.

---

## 3. Modèle de données proposé

### Table `mep_tasks` (mise en place tasks)

| Colonne | Type | Note |
|---|---|---|
| `id` | text PK | |
| `etablissement_id` | text → etablissements.id | |
| `date_service` | date | Date du service couvert |
| `service` | text | 'midi' / 'soir' / 'continu' |
| `categorie` | text | 'cuisine_froid' / 'cuisine_chaud' / 'patisserie' / 'salle' / 'autre' |
| `titre` | text | "Couper concombres en julienne" |
| `quantite_estimee` | text | "Pour 30 couverts" (texte libre car varié) |
| `temps_estime_minutes` | int | |
| `assignee_id` | uuid → profiles (nullable) | Qui fait |
| `criticite_haccp` | text | 'faible' / 'moyenne' / 'elevee' |
| `statut` | text | 'a_faire' / 'en_cours' / 'fait' |
| `heure_debut`, `heure_fin` | time | Renseignés au passage en 'fait' |
| `recette_source_id` | text (nullable) → recettes.id | Si auto-généré depuis un plat |
| `produits_a_prelever` | jsonb | Liste informative {nom, quantite, unite} |
| `notes` | text | |
| `created_at`, `updated_at` | timestamptz | |

### Table `mep_templates` (templates réutilisables)

| Colonne | Type | Note |
|---|---|---|
| `id` | text PK | |
| `etablissement_id` | text → etablissements.id | |
| `titre` | text | "Mise en place service midi standard" |
| `description` | text | |
| `tasks` | jsonb | Liste des tâches type avec leurs paramètres |
| `created_by` | uuid → profiles | |

Permet à un chef de définir "Ma mise en place type lundi midi" et la
dupliquer chaque semaine.

---

## 4. Workflow utilisateur proposé

### Création d'une mise en place pour aujourd'hui

1. **Onglet "Mise en place" > nouveau ✚**
2. Choix : "Partir d'un template" / "Auto-générer depuis la carte du jour" /
   "Vide"
3. Liste éditable de tâches groupées par catégorie (collapsibles)
4. Pour chaque tâche : titre, temps estimé, assigné, criticité HACCP
5. Sauver — la mise en place apparaît dans le dashboard du jour

### Exécution pendant la prep

1. Vue mobile dédiée (un cuisinier coche pendant qu'il bosse, mains
   souvent occupées)
2. Bouton large "Cocher fait" + horodatage auto
3. Si criticité HACCP "élevée" : modale auto pour saisir température cœur
4. Vue d'avancement temps réel : "12/18 tâches faites — 4h30 dont 1h30
   restantes"

### Suivi consultant

1. Jérémy voit l'historique des mises en place par établissement
2. Métriques : taux de complétion, retards récurrents, tâches souvent
   oubliées
3. Suggestions automatiques d'optimisation

---

## 5. Risques et points à valider avec Jérémy

1. **Doublon avec SOP/Checklists existants ?** Le module SOP gère déjà des
   checklists. Un mise en place = checklist quotidienne contextualisée par
   carte. À clarifier : extension du module SOP ou module dédié ?
2. **Mobile-first** : la mise en place s'utilise les mains pleines/sales →
   UX vocale ? Tap large ? À tester sur tablette cuisine plastifiée.
3. **Multi-services par jour** : un restaurant ouvert midi+soir a 2 mises
   en place ? Une seule fusionnée ?
4. **Visibilité multi-utilisateurs** : tout le monde voit la mep ou juste
   les assignés ?
5. **Lien réel avec carte du jour** : la "carte du jour" est un concept
   qui n'existe pas formellement dans l'app actuelle. Il faudrait
   probablement formaliser le concept "service du jour" en amont.

---

## 6. Estimation de complexité

| Phase | Effort |
|---|---|
| Validation produit (entretiens 2-3 chefs clients) | 2-3 jours Jérémy |
| Mocks UI mobile + desktop | 1 jour |
| Migration DB + services | 1 jour |
| UI desktop (création mep, gestion templates) | 2-3 jours |
| UI mobile (exécution pendant prep) | 2 jours |
| Lien avec carte du jour (si formalisé) | 1 jour additionnel |
| Lien informatif inventaire | 0.5 jour |
| Lien conditionnel HACCP | 1 jour |
| Tests terrain 2 semaines | 2-3 jours d'ajustement |

**Total estimé** : 12-16 jours de dev + 2-3 jours produit en amont.

**Découpage Sprint** : prévoir **2 sprints de 1 semaine** :
- Sprint A : DB + UI desktop + templates
- Sprint B : UI mobile + liens HACCP/inventaire + tests terrain

---

## 7. Prochaine étape recommandée

**Avant de lancer le développement** :

1. Jérémy valide ce brief en revue (corrige / complète)
2. Entretiens avec 2-3 chefs des établissements clients pour challenger les
   hypothèses (H1-H5)
3. Itération du brief
4. Mocks UI (Figma ou bas-fidélité directement en React)
5. **Décision go/no-go** sur le démarrage Sprint A

**Si Jérémy veut juste un MVP rapide** pour tester l'idée :
- Skip H4 (lien inventaire) et H5 (lien HACCP)
- Skip auto-génération depuis carte du jour
- Garder : checklist manuelle simple, templates, mobile-friendly
- Effort réduit : **4-5 jours**
