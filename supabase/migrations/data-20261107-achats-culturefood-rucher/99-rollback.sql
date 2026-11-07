-- Retire les six bons de commande Culturefood saisis le 07.11.2026.
delete from public.achats_documents
 where etablissement_id = 'etab-1777157340476'
   and fournisseur_nom = 'Culturefood frigemo SA'
   and type_document = 'bon_commande'
   and numero in ('0006766175','0006774441','0006774438','0006766173','0006774436','0006840224');
