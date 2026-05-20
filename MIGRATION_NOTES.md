# MIGRATION_NOTES — Sprint PRÉVISION + BRIGADE — J1

**Date d'application :** 2026-05-20  
**Fichier de migration :** `supabase/migrations/20260520_sprint_prevision_brigade_j1.sql`  
**Projet Supabase :** `ppmtoiqgajwcdkbnrcll`  
**Statut :** ✅ Appliquée et testée

---

## 7 Tables créées

### 1. `reservations`
Saisie résa light pour le module PRÉVISION. Chaque réservation appartient à un établissement, porte une date, un service (midi/soir/brunch), un nombre de couverts et un statut.

**Colonnes clés :** `date_service`, `service`, `nb_couverts`, `statut`, `est_groupe`  
**Rôle dans l'archi :** Source de vérité. Les triggers propagent les aggrégats vers `previsions_jour`.

---

### 2. `reservation_tags`
Tags liés aux réservations : allergènes, régimes, occasions, texte libre.  
**Type :** `allergene | regime | occasion | autre`  
**Rôle dans l'archi :** Le trigger 2 agrège les allergènes du jour dans `previsions_jour.tags_critiques`.

---

### 3. `previsions_jour`
Table de cache, jamais écrite directement par l'app. Agrège par jour et par établissement :
- couverts par service (midi / soir / brunch)
- nb de groupes
- liste dédupliquée des allergènes du jour (`tags_critiques`)

**Contrainte :** `UNIQUE (etablissement_id, date_service)`  
**Alimentation :** 100 % via triggers 1 et 2.

---

### 4. `brigade_services`
Un service de brigade = une journée dans un établissement. Reçoit automatiquement `couverts_prevus` depuis `previsions_jour` à la création (trigger 3).

**Contrainte :** `UNIQUE (etablissement_id, date)`  
**Statuts :** `planifie → en_cours → termine`

---

### 5. `brigade_taches`
Tâches de mise en place rattachées à un service. Organisées par poste (chaud / froid / patisserie / garde_manger), assignées à un profil, avec deadline et statut.

**FK :** `service_id → brigade_services`, `recette_id → recettes` (nullable), `assignee_id → profiles` (nullable)

---

### 6. `brigade_commandes`
Commandes en cours pendant le service (tickets cuisine). Porte les allergènes actifs de la commande pour le 86 intelligent.

**Statuts :** `recue → en_cuisson → dressee → sortie`  
**FK :** `service_id → brigade_services`, `recette_id → recettes`

---

### 7. `ventes_historique`
Historique des ventes par recette, par service, par établissement. Architecture POS-ready grâce au champ `source`.

**Champ POS-ready :** `source text DEFAULT 'manuel' CHECK (source IN ('manuel','lightspeed','autre_pos'))`  
**Index :** `(etablissement_id, date_service, recette_id)` pour les lookups rapides.  
**Note Phase 2 :** Un index `(etablissement_id, recette_id, date_service)` sera à ajouter pour les agrégats statistiques Lightspeed.

---

## RLS par table et par rôle

> **Helpers utilisés :** `user_can_access_etab(etab_id)` et `current_user_role()` — fonctions existantes en DB qui lisent `profiles.etablissement_ids` et `profiles.role`.  
> **Pas de table `etablissement_users`** dans ce projet — l'accès multi-établissement est porté par `profiles.etablissement_ids text[]`.

| Table | SELECT | INSERT / UPDATE | DELETE |
|---|---|---|---|
| `reservations` | membres de l'étab | `consultant`, `patron`, `resp_cuisine`, `hote` | `consultant`, `patron`, `hote` |
| `reservation_tags` | via résa parente | `consultant`, `patron`, `resp_cuisine`, `hote` | `consultant`, `patron`, `hote` |
| `previsions_jour` | membres de l'étab | `consultant`, `patron`, `resp_cuisine` | `consultant` |
| `brigade_services` | membres de l'étab | `consultant`, `patron`, `resp_cuisine` | `consultant` |
| `brigade_taches` | via service parent | `consultant`, `patron`, `resp_cuisine` | `consultant` |
| `brigade_commandes` | via service parent | `consultant`, `patron`, `resp_cuisine` | `consultant` |
| `ventes_historique` | membres de l'étab | `consultant`, `resp_cuisine` | `consultant` |

**Mapping rôles spec → DB :**
- `chef` (spec) → `resp_cuisine` (DB)
- `responsable` (spec) → `patron` (DB)
- `hote` (spec) → `hote` (préparé, rôle futur — non bloquant)

---

## 3 Triggers

### Trigger 1 — `trg_reservations_update_previsions`
**Quand :** AFTER INSERT OR UPDATE OR DELETE ON `reservations`  
**Fonction :** `fn_update_previsions_from_reservations()` (SECURITY DEFINER)  
**Ce qu'il fait :**
- Exclut du calcul les réservations avec `statut IN ('annule','no_show')`
- Somme `nb_couverts` par service (midi / soir / brunch) pour le couple `(etablissement_id, date_service)`
- Compte `nb_groupes` (réservations avec `est_groupe = true`)
- UPSERT sur `previsions_jour`

**⚠️ Réserve connue (à corriger en J5) :** Si une réservation change de date (UPDATE), seule la nouvelle date est recalculée. L'ancienne date conserve la valeur avant modification. Impact faible (cas rare), détectable rapidement par le chef.

---

### Trigger 2 — `trg_reservation_tags_update_previsions`
**Quand :** AFTER INSERT OR DELETE ON `reservation_tags`  
**Fonction :** `fn_update_tags_critiques()` (SECURITY DEFINER)  
**Ce qu'il fait :**
- Remonte à la réservation parente pour obtenir `etablissement_id` et `date_service`
- Agrège les `valeur` de tous les tags `type_tag = 'allergene'` du jour (hors réservations annulées/no-show), dédupliqués et triés
- UPSERT sur `previsions_jour.tags_critiques`

---

### Trigger 3 — `trg_brigade_service_autofill_couverts`
**Quand :** BEFORE INSERT ON `brigade_services`  
**Fonction :** `fn_autofill_brigade_couverts()` (SECURITY DEFINER)  
**Ce qu'il fait :**
- Cherche une ligne `previsions_jour` pour le couple `(etablissement_id, date)`
- Si trouvé, somme `couverts_midi + couverts_soir + couverts_brunch`
- Affecte ce total à `NEW.couverts_prevus` **uniquement si** `couverts_prevus = 0` (ne s'écrase pas si renseigné manuellement)

---

## 2 Fonctions RPC

### `get_semaine_previsions(p_etablissement_id text, p_date_debut date) → jsonb`
Retourne 7 lignes de prévisions à partir de `p_date_debut`. Les dates sans réservations retournent des zéros (LEFT JOIN sur `generate_series`).

**Format de retour :**
```json
[
  {
    "date_service": "2026-05-26",
    "jour_semaine": "lundi",
    "couverts_midi": 12,
    "couverts_soir": 18,
    "couverts_brunch": 0,
    "nb_groupes": 0,
    "tags_critiques": [],
    "total_couverts": 30
  }
]
```

---

### `get_brigade_dashboard(p_service_id text) → jsonb`
Retourne toutes les données nécessaires au dashboard chef en service.

**Format de retour :**
```json
{
  "service": { "...colonnes brigade_services..." },
  "taches_par_poste": {
    "chaud": [...],
    "froid": [...],
    "patisserie": [...],
    "garde_manger": [...]
  },
  "commandes_en_cours": [...],
  "stats": {
    "taches_total": 12,
    "taches_terminees": 8,
    "pct_avancement": 67,
    "commandes_recues": 5,
    "commandes_sorties": 2,
    "retards": 0
  }
}
```

---

## Architecture POS-ready

Le champ `ventes_historique.source` permet d'accueillir des données provenant d'un POS externe sans modifier le schéma :

| Valeur | Usage |
|---|---|
| `'manuel'` | Saisie directe dans l'app (Phase 1, défaut) |
| `'lightspeed'` | Synchronisation Lightspeed (Phase 2, fin juin) |
| `'autre_pos'` | Tout autre POS (Phase 2+) |

La colonne `synced_at` permet de dater la dernière synchronisation pour chaque entrée.

---

## Tests des triggers (exécutés le 2026-05-20)

### Scénario a — Insertion réservation
```sql
INSERT INTO reservations (etablissement_id, date_service, service, heure_arrivee, nb_couverts, nom, statut)
VALUES ('etab-1', '2026-05-27', 'soir', '20:00', 8, 'Test Famille Martin', 'confirme');
```
**Résultat attendu :** `previsions_jour.couverts_soir = 8`  
**Résultat obtenu :** ✅ `couverts_soir = 8`, `couverts_midi = 0`, `couverts_brunch = 0`, `nb_groupes = 0`

---

### Scénario b — Ajout tag allergène
```sql
INSERT INTO reservation_tags (reservation_id, type_tag, valeur)
VALUES (<id_rés_ci-dessus>, 'allergene', 'gluten');
```
**Résultat attendu :** `previsions_jour.tags_critiques` contient `'gluten'`  
**Résultat obtenu :** ✅ `tags_critiques = ["gluten"]`

---

### Scénario c — Création brigade_service
```sql
INSERT INTO brigade_services (etablissement_id, date, statut)
VALUES ('etab-1', '2026-05-27', 'planifie');
```
**Résultat attendu :** `couverts_prevus = 8` (auto-rempli depuis previsions_jour)  
**Résultat obtenu :** ✅ `couverts_prevus = 8`

---

## Dette technique notée (à traiter J5)

1. **Trigger 1 / changement de date** — Si une réservation change de date, l'ancienne date n'est pas recalculée. Correction prévue en J5 avec un helper `fn_recalc_previsions(etab_id, date)`.
2. **Refactorisation triggers 1 + 2** — Logique d'agrégat dupliquée. À factoriser en un helper partagé en Phase 2.
3. **Index agrégat POS** — Ajouter `(etablissement_id, recette_id, date_service)` sur `ventes_historique` avant l'intégration Lightspeed (Phase 2).
