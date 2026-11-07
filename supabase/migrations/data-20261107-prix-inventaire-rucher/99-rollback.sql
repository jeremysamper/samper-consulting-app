-- Remet les lignes et la valeur totale sauvegardées avant la mise à jour du 07.11.2026.
-- Attention : écrase toute modification faite depuis sur cet inventaire.
update public.inventaires i
   set lignes = s.lignes, valeur_totale = s.valeur_totale
  from sauvegarde.inventaires_rucher_prix_20261107 s
 where i.id = s.id and i.id = 'inv-1792997751713';
