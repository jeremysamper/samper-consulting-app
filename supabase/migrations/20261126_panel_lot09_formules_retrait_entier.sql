-- Lot 09 du panel, suite (26.11.2026) : une formule se retire toujours entière.
--
-- Un compte de l'API peut changer le ticket d'une ligne (fusion de deux
-- tickets, D17) : la garde ne peut pas refuser ce geste sans casser la fusion,
-- qui déplace les lignes une à une dans la même instruction. Une ligne de
-- formule déplacée seule sur un autre ticket ne rapporte rien tant que la
-- formule reste entière (la somme des parts fait toujours le prix). Le seul
-- gain serait de retirer la formule du ticket d'origine et de garder la ligne
-- déplacée au prix réparti : caisse_retirer_formule refuse donc un groupe
-- dont une ligne est sur un autre ticket. Les lignes restent payées à leur
-- part ; la direction les corrige par une remise si besoin.
--
-- Redéfinit seulement caisse_retirer_formule, créée par le lot 09
-- (20261125_panel_lot09_caisse_formules.sql). Idempotente.

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
  perform pg_advisory_xact_lock(hashtextextended(p_groupe::text, 0));
  if exists (select 1 from public.caisse_lignes
              where formule_groupe = p_groupe and ticket_id <> p_ticket_id) then
    raise exception 'caisse: formule partagee entre deux tickets';
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
