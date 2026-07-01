-- Traçabilité HACCP : photos d'étiquettes produits classées par date (Année/Mois/Jour).
-- Idempotent : peut être rejoué sans erreur.

create table if not exists haccp_tracabilite (
  id               text primary key,
  etablissement_id text not null,
  date             date not null default current_date,
  produit          text,
  photo_url        text not null,
  storage_path     text not null,
  operateur        text,
  notes            text,
  created_at       timestamptz default now()
);

create index if not exists idx_haccp_tracabilite_etab_date
  on haccp_tracabilite (etablissement_id, date);

alter table haccp_tracabilite enable row level security;

drop policy if exists ht_select on haccp_tracabilite;
create policy ht_select on haccp_tracabilite
  for select using (user_can_access_etab(etablissement_id));

drop policy if exists ht_insert on haccp_tracabilite;
create policy ht_insert on haccp_tracabilite
  for insert with check (user_can_access_etab(etablissement_id));

drop policy if exists ht_update on haccp_tracabilite;
create policy ht_update on haccp_tracabilite
  for update using (user_can_access_etab(etablissement_id))
  with check (user_can_access_etab(etablissement_id));

drop policy if exists ht_delete on haccp_tracabilite;
create policy ht_delete on haccp_tracabilite
  for delete using (user_can_access_etab(etablissement_id));

-- Bucket public dédié (même logique que recette-photos) : l'écriture ne passe
-- que par l'Edge Function upload-haccp-photo (clé service), donc pas de policy
-- storage.objects supplémentaire nécessaire pour l'écriture côté client.
insert into storage.buckets (id, name, public)
values ('haccp-photos', 'haccp-photos', true)
on conflict (id) do nothing;
