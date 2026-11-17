-- ================================================================
-- Allergènes cochés sur la réservation d'une table en ligne.
--
-- La page /table/<adresse> écrit en tête du message la ligne
-- « Allergies : gluten, fruits à coque » (libellés du référentiel,
-- src/utils/allergenes.js). La fonction resa_reserver_en_ligne la range
-- dans reservations.notes_libres, origine 'en_ligne'. Ce déclencheur en
-- tire les tags « allergène » de la réservation (reservation_tags), au
-- libellé en minuscules comme le formulaire de l'équipe : la caisse les
-- croise avec les fiches des plats commandés.
--
-- Additif : aucune colonne ni fonction existante ne change ; l'Edge
-- Function spa-mailer n'est pas redéployée. Seule une valeur du
-- référentiel devient un tag ; une erreur ne coûte jamais la réservation.
-- Retour arrière : drop trigger + drop function (bas du fichier).
-- ================================================================

create or replace function public.resa_tags_allergenes_en_ligne()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ligne text;
  v_valeur text;
  v_autorises constant text[] := array[
    'gluten', 'lactose', 'œufs', 'poissons', 'crustacés', 'fruits à coque', 'sulfites',
    'arachides', 'soja', 'céleri', 'moutarde', 'sésame', 'mollusques', 'lupin'
  ];
begin
  if new.origine is distinct from 'en_ligne' or new.notes_libres is null then
    return new;
  end if;
  v_ligne := substring(new.notes_libres from '^Allergies : ([^\n]+)');
  if v_ligne is null then
    return new;
  end if;
  begin
    foreach v_valeur in array string_to_array(v_ligne, ',') loop
      v_valeur := lower(btrim(v_valeur));
      if v_valeur = any (v_autorises) and not exists (
        select 1 from public.reservation_tags t
        where t.reservation_id = new.id and t.type_tag = 'allergene' and t.valeur = v_valeur
      ) then
        insert into public.reservation_tags (reservation_id, type_tag, valeur, libre)
        values (new.id, 'allergene', v_valeur, false);
      end if;
    end loop;
  exception when others then
    raise warning 'resa_tags_allergenes_en_ligne : % (%)', sqlerrm, new.id;
  end;
  return new;
end $$;

revoke all on function public.resa_tags_allergenes_en_ligne() from public, anon, authenticated;

drop trigger if exists trg_resa_tags_allergenes_en_ligne on public.reservations;
create trigger trg_resa_tags_allergenes_en_ligne
  after insert on public.reservations
  for each row execute function public.resa_tags_allergenes_en_ligne();

-- Retour arrière :
--   drop trigger if exists trg_resa_tags_allergenes_en_ligne on public.reservations;
--   drop function if exists public.resa_tags_allergenes_en_ligne();
