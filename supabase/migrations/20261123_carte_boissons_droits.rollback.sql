-- ============================================================================
-- Inverse de 20261123_carte_boissons_droits.sql (Carte des boissons, lot C).
-- Remet les policies d'écriture de plat_formats du lot A (toute l'équipe de
-- l'établissement), retire les policies restrictives des cartes de boissons,
-- de leurs liens et de leurs plats, puis les deux fonctions, et rend à
-- caisse_rapport_donnees le corps de 20261110_caisse_v8.sql.
-- Le front du lot C lit le format dans options et retombe sur le libellé
-- quand la clé manque : il reste compatible. Idempotent.
-- ============================================================================

set local lock_timeout = '5s';

drop policy if exists plats_boissons_update on public.plats;
drop policy if exists plats_boissons_delete on public.plats;
drop policy if exists carte_plats_boissons_insert on public.carte_plats;
drop policy if exists carte_plats_boissons_update on public.carte_plats;
drop policy if exists carte_plats_boissons_delete on public.carte_plats;
drop policy if exists cartes_boissons_insert on public.cartes;
drop policy if exists cartes_boissons_update on public.cartes;
drop policy if exists cartes_boissons_delete on public.cartes;

drop policy if exists plat_formats_insert on public.plat_formats;
create policy plat_formats_insert on public.plat_formats
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id));

drop policy if exists plat_formats_update on public.plat_formats;
create policy plat_formats_update on public.plat_formats
  for update to authenticated
  using (user_can_access_etab(etablissement_id))
  with check (user_can_access_etab(etablissement_id));

drop policy if exists plat_formats_delete on public.plat_formats;
create policy plat_formats_delete on public.plat_formats
  for delete to authenticated
  using (user_can_access_etab(etablissement_id));

comment on table public.plat_formats is
  'Carte des boissons (lot A) : formats de vente d''une boisson (libellé, prix, rang). Établissement recopié du plat. Lecture et écriture : l''équipe de l''établissement, comme plats.';

-- Le déclencheur du genre appelle boissons_peut_modifier sans dépendance
-- enregistrée : il part avant elle.
drop trigger if exists trg_cartes_genre_garde on public.cartes;
drop function if exists public.cartes_genre_garde();
drop function if exists public.plat_est_boisson(text);
drop function if exists public.boissons_peut_modifier();

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
               'remise_at', l.remise_at, 'offert', l.offert, 'taux_tva', l.taux_tva)
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

revoke execute on function public.caisse_rapport_donnees(text, date, date) from public, anon, authenticated;
grant  execute on function public.caisse_rapport_donnees(text, date, date) to authenticated;

comment on function public.caisse_rapport_donnees(text, date, date) is
  'Caisse v8 : lecture des rapports sur une fenetre de 62 jours au plus. Vrais tickets numerotes seulement (jamais un ticket de test). Consultant et patron : tout ; resp_cuisine : tickets et lignes, sans paiement ni contenu des clotures ; autres roles : refus.';
