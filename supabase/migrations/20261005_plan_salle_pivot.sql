-- ════════════════════════════════════════════════════════════════════════════
-- Plan de salle : table tournée d'un quart de tour pour UN service
-- ───────────────────────────────────────────────────────────────────────────
-- Demande de Jérémy (05.10.2026) : pouvoir tourner les tables, à l'horizontale
-- ou à la verticale, dans tous les modes du plan de salle.
--
-- Le plan de base n'a besoin de rien : une table tournée y est simplement une
-- table plus haute que large (largeur et hauteur échangées dans salle_tables).
-- Pendant un service, en revanche, le plan de base ne bouge jamais : la
-- rotation est un écart de plus, porté par salle_tables_service comme le
-- déplacement et la fusion.
--
--   pivotee : vrai = la table est tournée d'un quart de tour PAR RAPPORT AU
--             PLAN DE BASE pour ce service (largeur et hauteur échangées).
--
-- Migration additive (expand) : une colonne avec défaut, rien d'existant
-- touché. Le front déployé avant elle ne l'envoie pas, et l'upsert PostgREST
-- ne réécrit que les colonnes qu'il reçoit : la valeur est conservée. Le
-- nouveau front sans elle retombe sur un upsert sans la colonne et masque la
-- rotation en service. Idempotente. Rollback en fin.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.salle_tables_service
  add column if not exists pivotee boolean not null default false;

comment on column public.salle_tables_service.pivotee is
  'Table tournée d''un quart de tour par rapport au plan de base pour ce service (largeur et hauteur échangées).';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin, une fois le front qui la lit
-- retiré) :
--
--   alter table public.salle_tables_service drop column if exists pivotee;
-- ════════════════════════════════════════════════════════════════════════════
