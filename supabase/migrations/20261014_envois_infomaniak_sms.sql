-- ════════════════════════════════════════════════════════════════════════════
-- Confirmations de réservation : boîte Infomaniak (SMTP) et SMS par la carte
-- SIM du restaurant
-- ───────────────────────────────────────────────────────────────────────────
-- 1. spa_boites_mail accepte une boîte reliée par adresse et mot de passe
--    (fournisseur 'smtp') en plus de Gmail et Outlook : Infomaniak par défaut
--    (mail.infomaniak.com), ou un autre hébergeur (smtp_hote). Le mot de passe
--    est chiffré par l'Edge Function spa-mailer dans jeton_chiffre, comme les
--    jetons OAuth.
-- 2. sms_passerelles : le téléphone Android du restaurant (carte SIM achetée
--    par le restaurant, appli libre « SMS Gateway for Android »), un par
--    établissement. Le mot de passe de l'appli est chiffré par spa-mailer.
-- Les deux tables restent réservées au service role : RLS active, aucune
-- politique, aucun droit pour anon et authenticated.
--
-- Migration additive (expand) : le spa-mailer en ligne (v10) ne lit pas les
-- nouvelles colonnes et n'écrit jamais 'smtp'. À appliquer AVANT de déployer
-- spa-mailer v11. Idempotente. Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Boîte reliée par mot de passe (SMTP) ─────────────────────────────────
alter table public.spa_boites_mail add column if not exists smtp_hote text;

alter table public.spa_boites_mail drop constraint if exists spa_boites_mail_fournisseur_check;
alter table public.spa_boites_mail add constraint spa_boites_mail_fournisseur_check
  check (fournisseur in ('google', 'microsoft', 'smtp'));

-- Le serveur d'envoi est renseigné pour une boîte SMTP, et seulement pour elle.
-- fournisseur est NOT NULL : l'expression ne vaut jamais NULL.
alter table public.spa_boites_mail drop constraint if exists spa_boites_mail_hote_si_smtp;
alter table public.spa_boites_mail add constraint spa_boites_mail_hote_si_smtp
  check ((fournisseur = 'smtp') = (smtp_hote is not null));

comment on column public.spa_boites_mail.smtp_hote is
  'Serveur d''envoi d''une boîte SMTP (port 465, TLS), ex. mail.infomaniak.com. NULL pour Gmail et Outlook.';
comment on table public.spa_boites_mail is
  'Boîte mail par établissement (Gmail ou Outlook par OAuth, ou SMTP par mot de passe, ex. Infomaniak) pour les e-mails du spa et des réservations. Jetons et mot de passe chiffrés par l''Edge Function spa-mailer ; service role seulement.';

-- ── 2. Passerelle SMS : le téléphone Android du restaurant ──────────────────
create table if not exists public.sms_passerelles (
  etablissement_id text        primary key references public.etablissements(id) on delete cascade,
  serveur          text        not null default 'https://api.sms-gate.app/3rdparty/v1',
  identifiant      text        not null,
  secret_chiffre   text        not null,
  appareil         text,
  statut           text        not null default 'actif' check (statut in ('actif', 'erreur')),
  derniere_erreur  text,
  dernier_envoi_at timestamptz,
  connecte_par     text,
  connecte_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.sms_passerelles enable row level security;
revoke all on public.sms_passerelles from anon, authenticated;

comment on table public.sms_passerelles is
  'Téléphone Android du restaurant qui envoie les SMS de réservation avec sa propre carte SIM (appli SMS Gateway for Android). Mot de passe chiffré par l''Edge Function spa-mailer ; service role seulement.';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin, spa-mailer v10 remis en ligne) :
--   drop table if exists public.sms_passerelles;
--   delete from public.spa_boites_mail where fournisseur = 'smtp';
--   alter table public.spa_boites_mail drop constraint if exists spa_boites_mail_hote_si_smtp;
--   alter table public.spa_boites_mail drop constraint if exists spa_boites_mail_fournisseur_check;
--   alter table public.spa_boites_mail add constraint spa_boites_mail_fournisseur_check
--     check (fournisseur in ('google', 'microsoft'));
--   alter table public.spa_boites_mail drop column if exists smtp_hote;
-- ════════════════════════════════════════════════════════════════════════════
