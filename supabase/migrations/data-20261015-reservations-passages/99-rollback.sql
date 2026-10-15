-- Retour arrière de 01-reclassement.sql : les 3 réservations reviennent en
-- 'equipe', comme dans la sauvegarde
-- App-Web/_sauvegardes-supabase/reservations-passages-avant-20261015.json.
update public.reservations
   set origine = 'equipe'
 where etablissement_id = 'etab-2'
   and id in ('320614aa-1da7-4333-aa18-e7d51181f14f', 'a3490962-a90b-456f-8891-b1133b54bb8d', '378ccf4f-0106-481a-9c0e-a4db1005e5ab')
   and origine = 'passage';
