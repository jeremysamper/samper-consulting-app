-- ─────────────────────────────────────────────────────────────────────────────
-- Hausses de prix fournisseur (Factures & achats)
--
-- Objet :
--   1. compta_reglages.seuil_hausse_prix_pct : seuil d'alerte de l'établissement,
--      en pour cent (5 par défaut). Rangé dans la ligne de réglages « argent » de
--      l'établissement, qui porte déjà la bonne règle d'accès : lecture par la
--      direction ou le droit « Régler les factures », écriture par ce droit.
--   2. achats_hausses_vues : « cette hausse a été vue », une ligne par hausse et
--      par établissement, partagée par toute la direction. La hausse elle-même
--      n'est pas stockée : le front la calcule depuis les lignes lues des
--      factures et des bons (analysesAchats.js, haussesPrix). `cle` est la clé
--      que ce calcul donne à la hausse (document, fournisseur, article, unité).
--
-- Compatibilité : purement additif (expand). Aucun DROP, aucun RENAME, aucune
-- colonne existante modifiée. Le front déployé ne lit ni la colonne ni la table.
-- Idempotence : rejouable.
-- Rollback : 20261118_achats_hausses_prix.rollback.sql (après retrait du front).
-- ─────────────────────────────────────────────────────────────────────────────

set local lock_timeout = '5s';

-- ── 1. Seuil de l'établissement ──
alter table public.compta_reglages
  add column if not exists seuil_hausse_prix_pct numeric not null default 5;

do $$ begin
  alter table public.compta_reglages
    add constraint compta_reglages_seuil_hausse_chk
    check (seuil_hausse_prix_pct >= 1 and seuil_hausse_prix_pct <= 50);
exception when duplicate_object then null; end $$;

comment on column public.compta_reglages.seuil_hausse_prix_pct is
  'Hausses de prix fournisseur : écart minimal, en pour cent, entre le prix à l''unité (kilo, litre, pièce) d''un article et son dernier prix chez le même fournisseur pour que la direction soit alertée. 5 par défaut.';

-- Les mises à jour passent par des droits de colonnes (20261030_comptabilite) :
-- la colonne neuve doit y entrer, sinon son enregistrement serait refusé.
grant update (seuil_hausse_prix_pct) on public.compta_reglages to authenticated;

-- ── 2. Hausses vues ──
create table if not exists public.achats_hausses_vues (
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  cle              text        not null check (length(cle) between 1 and 500),
  vu_par           text        default (auth.uid())::text,
  vu_le            timestamptz not null default now(),
  primary key (etablissement_id, cle)
);
-- La clé primaire couvre la clé étrangère (etablissement_id en tête).

alter table public.achats_hausses_vues enable row level security;
revoke all on public.achats_hausses_vues from public, anon, authenticated;
grant select, insert, delete on public.achats_hausses_vues to authenticated;

-- Lecture : comme compta_reglages (direction, ou droit « Régler les factures »).
drop policy if exists achats_hausses_vues_select on public.achats_hausses_vues;
create policy achats_hausses_vues_select on public.achats_hausses_vues
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (
      (select public.current_user_role()) = any (array['consultant', 'patron'])
      or (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    )
  );

-- Marquer vue : droit « Régler les factures », au nom de qui le fait.
drop policy if exists achats_hausses_vues_insert on public.achats_hausses_vues;
create policy achats_hausses_vues_insert on public.achats_hausses_vues
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    and vu_par is not distinct from (select auth.uid())::text
  );

-- Remettre à voir : même droit.
drop policy if exists achats_hausses_vues_delete on public.achats_hausses_vues;
create policy achats_hausses_vues_delete on public.achats_hausses_vues
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
  );

comment on table public.achats_hausses_vues is
  'Hausses de prix fournisseur marquées vues, par établissement. La hausse est calculée par le front depuis achats_documents.lignes ; cle = document, fournisseur, article et unité.';

-- Realtime : un « vu » posé sur un appareil retire la hausse des autres.
do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'achats_hausses_vues'
  ) then
    alter publication supabase_realtime add table public.achats_hausses_vues;
  end if;
end $pub$;
