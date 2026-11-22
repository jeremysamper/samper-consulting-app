-- Inverse de 20261122_caisse_commande_qr.sql. Rejouable.
-- À jouer seulement après le retour du front d'avant (Instant Rollback sur
-- Vercel) : le front du lot L3 lit ces tables et appelle ces fonctions, et la
-- page /commande/<adresse> cesserait de répondre. Les commandes reçues et les
-- réglages du QR sont perdus ; les tickets nés d'une commande acceptée restent
-- des tickets ordinaires (aucune colonne de caisse_tickets n'a été ajoutée).

drop function if exists public.commande_qr_refuser(uuid, text);
drop function if exists public.commande_qr_accepter(uuid);
drop function if exists public.commande_qr_envoyer(text, text, boolean, text, jsonb, text);
drop function if exists public.commande_qr_carte(text);

do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'caisse_commandes_qr'
  ) then
    alter publication supabase_realtime drop table public.caisse_commandes_qr;
  end if;
end $$;

drop table if exists public.caisse_commandes_qr_sources;
drop table if exists public.caisse_commandes_qr;
drop table if exists public.caisse_commande_qr_parametres;

drop function if exists public.caisse_qr_articles(text, uuid[]);
drop function if exists public.caisse_qr_ouvert(jsonb, timestamptz);
drop function if exists public.caisse_qr_plages_valides(jsonb);
