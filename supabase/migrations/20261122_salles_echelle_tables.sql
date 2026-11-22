-- ─────────────────────────────────────────────────────────────────────────────
-- Taille des tables selon la salle (lot L10).
--
-- Une salle porte l'échelle de ses tables, de 0,6 à 1 : une petite pièce
-- garde des tables réduites pour que son plan respire. Le réglage de la salle
-- réécrit la largeur et la hauteur de chaque table (salle_tables) depuis son
-- centre ; cette colonne garde l'échelle choisie, pour le curseur et pour la
-- taille des tables posées ensuite.
--
-- Additive et idempotente : le front d'avant ne lit pas la colonne, le front
-- d'après masque le réglage tant qu'elle manque. Aucune politique à changer :
-- salles_update couvre déjà la colonne (mêmes droits que salle_tables_update).
-- Retour arrière : 20261122_salles_echelle_tables.rollback.sql.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.salles
  add column if not exists echelle_tables numeric not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.salles'::regclass
      and conname = 'salles_echelle_tables_bornes'
  ) then
    alter table public.salles
      add constraint salles_echelle_tables_bornes
      check (echelle_tables >= 0.6 and echelle_tables <= 1);
  end if;
end $$;

comment on column public.salles.echelle_tables is
  'Échelle des tables de la salle, de 0,6 à 1. Le réglage de la salle redimensionne les tables (salle_tables.largeur et hauteur) depuis leur centre ; les nouvelles tables naissent à cette échelle.';
