-- ─────────────────────────────────────────────────────────────────────────────
-- Fusion des deux dossiers « Factures » de l'Hôtel Panorama (etab-1)
-- Appliqué en prod le 02.10.2026, à la demande de Jérémy.
--
-- Contexte : « Factures » (dir-1777320404512737, 2025 + fév.-juin 2026) était
-- rangé par erreur dans un dossier de Woodland Village depuis le 27.04.2026 ;
-- remis à la racine du Panorama le 02.10.2026, il doublonnait le « Factures »
-- (dir-1777059659713850, avr.-juil. 2026) où le module Factures range les
-- nouvelles factures. Celui-ci est gardé ; l'autre y est fondu année par
-- année, mois par mois. Aucun fichier du stockage n'est touché : seules les
-- lignes de la table `documents` changent de parent, et les dossiers vidés
-- sont supprimés.
--
-- Sous-dossier « data-… » : jamais rejoué par la CLI Supabase.
-- Inverse : rollback.sql (état d'avant relevé fiche par fiche).
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create function pg_temp.fusionner(source text, cible text) returns void
language plpgsql as $f$
declare
  enfant record;
  existant text;
begin
  for enfant in select id, nom, type from documents where parent_id = source loop
    if enfant.type = 'folder' then
      select id into existant from documents
      where parent_id = cible and type = 'folder' and lower(trim(nom)) = lower(trim(enfant.nom))
      limit 1;
      if existant is not null then
        perform pg_temp.fusionner(enfant.id, existant);
        -- Supprimé seulement s'il est vide : ON DELETE CASCADE emporterait sinon
        -- ce qui n'aurait pas été déplacé.
        delete from documents d where d.id = enfant.id
          and not exists (select 1 from documents c where c.parent_id = enfant.id);
      else
        update documents set parent_id = cible, updated_at = now() where id = enfant.id;
      end if;
    else
      update documents set parent_id = cible, updated_at = now() where id = enfant.id;
    end if;
  end loop;
end;
$f$;

do $d$
declare
  avant int;
  apres int;
begin
  select count(*) into avant from documents where etablissement_id = 'etab-1' and type = 'file';
  perform pg_temp.fusionner('dir-1777320404512737', 'dir-1777059659713850');
  delete from documents d where d.id = 'dir-1777320404512737'
    and not exists (select 1 from documents c where c.parent_id = d.id);
  select count(*) into apres from documents where etablissement_id = 'etab-1' and type = 'file';
  if avant <> apres then
    raise exception 'Fichiers perdus : % avant, % après', avant, apres;
  end if;
  if exists (select 1 from documents where id = 'dir-1777320404512737') then
    raise exception 'Le dossier source n''est pas vide après fusion';
  end if;
end;
$d$;

commit;
