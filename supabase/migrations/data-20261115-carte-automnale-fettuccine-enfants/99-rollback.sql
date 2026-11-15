-- Retour arrière de 01-apply.sql, depuis les tables du schéma sauvegarde.

begin;

delete from public.carte_plats where plat_id in (
  'wl-auto-supreme-volaille', 'wl-auto-pigeon-roti', 'wl-auto-enf-poulet', 'wl-auto-enf-bolognaise');
delete from public.plat_recettes where plat_id in (
  'wl-auto-supreme-volaille', 'wl-auto-pigeon-roti', 'wl-auto-enf-poulet', 'wl-auto-enf-bolognaise',
  '26c8d8af-42b1-422b-a62a-753830f4ffb5');
delete from public.plats where id in (
  'wl-auto-supreme-volaille', 'wl-auto-pigeon-roti', 'wl-auto-enf-poulet', 'wl-auto-enf-bolognaise');
delete from public.recettes where id like 'rec-1794765600000-%';

insert into public.plat_recettes select * from sauvegarde.carte_automnale_20261115_plat_recettes;

update public.plats p set nom = s.nom, prix_vente = s.prix_vente, description = s.description,
  ordre = s.ordre, updated_at = s.updated_at
from sauvegarde.carte_automnale_20261115_plats s where s.id = p.id;

update public.recettes r set nom = s.nom, portions = s.portions, prix_vente = s.prix_vente,
  masquee = s.masquee, allergenes_ids = s.allergenes_ids, ingredients = s.ingredients,
  etapes = s.etapes, notes_consultant = s.notes_consultant, updated_at = s.updated_at
from sauvegarde.carte_automnale_20261115_recettes s where s.id = r.id;

commit;
