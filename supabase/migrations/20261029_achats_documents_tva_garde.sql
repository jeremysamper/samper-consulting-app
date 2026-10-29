-- ════════════════════════════════════════════════════════════════════════════
-- 20261029_achats_documents_tva_garde : le taux et le montant de TVA d'une
-- pièce d'achat gardés en base (suite du lot LC, point A de la revue SQL du
-- 29.10.2026 sur 20261029_achats_documents_tva, qui doit être appliquée avant).
--
-- Jusqu'ici l'écran seul réservait la correction du taux au droit de régler
-- les factures : par l'API, tout membre de l'établissement pouvait le changer,
-- y compris sur une facture réglée. Désormais :
--   - changer le taux d'une pièce existante demande manage:factures_achat,
--     que la facture soit réglée ou non (seul ce droit le corrige à l'écran) ;
--   - changer le montant de TVA d'une facture réglée demande le même droit,
--     comme son total TTC (déclencheur achats_documents_garde_reglement) ;
--     avant règlement, le montant suit les totaux que l'équipe complète ;
--   - à la création (lecture IA, ouverte à toute l'équipe), rien n'est gardé.
-- Sans utilisateur (éditeur SQL, service role) : pas de garde, comme le
-- déclencheur du règlement. Le total HT d'une facture réglée n'est pas gardé
-- ici (contrat de 20261007 inchangé) : reporté au lot sécurité.
--
-- Borne du taux : 0 à moins de 100 %. Le front d'import ramène toute lecture
-- hors borne à NULL (non lu). Index sur fournisseur_id (clé étrangère sans
-- index depuis 20260928, point E de la même revue).
--
-- Le déclencheur du règlement (20261007) n'est pas modifié : une fonction à
-- part garde le rollback simple. Le front livré juste avant cette migration
-- n'envoie plus le taux ni le montant dans l'upsert d'identité d'une pièce
-- (seulement à la création) ; un front plus ancien qui les renvoie inchangés
-- passe la garde (« is distinct from »).
--
-- Rollback : 20261029_achats_documents_tva_garde.rollback.sql, à côté.
-- ════════════════════════════════════════════════════════════════════════════

-- Verrou bref, mais il ferait la queue derrière une transaction longue.
set local lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'achats_documents' and column_name = 'tva_taux') then
    raise exception 'Prérequis absent : appliquer 20261029_achats_documents_tva avant cette migration.';
  end if;
end $$;

create or replace function public.achats_documents_garde_tva()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  motif text;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.tva_taux is distinct from old.tva_taux then
    motif := 'Seule une personne autorisée à régler les factures peut changer le taux de TVA d''une pièce.';
  elsif old.regle_le is not null and new.montant_tva is distinct from old.montant_tva then
    motif := 'Cette facture est réglée : seule une personne autorisée à régler les factures peut changer son montant de TVA.';
  end if;

  if motif is not null and not coalesce(public.user_peut_gerer('factures_achat', array['consultant', 'patron']), false) then
    raise exception using errcode = '42501', message = motif;
  end if;

  return new;
end;
$$;

revoke all on function public.achats_documents_garde_tva() from public, anon, authenticated;

drop trigger if exists achats_documents_garde_tva on public.achats_documents;
create trigger achats_documents_garde_tva
  before update of tva_taux, montant_tva on public.achats_documents
  for each row execute function public.achats_documents_garde_tva();

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'achats_documents_tva_taux_chk'
                   and conrelid = 'public.achats_documents'::regclass) then
    alter table public.achats_documents
      add constraint achats_documents_tva_taux_chk
      check (tva_taux is null or (tva_taux >= 0 and tva_taux < 100));
  end if;
end $$;

create index if not exists achats_documents_fournisseur_idx
  on public.achats_documents (fournisseur_id);

comment on column public.achats_documents.tva_taux is
  'Taux de TVA de la pièce, en pour cent, de 0 à moins de 100 (2.6 alimentaire, 8.1 normal, 3.8 hébergement, 0 exonéré, ou taux étranger). Lu par l''IA à la création ; ensuite modifiable seulement avec le droit manage:factures_achat (déclencheur achats_documents_garde_tva). NULL = non lu.';
