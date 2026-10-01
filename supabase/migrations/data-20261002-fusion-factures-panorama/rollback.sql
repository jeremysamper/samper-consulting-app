-- Inverse de fusion.sql : recrée les dossiers supprimés à l'identique (mêmes
-- id) et remet chaque ligne dans son parent d'avant. État relevé le 02.10.2026
-- juste avant la fusion. Les fichiers du stockage n'ont jamais bougé.

begin;

insert into documents (id, etablissement_id, parent_id, type, nom) values
  ('dir-1777320404512737', 'etab-1', null, 'folder', 'Factures'),
  ('dir-1777320439169214', 'etab-1', 'dir-1777320404512737', 'folder', '2025'),
  ('dir-1777320585026583', 'etab-1', 'dir-1777320404512737', 'folder', '2026'),
  ('dir-1777320485722296', 'etab-1', 'dir-1777320439169214', 'folder', '12 - Décembre'),
  ('dir-1777320453682563', 'etab-1', 'dir-1777320439169214', 'folder', '10 - Octobre'),
  ('dir-1777320594078288', 'etab-1', 'dir-1777320585026583', 'folder', '02 - Février'),
  ('dir-1777320599646888', 'etab-1', 'dir-1777320585026583', 'folder', '03 - Mars'),
  ('dir-1777320604944576', 'etab-1', 'dir-1777320585026583', 'folder', '04 - Avril'),
  ('dir-1777320731310571', 'etab-1', 'dir-1777320585026583', 'folder', '06 - Juin')
on conflict (id) do update set parent_id = excluded.parent_id;

update documents set parent_id = 'dir-1777320453682563' where id = 'doc-17773204677056';
update documents set parent_id = 'dir-1777320485722296' where id in ('doc-1777320570451304', 'doc-1777320571034721');
update documents set parent_id = 'dir-1777320594078288' where id = 'doc-1777320622725216';
update documents set parent_id = 'dir-1777320599646888' where id in ('doc-1777320702716213', 'doc-1777320703094865');

commit;
