-- ============================================================================
-- Caisse v6b - purge automatique des tickets de test : la tache planifiee.
--
-- A appliquer APRES 20261110_caisse_v6.sql (qui cree la fonction appelee).
--
-- pg_cron n'etait pas installe sur le projet (releve du 10.11.2026) : ce
-- fichier l'active, puis planifie un seul travail, toutes les heures a la
-- minute 7 : public.caisse_purger_tests_auto(), qui supprime les tickets de
-- test de plus de 24 heures (lignes, paiements et bons de cuisine de test
-- compris) et en laisse une ligne au journal du mode test. Toutes les heures
-- plutot qu'une fois par jour : un ticket de test ne vit jamais plus de 25
-- heures, et la requete ne lit que l'index des tickets de test.
--
-- La purge n'attend pas cette tache : chaque entree en mode test purge deja
-- les tests de plus de 24 heures de la maison (caisse_test_entrer). La tache
-- couvre les maisons qui ne reviennent pas en mode test.
--
-- Idempotent : cron.schedule avec un nom remplace le travail du meme nom.
--
-- A verifier apres application, et pas seulement a la creation : une ligne
-- dans cron.job ne prouve aucune execution. Attendre la minute 7 suivante,
-- puis :
--   select j.jobname, d.status, d.return_message, d.start_time
--     from cron.job j
--     left join cron.job_run_details d on d.jobid = j.jobid
--    where j.jobname = 'caisse-purge-tests'
--    order by d.start_time desc nulls last limit 5;
-- Si aucune execution n'apparait, relancer le planificateur :
--   select cron.alter_job((select jobid from cron.job where jobname = 'caisse-purge-tests'), schedule := '7 * * * *');
--
-- ROLLBACK :
--   select cron.unschedule('caisse-purge-tests');
--   -- l'extension reste : la retirer seulement si aucun autre travail n'existe
--   --   (select count(*) from cron.job), par : drop extension pg_cron;
-- ============================================================================

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'caisse-purge-tests',
  '7 * * * *',
  $$select public.caisse_purger_tests_auto()$$
);
