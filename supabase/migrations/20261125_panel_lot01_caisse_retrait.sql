-- ============================================================================
-- Lot 01 du panel (25.11.2026) : vente à emporter et commande d'avance à la
-- Caisse. Un ticket sans table porte un nom saisi au comptoir, une heure
-- promise et un numéro de retrait du jour, posé au premier envoi en cuisine.
--
-- Migration additive et idempotente (expand seul). Le front en production
-- n'envoie aucune colonne neuve et lit * sur les tickets : il marche avant et
-- après. Seul effet visible sans le front neuf : le bon d'une vente directe
-- dit « Retrait 12 » au lieu de « Direct ».
--
-- Ne touche pas au scellement : caisse_contenu_ticket, caisse_sceau,
-- caisse_encaisser et caisse_ticket_garde_v7 restent tels quels. Les colonnes
-- neuves n'entrent ni dans l'empreinte ni dans les rapports.
--
-- Le nom est un texte libre (un prénom suffit), jamais relié à une fiche du
-- fichier clients. Il vit dans caisse_tickets.retrait_nom et, coupé à 40
-- caractères, dans le libellé kds_orders.table_no de chaque bon.
-- Rollback : 20261125_panel_lot01_caisse_retrait.rollback.sql, à jouer après
-- le retour du front, jamais avant.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colonnes du retrait sur caisse_tickets
-- ----------------------------------------------------------------------------
alter table public.caisse_tickets add column if not exists retrait_nom text;
alter table public.caisse_tickets add column if not exists retrait_heure timestamptz;
alter table public.caisse_tickets add column if not exists retrait_numero int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'caisse_tickets_retrait_nom_longueur') then
    alter table public.caisse_tickets add constraint caisse_tickets_retrait_nom_longueur
      check (retrait_nom is null or char_length(retrait_nom) between 1 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caisse_tickets_retrait_numero_positif') then
    alter table public.caisse_tickets add constraint caisse_tickets_retrait_numero_positif
      check (retrait_numero is null or retrait_numero >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caisse_tickets_retrait_numero_hors_test') then
    alter table public.caisse_tickets add constraint caisse_tickets_retrait_numero_hors_test
      check (retrait_numero is null or not test);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Compteur du jour, à part des compteurs du scellement (caisse_compteurs
--    refuse toute autre clé et ne perd jamais de ligne). Écrit par la base
--    seule : RLS activée, aucune policy, aucun droit pour l'API.
-- ----------------------------------------------------------------------------
create table if not exists public.caisse_retraits_jour (
  etablissement_id text not null references public.etablissements(id) on delete cascade,
  jour             date not null,
  dernier          int  not null check (dernier >= 1),
  primary key (etablissement_id, jour)
);

alter table public.caisse_retraits_jour enable row level security;
revoke all on table public.caisse_retraits_jour from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Numéro suivant du jour d'exploitation. Le jour vient de
--    caisse_jour_exploitation (pas de caisse_jour_ouvert, qui s'appelle sous
--    le verrou de la chaîne : un numéro d'appel n'est pas une pièce fiscale).
--    La ligne reste verrouillée jusqu'à la fin de la transaction : un envoi
--    annulé rend son numéro.
-- ----------------------------------------------------------------------------
create or replace function public.caisse_retrait_suivant(p_etablissement_id text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dernier int;
begin
  insert into public.caisse_retraits_jour as c (etablissement_id, jour, dernier)
  values (p_etablissement_id, public.caisse_jour_exploitation(p_etablissement_id, clock_timestamp()), 1)
  on conflict (etablissement_id, jour)
  do update set dernier = c.dernier + 1
  returning c.dernier into v_dernier;
  return v_dernier;
end;
$$;

revoke all on function public.caisse_retrait_suivant(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Libellé du bon d'un ticket de retrait. Même règle que libelleRetrait
--    (src/modules/caisse/retrait.js) : « Retrait 12, Léa, à emporter, 12:30 »,
--    les morceaux absents sautent ; sans numéro le libellé commence par
--    « Direct » ; un ticket de test reste « TEST Direct ». Le nom est coupé à
--    40 caractères, l'heure dite à Zurich. Un libellé ne se réduit jamais à
--    des chiffres seuls (le KDS les lirait comme un numéro de table).
-- ----------------------------------------------------------------------------
create or replace function public.caisse_libelle_retrait(
  p_test boolean, p_numero int, p_nom text, p_a_emporter boolean, p_heure timestamptz
)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_test, false) then 'TEST Direct'
    else concat_ws(', ',
      case when p_numero is not null then 'Retrait ' || p_numero else 'Direct' end,
      nullif(btrim(left(btrim(coalesce(p_nom, '')), 40)), ''),
      case when coalesce(p_a_emporter, false) then 'à emporter' end,
      to_char(p_heure at time zone 'Europe/Zurich', 'HH24:MI')
    )
  end;
$$;

revoke all on function public.caisse_libelle_retrait(boolean, int, text, boolean, timestamptz) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Garde des colonnes du retrait (déclencheur à part, gardes d'avant
--    intactes). Fonction SECURITY INVOKER : current_user y dit qui écrit, un
--    compte de l'API ou une fonction de la base (caisse_bon_interne tourne en
--    definer). Même règle que la garde v7 pour reconnaître l'API.
--   - le nom est nettoyé (espaces de tête et de fin, vide = nul) ;
--   - un compte de l'API ne pose ni ne change jamais retrait_numero ;
--   - un compte de l'API ne pose pas une heure à plus de 36 heures de now() ;
--   - un compte de l'API ne change plus nom ni heure d'un ticket clos ;
--   - pour tout le monde, un numéro posé ne change plus et ne se retire plus,
--     et sur un ticket clos le nom ne peut que passer à nul (effacement).
-- Son nom la range après _garde_client et avant _garde_test.
-- ----------------------------------------------------------------------------
create or replace function public.caisse_ticket_garde_retrait()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_api boolean := current_user not in ('postgres', 'supabase_admin');
begin
  new.retrait_nom := nullif(btrim(new.retrait_nom), '');

  if v_api then
    if tg_op = 'INSERT' then
      if new.retrait_numero is not null then
        raise exception 'caisse: le numero de retrait ne s''ecrit pas depuis l''ecran'
          using errcode = '42501';
      end if;
    else
      if new.retrait_numero is distinct from old.retrait_numero then
        raise exception 'caisse: le numero de retrait ne s''ecrit pas depuis l''ecran'
          using errcode = '42501';
      end if;
      if old.statut <> 'ouvert'
         and (new.retrait_nom is distinct from old.retrait_nom
              or new.retrait_heure is distinct from old.retrait_heure) then
        raise exception 'caisse: le retrait d''un ticket clos ne se modifie plus'
          using errcode = '42501';
      end if;
    end if;
    if new.retrait_heure is not null
       and (tg_op = 'INSERT' or new.retrait_heure is distinct from old.retrait_heure)
       and abs(extract(epoch from (new.retrait_heure - now()))) > 36 * 3600 then
      raise exception 'caisse: heure de retrait invalide'
        using errcode = '22023';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.retrait_numero is not null and new.retrait_numero is distinct from old.retrait_numero then
      raise exception 'caisse: un numero de retrait pose ne change plus'
        using errcode = '42501';
    end if;
    if old.statut <> 'ouvert'
       and new.retrait_nom is distinct from old.retrait_nom
       and new.retrait_nom is not null then
      raise exception 'caisse: le retrait d''un ticket clos ne se modifie plus'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.caisse_ticket_garde_retrait() from public, anon, authenticated;

drop trigger if exists trg_caisse_ticket_garde_retrait on public.caisse_tickets;
create trigger trg_caisse_ticket_garde_retrait
  before insert or update of retrait_nom, retrait_heure, retrait_numero
  on public.caisse_tickets
  for each row execute function public.caisse_ticket_garde_retrait();

-- ----------------------------------------------------------------------------
-- 6. caisse_bon_interne : le corps de la v6 (20261110_caisse_v6.sql, identique
--    à la production le 25.11.2026), avec deux ajouts.
--   a. Au premier envoi d'un ticket sans table, hors test, qui n'est pas né de
--      la commande par QR (note « Commande QR de … »), le numéro de retrait du
--      jour se pose, sous le FOR UPDATE du ticket : un double toucher trouve
--      le numéro déjà posé. Un numéro posé ne change plus, même si le ticket
--      gagne une table.
--   b. Le bon d'un ticket sans table, hors test, qui porte un numéro, prend
--      le libellé de caisse_libelle_retrait. Tous les autres gardent le
--      libellé d'avant (table, « Direct », « TEST »).
-- Signature, droits et réponse inchangés.
-- ----------------------------------------------------------------------------
create or replace function public.caisse_bon_interne(p_ticket_id uuid, p_suite int, p_appel text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket    public.caisse_tickets%rowtype;
  v_ok        boolean;
  v_kds       boolean := true;
  v_besoin    boolean;
  v_table_nom text;
  v_order_id  uuid;
  v_n         int := 0;
  v_annonces  int := 0;
  v_now       timestamptz := clock_timestamp();
begin
  if p_suite is null or p_suite < 1 or p_suite > 9 then
    raise exception '%: suite invalide', p_appel;
  end if;

  select * into v_ticket from public.caisse_tickets where id = p_ticket_id for update;
  if not found then
    raise exception '%: ticket introuvable', p_appel;
  end if;
  v_ok := user_can_access_etab(v_ticket.etablissement_id);
  if v_ok is not true then
    raise exception '%: acces refuse', p_appel;
  end if;
  if v_ticket.statut <> 'ouvert' then
    raise exception '%: ticket non ouvert', p_appel;
  end if;

  if not exists (
    select 1 from public.caisse_lignes
    where ticket_id = p_ticket_id and suite = p_suite and statut = 'en_attente'
  ) then
    return jsonb_build_object('bon_id', null, 'lignes', 0, 'annonces', 0);
  end if;

  -- Lot 01 : numéro de retrait du jour, au premier envoi d'un ticket sans
  -- table, hors test, qui n'est pas né de la commande par QR.
  if v_ticket.table_id is null and not v_ticket.test and v_ticket.retrait_numero is null
     and coalesce(v_ticket.note, '') not like 'Commande QR de%' then
    update public.caisse_tickets
       set retrait_numero = public.caisse_retrait_suivant(v_ticket.etablissement_id)
     where id = p_ticket_id
     returning retrait_numero into v_ticket.retrait_numero;
  end if;

  if v_ticket.test then
    select coalesce(r.config -> 'tests_en_cuisine' = 'true'::jsonb, false) into v_kds
      from public.caisse_reglages r
     where r.etablissement_id = v_ticket.etablissement_id;
    v_kds := coalesce(v_kds, false);
  end if;

  if v_kds then
    select exists (
      select 1
        from public.caisse_lignes l
        left join public.kds_order_items i on i.ls_line_key = 'caisse:' || l.id
       where l.ticket_id = p_ticket_id and l.suite = p_suite and l.statut = 'en_attente'
         and (i.id is null or i.a_suivre)
    ) into v_besoin;

    if not v_besoin then
      -- Toute la suite a deja ete relancee par la cuisine : pas de bon neuf,
      -- les annonces a venir rejoignent le dernier bon du ticket encore au
      -- passe (un bon termine ou ferme ne s'affiche plus : il n'en recoit pas).
      select o.id into v_order_id
        from public.kds_orders o
       where o.etablissement_id = v_ticket.etablissement_id
         and o.ls_check_uuid like 'caisse:' || p_ticket_id || ':%'
         and o.status = 'open'
         and o.completed_at is null
       order by o.opened_at desc nulls last, o.created_at desc
       limit 1;
    end if;

    if v_order_id is null then
      select st.nom into v_table_nom
        from public.salle_tables st
       where st.id = v_ticket.table_id
         and st.etablissement_id = v_ticket.etablissement_id;

      insert into public.kds_orders (etablissement_id, ls_check_uuid, table_no, opened_at, status)
      values (
        v_ticket.etablissement_id,
        'caisse:' || p_ticket_id || ':' || p_suite || ':' || md5(v_now::text || p_ticket_id::text),
        case
          when v_ticket.table_id is null and not v_ticket.test and v_ticket.retrait_numero is not null
            then public.caisse_libelle_retrait(false, v_ticket.retrait_numero, v_ticket.retrait_nom, v_ticket.a_emporter, v_ticket.retrait_heure)
          else case when v_ticket.test then 'TEST ' else '' end || coalesce(v_table_nom, 'Direct')
        end,
        v_now,
        'open'
      )
      returning id into v_order_id;
    end if;

    -- 1. La suite demandee : items crees, ou liberes s'ils etaient annonces.
    -- Un item libere repart a faire (un item tenu ne se marque pas fait a
    -- l'ecran de la cuisine ; s'il l'a ete par un autre chemin, on l'efface).
    insert into public.kds_order_items as i (kds_order_id, ls_line_key, nom, qty, modifiers, fired_at, a_suivre)
    select
      v_order_id,
      'caisse:' || l.id,
      l.libelle,
      l.quantite,
      public.caisse_modifiers_kds(l.options, l.note),
      v_now,
      false
    from public.caisse_lignes l
    where l.ticket_id = p_ticket_id and l.suite = p_suite and l.statut = 'en_attente'
    on conflict (ls_line_key) do update
       set kds_order_id = excluded.kds_order_id,
           a_suivre     = false,
           fired_at     = excluded.fired_at,
           nom          = excluded.nom,
           qty          = excluded.qty,
           modifiers    = excluded.modifiers,
           bump_status  = 'pending',
           bumped_at    = null,
           bumped_by    = null
     where i.a_suivre;

    -- 2. Les annonces deja faites suivent le dernier bon, encore tenues.
    update public.kds_order_items i
       set kds_order_id = v_order_id
      from public.caisse_lignes l
     where l.ticket_id = p_ticket_id
       and l.suite <> p_suite
       and l.statut = 'en_attente'
       and l.annonce_at is not null
       and i.ls_line_key = 'caisse:' || l.id
       and i.a_suivre
       and i.kds_order_id <> v_order_id;

    -- 3. Annonce des suites superieures : tenues, sur le meme bon.
    insert into public.kds_order_items (kds_order_id, ls_line_key, nom, qty, modifiers, fired_at, a_suivre)
    select
      v_order_id,
      'caisse:' || l.id,
      l.libelle,
      l.quantite,
      public.caisse_modifiers_kds(l.options, l.note),
      v_now,
      true
    from public.caisse_lignes l
    where l.ticket_id = p_ticket_id and l.suite > p_suite and l.statut = 'en_attente'
      and l.annonce_at is null
    on conflict (ls_line_key) do nothing;
  end if;

  update public.caisse_lignes
     set statut     = 'envoye',
         envoye_at  = v_now,
         reclame_at = case when annonce_at is not null then v_now else reclame_at end
   where ticket_id = p_ticket_id and suite = p_suite and statut = 'en_attente';
  get diagnostics v_n = row_count;

  update public.caisse_lignes
     set annonce_at = v_now
   where ticket_id = p_ticket_id and suite > p_suite and statut = 'en_attente'
     and annonce_at is null;
  get diagnostics v_annonces = row_count;

  return jsonb_build_object('bon_id', v_order_id, 'lignes', v_n, 'annonces', v_annonces);
end;
$$;

revoke all on function public.caisse_bon_interne(uuid, int, text) from public, anon, authenticated;
