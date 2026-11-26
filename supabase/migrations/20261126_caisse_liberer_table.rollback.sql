-- ============================================================================
-- Rollback de 20261126_caisse_liberer_table.sql
--
-- À jouer après le retour du front, jamais avant : le front de la libération
-- appelle caisse_corriger_reservation avec p_statut = 'parti', que la
-- définition d'avant refuse (« ce statut ne se pose pas depuis la caisse »).
-- Remet la fonction dans son texte de 20261110_caisse_v5.sql (md5 du corps
-- a9b5bd293bc154ddd23ea16c2da26fcc), même signature. Les réservations déjà
-- passées à parti par la caisse le restent : parti est un statut que
-- l'encaissement pose aussi, et la définition d'avant le lit sans erreur.
-- ============================================================================

set local lock_timeout = '3s';

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
