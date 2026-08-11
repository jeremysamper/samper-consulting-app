-- ════════════════════════════════════════════════════════════════════════════
-- Scan factures, alias fournisseurs et prix vivants
--
-- Objet :
--   1. produit_alias            : « ce libelle fournisseur designe ce produit »
--   2. produit_prix_historique  : trace de tout changement de prix
--   3. produits.strategie_prix  : max / principal / moyenne / manuel + verrou
--   4. scans_facture            : session de scan (photos + lignes parsees)
--   5. produit_prix_resolu()    : prix retenu selon la strategie
--
-- Compatibilite : purement additif. Aucun DROP, aucun RENAME, aucune colonne
-- existante modifiee. Le front actuellement deploye continue de fonctionner a
-- l'identique apres application (expand/contract).
--
-- Idempotence : rejouable autant de fois que necessaire.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. produit_alias
-- ─────────────────────────────────────────────────────────────
create table if not exists public.produit_alias (
  id              text primary key,
  produit_id      text not null references public.produits(id) on delete cascade,
  fournisseur_id  text null references public.fournisseurs(id) on delete set null,
  libelle         text not null,
  libelle_norm    text not null,
  reference_fourn text null,
  source          text not null default 'manuel',
  created_at      timestamptz not null default now(),
  created_by      text null
);

do $$ begin
  alter table public.produit_alias
    add constraint produit_alias_source_chk
    check (source in ('manuel', 'scan', 'import'));
exception when duplicate_object then null; end $$;

-- Un meme libelle ne se rattache qu'une fois a un couple (produit, fournisseur).
-- fournisseur_id peut etre null : coalesce pour que l'unicite tienne quand meme.
create unique index if not exists produit_alias_uniq
  on public.produit_alias (produit_id, coalesce(fournisseur_id, ''), libelle_norm);

-- Une reference article fournisseur ne peut pointer que vers UN produit.
-- C'est le rapprochement le plus fiable du scan, il ne doit pas etre ambigu.
create unique index if not exists produit_alias_ref_uniq
  on public.produit_alias (coalesce(fournisseur_id, ''), reference_fourn)
  where reference_fourn is not null and reference_fourn <> '';

create index if not exists produit_alias_libelle_norm_idx on public.produit_alias (libelle_norm);
create index if not exists produit_alias_produit_idx      on public.produit_alias (produit_id);
create index if not exists produit_alias_fourn_idx        on public.produit_alias (fournisseur_id);

alter table public.produit_alias enable row level security;

drop policy if exists alias_sel on public.produit_alias;
create policy alias_sel on public.produit_alias for select
  using (exists (select 1 from public.produits p
                 where p.id = produit_alias.produit_id
                   and public.user_can_access_etab(p.etablissement_id)));

drop policy if exists alias_ins on public.produit_alias;
create policy alias_ins on public.produit_alias for insert
  with check (exists (select 1 from public.produits p
                      where p.id = produit_alias.produit_id
                        and public.user_can_access_etab(p.etablissement_id)));

drop policy if exists alias_upd on public.produit_alias;
create policy alias_upd on public.produit_alias for update
  using (exists (select 1 from public.produits p
                 where p.id = produit_alias.produit_id
                   and public.user_can_access_etab(p.etablissement_id)))
  with check (exists (select 1 from public.produits p
                      where p.id = produit_alias.produit_id
                        and public.user_can_access_etab(p.etablissement_id)));

drop policy if exists alias_del on public.produit_alias;
create policy alias_del on public.produit_alias for delete
  using (exists (select 1 from public.produits p
                 where p.id = produit_alias.produit_id
                   and public.user_can_access_etab(p.etablissement_id)));

comment on table public.produit_alias is
  'Libelles fournisseurs rattaches a un produit du catalogue. Un alias valide evite tout appel IA au scan suivant.';

-- ─────────────────────────────────────────────────────────────
-- 2. produit_prix_historique
-- ─────────────────────────────────────────────────────────────
create table if not exists public.produit_prix_historique (
  id             text primary key,
  produit_id     text not null references public.produits(id) on delete cascade,
  fournisseur_id text null references public.fournisseurs(id) on delete set null,
  prix_unitaire  numeric not null,
  prix_achat     numeric null,
  quantite_cond  numeric null,
  unite_cond     text null,
  source         text not null,
  scan_id        text null,
  document_url   text null,
  releve_le      date not null,
  created_at     timestamptz not null default now(),
  created_by     text null
);

do $$ begin
  alter table public.produit_prix_historique
    add constraint produit_prix_historique_source_chk
    check (source in ('manuel', 'scan', 'import'));
exception when duplicate_object then null; end $$;

create index if not exists pph_produit_date_idx on public.produit_prix_historique (produit_id, releve_le desc);
create index if not exists pph_fournisseur_idx  on public.produit_prix_historique (fournisseur_id);
create index if not exists pph_scan_idx         on public.produit_prix_historique (scan_id);

alter table public.produit_prix_historique enable row level security;

drop policy if exists pph_sel on public.produit_prix_historique;
create policy pph_sel on public.produit_prix_historique for select
  using (exists (select 1 from public.produits p
                 where p.id = produit_prix_historique.produit_id
                   and public.user_can_access_etab(p.etablissement_id)));

drop policy if exists pph_ins on public.produit_prix_historique;
create policy pph_ins on public.produit_prix_historique for insert
  with check (exists (select 1 from public.produits p
                      where p.id = produit_prix_historique.produit_id
                        and public.user_can_access_etab(p.etablissement_id)));

drop policy if exists pph_upd on public.produit_prix_historique;
create policy pph_upd on public.produit_prix_historique for update
  using (exists (select 1 from public.produits p
                 where p.id = produit_prix_historique.produit_id
                   and public.user_can_access_etab(p.etablissement_id)))
  with check (exists (select 1 from public.produits p
                      where p.id = produit_prix_historique.produit_id
                        and public.user_can_access_etab(p.etablissement_id)));

drop policy if exists pph_del on public.produit_prix_historique;
create policy pph_del on public.produit_prix_historique for delete
  using (exists (select 1 from public.produits p
                 where p.id = produit_prix_historique.produit_id
                   and public.user_can_access_etab(p.etablissement_id)));

comment on column public.produit_prix_historique.releve_le is
  'Date de la facture, pas la date d''import. Une facture scannee en retard doit s''inserer a sa place dans l''historique.';

-- ─────────────────────────────────────────────────────────────
-- 3. produits : strategie de prix et verrou manuel
-- ─────────────────────────────────────────────────────────────
alter table public.produits
  add column if not exists strategie_prix  text        not null default 'max',
  add column if not exists prix_verrouille boolean     not null default false,
  add column if not exists prix_maj_le     timestamptz null;

do $$ begin
  alter table public.produits
    add constraint produits_strategie_prix_chk
    check (strategie_prix in ('max', 'principal', 'moyenne', 'manuel'));
exception when duplicate_object then null; end $$;

comment on column public.produits.strategie_prix is
  'Prix retenu quand plusieurs references fournisseurs existent : max (defaut), principal, moyenne, ou manuel (produits.prix_unitaire fait foi).';
comment on column public.produits.prix_verrouille is
  'true = aucun scan ni import ne peut modifier le prix. C''est la contre-indication manuelle.';

-- ─────────────────────────────────────────────────────────────
-- 4. scans_facture
-- ─────────────────────────────────────────────────────────────
create table if not exists public.scans_facture (
  id               text primary key,
  etablissement_id text not null,
  fournisseur_id   text null references public.fournisseurs(id) on delete set null,
  statut           text not null default 'brouillon',
  document_urls    text[] not null default '{}',
  date_facture     date null,
  numero_facture   text null,
  total_facture    numeric null,
  lignes           jsonb not null default '[]'::jsonb,
  nb_lignes        integer not null default 0,
  nb_appliquees    integer not null default 0,
  created_at       timestamptz not null default now(),
  created_by       text null,
  valide_le        timestamptz null
);

do $$ begin
  alter table public.scans_facture
    add constraint scans_facture_statut_chk
    check (statut in ('brouillon', 'valide', 'abandonne'));
exception when duplicate_object then null; end $$;

-- Anti-doublon : une meme facture validee ne s'ingere pas deux fois.
create unique index if not exists scans_facture_numero_uniq
  on public.scans_facture (etablissement_id, coalesce(fournisseur_id, ''), numero_facture)
  where numero_facture is not null and numero_facture <> '' and statut = 'valide';

create index if not exists scans_facture_etab_idx  on public.scans_facture (etablissement_id, created_at desc);
create index if not exists scans_facture_fourn_idx on public.scans_facture (fournisseur_id);

alter table public.scans_facture enable row level security;

drop policy if exists scan_sel on public.scans_facture;
create policy scan_sel on public.scans_facture for select
  using (public.user_can_access_etab(etablissement_id));

drop policy if exists scan_ins on public.scans_facture;
create policy scan_ins on public.scans_facture for insert
  with check (public.user_can_access_etab(etablissement_id));

drop policy if exists scan_upd on public.scans_facture;
create policy scan_upd on public.scans_facture for update
  using (public.user_can_access_etab(etablissement_id))
  with check (public.user_can_access_etab(etablissement_id));

drop policy if exists scan_del on public.scans_facture;
create policy scan_del on public.scans_facture for delete
  using (public.user_can_access_etab(etablissement_id));

-- ─────────────────────────────────────────────────────────────
-- 5. produit_prix_resolu()
--
-- security INVOKER volontairement : la RLS de l'appelant doit s'appliquer.
-- Ne pas rejouer l'incident v_produits_avec_fourn (20260712), ou une vue
-- SECURITY DEFINER exposait 803 produits a anon.
-- ─────────────────────────────────────────────────────────────
create or replace function public.produit_prix_resolu(p_produit_id text)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select case
    -- Strategie manuelle, ou aucune reference fournisseur : le prix saisi fait foi.
    when p.strategie_prix = 'manuel' then p.prix_unitaire
    else coalesce(
      (select case p.strategie_prix
                when 'principal' then
                  coalesce(
                    max(pf.prix_unitaire) filter (where pf.est_principal),
                    max(pf.prix_unitaire)
                  )
                when 'moyenne' then avg(pf.prix_unitaire)
                else max(pf.prix_unitaire)   -- 'max' par defaut
              end
       from produit_fournisseurs pf
       where pf.produit_id = p.id
         and pf.prix_unitaire is not null),
      p.prix_unitaire
    )
  end
  from produits p
  where p.id = p_produit_id;
$$;

comment on function public.produit_prix_resolu(text) is
  'Prix unitaire retenu (CHF par produits.unite_ref) selon produits.strategie_prix. security invoker : la RLS de l''appelant s''applique.';

-- Aucun droit a anon. Seuls les utilisateurs authentifies resolvent un prix.
revoke all on function public.produit_prix_resolu(text) from public;
revoke all on function public.produit_prix_resolu(text) from anon;
grant execute on function public.produit_prix_resolu(text) to authenticated;

-- Les nouvelles tables ne sont jamais accessibles a anon.
revoke all on public.produit_alias            from anon;
revoke all on public.produit_prix_historique  from anon;
revoke all on public.scans_facture            from anon;
