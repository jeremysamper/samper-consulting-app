-- ════════════════════════════════════════════════════════════════════════════
-- Branche Hôtel, lot H1 : housekeeping complet et rôles hôtel
-- ───────────────────────────────────────────────────────────────────────────
-- Suite du lot H0 (20261028_hotel_h0). Quatre rôles neufs côté app
-- (receptionniste, gouvernante, femme_de_chambre, technicien : profiles.role
-- est du texte libre, aucune contrainte en base, les listes fermées vivent
-- dans create-user, ai-proxy et spa-mailer). Ici :
--   • quatre tables neuves : minibar consommé par chambre et séjour, objets
--     trouvés, mouvements de linge, turndown du soir ;
--   • rôles hôtel dans les rôles par défaut des policies de chambres et
--     sejours (mêmes listes que manageableModules côté front) ;
--   • droit « inspection » : passer une chambre « inspectée » demande la case
--     Inspecter les chambres (user_peut_gerer('inspection'), consultant,
--     patron et gouvernante par défaut), vérifié par chambres_garde_colonnes.
-- Expand only : aucune table existante modifiée (les policies et le
-- déclencheur réécrits sont ceux du lot H0, sur ses propres tables).
-- Idempotente. Inverse : supabase/migrations-inverse/20261028_hotel_h1.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.chambres_minibar (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  chambre_id       uuid        not null references public.chambres(id) on delete cascade,
  sejour_id        uuid        references public.sejours(id) on delete set null,
  article          text        not null,
  quantite         integer     not null default 1 check (quantite >= 1),
  note             text,
  par              text        references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint chambres_minibar_article_non_vide check (btrim(article) <> '')
);
create index if not exists idx_chambres_minibar_etab    on public.chambres_minibar(etablissement_id, created_at desc);
create index if not exists idx_chambres_minibar_chambre on public.chambres_minibar(chambre_id);
create index if not exists idx_chambres_minibar_sejour  on public.chambres_minibar(sejour_id);
create index if not exists idx_chambres_minibar_par     on public.chambres_minibar(par);

create table if not exists public.objets_trouves (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  chambre_id       uuid        references public.chambres(id) on delete set null,
  sejour_id        uuid        references public.sejours(id) on delete set null,
  description      text        not null,
  lieu             text,
  trouve_le        date        not null default ((now() at time zone 'Europe/Zurich')::date),
  statut           text        not null default 'trouve' check (statut in ('trouve', 'rendu', 'jete')),
  rendu_le         date,
  rendu_a          text,
  note             text,
  par              text        references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint objets_trouves_description_non_vide check (btrim(description) <> '')
);
create index if not exists idx_objets_trouves_etab    on public.objets_trouves(etablissement_id, statut, trouve_le desc);
create index if not exists idx_objets_trouves_chambre on public.objets_trouves(chambre_id);
create index if not exists idx_objets_trouves_sejour  on public.objets_trouves(sejour_id);
create index if not exists idx_objets_trouves_par     on public.objets_trouves(par);

create table if not exists public.linge_mouvements (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  chambre_id       uuid        references public.chambres(id) on delete set null,
  jour             date        not null default ((now() at time zone 'Europe/Zurich')::date),
  sens             text        not null default 'sale' check (sens in ('sale', 'propre')),
  type             text        not null check (type in ('draps', 'serviettes', 'peignoirs', 'tapis', 'autre')),
  quantite         integer     not null default 1 check (quantite >= 1),
  note             text,
  par              text        references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists idx_linge_mouvements_etab    on public.linge_mouvements(etablissement_id, jour desc);
create index if not exists idx_linge_mouvements_chambre on public.linge_mouvements(chambre_id);
create index if not exists idx_linge_mouvements_par     on public.linge_mouvements(par);

create table if not exists public.chambres_turndown (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  chambre_id       uuid        not null references public.chambres(id) on delete cascade,
  jour             date        not null default ((now() at time zone 'Europe/Zurich')::date),
  fait_par         text        references public.profiles(id) on delete set null,
  at               timestamptz not null default now(),
  constraint uq_chambres_turndown_jour unique (chambre_id, jour)
);
create index if not exists idx_chambres_turndown_etab     on public.chambres_turndown(etablissement_id, jour desc);
create index if not exists idx_chambres_turndown_fait_par on public.chambres_turndown(fait_par);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Déclencheurs
-- ─────────────────────────────────────────────────────────────────────────────
create or replace trigger trg_objets_trouves_updated_at
  before update on public.objets_trouves
  for each row execute function public.set_updated_at();

-- Cohérence : la chambre et le séjour d'une ligne appartiennent à son
-- établissement (un compte rattaché à deux hôtels ne mélange pas les deux), et
-- l'auteur (par, fait_par) ne se réécrit pas au nom d'un collègue. SECURITY
-- INVOKER : lu avec les droits de l'appelant, par la RLS.
create or replace function public.hotel_h1_coherence()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  col text;
  avant text;
  apres text;
begin
  if tg_op = 'UPDATE' and (select auth.uid()) is not null then
    foreach col in array array['par', 'fait_par'] loop
      if to_jsonb(new) ? col then
        avant := to_jsonb(old) ->> col;
        apres := to_jsonb(new) ->> col;
        if apres is distinct from avant and apres is not null and apres <> (select auth.uid())::text then
          raise exception 'AUTEUR_FIXE: l''auteur d''une ligne ne se réécrit pas au nom d''un collègue' using errcode = '42501';
        end if;
      end if;
    end loop;
  end if;
  if new.chambre_id is not null and not exists (
    select 1 from public.chambres c where c.id = new.chambre_id and c.etablissement_id = new.etablissement_id
  ) then
    raise exception 'CHAMBRE_INCONNUE: la chambre n''appartient pas à cet établissement' using errcode = '23503';
  end if;
  if to_jsonb(new) ? 'sejour_id' and (to_jsonb(new) ->> 'sejour_id') is not null and not exists (
    select 1 from public.sejours s where s.id = (to_jsonb(new) ->> 'sejour_id')::uuid and s.etablissement_id = new.etablissement_id
  ) then
    raise exception 'SEJOUR_INCONNU: le séjour n''appartient pas à cet établissement' using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function public.hotel_h1_coherence() from public, anon, authenticated;

create or replace trigger trg_chambres_minibar_coherence
  before insert or update on public.chambres_minibar
  for each row execute function public.hotel_h1_coherence();
create or replace trigger trg_objets_trouves_coherence
  before insert or update on public.objets_trouves
  for each row execute function public.hotel_h1_coherence();
create or replace trigger trg_linge_mouvements_coherence
  before insert or update on public.linge_mouvements
  for each row execute function public.hotel_h1_coherence();
create or replace trigger trg_chambres_turndown_coherence
  before insert or update on public.chambres_turndown
  for each row execute function public.hotel_h1_coherence();

-- Garde des colonnes de chambres (lot H0), plus le droit d'inspection : seule
-- la case « Inspecter les chambres » passe une chambre à « inspectée ».
create or replace function public.chambres_garde_colonnes()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.etablissement_id <> old.etablissement_id then
    raise exception 'CHAMBRE_ETABLISSEMENT_FIXE: une chambre ne change pas d''établissement'
      using errcode = '23514';
  end if;
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.statut_menage = 'inspectee' and old.statut_menage is distinct from 'inspectee'
     and not public.user_peut_gerer('inspection', array['consultant', 'patron', 'gouvernante']) then
    raise exception 'INSPECTION_RESERVEE: passer une chambre « inspectée » demande le droit Inspecter les chambres'
      using errcode = '42501';
  end if;
  if public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']) then
    return new;
  end if;
  if new.numero <> old.numero
     or new.etage is distinct from old.etage
     or new.categorie is distinct from old.categorie
     or new.capacite <> old.capacite
     or new.ordre <> old.ordre
     or new.actif <> old.actif then
    raise exception 'CHAMBRE_FICHE_RESERVEE: la fiche de la chambre (numéro, étage, catégorie, capacité, ordre, actif) se modifie avec le droit Hébergement'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.chambres_garde_colonnes() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- Rôles hôtel dans les défauts des policies du lot H0.
-- Une chambre ne naît « inspectée » qu'avec le droit d'inspection (le
-- déclencheur de garde ne couvre que la mise à jour).
drop policy if exists chambres_insert on public.chambres;
create policy chambres_insert on public.chambres
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']))
    and (statut_menage <> 'inspectee' or (select public.user_peut_gerer('inspection', array['consultant', 'patron', 'gouvernante'])))
  );

drop policy if exists chambres_update on public.chambres;
create policy chambres_update on public.chambres
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (
      (select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']))
      or (select public.user_peut_gerer('etages', array['consultant', 'patron', 'gouvernante', 'femme_de_chambre', 'receptionniste']))
    )
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (
      (select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']))
      or (select public.user_peut_gerer('etages', array['consultant', 'patron', 'gouvernante', 'femme_de_chambre', 'receptionniste']))
    )
  );

drop policy if exists chambres_delete on public.chambres;
create policy chambres_delete on public.chambres
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']))
  );

drop policy if exists sejours_insert on public.sejours;
create policy sejours_insert on public.sejours
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']))
  );

drop policy if exists sejours_update on public.sejours;
create policy sejours_update on public.sejours
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']))
  );

drop policy if exists sejours_delete on public.sejours;
create policy sejours_delete on public.sejours
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']))
  );

-- Tables neuves : lues par l'équipe ; écrites avec la case « Modifier »
-- d'Étages (minibar, linge, turndown), ou d'Étages ou d'Hébergement (objets
-- trouvés : la réception les rend aux hôtes). À la création, l'auteur (par,
-- fait_par) est le compte connecté ou nul, jamais un collègue ; à la mise à
-- jour, le déclencheur hotel_h1_coherence le garde. Sans case cochée,
-- resp_cuisine, cuisinier, serveur, hote, praticien_spa et technicien lisent
-- sans écrire : c'est voulu, la case se coche par personne dans Rôles & accès.
alter table public.chambres_minibar  enable row level security;
alter table public.objets_trouves    enable row level security;
alter table public.linge_mouvements  enable row level security;
alter table public.chambres_turndown enable row level security;
revoke all on table public.chambres_minibar  from anon;
revoke all on table public.objets_trouves    from anon;
revoke all on table public.linge_mouvements  from anon;
revoke all on table public.chambres_turndown from anon;

do $$
declare
  t text;
  etages text := '(select public.user_peut_gerer(''etages'', array[''consultant'', ''patron'', ''gouvernante'', ''femme_de_chambre'', ''receptionniste'']))';
  hebergement text := '(select public.user_peut_gerer(''hebergement'', array[''consultant'', ''patron'', ''receptionniste'']))';
  droit text;
  auteur text;
begin
  foreach t in array array['chambres_minibar', 'objets_trouves', 'linge_mouvements', 'chambres_turndown'] loop
    droit := case when t = 'objets_trouves' then '(' || etages || ' or ' || hebergement || ')' else etages end;
    auteur := case when t = 'chambres_turndown' then 'fait_par' else 'par' end;
    auteur := '(' || auteur || ' is null or ' || auteur || ' = (select auth.uid())::text)';
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_can_access_etab(etablissement_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_can_access_etab(etablissement_id) and %s and %s)', t || '_insert', t, droit, auteur);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_can_access_etab(etablissement_id) and %s) with check (user_can_access_etab(etablissement_id) and %s)', t || '_update', t, droit, droit);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_can_access_etab(etablissement_id) and %s)', t || '_delete', t, droit);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['chambres_minibar', 'objets_trouves', 'linge_mouvements', 'chambres_turndown'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Commentaires
-- ─────────────────────────────────────────────────────────────────────────────
comment on table public.chambres_minibar is
  'Consommations de minibar relevées par les étages (lot H1), rattachées à la chambre et au séjour en maison. Sans prix : la facturation vient au lot H4.';
comment on table public.objets_trouves is
  'Objets trouvés dans les chambres et les parties communes (lot H1) : trouvé, rendu (à qui, quand) ou jeté.';
comment on table public.linge_mouvements is
  'Mouvements de linge par chambre et par jour (lot H1) : sale sorti, propre entré, par type et quantité.';
comment on table public.chambres_turndown is
  'Couverture du soir (turndown) faite pour une chambre un jour donné (lot H1) : une ligne par chambre et par jour.';
