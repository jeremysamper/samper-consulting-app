-- ============================================================================
-- Modules activés par établissement
--
-- Chaque établissement choisit les modules qui apparaissent dans son menu :
-- un établissement qui ne se sert que de 3 ou 4 modules ne voit plus tous les
-- autres dans la sidebar. Réglé par le consultant dans Paramètres → fiche de
-- l'établissement.
--
-- modules_actifs = liste des clés de permission (moduleConfig.navItems.permKey)
-- affichées pour l'établissement.
--   · NULL  → tous les modules (comportement historique, valeur des lignes
--             existantes : rien ne change tant que le consultant n'a pas choisi).
--   · liste → seuls ces modules, en plus des modules toujours présents côté
--             front (tableau de bord, outils consultant).
--
-- Élargissement pur (expand) : colonne nullable, aucune donnée modifiée. Le
-- front déployé avant elle ne la lit pas ; le front qui la lit reste
-- fonctionnel sans elle (Paramètres n'envoie la colonne que si la ligne la
-- porte). Écriture couverte par la policy existante etabs_write (consultant).
--
-- APPLIQUÉ EN PROD via MCP le 26.09.2026, avant le front : colonne nullable,
-- 7 établissements sur 7 à NULL (aucun changement visible). Miroir repo == prod.
--
-- Ce n'est PAS une barrière de sécurité : la RLS de chaque table reste la
-- seule garde des données. La colonne ne règle que ce qui est proposé à l'écran.
-- ============================================================================

alter table public.etablissements
  add column if not exists modules_actifs text[];

comment on column public.etablissements.modules_actifs is
  'Clés de module (permKey) affichées pour cet établissement. NULL = tous les modules.';
