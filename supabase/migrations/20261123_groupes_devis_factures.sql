-- ─────────────────────────────────────────────────────────────────────────────
-- Groupes : devis, factures et paiements (23.11.2026)
--
--   facturation_reglages   une ligne par établissement : l'identité qui émet
--                          les devis et les factures (raison sociale, adresse
--                          structurée de la QR-facture, IBAN, TVA, délais,
--                          conditions générales).
--   groupe_devis           un devis, autonome (prospect) ou relié à un groupe.
--                          Accepté, il crée ou rejoint le groupe côté front.
--   groupe_factures        une tranche de facturation d'un devis (acompte,
--                          solde) ou une facture totale. « prevue » = sans
--                          numéro, modifiable ; « emise » = numérotée, figée ;
--                          « annulee » = gardée, barrée.
--   groupe_paiements       les encaissements d'une facture émise (négatif =
--                          remboursement).
--   groupe_docs_compteurs  dernier numéro DEV / FAC par établissement et par
--                          année ; écrit seulement par le déclencheur de
--                          numérotation (SECURITY DEFINER).
--
-- Droit : user_peut_gerer('factures_groupes', consultant + patron), la case
-- « Devis et factures des groupes » de Rôles & accès, cochable par personne
-- (droitsAction de src/modules/moduleConfig.js : garder les rôles par défaut
-- en phase). L'identité de facturation (IBAN compris) ne s'écrit que par le
-- consultant et le patron.
--
-- Les montants (total d'un devis, montant d'une facture) sont posés ici depuis
-- les lignes : somme des quantité x prix unitaire TTC arrondis au centime. Le
-- front calcule la même somme (src/modules/groupes/facturation/calculs.js).
--
-- Ajout seul (expand) : aucune table existante n'est modifiée, le front
-- déployé n'en lit rien. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.facturation_reglages (
  etablissement_id      text         primary key references public.etablissements(id) on delete cascade,
  raison_sociale        text,
  rue                   text,
  numero                text,
  npa                   text,
  localite              text,
  pays                  text         not null default 'CH' check (pays ~ '^[A-Z]{2}$'),
  telephone             text,
  email                 text,
  iban                  text,
  assujetti_tva         boolean      not null default true,
  numero_tva            text,
  delai_paiement_jours  integer      not null default 30 check (delai_paiement_jours between 0 and 365),
  validite_devis_jours  integer      not null default 30 check (validite_devis_jours between 1 and 365),
  acompte_pct           numeric(5,2) not null default 30 check (acompte_pct >= 0 and acompte_pct <= 100),
  conditions            text,
  mention_facture       text,
  updated_at            timestamptz  not null default now()
);

create table if not exists public.groupe_docs_compteurs (
  etablissement_id  text     not null references public.etablissements(id) on delete cascade,
  prefixe           text     not null check (prefixe in ('DEV', 'FAC')),
  annee             integer  not null check (annee between 2000 and 2999),
  dernier           integer  not null default 0 check (dernier >= 0),
  primary key (etablissement_id, prefixe, annee)
);

create table if not exists public.groupe_devis (
  id                   text          primary key default (gen_random_uuid())::text,
  etablissement_id     text          not null references public.etablissements(id) on delete cascade,
  numero               text,
  groupe_evenement_id  text          references public.groupe_evenements(id) on delete set null,
  statut               text          not null default 'brouillon'
                                     check (statut in ('brouillon', 'envoye', 'accepte', 'refuse')),
  titre                text,
  client_nom           text          not null check (btrim(client_nom) <> ''),
  client_contact       text,
  client_email         text,
  client_telephone     text,
  client_adresse       text,
  type_groupe          text          check (type_groupe is null
                                            or type_groupe in ('mariage', 'anniversaire', 'seminaire', 'groupe', 'apero_dinatoire')),
  date_evenement       date,
  heure                time,
  nb_pax               integer       check (nb_pax is null or nb_pax between 1 and 5000),
  menu_numero          integer       check (menu_numero is null or menu_numero between 1 and 12),
  lignes               jsonb         not null default '[]'::jsonb check (jsonb_typeof(lignes) = 'array'),
  total                numeric(12,2) not null default 0,
  date_devis           date          not null default ((now() at time zone 'Europe/Zurich')::date),
  valide_jusqu         date,
  conditions           text,
  notes                text,
  envoye_le            timestamptz,
  accepte_le           timestamptz,
  accepte_par          text,
  refuse_le            timestamptz,
  created_by           text          default ((auth.uid())::text),
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now(),
  constraint groupe_devis_numero_unique unique (etablissement_id, numero)
);

create table if not exists public.groupe_factures (
  id                   text          primary key default (gen_random_uuid())::text,
  etablissement_id     text          not null references public.etablissements(id) on delete cascade,
  numero               text,
  devis_id             text          references public.groupe_devis(id),          -- no action : vérifié en fin d'instruction (cascade depuis l'établissement)
  groupe_evenement_id  text          references public.groupe_evenements(id) on delete set null,
  type                 text          not null default 'totale' check (type in ('acompte', 'solde', 'totale')),
  libelle              text,
  ordre                integer       not null default 1 check (ordre between 1 and 99),
  statut               text          not null default 'prevue' check (statut in ('prevue', 'emise', 'annulee')),
  titre                text,
  client_nom           text          not null check (btrim(client_nom) <> ''),
  client_contact       text,
  client_email         text,
  client_adresse       text,
  lignes               jsonb         not null default '[]'::jsonb check (jsonb_typeof(lignes) = 'array'),
  montant              numeric(12,2) not null default 0,
  date_facture         date,
  echeance             date,
  mode_prevu           text          not null default 'virement'
                                     check (mode_prevu in ('virement', 'carte', 'especes', 'twint', 'autre')),
  mention              text,
  envoyee_le           timestamptz,
  relances             jsonb         not null default '[]'::jsonb check (jsonb_typeof(relances) = 'array'),
  emise_le             timestamptz,
  emise_par            text,
  annulee_le           timestamptz,
  motif_annulation     text,
  notes                text,
  created_by           text          default ((auth.uid())::text),
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now(),
  constraint groupe_factures_numero_unique unique (etablissement_id, numero),
  constraint groupe_factures_emise_numerotee check (statut = 'prevue' or numero is not null),
  constraint groupe_factures_echeance_apres check (echeance is null or date_facture is null or echeance >= date_facture)
);

create table if not exists public.groupe_paiements (
  id                text          primary key default (gen_random_uuid())::text,
  etablissement_id  text          not null references public.etablissements(id) on delete cascade,
  facture_id        text          not null references public.groupe_factures(id),  -- no action, idem
  date_paiement     date          not null default ((now() at time zone 'Europe/Zurich')::date),
  montant           numeric(12,2) not null check (montant <> 0),
  mode              text          not null default 'virement'
                                  check (mode in ('virement', 'carte', 'especes', 'twint', 'cheque', 'autre')),
  reference         text,
  note              text,
  created_by        text          default ((auth.uid())::text),
  created_at        timestamptz   not null default now()
);

-- Index : chaque clé étrangère, et les listes lues par établissement et date.
create index if not exists idx_groupe_devis_etab_date      on public.groupe_devis(etablissement_id, date_devis);
create index if not exists idx_groupe_devis_groupe         on public.groupe_devis(groupe_evenement_id);
create index if not exists idx_groupe_factures_etab_date   on public.groupe_factures(etablissement_id, date_facture);
create index if not exists idx_groupe_factures_devis       on public.groupe_factures(devis_id);
create index if not exists idx_groupe_factures_groupe      on public.groupe_factures(groupe_evenement_id);
create index if not exists idx_groupe_paiements_facture    on public.groupe_paiements(facture_id);
create index if not exists idx_groupe_paiements_etab_date  on public.groupe_paiements(etablissement_id, date_paiement);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fonctions
-- ─────────────────────────────────────────────────────────────────────────────
-- 2.1 Somme des lignes : quantité x prix unitaire TTC, arrondi au centime par
-- ligne. Une ligne sans nombre lisible vaut 0 (le front n'en écrit pas).
create or replace function public.groupe_lignes_total(p_lignes jsonb)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(sum(round(
           case when jsonb_typeof(l -> 'quantite') = 'number' then (l ->> 'quantite')::numeric else 0 end
         * case when jsonb_typeof(l -> 'prixUnitaire') = 'number' then (l ->> 'prixUnitaire')::numeric else 0 end
         , 2)), 0)::numeric(12,2)
  from jsonb_array_elements(case when jsonb_typeof(p_lignes) = 'array' then p_lignes else '[]'::jsonb end) as l;
$$;

-- 2.2 Numéro suivant DEV-AAAA-NNNN / FAC-AAAA-NNNN, sous le verrou de la ligne
-- du compteur. Interne : appelée par le déclencheur de numérotation seul.
create or replace function public.groupe_doc_numero(p_etablissement_id text, p_prefixe text, p_date date)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_annee integer := extract(year from coalesce(p_date, (now() at time zone 'Europe/Zurich')::date))::integer;
  v_n     integer;
begin
  insert into public.groupe_docs_compteurs as c (etablissement_id, prefixe, annee, dernier)
  values (p_etablissement_id, p_prefixe, v_annee, 1)
  on conflict (etablissement_id, prefixe, annee) do update set dernier = c.dernier + 1
  returning c.dernier into v_n;
  return p_prefixe || '-' || v_annee::text || '-' || lpad(v_n::text, 4, '0');
end;
$$;

revoke all on function public.groupe_doc_numero(text, text, date) from public, anon, authenticated;

-- 2.3 Garde des devis (droits de l'appelant). Le numéro, l'établissement et
-- l'auteur ne bougent jamais ; le total suit les lignes ; un devis accepté a
-- son contenu figé ; le rouvrir est refusé dès qu'une facture en découle. Le
-- passage du lien vers le groupe à NULL (suppression définitive du groupe,
-- ON DELETE SET NULL) passe dans tous les états.
create or replace function public.groupe_devis_garde()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_libres text[] := array['groupe_evenement_id', 'notes', 'envoye_le', 'statut', 'accepte_le',
                           'accepte_par', 'refuse_le', 'updated_at'];
begin
  if tg_op = 'INSERT' then
    new.numero := null;
    -- L'auteur est l'appelant, jamais une valeur envoyée par le client
    -- (sans session : service role, la valeur fournie reste).
    new.created_by := coalesce((select auth.uid())::text, new.created_by);
    new.created_at := now();
    new.accepte_le := case when new.statut = 'accepte' then now() else null end;
    new.accepte_par := case when new.statut = 'accepte' then (select auth.uid())::text else null end;
    new.envoye_le := case when new.statut in ('envoye', 'accepte') then now() else null end;
    new.refuse_le := case when new.statut = 'refuse' then now() else null end;
  else
    if new.etablissement_id is distinct from old.etablissement_id
       or new.numero is distinct from old.numero
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Numéro, établissement et auteur d''un devis ne se modifient pas'
        using errcode = '42501';
    end if;

    if old.statut = 'accepte' and new.statut = 'accepte'
       and (to_jsonb(new) - v_libres - 'total') is distinct from (to_jsonb(old) - v_libres - 'total') then
      raise exception 'Devis accepté : son contenu est figé (rouvrir le devis pour le changer)'
        using errcode = '42501';
    end if;

    if old.statut = 'accepte' and new.statut <> 'accepte'
       and exists (select 1 from public.groupe_factures f
                   where f.devis_id = old.id and f.statut in ('prevue', 'emise')) then
      raise exception 'Ce devis a déjà des factures : il reste accepté'
        using errcode = '42501';
    end if;

    if new.statut is distinct from old.statut then
      if new.statut = 'accepte' then
        new.accepte_le := now();
        new.accepte_par := (select auth.uid())::text;
      elsif new.statut = 'envoye' then
        new.envoye_le := coalesce(new.envoye_le, now());
      elsif new.statut = 'refuse' then
        new.refuse_le := now();
      end if;
      if new.statut <> 'accepte' then
        new.accepte_le := null;
        new.accepte_par := null;
      end if;
      if new.statut <> 'refuse' then
        new.refuse_le := null;
      end if;
    end if;
  end if;

  -- Un groupe relié appartient au même établissement.
  if new.groupe_evenement_id is not null
     and (tg_op = 'INSERT' or new.groupe_evenement_id is distinct from old.groupe_evenement_id)
     and not exists (select 1 from public.groupe_evenements g
                     where g.id = new.groupe_evenement_id and g.etablissement_id = new.etablissement_id) then
    raise exception 'Groupe introuvable dans cet établissement' using errcode = '42501';
  end if;

  new.total := public.groupe_lignes_total(new.lignes);
  return new;
end;
$$;

-- 2.4 Garde des factures (droits de l'appelant).
--   prevue  : contenu libre, sans numéro ; passe à emise, jamais à annulee
--             (une tranche prévue se supprime).
--   emise   : contenu figé ; seuls l'échéance, le mode prévu, l'envoi, les
--             relances, les notes, le lien vers le groupe et l'annulation
--             (refusée tant qu'un paiement est saisi) bougent.
--   annulee : figée, notes et lien vers le groupe exceptés.
create or replace function public.groupe_factures_garde()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_libres_emise   text[] := array['echeance', 'mode_prevu', 'envoyee_le', 'relances', 'notes',
                                   'groupe_evenement_id', 'statut', 'annulee_le', 'motif_annulation', 'updated_at'];
  v_libres_annulee text[] := array['notes', 'groupe_evenement_id', 'updated_at'];
  v_devis_etab     text;
begin
  if tg_op = 'INSERT' then
    new.numero := null;
    new.created_by := coalesce((select auth.uid())::text, new.created_by);
    new.created_at := now();
    if new.statut not in ('prevue', 'emise') then
      raise exception 'Une facture naît prévue ou émise' using errcode = '42501';
    end if;
    new.annulee_le := null;
    new.motif_annulation := null;
    new.emise_le := null;
    new.emise_par := null;
  else
    if new.etablissement_id is distinct from old.etablissement_id
       or new.numero is distinct from old.numero
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.emise_le is distinct from old.emise_le
       or new.emise_par is distinct from old.emise_par then
      raise exception 'Numéro, établissement, émission et auteur d''une facture ne se modifient pas'
        using errcode = '42501';
    end if;

    if old.statut = 'emise' then
      new.montant := public.groupe_lignes_total(new.lignes);
      if new.statut = 'prevue' then
        raise exception 'Une facture émise ne redevient pas prévue' using errcode = '42501';
      end if;
      if (to_jsonb(new) - v_libres_emise) is distinct from (to_jsonb(old) - v_libres_emise) then
        raise exception 'Facture émise : son contenu est figé (l''annuler et en émettre une autre)'
          using errcode = '42501';
      end if;
      if new.statut = 'annulee' then
        if exists (select 1 from public.groupe_paiements p where p.facture_id = old.id) then
          raise exception 'Cette facture a des paiements : rembourser ou supprimer les paiements avant de l''annuler'
            using errcode = '42501';
        end if;
        new.annulee_le := now();
      else
        new.annulee_le := null;
        new.motif_annulation := null;
      end if;
    elsif old.statut = 'annulee' then
      if (to_jsonb(new) - v_libres_annulee) is distinct from (to_jsonb(old) - v_libres_annulee) then
        raise exception 'Facture annulée : elle ne se modifie plus' using errcode = '42501';
      end if;
    else
      if new.statut = 'annulee' then
        raise exception 'Une tranche prévue se supprime, elle ne s''annule pas' using errcode = '42501';
      end if;
      new.annulee_le := null;
      new.motif_annulation := null;
    end if;
  end if;

  -- Émission : date du jour par défaut, horodatage et auteur.
  if new.statut = 'emise' and (tg_op = 'INSERT' or old.statut = 'prevue') then
    new.date_facture := coalesce(new.date_facture, (now() at time zone 'Europe/Zurich')::date);
    new.emise_le := now();
    new.emise_par := (select auth.uid())::text;
  end if;

  -- Devis et groupe reliés : même établissement.
  if new.devis_id is not null and (tg_op = 'INSERT' or new.devis_id is distinct from old.devis_id) then
    select d.etablissement_id into v_devis_etab from public.groupe_devis d where d.id = new.devis_id;
    if v_devis_etab is null or v_devis_etab <> new.etablissement_id then
      raise exception 'Devis introuvable dans cet établissement' using errcode = '42501';
    end if;
  end if;
  if new.groupe_evenement_id is not null
     and (tg_op = 'INSERT' or new.groupe_evenement_id is distinct from old.groupe_evenement_id)
     and not exists (select 1 from public.groupe_evenements g
                     where g.id = new.groupe_evenement_id and g.etablissement_id = new.etablissement_id) then
    raise exception 'Groupe introuvable dans cet établissement' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' or old.statut = 'prevue' then
    new.montant := public.groupe_lignes_total(new.lignes);
  end if;
  return new;
end;
$$;

-- 2.5 Numérotation (SECURITY DEFINER : elle seule écrit le compteur). Rien
-- d'autre ici : les gardes qui lisent l'appelant restent en invoker. Le nom
-- des déclencheurs fixe l'ordre : garde (10) puis numéro (20).
create or replace function public.groupe_docs_numeroter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'groupe_devis' then
    if tg_op = 'INSERT' then
      new.numero := public.groupe_doc_numero(new.etablissement_id, 'DEV', new.date_devis);
    end if;
  elsif tg_table_name = 'groupe_factures' then
    if new.statut = 'emise' and new.numero is null then
      new.numero := public.groupe_doc_numero(new.etablissement_id, 'FAC', new.date_facture);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.groupe_docs_numeroter() from public, anon, authenticated;

-- 2.6 Garde des paiements : seulement sur une facture émise du même
-- établissement ; la facture et l'établissement d'un paiement ne bougent pas.
create or replace function public.groupe_paiements_garde()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_etab   text;
  v_statut text;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid())::text, new.created_by);
    new.created_at := now();
  else
    if new.facture_id is distinct from old.facture_id
       or new.etablissement_id is distinct from old.etablissement_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Facture, établissement et auteur d''un paiement ne se modifient pas'
        using errcode = '42501';
    end if;
  end if;
  select f.etablissement_id, f.statut into v_etab, v_statut
    from public.groupe_factures f where f.id = new.facture_id;
  if v_etab is null or v_etab <> new.etablissement_id then
    raise exception 'Facture introuvable dans cet établissement' using errcode = '42501';
  end if;
  if v_statut <> 'emise' then
    raise exception 'Un paiement se saisit sur une facture émise' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Déclencheurs
-- ─────────────────────────────────────────────────────────────────────────────
create or replace trigger trg_groupe_devis_10_garde
  before insert or update on public.groupe_devis
  for each row execute function public.groupe_devis_garde();
create or replace trigger trg_groupe_devis_20_numero
  before insert on public.groupe_devis
  for each row execute function public.groupe_docs_numeroter();
create or replace trigger trg_groupe_devis_updated_at
  before update on public.groupe_devis
  for each row execute function public.set_updated_at();

create or replace trigger trg_groupe_factures_10_garde
  before insert or update on public.groupe_factures
  for each row execute function public.groupe_factures_garde();
create or replace trigger trg_groupe_factures_20_numero
  before insert or update on public.groupe_factures
  for each row execute function public.groupe_docs_numeroter();
create or replace trigger trg_groupe_factures_updated_at
  before update on public.groupe_factures
  for each row execute function public.set_updated_at();

create or replace trigger trg_groupe_paiements_10_garde
  before insert or update on public.groupe_paiements
  for each row execute function public.groupe_paiements_garde();

create or replace trigger trg_facturation_reglages_updated_at
  before update on public.facturation_reglages
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.facturation_reglages  enable row level security;
alter table public.groupe_docs_compteurs enable row level security;
alter table public.groupe_devis          enable row level security;
alter table public.groupe_factures       enable row level security;
alter table public.groupe_paiements      enable row level security;

-- Le compteur n'a aucune policy : seule la fonction de numérotation l'écrit.
revoke all on table public.groupe_docs_compteurs from public, anon, authenticated;

revoke all on table public.facturation_reglages from public, anon, authenticated;
revoke all on table public.groupe_devis         from public, anon, authenticated;
revoke all on table public.groupe_factures      from public, anon, authenticated;
revoke all on table public.groupe_paiements     from public, anon, authenticated;
grant select, insert, update, delete on table public.facturation_reglages to authenticated;
grant select, insert, update, delete on table public.groupe_devis         to authenticated;
grant select, insert, update, delete on table public.groupe_factures      to authenticated;
grant select, insert, update, delete on table public.groupe_paiements     to authenticated;

-- 4.1 Identité de facturation : lue par qui a le droit, écrite par la direction.
drop policy if exists facturation_reglages_select on public.facturation_reglages;
create policy facturation_reglages_select on public.facturation_reglages
  for select to authenticated
  using (user_can_access_etab(etablissement_id)
         and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']));

drop policy if exists facturation_reglages_insert on public.facturation_reglages;
create policy facturation_reglages_insert on public.facturation_reglages
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
              and (select public.current_user_role()) in ('consultant', 'patron'));

drop policy if exists facturation_reglages_update on public.facturation_reglages;
create policy facturation_reglages_update on public.facturation_reglages
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
         and (select public.current_user_role()) in ('consultant', 'patron'))
  with check (user_can_access_etab(etablissement_id)
              and (select public.current_user_role()) in ('consultant', 'patron'));

drop policy if exists facturation_reglages_delete on public.facturation_reglages;
create policy facturation_reglages_delete on public.facturation_reglages
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
         and (select public.current_user_role()) in ('consultant', 'patron'));

-- 4.2 Devis, factures, paiements : le droit « Devis et factures des groupes ».
drop policy if exists groupe_devis_select on public.groupe_devis;
create policy groupe_devis_select on public.groupe_devis
  for select to authenticated
  using (user_can_access_etab(etablissement_id)
         and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']));

drop policy if exists groupe_devis_insert on public.groupe_devis;
create policy groupe_devis_insert on public.groupe_devis
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
              and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']));

drop policy if exists groupe_devis_update on public.groupe_devis;
create policy groupe_devis_update on public.groupe_devis
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
         and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']))
  with check (user_can_access_etab(etablissement_id)
              and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']));

drop policy if exists groupe_devis_delete on public.groupe_devis;
create policy groupe_devis_delete on public.groupe_devis
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
         and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']));

drop policy if exists groupe_factures_select on public.groupe_factures;
create policy groupe_factures_select on public.groupe_factures
  for select to authenticated
  using (user_can_access_etab(etablissement_id)
         and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']));

drop policy if exists groupe_factures_insert on public.groupe_factures;
create policy groupe_factures_insert on public.groupe_factures
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
              and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']));

drop policy if exists groupe_factures_update on public.groupe_factures;
create policy groupe_factures_update on public.groupe_factures
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
         and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']))
  with check (user_can_access_etab(etablissement_id)
              and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']));

-- Une tranche prévue se supprime ; une facture émise ou annulée, seulement par
-- le consultant (nettoyage d'un essai), et jamais avec des paiements (FK).
drop policy if exists groupe_factures_delete on public.groupe_factures;
create policy groupe_factures_delete on public.groupe_factures
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
         and public.user_peut_gerer('factures_groupes', array['consultant', 'patron'])
         and (statut = 'prevue' or (select public.current_user_role()) = 'consultant'));

drop policy if exists groupe_paiements_select on public.groupe_paiements;
create policy groupe_paiements_select on public.groupe_paiements
  for select to authenticated
  using (user_can_access_etab(etablissement_id)
         and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']));

drop policy if exists groupe_paiements_insert on public.groupe_paiements;
create policy groupe_paiements_insert on public.groupe_paiements
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
              and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']));

drop policy if exists groupe_paiements_update on public.groupe_paiements;
create policy groupe_paiements_update on public.groupe_paiements
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
         and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']))
  with check (user_can_access_etab(etablissement_id)
              and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']));

drop policy if exists groupe_paiements_delete on public.groupe_paiements;
create policy groupe_paiements_delete on public.groupe_paiements
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
         and public.user_peut_gerer('factures_groupes', array['consultant', 'patron']));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['groupe_devis', 'groupe_factures', 'groupe_paiements'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

comment on table public.facturation_reglages is
  'Identité de facturation par établissement (23.11.2026) : émetteur, adresse structurée, IBAN, TVA, délais, conditions. Lue avec le droit factures_groupes, écrite par consultant et patron.';
comment on table public.groupe_devis is
  'Devis des groupes (23.11.2026). Numéro DEV-AAAA-NNNN et total posés par déclencheurs ; contenu figé une fois accepté.';
comment on table public.groupe_factures is
  'Factures des groupes (23.11.2026) : prevue (sans numéro), emise (FAC-AAAA-NNNN, figée), annulee. Montant posé depuis les lignes.';
comment on table public.groupe_paiements is
  'Encaissements des factures de groupes (23.11.2026), sur une facture émise. Négatif = remboursement.';
comment on table public.groupe_docs_compteurs is
  'Compteurs DEV / FAC par établissement et année, écrits par groupe_docs_numeroter seule.';
