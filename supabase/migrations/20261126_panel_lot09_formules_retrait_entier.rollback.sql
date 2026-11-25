-- Rollback de 20261126_panel_lot09_formules_retrait_entier.sql : remet
-- caisse_retirer_formule telle que le lot 09 l'a créée (sans le refus d'un
-- groupe partagé entre deux tickets).
begin;
create or replace function public.caisse_retirer_formule(p_ticket_id uuid, p_groupe uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    text := auth.uid()::text;
  v_ticket public.caisse_tickets%rowtype;
  v_role   text;
  v_n      int;
begin
  if v_uid is null then
    raise exception 'caisse: connexion requise' using errcode = '42501';
  end if;
  select * into v_ticket from public.caisse_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'caisse: ticket introuvable';
  end if;
  v_role := public.caisse_role_actif(v_ticket.etablissement_id);
  if v_role is null or not coalesce(public.caisse_peut_utiliser(v_ticket.etablissement_id), false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_ticket.statut <> 'ouvert' then
    raise exception 'caisse: ticket fige, lignes comprises';
  end if;
  if exists (select 1 from public.caisse_lignes
              where ticket_id = p_ticket_id and formule_groupe = p_groupe
                and statut <> 'en_attente')
     and not (v_role = any(array['consultant', 'patron'])) then
    raise exception 'caisse: ligne deja envoyee (retrait par la direction seulement)';
  end if;

  delete from public.caisse_lignes
   where ticket_id = p_ticket_id and formule_groupe = p_groupe;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.caisse_retirer_formule(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.caisse_retirer_formule(uuid, uuid) to authenticated;
alter function public.caisse_retirer_formule(uuid, uuid) owner to postgres;
commit;
