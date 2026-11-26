-- Rollback du lot 23 (statut d'une chambre sans réseau) : RPC, table des
-- clés, déclencheur et sa fonction, colonne.

drop function if exists public.chambre_statut_geste(uuid, uuid, text, text, timestamptz);
drop table if exists public.chambres_statut_gestes;
drop trigger if exists trg_chambres_statut_at on public.chambres;
drop function if exists public.chambres_statut_at();
alter table public.chambres drop column if exists statut_menage_at;
