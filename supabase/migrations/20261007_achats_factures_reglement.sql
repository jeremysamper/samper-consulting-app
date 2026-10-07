-- ════════════════════════════════════════════════════════════════════════════
-- 20261007_achats_factures_reglement
--
-- Onglet « Factures » de l'inventaire (demande de Jérémy, 07.10.2026) : les
-- factures du périmètre rangées par période d'inventaire, le montant à payer,
-- l'échéance, et le règlement marqué par le comptable (une facture ou une
-- sélection).
--
-- Colonnes ajoutées à achats_documents :
--   total_ttc      montant à payer, TVA comprise (lu par l'IA, modifiable)
--   date_echeance  échéance de paiement (lue par l'IA, modifiable)
--   regle_le       date du règlement ; NULL = à régler
--   regle_mode     virement | carte | especes | prelevement
--   regle_note     texte libre (référence du virement...)
--
-- Le droit de régler : clé manage:factures_achat, réglable personne par
-- personne dans Rôles & accès, par défaut consultant et patron. Il vaut en
-- base, pas seulement à l'écran : le déclencheur ci-dessous refuse (42501),
-- à qui n'a pas ce droit, toute pose, modification ou levée de règlement et,
-- une fois la facture réglée (pièce comptable), sa suppression et tout
-- changement de son montant TTC, de son échéance ou de sa date. Le reste
-- (lignes, rattachements, périmètre, type) reste ouvert à l'équipe : l'onglet
-- Achats continue d'y travailler. user_peut_gerer applique la même
-- règle que canManageModule côté front (consultant, écart de la personne,
-- réglage du rôle, rôles par défaut).
--
-- Additive : le front déployé n'envoie aucune de ces colonnes dans son upsert,
-- PostgREST ne les touche donc pas. Le front qui les lit les attend : appliquer
-- cette migration AVANT de le pousser. Idempotente. Rollback :
-- 20261007_achats_factures_reglement.rollback.sql
--
-- APPLIQUÉE en prod le 07.10.2026 (après deux essais à blanc en transaction
-- annulée, tous les cas attendus).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.achats_documents
  add column if not exists total_ttc     numeric null,
  add column if not exists date_echeance date null,
  add column if not exists regle_le      date null,
  add column if not exists regle_mode    text null,
  add column if not exists regle_note    text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'achats_documents_regle_mode_chk') then
    alter table public.achats_documents
      add constraint achats_documents_regle_mode_chk
      check (regle_mode is null or regle_mode in ('virement', 'carte', 'especes', 'prelevement'));
  end if;
  -- Mode et note n'existent qu'avec une date de règlement. Écrit avec des
  -- « is null » seulement : la contrainte ne peut jamais valoir NULL.
  if not exists (select 1 from pg_constraint where conname = 'achats_documents_regle_coherent_chk') then
    alter table public.achats_documents
      add constraint achats_documents_regle_coherent_chk
      check (regle_le is not null or (regle_mode is null and regle_note is null));
  end if;
end $$;

comment on column public.achats_documents.total_ttc is
  'Montant à payer TVA comprise (lu sur la facture, modifiable). NULL = non lu.';
comment on column public.achats_documents.date_echeance is
  'Échéance de paiement (lue sur la facture, modifiable).';
comment on column public.achats_documents.regle_le is
  'Date du règlement. NULL = facture à régler. Écriture réservée au droit manage:factures_achat (déclencheur achats_documents_garde_reglement).';

-- ── Le droit de régler, vérifié en base ──
-- SECURITY INVOKER : user_peut_gerer lit la ligne de l'appelant dans
-- permissions_utilisateurs et la table permissions, comme dans la RLS des
-- réservations. Sans utilisateur (éditeur SQL, service role) : pas de garde,
-- pour les corrections de données. On teste auth.uid() et non le rôle :
-- current_user_role() vaut '' hors session, jamais NULL.
create or replace function public.achats_documents_garde_reglement()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  motif text;
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;

  -- L'INSERT ne regarde que le règlement : un upsert PostgREST passe d'abord
  -- par ici avec la ligne proposée, et le front n'y envoie jamais regle_*.
  if tg_op = 'INSERT' then
    if new.regle_le is not null or new.regle_mode is not null or new.regle_note is not null then
      motif := 'Vous n''avez pas le droit de marquer une facture réglée.';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.regle_le is distinct from old.regle_le
       or new.regle_mode is distinct from old.regle_mode
       or new.regle_note is distinct from old.regle_note then
      motif := 'Vous n''avez pas le droit de marquer une facture réglée.';
    elsif old.regle_le is not null
       and (new.total_ttc is distinct from old.total_ttc
            or new.date_echeance is distinct from old.date_echeance
            or new.date_document is distinct from old.date_document) then
      motif := 'Cette facture est réglée : seule une personne autorisée à régler les factures peut changer son montant, son échéance ou sa date.';
    end if;
  elsif old.regle_le is not null then
    motif := 'Cette facture est réglée : seule une personne autorisée à régler les factures peut la supprimer.';
  end if;

  if motif is not null and not coalesce(public.user_peut_gerer('factures_achat', array['consultant', 'patron']), false) then
    raise exception using errcode = '42501', message = motif;
  end if;

  -- Un DELETE doit rendre OLD, sinon la suppression est annulée en silence.
  return coalesce(new, old);
end;
$$;

revoke all on function public.achats_documents_garde_reglement() from public, anon;

drop trigger if exists achats_documents_garde_reglement on public.achats_documents;
create trigger achats_documents_garde_reglement
  before insert or update or delete on public.achats_documents
  for each row execute function public.achats_documents_garde_reglement();
