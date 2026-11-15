-- Retour arrière de 01-photos-catalogue.sql : retire seulement les photos du
-- catalogue (une photo posée depuis par la direction reste). Les fichiers du
-- stockage restent en place.
update public.points_cadeaux
   set photo_url = null
 where etablissement_id in ('etab-2', 'etab-1777157340476')
   and photo_url like '%/recette-photos/%/cadeau-catalogue-%';
