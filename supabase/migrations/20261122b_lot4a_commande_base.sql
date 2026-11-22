-- -----------------------------------------------------------------------------
-- Lot 4a « commande et marchandise » : la base (22.11.2026)
--
-- Ajout seul (expand). Le front déployé ne lit rien de neuf, et aucune policy
-- d'une table existante n'est retouchée. Elle passe après les migrations du
-- lot 2a (commande_cibles, livraisons des fournisseurs, mep_modeles), dont
-- elle vérifie la présence.
--
--   1. produits.conditionnement_qte   conditionnement de commande, dans l'unité
--                                     de référence du produit (5 kg = 5000 g)
--   2. commande_habituels             produits habituels par fournisseur
--                                     (réglage de la direction)
--   3. commandes                      une commande par fournisseur et par
--                                     livraison : brouillon, envoyée, reçue (D3)
--   4. commande_lignes                ses lignes. Quantité calculée en base :
--                                     stock cible moins le reste tapé, plus les
--                                     besoins des groupes, arrondie au
--                                     conditionnement. Réception : reçu, écart,
--                                     manquant, lot et DLC (traçabilité)
--   5. commande_groupes               groupes dont les besoins sont dans une
--                                     commande (un groupe, une commande par
--                                     fournisseur)
--   6. commande_receptionner()        valide la réception : lignes, statut et
--                                     bon de livraison dans les achats, qui
--                                     nourrit les hausses de prix
--   7. pertes                         lien au produit, à la recette et à la
--                                     ligne de mise en place jetée ; source
--      pertes_frequentes()            produits les plus déclarés, pour une
--                                     déclaration en deux touches
--   8. mep_listes, mep_items          poste, modèle et origine d'une liste ;
--                                     quantité proposée par l'app (J+1)
--   9. pos_regles_correspondance      règles de correspondance des plats de la
--                                     caisse, par maison ;
--                                     pos_item_recipe_mapping.regle_id
--  10. recettes_relier_ingredients()  toutes les lignes d'un même ingrédient
--                                     reliées à un produit en un geste
--
-- Droits. « Équipe » = toute personne de l'établissement ; « direction » =
-- consultant, patron, resp_cuisine.
--   commandes, lignes, groupes : lus et écrits par l'équipe (comme la liste
--   commande_items d'aujourd'hui). Suppression d'une commande : brouillon par
--   l'équipe, toute commande par la direction. Une commande reçue est scellée :
--   seule sa note change, ses lignes et ses groupes ne s'ajoutent ni ne se
--   retirent plus, et seule la direction corrige la réception d'une ligne. La
--   réception ne se valide que par commande_receptionner.
--   commande_habituels : lus par l'équipe, écrits par la direction.
--   pos_regles_correspondance : lues par qui lit Ventes POS (consultant,
--   patron, resp_cuisine, cuisinier), écrites par consultant, patron,
--   resp_cuisine (comme pos_item_recipe_mapping).
--   pertes, mep_*, recettes, achats_documents : RLS inchangée. Les fonctions
--   sont SECURITY INVOKER : elles passent par la RLS de qui les appelle.
--
-- Idempotente : chaque objet est créé « si absent » ou remplacé à l'identique.
-- Aucun remplissage de données (le conditionnement se remplit à part :
-- data-20261122-conditionnement-qte). Retour arrière :
-- 20261122b_lot4a_commande_base.rollback.sql.
-- -----------------------------------------------------------------------------

-- Les alter table prennent un verrou exclusif sur des tables lues en service :
-- ne pas attendre plus de 3 s derrière une transaction longue (la migration
-- échoue alors, sans rien changer, et se rejoue plus tard).
set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.commande_cibles') is null
     or to_regclass('public.mep_modeles') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'fournisseurs'
                      and column_name = 'heure_limite') then
    raise exception 'Appliquer d''abord 20261122_lot2a_reglages_modules.sql';
  end if;
end $$;


-- =============================================================================
-- 1. produits.conditionnement_qte
-- =============================================================================

alter table public.produits
  add column if not exists conditionnement_qte numeric
    constraint produits_conditionnement_qte_check
    check (conditionnement_qte is null or (conditionnement_qte > 0 and conditionnement_qte < 1000000));

comment on column public.produits.conditionnement_qte is
  'Quantité d''un colis de commande, dans l''unité de référence du produit (unite_ref) : 5 kg = 5000 si unite_ref = g. Null = pas d''arrondi. Le texte libre reste dans conditionnement.';


-- =============================================================================
-- Fonction commune : auteur et heure de la dernière écriture
-- =============================================================================

-- commande_cibles_avant_ecriture (lot 2a) pose updated_at et updated_by ; elle
-- sert aussi aux tables de réglage de ce lot, qui ont les deux mêmes colonnes.


-- =============================================================================
-- 2. commande_habituels
-- =============================================================================

create table if not exists public.commande_habituels (
  id                uuid        primary key default gen_random_uuid(),
  etablissement_id  text        not null references public.etablissements(id) on delete cascade,
  fournisseur_id    text        not null references public.fournisseurs(id) on delete cascade,
  produit_id        text        not null references public.produits(id) on delete cascade,
  ordre             integer     not null default 0,
  quantite_defaut   numeric,
  updated_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint commande_habituels_quantite_check check (quantite_defaut is null or (quantite_defaut >= 0 and quantite_defaut < 1000000)),
  constraint commande_habituels_fournisseur_produit_key unique (fournisseur_id, produit_id)
);

comment on table public.commande_habituels is
  'Produits habituels de chaque fournisseur (lot 4a, D3) : ils paraissent dans la commande même sans stock cible. quantite_defaut, dans l''unité de référence du produit, est proposée quand aucune cible ne s''applique.';

-- fournisseur_id est couvert par la clé unique (fournisseur_id, produit_id).
create index if not exists idx_commande_habituels_etab on public.commande_habituels (etablissement_id);
create index if not exists idx_commande_habituels_produit on public.commande_habituels (produit_id);

create or replace trigger trg_commande_habituels_avant_ecriture
  before insert or update on public.commande_habituels
  for each row execute function public.commande_cibles_avant_ecriture();


-- =============================================================================
-- 3. commandes
-- =============================================================================

create table if not exists public.commandes (
  id                 uuid        primary key default gen_random_uuid(),
  etablissement_id   text        not null references public.etablissements(id) on delete cascade,
  fournisseur_id     text        references public.fournisseurs(id) on delete set null,
  fournisseur_nom    text        not null,
  date_livraison     date        not null,
  envoyer_avant      timestamptz,
  statut             text        not null default 'brouillon',
  perimetre          text        not null default 'Général',
  note               text,
  envoyee_at         timestamptz,
  envoyee_par        text,
  envoi_canal        text,
  recue_at           timestamptz,
  recue_par          text,
  achat_document_id  text        references public.achats_documents(id) on delete set null,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint commandes_statut_check check (statut in ('brouillon', 'envoyee', 'recue')),
  constraint commandes_envoi_canal_check check (envoi_canal is null or envoi_canal in ('gmail', 'mail', 'pdf', 'telephone', 'autre')),
  constraint commandes_fournisseur_nom_check check (btrim(fournisseur_nom) <> '' and length(fournisseur_nom) <= 200),
  constraint commandes_perimetre_check check (btrim(perimetre) <> '' and length(perimetre) <= 80),
  constraint commandes_note_check check (note is null or length(note) <= 2000)
);

comment on table public.commandes is
  'Commande V1 (lot 4a, D3) : une par fournisseur et par livraison. brouillon, puis envoyee, puis recue (par commande_receptionner seulement). envoyer_avant = heure limite du fournisseur, posée par la base. perimetre = périmètre d''inventaire du bon de livraison créé à la réception.';

create unique index if not exists commandes_fournisseur_livraison_key
  on public.commandes (fournisseur_id, date_livraison);
create index if not exists idx_commandes_etab_livraison on public.commandes (etablissement_id, date_livraison);
create index if not exists idx_commandes_achat_document on public.commandes (achat_document_id) where achat_document_id is not null;

-- Avant chaque écriture :
--   * fournisseur : nom et heure limite repris de la fiche du fournisseur
--     (même établissement que la commande, sinon refus) ;
--   * statut : « envoyee » date et signe l'envoi, un retour en brouillon
--     l'efface ; « recue » n'est posé que par commande_receptionner (drapeau
--     de transaction lot4a.reception) ; une commande reçue ne change plus que
--     par sa note ;
--   * auteur, réception et bon d'achat ne s'écrivent pas depuis l'app.
-- Une remise à null faite par une action référentielle (fournisseur ou bon
-- d'achat supprimé, pg_trigger_depth() > 1) passe, même sur une commande
-- reçue : sans elle, la suppression du fournisseur échouerait.
-- Sans identité (service, migration) : seuls les calculs s'appliquent.
-- INVOKER : lit la fiche du fournisseur avec les droits de l'appelant.
create or replace function public.commandes_avant_ecriture()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
declare
  v_uid       text := (select auth.uid())::text;
  v_reception boolean := coalesce(current_setting('lot4a.reception', true), '') = new.id::text;
  f           record;
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' and old.statut = 'recue' then
    if v_uid is not null and not v_reception
       and row(new.etablissement_id,
               case when pg_trigger_depth() > 1 and new.fournisseur_id is null then old.fournisseur_id else new.fournisseur_id end,
               new.fournisseur_nom, new.date_livraison,
               new.envoyer_avant, new.statut, new.perimetre, new.envoyee_at, new.envoyee_par,
               new.envoi_canal, new.recue_at, new.recue_par,
               case when pg_trigger_depth() > 1 and new.achat_document_id is null then old.achat_document_id else new.achat_document_id end,
               new.created_by, new.created_at)
           is distinct from
           row(old.etablissement_id, old.fournisseur_id, old.fournisseur_nom, old.date_livraison,
               old.envoyer_avant, old.statut, old.perimetre, old.envoyee_at, old.envoyee_par,
               old.envoi_canal, old.recue_at, old.recue_par, old.achat_document_id,
               old.created_by, old.created_at) then
      raise exception 'Cette commande est reçue : seule sa note se modifie encore.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and v_uid is not null and new.etablissement_id is distinct from old.etablissement_id then
    raise exception 'Une commande ne change pas d''établissement.' using errcode = '42501';
  end if;

  -- Fournisseur : nom et heure limite.
  if new.fournisseur_id is not null
     and (tg_op = 'INSERT'
          or new.fournisseur_id is distinct from old.fournisseur_id
          or new.date_livraison is distinct from old.date_livraison
          or new.envoyer_avant is null) then
    select fo.etablissement_id, fo.nom, fo.heure_limite, fo.delai_commande_jours
      into f
      from public.fournisseurs fo
     where fo.id = new.fournisseur_id;
    if found then
      if f.etablissement_id is distinct from new.etablissement_id then
        raise exception 'Ce fournisseur appartient à un autre établissement.' using errcode = '23514';
      end if;
      if tg_op = 'INSERT' then
        new.fournisseur_nom := coalesce(nullif(btrim(new.fournisseur_nom), ''), f.nom);
      elsif new.fournisseur_id is distinct from old.fournisseur_id then
        new.fournisseur_nom := f.nom;
      end if;
      -- Heure limite recalculée tant que l'app n'en pose pas une autre.
      if f.heure_limite is not null
         and (new.envoyer_avant is null
              or (tg_op = 'UPDATE' and new.envoyer_avant is not distinct from old.envoyer_avant)) then
        new.envoyer_avant := ((new.date_livraison - coalesce(f.delai_commande_jours, 1)) + f.heure_limite)
                             at time zone 'Europe/Zurich';
      end if;
    end if;
  end if;

  if v_uid is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.statut = 'recue' then
      raise exception 'La réception se valide par commande_receptionner.' using errcode = '42501';
    end if;
    new.created_by := v_uid;
    new.recue_at := null;
    new.recue_par := null;
    new.achat_document_id := null;
    if new.statut = 'envoyee' then
      new.envoyee_at := coalesce(new.envoyee_at, now());
      new.envoyee_par := v_uid;
    else
      new.envoyee_at := null;
      new.envoyee_par := null;
    end if;
    return new;
  end if;

  if new.statut = 'recue' and not v_reception then
    raise exception 'La réception se valide par commande_receptionner.' using errcode = '42501';
  end if;
  if new.statut = 'envoyee' and old.statut = 'brouillon' then
    new.envoyee_at := coalesce(new.envoyee_at, now());
    new.envoyee_par := v_uid;
  elsif new.statut = 'brouillon' and old.statut = 'envoyee' then
    new.envoyee_at := null;
    new.envoyee_par := null;
    new.envoi_canal := null;
  elsif new.statut = old.statut then
    new.envoyee_par := old.envoyee_par;
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if not v_reception then
    new.recue_at := old.recue_at;
    new.recue_par := old.recue_par;
    new.achat_document_id := old.achat_document_id;
  end if;
  return new;
end;
$fn$;

revoke all on function public.commandes_avant_ecriture() from public, anon, authenticated;

create or replace trigger trg_commandes_avant_ecriture
  before insert or update on public.commandes
  for each row execute function public.commandes_avant_ecriture();


-- =============================================================================
-- 4. commande_lignes et la règle de quantité
-- =============================================================================

-- La règle D3, en un seul endroit. Le front la recopie pour l'affichage en
-- direct (lot 4b) ; la valeur enregistrée est celle de la base.
--   part du stock   = stock cible moins reste (jamais négative), connue
--                     seulement quand la cible ET le reste sont connus
--   part des groupes = besoins des groupes ajoutés
--   rien de connu   = null (la ligne attend son reste)
--   besoin <= 0     = 0
--   arrondi         = au conditionnement supérieur (5 kg : 7 kg -> 10 kg) ;
--                     sans conditionnement, le besoin tel quel
create or replace function public.commande_quantite_arrondie(
  p_stock_cible     numeric,
  p_reste           numeric,
  p_besoin_groupes  numeric,
  p_conditionnement numeric)
returns numeric
language sql
immutable
parallel safe
set search_path = pg_catalog
as $fn$
  select case
           when s.part_stock is null and s.part_groupes = 0 then null
           when coalesce(s.part_stock, 0) + s.part_groupes <= 0 then 0::numeric
           when p_conditionnement is null or p_conditionnement <= 0 then coalesce(s.part_stock, 0) + s.part_groupes
           else ceil((coalesce(s.part_stock, 0) + s.part_groupes) / p_conditionnement) * p_conditionnement
         end
  from (select case when p_stock_cible is null or p_reste is null then null
                    else greatest(p_stock_cible - p_reste, 0) end as part_stock,
               greatest(coalesce(p_besoin_groupes, 0), 0) as part_groupes) s
$fn$;

revoke all on function public.commande_quantite_arrondie(numeric, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.commande_quantite_arrondie(numeric, numeric, numeric, numeric) to authenticated;

create table if not exists public.commande_lignes (
  id                      uuid        primary key default gen_random_uuid(),
  commande_id             uuid        not null references public.commandes(id) on delete cascade,
  produit_id              text        references public.produits(id) on delete set null,
  nom                     text        not null,
  unite                   text        not null default '',
  conditionnement         numeric,
  conditionnement_libelle text,
  stock_cible             numeric,
  reste                   numeric,
  besoin_groupes          numeric     not null default 0,
  quantite_calculee       numeric,
  quantite                numeric,
  prix_unitaire           numeric,
  reference_fourn         text,
  source                  text        not null default 'manuel',
  ordre                   integer     not null default 0,
  statut_reception        text,
  quantite_recue          numeric,
  montant_recu            numeric,
  lot                     text,
  dlc                     date,
  note_reception          text,
  recu_par                text,
  recu_at                 timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint commande_lignes_nom_check check (btrim(nom) <> '' and length(nom) <= 200),
  constraint commande_lignes_unite_check check (length(unite) <= 20),
  constraint commande_lignes_source_check check (source in ('cible', 'habituel', 'groupe', 'manuel')),
  constraint commande_lignes_quantites_check check (
        (conditionnement is null or (conditionnement > 0 and conditionnement < 1000000))
    and (stock_cible is null or (stock_cible >= 0 and stock_cible < 1000000))
    and (reste is null or (reste >= 0 and reste < 1000000))
    and (besoin_groupes >= 0 and besoin_groupes < 1000000)
    and (quantite is null or (quantite >= 0 and quantite < 10000000))
    and (quantite_recue is null or (quantite_recue >= 0 and quantite_recue < 10000000))
    and (prix_unitaire is null or (prix_unitaire >= 0 and prix_unitaire < 1000000))
    and (montant_recu is null or (montant_recu >= 0 and montant_recu < 10000000))),
  constraint commande_lignes_reception_check check (
        (statut_reception is null or statut_reception in ('recu', 'ecart', 'manquant'))
    and (statut_reception is distinct from 'manquant' or coalesce(quantite_recue, 0) = 0)),
  constraint commande_lignes_textes_check check (
        (conditionnement_libelle is null or length(conditionnement_libelle) <= 120)
    and (reference_fourn is null or length(reference_fourn) <= 80)
    and (lot is null or length(lot) <= 80)
    and (note_reception is null or length(note_reception) <= 500))
);

comment on table public.commande_lignes is
  'Lignes d''une commande (lot 4a, D3). Quantités dans unite (l''unité de référence du produit). quantite_calculee est posée par la base (commande_quantite_arrondie) ; quantite, quand elle est remplie, la remplace. Réception : statut_reception, quantite_recue, montant_recu (total HT de la ligne), lot et dlc pour la traçabilité.';
comment on column public.commande_lignes.conditionnement is 'Quantité d''un colis, dans unite. Reprise à la création du conditionnement du fournisseur de la commande (produit_fournisseurs, même famille d''unité), sinon de produits.conditionnement_qte.';
comment on column public.commande_lignes.stock_cible is 'Stock cible du jour de livraison (commande_cibles), repris à la création quand l''app n''en donne pas.';
comment on column public.commande_lignes.besoin_groupes is 'Besoins des groupes ajoutés à la commande (commande_groupes), dans unite.';
comment on column public.commande_lignes.prix_unitaire is 'Prix attendu par unité (unite), repris à la création du prix du fournisseur de la commande (produit_fournisseurs), sinon du fournisseur principal, sinon du produit.';

create index if not exists idx_commande_lignes_commande on public.commande_lignes (commande_id, ordre);
create index if not exists idx_commande_lignes_produit on public.commande_lignes (produit_id) where produit_id is not null;

-- Avant chaque écriture :
--   * à la création, ce que l'app ne donne pas est repris : prix, colis,
--     numéro d'article et libellé du colis de la fiche du fournisseur de la
--     commande (produit_fournisseurs ; à défaut le fournisseur principal pour
--     le prix, comme l'affiche le catalogue), puis du produit (nom, unité,
--     conditionnement_qte, prix), et le stock cible du jour de livraison ;
--   * quantite_calculee est recalculée à chaque écriture ;
--   * qui a coché la réception, et quand, est posé par la base ;
--   * commande reçue : plus de ligne ajoutée ni supprimée ; seule la
--     direction corrige les champs de réception.
-- Une suppression en cascade (commande supprimée) ne trouve plus la commande
-- et passe. Une remise à null de produit_id par une action référentielle
-- (produit supprimé, pg_trigger_depth() > 1) passe aussi.
create or replace function public.commande_lignes_avant_ecriture()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
declare
  v_uid       text := (select auth.uid())::text;
  v_reception boolean;
  v_cond_pf   numeric;
  c           record;
  p           record;
  pf          record;
begin
  if tg_op = 'DELETE' then
    select statut into c from public.commandes where id = old.commande_id;
    if found and c.statut = 'recue' and v_uid is not null
       and coalesce(current_setting('lot4a.reception', true), '') <> old.commande_id::text then
      raise exception 'Cette commande est reçue : ses lignes ne se suppriment plus.' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and new.commande_id is distinct from old.commande_id and v_uid is not null then
    raise exception 'Une ligne ne change pas de commande.' using errcode = '42501';
  end if;

  select co.statut, co.etablissement_id, co.date_livraison, co.fournisseur_id into c
    from public.commandes co where co.id = new.commande_id;
  v_reception := coalesce(current_setting('lot4a.reception', true), '') = new.commande_id::text;

  if tg_op = 'INSERT' and new.produit_id is not null then
    select pr.nom, pr.unite_ref, pr.conditionnement, pr.conditionnement_qte, pr.prix_unitaire, pr.reference_fourn
      into p
      from public.produits pr where pr.id = new.produit_id;
    if found then
      -- Fiche du fournisseur de la commande, sinon du fournisseur principal.
      select x.fournisseur_id, x.prix_unitaire, x.quantite_cond, x.unite_cond, x.conditionnement, x.reference
        into pf
        from public.produit_fournisseurs x
       where x.produit_id = new.produit_id
         and (x.fournisseur_id is not distinct from c.fournisseur_id or x.est_principal)
       order by (x.fournisseur_id is not distinct from c.fournisseur_id) desc, x.updated_at desc nulls last
       limit 1;
      if found and pf.fournisseur_id is not distinct from c.fournisseur_id and pf.quantite_cond > 0 then
        -- Colis du fournisseur, s'il est dans la famille de l'unité du produit.
        v_cond_pf := case
          when pf.unite_cond = p.unite_ref then pf.quantite_cond
          when pf.unite_cond = 'kg' and p.unite_ref = 'g' then pf.quantite_cond * 1000
          when pf.unite_cond in ('L', 'l') and p.unite_ref = 'ml' then pf.quantite_cond * 1000
        end;
        new.conditionnement := coalesce(new.conditionnement, v_cond_pf);
        new.conditionnement_libelle := coalesce(new.conditionnement_libelle, nullif(btrim(pf.conditionnement), ''));
        new.reference_fourn := coalesce(new.reference_fourn, nullif(btrim(pf.reference), ''));
      end if;
      if pf.fournisseur_id is not null then
        new.prix_unitaire := coalesce(new.prix_unitaire, pf.prix_unitaire);
      end if;
      new.nom := coalesce(nullif(btrim(new.nom), ''), p.nom);
      if coalesce(new.unite, '') = '' then new.unite := coalesce(p.unite_ref, ''); end if;
      new.conditionnement := coalesce(new.conditionnement, p.conditionnement_qte);
      new.conditionnement_libelle := coalesce(new.conditionnement_libelle, nullif(btrim(p.conditionnement), ''));
      new.prix_unitaire := coalesce(new.prix_unitaire, p.prix_unitaire);
      new.reference_fourn := coalesce(new.reference_fourn, nullif(btrim(p.reference_fourn), ''));
    end if;
    if new.stock_cible is null and c.date_livraison is not null then
      select cc.quantite into new.stock_cible
        from public.commande_cibles cc
       where cc.produit_id = new.produit_id
         and cc.jour_livraison = extract(isodow from c.date_livraison)::smallint;
    end if;
  end if;

  new.updated_at := now();
  new.quantite_calculee := public.commande_quantite_arrondie(new.stock_cible, new.reste, new.besoin_groupes, new.conditionnement);

  if v_uid is null then
    return new;
  end if;

  if c.statut = 'recue' and not v_reception then
    if tg_op = 'INSERT' then
      raise exception 'Cette commande est reçue : on n''y ajoute plus de ligne.' using errcode = '42501';
    end if;
    if pg_trigger_depth() > 1 and new.produit_id is null and old.produit_id is not null
       and row(new.nom, new.unite, new.conditionnement, new.conditionnement_libelle, new.stock_cible,
               new.reste, new.besoin_groupes, new.quantite, new.prix_unitaire, new.reference_fourn,
               new.source, new.ordre, new.statut_reception, new.quantite_recue, new.montant_recu,
               new.lot, new.dlc, new.note_reception, new.recu_par, new.recu_at)
           is not distinct from
           row(old.nom, old.unite, old.conditionnement, old.conditionnement_libelle, old.stock_cible,
               old.reste, old.besoin_groupes, old.quantite, old.prix_unitaire, old.reference_fourn,
               old.source, old.ordre, old.statut_reception, old.quantite_recue, old.montant_recu,
               old.lot, old.dlc, old.note_reception, old.recu_par, old.recu_at) then
      return new;
    end if;
    if (select public.current_user_role()) not in ('consultant', 'patron', 'resp_cuisine')
       or row(new.produit_id, new.nom, new.unite, new.conditionnement, new.conditionnement_libelle,
              new.stock_cible, new.reste, new.besoin_groupes, new.quantite, new.prix_unitaire,
              new.reference_fourn, new.source, new.ordre)
          is distinct from
          row(old.produit_id, old.nom, old.unite, old.conditionnement, old.conditionnement_libelle,
              old.stock_cible, old.reste, old.besoin_groupes, old.quantite, old.prix_unitaire,
              old.reference_fourn, old.source, old.ordre) then
      raise exception 'Cette commande est reçue : seule la direction corrige sa réception.' using errcode = '42501';
    end if;
  end if;

  -- Qui a coché la réception, et quand.
  if tg_op = 'INSERT'
     or row(new.statut_reception, new.quantite_recue, new.montant_recu, new.lot, new.dlc)
        is distinct from row(old.statut_reception, old.quantite_recue, old.montant_recu, old.lot, old.dlc) then
    new.recu_par := case when new.statut_reception is null then null else v_uid end;
    new.recu_at  := case when new.statut_reception is null then null else now() end;
  else
    new.recu_par := old.recu_par;
    new.recu_at  := old.recu_at;
  end if;
  return new;
end;
$fn$;

revoke all on function public.commande_lignes_avant_ecriture() from public, anon, authenticated;

create or replace trigger trg_commande_lignes_avant_ecriture
  before insert or update or delete on public.commande_lignes
  for each row execute function public.commande_lignes_avant_ecriture();


-- =============================================================================
-- 5. commande_groupes
-- =============================================================================

create table if not exists public.commande_groupes (
  id                   uuid        primary key default gen_random_uuid(),
  commande_id          uuid        not null references public.commandes(id) on delete cascade,
  groupe_evenement_id  text        not null references public.groupe_evenements(id) on delete cascade,
  fournisseur_id       text        references public.fournisseurs(id) on delete set null,
  nb_pax               integer,
  created_by           text,
  created_at           timestamptz not null default now(),
  constraint commande_groupes_nb_pax_check check (nb_pax is null or (nb_pax > 0 and nb_pax <= 5000)),
  constraint commande_groupes_commande_groupe_key unique (commande_id, groupe_evenement_id)
);

comment on table public.commande_groupes is
  'Groupes dont les besoins sont dans une commande (lot 4a, J-14). Un groupe entre dans une seule commande par fournisseur. nb_pax = nombre de personnes au moment de l''ajout : un écart avec le groupe dit que ses besoins sont à revoir.';

-- groupe_evenement_id : clé unique avec le fournisseur, qui sert aussi la clé
-- étrangère (colonne en tête). commande_id : clé unique (commande, groupe).
create unique index if not exists commande_groupes_groupe_fournisseur_key
  on public.commande_groupes (groupe_evenement_id, fournisseur_id);
create index if not exists idx_commande_groupes_fournisseur on public.commande_groupes (fournisseur_id) where fournisseur_id is not null;

-- Le fournisseur est celui de la commande à l'ajout, l'auteur celui de la
-- session. Commande reçue : plus de groupe ajouté, changé ni retiré, sauf par
-- une action référentielle (commande, groupe ou fournisseur supprimé,
-- pg_trigger_depth() > 1).
create or replace function public.commande_groupes_avant_ecriture()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
declare
  v_statut text;
begin
  select co.statut into v_statut
    from public.commandes co
   where co.id = case when tg_op = 'DELETE' then old.commande_id else new.commande_id end;
  if v_statut = 'recue' and (select auth.uid()) is not null and pg_trigger_depth() = 1 then
    raise exception 'Cette commande est reçue : ses groupes ne changent plus.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.commande_id is distinct from old.commande_id then
    raise exception 'Un groupe ne change pas de commande : retirez-le, puis ajoutez-le.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    select co.fournisseur_id into new.fournisseur_id from public.commandes co where co.id = new.commande_id;
    new.created_by := coalesce((select auth.uid())::text, new.created_by);
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$fn$;

revoke all on function public.commande_groupes_avant_ecriture() from public, anon, authenticated;

create or replace trigger trg_commande_groupes_avant_ecriture
  before insert or update or delete on public.commande_groupes
  for each row execute function public.commande_groupes_avant_ecriture();


-- =============================================================================
-- 6. commande_receptionner
-- =============================================================================

-- Valide la réception d'une commande, en une transaction :
--   1. p_lignes : [{ id, statut: recu | ecart | manquant, quantite_recue,
--      montant_recu, lot, dlc, note }] ; une clé absente garde la valeur déjà
--      cochée ; quantite_recue absente = la quantité commandée ;
--   2. les lignes commandées et pas encore cochées sont reçues comme
--      commandées ;
--   3. si p_achat (vrai par défaut) et qu'une ligne est reçue : un bon de
--      livraison (achats_documents, source « commande ») reprend les lignes
--      reçues. Il nourrit les achats, la consommation et les hausses de prix,
--      comme un bon scanné. p_numero = numéro du bon du fournisseur, s'il est
--      connu : un bon scanné ensuite sous le même numéro sera vu comme un
--      doublon. p_achat = faux quand le bon est déjà scanné ;
--   4. la commande passe « recue ». Un brouillon se reçoit aussi : une
--      commande passée au téléphone n'est pas envoyée par l'app.
-- Rend { commande_id, achat_document_id, recues, ecarts, manquantes }.
-- INVOKER : la RLS de l'appelant s'applique à chaque lecture et écriture.
create or replace function public.commande_receptionner(
  p_commande_id uuid,
  p_lignes      jsonb   default '[]'::jsonb,
  p_numero      text    default null,
  p_achat       boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
declare
  v_uid      text := (select auth.uid())::text;
  c          record;
  v_n        integer;
  v_attendus integer;
  v_doc      text;
  v_lignes   jsonb;
  v_total    numeric;
  v_bilan    record;
begin
  if p_lignes is null then
    p_lignes := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) > 500 then
    raise exception 'Lignes de réception invalides.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lignes) e
             where jsonb_typeof(e) <> 'object'
                or coalesce(e->>'statut', '') not in ('recu', 'ecart', 'manquant')
                or lower(coalesce(e->>'id', '')) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Chaque ligne reçue donne son id et son statut : recu, ecart ou manquant.' using errcode = '22023';
  end if;

  select co.id, co.etablissement_id, co.fournisseur_id, co.fournisseur_nom, co.date_livraison,
         co.perimetre, co.statut
    into c
    from public.commandes co
   where co.id = p_commande_id
   for update;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'P0002';
  end if;
  if c.statut = 'recue' then
    raise exception 'Cette commande est déjà reçue.' using errcode = '22023';
  end if;

  perform set_config('lot4a.reception', p_commande_id::text, true);

  -- 1. Réception cochée ligne à ligne.
  update public.commande_lignes l set
    statut_reception = e->>'statut',
    quantite_recue   = case when e->>'statut' = 'manquant' then 0
                            when e ? 'quantite_recue' then coalesce((e->>'quantite_recue')::numeric, l.quantite, l.quantite_calculee)
                            else coalesce(l.quantite_recue, l.quantite, l.quantite_calculee) end,
    montant_recu     = case when e ? 'montant_recu' then (e->>'montant_recu')::numeric else l.montant_recu end,
    lot              = case when e ? 'lot' then nullif(btrim(e->>'lot'), '') else l.lot end,
    dlc              = case when e ? 'dlc' then (nullif(btrim(e->>'dlc'), ''))::date else l.dlc end,
    note_reception   = case when e ? 'note' then nullif(btrim(e->>'note'), '') else l.note_reception end
  from (select distinct on (lower(x->>'id')) x as e from jsonb_array_elements(p_lignes) x order by lower(x->>'id')) j
  where l.commande_id = p_commande_id
    and l.id = (j.e->>'id')::uuid;
  get diagnostics v_n = row_count;
  select count(distinct lower(x->>'id')) into v_attendus from jsonb_array_elements(p_lignes) x;
  if v_n <> v_attendus then
    raise exception 'Une ligne de réception n''appartient pas à cette commande.' using errcode = '22023';
  end if;

  -- 2. Lignes commandées et pas encore cochées : reçues comme commandées.
  update public.commande_lignes l set
    statut_reception = 'recu',
    quantite_recue   = coalesce(l.quantite, l.quantite_calculee)
  where l.commande_id = p_commande_id
    and l.statut_reception is null
    and coalesce(l.quantite, l.quantite_calculee, 0) > 0;

  -- 3. Bon de livraison, au format des lignes de achats_documents.
  if coalesce(p_achat, true) then
    select jsonb_agg(jsonb_build_object(
             'libelle',         l.nom,
             'produitId',       l.produit_id,
             'produitNom',      pr.nom,
             'lien',            case when pr.id is not null then 'manuel' end,
             'quantite',        case when l.conditionnement > 0 then round(l.quantite_recue / l.conditionnement, 3) else l.quantite_recue end,
             'quantiteTotale',  l.quantite_recue,
             'uniteTotale',     l.unite,
             'montantLigne',    coalesce(l.montant_recu, round(l.prix_unitaire * l.quantite_recue, 2)),
             'referenceFourn',  coalesce(l.reference_fourn, ''),
             'conditionnement', coalesce(l.conditionnement_libelle, ''),
             'issues',          case when l.statut_reception = 'ecart' then jsonb_build_array('écart à la réception') else '[]'::jsonb end
           ) order by l.ordre, l.created_at, l.id),
           sum(coalesce(l.montant_recu, round(l.prix_unitaire * l.quantite_recue, 2)))
      into v_lignes, v_total
      from public.commande_lignes l
      left join public.produits pr on pr.id = l.produit_id
     where l.commande_id = p_commande_id
       and l.statut_reception in ('recu', 'ecart')
       and l.quantite_recue > 0;

    if v_lignes is not null then
      v_doc := gen_random_uuid()::text;
      insert into public.achats_documents
        (id, etablissement_id, perimetre, type_document, fournisseur_nom, fournisseur_id,
         numero, date_document, total_ht, lignes, exclu, source, created_by)
      values
        (v_doc, c.etablissement_id, c.perimetre, 'bon_livraison', c.fournisseur_nom, c.fournisseur_id,
         coalesce(nullif(btrim(p_numero), ''), 'Commande du ' || to_char(c.date_livraison, 'DD.MM.YYYY')),
         (now() at time zone 'Europe/Zurich')::date, round(v_total, 2), v_lignes, false, 'commande', v_uid);
    end if;
  end if;

  -- 4. Commande reçue.
  update public.commandes co set
    statut            = 'recue',
    recue_at          = now(),
    recue_par         = v_uid,
    achat_document_id = v_doc
  where co.id = p_commande_id;

  perform set_config('lot4a.reception', '', true);

  select count(*) filter (where l.statut_reception = 'recu')     as recues,
         count(*) filter (where l.statut_reception = 'ecart')    as ecarts,
         count(*) filter (where l.statut_reception = 'manquant') as manquantes
    into v_bilan
    from public.commande_lignes l
   where l.commande_id = p_commande_id;

  return jsonb_build_object(
    'commande_id', p_commande_id,
    'achat_document_id', v_doc,
    'recues', v_bilan.recues,
    'ecarts', v_bilan.ecarts,
    'manquantes', v_bilan.manquantes);
end;
$fn$;

revoke all on function public.commande_receptionner(uuid, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.commande_receptionner(uuid, jsonb, text, boolean) to authenticated;


-- =============================================================================
-- RLS des tables de la commande
-- =============================================================================

alter table public.commande_habituels enable row level security;
alter table public.commandes          enable row level security;
alter table public.commande_lignes    enable row level security;
alter table public.commande_groupes   enable row level security;

revoke all on table public.commande_habituels from public, anon, authenticated;
revoke all on table public.commandes          from public, anon, authenticated;
revoke all on table public.commande_lignes    from public, anon, authenticated;
revoke all on table public.commande_groupes   from public, anon, authenticated;
grant select, insert, update, delete on table public.commande_habituels to authenticated;
grant select, insert, update, delete on table public.commandes          to authenticated;
grant select, insert, update, delete on table public.commande_lignes    to authenticated;
grant select, insert, update, delete on table public.commande_groupes   to authenticated;

-- commande_habituels : lus par l'équipe, écrits par la direction ; fournisseur
-- et produit de la même maison.
drop policy if exists commande_habituels_select on public.commande_habituels;
create policy commande_habituels_select on public.commande_habituels
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists commande_habituels_insert on public.commande_habituels;
create policy commande_habituels_insert on public.commande_habituels
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine')
    and exists (select 1 from public.fournisseurs f
                where f.id = commande_habituels.fournisseur_id
                  and f.etablissement_id = commande_habituels.etablissement_id)
    and exists (select 1 from public.produits p
                where p.id = commande_habituels.produit_id
                  and p.etablissement_id = commande_habituels.etablissement_id));

drop policy if exists commande_habituels_update on public.commande_habituels;
create policy commande_habituels_update on public.commande_habituels
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'))
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine')
    and exists (select 1 from public.fournisseurs f
                where f.id = commande_habituels.fournisseur_id
                  and f.etablissement_id = commande_habituels.etablissement_id)
    and exists (select 1 from public.produits p
                where p.id = commande_habituels.produit_id
                  and p.etablissement_id = commande_habituels.etablissement_id));

drop policy if exists commande_habituels_delete on public.commande_habituels;
create policy commande_habituels_delete on public.commande_habituels
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

-- commandes : l'équipe ; fournisseur de la même maison. Suppression : un
-- brouillon par l'équipe, toute commande par la direction.
drop policy if exists commandes_select on public.commandes;
create policy commandes_select on public.commandes
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists commandes_insert on public.commandes;
create policy commandes_insert on public.commandes
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
    and (fournisseur_id is null
         or exists (select 1 from public.fournisseurs f
                    where f.id = commandes.fournisseur_id
                      and f.etablissement_id = commandes.etablissement_id)));

drop policy if exists commandes_update on public.commandes;
create policy commandes_update on public.commandes
  for update to authenticated
  using (user_can_access_etab(etablissement_id))
  with check (user_can_access_etab(etablissement_id)
    and (fournisseur_id is null
         or exists (select 1 from public.fournisseurs f
                    where f.id = commandes.fournisseur_id
                      and f.etablissement_id = commandes.etablissement_id)));

drop policy if exists commandes_delete on public.commandes;
create policy commandes_delete on public.commandes
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
    and (statut = 'brouillon'
         or (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine')));

-- commande_lignes : celles des commandes de la maison ; produit de la même
-- maison.
drop policy if exists commande_lignes_select on public.commande_lignes;
create policy commande_lignes_select on public.commande_lignes
  for select to authenticated
  using (exists (select 1 from public.commandes c
                 where c.id = commande_lignes.commande_id
                   and user_can_access_etab(c.etablissement_id)));

drop policy if exists commande_lignes_insert on public.commande_lignes;
create policy commande_lignes_insert on public.commande_lignes
  for insert to authenticated
  with check (exists (select 1 from public.commandes c
                      where c.id = commande_lignes.commande_id
                        and user_can_access_etab(c.etablissement_id)
                        and (commande_lignes.produit_id is null
                             or exists (select 1 from public.produits p
                                        where p.id = commande_lignes.produit_id
                                          and p.etablissement_id = c.etablissement_id))));

drop policy if exists commande_lignes_update on public.commande_lignes;
create policy commande_lignes_update on public.commande_lignes
  for update to authenticated
  using (exists (select 1 from public.commandes c
                 where c.id = commande_lignes.commande_id
                   and user_can_access_etab(c.etablissement_id)))
  with check (exists (select 1 from public.commandes c
                      where c.id = commande_lignes.commande_id
                        and user_can_access_etab(c.etablissement_id)
                        and (commande_lignes.produit_id is null
                             or exists (select 1 from public.produits p
                                        where p.id = commande_lignes.produit_id
                                          and p.etablissement_id = c.etablissement_id))));

drop policy if exists commande_lignes_delete on public.commande_lignes;
create policy commande_lignes_delete on public.commande_lignes
  for delete to authenticated
  using (exists (select 1 from public.commandes c
                 where c.id = commande_lignes.commande_id
                   and user_can_access_etab(c.etablissement_id)));

-- commande_groupes : ceux des commandes de la maison ; groupe de la même
-- maison.
drop policy if exists commande_groupes_select on public.commande_groupes;
create policy commande_groupes_select on public.commande_groupes
  for select to authenticated
  using (exists (select 1 from public.commandes c
                 where c.id = commande_groupes.commande_id
                   and user_can_access_etab(c.etablissement_id)));

drop policy if exists commande_groupes_insert on public.commande_groupes;
create policy commande_groupes_insert on public.commande_groupes
  for insert to authenticated
  with check (exists (select 1 from public.commandes c
                      join public.groupe_evenements g on g.id = commande_groupes.groupe_evenement_id
                      where c.id = commande_groupes.commande_id
                        and g.etablissement_id = c.etablissement_id
                        and user_can_access_etab(c.etablissement_id)));

drop policy if exists commande_groupes_update on public.commande_groupes;
create policy commande_groupes_update on public.commande_groupes
  for update to authenticated
  using (exists (select 1 from public.commandes c
                 where c.id = commande_groupes.commande_id
                   and user_can_access_etab(c.etablissement_id)))
  with check (exists (select 1 from public.commandes c
                      join public.groupe_evenements g on g.id = commande_groupes.groupe_evenement_id
                      where c.id = commande_groupes.commande_id
                        and g.etablissement_id = c.etablissement_id
                        and user_can_access_etab(c.etablissement_id)));

drop policy if exists commande_groupes_delete on public.commande_groupes;
create policy commande_groupes_delete on public.commande_groupes
  for delete to authenticated
  using (exists (select 1 from public.commandes c
                 where c.id = commande_groupes.commande_id
                   and user_can_access_etab(c.etablissement_id)));


-- =============================================================================
-- 7. pertes : liens et produits fréquents
-- =============================================================================

alter table public.pertes
  add column if not exists produit_id  text references public.produits(id) on delete set null,
  add column if not exists recette_id  text references public.recettes(id) on delete set null,
  add column if not exists mep_item_id uuid references public.mep_items(id) on delete set null,
  add column if not exists source      text not null default 'saisie'
    constraint pertes_source_check check (source in ('saisie', 'frequent', 'mep'));

comment on column public.pertes.produit_id is 'Produit du catalogue perdu (lot 4a). Le texte produit reste le libellé affiché.';
comment on column public.pertes.recette_id is 'Préparation perdue (lot 4a), par exemple une ligne de mise en place jetée.';
comment on column public.pertes.mep_item_id is 'Ligne de mise en place déclarée « jetée » (lot 4a). Une seule perte par ligne.';
comment on column public.pertes.source is 'saisie (formulaire), frequent (produit fréquent, deux touches), mep (jeté depuis la mise en place).';

create index if not exists idx_pertes_produit on public.pertes (produit_id) where produit_id is not null;
create index if not exists idx_pertes_recette on public.pertes (recette_id) where recette_id is not null;
create unique index if not exists pertes_mep_item_key on public.pertes (mep_item_id) where mep_item_id is not null;

-- Produit, recette et ligne de mise en place de la même maison que la perte.
-- INVOKER : une ligne que l'appelant ne voit pas est refusée comme absente.
create or replace function public.pertes_liens_coherents()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
begin
  if new.produit_id is not null
     and (tg_op = 'INSERT' or new.produit_id is distinct from old.produit_id or new.etablissement_id is distinct from old.etablissement_id)
     and not exists (select 1 from public.produits p
                     where p.id = new.produit_id and p.etablissement_id = new.etablissement_id) then
    raise exception 'Ce produit n''est pas dans le catalogue de l''établissement.' using errcode = '23514';
  end if;
  if new.recette_id is not null
     and (tg_op = 'INSERT' or new.recette_id is distinct from old.recette_id or new.etablissement_id is distinct from old.etablissement_id)
     and not exists (select 1 from public.recettes r
                     where r.id = new.recette_id and r.etablissement_id = new.etablissement_id) then
    raise exception 'Cette recette n''est pas dans l''établissement.' using errcode = '23514';
  end if;
  if new.mep_item_id is not null
     and (tg_op = 'INSERT' or new.mep_item_id is distinct from old.mep_item_id or new.etablissement_id is distinct from old.etablissement_id)
     and not exists (select 1 from public.mep_items i
                     join public.mep_listes l on l.id = i.liste_id
                     where i.id = new.mep_item_id and l.etablissement_id = new.etablissement_id) then
    raise exception 'Cette ligne de mise en place n''est pas dans l''établissement.' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

revoke all on function public.pertes_liens_coherents() from public, anon, authenticated;

create or replace trigger trg_pertes_liens_coherents
  before insert or update of produit_id, recette_id, mep_item_id, etablissement_id on public.pertes
  for each row execute function public.pertes_liens_coherents();

-- Produits les plus déclarés sur p_jours (60 par défaut), avec la dernière
-- déclaration de chacun (quantité, unité, motif, valeur) pour la proposer
-- telle quelle : une touche sur le produit, une touche pour valider. Une ligne
-- par produit du catalogue, sinon par recette, sinon par libellé.
-- INVOKER : seules les pertes que l'appelant voit comptent.
create or replace function public.pertes_frequentes(
  p_etablissement_id text,
  p_jours            integer default 60,
  p_limite           integer default 12)
returns table (
  cle         text,
  produit_id  text,
  recette_id  text,
  produit     text,
  categorie   text,
  unite       text,
  quantite    numeric,
  valeur_unit numeric,
  motif       text,
  nb          integer,
  derniere    date)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $fn$
  with recentes as (
    select pe.*,
           coalesce('p:' || pe.produit_id, 'r:' || pe.recette_id, 'n:' || lower(btrim(pe.produit))) as cle_perte
      from public.pertes pe
     where pe.etablissement_id = p_etablissement_id
       and pe.date >= (now() at time zone 'Europe/Zurich')::date - greatest(least(coalesce(p_jours, 60), 365), 1)
       and coalesce(btrim(pe.produit), '') <> ''
  ),
  derniere as (
    select distinct on (r.cle_perte) r.*
      from recentes r
     order by r.cle_perte, r.date desc, r.created_at desc nulls last
  ),
  comptes as (
    select r.cle_perte, count(*)::integer as nb from recentes r group by r.cle_perte
  )
  select d.cle_perte, d.produit_id, d.recette_id, d.produit, d.categorie, d.unite,
         d.quantite, d.valeur_unit, d.motif, c.nb, d.date
    from derniere d
    join comptes c on c.cle_perte = d.cle_perte
   order by c.nb desc, d.date desc, d.produit
   limit greatest(least(coalesce(p_limite, 12), 50), 1)
$fn$;

revoke all on function public.pertes_frequentes(text, integer, integer) from public, anon, authenticated;
grant execute on function public.pertes_frequentes(text, integer, integer) to authenticated;


-- =============================================================================
-- 8. Mise en place : poste, modèle, liste J+1
-- =============================================================================

alter table public.mep_listes
  add column if not exists poste       text
    constraint mep_listes_poste_check check (poste is null or (btrim(poste) <> '' and length(poste) <= 60)),
  add column if not exists modele_id   uuid references public.mep_modeles(id) on delete set null,
  add column if not exists origine     text not null default 'manuel'
    constraint mep_listes_origine_check check (origine in ('manuel', 'modele', 'prevision')),
  add column if not exists base_calcul jsonb
    constraint mep_listes_base_calcul_check check (base_calcul is null or jsonb_typeof(base_calcul) = 'object');

comment on column public.mep_listes.poste is 'Poste de la liste (réglage mep.postes, lot 2). Null = toute la cuisine.';
comment on column public.mep_listes.modele_id is 'Modèle d''où la liste est partie (mep_modeles).';
comment on column public.mep_listes.origine is 'manuel, modele, ou prevision (liste J+1 pré-remplie par les ventes et la prévision des couverts).';
comment on column public.mep_listes.base_calcul is 'Ce qui a servi au calcul J+1, pour l''afficher : { jours_ventes, jour_semaine, couverts_prevus, couverts_reference }.';

create index if not exists idx_mep_listes_etab_date on public.mep_listes (etablissement_id, date_service);
create index if not exists idx_mep_listes_modele on public.mep_listes (modele_id) where modele_id is not null;

alter table public.mep_items
  add column if not exists quantite_suggeree numeric
    constraint mep_items_quantite_suggeree_check check (quantite_suggeree is null or (quantite_suggeree >= 0 and quantite_suggeree < 1000000)),
  add column if not exists origine text
    constraint mep_items_origine_check check (origine is null or origine in ('manuel', 'modele', 'ventes', 'prevision'));

comment on column public.mep_items.quantite_suggeree is 'Quantité proposée par l''app (ventes et prévision), gardée à côté de la quantité retenue.';
comment on column public.mep_items.origine is 'D''où vient la ligne : manuel, modele, ventes ou prevision.';

-- Le modèle d'une liste est de la même maison. INVOKER : un modèle que
-- l'appelant ne voit pas est refusé comme absent.
create or replace function public.mep_listes_modele_coherent()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
begin
  if new.modele_id is not null
     and (tg_op = 'INSERT' or new.modele_id is distinct from old.modele_id or new.etablissement_id is distinct from old.etablissement_id)
     and not exists (select 1 from public.mep_modeles m
                     where m.id = new.modele_id and m.etablissement_id = new.etablissement_id) then
    raise exception 'Ce modèle de mise en place n''est pas dans l''établissement.' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

revoke all on function public.mep_listes_modele_coherent() from public, anon, authenticated;

create or replace trigger trg_mep_listes_modele_coherent
  before insert or update of modele_id, etablissement_id on public.mep_listes
  for each row execute function public.mep_listes_modele_coherent();


-- =============================================================================
-- 9. Ventes POS : règles de correspondance par maison
-- =============================================================================

create table if not exists public.pos_regles_correspondance (
  id                uuid        primary key default gen_random_uuid(),
  etablissement_id  text        not null references public.etablissements(id) on delete cascade,
  motif             text        not null,
  mode              text        not null default 'contient',
  action            text        not null default 'relier',
  recette_id        text        references public.recettes(id) on delete cascade,
  priorite          smallint    not null default 0,
  actif             boolean     not null default true,
  updated_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint pos_regles_motif_check check (btrim(motif) <> '' and length(motif) <= 120),
  constraint pos_regles_mode_check check (mode in ('exact', 'contient', 'commence')),
  constraint pos_regles_action_check check (action in ('relier', 'ignorer')),
  constraint pos_regles_action_recette_check check ((action = 'relier') = (recette_id is not null)),
  constraint pos_regles_priorite_check check (priorite between -100 and 100)
);

comment on table public.pos_regles_correspondance is
  'Règles de correspondance des articles de caisse avec les fiches, par maison (lot 4a). motif comparé au nom de l''article normalisé (casse et accents gommés) selon mode ; action relier (recette_id) ou ignorer (pas un plat : boisson, supplément). Priorité la plus haute d''abord, puis le motif le plus long.';

create unique index if not exists pos_regles_motif_key
  on public.pos_regles_correspondance (etablissement_id, mode, lower(btrim(motif)));
create index if not exists idx_pos_regles_recette on public.pos_regles_correspondance (recette_id) where recette_id is not null;

create or replace trigger trg_pos_regles_avant_ecriture
  before insert or update on public.pos_regles_correspondance
  for each row execute function public.commande_cibles_avant_ecriture();

alter table public.pos_regles_correspondance enable row level security;
revoke all on table public.pos_regles_correspondance from public, anon, authenticated;
grant select, insert, update, delete on table public.pos_regles_correspondance to authenticated;

drop policy if exists pos_regles_select on public.pos_regles_correspondance;
create policy pos_regles_select on public.pos_regles_correspondance
  for select to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine', 'cuisinier'));

drop policy if exists pos_regles_insert on public.pos_regles_correspondance;
create policy pos_regles_insert on public.pos_regles_correspondance
  for insert to authenticated
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine')
    and (recette_id is null
         or exists (select 1 from public.recettes r
                    where r.id = pos_regles_correspondance.recette_id
                      and r.etablissement_id = pos_regles_correspondance.etablissement_id)));

drop policy if exists pos_regles_update on public.pos_regles_correspondance;
create policy pos_regles_update on public.pos_regles_correspondance
  for update to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'))
  with check (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine')
    and (recette_id is null
         or exists (select 1 from public.recettes r
                    where r.id = pos_regles_correspondance.recette_id
                      and r.etablissement_id = pos_regles_correspondance.etablissement_id)));

drop policy if exists pos_regles_delete on public.pos_regles_correspondance;
create policy pos_regles_delete on public.pos_regles_correspondance
  for delete to authenticated
  using (user_can_access_etab(etablissement_id)
    and (select public.current_user_role()) in ('consultant', 'patron', 'resp_cuisine'));

-- La règle qui a relié un article, pour la montrer et la défaire en série.
alter table public.pos_item_recipe_mapping
  add column if not exists regle_id uuid references public.pos_regles_correspondance(id) on delete set null;

comment on column public.pos_item_recipe_mapping.regle_id is 'Règle de correspondance qui a relié l''article (lot 4a). Null = relié à la main ou par suggestion.';

create index if not exists idx_pos_mapping_regle on public.pos_item_recipe_mapping (regle_id) where regle_id is not null;


-- =============================================================================
-- 10. recettes_relier_ingredients
-- =============================================================================

-- Relie au produit p_produit_id toutes les lignes d'ingrédient données, en une
-- transaction, sans réécrire le reste des fiches (une modification faite en
-- même temps sur une autre ligne de la fiche est gardée).
--   p_liens : [{ recette_id, ingredient_id, prix_unit, unite }] ; prix_unit et
--   unite sont ceux que l'app calcule (applyProductToIngredient), facultatifs.
-- Chaque ligne reliée prend produitId (et prixUnit, unite s'ils sont donnés) et
-- perd needsReview et matchSuggestions, comme dans l'éditeur.
-- Seules les fiches de la maison du produit sont touchées.
-- Rend { relies, attendus } : relies < attendus quand une ligne a disparu
-- entre-temps, relies > attendus quand une fiche porte deux lignes de même id.
-- INVOKER : la RLS de l'appelant s'applique aux produits et aux fiches.
create or replace function public.recettes_relier_ingredients(
  p_produit_id text,
  p_liens      jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $fn$
declare
  v_etab     text;
  v_relies   integer := 0;
  v_attendus integer;
  v_n        integer;
  r          record;
begin
  if jsonb_typeof(p_liens) is distinct from 'array' or jsonb_array_length(p_liens) > 5000 then
    raise exception 'Liens invalides.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_liens) e
             where jsonb_typeof(e) <> 'object'
                or coalesce(e->>'recette_id', '') = ''
                or coalesce(e->>'ingredient_id', '') = ''
                or (e ? 'prix_unit' and jsonb_typeof(e->'prix_unit') not in ('number', 'null'))
                or (e ? 'unite' and jsonb_typeof(e->'unite') not in ('string', 'null'))) then
    raise exception 'Chaque lien donne recette_id et ingredient_id ; prix_unit est un nombre, unite un texte.' using errcode = '22023';
  end if;

  select p.etablissement_id into v_etab from public.produits p where p.id = p_produit_id;
  if not found then
    raise exception 'Produit introuvable.' using errcode = 'P0002';
  end if;

  select count(distinct (e->>'recette_id', e->>'ingredient_id')) into v_attendus
    from jsonb_array_elements(p_liens) e;

  for r in
    select e->>'recette_id' as recette_id,
           jsonb_object_agg(e->>'ingredient_id', e) as liens
      from jsonb_array_elements(p_liens) e
     group by e->>'recette_id'
  loop
    with cible as (
      select rc.id, rc.ingredients
        from public.recettes rc
       where rc.id = r.recette_id
         and rc.etablissement_id = v_etab
         and jsonb_typeof(rc.ingredients) = 'array'
       for update
    ),
    nouveau as (
      select c.id,
             count(*) filter (where jsonb_typeof(t.e) = 'object' and r.liens ? (t.e->>'id')) as n,
             jsonb_agg(
               case when jsonb_typeof(t.e) = 'object' and r.liens ? (t.e->>'id') then
                 (t.e - 'needsReview' - 'matchSuggestions')
                   || jsonb_build_object('produitId', p_produit_id)
                   || case when jsonb_typeof(r.liens->(t.e->>'id')->'prix_unit') = 'number'
                           then jsonb_build_object('prixUnit', r.liens->(t.e->>'id')->'prix_unit') else '{}'::jsonb end
                   || case when jsonb_typeof(r.liens->(t.e->>'id')->'unite') = 'string'
                           then jsonb_build_object('unite', r.liens->(t.e->>'id')->'unite') else '{}'::jsonb end
               else t.e end
               order by t.ord) as ingredients
        from cible c
        cross join lateral jsonb_array_elements(c.ingredients) with ordinality as t(e, ord)
       group by c.id
    )
    update public.recettes rc
       set ingredients = nv.ingredients
      from nouveau nv
     where rc.id = nv.id
       and nv.n > 0
    returning nv.n into v_n;
    v_relies := v_relies + coalesce(v_n, 0);
    v_n := null;
  end loop;

  return jsonb_build_object('relies', v_relies, 'attendus', v_attendus);
end;
$fn$;

revoke all on function public.recettes_relier_ingredients(text, jsonb) from public, anon, authenticated;
grant execute on function public.recettes_relier_ingredients(text, jsonb) to authenticated;


-- =============================================================================
-- Realtime : la réception se coche sur une tablette pendant qu'une autre
-- regarde la commande. La RLS filtre les abonnés.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'commandes') then
      execute 'alter publication supabase_realtime add table public.commandes';
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'commande_lignes') then
      execute 'alter publication supabase_realtime add table public.commande_lignes';
    end if;
  end if;
end $$;


-- =============================================================================
-- Garde finale : aucune policy d'un autre nom sur les tables neuves. Une
-- policy inconnue s'ajouterait en OU à celles-ci et en annulerait les
-- restrictions.
-- =============================================================================

do $$
declare
  v_inconnues text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into v_inconnues
  from pg_policies
  where schemaname = 'public'
    and tablename in ('commande_habituels', 'commandes', 'commande_lignes', 'commande_groupes', 'pos_regles_correspondance')
    and policyname not in (
      'commande_habituels_select', 'commande_habituels_insert', 'commande_habituels_update', 'commande_habituels_delete',
      'commandes_select', 'commandes_insert', 'commandes_update', 'commandes_delete',
      'commande_lignes_select', 'commande_lignes_insert', 'commande_lignes_update', 'commande_lignes_delete',
      'commande_groupes_select', 'commande_groupes_insert', 'commande_groupes_update', 'commande_groupes_delete',
      'pos_regles_select', 'pos_regles_insert', 'pos_regles_update', 'pos_regles_delete');
  if v_inconnues is not null then
    raise exception 'Policies inattendues sur les tables du lot 4a : %', v_inconnues;
  end if;
end $$;
