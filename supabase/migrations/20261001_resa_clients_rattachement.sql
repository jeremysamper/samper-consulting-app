-- ════════════════════════════════════════════════════════════════════════════
-- Fichier clients : rattachement des réservations déjà en base (données)
-- ───────────────────────────────────────────────────────────────────────────
-- À appliquer APRÈS 20261001_resa_clients.sql (structure + déclencheur).
--
-- Réécrire le téléphone sur lui-même suffit à passer chaque réservation qui a
-- un e-mail ou un téléphone dans le déclencheur resa_rattacher_client : il
-- retrouve ou crée la fiche, exactement comme pour une nouvelle réservation.
-- Les réservations annulées et les no-shows sont rattachées aussi : ils font
-- partie de l'historique d'un client.
--
-- Rejouable : une réservation déjà rattachée est ignorée. Volume au
-- 01.10.2026 : 28 réservations, 6 avec un contact.
--
-- Retour arrière : update public.reservations set client_id = null;
--                  delete from public.resa_clients; (avant tout usage réel)
-- ════════════════════════════════════════════════════════════════════════════

update public.reservations
   set telephone = telephone
 where client_id is null
   and (nullif(btrim(coalesce(email, '')), '') is not null
        or length(regexp_replace(coalesce(telephone, ''), '\D', '', 'g')) >= 6);
