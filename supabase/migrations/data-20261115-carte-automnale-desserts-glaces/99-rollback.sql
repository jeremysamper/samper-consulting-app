-- Retour arrière de 01-apply.sql, depuis les tables du schéma sauvegarde.
-- Le front qui lit `supplements` ignore une clé absente : il peut rester en ligne.

begin;

delete from public.carte_plats where plat_id like 'wl-auto-glace-%'
  or plat_id in ('wl-auto-fromages', 'wl-auto-coupe-danemark', 'wl-auto-supp-alcool');
delete from public.plat_recettes where plat_id = 'wl-auto-coupe-danemark';
delete from public.caisse_boutons where etablissement_id = 'etab-2' and plat_id = 'wl-auto-supp-alcool';
delete from public.plats where id like 'wl-auto-glace-%'
  or id in ('wl-auto-fromages', 'wl-auto-coupe-danemark', 'wl-auto-supp-alcool');
delete from public.recettes where id in ('rec-1794765600000-12001', 'rec-1794765600000-12002');

update public.plats p set prix_vente = s.prix_vente, updated_at = s.updated_at
from sauvegarde.desserts_20261115_plats s where s.id = p.id;

delete from public.caisse_categories c where c.etablissement_id = 'etab-2'
  and not exists (select 1 from sauvegarde.desserts_20261115_caisse_categories s where s.id = c.id);
update public.caisse_categories c set ordre = s.ordre, updated_at = s.updated_at
from sauvegarde.desserts_20261115_caisse_categories s where s.id = c.id;

update public.caisse_reglages r set config = s.config, updated_at = s.updated_at
from sauvegarde.desserts_20261115_caisse_reglages s where s.etablissement_id = r.etablissement_id;

commit;
