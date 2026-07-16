-- ════════════════════════════════════════════════════════════════════════════
-- Module Commande - liste de produits a commander, partagee par etablissement.
-- Une ligne = un produit (genere depuis les cartes ou ajoute a la main).
-- Toute personne ayant acces a l'etablissement peut lire ET ecrire (cocher /
-- saisir une quantite / ajouter). Le bouton de generation est garde cote UI
-- au role consultant.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists commande_items (
  id text primary key default gen_random_uuid()::text,
  etablissement_id text not null,
  cle text not null,                 -- 'prod:'<produit_id>|<unite> ou 'nom:'<slug>|<unite>
  produit_id text,                   -- null si ingredient non lie au catalogue
  nom text not null,
  categorie text default 'Autres',
  unite text default '',             -- unite canonique du besoin (g/ml/pcs/...)
  besoin numeric default 0,          -- quantite totale calculee (indicatif)
  quantite numeric,                  -- quantite a commander, saisie manuelle (optionnelle)
  coche boolean default false,
  source text default 'auto',        -- 'auto' (genere) | 'manual' (ajoute a la main)
  ordre int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (etablissement_id, cle)
);
create index if not exists idx_commande_items_etab on commande_items(etablissement_id);

alter table commande_items enable row level security;
drop policy if exists ci_read on commande_items;
create policy ci_read on commande_items for select to authenticated
  using (user_can_access_etab(etablissement_id));
drop policy if exists ci_write on commande_items;
create policy ci_write on commande_items for all to authenticated
  using (user_can_access_etab(etablissement_id))
  with check (user_can_access_etab(etablissement_id));
