-- ============================================================================
-- Caisse v8 - rapports et sortie comptable.
--
--   ventes_jour (Comptabilite) : + la source 'caisse', propre a la caisse
--     native. La cloture d'un jour y ecrit le net du jour (ventes moins
--     annulations), une ligne par taux, par un declencheur de caisse_clotures.
--     Regle de priorite existante gardee : une saisie a la main garde la main
--     pour son jour.
--       - une saisie existe deja pour le jour : la cloture n'ecrit rien ;
--       - une personne modifie, ajoute ou retire une ligne d'un jour ecrit par
--         la caisse : tout le jour passe a 'manuel' (les lignes ne mentent
--         jamais sur leur origine) ;
--       - pour revenir au chiffre de la caisse : retirer la saisie du jour,
--         puis faire une cloture complementaire, qui reecrit les lignes.
--     Rejouer une cloture ne double rien : unicite par etablissement, jour et
--     taux, et une cloture complementaire refige les memes ventes.
--     Le net d'un taux peut etre negatif (un jour qui ne porte que
--     l'annulation d'un ticket de la veille) : la contrainte de montant
--     l'accepte pour la source 'caisse' seulement.
--
--   RPC caisse_rapport_donnees(etablissement, debut, fin) : la lecture des
--     tickets pour TOUS les rapports. Le filtre des tickets de test et des
--     tickets sans numero y est pose une fois. Ce qu'elle rend depend du role :
--       consultant, patron : tout (tickets, lignes, paiements, clotures,
--         lignes ventes_jour, personnes, abandons, corrections de reservation,
--         trace du mode test) ;
--       resp_cuisine : les tickets et leurs lignes (plats vendus, services),
--         sans paiement, sans contenu des clotures, sans auteur ni motif ;
--       tout autre role, compte desactive, autre etablissement : refus.
--     Aucun role ne perd un acces : les tables gardent leurs policies.
--
-- Aucune table neuve, aucune colonne neuve, aucune donnee semee, aucune
-- policy modifiee. Les fonctions de la v7 ne sont pas reecrites : l'ecriture
-- de ventes_jour vit dans un declencheur a part.
--
-- Migration additive (expand). Rejouable et inerte au rejeu : elle n'ecrit
-- aucune ligne. Rollback en fin. Heures stockees en UTC, lues en
-- Europe/Zurich.
-- ============================================================================

set local lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. ventes_jour : la source 'caisse'
-- ----------------------------------------------------------------------------
-- Les deux contraintes sont remplacees par une version plus large, dans la
-- meme transaction ; rien de ce qui passait avant n'est refuse apres.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.ventes_jour'::regclass and conname = 'ventes_jour_source_check'
       and pg_get_constraintdef(oid) not like '%caisse%') then
    alter table public.ventes_jour drop constraint ventes_jour_source_check;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ventes_jour'::regclass and conname = 'ventes_jour_source_check') then
    alter table public.ventes_jour
      add constraint ventes_jour_source_check check (source in ('manuel', 'pos', 'caisse'));
  end if;

  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.ventes_jour'::regclass and conname = 'ventes_jour_montant_ttc_check'
       and pg_get_constraintdef(oid) not like '%caisse%') then
    alter table public.ventes_jour drop constraint ventes_jour_montant_ttc_check;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ventes_jour'::regclass and conname = 'ventes_jour_montant_ttc_check') then
    alter table public.ventes_jour
      add constraint ventes_jour_montant_ttc_check check (
        montant_ttc < 10000000
        and (montant_ttc >= 0 or (source = 'caisse' and montant_ttc > -10000000)));
  end if;
end $$;

comment on column public.ventes_jour.source is
  'manuel : saisi dans Comptabilite. caisse : ecrit par la cloture de la caisse native (caisse v8), net du jour par taux ; toute retouche a la main fait passer le jour a manuel. pos : reserve, jamais ecrit.';

-- ----------------------------------------------------------------------------
-- 2. ventes_jour : une ligne ne ment pas sur son origine
-- ----------------------------------------------------------------------------
-- Le declencheur de la cloture (section 3) leve un drapeau de transaction
-- (caisse.cloture_ecrit) le temps de son ecriture : c'est la seule ecriture
-- admise sous la source 'caisse'. Un compte de l'API ne peut pas lever ce
-- drapeau (aucune fonction exposee ne le pose) ; et le drapeau seul ne suffit
-- pas : l'ecriture doit aussi venir d'un declencheur (profondeur 2 au moins),
-- jamais d'une instruction directe.
--
-- 2.1 Avant l'ecriture. SECURITY INVOKER : aucune ecriture privilegiee ici.
--   - personne d'autre que la cloture ne cree une ligne 'caisse' ni ne remet
--     une ligne a 'caisse' ;
--   - un montant modifie sur une ligne 'caisse' en fait une ligne 'manuel'.
create or replace function public.ventes_jour_garde_source()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() > 1
     and coalesce(current_setting('caisse.cloture_ecrit', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.source = 'caisse' then
      raise exception 'ventes_jour: la source caisse est ecrite par la cloture de caisse seulement'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if new.source = 'caisse' and old.source is distinct from 'caisse' then
    raise exception 'ventes_jour: la source caisse est ecrite par la cloture de caisse seulement'
      using errcode = '42501';
  end if;
  if old.source = 'caisse' and new.source = 'caisse'
     and new.montant_ttc is distinct from old.montant_ttc then
    new.source := 'manuel';
  end if;
  return new;
end;
$$;

revoke all on function public.ventes_jour_garde_source() from public, anon, authenticated;

drop trigger if exists trg_ventes_jour_garde_source on public.ventes_jour;
create trigger trg_ventes_jour_garde_source
  before insert or update on public.ventes_jour
  for each row execute function public.ventes_jour_garde_source();

-- 2.2 Apres l'ecriture. SECURITY DEFINER : la colonne source ne s'ecrit pas
-- par l'API (droits de colonnes de 20261030_comptabilite), c'est la base qui
-- la tient. Une saisie sur un jour ecrit par la caisse (ligne ajoutee, montant
-- modifie, ligne retiree) fait passer les autres lignes 'caisse' du jour a
-- 'manuel'. Une ligne au net negatif reste 'caisse' (une saisie ne peut pas
-- etre negative) : le jour est de toute facon lu comme saisi des qu'une de
-- ses lignes l'est. Le passage d'une ligne a 'manuel' par ce declencheur ne
-- change pas son montant : il ne se relance pas lui-meme.
create or replace function public.ventes_jour_saisie_prime()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etab text;
  v_jour date;
  v_id   text;
begin
  if coalesce(current_setting('caisse.cloture_ecrit', true), '') = '1' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.montant_ttc is not distinct from old.montant_ttc then
    return null;
  end if;
  if tg_op = 'DELETE' then
    v_etab := old.etablissement_id; v_jour := old.jour; v_id := old.id;
  else
    v_etab := new.etablissement_id; v_jour := new.jour; v_id := new.id;
  end if;
  update public.ventes_jour v
     set source = 'manuel'
   where v.etablissement_id = v_etab
     and v.jour = v_jour
     and v.source = 'caisse'
     and v.montant_ttc >= 0
     and v.id <> v_id;
  return null;
end;
$$;

revoke all on function public.ventes_jour_saisie_prime() from public, anon, authenticated;

drop trigger if exists trg_ventes_jour_saisie_prime on public.ventes_jour;
create trigger trg_ventes_jour_saisie_prime
  after insert or update or delete on public.ventes_jour
  for each row execute function public.ventes_jour_saisie_prime();

-- ----------------------------------------------------------------------------
-- 3. La cloture ecrit les ventes du jour
-- ----------------------------------------------------------------------------
-- Apres l'insertion d'une cloture (du jour ou complementaire) : le net du
-- jour, une ligne par taux, sous la source 'caisse'. Dans la transaction de
-- la cloture : la cloture et ses lignes passent ensemble, ou pas du tout.
--   - une saisie a la main existe pour ce jour : rien n'est ecrit ;
--   - sinon les lignes 'caisse' du jour sont remplacees par celles de cette
--     cloture (une cloture complementaire refige les memes ventes : memes
--     montants, rien ne double) ;
--   - un jour cloture sans aucune vente recoit une ligne a 0 au taux normal :
--     le jour est connu de la Comptabilite, il ne « manque » pas.
-- Aucun ticket de test n'entre ici : caisse_totaux_jour ne les lit pas.
create or replace function public.caisse_cloture_vers_ventes_jour()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_note text := 'Clôture de caisse n° ' || new.numero;
begin
  if exists (
    select 1 from public.ventes_jour v
     where v.etablissement_id = new.etablissement_id
       and v.jour = new.jour_exploitation
       and v.source <> 'caisse') then
    return null;
  end if;

  perform set_config('caisse.cloture_ecrit', '1', true);

  delete from public.ventes_jour v
   where v.etablissement_id = new.etablissement_id
     and v.jour = new.jour_exploitation
     and v.source = 'caisse'
     and not exists (
       select 1 from jsonb_array_elements(coalesce(new.totaux #> '{net,par_taux}', '[]'::jsonb)) x
        where (x ->> 'taux')::numeric = v.taux);

  insert into public.ventes_jour as v (etablissement_id, jour, taux, montant_ttc, source, note, created_by)
  select new.etablissement_id, new.jour_exploitation, (x ->> 'taux')::numeric, (x ->> 'ttc')::numeric,
         'caisse', v_note, new.cloture_par
    from jsonb_array_elements(coalesce(new.totaux #> '{net,par_taux}', '[]'::jsonb)) x
  on conflict (etablissement_id, jour, taux)
  do update set montant_ttc = excluded.montant_ttc, note = excluded.note
   where v.source = 'caisse';

  if not exists (
    select 1 from public.ventes_jour v
     where v.etablissement_id = new.etablissement_id and v.jour = new.jour_exploitation) then
    insert into public.ventes_jour (etablissement_id, jour, taux, montant_ttc, source, note, created_by)
    values (new.etablissement_id, new.jour_exploitation, 8.1, 0, 'caisse', v_note, new.cloture_par)
    on conflict (etablissement_id, jour, taux) do nothing;
  end if;

  perform set_config('caisse.cloture_ecrit', '', true);
  return null;
end;
$$;

revoke all on function public.caisse_cloture_vers_ventes_jour() from public, anon, authenticated;

drop trigger if exists trg_caisse_cloture_ventes_jour on public.caisse_clotures;
create trigger trg_caisse_cloture_ventes_jour
  after insert on public.caisse_clotures
  for each row execute function public.caisse_cloture_vers_ventes_jour();

-- ----------------------------------------------------------------------------
-- 4. RPC caisse_rapport_donnees : la lecture des rapports
-- ----------------------------------------------------------------------------
-- Lecture seule. Le role est lu dans une variable avant toute requete
-- (caisse_role_actif : compte actif, rattache a l'etablissement).
-- Une lecture couvre 62 jours au plus : l'ecran lit une annee par tranches.
-- Un ticket entre dans la fenetre par son jour d'exploitation (la vente) ou
-- par le jour de son annulation (l'ecriture inverse).
-- La categorie d'une ligne est la categorie de caisse du produit au jour de
-- la lecture (celle que la maison lui a donnee, sinon celle qui porte le nom
-- de plats.categorie, lu seulement), jamais ecrite.
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
comment on function public.caisse_cloture_vers_ventes_jour() is
  'Caisse v8 : apres une cloture, ecrit le net du jour par taux dans ventes_jour sous la source caisse, sauf si une saisie a la main existe pour ce jour.';

-- ============================================================================
-- ROLLBACK (a executer manuellement si besoin, front v8 retire d'abord).
-- Les lignes ventes_jour de source 'caisse' sont a traiter AVANT de resserrer
-- les contraintes : les passer a 'manuel' (net positif) ou les retirer.
--
--   drop function if exists public.caisse_rapport_donnees(text, date, date);
--   drop trigger if exists trg_caisse_cloture_ventes_jour on public.caisse_clotures;
--   drop function if exists public.caisse_cloture_vers_ventes_jour();
--   drop trigger if exists trg_ventes_jour_saisie_prime on public.ventes_jour;
--   drop function if exists public.ventes_jour_saisie_prime();
--   drop trigger if exists trg_ventes_jour_garde_source on public.ventes_jour;
--   drop function if exists public.ventes_jour_garde_source();
--   delete from public.ventes_jour where source = 'caisse' and montant_ttc < 0;
--   update public.ventes_jour set source = 'manuel' where source = 'caisse';
--   alter table public.ventes_jour drop constraint if exists ventes_jour_montant_ttc_check;
--   alter table public.ventes_jour add constraint ventes_jour_montant_ttc_check
--     check (montant_ttc >= 0 and montant_ttc < 10000000);
--   alter table public.ventes_jour drop constraint if exists ventes_jour_source_check;
--   alter table public.ventes_jour add constraint ventes_jour_source_check
--     check (source in ('manuel', 'pos'));
-- ============================================================================
