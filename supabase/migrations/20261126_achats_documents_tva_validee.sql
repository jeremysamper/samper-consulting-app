-- Factures d'achat : validation « telle quelle » d'une TVA qui ne s'accorde pas.
-- Une facture à plusieurs taux a un HT, un TTC et un taux lus qui ne collent
-- jamais : elle restait « à compléter » pour toujours. La colonne garde le
-- moment où quelqu'un a confirmé que les montants sont justes ; le front la
-- remet à NULL quand le TTC ou le taux change (majFactureAchat).
-- Additive et nullable : le front déployé avant elle ne la lit pas.
alter table public.achats_documents add column if not exists tva_validee_le timestamptz;
comment on column public.achats_documents.tva_validee_le is 'Facture dont HT, TTC et taux ne s''accordent pas, validée telle quelle (plusieurs taux sur la pièce). Remise à NULL quand le TTC ou le taux change.';
