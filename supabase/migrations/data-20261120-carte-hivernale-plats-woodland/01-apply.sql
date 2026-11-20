-- Woodland Village (etab-2), Carte hivernale 2026 (carte-1795205208352-ym7p).
--
-- L'import du 20.11.2026 a posé chaque fiche sur son propre plat : 104 plats
-- sur la carte, dont 67 ne portent qu'une sous-fiche (jus, sauces, pickles,
-- pâtes). Ce script range chaque sous-fiche dans le ou les plats de la carte
-- qui l'utilisent, à toute profondeur (plat_recettes est une liste plate : la
-- commande et la MEP ne descendent pas dans une fiche citée comme
-- ingrédient), puis supprime les 67 plats de sous-fiche. Aucune fiche ne bouge.
--
-- Règles :
-- - Sous-fiche : ingrédient qui porte le nom d'une fiche de la même carte
--   (rapprochement limité aux 104 fiches de l'import, aucune autre fiche de
--   l'établissement n'entre en jeu).
-- - Plat de la carte : fiche qu'aucune autre fiche n'utilise. Leur liste doit
--   être exactement celle de la carte imprimée (table _carte), sinon tout est
--   annulé.
-- - Les plats supprimés sont sauvegardés dans le schéma sauvegarde (tables
--   carte_hiver_20261120_*), avec leurs liens ; 99-rollback.sql les relit.
--
-- Essai à blanc par défaut : le bloc finit par une exception (ES007) qui
-- annule tout et rend le compte rendu. Pour appliquer, faire précéder le bloc,
-- dans la même transaction, de :
--   select set_config('carte_hiver.appliquer', 'oui', true);

do $run$
declare
  v_carte constant text := 'carte-1795205208352-ym7p';
  v_appliquer constant boolean := coalesce(current_setting('carte_hiver.appliquer', true), '') = 'oui';
  n_fiches int; n_racines int; n_sous int; n_orph int; n_refs int; n_prof int;
  n_liens int; n_suppr int; n_plats_fin int; n_liens_fin int;
  v_ecart text; v_md5 text; v_rapport text;
begin
  -- 0. Carte de Woodland, dans l'état laissé par l'import
  if not exists (select 1 from public.cartes where id = v_carte and etablissement_id = 'etab-2') then
    raise exception 'Carte % introuvable pour etab-2', v_carte;
  end if;

  create temp table _f on commit drop as
  select p.id pid, r.id rid, r.nom, r.etablissement_id etab,
         lower(btrim(regexp_replace(replace(replace(replace(r.nom, '’', ''''), '‘', ''''), '-', ' '), '\s+', ' ', 'g'))) k,
         case when jsonb_typeof(r.ingredients) = 'array' then r.ingredients else '[]'::jsonb end ingredients
  from public.carte_plats cp
  join public.plats p on p.id = cp.plat_id
  join public.plat_recettes pr on pr.plat_id = p.id
  join public.recettes r on r.id = pr.recette_id
  where cp.carte_id = v_carte;

  select count(*) into n_fiches from _f;
  if n_fiches <> 104
     or (select count(distinct pid) from _f) <> 104
     or (select count(distinct rid) from _f) <> 104
     or (select count(distinct k) from _f) <> 104
     or exists (select 1 from _f where etab <> 'etab-2') then
    raise exception 'Carte modifiée depuis le relevé (déjà appliqué ?) : % liens plat-fiche, attendu 104 plats à une fiche chacun', n_fiches;
  end if;

  -- 1. Fiche parente > sous-fiche, par le nom de l'ingrédient
  create temp table _e on commit drop as
  select distinct p.rid parent, c.rid child
  from _f p
  cross join lateral jsonb_array_elements(p.ingredients) i
  join _f c on c.rid <> p.rid
           and c.k = lower(btrim(regexp_replace(replace(replace(replace(coalesce(i->>'nom', ''), '’', ''''), '‘', ''''), '-', ' '), '\s+', ' ', 'g')));

  -- 2. Plats de la carte : fiches qu'aucune autre n'utilise
  create temp table _racines on commit drop as
  select f.pid, f.rid, f.nom, f.k from _f f where not exists (select 1 from _e e where e.child = f.rid);

  -- 3. La carte imprimée (dans l'ordre du document)
  create temp table _carte (rubrique text, nom text) on commit drop;
  insert into _carte values
    ('Les entrées', 'Escargots grillés au beurre persillé'),
    ('Les entrées', 'Cappuccino de cèpes'),
    ('Les entrées', 'Salade mêlée de saison'),
    ('Les entrées', 'Langoustines rôties'),
    ('À partager', 'Foie gras de canard mi-cuit Woodland'),
    ('À partager', 'Œuf cocotte au fromage d''Ayent 9 mois d''affinage'),
    ('À partager', 'Supplément truffe'),
    ('À partager', 'Huîtres creuses, par 6'),
    ('À partager', 'Planchette valaisanne'),
    ('À partager', 'Caviar suisse, 30 g'),
    ('À partager', 'Caviar suisse, 50 g'),
    ('Les plats', 'Entrecôte grillée, 220 g'),
    ('Les plats', 'Burger hivernal'),
    ('Les plats', 'Supplément foie gras'),
    ('Les plats', 'Gnocchis de châtaigne'),
    ('Les plats', 'Cabillaud confit basse température'),
    ('Les plats', 'Risotto aux champignons'),
    ('À partager', 'Blanquette de volaille jaune'),
    ('À partager', 'Saucisse de porc grillée'),
    ('À partager', 'Poitrine d''agneau confite 48 h'),
    ('À partager', 'Fondue viande, filet de bœuf'),
    ('À partager', 'Fondue viande, bœuf assaisonné'),
    ('À partager', 'Fondue de fromage traditionnelle'),
    ('À partager', 'Fondue de fromage à la truffe'),
    ('À partager', 'Fondue de fromage aux cèpes et ail confit'),
    ('Les desserts', 'Cookie géant à partager… ou pas'),
    ('Les desserts', 'Brioche perdue'),
    ('Les desserts', 'Meringue double crème, traditionnelle'),
    ('Les desserts', 'Meringue double crème, orange sanguine et clémentine'),
    ('Les desserts', 'Meringue double crème, fruits rouges'),
    ('Les desserts', 'Coupe hivernale'),
    ('Les desserts', 'Assortiment de fromages'),
    ('Les desserts', 'Boule de glace'),
    ('Les desserts', 'Supplément alcool'),
    ('Sur réservation', 'Plateau de fruits de mer'),
    ('Sur réservation', 'Homard bleu entier grillé'),
    ('Sur réservation', 'Chapon des fêtes rôti');

  select string_agg(x, ' ; ') into v_ecart from (
    select 'hors carte : ' || r.nom x from _racines r
    where not exists (select 1 from _carte c where lower(btrim(regexp_replace(replace(replace(replace(c.nom, '’', ''''), '‘', ''''), '-', ' '), '\s+', ' ', 'g'))) = r.k)
    union all
    select 'sans fiche racine : ' || c.nom from _carte c
    where not exists (select 1 from _racines r where r.k = lower(btrim(regexp_replace(replace(replace(replace(c.nom, '’', ''''), '‘', ''''), '-', ' '), '\s+', ' ', 'g'))))
  ) e;
  if v_ecart is not null then
    raise exception 'Plats déduits différents de la carte imprimée : %', v_ecart;
  end if;

  -- 4. Chaque plat et ses sous-fiches à toute profondeur
  create temp table _c on commit drop as
  with recursive c(root, rid, prof) as (
    select rid, rid, 0 from _racines
    union
    select c.root, e.child, c.prof + 1 from c join _e e on e.parent = c.rid where c.prof < 10
  )
  select root, rid, min(prof) prof from c group by root, rid;

  select count(*) into n_racines from _racines;
  select count(*) into n_sous from _f where rid not in (select rid from _racines);
  select count(*) into n_orph from _f f where not exists (select 1 from _c c where c.rid = f.rid);
  select max(prof) into n_prof from _c;
  if n_racines <> 37 or n_sous <> 67 or n_orph <> 0 or n_prof >= 10 then
    raise exception 'Graphe inattendu : % plats, % sous-fiches, % fiches sans plat, profondeur %', n_racines, n_sous, n_orph, n_prof;
  end if;

  -- 5. Plats de sous-fiche à supprimer : servis nulle part ailleurs
  create temp table _suppr on commit drop as
  select pid from _f where rid not in (select rid from _racines);

  select (select count(*) from public.caisse_boutons where plat_id in (select pid from _suppr))
       + (select count(*) from public.caisse_lignes where plat_id in (select pid from _suppr))
       + (select count(*) from public.carte_plats where plat_id in (select pid from _suppr) and carte_id <> v_carte)
       + (select count(*) from public.plat_recettes where plat_id in (select pid from _suppr)
            and recette_id not in (select rid from _f))
    into n_refs;
  if n_refs <> 0 then
    raise exception 'Des plats de sous-fiche servent ailleurs (caisse, autre carte, autre fiche) : % références', n_refs;
  end if;

  -- 6. Sauvegarde des lignes supprimées (hors public, aucun droit de l'API)
  create table sauvegarde.carte_hiver_20261120_plats as
    select * from public.plats where id in (select pid from _suppr);
  create table sauvegarde.carte_hiver_20261120_carte_plats as
    select * from public.carte_plats where plat_id in (select pid from _suppr);
  create table sauvegarde.carte_hiver_20261120_plat_recettes as
    select * from public.plat_recettes where plat_id in (select pid from _suppr);

  -- 7. Sous-fiches rangées dans leurs plats
  insert into public.plat_recettes (plat_id, recette_id, role, ordre)
  select r.pid, c.rid, 'composant', c.prof
  from _c c join _racines r on r.rid = c.root
  where c.prof > 0
  on conflict (plat_id, recette_id) do nothing;
  get diagnostics n_liens = row_count;

  -- 8. Plats de sous-fiche retirés (carte_plats et plat_recettes suivent en cascade)
  delete from public.plats where id in (select pid from _suppr);
  get diagnostics n_suppr = row_count;

  -- 9. Contrôle de l'état final
  select count(*) into n_plats_fin from public.carte_plats where carte_id = v_carte;
  select count(*), md5(string_agg(r.nom || '>' || f.nom, E'\n' order by r.nom collate "C", f.nom collate "C"))
    into n_liens_fin, v_md5
  from public.carte_plats cp
  join _racines r on r.pid = cp.plat_id
  join public.plat_recettes pr on pr.plat_id = cp.plat_id
  join public.recettes f on f.id = pr.recette_id
  where cp.carte_id = v_carte;

  if n_plats_fin <> 37 or n_suppr <> 67 or n_liens_fin <> 37 + n_liens
     or exists (select 1 from _f f where not exists (
          select 1 from public.plat_recettes pr join public.carte_plats cp on cp.plat_id = pr.plat_id
          where cp.carte_id = v_carte and pr.recette_id = f.rid)) then
    raise exception 'État final inattendu : % plats, % supprimés, % liens', n_plats_fin, n_suppr, n_liens_fin;
  end if;

  v_rapport := format('plats %s, sous-fiches %s, liens ajoutés %s, plats supprimés %s, liens finaux %s, md5 %s',
                      n_plats_fin, n_sous, n_liens, n_suppr, n_liens_fin, v_md5);

  if not v_appliquer then
    raise exception using errcode = 'ES007', message = 'ESSAI A BLANC, tout est annulé : ' || v_rapport;
  end if;
  raise notice 'APPLIQUÉ : %', v_rapport;
end
$run$;
