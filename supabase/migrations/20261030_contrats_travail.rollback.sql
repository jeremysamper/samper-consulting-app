-- Rollback de 20261030_contrats_travail.
-- À jouer seulement après être revenu à un front qui ne lit pas contrats_travail
-- ni les motifs « vacances » et « ferie ». Les absences « vacances » et « ferie »
-- sont repliées sur « conge » avant de resserrer la contrainte, sinon elle
-- refuserait de se poser. Repli sans retour : un jour férié se lit ensuite
-- comme un congé. La table (et les contrats saisis) part en dernier.

update public.absences set motif = 'conge' where motif in ('vacances', 'ferie');
alter table public.absences drop constraint if exists absences_motif_check;
alter table public.absences add constraint absences_motif_check
  check (motif in ('conge', 'formation', 'absence'));

drop table if exists public.contrats_travail;
