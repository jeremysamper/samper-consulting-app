-- ════════════════════════════════════════════════════════════════════════════
-- Module Spa - envoi des e-mails depuis la boîte du spa (Gmail ou Outlook)
-- ───────────────────────────────────────────────────────────────────────────
-- Le spa « connecte » sa boîte mail d'un clic (connexion Google ou Microsoft) :
-- confirmations de rendez-vous, bons d'anniversaire et nouvelles partent
-- ensuite de sa propre adresse, et les réponses des clients y arrivent.
-- Resend reste le repli quand aucune boîte n'est connectée.
--
-- Deux tables, réservées à l'Edge Function spa-mailer (service role) :
-- RLS active et AUCUNE politique, le front n'y accède jamais.
--   • spa_boites_mail : la connexion d'un établissement. Le jeton de
--     renouvellement (refresh token) et le jeton d'accès sont CHIFFRÉS par
--     l'Edge Function (AES-GCM) : même une lecture de la table ne permet pas
--     d'envoyer un e-mail au nom du spa.
--   • spa_oauth_etats : l'aller-retour de connexion en cours (jeton « state »
--     à usage unique + vérificateur PKCE), valable 15 minutes.
--
-- Migration additive, idempotente. Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.spa_boites_mail (
  etablissement_id text        primary key references public.etablissements(id) on delete cascade,
  fournisseur      text        not null check (fournisseur in ('google', 'microsoft')),
  adresse          text        not null,
  nom              text,
  jeton_chiffre    text        not null,
  acces_chiffre    text,
  acces_expire_at  timestamptz,
  statut           text        not null default 'actif' check (statut in ('actif', 'erreur')),
  derniere_erreur  text,
  connecte_par     text,
  connecte_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.spa_oauth_etats (
  etat             text        primary key,
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  fournisseur      text        not null check (fournisseur in ('google', 'microsoft')),
  verificateur     text        not null,
  user_id          text,
  created_at       timestamptz not null default now(),
  expire_at        timestamptz not null default (now() + interval '15 minutes')
);

alter table public.spa_boites_mail enable row level security;
alter table public.spa_oauth_etats enable row level security;
revoke all on public.spa_boites_mail from anon, authenticated;
revoke all on public.spa_oauth_etats from anon, authenticated;

comment on table public.spa_boites_mail is
  'Boîte mail connectée (Google ou Microsoft) par établissement pour les e-mails du spa. Jetons chiffrés par l''Edge Function spa-mailer ; service role seulement.';
comment on table public.spa_oauth_etats is
  'Connexions OAuth en cours (state à usage unique + vérificateur PKCE, 15 min). Service role seulement.';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) :
--   drop table if exists public.spa_oauth_etats;
--   drop table if exists public.spa_boites_mail;
-- ════════════════════════════════════════════════════════════════════════════
