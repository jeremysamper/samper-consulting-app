-- ─────────────────────────────────────────────────────────────────────────────
-- Badgeuse sur une borne déclarée (lot L6, 22.11.2026).
--
-- La direction déclare une tablette comme borne de l'établissement. Chacun y
-- tape un code personnel de 4 chiffres. Quand le réglage
-- reglages_maison.pointage.borne_seulement vaut true, le pointage depuis un
-- compte (pointer_arrivee, pointer_depart, pointer_hors_planning,
-- pointer_offline) est refusé : on ne pointe plus à distance.
--
--   bornes_pointage           une ligne par borne : établissement, nom,
--                             empreinte sha256 du jeton (le jeton, 256 bits
--                             tirés par la base, ne vit que sur l'appareil),
--                             créée par, créée le, révoquée le, dernier usage.
--                             RLS : lecture à la direction (consultant,
--                             patron) de l'établissement ; l'écriture passe
--                             par borne_declarer et borne_revoquer seules
--                             (direction), jamais par la table.
--   pointage_codes            empreinte du code personnel, par membre et par
--                             établissement, unique dans l'établissement (le
--                             code seul désigne la personne à la borne).
--                             Aucune politique : jamais lisible par un client,
--                             tout passe par les fonctions ci-dessous.
--   pointage_codes_refus      codes refusés au choix (déjà pris) : au plus 5
--                             par heure et par personne, pour qu'on ne sonde
--                             pas les codes des autres depuis son compte.
--   bornes_pointage_essais    journal de la borne : chaque pointage, chaque
--                             code faux, chaque attente, chaque appel d'une
--                             borne révoquée. client_uuid porte l'idempotence
--                             de la file hors ligne de la borne. Lecture à la
--                             direction de l'établissement.
--
--   pointer_borne(jeton, code, client_uuid, event_at)
--                             SECURITY DEFINER, ouverte au rôle anon : la
--                             borne n'a pas de session. Le droit vient du
--                             jeton (secret de 256 bits), jamais d'un nom ni
--                             d'un identifiant lisible. Vérifie la borne non
--                             révoquée, l'attente (5 codes faux en 5 minutes
--                             bloquent 5 minutes ; dès 10 codes faux sur 24
--                             heures, 10 minutes après chacun, dès 20, 30),
--                             le code dans l'établissement de
--                             la borne et un membre actif, puis choisit
--                             arrivée ou départ selon l'état du jour, à
--                             l'heure du serveur (Zurich). event_at n'est lu
--                             que pour un rejeu hors ligne (avec client_uuid),
--                             sur 24 heures, jamais avant le dernier pointage
--                             de la personne ni avant un appel en ligne de la
--                             borne.
--                             Rend une réponse jsonb, jamais une exception
--                             pour un refus : le journal doit survivre.
--   borne_etat(jeton)         la borne relit son état à l'ouverture.
--   borne_declarer, borne_revoquer
--                             direction de l'établissement.
--   pointage_code_definir, pointage_code_etat
--                             chacun pour soi.
--   pointage_codes_equipe, pointage_code_reinitialiser
--                             direction de l'établissement.
--   pointage_borne_seulement(etab)
--                             lu par les quatre RPC de pointage.
--   trg_reglages_maison_garde_borne
--                             un écran d'avant ce lot réécrit le bloc pointage
--                             sans la clé borne_seulement : elle est gardée.
--
-- Ajout seul (expand) : quatre tables neuves, des fonctions neuves, un
-- déclencheur, et une garde en tête des quatre RPC de pointage, dont les
-- signatures et les retours ne changent pas (create or replace sans
-- surcharge). borne_seulement est absent partout : rien ne change tant que la
-- direction ne l'active pas. Idempotente.
-- Ne pas rejouer après une migration ultérieure qui touche pointer_arrivee,
-- pointer_depart, pointer_hors_planning ou pointer_offline : ce fichier en
-- réécrit les corps tels qu'au 22.11.2026.
-- Inverse : 20261122_bornes_pointage.rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tables -------------------------------------------------------------------
create table if not exists public.bornes_pointage (
  id                uuid primary key default gen_random_uuid(),
  etablissement_id  text not null references public.etablissements(id) on delete cascade,
  nom               text not null check (char_length(btrim(nom)) between 1 and 60),
  jeton_empreinte   text not null unique,
  creee_par         text references public.profiles(id) on delete set null,
  creee_le          timestamptz not null default now(),
  revoquee_le       timestamptz,
  dernier_usage_le  timestamptz
);

create table if not exists public.pointage_codes (
  user_id           text not null references public.profiles(id) on delete cascade,
  etablissement_id  text not null references public.etablissements(id) on delete cascade,
  code_empreinte    text not null,
  maj_le            timestamptz not null default now(),
  primary key (user_id, etablissement_id),
  unique (etablissement_id, code_empreinte)
);

create table if not exists public.pointage_codes_refus (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null references public.profiles(id) on delete cascade,
  etablissement_id  text not null references public.etablissements(id) on delete cascade,
  created_at        timestamptz not null default now()
);

create table if not exists public.bornes_pointage_essais (
  id                uuid primary key default gen_random_uuid(),
  borne_id          uuid not null references public.bornes_pointage(id) on delete cascade,
  etablissement_id  text not null references public.etablissements(id) on delete cascade,
  -- Gardé au départ de la personne : c'est un journal.
  user_id           text,
  resultat          text not null check (resultat in ('arrivee', 'depart', 'deja', 'code_faux', 'attente', 'revoquee', 'hors_fenetre')),
  client_uuid       uuid unique,
  -- Pointage réussi fait en ligne (sans heure de geste) : seule preuve que la
  -- file de la borne était déjà partie.
  en_ligne          boolean not null default false,
  event_at          timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- 2. Index (clés étrangères et filtres des fonctions) --------------------------
create index if not exists bornes_pointage_etab_idx on public.bornes_pointage (etablissement_id);
create index if not exists bornes_pointage_creee_par_idx on public.bornes_pointage (creee_par);
create index if not exists pointage_codes_refus_user_idx on public.pointage_codes_refus (user_id, etablissement_id, created_at);
create index if not exists pointage_codes_refus_etab_idx on public.pointage_codes_refus (etablissement_id);
create index if not exists bornes_pointage_essais_borne_idx on public.bornes_pointage_essais (borne_id, created_at);
create index if not exists bornes_pointage_essais_etab_idx on public.bornes_pointage_essais (etablissement_id, created_at);
create index if not exists bornes_pointage_essais_user_idx on public.bornes_pointage_essais (user_id, event_at);

-- 3. RLS ----------------------------------------------------------------------
alter table public.bornes_pointage enable row level security;
alter table public.pointage_codes enable row level security;
alter table public.pointage_codes_refus enable row level security;
alter table public.bornes_pointage_essais enable row level security;

-- Aucun accès anonyme aux tables : la borne passe par pointer_borne et
-- borne_etat. Les codes et leurs refus ne se lisent jamais d'un client.
-- Bornes et journal : lecture seule pour authenticated (filtrée par la RLS) ;
-- une borne ne s'écrit que par borne_declarer et borne_revoquer, ce qui
-- garde le plafond, le jeton tiré par la base et la révocation définitive.
revoke all on table public.bornes_pointage, public.pointage_codes, public.pointage_codes_refus, public.bornes_pointage_essais from anon, authenticated;
grant select on table public.bornes_pointage, public.bornes_pointage_essais to authenticated;

drop policy if exists bornes_pointage_select on public.bornes_pointage;
create policy bornes_pointage_select on public.bornes_pointage
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any (array['consultant', 'patron'])
  );

drop policy if exists bornes_pointage_insert on public.bornes_pointage;
drop policy if exists bornes_pointage_update on public.bornes_pointage;

drop policy if exists bornes_pointage_essais_select on public.bornes_pointage_essais;
create policy bornes_pointage_essais_select on public.bornes_pointage_essais
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any (array['consultant', 'patron'])
  );

comment on table public.bornes_pointage is
  'Bornes de pointage déclarées par la direction. Le jeton reste sur l''appareil, seule son empreinte sha256 est ici. Lot L6, 22.11.2026.';
comment on table public.pointage_codes is
  'Empreinte du code personnel de pointage (4 chiffres), par membre et par établissement. Aucune politique : lu et écrit par les fonctions SECURITY DEFINER seulement.';
comment on table public.pointage_codes_refus is
  'Codes de pointage refusés au choix (déjà pris), pour limiter les essais à 5 par heure et par personne.';
comment on table public.bornes_pointage_essais is
  'Journal des bornes de pointage : pointages, codes faux, attentes, appels d''une borne révoquée. client_uuid porte l''idempotence de la file hors ligne de la borne.';

-- 4. Réglage borne_seulement ---------------------------------------------------
-- true seulement si la clé vaut le booléen true. Clé absente, ligne absente
-- ou valeur nulle : le pointage depuis un compte reste ouvert (les trois cas
-- appellent la même réponse, d'où un seul coalesce).
create or replace function public.pointage_borne_seulement(p_etablissement_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select r.pointage -> 'borne_seulement' = 'true'::jsonb
       from reglages_maison r
      where r.etablissement_id = p_etablissement_id),
    false);
$$;

revoke all on function public.pointage_borne_seulement(text) from public, anon, authenticated;

-- Un écran d'avant ce lot (session restée ouverte, PWA) réécrit tout le bloc
-- pointage sans connaître borne_seulement : la valeur en place est gardée.
-- Le nouvel écran écrit toujours la clé, true ou false.
create or replace function public.reglages_maison_garde_borne()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(old.pointage, '{}'::jsonb) ? 'borne_seulement'
     and not (coalesce(new.pointage, '{}'::jsonb) ? 'borne_seulement') then
    new.pointage := coalesce(new.pointage, '{}'::jsonb)
      || jsonb_build_object('borne_seulement', old.pointage -> 'borne_seulement');
  end if;
  return new;
end;
$$;

revoke all on function public.reglages_maison_garde_borne() from public, anon, authenticated;

drop trigger if exists trg_reglages_maison_garde_borne on public.reglages_maison;
create trigger trg_reglages_maison_garde_borne
  before update of pointage on public.reglages_maison
  for each row execute function public.reglages_maison_garde_borne();

-- 5. Les quatre RPC de pointage : garde borne_seulement en tête ----------------
-- Corps repris de la base (22.11.2026), garde ajoutée seule. Signatures
-- inchangées : create or replace remplace sans créer de surcharge.
create or replace function public.pointer_arrivee(shift_id text)
 returns shifts
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  current_user_id text := auth.uid()::text;
  updated_row shifts;
  v_etab text;
begin
  -- Pointage à la borne seulement : refusé depuis un compte. L'établissement
  -- est lu dans une variable avant la garde, jamais dans une sous-requête.
  select s.etablissement_id into v_etab from shifts s where s.id = pointer_arrivee.shift_id;
  if pointage_borne_seulement(v_etab) then
    raise exception 'Le pointage se fait à la borne de l''établissement.' using hint = 'borne_seulement';
  end if;

  update shifts s
     set pointage_debut = to_char(now() at time zone 'Europe/Zurich', 'HH24:MI')::time
   where s.id = pointer_arrivee.shift_id
     and s.pointage_debut is null
     and (s.user_id = current_user_id or peut_pointer_pour(s.user_id, s.etablissement_id))
  returning * into updated_row;

  if not found then
    raise exception 'Shift introuvable, non autorisé, ou déjà pointé';
  end if;

  return updated_row;
end;
$function$;

create or replace function public.pointer_depart(shift_id text)
 returns shifts
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  current_user_id text := auth.uid()::text;
  updated_row shifts;
  v_etab text;
begin
  -- Pointage à la borne seulement : refusé depuis un compte. L'établissement
  -- est lu dans une variable avant la garde, jamais dans une sous-requête.
  select s.etablissement_id into v_etab from shifts s where s.id = pointer_depart.shift_id;
  if pointage_borne_seulement(v_etab) then
    raise exception 'Le pointage se fait à la borne de l''établissement.' using hint = 'borne_seulement';
  end if;

  update shifts s
     set pointage_fin = to_char(now() at time zone 'Europe/Zurich', 'HH24:MI')::time,
         pointage_fin_auto = false
   where s.id = pointer_depart.shift_id
     and s.pointage_debut is not null
     -- Pas encore parti, ou parti seulement par la clôture d'office.
     and (s.pointage_fin is null or s.pointage_fin_auto)
     and (s.user_id = current_user_id or peut_pointer_pour(s.user_id, s.etablissement_id))
  returning * into updated_row;

  if not found then
    raise exception 'Shift introuvable, non autorisé, ou pas arrivé / déjà parti';
  end if;

  return updated_row;
end;
$function$;

create or replace function public.pointer_hors_planning(p_shift_id text, p_etablissement_id text, p_event_at timestamp with time zone DEFAULT now())
 returns shifts
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id text := auth.uid()::text;
  v_at      timestamptz := coalesce(p_event_at, now());
  v_jour    date;
  v_heure   time;
  v_row     shifts;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;
  if p_shift_id is null or length(p_shift_id) < 8 or p_etablissement_id is null then
    raise exception 'Horaire ou établissement manquant';
  end if;
  if not user_can_access_etab(p_etablissement_id) then
    raise exception 'Établissement non autorisé';
  end if;
  -- Pointage à la borne seulement : refusé depuis un compte.
  if pointage_borne_seulement(p_etablissement_id) then
    raise exception 'Le pointage se fait à la borne de l''établissement.' using hint = 'borne_seulement';
  end if;
  if v_at > now() + interval '5 minutes' or v_at < now() - interval '48 hours' then
    raise exception 'Heure de pointage invalide';
  end if;

  select * into v_row from shifts where id = p_shift_id;
  if found then
    if v_row.user_id <> v_user_id then
      raise exception 'Horaire non autorisé';
    end if;
    return v_row;
  end if;

  v_jour  := (v_at at time zone 'Europe/Zurich')::date;
  v_heure := to_char(v_at at time zone 'Europe/Zurich', 'HH24:MI')::time;

  if exists (
    select 1 from shifts
     where user_id = v_user_id and date = v_jour
       and pointage_debut is not null and pointage_fin is null
  ) then
    raise exception 'Vous êtes déjà en poste : pointez d''abord votre départ';
  end if;

  insert into shifts (id, etablissement_id, user_id, date, debut, fin, pointage_debut, note)
  values (p_shift_id, p_etablissement_id, v_user_id, v_jour, v_heure, v_heure, v_heure, 'Pointage hors planning')
  on conflict (id) do nothing
  returning * into v_row;

  if not found then
    select * into v_row from shifts where id = p_shift_id and user_id = v_user_id;
    if not found then
      raise exception 'Horaire non autorisé';
    end if;
  end if;

  return v_row;
end;
$function$;

create or replace function public.pointer_offline(p_shift_id text, p_type text, p_event_at timestamp with time zone, p_client_uuid uuid, p_etablissement_id text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id        text := auth.uid()::text;
  v_shift          shifts;
  v_applied        shifts;
  v_zurich         time;
  v_owned          boolean;
  v_etab_client    text;
  v_shift_json     jsonb;
  v_dans_fenetre   boolean;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;

  if p_client_uuid is null or p_event_at is null then
    raise exception 'client_uuid et event_at sont requis';
  end if;

  if p_type not in ('arrivee', 'depart') then
    raise exception 'Type de pointage invalide : %', p_type;
  end if;

  select * into v_shift from shifts where id = p_shift_id;

  -- Pointage à la borne seulement : refusé depuis un compte, rejeu compris.
  -- L'établissement du shift, sinon celui annoncé par l'appareil.
  if pointage_borne_seulement(coalesce(v_shift.etablissement_id, p_etablissement_id)) then
    raise exception 'Le pointage se fait à la borne de l''établissement.' using hint = 'borne_seulement';
  end if;

  -- Rien de ce shift ne sort de la fonction si l'appelant ne peut pas le
  -- pointer (propriétaire, manager du planning, compte de pointage partagé).
  v_owned := coalesce(
    v_shift.user_id = v_user_id or peut_pointer_pour(v_shift.user_id, v_shift.etablissement_id),
    false);
  v_shift_json := case when v_owned then to_jsonb(v_shift) else null end;

  -- L'établissement annoncé par l'appareil n'est retenu que s'il est dans le
  -- périmètre de l'appelant.
  v_etab_client := case
    when p_etablissement_id is not null and user_can_access_etab(p_etablissement_id)
      then p_etablissement_id
    else null
  end;

  -- 1. Journal d'abord : la PK client_uuid porte l'idempotence. Un rejeu déjà
  --    passé ressort en 'duplicate' (succès idempotent, pas une erreur).
  --    user_id = l'appelant (le compte qui a pointé).
  insert into pointages_offline
    (client_uuid, shift_id, user_id, etablissement_id, type_pointage, event_at)
  values
    (p_client_uuid, p_shift_id, v_user_id,
     case when v_owned then coalesce(v_shift.etablissement_id, v_etab_client)
          else v_etab_client end,
     p_type, p_event_at)
  on conflict (client_uuid) do nothing;

  if not found then
    return jsonb_build_object('status', 'duplicate', 'shift', v_shift_json);
  end if;

  -- 2. Application au shift : heure du geste convertie en heure Zurich, mêmes
  --    gardes que les RPC online. Best-effort : aucune exception à ce stade.
  --    Le geste doit tomber entre la veille et le lendemain du jour du shift,
  --    et pas dans le futur (15 minutes de tolérance d'horloge).
  v_zurich := to_char(p_event_at at time zone 'Europe/Zurich', 'HH24:MI')::time;
  v_dans_fenetre := v_owned
    and p_event_at <= now() + interval '15 minutes'
    and (p_event_at at time zone 'Europe/Zurich')::date
        between v_shift.date::date - 1 and v_shift.date::date + 1;

  if v_dans_fenetre then
    if p_type = 'arrivee' then
      update shifts
         set pointage_debut = v_zurich
       where id = p_shift_id
         and pointage_debut is null
      returning * into v_applied;
    else
      -- Un départ réel rejoué après la clôture d'office la remplace.
      update shifts
         set pointage_fin = v_zurich,
             pointage_fin_auto = false
       where id = p_shift_id
         and pointage_debut is not null
         and (pointage_fin is null or pointage_fin_auto)
      returning * into v_applied;
    end if;

    if found then
      update pointages_offline set applied = true where client_uuid = p_client_uuid;
      return jsonb_build_object('status', 'applied', 'shift', to_jsonb(v_applied));
    end if;
  end if;

  return jsonb_build_object('status', 'not_applied', 'shift', v_shift_json);
end;
$function$;

-- 6. Empreintes ------------------------------------------------------------------
-- Jeton : sha256 de la chaîne hexadécimale remise à l'appareil.
-- Code : sha256 de « établissement:code », donc unique dans l'établissement.
create or replace function public.pointage_empreinte(p_texte text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select encode(sha256(convert_to(p_texte, 'UTF8')), 'hex');
$$;

revoke all on function public.pointage_empreinte(text) from public, anon, authenticated;

-- 7. Déclarer et révoquer une borne (direction) -----------------------------------
create or replace function public.borne_declarer(p_etablissement_id text, p_nom text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_moi    text := auth.uid()::text;
  v_nom    text := btrim(coalesce(p_nom, ''));
  v_jeton  text;
  v_borne  bornes_pointage;
begin
  if v_moi is null then
    raise exception 'Non authentifié';
  end if;
  if p_etablissement_id is null or not user_can_access_etab(p_etablissement_id)
     or current_user_role() <> all (array['consultant', 'patron']) then
    raise exception 'Seule la direction déclare une borne.';
  end if;
  if char_length(v_nom) not between 1 and 60 then
    raise exception 'Donnez un nom à la borne (60 caractères au plus).';
  end if;
  if (select count(*) from bornes_pointage
       where etablissement_id = p_etablissement_id and revoquee_le is null) >= 20 then
    raise exception 'Vingt bornes sont déjà déclarées : révoquez-en une d''abord.';
  end if;

  -- 256 bits tirés par la base. Le jeton ne sort qu'une fois, dans cette
  -- réponse ; seule son empreinte est gardée.
  v_jeton := encode(extensions.gen_random_bytes(32), 'hex');
  insert into bornes_pointage (etablissement_id, nom, jeton_empreinte, creee_par)
  values (p_etablissement_id, v_nom, pointage_empreinte(v_jeton), v_moi)
  returning * into v_borne;

  return jsonb_build_object(
    'id', v_borne.id, 'nom', v_borne.nom, 'etablissement_id', v_borne.etablissement_id,
    'creee_le', v_borne.creee_le, 'jeton', v_jeton);
end;
$$;

create or replace function public.borne_revoquer(p_borne_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etab text;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  select etablissement_id into v_etab from bornes_pointage where id = p_borne_id;
  if v_etab is null or not user_can_access_etab(v_etab)
     or current_user_role() <> all (array['consultant', 'patron']) then
    raise exception 'Seule la direction révoque une borne.';
  end if;
  update bornes_pointage set revoquee_le = now()
   where id = p_borne_id and revoquee_le is null;
  return found;
end;
$$;

-- 8. État de la borne, relu par l'appareil à l'ouverture ----------------------------
create or replace function public.borne_etat(p_jeton text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_borne bornes_pointage;
  v_etab_nom text;
begin
  if p_jeton is null or length(p_jeton) <> 64 then
    return jsonb_build_object('valide', false, 'raison', 'borne_inconnue');
  end if;
  select * into v_borne from bornes_pointage where jeton_empreinte = pointage_empreinte(p_jeton);
  if not found then
    return jsonb_build_object('valide', false, 'raison', 'borne_inconnue');
  end if;
  if v_borne.revoquee_le is not null then
    return jsonb_build_object('valide', false, 'raison', 'revoquee');
  end if;
  select e.nom into v_etab_nom from etablissements e where e.id = v_borne.etablissement_id;
  return jsonb_build_object('valide', true, 'nom', v_borne.nom,
    'etablissement_id', v_borne.etablissement_id, 'etablissement_nom', v_etab_nom);
end;
$$;

-- 9. Pointer à la borne ---------------------------------------------------------------
create or replace function public.pointer_borne(p_jeton text, p_code text, p_client_uuid uuid default null, p_event_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_borne         bornes_pointage;
  v_prec          bornes_pointage_essais;
  v_echecs        integer;
  v_echecs_jour   integer;
  v_pause         interval;
  v_derniers      timestamptz[];
  v_at            timestamptz;
  v_z             timestamp;
  v_jour          date;
  v_heure         time;
  v_user          text;
  v_prenom        text;
  v_nom           text;
  v_shift_id      text;
  v_arrivee       timestamp;
  v_debut_pointe  time;
  v_type          text;
  v_resultat      text;
  v_heure_rendue  time;
  v_hors_planning boolean := false;
begin
  if p_jeton is null or length(p_jeton) <> 64 then
    return jsonb_build_object('ok', false, 'raison', 'borne_inconnue');
  end if;

  -- Verrou sur la borne : ses appels passent un par un (attente, double tap).
  select * into v_borne from bornes_pointage
   where jeton_empreinte = pointage_empreinte(p_jeton)
   for update;
  if not found then
    -- Jeton inconnu : rien à journaliser (aucun établissement à qui le montrer).
    return jsonb_build_object('ok', false, 'raison', 'borne_inconnue');
  end if;

  -- Rejeu d'un appel déjà traité (file hors ligne de la borne) : même réponse.
  if p_client_uuid is not null then
    select * into v_prec from bornes_pointage_essais where client_uuid = p_client_uuid;
    if found then
      if v_prec.borne_id <> v_borne.id then
        return jsonb_build_object('ok', false, 'raison', 'borne_inconnue');
      end if;
      return jsonb_build_object('ok', v_prec.resultat in ('arrivee', 'depart', 'deja'),
        'raison', v_prec.resultat, 'doublon', true);
    end if;
  end if;

  -- Borne révoquée, attente : une ligne de journal par minute au plus, pour
  -- qu'un appareil qui insiste ne remplisse pas le journal.
  if v_borne.revoquee_le is not null then
    if not exists (select 1 from bornes_pointage_essais
                    where borne_id = v_borne.id and resultat = 'revoquee'
                      and created_at > now() - interval '1 minute') then
      insert into bornes_pointage_essais (borne_id, etablissement_id, resultat, client_uuid, event_at)
      values (v_borne.id, v_borne.etablissement_id, 'revoquee', p_client_uuid, coalesce(p_event_at, now()));
    end if;
    return jsonb_build_object('ok', false, 'raison', 'revoquee');
  end if;

  -- Attente, comptée à l'heure du serveur, rejeu hors ligne compris : une
  -- file remplie de codes au hasard n'ouvre pas plus d'essais.
  --   5 codes faux en 5 minutes : 5 minutes après le dernier ;
  --   dès 10 codes faux sur 24 heures : 10 minutes après chaque code faux,
  --   dès 20 : 30 minutes, sans condition de rythme (des essais espacés ne
  --   passent pas sous le seuil).
  -- L'attente ne retient pas client_uuid : l'appel rejoué plus tard sera
  -- vraiment examiné.
  select count(*) into v_echecs_jour
    from bornes_pointage_essais
   where borne_id = v_borne.id and resultat = 'code_faux'
     and created_at > now() - interval '24 hours';
  select array_agg(x.created_at order by x.created_at desc) into v_derniers
    from (select e.created_at from bornes_pointage_essais e
           where e.borne_id = v_borne.id and e.resultat = 'code_faux'
           order by e.created_at desc
           limit 5) x;
  v_pause := case
    when v_echecs_jour >= 20 then interval '30 minutes'
    when v_echecs_jour >= 10 then interval '10 minutes'
    when coalesce(array_length(v_derniers, 1), 0) = 5
         and v_derniers[1] - v_derniers[5] <= interval '5 minutes' then interval '5 minutes'
    else null end;
  if v_pause is not null and now() < v_derniers[1] + v_pause then
    if not exists (select 1 from bornes_pointage_essais
                    where borne_id = v_borne.id and resultat = 'attente'
                      and created_at > now() - interval '1 minute') then
      insert into bornes_pointage_essais (borne_id, etablissement_id, resultat, event_at)
      values (v_borne.id, v_borne.etablissement_id, 'attente', coalesce(p_event_at, now()));
    end if;
    return jsonb_build_object('ok', false, 'raison', 'attente',
      'secondes', greatest(1, ceil(extract(epoch from (v_derniers[1] + v_pause - now())))::int));
  end if;
  -- Essais restants avant l'attente : les codes faux des 5 dernières minutes.
  select count(*) into v_echecs
    from bornes_pointage_essais
   where borne_id = v_borne.id and resultat = 'code_faux'
     and created_at > now() - interval '5 minutes';

  -- Heure du pointage : celle du serveur. Seul un rejeu de la file hors
  -- ligne (client_uuid fourni) porte l'heure du geste : 24 heures en arrière
  -- et 15 minutes d'avance d'horloge au plus. Le journal garde les deux
  -- heures (event_at, created_at).
  if p_event_at is not null
     and (p_client_uuid is null
          or p_event_at > now() + interval '15 minutes' or p_event_at < now() - interval '24 hours') then
    insert into bornes_pointage_essais (borne_id, etablissement_id, resultat, client_uuid, event_at)
    values (v_borne.id, v_borne.etablissement_id, 'hors_fenetre', p_client_uuid, p_event_at);
    return jsonb_build_object('ok', false, 'raison', 'hors_fenetre');
  end if;
  -- Un rejeu n'est cru que pour une coupure que la base a pu voir : si la
  -- borne a réussi un pointage en ligne plus d'une minute après l'heure
  -- annoncée, sa file était déjà partie (la borne ne pointe en ligne qu'une
  -- file vide) ; ce geste est antidaté. Un code faux, une attente ou une
  -- borne révoquée ne comptent pas.
  if p_event_at is not null and exists (
    select 1 from bornes_pointage_essais e
     where e.borne_id = v_borne.id
       and e.en_ligne
       and e.created_at > p_event_at + interval '1 minute'
  ) then
    insert into bornes_pointage_essais (borne_id, etablissement_id, resultat, client_uuid, event_at)
    values (v_borne.id, v_borne.etablissement_id, 'hors_fenetre', p_client_uuid, p_event_at);
    return jsonb_build_object('ok', false, 'raison', 'hors_fenetre');
  end if;
  v_at    := coalesce(p_event_at, now());
  v_z     := v_at at time zone 'Europe/Zurich';
  v_jour  := v_z::date;
  v_heure := to_char(v_z, 'HH24:MI')::time;

  -- Le code, dans l'établissement de la borne, d'un membre actif de cet
  -- établissement.
  if p_code is not null and p_code ~ '^[0-9]{4}$' then
    select c.user_id, p.prenom, p.nom into v_user, v_prenom, v_nom
      from pointage_codes c
      join profiles p on p.id = c.user_id
     where c.etablissement_id = v_borne.etablissement_id
       and c.code_empreinte = pointage_empreinte(v_borne.etablissement_id || ':' || p_code)
       and v_borne.etablissement_id = any (p.etablissement_ids)
       and p.actif is not false;
  end if;
  if v_user is null then
    insert into bornes_pointage_essais (borne_id, etablissement_id, resultat, client_uuid, event_at)
    values (v_borne.id, v_borne.etablissement_id, 'code_faux', p_client_uuid, v_at);
    return jsonb_build_object('ok', false, 'raison', 'code_faux', 'restants', greatest(0, 4 - v_echecs));
  end if;

  -- Un rejeu ne remonte jamais avant le dernier pointage de la personne à
  -- une borne de l'établissement : la file rejoue dans l'ordre du geste, un
  -- geste plus ancien est un pointage antidaté.
  if p_event_at is not null and exists (
    select 1 from bornes_pointage_essais e
     where e.user_id = v_user and e.etablissement_id = v_borne.etablissement_id
       and e.resultat in ('arrivee', 'depart') and e.event_at > p_event_at
  ) then
    insert into bornes_pointage_essais (borne_id, etablissement_id, user_id, resultat, client_uuid, event_at)
    values (v_borne.id, v_borne.etablissement_id, v_user, 'hors_fenetre', p_client_uuid, p_event_at);
    return jsonb_build_object('ok', false, 'raison', 'hors_fenetre');
  end if;

  begin
    -- Double tap : un pointage de la même personne à la borne il y a moins
    -- de 2 minutes n'est pas refait.
    select e.resultat, (e.event_at at time zone 'Europe/Zurich')::time
      into v_type, v_heure_rendue
      from bornes_pointage_essais e
     where e.user_id = v_user and e.etablissement_id = v_borne.etablissement_id
       and e.resultat in ('arrivee', 'depart')
       and e.event_at between v_at - interval '2 minutes' and v_at
     order by e.event_at desc
     limit 1;

    if found then
      v_resultat := 'deja';
    else
      -- Horaire en cours : arrivé il y a moins de 16 h, pas encore parti. Une
      -- arrivée plus ancienne restée ouverte est un départ oublié : on pointe
      -- alors une arrivée. Arrivée en heure de Zurich, comme la clôture
      -- d'office (franchissement de minuit compris).
      select s.id, a.arrivee, s.pointage_debut into v_shift_id, v_arrivee, v_debut_pointe
        from shifts s
        cross join lateral (
          select s.date + s.pointage_debut
                 + case when s.debut - s.pointage_debut > interval '12 hours' then interval '1 day'
                        when s.pointage_debut - s.debut > interval '12 hours' then interval '-1 day'
                        else interval '0' end as arrivee
        ) a
       where s.user_id = v_user
         and s.etablissement_id = v_borne.etablissement_id
         and s.date between v_jour - 1 and v_jour
         and s.pointage_debut is not null
         and s.pointage_fin is null
         and a.arrivee between v_z - interval '16 hours' and v_z + interval '15 minutes'
       order by a.arrivee desc
       limit 1
       for update of s;

      if v_shift_id is not null and v_z - v_arrivee < interval '2 minutes' then
        -- Arrivée pointée il y a moins de 2 minutes, à la borne ou depuis un
        -- compte : ce n'est pas un départ.
        v_type := 'arrivee';
        v_resultat := 'deja';
        v_heure_rendue := v_debut_pointe;
      elsif v_shift_id is not null then
        update shifts
           set pointage_fin = v_heure, pointage_fin_auto = false
         where id = v_shift_id;
        v_type := 'depart';
      else
        -- Arrivée : l'horaire du jour pas encore pointé dont le début est le
        -- plus proche (service coupé : celui qui commence), sinon un horaire
        -- hors planning, comme pointer_hors_planning.
        select s.id into v_shift_id
          from shifts s
         where s.user_id = v_user
           and s.etablissement_id = v_borne.etablissement_id
           and s.date = v_jour
           and s.pointage_debut is null
         order by abs(extract(epoch from (s.debut - v_heure)))
         limit 1
         for update of s;

        if v_shift_id is not null then
          update shifts set pointage_debut = v_heure where id = v_shift_id;
        else
          insert into shifts (id, etablissement_id, user_id, date, debut, fin, pointage_debut, note)
          values (gen_random_uuid()::text, v_borne.etablissement_id, v_user, v_jour, v_heure, v_heure, v_heure, 'Pointage hors planning');
          v_hors_planning := true;
        end if;
        v_type := 'arrivee';
      end if;
      if v_resultat is null then
        v_resultat := v_type;
        v_heure_rendue := v_heure;
      end if;
    end if;

    insert into bornes_pointage_essais (borne_id, etablissement_id, user_id, resultat, client_uuid, event_at, en_ligne)
    values (v_borne.id, v_borne.etablissement_id, v_user, v_resultat, p_client_uuid, v_at, p_event_at is null);
  exception when unique_violation then
    -- Le même client_uuid passé en même temps par un autre appel : ses
    -- écritures font foi, celles-ci sont annulées avec ce sous-bloc.
    return jsonb_build_object('ok', true, 'raison', 'deja', 'doublon', true);
  end;

  update bornes_pointage set dernier_usage_le = now() where id = v_borne.id;

  return jsonb_build_object(
    'ok', true,
    'raison', v_resultat,
    'type', v_type,
    'heure', to_char(v_heure_rendue, 'HH24:MI'),
    'prenom', coalesce(v_prenom, ''),
    'nom', coalesce(v_nom, ''),
    'hors_planning', v_hors_planning);
end;
$$;

-- 10. Code personnel ------------------------------------------------------------------
create or replace function public.pointage_code_definir(p_etablissement_id text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_moi      text := auth.uid()::text;
  v_empreinte text;
begin
  if v_moi is null then
    raise exception 'Non authentifié';
  end if;
  if p_etablissement_id is null or not user_can_access_etab(p_etablissement_id) then
    raise exception 'Établissement non autorisé';
  end if;
  if p_code is null or p_code !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'raison', 'format');
  end if;
  -- Codes trop faciles à deviner : quatre fois le même chiffre, suite
  -- montante ou descendante.
  if p_code ~ '^(.)\1{3}$' or position(p_code in '0123456789') > 0 or position(p_code in '9876543210') > 0 then
    return jsonb_build_object('ok', false, 'raison', 'trop_simple');
  end if;
  if (select count(*) from pointage_codes_refus
       where user_id = v_moi and etablissement_id = p_etablissement_id
         and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'raison', 'attente');
  end if;

  v_empreinte := pointage_empreinte(p_etablissement_id || ':' || p_code);
  if exists (select 1 from pointage_codes
              where etablissement_id = p_etablissement_id and code_empreinte = v_empreinte
                and user_id <> v_moi) then
    insert into pointage_codes_refus (user_id, etablissement_id) values (v_moi, p_etablissement_id);
    return jsonb_build_object('ok', false, 'raison', 'indisponible');
  end if;

  begin
    insert into pointage_codes (user_id, etablissement_id, code_empreinte, maj_le)
    values (v_moi, p_etablissement_id, v_empreinte, now())
    on conflict (user_id, etablissement_id)
      do update set code_empreinte = excluded.code_empreinte, maj_le = excluded.maj_le;
  exception when unique_violation then
    -- Pris entre la lecture et l'écriture par quelqu'un d'autre.
    insert into pointage_codes_refus (user_id, etablissement_id) values (v_moi, p_etablissement_id);
    return jsonb_build_object('ok', false, 'raison', 'indisponible');
  end;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pointage_code_etat(p_etablissement_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_maj timestamptz;
begin
  if auth.uid() is null or p_etablissement_id is null or not user_can_access_etab(p_etablissement_id) then
    return jsonb_build_object('defini', false);
  end if;
  select maj_le into v_maj from pointage_codes
   where user_id = auth.uid()::text and etablissement_id = p_etablissement_id;
  return jsonb_build_object('defini', v_maj is not null, 'maj_le', v_maj);
end;
$$;

create or replace function public.pointage_codes_equipe(p_etablissement_id text)
returns table (user_id text, maj_le timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or p_etablissement_id is null or not user_can_access_etab(p_etablissement_id)
     or current_user_role() <> all (array['consultant', 'patron']) then
    raise exception 'Réservé à la direction.';
  end if;
  return query
    select c.user_id, c.maj_le from pointage_codes c
     where c.etablissement_id = p_etablissement_id;
end;
$$;

create or replace function public.pointage_code_reinitialiser(p_user_id text, p_etablissement_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or p_etablissement_id is null or not user_can_access_etab(p_etablissement_id)
     or current_user_role() <> all (array['consultant', 'patron']) then
    raise exception 'Seule la direction réinitialise un code.';
  end if;
  delete from pointage_codes where user_id = p_user_id and etablissement_id = p_etablissement_id;
  return found;
end;
$$;

-- 11. Droits d'exécution -----------------------------------------------------------------
revoke all on function public.borne_declarer(text, text) from public, anon, authenticated;
revoke all on function public.borne_revoquer(uuid) from public, anon, authenticated;
revoke all on function public.pointage_code_definir(text, text) from public, anon, authenticated;
revoke all on function public.pointage_code_etat(text) from public, anon, authenticated;
revoke all on function public.pointage_codes_equipe(text) from public, anon, authenticated;
revoke all on function public.pointage_code_reinitialiser(text, text) from public, anon, authenticated;
revoke all on function public.borne_etat(text) from public, anon, authenticated;
revoke all on function public.pointer_borne(text, text, uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.borne_declarer(text, text) to authenticated;
grant execute on function public.borne_revoquer(uuid) to authenticated;
grant execute on function public.pointage_code_definir(text, text) to authenticated;
grant execute on function public.pointage_code_etat(text) to authenticated;
grant execute on function public.pointage_codes_equipe(text) to authenticated;
grant execute on function public.pointage_code_reinitialiser(text, text) to authenticated;
-- La borne n'a pas de session : anon. Le droit vient du jeton.
grant execute on function public.borne_etat(text) to anon, authenticated;
grant execute on function public.pointer_borne(text, text, uuid, timestamptz) to anon, authenticated;

comment on function public.pointer_borne(text, text, uuid, timestamptz) is
  'Pointage à la borne : jeton de la borne (64 caractères hexadécimaux) et code personnel à 4 chiffres. Arrivée ou départ selon l''état du jour, à l''heure du serveur. Rend {ok, raison, type, heure, prenom, nom}. Lot L6, 22.11.2026.';
