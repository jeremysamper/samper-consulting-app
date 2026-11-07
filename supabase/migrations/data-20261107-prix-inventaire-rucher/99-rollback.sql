-- Remet les lignes et la valeur totale sauvegardées avant la mise à jour du 07.11.2026.
-- Attention : écrase toute modification faite depuis sur cet inventaire.
update public.inventaires i
   set lignes = s.lignes, valeur_totale = s.valeur_totale
  from sauvegarde.inventaires_rucher_prix_20261107 s
 where i.id = s.id and i.id = 'inv-1792997751713';

-- Boissons (03-boissons.sql) : les deux inventaires.
update public.inventaires i
   set lignes = s.lignes, valeur_totale = s.valeur_totale
  from sauvegarde.inventaires_rucher_boissons_prix_20261107 s
 where i.id = s.id and i.id in ('inv-1792997740029', 'inv-1793627029424');
