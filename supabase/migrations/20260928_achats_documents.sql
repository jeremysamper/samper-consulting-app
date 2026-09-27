-- ════════════════════════════════════════════════════════════════
-- 20260928_achats_documents
--
-- Factures, bons de livraison et bons de commande de la période, lus par
-- l'IA depuis le module Inventaire (onglet « Achats »). Ils servent à calculer
-- la consommation matière entre deux inventaires d'un même périmètre :
--
--   consommation = stock de début + achats de la période - stock de fin
--
-- Une ligne par DOCUMENT, ses lignes de produits en jsonb (telles que lues,
-- plus les rattachements décidés à la main). Aucune écriture dans le
-- catalogue ni dans les prix : c'est le rôle du scan du module Catalogue
-- (scans_facture), qui reste distinct.
--
-- Additive : aucune table existante n'est touchée. Le front déployé avant
-- cette migration n'y lit rien ; le front qui la lit affiche « migration à
-- appliquer » tant qu'elle manque (relation absente = 42P01 / PGRST205).
-- ════════════════════════════════════════════════════════════════

create table if not exists public.achats_documents (
  id                text primary key,
  etablissement_id  text not null,
  -- Périmètre d'inventaire auquel le document est imputé (Cuisine, Boissons...).
  -- Même règle de repli que inventaires.nom.
  perimetre         text not null default 'Général',
  -- facture | bon_livraison | bon_commande. Par fournisseur et par période,
  -- les factures font foi, sinon les bons de livraison, sinon les commandes :
  -- une livraison ne se compte jamais deux fois.
  type_document     text not null default 'facture',
  fournisseur_nom   text null,
  fournisseur_id    text null references public.fournisseurs(id) on delete set null,
  numero            text null,
  date_document     date null,
  total_ht          numeric null,
  lignes            jsonb not null default '[]'::jsonb,
  -- Exclu du calcul à la main (document de contrôle, doublon repéré...).
  exclu             boolean not null default false,
  source            text null,
  nom_fichier       text null,
  created_at        timestamptz not null default now(),
  created_by        text null,
  updated_at        timestamptz not null default now()
);

do $$ begin
  alter table public.achats_documents
    add constraint achats_documents_type_chk
    check (type_document in ('facture', 'bon_livraison', 'bon_commande'));
exception when duplicate_object then null; end $$;

create index if not exists achats_documents_etab_date_idx
  on public.achats_documents (etablissement_id, date_document desc);

-- updated_at tenu par la base, pas par l'horloge de la tablette.
create or replace function public.achats_documents_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_achats_documents_touch on public.achats_documents;
create trigger trg_achats_documents_touch
  before update on public.achats_documents
  for each row execute function public.achats_documents_touch();

alter table public.achats_documents enable row level security;

drop policy if exists achats_doc_sel on public.achats_documents;
create policy achats_doc_sel on public.achats_documents for select
  using (public.user_can_access_etab(etablissement_id));

drop policy if exists achats_doc_ins on public.achats_documents;
create policy achats_doc_ins on public.achats_documents for insert
  with check (public.user_can_access_etab(etablissement_id));

drop policy if exists achats_doc_upd on public.achats_documents;
create policy achats_doc_upd on public.achats_documents for update
  using (public.user_can_access_etab(etablissement_id))
  with check (public.user_can_access_etab(etablissement_id));

drop policy if exists achats_doc_del on public.achats_documents;
create policy achats_doc_del on public.achats_documents for delete
  using (public.user_can_access_etab(etablissement_id));

-- Jamais lisible sans session.
revoke all on public.achats_documents from anon;

-- Realtime : un document lu sur la tablette du bureau apparaît sur celle de la cuisine.
do $$ begin
  alter publication supabase_realtime add table public.achats_documents;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ── Retour arrière ──
-- drop table if exists public.achats_documents;
-- drop function if exists public.achats_documents_touch();
