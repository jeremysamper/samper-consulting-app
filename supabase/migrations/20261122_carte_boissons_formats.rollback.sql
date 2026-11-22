-- ════════════════════════════════════════════════════════════════════════════
-- Retour arrière de 20261122_carte_boissons_formats.sql (Carte des boissons,
-- lot A).
--
-- 1. Les six fonctions reprennent leur texte d'avant, recopié tel quel depuis
--    20261110_caisse_v7.sql, 20261110_caisse_v6.sql et
--    20261122_caisse_commande_qr.sql. Signatures et droits inchangés. Une
--    ligne de caisse déjà posée dans un format garde son prix et son option.
-- 2. Les commandes QR en attente qui nomment un format sont refusées avec un
--    motif. La table plat_formats est supprimée : les formats saisis sont
--    perdus.
--    Les exporter d'abord s'il y en a (select * from public.plat_formats).
-- 3. La colonne cartes.genre est supprimée. À ne jouer qu'une fois retiré tout
--    front qui la lit (lot B) : sans elle, les cartes de boissons reviennent
--    dans Cartes & Recettes.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

-- 1. Fonctions

-- caisse_ligne_garde_v7 (20261110_caisse_v7.sql)
create or replace function public.caisse_ligne_garde_v7()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_api  boolean := current_user not in ('postgres', 'supabase_admin');
  v_prix numeric;
begin
  if v_api then
    if tg_op = 'INSERT' then
      if new.taux_tva is not null or new.a_emporter or new.remise_montant <> 0
         or new.remise_motif is not null or new.remise_par is not null or new.remise_at is not null
         or new.offert or new.prix_origine is not null then
        raise exception 'caisse: la TVA, les remises et les offerts ne s''ecrivent pas depuis l''ecran'
          using errcode = '42501';
      end if;
      if new.plat_id is not null then
        select p.prix_vente into v_prix
          from public.plats p
          join public.caisse_tickets t on t.etablissement_id = p.etablissement_id
         where p.id = new.plat_id and t.id = new.ticket_id;
        if not found then
          raise exception 'caisse: plat inconnu pour cet etablissement'
            using errcode = '42501';
        end if;
        new.prix_unitaire := coalesce(v_prix, 0);
      end if;
    else
      if new.taux_tva is distinct from old.taux_tva
         or new.a_emporter is distinct from old.a_emporter
         or new.remise_motif is distinct from old.remise_motif
         or new.remise_par is distinct from old.remise_par
         or new.remise_at is distinct from old.remise_at
         or new.offert is distinct from old.offert
         or new.prix_origine is distinct from old.prix_origine
         or new.remise_montant is distinct from old.remise_montant then
        raise exception 'caisse: la TVA, les remises et les offerts ne s''ecrivent pas depuis l''ecran'
          using errcode = '42501';
      end if;
      if new.prix_unitaire is distinct from old.prix_unitaire
         or new.plat_id is distinct from old.plat_id then
        raise exception 'caisse: le prix d''une ligne se baisse par une remise, avec un motif'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.prix_origine is not null and not new.offert
     and new.quantite is distinct from old.quantite then
    new.remise_montant := greatest(
      round(new.quantite * new.prix_origine, 2) - round(new.quantite * new.prix_unitaire, 2), 0);
  end if;

  return new;
end;
$$;

-- caisse_modifiers_kds (20261110_caisse_v6.sql)
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

-- caisse_qr_articles (20261122_caisse_commande_qr.sql)
create or replace function public.caisse_qr_articles(p_etab text, p_categories uuid[])
returns table (plat_id text, nom text, prix numeric, categorie_id uuid, photo_url text, en_rupture boolean)
language sql
stable
set search_path = public, pg_temp
as $$
  with reglage as (
    select coalesce(
             (select array_agg(x) from jsonb_array_elements_text(
                case when jsonb_typeof(r.config->'cartes_ids') = 'array' then r.config->'cartes_ids' else '[]'::jsonb end) x),
             '{}'::text[]) as ids
      from (select 1) un
      left join public.caisse_reglages r on r.etablissement_id = p_etab
  ),
  en_vente as (
    select c.id
      from public.cartes c, reglage g
     where c.etablissement_id = p_etab
       and not coalesce(c.archive, false)
       and not coalesce(c.masquee, false)
       and (cardinality(g.ids) = 0 or c.id = any(g.ids))
  ),
  actifs as (
    select p.* from public.plats p
     where p.etablissement_id = p_etab and coalesce(p.actif, true)
  ),
  sur_carte as (
    select a.* from actifs a
     where exists (select 1 from public.carte_plats cp join en_vente v on v.id = cp.carte_id where cp.plat_id = a.id)
  ),
  articles as (
    select * from sur_carte
    union all
    select a.* from actifs a, reglage g
     where cardinality(g.ids) = 0 and not exists (select 1 from sur_carte)
  ),
  ranges as (
    select a.id, a.nom, a.prix_vente, a.photo_url as photo_plat, b.photo_url as photo_bouton, b.rupture_le,
           coalesce(
             (select c.id from public.caisse_categories c
               where c.id = b.categorie_id and c.etablissement_id = p_etab),
             (select c.id from public.caisse_categories c
               where c.etablissement_id = p_etab
                 and lower(btrim(c.nom)) = lower(coalesce(nullif(btrim(a.categorie), ''), 'Plats'))
               order by c.ordre, c.nom limit 1)
           ) as categorie_id
      from articles a
      left join public.caisse_boutons b on b.plat_id = a.id and b.etablissement_id = p_etab
  )
  select r.id, r.nom, round(r.prix_vente, 2), r.categorie_id,
         case
           when coalesce(r.photo_bouton, r.photo_plat) like 'https://ppmtoiqgajwcdkbnrcll.supabase.co/storage/v1/object/public/%'
             then coalesce(r.photo_bouton, r.photo_plat)
         end,
         coalesce(r.rupture_le = (now() at time zone 'Europe/Zurich')::date, false)
    from ranges r
    join public.caisse_categories c on c.id = r.categorie_id and c.etablissement_id = p_etab and coalesce(c.actif, true)
   where r.categorie_id = any(p_categories)
     and r.prix_vente > 0;
$$;

-- commande_qr_carte (20261122_caisse_commande_qr.sql)
create or replace function public.commande_qr_carte(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_p      public.caisse_commande_qr_parametres%rowtype;
  v_nom    text;
  v_ouvert boolean;
begin
  if p_slug is null or lower(p_slug) !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  select * into v_p from public.caisse_commande_qr_parametres
   where slug = lower(p_slug) and actif;
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  select e.nom into v_nom from public.etablissements e
   where e.id = v_p.etablissement_id and coalesce(e.actif, true);
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;

  v_ouvert := public.caisse_qr_ouvert(v_p.plages, now());
  if not v_ouvert then
    return jsonb_build_object('etablissement', v_nom, 'ouvert', false, 'plages', v_p.plages,
                              'categories', '[]'::jsonb, 'produits', '[]'::jsonb);
  end if;

  return (
    with a as (
      select * from public.caisse_qr_articles(v_p.etablissement_id, v_p.categories) x where not x.en_rupture
    )
    select jsonb_build_object(
      'etablissement', v_nom,
      'ouvert', true,
      'plages', v_p.plages,
      'categories', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom) order by c.ordre, c.nom)
          from public.caisse_categories c
         where c.etablissement_id = v_p.etablissement_id
           and exists (select 1 from a where a.categorie_id = c.id)
      ), '[]'::jsonb),
      'produits', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', a.plat_id, 'nom', a.nom, 'prix', a.prix,
                 'categorie_id', a.categorie_id, 'photo', a.photo_url)
               order by a.categorie_id, b.ordre nulls last, a.nom)
          from a
          left join public.caisse_boutons b on b.plat_id = a.plat_id and b.etablissement_id = v_p.etablissement_id
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- commande_qr_envoyer (20261122_caisse_commande_qr.sql)
create or replace function public.commande_qr_envoyer(
  p_slug      text,
  p_table     text,
  p_au_bar    boolean,
  p_prenom    text,
  p_lignes    jsonb,
  p_appareil  text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_p         public.caisse_commande_qr_parametres%rowtype;
  v_prenom    text;
  v_table     text;
  v_table_id  text;
  v_table_nom text;
  v_au_bar    boolean := coalesce(p_au_bar, false);
  v_appareil  text;
  v_ip        text;
  v_source    text;
  v_n         int;
  v_lignes    jsonb;
  v_total     numeric;
  v_absents   jsonb;
  v_panier    jsonb;
  v_ouverts   jsonb;
  v_rupture   jsonb;
  v_articles  int;
  v_id        uuid;
begin
  -- Forme de l'adresse, puis la maison (inconnue ou éteinte : même réponse).
  if p_slug is null or lower(p_slug) !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  select * into v_p from public.caisse_commande_qr_parametres
   where slug = lower(p_slug) and actif;
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;
  perform 1 from public.etablissements e where e.id = v_p.etablissement_id and coalesce(e.actif, true);
  if not found then
    return jsonb_build_object('erreur', 'introuvable');
  end if;

  if not public.caisse_qr_ouvert(v_p.plages, now()) then
    return jsonb_build_object('erreur', 'ferme');
  end if;

  -- Appareil : un identifiant tiré au hasard par la page (forme d'un uuid).
  v_appareil := lower(btrim(coalesce(p_appareil, '')));
  if v_appareil !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('erreur', 'appareil');
  end if;

  -- Prénom : sans caractère de contrôle, espaces resserrés, 1 à 40 signes.
  v_prenom := btrim(regexp_replace(regexp_replace(coalesce(p_prenom, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
  if char_length(v_prenom) < 1 or char_length(v_prenom) > 40 then
    return jsonb_build_object('erreur', 'prenom');
  end if;

  -- Table : le nom exact d'une seule table active du plan de la maison, ou
  -- « au bar ». Deux tables du même nom (deux salles) : la commande ne sait
  -- pas laquelle, elle est refusée.
  if not v_au_bar then
    v_table := btrim(regexp_replace(coalesce(p_table, ''), '[[:cntrl:]]', '', 'g'));
    if char_length(v_table) < 1 or char_length(v_table) > 20 then
      return jsonb_build_object('erreur', 'table');
    end if;
    select count(*), min(st.id), min(st.nom) into v_n, v_table_id, v_table_nom
      from public.salle_tables st
      left join public.salles s on s.id = st.salle_id and s.etablissement_id = st.etablissement_id
     where st.etablissement_id = v_p.etablissement_id
       and coalesce(st.actif, true)
       and (st.salle_id is null or coalesce(s.actif, true))
       and lower(btrim(st.nom)) = lower(v_table);
    if v_n <> 1 then
      return jsonb_build_object('erreur', 'table');
    end if;
  end if;

  -- Panier : 1 à 20 lignes, chaque quantité entière de 1 à 10, au plus 30
  -- articles ; un même produit répété est réuni avant les bornes.
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array'
     or jsonb_array_length(p_lignes) < 1 or jsonb_array_length(p_lignes) > 20 then
    return jsonb_build_object('erreur', 'panier');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) e(v)
     where jsonb_typeof(e.v) <> 'object'
        or jsonb_typeof(e.v->'plat_id') is distinct from 'string'
        or char_length(e.v->>'plat_id') not between 1 and 80
        or jsonb_typeof(e.v->'quantite') is distinct from 'number'
        or (e.v->>'quantite') !~ '^[0-9]{1,2}$'
  ) then
    return jsonb_build_object('erreur', 'panier');
  end if;

  select jsonb_agg(jsonb_build_object('plat_id', k.plat_id, 'quantite', k.quantite))
    into v_panier
    from (select e.v->>'plat_id' as plat_id, sum((e.v->>'quantite')::int) as quantite
            from jsonb_array_elements(p_lignes) e(v)
           group by e.v->>'plat_id') k;

  if exists (select 1 from jsonb_to_recordset(v_panier) k(plat_id text, quantite int)
              where k.quantite < 1 or k.quantite > 10)
     or (select sum(k.quantite) from jsonb_to_recordset(v_panier) k(plat_id text, quantite int)) > 30 then
    return jsonb_build_object('erreur', 'panier');
  end if;

  -- Un envoi à la fois par établissement, une fois la forme vérifiée : les
  -- plafonds se comptent juste, et une rafale de requêtes mal formées ne
  -- fait attendre personne.
  perform pg_advisory_xact_lock(hashtextextended('commande_qr:' || v_p.etablissement_id, 0));

  -- Expiration : une commande qui attend depuis plus de 3 heures est refusée
  -- d'office ; elle ne compte plus dans les plafonds ni dans le bandeau.
  update public.caisse_commandes_qr
     set statut = 'refusee', motif_refus = 'Commande expirée', traitee_at = now()
   where etablissement_id = v_p.etablissement_id and statut = 'a_valider'
     and created_at < now() - interval '3 hours';

  -- Plafonds. Appareil : 2 envois par minute, 3 commandes en attente.
  select count(*) into v_n from public.caisse_commandes_qr_sources
   where appareil = v_appareil and created_at > now() - interval '1 minute';
  if v_n >= 2 then
    return jsonb_build_object('erreur', 'trop_vite');
  end if;
  select count(*) into v_n
    from public.caisse_commandes_qr_sources s
    join public.caisse_commandes_qr c on c.id = s.commande_id
   where s.appareil = v_appareil and c.statut = 'a_valider';
  if v_n >= 3 then
    return jsonb_build_object('erreur', 'en_attente');
  end if;

  -- Table : 3 commandes en attente au plus.
  if v_table_id is not null then
    select count(*) into v_n from public.caisse_commandes_qr
     where table_id = v_table_id and statut = 'a_valider';
    if v_n >= 3 then
      return jsonb_build_object('erreur', 'en_attente');
    end if;
  end if;

  -- Source réseau : l'adresse que la passerelle pose dans cf-connecting-ip
  -- (x-forwarded-for, que le client peut écrire, n'est pas lu). Un bar
  -- partage souvent un même accès Wi-Fi : plafonds larges, 10 envois par
  -- minute et 5 commandes en attente.
  begin
    v_ip := nullif(btrim(coalesce(current_setting('request.headers', true)::json->>'cf-connecting-ip', '')), '');
  exception when others then
    v_ip := null;
  end;
  if v_ip is not null then
    v_source := md5(v_ip || ':' || v_p.etablissement_id);
    select count(*) into v_n from public.caisse_commandes_qr_sources
     where source_empreinte = v_source and created_at > now() - interval '1 minute';
    if v_n >= 10 then
      return jsonb_build_object('erreur', 'trop_vite');
    end if;
    select count(*) into v_n
      from public.caisse_commandes_qr_sources s
      join public.caisse_commandes_qr c on c.id = s.commande_id
     where s.source_empreinte = v_source and c.statut = 'a_valider';
    if v_n >= 5 then
      return jsonb_build_object('erreur', 'en_attente');
    end if;
  end if;

  -- Établissement : au plus 30 commandes en attente et 20 par minute.
  select count(*) into v_n from public.caisse_commandes_qr
   where etablissement_id = v_p.etablissement_id and statut = 'a_valider';
  if v_n >= 30 then
    return jsonb_build_object('erreur', 'occupe');
  end if;
  select count(*) into v_n from public.caisse_commandes_qr
   where etablissement_id = v_p.etablissement_id and created_at > now() - interval '1 minute';
  if v_n >= 20 then
    return jsonb_build_object('erreur', 'occupe');
  end if;

  -- Produits : d'abord ouverts au QR (un produit hors carte ne dit rien de
  -- sa rupture), ensuite hors rupture du jour, au prix de la base.
  select coalesce(jsonb_agg(jsonb_build_object('plat_id', a.plat_id, 'nom', a.nom, 'prix', a.prix, 'rupture', a.en_rupture)), '[]'::jsonb)
    into v_ouverts
    from public.caisse_qr_articles(v_p.etablissement_id, v_p.categories) a;

  select coalesce(jsonb_agg(k.plat_id), '[]'::jsonb) into v_absents
    from jsonb_to_recordset(v_panier) k(plat_id text, quantite int)
   where not exists (select 1 from jsonb_to_recordset(v_ouverts) o(plat_id text, nom text, prix numeric, rupture boolean)
                      where o.plat_id = k.plat_id);
  if jsonb_array_length(v_absents) > 0 then
    return jsonb_build_object('erreur', 'produit', 'produits', v_absents);
  end if;

  select coalesce(jsonb_agg(k.plat_id), '[]'::jsonb) into v_rupture
    from jsonb_to_recordset(v_panier) k(plat_id text, quantite int)
    join jsonb_to_recordset(v_ouverts) o(plat_id text, nom text, prix numeric, rupture boolean) on o.plat_id = k.plat_id
   where o.rupture;
  if jsonb_array_length(v_rupture) > 0 then
    return jsonb_build_object('erreur', 'rupture', 'produits', v_rupture);
  end if;

  select jsonb_agg(jsonb_build_object('plat_id', o.plat_id, 'libelle', o.nom, 'quantite', k.quantite, 'prix_unitaire', o.prix)
                   order by o.nom),
         round(sum(k.quantite * o.prix), 2),
         sum(k.quantite)
    into v_lignes, v_total, v_articles
    from jsonb_to_recordset(v_panier) k(plat_id text, quantite int)
    join jsonb_to_recordset(v_ouverts) o(plat_id text, nom text, prix numeric, rupture boolean) on o.plat_id = k.plat_id;

  insert into public.caisse_commandes_qr
    (etablissement_id, table_id, table_nom, au_bar, prenom, lignes, total)
  values
    (v_p.etablissement_id, v_table_id, v_table_nom, v_au_bar, v_prenom, v_lignes, v_total)
  returning id into v_id;

  insert into public.caisse_commandes_qr_sources (commande_id, etablissement_id, appareil, source_empreinte)
  values (v_id, v_p.etablissement_id, v_appareil, v_source);

  -- Purge : rien ne reste plus de 30 jours (les sources suivent en cascade).
  delete from public.caisse_commandes_qr
   where etablissement_id = v_p.etablissement_id and created_at < now() - interval '30 days';

  return jsonb_build_object('ok', true, 'total', v_total, 'articles', v_articles);
end;
$$;

-- commande_qr_accepter (20261122_caisse_commande_qr.sql)
create or replace function public.commande_qr_accepter(p_commande_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       text := auth.uid()::text;
  v_c         public.caisse_commandes_qr%rowtype;
  v_ouverture jsonb;
  v_ticket    uuid;
  v_ids       uuid[];
  v_now       timestamptz := clock_timestamp();
  v_table_nom text;
  v_order_id  uuid;
begin
  if v_uid is null then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  select * into v_c from public.caisse_commandes_qr where id = p_commande_id for update;
  if not found then
    raise exception 'commande_qr: commande introuvable';
  end if;
  if public.caisse_peut_utiliser(v_c.etablissement_id) is not true then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_c.statut <> 'a_valider' then
    return jsonb_build_object('deja', v_c.statut, 'ticket_id', v_c.ticket_id);
  end if;
  -- Plus de 3 heures d'attente : la commande expire au lieu d'ouvrir un
  -- ticket pour une boisson commandée bien plus tôt.
  if v_c.created_at < now() - interval '3 hours' then
    update public.caisse_commandes_qr
       set statut = 'refusee', motif_refus = 'Commande expirée', traitee_par = v_uid, traitee_at = now()
     where id = v_c.id;
    return jsonb_build_object('deja', 'refusee', 'expiree', true);
  end if;
  -- La table a quitté le plan : le client est assis, la commande ne devient
  -- pas une vente au bar ; l'équipe la refuse.
  if not v_c.au_bar and v_c.table_id is null then
    raise exception 'commande_qr: table disparue, commande a refuser';
  end if;

  -- Le ticket : celui de la table (repris s'il est ouvert, sinon ouvert au
  -- nom d'un client de passage, par le chemin habituel), ou un ticket sans
  -- table pour une commande au bar.
  if not v_c.au_bar then
    v_ouverture := public.caisse_ouvrir_ticket(v_c.etablissement_id, v_c.table_id, 'passage', null, null, 1);
    v_ticket := (v_ouverture->>'ticket_id')::uuid;
  else
    insert into public.caisse_tickets (etablissement_id, table_id, ouvert_par, note)
    values (v_c.etablissement_id, null, v_uid, left('Commande QR de ' || v_c.prenom, 120))
    returning id into v_ticket;
  end if;
  if v_ticket is null then
    raise exception 'commande_qr: ticket introuvable';
  end if;

  -- Les lignes, au prix de vente de la base à cet instant (même règle que
  -- la garde caisse_ligne_garde_v7 pour une ligne posée depuis l'écran).
  with posees as (
    insert into public.caisse_lignes (ticket_id, plat_id, libelle, quantite, prix_unitaire, suite)
    select v_ticket, p.id, p.nom, x.quantite, coalesce(p.prix_vente, 0), 1
      from jsonb_to_recordset(v_c.lignes) as x(plat_id text, quantite int)
      join public.plats p on p.id = x.plat_id and p.etablissement_id = v_c.etablissement_id
     where x.quantite between 1 and 10
    returning id
  )
  select array_agg(id) into v_ids from posees;
  -- Un produit supprimé entre-temps : rien n'est posé à moitié.
  if v_ids is null or cardinality(v_ids) <> jsonb_array_length(v_c.lignes) then
    raise exception 'commande_qr: un produit a disparu, commande a refuser';
  end if;

  -- Le bon de ces seules lignes (les lignes en attente du serveur sur ce
  -- ticket ne partent pas). Même forme que caisse_bon_interne, étape 1.
  select st.nom into v_table_nom
    from public.caisse_tickets t
    join public.salle_tables st on st.id = t.table_id and st.etablissement_id = t.etablissement_id
   where t.id = v_ticket;

  insert into public.kds_orders (etablissement_id, ls_check_uuid, table_no, opened_at, status)
  values (
    v_c.etablissement_id,
    'caisse:' || v_ticket || ':1:' || md5(v_now::text || v_ticket::text),
    coalesce(v_table_nom, 'Bar, ' || v_c.prenom),
    v_now,
    'open'
  )
  returning id into v_order_id;

  insert into public.kds_order_items (kds_order_id, ls_line_key, nom, qty, modifiers, fired_at, a_suivre)
  select v_order_id, 'caisse:' || l.id, l.libelle, l.quantite,
         public.caisse_modifiers_kds(l.options, l.note), v_now, false
    from public.caisse_lignes l
   where l.id = any(v_ids);

  update public.caisse_lignes
     set statut = 'envoye', envoye_at = v_now
   where id = any(v_ids) and statut = 'en_attente';

  update public.caisse_commandes_qr
     set statut = 'acceptee', ticket_id = v_ticket, traitee_par = v_uid, traitee_at = now()
   where id = v_c.id;

  return jsonb_build_object('ticket_id', v_ticket, 'lignes', cardinality(v_ids), 'bon_id', v_order_id);
end;
$$;

-- 2. Formats
-- Une commande QR en attente qui nomme un format ne peut plus être honorée :
-- l'ancienne acceptation l'ignorerait et poserait la ligne au prix de vente
-- du plat. Elle est refusée avec un motif, comme une commande expirée.
update public.caisse_commandes_qr
   set statut = 'refusee', motif_refus = 'Commande annulée (mise à jour de la carte)', traitee_at = now()
 where statut = 'a_valider'
   and exists (select 1 from jsonb_array_elements(lignes) e(v) where e.v ? 'format_id');

drop table if exists public.plat_formats;
drop function if exists public.plat_formats_etablissement();

-- 3. Genre des cartes
alter table public.cartes drop constraint if exists cartes_genre_valeur;
alter table public.cartes drop column if exists genre;
