-- ════════════════════════════════════════════════════════════════════════════
-- 20261030_comptabilite
--
-- Module « Comptabilité » (demande de Jérémy, 30.10.2026) : la pré-comptabilité
-- du terrain, jamais la tenue des comptes. Six tables neuves :
--   ventes_jour        chiffre d'affaires du jour par taux de TVA, saisi à la
--                      main (ticket Z du soir) quand il n'y a pas de caisse
--   charges_fixes      loyer, énergie, assurances, leasing, honoraires,
--                      abonnements : saisis une fois avec leur périodicité
--   salaires_estimes   salaire brut estimé par personne, pour le coût du
--                      personnel ; aucune fiche de salaire
--   compta_reglages    méthode de TVA, taux de la dette fiscale nette, charges
--                      sociales de l'employeur, coût horaire moyen
--   releves_bancaires  relevés importés (camt.053 ou CSV de la banque)
--   releve_lignes      lignes de relevé, avec le lien vers la pièce d'achat
--                      rapprochée (document_id)
--
-- Droits (RLS) :
--   - lecture : établissement accessible, et rôle consultant ou patron, ou
--     droit « Régler les factures » (user_peut_gerer('factures_achat', ...),
--     la même case que le déclencheur de 20261007_achats_factures_reglement) ;
--   - écriture : établissement accessible et droit « Régler les factures » ;
--   - salaires_estimes : établissement accessible et rôle consultant ou
--     patron, en lecture comme en écriture ;
--   - aucun accès anon.
-- Une ligne de relevé ne peut pointer que sur une pièce de son établissement.
--
-- Additive : aucune table existante n'est modifiée (achats_documents reste
-- telle quelle, gardée par ses déclencheurs). Le front qui lit ces tables
-- tourne aussi sans elles (écran « pas encore activé »). Idempotente.
-- Inverse : 20261030_comptabilite.rollback.sql.
--
-- NON APPLIQUÉE. Essai à blanc en transaction annulée avant application,
-- hors service, puis application AVANT la fusion du front.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ventes_jour (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  jour             date        not null,
  taux             numeric     not null check (taux >= 0 and taux < 100),
  montant_ttc      numeric     not null check (montant_ttc >= 0 and montant_ttc < 10000000),
  source           text        not null default 'manuel' check (source in ('manuel', 'pos')),
  note             text        null,
  created_by       text        default (auth.uid())::text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint ventes_jour_unique unique (etablissement_id, jour, taux)
);
-- L'index unique (etablissement_id, jour, taux) couvre la clé étrangère.

create table if not exists public.charges_fixes (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  libelle          text        not null check (length(btrim(libelle)) between 1 and 120),
  categorie        text        not null default 'autre'
                   check (categorie in ('loyer', 'energie', 'assurances', 'leasing', 'honoraires', 'abonnements', 'autre')),
  montant          numeric     not null check (montant > 0 and montant < 10000000),
  tva_taux         numeric     null check (tva_taux is null or (tva_taux >= 0 and tva_taux < 100)),
  periodicite      text        not null default 'mensuelle'
                   check (periodicite in ('mensuelle', 'trimestrielle', 'semestrielle', 'annuelle')),
  jour_echeance    smallint    null check (jour_echeance between 1 and 31),
  debut            date        not null,
  fin              date        null,
  fournisseur      text        null,
  note             text        null,
  created_by       text        default (auth.uid())::text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint charges_fixes_dates check (fin is null or fin >= debut)
);
create index if not exists idx_charges_fixes_etab on public.charges_fixes(etablissement_id);

create table if not exists public.salaires_estimes (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  profile_id       text        not null references public.profiles(id) on delete cascade,
  mode             text        not null check (mode in ('mensuel', 'horaire')),
  montant          numeric     not null check (montant > 0 and montant < 1000000),
  treizieme        boolean     not null default true,
  debut            date        not null,
  fin              date        null,
  note             text        null,
  created_by       text        default (auth.uid())::text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint salaires_estimes_dates check (fin is null or fin >= debut)
);
create index if not exists idx_salaires_estimes_etab on public.salaires_estimes(etablissement_id);
create index if not exists idx_salaires_estimes_profile on public.salaires_estimes(profile_id);
-- Un seul salaire ouvert par personne et par maison : on clôt l'ancien avant
-- d'ouvrir le suivant (même règle que les contrats de travail).
create unique index if not exists uq_salaires_estimes_ouvert
  on public.salaires_estimes(profile_id, etablissement_id) where fin is null;

create table if not exists public.compta_reglages (
  etablissement_id     text        primary key references public.etablissements(id) on delete cascade,
  methode_tva          text        not null default 'effective' check (methode_tva in ('effective', 'tdfn')),
  taux_tdfn            numeric     null check (taux_tdfn is null or (taux_tdfn > 0 and taux_tdfn < 100)),
  charges_sociales_pct numeric     not null default 16 check (charges_sociales_pct >= 0 and charges_sociales_pct <= 50),
  cout_horaire_moyen   numeric     null check (cout_horaire_moyen is null or (cout_horaire_moyen > 0 and cout_horaire_moyen < 1000)),
  updated_by           text        default (auth.uid())::text,
  updated_at           timestamptz not null default now()
);
-- La clé primaire couvre la clé étrangère.

create table if not exists public.releves_bancaires (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  format           text        not null check (format in ('camt053', 'csv')),
  nom_fichier      text        null,
  iban             text        null,
  date_debut       date        null,
  date_fin         date        null,
  solde_debut      numeric     null,
  solde_fin        numeric     null,
  nb_lignes        integer     not null default 0 check (nb_lignes >= 0),
  created_by       text        default (auth.uid())::text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_releves_bancaires_etab on public.releves_bancaires(etablissement_id);

create table if not exists public.releve_lignes (
  id               text        primary key default (gen_random_uuid())::text,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  releve_id        text        not null references public.releves_bancaires(id) on delete cascade,
  cle              text        not null,
  date_operation   date        not null,
  date_valeur      date        null,
  montant          numeric     not null check (montant <> 0),
  devise           text        not null default 'CHF',
  libelle          text        null,
  contrepartie     text        null,
  reference        text        null,
  document_id      text        null references public.achats_documents(id) on delete set null,
  rapprochement    text        null check (rapprochement in ('auto', 'manuel')),
  rapproche_le     timestamptz null,
  rapproche_par    text        null,
  ignoree          boolean     not null default false,
  note             text        null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint releve_lignes_cle unique (etablissement_id, cle)
);
-- L'index unique (etablissement_id, cle) couvre la clé étrangère de l'établissement.
create index if not exists idx_releve_lignes_releve on public.releve_lignes(releve_id);
create index if not exists idx_releve_lignes_document on public.releve_lignes(document_id);
-- Une pièce n'est rapprochée que d'une ligne. Pas de contrainte entre
-- document_id et rapprochement : supprimer une facture non réglée remet
-- document_id à NULL (on delete set null) sans jamais être bloqué ; le front
-- lit document_id NULL comme « non rapprochée ».
create unique index if not exists uq_releve_lignes_document
  on public.releve_lignes(document_id) where document_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. updated_at : fonction set_updated_at() déjà en base (migration 20260715_kds_orders)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace trigger trg_ventes_jour_updated_at
  before update on public.ventes_jour
  for each row execute function public.set_updated_at();
create or replace trigger trg_charges_fixes_updated_at
  before update on public.charges_fixes
  for each row execute function public.set_updated_at();
create or replace trigger trg_salaires_estimes_updated_at
  before update on public.salaires_estimes
  for each row execute function public.set_updated_at();
create or replace trigger trg_compta_reglages_updated_at
  before update on public.compta_reglages
  for each row execute function public.set_updated_at();
create or replace trigger trg_releve_lignes_updated_at
  before update on public.releve_lignes
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS et droits
-- ─────────────────────────────────────────────────────────────────────────────
-- Aucun droit hérité (TRUNCATE ignore la RLS), puis des droits de colonnes à la
-- mise à jour : l'établissement, la date et le taux d'une vente, l'auteur et
-- l'origine d'une ligne ne changent jamais par une mise à jour.

-- ── ventes_jour ──
alter table public.ventes_jour enable row level security;
revoke all on public.ventes_jour from public, anon, authenticated;
grant select, insert, delete on public.ventes_jour to authenticated;
grant update (montant_ttc, note) on public.ventes_jour to authenticated;

drop policy if exists ventes_jour_select on public.ventes_jour;
create policy ventes_jour_select on public.ventes_jour
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (
      (select public.current_user_role()) = any (array['consultant', 'patron'])
      or (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    )
  );

drop policy if exists ventes_jour_insert on public.ventes_jour;
create policy ventes_jour_insert on public.ventes_jour
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    and created_by is not distinct from (select auth.uid())::text
  );

drop policy if exists ventes_jour_update on public.ventes_jour;
create policy ventes_jour_update on public.ventes_jour
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
  );

drop policy if exists ventes_jour_delete on public.ventes_jour;
create policy ventes_jour_delete on public.ventes_jour
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
  );

-- ── charges_fixes ──
alter table public.charges_fixes enable row level security;
revoke all on public.charges_fixes from public, anon, authenticated;
grant select, insert, delete on public.charges_fixes to authenticated;
grant update (libelle, categorie, montant, tva_taux, periodicite, jour_echeance, debut, fin, fournisseur, note)
  on public.charges_fixes to authenticated;

drop policy if exists charges_fixes_select on public.charges_fixes;
create policy charges_fixes_select on public.charges_fixes
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (
      (select public.current_user_role()) = any (array['consultant', 'patron'])
      or (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    )
  );

drop policy if exists charges_fixes_insert on public.charges_fixes;
create policy charges_fixes_insert on public.charges_fixes
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    and created_by is not distinct from (select auth.uid())::text
  );

drop policy if exists charges_fixes_update on public.charges_fixes;
create policy charges_fixes_update on public.charges_fixes
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
  );

drop policy if exists charges_fixes_delete on public.charges_fixes;
create policy charges_fixes_delete on public.charges_fixes
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
  );

-- ── salaires_estimes : direction seulement ──
alter table public.salaires_estimes enable row level security;
revoke all on public.salaires_estimes from public, anon, authenticated;
grant select, insert, delete on public.salaires_estimes to authenticated;
grant update (mode, montant, treizieme, debut, fin, note) on public.salaires_estimes to authenticated;

drop policy if exists salaires_estimes_select on public.salaires_estimes;
create policy salaires_estimes_select on public.salaires_estimes
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) = any (array['consultant', 'patron'])
  );

-- Création : pour une personne rattachée à l'établissement, au nom de qui crée.
drop policy if exists salaires_estimes_insert on public.salaires_estimes;
create policy salaires_estimes_insert on public.salaires_estimes
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) = any (array['consultant', 'patron'])
    and created_by is not distinct from (select auth.uid())::text
    and exists (
      select 1 from public.profiles p
      where p.id = salaires_estimes.profile_id
        and salaires_estimes.etablissement_id = any(p.etablissement_ids)
    )
  );

drop policy if exists salaires_estimes_update on public.salaires_estimes;
create policy salaires_estimes_update on public.salaires_estimes
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) = any (array['consultant', 'patron'])
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) = any (array['consultant', 'patron'])
  );

drop policy if exists salaires_estimes_delete on public.salaires_estimes;
create policy salaires_estimes_delete on public.salaires_estimes
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) = any (array['consultant', 'patron'])
  );

-- ── compta_reglages : une ligne par établissement ──
alter table public.compta_reglages enable row level security;
revoke all on public.compta_reglages from public, anon, authenticated;
grant select, insert on public.compta_reglages to authenticated;
grant update (methode_tva, taux_tdfn, charges_sociales_pct, cout_horaire_moyen, updated_by)
  on public.compta_reglages to authenticated;

drop policy if exists compta_reglages_select on public.compta_reglages;
create policy compta_reglages_select on public.compta_reglages
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (
      (select public.current_user_role()) = any (array['consultant', 'patron'])
      or (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    )
  );

drop policy if exists compta_reglages_insert on public.compta_reglages;
create policy compta_reglages_insert on public.compta_reglages
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    and updated_by is not distinct from (select auth.uid())::text
  );

drop policy if exists compta_reglages_update on public.compta_reglages;
create policy compta_reglages_update on public.compta_reglages
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    and updated_by is not distinct from (select auth.uid())::text
  );

-- ── releves_bancaires : importés puis supprimés, jamais modifiés ──
alter table public.releves_bancaires enable row level security;
revoke all on public.releves_bancaires from public, anon, authenticated;
grant select, insert, delete on public.releves_bancaires to authenticated;

drop policy if exists releves_bancaires_select on public.releves_bancaires;
create policy releves_bancaires_select on public.releves_bancaires
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (
      (select public.current_user_role()) = any (array['consultant', 'patron'])
      or (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    )
  );

drop policy if exists releves_bancaires_insert on public.releves_bancaires;
create policy releves_bancaires_insert on public.releves_bancaires
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    and created_by is not distinct from (select auth.uid())::text
  );

drop policy if exists releves_bancaires_delete on public.releves_bancaires;
create policy releves_bancaires_delete on public.releves_bancaires
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
  );

-- ── releve_lignes : la ligne suit son relevé, la pièce liée est de la maison ──
alter table public.releve_lignes enable row level security;
revoke all on public.releve_lignes from public, anon, authenticated;
grant select, insert, delete on public.releve_lignes to authenticated;
grant update (document_id, rapprochement, rapproche_le, rapproche_par, ignoree, note)
  on public.releve_lignes to authenticated;

drop policy if exists releve_lignes_select on public.releve_lignes;
create policy releve_lignes_select on public.releve_lignes
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (
      (select public.current_user_role()) = any (array['consultant', 'patron'])
      or (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    )
  );

drop policy if exists releve_lignes_insert on public.releve_lignes;
create policy releve_lignes_insert on public.releve_lignes
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    and exists (
      select 1 from public.releves_bancaires r
      where r.id = releve_lignes.releve_id
        and r.etablissement_id = releve_lignes.etablissement_id
    )
    and (
      document_id is null
      or exists (
        select 1 from public.achats_documents d
        where d.id = releve_lignes.document_id
          and d.etablissement_id = releve_lignes.etablissement_id
      )
    )
  );

drop policy if exists releve_lignes_update on public.releve_lignes;
create policy releve_lignes_update on public.releve_lignes
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
    and exists (
      select 1 from public.releves_bancaires r
      where r.id = releve_lignes.releve_id
        and r.etablissement_id = releve_lignes.etablissement_id
    )
    and (
      document_id is null
      or exists (
        select 1 from public.achats_documents d
        where d.id = releve_lignes.document_id
          and d.etablissement_id = releve_lignes.etablissement_id
      )
    )
  );

drop policy if exists releve_lignes_delete on public.releve_lignes;
create policy releve_lignes_delete on public.releve_lignes
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select public.user_peut_gerer('factures_achat', array['consultant', 'patron']))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Realtime : la tablette du bureau et le téléphone du patron restent d'accord
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin alter publication supabase_realtime add table public.ventes_jour; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.charges_fixes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.salaires_estimes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.compta_reglages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.releves_bancaires; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.releve_lignes; exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Commentaires
-- ─────────────────────────────────────────────────────────────────────────────
comment on table public.ventes_jour is
  'Chiffre d''affaires du jour TVA comprise, par taux (8,1 sur place, 2,6 à l''emporter, 3,8 hébergement). Une saisie remplace la caisse pour ce jour. Lecture : direction et droit Régler les factures ; écriture : droit Régler les factures.';
comment on table public.charges_fixes is
  'Charges fixes saisies une fois (loyer, énergie, assurances, leasing, honoraires, abonnements), montant TVA comprise à chaque échéance, réparties par mois dans la Comptabilité.';
comment on table public.salaires_estimes is
  'Salaire brut estimé d''une personne (mensuel ou horaire), pour le coût du personnel de la Comptabilité. Estimation pour piloter ; aucune fiche de salaire. Lecture et écriture : consultant et patron.';
comment on table public.compta_reglages is
  'Réglages de la Comptabilité d''un établissement : méthode de TVA, taux de la dette fiscale nette, charges sociales de l''employeur, coût horaire moyen.';
comment on table public.releves_bancaires is
  'Relevé bancaire importé (camt.053 ou CSV de la banque) : période, compte, soldes de début et de fin.';
comment on table public.releve_lignes is
  'Ligne d''un relevé bancaire, avec la pièce d''achat rapprochée (document_id) ; clé unique par établissement pour qu''un réimport ne crée aucun doublon.';
