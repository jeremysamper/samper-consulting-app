-- SI3, complement (revue de securite post-commit du 04.11.2026) :
--   1. les tags de reservation porteurs de sante (allergene, regime) ou de
--      texte libre sont des donnees de la personne : l'effacement les supprime
--      sur les reservations du client (les tags occasion fermes restent pour
--      les statistiques), et l'export les joint a chaque reservation ;
--   2. verrou sur spa_envois : par l'API, email et erreur ne peuvent que se
--      vider (jamais recevoir une valeur), le nettoyage d'effacement reste
--      possible, la falsification du journal non.
-- Hors perimetre, comme la migration precedente : les reservations creees par
-- un groupe (groupe_vers_reservation, sans client_id, reecrites par le groupe)
-- et la table groupe_evenements ; au registre SI4.
-- Reecrit les deux fonctions en entier (create or replace), rejouable.

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
      'sejours', coalesce((select jsonb_agg(to_jsonb(s) order by s.arrivee)
        from sejours s where s.client_id = c.id), '[]'::jsonb)
    ) into v_res
    from resa_clients c where c.id = p_client_id;
  end if;

  return v_res;
end;
$fn$;

comment on function public.export_personne(text, text) is
  'SI3 D4 : export JSON des donnees d''un client spa ou de reservation, tags de reservation compris. Consultant et patron de l''etablissement, compte actif.';

create or replace function public.effacer_personne(p_type text, p_client_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_profil record;
  v_etab text;
  n_client integer;
  n_lignes integer;
  n_attendu integer;
  v_res jsonb;
begin
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

  if p_type = 'spa' then
    -- Le trigger spa_clients_avant_ecriture fige desinscription_token : le
    -- jeton reste, mais l'e-mail vide rend le lien de desinscription inoperant.
    update spa_clients set
      prenom = '',
      nom = 'Client effacé',
      email = null, telephone = null, date_naissance = null, adresse = null,
      notes_sante = null, preferences = null, notes = null,
      consentement_marketing = false, consentement_at = null,
      archive = true, updated_at = now()
    where id = p_client_id;
    get diagnostics n_client = row_count;
    if n_client <> 1 then
      raise exception 'EFFACEMENT_INCOMPLET';
    end if;
    v_res = jsonb_build_object('type', 'client_spa', 'client', n_client);

    update spa_reservations set notes = null, updated_at = now()
    where client_id = p_client_id and notes is not null;
    get diagnostics n_lignes = row_count;
    v_res = v_res || jsonb_build_object('rendez_vous', n_lignes);

    update spa_seances set
      observations = null, ressenti = null, recommandations = null, updated_at = now()
    where client_id = p_client_id
      and (observations is not null or ressenti is not null or recommandations is not null);
    get diagnostics n_lignes = row_count;
    v_res = v_res || jsonb_build_object('seances', n_lignes);

    -- spa_bons_avant_maj fige le message : le drapeau de transaction, pose ici
    -- seulement, l'autorise a passer. Remis a vide aussitot apres.
    perform set_config('app.effacement_personne', 'on', true);
    update spa_bons set message = null
    where client_id = p_client_id and message is not null;
    get diagnostics n_lignes = row_count;
    perform set_config('app.effacement_personne', '', true);
    v_res = v_res || jsonb_build_object('bons', n_lignes);

    update spa_envois set email = null, erreur = null
    where client_id = p_client_id and (email is not null or erreur is not null);
    get diagnostics n_lignes = row_count;
    v_res = v_res || jsonb_build_object('envois', n_lignes);
  else
    update resa_clients set
      prenom = '',
      nom = 'Client effacé',
      email = null, telephone = null, date_naissance = null,
      allergies = null, preferences = null, notes = null,
      consentement_marketing = false, consentement_at = null, consentement_source = null,
      -- desinscription_token est NOT NULL : on le fait tourner, les anciens liens meurent
      desinscrit_at = null, desinscription_token = gen_random_uuid(),
      lightspeed_customer_id = null,
      -- email_cle et telephone_cle sont generees depuis email et telephone : elles retombent a null d'elles-memes
      archive = true, updated_at = now()
    where id = p_client_id;
    get diagnostics n_client = row_count;
    if n_client <> 1 then
      raise exception 'EFFACEMENT_INCOMPLET';
    end if;
    v_res = jsonb_build_object('type', 'client_reservation', 'client', n_client);

    -- La RLS de reservations, de reservation_tags et de sejours exige un droit
    -- (previsions, hebergement) que l'appelant peut ne pas avoir : un
    -- effacement partiel silencieux est refuse, l'exception annule tout.
    select count(*) into n_attendu from reservations where client_id = p_client_id;
    update reservations set
      nom = 'Client effacé',
      telephone = null, email = null, notes_libres = null, updated_at = now()
    where client_id = p_client_id;
    get diagnostics n_lignes = row_count;
    if n_lignes <> n_attendu then
      raise exception 'EFFACEMENT_INCOMPLET';
    end if;
    v_res = v_res || jsonb_build_object('reservations', n_lignes);

    -- Tags des reservations du client : supprimes, sauf le tag occasion ferme,
    -- seul tag sans donnee personnelle (il reste pour les statistiques).
    select count(*) into n_attendu from reservation_tags t
    where t.reservation_id in (select id from reservations where client_id = p_client_id)
      and not (t.type_tag = 'occasion' and not t.libre);
    delete from reservation_tags t
    where t.reservation_id in (select id from reservations where client_id = p_client_id)
      and not (t.type_tag = 'occasion' and not t.libre);
    get diagnostics n_lignes = row_count;
    if n_lignes <> n_attendu then
      raise exception 'EFFACEMENT_INCOMPLET';
    end if;
    v_res = v_res || jsonb_build_object('tags', n_lignes);

    select count(*) into n_attendu from sejours where client_id = p_client_id;
    update sejours set
      nom_hote = 'Client effacé',
      notes = null, demandes_speciales = null, updated_at = now()
    where client_id = p_client_id;
    get diagnostics n_lignes = row_count;
    if n_lignes <> n_attendu then
      raise exception 'EFFACEMENT_INCOMPLET';
    end if;
    v_res = v_res || jsonb_build_object('sejours', n_lignes);
  end if;

  return v_res;
end;
$fn$;

comment on function public.effacer_personne(text, text) is
  'SI3 D5 : anonymise un client spa ou de reservation (nom remplace, contact, notes, sante et tags de sante vides). Les lignes restent.';

-- Verrou du journal des envois : par l'API, email et erreur ne peuvent que
-- se vider. Le grant par colonnes (migration precedente) limite deja aux deux
-- colonnes ; ce trigger interdit en plus d'y ecrire une valeur.
create or replace function public.spa_envois_verrou_maj()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if (select auth.uid()) is not null then
    if (new.email is distinct from old.email and new.email is not null)
       or (new.erreur is distinct from old.erreur and new.erreur is not null) then
      raise exception 'Le journal des envois ne se modifie pas : seul l''effacement peut le vider.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $fn$;

revoke all on function public.spa_envois_verrou_maj() from public, anon, authenticated;

drop trigger if exists trg_spa_envois_verrou_maj on public.spa_envois;
create trigger trg_spa_envois_verrou_maj before update on public.spa_envois
  for each row execute function public.spa_envois_verrou_maj();
