-- ============================================================================
-- Alertes envoyées en notification (L5a)
--
-- alerts-evaluator crée chaque nouvelle instance avec push_etat = 'a_envoyer' ;
-- l'Edge Function notifications (action alertes) la prend puis l'envoie aux
-- appareils abonnés de ses destinataires. push_etat porte l'idempotence : la
-- prise (a_envoyer vers en_cours) ne réussit qu'une fois par instance,
-- même si deux passages du cron se croisent.
--
--   a_envoyer   créée, pas encore traitée
--   en_cours    prise par un envoi (reste ainsi si l'envoi s'interrompt :
--               au plus une notification, jamais deux)
--   envoye      au moins un appareil visé
--   sans_envoi  aucun destinataire abonné, instance close ou périmée, ou
--               recréée juste après un « écarter » du même sujet
--   NULL        instance antérieure à cette migration : jamais notifiée
--
-- Index unique des instances actives par sujet (rule_id, dedupe_key) :
-- createInstanceIfNeeded vérifie puis insère, deux passages simultanés
-- pouvaient créer deux instances du même sujet, donc deux notifications.
-- Relevé du 27.10.2026 : aucune instance active, la création ne peut pas
-- échouer sur un doublon existant.
--
-- Droits : inchangés. authenticated garde l'UPDATE sur status, dismissed_at,
-- dismissed_by seulement (20261027_securite_alert_instances_cloture) : l'app
-- ne peut pas remettre une instance à 'a_envoyer'. Aucune policy INSERT.
--
-- Compatibilité : additive. Le front lit select('*') et ignore les deux
-- colonnes ; l'évaluateur déployé (v4) n'écrit pas push_etat, ses instances
-- restent NULL et ne sont pas notifiées. Appliquer AVANT le déploiement de
-- alerts-evaluator (qui écrit push_etat) et de notifications (qui le lit).
--
-- Idempotent, rejouable.
--
-- ROLLBACK (après avoir redéployé les versions précédentes des deux fonctions) :
--   drop index if exists public.alert_instances_sujet_actif_uniq;
--   drop index if exists public.idx_alert_instances_push_a_envoyer;
--   alter table public.alert_instances drop constraint if exists alert_instances_push_etat_check;
--   alter table public.alert_instances drop column if exists push_at;
--   alter table public.alert_instances drop column if exists push_etat;
-- ============================================================================

-- Table peu volumineuse (78 lignes le 27.10.2026) : verrous brefs ; on
-- abandonne plutôt que de faire attendre la cloche.
set local lock_timeout = '5s';

alter table public.alert_instances
  add column if not exists push_etat text,
  add column if not exists push_at   timestamptz;

alter table public.alert_instances drop constraint if exists alert_instances_push_etat_check;
alter table public.alert_instances
  add constraint alert_instances_push_etat_check
  check (push_etat is null or push_etat in ('a_envoyer', 'en_cours', 'envoye', 'sans_envoi'));

comment on column public.alert_instances.push_etat is
  'Notification push de l''instance : a_envoyer, en_cours, envoye, sans_envoi ; NULL = antérieure à L5a, jamais notifiée.';
comment on column public.alert_instances.push_at is
  'Moment où l''envoi a pris l''instance (passage à en_cours).';

-- Balayage de l'action alertes (notifications).
create index if not exists idx_alert_instances_push_a_envoyer
  on public.alert_instances (created_at)
  where push_etat = 'a_envoyer';

-- Une seule instance active par sujet.
create unique index if not exists alert_instances_sujet_actif_uniq
  on public.alert_instances (rule_id, coalesce(dedupe_key, ''))
  where status = 'active';
