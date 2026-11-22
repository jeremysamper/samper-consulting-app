-- Retour arrière de 20261122_lot6b_reglages_hotel.sql.
-- A jouer APRÈS le retour du front à une version qui ne lit ni n'écrit les
-- réglages des modules etages, demandes et repas (Instant Rollback Vercel).
-- Perte : les réglages de ces trois modules (temps de ménage et linge par
-- catégorie, demandes courantes, horaires, heures et carte du room service).
-- Aucune donnée de service n'est touchée.

set local lock_timeout = '3s';

delete from public.reglages_modules where module in ('etages', 'demandes', 'repas');

alter table public.reglages_modules drop constraint if exists reglages_modules_config_check;
alter table public.reglages_modules add constraint reglages_modules_config_check
  check (public.reglages_modules_config_valide(module, config));

alter table public.reglages_modules drop constraint if exists reglages_modules_module_check;
alter table public.reglages_modules add constraint reglages_modules_module_check
  check (module in ('pertes', 'groupes', 'mep', 'fiches_salle', 'kds', 'catalogue'));

drop function if exists public.reglages_modules_hotel_valide(text, jsonb);
drop function if exists public.reglages_plage_valide(jsonb);
