-- ════════════════════════════════════════════════════════════════════════════
-- Caisse v1b - gardes anti-fraude relevees par la revue de securite du lot.
--
-- Trois trous fermes, tous sur le meme chemin (faire disparaitre une vente
-- deja partie en cuisine, ou la cloturer sous son total) :
--   1. SUPPRIMER un ticket ouvert n'est permis a l'equipe que s'il n'a ni
--      ligne deja envoyee ou servie, ni paiement ; sinon direction seulement.
--   2. ANNULER un ticket ouvert : meme regle (une commande partie en cuisine
--      ne s'annule qu'en direction ; l'abandon d'une table sans envoi reste
--      ouvert a tous).
--   3. ENCAISSER exige que la somme des paiements couvre le total des lignes
--      (tolerance d'arrondi d'un demi-centime) : plus de cloture a zero.
--
-- Remplace la seule fonction caisse_ticket_garde (le declencheur en place la
-- reutilise). Idempotente. Rollback : rejouer la section 5 de
-- 20261105_caisse_v1.sql, qui porte l'ancienne version de la fonction.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.caisse_ticket_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_direction   boolean;
  v_engage      boolean; -- une ligne deja envoyee ou servie, ou un paiement
  v_total       numeric;
  v_paye        numeric;
begin
  v_direction := current_user_role() = any(array['consultant','patron']);

  if tg_op = 'DELETE' then
    if v_direction then return old; end if;
    if old.statut <> 'ouvert' then
      raise exception 'caisse: seul un ticket ouvert se supprime (direction pour le reste)';
    end if;
    select exists (
      select 1 from public.caisse_lignes l
      where l.ticket_id = old.id and l.statut <> 'en_attente'
    ) or exists (
      select 1 from public.caisse_paiements p where p.ticket_id = old.id
    ) into v_engage;
    if v_engage then
      raise exception 'caisse: des lignes sont parties en cuisine, suppression par la direction seulement';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.statut <> 'ouvert' then
      raise exception 'caisse: un ticket nait ouvert';
    end if;
    new.ouvert_par := coalesce(new.ouvert_par, auth.uid()::text);
  end if;

  -- La table designee appartient a l'etablissement du ticket. La verification
  -- passe par la RLS de salle_tables (fonction SECURITY INVOKER) : une table
  -- d'un autre etablissement est invisible, donc refusee.
  if new.table_id is not null
     and (tg_op = 'INSERT' or new.table_id is distinct from old.table_id) then
    if not exists (
      select 1 from public.salle_tables st
      where st.id = new.table_id and st.etablissement_id = new.etablissement_id
    ) then
      raise exception 'caisse: table inconnue pour cet etablissement';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.statut <> 'ouvert' then
      -- Ticket fige : rien ne bouge, hors l'annulation (direction) et la mise
      -- a null de table_id par la cascade du plan de salle.
      if new.etablissement_id <> old.etablissement_id
         or not (new.table_id is not distinct from old.table_id or new.table_id is null)
         or new.ouvert_par is distinct from old.ouvert_par
         or new.note is distinct from old.note
         or new.created_at <> old.created_at then
        raise exception 'caisse: ticket % fige', old.statut;
      end if;
      if new.statut is distinct from old.statut then
        if old.statut = 'encaisse' and new.statut = 'annule' and v_direction then
          null; -- annulation par la direction
        else
          raise exception 'caisse: annulation d''un ticket encaisse reservee a la direction';
        end if;
      end if;
      return new;
    end if;

    -- Ticket ouvert : transitions gardees.
    if new.statut = 'annule' and not v_direction then
      select exists (
        select 1 from public.caisse_lignes l
        where l.ticket_id = old.id and l.statut <> 'en_attente'
      ) into v_engage;
      if v_engage then
        raise exception 'caisse: des lignes sont parties en cuisine, annulation par la direction seulement';
      end if;
    end if;

    if new.statut = 'encaisse' then
      select coalesce(sum(l.quantite * l.prix_unitaire), 0) into v_total
      from public.caisse_lignes l where l.ticket_id = old.id;
      select coalesce(sum(p.montant), 0) into v_paye
      from public.caisse_paiements p where p.ticket_id = old.id;
      if v_paye + 0.005 < v_total then
        raise exception 'caisse: paiements insuffisants (% sur %)', v_paye, v_total;
      end if;
    end if;
  end if;

  return new;
end;
$$;
