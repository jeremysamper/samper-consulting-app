-- ============================================================================
-- Caisse v6 - KDS couple a la caisse par etablissement, annonce des
-- "a suivre", retour "pret", mode test.
--
--   caisse_lignes  : + annonce_at (la ligne est au KDS, tenue), reclame_at
--     (la suite a ete reclamee), pret_at (la cuisine l'a marquee faite).
--     Trois colonnes ecrites par la base seulement.
--   caisse_tickets : + test (immuable). Un ticket de test ne porte ni
--     reservation ni fiche client, et ne se cree que depuis un poste dont le
--     mode test a ete active par consultant, patron ou resp_cuisine.
--   caisse_tests_journal : chaque entree en mode test, chaque sortie et chaque
--     purge (auteur, poste, heure, nombre de tickets, montant). Lecture
--     consultant et patron ; aucune ecriture par l'API.
--   caisse_envoyer_bon / caisse_reclamer_suite : le bon de la suite demandee
--     part en cuisine, les suites superieures en attente sont annoncees
--     (kds_order_items.a_suivre = true), une ligne annoncee est liberee par sa
--     cle ls_line_key, jamais creee deux fois.
--   Declencheurs : une ligne annoncee modifiee ou supprimee met a jour ou
--     desactive son item KDS ; un item "caisse:" marque fait pose
--     caisse_lignes.pret_at. Sans effet sur les items Lightspeed.
--   kds_lightspeed_actif(etab) : un booleen, pour que le KDS n'interroge
--     Lightspeed que si la maison y est reliee. Aucun jeton n'en sort.
--   caisse_ouvrir_ticket : + p_test, p_poste. En test : aucun effet sur les
--     reservations ni sur le fichier clients.
--   caisse_vider_tests, caisse_purger_tests_auto : purge des tickets de test,
--     de leurs lignes, paiements et bons KDS. Rien d'autre ne se supprime.
--
-- Droits du KDS inchanges : aucune policy de kds_orders ni de kds_order_items
-- n'est touchee. Le service ne lit toujours pas les tables du KDS : l'etat
-- "pret" lui arrive par caisse_lignes.
--
-- Compatibilite avec le front v5 en ligne : il appelle caisse_envoyer_bon
-- pour l'envoi comme pour la reclamation (inchange pour lui), et
-- caisse_ouvrir_ticket avec ses six arguments nommes (les deux nouveaux ont un
-- defaut ; l'ancienne signature est remplacee dans la meme transaction pour
-- ne pas laisser deux surcharges que PostgREST ne saurait pas departager).
--
-- Migration additive (expand), idempotente, sans aucune donnee ecrite : sans
-- effet au rejeu, y compris apres des tickets crees. Rollback en fin de
-- fichier. La tache planifiee de purge vit dans 20261110_caisse_v6b_purge_cron.sql.
--
-- Ne pas rejouer 20261110_caisse_v5.sql apres ce fichier : il recreerait la
-- signature a six arguments de caisse_ouvrir_ticket a cote de la nouvelle
-- (appel ambigu pour PostgREST) et retirerait le filtre des tickets de test
-- de export_personne. Si la v5 doit etre rejouee, rejouer ce fichier ensuite.
-- ============================================================================

-- Les verrous de schema ne font pas attendre le service : au-dela de trois
-- secondes la migration echoue, rien n'est applique, on la rejoue.
set local lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. Colonnes
-- ----------------------------------------------------------------------------
alter table public.caisse_lignes
  add column if not exists annonce_at timestamptz,
  add column if not exists reclame_at timestamptz,
  add column if not exists pret_at timestamptz;

alter table public.caisse_tickets
  add column if not exists test boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'caisse_tickets_test_sans_client') then
    alter table public.caisse_tickets
      add constraint caisse_tickets_test_sans_client
      check (not test or (reservation_id is null and client_id is null));
  end if;
end $$;

create index if not exists idx_caisse_tickets_tests
  on public.caisse_tickets(etablissement_id, created_at) where test;

comment on column public.caisse_lignes.annonce_at is 'Caisse v6 : la ligne a ete annoncee au KDS, tenue (a suivre). Ecrite par caisse_envoyer_bon et caisse_reclamer_suite seulement.';
comment on column public.caisse_lignes.reclame_at is 'Caisse v6 : la suite annoncee a ete reclamee depuis la caisse.';
comment on column public.caisse_lignes.pret_at    is 'Caisse v6 : la cuisine a marque le plat fait au KDS (declencheur). Null si le fait est defait.';
comment on column public.caisse_tickets.test      is 'Caisse v6 : ticket du mode test. Immuable. Toute lecture de ventes exclut test = true.';

-- ----------------------------------------------------------------------------
-- 2. Journal du mode test
-- ----------------------------------------------------------------------------
-- created_at prend l'horloge reelle (clock_timestamp) : l'etat d'un poste se
-- lit sur sa derniere ligne, deux lignes de la meme transaction doivent
-- garder leur ordre.
-- poste est un nom, ecrit en clair ici : il ne prouve rien. Ce qui prouve
-- qu'un appareil est bien le poste passe en mode test, c'est la cle tiree au
-- hasard par caisse_test_entrer, rendue une seule fois a l'appareil, dont
-- seule l'empreinte est gardee (poste_cle). Sans la cle, pas de ticket de test.
-- detail (lignes purge) : par personne ayant ouvert les tickets supprimes,
-- leur nombre, leur montant et ce qui avait ete encaisse, especes a part. La
-- purge efface les tickets, pas la trace de qui les avait ouverts.
create table if not exists public.caisse_tests_journal (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  -- null = purge automatique. set null + nom et role copies : la trace
  -- survit au depart de la personne.
  auteur           text        references public.profiles(id) on delete set null,
  auteur_nom       text,
  auteur_role      text,
  poste            text        not null check (char_length(poste) between 1 and 80),
  poste_cle        text,
  action           text        not null check (action in ('entree', 'sortie', 'purge')),
  nombre           int         not null default 0,
  montant          numeric     not null default 0,
  detail           jsonb,
  created_at       timestamptz not null default clock_timestamp()
);

create index if not exists idx_caisse_tests_journal_poste
  on public.caisse_tests_journal(etablissement_id, poste, created_at desc);
create index if not exists idx_caisse_tests_journal_auteur
  on public.caisse_tests_journal(auteur);

alter table public.caisse_tests_journal enable row level security;

revoke all on public.caisse_tests_journal from anon, authenticated;
grant select on public.caisse_tests_journal to authenticated;

drop policy if exists caisse_tests_journal_select on public.caisse_tests_journal;
create policy caisse_tests_journal_select on public.caisse_tests_journal
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant', 'patron'])
  );

comment on table public.caisse_tests_journal is 'Caisse v6 : trace du mode test (entree, sortie, purge). Lecture consultant et patron ; ecriture par les RPC caisse_test_* et la purge seulement.';

-- ----------------------------------------------------------------------------
-- 3. Le mode test d'un poste est-il actif ?
-- ----------------------------------------------------------------------------
-- La derniere ligne entree ou sortie du poste fait foi, et l'appelant doit
-- presenter la cle rendue a l'entree (comparee a son empreinte). Une entree de
-- plus de 24 heures ne vaut plus : un poste oublie en mode test en sort de
-- lui-meme.
create or replace function public.caisse_test_actif(p_etablissement_id text, p_poste text, p_cle text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_quand  timestamptz;
  v_cle    text;
begin
  if p_etablissement_id is null
     or nullif(btrim(coalesce(p_poste, '')), '') is null
     or nullif(btrim(coalesce(p_cle, '')), '') is null then
    return false;
  end if;
  select j.action, j.created_at, j.poste_cle into v_action, v_quand, v_cle
    from public.caisse_tests_journal j
   where j.etablissement_id = p_etablissement_id
     and j.poste = p_poste
     and j.action in ('entree', 'sortie')
   order by j.created_at desc, j.id desc
   limit 1;
  return coalesce(
    v_action = 'entree'
    and v_quand > now() - interval '24 hours'
    and v_cle = encode(sha256(convert_to(p_cle, 'UTF8')), 'hex'),
    false);
end;
$$;

revoke all on function public.caisse_test_actif(text, text, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Gardes
-- ----------------------------------------------------------------------------
-- 4.1 Ticket (fonction v1b reprise a l'identique, une branche ajoutee) : la
-- purge des tickets de test passe la garde de suppression. Elle ne passe que
-- pour test = true, et seulement depuis une fonction de la base (dans une
-- fonction SECURITY DEFINER, current_user est le proprietaire) : un compte de
-- l'API garde les regles d'avant, tickets de test compris.
create or replace function public.caisse_ticket_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_direction   boolean;
  v_engage      boolean; -- une ligne deja envoyee ou servie, ou un paiement
  v_total       numeric;
  v_paye        numeric;
begin
  v_direction := current_user_role() = any(array['consultant','patron']);

  if tg_op = 'DELETE' then
    if old.test and current_user not in ('authenticated', 'anon') then
      return old; -- purge des tickets de test (v6)
    end if;
    if v_direction then return old; end if;
    if old.statut <> 'ouvert' then
      raise exception 'caisse: seul un ticket ouvert se supprime (direction pour le reste)';
    end if;
    select exists (
      select 1 from public.caisse_lignes l
      where l.ticket_id = old.id and l.statut <> 'en_attente'
    ) or exists (
      select 1 from public.caisse_paiements p where p.ticket_id = old.id
    ) into v_engage;
    if v_engage then
      raise exception 'caisse: des lignes sont parties en cuisine, suppression par la direction seulement';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.statut <> 'ouvert' then
      raise exception 'caisse: un ticket nait ouvert';
    end if;
    new.ouvert_par := coalesce(new.ouvert_par, auth.uid()::text);
  end if;

  -- La table designee appartient a l'etablissement du ticket. La verification
  -- passe par la RLS de salle_tables (fonction SECURITY INVOKER) : une table
  -- d'un autre etablissement est invisible, donc refusee.
  if new.table_id is not null
     and (tg_op = 'INSERT' or new.table_id is distinct from old.table_id) then
    if not exists (
      select 1 from public.salle_tables st
      where st.id = new.table_id and st.etablissement_id = new.etablissement_id
    ) then
      raise exception 'caisse: table inconnue pour cet etablissement';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.statut <> 'ouvert' then
      -- Ticket fige : rien ne bouge, hors l'annulation (direction) et la mise
      -- a null de table_id par la cascade du plan de salle.
      if new.etablissement_id <> old.etablissement_id
         or not (new.table_id is not distinct from old.table_id or new.table_id is null)
         or new.ouvert_par is distinct from old.ouvert_par
         or new.note is distinct from old.note
         or new.created_at <> old.created_at then
        raise exception 'caisse: ticket % fige', old.statut;
      end if;
      if new.statut is distinct from old.statut then
        if old.statut = 'encaisse' and new.statut = 'annule' and v_direction then
          null; -- annulation par la direction
        else
          raise exception 'caisse: annulation d''un ticket encaisse reservee a la direction';
        end if;
      end if;
      return new;
    end if;

    -- Ticket ouvert : transitions gardees.
    if new.statut = 'annule' and not v_direction then
      select exists (
        select 1 from public.caisse_lignes l
        where l.ticket_id = old.id and l.statut <> 'en_attente'
      ) into v_engage;
      if v_engage then
        raise exception 'caisse: des lignes sont parties en cuisine, annulation par la direction seulement';
      end if;
    end if;

    if new.statut = 'encaisse' then
      select coalesce(sum(l.quantite * l.prix_unitaire), 0) into v_total
      from public.caisse_lignes l where l.ticket_id = old.id;
      select coalesce(sum(p.montant), 0) into v_paye
      from public.caisse_paiements p where p.ticket_id = old.id;
      if v_paye + 0.005 < v_total then
        raise exception 'caisse: paiements insuffisants (% sur %)', v_paye, v_total;
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 4.2 Le drapeau de test : pose a la creation par la RPC d'ouverture
-- seulement, jamais change ensuite, par personne.
create or replace function public.caisse_ticket_garde_test()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.test and current_user in ('authenticated', 'anon') then
      raise exception 'caisse: un ticket de test s''ouvre depuis un poste en mode test'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if new.test is distinct from old.test then
    raise exception 'caisse: le drapeau de test d''un ticket ne change jamais'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.caisse_ticket_garde_test() from public, anon, authenticated;

drop trigger if exists trg_caisse_ticket_garde_test on public.caisse_tickets;
create trigger trg_caisse_ticket_garde_test
  before insert or update on public.caisse_tickets
  for each row execute function public.caisse_ticket_garde_test();

-- 4.3 Lignes (declencheur a part, garde v1d et v2 intacte) :
--   - annonce_at, reclame_at et pret_at ne s'ecrivent pas par l'API ;
--   - une ligne annoncee ne quitte l'attente que par l'envoi du bon (sinon
--     son item resterait tenu en cuisine pour toujours) ;
--   - une ligne ne passe jamais d'un ticket de test a un ticket reel, ni
--     l'inverse (fusion de tickets).
create or replace function public.caisse_ligne_garde_v6()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_test_avant boolean;
  v_test_apres boolean;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.annonce_at is not null or new.reclame_at is not null or new.pret_at is not null then
        raise exception 'caisse: l''etat cuisine d''une ligne ne s''ecrit pas depuis l''ecran'
          using errcode = '42501';
      end if;
    elsif new.annonce_at is distinct from old.annonce_at
       or new.reclame_at is distinct from old.reclame_at
       or new.pret_at is distinct from old.pret_at then
      raise exception 'caisse: l''etat cuisine d''une ligne ne s''ecrit pas depuis l''ecran'
        using errcode = '42501';
    elsif old.annonce_at is not null and old.statut = 'en_attente'
       and new.statut is distinct from 'en_attente' then
      raise exception 'caisse: une ligne annoncee ne part que par l''envoi du bon'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.ticket_id is distinct from old.ticket_id then
    select t.test into v_test_avant from public.caisse_tickets t where t.id = old.ticket_id;
    select t.test into v_test_apres from public.caisse_tickets t where t.id = new.ticket_id;
    if v_test_avant is distinct from v_test_apres then
      raise exception 'caisse: un ticket de test et un ticket reel ne se reunissent pas'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.caisse_ligne_garde_v6() from public, anon, authenticated;

drop trigger if exists trg_caisse_ligne_garde_v6 on public.caisse_lignes;
create trigger trg_caisse_ligne_garde_v6
  before insert or update on public.caisse_lignes
  for each row execute function public.caisse_ligne_garde_v6();

-- ----------------------------------------------------------------------------
-- 5. Caisse vers KDS
-- ----------------------------------------------------------------------------
-- 5.1 Les parametres d'une ligne tels que le KDS les affiche (regle de la v2,
-- sortie de caisse_envoyer_bon pour servir aussi a la mise a jour d'un item
-- annonce) : cuisson, "sans ...", message (prefixe "bar :"), puis la note.
create or replace function public.caisse_modifiers_kds(p_options jsonb, p_note text)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce((
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
      from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) o
      where nullif(trim(o->>'valeur'), '') is not null
    ), '[]'::jsonb)
    || case when nullif(trim(p_note), '') is not null
      then jsonb_build_array(jsonb_build_object('name', p_note, 'quantity', 1))
      else '[]'::jsonb
    end;
$$;

revoke all on function public.caisse_modifiers_kds(jsonb, text) from public, anon, authenticated;

-- 5.2 Le bon. Fonction interne, appelee par caisse_envoyer_bon et
-- caisse_reclamer_suite (meme garde, meme effet : seul le nom change).
--   1. La suite demandee part : ses lignes en attente deviennent des items a
--      faire. Une ligne deja annoncee n'est pas recreee : son item est libere
--      (a_suivre = false) par sa cle ls_line_key. Une ligne que la cuisine a
--      relancee d'elle-meme garde son item tel quel.
--   2. Un bon neuf (kds_orders) est cree des qu'une ligne de la suite en a
--      besoin, comme avant : la cuisine voit arriver un bon date de l'envoi,
--      son chrono part de la. Les annonces deja faites le rejoignent, encore
--      tenues : le dernier bon de la table porte toujours tout ce qui suit.
--   3. Les lignes en attente des suites superieures pas encore annoncees
--      partent sur ce bon, tenues.
-- Ticket de test : rien au KDS, sauf si la maison a regle "Envoyer les tests
-- en cuisine" ; le bon porte alors TEST en tete. Les lignes changent d'etat
-- de la meme facon, pour que l'ecran de test se comporte comme le vrai.
-- Idempotence : le FOR UPDATE sur le ticket serialise les doubles taps, le
-- second appel ne trouve plus de ligne en attente dans la suite.
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

create or replace function public.caisse_envoyer_bon(p_ticket_id uuid, p_suite int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.caisse_bon_interne(p_ticket_id, p_suite, 'caisse_envoyer_bon');
end;
$$;

revoke execute on function public.caisse_envoyer_bon(uuid, int) from public, anon;
grant  execute on function public.caisse_envoyer_bon(uuid, int) to authenticated;

create or replace function public.caisse_reclamer_suite(p_ticket_id uuid, p_suite int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.caisse_bon_interne(p_ticket_id, p_suite, 'caisse_reclamer_suite');
end;
$$;

comment on function public.caisse_reclamer_suite(uuid, int) is
  'Caisse v6 : reclame une suite annoncee (items KDS liberes, lignes envoyees). Meme garde que caisse_envoyer_bon, idempotente au double tap.';

revoke execute on function public.caisse_reclamer_suite(uuid, int) from public, anon, authenticated;
grant  execute on function public.caisse_reclamer_suite(uuid, int) to authenticated;

-- 5.3 Une ligne annoncee, pas encore reclamee, reste modifiable en caisse :
-- la modification met a jour son item KDS (et le remet a faire s'il avait
-- deja ete marque fait), la suppression le desactive. Un item desactive n'est
-- plus tenu : l'ecran de la cuisine le montre barre (annule), au lieu de le
-- faire disparaitre sans un mot. Jamais de doublon : l'item se retrouve par
-- sa cle.
create or replace function public.caisse_ligne_vers_kds()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.annonce_at is not null and old.statut = 'en_attente' then
      update public.kds_order_items
         set active = false, a_suivre = false
       where ls_line_key = 'caisse:' || old.id and active;
    end if;
    return null;
  end if;

  if new.annonce_at is not null and old.statut = 'en_attente' and new.statut = 'en_attente'
     and (new.libelle is distinct from old.libelle
          or new.quantite is distinct from old.quantite
          or new.options is distinct from old.options
          or new.note is distinct from old.note) then
    update public.kds_order_items
       set nom         = new.libelle,
           qty         = new.quantite,
           modifiers   = public.caisse_modifiers_kds(new.options, new.note),
           bump_status = 'pending',
           bumped_at   = null,
           bumped_by   = null
     where ls_line_key = 'caisse:' || new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.caisse_ligne_vers_kds() from public, anon, authenticated;

drop trigger if exists trg_caisse_ligne_vers_kds on public.caisse_lignes;
create trigger trg_caisse_ligne_vers_kds
  after update or delete on public.caisse_lignes
  for each row execute function public.caisse_ligne_vers_kds();

-- 5.4 Le ticket se clot (encaisse ou annule) avec des lignes annoncees jamais
-- reclamees : leurs items pas encore faits sont desactives (barres), qu'ils
-- soient encore tenus ou que la cuisine les ait relances d'elle-meme. La
-- cuisine ne garde pas une suite fantome. La cloture ne doit jamais echouer
-- pour cela.
create or replace function public.caisse_ticket_cloture_kds()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.statut = 'ouvert' and new.statut in ('encaisse', 'annule') then
    begin
      update public.kds_order_items i
         set active = false, a_suivre = false
        from public.caisse_lignes l
       where l.ticket_id = new.id
         and l.statut = 'en_attente'
         and l.annonce_at is not null
         and i.ls_line_key = 'caisse:' || l.id
         and (i.a_suivre or i.bump_status <> 'bumped')
         and i.active;
    exception when others then
      raise warning 'caisse_ticket_cloture_kds: items du ticket % laisses tels quels : %', new.id, sqlerrm;
    end;
  end if;
  return null;
end;
$$;

revoke all on function public.caisse_ticket_cloture_kds() from public, anon, authenticated;

drop trigger if exists trg_caisse_ticket_cloture_kds on public.caisse_tickets;
create trigger trg_caisse_ticket_cloture_kds
  after update of statut on public.caisse_tickets
  for each row execute function public.caisse_ticket_cloture_kds();

-- ----------------------------------------------------------------------------
-- 6. KDS vers caisse : le retour "pret"
-- ----------------------------------------------------------------------------
-- Un item de la caisse (cle "caisse:<id de ligne>") marque fait pose
-- pret_at sur sa ligne ; defaire le fait le retire. Le service lit donc
-- l'etat dans caisse_lignes, sans aucun droit sur les tables du KDS.
-- Les items Lightspeed n'ont pas ce prefixe : rien ne se passe pour eux.
-- Seule une ligne d'un ticket encore ouvert est ecrite, et le geste de la
-- cuisine ne doit jamais echouer a cause de la caisse : toute erreur devient
-- un avertissement.
-- Verrous : la cuisine tient l'item puis demande le ticket (garde des
-- lignes), la caisse tient le ticket puis demande l'item. lock_timeout borne
-- l'attente de la cuisine a 300 ms : en cas de croisement, c'est elle qui
-- cede (le plat reste fait au KDS, l'etat "pret" n'est pas pose cette
-- fois-la), la caisse ne voit jamais d'interblocage.
-- Un item encore tenu (a suivre) n'est jamais "pret" : il n'est pas parti.
create or replace function public.kds_item_pret_caisse()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '300ms'
as $$
declare
  v_ligne uuid;
begin
  if new.ls_line_key !~ '^caisse:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  if new.a_suivre and new.bump_status = 'bumped' then
    return null;
  end if;
  begin
    v_ligne := substr(new.ls_line_key, 8)::uuid;
    update public.caisse_lignes l
       set pret_at = case when new.bump_status = 'bumped' then coalesce(new.bumped_at, clock_timestamp()) else null end
     where l.id = v_ligne
       and exists (
         select 1 from public.caisse_tickets t
          where t.id = l.ticket_id and t.statut = 'ouvert');
  exception when others then
    raise warning 'kds_item_pret_caisse: ligne % laissee telle quelle : %', new.ls_line_key, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.kds_item_pret_caisse() from public, anon, authenticated;

drop trigger if exists trg_kds_item_pret_caisse on public.kds_order_items;
create trigger trg_kds_item_pret_caisse
  after update of bump_status on public.kds_order_items
  for each row
  when (new.bump_status is distinct from old.bump_status and new.ls_line_key like 'caisse:%')
  execute function public.kds_item_pret_caisse();

-- Un bon de la caisse n'est pas un check Lightspeed. Dans une maison qui a
-- les deux sources, l'ingestion Lightspeed (pos-orders-poll, service_role)
-- ferme tout bon ouvert absent de la reponse de Lightspeed : sans cette
-- garde, elle fermerait aussi les bons de la caisse au premier passage. Le
-- statut d'un bon "caisse:" ne suit donc jamais l'ingestion ; la cuisine le
-- termine au passe (completed_at), comme aujourd'hui.
create or replace function public.kds_bon_caisse_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'service_role' then
    new.status := old.status;
  end if;
  return new;
end;
$$;

revoke all on function public.kds_bon_caisse_garde() from public, anon, authenticated;

drop trigger if exists trg_kds_bon_caisse_garde on public.kds_orders;
create trigger trg_kds_bon_caisse_garde
  before update of status on public.kds_orders
  for each row
  when (old.ls_check_uuid like 'caisse:%' and new.status is distinct from old.status)
  execute function public.kds_bon_caisse_garde();

-- ----------------------------------------------------------------------------
-- 7. La maison est-elle reliee a Lightspeed ?
-- ----------------------------------------------------------------------------
-- Un booleen pour l'ecran du KDS : il n'interroge Lightspeed que si la maison
-- y a une connexion, active ou tombee (statut error : l'ecran garde alors son
-- accueil de reconnexion). Une maison sans connexion, ou deconnectee, vit sur
-- la caisse native. Reserve aux roles du KDS, sur leur etablissement. Aucun
-- jeton, aucune colonne de pos_connections ne sort.
create or replace function public.kds_lightspeed_actif(p_etablissement_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok   boolean;
  v_role text;
begin
  v_ok := user_can_access_etab(p_etablissement_id);
  v_role := current_user_role();
  if v_ok is not true or not coalesce(v_role = any(array['consultant', 'resp_cuisine', 'cuisinier']), false) then
    raise exception 'kds: acces refuse' using errcode = '42501';
  end if;
  return exists (
    select 1
      from public.pos_connections c
      join public.pos_providers p on p.id = c.provider_id
     where c.etablissement_id = p_etablissement_id
       and p.slug = 'lightspeed'
       and c.status <> 'disconnected'
  );
end;
$$;

comment on function public.kds_lightspeed_actif(text) is
  'Caisse v6 : vrai si l''etablissement a une connexion Lightspeed (active ou en erreur). Roles du KDS seulement. Ne rend aucun jeton.';

revoke execute on function public.kds_lightspeed_actif(text) from public, anon, authenticated;
grant  execute on function public.kds_lightspeed_actif(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Mode test : purge
-- ----------------------------------------------------------------------------
-- Supprime les tickets de test d'un etablissement (tous, ou ceux crees avant
-- p_avant), leurs lignes et paiements (cascade), et leurs bons KDS. Un bon
-- n'est supprime que s'il ne porte plus aucun item d'une ligne existante : un
-- bon reel ne peut pas partir. Rien d'autre n'est touche. Trace au journal,
-- avec le detail par personne ayant ouvert les tickets supprimes (nombre,
-- montant, encaisse, dont especes) : la purge n'efface pas qui a fait quoi.
create or replace function public.caisse_purger_tests_interne(
  p_etablissement_id text,
  p_avant            timestamptz,
  p_auteur           text,
  p_poste            text,
  p_tracer_vide      boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids     uuid[];
  v_bons    uuid[];
  v_n       int := 0;
  v_montant numeric := 0;
  v_detail  jsonb := null;
  v_nom     text;
  v_role    text;
begin
  select coalesce(array_agg(s.id), '{}'::uuid[]) into v_ids
    from (
      select t.id
        from public.caisse_tickets t
       where t.etablissement_id = p_etablissement_id
         and t.test
         and (p_avant is null or t.created_at < p_avant)
       for update
    ) s;

  if cardinality(v_ids) > 0 then
    select coalesce(sum(l.quantite * l.prix_unitaire), 0) into v_montant
      from public.caisse_lignes l
     where l.ticket_id = any(v_ids);

    select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_detail
      from (
        select t.ouvert_par,
               (select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '')
                  from public.profiles p where p.id = t.ouvert_par) as nom,
               count(*) as tickets,
               coalesce(sum((select sum(l.quantite * l.prix_unitaire)
                               from public.caisse_lignes l where l.ticket_id = t.id)), 0) as montant,
               coalesce(sum((select sum(pa.montant)
                               from public.caisse_paiements pa where pa.ticket_id = t.id)), 0) as encaisse,
               coalesce(sum((select sum(pa.montant)
                               from public.caisse_paiements pa
                              where pa.ticket_id = t.id and pa.moyen = 'especes')), 0) as especes
          from public.caisse_tickets t
         where t.id = any(v_ids)
         group by t.ouvert_par
      ) d;

    select coalesce(array_agg(distinct i.kds_order_id), '{}'::uuid[]) into v_bons
      from public.kds_order_items i
      join public.caisse_lignes l on i.ls_line_key = 'caisse:' || l.id
     where l.ticket_id = any(v_ids);

    delete from public.kds_order_items i
     using public.caisse_lignes l
     where l.ticket_id = any(v_ids)
       and i.ls_line_key = 'caisse:' || l.id;

    delete from public.kds_orders o
     where o.etablissement_id = p_etablissement_id
       and o.ls_check_uuid like 'caisse:%'
       and (o.id = any(v_bons)
            or exists (
              select 1 from unnest(v_ids) x(id)
               where o.ls_check_uuid like 'caisse:' || x.id || ':%'))
       and not exists (
         select 1
           from public.kds_order_items i2
           join public.caisse_lignes l2 on i2.ls_line_key = 'caisse:' || l2.id
          where i2.kds_order_id = o.id);

    delete from public.caisse_tickets t
     where t.id = any(v_ids) and t.test;
    get diagnostics v_n = row_count;
  end if;

  if v_n > 0 or p_tracer_vide then
    if p_auteur is not null then
      select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), p.role
        into v_nom, v_role
        from public.profiles p
       where p.id = p_auteur;
    end if;
    insert into public.caisse_tests_journal
      (etablissement_id, auteur, auteur_nom, auteur_role, poste, action, nombre, montant, detail)
    values
      (p_etablissement_id, p_auteur, v_nom, v_role,
       coalesce(nullif(btrim(coalesce(p_poste, '')), ''), 'inconnu'), 'purge', v_n, v_montant, v_detail);
  end if;

  return jsonb_build_object('tickets', v_n, 'montant', v_montant);
end;
$$;

revoke all on function public.caisse_purger_tests_interne(text, timestamptz, text, text, boolean) from public, anon, authenticated;

-- Purge automatique : les tickets de test de plus de 24 heures, toutes
-- maisons. Appelee par la tache planifiee (20261110_caisse_v6b_purge_cron.sql)
-- et, pour la maison concernee, a chaque entree en mode test.
create or replace function public.caisse_purger_tests_auto()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etab  text;
  v_total int := 0;
  v_res   jsonb;
begin
  for v_etab in
    select distinct t.etablissement_id
      from public.caisse_tickets t
     where t.test and t.created_at < now() - interval '24 hours'
  loop
    v_res := public.caisse_purger_tests_interne(v_etab, now() - interval '24 hours', null, 'automatique', false);
    v_total := v_total + coalesce((v_res ->> 'tickets')::int, 0);
  end loop;
  return v_total;
end;
$$;

revoke all on function public.caisse_purger_tests_auto() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. Mode test : entrer, sortir, vider, etat du poste
-- ----------------------------------------------------------------------------
-- Entrer : consultant, patron, resp_cuisine, avec le droit caisse. La base
-- tire une cle au hasard, la rend UNE fois a l'appareil et n'en garde que
-- l'empreinte : c'est elle, pas le nom du poste, que chaque ouverture de
-- ticket de test devra presenter. Double tap (meme cle deja active) : une
-- seule ligne au journal.
-- Sortir : l'appareil qui tient la cle (toute personne qui a la caisse : un
-- poste ne reste pas bloque en test faute de responsable), ou un des trois
-- roles pour n'importe quel poste. Vider en sortant, ou vider seul : les
-- trois roles seulement.
create or replace function public.caisse_test_entrer(p_etablissement_id text, p_poste text, p_cle text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok      boolean;
  v_role    text;
  v_uid     text := auth.uid()::text;
  v_poste   text := nullif(btrim(coalesce(p_poste, '')), '');
  v_actif   boolean;
  v_cle     text := null;
  v_n       int;
  v_montant numeric;
  v_nom     text;
begin
  v_ok := public.caisse_peut_utiliser(p_etablissement_id);
  v_role := current_user_role();
  if v_ok is not true or not coalesce(v_role = any(array['consultant', 'patron', 'resp_cuisine']), false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_poste is null or char_length(v_poste) > 80 then
    raise exception 'caisse: poste invalide';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('caisse_test:' || p_etablissement_id || ':' || v_poste, 0));

  -- Les tests de plus de 24 heures de la maison partent avant d'en creer d'autres.
  perform public.caisse_purger_tests_interne(
    p_etablissement_id, now() - interval '24 hours', null, 'automatique', false);

  select count(*), coalesce(sum(s.total), 0) into v_n, v_montant
    from (
      select (select coalesce(sum(l.quantite * l.prix_unitaire), 0)
                from public.caisse_lignes l where l.ticket_id = t.id) as total
        from public.caisse_tickets t
       where t.etablissement_id = p_etablissement_id and t.test
    ) s;

  v_actif := public.caisse_test_actif(p_etablissement_id, v_poste, p_cle);
  if v_actif is not true then
    v_cle := gen_random_uuid()::text;
    select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '') into v_nom
      from public.profiles p where p.id = v_uid;
    insert into public.caisse_tests_journal
      (etablissement_id, auteur, auteur_nom, auteur_role, poste, poste_cle, action, nombre, montant)
    values
      (p_etablissement_id, v_uid, v_nom, v_role, v_poste,
       encode(sha256(convert_to(v_cle, 'UTF8')), 'hex'), 'entree', v_n, v_montant);
  end if;

  -- cle : rendue a la creation seulement ; null si le poste etait deja actif
  -- avec la cle presentee (l'appareil garde la sienne).
  return jsonb_build_object('actif', true, 'cle', v_cle, 'tickets', v_n, 'montant', v_montant);
end;
$$;

comment on function public.caisse_test_entrer(text, text, text) is
  'Caisse v6 : active le mode test d''un poste (consultant, patron, resp_cuisine) et rend la cle du poste. Trace au journal.';

revoke execute on function public.caisse_test_entrer(text, text, text) from public, anon, authenticated;
grant  execute on function public.caisse_test_entrer(text, text, text) to authenticated;

create or replace function public.caisse_test_sortir(p_etablissement_id text, p_poste text, p_cle text default null, p_vider boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok       boolean;
  v_role     text;
  v_resp     boolean;
  v_uid      text := auth.uid()::text;
  v_poste    text := nullif(btrim(coalesce(p_poste, '')), '');
  v_actif    boolean;
  v_derniere text;
  v_n        int;
  v_montant  numeric;
  v_nom      text;
  v_purge    jsonb := null;
begin
  v_ok := public.caisse_peut_utiliser(p_etablissement_id);
  v_role := current_user_role();
  v_resp := coalesce(v_role = any(array['consultant', 'patron', 'resp_cuisine']), false);
  if v_ok is not true then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if coalesce(p_vider, false) and not v_resp then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_poste is null or char_length(v_poste) > 80 then
    raise exception 'caisse: poste invalide';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('caisse_test:' || p_etablissement_id || ':' || v_poste, 0));

  -- Le poste se ferme pour qui tient sa cle, ou pour un responsable (qui
  -- peut fermer un poste oublie sans en avoir la cle).
  v_actif := public.caisse_test_actif(p_etablissement_id, v_poste, p_cle);
  if v_actif is not true and v_resp then
    select j.action into v_derniere
      from public.caisse_tests_journal j
     where j.etablissement_id = p_etablissement_id
       and j.poste = v_poste
       and j.action in ('entree', 'sortie')
     order by j.created_at desc, j.id desc
     limit 1;
    v_actif := coalesce(v_derniere = 'entree', false);
  end if;
  if v_actif then
    select count(*), coalesce(sum(s.total), 0) into v_n, v_montant
      from (
        select (select coalesce(sum(l.quantite * l.prix_unitaire), 0)
                  from public.caisse_lignes l where l.ticket_id = t.id) as total
          from public.caisse_tickets t
         where t.etablissement_id = p_etablissement_id and t.test
      ) s;
    select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '') into v_nom
      from public.profiles p where p.id = v_uid;
    insert into public.caisse_tests_journal
      (etablissement_id, auteur, auteur_nom, auteur_role, poste, action, nombre, montant)
    values
      (p_etablissement_id, v_uid, v_nom, v_role, v_poste, 'sortie', v_n, v_montant);
  end if;

  if coalesce(p_vider, false) then
    v_purge := public.caisse_purger_tests_interne(p_etablissement_id, null, v_uid, v_poste, true);
  end if;

  return jsonb_build_object('actif', false, 'purge', v_purge);
end;
$$;

comment on function public.caisse_test_sortir(text, text, text, boolean) is
  'Caisse v6 : quitte le mode test d''un poste (l''appareil qui tient la cle, ou un responsable) ; p_vider purge les tickets de test (consultant, patron, resp_cuisine). Trace au journal.';

revoke execute on function public.caisse_test_sortir(text, text, text, boolean) from public, anon, authenticated;
grant  execute on function public.caisse_test_sortir(text, text, text, boolean) to authenticated;

create or replace function public.caisse_vider_tests(p_etablissement_id text, p_poste text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok   boolean;
  v_role text;
begin
  v_ok := public.caisse_peut_utiliser(p_etablissement_id);
  v_role := current_user_role();
  if v_ok is not true or not coalesce(v_role = any(array['consultant', 'patron', 'resp_cuisine']), false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if p_poste is not null and char_length(p_poste) > 80 then
    raise exception 'caisse: poste invalide';
  end if;
  return public.caisse_purger_tests_interne(p_etablissement_id, null, auth.uid()::text, p_poste, true);
end;
$$;

comment on function public.caisse_vider_tests(text, text) is
  'Caisse v6 : supprime TOUS les tickets de test de l''etablissement (pas seulement ceux du poste, qui ne sert qu''a la trace), leurs lignes, paiements et bons KDS (consultant, patron, resp_cuisine). Trace au journal.';

revoke execute on function public.caisse_vider_tests(text, text) from public, anon, authenticated;
grant  execute on function public.caisse_vider_tests(text, text) to authenticated;

-- L'etat du poste, pour que l'ecran ne reste jamais en mode test sur la foi de
-- sa seule memoire locale (mode expire, ou quitte depuis un autre onglet).
create or replace function public.caisse_test_etat(p_etablissement_id text, p_poste text, p_cle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok    boolean;
  v_actif boolean;
  v_n     int;
begin
  v_ok := public.caisse_peut_utiliser(p_etablissement_id);
  if v_ok is not true then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  v_actif := public.caisse_test_actif(p_etablissement_id, p_poste, p_cle);
  select count(*) into v_n
    from public.caisse_tickets t
   where t.etablissement_id = p_etablissement_id and t.test;
  return jsonb_build_object('actif', v_actif, 'tickets', v_n);
end;
$$;

revoke execute on function public.caisse_test_etat(text, text, text) from public, anon, authenticated;
grant  execute on function public.caisse_test_etat(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. caisse_ouvrir_ticket : le drapeau de test
-- ----------------------------------------------------------------------------
-- Corps de la v5 repris a l'identique, a trois ajouts pres :
--   - p_test, p_poste et p_poste_cle (defauts : false, null, null) ;
--   - en test, une branche a part : le poste doit etre en mode test et
--     l'appelant doit presenter la cle du poste ; le ticket nait
--     test = true, sans reservation ni fiche client. Rien n'est ecrit
--     dans reservations, reservation_tables ni resa_clients ; les couverts
--     d'une reservation choisie sont seulement lus. Une table est facultative
--     (la vente directe d'essai passe par ici) ;
--   - hors test, le ticket ouvert de la table se cherche parmi les tickets
--     reels (un ticket de test ne se rend jamais a un poste normal).
-- L'ancienne signature a six arguments est retiree dans la meme transaction :
-- les appels a six arguments nommes du front en ligne tombent sur la nouvelle.
drop function if exists public.caisse_ouvrir_ticket(text, text, text, text, text, int);

create or replace function public.caisse_ouvrir_ticket(
  p_etablissement_id text,
  p_table_id         text,
  p_qui              text,
  p_reservation_id   text default null,
  p_client_id        text default null,
  p_couverts         int  default null,
  p_test             boolean default false,
  p_poste            text default null,
  p_poste_cle        text default null
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
  v_test_ok   boolean;
  v_couverts  int;
begin
  v_ok := public.caisse_peut_utiliser(p_etablissement_id);
  if v_ok is not true then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;

  -- Mode test : rien hors de la caisse.
  if coalesce(p_test, false) then
    v_test_ok := public.caisse_test_actif(p_etablissement_id, p_poste, p_poste_cle);
    if v_test_ok is not true then
      raise exception 'caisse: mode test inactif sur ce poste' using errcode = '42501';
    end if;
    if p_qui is not null and p_qui not in ('reservation', 'passage', 'compte') then
      raise exception 'caisse: choix du client invalide';
    end if;
    if p_table_id is not null then
      perform 1
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
         and t.test
       order by t.created_at
       limit 1;
      if found then
        return jsonb_build_object(
          'ticket_id', v_ticket.id,
          'reservation_id', null,
          'deja_ouvert', true,
          'test', true);
      end if;
    end if;

    v_couverts := p_couverts;
    if p_qui = 'reservation' and p_reservation_id is not null then
      select least(r.nb_couverts, 99) into v_couverts
        from public.reservations r
       where r.id = p_reservation_id and r.etablissement_id = p_etablissement_id;
    end if;
    if v_couverts is not null and (v_couverts < 1 or v_couverts > 99) then
      raise exception 'caisse: nombre de couverts invalide';
    end if;

    insert into public.caisse_tickets
      (etablissement_id, table_id, ouvert_par, couverts, qui, test)
    values
      (p_etablissement_id, p_table_id, v_uid, v_couverts,
       case when p_table_id is null then null else p_qui end, true)
    returning * into v_ticket;

    return jsonb_build_object(
      'ticket_id', v_ticket.id,
      'reservation_id', null,
      'deja_ouvert', false,
      'test', true);
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
     and not t.test
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

comment on function public.caisse_ouvrir_ticket(text, text, text, text, text, int, boolean, text, text) is
  'Caisse v5 et v6 : ouvre le ticket d''une table au nom d''une reservation, d''un client de passage ou d''une fiche client. En mode test (p_test, poste actif et cle du poste) : ticket de test, aucun effet hors de la caisse. Idempotente au double tap.';

revoke execute on function public.caisse_ouvrir_ticket(text, text, text, text, text, int, boolean, text, text) from public, anon, authenticated;
grant  execute on function public.caisse_ouvrir_ticket(text, text, text, text, text, int, boolean, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 11. Export d'une personne : jamais un ticket de test
-- ----------------------------------------------------------------------------
-- Fonction de la v5 reprise a l'identique, une condition ajoutee sur les
-- tickets (k.test is not true). La contrainte caisse_tickets_test_sans_client
-- l'assure deja ; le filtre le dit dans la requete elle-meme, comme toute
-- lecture de ventes. effacer_personne n'est pas touchee : elle ne lit aucune
-- vente, et un ticket de test ne porte jamais de fiche client.
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
        where k.test is not true
          and (k.client_id = c.id
           or k.reservation_id in (select r2.id from reservations r2 where r2.client_id = c.id))), '[]'::jsonb),
      'sejours', coalesce((select jsonb_agg(to_jsonb(s) order by s.arrivee)
        from sejours s where s.client_id = c.id), '[]'::jsonb)
    ) into v_res
    from resa_clients c where c.id = p_client_id;
  end if;

  return v_res;
end;
$fn$;

comment on function public.export_personne(text, text) is
  'SI3 D4 : export JSON des donnees d''un client spa ou de reservation, tags de reservation et tickets de caisse compris (tickets de test exclus). Consultant et patron de l''etablissement, compte actif.';

-- PostgREST relit le schema (signature de caisse_ouvrir_ticket changee).
notify pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK (a executer manuellement si besoin, front v6 retire d'abord) :
--
--   -- taches planifiees : voir 20261110_caisse_v6b_purge_cron.sql
--   -- D'ABORD, tant que les gardes sont en place : vider les tickets de test.
--   -- Sans cela, la colonne test retiree, ils deviendraient des ventes
--   -- ordinaires pour l'ecran et pour les rapports.
--   select public.caisse_purger_tests_interne(e.id, null, null, 'rollback', true)
--     from public.etablissements e
--    where exists (select 1 from public.caisse_tickets t where t.etablissement_id = e.id and t.test);
--   -- puis verifier : select count(*) from public.caisse_tickets where test;  (attendu : 0)
--   -- rejouer la section 7 de 20261110_caisse_v5.sql (export_personne sans le filtre)
--   -- rejouer la section 5 de 20261110_caisse_v5.sql (caisse_ouvrir_ticket a six
--   -- arguments), apres :
--   drop function if exists public.caisse_ouvrir_ticket(text, text, text, text, text, int, boolean, text, text);
--   drop function if exists public.caisse_test_etat(text, text, text);
--   drop function if exists public.caisse_vider_tests(text, text);
--   drop function if exists public.caisse_test_sortir(text, text, text, boolean);
--   drop function if exists public.caisse_test_entrer(text, text, text);
--   drop function if exists public.caisse_purger_tests_auto();
--   drop function if exists public.caisse_purger_tests_interne(text, timestamptz, text, text, boolean);
--   drop function if exists public.kds_lightspeed_actif(text);
--   drop trigger if exists trg_kds_bon_caisse_garde on public.kds_orders;
--   drop function if exists public.kds_bon_caisse_garde();
--   drop trigger if exists trg_kds_item_pret_caisse on public.kds_order_items;
--   drop function if exists public.kds_item_pret_caisse();
--   drop trigger if exists trg_caisse_ticket_cloture_kds on public.caisse_tickets;
--   drop function if exists public.caisse_ticket_cloture_kds();
--   drop trigger if exists trg_caisse_ligne_vers_kds on public.caisse_lignes;
--   drop function if exists public.caisse_ligne_vers_kds();
--   drop function if exists public.caisse_reclamer_suite(uuid, int);
--   -- rejouer la RPC caisse_envoyer_bon de 20261106_caisse_v2_options.sql, puis :
--   drop function if exists public.caisse_bon_interne(uuid, int, text);
--   drop function if exists public.caisse_modifiers_kds(jsonb, text);
--   drop trigger if exists trg_caisse_ligne_garde_v6 on public.caisse_lignes;
--   drop function if exists public.caisse_ligne_garde_v6();
--   drop trigger if exists trg_caisse_ticket_garde_test on public.caisse_tickets;
--   drop function if exists public.caisse_ticket_garde_test();
--   -- rejouer 20261105_caisse_v1b_gardes_fraude.sql (caisse_ticket_garde sans la purge)
--   drop function if exists public.caisse_test_actif(text, text, text);
--   drop table if exists public.caisse_tests_journal;
--   drop index if exists public.idx_caisse_tickets_tests;
--   alter table public.caisse_tickets drop constraint if exists caisse_tickets_test_sans_client;
--   alter table public.caisse_tickets drop column if exists test;
--   alter table public.caisse_lignes drop column if exists pret_at;
--   alter table public.caisse_lignes drop column if exists reclame_at;
--   alter table public.caisse_lignes drop column if exists annonce_at;
--   (les items KDS annonces restent : ce sont des kds_order_items ordinaires)
-- ============================================================================
