-- ════════════════════════════════════════════════════════════════════════════
-- 20261029_achats_documents_tva : taux et montant de TVA sur les pièces d'achat
-- (lot LC, comptabilité v1, 29.10.2026).
--
-- Additive et rejouable : deux colonnes nullables sur achats_documents, rien
-- d'autre. Le front déployé avant cette migration ne les lit pas et ne les
-- envoie pas (un upsert PostgREST n'écrit que les colonnes présentes dans la
-- charge utile) ; le front qui les lit les trouve NULL tant qu'aucune lecture
-- ne les a posées, et affiche alors « taux non lu ».
--
-- Pas de contrainte de valeur sur le taux : un taux étranger (TVA d'un
-- fournisseur hors Suisse) reste saisissable. Le déclencheur
-- achats_documents_garde_reglement (migration 20261007) ne regarde que les
-- colonnes regle_* et, sur une facture réglée, total_ttc, date_echeance et
-- date_document : les deux colonnes ci-dessous passent sans droit particulier,
-- comme total_ht aujourd'hui. L'écran réserve la correction du taux au droit de
-- régler les factures ; la garde en base de ces deux colonnes sur une facture
-- réglée (revue SQL du 29.10.2026, point A), l'index sur fournisseur_id (point
-- E) et une borne sur le taux (point F) sont notés pour le lot sécurité, hors
-- de ce lot qui ne pose que les colonnes.
--
-- Rollback : 20261029_achats_documents_tva.rollback.sql, à côté.
-- ════════════════════════════════════════════════════════════════════════════

-- Le verrou de l'alter est bref, mais il ferait la queue derrière une
-- transaction longue et figerait l'onglet Achats pendant le service : on
-- préfère échouer et rejouer plus tard.
set local lock_timeout = '5s';

alter table public.achats_documents
  add column if not exists tva_taux    numeric null,
  add column if not exists montant_tva numeric null;

comment on column public.achats_documents.tva_taux is
  'Taux de TVA de la pièce, en pour cent (2.6 alimentaire, 8.1 normal, 3.8 hébergement, 0 exonéré, ou taux étranger). Lu par l''IA à l''import, corrigeable avec le droit manage:factures_achat. NULL = non lu.';
comment on column public.achats_documents.montant_tva is
  'Montant de TVA en CHF : total_ttc moins total_ht quand les deux sont connus, sinon déduit du taux et du total lu. NULL = non calculable.';
