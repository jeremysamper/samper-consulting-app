-- Après 01-remplissage.sql : combien de produits ont leur conditionnement de
-- commande, par établissement et par unité, et dix exemples à relire.

select etablissement_id, unite_ref,
       count(*) filter (where conditionnement_qte is not null) as remplis,
       count(*) filter (where conditionnement_qte is null and coalesce(btrim(conditionnement), '') <> '') as libelle_sans_valeur,
       count(*) as produits
  from public.produits
 group by etablissement_id, unite_ref
 order by etablissement_id, unite_ref;

select nom, conditionnement, unite_ref, conditionnement_qte
  from public.produits
 where conditionnement_qte is not null
 order by random()
 limit 10;

-- Aucune date de modification ne doit avoir bougé : le nombre de produits
-- modifiés aujourd'hui reste celui d'avant le remplissage (00-sauvegarde.sql).
select count(*) as modifies_aujourdhui
  from public.produits
 where updated_at >= date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
