# Audit — Module Fiches salle

> Sprint 3 — 2026-05-14
> Auditeur : Claude Code (mode autonome)
> Fichiers analysés : `src/modules/fiches-salle/FichesSalle.jsx` (543 LOC),
> `src/services/legacySupabase.js` (CRUD `fiches_salle`),
> données démo `INITIAL_FICHES` (10 fiches type)

## 1. Description du module

Le module **Fiches salle** est destiné au **personnel de service** (serveurs/serveuses)
pour préparer le service au sens "briefing en salle". Chaque fiche couvre **un plat
du menu** et contient :

- Description commerciale du plat (à réciter ou paraphraser au client)
- Allergènes (14 typologies : gluten, lactose, fruits de mer, etc.) avec
  rendu coloré
- Accords mets & vins / mets & sans alcool (multi-suggestions par fiche,
  avec région d'origine et notes de dégustation)
- Température de service (chaud / froid / tiède + consignes timing)
- Dressage en salle (effet théâtral, manipulations à faire devant le client)
- Infos service à signaler : végétarien/végan, sans gluten, contient poisson cru, etc.
- Temps de préparation estimé (pour cadencement service)
- Statut (active / désactivée)

Lecture : tous les rôles avec `fiches_salle: true` (serveur par défaut ✓).
Édition : consultant, patron, resp_cuisine.

## 2. Volume de données

| Source | Volume | Note |
|---|---|---|
| Démo (`INITIAL_FICHES`) | 10 fiches | Représente le menu Printemps 2026 du Comptoir |
| Supabase `fiches_salle` (prod) | **Inconnu** | Pas d'accès direct lecture DB depuis cette branche |
| Filtré par `etablissement_id` | Oui | Module respecte le multi-établissements |

> **Note** : pour décider de l'archivage ou non, Jérémy devra constater le
> volume réel en prod sur ses 2-3 établissements clients actifs avant Sprint 4.

## 3. Dépendances avec autres modules

| Module | Type de lien | Force du couplage |
|---|---|---|
| **Recettes / Cartes** | Lien sémantique via `platId` (FK vers `plats.id`). Une fiche salle = vue "service" d'un plat. | Fort — sans plat, pas de fiche |
| **HACCP** | Aucun lien direct. Les allergènes sont dupliqués entre recettes et fiches salle. | Faible (mais doublon de données à surveiller) |
| **Inventaire** | Aucun | Nul |
| **Dashboard** | Aucun (pas de KPI fiches salle) | Nul |
| **Documents** | Aucun | Nul |
| **PDF / Print** | Pas de PDF actuellement (le module a un export HTML mais pas de PDF jsPDF) | Faible |

Le module est **relativement autonome** — sa suppression n'affecterait
aucun autre module fonctionnel directement, seules les fiches elles-mêmes
seraient perdues.

## 4. Frictions / défauts observés

1. **Doublon d'allergènes** : les allergènes sont stockés à la fois sur la
   recette (`recettes.allergenesIds`) ET sur la fiche salle (`fiches_salle.allergenes`).
   Risque de dérive : si la recette est modifiée sans mettre à jour la fiche,
   un allergène peut manquer au service → risque sanitaire pour les clients
   allergiques. **À automatiser** : la fiche salle devrait dériver ses
   allergènes de la recette liée.

2. **Pas d'export PDF** : alors que c'est un cas d'usage évident (imprimer
   les fiches pour briefing service en début de shift). Cf. Chantier 5
   Sprint 3 — pourrait être étendu aux fiches salle ultérieurement.

3. **Pas de filtre "actives uniquement"** par défaut dans la vue. Les
   plats désactivés saisonnièrement restent visibles.

4. **Pas de mode "service du jour"** : pas de raccourci pour afficher
   uniquement les plats de la carte active.

## 5. Recommandation argumentée

### 🟢 **GARDER LE MODULE** — mais le faire évoluer

**Justifications pour garder** :

- **Cas d'usage métier différencié et utile** : briefing serveur ≠ fiche
  technique cuisine. Les serveurs n'ont pas besoin de connaître les
  étapes de cuisson, ils ont besoin de savoir vendre le plat et gérer
  les allergies.
- **Données qualitatives uniques** : accords vins, descriptions commerciales,
  infos service. Aucune autre source dans l'app. Si on supprime, on perd
  un asset métier de Samper Consulting (le contenu rédactionnel des
  fiches est un livrable consultant pour les établissements).
- **Couplage faible** avec les autres modules : la suppression ne
  débloquerait aucun chantier prioritaire.
- **Volume probablement faible** mais valeur unitaire élevée (chaque
  fiche représente du travail rédactionnel consultant).

**Justifications pour évoluer (Sprint 4+)** :

- **Auto-sync allergènes** : dériver `fiches_salle.allergenes` depuis
  `recettes.allergenesIds` via FK + computed field, OU déclencher une
  alerte si divergence détectée (audit HACCP).
- **Export PDF "Fiche service du jour"** : un PDF imprimable A4 par
  service (midi/soir), réutilisable comme livrable physique en cuisine
  ou salle. Aligné sur le Chantier 5 (refonte PDF recettes).
- **Mode "carte active uniquement"** : filtre par défaut sur les plats
  de la carte active de l'établissement.

### 🔴 Pas de recommandation d'archivage ou suppression

Archiver le module reviendrait à perdre la couche "service en salle" qui
est un vrai différenciateur. Si Jérémy constate à terme que **0 ou 1
établissement** utilise les fiches, on reconsidérera — pour l'instant la
valeur métier potentielle est trop élevée pour supprimer.

## 6. Actions concrètes proposées (hors Sprint 3)

| Action | Priorité | Effort estimé |
|---|---|---|
| Audit volume de données en prod (lecture DB) | Haute | 15 min |
| Export PDF "Fiche service" | Moyenne | 1 jour |
| Auto-sync allergènes recette → fiche | Moyenne | 1 jour |
| Filtre "carte active" par défaut | Basse | 2 h |

## 7. Conclusion pour Sprint 3

Le module Fiches Salle est **conservé en l'état pour ce sprint**.
Aucun fichier n'est modifié dans le cadre du Chantier 2.

Décision finale revient à Jérémy après lecture de cet audit.
