-- -----------------------------------------------------------------------------
-- Conditionnement de commande lu dans le libellé (lot 4a) : remplit
-- produits.conditionnement_qte, colonne ajoutée par
-- 20261122b_lot4a_commande_base.sql, depuis le texte produits.conditionnement.
-- À jouer après cette migration, hors service, en une transaction.
--
-- Lecture : « [n x] quantité unité », unité kg, g, l, dl, cl, ml ou pièces.
-- « Sac 5 kg » = 5000 g, « Pack de 6 x 1.5 l » = 9000 ml, « Paquet de 50
-- pièces » = 50 pcs. Seules les lignes dont la famille d'unité est celle de
-- produits.unite_ref sont remplies ; une valeur déjà posée n'est pas touchée.
-- Aperçu du 22.11.2026 : 709 produits remplis sur 763 libellés (30 de famille
-- différente, 24 sans quantité lisible).
--
-- Le journal d'activité et la date de modification ne suivent pas une valeur
-- lue dans un texte déjà saisi : leurs deux déclencheurs sont coupés le temps
-- de la transaction. Le verrou exclusif de l'alter table tient jusqu'au
-- commit, aucune écriture d'une autre session ne passe sans eux. Une ligne de
-- journal par établissement dit ce qui a été fait.
-- -----------------------------------------------------------------------------

begin;

set local lock_timeout = '3s';

alter table public.produits disable trigger trg_journal_activite;
alter table public.produits disable trigger trg_produits_upd;

with lu as (
  select p.id, p.unite_ref,
         regexp_match(lower(replace(p.conditionnement, ',', '.')),
           '(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g|l|dl|cl|ml|pcs|pc|pce|pièces|pièce|pieces|piece)\M') as m
    from public.produits p
   where p.conditionnement_qte is null
     and coalesce(btrim(p.conditionnement), '') <> ''
),
calcul as (
  select lu.id,
         coalesce(lu.m[1]::numeric, 1) * lu.m[2]::numeric
           * case lu.m[3] when 'kg' then 1000 when 'l' then 1000 when 'dl' then 100 when 'cl' then 10 else 1 end as q,
         case when lu.m[3] in ('kg', 'g') then 'g'
              when lu.m[3] in ('l', 'dl', 'cl', 'ml') then 'ml'
              else 'pcs' end as famille,
         case when lu.unite_ref in ('pcs', 'pce', 'pc') then 'pcs' else lu.unite_ref end as famille_produit
    from lu
   where lu.m is not null
),
maj as (
  update public.produits p
     set conditionnement_qte = c.q
    from calcul c
   where p.id = c.id
     and c.famille = c.famille_produit
     and c.q > 0 and c.q < 1000000
  returning p.etablissement_id
)
insert into public.journal_activite
  (etablissement_id, acteur_id, acteur_nom, acteur_role, module, operation, ligne_id, libelle, colonnes_modifiees)
select etablissement_id, null, 'Mise à jour de l''app', null, 'produits', 'UPDATE', null,
       'Conditionnement de commande lu dans le libellé de ' || count(*) || ' produits',
       array['conditionnement_qte']
  from maj
 group by etablissement_id;

alter table public.produits enable trigger trg_journal_activite;
alter table public.produits enable trigger trg_produits_upd;

commit;
