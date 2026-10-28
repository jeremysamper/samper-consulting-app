-- ════════════════════════════════════════════════════════════════════════════
-- Groupes : chaque groupe a sa réservation dans le module Réservations
-- ───────────────────────────────────────────────────────────────────────────
-- Demande de Jérémy (28.10.2026) : un groupe saisi dans Groupes apparaît tout
-- seul dans les Réservations. Sans cela, l'hôte ne le voit ni au planning ni en
-- mode service, ses couverts manquent au prévisionnel de la cuisine
-- (previsions_jour se calcule depuis reservations) et la page de réservation
-- en ligne vend des places qu'un mariage occupe déjà.
--
-- Choix validé par Jérémy : une VRAIE réservation (est_groupe = true), tenue à
-- jour par la base. Groupes reste la source : à chaque changement de contenu du
-- groupe, ce déclencheur réécrit date, service, heure, couverts, nom, contact,
-- notes et allergènes de la réservation. Le front verrouille ces champs sur une
-- réservation reliée et renvoie vers Groupes. Ce que la salle fait de la
-- réservation (tables, arrivé, parti, tags ajoutés à la main, passeport) n'est
-- jamais réécrit ; le statut ne suit que l'annulation ou le rétablissement du
-- groupe, et un changement de date le remet à « confirmé ».
-- Passer un groupe en « lu » ou « prêt » ne touche pas la réservation.
--
-- Correspondances :
--   service       : heure avant 16:00 = midi, sinon soir ; sans heure = soir
--   heure_arrivee : l'heure du groupe, sinon 19:00 (« Heure à définir » en note)
--   contact       : l'adresse e-mail qu'il contient va dans email, le reste
--                   (s'il compte au moins 6 chiffres) dans telephone ; le
--                   déclencheur resa_rattacher_client range ensuite la fiche
--   notes_libres  : « Mariage, menu n°2. Heure à définir. Dont 3 végétariens,
--                   2 enfants. Allergies : <note du groupe> »
--   allergènes    : un tag 'allergene' par id du groupe (mêmes ids que les
--                   tags de la salle, affichés tels quels par le module)
--
-- SECURITY DEFINER : la personne qui saisit un groupe (case « Modifier » de
-- Groupes, cuisinier compris par défaut) n'a pas forcément le droit d'écrire
-- dans reservations (user_peut_gerer('previsions')). L'écriture du groupe est
-- déjà gardée par la RLS de groupe_evenements ; la réservation n'en est que le
-- reflet. La fonction de synchronisation n'est exécutable par aucun rôle de
-- l'API (revoke) : seul le déclencheur l'appelle.
--
-- Une erreur de synchronisation n'empêche jamais d'enregistrer le groupe
-- (avertissement dans les journaux), même règle que resa_rattacher_client.
--
-- Suppression définitive d'un groupe (déjà annulé) : sa réservation part avec
-- lui (on delete cascade, tables et tags suivent par leurs propres cascades).
--
-- Expand pur : une colonne nullable, un index, deux fonctions, un déclencheur.
-- Le front déployé avant lui lit les réservations de groupe comme les autres.
-- Reprise des groupes existants non annulés en fin de fichier. Idempotente.
-- Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Lien réservation vers groupe
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.reservations
  add column if not exists groupe_evenement_id text
  references public.groupe_evenements(id) on delete cascade;

-- Une réservation au plus par groupe ; sert aussi d'index à la clé étrangère.
create unique index if not exists uq_reservations_groupe_evenement
  on public.reservations(groupe_evenement_id)
  where groupe_evenement_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Synchronisation d'un groupe vers sa réservation
-- ─────────────────────────────────────────────────────────────────────────────
-- `ancien` est la ligne d'avant la modification (null à la création ou à la
-- reprise) : il sert à ne retirer que les allergènes que le groupe portait,
-- jamais un tag ajouté à la main par la salle.
create or replace function public.groupe_vers_reservation(
  g public.groupe_evenements,
  ancien public.groupe_evenements
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resa      public.reservations%rowtype;
  v_service   text;
  v_heure     time;
  v_email     text;
  v_reste     text;
  v_tel       text;
  v_type      text;
  v_dont      text;
  v_notes     text;
  v_auteur    text;
  v_statut    text;
begin
  select * into v_resa from public.reservations where groupe_evenement_id = g.id;

  -- Groupe annulé sans réservation : rien à refléter.
  if g.annule and v_resa.id is null then return; end if;

  v_service := case when g.heure is not null and g.heure < time '16:00' then 'midi' else 'soir' end;
  v_heure   := coalesce(g.heure, time '19:00');

  v_email := substring(coalesce(g.contact, '')
             from '[^[:space:]@,;/<>()]+@[^[:space:]@,;/<>()]+\.[^[:space:]@,;/<>()]+');
  v_reste := btrim(case when v_email is null then coalesce(g.contact, '')
                        else replace(g.contact, v_email, '') end, ' ,;/-:');
  v_tel   := case when length(regexp_replace(v_reste, '\D', '', 'g')) >= 6 then v_reste end;

  -- Libellés de src/modules/groupes/typesGroupe.js (la contrainte de type de
  -- groupe_evenements fige déjà ces cinq valeurs).
  v_type := case g.type_groupe
              when 'mariage'         then 'Mariage'
              when 'anniversaire'    then 'Anniversaire'
              when 'seminaire'       then 'Séminaire'
              when 'groupe'          then 'Groupe'
              when 'apero_dinatoire' then 'Apéro dînatoire'
              else g.type_groupe
            end;
  v_dont := concat_ws(', ',
              case when coalesce(g.nb_vegetariens, 0) > 0
                   then g.nb_vegetariens || ' végétarien' || case when g.nb_vegetariens > 1 then 's' else '' end end,
              case when coalesce(g.nb_enfants, 0) > 0
                   then g.nb_enfants || ' enfant' || case when g.nb_enfants > 1 then 's' else '' end end);
  v_notes := concat_ws('. ',
               v_type || coalesce(', menu n°' || g.menu_numero, ''),
               case when g.heure is null then 'Heure à définir' end,
               case when v_dont <> '' then 'Dont ' || v_dont end,
               case when nullif(btrim(coalesce(g.allergies_note, '')), '') is not null
                    then 'Allergies : ' || btrim(g.allergies_note) end);

  if v_resa.id is null then
    -- created_by référence profiles : une valeur absente de profiles ferait
    -- échouer l'insertion, on ne garde qu'un auteur connu.
    select p.id into v_auteur from public.profiles p
     where p.id = coalesce((select auth.uid())::text, g.created_by);

    insert into public.reservations (
      etablissement_id, date_service, service, heure_arrivee, nb_couverts,
      nom, telephone, email, est_groupe, notes_libres, statut, origine,
      created_by, groupe_evenement_id
    ) values (
      g.etablissement_id, g.date_evenement, v_service, v_heure, g.nb_pax,
      g.nom, v_tel, v_email, true, v_notes, 'confirme', 'equipe',
      v_auteur, g.id
    )
    returning * into v_resa;
  else
    v_statut := case
                  when g.annule then 'annule'
                  when v_resa.statut = 'annule' then 'confirme'
                  when ancien.id is not null and ancien.date_evenement is distinct from g.date_evenement then 'confirme'
                  else v_resa.statut
                end;
    update public.reservations set
      date_service  = g.date_evenement,
      service       = v_service,
      heure_arrivee = v_heure,
      nb_couverts   = g.nb_pax,
      nom           = g.nom,
      telephone     = v_tel,
      email         = v_email,
      est_groupe    = true,
      notes_libres  = v_notes,
      statut        = v_statut,
      updated_at    = now()
    where id = v_resa.id;
  end if;

  -- Allergènes : ceux que le groupe ne porte plus partent, les nouveaux
  -- arrivent ; les tags posés à la main par la salle restent.
  delete from public.reservation_tags t
   where t.reservation_id = v_resa.id
     and t.type_tag = 'allergene'
     and t.valeur = any(coalesce(ancien.allergenes_ids, '{}'::text[]))
     and not (t.valeur = any(coalesce(g.allergenes_ids, '{}'::text[])));

  insert into public.reservation_tags (reservation_id, type_tag, valeur, libre)
  select v_resa.id, 'allergene', a, false
    from unnest(coalesce(g.allergenes_ids, '{}'::text[])) as a
   where not exists (
     select 1 from public.reservation_tags t
      where t.reservation_id = v_resa.id and t.type_tag = 'allergene' and t.valeur = a
   );
end;
$$;

-- Ni l'API ni un compte connecté ne l'appellent : elle écrit hors RLS.
revoke all on function public.groupe_vers_reservation(public.groupe_evenements, public.groupe_evenements)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Déclencheur
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.groupe_evenements_apres_ecriture()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- « Lu » et « prêt » ne changent rien à la réservation : on ne la réécrit
  -- que si un champ qu'elle reflète a bougé.
  if tg_op = 'UPDATE'
     and (new.date_evenement, new.heure, new.nb_pax, new.nom, new.contact,
          new.type_groupe, new.menu_numero, new.allergenes_ids, new.allergies_note,
          new.nb_vegetariens, new.nb_enfants, new.annule)
         is not distinct from
         (old.date_evenement, old.heure, old.nb_pax, old.nom, old.contact,
          old.type_groupe, old.menu_numero, old.allergenes_ids, old.allergies_note,
          old.nb_vegetariens, old.nb_enfants, old.annule)
  then
    return null;
  end if;

  begin
    perform public.groupe_vers_reservation(new, case when tg_op = 'UPDATE' then old end);
  exception when others then
    raise warning 'groupe_vers_reservation (groupe %) : %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.groupe_evenements_apres_ecriture() from public, anon, authenticated;

drop trigger if exists trg_groupe_evenements_vers_reservation on public.groupe_evenements;
create trigger trg_groupe_evenements_vers_reservation
  after insert or update on public.groupe_evenements
  for each row execute function public.groupe_evenements_apres_ecriture();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Reprise des groupes existants
-- ─────────────────────────────────────────────────────────────────────────────
-- Groupes non annulés sans réservation reliée, passés compris (le rapport des
-- réservations compte alors aussi leurs couverts). Rejouable : un groupe déjà
-- relié est sauté.
select public.groupe_vers_reservation(g, null)
  from public.groupe_evenements g
 where not g.annule
   and not exists (select 1 from public.reservations r where r.groupe_evenement_id = g.id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (à jouer à la main si besoin)
-- ─────────────────────────────────────────────────────────────────────────────
-- drop trigger if exists trg_groupe_evenements_vers_reservation on public.groupe_evenements;
-- drop function if exists public.groupe_evenements_apres_ecriture();
-- drop function if exists public.groupe_vers_reservation(public.groupe_evenements, public.groupe_evenements);
-- Retirer aussi les réservations créées par la synchronisation (facultatif) :
-- delete from public.reservations where groupe_evenement_id is not null;
-- alter table public.reservations drop column if exists groupe_evenement_id;
