-- Reclasse en origine 'passage' les 3 réservations créées par le bouton
-- « Client de passage » du plan de salle avant que la base connaisse ce canal
-- (migration 20261015_reservations_origine_passage). Établissement etab-2.
-- Ligne visée seulement si elle est encore en 'equipe' et garde le nom posé
-- par le bouton ; tout autre nombre de lignes touchées annule l'ensemble.

begin;

do $reclasse$
declare n int;
begin
  update public.reservations
     set origine = 'passage'
   where etablissement_id = 'etab-2'
     and id in ('320614aa-1da7-4333-aa18-e7d51181f14f', 'a3490962-a90b-456f-8891-b1133b54bb8d', '378ccf4f-0106-481a-9c0e-a4db1005e5ab')
     and origine = 'equipe'
     and nom like 'Passage%';
  get diagnostics n = row_count;
  if n <> 3 then
    raise exception 'Reclassement annulé : % ligne(s) touchée(s) au lieu de 3', n;
  end if;
end $reclasse$;

commit;
