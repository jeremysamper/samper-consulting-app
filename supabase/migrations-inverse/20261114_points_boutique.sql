-- Inverse de 20261114_points_boutique : à jouer seulement si la production
-- casse. Retire la table du registre de la publication Realtime, les
-- déclencheurs posés sur les tables métier, les fonctions et les quatre tables
-- des points. Les tables métier (HACCP, achats, pertes, inventaires) ne
-- perdent rien : la migration n'y a ajouté que des déclencheurs AFTER.
-- Les points, commandes et cadeaux saisis entre-temps sont perdus : exporter
-- d'abord les quatre tables si le système a été allumé.

do $pub$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'points_mouvements'
  ) then
    alter publication supabase_realtime drop table public.points_mouvements;
  end if;
end $pub$;

drop trigger if exists trg_points_haccp_releves on public.haccp_releves;
drop trigger if exists trg_points_haccp_controls on public.haccp_controls;
drop trigger if exists trg_points_haccp_tracabilite on public.haccp_tracabilite;
drop trigger if exists trg_points_achats_documents on public.achats_documents;
drop trigger if exists trg_points_scans_facture on public.scans_facture;
drop trigger if exists trg_points_pertes on public.pertes;
drop trigger if exists trg_points_saisies_inventaire on public.inventaire_saisies_offline;
drop trigger if exists trg_points_inventaires_ins on public.inventaires;
drop trigger if exists trg_points_inventaires_maj on public.inventaires;
drop trigger if exists trg_points_inventaires_sup on public.inventaires;

drop function if exists public.points_trg_haccp_releves();
drop function if exists public.points_trg_haccp_controls();
drop function if exists public.points_trg_haccp_tracabilite();
drop function if exists public.points_trg_achats_documents();
drop function if exists public.points_trg_scans_facture();
drop function if exists public.points_trg_pertes();
drop function if exists public.points_trg_saisies_inventaire();
drop function if exists public.points_trg_inventaires();

drop function if exists public.points_ajuster(text, text, integer, text);
drop function if exists public.points_traiter_commande(uuid, text, text);
drop function if exists public.points_annuler_commande(uuid);
drop function if exists public.points_commander(uuid);
drop function if exists public.points_regler(text, boolean, text[], text[], jsonb);
drop function if exists public.points_soldes(text);
drop function if exists public.points_solde(text);
drop function if exists public.points_etat(text);
drop function if exists public.points_gere(text);
drop function if exists public.points_crediter(text, text, text, text, text);
drop function if exists public.points_annuler(text, text);
drop function if exists public.points_auteur(text, text);
drop function if exists public.points_bareme_effectif(jsonb);
drop function if exists public.points_regle(jsonb, text);

-- Fonctions qui prennent une ligne d'une table des points en argument :
-- à retirer avant leur table.
drop function if exists public.points_rembourser(public.points_commandes);
drop function if exists public.points_participe(text, text, public.points_reglages);

drop table if exists public.points_commandes;
drop table if exists public.points_cadeaux;
drop table if exists public.points_mouvements;
drop table if exists public.points_reglages;

drop function if exists public.points_cadeaux_touch();
drop function if exists public.points_libelle_action(text);
drop function if exists public.points_roles_defaut();
drop function if exists public.points_bareme_defaut();
