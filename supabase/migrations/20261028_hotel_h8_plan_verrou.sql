-- ════════════════════════════════════════════════════════════════════════════
-- Branche Hôtel, lot H8, correctif : le plan préventif d'un ordre ne se pose
-- ni ne change hors case Modifier de Technique, en mise à jour comme à
-- l'insertion. Avant ce correctif, l'auteur d'un ordre encore ouvert pouvait
-- lui relier un plan puis le terminer, ce qui datait le plan sans le droit.
-- Recrée hotel_h8_coherence (même corps, une garde de plus). Idempotente.
-- Inverse : rejouer la fonction de migrations/20261028_hotel_h8.sql.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.hotel_h8_coherence()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  gere boolean;
  moi text;
begin
  if tg_op = 'UPDATE' and new.etablissement_id <> old.etablissement_id then
    raise exception 'ETABLISSEMENT_FIXE: une ligne ne change pas d''établissement' using errcode = '23514';
  end if;
  if new.chambre_id is not null and (tg_op = 'INSERT' or new.chambre_id is distinct from old.chambre_id) and not exists (
    select 1 from public.chambres c where c.id = new.chambre_id and c.etablissement_id = new.etablissement_id
  ) then
    raise exception 'CHAMBRE_INCONNUE: la chambre n''appartient pas à cet établissement' using errcode = '23503';
  end if;

  if tg_table_name = 'equipements' then
    return new;
  end if;

  if new.equipement_id is not null and (tg_op = 'INSERT' or new.equipement_id is distinct from old.equipement_id) and not exists (
    select 1 from public.equipements e where e.id = new.equipement_id and e.etablissement_id = new.etablissement_id
  ) then
    raise exception 'EQUIPEMENT_INCONNU: l''équipement n''appartient pas à cet établissement' using errcode = '23503';
  end if;

  if tg_table_name = 'maintenance_plans' then
    -- Un plan neuf sans historique est à faire tout de suite (prochaine fois
    -- fournie ou défaut du jour, Zurich) ; sinon la prochaine fois découle de
    -- la dernière fois et de la périodicité.
    if new.derniere_fois > (now() at time zone 'Europe/Zurich')::date then
      raise exception 'DATE_FUTURE: la dernière fois ne peut pas être dans le futur' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' and new.derniere_fois is null then
      null;
    elsif tg_op = 'INSERT' or new.derniere_fois is distinct from old.derniere_fois or new.periodicite_jours <> old.periodicite_jours then
      new.prochaine_fois := coalesce(new.derniere_fois, (now() at time zone 'Europe/Zurich')::date) + new.periodicite_jours;
    end if;
    return new;
  end if;

  -- ordres_travail
  moi := (select auth.uid())::text;
  if new.demande_id is not null and (tg_op = 'INSERT' or new.demande_id is distinct from old.demande_id) and not exists (
    select 1 from public.demandes d where d.id = new.demande_id and d.etablissement_id = new.etablissement_id
  ) then
    raise exception 'DEMANDE_INCONNUE: la demande n''appartient pas à cet établissement' using errcode = '23503';
  end if;
  if new.plan_id is not null and (tg_op = 'INSERT' or new.plan_id is distinct from old.plan_id) and not exists (
    select 1 from public.maintenance_plans p where p.id = new.plan_id and p.etablissement_id = new.etablissement_id
  ) then
    raise exception 'PLAN_INCONNU: le plan n''appartient pas à cet établissement' using errcode = '23503';
  end if;
  if new.assigne_a is not null and (tg_op = 'INSERT' or new.assigne_a is distinct from old.assigne_a) and not exists (
    select 1 from public.profiles p where p.id = new.assigne_a and new.etablissement_id = any (p.etablissement_ids)
  ) then
    raise exception 'ASSIGNE_INCONNU: la personne n''appartient pas à cet établissement' using errcode = '23503';
  end if;

  if tg_op = 'INSERT' then
    if moi is not null then
      new.created_by := moi;
      -- Hors case Modifier : pas d'ordre préventif (il daterait le plan en
      -- se terminant), pas d'assignation à une autre personne.
      if not (select public.user_peut_gerer('technique', array['consultant', 'patron', 'technicien', 'gouvernante'])) then
        if new.plan_id is not null then
          raise exception 'ORDRE_RESERVE: un ordre préventif demande le droit Modifier de Technique' using errcode = '42501';
        end if;
        if new.assigne_a is not null and new.assigne_a <> moi then
          raise exception 'ORDRE_RESERVE: assigner un ordre à une autre personne demande le droit Modifier de Technique' using errcode = '42501';
        end if;
      end if;
    end if;
    if new.statut = 'termine' then
      new.termine_at := now();
      if moi is not null then new.termine_par := moi; end if;
    else
      new.termine_at := null; new.termine_par := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.created_by is distinct from old.created_by and moi is not null
     and (new.created_by is not null or exists (select 1 from public.profiles p where p.id = old.created_by)) then
    new.created_by := old.created_by;
  end if;
  if moi is not null then
    gere := (select public.user_peut_gerer('technique', array['consultant', 'patron', 'technicien', 'gouvernante']));
    if not gere then
      -- Se prendre un ordre libre est permis ; réassigner un ordre pris ne l'est pas.
      if new.assigne_a is distinct from old.assigne_a and not (old.assigne_a is null and new.assigne_a = moi) then
        raise exception 'ORDRE_RESERVE: réassigner un ordre demande le droit Modifier de Technique' using errcode = '42501';
      end if;
      -- Le plan d'origine ne se pose ni ne change hors case Modifier : un ordre
      -- préventif terminé date le plan (ordres_travail_apres_fin).
      if new.plan_id is distinct from old.plan_id then
        raise exception 'ORDRE_RESERVE: relier un ordre à un plan préventif demande le droit Modifier de Technique' using errcode = '42501';
      end if;
      if old.assigne_a is distinct from moi and old.created_by is distinct from moi and new.assigne_a is distinct from moi then
        raise exception 'ORDRE_RESERVE: seule la personne assignée ou l''auteur fait avancer cet ordre' using errcode = '42501';
      end if;
      if new.titre <> old.titre or new.detail is distinct from old.detail or new.categorie <> old.categorie or new.priorite <> old.priorite
         or new.chambre_id is distinct from old.chambre_id or new.equipement_id is distinct from old.equipement_id or new.lieu is distinct from old.lieu
         or new.demande_id is distinct from old.demande_id or new.plan_id is distinct from old.plan_id then
        if old.created_by is distinct from moi or old.statut not in ('ouvert', 'planifie') then
          raise exception 'ORDRE_RESERVE: le contenu d''un ordre se corrige par son auteur tant qu''il n''est pas commencé, sinon avec le droit Modifier de Technique' using errcode = '42501';
        end if;
      end if;
    end if;
  end if;
  if new.statut = 'termine' and old.statut <> 'termine' then
    new.termine_at := now();
    new.termine_par := coalesce(moi, new.termine_par);
  elsif new.statut = 'termine' then
    new.termine_at := old.termine_at;
    if new.termine_par is distinct from old.termine_par and moi is not null
       and (new.termine_par is not null or exists (select 1 from public.profiles p where p.id = old.termine_par)) then
      new.termine_par := old.termine_par;
    end if;
  else
    new.termine_at := null; new.termine_par := null;
  end if;
  return new;
end;
$$;

revoke all on function public.hotel_h8_coherence() from public, anon, authenticated;
