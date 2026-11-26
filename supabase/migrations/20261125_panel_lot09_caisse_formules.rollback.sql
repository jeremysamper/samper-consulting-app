-- Rollback du lot 09 du panel (20261125_panel_lot09_caisse_formules.sql).
-- À jouer après le retour du front d'avant : le front du lot lit
-- caisse_formules et les colonnes formule_* de caisse_lignes.
-- Les lignes déjà posées par une formule restent sur leurs tickets, au prix
-- réparti, comme des lignes ordinaires : seule leur mention de formule part
-- avec les colonnes. À jouer hors service.
begin;

drop trigger if exists trg_caisse_ligne_garde_formule on public.caisse_lignes;
drop function if exists public.caisse_ligne_garde_formule();

drop function if exists public.caisse_poser_formule(uuid, uuid, jsonb, uuid);
drop function if exists public.caisse_retirer_formule(uuid, uuid);

drop index if exists public.idx_caisse_lignes_formule_groupe;
drop index if exists public.idx_caisse_lignes_formule_id;
alter table public.caisse_lignes drop constraint if exists caisse_lignes_formule_paire;
alter table public.caisse_lignes drop column if exists formule_nom;
alter table public.caisse_lignes drop column if exists formule_groupe;
alter table public.caisse_lignes drop column if exists formule_id;

drop table if exists public.caisse_formules;
drop function if exists public.caisse_formule_garde();

commit;
