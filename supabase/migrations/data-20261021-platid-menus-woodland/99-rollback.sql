-- Retour arrière de 01-apply.sql : remet chaque ligne des menus de groupe de
-- Woodland Village (etab-2) dans l'état d'avant (platId null, sauf les trois
-- fondues et le Paris-Brest d'avril), défait le dédoublement de la ligne
-- listée dans _decision.
--
-- Recalcule la même correspondance que 01 (mêmes blocs, même plan) et ne
-- touche que les lignes dont le plat est encore celui que 01 a posé : une
-- ligne reliée à la main depuis reste telle quelle et sort dans
-- laissees_telles_quelles. _decision doit porter le même choix qu'au moment
-- de l'application.
--
-- Contrôle : empreinte_lignes_completes doit être égale à
-- empreinte_lignes_completes_avant relevée à l'application (README).

begin;

-- Verrou : aucun enregistrement de menu depuis l'app ne peut se glisser entre
-- la lecture des lignes et leur réécriture.
do $$ begin perform 1 from public.groupe_menus where etablissement_id = 'etab-2' for update; end $$;

-- Lignes sans saison dont l'été et l'hiver visent deux fiches différentes.
-- Une seule au 21.10.2026 : « Mini tartelette de saison » des compléments
-- mariage (mignardises), fiches « Mini tartelette de saison, été » et
-- « …, hiver ». Choix possibles :
--   'dedoubler' : la ligne devient la ligne d'été (plat été) et une copie
--                 '<id>-hiver' est ajoutée juste après (plat hiver), comme les
--                 menus séminaires le font déjà pour ce même libellé ;
--   'ete' / 'hiver' : un seul plat, celui de cette saison, toute l'année ;
--   'aucun' : la ligne reste sans plat (« à commander à la main »).
create temp table _decision (ligne_id text, choix text) on commit drop;
insert into _decision values ('mariage-0-mi-05', 'dedoubler');

-- Correspondance ligne de menu -> fiche de dressage, reprise telle quelle de
-- data-20261021-plats-cartes-woodland/01-apply.sql (blocs 1, 4, 5, 6 et _reuse).

create or replace function pg_temp.nk(t text) returns text language sql immutable as
$f$ select lower(btrim(regexp_replace(replace(replace(replace(coalesce(t, ''), '’', ''''), '‘', ''''), '-', ' '), '\s+', ' ', 'g'))) $f$;

-- 1. Fiches de l'établissement
create temp table _r on commit drop as
select id, nom, categorie, created_at, pg_temp.nk(nom) k,
       case when jsonb_typeof(ingredients) = 'array' then ingredients else '[]'::jsonb end ingredients
from public.recettes
where etablissement_id = 'etab-2' and coalesce(statut, '') <> 'archivée';

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

-- Plat existant réutilisé : la fondue moitié-moitié, déjà reliée aux menus 39 et 45
create temp table _reuse (root text, plat_id text) on commit drop;
insert into _reuse values ('rec-1787607253473-49843', '2ba8817a-0097-43e7-a46c-a93d1542d41f');

-- 7. Plat visé par chaque ligne, pour chaque saison de carte : le plat de sa
-- fiche de dressage (wl-ev-<fiche>, ou le plat réutilisé de la fondue).
create temp table _cand on commit drop as
select m.t, m.n, m.idx, m.cs, m.lib, m.root, coalesce(u.plat_id, 'wl-ev-' || m.root) plat_id
from _m m left join _reuse u on u.root = m.root;

-- 8. Plan ligne à ligne
create temp table _ligne on commit drop as
select gm.id menu_id, gm.type_groupe t, gm.numero n, l.ord idx, l.v, l.v->>'id' ligne_id,
       l.v->>'saison' sa, nullif(l.v->>'platId', '') actuel,
       (select min(c.plat_id) from _cand c where c.t = gm.type_groupe and c.n = gm.numero and c.idx = l.ord and c.cs = 'ete') plat_ete,
       (select min(c.plat_id) from _cand c where c.t = gm.type_groupe and c.n = gm.numero and c.idx = l.ord and c.cs = 'hiver') plat_hiver
from public.groupe_menus gm
cross join lateral jsonb_array_elements(gm.lignes) with ordinality l(v, ord)
where gm.etablissement_id = 'etab-2';

create temp table _plan on commit drop as
select li.*, d.choix,
       (li.plat_ete is not null and li.plat_hiver is not null and li.plat_ete <> li.plat_hiver) ambigue,
       case
         when li.plat_ete is null or li.plat_hiver is null or li.plat_ete = li.plat_hiver then coalesce(li.plat_ete, li.plat_hiver)
         when d.choix in ('ete', 'dedoubler') then li.plat_ete
         when d.choix = 'hiver' then li.plat_hiver
       end cible
from _ligne li left join _decision d on d.ligne_id = li.ligne_id;

-- Contrôles avant toute écriture
do $$
begin
  if exists (select 1 from _m where root is null) then
    raise exception 'Ligne de menu sans fiche : %', (select string_agg(distinct lib, ' | ') from _m where root is null);
  end if;
  if exists (select 1 from _ovr o where not exists (select 1 from _r r where r.k = pg_temp.nk(o.fiche))) then
    raise exception 'Fiche de correspondance introuvable : %', (select string_agg(fiche, ' | ') from _ovr o where not exists (select 1 from _r r where r.k = pg_temp.nk(o.fiche)));
  end if;
  if exists (select 1 from _ligne where ligne_id is null)
     or (select count(*) from _ligne) <> (select count(distinct ligne_id) from _ligne) then
    raise exception 'Identifiants de ligne absents ou en double';
  end if;
  if exists (select 1 from _decision where choix not in ('dedoubler', 'ete', 'hiver', 'aucun')) then
    raise exception 'Choix inconnu dans _decision';
  end if;
  if exists (select 1 from _plan where ambigue and choix is null) then
    raise exception 'Ligne sans saison qui vise deux plats, sans décision : %', (select string_agg(menu_id || ' ' || ligne_id || ' ' || (v->>'libelle'), ' | ') from _plan where ambigue and choix is null);
  end if;
  -- Une décision vise une ligne ambiguë, ou une ligne déjà dédoublée (relance)
  if exists (select 1 from _decision d where not exists (select 1 from _plan p where p.ligne_id = d.ligne_id and p.ambigue)
               and not (d.choix = 'dedoubler' and exists (select 1 from _plan p where p.ligne_id = d.ligne_id || '-hiver'))) then
    raise exception 'Décision sur une ligne qui ne vise pas deux plats : %', (select string_agg(ligne_id, ', ') from _decision);
  end if;
  if exists (select 1 from _plan p join _decision d on d.choix = 'dedoubler' and p.ligne_id = d.ligne_id || '-hiver'
             where exists (select 1 from _plan q where q.ligne_id = d.ligne_id and q.ambigue)) then
    raise exception 'Copie d''hiver déjà présente pour une ligne encore sans saison';
  end if;
  -- Chaque plat visé existe dans l'établissement, est actif et porte sa fiche
  if exists (select 1 from _cand c where not exists (select 1 from public.plats p where p.id = c.plat_id and p.etablissement_id = 'etab-2' and p.actif)) then
    raise exception 'Plat absent ou inactif : %', (select string_agg(distinct lib, ' | ') from _cand c where not exists (select 1 from public.plats p where p.id = c.plat_id and p.etablissement_id = 'etab-2' and p.actif));
  end if;
  if exists (select 1 from _cand c where not exists (select 1 from public.plat_recettes pr where pr.plat_id = c.plat_id and pr.recette_id = c.root)) then
    raise exception 'Plat qui ne porte pas la fiche de sa ligne : %', (select string_agg(distinct lib, ' | ') from _cand c where not exists (select 1 from public.plat_recettes pr where pr.plat_id = c.plat_id and pr.recette_id = c.root));
  end if;
end $$;

-- 9. Retour à l'état d'avant 01-apply.sql. Une ligne dont le plat n'est plus
-- celui que 01 a posé (reliée à la main depuis) n'est pas touchée : elle est
-- listée dans le résumé.
create temp table _avant_liees (ligne_id text, plat_id text) on commit drop;
insert into _avant_liees values
  ('groupe-1-ete-06', '2ba8817a-0097-43e7-a46c-a93d1542d41f'),
  ('groupe-2-ete-07', '2ba8817a-0097-43e7-a46c-a93d1542d41f'),
  ('groupe-2-hiver-06', '2ba8817a-0097-43e7-a46c-a93d1542d41f'),
  ('mariage-0-ga-15', 'd5aef48a-cc7f-43ae-ac8d-3bc94e52a1a4');

do $$
begin
  -- Une ligne dédoublée se défait en entier ou pas du tout
  if exists (select 1 from _decision d join _plan o on o.ligne_id = d.ligne_id join _plan c on c.ligne_id = d.ligne_id || '-hiver'
             where d.choix = 'dedoubler' and ((o.actuel is distinct from o.cible) or (c.actuel is distinct from c.cible))) then
    raise exception 'Ligne dédoublée modifiée depuis : à défaire à la main';
  end if;
end $$;

create temp table _retour on commit drop as
select p.menu_id,
       jsonb_agg(e.v order by p.idx) filter (where e.v is not null) lignes
from _plan p
left join _avant_liees a on a.ligne_id = p.ligne_id
cross join lateral (
  select case
    when p.actuel is distinct from p.cible then p.v
    when exists (select 1 from _decision d where d.choix = 'dedoubler' and p.ligne_id = d.ligne_id || '-hiver') then null
    when exists (select 1 from _decision d where d.choix = 'dedoubler' and p.ligne_id = d.ligne_id)
         and exists (select 1 from _plan c where c.ligne_id = p.ligne_id || '-hiver') then jsonb_set(p.v - 'saison', '{platId}', 'null'::jsonb)
    when a.plat_id is not null then jsonb_set(p.v, '{platId}', to_jsonb(a.plat_id))
    else jsonb_set(p.v, '{platId}', 'null'::jsonb)
  end v
) e
group by p.menu_id;

create temp table _compte (k text, n int) on commit drop;
do $$
declare n int;
begin
  update public.groupe_menus gm set lignes = x.lignes
  from _retour x
  where gm.id = x.menu_id and gm.etablissement_id = 'etab-2' and gm.lignes is distinct from x.lignes;
  get diagnostics n = row_count;
  insert into _compte values ('menus_modifies', n);
end $$;

create temp table _resume on commit drop as
select jsonb_build_object(
  'menus_modifies', (select n from _compte where k = 'menus_modifies'),
  'laissees_telles_quelles', (select coalesce(jsonb_agg(ligne_id || ' ' || coalesce(actuel, '-')), '[]'::jsonb) from _plan where actuel is distinct from cible),
  'lignes', (select count(*) from public.groupe_menus gm cross join lateral jsonb_array_elements(gm.lignes) l where gm.etablissement_id = 'etab-2'),
  'liees', (select count(*) from public.groupe_menus gm cross join lateral jsonb_array_elements(gm.lignes) l where gm.etablissement_id = 'etab-2' and nullif(l->>'platId', '') is not null),
  -- à comparer à empreinte_lignes_completes_avant (README) : identique si
  -- aucune ligne n'a été modifiée entre l'application et le retour
  'empreinte_lignes_completes', (select md5(string_agg(gm.id || ' ' || l.v::text, E'\n' order by gm.id, l.ord))
     from public.groupe_menus gm cross join lateral jsonb_array_elements(gm.lignes) with ordinality l(v, ord) where gm.etablissement_id = 'etab-2')
) r;

select r from _resume;

commit;
