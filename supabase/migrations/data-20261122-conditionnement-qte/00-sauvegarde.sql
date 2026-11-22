-- Avant 01-remplissage.sql. La colonne conditionnement_qte vient d'être créée :
-- elle est vide, il n'y a rien à sauvegarder d'autre que ce compte. S'il n'est
-- pas nul, quelqu'un a déjà rempli des valeurs (front du lot 4b en ligne ?) :
-- les exporter en JSON dans App-Web/_sauvegardes-supabase/ avant de continuer.

select count(*) as deja_remplis
  from public.produits
 where conditionnement_qte is not null;

-- Repère pour 02-verification.sql : produits modifiés aujourd'hui avant le
-- remplissage.
select count(*) as modifies_aujourdhui_avant
  from public.produits
 where updated_at >= date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
