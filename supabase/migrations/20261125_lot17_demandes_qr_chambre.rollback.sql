-- Rollback du lot 17 (demande par QR dans la chambre), dans l'ordre du brief :
-- fonctions, déclencheur de garde et sa fonction, tables, colonne par_qr.

drop function if exists public.demande_chambre_ouvrir(text);
drop function if exists public.demande_chambre_envoyer(text, text, text, text);
drop function if exists public.demande_chambre_suivi(text, text);
drop function if exists public.demandes_qr_preparer(text);
drop function if exists public.demandes_qr_renouveler(uuid);
drop function if exists public.demandes_qr_ouvertes(text, text[]);
drop function if exists public.demandes_qr_sejour(uuid);
drop function if exists public.demandes_qr_chambre_du_jeton(text);

drop trigger if exists trg_demandes_par_qr on public.demandes;
drop function if exists public.demandes_par_qr_garde();

drop table if exists public.demandes_qr_sources;
drop table if exists public.demandes_qr_chambres;
drop table if exists public.demandes_qr_parametres;
drop function if exists public.demandes_qr_libelles_valides(text[]);

alter table public.demandes drop column if exists par_qr;
