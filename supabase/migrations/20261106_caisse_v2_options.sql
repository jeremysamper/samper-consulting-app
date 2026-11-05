-- ════════════════════════════════════════════════════════════════════════════
-- Caisse v2 - parametres par ligne (cuissons, « sans ... », messages).
--
-- caisse_lignes.options : jsonb, tableau d'options
--   { type: 'cuisson' | 'sans' | 'message', valeur: text, cible: 'cuisine' | 'bar' | null }
-- La colonne note reste lue (retro-compatibilite), plus alimentee par le front.
--
-- caisse_envoyer_bon mappe les options vers kds_order_items.modifiers
-- ({name, quantity: 1}, format que le KDS affiche deja sous le plat) :
--   cuisson  -> « saignant »
--   sans     -> « sans gluten »
--   message  -> « verre a part », prefixe « bar : » quand la cible est le bar
-- puis la note heritee en dernier. Idempotence, verrou du ticket, cles
-- caisse: inchanges (v1 a v1d).
--
-- caisse_ligne_garde : la liste des champs figes d'une ligne envoyee recoit
-- options (le bon est en cuisine, ses parametres ne bougent plus hors
-- direction) ; tout le reste de la garde v1d est repris a l'identique.
--
-- Migration additive (expand) : le front v1 deploye ignore la colonne (defaut
-- '[]'), le front v2 la lit. Idempotente, rejouable sans effet. Rollback :
--   alter table public.caisse_lignes drop column if exists options;
--   puis rejouer la section 7 de 20261105_caisse_v1.sql (RPC) et
--   20261105_caisse_v1d_cascade_fail_closed.sql (garde).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.caisse_lignes
  add column if not exists options jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'caisse_lignes_options_tableau') then
    alter table public.caisse_lignes
      add constraint caisse_lignes_options_tableau check (jsonb_typeof(options) = 'array');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC : options mappees vers les modifiers du KDS
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.caisse_envoyer_bon(p_ticket_id uuid, p_suite int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket    public.caisse_tickets%rowtype;
  v_table_nom text;
  v_order_id  uuid;
  v_n         int;
  v_now       timestamptz := now();
begin
  if p_suite is null or p_suite < 1 or p_suite > 9 then
    raise exception 'caisse_envoyer_bon: suite invalide';
  end if;

  select * into v_ticket from public.caisse_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'caisse_envoyer_bon: ticket introuvable';
  end if;
  if not user_can_access_etab(v_ticket.etablissement_id) then
    raise exception 'caisse_envoyer_bon: acces refuse';
  end if;
  if v_ticket.statut <> 'ouvert' then
    raise exception 'caisse_envoyer_bon: ticket non ouvert';
  end if;

  if not exists (
    select 1 from public.caisse_lignes
    where ticket_id = p_ticket_id and suite = p_suite and statut = 'en_attente'
  ) then
    return jsonb_build_object('bon_id', null, 'lignes', 0);
  end if;

  select st.nom into v_table_nom
  from public.salle_tables st
  where st.id = v_ticket.table_id
    and st.etablissement_id = v_ticket.etablissement_id;

  insert into public.kds_orders (etablissement_id, ls_check_uuid, table_no, opened_at, status)
  values (
    v_ticket.etablissement_id,
    'caisse:' || p_ticket_id || ':' || p_suite || ':' || md5(v_now::text || p_ticket_id::text),
    coalesce(v_table_nom, 'Direct'),
    v_now,
    'open'
  )
  returning id into v_order_id;

  insert into public.kds_order_items (kds_order_id, ls_line_key, nom, qty, modifiers, fired_at)
  select
    v_order_id,
    'caisse:' || l.id,
    l.libelle,
    l.quantite,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'name',
        case o->>'type'
          when 'sans'    then 'sans ' || (o->>'valeur')
          when 'message' then case when o->>'cible' = 'bar'
                                then 'bar : ' || (o->>'valeur')
                                else (o->>'valeur') end
          else (o->>'valeur')
        end,
        'quantity', 1))
      from jsonb_array_elements(l.options) o
      where nullif(trim(o->>'valeur'), '') is not null
    ), '[]'::jsonb)
    || case when nullif(trim(l.note), '') is not null
      then jsonb_build_array(jsonb_build_object('name', l.note, 'quantity', 1))
      else '[]'::jsonb
    end,
    v_now
  from public.caisse_lignes l
  where l.ticket_id = p_ticket_id and l.suite = p_suite and l.statut = 'en_attente'
  on conflict (ls_line_key) do nothing;

  update public.caisse_lignes
     set statut = 'envoye', envoye_at = v_now
   where ticket_id = p_ticket_id and suite = p_suite and statut = 'en_attente';
  get diagnostics v_n = row_count;

  return jsonb_build_object('bon_id', v_order_id, 'lignes', v_n);
end;
$$;

revoke execute on function public.caisse_envoyer_bon(uuid, int) from public, anon;
grant  execute on function public.caisse_envoyer_bon(uuid, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Garde des lignes : options rejoint les champs figes d'une ligne envoyee
-- (corps v1d repris a l'identique pour le reste)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.caisse_ligne_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_statut     text;
  v_statut_new text;
begin
  select statut into v_statut from public.caisse_tickets
   where id = coalesce(old.ticket_id, new.ticket_id) for update;

  if v_statut is null then
    if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
    raise exception 'caisse: ticket introuvable';
  end if;

  if tg_op = 'DELETE' then
    if v_statut <> 'ouvert' then
      raise exception 'caisse: ticket fige, lignes comprises';
    end if;
    if old.statut <> 'en_attente'
       and not (current_user_role() = any(array['consultant','patron'])) then
      raise exception 'caisse: ligne deja envoyee (retrait par la direction seulement)';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if v_statut <> 'ouvert' then
      raise exception 'caisse: le ticket n''est pas ouvert';
    end if;
    if new.statut <> 'en_attente' then
      raise exception 'caisse: une ligne nait en attente';
    end if;
    return new;
  end if;

  if v_statut <> 'ouvert' then
    raise exception 'caisse: ticket fige, lignes comprises';
  end if;
  if new.ticket_id is distinct from old.ticket_id then
    select statut into v_statut_new from public.caisse_tickets
     where id = new.ticket_id for update;
    if v_statut_new is distinct from 'ouvert' then
      raise exception 'caisse: fusion vers un ticket non ouvert';
    end if;
  end if;

  if old.statut <> 'en_attente' then
    if new.plat_id is distinct from old.plat_id
       or new.libelle <> old.libelle
       or new.quantite <> old.quantite
       or new.prix_unitaire <> old.prix_unitaire
       or new.suite <> old.suite
       or new.note is distinct from old.note
       or new.options is distinct from old.options
       or new.statut not in ('envoye','servi') then
      if not (current_user_role() = any(array['consultant','patron'])) then
        raise exception 'caisse: ligne deja envoyee (correction par la direction seulement)';
      end if;
    end if;
  end if;

  return new;
end;
$$;
