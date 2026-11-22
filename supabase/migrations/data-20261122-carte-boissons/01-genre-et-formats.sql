-- ════════════════════════════════════════════════════════════════════════════
-- Carte des boissons, lot A, données (22.11.2026). À jouer après
-- 20261122_carte_boissons_formats.sql.
--
-- 1. genre = 'boissons' sur les 6 cartes de boissons du brief (D3) : cinq au
--    Rucher (etab-1777157340476), la Carte des vins de Woodland (etab-2). Le
--    front en ligne ignore la colonne : rien ne bouge à l'écran.
-- 2. Formats des 48 vins de Woodland (wl-vin-01 à wl-vin-48, etab-2), tirés
--    de briefs/2026-11-22-carte-boissons-woodland-formats.json (73 formats).
--    Les prix de vente des vins ne changent pas.
--
-- Une seule instruction (un bloc DO) : tout ou rien. Refus si une carte n'a
-- pas l'établissement, le nom ou le nombre de plats attendus, ou si l'un des
-- 48 vins manque à la Carte des vins de Woodland. Inerte au rejeu : une
-- carte déjà en boissons n'est pas réécrite, un vin qui a déjà des formats
-- n'en reçoit aucun. Généré par faire-donnees.mjs (banc du lot A).
-- Retour arrière : 99-rollback.sql.
-- ════════════════════════════════════════════════════════════════════════════
do $donnees$
declare
  v_n       int;
  v_cartes  int;
  v_formats int;
begin
  -- 1. Les cartes
  with attendu(id, etablissement_id, nom, n_plats) as (values
      ('carte-1782730504404-8818', 'etab-1777157340476', 'Beverage', 17),
      ('carte-1785013828432-d0da', 'etab-1777157340476', 'Carte des spiritueux', 18),
      ('carte-1785013801020-36ui', 'etab-1777157340476', 'Carte des vins DTD', 13),
      ('carte-1785014354543-5xdn', 'etab-1777157340476', 'Carte des vins Premium', 15),
      ('carte-1785014614127-g8s0', 'etab-1777157340476', 'Carte des vins dégustations', 5),
      ('carte-woodland-vins', 'etab-2', 'Carte des vins', 48)
  )
  select count(*) into v_n
    from attendu a
    join public.cartes c on c.id = a.id and c.etablissement_id = a.etablissement_id and c.nom = a.nom
   where (select count(*) from public.carte_plats cp where cp.carte_id = a.id) = a.n_plats;
  if v_n <> 6 then
    raise exception 'donnees boissons : % cartes conformes sur 6', v_n;
  end if;

  with attendu(id, etablissement_id, nom, n_plats) as (values
      ('carte-1782730504404-8818', 'etab-1777157340476', 'Beverage', 17),
      ('carte-1785013828432-d0da', 'etab-1777157340476', 'Carte des spiritueux', 18),
      ('carte-1785013801020-36ui', 'etab-1777157340476', 'Carte des vins DTD', 13),
      ('carte-1785014354543-5xdn', 'etab-1777157340476', 'Carte des vins Premium', 15),
      ('carte-1785014614127-g8s0', 'etab-1777157340476', 'Carte des vins dégustations', 5),
      ('carte-woodland-vins', 'etab-2', 'Carte des vins', 48)
  )
  update public.cartes c set genre = 'boissons'
    from attendu a
   where c.id = a.id and c.genre is distinct from 'boissons';
  get diagnostics v_cartes = row_count;

  -- 2. Les formats des vins de Woodland
  drop table if exists pg_temp._formats_woodland;
  create temp table _formats_woodland (plat_id text, libelle text, prix numeric(10,2), ordre int) on commit drop;
  insert into _formats_woodland (plat_id, libelle, prix, ordre) values
      ('wl-vin-01', '1 dl', 3.50, 1),
      ('wl-vin-01', '50 cl', 17.00, 3),
      ('wl-vin-02', '75 cl', 35.00, 4),
      ('wl-vin-03', '37,5 cl', 12.00, 2),
      ('wl-vin-04', '1 dl', 4.00, 1),
      ('wl-vin-04', '50 cl', 20.00, 3),
      ('wl-vin-05', '75 cl', 42.00, 4),
      ('wl-vin-06', '1 dl', 7.00, 1),
      ('wl-vin-06', '75 cl', 49.00, 4),
      ('wl-vin-07', '1 dl', 7.00, 1),
      ('wl-vin-07', '75 cl', 49.00, 4),
      ('wl-vin-08', '75 cl', 60.00, 4),
      ('wl-vin-09', '50 cl', 50.00, 3),
      ('wl-vin-10', '1 dl', 6.00, 1),
      ('wl-vin-10', '75 cl', 45.00, 4),
      ('wl-vin-11', '1 dl', 7.00, 1),
      ('wl-vin-11', '75 cl', 49.00, 4),
      ('wl-vin-12', '1 dl', 6.00, 1),
      ('wl-vin-12', '75 cl', 45.00, 4),
      ('wl-vin-13', '1 dl', 7.00, 1),
      ('wl-vin-13', '75 cl', 49.00, 4),
      ('wl-vin-14', '75 cl', 49.00, 4),
      ('wl-vin-15', '1 dl', 4.00, 1),
      ('wl-vin-15', '50 cl', 20.00, 3),
      ('wl-vin-15', '75 cl', 35.00, 4),
      ('wl-vin-16', '1 dl', 3.50, 1),
      ('wl-vin-16', '50 cl', 17.00, 3),
      ('wl-vin-17', '1 dl', 3.50, 1),
      ('wl-vin-17', '50 cl', 17.00, 3),
      ('wl-vin-18', '75 cl', 39.00, 4),
      ('wl-vin-19', '1 dl', 6.00, 1),
      ('wl-vin-19', '50 cl', 30.00, 3),
      ('wl-vin-19', '75 cl', 45.00, 4),
      ('wl-vin-20', '75 cl', 45.00, 4),
      ('wl-vin-21', '75 cl', 49.00, 4),
      ('wl-vin-22', '1 dl', 8.00, 1),
      ('wl-vin-22', '75 cl', 69.00, 4),
      ('wl-vin-23', '75 cl', 69.00, 4),
      ('wl-vin-24', '75 cl', 69.00, 4),
      ('wl-vin-25', '1 dl', 8.00, 1),
      ('wl-vin-25', '75 cl', 69.00, 4),
      ('wl-vin-26', '75 cl', 69.00, 4),
      ('wl-vin-27', '1 dl', 8.00, 1),
      ('wl-vin-27', '50 cl', 49.00, 3),
      ('wl-vin-27', '75 cl', 69.00, 4),
      ('wl-vin-28', '75 cl', 55.00, 4),
      ('wl-vin-29', '75 cl', 75.00, 4),
      ('wl-vin-30', '1 dl', 8.00, 1),
      ('wl-vin-30', '50 cl', 45.00, 3),
      ('wl-vin-30', '75 cl', 65.00, 4),
      ('wl-vin-31', '75 cl', 59.00, 4),
      ('wl-vin-32', '75 cl', 45.00, 4),
      ('wl-vin-33', '75 cl', 90.00, 4),
      ('wl-vin-34', '50 cl', 40.00, 3),
      ('wl-vin-34', '75 cl', 59.00, 4),
      ('wl-vin-35', '50 cl', 30.00, 3),
      ('wl-vin-35', '75 cl', 45.00, 4),
      ('wl-vin-36', '75 cl', 79.00, 4),
      ('wl-vin-37', '75 cl', 75.00, 4),
      ('wl-vin-38', '75 cl', 35.00, 4),
      ('wl-vin-39', '75 cl', 49.00, 4),
      ('wl-vin-40', '75 cl', 45.00, 4),
      ('wl-vin-41', '75 cl', 69.00, 4),
      ('wl-vin-42', '1 dl', 8.00, 1),
      ('wl-vin-42', '37,5 cl', 21.00, 2),
      ('wl-vin-42', '75 cl', 45.00, 4),
      ('wl-vin-43', '75 cl', 90.00, 4),
      ('wl-vin-44', '75 cl', 79.00, 4),
      ('wl-vin-45', '75 cl', 180.00, 4),
      ('wl-vin-46', '1 dl', 7.00, 1),
      ('wl-vin-46', '75 cl', 45.00, 4),
      ('wl-vin-47', '75 cl', 45.00, 4),
      ('wl-vin-48', '75 cl', 45.00, 4);

  select count(distinct f.plat_id) into v_n
    from _formats_woodland f
    join public.plats p on p.id = f.plat_id and p.etablissement_id = 'etab-2'
   where exists (select 1 from public.carte_plats cp where cp.plat_id = p.id and cp.carte_id = 'carte-woodland-vins');
  if v_n <> 48 or (select count(*) from _formats_woodland) <> 73 then
    raise exception 'donnees boissons : % vins trouves sur 48', v_n;
  end if;

  insert into public.plat_formats (plat_id, etablissement_id, libelle, prix, ordre)
  select f.plat_id, 'etab-2', f.libelle, f.prix, f.ordre
    from _formats_woodland f
   where not exists (select 1 from public.plat_formats x where x.plat_id = f.plat_id);
  get diagnostics v_formats = row_count;
  drop table _formats_woodland;

  raise notice 'donnees boissons : % cartes passees en boissons, % formats poses', v_cartes, v_formats;
end $donnees$;
