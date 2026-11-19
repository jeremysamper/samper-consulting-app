-- Inverse de 20261119_caisse_bons_cadeaux.sql : remet caisse_encaisser et
-- caisse_totaux_jour de la v9 (texte repris de 20261111_caisse_v9_tpe.sql),
-- retire le declencheur, les RPC, la colonne et les deux tables.
-- Les bons et leur registre sont perdus : a ne jouer qu'avant tout bon vendu,
-- ou apres en avoir sorti la liste.
begin;

drop trigger if exists trg_caisse_ticket_bon_cadeau_recredit on public.caisse_tickets;
drop function if exists public.caisse_bon_cadeau_recredit();

create or replace function public.caisse_encaisser(
  p_ticket_id  uuid,
  p_paiements  jsonb,
  p_a_emporter boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       text := auth.uid()::text;
  v_ticket    public.caisse_tickets%rowtype;
  v_peut      boolean;
  v_total     numeric;
  v_somme     numeric := 0;
  v_especes   numeric := 0;
  v_n         int;
  v_i         int := 0;
  v_dernier   int := 0;
  v_arrondir  boolean := true;
  v_arrondi   numeric := 0;
  v_ecart     numeric;
  v_rendu     numeric;
  v_rendu_tot numeric := 0;
  v_pourb_tot numeric := 0;
  v_moyen     text;
  v_libelle   text;
  v_montant   numeric;
  v_pourboire numeric;
  v_recu      numeric;
  v_tpe       uuid;
  v_tpe_vus   uuid[] := '{}'::uuid[];
  v_tx        public.caisse_tpe_transactions%rowtype;
  e           jsonb;
begin
  select * into v_ticket from public.caisse_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'caisse: ticket introuvable';
  end if;
  v_peut := public.caisse_peut_utiliser(v_ticket.etablissement_id);
  if not coalesce(v_peut, false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_ticket.statut = 'encaisse' then
    raise exception 'caisse: ticket deja encaisse';
  end if;
  if v_ticket.statut <> 'ouvert' then
    raise exception 'caisse: ticket % fige', v_ticket.statut;
  end if;
  if not exists (select 1 from public.caisse_lignes l where l.ticket_id = p_ticket_id) then
    raise exception 'caisse: un ticket vide ne s''encaisse pas';
  end if;
  if p_paiements is null or jsonb_typeof(p_paiements) <> 'array'
     or jsonb_array_length(p_paiements) < 1 or jsonb_array_length(p_paiements) > 8 then
    raise exception 'caisse: paiements invalides';
  end if;
  v_n := jsonb_array_length(p_paiements);

  select coalesce(sum(round(l.quantite * l.prix_unitaire, 2)), 0) into v_total
    from public.caisse_lignes l where l.ticket_id = p_ticket_id;

  -- Un paiement reste d'un essai interrompu de l'ancien chemin : on repart
  -- de zero (un ticket ouvert n'a pas de paiement valable).
  delete from public.caisse_paiements where ticket_id = p_ticket_id;

  if v_ticket.test then
    v_moyen := coalesce(p_paiements -> 0 ->> 'moyen', 'autre');
    if v_moyen not in ('especes', 'carte', 'autre') then
      raise exception 'caisse: moyen de paiement inconnu';
    end if;
    insert into public.caisse_paiements (ticket_id, moyen, libelle, montant, encaisse_par)
    values (p_ticket_id, v_moyen, 'TEST', v_total, v_uid);
    update public.caisse_tickets
       set statut = 'encaisse', closed_at = now(), a_emporter = coalesce(p_a_emporter, a_emporter)
     where id = p_ticket_id;
    return jsonb_build_object('ticket_id', p_ticket_id, 'test', true, 'numero', null, 'total', v_total,
                              'rendu', 0, 'arrondi', 0, 'pourboire', 0);
  end if;

  -- Premiere passe : controles, somme, part en especes.
  for e in select * from jsonb_array_elements(p_paiements) loop
    v_i := v_i + 1;
    v_moyen := e ->> 'moyen';
    if v_moyen is null or v_moyen not in ('especes', 'carte', 'autre') then
      raise exception 'caisse: moyen de paiement inconnu';
    end if;
    if char_length(coalesce(e ->> 'libelle', '')) > 40 then
      raise exception 'caisse: nom du moyen de paiement trop long';
    end if;
    v_montant := round(coalesce((e ->> 'montant')::numeric, 0), 2);
    v_pourboire := round(coalesce((e ->> 'pourboire')::numeric, 0), 2);
    if v_montant < 0 or v_pourboire < 0 or coalesce((e ->> 'recu')::numeric, 0) < 0
       or v_montant > 1000000 or v_pourboire > 100000 or coalesce((e ->> 'recu')::numeric, 0) > 1000000 then
      raise exception 'caisse: montant de paiement invalide';
    end if;
    -- v9 : le paiement « terminal relie ».
    if nullif(e ->> 'tpe', '') is not null then
      if (e ->> 'tpe') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
        raise exception 'caisse: transaction de terminal introuvable';
      end if;
      v_tpe := (e ->> 'tpe')::uuid;
      if v_moyen <> 'carte' then
        raise exception 'caisse: un paiement par terminal relie est un paiement par carte';
      end if;
      if v_tpe = any(v_tpe_vus) then
        raise exception 'caisse: une transaction de terminal ne sert qu''une fois';
      end if;
      v_tpe_vus := v_tpe_vus || v_tpe;
      select * into v_tx from public.caisse_tpe_transactions where id = v_tpe for update;
      if not found or v_tx.ticket_id <> p_ticket_id then
        raise exception 'caisse: cette transaction de terminal n''est pas celle de ce ticket';
      end if;
      if v_tx.statut <> 'approuve' or v_tx.test or v_tx.rembourse_statut is not distinct from 'fait' then
        raise exception 'caisse: le terminal n''a pas accepte ce paiement';
      end if;
      if v_tx.rembourse_statut is not distinct from 'demande' then
        raise exception 'caisse: un remboursement sur le terminal est en cours pour ce ticket';
      end if;
      if v_tx.montant <> v_montant or v_tx.pourboire <> v_pourboire then
        raise exception 'caisse: le montant du paiement n''est pas celui du terminal';
      end if;
      if exists (select 1 from public.caisse_paiements p where p.tpe_transaction_id = v_tpe) then
        raise exception 'caisse: une transaction de terminal ne sert qu''une fois';
      end if;
    end if;
    v_somme := v_somme + v_montant;
    if v_moyen = 'especes' then
      v_especes := v_especes + v_montant;
      v_dernier := v_i;
    end if;
  end loop;
  if abs(v_somme - v_total) >= 0.005 then
    raise exception 'caisse: les paiements ne font pas le total (% pour %)', v_somme, v_total;
  end if;

  select coalesce(r.config -> 'arrondi_especes', 'true'::jsonb) <> 'false'::jsonb into v_arrondir
    from public.caisse_reglages r where r.etablissement_id = v_ticket.etablissement_id;
  if coalesce(v_arrondir, true) and v_dernier > 0 then
    v_arrondi := round(round(v_especes * 20) / 20 - v_especes, 2);
  end if;

  -- Seconde passe : ecriture. L'ecart d'arrondi va sur le dernier paiement en
  -- especes ; le rendu est ce que le client a donne moins ce qu'il doit
  -- (montant + ecart) et son pourboire.
  v_i := 0;
  for e in select * from jsonb_array_elements(p_paiements) loop
    v_i := v_i + 1;
    v_moyen := e ->> 'moyen';
    v_libelle := nullif(btrim(coalesce(e ->> 'libelle', '')), '');
    v_montant := round(coalesce((e ->> 'montant')::numeric, 0), 2);
    v_pourboire := round(coalesce((e ->> 'pourboire')::numeric, 0), 2);
    v_recu := round((e ->> 'recu')::numeric, 2);
    v_tpe := nullif(e ->> 'tpe', '')::uuid;
    v_ecart := case when v_i = v_dernier then v_arrondi else 0 end;
    v_rendu := 0;
    if v_moyen = 'especes' and v_recu is not null then
      v_rendu := v_recu - (v_montant + v_ecart) - v_pourboire;
      if v_rendu < 0 then
        raise exception 'caisse: especes recues insuffisantes';
      end if;
    end if;
    insert into public.caisse_paiements
      (ticket_id, moyen, libelle, montant, pourboire, rendu, arrondi, encaisse_par, tpe_transaction_id)
    values
      (p_ticket_id, v_moyen, v_libelle, v_montant, v_pourboire, v_rendu, v_ecart, v_uid, v_tpe);
    v_rendu_tot := v_rendu_tot + v_rendu;
    v_pourb_tot := v_pourb_tot + v_pourboire;
  end loop;

  -- Le passage a encaisse : les gardes verifient, le declencheur scelle.
  update public.caisse_tickets
     set statut = 'encaisse', closed_at = now(), a_emporter = coalesce(p_a_emporter, a_emporter)
   where id = p_ticket_id
  returning * into v_ticket;

  return jsonb_build_object(
    'ticket_id', v_ticket.id,
    'test', false,
    'numero', v_ticket.numero,
    'annee', v_ticket.annee,
    'jour_exploitation', v_ticket.jour_exploitation,
    'total', v_ticket.total_ttc,
    'rendu', v_rendu_tot,
    'arrondi', v_arrondi,
    'pourboire', v_pourb_tot);
end;
$$;

revoke execute on function public.caisse_encaisser(uuid, jsonb, boolean) from public, anon, authenticated;
grant  execute on function public.caisse_encaisser(uuid, jsonb, boolean) to authenticated;

create or replace function public.caisse_totaux_jour(p_etablissement_id text, p_jour date)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ventes as (
    select t.* from public.caisse_tickets t
     where t.etablissement_id = p_etablissement_id and t.jour_exploitation = p_jour
       and t.numero is not null and t.test = false
  ), annules as (
    select t.* from public.caisse_tickets t
     where t.etablissement_id = p_etablissement_id and t.annule_jour = p_jour
       and t.numero is not null and t.test = false and t.statut = 'annule'
  ), tva_v as (
    select d.taux, sum(d.ttc) as ttc, sum(d.tva) as tva
      from ventes v cross join lateral public.caisse_detail_tva(v.id) d group by d.taux
  ), tva_a as (
    select d.taux, sum(d.ttc) as ttc, sum(d.tva) as tva
      from annules a cross join lateral public.caisse_detail_tva(a.id) d group by d.taux
  ), taux as (
    select taux from tva_v union select taux from tva_a
  ), tva_n as (
    select x.taux,
           coalesce(v.ttc, 0) - coalesce(a.ttc, 0) as ttc,
           coalesce(v.tva, 0) - coalesce(a.tva, 0) as tva
      from taux x
      left join tva_v v on v.taux = x.taux
      left join tva_a a on a.taux = x.taux
  ), moyens_v as (
    select p.moyen, coalesce(p.libelle, '') as libelle, count(*) as nombre,
           sum(p.montant + p.arrondi) as montant, sum(p.pourboire) as pourboire
      from ventes v join public.caisse_paiements p on p.ticket_id = v.id
     group by 1, 2
  ), moyens_a as (
    select p.moyen, coalesce(p.libelle, '') as libelle, count(*) as nombre,
           sum(p.montant + p.arrondi) as montant
      from annules a join public.caisse_paiements p on p.ticket_id = a.id
     group by 1, 2
  ), services as (
    select v.service, count(*) as tickets, coalesce(sum(v.couverts), 0) as couverts, sum(v.total_ttc) as ttc
      from ventes v group by v.service
  ), lignes as (
    select l.* from ventes v join public.caisse_lignes l on l.ticket_id = v.id
  ), cartes_v as (
    -- v9 : les cartes des ventes du jour ; terminal_id null = saisie a la main.
    select x.terminal_id, count(*) as nombre, sum(p.montant) as montant, sum(p.pourboire) as pourboire
      from ventes v
      join public.caisse_paiements p on p.ticket_id = v.id
      left join public.caisse_tpe_transactions x on x.id = p.tpe_transaction_id
     where p.moyen = 'carte'
     group by x.terminal_id
  ), cartes_a as (
    select x.terminal_id, count(*) as nombre, sum(p.montant) as montant
      from annules a
      join public.caisse_paiements p on p.ticket_id = a.id
      left join public.caisse_tpe_transactions x on x.id = p.tpe_transaction_id
     where p.moyen = 'carte'
     group by x.terminal_id
  ), cartes_t as (
    select terminal_id from cartes_v where terminal_id is not null
    union
    select terminal_id from cartes_a where terminal_id is not null
  )
  select jsonb_build_object(
    'jour', to_char(p_jour, 'YYYY-MM-DD'),
    'ventes', jsonb_build_object(
      'tickets', (select count(*) from ventes),
      'premier_numero', (select min(numero) from ventes),
      'dernier_numero', (select max(numero) from ventes),
      'couverts', (select coalesce(sum(couverts), 0) from ventes),
      'ttc', (select coalesce(sum(ttc), 0) from tva_v),
      'tva', (select coalesce(sum(tva), 0) from tva_v),
      'ht', (select coalesce(sum(ttc - tva), 0) from tva_v),
      'par_taux', coalesce((select jsonb_agg(jsonb_build_object('taux', taux, 'ttc', ttc, 'tva', tva, 'ht', ttc - tva) order by taux desc) from tva_v), '[]'::jsonb)),
    'annulations', jsonb_build_object(
      'tickets', (select count(*) from annules),
      'numeros', coalesce((select jsonb_agg(annee || '-' || lpad(numero::text, 6, '0') order by annee, numero) from annules), '[]'::jsonb),
      'ttc', (select coalesce(sum(ttc), 0) from tva_a),
      'tva', (select coalesce(sum(tva), 0) from tva_a),
      'ht', (select coalesce(sum(ttc - tva), 0) from tva_a),
      'par_taux', coalesce((select jsonb_agg(jsonb_build_object('taux', taux, 'ttc', ttc, 'tva', tva, 'ht', ttc - tva) order by taux desc) from tva_a), '[]'::jsonb),
      'moyens', coalesce((select jsonb_agg(jsonb_build_object('moyen', moyen, 'libelle', libelle, 'nombre', nombre, 'montant', montant) order by moyen, libelle) from moyens_a), '[]'::jsonb)),
    'net', jsonb_build_object(
      'ttc', (select coalesce(sum(ttc), 0) from tva_n),
      'tva', (select coalesce(sum(tva), 0) from tva_n),
      'ht', (select coalesce(sum(ttc - tva), 0) from tva_n),
      'par_taux', coalesce((select jsonb_agg(jsonb_build_object('taux', taux, 'ttc', ttc, 'tva', tva, 'ht', ttc - tva) order by taux desc) from tva_n), '[]'::jsonb)),
    'moyens', coalesce((select jsonb_agg(jsonb_build_object('moyen', moyen, 'libelle', libelle, 'nombre', nombre, 'montant', montant) order by moyen, libelle) from moyens_v), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('service', service, 'tickets', tickets, 'couverts', couverts, 'ttc', ttc) order by service) from services), '[]'::jsonb),
    'remises', jsonb_build_object(
      'lignes', (select count(*) from lignes where prix_origine is not null and not offert),
      'montant', (select coalesce(sum(remise_montant), 0) from lignes where prix_origine is not null and not offert)),
    'offerts', jsonb_build_object(
      'lignes', (select count(*) from lignes where offert),
      'valeur', (select coalesce(sum(round(quantite * prix_origine, 2)), 0) from lignes where offert)),
    'pourboires', jsonb_build_object(
      'total', (select coalesce(sum(pourboire), 0) from moyens_v),
      'par_moyen', coalesce((select jsonb_agg(jsonb_build_object('moyen', moyen, 'libelle', libelle, 'montant', pourboire) order by moyen, libelle) from moyens_v where pourboire <> 0), '[]'::jsonb)),
    'arrondis', (select coalesce(sum(p.arrondi), 0) from ventes v join public.caisse_paiements p on p.ticket_id = v.id),
    'especes', jsonb_build_object(
      'ventes', (select coalesce(sum(montant), 0) from moyens_v where moyen = 'especes'),
      'annulees', (select coalesce(sum(montant), 0) from moyens_a where moyen = 'especes'),
      'attendues', (select coalesce(sum(montant), 0) from moyens_v where moyen = 'especes')
                 - (select coalesce(sum(montant), 0) from moyens_a where moyen = 'especes')),
    'cartes', jsonb_build_object(
      'relie', jsonb_build_object(
        'nombre', (select coalesce(sum(nombre), 0) from cartes_v where terminal_id is not null),
        'ventes', (select coalesce(sum(montant), 0) from cartes_v where terminal_id is not null),
        'annulees', (select coalesce(sum(montant), 0) from cartes_a where terminal_id is not null),
        'net', (select coalesce(sum(montant), 0) from cartes_v where terminal_id is not null)
             - (select coalesce(sum(montant), 0) from cartes_a where terminal_id is not null),
        'pourboires', (select coalesce(sum(pourboire), 0) from cartes_v where terminal_id is not null)),
      'manuel', jsonb_build_object(
        'nombre', (select coalesce(sum(nombre), 0) from cartes_v where terminal_id is null),
        'ventes', (select coalesce(sum(montant), 0) from cartes_v where terminal_id is null),
        'annulees', (select coalesce(sum(montant), 0) from cartes_a where terminal_id is null),
        'net', (select coalesce(sum(montant), 0) from cartes_v where terminal_id is null)
             - (select coalesce(sum(montant), 0) from cartes_a where terminal_id is null),
        'pourboires', (select coalesce(sum(pourboire), 0) from cartes_v where terminal_id is null)),
      'terminaux', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'terminal_id', c.terminal_id, 'nom', m.nom,
                 'nombre', coalesce(v.nombre, 0),
                 'ventes', coalesce(v.montant, 0),
                 'annulees', coalesce(a.montant, 0),
                 'net', coalesce(v.montant, 0) - coalesce(a.montant, 0),
                 'pourboires', coalesce(v.pourboire, 0))
               order by m.nom, c.terminal_id)
          from cartes_t c
          join public.caisse_tpe_terminaux m on m.id = c.terminal_id
          left join cartes_v v on v.terminal_id = c.terminal_id
          left join cartes_a a on a.terminal_id = c.terminal_id), '[]'::jsonb)),
    'abandons', (
      select jsonb_build_object(
               'tickets', count(*),
               'montant', coalesce(sum((
                 select coalesce(sum(round(l.quantite * l.prix_unitaire, 2)), 0)
                   from public.caisse_lignes l
                  where l.ticket_id = t.id and l.statut <> 'en_attente')), 0))
        from public.caisse_tickets t
       where t.etablissement_id = p_etablissement_id and t.jour_exploitation = p_jour
         and t.numero is null and t.test = false and t.statut = 'annule'),
    'ouverts', (
      select jsonb_build_object(
               'tickets', count(*),
               'montant', coalesce(sum((
                 select coalesce(sum(round(l.quantite * l.prix_unitaire, 2)), 0)
                   from public.caisse_lignes l where l.ticket_id = t.id)), 0))
        from public.caisse_tickets t
       where t.etablissement_id = p_etablissement_id and t.test = false and t.statut = 'ouvert')
  );
$$;

revoke all on function public.caisse_totaux_jour(text, date) from public, anon, authenticated;

drop function if exists public.caisse_bon_cadeau_prolonger(uuid, date);
drop function if exists public.caisse_bon_cadeau_annuler(uuid, text, text, text);
drop function if exists public.caisse_bon_cadeau_emettre(text, numeric, text, text, text, text, date, text);
drop function if exists public.caisse_bon_cadeau_jour(text);
drop function if exists public.caisse_bon_cadeau_code();

alter table public.caisse_paiements drop constraint if exists caisse_paiements_bon_cadeau_autre;
alter table public.caisse_paiements drop column if exists bon_cadeau_id;
drop table if exists public.caisse_bons_cadeaux_mouvements;
drop table if exists public.caisse_bons_cadeaux;

commit;
