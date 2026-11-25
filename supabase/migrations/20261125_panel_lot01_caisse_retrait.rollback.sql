-- Rollback du lot 01 du panel (20261125_panel_lot01_caisse_retrait.sql).
-- À jouer après le retour du front d'avant, jamais avant : le front du lot
-- écrit retrait_nom, retrait_heure et a_emporter à l'ouverture.
-- À jouer hors service, après la fin de la journée d'exploitation : le compteur
-- du jour part avec la table, et une migration rejouée le même jour repartirait
-- à 1, sur des numéros déjà donnés au comptoir.
begin;

-- 1. caisse_bon_interne de la v6, mot pour mot (identique à la production le
--    25.11.2026, avant le lot).
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
        case when v_ticket.test then 'TEST ' else '' end || coalesce(v_table_nom, 'Direct'),
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

-- 2. Garde, fonctions et compteur du retrait.
drop trigger if exists trg_caisse_ticket_garde_retrait on public.caisse_tickets;
drop function if exists public.caisse_ticket_garde_retrait();
drop function if exists public.caisse_libelle_retrait(boolean, int, text, boolean, timestamptz);
drop function if exists public.caisse_retrait_suivant(text);
drop table if exists public.caisse_retraits_jour;

-- 3. Colonnes (leurs contraintes partent avec elles).
alter table public.caisse_tickets drop column if exists retrait_numero;
alter table public.caisse_tickets drop column if exists retrait_heure;
alter table public.caisse_tickets drop column if exists retrait_nom;

commit;
