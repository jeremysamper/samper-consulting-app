-- Retour arrière de 20261122_salles_echelle_tables.sql. Le front du lot L10
-- tolère l'absence de la colonne (le réglage « Taille des tables » n'apparaît
-- pas). Les tables déjà redimensionnées gardent leur taille : elles se règlent
-- ensuite une à une, ou en remettant la colonne et l'échelle à 1.
alter table public.salles drop constraint if exists salles_echelle_tables_bornes;
alter table public.salles drop column if exists echelle_tables;
