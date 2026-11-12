-- ============================================================================
-- Caisse : prevenir la personne qui a envoye des plats quand la cuisine les
-- coche au KDS (notification push par table et par suite).
--
--   caisse_lignes.envoye_par : le compte qui a fait partir la ligne en cuisine
--     (envoi du bon ou reclamation de la suite). Pose par la base au passage
--     en_attente vers envoye, avec le compte de la session ; jamais par l'API,
--     qui ne peut ni le poser ni le changer (meme classe que pret_at). Une
--     ligne envoyee avant ce fichier garde null : l'avis va alors a la
--     personne qui a ouvert le ticket.
--   caisse_prets_avis : la file des avis. Une ligne par passage a "pret" d'une
--     ligne de caisse. Etats : a_envoyer, en_cours, envoye, sans_envoi, annule.
--     Ecrite par le declencheur ci-dessous, lue et soldee par l'Edge Function
--     notifications (action plats_prets, service_role). RLS activee sans
--     politique, droits retires a anon et authenticated : aucun ecran ne la
--     lit. Purgee par la fonction (avis de plus de 2 jours).
--   trg_caisse_ligne_envoyeur (BEFORE) : pose ou fige envoye_par.
--   trg_caisse_ligne_pret_avis (AFTER UPDATE OF pret_at) : de null a date, un
--     avis et un appel asynchrone (pg_net) de la fonction ; de date a null,
--     l'avis encore a_envoyer est annule.
--   export_personne : la colonne neuve n'entre pas dans l'export des donnees
--     d'un client (section 5).
--
-- Le service passe avant l'avis : le geste de la cuisine et l'envoi d'un bon
-- ne peuvent ni echouer ni attendre a cause de ce fichier. Le corps de chaque
-- declencheur est sous "exception when others" (avertissement), l'appel
-- reseau passe par pg_net seulement (file, hors transaction), et l'attente
-- d'un verrou est bornee a 300 ms dans le declencheur d'avis.
--
-- Aucune fonction de service de la caisse ou du KDS n'est reecrite
-- (caisse_bon_interne et kds_item_pret_caisse restent telles quelles).
-- Additive et rejouable sans effet : rien de ce que lit le front deploye ne
-- change. Inverse : 20261112_caisse_prets_avis.rollback.sql
-- Ordre : ce fichier, puis l'Edge Function notifications (action
-- plats_prets), hors service et a la suite. Entre les deux, un plat coche
-- laisse un avis a_envoyer que l'ancienne fonction refuse (401), sans dommage.
-- ============================================================================

set local lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. caisse_lignes.envoye_par
-- ----------------------------------------------------------------------------
-- Meme forme que remise_par et que caisse_tickets.ouvert_par : reference sans
-- action. Une personne qui a envoye des plats se desactive, elle ne se
-- supprime pas (le declencheur fige la colonne : un "set null" serait refuse).
alter table public.caisse_lignes
  add column if not exists envoye_par text references public.profiles(id);

create index if not exists idx_caisse_lignes_envoye_par on public.caisse_lignes(envoye_par);

comment on column public.caisse_lignes.envoye_par is
  'Compte qui a envoye la ligne en cuisine (envoi du bon ou reclamation de la suite). Pose par la base au passage en_attente vers envoye, jamais par l''API. Null pour une ligne envoyee avant le 12.11.2026.';

-- ----------------------------------------------------------------------------
-- 2. caisse_prets_avis
-- ----------------------------------------------------------------------------
-- etablissement_id : copie de celui du ticket, sans cle etrangere (le ticket
-- en porte deja une, en cascade).
create table if not exists public.caisse_prets_avis (
  id               uuid        primary key default gen_random_uuid(),
  ligne_id         uuid        not null references public.caisse_lignes(id) on delete cascade,
  ticket_id        uuid        not null references public.caisse_tickets(id) on delete cascade,
  etablissement_id text        not null,
  suite            int         not null,
  destinataire     text        not null references public.profiles(id) on delete cascade,
  pret_at          timestamptz not null,
  etat             text        not null default 'a_envoyer'
                   check (etat in ('a_envoyer', 'en_cours', 'envoye', 'sans_envoi', 'annule')),
  created_at       timestamptz not null default now(),
  traite_at        timestamptz
);

create index if not exists idx_caisse_prets_avis_ticket on public.caisse_prets_avis(ticket_id, suite, etat);
create index if not exists idx_caisse_prets_avis_ligne  on public.caisse_prets_avis(ligne_id);
create index if not exists idx_caisse_prets_avis_dest   on public.caisse_prets_avis(destinataire);

alter table public.caisse_prets_avis enable row level security;
revoke all on public.caisse_prets_avis from public, anon, authenticated;

comment on table public.caisse_prets_avis is
  'File des avis "plats prets" de la caisse : une ligne par passage a pret d''une ligne. Ecrite par trg_caisse_ligne_pret_avis, soldee par l''Edge Function notifications (plats_prets). Aucune lecture par l''API des ecrans.';

-- ----------------------------------------------------------------------------
-- 3. Qui a envoye la ligne
-- ----------------------------------------------------------------------------
-- A la creation : toujours null (une ligne nait en attente). Au passage
-- en_attente vers envoye : le compte de la session, s'il a un profil ; sans
-- session (fonction de service), la valeur d'avant reste. Dans tous les autres
-- cas la colonne est figee : ce que l'appelant a ecrit est ignore, sans
-- erreur, pour qu'aucune ecriture de la caisse n'echoue a cause d'elle.
-- SECURITY DEFINER : la lecture du profil ne depend pas des politiques de
-- l'appelant. auth.uid() lit le jeton de la requete, quel que soit le role
-- sous lequel la fonction tourne (caisse_bon_interne tourne en definer).
create or replace function public.caisse_ligne_envoyeur()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qui text;
begin
  if tg_op = 'INSERT' then
    new.envoye_par := null;
    return new;
  end if;

  if old.statut = 'en_attente' and new.statut = 'envoye' then
    begin
      select p.id into v_qui from public.profiles p where p.id = auth.uid()::text;
    exception when others then
      v_qui := null;
      raise warning 'caisse_ligne_envoyeur: envoyeur illisible pour la ligne % : %', new.id, sqlerrm;
    end;
    new.envoye_par := coalesce(v_qui, old.envoye_par);
  else
    new.envoye_par := old.envoye_par;
  end if;
  return new;
end;
$$;

revoke all on function public.caisse_ligne_envoyeur() from public, anon, authenticated;

create or replace trigger trg_caisse_ligne_envoyeur
  before insert or update on public.caisse_lignes
  for each row execute function public.caisse_ligne_envoyeur();

comment on function public.caisse_ligne_envoyeur() is
  'Caisse : pose caisse_lignes.envoye_par au passage en_attente vers envoye (compte de la session) et le fige partout ailleurs. Ne leve jamais.';

-- ----------------------------------------------------------------------------
-- 4. Un plat passe a "pret" : un avis, et l'appel de la fonction
-- ----------------------------------------------------------------------------
-- pret_at n'est ecrit que par kds_item_pret_caisse (declencheur du KDS), qui
-- ecarte deja les items Lightspeed, les items encore tenus et les tickets qui
-- ne sont plus ouverts. Ici en plus : pas d'avis pour une ligne deja servie
-- (ou jamais partie), ni pour un ticket qui n'est plus ouvert.
-- Destinataire : l'envoyeur de la ligne, a defaut la personne qui a ouvert le
-- ticket, a defaut personne (pas d'avis). L'Edge Function relit tout au moment
-- d'envoyer (profil actif, rattache a l'etablissement, appareils abonnes).
-- Un appel par avis : la fonction attend la fenetre de regroupement, puis une
-- seule execution prend tous les avis du ticket et de la suite.
-- Toute erreur devient un avertissement : le plat reste coche, pret_at pose.
create or replace function public.caisse_ligne_pret_avis()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '300ms'
as $$
declare
  v_etab   text;
  v_statut text;
  v_ouvreur text;
  v_dest   text;
  v_secret text;
begin
  begin
    if old.pret_at is not null and new.pret_at is null then
      update public.caisse_prets_avis
         set etat = 'annule', traite_at = clock_timestamp()
       where ligne_id = new.id and etat = 'a_envoyer';

    elsif old.pret_at is null and new.pret_at is not null then
      if new.statut is distinct from 'envoye' then
        return null;
      end if;
      select t.etablissement_id, t.statut, t.ouvert_par into v_etab, v_statut, v_ouvreur
        from public.caisse_tickets t where t.id = new.ticket_id;
      if v_statut is distinct from 'ouvert' then
        return null;
      end if;
      v_dest := coalesce(new.envoye_par, v_ouvreur);
      if v_dest is null then
        return null;
      end if;

      insert into public.caisse_prets_avis (ligne_id, ticket_id, etablissement_id, suite, destinataire, pret_at)
      values (new.id, new.ticket_id, v_etab, new.suite, v_dest, new.pret_at);

      select c.secret_interne into v_secret from public.push_config c where c.id = 1;
      if v_secret is not null then
        perform net.http_post(
          url := 'https://ppmtoiqgajwcdkbnrcll.supabase.co/functions/v1/notifications',
          body := jsonb_build_object(
            'action', 'plats_prets', 'ticketId', new.ticket_id, 'suite', new.suite, 'secret', v_secret),
          headers := '{"Content-Type": "application/json"}'::jsonb,
          timeout_milliseconds := 20000
        );
      end if;
    end if;
  exception when others then
    raise warning 'caisse_ligne_pret_avis: ligne % sans avis : %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.caisse_ligne_pret_avis() from public, anon, authenticated;

create or replace trigger trg_caisse_ligne_pret_avis
  after update of pret_at on public.caisse_lignes
  for each row
  when (old.pret_at is distinct from new.pret_at)
  execute function public.caisse_ligne_pret_avis();

comment on function public.caisse_ligne_pret_avis() is
  'Caisse : au passage a pret d''une ligne envoyee (ticket ouvert), cree un avis pour l''envoyeur et appelle l''Edge Function notifications (plats_prets) par pg_net ; au retour a non pret, annule l''avis encore a_envoyer. Ne leve jamais.';

-- ----------------------------------------------------------------------------
-- 5. Export d'une personne : l'envoyeur d'une ligne n'en sort pas
-- ----------------------------------------------------------------------------
-- export_personne rend les lignes de caisse par to_jsonb(l) : la colonne
-- envoye_par (le compte d'un membre de l'equipe) serait partie dans l'export
-- remis a un client, alors que ouvert_par et encaisse_par en sont deja
-- retires. Fonction de la v6 reprise a l'identique (20261110_caisse_v6.sql,
-- section 11), une seule expression changee : to_jsonb(l) - 'envoye_par'.
-- Droits inchanges (create or replace les garde).
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
            'lignes', coalesce((select jsonb_agg((to_jsonb(l) - 'envoye_par') order by l.created_at)
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
