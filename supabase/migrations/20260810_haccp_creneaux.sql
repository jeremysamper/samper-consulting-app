-- ════════════════════════════════════════════════════════════════════════════
-- Créneaux de relevé de température - horaires propres à chaque établissement
-- ───────────────────────────────────────────────────────────────────────────
-- Jusqu'ici l'heure d'un relevé était soit saisie à la main, soit prise sur
-- l'horloge du device. Le module ne savait donc pas À QUELLE HEURE un
-- établissement est censé relever ses températures — or ça change du tout au
-- tout d'une maison à l'autre :
--   • Le Rucher d'Evolène : un seul shift, départ 6h → une tournée le matin,
--     une à la fermeture.
--   • Woodland Village : double service → tournée d'ouverture, avant le
--     service du midi, avant celui du soir, puis fermeture.
--
-- Cette table porte cette grille horaire par établissement. Elle sert à
-- pré-remplir l'heure au moment de la saisie et à afficher ce qui reste à
-- relever dans la journée. Elle ne contraint jamais la saisie : un relevé hors
-- créneau reste possible (contrôle exceptionnel, retour de panne).
--
-- Migration additive (expand) : table isolée, aucune colonne ni politique
-- existante touchée. Un bundle déployé AVANT cette migration ne lit pas cette
-- table et continue de fonctionner à l'identique ; un bundle déployé APRÈS
-- mais sans la table lit une liste vide et retombe sur la saisie libre
-- d'aujourd'hui. Idempotente, rejouable sans erreur.
--
-- RLS calquée sur haccp_zones / haccp_ctrl_templates (les deux autres tables de
-- configuration du module) : `user_can_access_etab(etablissement_id)` sur les
-- quatre commandes, sans filtre de rôle. La restriction au consultant reste
-- portée par l'onglet « ✦ Paramètres » côté front, comme pour les zones.
-- Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────
-- `id` en text (et non uuid) : les identifiants sont générés côté client par le
-- bridge, comme pour haccp_zones ('hz-…') et haccp_ctrl_templates ('ht-…').
-- Pas de colonne `ordre` : une grille horaire s'affiche dans l'ordre de
-- l'horloge, point. Un ordre manuel qui contredirait l'heure ne servirait qu'à
-- présenter la tournée du soir avant celle du midi.
create table if not exists public.haccp_creneaux (
  id               text        primary key,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  label            text        not null,   -- « Ouverture », « Avant service du soir »…
  heure            time        not null,
  actif            boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_haccp_creneaux_etab
  on public.haccp_creneaux(etablissement_id);

-- Deux créneaux à la même heure dans le même établissement, c'est une erreur de
-- saisie : la tournée de 07:00 apparaîtrait en double dans la liste du jour et
-- le rattachement d'un relevé à son créneau deviendrait ambigu.
create unique index if not exists uq_haccp_creneaux_etab_heure
  on public.haccp_creneaux(etablissement_id, heure);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Contraintes CHECK
-- ───────────────────────────────────────────────────────────────────────────
-- `ADD CONSTRAINT IF NOT EXISTS` n'existe pas en PostgreSQL : la garde
-- d'existence passe par un bloc DO, sinon la migration échoue au rejeu.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.haccp_creneaux'::regclass
      and conname = 'haccp_creneaux_label_non_vide'
  ) then
    alter table public.haccp_creneaux
      add constraint haccp_creneaux_label_non_vide
      check (btrim(label) <> '');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.haccp_creneaux enable row level security;

drop policy if exists hcr_select on public.haccp_creneaux;
create policy hcr_select on public.haccp_creneaux
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists hcr_insert on public.haccp_creneaux;
create policy hcr_insert on public.haccp_creneaux
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id));

drop policy if exists hcr_update on public.haccp_creneaux;
create policy hcr_update on public.haccp_creneaux
  for update to authenticated
  using (user_can_access_etab(etablissement_id))
  with check (user_can_access_etab(etablissement_id));

drop policy if exists hcr_delete on public.haccp_creneaux;
create policy hcr_delete on public.haccp_creneaux
  for delete to authenticated
  using (user_can_access_etab(etablissement_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Realtime - ajout à la publication (idempotent)
-- ───────────────────────────────────────────────────────────────────────────
-- Le module HACCP recharge zones, contrôles et relevés sur event : un créneau
-- ajouté depuis le poste du consultant doit apparaître sur l'iPad de la cuisine
-- sans rechargement de page, comme une zone.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'haccp_creneaux'
  ) then
    alter publication supabase_realtime add table public.haccp_creneaux;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Commentaires
-- ─────────────────────────────────────────────────────────────────────────────
comment on table public.haccp_creneaux is
  'Grille horaire des relevés de température d''un établissement (tournées d''ouverture, d''avant-service, de fermeture). Pré-remplit l''heure à la saisie et alimente le suivi « fait / à faire » du jour. Ne contraint jamais la saisie.';

comment on column public.haccp_creneaux.heure is
  'Heure prévue de la tournée, heure locale de l''établissement (Europe/Zurich). Sans fuseau : c''est un horaire d''organisation, pas un instant.';

comment on column public.haccp_creneaux.actif is
  'Créneau inactif = conservé en configuration mais retiré de la saisie et du suivi du jour (fermeture saisonnière, service supprimé).';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) :
--
--   do $$
--   begin
--     if exists (
--       select 1 from pg_publication_tables
--       where pubname = 'supabase_realtime' and tablename = 'haccp_creneaux'
--     ) then
--       alter publication supabase_realtime drop table public.haccp_creneaux;
--     end if;
--   end $$;
--   drop table if exists public.haccp_creneaux;
-- ════════════════════════════════════════════════════════════════════════════
