-- ================================================================
-- Lot C2b : journal et signalisation des appels dans l'app (Messages et
-- contacts). Brief briefs/2026-11-12-contacts-messages-brief.md, amendement
-- A8 ; audit briefs/2026-11-12-contacts-C5-audit.md, sections 9, 12 et 13.
--
-- Ce que pose ce fichier, sans rien changer à l'existant :
--   1. table public.appels : une ligne par appel, son état, ses heures en UTC
--      prises par le serveur, l'offre et la réponse WebRTC le temps de
--      l'appel ;
--   2. RLS : lecture par les deux participants ; aucune écriture directe
--      (ni politique ni droit d'insertion, de mise à jour, de suppression) ;
--   3. cinq fonctions appelées par le client, à droits définis :
--      appel_lancer, appel_repondre, appel_refuser, appel_terminer,
--      appel_battement ; et appels_balayer, sans droit pour les clients ;
--   4. tâche pg_cron « appels-balayage », chaque minute : sonneries échues en
--      manqué, appels coupés à 15 min, appels sans battement depuis 90 s
--      clos (durée approximative), purge du journal à 90 jours et de
--      l'historique de cette tâche dans cron.job_run_details à 7 jours ;
--   5. publication Realtime de la table (Postgres Changes sous RLS, un seul
--      canal pour toute l'app, ouvert par la coque en C4).
--
-- Garde-fous tenus par la base (décisions D4 à D7 de l'audit) :
--   D4 : un compte listé dans pointage_postes ne lance ni ne reçoit d'appel.
--   D5 : l'appelé est un compte actif que l'appelant voit, selon la règle de
--        profiles_read (consultant, ou établissement commun), écrite avec les
--        mêmes aides.
--   D6 : sonnerie 30 s (expire_a), appel coupé à 15 min, un appel à la fois
--        par compte, occupé refusé par appel_lancer.
--   D7 : métadonnées seulement, lues par les deux participants, purge à
--        90 jours. Offre et réponse (adresses réseau) effacées à la clôture :
--        une contrainte l'impose, aucune clôture ne peut les garder.
--
-- Concurrence :
--   - répondre : UPDATE ... where etat = 'sonne'. Deux appareils du même
--     compte se sérialisent sur le verrou de la ligne ; le second relit la
--     ligne déjà passée en_cours (READ COMMITTED), ne la prend pas et reçoit
--     appel_plus_en_sonnerie.
--   - lancer : pg_advisory_xact_lock sur chacun des deux comptes, pris dans
--     l'ordre des clés de verrou (aucun interblocage possible), avant le
--     contrôle « occupé ». Deux lancements qui touchent un même compte
--     passent l'un après l'autre ; le second voit le premier et est refusé.
--
-- Erreurs rendues au client (message stable, lu par le front de C4) :
--   appel_session, appel_compte_inactif, appel_appele_invalide,
--   appel_appele_introuvable, appel_poste_partage, appel_occupe,
--   appel_offre_invalide, appel_reponse_invalide, appel_issue_invalide,
--   appel_introuvable, appel_plus_en_sonnerie.
--
-- Rejouable : create ... if not exists, create or replace, drop policy if
-- exists, cron.schedule par nom (met la tâche à jour sans en créer une
-- autre), publication ajoutée seulement si absente. Le fichier n'écrit
-- aucune donnée. Pas de begin ni de commit : l'essai à blanc et
-- l'application exécutent ce texte dans un bloc DO, en une seule
-- instruction, donc en une seule transaction.
-- Rollback en regard : 20261113_appels.rollback.sql.
-- ================================================================

-- ── 1. Table ───────────────────────────────────────────────────────────────
create table if not exists public.appels (
  id            uuid primary key default gen_random_uuid(),
  appelant_id   text not null references public.profiles(id) on delete cascade,
  appele_id     text not null references public.profiles(id) on delete cascade,
  etat          text not null default 'sonne',
  cree_a        timestamptz not null default now(),
  expire_a      timestamptz not null default (now() + interval '30 seconds'),
  repondu_a     timestamptz,
  fini_a        timestamptz,
  battement_a   timestamptz,
  duree_s       integer,
  duree_approx  boolean not null default false,
  via_relais    boolean,
  offre         text,
  reponse       text,
  constraint appels_etat check (etat in ('sonne', 'en_cours', 'termine', 'refuse', 'manque', 'echec')),
  constraint appels_deux_comptes check (appelant_id <> appele_id),
  constraint appels_fin check ((etat in ('sonne', 'en_cours')) = (fini_a is null)),
  constraint appels_repondu check (etat <> 'en_cours' or repondu_a is not null),
  constraint appels_duree check (duree_s is null or duree_s between 0 and 900),
  constraint appels_offre_taille check (offre is null or length(offre) between 1 and 16384),
  constraint appels_reponse_taille check (reponse is null or length(reponse) between 1 and 16384),
  constraint appels_signalisation_effacee check (etat in ('sonne', 'en_cours') or (offre is null and reponse is null))
);

comment on table public.appels is
  'Appels audio dans l''app (lot C2b) : journal et signalisation. Écrite seulement par les fonctions appel_* et appels_balayer ; lue par les deux participants. Purge à 90 jours.';
comment on column public.appels.etat is 'sonne, en_cours, termine, refuse, manque, echec.';
comment on column public.appels.expire_a is 'Fin de la sonnerie (création plus 30 s). Après, plus de réponse possible ; le balayage passe la ligne en manque.';
comment on column public.appels.battement_a is 'Dernier battement d''un des deux participants pendant l''appel (toutes les 30 s). Sans battement depuis 90 s, le balayage clôt l''appel.';
comment on column public.appels.duree_s is 'Durée de conversation en secondes (fin moins réponse), 900 au plus.';
comment on column public.appels.duree_approx is 'Vrai quand la clôture vient du balayage faute de battement : la durée s''arrête au dernier battement.';
comment on column public.appels.via_relais is 'Connexion passée par le relais TURN, rapportée par le client à la fin. Mesure de coût, pas une preuve.';
comment on column public.appels.offre is 'Offre WebRTC (adresses réseau), écrite par appel_lancer, effacée à la clôture.';
comment on column public.appels.reponse is 'Réponse WebRTC (adresses réseau), écrite par appel_repondre, effacée à la clôture.';

-- ── 2. Index ───────────────────────────────────────────────────────────────
create index if not exists appels_appelant_idx on public.appels (appelant_id, cree_a desc);
create index if not exists appels_appele_idx on public.appels (appele_id, cree_a desc);
create index if not exists appels_etat_cree_idx on public.appels (etat, cree_a);

-- ── 3. Droits et RLS ───────────────────────────────────────────────────────
alter table public.appels enable row level security;

revoke all on table public.appels from public, anon, authenticated;
grant select on table public.appels to authenticated;

drop policy if exists appels_select on public.appels;
create policy appels_select on public.appels
  for select to authenticated
  using (
    appelant_id = (select auth.uid())::text
    or appele_id = (select auth.uid())::text
  );

-- ── 4. Balayage (pg_cron et appel_lancer) ──────────────────────────────────
-- p_comptes NULL : toutes les lignes, plus la purge à 90 jours et celle de
-- l'historique de la tâche dans cron.job_run_details (pg_cron).
-- p_comptes donné : seulement les lignes de ces comptes, sans purge
-- (appel_lancer, avant le contrôle « occupé »).
-- Chaque passe ne prend que les lignes libres (for update skip locked) : le
-- balayage n'attend jamais un verrou, donc aucun interblocage avec un autre
-- balayage ni avec une fonction appel_* ; une ligne sautée l'est jusqu'au
-- passage suivant.
create or replace function public.appels_balayer(p_comptes text[] default null)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  n_manques integer := 0;
  n_coupes integer := 0;
  n_muets integer := 0;
  n_purges integer := 0;
  n_journal integer := 0;
begin
  update public.appels
     set etat = 'manque', fini_a = expire_a, offre = null, reponse = null
   where id in (
     select x.id from public.appels x
      where x.etat = 'sonne' and x.expire_a <= now()
        and (p_comptes is null or x.appelant_id = any (p_comptes) or x.appele_id = any (p_comptes))
        for update skip locked);
  get diagnostics n_manques = row_count;

  update public.appels
     set etat = 'termine', fini_a = repondu_a + interval '15 minutes', duree_s = 900,
         offre = null, reponse = null
   where id in (
     select x.id from public.appels x
      where x.etat = 'en_cours' and x.repondu_a <= now() - interval '15 minutes'
        and (p_comptes is null or x.appelant_id = any (p_comptes) or x.appele_id = any (p_comptes))
        for update skip locked);
  get diagnostics n_coupes = row_count;

  update public.appels
     set etat = 'termine', fini_a = coalesce(battement_a, repondu_a),
         duree_s = least(900, greatest(0, floor(extract(epoch from (coalesce(battement_a, repondu_a) - repondu_a)))::integer)),
         duree_approx = true, offre = null, reponse = null
   where id in (
     select x.id from public.appels x
      where x.etat = 'en_cours' and coalesce(x.battement_a, x.repondu_a) <= now() - interval '90 seconds'
        and (p_comptes is null or x.appelant_id = any (p_comptes) or x.appele_id = any (p_comptes))
        for update skip locked);
  get diagnostics n_muets = row_count;

  if p_comptes is null then
    delete from public.appels
     where id in (select x.id from public.appels x where x.cree_a < now() - interval '90 days' for update skip locked);
    get diagnostics n_purges = row_count;

    -- Historique de cette seule tâche (1 440 passages par jour) : 7 jours
    -- gardés. Un échec ici ne doit pas arrêter le balayage des appels.
    begin
      delete from cron.job_run_details
       where jobid in (select j.jobid from cron.job j where j.jobname = 'appels-balayage')
         and end_time < now() - interval '7 days';
      get diagnostics n_journal = row_count;
    exception when others then
      raise warning 'appels_balayer : historique pg_cron non purgé (%)', sqlerrm;
    end;
  end if;

  return jsonb_build_object('manques', n_manques, 'coupes', n_coupes, 'muets', n_muets, 'purges', n_purges, 'journal_cron', n_journal);
end;
$$;

revoke all on function public.appels_balayer(text[]) from public, anon, authenticated;
comment on function public.appels_balayer(text[]) is
  'Lot C2b. Clôt les appels échus (sonnerie 30 s, 15 min, 90 s sans battement) et purge le journal à 90 jours. Appelée par pg_cron (appels-balayage) et par appel_lancer ; aucun droit pour les clients.';

-- ── 5. Fonctions du client ─────────────────────────────────────────────────
-- Toutes à droits définis : la table n'a aucune écriture directe, chaque
-- transition passe ici et prend l'heure du serveur (audit, section 9).
-- Avertissement 0029 de l'advisor voulu pour ces cinq fonctions.

create or replace function public.appel_lancer(p_appele text, p_offre text)
returns public.appels
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  moi text := (select auth.uid())::text;
  v_moi public.profiles;
  v_lui public.profiles;
  v_appel public.appels;
  k1 integer;
  k2 integer;
begin
  if moi is null then
    raise exception 'appel_session' using errcode = '42501';
  end if;
  if p_appele is null or p_appele = moi then
    raise exception 'appel_appele_invalide' using errcode = '22023';
  end if;
  if p_offre is null or length(p_offre) not between 1 and 16384 then
    raise exception 'appel_offre_invalide' using errcode = '22023';
  end if;

  select * into v_moi from public.profiles where id = moi;
  if not found or v_moi.actif is false then
    raise exception 'appel_compte_inactif' using errcode = '42501';
  end if;

  -- D5 : actif et visible, même règle que la politique profiles_read.
  select * into v_lui from public.profiles where id = p_appele;
  if not found or v_lui.actif is false
     or not coalesce(public.current_user_role() = 'consultant'
                     or v_lui.etablissement_ids && public.current_user_etab_ids(), false) then
    raise exception 'appel_appele_introuvable' using errcode = '42501';
  end if;

  -- D4 : comptes de poste partagé exclus, dans les deux sens.
  if exists (select 1 from public.pointage_postes pp where pp.user_id in (moi, p_appele)) then
    raise exception 'appel_poste_partage' using errcode = '42501';
  end if;

  -- D6 : un appel à la fois par compte. Verrou sur chacun des deux comptes,
  -- dans l'ordre des clés (aucun interblocage), puis clôture des échus de ces
  -- comptes, puis contrôle « occupé » sur un instantané pris après le verrou.
  k1 := hashtext('appels:' || moi);
  k2 := hashtext('appels:' || p_appele);
  perform pg_advisory_xact_lock(hashtext('public.appels'), least(k1, k2));
  perform pg_advisory_xact_lock(hashtext('public.appels'), greatest(k1, k2));

  perform public.appels_balayer(array[moi, p_appele]);

  -- Une sonnerie échue ne compte plus, même si le balayage l'a sautée.
  if exists (
    select 1 from public.appels a
     where (a.etat = 'en_cours' or (a.etat = 'sonne' and a.expire_a > now()))
       and (a.appelant_id in (moi, p_appele) or a.appele_id in (moi, p_appele))
  ) then
    raise exception 'appel_occupe' using errcode = 'P0001';
  end if;

  insert into public.appels (appelant_id, appele_id, etat, cree_a, expire_a, offre)
  values (moi, p_appele, 'sonne', now(), now() + interval '30 seconds', p_offre)
  returning * into v_appel;
  return v_appel;
end;
$$;

create or replace function public.appel_repondre(p_id uuid, p_reponse text)
returns public.appels
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  moi text := (select auth.uid())::text;
  v_appel public.appels;
begin
  if moi is null then
    raise exception 'appel_session' using errcode = '42501';
  end if;
  if p_reponse is null or length(p_reponse) not between 1 and 16384 then
    raise exception 'appel_reponse_invalide' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = moi and actif is not false) then
    raise exception 'appel_compte_inactif' using errcode = '42501';
  end if;

  -- Premier appareil qui répond gagne : le second attend le verrou de la
  -- ligne, relit etat = 'en_cours' et ne met rien à jour.
  update public.appels
     set etat = 'en_cours', repondu_a = now(), battement_a = now(), reponse = p_reponse
   where id = p_id and appele_id = moi and etat = 'sonne' and expire_a > now()
  returning * into v_appel;
  if found then
    return v_appel;
  end if;

  if not exists (select 1 from public.appels where id = p_id and appele_id = moi) then
    raise exception 'appel_introuvable' using errcode = 'P0002';
  end if;
  raise exception 'appel_plus_en_sonnerie' using errcode = 'P0001';
end;
$$;

create or replace function public.appel_refuser(p_id uuid)
returns public.appels
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  moi text := (select auth.uid())::text;
  v_appel public.appels;
begin
  if moi is null then
    raise exception 'appel_session' using errcode = '42501';
  end if;

  -- Après les 30 s de sonnerie, personne ne l'a entendu : manqué, pas refusé.
  update public.appels
     set etat = case when expire_a > now() then 'refuse' else 'manque' end,
         fini_a = least(now(), expire_a), offre = null, reponse = null
   where id = p_id and appele_id = moi and etat = 'sonne'
  returning * into v_appel;
  if found then
    return v_appel;
  end if;

  -- Déjà répondu par un autre appareil, ou déjà clos : rien ne change, la
  -- ligne rendue dit l'état (l'appareil cesse de sonner).
  select * into v_appel from public.appels where id = p_id and appele_id = moi;
  if not found then
    raise exception 'appel_introuvable' using errcode = 'P0002';
  end if;
  return v_appel;
end;
$$;

create or replace function public.appel_terminer(p_id uuid, p_issue text default null, p_via_relais boolean default null)
returns public.appels
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  moi text := (select auth.uid())::text;
  v_appel public.appels;
  v_etat text;
begin
  if moi is null then
    raise exception 'appel_session' using errcode = '42501';
  end if;
  if p_issue is not null and p_issue not in ('manque', 'echec') then
    raise exception 'appel_issue_invalide' using errcode = '22023';
  end if;

  select * into v_appel from public.appels
   where id = p_id and (appelant_id = moi or appele_id = moi)
   for update;
  if not found then
    raise exception 'appel_introuvable' using errcode = 'P0002';
  end if;

  if v_appel.etat = 'sonne' then
    -- L'appelant raccroche pendant la sonnerie (ou à 30 s) : manqué pour
    -- l'appelé. L'appelé qui raccroche pendant la sonnerie refuse ; après les
    -- 30 s, c'est un manqué. Un manqué finit au plus tard à l'échéance.
    v_etat := case when p_issue = 'echec' then 'echec'
                   when moi = v_appel.appele_id and v_appel.expire_a > now() then 'refuse'
                   else 'manque' end;
    update public.appels
       set etat = v_etat,
           fini_a = case when v_etat = 'manque' then least(now(), expire_a) else now() end,
           offre = null, reponse = null,
           via_relais = coalesce(via_relais, p_via_relais)
     where id = p_id
    returning * into v_appel;
  elsif v_appel.etat = 'en_cours' then
    update public.appels
       set etat = case when p_issue = 'echec' then 'echec' else 'termine' end,
           fini_a = now(),
           duree_s = case when p_issue = 'echec' then null
                          else least(900, greatest(0, floor(extract(epoch from (now() - repondu_a)))::integer)) end,
           offre = null, reponse = null,
           via_relais = coalesce(via_relais, p_via_relais)
     where id = p_id
    returning * into v_appel;
  elsif p_via_relais is not null and v_appel.via_relais is null then
    -- Déjà clos (l'autre a raccroché le premier) : seul le relais se rapporte.
    update public.appels set via_relais = p_via_relais where id = p_id
    returning * into v_appel;
  end if;
  return v_appel;
end;
$$;

create or replace function public.appel_battement(p_id uuid)
returns public.appels
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  moi text := (select auth.uid())::text;
  v_appel public.appels;
begin
  if moi is null then
    raise exception 'appel_session' using errcode = '42501';
  end if;

  select * into v_appel from public.appels
   where id = p_id and (appelant_id = moi or appele_id = moi)
   for update;
  if not found then
    raise exception 'appel_introuvable' using errcode = 'P0002';
  end if;

  if v_appel.etat = 'en_cours' then
    if v_appel.repondu_a <= now() - interval '15 minutes' then
      -- D6 : appel coupé à 15 minutes ; la ligne rendue le dit au client.
      update public.appels
         set etat = 'termine', fini_a = repondu_a + interval '15 minutes', duree_s = 900,
             offre = null, reponse = null
       where id = p_id
      returning * into v_appel;
    else
      update public.appels set battement_a = now() where id = p_id
      returning * into v_appel;
    end if;
  end if;
  return v_appel;
end;
$$;

revoke all on function public.appel_lancer(text, text) from public, anon, authenticated;
revoke all on function public.appel_repondre(uuid, text) from public, anon, authenticated;
revoke all on function public.appel_refuser(uuid) from public, anon, authenticated;
revoke all on function public.appel_terminer(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.appel_battement(uuid) from public, anon, authenticated;
grant execute on function public.appel_lancer(text, text) to authenticated;
grant execute on function public.appel_repondre(uuid, text) to authenticated;
grant execute on function public.appel_refuser(uuid) to authenticated;
grant execute on function public.appel_terminer(uuid, text, boolean) to authenticated;
grant execute on function public.appel_battement(uuid) to authenticated;

comment on function public.appel_lancer(text, text) is
  'Lot C2b. Lance un appel (état sonne, 30 s) vers un compte actif visible, hors poste partagé, si aucun des deux n''est déjà en appel. SECURITY DEFINER voulu : aucune écriture directe sur appels (advisor 0029 attendu).';
comment on function public.appel_repondre(uuid, text) is
  'Lot C2b. L''appelé répond (en_cours) tant que la sonnerie court ; le premier appareil gagne, les autres reçoivent appel_plus_en_sonnerie. SECURITY DEFINER voulu (advisor 0029 attendu).';
comment on function public.appel_refuser(uuid) is
  'Lot C2b. L''appelé refuse pendant la sonnerie ; sinon rend la ligne sans la changer. SECURITY DEFINER voulu (advisor 0029 attendu).';
comment on function public.appel_terminer(uuid, text, boolean) is
  'Lot C2b. Un participant raccroche : manque, refuse, termine (durée) ou echec ; efface offre et réponse ; rapporte le relais. Rejouable sur un appel clos. SECURITY DEFINER voulu (advisor 0029 attendu).';
comment on function public.appel_battement(uuid) is
  'Lot C2b. Battement d''un participant toutes les 30 s ; coupe l''appel à 15 minutes. SECURITY DEFINER voulu (advisor 0029 attendu).';

-- ── 6. Tâche pg_cron ───────────────────────────────────────────────────────
-- Par nom : un rejeu met la tâche à jour, il n'en crée pas une seconde.
select cron.schedule('appels-balayage', '* * * * *', 'select public.appels_balayer()');

-- ── 7. Publication Realtime ────────────────────────────────────────────────
do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appels'
  ) then
    alter publication supabase_realtime add table public.appels;
  end if;
end
$pub$;
