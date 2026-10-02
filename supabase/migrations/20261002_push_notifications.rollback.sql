-- Inverse de 20261002_push_notifications.sql
drop trigger if exists push_nouvelle_resa on public.reservations;
drop function if exists public.push_nouvelle_resa();
drop table if exists public.push_abonnements;
drop table if exists public.push_config;
-- pg_net laissé en place (extension sans effet si personne ne l'appelle).
