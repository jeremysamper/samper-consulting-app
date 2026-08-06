-- 06.08.2026 · Portions rectifiées (Rucher + Woodland)
-- DEJA APPLIQUE EN PRODUCTION LE 06.08.2026. Trace, pas tâche en attente.

begin;

-- ─── 1. Six écarts relevés contre la fiche source (Woodland) ───────────────
-- Rendement d'origine relu dans les classeurs, pas une estimation.
with cible(id, portions) as (values
  ('rec-1782062101967-54830', 60),  -- Falafel · 60 portions par batch (etait 20)
  ('rec-1783293963852-70310', 50),  -- Houmous · 50 portions par batch (etait 20)
  ('rec-1783293963922-43770', 50),  -- Tzatziki · 50 portions par batch (etait 20)
  ('rec-1783371749149-41205', 40),  -- Meringue italienne · 300 g, ~40 pieces (etait 300)
  ('rec-1783371748852-18174', 10),  -- Jus leger de volaille · 350 g, ~10 portions (etait 35)
  ('rec-1783371748852-29691', 12)   -- Sirop d'imbibage abricot · ~12 babas (etait 30)
)
update recettes r set portions = c.portions
from cible c where r.id = c.id and r.etablissement_id = 'etab-2';

-- ─── 2. Préparations de batch encore à « 1 portion » ──────────────────────
-- Doses de service données par Jérémy : verre 20 cl, sauce et vinaigrette
-- 50 g, croûtons 35 g. Pour les boissons on divise le volume BUVABLE : les
-- feuilles de thé, l'achillée et les grains de kéfir sont infusés puis
-- retirés, les sucres et sirops restent dans la bouteille.
with cible(id, portions) as (values
  ('rec-1782782357203-75889', 6),   -- Sencha Bancha bambou · 1262 ml / 200
  ('rec-1782782357203-92381', 6),   -- Fraise Rhubarbe (shrub) · 1100 ml / 200
  ('rec-1782782357204-15761', 5),   -- Kefir the vert jasmin · 1108 ml / 200
  ('rec-1782782357204-95546', 5),   -- The vert grille verjus · 1070 ml / 200
  ('rec-1782782357204-86457', 5),   -- Kefir infusion fruitee · 1078 ml / 200
  ('rec-1782782357204-78856', 5),   -- Feuille de bambou poire · 992 ml / 200
  ('rec-1782782357204-58314', 5),   -- The vert Longjing · 981 ml / 200
  ('rec-1782782357204-90680', 5),   -- The vert marocain · 960 ml / 200
  ('rec-1782782357203-13675', 4),   -- The blanc clarifie · 822 ml / 200
  ('rec-1782782357204-7390',  4),   -- Signature Miel et Bourgeons · 780 ml / 200
  ('rec-1782727652041-39423', 15),  -- Gravlax d'omble · 630 g nets de salaison / tranche 40 g
  ('rec-1782727643733-15149', 5),   -- Lait infuse · 1000 ml / 200
  ('rec-1782727651977-28677', 4),   -- Avocat guacamole · 200 g / 50 g
  ('rec-1782727643823-7052',  90),  -- Vinaigre maison · ~900 ml egouttes / dose 10 ml
  ('rec-1780444936467-8222',  40),  -- Croutons maison · ~1400 g cuits / 35 g
  ('rec-1783293963540-29464', 22),  -- Sauce yaourt · 1133 g / 50 g
  ('rec-1780444936467-7270',  19),  -- Vinaigrette citron · 956 g / 50 g
  ('rec-1783293963783-70453', 13),  -- Mousseline haricots blancs · ~1050 g finis / 80 g
  ('rec-1783293963783-31698', 10),  -- Linguine · 1148 g / 120 g par personne
  ('rec-1783468153853-12393', 10)   -- Marinade sous-vide · 200 g / dose 20 g
)
update recettes r set portions = c.portions
from cible c where r.id = c.id;

-- ─── 3. Cordials du Rucher : 120 portions -> dose de 4 cl ─────────────────
-- 4 cl de cordial pèsent 50 g (densité ~1,25), ce que le Premix prélève par
-- verre. A 120 portions pour 1,2 kg le calcul comptait 10 g par verre.
-- Les 14 passent à 24-31 doses selon la taille du lot.
with lots as (
  select r.id, r.portions as avant,
         (select coalesce(sum((i->>'quantite')::numeric),0)
            from jsonb_array_elements(r.ingredients) i where i->>'unite' in ('ml','g')) as total
  from recettes r
  where r.etablissement_id = 'etab-1777157340476' and r.nom like 'Cordial%'
)
update recettes r set portions = greatest(1, floor(l.total / 50)::int)
from lots l
where r.id = l.id and greatest(1, floor(l.total / 50)::int) <> l.avant;

-- Les 15 « Premix » du Rucher restent volontairement à 1 portion : ce sont des
-- VERRES MONTES (50 g de cordial + 120 ml d'eau pétillante + 120 g de glaçons
-- + 40 g d'alcool en version cave), pas des productions. Les corriger
-- fausserait le coût par verre.

commit;
