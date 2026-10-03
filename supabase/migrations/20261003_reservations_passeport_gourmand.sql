-- ════════════════════════════════════════════════════════════════════════════
-- Réservations : client venu avec le Passeport gourmand
-- ───────────────────────────────────────────────────────────────────────────
-- Demande de Jérémy (03.10.2026) : un bouton « Passeport gourmand » sur la
-- réservation, qui encadre la réservation en vert dans l'agenda. L'équipe
-- voit d'un coup d'œil, avant le service, les tables qui viennent avec le
-- passeport (offre à appliquer à l'addition).
--
-- Une colonne booléenne et non un tag : c'est un état oui / non que l'agenda
-- lit pour colorer, pas un texte libre qu'on aurait à reconnaître.
--
-- Migration additive (expand) : colonne NOT NULL avec défaut, donc les lignes
-- existantes, la réservation en ligne (RPC resa_reserver_en_ligne) et le
-- front déjà déployé continuent sans rien savoir d'elle. Aucune politique
-- touchée : l'écriture suit la RLS existante de reservations
-- (user_peut_gerer('previsions', …)). Idempotente. Rollback en fin.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.reservations
  add column if not exists passeport_gourmand boolean not null default false;

comment on column public.reservations.passeport_gourmand is
  'Client venu avec le Passeport gourmand : la réservation est encadrée en vert dans l''agenda.';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin, APRÈS le retrait du front qui
-- l'écrit) :
--
--   alter table public.reservations drop column if exists passeport_gourmand;
-- ════════════════════════════════════════════════════════════════════════════
