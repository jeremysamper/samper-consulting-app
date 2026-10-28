-- ════════════════════════════════════════════════════════════════════════════
-- Groupes : le droit « Modifier » réglé dans Rôles & accès vaut en base
-- ───────────────────────────────────────────────────────────────────────────
-- Demande de Jérémy (28.10.2026) : le compte « Woodland Service » (rôle
-- serveur, iPad de la salle) doit pouvoir créer et modifier les groupes.
--
-- Jusqu'ici la création (politique groupe_evenements_insert) et la
-- modification du contenu (déclencheur groupe_evenements_avant_maj) étaient
-- réservées en dur aux rôles consultant, patron, resp_cuisine, hote et
-- cuisinier. Ouvrir le rôle serveur entier l'aurait donné à toute la salle ;
-- la case « Modifier » d'une seule personne était verrouillée à l'écran,
-- parce que la base l'aurait refusée.
--
-- Désormais les deux gardes demandent user_peut_gerer('groupes', <rôles par
-- défaut>), comme les Réservations depuis 20261001 : consultant, puis écart de
-- la personne, puis réglage du rôle, puis la liste ci-dessous. Relevé en prod
-- le 28.10.2026 : aucune ligne de permissions ni de permissions_utilisateurs
-- ne porte manage:groupes. Le résultat est donc IDENTIQUE à l'ancienne liste
-- pour tous les comptes existants ; le serveur reste exclu par défaut.
--
-- Ne change PAS :
--   - l'état à lire / lu / prêt, ouvert à toute la brigade (politique UPDATE
--     ouverte, le déclencheur ne trie que le contenu) ;
--   - la suppression définitive (groupe_evenements_delete) : patron + consultant ;
--   - les menus (groupe_menus_*) : consultant, patron, resp. cuisine.
--
-- Le corps du déclencheur reprend à l'identique la version en production
-- (20261014_groupes_menus_a_choix.sql) ; seuls le test de rôle et son message
-- changent. Élargissement pur (expand) : le front déployé avant lui garde ses
-- listes de rôles et reste compatible. Idempotente. Rollback en fin de fichier.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Création ────────────────────────────────────────────────────────────────
drop policy if exists groupe_evenements_insert on public.groupe_evenements;
create policy groupe_evenements_insert on public.groupe_evenements
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select user_peut_gerer('groupes', array['consultant','patron','resp_cuisine','hote','cuisinier']))
  );

-- ── Modification / annulation : garde du déclencheur ────────────────────────
create or replace function public.groupe_evenements_avant_maj()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  contenu_change boolean;
  a_relire       boolean := false;
begin
  if new.etablissement_id is distinct from old.etablissement_id then
    raise exception 'Un groupe ne change pas d''établissement.' using errcode = '42501';
  end if;

  -- Tout ce qui n'est pas l'état de préparation.
  contenu_change :=
    (new.date_evenement, new.heure, new.type_groupe, new.menu_numero, new.nom,
     new.contact, new.nb_pax, new.allergenes_ids, new.allergies_note,
     new.modifications, new.commentaires, new.annule,
     new.choix, new.nb_vegetariens, new.nb_enfants)
    is distinct from
    (old.date_evenement, old.heure, old.type_groupe, old.menu_numero, old.nom,
     old.contact, old.nb_pax, old.allergenes_ids, old.allergies_note,
     old.modifications, old.commentaires, old.annule,
     old.choix, old.nb_vegetariens, old.nb_enfants);

  if contenu_change then
    -- Hors session applicative (éditeur SQL, service role : auth.uid() nul) on
    -- laisse passer, comme le fait la RLS pour ces appelants. Un utilisateur
    -- connecté SANS profil est refusé : user_peut_gerer rend faux pour un rôle
    -- vide.
    if (select auth.uid()) is not null
       and not user_peut_gerer('groupes', array['consultant','patron','resp_cuisine','hote','cuisinier']) then
      raise exception 'Vous n''avez pas le droit de modifier les groupes. Demandez-le au patron ou au consultant (Rôles & accès, case Modifier).'
        using errcode = '42501';
    end if;

    -- Ce que la brigade doit relire. Le nom et le contact du client n'en font
    -- pas partie : corriger un numéro de téléphone ne change rien en cuisine.
    -- Les choix du client, eux, changent ce qui est produit.
    a_relire :=
      (new.date_evenement, new.heure, new.type_groupe, new.menu_numero, new.nb_pax,
       new.allergenes_ids, new.allergies_note, new.modifications, new.commentaires,
       new.choix, new.nb_vegetariens, new.nb_enfants)
      is distinct from
      (old.date_evenement, old.heure, old.type_groupe, old.menu_numero, old.nb_pax,
       old.allergenes_ids, old.allergies_note, old.modifications, old.commentaires,
       old.choix, old.nb_vegetariens, old.nb_enfants)
      -- Rétablir un groupe annulé : pendant l'annulation la brigade a pu
      -- réaffecter ce qu'elle avait produit. La case ne revient pas verte.
      or (old.annule and not new.annule);

    if a_relire then
      new.statut     := 'a_lire';
      new.lu_par     := null;
      new.lu_at      := null;
      new.pret_par   := null;
      new.pret_at    := null;
      new.modifie_at := now();
    end if;
  end if;

  -- Horodatage de l'état, posé ici et non par le client : l'heure d'une
  -- tablette n'est pas une preuve, et « lu par » ne doit pas être falsifiable.
  if not a_relire and new.statut is distinct from old.statut then
    if new.statut = 'lu' then
      if old.lu_at is null then
        new.lu_par := (select auth.uid())::text;
        new.lu_at  := now();
      else
        new.lu_par := old.lu_par;
        new.lu_at  := old.lu_at;
      end if;
      new.pret_par := null;
      new.pret_at  := null;
    elsif new.statut = 'pret' then
      if old.lu_at is null then
        new.lu_par := (select auth.uid())::text;
        new.lu_at  := now();
      else
        new.lu_par := old.lu_par;
        new.lu_at  := old.lu_at;
      end if;
      new.pret_par := (select auth.uid())::text;
      new.pret_at  := now();
    else
      new.lu_par   := null;
      new.lu_at    := null;
      new.pret_par := null;
      new.pret_at  := null;
    end if;
  elsif not a_relire then
    -- État inchangé : les horodatages ne sont pas modifiables à la main.
    new.lu_par   := old.lu_par;
    new.lu_at    := old.lu_at;
    new.pret_par := old.pret_par;
    new.pret_at  := old.pret_at;
  end if;

  -- Colonnes système : jamais modifiables par un UPDATE, quel que soit le rôle.
  -- La politique UPDATE est ouverte à toute la brigade (pour l'état) ; sans ce
  -- gel un PATCH forgé pouvait changer la clé primaire ou antidater modifie_at.
  new.id         := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if not a_relire then
    new.modifie_at := old.modifie_at;
  end if;

  new.updated_at := now();
  return new;
end $$;

revoke all on function public.groupe_evenements_avant_maj() from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (à exécuter manuellement si besoin) :
--
--   1. Rejouer la section 3 (fonction groupe_evenements_avant_maj) de
--      20261014_groupes_menus_a_choix.sql.
--   2. drop policy if exists groupe_evenements_insert on public.groupe_evenements;
--      create policy groupe_evenements_insert on public.groupe_evenements
--        for insert to authenticated
--        with check (
--          user_can_access_etab(etablissement_id)
--          and (select current_user_role()) = any(array['consultant','patron','resp_cuisine','hote','cuisinier'])
--        );
--   3. Le front d'après cette migration ne connaît plus de liste de rôles pour
--      les groupes : le revenir aussi (commit précédent), sinon une personne
--      ouverte par écart verrait des boutons que la base refuse.
-- ════════════════════════════════════════════════════════════════════════════
