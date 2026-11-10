-- ============================================================================
-- Caisse v5 - qui est a la table : reservation, client de passage ou fiche du
-- fichier clients. Tickets sur la fiche client, corrections par le service,
-- no-show propose (jamais pose seul).
--
--   caisse_tickets : + reservation_id, client_id, couverts, qui. Les tickets
--     d'avant restent a null ; la vente directe au comptoir reste anonyme.
--   caisse_peut_utiliser(etab) : le droit caisse de l'appelant, lu comme le
--     front (ecart de la personne, reglage du role, defauts du code), compte
--     desactive refuse. Interne : appelee par les deux RPC seulement.
--   caisse_ouvrir_ticket : ouvre le ticket d'une table au nom d'une
--     reservation (confirme vers arrive), d'un client de passage ou d'une
--     fiche client (reservation d'origine passage creee, statut arrive, table
--     posee). Double tap = un seul ticket et une seule reservation.
--   caisse_corriger_reservation : la seule ecriture du service sur une
--     reservation. N'ecrit QUE le rattachement du ticket, le nom, les couverts
--     et le statut vers arrive ou no_show (plus l'annulation d'un passage
--     cree par erreur, section 6). Trace au Journal d'activite.
--   Encaissement : la reservation rattachee passe de arrive a parti
--     (declencheur, sans effet tant qu'aucun ticket ne porte de reservation).
--   export_personne / effacer_personne : les tickets suivent la personne.
--
-- Pourquoi des RPC SECURITY DEFINER : la RLS de reservations reserve
-- l'ecriture a user_peut_gerer('previsions', ...). Le role serveur n'y ecrit
-- rien, et aucune policy du module Reservations n'est elargie ici.
--
-- Aucun message ne part vers un client : les seuls envois lies a une
-- reservation vivent dans le front du module Reservations et dans
-- push_nouvelle_resa, qui ne reagit qu'a l'origine en_ligne.
--
-- Lecture des tickets d'un client depuis sa fiche : deja ouverte. La policy
-- caisse_tickets_select (v1) donne la lecture a tout membre de
-- l'etablissement, exactement comme resa_clients_select. Rien a ajouter.
--
-- Migration additive (expand), idempotente, sans aucune donnee ecrite : sans
-- effet au rejeu, y compris apres des tickets crees. Les fonctions de garde
-- v1b a v1d ne sont pas touchees (un declencheur a part porte les colonnes
-- neuves). Rollback en fin de fichier.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. caisse_tickets : qui est a la table
-- ----------------------------------------------------------------------------
-- reservations.id et resa_clients.id sont de type text.
alter table public.caisse_tickets
  add column if not exists reservation_id text references public.reservations(id) on delete set null;
alter table public.caisse_tickets
  add column if not exists client_id text references public.resa_clients(id) on delete set null;
alter table public.caisse_tickets
  add column if not exists couverts int check (couverts is null or couverts between 1 and 99);
alter table public.caisse_tickets
  add column if not exists qui text check (qui is null or qui in ('reservation', 'passage', 'compte'));

create index if not exists idx_caisse_tickets_reservation on public.caisse_tickets(reservation_id);
create index if not exists idx_caisse_tickets_client      on public.caisse_tickets(client_id);

comment on column public.caisse_tickets.reservation_id is 'Caisse v5 : reservation rattachee au ticket. Posee par caisse_ouvrir_ticket et caisse_corriger_reservation seulement.';
comment on column public.caisse_tickets.client_id      is 'Caisse v5 : fiche du fichier clients (resa_clients). Mise a null par effacer_personne : le ticket reste, sans nom.';
comment on column public.caisse_tickets.couverts       is 'Caisse v5 : couverts a la table, copies de la reservation ou saisis a l''ouverture.';
comment on column public.caisse_tickets.qui            is 'Caisse v5 : reservation, passage ou compte (fiche client). Null = ticket d''avant la v5 ou vente directe.';

-- ----------------------------------------------------------------------------
-- 2. Le droit caisse de l'appelant
-- ----------------------------------------------------------------------------
-- Meme regle que le front (permissions.caisse === true dans LegacyModuleHost) :
--   1. compte actif, rattache a l'etablissement ;
--   2. consultant : toujours ;
--   3. ecart de la personne (permissions_utilisateurs, cle caisse) ;
--   4. sinon reglage de son role (permissions, meme cle) ;
--   5. sinon les roles par defaut du code (moduleConfig.js : patron,
--      resp_cuisine, serveur).
-- En plpgsql, rendue dans une variable par les RPC avant toute requete : la
-- garde ne depend pas du planificateur.
create or replace function public.caisse_peut_utiliser(p_etablissement_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     text := auth.uid()::text;
  v_role    text;
  v_actif   boolean;
  v_etabs   text[];
  v_perso   jsonb;
  v_du_role jsonb;
begin
  if v_uid is null or p_etablissement_id is null then
    return false;
  end if;

  select p.role, p.actif, p.etablissement_ids
    into v_role, v_actif, v_etabs
    from public.profiles p
   where p.id = v_uid;
  if not found or v_actif is false or coalesce(v_role, '') = '' then
    return false;
  end if;
  if not coalesce(p_etablissement_id = any(v_etabs), false) then
    return false;
  end if;
  if v_role = 'consultant' then
    return true;
  end if;

  select pu.perms -> 'caisse' into v_perso
    from public.permissions_utilisateurs pu
   where pu.user_id = v_uid;
  if jsonb_typeof(v_perso) = 'boolean' then
    return v_perso::boolean;
  end if;

  select pr.perms -> 'caisse' into v_du_role
    from public.permissions pr
   where pr.role_key = v_role;
  if jsonb_typeof(v_du_role) = 'boolean' then
    return v_du_role::boolean;
  end if;

  return v_role = any(array['patron', 'resp_cuisine', 'serveur']);
end;
$$;

comment on function public.caisse_peut_utiliser(text) is
  'Caisse v5 : droit caisse de l''appelant sur un etablissement (compte actif, ecart personnel, reglage du role, defauts du code). Interne aux RPC caisse.';

revoke all on function public.caisse_peut_utiliser(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Garde des colonnes neuves (declencheur a part, v1b a v1d intactes)
-- ----------------------------------------------------------------------------
-- La RLS de caisse_tickets laisse tout membre de l'etablissement ecrire ses
-- tickets. Sans cette garde, un compte de l'API pourrait pointer un ticket
-- vers la reservation ou la fiche d'une autre maison, ou reecrire qui etait a
-- table apres coup.
--   1. Un compte de l'API (authenticated, anon) ne pose ni ne change jamais
--      reservation_id, couverts ni qui ; sur client_id il ne peut que vider
--      (effacer_personne, SECURITY INVOKER). Les deux RPC passent : dans une
--      fonction SECURITY DEFINER, current_user est le proprietaire.
--   2. Pour tout le monde, un ticket fige (encaisse, annule) garde ses
--      couverts et son qui ; reservation_id et client_id ne peuvent que
--      passer a null (cascade d'une suppression, effacement d'une personne).
--   3. Pour tout le monde, reservation et fiche client appartiennent a
--      l'etablissement du ticket.
create or replace function public.caisse_ticket_garde_client()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.reservation_id is not null or new.client_id is not null
         or new.couverts is not null or new.qui is not null then
        raise exception 'caisse: le client de la table se pose a l''ouverture du ticket'
          using errcode = '42501';
      end if;
    elsif new.reservation_id is distinct from old.reservation_id
       or new.couverts is distinct from old.couverts
       or new.qui is distinct from old.qui
       or (new.client_id is distinct from old.client_id and new.client_id is not null) then
      raise exception 'caisse: le client de la table se corrige depuis le ticket'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.statut <> 'ouvert' then
    if (new.reservation_id is distinct from old.reservation_id and new.reservation_id is not null)
       or (new.client_id is distinct from old.client_id and new.client_id is not null)
       or new.couverts is distinct from old.couverts
       or new.qui is distinct from old.qui then
      raise exception 'caisse: ticket % fige', old.statut;
    end if;
  end if;

  if new.reservation_id is not null and not exists (
       select 1 from public.reservations r
        where r.id = new.reservation_id and r.etablissement_id = new.etablissement_id) then
    raise exception 'caisse: reservation inconnue pour cet etablissement'
      using errcode = '42501';
  end if;
  if new.client_id is not null and not exists (
       select 1 from public.resa_clients c
        where c.id = new.client_id and c.etablissement_id = new.etablissement_id) then
    raise exception 'caisse: fiche client inconnue pour cet etablissement'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.caisse_ticket_garde_client() from public, anon, authenticated;

drop trigger if exists trg_caisse_ticket_garde_client on public.caisse_tickets;
create trigger trg_caisse_ticket_garde_client
  before insert or update of reservation_id, client_id, couverts, qui, etablissement_id
  on public.caisse_tickets
  for each row execute function public.caisse_ticket_garde_client();

-- ----------------------------------------------------------------------------
-- 4. Encaissement : la reservation rattachee passe de arrive a parti
-- ----------------------------------------------------------------------------
-- « parti » n'a aucun effet de bord hors de l'ecran (la table se libere sur
-- le plan de salle du service) : ni message au client, ni changement des
-- couverts prevus. Seul le passage arrive vers parti est pose, et seulement
-- quand plus aucun autre ticket ouvert ne porte la meme reservation (une
-- tablee encaissee en deux fois reste a table jusqu'au dernier ticket).
-- L'encaissement ne doit jamais echouer a cause de la reservation : toute
-- erreur ici devient un avertissement.
create or replace function public.caisse_ticket_cloture_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.statut = 'encaisse' and old.statut = 'ouvert' and new.reservation_id is not null then
    begin
      if not exists (
        select 1 from public.caisse_tickets t
         where t.reservation_id = new.reservation_id
           and t.id <> new.id
           and t.statut = 'ouvert'
      ) then
        update public.reservations
           set statut = 'parti', updated_at = now()
         where id = new.reservation_id
           and etablissement_id = new.etablissement_id
           and statut = 'arrive';
      end if;
    exception when others then
      raise warning 'caisse_ticket_cloture_reservation: reservation % laissee telle quelle : %',
        new.reservation_id, sqlerrm;
    end;
  end if;
  return null;
end;
$$;

revoke all on function public.caisse_ticket_cloture_reservation() from public, anon, authenticated;

drop trigger if exists trg_caisse_ticket_cloture_reservation on public.caisse_tickets;
create trigger trg_caisse_ticket_cloture_reservation
  after update of statut on public.caisse_tickets
  for each row execute function public.caisse_ticket_cloture_reservation();

-- ----------------------------------------------------------------------------
-- 5. RPC caisse_ouvrir_ticket
-- ----------------------------------------------------------------------------
-- Reservation de passage : meme ligne que « Client de passage » de la fiche
-- de table du plan de salle (PlanSalle.jsx, clientDePassage) : date et heure
-- de Zurich, service selon l'horloge (midi avant 15 h, soir ensuite, comme
-- serviceParDefaut), statut arrive, origine passage, table posee dans
-- reservation_tables. Le rapport des reservations la compte donc a part.
--
-- Double tap : verrou consultatif sur (etablissement, table), puis lecture du
-- ticket ouvert de la table. Le second appel attend le premier, trouve son
-- ticket et le rend sans rien creer.
--
-- Une reservation ne se rattache que si elle est du jour (ou de la veille,
-- pour un service qui passe minuit) et attendue ou deja a table. Seul le
-- passage confirme vers arrive est pose ; aucun autre statut n'est touche.
create or replace function public.caisse_ouvrir_ticket(
  p_etablissement_id text,
  p_table_id         text,
  p_qui              text,
  p_reservation_id   text default null,
  p_client_id        text default null,
  p_couverts         int  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok      boolean;
  v_uid     text := auth.uid()::text;
  v_zurich  timestamp := now() at time zone 'Europe/Zurich';
  v_jour    date;
  v_table   public.salle_tables%rowtype;
  v_ticket  public.caisse_tickets%rowtype;
  v_resa    public.reservations%rowtype;
  v_client  public.resa_clients%rowtype;
  v_nom     text;
  v_resa_id text;
  v_client_id text;
begin
  v_ok := public.caisse_peut_utiliser(p_etablissement_id);
  if v_ok is not true then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if p_qui is null or p_qui not in ('reservation', 'passage', 'compte') then
    raise exception 'caisse: choix du client invalide';
  end if;
  if p_table_id is null then
    raise exception 'caisse: table requise (la vente directe reste anonyme)';
  end if;
  v_jour := v_zurich::date;

  select * into v_table
    from public.salle_tables st
   where st.id = p_table_id and st.etablissement_id = p_etablissement_id;
  if not found then
    raise exception 'caisse: table inconnue pour cet etablissement';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('caisse_ouvrir:' || p_etablissement_id || ':' || p_table_id, 0));

  select * into v_ticket
    from public.caisse_tickets t
   where t.etablissement_id = p_etablissement_id
     and t.table_id = p_table_id
     and t.statut = 'ouvert'
   order by t.created_at
   limit 1;
  if found then
    return jsonb_build_object(
      'ticket_id', v_ticket.id,
      'reservation_id', v_ticket.reservation_id,
      'deja_ouvert', true);
  end if;

  if p_qui = 'reservation' then
    select * into v_resa
      from public.reservations r
     where r.id = p_reservation_id and r.etablissement_id = p_etablissement_id
       for update;
    if not found then
      raise exception 'caisse: reservation introuvable';
    end if;
    if v_resa.date_service < v_jour - 1 or v_resa.date_service > v_jour then
      raise exception 'caisse: reservation d''un autre jour';
    end if;
    if v_resa.statut not in ('confirme', 'arrive') then
      raise exception 'caisse: cette reservation n''est pas attendue';
    end if;

    select c.id into v_client_id
      from public.resa_clients c
     where c.id = v_resa.client_id and c.etablissement_id = p_etablissement_id;

    insert into public.caisse_tickets
      (etablissement_id, table_id, ouvert_par, reservation_id, client_id, couverts, qui)
    values
      (p_etablissement_id, p_table_id, v_uid, v_resa.id, v_client_id,
       least(v_resa.nb_couverts, 99), 'reservation')
    returning * into v_ticket;

    update public.reservations
       set statut = 'arrive', updated_at = now()
     where id = v_resa.id and statut = 'confirme';

    return jsonb_build_object(
      'ticket_id', v_ticket.id,
      'reservation_id', v_resa.id,
      'deja_ouvert', false);
  end if;

  -- Client de passage, ou fiche du fichier clients : couverts obligatoires.
  if p_couverts is null or p_couverts < 1 or p_couverts > 99 then
    raise exception 'caisse: nombre de couverts invalide';
  end if;

  if p_qui = 'compte' then
    select * into v_client
      from public.resa_clients c
     where c.id = p_client_id
       and c.etablissement_id = p_etablissement_id
       and not c.archive;
    if not found then
      raise exception 'caisse: fiche client introuvable';
    end if;
    v_client_id := v_client.id;
    v_nom := coalesce(nullif(btrim(concat_ws(' ', v_client.prenom, v_client.nom)), ''), 'Client');
  else
    v_client_id := null;
    v_nom := 'Passage, '
      || case when v_table.forme = 'tabouret' then 'place de bar ' else 'table ' end
      || v_table.nom;
  end if;

  insert into public.reservations
    (etablissement_id, date_service, service, heure_arrivee, nb_couverts, nom,
     est_groupe, statut, origine, client_id, created_by)
  values
    (p_etablissement_id, v_jour,
     case when v_zurich::time < time '15:00' then 'midi' else 'soir' end,
     date_trunc('minute', v_zurich)::time,
     p_couverts, v_nom, false, 'arrive', 'passage', v_client_id, v_uid)
  returning id into v_resa_id;

  insert into public.reservation_tables (reservation_id, table_id)
  values (v_resa_id, p_table_id);

  insert into public.caisse_tickets
    (etablissement_id, table_id, ouvert_par, reservation_id, client_id, couverts, qui)
  values
    (p_etablissement_id, p_table_id, v_uid, v_resa_id, v_client_id, p_couverts, p_qui)
  returning * into v_ticket;

  return jsonb_build_object(
    'ticket_id', v_ticket.id,
    'reservation_id', v_resa_id,
    'deja_ouvert', false);
end;
$$;

comment on function public.caisse_ouvrir_ticket(text, text, text, text, text, int) is
  'Caisse v5 : ouvre le ticket d''une table au nom d''une reservation (confirme vers arrive), d''un client de passage ou d''une fiche client. Idempotente au double tap.';

revoke execute on function public.caisse_ouvrir_ticket(text, text, text, text, text, int) from public, anon, authenticated;
grant  execute on function public.caisse_ouvrir_ticket(text, text, text, text, text, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC caisse_corriger_reservation
-- ----------------------------------------------------------------------------
-- La seule ecriture du service sur une reservation, depuis la caisse. Elle
-- n'ecrit QUE :
--   - le rattachement du ticket (p_ticket_id + une autre reservation) ;
--   - le nom et les couverts de la reservation ;
--   - son statut, vers arrive (depuis confirme ou no_show) ou vers no_show
--     (depuis confirme ou arrive). demande, annule et parti ne bougent pas.
-- Elle ne supprime rien et ne touche ni au lien de groupe ni aux autres
-- colonnes. Une reservation de groupe garde son nom et ses couverts (le
-- module Groupes les reecrit). Reservation du jour ou de la veille seulement.
-- Sans ticket (liste « Reservations sans ticket ») : p_ticket_id null.
--
-- Une seule exception, relevee par la revue SQL du lot : quand le ticket
-- quitte une reservation de passage que la caisse avait creee pour lui
-- (client de passage ou fiche client choisis par erreur), ce passage est
-- annule. Sans cela ses couverts resteraient comptes en plus de ceux de la
-- vraie reservation. Rien n'est supprime, et seul un passage encore a table,
-- sans autre ticket ouvert, est concerne.
--
-- Chaque correction laisse une ligne au Journal d'activite (module caisse).
-- Le journal ne recoit aucun nom de client : le libelle porte la date et
-- l'heure de la reservation, et une correction de nom y est notee sans les
-- valeurs. Il survit donc a l'effacement d'une personne sans la nommer.
create or replace function public.caisse_corriger_reservation(
  p_etablissement_id text,
  p_reservation_id   text,
  p_ticket_id        uuid default null,
  p_nom              text default null,
  p_couverts         int  default null,
  p_statut           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok        boolean;
  v_uid       text := auth.uid()::text;
  v_jour      date := (now() at time zone 'Europe/Zurich')::date;
  v_ticket    public.caisse_tickets%rowtype;
  v_resa      public.reservations%rowtype;
  v_apres     public.reservations%rowtype;
  v_nom       text := nullif(btrim(coalesce(p_nom, '')), '');
  v_statut    text := p_statut;
  v_rattache  boolean := false;
  v_ch_nom    boolean := false;
  v_ch_couv   boolean := false;
  v_ch_ticket boolean := false;
  v_annule    boolean := false;
  v_ancienne  text;
  v_client_id text;
  v_cols      text[] := array[]::text[];
  v_avant     jsonb := '{}'::jsonb;
  v_apres_j   jsonb := '{}'::jsonb;
  v_acteur_nom  text;
  v_acteur_role text;
begin
  v_ok := public.caisse_peut_utiliser(p_etablissement_id);
  if v_ok is not true then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if p_reservation_id is null then
    raise exception 'caisse: reservation requise';
  end if;
  if v_statut is not null and v_statut not in ('arrive', 'no_show') then
    raise exception 'caisse: ce statut ne se pose pas depuis la caisse';
  end if;
  if p_nom is not null and v_nom is null then
    raise exception 'caisse: le nom ne peut pas etre vide';
  end if;
  if v_nom is not null and char_length(v_nom) > 120 then
    raise exception 'caisse: nom trop long';
  end if;
  if p_couverts is not null and (p_couverts < 1 or p_couverts > 99) then
    raise exception 'caisse: nombre de couverts invalide';
  end if;

  if p_ticket_id is not null then
    select * into v_ticket
      from public.caisse_tickets t
     where t.id = p_ticket_id and t.etablissement_id = p_etablissement_id
       for update;
    if not found then
      raise exception 'caisse: ticket introuvable';
    end if;
    if v_ticket.statut <> 'ouvert' then
      raise exception 'caisse: ticket % fige', v_ticket.statut;
    end if;
  end if;

  select * into v_resa
    from public.reservations r
   where r.id = p_reservation_id and r.etablissement_id = p_etablissement_id
     for update;
  if not found then
    raise exception 'caisse: reservation introuvable';
  end if;
  if v_resa.date_service < v_jour - 1 or v_resa.date_service > v_jour then
    raise exception 'caisse: reservation d''un autre jour';
  end if;
  if v_resa.groupe_evenement_id is not null and (v_nom is not null or p_couverts is not null) then
    raise exception 'caisse: reservation de groupe, nom et couverts se corrigent dans Groupes';
  end if;

  -- Rattachement du ticket a une autre reservation : memes conditions qu'a
  -- l'ouverture, et meme effet (confirme vers arrive).
  if p_ticket_id is not null and v_ticket.reservation_id is distinct from v_resa.id then
    if v_resa.statut not in ('confirme', 'arrive') then
      raise exception 'caisse: cette reservation n''est pas attendue';
    end if;
    v_rattache := true;
    if v_statut is null and v_resa.statut = 'confirme' then
      v_statut := 'arrive';
    end if;
  end if;

  if v_statut is not null and v_statut <> v_resa.statut then
    if not ((v_statut = 'arrive'  and v_resa.statut in ('confirme', 'no_show'))
         or (v_statut = 'no_show' and v_resa.statut in ('confirme', 'arrive'))) then
      raise exception 'caisse: le statut de cette reservation ne se change pas ici';
    end if;
  else
    v_statut := null;
  end if;

  v_ch_nom  := v_nom is not null and v_nom is distinct from v_resa.nom;
  v_ch_couv := p_couverts is not null and p_couverts is distinct from v_resa.nb_couverts;

  if v_ch_nom or v_ch_couv or v_statut is not null then
    update public.reservations r
       set nom         = case when v_ch_nom  then v_nom      else r.nom end,
           nb_couverts = case when v_ch_couv then p_couverts else r.nb_couverts end,
           statut      = coalesce(v_statut, r.statut),
           updated_at  = now()
     where r.id = v_resa.id
    returning * into v_apres;
    -- Relecture : une ecriture reecrite par un declencheur n'est pas un succes.
    if v_apres.id is null
       or (v_ch_nom  and v_apres.nom is distinct from v_nom)
       or (v_ch_couv and v_apres.nb_couverts is distinct from p_couverts)
       or (v_statut is not null and v_apres.statut is distinct from v_statut) then
      raise exception 'caisse: correction non enregistree';
    end if;
  else
    v_apres := v_resa;
  end if;

  if p_ticket_id is not null then
    if v_rattache then
      v_ancienne := v_ticket.reservation_id;
      if v_ancienne is not null and v_ticket.qui in ('passage', 'compte')
         and not exists (
           select 1 from public.caisse_tickets t
            where t.reservation_id = v_ancienne
              and t.id <> v_ticket.id
              and t.statut = 'ouvert') then
        update public.reservations
           set statut = 'annule', updated_at = now()
         where id = v_ancienne
           and etablissement_id = p_etablissement_id
           and origine = 'passage'
           and statut = 'arrive';
        v_annule := found;
      end if;

      select c.id into v_client_id
        from public.resa_clients c
       where c.id = v_apres.client_id and c.etablissement_id = p_etablissement_id;
      update public.caisse_tickets t
         set reservation_id = v_apres.id,
             client_id      = v_client_id,
             couverts       = least(v_apres.nb_couverts, 99),
             qui            = case
                                when v_apres.origine = 'passage' and v_client_id is not null then 'compte'
                                when v_apres.origine = 'passage' then 'passage'
                                else 'reservation'
                              end
       where t.id = v_ticket.id;
    elsif p_couverts is not null and p_couverts is distinct from v_ticket.couverts then
      update public.caisse_tickets t
         set couverts = p_couverts
       where t.id = v_ticket.id;
      v_ch_ticket := true;
    end if;
  end if;

  if v_rattache then
    v_cols    := array_append(v_cols, 'rattachement');
    v_avant   := v_avant   || jsonb_build_object('rattachement', v_ticket.reservation_id);
    v_apres_j := v_apres_j || jsonb_build_object('rattachement', v_apres.id);
  end if;
  if v_annule then
    v_cols    := array_append(v_cols, 'passage_annule');
    v_avant   := v_avant   || jsonb_build_object('passage_annule', 'arrive');
    v_apres_j := v_apres_j || jsonb_build_object('passage_annule', 'annule');
  end if;
  if v_ch_ticket and not v_ch_couv then
    v_cols    := array_append(v_cols, 'couverts_ticket');
    v_avant   := v_avant   || jsonb_build_object('couverts_ticket', v_ticket.couverts);
    v_apres_j := v_apres_j || jsonb_build_object('couverts_ticket', p_couverts);
  end if;
  if v_ch_nom then
    v_cols := array_append(v_cols, 'nom');
  end if;
  if v_ch_couv then
    v_cols    := array_append(v_cols, 'nb_couverts');
    v_avant   := v_avant   || jsonb_build_object('nb_couverts', v_resa.nb_couverts);
    v_apres_j := v_apres_j || jsonb_build_object('nb_couverts', v_apres.nb_couverts);
  end if;
  if v_statut is not null then
    v_cols    := array_append(v_cols, 'statut');
    v_avant   := v_avant   || jsonb_build_object('statut', v_resa.statut);
    v_apres_j := v_apres_j || jsonb_build_object('statut', v_apres.statut);
  end if;

  if cardinality(v_cols) = 0 then
    return jsonb_build_object('modifie', false, 'reservation_id', v_resa.id, 'statut', v_resa.statut);
  end if;

  select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.role
    into v_acteur_nom, v_acteur_role
    from public.profiles p
   where p.id = v_uid;

  insert into public.journal_activite
    (etablissement_id, acteur_id, acteur_nom, acteur_role, module, operation,
     ligne_id, libelle, colonnes_modifiees, avant, apres)
  values
    (p_etablissement_id, v_uid, v_acteur_nom, v_acteur_role, 'caisse', 'UPDATE',
     v_resa.id,
     'Réservation du ' || to_char(v_resa.date_service, 'DD.MM.YYYY')
       || ' à ' || to_char(v_resa.heure_arrivee, 'HH24:MI'),
     v_cols, v_avant, v_apres_j);

  return jsonb_build_object(
    'modifie', true,
    'reservation_id', v_apres.id,
    'statut', v_apres.statut,
    'colonnes', to_jsonb(v_cols));
end;
$$;

comment on function public.caisse_corriger_reservation(text, text, uuid, text, int, text) is
  'Caisse v5 : correction d''une reservation par le service (rattachement du ticket, nom, couverts, statut vers arrive ou no_show). Trace au Journal d''activite.';

revoke execute on function public.caisse_corriger_reservation(text, text, uuid, text, int, text) from public, anon, authenticated;
grant  execute on function public.caisse_corriger_reservation(text, text, uuid, text, int, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Export et effacement d'une personne : les tickets suivent
-- ----------------------------------------------------------------------------
-- Les deux fonctions de 20261104_export_effacement_personne_2.sql, reprises
-- en entier (create or replace), a deux ajouts pres cote reservation :
--   - l'export joint les tickets du client (rattaches a sa fiche ou a l'une
--     de ses reservations), lignes et paiements compris ; les identifiants
--     du personnel (ouvert_par, encaisse_par) n'en sortent pas ;
--   - l'effacement met client_id a null sur ses tickets : le ticket reste
--     pour la comptabilite, sans nom. Un effacement partiel est refuse.
create or replace function public.export_personne(p_type text, p_client_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_profil record;
  v_etab text;
  v_res jsonb;
begin
  -- Garde commune aux deux fonctions (D4 en fixe deux, pas trois) : appelant
  -- actif, consultant ou patron, client rattache a un de ses etablissements.
  select role, actif, etablissement_ids into v_profil
  from profiles where id = auth.uid()::text;
  if not found or v_profil.actif is distinct from true
     or v_profil.role not in ('consultant', 'patron') then
    raise exception 'ACCES_REFUSE';
  end if;

  if p_type = 'spa' then
    select etablissement_id into v_etab from spa_clients where id = p_client_id;
  elsif p_type = 'resa' then
    select etablissement_id into v_etab from resa_clients where id = p_client_id;
  else
    raise exception 'TYPE_INCONNU';
  end if;
  if v_etab is null or not coalesce(v_etab = any(v_profil.etablissement_ids), false) then
    raise exception 'CLIENT_INTROUVABLE';
  end if;

  -- Le jeton de desinscription (un secret) et les cles techniques derivees du
  -- contact ne sortent pas de la base.
  if p_type = 'spa' then
    select jsonb_build_object(
      'type', 'client_spa',
      'exporte_le', now(),
      'client', to_jsonb(c) - 'desinscription_token',
      'rendez_vous', coalesce((select jsonb_agg(to_jsonb(r) order by r.date_rdv, r.heure_debut)
        from spa_reservations r where r.client_id = c.id), '[]'::jsonb),
      'seances', coalesce((select jsonb_agg(to_jsonb(s) order by s.date_seance)
        from spa_seances s where s.client_id = c.id), '[]'::jsonb),
      'bons', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at)
        from spa_bons b where b.client_id = c.id), '[]'::jsonb),
      'envois', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at)
        from spa_envois e where e.client_id = c.id), '[]'::jsonb)
    ) into v_res
    from spa_clients c where c.id = p_client_id;
  else
    select jsonb_build_object(
      'type', 'client_reservation',
      'exporte_le', now(),
      'client', to_jsonb(c) - 'desinscription_token' - 'email_cle' - 'telephone_cle',
      'reservations', coalesce((select jsonb_agg(
          (to_jsonb(r) || jsonb_build_object('tags',
            coalesce((select jsonb_agg(jsonb_build_object('type', t.type_tag, 'valeur', t.valeur, 'libre', t.libre))
              from reservation_tags t where t.reservation_id = r.id), '[]'::jsonb)))
          order by r.date_service, r.heure_arrivee)
        from reservations r where r.client_id = c.id), '[]'::jsonb),
      'tickets', coalesce((select jsonb_agg(
          ((to_jsonb(k) - 'ouvert_par') || jsonb_build_object(
            'lignes', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at)
              from caisse_lignes l where l.ticket_id = k.id), '[]'::jsonb),
            'paiements', coalesce((select jsonb_agg((to_jsonb(p) - 'encaisse_par') order by p.created_at)
              from caisse_paiements p where p.ticket_id = k.id), '[]'::jsonb)))
          order by k.created_at)
        from caisse_tickets k
        where k.client_id = c.id
           or k.reservation_id in (select r2.id from reservations r2 where r2.client_id = c.id)), '[]'::jsonb),
      'sejours', coalesce((select jsonb_agg(to_jsonb(s) order by s.arrivee)
        from sejours s where s.client_id = c.id), '[]'::jsonb)
    ) into v_res
    from resa_clients c where c.id = p_client_id;
  end if;

  return v_res;
end;
$fn$;

comment on function public.export_personne(text, text) is
  'SI3 D4 : export JSON des donnees d''un client spa ou de reservation, tags de reservation et tickets de caisse compris. Consultant et patron de l''etablissement, compte actif.';

create or replace function public.effacer_personne(p_type text, p_client_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_profil record;
  v_etab text;
  n_client integer;
  n_lignes integer;
  n_attendu integer;
  v_res jsonb;
begin
  select role, actif, etablissement_ids into v_profil
  from profiles where id = auth.uid()::text;
  if not found or v_profil.actif is distinct from true
     or v_profil.role not in ('consultant', 'patron') then
    raise exception 'ACCES_REFUSE';
  end if;

  if p_type = 'spa' then
    select etablissement_id into v_etab from spa_clients where id = p_client_id;
  elsif p_type = 'resa' then
    select etablissement_id into v_etab from resa_clients where id = p_client_id;
  else
    raise exception 'TYPE_INCONNU';
  end if;
  if v_etab is null or not coalesce(v_etab = any(v_profil.etablissement_ids), false) then
    raise exception 'CLIENT_INTROUVABLE';
  end if;

  if p_type = 'spa' then
    -- Le trigger spa_clients_avant_ecriture fige desinscription_token : le
    -- jeton reste, mais l'e-mail vide rend le lien de desinscription inoperant.
    update spa_clients set
      prenom = '',
      nom = 'Client effacé',
      email = null, telephone = null, date_naissance = null, adresse = null,
      notes_sante = null, preferences = null, notes = null,
      consentement_marketing = false, consentement_at = null,
      archive = true, updated_at = now()
    where id = p_client_id;
    get diagnostics n_client = row_count;
    if n_client <> 1 then
      raise exception 'EFFACEMENT_INCOMPLET';
    end if;
    v_res = jsonb_build_object('type', 'client_spa', 'client', n_client);

    update spa_reservations set notes = null, updated_at = now()
    where client_id = p_client_id and notes is not null;
    get diagnostics n_lignes = row_count;
    v_res = v_res || jsonb_build_object('rendez_vous', n_lignes);

    update spa_seances set
      observations = null, ressenti = null, recommandations = null, updated_at = now()
    where client_id = p_client_id
      and (observations is not null or ressenti is not null or recommandations is not null);
    get diagnostics n_lignes = row_count;
    v_res = v_res || jsonb_build_object('seances', n_lignes);

    -- spa_bons_avant_maj fige le message : le drapeau de transaction, pose ici
    -- seulement, l'autorise a passer. Remis a vide aussitot apres.
    perform set_config('app.effacement_personne', 'on', true);
    update spa_bons set message = null
    where client_id = p_client_id and message is not null;
    get diagnostics n_lignes = row_count;
    perform set_config('app.effacement_personne', '', true);
    v_res = v_res || jsonb_build_object('bons', n_lignes);

    update spa_envois set email = null, erreur = null
    where client_id = p_client_id and (email is not null or erreur is not null);
    get diagnostics n_lignes = row_count;
    v_res = v_res || jsonb_build_object('envois', n_lignes);
  else
    update resa_clients set
      prenom = '',
      nom = 'Client effacé',
      email = null, telephone = null, date_naissance = null,
      allergies = null, preferences = null, notes = null,
      consentement_marketing = false, consentement_at = null, consentement_source = null,
      -- desinscription_token est NOT NULL : on le fait tourner, les anciens liens meurent
      desinscrit_at = null, desinscription_token = gen_random_uuid(),
      lightspeed_customer_id = null,
      -- email_cle et telephone_cle sont generees depuis email et telephone : elles retombent a null d'elles-memes
      archive = true, updated_at = now()
    where id = p_client_id;
    get diagnostics n_client = row_count;
    if n_client <> 1 then
      raise exception 'EFFACEMENT_INCOMPLET';
    end if;
    v_res = jsonb_build_object('type', 'client_reservation', 'client', n_client);

    -- La RLS de reservations, de reservation_tags et de sejours exige un droit
    -- (previsions, hebergement) que l'appelant peut ne pas avoir : un
    -- effacement partiel silencieux est refuse, l'exception annule tout.
    select count(*) into n_attendu from reservations where client_id = p_client_id;
    update reservations set
      nom = 'Client effacé',
      telephone = null, email = null, notes_libres = null, updated_at = now()
    where client_id = p_client_id;
    get diagnostics n_lignes = row_count;
    if n_lignes <> n_attendu then
      raise exception 'EFFACEMENT_INCOMPLET';
    end if;
    v_res = v_res || jsonb_build_object('reservations', n_lignes);

    -- Tags des reservations du client : supprimes, sauf le tag occasion ferme,
    -- seul tag sans donnee personnelle (il reste pour les statistiques).
    select count(*) into n_attendu from reservation_tags t
    where t.reservation_id in (select id from reservations where client_id = p_client_id)
      and not (t.type_tag = 'occasion' and not t.libre);
    delete from reservation_tags t
    where t.reservation_id in (select id from reservations where client_id = p_client_id)
      and not (t.type_tag = 'occasion' and not t.libre);
    get diagnostics n_lignes = row_count;
    if n_lignes <> n_attendu then
      raise exception 'EFFACEMENT_INCOMPLET';
    end if;
    v_res = v_res || jsonb_build_object('tags', n_lignes);

    -- Tickets de caisse (v5) : le ticket reste, piece de vente, mais ne
    -- designe plus la personne. Le decompte et la relecture refusent un
    -- effacement partiel (ligne invisible sous RLS, ou valeur laissee en place).
    select count(*) into n_attendu from caisse_tickets where client_id = p_client_id;
    update caisse_tickets set client_id = null where client_id = p_client_id;
    get diagnostics n_lignes = row_count;
    if n_lignes <> n_attendu
       or exists (select 1 from caisse_tickets where client_id = p_client_id) then
      raise exception 'EFFACEMENT_INCOMPLET';
    end if;
    v_res = v_res || jsonb_build_object('tickets', n_lignes);

    select count(*) into n_attendu from sejours where client_id = p_client_id;
    update sejours set
      nom_hote = 'Client effacé',
      notes = null, demandes_speciales = null, updated_at = now()
    where client_id = p_client_id;
    get diagnostics n_lignes = row_count;
    if n_lignes <> n_attendu then
      raise exception 'EFFACEMENT_INCOMPLET';
    end if;
    v_res = v_res || jsonb_build_object('sejours', n_lignes);
  end if;

  return v_res;
end;
$fn$;

comment on function public.effacer_personne(text, text) is
  'SI3 D5 : anonymise un client spa ou de reservation (nom remplace, contact, notes, sante et tags de sante vides, tickets de caisse detaches). Les lignes restent.';

-- ============================================================================
-- ROLLBACK (a executer manuellement si besoin, front v5 retire d'abord) :
--
--   -- rejouer 20261104_export_effacement_personne_2.sql (export_personne et
--   -- effacer_personne sans les tickets)
--   drop function if exists public.caisse_corriger_reservation(text, text, uuid, text, int, text);
--   drop function if exists public.caisse_ouvrir_ticket(text, text, text, text, text, int);
--   drop trigger if exists trg_caisse_ticket_cloture_reservation on public.caisse_tickets;
--   drop function if exists public.caisse_ticket_cloture_reservation();
--   drop trigger if exists trg_caisse_ticket_garde_client on public.caisse_tickets;
--   drop function if exists public.caisse_ticket_garde_client();
--   drop function if exists public.caisse_peut_utiliser(text);
--   drop index if exists public.idx_caisse_tickets_client;
--   drop index if exists public.idx_caisse_tickets_reservation;
--   alter table public.caisse_tickets drop column if exists qui;
--   alter table public.caisse_tickets drop column if exists couverts;
--   alter table public.caisse_tickets drop column if exists client_id;
--   alter table public.caisse_tickets drop column if exists reservation_id;
--   (les reservations de passage creees par la caisse et les lignes du
--   journal restent : ce sont des reservations et des traces ordinaires)
-- ============================================================================
