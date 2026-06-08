# Drafts migrations #3 (RLS) et #5 (index FK + policies) — REVIEW-ONLY

> ⚠️ **Aucun de ces fichiers n'a été exécuté ni commité.** Rédigés pour revue
> ligne à ligne. À appliquer à un moment creux, rollback prêt à coller.
> Ordre conseillé : #5a (sûr) → #3 (à risque, fenêtre creuse) → #5b (optionnel).

## Fichiers
| Fichier | Contenu | Risque |
|---|---|---|
| `3_rls_initplan_UP.sql` / `_DOWN.sql` | wrap `auth.uid()` → `(select auth.uid())` sur 7 policies | 🟠 RLS |
| `5a_fk_indexes_UP.sql` / `_DOWN.sql` | 13 index FK manquants (CONCURRENTLY) | 🟡 additif |
| `5b_merge_redundant_select_policies_UP.sql` / `_DOWN.sql` | retrait de 6 policies SELECT redondantes | 🟡 RLS (optionnel) |

---

## #3 — Faut-il toucher `user_can_access_etab()` ? → NON (analyse honnête)

Tu as demandé le before/after de la fonction. Le voici, **mais je recommande de NE PAS la modifier** :

```sql
-- ACTUEL
CREATE OR REPLACE FUNCTION public.user_can_access_etab(etab_id text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT etab_id = ANY(etablissement_ids)
     FROM profiles WHERE id = auth.uid()::text LIMIT 1),
    false);
$$;

-- CANDIDAT « optimisé » (auth.uid() enveloppé)
CREATE OR REPLACE FUNCTION public.user_can_access_etab(etab_id text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT etab_id = ANY(etablissement_ids)
     FROM profiles WHERE id = (select auth.uid())::text LIMIT 1),
    false);
$$;
```

**Pourquoi c'est un NO-OP perf :** une fonction `SECURITY DEFINER` n'est **jamais inlinée** par le planner (l'inlining contournerait le contexte de sécurité). Le corps est donc exécuté comme une boîte noire, une fois par appel ; envelopper `auth.uid()` à l'intérieur ne crée aucun InitPlan au niveau de la requête appelante. Le gain est nul.

**Le vrai coût** (un `SELECT … FROM profiles WHERE id = auth.uid()` par ligne) ne se règle proprement qu'en réécrivant les **~26 policies** des tables lourdes pour comparer à un sous-select mis en cache — soit une refonte large de la RLS multi-tenant. **Au volume actuel** (profiles = 12 lignes, PK → lookup sub-ms ; produits = 803 lignes) le coût réel est négligeable. Le ratio risque/gain ne justifie pas d'y toucher maintenant.

➡️ **#3 se limite donc aux 7 policies que l'advisor flague réellement.** Logique d'accès strictement préservée (on n'enveloppe que la même expression).

---

## #3 — Grille rôles × tables à tester APRÈS application

L'invariant à vérifier : **l'accès doit être IDENTIQUE avant et après** (#3 ne change que le nombre d'évaluations). Tester avec un utilisateur réel de chaque rôle.

| Table (policy touchée) | consultant | patron | resp_cuisine | cuisinier | serveur |
|---|---|---|---|---|---|
| **profiles** — `profiles_self_update` (UPDATE) | MAJ de **sa** ligne ✓ (+ toutes via `profiles_consultant_all`) | MAJ **sa** ligne ✓ ; celle d'un autre ✗ | idem patron | idem | idem |
| **user_settings** — read/write own | **ses** réglages R/W ✓ ; ceux d'un autre ✗ | idem | idem | idem | idem |
| **factures_compteurs** — consultant only | lecture **et** écriture ✓ | ✗ (ni R ni W) | ✗ | ✗ | ✗ |
| **module_labels** — `module_labels_select` (SELECT) | lecture ✓ | lecture ✓ | lecture ✓ | lecture ✓ | lecture ✓ |
| **alert_reads** — read/write own | **ses** accusés de lecture R/W ✓ | idem | idem | idem | idem |

Check rapide post-migration (à exécuter en étant connecté avec chaque rôle, ou via `set role` + `request.jwt.claims` en test) :
- un **serveur** NE doit JAMAIS lire `factures_compteurs` (doit renvoyer 0 ligne / refus).
- un **cuisinier** doit pouvoir lire `module_labels` et ses propres `user_settings`, mais pas ceux d'un collègue.
- un **patron** doit pouvoir MAJ son profil mais pas celui d'un autre utilisateur.
- aucun rôle ne doit gagner ou perdre un accès par rapport à aujourd'hui.

---

## #5a — Index FK : rien à tester côté accès (purement perf). 
Vérifier seulement que les 13 index existent après coup (`\d+ <table>` ou advisor `unindexed_foreign_keys` qui doit passer au vert).

---

## #5b — Pourquoi seulement 6 tables (grille de sécurité)

Règle : on ne supprime la policy SELECT que si sa qual est **identique** à la qual `USING` de la policy `FOR ALL` → SELECT inchangé. Sinon, supprimer **rétrécirait** l'accès en lecture (blocage).

| Table | qual SELECT (read) | qual USING (write ALL) | read == write ? | Action |
|---|---|---|---|---|
| kit_items | `user_can_access_etab` | `user_can_access_etab` | ✅ identique | **DROP read** |
| plats | `user_can_access_etab` | `user_can_access_etab` | ✅ | **DROP read** |
| plat_recettes | `EXISTS(plats…access)` | `EXISTS(plats…access)` | ✅ | **DROP read** |
| sops | `user_can_access_etab` | `user_can_access_etab` | ✅ | **DROP read** |
| sop_executions | `user_can_access_etab` | `user_can_access_etab` | ✅ | **DROP read** |
| sop_step_states | `EXISTS(sop_exec…access)` | `EXISTS(sop_exec…access)` | ✅ | **DROP read** |
| alert_rules | `user_can_access_etab` | `…AND role∈(consultant,patron)` | ❌ read + large | **NE PAS toucher** |
| app_settings | `true` | `role=consultant` | ❌ | **NE PAS toucher** |
| consultant_messages | `user_can_access_etab` | `role=consultant AND access` | ❌ | **NE PAS toucher** |
| etablissements | `true` | `role=consultant` | ❌ | **NE PAS toucher** |
| module_labels | `auth.uid() IS NOT NULL` | `role∈(consultant,patron)` | ❌ | **NE PAS toucher** |
| permissions | `true` | `role=consultant` | ❌ | **NE PAS toucher** |
| profiles | `true` | `role=consultant` | ❌ | **NE PAS toucher** |

Pour les 7 « NON traitées », fusionner proprement imposerait de découper le `FOR ALL`
en `INSERT/UPDATE/DELETE` séparés (pour que SELECT ne soit régi que par la policy
read large) — plus de surface, plus de risque, pour un gain nul au volume actuel.
**Recommandation : laisser #5b optionnel, voire le sauter** ; le vrai 🟡 utile de #5
c'est #5a (les index).

---

## Application (rappel des contraintes)
1. **#5a** d'abord (sûr) — SQL Editor, ligne par ligne (CONCURRENTLY hors transaction).
2. **#3** ensuite, à un moment creux — une transaction, `_DOWN.sql` ouvert à côté.
   Dérouler la grille rôles×tables juste après. Au moindre doute → `3_rls_initplan_DOWN.sql`.
3. **#5b** seulement si tu veux faire taire le lint — sinon on le laisse.
4. Re-passer `get_advisors(performance)` après : `auth_rls_initplan` et
   `unindexed_foreign_keys` doivent reculer.
