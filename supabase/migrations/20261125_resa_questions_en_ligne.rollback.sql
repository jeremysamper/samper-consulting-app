-- Retour arrière de 20261125_resa_questions_en_ligne.sql (lot 18).
-- Les étiquettes déjà posées par le déclencheur ne sont pas retirées :
-- elles restent des étiquettes « autre » ordinaires de leurs réservations.
begin;
set local lock_timeout = '3s';
drop trigger if exists trg_resa_tags_questions_en_ligne on public.reservations;
drop function if exists public.resa_tags_questions_en_ligne();
drop function if exists public.table_en_ligne_questions(text);
alter table public.reservation_en_ligne_parametres drop constraint if exists resa_en_ligne_questions_forme;
alter table public.reservation_en_ligne_parametres drop column if exists questions_en_ligne;
commit;
notify pgrst, 'reload schema';
