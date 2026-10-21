-- Woodland Village (etab-2) : cartes Brunch, Groupes, Mariages et Séminaires
-- rangées en plats dans Outils consultant > Plats & Recettes.
--
-- Purement additif : crée 6 cartes, des plats et leurs liaisons. Aucune ligne
-- existante n'est modifiée ni supprimée (contrôlé en fin de script par
-- empreinte des lignes antérieures à la transaction).
--
-- Règles :
-- - Cartes de groupe : un plat par fiche de dressage citée dans les menus
--   (groupe_menus), nommé comme la fiche. Le plat porte la fiche ET toutes ses
--   sous-fiches à toute profondeur (plat_recettes est une liste plate : la
--   commande et la MEP ne descendent pas dans les fiches imbriquées). Une ligne
--   sans saison vaut pour l'été et l'hiver. Un même plat sert toutes les cartes
--   où il figure (lien carte_plats), sans copie.
-- - Carte Brunch : les recettes du brunch de juin (plats « Brunch - Patisserie »
--   et « Brunch - Planches » de la Carte Printemps 2026) rangées dans des plats
--   de tri ; une recette assemblée à partir d'autres fiches a son propre plat ;
--   s'y ajoutent les plats pâtisserie et apéritifs des menus de groupe.
--
-- Rejouable : identifiants fixes (wl-ev-*, wl-brunch-*, carte-woodland-*),
-- ON CONFLICT DO NOTHING partout.

begin;

-- Options de périmètre du brunch
create temp table _opt on commit drop as
-- (choix de Jérémy le 21.10.2026 : les deux ajoutés)
select true as stations_au_brunch,        -- stations du vin d'honneur
       true as desserts_carte_au_brunch;  -- desserts des cartes restaurant

create or replace function pg_temp.nk(t text) returns text language sql immutable as
$f$ select lower(btrim(regexp_replace(replace(replace(replace(coalesce(t, ''), '’', ''''), '‘', ''''), '-', ' '), '\s+', ' ', 'g'))) $f$;

-- Empreinte des lignes existantes, recalculée à la fin
create temp table _avant on commit drop as
select
  (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.cartes x where x.etablissement_id = 'etab-2') cartes,
  (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.plats x where x.etablissement_id = 'etab-2') plats,
  (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.plat_recettes x join public.plats p on p.id = x.plat_id where p.etablissement_id = 'etab-2') plat_recettes,
  (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.carte_plats x join public.cartes c on c.id = x.carte_id where c.etablissement_id = 'etab-2') carte_plats,
  (select count(*) from public.recettes r where r.etablissement_id = 'etab-2' and coalesce(r.statut, '') <> 'archivée'
     and not exists (select 1 from public.plat_recettes pr join public.plats p on p.id = pr.plat_id where pr.recette_id = r.id)) orphelines;

-- 1. Fiches de l'établissement
create temp table _r on commit drop as
select id, nom, categorie, created_at, pg_temp.nk(nom) k,
       case when jsonb_typeof(ingredients) = 'array' then ingredients else '[]'::jsonb end ingredients
from public.recettes
where etablissement_id = 'etab-2' and coalesce(statut, '') <> 'archivée';

-- 2. Fiche -> sous-fiche : un ingrédient qui porte le nom d'une fiche. Deux
-- fiches homonymes : celle créée le même jour que la fiche parente, sinon la
-- plus récente.
-- Fiches qui portent le nom d'un produit brut : dans un fond ou une bisque,
-- « Fenouil » est du fenouil, pas la fiche « Fenouil » d'avril (relevé du
-- 21.10.2026 : 17 fiches l'utilisent comme légume). « Chou kale » n'est une
-- sous-fiche que pour les fiches d'août, créées avec elle.
create temp table _brut (nom text, autre_jour_seulement boolean) on commit drop;
insert into _brut values ('Fenouil', false), ('Poireau', false), ('Chou kale', true);

create temp table _e on commit drop as
select distinct on (p.id, pg_temp.nk(i->>'nom')) p.id parent, c.id child
from _r p
cross join lateral jsonb_array_elements(p.ingredients) i
join _r c on c.k = pg_temp.nk(i->>'nom') and c.id <> p.id
where not exists (select 1 from _brut b where pg_temp.nk(b.nom) = c.k
                    and (not b.autre_jour_seulement or c.created_at::date <> p.created_at::date))
order by p.id, pg_temp.nk(i->>'nom'), (c.created_at::date = p.created_at::date) desc, c.created_at desc;

-- 3. Clôture : chaque fiche et ses sous-fiches à toute profondeur
create temp table _c on commit drop as
with recursive c(root, rid, prof) as (
  select id, id, 0 from _r
  union
  select c.root, e.child, c.prof + 1 from c join _e e on e.parent = c.rid where c.prof < 10
)
select root, rid, min(prof) prof from c group by root, rid;

-- 4. Lignes des menus de groupe et cartes visées
create temp table _l on commit drop as
select m.type_groupe t, m.numero n, l.ord idx, l.v->>'section' s, l.v->>'saison' sa,
       l.v->>'libelle' lib, pg_temp.nk(l.v->>'libelle') k
from public.groupe_menus m
cross join lateral jsonb_array_elements(m.lignes) with ordinality l(v, ord)
where m.etablissement_id = 'etab-2';

create temp table _lc on commit drop as
select _l.*, cs.saison cs
from _l
cross join lateral unnest(case _l.sa when 'ete' then array['ete'] when 'hiver' then array['hiver']
                                     else array['ete', 'hiver'] end) cs(saison);

-- 5. Libellés des menus écrits autrement que leur fiche (relevé du 21.10.2026).
-- cs : saison de la carte, null = les deux.
create temp table _ovr (k text, cs text, fiche text) on commit drop;
insert into _ovr (k, cs, fiche) values
  (pg_temp.nk('Compotée de fruits de saison, crumble au sarrasin'), 'ete', 'Compotée de fruits de saison, crumble au sarrasin, été'),
  (pg_temp.nk('Compotée de fruits de saison, crumble au sarrasin'), 'hiver', 'Compotée de fruits de saison, crumble au sarrasin, hiver'),
  (pg_temp.nk('Compotée de fruits de saison, crumble au sésame'), null, 'Compotée de fruits de saison, crumble miel et sésame'),
  (pg_temp.nk('Mini tartelette de saison'), 'ete', 'Mini tartelette de saison, été'),
  (pg_temp.nk('Mini tartelette de saison'), 'hiver', 'Mini tartelette de saison, hiver'),
  (pg_temp.nk('Plateau de fromages affinés du Valais à partager, au centre de chaque table, confiture de saison, pain aux noix'), 'ete', 'Plateau de fromages affinés du Valais à partager, confiture d''abricots, pain aux noix'),
  (pg_temp.nk('Plateau de fromages affinés du Valais à partager, au centre de chaque table, confiture de saison, pain aux noix'), 'hiver', 'Plateau de fromages affinés du Valais à partager, confiture de coings, pain aux noix'),
  (pg_temp.nk('Velouté de potimarron, crème de châtaignes, huile de courge'), null, 'Velouté de potimarron, crème de châtaigne, huile de courge'),
  (pg_temp.nk('Cochon de lait (entier ou demi), ratatouilles de légumes, pommes grenailles rôties aux herbes'), null, 'Cochon de lait (entier ou demi), ratatouille de légumes, pommes grenailles rôties aux herbes'),
  (pg_temp.nk('Effiloché de canard en double cuisson, jus à l''abricot, croquette de polenta croustillant, mousseline de patate douce'), null, 'Effiloché de canard en double cuisson, jus à l''abricot, croquette de polenta croustillante, mousseline de patate douce'),
  (pg_temp.nk('Effiloché de porc en double cuisson, jus réduit, mousseline de chou fleur, pois gourmand'), null, 'Effiloché de porc en double cuisson, jus réduit, mousseline de chou-fleur, pois gourmands'),
  (pg_temp.nk('Filet mignon de porc, sauce moutarde à l''ancienne'), null, 'Filet mignon de porc, sauce à la moutarde à l''ancienne, mousseline de chou-fleur, haricots verts à l''échalote'),
  (pg_temp.nk('Filet mignon de porc, sauce moutarde à l''ancienne, mousseline de chou-fleur, haricots verts à l''échalote'), null, 'Filet mignon de porc, sauce à la moutarde à l''ancienne, mousseline de chou-fleur, haricots verts à l''échalote'),
  (pg_temp.nk('Fondue de viande, sauces maison, pommes grenaille rôties aux herbes'), null, 'Fondue de viande, sauces maison, pommes grenailles rôties aux herbes'),
  (pg_temp.nk('Fondue de viande, sauces maison, pommes grenailles rôties au thym'), null, 'Fondue de viande, sauces maison, pommes grenailles rôties aux herbes'),
  (pg_temp.nk('Fondue moitié-moitié en caquelon'), null, 'Fondue moitié-moitié'),
  (pg_temp.nk('Fondue moitié-moitié, pain et pickles'), null, 'Fondue moitié-moitié'),
  (pg_temp.nk('Lotte à l''armoricaine, risoni au citron et aux herbes'), null, 'Lotte à l''armoricaine, risoni au citron et herbes alpines'),
  (pg_temp.nk('Risotto d''orge aux légumes confits'), null, 'Risotto d''orge crémeux aux légumes confits'),
  (pg_temp.nk('Sandre rôti, sauce au vin rouge, endives braisées, mousseline de fenouil, pois gourmand'), null, 'Sandre rôti, sauce au vin rouge, endives braisées, mousseline de fenouil, pois gourmands'),
  (pg_temp.nk('Sandre rôti, sauce au vin rouge, endives braisées, mousseline de fenouil'), null, 'Sandre rôti, sauce au vin rouge, endives braisées, mousseline de fenouil, pois gourmands'),
  (pg_temp.nk('Wellington de champignon et châtaignes, jus corsé végétal'), null, 'Wellington de champignons et châtaignes, jus corsé végétal'),
  (pg_temp.nk('Saint-Jacques snackée, beurre noisette, en cuillère'), null, 'Saint-Jacques snackées, beurre noisette, en cuillère'),
  (pg_temp.nk('Tarte tatin crème crue'), null, 'Tarte tatin, crème crue'),
  -- la fiche homonyme est la blanquette seule ; la fiche de dressage ajoute le riz pilaf
  (pg_temp.nk('Blanquette de veau à l''ancienne'), null, 'Blanquette de veau à l''ancienne, riz pilaf');

-- 6. Fiche de dressage de chaque ligne, pour chaque carte
create temp table _m on commit drop as
select lc.t, lc.n, lc.idx, lc.s, lc.cs, lc.lib,
  coalesce(
    (select r.id from _ovr o join _r r on r.k = pg_temp.nk(o.fiche)
      where o.k = lc.k and (o.cs is null or o.cs = lc.cs) order by o.cs nulls last, r.created_at desc limit 1),
    (select r.id from _r r where r.k = lc.k order by r.created_at desc limit 1)
  ) root
from _lc lc;

-- 7. Ordre de service et catégorie de plat par rubrique de menu
create temp table _rang (s text, rang int, categorie text) on commit drop;
insert into _rang values
  ('aperitif', 1, 'Apéritifs'), ('stations', 2, 'Stations'), ('entree', 3, 'Entrées'),
  ('poisson', 4, 'Poissons'), ('trou', 5, 'Trou valaisan'), ('plat', 6, 'Plats'),
  ('fromage', 7, 'Fromages'), ('dessert', 8, 'Desserts'), ('gateau', 9, 'Gâteaux'),
  ('mignardises', 10, 'Mignardises');

-- Plat existant réutilisé : la fondue moitié-moitié, déjà reliée aux menus 39 et 45
create temp table _reuse (root text, plat_id text) on commit drop;
insert into _reuse values ('rec-1787607253473-49843', '2ba8817a-0097-43e7-a46c-a93d1542d41f');

-- Contrôles avant toute écriture
do $$
begin
  if exists (select 1 from _m where root is null) then
    raise exception 'Ligne de menu sans fiche : %', (select string_agg(distinct lib, ' | ') from _m where root is null);
  end if;
  if exists (select 1 from _ovr o where not exists (select 1 from _r r where r.k = pg_temp.nk(o.fiche))) then
    raise exception 'Fiche de correspondance introuvable : %', (select string_agg(fiche, ' | ') from _ovr o where not exists (select 1 from _r r where r.k = pg_temp.nk(o.fiche)));
  end if;
  if exists (select 1 from _ovr o where not exists (select 1 from _l where _l.k = o.k)) then
    raise exception 'Correspondance sans ligne de menu : %', (select string_agg(k, ' | ') from _ovr o where not exists (select 1 from _l where _l.k = o.k));
  end if;
  if exists (select 1 from _l where s not in (select s from _rang)) then
    raise exception 'Rubrique inconnue : %', (select string_agg(distinct s, ', ') from _l where s not in (select s from _rang));
  end if;
  if not exists (select 1 from public.plats where id = '2ba8817a-0097-43e7-a46c-a93d1542d41f' and etablissement_id = 'etab-2') then
    raise exception 'Plat fondue moitié-moitié introuvable';
  end if;
  if not exists (select 1 from public.cartes where id = 'carte-1792552544043-wyiw' and etablissement_id = 'etab-2' and nom = 'Brunch') then
    raise exception 'Carte Brunch introuvable';
  end if;
end $$;

-- 8. Plats des menus : un par fiche de dressage
create temp table _ep on commit drop as
select x.root,
       coalesce(u.plat_id, 'wl-ev-' || x.root) plat_id,
       (u.plat_id is not null) reutilise,
       r.nom, x.categorie, x.rubriques,
       x.rang * 1000 + row_number() over (partition by x.rang order by x.premier, r.nom) ordre
from (
  select m.root, min(g.rang) rang,
         (array_agg(g.categorie order by g.rang))[1] categorie,
         array_agg(distinct m.s) rubriques,
         min(m.n * 1000 + m.idx) premier
  from _m m join _rang g on g.s = m.s
  group by m.root
) x
join _r r on r.id = x.root
left join _reuse u on u.root = x.root;

-- 9. Cartes à créer (la carte Brunch existe déjà)
create temp table _cartes (id text, nom text, t text, cs text, ordre int) on commit drop;
insert into _cartes values
  ('carte-woodland-groupes-hiver',    'Groupes hiver',    'groupe',    'hiver', 6),
  ('carte-woodland-groupes-ete',      'Groupes été',      'groupe',    'ete',   7),
  ('carte-woodland-mariages-hiver',   'Mariages hiver',   'mariage',   'hiver', 8),
  ('carte-woodland-mariages-ete',     'Mariages été',     'mariage',   'ete',   9),
  ('carte-woodland-seminaires-hiver', 'Séminaires hiver', 'seminaire', 'hiver', 10),
  ('carte-woodland-seminaires-ete',   'Séminaires été',   'seminaire', 'ete',   11);

-- 10. Brunch : plats de tri des recettes du brunch de juin
create temp table _tri (slug text, nom text, categorie text, ordre int) on commit drop;
insert into _tri values
  ('patisserie-sucree', 'Pâtisserie sucrée',          'Desserts',  10),
  ('verrines-sucrees',  'Verrines sucrées',           'Desserts',  20),
  ('patisserie-salee',  'Pâtisserie salée',           'Apéritifs', 30),
  ('verrines-salees',   'Verrines salées',            'Apéritifs', 40),
  ('tartines',          'Tartines et mini-sandwichs', 'Apéritifs', 50),
  ('dips',              'Dips et tartinables',        'Apéritifs', 60),
  ('bouchees',          'Bouchées et tartares',       'Apéritifs', 70);

create temp table _tri_r (nom text, slug text) on commit drop;
insert into _tri_r values
  ('Banana bread', 'patisserie-sucree'), ('Brownie', 'patisserie-sucree'),
  ('Cake abricot', 'patisserie-sucree'), ('Cake amande-cerise', 'patisserie-sucree'),
  ('Cake citron', 'patisserie-sucree'), ('Cannelés', 'patisserie-sucree'),
  ('Carrot cake', 'patisserie-sucree'), ('Cinnamon rolls Woodland', 'patisserie-sucree'),
  ('Clafoutis', 'patisserie-sucree'), ('Crumble abricot', 'patisserie-sucree'),
  ('Financiers framboise', 'patisserie-sucree'), ('Madeleines citron', 'patisserie-sucree'),
  ('Pancakes', 'patisserie-sucree'), ('Pavlova', 'patisserie-sucree'),
  ('Sablés citron', 'patisserie-sucree'), ('Tarte abricot', 'patisserie-sucree'),
  ('Tarte fine pêche', 'patisserie-sucree'), ('Tarte fraises', 'patisserie-sucree'),
  ('Tarte myrtilles', 'patisserie-sucree'), ('Tartelettes citron', 'patisserie-sucree'),
  ('Tartelettes fruits rouges', 'patisserie-sucree'),
  ('Chia pudding coco + mangue', 'verrines-sucrees'), ('Crémeux citron-basilic', 'verrines-sucrees'),
  ('Mousse citron en verrine', 'verrines-sucrees'), ('Panna cotta + coulis', 'verrines-sucrees'),
  ('Tiramisu fraise en verrine', 'verrines-sucrees'), ('Verrine abricot-romarin', 'verrines-sucrees'),
  ('Yaourt grec + compote abricot', 'verrines-sucrees'),
  ('Mini-pizzas margherita', 'patisserie-salee'), ('Mini-quiches courgette-chèvre', 'patisserie-salee'),
  ('Mini-tartes tomate', 'patisserie-salee'),
  ('Gaspacho andalou', 'verrines-salees'), ('Gaspacho melon', 'verrines-salees'),
  ('Verrine concombre-feta', 'verrines-salees'), ('Verrine guacamole-crevette', 'verrines-salees'),
  ('Mini-bagel saumon', 'tartines'), ('Mini-club', 'tartines'),
  ('Tartine avocat', 'tartines'), ('Tartine chèvre-figue', 'tartines'),
  ('Tartine houmous-poivrons', 'tartines'), ('Tartine pêche-burrata', 'tartines'),
  ('Tartine saumon fumé', 'tartines'), ('Tartine viande séchée', 'tartines'),
  ('Baba ganoush', 'dips'), ('Caviar d''aubergine', 'dips'), ('Houmous', 'dips'),
  ('Muhammara', 'dips'), ('Rillettes de porc', 'dips'), ('Rillettes de thon', 'dips'),
  ('Tzatziki', 'dips'),
  ('Arancini', 'bouchees'), ('Falafel', 'bouchees'),
  ('Tartare saumon-mangue', 'bouchees'), ('Tartare tomates + burrata', 'bouchees');

-- Recettes du brunch de juin (Brunch - Patisserie, Brunch - Planches) et les pancakes
create temp table _bj on commit drop as
select distinct r.id, r.nom, t.slug,
       exists (select 1 from _e where _e.parent = r.id) assemblee
from _r r
left join _tri_r t on t.nom = r.nom
where r.id in (select recette_id from public.plat_recettes
               where plat_id in ('b94130b9-f0be-4aa9-a199-c314ee71b44b', '2442b1c2-c87f-4fe0-b2a0-864e5422803a'))
   or r.id = 'rec-1782382036276-75267';

do $$
begin
  if exists (select 1 from _bj where slug is null) then
    raise exception 'Recette du brunch sans plat de tri : %', (select string_agg(nom, ' | ') from _bj where slug is null);
  end if;
  if (select count(*) from _bj) <> (select count(*) from _tri_r) then
    raise exception 'Tri du brunch : % recettes, % entrées de tri', (select count(*) from _bj), (select count(*) from _tri_r);
  end if;
end $$;

-- Plats du brunch : nouveaux (tri, assemblages) et existants (menus, options)
create temp table _bp (plat_id text, nom text, categorie text, ordre int, nouveau boolean) on commit drop;
create temp table _bpr (plat_id text, recette_id text, prof int) on commit drop;

-- Plats de tri : les recettes simples
insert into _bp
select 'wl-brunch-' || t.slug, t.nom, t.categorie, t.ordre, true
from _tri t where exists (select 1 from _bj where _bj.slug = t.slug and not _bj.assemblee);
insert into _bpr
select 'wl-brunch-' || slug, id, 0 from _bj where not assemblee;

-- Une recette assemblée a son plat, avec toutes ses sous-fiches
insert into _bp
select 'wl-brunch-' || b.id, b.nom, t.categorie, t.ordre + 5, true
from _bj b join _tri t on t.slug = b.slug where b.assemblee;
insert into _bpr
select 'wl-brunch-' || b.id, c.rid, c.prof from _bj b join _c c on c.root = b.id where b.assemblee;

-- Pâtisserie et apéritifs des menus : les plats des menus, reliés aussi au brunch
insert into _bp
select e.plat_id, e.nom, e.categorie, e.ordre, false
from _ep e
where e.rubriques && array['aperitif', 'trou', 'dessert', 'gateau', 'mignardises']
   or ((select stations_au_brunch from _opt) and e.rubriques && array['stations']);

-- Option : desserts des cartes restaurant (plats existants)
insert into _bp
select distinct p.id, p.nom, p.categorie, p.ordre, false
from public.plats p
join public.carte_plats cp on cp.plat_id = p.id
join public.cartes c on c.id = cp.carte_id
where (select desserts_carte_au_brunch from _opt)
  and p.etablissement_id = 'etab-2' and p.categorie = 'Desserts'
  and c.id in ('carte-1787604411839-oe3j', 'carte-1783280207338-590o', 'carte-etab-2-1776966313242')
  and exists (select 1 from public.plat_recettes pr where pr.plat_id = p.id)
  and p.id not in (select plat_id from _bp);

-- 11. Écritures
insert into public.cartes (id, etablissement_id, nom, ordre, archive, masquee, plats)
select id, 'etab-2', nom, ordre, false, false, '[]'::jsonb from _cartes
on conflict (id) do nothing;

insert into public.plats (id, etablissement_id, nom, categorie, prix_vente, description, notes, ordre, actif)
select plat_id, 'etab-2', nom, categorie, null::numeric, '', '', ordre, true from _ep where not reutilise
union all
select plat_id, 'etab-2', nom, categorie, null::numeric, '', '', ordre, true from _bp where nouveau
on conflict (id) do nothing;

insert into public.plat_recettes (plat_id, recette_id, role, ordre)
select e.plat_id, c.rid, 'composant', c.prof from _ep e join _c c on c.root = e.root where not e.reutilise
union
select plat_id, recette_id, 'composant', min(prof) from _bpr group by plat_id, recette_id
on conflict (plat_id, recette_id) do nothing;

insert into public.carte_plats (carte_id, plat_id, ordre)
select ca.id, e.plat_id, min(e.ordre)
from _m m join _ep e on e.root = m.root join _cartes ca on ca.t = m.t and ca.cs = m.cs
group by ca.id, e.plat_id
union all
select 'carte-1792552544043-wyiw', plat_id, min(ordre) from _bp group by plat_id
on conflict (carte_id, plat_id) do nothing;

-- 12. Contrôles après écriture et résumé
create temp table _resume on commit drop as
select jsonb_build_object(
  'cartes_creees', (select count(*) from public.cartes where id in (select id from _cartes) and created_at = now()),
  'plats_menus_crees', (select count(*) from public.plats where id like 'wl-ev-%' and created_at = now()),
  'plats_brunch_crees', (select count(*) from public.plats where id like 'wl-brunch-%' and created_at = now()),
  'liaisons_recettes_creees', (select count(*) from public.plat_recettes where created_at = now()),
  'liaisons_cartes_creees', (select count(*) from public.carte_plats where created_at = now()),
  'brunch_assemblees', (select coalesce(jsonb_agg(nom order by nom), '[]'::jsonb) from _bj where assemblee),
  'par_carte', (select jsonb_object_agg(c.nom, jsonb_build_object(
                   'plats', (select count(*) from public.carte_plats cp where cp.carte_id = c.id),
                   'recettes', (select count(distinct pr.recette_id) from public.carte_plats cp join public.plat_recettes pr on pr.plat_id = cp.plat_id where cp.carte_id = c.id)))
                from public.cartes c where c.id in (select id from _cartes) or c.id = 'carte-1792552544043-wyiw'),
  'empreinte_liaisons_recettes', (select md5(string_agg(plat_id || '>' || recette_id, E'\n' order by plat_id, recette_id)) from public.plat_recettes where created_at = now()),
  'empreinte_liaisons_cartes', (select md5(string_agg(carte_id || '>' || plat_id, E'\n' order by carte_id, plat_id)) from public.carte_plats where created_at = now()),
  'orphelines_avant', (select orphelines from _avant),
  'orphelines_apres', (select count(*) from public.recettes r where r.etablissement_id = 'etab-2' and coalesce(r.statut, '') <> 'archivée'
                         and not exists (select 1 from public.plat_recettes pr join public.plats p on p.id = pr.plat_id where pr.recette_id = r.id)),
  'existant_inchange', (
    (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.cartes x where x.etablissement_id = 'etab-2' and coalesce(x.created_at, '-infinity') < now()) = (select cartes from _avant)
    and (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.plats x where x.etablissement_id = 'etab-2' and coalesce(x.created_at, '-infinity') < now()) = (select plats from _avant)
    and (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.plat_recettes x join public.plats p on p.id = x.plat_id where p.etablissement_id = 'etab-2' and coalesce(x.created_at, '-infinity') < now()) = (select plat_recettes from _avant)
    and (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.carte_plats x join public.cartes c on c.id = x.carte_id where c.etablissement_id = 'etab-2' and coalesce(x.created_at, '-infinity') < now()) = (select carte_plats from _avant)
  )
) r;

do $$
begin
  if not (select (r->>'existant_inchange')::boolean from _resume) then
    raise exception 'Des lignes existantes ont changé, rien n''est enregistré';
  end if;
end $$;

select r from _resume;

commit;
