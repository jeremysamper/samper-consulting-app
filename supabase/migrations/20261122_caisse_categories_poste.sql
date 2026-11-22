-- ════════════════════════════════════════════════════════════════════════════
-- Caisse : poste de cuisine d'une categorie de caisse (lot L4, passe KDS).
--
--   caisse_categories.poste : chaud, froid, patisserie, bar, ou null (aucun).
--   Le KDS en tire des onglets de poste : un plat de la caisse prend le poste
--   de la categorie ou la grille le range. Un plat sans poste (categorie sans
--   poste, libelle libre, plat Lightspeed) ne se voit que dans « Tous ».
--
-- Droits : ceux des categories (v4). Lecture pour tout membre de
-- l'etablissement, ecriture pour consultant, patron et resp_cuisine par les
-- politiques existantes, qui valent pour toute la ligne : rien a ajouter.
--
-- Migration additive (expand), idempotente, sans aucune donnee ecrite : une
-- colonne nullable sans defaut, donc aucune reecriture de la table. Le front
-- deja en ligne lit les categories par select('*') et ignore la colonne.
-- Retour arriere : 20261122_caisse_categories_poste.rollback.sql.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.caisse_categories
  add column if not exists poste text;

alter table public.caisse_categories drop constraint if exists caisse_categories_poste_check;
alter table public.caisse_categories add constraint caisse_categories_poste_check
  check (poste is null or poste in ('chaud', 'froid', 'patisserie', 'bar'));

comment on column public.caisse_categories.poste is
  'Poste de cuisine de la categorie (chaud, froid, patisserie, bar) ou null : onglets de poste du KDS.';
