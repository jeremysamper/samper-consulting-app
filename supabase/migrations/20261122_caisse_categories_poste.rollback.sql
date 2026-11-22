-- Retour arriere de 20261122_caisse_categories_poste.sql.
-- A jouer APRES le retour du front a une version qui n'ecrit plus le poste
-- (Instant Rollback Vercel) : le front du lot L4 envoie la colonne a chaque
-- enregistrement d'une categorie, et cette ecriture echouerait sans elle.
-- Les postes deja regles sont perdus (une colonne de reglage, aucune donnee
-- de vente).

alter table public.caisse_categories drop constraint if exists caisse_categories_poste_check;
alter table public.caisse_categories drop column if exists poste;
