-- Inverse de 20261122_table_en_ligne_reperes.sql : remet table_en_ligne_plan
-- telle que l'a posée 20261122_reservation_choix_table.sql (sans demandee ni
-- libelle). Le front qui lit ces clés s'en passe : aucune table marquée, les
-- zones sans nom.

-- table_en_ligne_plan(adresse, jour, heure, personnes [, service])
-- Réponse : { ouvert: false, raison } ou
-- { ouvert: true, service, salles: [ { id, nom, tables: [ { id, nom, forme,
--   places, x, y, largeur, hauteur, pivotee, libre } ], decor: [ { type, x, y,
--   largeur, hauteur, rotation } ] } ] }
-- id et nom d'une table : null quand elle n'est pas libre.
-- Le service se déduit de l'heure (horaires du jour) quand p_service manque.
create or replace function public.table_en_ligne_plan(
  p_adresse   text,
  p_jour      date,
  p_heure     time,
  p_personnes integer,
  p_service   text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_p        public.reservation_en_ligne_parametres%rowtype;
  v_auj      date := (now() at time zone 'Europe/Zurich')::date;
  v_mnt      integer := extract(hour from (now() at time zone 'Europe/Zurich'))::int * 60
                        + extract(minute from (now() at time zone 'Europe/Zurich'))::int;
  v_iso      text;
  v_min      integer;
  v_plage    jsonb;
  v_service  text;
  v_s        text;
  v_libres   text[];
  v_salles   jsonb;
begin
  if p_adresse is null or p_jour is null or p_heure is null or p_personnes is null then
    return jsonb_build_object('ouvert', false, 'raison', 'parametres');
  end if;

  select * into v_p from public.reservation_en_ligne_parametres
   where slug = lower(btrim(p_adresse)) and en_ligne_actif;
  if not found or not v_p.choix_table or coalesce(cardinality(v_p.salles_choix_table), 0) = 0 then
    return jsonb_build_object('ouvert', false, 'raison', 'ferme');
  end if;

  if p_personnes < 1 or p_personnes > v_p.max_couverts then
    return jsonb_build_object('ouvert', false, 'raison', 'couverts');
  end if;
  if p_jour < v_auj or p_jour > v_auj + v_p.horizon_jours or p_jour = any(v_p.jours_fermes) then
    return jsonb_build_object('ouvert', false, 'raison', 'jour');
  end if;

  -- Service : celui demandé s'il ouvre à cette heure, sinon le premier dont
  -- la fenêtre d'arrivée du jour contient l'heure.
  v_iso := extract(isodow from p_jour)::int::text;
  v_min := extract(hour from p_heure)::int * 60 + extract(minute from p_heure)::int;
  foreach v_s in array (case when p_service in ('midi', 'soir', 'brunch')
                             then array[p_service] else array['midi', 'soir', 'brunch'] end) loop
    v_plage := v_p.horaires -> v_iso -> v_s;
    if v_plage is not null
       and coalesce(v_plage->>'de', '') ~ '^\d{2}:\d{2}$'
       and coalesce(v_plage->>'a', '') ~ '^\d{2}:\d{2}$'
       and v_min >= split_part(v_plage->>'de', ':', 1)::int * 60 + split_part(v_plage->>'de', ':', 2)::int
       and v_min <= split_part(v_plage->>'a', ':', 1)::int * 60 + split_part(v_plage->>'a', ':', 2)::int then
      -- Heure sur la grille des heures proposées (pas_minutes depuis le début
      -- du service) : la fonction ne répond que pour une heure offerte.
      if (v_min - (split_part(v_plage->>'de', ':', 1)::int * 60 + split_part(v_plage->>'de', ':', 2)::int))
         % greatest(coalesce(v_p.pas_minutes, 15), 1) = 0 then
        v_service := v_s;
        exit;
      end if;
    end if;
  end loop;
  if v_service is null then return jsonb_build_object('ouvert', false, 'raison', 'horaire'); end if;
  if coalesce(v_p.services_fermes -> p_jour::text, '[]'::jsonb) ? v_service then
    return jsonb_build_object('ouvert', false, 'raison', 'jour');
  end if;
  -- Délai minimal, comme les heures proposées (creneauxTable de spa-mailer).
  if p_jour = v_auj and v_min < v_mnt + coalesce(v_p.delai_min_heures, 0) * 60 then
    return jsonb_build_object('ouvert', false, 'raison', 'horaire');
  end if;

  v_libres := array(
    select public.resa_tables_libres_en_ligne(
      v_p.etablissement_id, p_jour, v_service, p_heure, p_personnes, v_p.salles_choix_table));

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'nom', s.nom,
           'tables', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id',       case when t.id = any(v_libres) then t.id end,
                      'nom',      case when t.id = any(v_libres) then t.nom end,
                      'forme',    t.forme,
                      'places',   t.nb_places,
                      'x',        coalesce(case when a.pos_x is not null and a.pos_y is not null then a.pos_x end, t.pos_x),
                      'y',        coalesce(case when a.pos_x is not null and a.pos_y is not null then a.pos_y end, t.pos_y),
                      'largeur',  case when coalesce(a.pivotee, false) then t.hauteur else t.largeur end,
                      'hauteur',  case when coalesce(a.pivotee, false) then t.largeur else t.hauteur end,
                      'pivotee',  coalesce(a.pivotee, false),
                      'libre',    t.id = any(v_libres)
                    ) order by t.pos_y, t.pos_x)
               from public.salle_tables t
               left join public.salle_tables_service a
                 on a.table_id = t.id and a.etablissement_id = v_p.etablissement_id
                and a.date_service = p_jour and a.service = v_service
              where t.salle_id = s.id and t.etablissement_id = v_p.etablissement_id and t.actif), '[]'::jsonb),
           'decor', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'type', e.type, 'x', e.pos_x, 'y', e.pos_y,
                      'largeur', e.largeur, 'hauteur', e.hauteur, 'rotation', e.rotation))
               from public.salle_elements e
              where e.salle_id = s.id and e.etablissement_id = v_p.etablissement_id), '[]'::jsonb)
         ) order by s.ordre, s.nom), '[]'::jsonb)
    into v_salles
    from public.salles s
   where s.etablissement_id = v_p.etablissement_id
     and coalesce(s.actif, true)
     and s.id = any(v_p.salles_choix_table);

  return jsonb_build_object('ouvert', true, 'service', v_service, 'salles', v_salles);
end $$;

revoke all on function public.table_en_ligne_plan(text, date, time, integer, text)
  from public, anon, authenticated;
grant execute on function public.table_en_ligne_plan(text, date, time, integer, text)
  to anon, authenticated, service_role;

comment on function public.table_en_ligne_plan(text, date, time, integer, text) is
  'Page /table/<slug> (lot L9) : plan des salles ouvertes au choix de la table, géométrie et booléen libre. Anonyme : aucun nom de client ni réservation ; id et numéro d''une table seulement quand elle est libre.';

