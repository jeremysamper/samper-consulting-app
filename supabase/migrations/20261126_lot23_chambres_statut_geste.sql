-- Lot 23 du panel : le statut d'une chambre changé sans réseau (étages).
--
-- Expand seul, idempotent. Le front déployé ne lit rien de neuf : il garde son
-- écriture directe (update de chambres), que le déclencheur horodate.
--
-- 1. chambres.statut_menage_at : heure du dernier changement de statut connu
--    de la base. Posée par le déclencheur à chaque écriture directe qui change
--    le statut (heure du serveur), et par la RPC à l'heure du geste. NULL sur
--    les chambres d'avant ce lot : la RPC prend alors le dernier changement du
--    journal, puis la création de la chambre (aucune réécriture en masse).
-- 2. chambres_statut_gestes : une ligne par geste reçu, clé = UUID posé par
--    l'appareil. Elle rend la RPC idempotente (même clé reçue deux fois, une
--    seule écriture).
-- 3. chambre_statut_geste(...) : écrit le statut seulement si l'heure du geste
--    est plus récente que statut_menage_at (D1 : décidé en base). Rend
--    'applique', 'ignore' (plus ancien) ou 'deja_recu'. SECURITY INVOKER : la
--    RLS de chambres (policy chambres_update) et le déclencheur de garde
--    (inspection) s'appliquent tels quels, sans copie des droits ici.

-- ── 1. Colonne et déclencheur ──────────────────────────────────────────────
alter table public.chambres add column if not exists statut_menage_at timestamptz;
alter table public.chambres alter column statut_menage_at set default now();

create or replace function public.chambres_statut_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_geste text := current_setting('app.chambre_statut_at', true);
begin
  if v_geste is not null and v_geste <> '' then
    -- Écriture par chambre_statut_geste : l'heure du geste, déjà bornée.
    new.statut_menage_at := v_geste::timestamptz;
  elsif new.statut_menage is distinct from old.statut_menage then
    new.statut_menage_at := now();
  else
    -- Personne ne pose cette heure à la main.
    new.statut_menage_at := old.statut_menage_at;
  end if;
  return new;
end;
$$;

revoke all on function public.chambres_statut_at() from public, anon, authenticated;

drop trigger if exists trg_chambres_statut_at on public.chambres;
create trigger trg_chambres_statut_at
  before update on public.chambres
  for each row execute function public.chambres_statut_at();

-- ── 2. Clés des gestes reçus ───────────────────────────────────────────────
create table if not exists public.chambres_statut_gestes (
  cle uuid primary key,
  etablissement_id text not null references public.etablissements(id) on delete cascade,
  chambre_id uuid not null references public.chambres(id) on delete cascade,
  statut text not null,
  geste_at timestamptz not null,
  resultat text not null check (resultat in ('applique', 'ignore')),
  par text,
  recu_at timestamptz not null default now()
);
create index if not exists idx_chambres_statut_gestes_etab on public.chambres_statut_gestes (etablissement_id);
create index if not exists idx_chambres_statut_gestes_chambre on public.chambres_statut_gestes (chambre_id);

alter table public.chambres_statut_gestes enable row level security;

-- Lecture aussi large que le journal des statuts (chambres_statut_journal) :
-- toute personne de l'établissement, choix voulu. Écriture : celles qui
-- peuvent changer le statut (mêmes rôles que la policy chambres_update), sur
-- une chambre de l'établissement de la ligne.
drop policy if exists chambres_statut_gestes_select on public.chambres_statut_gestes;
create policy chambres_statut_gestes_select on public.chambres_statut_gestes
  for select to authenticated
  using (public.user_can_access_etab(etablissement_id));

drop policy if exists chambres_statut_gestes_insert on public.chambres_statut_gestes;
create policy chambres_statut_gestes_insert on public.chambres_statut_gestes
  for insert to authenticated
  with check (
    public.user_can_access_etab(etablissement_id)
    and par = (select auth.uid())::text
    and exists (select 1 from public.chambres c
                where c.id = chambre_id and c.etablissement_id = chambres_statut_gestes.etablissement_id)
    and ((select public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']))
      or (select public.user_peut_gerer('etages', array['consultant', 'patron', 'gouvernante', 'femme_de_chambre', 'receptionniste'])))
  );

revoke all on public.chambres_statut_gestes from anon, authenticated;
grant select, insert on public.chambres_statut_gestes to authenticated;

-- ── 3. RPC ─────────────────────────────────────────────────────────────────
create or replace function public.chambre_statut_geste(
  p_cle uuid,
  p_chambre_id uuid,
  p_statut text,
  p_motif text default null,
  p_geste_at timestamptz default null
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_at timestamptz;
  v_actuel timestamptz;
  v_etab text;
  v_cree timestamptz;
  v_resultat text;
begin
  if v_uid is null then
    raise exception 'ETAGES_RESERVE: connexion requise' using errcode = '42501';
  end if;
  if p_cle is null or p_chambre_id is null then
    raise exception 'GESTE_INCOMPLET: clé et chambre requises' using errcode = '22023';
  end if;
  if p_statut is null or p_statut not in ('a_faire', 'en_cours', 'propre', 'inspectee', 'hors_service') then
    raise exception 'STATUT_INCONNU: statut de chambre inconnu' using errcode = '23514';
  end if;
  -- D2 : l'heure du geste vient de l'appareil, bornée par la base. Sans
  -- heure (geste en ligne), c'est maintenant.
  if p_geste_at is not null and p_geste_at > now() + interval '5 minutes' then
    raise exception 'GESTE_HEURE_REFUSEE: heure du geste dans le futur' using errcode = '22007';
  end if;
  if p_geste_at is not null and p_geste_at < now() - interval '48 hours' then
    raise exception 'GESTE_HEURE_REFUSEE: geste de plus de 48 heures' using errcode = '22007';
  end if;
  v_at := least(coalesce(p_geste_at, now()), now());

  if exists (select 1 from public.chambres_statut_gestes g where g.cle = p_cle) then
    return 'deja_recu';
  end if;

  select c.etablissement_id into v_etab from public.chambres c where c.id = p_chambre_id;
  if not found then
    raise exception 'CHAMBRE_INCONNUE: chambre introuvable' using errcode = 'P0002';
  end if;
  -- FOR UPDATE applique aussi la policy chambres_update : sans le droit
  -- Modifier d'Étages ou d'Hébergement, la ligne ne revient pas.
  select c.statut_menage_at, c.created_at into v_actuel, v_cree
    from public.chambres c where c.id = p_chambre_id for update;
  if not found then
    raise exception 'ETAGES_RESERVE: changer le statut d''une chambre demande le droit Modifier d''Étages' using errcode = '42501';
  end if;
  if v_actuel is null then
    select max(j.at) into v_actuel from public.chambres_statut_journal j where j.chambre_id = p_chambre_id;
    v_actuel := coalesce(v_actuel, v_cree);
  end if;

  v_resultat := case when v_actuel is not null and v_at <= v_actuel then 'ignore' else 'applique' end;

  insert into public.chambres_statut_gestes (cle, etablissement_id, chambre_id, statut, geste_at, resultat, par)
  values (p_cle, v_etab, p_chambre_id, p_statut, coalesce(p_geste_at, v_at), v_resultat, v_uid)
  on conflict (cle) do nothing;
  if not found then
    return 'deja_recu';
  end if;
  if v_resultat = 'ignore' then
    return 'ignore';
  end if;

  perform set_config('app.chambre_statut_at', v_at::text, true);
  update public.chambres
     set statut_menage = p_statut,
         hors_service_motif = case when p_statut = 'hors_service' then nullif(btrim(coalesce(p_motif, '')), '') end
   where id = p_chambre_id;
  perform set_config('app.chambre_statut_at', '', true);
  return 'applique';
end;
$$;

revoke all on function public.chambre_statut_geste(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.chambre_statut_geste(uuid, uuid, text, text, timestamptz) to authenticated;
