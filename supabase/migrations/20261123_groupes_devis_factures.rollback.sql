-- Retour arrière de 20261123_groupes_devis_factures.sql.
-- Détruit les devis, factures et paiements des groupes saisis depuis : exporter
-- d'abord (Groupes > Devis et factures > Exporter) si des données réelles existent.
do $$
declare
  t text;
begin
  foreach t in array array['groupe_devis', 'groupe_factures', 'groupe_paiements'] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;

drop table if exists public.groupe_paiements;
drop table if exists public.groupe_factures;
drop table if exists public.groupe_devis;
drop table if exists public.groupe_docs_compteurs;
drop table if exists public.facturation_reglages;

drop function if exists public.groupe_paiements_garde();
drop function if exists public.groupe_docs_numeroter();
drop function if exists public.groupe_factures_garde();
drop function if exists public.groupe_devis_garde();
drop function if exists public.groupe_doc_numero(text, text, date);
drop function if exists public.groupe_lignes_total(jsonb);
