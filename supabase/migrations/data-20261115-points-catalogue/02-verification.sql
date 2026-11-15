-- Vérification G9 : 41 cadeaux actifs par boutique, 2 réglages éteints aux
-- plafonds 40 et 400, aucun mouvement.
select
  (select count(*) from public.points_cadeaux where etablissement_id = 'etab-2' and actif) as cadeaux_woodland,
  (select count(*) from public.points_cadeaux where etablissement_id = 'etab-1777157340476' and actif) as cadeaux_rucher,
  (select count(*) from public.points_cadeaux where etablissement_id = 'etab-2' and categorie = 'cuisine') as cuisine_woodland,
  (select count(*) from public.points_cadeaux where etablissement_id = 'etab-2' and categorie = 'salle') as salle_woodland,
  (select count(*) from public.points_cadeaux where etablissement_id = 'etab-2' and categorie = 'commun') as commun_woodland,
  (select count(*) from public.points_reglages where etablissement_id in ('etab-2', 'etab-1777157340476') and not actif
     and plafond_jour_total = 40 and plafond_mois_total = 400) as reglages_eteints,
  (select count(*) from public.points_reglages where actif) as reglages_allumes,
  (select count(*) from public.points_mouvements) as mouvements,
  (select count(*) from public.points_cadeaux where nom ~* '(gravure|grav[ée]|brod[ée]|au nom)') as personnalises;
