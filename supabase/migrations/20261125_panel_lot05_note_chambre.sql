-- Lot 05 du panel (25.11.2026) : porter un ticket de caisse sur la note de la chambre.
--
-- Additif et idempotent. Aucun objet de la Caisse n'est modifié : les fonctions
-- neuves lisent caisse_tickets et caisse_paiements, elles n'y écrivent jamais.
--   1. sejour_lignes.origine et origine_id (l'origine d'une ligne de note) ;
--   2. un index unique (origine, origine_id), qui rend le report idempotent ;
--   3. un déclencheur de garde : une ligne d'origine renseignée ne s'écrit que
--      par les fonctions du lot et ne se modifie jamais ;
--   4. sejour_porter_ticket, sejour_tickets_a_porter, sejour_reports_verifier.
-- Les policies de sejour_lignes (lots H4 et H5) ne changent pas.

-- 1. Colonnes ---------------------------------------------------------------
alter table public.sejour_lignes add column if not exists origine text;
alter table public.sejour_lignes add column if not exists origine_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.sejour_lignes'::regclass
                    and conname = 'sejour_lignes_origine_connue') then
    alter table public.sejour_lignes add constraint sejour_lignes_origine_connue
      check (origine is null or origine in ('caisse_ticket', 'caisse_annulation'));
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.sejour_lignes'::regclass
                    and conname = 'sejour_lignes_origine_paire') then
    alter table public.sejour_lignes add constraint sejour_lignes_origine_paire
      check ((origine is null) = (origine_id is null));
  end if;
end $$;

comment on column public.sejour_lignes.origine is
  'Origine d''une ligne écrite par une autre source que la saisie de la note : caisse_ticket (ticket porté sur la chambre), caisse_annulation (contre-ligne d''un ticket annulé). Nul pour une saisie à la main. Sans rapport avec sejours.origine (canal de réservation).';
comment on column public.sejour_lignes.origine_id is
  'Identifiant de la source (caisse_tickets.id pour les deux origines de la Caisse). Pas une clé étrangère : il désignera plus tard un relevé de minibar ou un rendez-vous.';

-- 2. Index unique -------------------------------------------------------------
create unique index if not exists uq_sejour_lignes_origine
  on public.sejour_lignes (origine, origine_id)
  where origine is not null;

-- 3. Garde --------------------------------------------------------------------
create or replace function public.sejour_lignes_origine_garde()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.origine is not null
       and coalesce(current_setting('app.lot05_report', true), '') <> '1' then
      raise exception 'note: une ligne venue de la Caisse ne s''écrit que par la Caisse'
        using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.origine is not null then
      -- Seul created_by peut changer : le « on delete set null » de la
      -- suppression d'un profil passe par un UPDATE (hotel_h4_coherence, qui
      -- passe avant, garde created_by immuable pour un appel de l'API).
      -- montant est une colonne générée : nulle dans NEW avant l'écriture, elle
      -- suit quantite et prix_unitaire, qui restent comparés.
      if (to_jsonb(new) - 'created_by' - 'montant') is distinct from (to_jsonb(old) - 'created_by' - 'montant') then
        raise exception 'note: une ligne venue de la Caisse ne se modifie pas'
          using errcode = '42501';
      end if;
    elsif new.origine is not null then
      raise exception 'note: l''origine d''une ligne ne se pose pas après coup'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.sejour_lignes_origine_garde() from public, anon, authenticated;

drop trigger if exists trg_sejour_lignes_origine_garde on public.sejour_lignes;
create trigger trg_sejour_lignes_origine_garde
  before insert or update on public.sejour_lignes
  for each row execute function public.sejour_lignes_origine_garde();

-- 4a. Porter un ticket encaissé sur la note d'un séjour ---------------------
create or replace function public.sejour_porter_ticket(p_ticket_id uuid, p_sejour_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     text := (select auth.uid())::text;
  v_role    text;
  v_caisse  boolean;
  v_hotel   boolean;
  t         record;
  s         record;
  v_montant numeric;
  v_exist   record;
  v_ligne   uuid;
  v_jour    date;
  v_contrainte text;
begin
  if v_uid is null then
    raise exception 'note: connexion requise' using errcode = '42501';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_uid and p.actif is not false;
  if not found or coalesce(v_role, '') = '' then
    raise exception 'note: compte sans rôle' using errcode = '42501';
  end if;
  if p_ticket_id is null or p_sejour_id is null then
    raise exception 'note: ticket ou séjour manquant' using errcode = '22023';
  end if;

  select ct.id, ct.etablissement_id, ct.statut, ct.test, ct.numero, ct.annee,
         ct.jour_exploitation, ct.closed_at
    into t
    from public.caisse_tickets ct
   where ct.id = p_ticket_id;
  if not found then
    raise exception 'note: ticket introuvable' using errcode = 'P0002';
  end if;

  v_caisse := coalesce(public.caisse_peut_utiliser(t.etablissement_id), false);
  v_hotel := coalesce(public.user_can_access_etab(t.etablissement_id), false)
             and coalesce(public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']), false);
  if not (v_caisse or v_hotel) then
    raise exception 'note: accès refusé' using errcode = '42501';
  end if;

  -- Rejeu : un ticket déjà porté sur ce séjour rend sa ligne, quel que soit
  -- l'état du ticket ou du séjour depuis (double toucher tardif, départ).
  select l.id, l.sejour_id, l.montant into v_exist
    from public.sejour_lignes l
   where l.origine = 'caisse_ticket' and l.origine_id = t.id;
  if found then
    if v_exist.sejour_id = p_sejour_id then
      return jsonb_build_object('ligne_id', v_exist.id, 'sejour_id', v_exist.sejour_id,
                                'montant', v_exist.montant, 'deja', true);
    end if;
    raise exception 'note: ticket déjà porté sur une autre note' using errcode = '23505';
  end if;

  if t.test then
    raise exception 'note: ticket de test' using errcode = '22023';
  end if;
  if t.statut <> 'encaisse' or t.numero is null or t.annee is null then
    raise exception 'note: ticket non encaissé' using errcode = '22023';
  end if;
  -- D14 : la fenêtre de rattrapage de la liste vaut aussi pour un appel direct.
  if t.closed_at is null or t.closed_at < now() - interval '14 days' then
    raise exception 'note: ticket trop ancien' using errcode = '22023';
  end if;

  select sj.id, sj.etablissement_id, sj.statut, sj.depart
    into s
    from public.sejours sj
   where sj.id = p_sejour_id;
  if not found or s.etablissement_id <> t.etablissement_id then
    raise exception 'note: séjour introuvable' using errcode = 'P0002';
  end if;
  if not (s.statut = 'en_maison'
          or (s.statut = 'parti' and v_hotel
              and s.depart >= (now() at time zone 'Europe/Zurich')::date - 14)) then
    raise exception 'note: séjour pas en maison' using errcode = '22023';
  end if;

  select coalesce(sum(cp.montant), 0) into v_montant
    from public.caisse_paiements cp
   where cp.ticket_id = t.id
     and cp.moyen = 'autre'
     and cp.bon_cadeau_id is null
     and lower(btrim(coalesce(cp.libelle, ''))) like 'chambre%';
  if v_montant <= 0 then
    raise exception 'note: aucun paiement sur la chambre' using errcode = '22023';
  end if;

  v_jour := coalesce(t.jour_exploitation, (t.closed_at at time zone 'Europe/Zurich')::date,
                     (now() at time zone 'Europe/Zurich')::date);

  begin
    perform set_config('app.lot05_report', '1', true);
    insert into public.sejour_lignes
      (etablissement_id, sejour_id, jour, type, libelle, quantite, prix_unitaire, tva_taux,
       origine, origine_id)
    values
      (t.etablissement_id, p_sejour_id, v_jour, 'extra',
       'Restaurant, ticket n° ' || t.annee::text || '-' || lpad(t.numero::text, 6, '0'),
       1, v_montant, null, 'caisse_ticket', t.id)
    returning id into v_ligne;
    perform set_config('app.lot05_report', '', true);
  exception when unique_violation then
    -- Double toucher concurrent : la ligne existe désormais. Seul l'index du
    -- lot est attendu ici ; toute autre unicité remonte telle quelle.
    get stacked diagnostics v_contrainte = constraint_name;
    if v_contrainte is distinct from 'uq_sejour_lignes_origine' then
      raise;
    end if;
    select l.id, l.sejour_id, l.montant into v_exist
      from public.sejour_lignes l
     where l.origine = 'caisse_ticket' and l.origine_id = t.id;
    if found and v_exist.sejour_id = p_sejour_id then
      return jsonb_build_object('ligne_id', v_exist.id, 'sejour_id', v_exist.sejour_id,
                                'montant', v_exist.montant, 'deja', true);
    end if;
    raise exception 'note: ticket déjà porté sur une autre note' using errcode = '23505';
  end;

  return jsonb_build_object('ligne_id', v_ligne, 'sejour_id', p_sejour_id,
                            'montant', v_montant, 'deja', false);
end;
$$;

-- 4b. Tickets payés sur la chambre qui n'ont pas trouvé leur note ------------
create or replace function public.sejour_tickets_a_porter(p_etablissement_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  text := (select auth.uid())::text;
  v_role text;
  v_out  jsonb;
begin
  if v_uid is null then
    raise exception 'note: connexion requise' using errcode = '42501';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_uid and p.actif is not false;
  if not found or coalesce(v_role, '') = '' then
    raise exception 'note: compte sans rôle' using errcode = '42501';
  end if;
  if p_etablissement_id is null
     or not coalesce(public.user_can_access_etab(p_etablissement_id), false)
     or not coalesce(public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']), false) then
    raise exception 'note: accès refusé' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(q.x order by q.closed_at desc), '[]'::jsonb) into v_out
    from (
      select jsonb_build_object(
               'ticket_id', ct.id,
               'numero', ct.numero,
               'annee', ct.annee,
               'jour', ct.jour_exploitation,
               'closed_at', ct.closed_at,
               'montant', pc.montant,
               'libelle', pc.libelle,
               'table_nom', st.nom,
               'encaisse_par', pc.encaisse_par
             ) as x,
             ct.closed_at
        from public.caisse_tickets ct
        join lateral (
          select sum(cp.montant) as montant,
                 min(cp.libelle) as libelle,
                 min(cp.encaisse_par) as encaisse_par
            from public.caisse_paiements cp
           where cp.ticket_id = ct.id
             and cp.moyen = 'autre'
             and cp.bon_cadeau_id is null
             and lower(btrim(coalesce(cp.libelle, ''))) like 'chambre%'
        ) pc on pc.montant > 0
        left join public.salle_tables st on st.id = ct.table_id
       where ct.etablissement_id = p_etablissement_id
         and ct.statut = 'encaisse'
         and ct.test = false
         and ct.numero is not null
         -- jour_exploitation borne la lecture par idx_caisse_tickets_jour ;
         -- closed_at tient la fenêtre exacte de 14 jours.
         and ct.jour_exploitation >= (now() at time zone 'Europe/Zurich')::date - 15
         and ct.closed_at >= now() - interval '14 days'
         and not exists (
           select 1 from public.sejour_lignes l
            where l.origine = 'caisse_ticket' and l.origine_id = ct.id
         )
       order by ct.closed_at desc
       limit 200
    ) q;
  return v_out;
end;
$$;

-- 4c. Contre-lignes des tickets annulés après leur report --------------------
create or replace function public.sejour_reports_verifier(p_sejour_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  text := (select auth.uid())::text;
  v_role text;
  v_etab text;
  v_n    int := 0;
  v_ins  int;
  r      record;
begin
  if v_uid is null then
    raise exception 'note: connexion requise' using errcode = '42501';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_uid and p.actif is not false;
  if not found or coalesce(v_role, '') = '' then
    raise exception 'note: compte sans rôle' using errcode = '42501';
  end if;
  select sj.etablissement_id into v_etab from public.sejours sj where sj.id = p_sejour_id;
  if not found then
    raise exception 'note: séjour introuvable' using errcode = 'P0002';
  end if;
  if not coalesce(public.user_can_access_etab(v_etab), false)
     or not coalesce(public.user_peut_gerer('hebergement', array['consultant', 'patron', 'receptionniste']), false) then
    raise exception 'note: accès refusé' using errcode = '42501';
  end if;

  for r in
    select l.origine_id, l.prix_unitaire, l.jour, ct.annee, ct.numero, ct.annule_jour, ct.annule_at
      from public.sejour_lignes l
      join public.caisse_tickets ct on ct.id = l.origine_id
     where l.sejour_id = p_sejour_id
       and l.origine = 'caisse_ticket'
       and ct.statut = 'annule'
       and not exists (
         select 1 from public.sejour_lignes a
          where a.origine = 'caisse_annulation' and a.origine_id = l.origine_id
       )
  loop
    perform set_config('app.lot05_report', '1', true);
    insert into public.sejour_lignes
      (etablissement_id, sejour_id, jour, type, libelle, quantite, prix_unitaire, tva_taux,
       origine, origine_id)
    values
      (v_etab, p_sejour_id,
       coalesce(r.annule_jour, (r.annule_at at time zone 'Europe/Zurich')::date, r.jour),
       'remise',
       'Annulation du ticket n° ' || r.annee::text || '-' || lpad(r.numero::text, 6, '0'),
       1, -r.prix_unitaire, null, 'caisse_annulation', r.origine_id)
    on conflict (origine, origine_id) where origine is not null do nothing;
    get diagnostics v_ins = row_count;
    perform set_config('app.lot05_report', '', true);
    v_n := v_n + v_ins;
  end loop;
  return v_n;
end;
$$;

-- 5. Droits -------------------------------------------------------------------
revoke all on function public.sejour_porter_ticket(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.sejour_tickets_a_porter(text) from public, anon, authenticated, service_role;
revoke all on function public.sejour_reports_verifier(uuid) from public, anon, authenticated, service_role;
grant execute on function public.sejour_porter_ticket(uuid, uuid) to authenticated;
grant execute on function public.sejour_tickets_a_porter(text) to authenticated;
grant execute on function public.sejour_reports_verifier(uuid) to authenticated;

comment on function public.sejour_porter_ticket(uuid, uuid) is
  'Lot 05 du panel : porte un ticket encaissé, payé « Chambre », sur la note d''un séjour. Montant calculé par la base (paiements autre au libellé chambre, sans bon cadeau). Idempotent. Caisse : séjour en maison seulement ; Hébergement : en maison ou parti.';
comment on function public.sejour_tickets_a_porter(text) is
  'Lot 05 du panel : tickets encaissés depuis 14 jours au plus, payés « Chambre », sans ligne de note. Droit d''Hébergement.';
comment on function public.sejour_reports_verifier(uuid) is
  'Lot 05 du panel : ajoute la contre-ligne (remise) de chaque ticket porté sur ce séjour puis annulé. Rend le nombre de lignes ajoutées.';
