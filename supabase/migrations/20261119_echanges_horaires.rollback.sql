-- Retour arrière de 20261119_echanges_horaires.sql. Le front du lot C2 tolère
-- l'absence de la table (la rubrique des échanges n'apparaît pas). Les
-- horaires déjà échangés gardent leur nouvelle personne.
drop function if exists public.echange_decider(uuid, boolean);
drop function if exists public.echange_retirer(uuid);
drop function if exists public.echange_reprendre(uuid);
drop function if exists public.echange_proposer(text, text);
drop table if exists public.echanges_horaires;
