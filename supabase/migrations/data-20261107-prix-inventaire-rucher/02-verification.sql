-- Relu le 07.11.2026 : sans_prix 0, lignes_changees 117, autres_champs_changes 0,
-- md5_maj d29820b882b675e930e572119546303e, valeur_totale 6264.39 (4414.25 avant).
select i.valeur_totale,
 (select count(*) from jsonb_array_elements(i.lignes) e where coalesce((e->>'prixUnit')::numeric,0)=0) sans_prix,
 (select count(*) from jsonb_array_elements(i.lignes) e join jsonb_array_elements(s.lignes) e0 on e0->>'id'=e->>'id' where e0 is distinct from e) lignes_changees,
 (select count(*) from jsonb_array_elements(i.lignes) e join jsonb_array_elements(s.lignes) e0 on e0->>'id'=e->>'id'
   where (e0 - 'prixUnit' - 'valeur' - 'ecartValeur') is distinct from (e - 'prixUnit' - 'valeur' - 'ecartValeur')) autres_champs_changes,
 s.valeur_totale total_avant
from inventaires i, sauvegarde.inventaires_rucher_prix_20261107 s where i.id='inv-1792997751713';
