-- ════════════════════════════════════════════════════════════════════════════
-- Plan de salle : tables déplacées et fusionnées pour UN service
-- ───────────────────────────────────────────────────────────────────────────
-- Demande de Jérémy (03.10.2026) : en mode service, le plan repart du plan de
-- base à chaque nouveau service, mais on peut bouger ou rapprocher des tables
-- pour une grande tablée, le temps du service, sans toucher au plan dessiné.
--
-- salle_tables reste le plan de base (le mobilier, sa place habituelle).
-- salle_tables_service porte l'écart d'UN service (date + midi/soir) :
--   • pos_x / pos_y : la table a été déplacée pour ce service (null = à sa
--     place habituelle) ;
--   • fusion        : clé commune aux tables rapprochées en une seule tablée
--     (null = table seule). La clé est l'id d'une des tables du groupe.
-- Aucune ligne pour un service = le plan de base. C'est ce qui fait repartir
-- chaque service du plan fixe sans aucun nettoyage.
--
-- Le service est celui affiché par l'app : 'midi' ou 'soir' (le brunch est
-- le midi du dimanche, il n'a pas de plan à part).
--
-- Migration additive (expand) : une table isolée, rien d'existant touché. Le
-- front déployé avant elle ne la lit pas ; le nouveau front sans elle masque
-- simplement le bouton « Ajuster la salle ». Idempotente. Rollback en fin.
--
-- RLS calquée sur salle_tables : lecture pour tout membre de l'établissement,
-- écriture selon user_peut_gerer('previsions', …), le même droit que le
-- placement des réservations (migration 20261001_reservations_droit_modifier).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.salle_tables_service (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  table_id         text        not null references public.salle_tables(id)  on delete cascade,
  date_service     date        not null,
  service          text        not null check (service in ('midi', 'soir')),
  pos_x            numeric,
  pos_y            numeric,
  fusion           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Une ligne par table et par service : le front écrit en upsert sur ce trio.
create unique index if not exists uq_salle_tables_service_table_jour
  on public.salle_tables_service(table_id, date_service, service);

create index if not exists idx_salle_tables_service_etab_jour
  on public.salle_tables_service(etablissement_id, date_service);

do $$
begin
  -- Même canevas virtuel 1000 × 700 que salle_tables. Les deux coordonnées
  -- vont ensemble : une table déplacée a une abscisse ET une ordonnée. Les
  -- « is not null » explicites comptent : sans eux, pos_y null rendrait la
  -- seconde branche NULL, et un CHECK NULL laisse passer la ligne.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.salle_tables_service'::regclass
      and conname = 'salle_tables_service_position'
  ) then
    alter table public.salle_tables_service
      add constraint salle_tables_service_position
      check (
        (pos_x is null and pos_y is null)
        or (pos_x is not null and pos_y is not null
            and pos_x >= 0 and pos_x <= 1000 and pos_y >= 0 and pos_y <= 700)
      );
  end if;
end $$;

alter table public.salle_tables_service enable row level security;

drop policy if exists salle_tables_service_select on public.salle_tables_service;
create policy salle_tables_service_select on public.salle_tables_service
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

-- La table ajustée doit appartenir au même établissement que la ligne :
-- sinon un compte multi-établissements pourrait écrire l'ajustement d'une
-- table de Woodland sous l'établissement du Rucher.
drop policy if exists salle_tables_service_insert on public.salle_tables_service;
create policy salle_tables_service_insert on public.salle_tables_service
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and exists (
      select 1 from public.salle_tables st
      where st.id = salle_tables_service.table_id
        and st.etablissement_id = salle_tables_service.etablissement_id
    )
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

drop policy if exists salle_tables_service_update on public.salle_tables_service;
create policy salle_tables_service_update on public.salle_tables_service
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and exists (
      select 1 from public.salle_tables st
      where st.id = salle_tables_service.table_id
        and st.etablissement_id = salle_tables_service.etablissement_id
    )
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

drop policy if exists salle_tables_service_delete on public.salle_tables_service;
create policy salle_tables_service_delete on public.salle_tables_service
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('previsions', array['consultant', 'patron', 'resp_cuisine', 'hote']))
  );

-- Temps réel : l'iPad de l'entrée et l'écran du bureau voient la même salle.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'salle_tables_service'
  ) then
    alter publication supabase_realtime add table public.salle_tables_service;
  end if;
end $$;

comment on table public.salle_tables_service is
  'Écart au plan de base pour un service (date + midi/soir) : table déplacée (pos_x/pos_y) ou rapprochée d''autres en une tablée (fusion). Aucune ligne = plan de base.';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) :
--
--   do $$
--   begin
--     if exists (select 1 from pg_publication_tables
--                where pubname = 'supabase_realtime' and tablename = 'salle_tables_service') then
--       alter publication supabase_realtime drop table public.salle_tables_service;
--     end if;
--   end $$;
--   drop table if exists public.salle_tables_service;
-- ════════════════════════════════════════════════════════════════════════════
