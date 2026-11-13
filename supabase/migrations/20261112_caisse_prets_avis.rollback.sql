-- Inverse de 20261112_caisse_prets_avis.sql
-- Ordre : remettre d'abord en ligne la version precedente de l'Edge Function
-- notifications (sans l'action plats_prets), puis jouer ce fichier, hors
-- service. Le front ne lit ni envoye_par ni caisse_prets_avis : rien d'autre
-- a retirer. Les avis sont ephemeres (purge a 2 jours) : rien a exporter.
-- export_personne garde son "- 'envoye_par'" : sans effet une fois la colonne
-- retiree, rien a rejouer.
set local lock_timeout = '3s';

drop trigger if exists trg_caisse_ligne_pret_avis on public.caisse_lignes;
drop function if exists public.caisse_ligne_pret_avis();
drop trigger if exists trg_caisse_ligne_envoyeur on public.caisse_lignes;
drop function if exists public.caisse_ligne_envoyeur();
drop table if exists public.caisse_prets_avis;
drop index if exists public.idx_caisse_lignes_envoye_par;
alter table public.caisse_lignes drop column if exists envoye_par;
