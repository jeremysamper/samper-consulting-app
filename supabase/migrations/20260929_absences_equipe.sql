-- ════════════════════════════════════════════════════════════════════════════
-- Absences de l'équipe (congé, formation, absence)
-- ───────────────────────────────────────────────────────────────────────────
-- Le planning ne connaissait que les horaires : un équipier en vacances
-- n'était qu'une ligne vide, indiscernable d'un jour de repos. Cette table
-- porte les absences posées par la direction dans le Planning ; le tableau de
-- bord les affiche (« Lucas en congé jusqu'au 4 ») et le planning les montre
-- dans la grille.
--
-- Trois motifs seulement, tous partageables avec l'équipe : congé, formation
-- (cours, école professionnelle) et « absence », qui couvre volontairement
-- maladie, accident ou raison personnelle SANS la nommer. Aucune colonne de
-- texte libre : la raison d'une absence (santé en particulier, donnée sensible
-- au sens de la nLPD) reste hors de l'app, et toute la ligne peut être lue par
-- les membres de l'établissement.
--
-- Lecture : tout membre de l'établissement. Écriture : consultant, patron et
-- responsable de cuisine (les gestionnaires par défaut du planning).
--
-- Migration additive, idempotente. Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.absences (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  user_id          text        not null references public.profiles(id) on delete cascade,
  motif            text        not null default 'conge'
                               check (motif in ('conge', 'formation', 'absence')),
  date_debut       date        not null,
  date_fin         date        not null,
  created_by       text        default (auth.uid())::text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint absences_dates_ordonnees check (date_fin >= date_debut),
  constraint absences_duree_max check (date_fin - date_debut <= 366)
);

-- Le tableau de bord et le planning lisent « ce qui n'est pas encore fini ».
create index if not exists idx_absences_etab_fin
  on public.absences(etablissement_id, date_fin);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.absences enable row level security;
revoke all on public.absences from anon;
grant select, insert, update, delete on public.absences to authenticated;

drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists absences_insert on public.absences;
create policy absences_insert on public.absences
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

drop policy if exists absences_update on public.absences;
create policy absences_update on public.absences
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

drop policy if exists absences_delete on public.absences;
create policy absences_delete on public.absences
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime : une absence posée depuis le bureau apparaît tout de suite sur la
-- tablette du passe.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'absences'
  ) then
    alter publication supabase_realtime add table public.absences;
  end if;
end $$;

comment on table public.absences is
  'Absences de l''équipe posées dans le Planning (congé, formation, absence). Motif volontairement générique, sans texte libre : lisible par tous les membres de l''établissement.';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) :
--   drop table if exists public.absences;
-- ════════════════════════════════════════════════════════════════════════════
