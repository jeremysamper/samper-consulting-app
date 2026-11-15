-- Retire la clé du pointage à l'heure ajoutée par 01-bareme-pointage.sql
-- (le barème retombe sur la valeur par défaut, ou sur rien si P3 est retiré).

update public.points_reglages
   set bareme = bareme - 'pointage_ponctuel'
 where jsonb_typeof(bareme) = 'object'
   and bareme ? 'pointage_ponctuel';
