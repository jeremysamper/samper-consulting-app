-- ════════════════════════════════════════════════════════════════════════════
-- Caisse v1c - serialisation sur la ligne du ticket (course relevee par la
-- revue de securite : entre la lecture des sommes du passage a encaisse et
-- une ecriture concurrente de ligne ou de paiement, le ticket pouvait se
-- cloturer sous son total).
--
-- Principe : le passage de statut verrouille deja la ligne du ticket (UPDATE
-- caisse_tickets). Les gardes de caisse_lignes et caisse_paiements lisent
-- desormais le ticket parent avec FOR UPDATE : toute ecriture de ligne ou de
-- paiement attend la fin d'un changement de statut en cours, puis relit le
-- statut committe (et refuse si le ticket s'est fige entre-temps) ; dans
-- l'autre sens, un encaissement qui part pendant une ecriture de ligne
-- attend qu'elle soit committee et la compte dans ses sommes.
--
-- Pendant la cascade de suppression du ticket, le parent n'existe plus :
-- aucun verrou a prendre, la lecture rend null et la cascade passe (inchange).
-- Remplace les deux fonctions ; les declencheurs en place les reutilisent.
-- Idempotente. Rollback : rejouer la section 5 de 20261105_caisse_v1.sql.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.caisse_ligne_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_statut     text;
  v_statut_new text;
begin
  -- Statut du ticket porteur, verrouille (serialisation avec le passage a
  -- encaisse ou annule). Null = cascade de suppression du ticket.
  select statut into v_statut from public.caisse_tickets
   where id = coalesce(old.ticket_id, new.ticket_id) for update;

  if tg_op = 'DELETE' then
    if v_statut is null then return old; end if; -- cascade du ticket
    if v_statut <> 'ouvert' then
      raise exception 'caisse: ticket fige, lignes comprises';
    end if;
    if old.statut <> 'en_attente'
       and not (current_user_role() = any(array['consultant','patron'])) then
      raise exception 'caisse: ligne deja envoyee (retrait par la direction seulement)';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if v_statut is distinct from 'ouvert' then
      raise exception 'caisse: le ticket n''est pas ouvert';
    end if;
    if new.statut <> 'en_attente' then
      raise exception 'caisse: une ligne nait en attente';
    end if;
    return new;
  end if;

  -- UPDATE : le ticket d'origine et, en cas de fusion, le ticket cible
  -- doivent etre ouverts (cible verrouillee aussi).
  if v_statut is distinct from 'ouvert' then
    raise exception 'caisse: ticket fige, lignes comprises';
  end if;
  if new.ticket_id is distinct from old.ticket_id then
    select statut into v_statut_new from public.caisse_tickets
     where id = new.ticket_id for update;
    if v_statut_new is distinct from 'ouvert' then
      raise exception 'caisse: fusion vers un ticket non ouvert';
    end if;
  end if;

  if old.statut <> 'en_attente' then
    -- Ligne envoyee ou servie : contenu fige, statut jamais rendu a en_attente.
    if new.plat_id is distinct from old.plat_id
       or new.libelle <> old.libelle
       or new.quantite <> old.quantite
       or new.prix_unitaire <> old.prix_unitaire
       or new.suite <> old.suite
       or new.note is distinct from old.note
       or new.statut not in ('envoye','servi') then
      if not (current_user_role() = any(array['consultant','patron'])) then
        raise exception 'caisse: ligne deja envoyee (correction par la direction seulement)';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.caisse_paiement_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_statut text;
begin
  if tg_op = 'UPDATE' then
    raise exception 'caisse: un paiement ne se modifie pas (le retirer et le ressaisir)';
  end if;

  -- Verrou sur le ticket : un retrait de paiement ne peut plus croiser un
  -- passage a encaisse en vol (et inversement).
  select statut into v_statut from public.caisse_tickets
   where id = coalesce(old.ticket_id, new.ticket_id) for update;

  if tg_op = 'INSERT' then
    if v_statut is distinct from 'ouvert' then
      raise exception 'caisse: le ticket n''est pas ouvert';
    end if;
    new.encaisse_par := coalesce(new.encaisse_par, auth.uid()::text);
    return new;
  end if;

  -- DELETE
  if v_statut is null then return old; end if; -- cascade du ticket
  if v_statut = 'ouvert'
     or current_user_role() = any(array['consultant','patron']) then
    return old;
  end if;
  raise exception 'caisse: paiement d''un ticket fige (direction seulement)';
end;
$$;
