-- ════════════════════════════════════════════════════════════════════════════
-- Points : indicateurs pour les pastilles, jours au planning et pointage à
-- l'heure (lot P3, 15.11.2026). Suite de P1, P2 et de la correction matin et
-- soir, en prod, éteints partout.
--
--   J1  un crédit n'est versé que si la personne est au planning ce jour de
--       Zurich dans cet établissement : au moins un service programmé (ni
--       annulé, ni refusé, ni pointage hors planning), aucune absence qui le
--       couvre, et un jour hors des fermetures de l'établissement. Sans
--       planning, personne ne gagne.
--   J2  action neuve pointage_ponctuel (2 points, 2 par jour) : pointage
--       d'arrivée au plus à l'heure de début, à l'heure du serveur (écart d'au
--       plus deux minutes avec l'écriture). Hors ligne synchronisé tard,
--       correction à la main, hors planning : rien. Pointage passé en retard
--       ensuite ou service supprimé : annulation, une fois.
--   J3  déclencheurs AFTER sur shifts, même garde que P1 : rien ne bloque un
--       pointage.
--   I4  points_indicateurs(p_etab) : les compteurs de la personne connectée
--       seulement, pour les pastilles « +N » de l'écran.
--
-- Fonctions existantes gardées à leur signature (create or replace) ;
-- points_programme, points_indicateurs et points_trg_shifts sont neuves.
-- Rejouable. Inverse : supabase/migrations-inverse/20261115_points_indicateurs.sql
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

-- ─── Barème et libellés (miroir JS : src/modules/points/bareme.js) ───────────

create or replace function public.points_bareme_defaut()
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select '{
    "releve_haccp":      {"points": 2,  "plafond": 8},
    "controle_haccp":    {"points": 3,  "plafond": 5},
    "photo_tracabilite": {"points": 3,  "plafond": 3},
    "facture_achat":     {"points": 5,  "plafond": 3},
    "perte_declaree":    {"points": 2,  "plafond": 2},
    "comptage_zone":     {"points": 10, "plafond": 5},
    "inventaire_valide": {"points": 20, "plafond": 1},
    "pointage_ponctuel": {"points": 2,  "plafond": 2}
  }'::jsonb
$fn$;

create or replace function public.points_libelle_action(p_action text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select case p_action
    when 'releve_haccp'      then 'Relevé HACCP'
    when 'controle_haccp'    then 'Contrôle HACCP'
    when 'photo_tracabilite' then 'Photo de traçabilité'
    when 'facture_achat'     then 'Facture d''achat'
    when 'perte_declaree'    then 'Perte déclarée'
    when 'comptage_zone'     then 'Zone d''inventaire comptée'
    when 'inventaire_valide' then 'Inventaire validé'
    when 'pointage_ponctuel' then 'Pointage à l''heure'
    else p_action
  end
$fn$;

-- ─── J1 : au planning ce jour ────────────────────────────────────────────────

create or replace function public.points_programme(p_user text, p_etab text, p_jour date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
           select 1 from public.shifts s
           where s.etablissement_id = p_etab
             and s.user_id = p_user
             and s.date = p_jour
             and s.debut <> s.fin
             and coalesce(s.note, '') <> 'Pointage hors planning'
             and lower(coalesce(s.statut, '')) not in ('annulé', 'annule', 'refusé', 'refuse')
         )
     and not exists (
           select 1 from public.absences a
           where a.etablissement_id = p_etab
             and a.user_id = p_user
             and p_jour between a.date_debut and a.date_fin
         )
     and not exists (
           select 1 from public.reservation_en_ligne_parametres p
           where p.etablissement_id = p_etab
             and p_jour = any (coalesce(p.jours_fermes, '{}'::date[]))
         )
$fn$;

-- Lu à chaque versement et à chaque ouverture d'un écran à pastilles.
create index if not exists idx_shifts_etab_user_date on public.shifts (etablissement_id, user_id, date);

-- ─── Versement et inventaire : corps de P2, plus le contrôle J1 ──────────────

create or replace function public.points_verser(p_etab text, p_candidat text, p_action text,
  p_table text, p_source_id text, p_evenement text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r public.points_reglages;
  v_user text;
  v_pts integer;
  v_plafond integer;
  v_n integer;
  v_jour integer;
  v_mois integer;
  v_debut timestamptz;
  v_debut_mois timestamptz;
begin
  select * into r from public.points_reglages where etablissement_id = p_etab and actif;
  if not found then
    return;
  end if;
  select g.points, g.plafond into v_pts, v_plafond from public.points_regle(r.bareme, p_action) g;
  if coalesce(v_pts, 0) <= 0 or coalesce(v_plafond, 0) <= 0 then
    return;
  end if;
  v_user := public.points_auteur(p_candidat, p_etab);
  if v_user is null or not public.points_participe(v_user, p_etab, r) then
    return;
  end if;
  -- J1 (P3) : la personne est au planning ce jour (service programmé, ni
  -- absence, ni fermeture de l'établissement). Le comptage d'inventaire,
  -- versé à la validation, contrôle ses propres jours (points_trg_inventaires).
  if p_action <> 'comptage_zone'
     and not public.points_programme(v_user, p_etab, (now() at time zone 'Europe/Zurich')::date) then
    return;
  end if;
  -- F2 : un versement à la fois par personne et par établissement ; les
  -- plafonds se comptent sous ce verrou.
  perform pg_advisory_xact_lock(hashtext('points:' || v_user || ':' || p_etab));
  if p_evenement is not null and exists (
    select 1 from public.points_mouvements m
    where m.etablissement_id = p_etab and m.action = p_action
      and m.evenement = p_evenement and m.sens = 'credit'
  ) then
    return;
  end if;
  v_debut := date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
  v_debut_mois := date_trunc('month', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
  -- Les crédits annulés restent comptés : créer puis supprimer ne rouvre rien.
  select count(*) filter (where m.action = p_action and m.created_at >= v_debut),
         coalesce(sum(m.points) filter (where m.created_at >= v_debut), 0),
         coalesce(sum(m.points), 0)
    into v_n, v_jour, v_mois
  from public.points_mouvements m
  where m.etablissement_id = p_etab
    and m.user_id = v_user
    and m.sens = 'credit'
    and m.created_at >= v_debut_mois;
  if v_n >= v_plafond then
    return;
  end if;
  -- F1 : pas de crédit partiel.
  if v_jour + v_pts > coalesce(r.plafond_jour_total, 40) or v_mois + v_pts > coalesce(r.plafond_mois_total, 400) then
    return;
  end if;
  insert into public.points_mouvements
    (etablissement_id, user_id, points, action, source_table, source_id, sens, libelle, created_by, evenement)
  values
    (p_etab, v_user, v_pts, p_action, p_table, p_source_id, 'credit',
     public.points_libelle_action(p_action), (select auth.uid())::text, p_evenement)
  on conflict do nothing;
end;
$fn$;

create or replace function public.points_trg_inventaires()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  z record;
begin
  if tg_op = 'UPDATE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    if new.statut is distinct from 'validé' then
      return null;
    end if;
    -- Même périmètre déjà payé dans les 7 jours : rien.
    if exists (
      select 1
      from public.inventaires i
      join public.points_mouvements m
        on m.etablissement_id = i.etablissement_id
       and m.sens = 'credit'
       and m.created_at >= now() - interval '7 days'
       and ((m.source_table = 'inventaires' and m.source_id = i.id)
            or (m.source_table = 'inventaire_saisies_offline' and left(m.source_id, length(i.id) + 1) = i.id || ':'))
      where i.etablissement_id = new.etablissement_id
        and i.id <> new.id
        and lower(btrim(coalesce(i.nom, ''))) = lower(btrim(coalesce(new.nom, '')))
    ) then
      return null;
    end if;
    perform public.points_verser(new.etablissement_id, new.valide_par, 'inventaire_valide', 'inventaires', new.id,
      'inv:' || new.id);
    for z in
      select c.user_id, c.zone
      from (
        select s.user_id, btrim(coalesce(s.zone, '')) as zone, min(s.created_at) as premier,
               row_number() over (partition by s.user_id order by min(s.created_at)) as rang
        from public.inventaire_saisies_offline s
        where s.inventaire_id = new.id
          -- Saisie fusionnée par la RPC de comptage (ni périmée, ni écrite à côté).
          and s.applique
          -- J1 (P3) : comptée un jour où la personne était au planning ; le
          -- jour du comptage, donné par l'appareil, est borné à 48 h de l'écriture.
          and s.compte_le between s.created_at - interval '48 hours' and s.created_at + interval '5 minutes'
          and public.points_programme(s.user_id, new.etablissement_id, (s.compte_le at time zone 'Europe/Zurich')::date)
          and exists (
            select 1
            from jsonb_array_elements(case when jsonb_typeof(new.lignes) = 'array' then new.lignes else '[]'::jsonb end) l
            where l ->> 'id' = s.ligne_id
              and (btrim(coalesce(s.zone, '')) = ''
                   or btrim(coalesce(l ->> 'zone', '')) = btrim(s.zone)
                   or (jsonb_typeof(l -> 'zones') = 'array'
                       and exists (select 1 from jsonb_array_elements_text(l -> 'zones') zz where btrim(zz) = btrim(s.zone))))
          )
        group by s.user_id, btrim(coalesce(s.zone, ''))
      ) c
      where c.rang <= 5
      order by c.premier
    loop
      perform public.points_verser(new.etablissement_id, z.user_id, 'comptage_zone', 'inventaire_saisies_offline',
        new.id || ':' || z.zone, 'inv:' || new.id || ':' || z.zone || ':' || z.user_id);
    end loop;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('inventaires', old.id);
    insert into public.points_mouvements
      (etablissement_id, user_id, points, action, source_table, source_id, sens, libelle, created_by)
    select m.etablissement_id, m.user_id, -m.points, m.action, m.source_table, m.source_id, 'annulation',
           'Annulation : ' || coalesce(m.libelle, ''), (select auth.uid())::text
    from public.points_mouvements m
    where m.etablissement_id = old.etablissement_id
      and m.source_table = 'inventaire_saisies_offline'
      and left(m.source_id, length(old.id) + 1) = old.id || ':'
      and m.sens = 'credit'
    on conflict (source_table, source_id, user_id, sens) where source_table is not null do nothing;
  end if;
  return null;
exception when others then
  raise warning 'points_trg_inventaires : %', sqlerrm;
  return null;
end;
$fn$;

-- ─── J2 et J3 : pointage à l'heure ───────────────────────────────────────────

-- Rien ici ne bloque un pointage : AFTER, corps entier rattrapé en warning.
create or replace function public.points_trg_shifts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_maintenant timestamp := now() at time zone 'Europe/Zurich';
begin
  if tg_op = 'UPDATE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id) then
      return null;
    end if;
    if old.pointage_debut is null and new.pointage_debut is not null then
      if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
        return null;
      end if;
      -- Un service programmé, pas un pointage hors planning.
      if new.debut = new.fin or coalesce(new.note, '') = 'Pointage hors planning' then
        return null;
      end if;
      -- À l'heure : au plus l'heure de début (le pointage est noté à la minute).
      if new.pointage_debut > new.debut then
        return null;
      end if;
      -- Heure du serveur : écrite maintenant, à deux minutes près (la minute
      -- tronquée comprise). Hors ligne synchronisé tard, correction à la main :
      -- rien.
      if abs(extract(epoch from (v_maintenant - (new.date + new.pointage_debut)))) > 180 then
        return null;
      end if;
      perform public.points_verser(new.etablissement_id, new.user_id, 'pointage_ponctuel', 'shifts', new.id,
        'pointage:' || new.id);
    elsif old.pointage_debut is not null then
      -- Pointage effacé ou passé en retard : annulation, une fois.
      perform public.points_annuler('shifts', old.id);
    end if;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('shifts', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_shifts : %', sqlerrm;
  return null;
end;
$fn$;

drop trigger if exists trg_points_shifts_maj on public.shifts;
create trigger trg_points_shifts_maj
  after update of pointage_debut, debut on public.shifts
  for each row when (
    (old.pointage_debut is null and new.pointage_debut is not null)
    or (old.pointage_debut is not null and old.pointage_debut <= old.debut
        and (new.pointage_debut is null or new.pointage_debut > new.debut))
  )
  execute function public.points_trg_shifts();

drop trigger if exists trg_points_shifts_sup on public.shifts;
create trigger trg_points_shifts_sup
  after delete on public.shifts
  for each row when (old.pointage_debut is not null)
  execute function public.points_trg_shifts();

-- ─── I4 : indicateurs de la personne connectée ───────────────────────────────

-- Compteurs pour les pastilles « +N » : rien sur une autre personne (ni nom,
-- ni compte) ; les zones HACCP déjà payées et les périmètres d'inventaire payés
-- se disent sans dire par qui. Système éteint, personne hors de
-- l'établissement ou qui ne participe pas : réponse vide.
create or replace function public.points_indicateurs(p_etab text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid text := (select auth.uid())::text;
  r public.points_reglages;
  v_debut timestamptz := date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
  v_debut_mois timestamptz := date_trunc('month', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
  v_suffixe text := ':' || public.points_jour_zurich() || ':' || public.points_moment_zurich(now());
  v_actions jsonb := '{}'::jsonb;
  k text;
  v_pts integer;
  v_plaf integer;
  v_faits integer;
  v_jour integer;
  v_mois integer;
begin
  if v_uid is null or not public.user_can_access_etab(p_etab) then
    return '{}'::jsonb;
  end if;
  select * into r from public.points_reglages where etablissement_id = p_etab and actif;
  if not found or not public.points_participe(v_uid, p_etab, r) then
    return '{}'::jsonb;
  end if;
  select coalesce(sum(m.points) filter (where m.created_at >= v_debut), 0), coalesce(sum(m.points), 0)
    into v_jour, v_mois
  from public.points_mouvements m
  where m.etablissement_id = p_etab and m.user_id = v_uid and m.sens = 'credit' and m.created_at >= v_debut_mois;
  for k in select jsonb_object_keys(public.points_bareme_defaut()) loop
    begin
      select gg.points, gg.plafond into v_pts, v_plaf from public.points_regle(r.bareme, k) gg;
    exception when others then
      v_pts := 0;
      v_plaf := 0;
    end;
    select count(*) into v_faits
    from public.points_mouvements m
    where m.etablissement_id = p_etab and m.user_id = v_uid and m.action = k
      and m.sens = 'credit' and m.created_at >= v_debut;
    v_actions := v_actions || jsonb_build_object(k, jsonb_build_object(
      'points', coalesce(v_pts, 0),
      'plafond', coalesce(v_plaf, 0),
      'faits', v_faits,
      'reste', greatest(coalesce(v_plaf, 0) - v_faits, 0)));
  end loop;
  return jsonb_build_object(
    'actif', true,
    'participant', true,
    'programme_aujourdhui', public.points_programme(v_uid, p_etab, (now() at time zone 'Europe/Zurich')::date),
    'moment', public.points_moment_zurich(now()),
    'actions', v_actions,
    'reste_jour', greatest(coalesce(r.plafond_jour_total, 40) - v_jour, 0),
    'reste_mois', greatest(coalesce(r.plafond_mois_total, 400) - v_mois, 0),
    'zones_payees', coalesce((
      select jsonb_agg(distinct left(m.evenement, length(m.evenement) - length(v_suffixe)))
      from public.points_mouvements m
      where m.etablissement_id = p_etab and m.action = 'releve_haccp' and m.sens = 'credit'
        and m.created_at >= v_debut and right(m.evenement, length(v_suffixe)) = v_suffixe
    ), '[]'::jsonb),
    'perimetres_payes', coalesce((
      select jsonb_agg(distinct lower(btrim(coalesce(i.nom, ''))))
      from public.inventaires i
      join public.points_mouvements m
        on m.etablissement_id = i.etablissement_id
       and m.sens = 'credit'
       and m.created_at >= now() - interval '7 days'
       and ((m.source_table = 'inventaires' and m.source_id = i.id)
            or (m.source_table = 'inventaire_saisies_offline' and left(m.source_id, length(i.id) + 1) = i.id || ':'))
      where i.etablissement_id = p_etab
    ), '[]'::jsonb)
  );
end;
$fn$;

-- ─── Droits ──────────────────────────────────────────────────────────────────

revoke execute on function public.points_programme(text, text, date) from public, anon, authenticated;
revoke execute on function public.points_trg_shifts() from public, anon, authenticated;
revoke execute on function public.points_indicateurs(text) from public, anon, authenticated;
grant execute on function public.points_indicateurs(text) to authenticated;
