-- Retour arrière de 01-remplissage.sql : vide conditionnement_qte là où la
-- valeur est encore celle lue dans le libellé. Une valeur changée à la main
-- depuis reste en place.

begin;

set local lock_timeout = '3s';

alter table public.produits disable trigger trg_journal_activite;
alter table public.produits disable trigger trg_produits_upd;

with lu as (
  select p.id,
         regexp_match(lower(replace(p.conditionnement, ',', '.')),
           '(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g|l|dl|cl|ml|pcs|pc|pce|pièces|pièce|pieces|piece)\M') as m
    from public.produits p
   where p.conditionnement_qte is not null
)
update public.produits p
   set conditionnement_qte = null
  from lu
 where p.id = lu.id
   and lu.m is not null
   and p.conditionnement_qte = coalesce(lu.m[1]::numeric, 1) * lu.m[2]::numeric
         * case lu.m[3] when 'kg' then 1000 when 'l' then 1000 when 'dl' then 100 when 'cl' then 10 else 1 end;

delete from public.journal_activite
 where module = 'produits' and acteur_id is null and acteur_nom = 'Mise à jour de l''app'
   and libelle like 'Conditionnement de commande lu dans le libellé de %';

alter table public.produits enable trigger trg_journal_activite;
alter table public.produits enable trigger trg_produits_upd;

commit;
