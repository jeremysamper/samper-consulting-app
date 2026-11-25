-- ============================================================================
-- Carte des boissons, lot C : les droits en base et le format au rapport
-- (23.11.2026).
--
-- 1. Droits. Jusqu'ici plat_formats, cartes, carte_plats et plats ne
--    vérifiaient que l'établissement : un serveur pouvait changer par l'API le
--    prix d'un format, que lisent caisse_ligne_garde_v7 et la page QR. Le
--    droit d'action carte_boissons (moduleConfig.js, requiertGerer) n'était
--    qu'une garde de présentation. Décision D7 : écriture des boissons par
--    « Modifier » du module boissons ET le droit carte_boissons, consultant et
--    patron par défaut, réglables par personne (user_peut_gerer, même règle
--    que canManageModule).
--
--    Garde en deux temps (D-C1, validée le 23.11.2026) :
--    - strict dès maintenant, là où aucun écran déployé n'écrit hors du module
--      Carte des boissons : les formats (créer, modifier, supprimer), la
--      création d'une carte de boissons et le changement de genre d'une
--      carte (déclencheur, revue SQL du 23.11.2026) ;
--    - sur une carte de boissons, ses liens et ses plats : le droit boissons,
--      OU le droit de l'écran qui l'écrit aujourd'hui (Cartes & Recettes en
--      ligne et Fiches salle : « Modifier » recettes pour les cartes, recettes
--      et fiches pour les plats et leurs cartes ; Chiffrage : le droit
--      chiffrage pour le plat, durable, D-C2). Ces droits hérités sortiront
--      par un contract (lot D), une fois les écrans alignés.
--    Policies RESTRICTIVE : elles s'ajoutent en ET aux policies existantes,
--    connues ou non. Les mets ne changent pas.
--
-- 2. Rapport. caisse_rapport_donnees rend dans chaque ligne « options »
--    réduit à l'élément format ([{ type: 'format', id, valeur }], [] sans
--    format) : le rapport range une boisson par format sans lire le libellé.
--    Ni les « sans » ni les messages au bar n'y entrent (D-C3). Signature,
--    droits et reste du corps identiques à 20261110_caisse_v8.sql.
--
-- Expand seul, idempotente, inerte au rejeu (aucune donnée écrite).
-- Inverse : 20261123_carte_boissons_droits.rollback.sql
-- ============================================================================

-- Un verrou qui ne vient pas vite fait échouer la migration plutôt que de faire
-- attendre la Caisse. Le fichier se joue en une seule transaction (un bloc DO
-- à l'application).
set local lock_timeout = '5s';

-- ----------------------------------------------------------------------------
-- 1. Les deux questions que posent les policies
-- ----------------------------------------------------------------------------
-- L'appelant peut-il modifier la carte des boissons ? Reflet de
-- canManageModule(role, 'boissons') && canManageModule(role, 'carte_boissons')
-- (requiertGerer). Faux sans session, sans profil ou pour un compte désactivé
-- (user_peut_gerer lit current_user_role).
create or replace function public.boissons_peut_modifier()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select coalesce(public.user_peut_gerer('boissons', array['consultant', 'patron']), false)
     and coalesce(public.user_peut_gerer('carte_boissons', array['consultant', 'patron']), false);
$function$;

revoke all on function public.boissons_peut_modifier() from public, anon, authenticated;
grant execute on function public.boissons_peut_modifier() to authenticated, service_role;

comment on function public.boissons_peut_modifier() is
  'Carte des boissons (lot C) : droit « Modifier » du module boissons ET droit d''action carte_boissons de l''appelant (user_peut_gerer, consultant et patron par défaut). Même règle que l''écran (requiertGerer).';

-- Un plat est une boisson s'il est rangé sur une carte de boissons ou s'il a
-- au moins un format. SECURITY INVOKER : lu sous la RLS de l'appelant, qui ne
-- voit que les lignes de ses établissements.
create or replace function public.plat_est_boisson(p_plat_id text)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select exists (
           select 1
             from public.carte_plats cp
             join public.cartes c on c.id = cp.carte_id
            where cp.plat_id = p_plat_id
              and c.genre = 'boissons')
      or exists (
           select 1 from public.plat_formats f where f.plat_id = p_plat_id);
$function$;

revoke all on function public.plat_est_boisson(text) from public, anon, authenticated;
grant execute on function public.plat_est_boisson(text) to authenticated, service_role;

comment on function public.plat_est_boisson(text) is
  'Carte des boissons (lot C) : vrai si le plat est rangé sur une carte de genre boissons ou a au moins un format. Lu sous la RLS de l''appelant.';

-- ----------------------------------------------------------------------------
-- 2. Formats : écriture réservée au droit boissons
-- ----------------------------------------------------------------------------
-- Une policy permissive inconnue s'ajouterait en OU et rouvrirait la table :
-- la migration refuse de remplacer les policies s'il en existe une autre que
-- celles du lot A.
do $$
declare
  v_autres text;
begin
  select string_agg(p.polname, ', ' order by p.polname) into v_autres
    from pg_policy p
   where p.polrelid = 'public.plat_formats'::regclass
     and p.polname not in ('plat_formats_select', 'plat_formats_insert', 'plat_formats_update', 'plat_formats_delete');
  if v_autres is not null then
    raise exception 'plat_formats : policies inconnues (%), migration arretee', v_autres;
  end if;
end $$;

drop policy if exists plat_formats_insert on public.plat_formats;
create policy plat_formats_insert on public.plat_formats
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.boissons_peut_modifier())
  );

drop policy if exists plat_formats_update on public.plat_formats;
create policy plat_formats_update on public.plat_formats
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.boissons_peut_modifier())
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.boissons_peut_modifier())
  );

drop policy if exists plat_formats_delete on public.plat_formats;
create policy plat_formats_delete on public.plat_formats
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.boissons_peut_modifier())
  );

comment on table public.plat_formats is
  'Carte des boissons : formats de vente d''une boisson (libellé, prix, rang). Établissement recopié du plat. Lecture : l''équipe de l''établissement ; écriture : droit boissons et carte_boissons (lot C, boissons_peut_modifier).';

-- ----------------------------------------------------------------------------
-- 3. Cartes de boissons
-- ----------------------------------------------------------------------------
-- Créer une carte de boissons : droit boissons seul (seul le module Carte des
-- boissons envoie genre). La modifier ou la supprimer : droit boissons, ou
-- « Modifier » recettes (Cartes & Recettes en ligne et Fiches salle les
-- renomment, archivent, ordonnent et suppriment ; retiré au lot D).
drop policy if exists cartes_boissons_insert on public.cartes;
create policy cartes_boissons_insert on public.cartes
  as restrictive
  for insert to authenticated
  with check (
    genre <> 'boissons'
    or (select public.boissons_peut_modifier())
  );

drop policy if exists cartes_boissons_update on public.cartes;
create policy cartes_boissons_update on public.cartes
  as restrictive
  for update to authenticated
  using (
    genre <> 'boissons'
    or (select public.boissons_peut_modifier())
    or (select public.user_peut_gerer('recettes', array['consultant', 'patron', 'resp_cuisine']))
  )
  with check (
    genre <> 'boissons'
    or (select public.boissons_peut_modifier())
    or (select public.user_peut_gerer('recettes', array['consultant', 'patron', 'resp_cuisine']))
  );

drop policy if exists cartes_boissons_delete on public.cartes;
create policy cartes_boissons_delete on public.cartes
  as restrictive
  for delete to authenticated
  using (
    genre <> 'boissons'
    or (select public.boissons_peut_modifier())
    or (select public.user_peut_gerer('recettes', array['consultant', 'patron', 'resp_cuisine']))
  );

-- Changer le genre d'une carte, dans un sens ou dans l'autre : droit boissons
-- seul. Le WITH CHECK d'une policy ne voit pas l'ancienne ligne : sans ce
-- déclencheur, « Modifier » recettes sortirait une carte de la garde en la
-- passant en mets. Aucun écran ne change le genre (upsertCarte ne l'envoie
-- qu'à la création). Le propriétaire de la base passe (migrations, données).
create or replace function public.cartes_genre_garde()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.genre is distinct from old.genre
     and current_user not in ('postgres', 'supabase_admin')
     and not coalesce((select public.boissons_peut_modifier()), false) then
    raise exception 'cartes: le genre d''une carte ne change qu''avec le droit boissons'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.cartes_genre_garde() from public, anon, authenticated;

drop trigger if exists trg_cartes_genre_garde on public.cartes;
create trigger trg_cartes_genre_garde
  before update of genre on public.cartes
  for each row execute function public.cartes_genre_garde();

-- ----------------------------------------------------------------------------
-- 4. Liens d'une carte de boissons (carte_plats)
-- ----------------------------------------------------------------------------
-- Droit boissons, ou recettes ET fiches (éditeur de plats et import de
-- Cartes & Recettes en ligne ; retiré au lot D).
drop policy if exists carte_plats_boissons_insert on public.carte_plats;
create policy carte_plats_boissons_insert on public.carte_plats
  as restrictive
  for insert to authenticated
  with check (
    not exists (select 1 from public.cartes c where c.id = carte_plats.carte_id and c.genre = 'boissons')
    or (select public.boissons_peut_modifier())
    or ((select public.user_peut_gerer('recettes', array['consultant', 'patron', 'resp_cuisine']))
        and (select public.user_peut_gerer('fiches', array['consultant', 'patron'])))
  );

drop policy if exists carte_plats_boissons_update on public.carte_plats;
create policy carte_plats_boissons_update on public.carte_plats
  as restrictive
  for update to authenticated
  using (
    not exists (select 1 from public.cartes c where c.id = carte_plats.carte_id and c.genre = 'boissons')
    or (select public.boissons_peut_modifier())
    or ((select public.user_peut_gerer('recettes', array['consultant', 'patron', 'resp_cuisine']))
        and (select public.user_peut_gerer('fiches', array['consultant', 'patron'])))
  )
  with check (
    not exists (select 1 from public.cartes c where c.id = carte_plats.carte_id and c.genre = 'boissons')
    or (select public.boissons_peut_modifier())
    or ((select public.user_peut_gerer('recettes', array['consultant', 'patron', 'resp_cuisine']))
        and (select public.user_peut_gerer('fiches', array['consultant', 'patron'])))
  );

drop policy if exists carte_plats_boissons_delete on public.carte_plats;
create policy carte_plats_boissons_delete on public.carte_plats
  as restrictive
  for delete to authenticated
  using (
    not exists (select 1 from public.cartes c where c.id = carte_plats.carte_id and c.genre = 'boissons')
    or (select public.boissons_peut_modifier())
    or ((select public.user_peut_gerer('recettes', array['consultant', 'patron', 'resp_cuisine']))
        and (select public.user_peut_gerer('fiches', array['consultant', 'patron'])))
  );

-- ----------------------------------------------------------------------------
-- 5. Plats de boissons
-- ----------------------------------------------------------------------------
-- Modifier : droit boissons, ou chiffrage (le Chiffrage réécrit le plat entier,
-- prix de vente compris, D-C2), ou recettes ET fiches (retiré au lot D).
-- Supprimer : droit boissons, ou recettes ET fiches. La suppression d'un plat
-- emporte ses formats et ses liens en cascade, sans repasser par leurs
-- policies : d'où la garde sur le plat lui-même.
-- L'insertion n'est pas gardée : un plat neuf n'est encore sur aucune carte.
drop policy if exists plats_boissons_update on public.plats;
create policy plats_boissons_update on public.plats
  as restrictive
  for update to authenticated
  using (
    (select public.boissons_peut_modifier())
    or (select public.user_peut_gerer('chiffrage', array['consultant', 'patron']))
    or ((select public.user_peut_gerer('recettes', array['consultant', 'patron', 'resp_cuisine']))
        and (select public.user_peut_gerer('fiches', array['consultant', 'patron'])))
    or not public.plat_est_boisson(id)
  )
  with check (
    (select public.boissons_peut_modifier())
    or (select public.user_peut_gerer('chiffrage', array['consultant', 'patron']))
    or ((select public.user_peut_gerer('recettes', array['consultant', 'patron', 'resp_cuisine']))
        and (select public.user_peut_gerer('fiches', array['consultant', 'patron'])))
    or not public.plat_est_boisson(id)
  );

drop policy if exists plats_boissons_delete on public.plats;
create policy plats_boissons_delete on public.plats
  as restrictive
  for delete to authenticated
  using (
    (select public.boissons_peut_modifier())
    or ((select public.user_peut_gerer('recettes', array['consultant', 'patron', 'resp_cuisine']))
        and (select public.user_peut_gerer('fiches', array['consultant', 'patron'])))
    or not public.plat_est_boisson(id)
  );

-- ----------------------------------------------------------------------------
-- 6. Rapport de caisse : le format de chaque ligne
-- ----------------------------------------------------------------------------
-- Reprise de 20261110_caisse_v8.sql, une seule clé ajoutée aux lignes.
create or replace function public.caisse_rapport_donnees(
  p_etablissement_id text, p_debut date, p_fin date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role      text;
  v_direction boolean;
  v_resultat  jsonb;
begin
  v_role := public.caisse_role_actif(p_etablissement_id);
  if v_role is null or not (v_role = any(array['consultant', 'patron', 'resp_cuisine'])) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if p_debut is null or p_fin is null or p_fin < p_debut or p_fin - p_debut > 61 then
    raise exception 'caisse: periode de rapport invalide';
  end if;
  v_direction := v_role = any(array['consultant', 'patron']);

  with pieces as (
    -- LE filtre des rapports : de vrais tickets numerotes, jamais un ticket
    -- de test, jamais un ticket ouvert ni un abandon.
    select t.*
      from public.caisse_tickets t
     where t.etablissement_id = p_etablissement_id
       and t.test = false
       and t.numero is not null
       and (t.jour_exploitation between p_debut and p_fin
            or t.annule_jour between p_debut and p_fin)
  ), abandons as (
    select t.id, t.jour_exploitation as jour, t.closed_at, t.ouvert_par,
           (select coalesce(sum(round(l.quantite * l.prix_unitaire, 2)), 0)
              from public.caisse_lignes l
             where l.ticket_id = t.id and l.statut <> 'en_attente') as montant
      from public.caisse_tickets t
     where v_direction
       and t.etablissement_id = p_etablissement_id
       and t.test = false
       and t.numero is null
       and t.statut = 'annule'
       and t.jour_exploitation between p_debut and p_fin
  ), reglements as (
    select p.*
      from pieces t
      join public.caisse_paiements p on p.ticket_id = t.id
     where v_direction
  ), lignes as (
    select l.*, t.etablissement_id
      from pieces t
      join public.caisse_lignes l on l.ticket_id = t.id
  ), acteurs as (
    select ouvert_par as id from pieces
    union select annule_par from pieces
    union select remise_par from lignes
    union select encaisse_par from reglements
    union select ouvert_par from abandons
  )
  select jsonb_build_object(
    'niveau', case when v_direction then 'direction' else 'cuisine' end,
    'etablissement_id', p_etablissement_id,
    'debut', p_debut,
    'fin', p_fin,
    'jour_courant', public.caisse_jour_exploitation(p_etablissement_id, now()),
    'premier_jour', (
      select min(t.jour_exploitation) from public.caisse_tickets t
       where t.etablissement_id = p_etablissement_id and t.test = false and t.numero is not null),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'numero', t.numero, 'annee', t.annee, 'statut', t.statut, 'test', t.test,
               'service', t.service, 'jour', t.jour_exploitation,
               'annule_jour', t.annule_jour, 'annule_at', t.annule_at,
               'annule_motif', case when v_direction then t.annule_motif end,
               'annule_par', case when v_direction then t.annule_par end,
               'a_emporter', t.a_emporter, 'couverts', t.couverts, 'total_ttc', t.total_ttc,
               'created_at', t.created_at, 'closed_at', t.closed_at,
               'sur_table', t.table_id is not null,
               'origine', case
                 when r.id is not null and r.origine is distinct from 'passage' then 'reservation'
                 when r.id is not null or t.table_id is not null then 'passage'
                 else 'direct' end,
               'compte_client', t.client_id is not null,
               'ouvert_par', case when v_direction then t.ouvert_par end)
             order by t.annee, t.numero)
        from pieces t
        left join public.reservations r
          on r.id = t.reservation_id and r.etablissement_id = t.etablissement_id), '[]'::jsonb),
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'ticket_id', l.ticket_id, 'plat_id', l.plat_id, 'libelle', l.libelle,
               'categorie', case
                 when l.plat_id is null then 'Article libre'
                 else coalesce(c.nom, coalesce(nullif(btrim(pl.categorie), ''), 'Plats')) end,
               'quantite', l.quantite, 'prix_unitaire', l.prix_unitaire, 'prix_origine', l.prix_origine,
               'remise_montant', l.remise_montant,
               'remise_motif', case when v_direction then l.remise_motif end,
               'remise_par', case when v_direction then l.remise_par end,
               'remise_at', l.remise_at, 'offert', l.offert, 'taux_tva', l.taux_tva,
               -- Carte des boissons, lot C : l'element format de la ligne
               -- seul (ni « sans » ni message au bar), [] sans format.
               'options', coalesce((
                 select jsonb_agg(o.v order by o.n)
                   from jsonb_array_elements(case when jsonb_typeof(l.options) = 'array'
                                                  then l.options else '[]'::jsonb end)
                        with ordinality o(v, n)
                  where o.v->>'type' = 'format'), '[]'::jsonb))
             order by l.created_at, l.id)
        from lignes l
        left join public.plats pl
          on pl.id = l.plat_id and pl.etablissement_id = l.etablissement_id
        left join lateral (
          select coalesce(
            (select cc.nom
               from public.caisse_boutons b
               join public.caisse_categories cc
                 on cc.id = b.categorie_id and cc.etablissement_id = b.etablissement_id
              where b.plat_id = l.plat_id and b.etablissement_id = l.etablissement_id
              order by cc.nom limit 1),
            (select cc.nom
               from public.caisse_categories cc
              where cc.etablissement_id = l.etablissement_id
                and lower(btrim(cc.nom)) = lower(coalesce(nullif(btrim(pl.categorie), ''), 'Plats'))
              order by cc.nom limit 1)) as nom) c on l.plat_id is not null), '[]'::jsonb),
    'paiements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'ticket_id', p.ticket_id, 'moyen', p.moyen, 'libelle', p.libelle,
               'montant', p.montant, 'arrondi', p.arrondi, 'pourboire', p.pourboire, 'rendu', p.rendu,
               'encaisse_par', p.encaisse_par)
             order by p.created_at, p.id)
        from reglements p), '[]'::jsonb),
    'clotures', coalesce((
      select jsonb_agg(
               case when v_direction then jsonb_build_object(
                 'id', c.id, 'jour', c.jour_exploitation, 'numero', c.numero, 'complement_de', c.complement_de,
                 'cloture_at', c.cloture_at, 'cloture_par_nom', c.cloture_par_nom, 'totaux', c.totaux,
                 'fond_caisse', c.fond_caisse, 'especes_comptees', c.especes_comptees, 'ecart', c.ecart,
                 'motif', c.motif, 'empreinte', c.empreinte)
               else jsonb_build_object(
                 'id', c.id, 'jour', c.jour_exploitation, 'numero', c.numero, 'complement_de', c.complement_de,
                 'cloture_at', c.cloture_at) end
             order by c.numero)
        from public.caisse_clotures c
       where c.etablissement_id = p_etablissement_id
         and c.jour_exploitation between p_debut and p_fin), '[]'::jsonb),
    'ventes_jour', coalesce((
      select jsonb_agg(jsonb_build_object(
               'jour', v.jour, 'taux', v.taux, 'montant_ttc', v.montant_ttc, 'source', v.source)
             order by v.jour, v.taux)
        from public.ventes_jour v
       where v_direction
         and v.etablissement_id = p_etablissement_id
         and v.jour between p_debut and p_fin), '[]'::jsonb),
    'personnes', coalesce((
      select jsonb_object_agg(p.id, coalesce(nullif(btrim(concat_ws(' ', p.prenom, p.nom)), ''), 'Sans nom'))
        from public.profiles p
       where v_direction
         and p.id in (select a.id from acteurs a where a.id is not null)), '{}'::jsonb),
    'abandons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'jour', a.jour, 'closed_at', a.closed_at, 'ouvert_par', a.ouvert_par, 'montant', a.montant)
             order by a.closed_at, a.id)
        from abandons a), '[]'::jsonb),
    'corrections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', j.id, 'jour', j.jour, 'created_at', j.created_at, 'acteur_nom', j.acteur_nom,
               'libelle', j.libelle, 'colonnes', to_jsonb(j.colonnes_modifiees))
             order by j.created_at, j.id)
        from (
          select x.*, public.caisse_jour_exploitation(p_etablissement_id, x.created_at) as jour
            from public.journal_activite x
           where v_direction
             and x.etablissement_id = p_etablissement_id
             and x.module = 'caisse'
             and x.libelle like 'Réservation du %'
             and x.created_at >= (p_debut::timestamp at time zone 'Europe/Zurich')
             and x.created_at < ((p_fin + 2)::timestamp at time zone 'Europe/Zurich')
           order by x.created_at
           limit 2000
        ) j
       where j.jour between p_debut and p_fin), '[]'::jsonb),
    'tests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', j.id, 'jour', j.jour, 'created_at', j.created_at, 'action', j.action,
               'auteur_nom', j.auteur_nom, 'poste', j.poste, 'nombre', j.nombre, 'montant', j.montant)
             order by j.created_at, j.id)
        from (
          select x.*, public.caisse_jour_exploitation(p_etablissement_id, x.created_at) as jour
            from public.caisse_tests_journal x
           where v_direction
             and x.etablissement_id = p_etablissement_id
             and x.created_at >= (p_debut::timestamp at time zone 'Europe/Zurich')
             and x.created_at < ((p_fin + 2)::timestamp at time zone 'Europe/Zurich')
           order by x.created_at
           limit 2000
        ) j
       where j.jour between p_debut and p_fin), '[]'::jsonb)
  ) into v_resultat;

  return v_resultat;
end;
$$;

-- Droits inchangés (create or replace les garde), rappelés pour la lecture.
revoke execute on function public.caisse_rapport_donnees(text, date, date) from public, anon, authenticated;
grant  execute on function public.caisse_rapport_donnees(text, date, date) to authenticated;

comment on function public.caisse_rapport_donnees(text, date, date) is
  'Caisse v8 : lecture des rapports sur une fenetre de 62 jours au plus. Vrais tickets numerotes seulement (jamais un ticket de test). Consultant et patron : tout ; resp_cuisine : tickets et lignes, sans paiement ni contenu des clotures ; autres roles : refus. Carte des boissons (lot C) : chaque ligne rend options reduit a l''element format.';
