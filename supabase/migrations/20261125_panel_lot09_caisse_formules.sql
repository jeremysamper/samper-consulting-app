-- Lot 09 du panel (25.11.2026) : la formule à prix fixe à la caisse.
--
-- Une formule est une liste d'étapes ordonnées (nom, mode d'envoi, plats
-- proposés) vendue à un prix fixe. Posée sur un ticket, elle devient une ligne
-- par plat choisi, reliées par formule_groupe, dont les prix répartis au
-- prorata des prix de carte font exactement le prix de la formule. Chaque
-- ligne garde son plat_id : TVA, ruptures, rapports et mise en place restent
-- justes.
--
-- Additive et idempotente. Aucune fonction ni aucun déclencheur des
-- migrations v1 à v9 n'est redéfini : caisse_ligne_garde_v7 continue
-- d'imposer le prix de carte à toute ligne écrite par l'API ; les lignes de
-- formule sont posées par caisse_poser_formule, SECURITY DEFINER possédée par
-- postgres, comme caisse_remise change un prix. Le front déployé ignore la
-- table, les colonnes et les fonctions.

-- Verrou court sur caisse_lignes, table de service : rejouer si le délai passe.
set local lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. Table caisse_formules
-- ----------------------------------------------------------------------------
create table if not exists public.caisse_formules (
  id               uuid primary key default gen_random_uuid(),
  etablissement_id text not null references public.etablissements(id) on delete cascade,
  nom              text not null,
  prix             numeric not null,
  etapes           jsonb not null,
  actif            boolean not null default true,
  archivee         boolean not null default false,
  ordre            int not null default 0,
  created_by       text references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.caisse_formules'::regclass
                    and conname = 'caisse_formules_nom_borne') then
    alter table public.caisse_formules add constraint caisse_formules_nom_borne
      check (char_length(btrim(nom)) between 1 and 40);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.caisse_formules'::regclass
                    and conname = 'caisse_formules_prix_borne') then
    alter table public.caisse_formules add constraint caisse_formules_prix_borne
      check (prix > 0 and prix < 10000 and prix = round(prix, 2));
  end if;
end $$;

create index if not exists idx_caisse_formules_etab on public.caisse_formules (etablissement_id);
create index if not exists idx_caisse_formules_created_by on public.caisse_formules (created_by);

drop trigger if exists trg_caisse_formules_updated_at on public.caisse_formules;
create trigger trg_caisse_formules_updated_at
  before update on public.caisse_formules
  for each row execute function public.set_updated_at();

-- Forme des étapes, plats de l'établissement, colonnes que l'écran ne choisit
-- pas (auteur, établissement, date de création).
create or replace function public.caisse_formule_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_etape   jsonb;
  v_plat    jsonb;
  v_nb      int;
  v_ids     text[];
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid()::text;
  else
    new.id := old.id;
    new.etablissement_id := old.etablissement_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  new.nom := btrim(new.nom);

  -- Archiver ou désactiver une formule dont un plat a disparu doit rester
  -- possible : les étapes ne se revalident que si elles changent.
  if tg_op = 'UPDATE' and new.etapes is not distinct from old.etapes then
    return new;
  end if;

  if jsonb_typeof(new.etapes) is distinct from 'array'
     or jsonb_array_length(new.etapes) not between 1 and 6 then
    raise exception 'caisse: une formule porte de 1 a 6 etapes' using errcode = '23514';
  end if;

  for v_etape in select e from jsonb_array_elements(new.etapes) e loop
    if jsonb_typeof(v_etape) is distinct from 'object'
       or jsonb_typeof(v_etape->'nom') is distinct from 'string'
       or char_length(btrim(v_etape->>'nom')) not between 1 and 30 then
      raise exception 'caisse: le nom d''une etape compte de 1 a 30 caracteres' using errcode = '23514';
    end if;
    if jsonb_typeof(v_etape->'suite') is distinct from 'number'
       or (v_etape->>'suite') !~ '^[1-9]$' then
      raise exception 'caisse: le mode d''une etape va de 1 a 9' using errcode = '23514';
    end if;
    if jsonb_typeof(v_etape->'plat_ids') is distinct from 'array'
       or jsonb_array_length(v_etape->'plat_ids') not between 1 and 40 then
      raise exception 'caisse: une etape propose de 1 a 40 produits' using errcode = '23514';
    end if;
    for v_plat in select p from jsonb_array_elements(v_etape->'plat_ids') p loop
      if jsonb_typeof(v_plat) is distinct from 'string' then
        raise exception 'caisse: produit d''etape illisible' using errcode = '23514';
      end if;
    end loop;
    select array_agg(distinct x) into v_ids
      from jsonb_array_elements_text(v_etape->'plat_ids') x;
    select count(*) into v_nb
      from public.plats p
     where p.id = any(v_ids) and p.etablissement_id = new.etablissement_id;
    if v_nb <> cardinality(v_ids) then
      raise exception 'caisse: plat inconnu pour cet etablissement' using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_caisse_formule_garde on public.caisse_formules;
create trigger trg_caisse_formule_garde
  before insert or update on public.caisse_formules
  for each row execute function public.caisse_formule_garde();

drop trigger if exists trg_caisse_formules_journal on public.caisse_formules;
create trigger trg_caisse_formules_journal
  after insert or update or delete on public.caisse_formules
  for each row execute function public.journal_activite_log();

-- Lecture : tout compte rattaché à l'établissement (la caisse lit les
-- formules comme caisse_boutons). Écriture : consultant, patron et
-- resp_cuisine seulement. Aucune suppression : une formule s'archive.
alter table public.caisse_formules enable row level security;
revoke all on public.caisse_formules from anon;
revoke delete, truncate on public.caisse_formules from authenticated;

drop policy if exists caisse_formules_select on public.caisse_formules;
create policy caisse_formules_select on public.caisse_formules
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists caisse_formules_insert on public.caisse_formules;
create policy caisse_formules_insert on public.caisse_formules
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

drop policy if exists caisse_formules_update on public.caisse_formules;
create policy caisse_formules_update on public.caisse_formules
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );
-- Aucune policy de suppression : une formule s'archive (D7).

-- ----------------------------------------------------------------------------
-- 2. Colonnes de formule sur caisse_lignes
-- ----------------------------------------------------------------------------
alter table public.caisse_lignes add column if not exists formule_id uuid references public.caisse_formules(id);
alter table public.caisse_lignes add column if not exists formule_groupe uuid;
alter table public.caisse_lignes add column if not exists formule_nom text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.caisse_lignes'::regclass
                    and conname = 'caisse_lignes_formule_paire') then
    alter table public.caisse_lignes add constraint caisse_lignes_formule_paire
      check (
        (formule_id is null and formule_groupe is null and formule_nom is null)
        or (formule_groupe is not null and formule_nom is not null
            and char_length(formule_nom) between 1 and 40)
      );
  end if;
end $$;

create index if not exists idx_caisse_lignes_formule_id
  on public.caisse_lignes (formule_id) where formule_id is not null;
create index if not exists idx_caisse_lignes_formule_groupe
  on public.caisse_lignes (formule_groupe) where formule_groupe is not null;

-- ----------------------------------------------------------------------------
-- 3. Garde des lignes de formule (comptes de l'API seulement)
-- ----------------------------------------------------------------------------
create or replace function public.caisse_ligne_garde_formule()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.formule_id is not null or new.formule_groupe is not null or new.formule_nom is not null then
      raise exception 'caisse: une formule se pose par sa fonction' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.formule_groupe is not null then
      raise exception 'caisse: une ligne de formule se retire avec sa formule' using errcode = '42501';
    end if;
    return old;
  end if;

  if new.formule_id is distinct from old.formule_id
     or new.formule_groupe is distinct from old.formule_groupe
     or new.formule_nom is distinct from old.formule_nom then
    raise exception 'caisse: une formule se pose par sa fonction' using errcode = '42501';
  end if;
  if old.formule_groupe is not null and new.quantite is distinct from old.quantite then
    raise exception 'caisse: la quantite d''une ligne de formule ne change pas' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_caisse_ligne_garde_formule on public.caisse_lignes;
create trigger trg_caisse_ligne_garde_formule
  before insert or update or delete on public.caisse_lignes
  for each row execute function public.caisse_ligne_garde_formule();

-- ----------------------------------------------------------------------------
-- 4. Poser une formule
-- ----------------------------------------------------------------------------
create or replace function public.caisse_poser_formule(
  p_ticket_id uuid, p_formule_id uuid, p_choix jsonb, p_groupe uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     text := auth.uid()::text;
  v_ticket  public.caisse_tickets%rowtype;
  v_role    text;
  v_formule public.caisse_formules%rowtype;
  v_n       int;
  v_jour    date := (now() at time zone 'Europe/Zurich')::date;
  v_etape   jsonb;
  v_choix   text;
  v_plats   text[] := '{}';
  v_noms    text[] := '{}';
  v_bases   bigint[] := '{}';
  v_suites  int[] := '{}';
  v_somme   bigint := 0;
  v_prix_c  bigint;
  v_cumul   bigint := 0;
  v_avant   bigint := 0;
  v_part    bigint;
  v_nom     text;
  v_base    numeric;
  v_actif   boolean;
  v_autre   uuid;
  i         int;
begin
  if v_uid is null then
    raise exception 'caisse: connexion requise' using errcode = '42501';
  end if;
  if p_ticket_id is null or p_formule_id is null or p_groupe is null then
    raise exception 'caisse: formule incomplete';
  end if;

  select * into v_ticket from public.caisse_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'caisse: ticket introuvable';
  end if;
  v_role := public.caisse_role_actif(v_ticket.etablissement_id);
  if v_role is null or not coalesce(public.caisse_peut_utiliser(v_ticket.etablissement_id), false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;

  -- Rejeu (D10) : le groupe existe déjà sur ce ticket. Le verrou sur le
  -- groupe sérialise deux appels concurrents avec le même identifiant.
  perform pg_advisory_xact_lock(hashtextextended(p_groupe::text, 0));
  select count(*) into v_n from public.caisse_lignes
   where ticket_id = p_ticket_id and formule_groupe = p_groupe;
  if v_n > 0 then
    return jsonb_build_object('groupe', p_groupe, 'lignes', v_n, 'deja', true);
  end if;
  select ticket_id into v_autre from public.caisse_lignes
   where formule_groupe = p_groupe limit 1;
  if v_autre is not null then
    raise exception 'caisse: groupe de formule deja pris';
  end if;

  if v_ticket.statut <> 'ouvert' then
    raise exception 'caisse: le ticket n''est pas ouvert';
  end if;

  select * into v_formule from public.caisse_formules
   where id = p_formule_id and etablissement_id = v_ticket.etablissement_id;
  if not found or not v_formule.actif or v_formule.archivee then
    raise exception 'caisse: formule indisponible';
  end if;

  if jsonb_typeof(p_choix) is distinct from 'array'
     or jsonb_array_length(p_choix) <> jsonb_array_length(v_formule.etapes) then
    raise exception 'caisse: un produit par etape';
  end if;

  i := 0;
  for v_etape in select e from jsonb_array_elements(v_formule.etapes) e loop
    if jsonb_typeof(p_choix->i) is distinct from 'string' then
      raise exception 'caisse: un produit par etape';
    end if;
    v_choix := p_choix->>i;
    if not (v_etape->'plat_ids') ? v_choix then
      raise exception 'caisse: produit hors de l''etape';
    end if;
    select p.nom, p.prix_vente, p.actif into v_nom, v_base, v_actif
      from public.plats p
     where p.id = v_choix and p.etablissement_id = v_ticket.etablissement_id;
    if not found or v_actif is false then
      raise exception 'caisse: produit indisponible';
    end if;
    if exists (select 1 from public.caisse_boutons b
                where b.plat_id = v_choix
                  and b.etablissement_id = v_ticket.etablissement_id
                  and b.rupture_le = v_jour) then
      raise exception 'caisse: produit en rupture';
    end if;
    v_plats := v_plats || v_choix;
    v_noms := v_noms || v_nom;
    v_bases := v_bases || greatest(round(coalesce(v_base, 0) * 100), 0)::bigint;
    v_suites := v_suites || (v_etape->>'suite')::int;
    i := i + 1;
  end loop;

  -- Répartition (D3) : total cumulé, arrondi au demi supérieur, en centimes.
  v_prix_c := round(v_formule.prix * 100)::bigint;
  select coalesce(sum(b), 0) into v_somme from unnest(v_bases) b;
  if v_somme = 0 then
    v_bases := array_fill(1::bigint, array[cardinality(v_bases)]);
    v_somme := cardinality(v_bases);
  end if;

  for i in 1 .. cardinality(v_plats) loop
    v_cumul := v_cumul + v_bases[i];
    v_part := round((v_prix_c * v_cumul)::numeric / v_somme)::bigint - v_avant;
    v_avant := v_avant + v_part;
    insert into public.caisse_lignes
      (ticket_id, plat_id, libelle, quantite, prix_unitaire, suite,
       formule_id, formule_groupe, formule_nom, created_at)
    values
      (p_ticket_id, v_plats[i], v_noms[i], 1, round(v_part::numeric / 100, 2), v_suites[i],
       v_formule.id, p_groupe, left(v_formule.nom, 40),
       now() + make_interval(secs => i * 0.000001));
  end loop;

  return jsonb_build_object('groupe', p_groupe, 'lignes', cardinality(v_plats),
                            'total', v_formule.prix, 'deja', false);
end;
$$;

revoke all on function public.caisse_poser_formule(uuid, uuid, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.caisse_poser_formule(uuid, uuid, jsonb, uuid) to authenticated;
alter function public.caisse_poser_formule(uuid, uuid, jsonb, uuid) owner to postgres;

-- ----------------------------------------------------------------------------
-- 5. Retirer une formule
-- ----------------------------------------------------------------------------
create or replace function public.caisse_retirer_formule(p_ticket_id uuid, p_groupe uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    text := auth.uid()::text;
  v_ticket public.caisse_tickets%rowtype;
  v_role   text;
  v_n      int;
begin
  if v_uid is null then
    raise exception 'caisse: connexion requise' using errcode = '42501';
  end if;
  select * into v_ticket from public.caisse_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'caisse: ticket introuvable';
  end if;
  v_role := public.caisse_role_actif(v_ticket.etablissement_id);
  if v_role is null or not coalesce(public.caisse_peut_utiliser(v_ticket.etablissement_id), false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_ticket.statut <> 'ouvert' then
    raise exception 'caisse: ticket fige, lignes comprises';
  end if;
  if exists (select 1 from public.caisse_lignes
              where ticket_id = p_ticket_id and formule_groupe = p_groupe
                and statut <> 'en_attente')
     and not (v_role = any(array['consultant', 'patron'])) then
    raise exception 'caisse: ligne deja envoyee (retrait par la direction seulement)';
  end if;

  delete from public.caisse_lignes
   where ticket_id = p_ticket_id and formule_groupe = p_groupe;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.caisse_retirer_formule(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.caisse_retirer_formule(uuid, uuid) to authenticated;
alter function public.caisse_retirer_formule(uuid, uuid) owner to postgres;
