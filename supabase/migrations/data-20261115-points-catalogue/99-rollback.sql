-- Retour arrière des données P2 : retire les cadeaux saisis par
-- 01-reglages-catalogue.sql qui n'ont jamais été commandés, puis les deux
-- lignes de réglages si elles sont restées éteintes et sans mouvement.
-- Un cadeau commandé reste (l'historique garde son nom).

with catalogue (nom) as (
  values
    ('Kit de dressage : pince, cuillère et 6 flacons souples'), ('Râpe Microplane, économe pro et cuillère parisienne'),
    ('Tablier de cuisine pro'), ('Gants anti-coupure et ciseaux de cuisine pro'), ('Fusil à aiguiser'),
    ('Chalumeau de cuisine'), ('Thermomètre infrarouge'), ('Pierre à aiguiser japonaise 1000/6000'),
    ('Mandoline japonaise'), ('Couteau d''office haut de gamme'), ('Thermomètre sonde pro étanche'),
    ('Couteau à pain'), ('Deux pantalons de cuisine pro'), ('Trousse à couteaux roulée'), ('Couteau à filet'),
    ('Veste de cuisine haut de gamme'), ('Chaussures de cuisine antidérapantes'), ('Couteau santoku'),
    ('Couteau de chef japonais 21 cm'), ('Couteau japonais deba, poisson'),
    ('Kit de service : limonadier à double levier, clé de bar et 2 stylos'), ('Ramasse-miettes et 6 liteaux'),
    ('Tablier de serveur à poches'), ('Carnet de commande en cuir et porte-addition'),
    ('Pompe à vide, 4 bouchons à champagne et thermomètre à vin'), ('Holster de ceinture en cuir : limonadier, stylos, carnet'),
    ('Aérateur à vin et entonnoir de décantation'), ('Portefeuille de serveur en cuir'),
    ('Kit de bar : shaker, jigger, cuillère et passoire'), ('Tastevin'), ('Gilet de service haut de gamme'),
    ('Tablier de sommelier en cuir'), ('Six verres de dégustation pro'), ('Chaussures de service antidérapantes'),
    ('Coravin Pivot, service du vin au verre'), ('Coffret Le Nez du Vin, 12 arômes'), ('Tire-bouchon Laguiole en Aubrac'),
    ('Couteau suisse Victorinox'), ('Chaussettes de contention, 3 paires'),
    ('Sac de travail en cuir : tenue, chaussures et effets'), ('Chaussures pro haut de gamme et semelles orthopédiques')
)
delete from public.points_cadeaux c
using catalogue k
where c.nom = k.nom
  and c.etablissement_id in ('etab-2', 'etab-1777157340476')
  and not exists (select 1 from public.points_commandes o where o.cadeau_id = c.id);

delete from public.points_reglages r
where r.etablissement_id in ('etab-2', 'etab-1777157340476')
  and not r.actif
  and not exists (select 1 from public.points_mouvements m where m.etablissement_id = r.etablissement_id);
