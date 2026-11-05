-- ════════════════════════════════════════════════════════════════════════════
-- Caisse v1d - la cascade ne se deduit plus d'un lookup NULL (revue v1c).
--
-- Constat de la revue : dans les gardes de caisse_lignes et caisse_paiements,
-- un ticket parent introuvable (v_statut NULL) etait lu comme « cascade de
-- suppression du ticket » et laissait passer le DELETE. Le lookup tourne sous
-- la RLS de l'appelant : un ticket d'un autre etablissement est invisible et
-- rend NULL aussi. En l'etat ce n'etait pas exploitable (les policies USING
-- et WITH CHECK des deux tables cachent toute ligne dont le ticket est hors
-- perimetre, et les branches INSERT et UPDATE refusent deja NULL par
-- « is distinct from 'ouvert' ») ; mais la surete reposait sur l'ordre
-- policy / declencheur, pas sur la garde elle-meme.
--
-- Durcissement : la cascade se reconnait par pg_trigger_depth() > 1 (le
-- DELETE des enfants est execute par le declencheur referentiel du DELETE du
-- ticket, donc a une profondeur superieure ; un DELETE client direct est a
-- 1). Hors cascade, un parent introuvable REFUSE, quel que soit le chemin.
-- Remplace les deux fonctions ; les declencheurs en place les reutilisent.
-- Idempotente. Rollback : rejouer 20261105_caisse_v1c_verrou_ticket.sql.
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
  -- encaisse ou annule, migration v1c).
  select statut into v_statut from public.caisse_tickets
   where id = coalesce(old.ticket_id, new.ticket_id) for update;

  -- Parent introuvable : cascade du DELETE du ticket (profondeur > 1), tout
  -- autre chemin refuse (fail-closed, v1d).
  if v_statut is null then
    if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
    raise exception 'caisse: ticket introuvable';
  end if;

  if tg_op = 'DELETE' then
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
    if v_statut <> 'ouvert' then
      raise exception 'caisse: le ticket n''est pas ouvert';
    end if;
    if new.statut <> 'en_attente' then
      raise exception 'caisse: une ligne nait en attente';
    end if;
    return new;
  end if;

  -- UPDATE : le ticket d'origine et, en cas de fusion, le ticket cible
  -- doivent etre ouverts (cible verrouillee aussi ; introuvable = refus).
  if v_statut <> 'ouvert' then
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

  -- Verrou sur le ticket (v1c) ; parent introuvable : cascade seulement
  -- (fail-closed, v1d).
  select statut into v_statut from public.caisse_tickets
   where id = coalesce(old.ticket_id, new.ticket_id) for update;
  if v_statut is null then
    if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
    raise exception 'caisse: ticket introuvable';
  end if;

  if tg_op = 'INSERT' then
    if v_statut <> 'ouvert' then
      raise exception 'caisse: le ticket n''est pas ouvert';
    end if;
    new.encaisse_par := coalesce(new.encaisse_par, auth.uid()::text);
    return new;
  end if;

  -- DELETE
  if v_statut = 'ouvert'
     or current_user_role() = any(array['consultant','patron']) then
    return old;
  end if;
  raise exception 'caisse: paiement d''un ticket fige (direction seulement)';
end;
$$;
