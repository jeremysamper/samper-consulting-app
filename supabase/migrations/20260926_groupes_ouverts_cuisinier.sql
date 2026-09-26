-- ============================================================================
-- Groupes : le cuisinier peut créer, modifier et annuler un groupe
--
-- Jusqu'ici réservé au consultant, au patron, au responsable cuisine et à
-- l'hôte ; le cuisinier ne pouvait que faire avancer l'état (à lire → lu →
-- prêt). Demande du 26.09.2026 : ouvrir la saisie des groupes aux cuisiniers.
--
-- APPLIQUÉ EN PROD via MCP le 26.09.2026, avant le front, après essai à blanc
-- en cuisinier (création, modification, annulation acceptées ; suppression
-- définitive 0 ligne ; menus refusés 42501). Miroir repo == prod.
--
-- Élargissement pur (expand) : le front déployé avant lui reste compatible, il
-- n'affichait simplement pas le bouton au cuisinier.
--
-- Ne change PAS :
--   · la suppression définitive (groupe_evenements_delete) : patron + consultant ;
--   · les menus n°1 à 5 (groupe_menus_*) : consultant, patron, resp. cuisine.
--
-- Serveur exclu exprès : il n'a pas la main sur la cuisine.
-- ============================================================================

-- ── Création ────────────────────────────────────────────────────────────────
drop policy if exists groupe_evenements_insert on public.groupe_evenements;
create policy groupe_evenements_insert on public.groupe_evenements
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine','hote','cuisinier'])
  );

-- ── Modification / annulation : garde du trigger (la policy update est ouverte
--    à tout membre de l'établissement, c'est le trigger qui trie les rôles) ────
create or replace function public.groupe_evenements_avant_maj()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  contenu_change boolean;
  a_relire       boolean := false;
  role_courant   text;
begin
  if new.etablissement_id is distinct from old.etablissement_id then
    raise exception 'Un groupe ne change pas d''établissement.' using errcode = '42501';
  end if;

  -- Tout ce qui n'est pas l'état de préparation.
  contenu_change :=
    (new.date_evenement, new.heure, new.type_groupe, new.menu_numero, new.nom,
     new.contact, new.nb_pax, new.allergenes_ids, new.allergies_note,
     new.modifications, new.commentaires, new.annule)
    is distinct from
    (old.date_evenement, old.heure, old.type_groupe, old.menu_numero, old.nom,
     old.contact, old.nb_pax, old.allergenes_ids, old.allergies_note,
     old.modifications, old.commentaires, old.annule);

  if contenu_change then
    -- Hors session applicative (éditeur SQL, service role : auth.uid() nul) on
    -- laisse passer, comme le fait la RLS pour ces appelants. On teste auth.uid()
    -- et non le rôle : current_user_role() rend '' - pas NULL - sans session, et
    -- un utilisateur connecté SANS profil ('' lui aussi) doit, lui, être refusé.
    role_courant := current_user_role();
    if (select auth.uid()) is not null
       and coalesce(role_courant, '') <> all (array['consultant','patron','resp_cuisine','hote','cuisinier']) then
      raise exception 'Seuls le patron, le responsable cuisine, le cuisinier, l''hôte et le consultant peuvent modifier un groupe.'
        using errcode = '42501';
    end if;

    -- Ce que la brigade doit relire. Le nom et le contact du client n'en font
    -- pas partie : corriger un numéro de téléphone ne change rien en cuisine.
    a_relire :=
      (new.date_evenement, new.heure, new.type_groupe, new.menu_numero, new.nb_pax,
       new.allergenes_ids, new.allergies_note, new.modifications, new.commentaires)
      is distinct from
      (old.date_evenement, old.heure, old.type_groupe, old.menu_numero, old.nb_pax,
       old.allergenes_ids, old.allergies_note, old.modifications, old.commentaires)
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
