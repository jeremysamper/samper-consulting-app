-- Inverse de 20261115_points_pointage_borne : remet points_trg_shifts au corps
-- de 20261115_points_indicateurs.sql (sans borne avant le début). Un passage.

set local lock_timeout = '3s';

create or replace function public.points_trg_shifts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_maintenant timestamp := now() at time zone 'Europe/Zurich';
begin
  if tg_op = 'UPDATE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id) then
      return null;
    end if;
    if old.pointage_debut is null and new.pointage_debut is not null then
      if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
        return null;
      end if;
      -- Un service programmé, pas un pointage hors planning.
      if new.debut = new.fin or coalesce(new.note, '') = 'Pointage hors planning' then
        return null;
      end if;
      -- L'heure de début décalée dans la même écriture : rien.
      if new.debut is distinct from old.debut then
        return null;
      end if;
      -- À l'heure : au plus l'heure de début (le pointage est noté à la minute).
      if new.pointage_debut > new.debut then
        return null;
      end if;
      -- Heure du serveur : écrite maintenant, à deux minutes près (la minute
      -- tronquée comprise). Hors ligne synchronisé tard, correction à la main :
      -- rien.
      if abs(extract(epoch from (v_maintenant - (new.date + new.pointage_debut)))) > 180 then
        return null;
      end if;
      perform public.points_verser(new.etablissement_id, new.user_id, 'pointage_ponctuel', 'shifts', new.id,
        'pointage:' || new.id);
    elsif old.pointage_debut is not null then
      -- Pointage effacé ou passé en retard : annulation, une fois.
      perform public.points_annuler('shifts', old.id);
    end if;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('shifts', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_shifts : %', sqlerrm;
  return null;
end;
$fn$;
