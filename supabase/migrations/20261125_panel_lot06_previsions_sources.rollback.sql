-- Rollback du lot 06 du panel : retire le module 'previsions' de
-- reglages_modules. Les deux contraintes reprennent leur texte lu en
-- production le 25.11.2026, avant le lot. Valable seulement tant qu'aucun lot
-- postérieur n'a modifié ces deux contraintes.

set local lock_timeout = '3s';

delete from public.reglages_modules where module = 'previsions';

alter table public.reglages_modules
  drop constraint if exists reglages_modules_module_check,
  add constraint reglages_modules_module_check
    check (module in ('pertes', 'groupes', 'mep', 'fiches_salle', 'kds', 'catalogue', 'etages', 'demandes', 'repas', 'journal', 'statistiques')),
  drop constraint if exists reglages_modules_config_check,
  add constraint reglages_modules_config_check
    check (public.reglages_modules_config_valide(module, config)
      or public.reglages_modules_hotel_valide(module, config)
      or public.reglages_modules_bureau_valide(module, config));

drop function if exists public.reglages_modules_previsions_valide(text, jsonb);
