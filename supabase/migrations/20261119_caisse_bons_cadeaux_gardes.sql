-- ════════════════════════════════════════════════════════════════════════════
-- Caisse : bons cadeaux, gardes (19.11.2026, suite de 20261119_caisse_bons_cadeaux)
-- ════════════════════════════════════════════════════════════════════════════
-- Deux trous relevés par la revue de sécurité, avant tout bon vendu (0 bon en
-- base au moment de la correction) :
--
-- 1. caisse_paiements reste écrivable par l'API pour les membres de
--    l'établissement (policy caisse_paiements_all, ancien chemin « paiement
--    inséré puis statut »). Un compte pouvait donc poser bon_cadeau_id sur un
--    paiement sans que le bon soit débité, et l'annulation du ticket l'aurait
--    recrédité : de l'argent créé sur un bon. Désormais seule caisse_encaisser
--    (SECURITY DEFINER, propriétaire postgres) pose ou change bon_cadeau_id, et
--    le recrédit ne rend que ce qu'une utilisation inscrite au registre a
--    réellement débité, une fois, sur un bon de la même maison.
--
-- 2. La lecture des bons (code au porteur, téléphone) était ouverte à tout
--    membre de l'établissement (user_can_access_etab). Elle passe au droit
--    caisse de l'appelant, par caisse_tpe_lecteur (v9 : caisse_peut_utiliser
--    rendu lisible dans une policy), comme les tables du terminal.
--
-- Additive et idempotente. Le front n'est pas touché : ses lectures viennent de
-- l'écran Caisse, que seuls les comptes qui ont la caisse ouvrent.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. bon_cadeau_id : posé par caisse_encaisser seulement.
-- SECURITY INVOKER voulu : current_user est l'appelant (authenticated par
-- l'API, postgres dans caisse_encaisser qui est SECURITY DEFINER).
create or replace function public.caisse_paiement_bon_cadeau_garde()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' and new.bon_cadeau_id is not null then
    raise exception 'caisse: un paiement par bon cadeau passe par l''encaissement'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.bon_cadeau_id is distinct from old.bon_cadeau_id then
    raise exception 'caisse: un paiement par bon cadeau passe par l''encaissement'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.caisse_paiement_bon_cadeau_garde() from public, anon, authenticated;

drop trigger if exists trg_caisse_paiement_bon_cadeau_garde on public.caisse_paiements;
create trigger trg_caisse_paiement_bon_cadeau_garde
  before insert or update of bon_cadeau_id on public.caisse_paiements
  for each row execute function public.caisse_paiement_bon_cadeau_garde();

-- Recrédit : seulement un paiement dont l'utilisation est inscrite au
-- registre pour ce ticket, ce bon et ce montant, sur un bon de la même maison
-- et non annulé, et une seule fois.
create or replace function public.caisse_bon_cadeau_recredit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p record;
begin
  for p in
    select pa.bon_cadeau_id, pa.montant
      from public.caisse_paiements pa
      join public.caisse_bons_cadeaux b on b.id = pa.bon_cadeau_id
     where pa.ticket_id = new.id
       and pa.bon_cadeau_id is not null
       and b.etablissement_id = new.etablissement_id
       and b.statut <> 'annule'
       and exists (select 1 from public.caisse_bons_cadeaux_mouvements m
                    where m.ticket_id = new.id and m.bon_id = pa.bon_cadeau_id
                      and m.genre = 'utilisation' and m.montant = pa.montant)
       and not exists (select 1 from public.caisse_bons_cadeaux_mouvements m
                        where m.ticket_id = new.id and m.bon_id = pa.bon_cadeau_id
                          and m.genre = 'recredit')
  loop
    update public.caisse_bons_cadeaux
       set solde = solde + p.montant,
           statut = case when statut = 'epuise' then 'actif' else statut end
     where id = p.bon_cadeau_id;
    insert into public.caisse_bons_cadeaux_mouvements
      (bon_id, etablissement_id, genre, montant, ticket_id, jour_exploitation, par)
    values
      (p.bon_cadeau_id, new.etablissement_id, 'recredit', p.montant, new.id, new.annule_jour, auth.uid()::text);
  end loop;
  return null;
end;
$$;

revoke all on function public.caisse_bon_cadeau_recredit() from public, anon, authenticated;

-- 2. Lecture des bons et du registre : le droit caisse de l'appelant.
drop policy if exists caisse_bons_cadeaux_select on public.caisse_bons_cadeaux;
create policy caisse_bons_cadeaux_select on public.caisse_bons_cadeaux
  for select to authenticated
  using (public.caisse_tpe_lecteur(etablissement_id));

drop policy if exists caisse_bons_cadeaux_mouvements_select on public.caisse_bons_cadeaux_mouvements;
create policy caisse_bons_cadeaux_mouvements_select on public.caisse_bons_cadeaux_mouvements
  for select to authenticated
  using (public.caisse_tpe_lecteur(etablissement_id));
