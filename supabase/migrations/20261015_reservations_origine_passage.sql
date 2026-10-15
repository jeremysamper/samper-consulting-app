-- ════════════════════════════════════════════════════════════════════════════
-- Réservations - canal « passage » (client sans réservation)
-- ───────────────────────────────────────────────────────────────────────────
-- origine ne connaissait que 'equipe' (saisie dans l'app) et 'en_ligne' (page
-- /table/<slug>). Le bouton « Client de passage » du plan de salle créait donc
-- ses réservations en 'equipe', et le futur rapport de l'onglet Réservations
-- ne pouvait pas compter les passages à part.
--   • origine accepte 'passage' : réservation créée pour un client arrivé
--     sans réserver (statut 'arrive' d'office côté front).
--
-- Expand seulement : aucune valeur existante ne change, le défaut reste
-- 'equipe', le front déployé n'envoie jamais 'passage'. Les lecteurs de la
-- colonne (push_nouvelle_resa, fonctions notifications et spa-mailer) ne
-- réagissent qu'à 'en_ligne' : un passage ne déclenche rien. Idempotente.
-- Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.reservations drop constraint if exists reservations_origine_check;
alter table public.reservations add constraint reservations_origine_check
  check (origine = any (array['equipe', 'en_ligne', 'passage']));

comment on column public.reservations.origine is
  'equipe = saisie dans l''app ; en_ligne = venue de la page /table/<slug> (statut initial ''demande'' ou ''confirme'' selon le mode) ; passage = client arrivé sans réservation (bouton Passage du mode service, Client de passage du plan de salle).';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin, front sans 'passage' d'abord) :
--
--   update public.reservations set origine = 'equipe' where origine = 'passage';
--   alter table public.reservations drop constraint if exists reservations_origine_check;
--   alter table public.reservations add constraint reservations_origine_check
--     check (origine = any (array['equipe', 'en_ligne']));
--   comment on column public.reservations.origine is
--     'equipe = saisie dans l''app ; en_ligne = venue de la page /table/<slug> (statut initial ''demande'' ou ''confirme'' selon le mode).';
-- ════════════════════════════════════════════════════════════════════════════
