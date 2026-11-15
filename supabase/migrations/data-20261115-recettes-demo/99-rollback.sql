-- Annule l'import du 15.11.2026 dans l'établissement Démo (etab-1781452861459).
-- Avant de jouer : vérifier qu'aucun plat de Démo ne pointe vers ces fiches (plat_recettes).
begin;

delete from public.recettes r
using sauvegarde.recettes_demo_import_20261115 s
where s.action = 'import'
  and r.id = s.id
  and r.etablissement_id = 'etab-1781452861459';

update public.recettes r
set categorie = s.categorie_avant
from sauvegarde.recettes_demo_import_20261115 s
where s.action = 'categorie'
  and r.id = s.id
  and r.etablissement_id = 'etab-1781452861459';

commit;
