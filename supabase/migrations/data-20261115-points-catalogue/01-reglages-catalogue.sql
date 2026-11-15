-- Points P2, F12 : réglages éteints et catalogue des boutiques de Woodland
-- Village (etab-2) et du Rucher d'Evolène (etab-1777157340476).
-- Rejouable : réglages par clé primaire (on conflict do nothing, une ligne
-- existante n'est jamais rallumée ni réécrite), cadeaux par (établissement,
-- nom). Aucune gravure ni broderie au nom. Description = prix public.
-- À jouer après 20261115_points_anti_fuite.sql.

insert into public.points_reglages
  (etablissement_id, actif, roles_participants, exclus, bareme, plafond_jour_total, plafond_mois_total, updated_at, updated_by)
select e.id, false, public.points_roles_defaut(), '{}'::text[], public.points_bareme_defaut(), 40, 400, now(), null
from public.etablissements e
where e.id in ('etab-2', 'etab-1777157340476')
on conflict (etablissement_id) do nothing;

with catalogue (cout, nom, categorie, prix) as (
  values
    -- Cuisine
    (450,  'Kit de dressage : pince, cuillère et 6 flacons souples', 'cuisine', '20 à 30'),
    (550,  'Râpe Microplane, économe pro et cuillère parisienne', 'cuisine', '30 à 40'),
    (550,  'Tablier de cuisine pro', 'cuisine', '25 à 40'),
    (650,  'Gants anti-coupure et ciseaux de cuisine pro', 'cuisine', '30 à 45'),
    (650,  'Fusil à aiguiser', 'cuisine', '30 à 45'),
    (700,  'Chalumeau de cuisine', 'cuisine', '30 à 50'),
    (850,  'Thermomètre infrarouge', 'cuisine', '35 à 60'),
    (850,  'Pierre à aiguiser japonaise 1000/6000', 'cuisine', '40 à 60'),
    (850,  'Mandoline japonaise', 'cuisine', '40 à 60'),
    (1000, 'Couteau d''office haut de gamme', 'cuisine', '40 à 70'),
    (1100, 'Thermomètre sonde pro étanche', 'cuisine', '60 à 80'),
    (1100, 'Couteau à pain', 'cuisine', '40 à 80'),
    (1100, 'Deux pantalons de cuisine pro', 'cuisine', '50 à 80'),
    (1250, 'Trousse à couteaux roulée', 'cuisine', '50 à 90'),
    (1250, 'Couteau à filet', 'cuisine', '50 à 90'),
    (1250, 'Veste de cuisine haut de gamme', 'cuisine', '60 à 90'),
    (1550, 'Chaussures de cuisine antidérapantes', 'cuisine', '70 à 110'),
    (1800, 'Couteau santoku', 'cuisine', '80 à 130'),
    (2100, 'Couteau de chef japonais 21 cm', 'cuisine', '100 à 150'),
    (2250, 'Couteau japonais deba, poisson', 'cuisine', '100 à 160'),
    -- Salle
    (450,  'Kit de service : limonadier à double levier, clé de bar et 2 stylos', 'salle', '20 à 30'),
    (550,  'Ramasse-miettes et 6 liteaux', 'salle', '25 à 40'),
    (550,  'Tablier de serveur à poches', 'salle', '25 à 40'),
    (650,  'Carnet de commande en cuir et porte-addition', 'salle', '30 à 45'),
    (650,  'Pompe à vide, 4 bouchons à champagne et thermomètre à vin', 'salle', '30 à 45'),
    (700,  'Holster de ceinture en cuir : limonadier, stylos, carnet', 'salle', '30 à 50'),
    (700,  'Aérateur à vin et entonnoir de décantation', 'salle', '30 à 50'),
    (850,  'Portefeuille de serveur en cuir', 'salle', '30 à 60'),
    (850,  'Kit de bar : shaker, jigger, cuillère et passoire', 'salle', '35 à 60'),
    (1000, 'Tastevin', 'salle', '40 à 70'),
    (1100, 'Gilet de service haut de gamme', 'salle', '50 à 80'),
    (1250, 'Tablier de sommelier en cuir', 'salle', '50 à 90'),
    (1250, 'Six verres de dégustation pro', 'salle', '60 à 90'),
    (1700, 'Chaussures de service antidérapantes', 'salle', '80 à 120'),
    (1800, 'Coravin Pivot, service du vin au verre', 'salle', '100 à 130'),
    (2000, 'Coffret Le Nez du Vin, 12 arômes', 'salle', '100 à 140'),
    (2100, 'Tire-bouchon Laguiole en Aubrac', 'salle', '90 à 150'),
    -- Commun
    (500,  'Couteau suisse Victorinox', 'commun', '25 à 35'),
    (700,  'Chaussettes de contention, 3 paires', 'commun', '30 à 50'),
    (2800, 'Sac de travail en cuir : tenue, chaussures et effets', 'commun', '150 à 200'),
    (3500, 'Chaussures pro haut de gamme et semelles orthopédiques', 'commun', '200 à 250')
),
ordonne as (
  select c.*, row_number() over (order by c.cout, c.nom collate "C") as rang from catalogue c
)
insert into public.points_cadeaux (etablissement_id, nom, description, cout, stock, actif, ordre, categorie)
select e.id, o.nom, 'Prix public : ' || o.prix || ' CHF', o.cout, null, true, o.rang, o.categorie
from ordonne o
cross join public.etablissements e
where e.id in ('etab-2', 'etab-1777157340476')
on conflict (etablissement_id, nom) do nothing;
