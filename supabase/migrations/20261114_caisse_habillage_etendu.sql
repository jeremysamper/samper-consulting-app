-- ============================================================================
-- Caisse : habillage des boutons etendu (28 couleurs, 70 pictos).
--
-- Les listes fermees de couleur et de picto (v3 pour caisse_boutons, v4 pour
-- caisse_categories) deviennent une forme de cle : minuscules, chiffres et
-- tirets, 24 caracteres au plus. La palette (jetons --caisse-* d'app.css) et
-- les pictos (src/modules/caisse/boutons.js) vivent dans le front, qui rend
-- neutre une cle qu'il ne connait pas. Ajouter une couleur ou un picto ne
-- demande donc plus de migration.
--
-- Expand seul : toute valeur permise avant reste permise ; le front deploye
-- n'ecrit que des cles de l'ancienne liste. A appliquer avant le front.
-- Idempotent (drop if exists, puis add).
-- ============================================================================

alter table public.caisse_boutons drop constraint if exists caisse_boutons_couleur_check;
alter table public.caisse_boutons add constraint caisse_boutons_couleur_check
  check (couleur is null or couleur ~ '^[a-z][a-z0-9-]{0,23}$');

alter table public.caisse_boutons drop constraint if exists caisse_boutons_picto_check;
alter table public.caisse_boutons add constraint caisse_boutons_picto_check
  check (picto is null or picto ~ '^[a-z][a-z0-9-]{0,23}$');

alter table public.caisse_categories drop constraint if exists caisse_categories_couleur_check;
alter table public.caisse_categories add constraint caisse_categories_couleur_check
  check (couleur is null or couleur ~ '^[a-z][a-z0-9-]{0,23}$');

alter table public.caisse_categories drop constraint if exists caisse_categories_picto_check;
alter table public.caisse_categories add constraint caisse_categories_picto_check
  check (picto is null or picto ~ '^[a-z][a-z0-9-]{0,23}$');
