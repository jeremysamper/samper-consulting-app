-- Woodland Village (etab-2) : chaque ligne des 14 menus de groupe
-- (groupe_menus.lignes) reliée au plat de sa fiche de dressage, créé le
-- 21.10.2026 (data-20261021-plats-cartes-woodland : plats wl-ev-<fiche>,
-- plus le plat existant de la fondue moitié-moitié).
--
-- Ne change que le champ platId de chaque ligne. Exception, selon _decision :
-- une ligne sans saison dont l'été et l'hiver visent deux fiches est
-- dédoublée (saison 'ete' sur la ligne, copie '<id>-hiver' juste après).
-- Contrôlé en fin de script par empreinte : colonnes du menu hors lignes,
-- chaque ligne hors platId, autres établissements ; sinon tout est annulé.
--
-- La correspondance ligne -> fiche (pg_temp.nk, _r, _l, _lc, _ovr, _m,
-- _reuse) est recopiée telle quelle de
-- data-20261021-plats-cartes-woodland/01-apply.sql par le script qui
-- assemble ce fichier : ne pas la retoucher ici sans la retoucher là-bas.
--
-- Rejouable : une relance ne change rien (menus_modifies = 0).
-- Retour arrière : 99-rollback.sql.

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

-- Liaisons existantes que le script a le droit de remplacer (relevé du
-- 21.10.2026) : le Paris-Brest pointe vers le plat d'avril de la Carte
-- Printemps (3 fiches pour 4), sa fiche de dressage est celle du 16.10.
create temp table _remplace (ligne_id text, ancien text, nouveau text) on commit drop;
insert into _remplace values
  ('mariage-0-ga-15', 'd5aef48a-cc7f-43ae-ac8d-3bc94e52a1a4', 'wl-ev-rec-1792178957969-68472');

-- Une liaison existante n'est remplacée que si elle est listée dans _remplace
do $$
begin
  if exists (select 1 from _plan p where p.actuel is not null and p.actuel is distinct from p.cible
               and not exists (select 1 from _remplace x where x.ligne_id = p.ligne_id and x.ancien = p.actuel and x.nouveau = p.cible)) then
    raise exception 'Liaison existante différente de la cible (reliée à la main depuis ?) : %', (select string_agg(ligne_id || ' ' || actuel || ' -> ' || coalesce(cible, 'aucun'), ' | ') from _plan p where p.actuel is not null and p.actuel is distinct from p.cible and not exists (select 1 from _remplace x where x.ligne_id = p.ligne_id and x.ancien = p.actuel and x.nouveau = p.cible));
  end if;
end $$;

-- 9. Empreintes avant écriture. Projection de chaque ligne sans platId (et
-- sans saison pour une ligne dédoublée) : elle ne doit pas bouger.
create temp table _avant on commit drop as
select
  (select md5(string_agg((to_jsonb(gm) - 'lignes' - 'updated_at')::text, E'\n' order by gm.id))
     from public.groupe_menus gm where gm.etablissement_id = 'etab-2') menus,
  (select md5(string_agg(li.menu_id || ' ' || (case when li.ligne_id in (select ligne_id from _decision) then li.v - 'platId' - 'saison' else li.v - 'platId' end)::text, E'\n' order by li.menu_id, li.idx))
     from _ligne li) lignes_hors_platid,
  (select md5(string_agg(li.menu_id || ' ' || li.v::text, E'\n' order by li.menu_id, li.idx)) from _ligne li) lignes_completes,
  (select md5(coalesce(string_agg(to_jsonb(gm)::text, E'\n' order by gm.id), '')) from public.groupe_menus gm where gm.etablissement_id <> 'etab-2') autres_etablissements,
  (select count(*) from _ligne) nb_lignes,
  (select count(*) from _ligne where actuel is not null) nb_liees;

-- 10. Nouvelles lignes de chaque menu : seul platId change ; une ligne
-- dédoublée prend la saison d'été et sa copie d'hiver la suit.
create temp table _nouv on commit drop as
select p.menu_id, jsonb_agg(e.v order by p.idx, e.sub) lignes
from _plan p
cross join lateral (
  select 0 sub,
         case when p.ambigue and p.choix = 'dedoubler'
              then jsonb_set(jsonb_set(p.v, '{platId}', to_jsonb(p.plat_ete)), '{saison}', '"ete"')
              else jsonb_set(p.v, '{platId}', coalesce(to_jsonb(p.cible), 'null'::jsonb)) end v
  union all
  select 1, jsonb_set(jsonb_set(jsonb_set(p.v, '{platId}', to_jsonb(p.plat_hiver)), '{saison}', '"hiver"'), '{id}', to_jsonb(p.ligne_id || '-hiver'))
  where p.ambigue and p.choix = 'dedoubler'
) e
group by p.menu_id;

create temp table _copies on commit drop as
select ligne_id || '-hiver' id, ligne_id origine, plat_hiver plat_id from _plan where ambigue and choix = 'dedoubler';

-- Liaisons attendues après écriture, ligne par ligne
create temp table _attendu on commit drop as
select ligne_id, cible plat_id from _plan
union all
select id, plat_id from _copies;

-- 11. Écriture : seulement les menus dont les lignes changent
create temp table _compte (k text, n int) on commit drop;
do $$
declare n int;
begin
  update public.groupe_menus gm set lignes = x.lignes
  from _nouv x
  where gm.id = x.menu_id and gm.etablissement_id = 'etab-2' and gm.lignes is distinct from x.lignes;
  get diagnostics n = row_count;
  insert into _compte values ('menus_modifies', n);
end $$;

-- 12. Contrôles après écriture et résumé
create temp table _apres on commit drop as
select gm.id menu_id, l.ord idx, l.v, l.v->>'id' ligne_id, nullif(l.v->>'platId', '') plat_id
from public.groupe_menus gm
cross join lateral jsonb_array_elements(gm.lignes) with ordinality l(v, ord)
where gm.etablissement_id = 'etab-2';

create temp table _resume on commit drop as
select jsonb_build_object(
  'menus_modifies', (select n from _compte where k = 'menus_modifies'),
  'lignes_avant', (select nb_lignes from _avant),
  'lignes_apres', (select count(*) from _apres),
  'liees_avant', (select nb_liees from _avant),
  'liees_apres', (select count(*) from _apres where plat_id is not null),
  'non_liees_apres', (select coalesce(jsonb_agg(menu_id || ' ' || (v->>'libelle') order by menu_id, idx), '[]'::jsonb) from _apres where plat_id is null),
  'remplacees', (select coalesce(jsonb_agg(p.ligne_id || ' ' || p.actuel || ' -> ' || p.cible), '[]'::jsonb) from _plan p where p.actuel is not null and p.actuel is distinct from p.cible),
  'dedoublees', (select coalesce(jsonb_agg(origine || ' + ' || id), '[]'::jsonb) from _copies),
  'plats_distincts', (select count(distinct plat_id) from _apres),
  'plats_sans_fiche_chiffrable', (select coalesce(jsonb_agg(distinct p.nom), '[]'::jsonb) from _apres a join public.plats p on p.id = a.plat_id
       where not exists (select 1 from public.plat_recettes pr join public.recettes r on r.id = pr.recette_id
                         where pr.plat_id = a.plat_id and coalesce(r.statut, '') <> 'archivée' and r.portions > 0)),
  'empreinte_liaisons', (select md5(string_agg(ligne_id || '>' || coalesce(plat_id, '-'), E'\n' order by ligne_id)) from _apres),
  'empreinte_lignes_hors_platid', (select lignes_hors_platid from _avant),
  'empreinte_lignes_completes_avant', (select lignes_completes from _avant),
  'empreinte_menus_hors_lignes', (select menus from _avant),
  'existant_inchange', (
    (select md5(string_agg((to_jsonb(gm) - 'lignes' - 'updated_at')::text, E'\n' order by gm.id))
       from public.groupe_menus gm where gm.etablissement_id = 'etab-2') = (select menus from _avant)
    and (select md5(string_agg(a.menu_id || ' ' || (case when a.ligne_id in (select ligne_id from _decision) then a.v - 'platId' - 'saison' else a.v - 'platId' end)::text, E'\n' order by a.menu_id, a.idx))
           from _apres a where a.ligne_id not in (select id from _copies)) = (select lignes_hors_platid from _avant)
    and (select md5(coalesce(string_agg(to_jsonb(gm)::text, E'\n' order by gm.id), '')) from public.groupe_menus gm where gm.etablissement_id <> 'etab-2') = (select autres_etablissements from _avant)
    and (select count(*) from _apres) = (select nb_lignes from _avant) + (select count(*) from _copies)
    and not exists (select 1 from _copies c join _apres a on a.ligne_id = c.id join _apres o on o.ligne_id = c.origine
                    where (a.v - 'id' - 'saison' - 'platId') <> (o.v - 'id' - 'saison' - 'platId'))
    and (select count(*) from _copies) = (select count(*) from _apres a join _copies c on c.id = a.ligne_id)
  ),
  'liaisons_attendues', (
    (select md5(string_agg(ligne_id || '>' || coalesce(plat_id, '-'), E'\n' order by ligne_id)) from _apres)
    = (select md5(string_agg(ligne_id || '>' || coalesce(plat_id, '-'), E'\n' order by ligne_id)) from _attendu)
  )
) r;

do $$
begin
  if not (select (r->>'existant_inchange')::boolean from _resume) then
    raise exception 'Autre chose que platId a changé, rien n''est enregistré : %', (select r from _resume);
  end if;
  if not (select (r->>'liaisons_attendues')::boolean from _resume) then
    raise exception 'Liaisons écrites différentes du plan, rien n''est enregistré : %', (select r from _resume);
  end if;
end $$;

select r from _resume;

commit;
