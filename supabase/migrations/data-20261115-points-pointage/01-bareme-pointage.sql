-- Points P3 : le barème enregistré des établissements prend la clé du pointage
-- à l'heure à sa valeur par défaut, sans rien changer d'autre (une clé déjà
-- présente n'est jamais réécrite). Rejouable. À jouer après
-- 20261115_points_indicateurs.sql. Retour arrière : 99-rollback.sql.

update public.points_reglages
   set bareme = bareme || jsonb_build_object('pointage_ponctuel', public.points_bareme_defaut() -> 'pointage_ponctuel')
 where jsonb_typeof(bareme) = 'object'
   and bareme <> '{}'::jsonb
   and not (bareme ? 'pointage_ponctuel')
   -- Joué avant la migration, il n'écrirait qu'un null illisible : rien.
   and public.points_bareme_defaut() ? 'pointage_ponctuel';
