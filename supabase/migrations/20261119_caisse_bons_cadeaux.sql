-- ════════════════════════════════════════════════════════════════════════════
-- Caisse : bons cadeaux enregistres (19.11.2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Un bon cadeau sur mesure : un montant choisi, le nom et le telephone de la
-- personne, un code unique (imprime en clair et en QR), une validite. Il se
-- vend depuis la caisse et se depense en un ou plusieurs passages, comme un
-- moyen de paiement.
--
-- Tables :
--   caisse_bons_cadeaux           : le bon, son solde, son statut.
--   caisse_bons_cadeaux_mouvements : le registre (emission, utilisation,
--     recredit, annulation, prolongation). Rien ne s'efface.
--   caisse_paiements.bon_cadeau_id : le paiement d'un ticket regle par un bon.
--
-- Regle de TVA (Suisse, bon de valeur) : la vente d'un bon n'est pas un
-- chiffre d'affaires ni une prestation imposable ; la TVA est due quand le bon
-- se depense, sur les lignes du ticket qu'il regle. La vente d'un bon ne passe
-- donc pas par un ticket numerote : elle s'inscrit au registre avec son moyen
-- de paiement et son jour d'exploitation, et la cloture du jour la compte a
-- part (cle « bons_cadeaux » de caisse_totaux_jour). Les especes recues pour
-- un bon entrent dans les especes attendues du tiroir.
--
-- Ecritures : par les RPC seulement (le client n'a que la lecture) :
--   caisse_bon_cadeau_emettre   : tout compte qui a la caisse ;
--   caisse_bon_cadeau_annuler   : consultant et patron, bon jamais utilise,
--                                 motif obligatoire, rendu de l'argent inscrit ;
--   caisse_bon_cadeau_prolonger : consultant et patron.
--   caisse_encaisser (reprise de la v9, meme signature) : un paiement
--     { moyen: 'autre', montant, bon_cadeau: 'CODE' } debite le bon sous
--     verrou, dans la meme transaction que le scellement du ticket.
--   Ticket encaisse puis annule : un declencheur recredite le bon.
--
-- Ticket de test : son encaissement ignore les paiements (v6), aucun bon n'est
-- debite.
--
-- Migration additive (expand) : deux tables, une colonne nullable, quatre
-- fonctions, un declencheur ; caisse_encaisser et caisse_totaux_jour sont
-- reprises a l'identique de la v9 (empreintes verifiees en base le
-- 19.11.2026) avec les seuls ajouts des bons. Le front deploye n'envoie jamais
-- la cle bon_cadeau et ne lit pas la cle bons_cadeaux : il est inchange.
-- Idempotente. Inverse : supabase/migrations-inverse/20261119_caisse_bons_cadeaux.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.caisse_bons_cadeaux (
  id               uuid          primary key default gen_random_uuid(),
  etablissement_id text          not null references public.etablissements(id) on delete cascade,
  code             text          not null,
  montant_initial  numeric(10,2) not null,
  solde            numeric(10,2) not null,
  nom              text          not null,
  telephone        text          not null,
  message          text,
  valable_jusqu_au date,
  statut           text          not null default 'actif',
  emis_par         text          references public.profiles(id),
  emis_at          timestamptz   not null default now(),
  annule_par       text          references public.profiles(id),
  annule_at        timestamptz,
  annule_motif     text,
  updated_at       timestamptz   not null default now(),
  constraint caisse_bons_cadeaux_code_forme check (code ~ '^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$'),
  constraint caisse_bons_cadeaux_montant    check (montant_initial > 0 and montant_initial <= 5000),
  constraint caisse_bons_cadeaux_solde      check (solde >= 0 and solde <= montant_initial),
  constraint caisse_bons_cadeaux_nom        check (char_length(btrim(nom)) between 1 and 80),
  constraint caisse_bons_cadeaux_telephone  check (telephone ~ '^\+?[0-9][0-9 ]{5,22}$'),
  constraint caisse_bons_cadeaux_message    check (message is null or char_length(message) <= 160),
  constraint caisse_bons_cadeaux_statut     check (statut in ('actif', 'epuise', 'annule')),
  constraint caisse_bons_cadeaux_annule     check ((statut = 'annule') = (annule_at is not null))
);

create unique index if not exists uq_caisse_bons_cadeaux_code   on public.caisse_bons_cadeaux(code);
create index if not exists idx_caisse_bons_cadeaux_etab         on public.caisse_bons_cadeaux(etablissement_id, emis_at desc);
create index if not exists idx_caisse_bons_cadeaux_emis_par     on public.caisse_bons_cadeaux(emis_par);
create index if not exists idx_caisse_bons_cadeaux_annule_par   on public.caisse_bons_cadeaux(annule_par);

comment on table public.caisse_bons_cadeaux is
  'Caisse : bons cadeaux sur mesure. Ecrits par les RPC caisse_bon_cadeau_* et caisse_encaisser seulement.';

create table if not exists public.caisse_bons_cadeaux_mouvements (
  id                uuid          primary key default gen_random_uuid(),
  bon_id            uuid          not null references public.caisse_bons_cadeaux(id) on delete cascade,
  etablissement_id  text          not null references public.etablissements(id) on delete cascade,
  genre             text          not null check (genre in ('emission', 'utilisation', 'recredit', 'annulation', 'prolongation')),
  montant           numeric(10,2) not null default 0 check (montant >= 0),
  moyen             text          check (moyen is null or moyen in ('especes', 'carte', 'autre')),
  libelle           text          check (libelle is null or char_length(libelle) <= 40),
  ticket_id         uuid          references public.caisse_tickets(id) on delete set null,
  jour_exploitation date,
  detail            text          check (detail is null or char_length(detail) <= 300),
  par               text          references public.profiles(id),
  created_at        timestamptz   not null default now()
);

create index if not exists idx_caisse_bons_mvt_bon    on public.caisse_bons_cadeaux_mouvements(bon_id, created_at);
create index if not exists idx_caisse_bons_mvt_jour   on public.caisse_bons_cadeaux_mouvements(etablissement_id, jour_exploitation);
create index if not exists idx_caisse_bons_mvt_ticket on public.caisse_bons_cadeaux_mouvements(ticket_id);
create index if not exists idx_caisse_bons_mvt_par    on public.caisse_bons_cadeaux_mouvements(par);

comment on table public.caisse_bons_cadeaux_mouvements is
  'Caisse : registre des bons cadeaux. jour_exploitation porte la cloture ou compte une vente ou un rendu d''argent.';

alter table public.caisse_paiements
  add column if not exists bon_cadeau_id uuid references public.caisse_bons_cadeaux(id) on delete restrict;
create index if not exists idx_caisse_paiements_bon_cadeau on public.caisse_paiements(bon_cadeau_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'caisse_paiements_bon_cadeau_autre') then
    alter table public.caisse_paiements
      add constraint caisse_paiements_bon_cadeau_autre
      check (bon_cadeau_id is null or (moyen = 'autre' and pourboire = 0 and rendu = 0 and arrondi = 0));
  end if;
end $$;

comment on column public.caisse_paiements.bon_cadeau_id is
  'Caisse : le bon cadeau qui regle ce paiement (moyen autre, libelle « Bon cadeau »). Pose par caisse_encaisser seulement.';

drop trigger if exists trg_caisse_bons_cadeaux_updated_at on public.caisse_bons_cadeaux;
create trigger trg_caisse_bons_cadeaux_updated_at
  before update on public.caisse_bons_cadeaux
  for each row execute function public.set_updated_at();

-- Journal d'activite (consultant et patron) : emission, solde, annulation.
drop trigger if exists trg_journal_activite on public.caisse_bons_cadeaux;
create trigger trg_journal_activite
  after insert or update or delete on public.caisse_bons_cadeaux
  for each row execute function public.journal_activite_log();

-- ----------------------------------------------------------------------------
-- 2. Droits : lecture pour les membres de l'etablissement, aucune ecriture
-- ----------------------------------------------------------------------------
alter table public.caisse_bons_cadeaux            enable row level security;
alter table public.caisse_bons_cadeaux_mouvements enable row level security;

revoke all on public.caisse_bons_cadeaux            from anon, authenticated;
revoke all on public.caisse_bons_cadeaux_mouvements from anon, authenticated;
grant select on public.caisse_bons_cadeaux            to authenticated;
grant select on public.caisse_bons_cadeaux_mouvements to authenticated;

drop policy if exists caisse_bons_cadeaux_select on public.caisse_bons_cadeaux;
create policy caisse_bons_cadeaux_select on public.caisse_bons_cadeaux
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists caisse_bons_cadeaux_mouvements_select on public.caisse_bons_cadeaux_mouvements;
create policy caisse_bons_cadeaux_mouvements_select on public.caisse_bons_cadeaux_mouvements
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

-- ----------------------------------------------------------------------------
-- 3. Fonctions internes
-- ----------------------------------------------------------------------------
-- 3.1 Un code neuf : 8 signes d'un alphabet sans 0, O, 1, I ni L (31 signes,
-- un peu moins de 40 bits), ecrit XXXX-XXXX. Tire de gen_random_uuid.
create or replace function public.caisse_bon_cadeau_code()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_alpha  constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_octets bytea;
  v_code   text;
  i        int;
begin
  loop
    v_octets := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
    v_code := '';
    i := 0;
    -- Tirage sans biais : un octet au-dela de 247 (8 x 31 - 1) est rejete.
    while char_length(v_code) < 8 and i < 32 loop
      if get_byte(v_octets, i) < 248 then
        v_code := v_code || substr(v_alpha, get_byte(v_octets, i) % 31 + 1, 1);
      end if;
      i := i + 1;
    end loop;
    if char_length(v_code) = 8 then
      v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
      exit when not exists (select 1 from public.caisse_bons_cadeaux b where b.code = v_code);
    end if;
  end loop;
  return v_code;
end;
$$;

revoke all on function public.caisse_bon_cadeau_code() from public, anon, authenticated;

-- 3.2 Le jour d'exploitation d'un mouvement d'argent, sous le verrou de
-- l'etablissement que prend aussi la cloture (ligne « chaine » des
-- compteurs) : une vente de bon ne se glisse pas dans un jour en train d'etre
-- clos, elle passe au jour suivant.
create or replace function public.caisse_bon_cadeau_jour(p_etablissement_id text)
returns date
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1 from public.caisse_compteurs c
   where c.etablissement_id = p_etablissement_id and c.cle = 'chaine'
     for update;
  return public.caisse_jour_ouvert(p_etablissement_id, now());
end;
$$;

revoke all on function public.caisse_bon_cadeau_jour(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. RPC
-- ----------------------------------------------------------------------------
-- 4.1 Emettre un bon. Le montant est un multiple de 5 centimes (il peut etre
-- paye en especes). Telephone : chiffres et espaces, un + en tete permis.
-- Validite : null = sans limite, sinon d'aujourd'hui a dix ans.
create or replace function public.caisse_bon_cadeau_emettre(
  p_etablissement_id text,
  p_montant          numeric,
  p_nom              text,
  p_telephone        text,
  p_moyen            text,
  p_libelle          text default null,
  p_valable_jusqu_au date default null,
  p_message          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     text := auth.uid()::text;
  v_peut    boolean;
  v_montant numeric := round(coalesce(p_montant, 0), 2);
  v_nom     text := btrim(regexp_replace(coalesce(p_nom, ''), '\s+', ' ', 'g'));
  v_tel     text := btrim(regexp_replace(coalesce(p_telephone, ''), '\s+', ' ', 'g'));
  v_libelle text := nullif(btrim(coalesce(p_libelle, '')), '');
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_aujourd date := (now() at time zone 'Europe/Zurich')::date;
  v_jour    date;
  v_bon     public.caisse_bons_cadeaux%rowtype;
begin
  v_peut := public.caisse_peut_utiliser(p_etablissement_id);
  if not coalesce(v_peut, false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_montant <= 0 or v_montant > 5000 or v_montant * 20 <> trunc(v_montant * 20) then
    raise exception 'caisse: bon cadeau, montant invalide';
  end if;
  if char_length(v_nom) < 1 or char_length(v_nom) > 80 then
    raise exception 'caisse: bon cadeau, nom invalide';
  end if;
  if v_tel !~ '^\+?[0-9][0-9 ]{5,22}$' or char_length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 6 then
    raise exception 'caisse: bon cadeau, telephone invalide';
  end if;
  if p_moyen is null or p_moyen not in ('especes', 'carte', 'autre') then
    raise exception 'caisse: moyen de paiement inconnu';
  end if;
  if char_length(coalesce(v_libelle, '')) > 40 then
    raise exception 'caisse: nom du moyen de paiement trop long';
  end if;
  if char_length(coalesce(v_message, '')) > 160 then
    raise exception 'caisse: bon cadeau, message trop long';
  end if;
  if p_valable_jusqu_au is not null
     and (p_valable_jusqu_au < v_aujourd or p_valable_jusqu_au > (v_aujourd + interval '10 years')::date) then
    raise exception 'caisse: bon cadeau, validite invalide';
  end if;

  v_jour := public.caisse_bon_cadeau_jour(p_etablissement_id);

  insert into public.caisse_bons_cadeaux
    (etablissement_id, code, montant_initial, solde, nom, telephone, message, valable_jusqu_au, emis_par)
  values
    (p_etablissement_id, public.caisse_bon_cadeau_code(), v_montant, v_montant, v_nom, v_tel, v_message,
     p_valable_jusqu_au, v_uid)
  returning * into v_bon;

  insert into public.caisse_bons_cadeaux_mouvements
    (bon_id, etablissement_id, genre, montant, moyen, libelle, jour_exploitation, par)
  values
    (v_bon.id, p_etablissement_id, 'emission', v_montant, p_moyen, v_libelle, v_jour, v_uid);

  return to_jsonb(v_bon) || jsonb_build_object('jour_exploitation', v_jour);
end;
$$;

revoke all on function public.caisse_bon_cadeau_emettre(text, numeric, text, text, text, text, date, text) from public, anon, authenticated;
grant execute on function public.caisse_bon_cadeau_emettre(text, numeric, text, text, text, text, date, text) to authenticated;

-- 4.2 Annuler un bon jamais utilise et rendre l'argent : consultant et patron,
-- motif de 3 a 300 caracteres. Le rendu s'inscrit avec son moyen (par defaut
-- celui de la vente) au jour ouvert : la cloture le deduit.
create or replace function public.caisse_bon_cadeau_annuler(
  p_bon_id  uuid,
  p_motif   text,
  p_moyen   text default null,
  p_libelle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     text := auth.uid()::text;
  v_role    text;
  v_bon     public.caisse_bons_cadeaux%rowtype;
  v_vente   public.caisse_bons_cadeaux_mouvements%rowtype;
  v_motif   text := btrim(coalesce(p_motif, ''));
  v_moyen   text;
  v_libelle text;
  v_jour    date;
begin
  select * into v_bon from public.caisse_bons_cadeaux where id = p_bon_id for update;
  if not found then
    raise exception 'caisse: bon cadeau introuvable';
  end if;
  v_role := public.caisse_role_actif(v_bon.etablissement_id);
  if v_role is null or not (v_role = any(array['consultant', 'patron'])) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if char_length(v_motif) < 3 or char_length(v_motif) > 300 then
    raise exception 'caisse: motif invalide (3 a 300 caracteres)';
  end if;
  if v_bon.statut = 'annule' then
    raise exception 'caisse: bon cadeau deja annule';
  end if;
  if v_bon.solde <> v_bon.montant_initial
     or exists (select 1 from public.caisse_bons_cadeaux_mouvements m
                 where m.bon_id = v_bon.id and m.genre = 'utilisation') then
    raise exception 'caisse: bon cadeau deja utilise, il ne s''annule plus';
  end if;

  select * into v_vente from public.caisse_bons_cadeaux_mouvements m
   where m.bon_id = v_bon.id and m.genre = 'emission' order by m.created_at limit 1;
  v_moyen := coalesce(p_moyen, v_vente.moyen, 'especes');
  v_libelle := case when p_moyen is null then v_vente.libelle else nullif(btrim(coalesce(p_libelle, '')), '') end;
  if v_moyen not in ('especes', 'carte', 'autre') then
    raise exception 'caisse: moyen de paiement inconnu';
  end if;
  if char_length(coalesce(v_libelle, '')) > 40 then
    raise exception 'caisse: nom du moyen de paiement trop long';
  end if;

  v_jour := public.caisse_bon_cadeau_jour(v_bon.etablissement_id);

  update public.caisse_bons_cadeaux
     set statut = 'annule', solde = 0, annule_par = v_uid, annule_at = now(), annule_motif = v_motif
   where id = v_bon.id
  returning * into v_bon;

  insert into public.caisse_bons_cadeaux_mouvements
    (bon_id, etablissement_id, genre, montant, moyen, libelle, jour_exploitation, detail, par)
  values
    (v_bon.id, v_bon.etablissement_id, 'annulation', v_bon.montant_initial, v_moyen, v_libelle, v_jour, v_motif, v_uid);

  return to_jsonb(v_bon);
end;
$$;

revoke all on function public.caisse_bon_cadeau_annuler(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.caisse_bon_cadeau_annuler(uuid, text, text, text) to authenticated;

-- 4.3 Changer la validite d'un bon actif (consultant et patron) : null = sans
-- limite. Trace au registre.
create or replace function public.caisse_bon_cadeau_prolonger(
  p_bon_id           uuid,
  p_valable_jusqu_au date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     text := auth.uid()::text;
  v_role    text;
  v_bon     public.caisse_bons_cadeaux%rowtype;
  v_avant   date;
  v_aujourd date := (now() at time zone 'Europe/Zurich')::date;
begin
  select * into v_bon from public.caisse_bons_cadeaux where id = p_bon_id for update;
  if not found then
    raise exception 'caisse: bon cadeau introuvable';
  end if;
  v_role := public.caisse_role_actif(v_bon.etablissement_id);
  if v_role is null or not (v_role = any(array['consultant', 'patron'])) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_bon.statut <> 'actif' then
    raise exception 'caisse: bon cadeau epuise ou annule';
  end if;
  if p_valable_jusqu_au is not null
     and (p_valable_jusqu_au < v_aujourd or p_valable_jusqu_au > (v_aujourd + interval '10 years')::date) then
    raise exception 'caisse: bon cadeau, validite invalide';
  end if;
  v_avant := v_bon.valable_jusqu_au;
  if v_avant is not distinct from p_valable_jusqu_au then
    return to_jsonb(v_bon);
  end if;

  update public.caisse_bons_cadeaux set valable_jusqu_au = p_valable_jusqu_au
   where id = v_bon.id
  returning * into v_bon;

  insert into public.caisse_bons_cadeaux_mouvements (bon_id, etablissement_id, genre, detail, par)
  values (v_bon.id, v_bon.etablissement_id, 'prolongation',
          coalesce(to_char(v_avant, 'DD.MM.YYYY'), 'sans limite') || ' > '
            || coalesce(to_char(p_valable_jusqu_au, 'DD.MM.YYYY'), 'sans limite'),
          v_uid);

  return to_jsonb(v_bon);
end;
$$;

revoke all on function public.caisse_bon_cadeau_prolonger(uuid, date) from public, anon, authenticated;
grant execute on function public.caisse_bon_cadeau_prolonger(uuid, date) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Ticket encaisse puis annule : le bon qui l'a regle retrouve son montant
-- ----------------------------------------------------------------------------
create or replace function public.caisse_bon_cadeau_recredit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p record;
begin
  for p in
    select pa.bon_cadeau_id, pa.montant from public.caisse_paiements pa
     where pa.ticket_id = new.id and pa.bon_cadeau_id is not null
  loop
    update public.caisse_bons_cadeaux
       set solde = solde + p.montant,
           statut = case when statut = 'epuise' then 'actif' else statut end
     where id = p.bon_cadeau_id;
    insert into public.caisse_bons_cadeaux_mouvements
      (bon_id, etablissement_id, genre, montant, ticket_id, jour_exploitation, par)
    values
      (p.bon_cadeau_id, new.etablissement_id, 'recredit', p.montant, new.id, new.annule_jour, auth.uid()::text);
  end loop;
  return null;
end;
$$;

revoke all on function public.caisse_bon_cadeau_recredit() from public, anon, authenticated;

drop trigger if exists trg_caisse_ticket_bon_cadeau_recredit on public.caisse_tickets;
create trigger trg_caisse_ticket_bon_cadeau_recredit
  after update of statut on public.caisse_tickets
  for each row
  when (old.statut = 'encaisse' and new.statut = 'annule')
  execute function public.caisse_bon_cadeau_recredit();

-- ----------------------------------------------------------------------------
-- 6. caisse_encaisser (v9), reprise : le paiement par bon cadeau
-- ----------------------------------------------------------------------------
-- Tout le reste est celui de la v9, a l'identique. Ajouts : la cle bon_cadeau
-- d'un paiement (controles dans la premiere passe, debit et registre dans la
-- seconde, sous le verrou du bon), le jour d'exploitation des utilisations
-- apres le scellement, et la cle bons_cadeaux de la reponse.
create or replace function public.caisse_encaisser(
  p_ticket_id  uuid,
  p_paiements  jsonb,
  p_a_emporter boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       text := auth.uid()::text;
  v_ticket    public.caisse_tickets%rowtype;
  v_peut      boolean;
  v_total     numeric;
  v_somme     numeric := 0;
  v_especes   numeric := 0;
  v_n         int;
  v_i         int := 0;
  v_dernier   int := 0;
  v_arrondir  boolean := true;
  v_arrondi   numeric := 0;
  v_ecart     numeric;
  v_rendu     numeric;
  v_rendu_tot numeric := 0;
  v_pourb_tot numeric := 0;
  v_moyen     text;
  v_libelle   text;
  v_montant   numeric;
  v_pourboire numeric;
  v_recu      numeric;
  v_tpe       uuid;
  v_tpe_vus   uuid[] := '{}'::uuid[];
  v_tx        public.caisse_tpe_transactions%rowtype;
  v_bon       public.caisse_bons_cadeaux%rowtype;
  v_code      text;
  v_bons_vus  uuid[] := '{}'::uuid[];
  v_bon_ids   uuid[] := '{}'::uuid[];
  v_bon_id    uuid;
  v_bons      jsonb := '[]'::jsonb;
  v_aujourd   date := (now() at time zone 'Europe/Zurich')::date;
  e           jsonb;
begin
  select * into v_ticket from public.caisse_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'caisse: ticket introuvable';
  end if;
  v_peut := public.caisse_peut_utiliser(v_ticket.etablissement_id);
  if not coalesce(v_peut, false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_ticket.statut = 'encaisse' then
    raise exception 'caisse: ticket deja encaisse';
  end if;
  if v_ticket.statut <> 'ouvert' then
    raise exception 'caisse: ticket % fige', v_ticket.statut;
  end if;
  if not exists (select 1 from public.caisse_lignes l where l.ticket_id = p_ticket_id) then
    raise exception 'caisse: un ticket vide ne s''encaisse pas';
  end if;
  if p_paiements is null or jsonb_typeof(p_paiements) <> 'array'
     or jsonb_array_length(p_paiements) < 1 or jsonb_array_length(p_paiements) > 8 then
    raise exception 'caisse: paiements invalides';
  end if;
  v_n := jsonb_array_length(p_paiements);

  select coalesce(sum(round(l.quantite * l.prix_unitaire, 2)), 0) into v_total
    from public.caisse_lignes l where l.ticket_id = p_ticket_id;

  -- Un paiement reste d'un essai interrompu de l'ancien chemin : on repart
  -- de zero (un ticket ouvert n'a pas de paiement valable).
  delete from public.caisse_paiements where ticket_id = p_ticket_id;

  if v_ticket.test then
    v_moyen := coalesce(p_paiements -> 0 ->> 'moyen', 'autre');
    if v_moyen not in ('especes', 'carte', 'autre') then
      raise exception 'caisse: moyen de paiement inconnu';
    end if;
    insert into public.caisse_paiements (ticket_id, moyen, libelle, montant, encaisse_par)
    values (p_ticket_id, v_moyen, 'TEST', v_total, v_uid);
    update public.caisse_tickets
       set statut = 'encaisse', closed_at = now(), a_emporter = coalesce(p_a_emporter, a_emporter)
     where id = p_ticket_id;
    return jsonb_build_object('ticket_id', p_ticket_id, 'test', true, 'numero', null, 'total', v_total,
                              'rendu', 0, 'arrondi', 0, 'pourboire', 0);
  end if;

  -- Premiere passe : controles, somme, part en especes.
  for e in select * from jsonb_array_elements(p_paiements) loop
    v_i := v_i + 1;
    v_moyen := e ->> 'moyen';
    if v_moyen is null or v_moyen not in ('especes', 'carte', 'autre') then
      raise exception 'caisse: moyen de paiement inconnu';
    end if;
    if char_length(coalesce(e ->> 'libelle', '')) > 40 then
      raise exception 'caisse: nom du moyen de paiement trop long';
    end if;
    v_montant := round(coalesce((e ->> 'montant')::numeric, 0), 2);
    v_pourboire := round(coalesce((e ->> 'pourboire')::numeric, 0), 2);
    if v_montant < 0 or v_pourboire < 0 or coalesce((e ->> 'recu')::numeric, 0) < 0
       or v_montant > 1000000 or v_pourboire > 100000 or coalesce((e ->> 'recu')::numeric, 0) > 1000000 then
      raise exception 'caisse: montant de paiement invalide';
    end if;
    -- v9 : le paiement « terminal relie ».
    if nullif(e ->> 'tpe', '') is not null then
      if (e ->> 'tpe') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        raise exception 'caisse: transaction de terminal introuvable';
      end if;
      v_tpe := (e ->> 'tpe')::uuid;
      if v_moyen <> 'carte' then
        raise exception 'caisse: un paiement par terminal relie est un paiement par carte';
      end if;
      if v_tpe = any(v_tpe_vus) then
        raise exception 'caisse: une transaction de terminal ne sert qu''une fois';
      end if;
      v_tpe_vus := v_tpe_vus || v_tpe;
      select * into v_tx from public.caisse_tpe_transactions where id = v_tpe for update;
      if not found or v_tx.ticket_id <> p_ticket_id then
        raise exception 'caisse: cette transaction de terminal n''est pas celle de ce ticket';
      end if;
      if v_tx.statut <> 'approuve' or v_tx.test or v_tx.rembourse_statut is not distinct from 'fait' then
        raise exception 'caisse: le terminal n''a pas accepte ce paiement';
      end if;
      if v_tx.rembourse_statut is not distinct from 'demande' then
        raise exception 'caisse: un remboursement sur le terminal est en cours pour ce ticket';
      end if;
      if v_tx.montant <> v_montant or v_tx.pourboire <> v_pourboire then
        raise exception 'caisse: le montant du paiement n''est pas celui du terminal';
      end if;
      if exists (select 1 from public.caisse_paiements p where p.tpe_transaction_id = v_tpe) then
        raise exception 'caisse: une transaction de terminal ne sert qu''une fois';
      end if;
    end if;
    -- Bon cadeau : moyen « autre », ni pourboire ni rendu, un bon de la
    -- maison, actif, dans sa validite, une fois par ticket, qui couvre ce
    -- montant. Verrouille jusqu'a la fin de la transaction.
    v_bon_ids[v_i] := null;
    if nullif(e ->> 'bon_cadeau', '') is not null then
      if v_moyen <> 'autre' then
        raise exception 'caisse: bon cadeau, moyen invalide';
      end if;
      if v_pourboire <> 0 or coalesce((e ->> 'recu')::numeric, 0) <> 0 then
        raise exception 'caisse: bon cadeau, ni pourboire ni rendu';
      end if;
      v_code := upper(regexp_replace(e ->> 'bon_cadeau', '[^A-Za-z0-9]', '', 'g'));
      if v_code !~ '^[A-HJKMNP-Z2-9]{8}$' then
        raise exception 'caisse: bon cadeau introuvable';
      end if;
      v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
      select * into v_bon from public.caisse_bons_cadeaux b
       where b.code = v_code and b.etablissement_id = v_ticket.etablissement_id
         for update;
      if not found then
        raise exception 'caisse: bon cadeau introuvable';
      end if;
      if v_bon.id = any(v_bons_vus) then
        raise exception 'caisse: bon cadeau deja pose sur ce ticket';
      end if;
      v_bons_vus := v_bons_vus || v_bon.id;
      if v_bon.statut = 'annule' then
        raise exception 'caisse: bon cadeau annule';
      end if;
      if v_bon.statut = 'epuise' or v_bon.solde <= 0 then
        raise exception 'caisse: bon cadeau epuise';
      end if;
      if v_bon.valable_jusqu_au is not null and v_bon.valable_jusqu_au < v_aujourd then
        raise exception 'caisse: bon cadeau echu';
      end if;
      if v_montant <= 0 or v_montant > v_bon.solde then
        raise exception 'caisse: bon cadeau, solde insuffisant';
      end if;
      v_bon_ids[v_i] := v_bon.id;
    end if;
    v_somme := v_somme + v_montant;
    if v_moyen = 'especes' then
      v_especes := v_especes + v_montant;
      v_dernier := v_i;
    end if;
  end loop;
  if abs(v_somme - v_total) >= 0.005 then
    raise exception 'caisse: les paiements ne font pas le total (% pour %)', v_somme, v_total;
  end if;

  select coalesce(r.config -> 'arrondi_especes', 'true'::jsonb) <> 'false'::jsonb into v_arrondir
    from public.caisse_reglages r where r.etablissement_id = v_ticket.etablissement_id;
  if coalesce(v_arrondir, true) and v_dernier > 0 then
    v_arrondi := round(round(v_especes * 20) / 20 - v_especes, 2);
  end if;

  -- Seconde passe : ecriture. L'ecart d'arrondi va sur le dernier paiement en
  -- especes ; le rendu est ce que le client a donne moins ce qu'il doit
  -- (montant + ecart) et son pourboire.
  v_i := 0;
  for e in select * from jsonb_array_elements(p_paiements) loop
    v_i := v_i + 1;
    v_moyen := e ->> 'moyen';
    v_libelle := nullif(btrim(coalesce(e ->> 'libelle', '')), '');
    v_montant := round(coalesce((e ->> 'montant')::numeric, 0), 2);
    v_pourboire := round(coalesce((e ->> 'pourboire')::numeric, 0), 2);
    v_recu := round((e ->> 'recu')::numeric, 2);
    v_tpe := nullif(e ->> 'tpe', '')::uuid;
    v_ecart := case when v_i = v_dernier then v_arrondi else 0 end;
    v_rendu := 0;
    if v_moyen = 'especes' and v_recu is not null then
      v_rendu := v_recu - (v_montant + v_ecart) - v_pourboire;
      if v_rendu < 0 then
        raise exception 'caisse: especes recues insuffisantes';
      end if;
    end if;
    v_bon_id := v_bon_ids[v_i];
    if v_bon_id is not null then
      v_libelle := 'Bon cadeau';
    end if;
    insert into public.caisse_paiements
      (ticket_id, moyen, libelle, montant, pourboire, rendu, arrondi, encaisse_par, tpe_transaction_id, bon_cadeau_id)
    values
      (p_ticket_id, v_moyen, v_libelle, v_montant, v_pourboire, v_rendu, v_ecart, v_uid, v_tpe, v_bon_id);
    if v_bon_id is not null then
      update public.caisse_bons_cadeaux
         set solde = solde - v_montant,
             statut = case when solde - v_montant = 0 then 'epuise' else statut end
       where id = v_bon_id
      returning * into v_bon;
      insert into public.caisse_bons_cadeaux_mouvements (bon_id, etablissement_id, genre, montant, ticket_id, par)
      values (v_bon_id, v_ticket.etablissement_id, 'utilisation', v_montant, p_ticket_id, v_uid);
      v_bons := v_bons || jsonb_build_array(jsonb_build_object(
        'code', v_bon.code, 'nom', v_bon.nom, 'montant', v_montant, 'solde', v_bon.solde));
    end if;
    v_rendu_tot := v_rendu_tot + v_rendu;
    v_pourb_tot := v_pourb_tot + v_pourboire;
  end loop;

  -- Le passage a encaisse : les gardes verifient, le declencheur scelle.
  update public.caisse_tickets
     set statut = 'encaisse', closed_at = now(), a_emporter = coalesce(p_a_emporter, a_emporter)
   where id = p_ticket_id
  returning * into v_ticket;

  update public.caisse_bons_cadeaux_mouvements
     set jour_exploitation = v_ticket.jour_exploitation
   where ticket_id = p_ticket_id and genre = 'utilisation' and jour_exploitation is null;

  return jsonb_build_object(
    'ticket_id', v_ticket.id,
    'test', false,
    'numero', v_ticket.numero,
    'annee', v_ticket.annee,
    'jour_exploitation', v_ticket.jour_exploitation,
    'total', v_ticket.total_ttc,
    'rendu', v_rendu_tot,
    'arrondi', v_arrondi,
    'pourboire', v_pourb_tot,
    'bons_cadeaux', v_bons);
end;
$$;

revoke execute on function public.caisse_encaisser(uuid, jsonb, boolean) from public, anon, authenticated;
grant  execute on function public.caisse_encaisser(uuid, jsonb, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. caisse_totaux_jour (v9), reprise : la cle « bons_cadeaux »
-- ----------------------------------------------------------------------------
-- Toutes les cles de la v9 sont rendues a l'identique, sauf especes.attendues
-- qui compte en plus les especes recues pour des bons (moins celles rendues).
-- Ajouts : especes.bons_cadeaux et bons_cadeaux (vendus, rendus, utilises,
-- recredites). Les bons ne touchent ni les ventes, ni la TVA, ni le net.
create or replace function public.caisse_totaux_jour(p_etablissement_id text, p_jour date)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ventes as (
    select t.* from public.caisse_tickets t
     where t.etablissement_id = p_etablissement_id and t.jour_exploitation = p_jour
       and t.numero is not null and t.test = false
  ), annules as (
    select t.* from public.caisse_tickets t
     where t.etablissement_id = p_etablissement_id and t.annule_jour = p_jour
       and t.numero is not null and t.test = false and t.statut = 'annule'
  ), tva_v as (
    select d.taux, sum(d.ttc) as ttc, sum(d.tva) as tva
      from ventes v cross join lateral public.caisse_detail_tva(v.id) d group by d.taux
  ), tva_a as (
    select d.taux, sum(d.ttc) as ttc, sum(d.tva) as tva
      from annules a cross join lateral public.caisse_detail_tva(a.id) d group by d.taux
  ), taux as (
    select taux from tva_v union select taux from tva_a
  ), tva_n as (
    select x.taux,
           coalesce(v.ttc, 0) - coalesce(a.ttc, 0) as ttc,
           coalesce(v.tva, 0) - coalesce(a.tva, 0) as tva
      from taux x
      left join tva_v v on v.taux = x.taux
      left join tva_a a on a.taux = x.taux
  ), moyens_v as (
    select p.moyen, coalesce(p.libelle, '') as libelle, count(*) as nombre,
           sum(p.montant + p.arrondi) as montant, sum(p.pourboire) as pourboire
      from ventes v join public.caisse_paiements p on p.ticket_id = v.id
     group by 1, 2
  ), moyens_a as (
    select p.moyen, coalesce(p.libelle, '') as libelle, count(*) as nombre,
           sum(p.montant + p.arrondi) as montant
      from annules a join public.caisse_paiements p on p.ticket_id = a.id
     group by 1, 2
  ), services as (
    select v.service, count(*) as tickets, coalesce(sum(v.couverts), 0) as couverts, sum(v.total_ttc) as ttc
      from ventes v group by v.service
  ), lignes as (
    select l.* from ventes v join public.caisse_lignes l on l.ticket_id = v.id
  ), cartes_v as (
    -- v9 : les cartes des ventes du jour ; terminal_id null = saisie a la main.
    select x.terminal_id, count(*) as nombre, sum(p.montant) as montant, sum(p.pourboire) as pourboire
      from ventes v
      join public.caisse_paiements p on p.ticket_id = v.id
      left join public.caisse_tpe_transactions x on x.id = p.tpe_transaction_id
     where p.moyen = 'carte'
     group by x.terminal_id
  ), cartes_a as (
    select x.terminal_id, count(*) as nombre, sum(p.montant) as montant
      from annules a
      join public.caisse_paiements p on p.ticket_id = a.id
      left join public.caisse_tpe_transactions x on x.id = p.tpe_transaction_id
     where p.moyen = 'carte'
     group by x.terminal_id
  ), cartes_t as (
    select terminal_id from cartes_v where terminal_id is not null
    union
    select terminal_id from cartes_a where terminal_id is not null
  ), bons_m as (
    -- Bons cadeaux : ventes et rendus d'argent du jour (hors chiffre d'affaires).
    select m.genre, m.moyen, coalesce(m.libelle, '') as libelle, count(*) as nombre, sum(m.montant) as montant
      from public.caisse_bons_cadeaux_mouvements m
     where m.etablissement_id = p_etablissement_id and m.jour_exploitation = p_jour
       and m.genre in ('emission', 'annulation')
     group by 1, 2, 3
  ), bons_u as (
    select count(*) as nombre, coalesce(sum(p.montant), 0) as montant
      from ventes v join public.caisse_paiements p on p.ticket_id = v.id
     where p.bon_cadeau_id is not null
  ), bons_r as (
    select count(*) as nombre, coalesce(sum(p.montant), 0) as montant
      from annules a join public.caisse_paiements p on p.ticket_id = a.id
     where p.bon_cadeau_id is not null
  )
  select jsonb_build_object(
    'jour', to_char(p_jour, 'YYYY-MM-DD'),
    'ventes', jsonb_build_object(
      'tickets', (select count(*) from ventes),
      'premier_numero', (select min(numero) from ventes),
      'dernier_numero', (select max(numero) from ventes),
      'couverts', (select coalesce(sum(couverts), 0) from ventes),
      'ttc', (select coalesce(sum(ttc), 0) from tva_v),
      'tva', (select coalesce(sum(tva), 0) from tva_v),
      'ht', (select coalesce(sum(ttc - tva), 0) from tva_v),
      'par_taux', coalesce((select jsonb_agg(jsonb_build_object('taux', taux, 'ttc', ttc, 'tva', tva, 'ht', ttc - tva) order by taux desc) from tva_v), '[]'::jsonb)),
    'annulations', jsonb_build_object(
      'tickets', (select count(*) from annules),
      'numeros', coalesce((select jsonb_agg(annee || '-' || lpad(numero::text, 6, '0') order by annee, numero) from annules), '[]'::jsonb),
      'ttc', (select coalesce(sum(ttc), 0) from tva_a),
      'tva', (select coalesce(sum(tva), 0) from tva_a),
      'ht', (select coalesce(sum(ttc - tva), 0) from tva_a),
      'par_taux', coalesce((select jsonb_agg(jsonb_build_object('taux', taux, 'ttc', ttc, 'tva', tva, 'ht', ttc - tva) order by taux desc) from tva_a), '[]'::jsonb),
      'moyens', coalesce((select jsonb_agg(jsonb_build_object('moyen', moyen, 'libelle', libelle, 'nombre', nombre, 'montant', montant) order by moyen, libelle) from moyens_a), '[]'::jsonb)),
    'net', jsonb_build_object(
      'ttc', (select coalesce(sum(ttc), 0) from tva_n),
      'tva', (select coalesce(sum(tva), 0) from tva_n),
      'ht', (select coalesce(sum(ttc - tva), 0) from tva_n),
      'par_taux', coalesce((select jsonb_agg(jsonb_build_object('taux', taux, 'ttc', ttc, 'tva', tva, 'ht', ttc - tva) order by taux desc) from tva_n), '[]'::jsonb)),
    'moyens', coalesce((select jsonb_agg(jsonb_build_object('moyen', moyen, 'libelle', libelle, 'nombre', nombre, 'montant', montant) order by moyen, libelle) from moyens_v), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('service', service, 'tickets', tickets, 'couverts', couverts, 'ttc', ttc) order by service) from services), '[]'::jsonb),
    'remises', jsonb_build_object(
      'lignes', (select count(*) from lignes where prix_origine is not null and not offert),
      'montant', (select coalesce(sum(remise_montant), 0) from lignes where prix_origine is not null and not offert)),
    'offerts', jsonb_build_object(
      'lignes', (select count(*) from lignes where offert),
      'valeur', (select coalesce(sum(round(quantite * prix_origine, 2)), 0) from lignes where offert)),
    'pourboires', jsonb_build_object(
      'total', (select coalesce(sum(pourboire), 0) from moyens_v),
      'par_moyen', coalesce((select jsonb_agg(jsonb_build_object('moyen', moyen, 'libelle', libelle, 'montant', pourboire) order by moyen, libelle) from moyens_v where pourboire <> 0), '[]'::jsonb)),
    'arrondis', (select coalesce(sum(p.arrondi), 0) from ventes v join public.caisse_paiements p on p.ticket_id = v.id),
    'especes', jsonb_build_object(
      'ventes', (select coalesce(sum(montant), 0) from moyens_v where moyen = 'especes'),
      'annulees', (select coalesce(sum(montant), 0) from moyens_a where moyen = 'especes'),
      'bons_cadeaux', (select coalesce(sum(montant), 0) from bons_m where genre = 'emission' and moyen = 'especes')
                    - (select coalesce(sum(montant), 0) from bons_m where genre = 'annulation' and moyen = 'especes'),
      'attendues', (select coalesce(sum(montant), 0) from moyens_v where moyen = 'especes')
                 - (select coalesce(sum(montant), 0) from moyens_a where moyen = 'especes')
                 + (select coalesce(sum(montant), 0) from bons_m where genre = 'emission' and moyen = 'especes')
                 - (select coalesce(sum(montant), 0) from bons_m where genre = 'annulation' and moyen = 'especes')),
    'bons_cadeaux', jsonb_build_object(
      'vendus', jsonb_build_object(
        'nombre', (select coalesce(sum(nombre), 0) from bons_m where genre = 'emission'),
        'montant', (select coalesce(sum(montant), 0) from bons_m where genre = 'emission'),
        'moyens', coalesce((select jsonb_agg(jsonb_build_object('moyen', moyen, 'libelle', libelle, 'nombre', nombre, 'montant', montant) order by moyen, libelle) from bons_m where genre = 'emission'), '[]'::jsonb)),
      'rendus', jsonb_build_object(
        'nombre', (select coalesce(sum(nombre), 0) from bons_m where genre = 'annulation'),
        'montant', (select coalesce(sum(montant), 0) from bons_m where genre = 'annulation'),
        'moyens', coalesce((select jsonb_agg(jsonb_build_object('moyen', moyen, 'libelle', libelle, 'nombre', nombre, 'montant', montant) order by moyen, libelle) from bons_m where genre = 'annulation'), '[]'::jsonb)),
      'utilises', jsonb_build_object('nombre', (select nombre from bons_u), 'montant', (select montant from bons_u)),
      'recredites', jsonb_build_object('nombre', (select nombre from bons_r), 'montant', (select montant from bons_r))),
    'cartes', jsonb_build_object(
      'relie', jsonb_build_object(
        'nombre', (select coalesce(sum(nombre), 0) from cartes_v where terminal_id is not null),
        'ventes', (select coalesce(sum(montant), 0) from cartes_v where terminal_id is not null),
        'annulees', (select coalesce(sum(montant), 0) from cartes_a where terminal_id is not null),
        'net', (select coalesce(sum(montant), 0) from cartes_v where terminal_id is not null)
             - (select coalesce(sum(montant), 0) from cartes_a where terminal_id is not null),
        'pourboires', (select coalesce(sum(pourboire), 0) from cartes_v where terminal_id is not null)),
      'manuel', jsonb_build_object(
        'nombre', (select coalesce(sum(nombre), 0) from cartes_v where terminal_id is null),
        'ventes', (select coalesce(sum(montant), 0) from cartes_v where terminal_id is null),
        'annulees', (select coalesce(sum(montant), 0) from cartes_a where terminal_id is null),
        'net', (select coalesce(sum(montant), 0) from cartes_v where terminal_id is null)
             - (select coalesce(sum(montant), 0) from cartes_a where terminal_id is null),
        'pourboires', (select coalesce(sum(pourboire), 0) from cartes_v where terminal_id is null)),
      'terminaux', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'terminal_id', c.terminal_id, 'nom', m.nom,
                 'nombre', coalesce(v.nombre, 0),
                 'ventes', coalesce(v.montant, 0),
                 'annulees', coalesce(a.montant, 0),
                 'net', coalesce(v.montant, 0) - coalesce(a.montant, 0),
                 'pourboires', coalesce(v.pourboire, 0))
               order by m.nom, c.terminal_id)
          from cartes_t c
          join public.caisse_tpe_terminaux m on m.id = c.terminal_id
          left join cartes_v v on v.terminal_id = c.terminal_id
          left join cartes_a a on a.terminal_id = c.terminal_id), '[]'::jsonb)),
    'abandons', (
      select jsonb_build_object(
               'tickets', count(*),
               'montant', coalesce(sum((
                 select coalesce(sum(round(l.quantite * l.prix_unitaire, 2)), 0)
                   from public.caisse_lignes l
                  where l.ticket_id = t.id and l.statut <> 'en_attente')), 0))
        from public.caisse_tickets t
       where t.etablissement_id = p_etablissement_id and t.jour_exploitation = p_jour
         and t.numero is null and t.test = false and t.statut = 'annule'),
    'ouverts', (
      select jsonb_build_object(
               'tickets', count(*),
               'montant', coalesce(sum((
                 select coalesce(sum(round(l.quantite * l.prix_unitaire, 2)), 0)
                   from public.caisse_lignes l where l.ticket_id = t.id)), 0))
        from public.caisse_tickets t
       where t.etablissement_id = p_etablissement_id and t.test = false and t.statut = 'ouvert')
  );
$$;

revoke all on function public.caisse_totaux_jour(text, date) from public, anon, authenticated;
