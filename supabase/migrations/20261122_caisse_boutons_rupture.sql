-- ════════════════════════════════════════════════════════════════════════════
-- Caisse : un produit en rupture pour la journée (lot L2, 22.11.2026).
--
-- caisse_boutons.rupture_le : le jour de Zurich où le produit a été mis en
-- rupture. Le produit est en rupture tant que rupture_le vaut aujourd'hui à
-- Zurich ; il redevient disponible tout seul le lendemain, sans écriture.
-- « Remettre en vente » repasse la colonne à null. La règle vit dans
-- src/modules/caisse/rupture.js (fonction pure, testée) ; la commande par QR
-- (lot L3) la relira côté serveur avec (now() at time zone 'Europe/Zurich')::date.
--
-- Expand seul : colonne nullable, sans défaut. Le front en ligne n'en sait
-- rien : ses upserts ne nomment que leurs colonnes et ne l'effacent jamais.
-- RLS inchangée : lecture pour tout membre de l'établissement, écriture
-- réservée à consultant, patron et resp_cuisine (policies de caisse_boutons).
-- La table est déjà publiée en temps réel : toutes les caisses ouvertes
-- relisent la grille à chaque changement.
--
-- Idempotente (add column if not exists). Inverse :
-- 20261122_caisse_boutons_rupture.rollback.sql
-- ════════════════════════════════════════════════════════════════════════════

alter table public.caisse_boutons add column if not exists rupture_le date;

comment on column public.caisse_boutons.rupture_le is
  'Jour de Zurich de la mise en rupture : en rupture tant que la valeur vaut aujourd''hui à Zurich, null sinon.';
