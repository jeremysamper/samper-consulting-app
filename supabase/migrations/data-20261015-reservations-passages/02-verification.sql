-- Après 01-reclassement.sql : les 3 lignes sont en 'passage', aucune autre
-- réservation n'a changé de canal.
select
  (select count(*) from public.reservations where origine = 'passage') as total_passage,
  (select count(*) from public.reservations
    where origine = 'passage'
      and id in ('320614aa-1da7-4333-aa18-e7d51181f14f', 'a3490962-a90b-456f-8891-b1133b54bb8d', '378ccf4f-0106-481a-9c0e-a4db1005e5ab')) as passages_vises,
  (select count(*) from public.reservations where etablissement_id = 'etab-2') as total_etab_2;
-- Attendu : total_passage = 3, passages_vises = 3, total_etab_2 inchangé
-- (132 au 15.10.2026 avant l'opération, hors nouvelles réservations).
