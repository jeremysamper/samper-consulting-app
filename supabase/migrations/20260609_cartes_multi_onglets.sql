-- ════════════════════════════════════════════════════════════════════════════
-- Cartes multiples (onglets) — liaisons M2M carte ↔ plat et carte ↔ fiche salle
-- Migration additive et non destructive : aucune table existante n'est modifiée
-- de façon destructive. Les plats / fiches existants sont rattachés à la carte
-- par défaut (la plus ancienne) de leur établissement.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Liaison M2M carte ↔ plat ───
create table if not exists carte_plats (
  id text primary key default gen_random_uuid()::text,
  carte_id text not null references cartes(id) on delete cascade,
  plat_id  text not null references plats(id)  on delete cascade,
  ordre int default 0,
  created_at timestamptz default now(),
  unique (carte_id, plat_id)
);
create index if not exists idx_carte_plats_carte on carte_plats(carte_id);
create index if not exists idx_carte_plats_plat  on carte_plats(plat_id);

-- ─── Liaison M2M carte ↔ fiche salle ───
create table if not exists carte_fiches_salle (
  id text primary key default gen_random_uuid()::text,
  carte_id text not null references cartes(id) on delete cascade,
  fiche_salle_id text not null references fiches_salle(id) on delete cascade,
  ordre int default 0,
  created_at timestamptz default now(),
  unique (carte_id, fiche_salle_id)
);
create index if not exists idx_cfs_carte on carte_fiches_salle(carte_id);
create index if not exists idx_cfs_fiche on carte_fiches_salle(fiche_salle_id);

-- ─── RLS (calquée sur plat_recettes : accès via le carte parent) ───
alter table carte_plats enable row level security;
drop policy if exists cp_read on carte_plats;
create policy cp_read on carte_plats for select to authenticated
  using (exists (select 1 from cartes c where c.id = carte_plats.carte_id and user_can_access_etab(c.etablissement_id)));
drop policy if exists cp_write on carte_plats;
create policy cp_write on carte_plats for all to authenticated
  using  (exists (select 1 from cartes c where c.id = carte_plats.carte_id and user_can_access_etab(c.etablissement_id)))
  with check (exists (select 1 from cartes c where c.id = carte_plats.carte_id and user_can_access_etab(c.etablissement_id)));

alter table carte_fiches_salle enable row level security;
drop policy if exists cfs_read on carte_fiches_salle;
create policy cfs_read on carte_fiches_salle for select to authenticated
  using (exists (select 1 from cartes c where c.id = carte_fiches_salle.carte_id and user_can_access_etab(c.etablissement_id)));
drop policy if exists cfs_write on carte_fiches_salle;
create policy cfs_write on carte_fiches_salle for all to authenticated
  using  (exists (select 1 from cartes c where c.id = carte_fiches_salle.carte_id and user_can_access_etab(c.etablissement_id)))
  with check (exists (select 1 from cartes c where c.id = carte_fiches_salle.carte_id and user_can_access_etab(c.etablissement_id)));

-- ─── Seed non destructif ───
-- 1) garantir au moins une carte par établissement ayant des plats ou des fiches
insert into cartes (id, etablissement_id, nom)
select 'carte-' || s.e || '-default', s.e, 'Carte restaurant'
from (
  select distinct etablissement_id as e from plats
  union
  select distinct etablissement_id from fiches_salle
) s
where not exists (select 1 from cartes c where c.etablissement_id = s.e);

-- 2) rattacher chaque plat à la 1re carte (la plus ancienne) de son établissement
insert into carte_plats (carte_id, plat_id)
select c.id, p.id
from plats p
join lateral (
  select id from cartes where etablissement_id = p.etablissement_id order by created_at limit 1
) c on true
on conflict (carte_id, plat_id) do nothing;

-- 3) rattacher chaque fiche salle à la 1re carte de son établissement
insert into carte_fiches_salle (carte_id, fiche_salle_id)
select c.id, f.id
from fiches_salle f
join lateral (
  select id from cartes where etablissement_id = f.etablissement_id order by created_at limit 1
) c on true
on conflict (carte_id, fiche_salle_id) do nothing;
