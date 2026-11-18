-- Retour arrière de 20261118_temps_gagne.sql.
-- Le front d'avant ne lit pas cette table ; le front du lot T tolère son
-- absence (widget non rendu, inscription des gestes ignorée).
drop policy if exists temps_gagne_select on public.temps_gagne;
drop policy if exists temps_gagne_insert on public.temps_gagne;
drop table if exists public.temps_gagne;
