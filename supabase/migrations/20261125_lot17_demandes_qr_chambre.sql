-- Lot 17 du panel : la demande de l'hôte par un code QR dans la chambre.
--
-- Chaque chambre porte un jeton de 32 signes hexadécimaux (table à part, lue
-- par la direction seule). L'hôte ouvre /chambre/<jeton>, choisit une des
-- demandes que la maison a ouvertes aux hôtes, ajoute un mot s'il le veut, et
-- la demande arrive dans Demandes avec son pôle, sa priorité, son échéance, sa
-- chambre et son séjour. Il suit ensuite l'état de ses demandes.
--
-- Expand seul, idempotent :
--   demandes.par_qr                colonne neuve, gardée par trg_demandes_par_qr
--   demandes_qr_parametres         service allumé, libellés ouverts aux hôtes
--   demandes_qr_chambres           le jeton de chaque chambre
--   demandes_qr_sources            appareil et empreinte réseau de chaque envoi
--   demande_chambre_ouvrir         anon : la page de la chambre
--   demande_chambre_envoyer        anon : l'envoi d'une demande
--   demande_chambre_suivi          anon : l'état des demandes de ce téléphone
--   demandes_qr_preparer           direction : jetons manquants
--   demandes_qr_renouveler         direction : nouveau jeton d'une chambre
--
-- Rien ne répond tant que demandes_qr_parametres.actif est faux : la
-- migration peut précéder le front sans rien ouvrir.
--
-- Le plafond par source réseau lit cf-connecting-ip, posé par la passerelle
-- (hypothèse de la migration L3 de la Caisse). L'empreinte est un md5 de
-- l'adresse et de l'établissement ; les sources se purgent à 30 jours.

-- 1. Colonne par_qr et sa garde ------------------------------------------------

alter table public.demandes add column if not exists par_qr boolean not null default false;

comment on column public.demandes.par_qr is
  'Lot 17 : demande née du QR de la chambre, sans compte. Posée à vrai par demande_chambre_envoyer seule (garde trg_demandes_par_qr).';

create or replace function public.demandes_par_qr_garde()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- Une session connectée ne pose jamais par_qr : seule la fonction d'envoi,
    -- appelée sans session, crée une demande par QR.
    if (select auth.uid()) is not null then
      new.par_qr := false;
    end if;
  else
    new.par_qr := old.par_qr;
  end if;
  return new;
end;
$$;

revoke all on function public.demandes_par_qr_garde() from public, anon, authenticated;

drop trigger if exists trg_demandes_par_qr on public.demandes;
create trigger trg_demandes_par_qr
  before insert or update on public.demandes
  for each row execute function public.demandes_par_qr_garde();

-- 2. Réglages du service -------------------------------------------------------

create or replace function public.demandes_qr_libelles_valides(p text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(cardinality(p), 0) <= 40
     and not exists (select 1 from unnest(coalesce(p, '{}'::text[])) l
                      where l is null or char_length(l) < 1 or char_length(l) > 60);
$$;

-- La contrainte de demandes_qr_parametres l'appelle aux écritures de l'équipe.
revoke all on function public.demandes_qr_libelles_valides(text[]) from public, anon, authenticated;
grant execute on function public.demandes_qr_libelles_valides(text[]) to authenticated;

create table if not exists public.demandes_qr_parametres (
  etablissement_id text        primary key references public.etablissements(id) on delete cascade,
  actif            boolean     not null default false,
  libelles         text[]      not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint demandes_qr_parametres_libelles_check check (public.demandes_qr_libelles_valides(libelles))
);

comment on table public.demandes_qr_parametres is
  'Lot 17 : demande par QR dans la chambre. Service allumé ou non, et libellés des demandes courantes ouverts aux hôtes.';

drop trigger if exists trg_demandes_qr_parametres_updated_at on public.demandes_qr_parametres;
create trigger trg_demandes_qr_parametres_updated_at
  before update on public.demandes_qr_parametres
  for each row execute function public.set_updated_at();

alter table public.demandes_qr_parametres enable row level security;

revoke all on public.demandes_qr_parametres from anon, authenticated;
grant select, insert, update on public.demandes_qr_parametres to authenticated;

drop policy if exists demandes_qr_parametres_select on public.demandes_qr_parametres;
create policy demandes_qr_parametres_select on public.demandes_qr_parametres
  for select to authenticated
  using (public.user_can_access_etab(etablissement_id));

drop policy if exists demandes_qr_parametres_insert on public.demandes_qr_parametres;
create policy demandes_qr_parametres_insert on public.demandes_qr_parametres
  for insert to authenticated
  with check (public.user_can_access_etab(etablissement_id)
              and (select public.current_user_role()) = any (array['consultant', 'patron']));

drop policy if exists demandes_qr_parametres_update on public.demandes_qr_parametres;
create policy demandes_qr_parametres_update on public.demandes_qr_parametres
  for update to authenticated
  using (public.user_can_access_etab(etablissement_id)
         and (select public.current_user_role()) = any (array['consultant', 'patron']))
  with check (public.user_can_access_etab(etablissement_id)
              and (select public.current_user_role()) = any (array['consultant', 'patron']));

-- 3. Jetons des chambres -------------------------------------------------------

create table if not exists public.demandes_qr_chambres (
  chambre_id       uuid        primary key references public.chambres(id) on delete cascade,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  jeton            text        not null unique,
  created_at       timestamptz not null default now(),
  renouvele_at     timestamptz,
  constraint demandes_qr_chambres_jeton_check check (jeton ~ '^[0-9a-f]{32}$')
);

comment on table public.demandes_qr_chambres is
  'Lot 17 : jeton du QR de chaque chambre. Lu par la direction seule, écrit par demandes_qr_preparer et demandes_qr_renouveler.';

create index if not exists idx_demandes_qr_chambres_etab
  on public.demandes_qr_chambres(etablissement_id);

alter table public.demandes_qr_chambres enable row level security;

revoke all on public.demandes_qr_chambres from anon, authenticated;
grant select on public.demandes_qr_chambres to authenticated;

drop policy if exists demandes_qr_chambres_select on public.demandes_qr_chambres;
create policy demandes_qr_chambres_select on public.demandes_qr_chambres
  for select to authenticated
  using (public.user_can_access_etab(etablissement_id)
         and (select public.current_user_role()) = any (array['consultant', 'patron']));

-- 4. Sources des envois --------------------------------------------------------

create table if not exists public.demandes_qr_sources (
  demande_id       uuid        primary key references public.demandes(id) on delete cascade,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  chambre_id       uuid        references public.chambres(id) on delete set null,
  appareil         text        not null,
  source_empreinte text,
  created_at       timestamptz not null default now()
);

comment on table public.demandes_qr_sources is
  'Lot 17 : appareil et empreinte réseau de chaque demande par QR, pour les plafonds, le doublon et le suivi. Aucun droit pour l''API. Purge à 30 jours.';

create index if not exists idx_demandes_qr_sources_appareil
  on public.demandes_qr_sources(appareil, created_at);
create index if not exists idx_demandes_qr_sources_chambre
  on public.demandes_qr_sources(chambre_id, created_at);
create index if not exists idx_demandes_qr_sources_empreinte
  on public.demandes_qr_sources(source_empreinte, created_at) where source_empreinte is not null;
create index if not exists idx_demandes_qr_sources_etab
  on public.demandes_qr_sources(etablissement_id, created_at);

alter table public.demandes_qr_sources enable row level security;

revoke all on public.demandes_qr_sources from anon, authenticated;

-- 5. Fonctions publiques -------------------------------------------------------
--
-- Les trois fonctions ouvertes à anon ne rendent ni identifiant de la base,
-- ni nom, ni date de séjour. Un jeton inconnu, un service éteint, une chambre
-- inactive, un établissement inactif ou sans le module Demandes rendent la
-- même réponse « introuvable ».

-- Chambre d'un jeton, si tout est ouvert. Interne, aucun droit pour l'API.
create or replace function public.demandes_qr_chambre_du_jeton(p_jeton text)
returns table (chambre_id uuid, etablissement_id text, numero text, etablissement_nom text, libelles text[])
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.etablissement_id, c.numero, e.nom, p.libelles
    from public.demandes_qr_chambres q
    join public.chambres c on c.id = q.chambre_id and c.etablissement_id = q.etablissement_id
    join public.etablissements e on e.id = c.etablissement_id
    join public.demandes_qr_parametres p on p.etablissement_id = c.etablissement_id
   where p_jeton ~ '^[0-9a-f]{32}$'
     and q.jeton = p_jeton
     and c.actif is true
     and e.actif is not false
     -- Demandes est un module « à activer » : un établissement jamais réglé
     -- (modules_actifs nul) ne l'a pas (moduleConfig.js, optInModuleKeys).
     and 'demandes' = any (coalesce(e.modules_actifs, '{}'::text[]))
     and p.actif is true;
$$;

revoke all on function public.demandes_qr_chambre_du_jeton(text) from public, anon, authenticated;

-- Séjour retenu (D4) : en maison et pas encore parti, le plus récent par
-- arrivée ; sinon un séjour prévu dont l'arrivée est passée et le départ à
-- venir, à la date de Zurich. Interne, aucun droit pour l'API.
create or replace function public.demandes_qr_sejour(p_chambre_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from (
    select s.id, 1 as rang, s.arrivee
      from public.sejours s
     where s.chambre_id = p_chambre_id and s.statut = 'en_maison'
       and s.depart >= (now() at time zone 'Europe/Zurich')::date
    union all
    select s.id, 2 as rang, s.arrivee
      from public.sejours s
     where s.chambre_id = p_chambre_id and s.statut = 'prevu'
       and s.arrivee <= (now() at time zone 'Europe/Zurich')::date
       and s.depart > (now() at time zone 'Europe/Zurich')::date
  ) x
  order by rang, arrivee desc
  limit 1;
$$;

revoke all on function public.demandes_qr_sejour(uuid) from public, anon, authenticated;

-- Demandes courantes ouvertes aux hôtes, dans l'ordre de la maison. Interne.
create or replace function public.demandes_qr_ouvertes(p_etablissement_id text, p_libelles text[])
returns table (rang bigint, libelle text, pole text, priorite text, delai_minutes int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.ord,
         btrim(e.v->>'libelle'),
         e.v->>'pole',
         case when e.v->>'priorite' in ('basse', 'normale', 'haute', 'urgente') then e.v->>'priorite' else 'normale' end,
         case when jsonb_typeof(e.v->'delai_minutes') = 'number'
                   and (e.v->>'delai_minutes') ~ '^[0-9]{1,5}$'
                   and (e.v->>'delai_minutes')::int between 5 and 10080
              then (e.v->>'delai_minutes')::int end
    from public.reglages_modules r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r.config->'categories') = 'array' then r.config->'categories' else '[]'::jsonb end
    ) with ordinality e(v, ord)
   where r.etablissement_id = p_etablissement_id
     and r.module = 'demandes'
     and jsonb_typeof(e.v) = 'object'
     and char_length(btrim(coalesce(e.v->>'libelle', ''))) between 1 and 60
     and e.v->>'pole' in ('reception', 'etages', 'technique', 'cuisine', 'restaurant', 'spa', 'direction')
     and lower(btrim(e.v->>'libelle')) in (select lower(btrim(l)) from unnest(coalesce(p_libelles, '{}'::text[])) l)
   order by e.ord;
$$;

revoke all on function public.demandes_qr_ouvertes(text, text[]) from public, anon, authenticated;

-- volatile, comme le suivi : PostgREST n'accepte alors que le POST, et le jeton
-- ne passe jamais dans une adresse (journaux d'accès).
create or replace function public.demande_chambre_ouvrir(p_jeton text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  v_liste jsonb;
  v_vus text[] := '{}';
  o record;
begin
  select * into v from public.demandes_qr_chambre_du_jeton(coalesce(p_jeton, ''));
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;

  if public.demandes_qr_sejour(v.chambre_id) is null then
    return jsonb_build_object('etablissement', v.etablissement_nom, 'chambre', v.numero, 'hors_sejour', true);
  end if;

  v_liste := '[]'::jsonb;
  for o in select * from public.demandes_qr_ouvertes(v.etablissement_id, v.libelles) loop
    -- Un libellé répété dans les demandes courantes ne s'affiche qu'une fois.
    if not (lower(o.libelle) = any (v_vus)) then
      v_vus := v_vus || lower(o.libelle);
      v_liste := v_liste || jsonb_build_array(jsonb_build_object('libelle', o.libelle));
    end if;
  end loop;

  return jsonb_build_object('etablissement', v.etablissement_nom, 'chambre', v.numero, 'demandes', v_liste);
end;
$$;

revoke all on function public.demande_chambre_ouvrir(text) from public, anon, authenticated;
grant execute on function public.demande_chambre_ouvrir(text) to anon, authenticated;

create or replace function public.demande_chambre_envoyer(
  p_jeton    text,
  p_libelle  text,
  p_note     text,
  p_appareil text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v         record;
  v_sejour  uuid;
  v_appareil text;
  v_cat     record;
  v_note    text;
  v_ip      text;
  v_source  text;
  v_n       int;
  v_id      uuid;
begin
  -- Forme du jeton et de l'appareil.
  if coalesce(p_jeton, '') !~ '^[0-9a-f]{32}$' then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  v_appareil := lower(btrim(coalesce(p_appareil, '')));
  if v_appareil !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('erreur', 'introuvable');
  end if;

  -- Maison et chambre (D10).
  select * into v from public.demandes_qr_chambre_du_jeton(p_jeton);
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;

  -- Séjour (D4).
  v_sejour := public.demandes_qr_sejour(v.chambre_id);
  if v_sejour is null then
    return jsonb_build_object('erreur', 'hors_sejour');
  end if;

  -- Libellé ouvert aux hôtes et présent dans les demandes courantes.
  if char_length(btrim(coalesce(p_libelle, ''))) not between 1 and 60 then
    return jsonb_build_object('erreur', 'demande');
  end if;
  select * into v_cat
    from public.demandes_qr_ouvertes(v.etablissement_id, v.libelles) o
   where lower(o.libelle) = lower(btrim(p_libelle))
   order by o.rang
   limit 1;
  if not found then
    return jsonb_build_object('erreur', 'demande');
  end if;

  -- Note (D5) : caractères de contrôle retirés, espaces resserrés, 140 signes.
  v_note := left(coalesce(p_note, ''), 2000);
  v_note := regexp_replace(v_note, '[[:cntrl:]]', ' ', 'g');
  v_note := regexp_replace(v_note, '\s+', ' ', 'g');
  v_note := nullif(left(btrim(v_note), 140), '');
  v_note := nullif(btrim(v_note), '');

  -- Un envoi à la fois par établissement : les plafonds se comptent juste.
  perform pg_advisory_xact_lock(hashtextextended('demande_qr:' || v.etablissement_id, 0));

  -- Doublon (D8) : même libellé encore ouvert pour cette chambre, né du QR.
  if exists (
    select 1
      from public.demandes_qr_sources s
      join public.demandes d on d.id = s.demande_id
     where s.chambre_id = v.chambre_id
       and d.statut in ('ouverte', 'en_cours')
       and lower(btrim(d.titre)) = lower(v_cat.libelle)
  ) then
    return jsonb_build_object('ok', true, 'deja', true);
  end if;

  -- Plafonds (D9). Appareil : 3 envois en 10 minutes.
  select count(*) into v_n from public.demandes_qr_sources
   where appareil = v_appareil and created_at > now() - interval '10 minutes';
  if v_n >= 3 then
    return jsonb_build_object('erreur', 'trop_vite');
  end if;

  -- Chambre : 6 demandes par QR encore ouvertes, 10 créées par heure.
  select count(*) into v_n
    from public.demandes_qr_sources s
    join public.demandes d on d.id = s.demande_id
   where s.chambre_id = v.chambre_id and d.statut in ('ouverte', 'en_cours');
  if v_n >= 6 then
    return jsonb_build_object('erreur', 'en_attente');
  end if;
  select count(*) into v_n from public.demandes_qr_sources
   where chambre_id = v.chambre_id and created_at > now() - interval '1 hour';
  if v_n >= 10 then
    return jsonb_build_object('erreur', 'trop_vite');
  end if;

  -- Source réseau : cf-connecting-ip, posé par la passerelle (x-forwarded-for,
  -- que le client peut écrire, n'est pas lu). 20 envois par heure.
  begin
    v_ip := nullif(btrim(coalesce(current_setting('request.headers', true)::json->>'cf-connecting-ip', '')), '');
  exception when others then
    v_ip := null;
  end;
  if v_ip is not null then
    v_source := md5(v_ip || ':' || v.etablissement_id);
    select count(*) into v_n from public.demandes_qr_sources
     where source_empreinte = v_source and created_at > now() - interval '1 hour';
    if v_n >= 20 then
      return jsonb_build_object('erreur', 'trop_vite');
    end if;
  end if;

  -- Établissement : 60 demandes par QR par heure.
  select count(*) into v_n from public.demandes_qr_sources
   where etablissement_id = v.etablissement_id and created_at > now() - interval '1 hour';
  if v_n >= 60 then
    return jsonb_build_object('erreur', 'occupe');
  end if;

  insert into public.demandes
    (etablissement_id, chambre_id, sejour_id, origine, pole, titre, detail, priorite, echeance, par_qr)
  values
    (v.etablissement_id, v.chambre_id, v_sejour, 'hote', v_cat.pole, v_cat.libelle, v_note, v_cat.priorite,
     case when v_cat.delai_minutes is null then null else now() + make_interval(mins => v_cat.delai_minutes) end,
     true)
  returning id into v_id;

  insert into public.demandes_qr_sources (demande_id, etablissement_id, chambre_id, appareil, source_empreinte)
  values (v_id, v.etablissement_id, v.chambre_id, v_appareil, v_source);

  -- Purge (D17) : aucune source ne reste plus de 30 jours.
  delete from public.demandes_qr_sources
   where etablissement_id = v.etablissement_id and created_at < now() - interval '30 days';

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.demande_chambre_envoyer(text, text, text, text) from public, anon, authenticated;
grant execute on function public.demande_chambre_envoyer(text, text, text, text) to anon, authenticated;

create or replace function public.demande_chambre_suivi(p_jeton text, p_appareil text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  v_appareil text;
  v_liste jsonb;
begin
  select * into v from public.demandes_qr_chambre_du_jeton(coalesce(p_jeton, ''));
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  v_appareil := lower(btrim(coalesce(p_appareil, '')));
  if v_appareil !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('demandes', '[]'::jsonb);
  end if;

  -- D11 : les demandes de ce téléphone pour cette chambre, 24 heures, 10 au plus.
  select coalesce(jsonb_agg(jsonb_build_object('libelle', x.titre, 'etat', x.etat, 'at', x.at) order by x.at desc), '[]'::jsonb)
    into v_liste
    from (
      select d.titre,
             case d.statut when 'ouverte' then 'recue' when 'en_cours' then 'prise'
                           when 'faite' then 'faite' else 'annulee' end as etat,
             to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
        from public.demandes_qr_sources s
        join public.demandes d on d.id = s.demande_id
       where s.chambre_id = v.chambre_id
         and s.appareil = v_appareil
         and s.created_at > now() - interval '24 hours'
       order by s.created_at desc
       limit 10
    ) x;

  return jsonb_build_object('demandes', v_liste);
end;
$$;

revoke all on function public.demande_chambre_suivi(text, text) from public, anon, authenticated;
grant execute on function public.demande_chambre_suivi(text, text) to anon, authenticated;

-- 6. Fonctions de la direction -------------------------------------------------

create or replace function public.demandes_qr_preparer(p_etablissement_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  if (public.user_can_access_etab(p_etablissement_id)
      and public.current_user_role() = any (array['consultant', 'patron'])) is not true then
    raise exception 'DEMANDES_QR_REFUSE: réservé à la direction de l''établissement' using errcode = '42501';
  end if;

  insert into public.demandes_qr_chambres (chambre_id, etablissement_id, jeton)
  select c.id, c.etablissement_id, replace(gen_random_uuid()::text, '-', '')
    from public.chambres c
   where c.etablissement_id = p_etablissement_id
     and c.actif is true
     and not exists (select 1 from public.demandes_qr_chambres q where q.chambre_id = c.id)
  on conflict (chambre_id) do nothing;
  get diagnostics v_n = row_count;

  return jsonb_build_object('crees', v_n);
end;
$$;

revoke all on function public.demandes_qr_preparer(text) from public, anon, authenticated;
grant execute on function public.demandes_qr_preparer(text) to authenticated;

create or replace function public.demandes_qr_renouveler(p_chambre_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_etab text;
begin
  select c.etablissement_id into v_etab from public.chambres c where c.id = p_chambre_id;
  if (v_etab is not null
      and public.user_can_access_etab(v_etab)
      and public.current_user_role() = any (array['consultant', 'patron'])) is not true then
    raise exception 'DEMANDES_QR_REFUSE: réservé à la direction de l''établissement' using errcode = '42501';
  end if;

  insert into public.demandes_qr_chambres (chambre_id, etablissement_id, jeton)
  values (p_chambre_id, v_etab, replace(gen_random_uuid()::text, '-', ''))
  on conflict (chambre_id) do update
     set jeton = excluded.jeton, etablissement_id = excluded.etablissement_id, renouvele_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.demandes_qr_renouveler(uuid) from public, anon, authenticated;
grant execute on function public.demandes_qr_renouveler(uuid) to authenticated;
