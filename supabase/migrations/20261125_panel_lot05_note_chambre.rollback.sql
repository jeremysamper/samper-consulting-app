-- Rollback du lot 05 du panel (20261125_panel_lot05_note_chambre.sql).
-- À jouer après le retour du front d'avant : le front du lot lit
-- sejour_lignes.origine (Comptabilité, note de séjour).
-- Les lignes déjà portées restent sur les notes, comme des extras saisis à la
-- main : leur origine part avec la colonne.
begin;

drop function if exists public.sejour_porter_ticket(uuid, uuid);
drop function if exists public.sejour_tickets_a_porter(text);
drop function if exists public.sejour_reports_verifier(uuid);

drop trigger if exists trg_sejour_lignes_origine_garde on public.sejour_lignes;
drop function if exists public.sejour_lignes_origine_garde();

drop index if exists public.uq_sejour_lignes_origine;

alter table public.sejour_lignes drop constraint if exists sejour_lignes_origine_paire;
alter table public.sejour_lignes drop constraint if exists sejour_lignes_origine_connue;
alter table public.sejour_lignes drop column if exists origine_id;
alter table public.sejour_lignes drop column if exists origine;

commit;
