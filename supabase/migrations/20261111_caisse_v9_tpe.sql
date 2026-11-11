-- ============================================================================
-- Caisse v9 - terminal de paiement relie : la caisse envoie le montant, le
-- terminal encaisse, la caisse recoit le resultat.
--
-- Cadre (prime sur tout le reste) :
--   - aucune donnee de carte ici : ni numero entier, ni date d'expiration, ni
--     cryptogramme, ni code, ni piste. D'une transaction on ne garde qu'une
--     liste blanche : identifiant du prestataire, statut, montant, devise,
--     marque, code d'autorisation, quatre derniers chiffres (contrainte) ;
--   - le secret d'un terminal (cle du prestataire) vit dans le coffre de la
--     base (vault), jamais dans une table lisible, jamais rendu a l'ecran ;
--   - l'argent ne passe pas par l'app : ces tables pilotent un terminal,
--     elles ne tiennent aucun compte et ne declenchent aucun virement.
--
--   caisse_tpe_terminaux    : les terminaux d'une maison (nom, prestataire,
--     numero de serie, actif). Lus par qui a la caisse ; ecrits par les
--     fonctions de la base seulement.
--   caisse_tpe_transactions : une ligne par tentative d'encaissement sur un
--     terminal. Statuts : demande, en_cours, approuve, refuse, annule,
--     expire, incertain. Une reference unique par tentative (idempotence).
--     Deux index uniques partiels : une seule transaction en route par
--     ticket (demande, en_cours, incertain) et par terminal (demande,
--     en_cours). Lues par qui a la caisse ; AUCUNE ecriture par l'API, pas
--     meme par service_role : seules les fonctions caisse_tpe_* ecrivent.
--   caisse_tpe_bouclements  : le total du bouclement du terminal, saisi a la
--     cloture (facultatif), pour afficher l'ecart avec les cartes de la
--     caisse. Hors de la cloture figee : la chaine d'integrite ne bouge pas.
--   caisse_paiements        : + tpe_transaction_id. Un paiement « terminal
--     relie » pointe la transaction approuvee qui le justifie ; une
--     transaction sert une fois (index unique).
--
--   Fonctions pour l'Edge Function caisse-tpe (service_role seulement, la
--   personne est passee en argument apres verification de son jeton) :
--     caisse_tpe_terminal_poser, caisse_tpe_terminal_retirer,
--     caisse_tpe_terminal_secret, caisse_tpe_demarrer, caisse_tpe_noter,
--     caisse_tpe_lire, caisse_tpe_trancher, caisse_tpe_rembourser_demander,
--     caisse_tpe_rembourser_noter.
--   RPC de l'ecran (authenticated) : caisse_tpe_bouclement_poser,
--     caisse_tpe_rapport.
--
--   Deux fonctions de la v7 sont reprises, memes signatures :
--     caisse_encaisser   : un paiement peut porter « tpe » (l'identifiant de
--       la transaction). Il est refuse si la transaction n'est pas approuvee,
--       pas du meme ticket, pas du meme montant, deja remboursee ou deja
--       servie. Sans « tpe », rien ne change (le front en ligne n'en envoie
--       pas).
--     caisse_totaux_jour : + la cle « cartes » (cartes par terminal relie et
--       cartes saisies a la main). Les autres cles sont inchangees. Les
--       clotures deja figees ne sont pas touchees.
--   Les autres fonctions des lots v1 a v8 ne sont pas reecrites. Trois
--   declencheurs neufs s'ajoutent a cote des gardes existantes :
--   caisse_paiement_garde_v9, caisse_ticket_garde_v9, caisse_ligne_garde_v9.
--   Sans transaction de terminal, aucun des trois ne refuse rien.
--
--   Le terminal simule (prestataire 'simule') ne sert que les tickets de
--   test, et un ticket de test ne part jamais sur un vrai terminal :
--   contrainte test = (prestataire = 'simule') et refus dans caisse_tpe_demarrer.
--
-- Migration additive (expand). Aucune donnee semee. Rejouable et inerte au
-- rejeu : elle n'ecrit aucune ligne. Rollback en fin.
-- Heures stockees en UTC, lues en Europe/Zurich.
-- ============================================================================

set local lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.caisse_tpe_terminaux (
  id                       uuid        primary key default gen_random_uuid(),
  etablissement_id         text        not null references public.etablissements(id) on delete cascade,
  nom                      text        not null check (char_length(btrim(nom)) between 1 and 40),
  prestataire              text        not null check (prestataire ~ '^[a-z][a-z0-9_]{1,29}$'),
  numero_serie             text        not null check (numero_serie ~ '^[A-Za-z0-9._-]{1,40}$'),
  actif                    boolean     not null default true,
  -- Les quatre derniers caracteres de la cle, pour la reconnaitre a l'ecran
  -- (« se termine par ») ; null quand la cle est trop courte pour cela.
  cle_fin                  text        check (cle_fin is null or char_length(cle_fin) = 4),
  premier_paiement_reel_at timestamptz,
  relie_par                text        references public.profiles(id),
  relie_par_nom            text,
  relie_at                 timestamptz not null default now(),
  retire_par               text        references public.profiles(id),
  retire_at                timestamptz,
  constraint caisse_tpe_terminaux_retrait check ((retire_at is null) = actif)
);

create unique index if not exists caisse_tpe_terminaux_serie_key
  on public.caisse_tpe_terminaux(etablissement_id, prestataire, numero_serie) where actif;
create index if not exists idx_caisse_tpe_terminaux_etab       on public.caisse_tpe_terminaux(etablissement_id);
create index if not exists idx_caisse_tpe_terminaux_relie_par  on public.caisse_tpe_terminaux(relie_par) where relie_par is not null;
create index if not exists idx_caisse_tpe_terminaux_retire_par on public.caisse_tpe_terminaux(retire_par) where retire_par is not null;

create table if not exists public.caisse_tpe_transactions (
  id                 uuid        primary key default gen_random_uuid(),
  etablissement_id   text        not null references public.etablissements(id),
  ticket_id          uuid        not null references public.caisse_tickets(id),
  terminal_id        uuid        not null references public.caisse_tpe_terminaux(id),
  test               boolean     not null,
  prestataire        text        not null,
  -- montant : la part du ticket ; pourboire : a part, jamais dans le chiffre
  -- d'affaires. Le terminal debite montant + pourboire.
  montant            numeric     not null check (montant > 0 and montant <= 1000000 and montant = round(montant, 2)),
  pourboire          numeric     not null default 0 check (pourboire >= 0 and pourboire <= 100000 and pourboire = round(pourboire, 2)),
  devise             text        not null default 'CHF' check (devise = 'CHF'),
  statut             text        not null default 'demande'
                     check (statut in ('demande', 'en_cours', 'approuve', 'refuse', 'annule', 'expire', 'incertain')),
  reference          uuid        not null,
  prestataire_id     text        check (prestataire_id is null or char_length(prestataire_id) <= 80),
  marque             text        check (marque is null or (char_length(marque) <= 30 and marque !~ '[0-9]{7,}')),
  fin_carte          text        check (fin_carte is null or fin_carte ~ '^[0-9]{4}$'),
  code_autorisation  text        check (code_autorisation is null or code_autorisation ~ '^[A-Za-z0-9]{1,12}$'),
  message            text        check (message is null or (char_length(message) <= 200 and message !~ '[0-9]{7,}')),
  demande_par        text        references public.profiles(id),
  demande_par_nom    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  final_at           timestamptz,
  tranche_par        text        references public.profiles(id),
  tranche_par_nom    text,
  tranche_at         timestamptz,
  tranche_motif      text        check (tranche_motif is null or (char_length(btrim(tranche_motif)) between 3 and 300 and tranche_motif !~ '[0-9]{12,}')),
  rembourse_statut   text        check (rembourse_statut is null or rembourse_statut in ('demande', 'fait', 'echec')),
  rembourse_genre    text        check (rembourse_genre is null or rembourse_genre in ('void', 'refund')),
  rembourse_par      text        references public.profiles(id),
  rembourse_par_nom  text,
  rembourse_at       timestamptz,
  rembourse_message  text        check (rembourse_message is null or (char_length(rembourse_message) <= 200 and rembourse_message !~ '[0-9]{7,}')),
  constraint caisse_tpe_transactions_reference_key unique (reference),
  -- Le terminal simule ne sert que les tickets de test, et eux seuls.
  constraint caisse_tpe_transactions_test_simule check (test = (prestataire = 'simule')),
  constraint caisse_tpe_transactions_final check ((final_at is not null) = (statut in ('approuve', 'refuse', 'annule', 'expire'))),
  -- Un accord porte sa trace : l'identifiant du prestataire, ou la decision
  -- d'un responsable.
  constraint caisse_tpe_transactions_accord_trace check (
    statut <> 'approuve' or prestataire_id is not null or tranche_at is not null),
  constraint caisse_tpe_transactions_tranche check (
    tranche_at is null
    or (statut in ('approuve', 'annule') and tranche_par is not null and tranche_motif is not null)),
  constraint caisse_tpe_transactions_rembourse check (
    rembourse_statut is null or (statut = 'approuve' and rembourse_par is not null and rembourse_at is not null))
);

-- Un geste, un debit au plus : une seule transaction en route par ticket
-- (un resultat incertain compte : il se tranche avant toute nouvelle
-- tentative) et par terminal.
create unique index if not exists caisse_tpe_transactions_ticket_en_route_key
  on public.caisse_tpe_transactions(ticket_id) where statut in ('demande', 'en_cours', 'incertain');
create unique index if not exists caisse_tpe_transactions_terminal_en_route_key
  on public.caisse_tpe_transactions(terminal_id) where statut in ('demande', 'en_cours');
create index if not exists idx_caisse_tpe_transactions_ticket    on public.caisse_tpe_transactions(ticket_id);
create index if not exists idx_caisse_tpe_transactions_terminal  on public.caisse_tpe_transactions(terminal_id, created_at desc);
create index if not exists idx_caisse_tpe_transactions_etab      on public.caisse_tpe_transactions(etablissement_id, created_at desc);
create index if not exists idx_caisse_tpe_transactions_demande   on public.caisse_tpe_transactions(demande_par) where demande_par is not null;
create index if not exists idx_caisse_tpe_transactions_tranche   on public.caisse_tpe_transactions(tranche_par) where tranche_par is not null;
create index if not exists idx_caisse_tpe_transactions_rembourse on public.caisse_tpe_transactions(rembourse_par) where rembourse_par is not null;

create table if not exists public.caisse_tpe_bouclements (
  id                uuid        primary key default gen_random_uuid(),
  etablissement_id  text        not null references public.etablissements(id),
  terminal_id       uuid        not null references public.caisse_tpe_terminaux(id),
  jour_exploitation date        not null,
  montant           numeric     not null check (montant >= 0 and montant <= 10000000 and montant = round(montant, 2)),
  saisi_par         text        references public.profiles(id),
  saisi_par_nom     text,
  created_at        timestamptz not null default clock_timestamp()
);

create index if not exists idx_caisse_tpe_bouclements_jour
  on public.caisse_tpe_bouclements(etablissement_id, jour_exploitation, terminal_id, created_at desc);
create index if not exists idx_caisse_tpe_bouclements_terminal on public.caisse_tpe_bouclements(terminal_id);
create index if not exists idx_caisse_tpe_bouclements_par      on public.caisse_tpe_bouclements(saisi_par) where saisi_par is not null;

-- Le lien d'un paiement vers la transaction qui le justifie.
alter table public.caisse_paiements
  add column if not exists tpe_transaction_id uuid references public.caisse_tpe_transactions(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'caisse_paiements_tpe_carte') then
    alter table public.caisse_paiements
      add constraint caisse_paiements_tpe_carte check (tpe_transaction_id is null or moyen = 'carte');
  end if;
end $$;

-- Une transaction approuvee sert une fois.
create unique index if not exists caisse_paiements_tpe_transaction_key
  on public.caisse_paiements(tpe_transaction_id) where tpe_transaction_id is not null;

comment on table public.caisse_tpe_terminaux    is 'Caisse v9 : terminaux de paiement d''une maison. Lecture par qui a la caisse ; ecriture par caisse_tpe_terminal_poser et caisse_tpe_terminal_retirer seulement. Le secret du terminal est dans le coffre (vault), sous le nom caisse_tpe:<id>.';
comment on table public.caisse_tpe_transactions is 'Caisse v9 : une ligne par tentative d''encaissement sur un terminal. Liste blanche : aucune donnee de carte au-dela de la marque, des quatre derniers chiffres et du code d''autorisation. Aucune ecriture par l''API.';
comment on table public.caisse_tpe_bouclements  is 'Caisse v9 : total du bouclement d''un terminal pour un jour d''exploitation, saisi a la cloture. La derniere saisie vaut. Ni modification ni suppression.';
comment on column public.caisse_paiements.tpe_transaction_id is 'Caisse v9 : la transaction de terminal approuvee qui justifie ce paiement par carte (null = carte saisie a la main, terminal non relie). Ecrit par caisse_encaisser seulement.';
comment on column public.caisse_tpe_transactions.reference   is 'Caisse v9 : reference d''idempotence tiree par l''ecran, une par tentative. La meme reference ne cree jamais deux transactions.';

-- ----------------------------------------------------------------------------
-- 2. Droits et lecture
-- ----------------------------------------------------------------------------
alter table public.caisse_tpe_terminaux    enable row level security;
alter table public.caisse_tpe_transactions enable row level security;
alter table public.caisse_tpe_bouclements  enable row level security;

-- Aucune ecriture par l'API, service_role compris : il lit, les fonctions
-- caisse_tpe_* ecrivent.
revoke all on public.caisse_tpe_terminaux    from public, anon, authenticated, service_role;
revoke all on public.caisse_tpe_transactions from public, anon, authenticated, service_role;
revoke all on public.caisse_tpe_bouclements  from public, anon, authenticated, service_role;
grant select on public.caisse_tpe_terminaux    to authenticated, service_role;
grant select on public.caisse_tpe_transactions to authenticated, service_role;
grant select on public.caisse_tpe_bouclements  to authenticated, service_role;

-- Qui a la caisse de cette maison (compte actif, rattache, droit caisse) :
-- la regle de caisse_peut_utiliser (v5), rendue lisible par une policy.
create or replace function public.caisse_tpe_lecteur(p_etablissement_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return coalesce(public.caisse_peut_utiliser(p_etablissement_id), false);
end;
$$;

revoke all on function public.caisse_tpe_lecteur(text) from public, anon, authenticated;
grant execute on function public.caisse_tpe_lecteur(text) to authenticated;

drop policy if exists caisse_tpe_terminaux_select on public.caisse_tpe_terminaux;
create policy caisse_tpe_terminaux_select on public.caisse_tpe_terminaux
  for select to authenticated
  using (public.caisse_tpe_lecteur(etablissement_id));

drop policy if exists caisse_tpe_transactions_select on public.caisse_tpe_transactions;
create policy caisse_tpe_transactions_select on public.caisse_tpe_transactions
  for select to authenticated
  using (public.caisse_tpe_lecteur(etablissement_id));

drop policy if exists caisse_tpe_bouclements_select on public.caisse_tpe_bouclements;
create policy caisse_tpe_bouclements_select on public.caisse_tpe_bouclements
  for select to authenticated
  using (
    public.caisse_tpe_lecteur(etablissement_id)
    and (select current_user_role()) = any(array['consultant', 'patron', 'resp_cuisine'])
  );

-- ----------------------------------------------------------------------------
-- 3. Fonctions internes (aucune n'est appelable par l'API)
-- ----------------------------------------------------------------------------
-- 3.1 Ce que peut une personne dans une maison, la personne etant passee en
-- argument (l'Edge Function tourne sans auth.uid()). Meme regle que
-- caisse_role_actif (v7) et caisse_peut_utiliser (v5) : compte actif, role,
-- rattachement, puis droit caisse (par personne, par role, defaut du code).
create or replace function public.caisse_tpe_acces(p_uid text, p_etablissement_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    text;
  v_actif   boolean;
  v_etabs   text[];
  v_nom     text;
  v_perso   jsonb;
  v_du_role jsonb;
  v_peut    boolean;
  v_rien    jsonb := jsonb_build_object('role', null, 'peut', false, 'nom', null);
begin
  if p_uid is null or p_etablissement_id is null then
    return v_rien;
  end if;
  select p.role, p.actif, p.etablissement_ids, nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '')
    into v_role, v_actif, v_etabs, v_nom
    from public.profiles p
   where p.id = p_uid;
  if not found or v_actif is false or coalesce(v_role, '') = ''
     or not coalesce(p_etablissement_id = any(v_etabs), false) then
    return v_rien;
  end if;

  if v_role = 'consultant' then
    v_peut := true;
  else
    select pu.perms -> 'caisse' into v_perso
      from public.permissions_utilisateurs pu
     where pu.user_id = p_uid;
    if jsonb_typeof(v_perso) = 'boolean' then
      v_peut := v_perso::boolean;
    else
      select pr.perms -> 'caisse' into v_du_role
        from public.permissions pr
       where pr.role_key = v_role;
      if jsonb_typeof(v_du_role) = 'boolean' then
        v_peut := v_du_role::boolean;
      else
        v_peut := v_role = any(array['patron', 'resp_cuisine', 'serveur']);
      end if;
    end if;
  end if;

  return jsonb_build_object('role', v_role, 'peut', coalesce(v_peut, false), 'nom', v_nom);
end;
$$;

-- Lue aussi par l'Edge Function avant de parler au prestataire (jumelage) :
-- elle ne rend qu'un role et un droit, jamais une donnee de la maison.
revoke all on function public.caisse_tpe_acces(text, text) from public, anon, authenticated;
grant execute on function public.caisse_tpe_acces(text, text) to service_role;

-- 3.2 Le reste a payer d'un ticket vu du serveur : le total des lignes moins
-- les transactions de terminal approuvees et non remboursees. Les especes et
-- les cartes saisies a la main ne sont posees qu'a l'encaissement : le reste
-- est donc un plafond, jamais depasse.
create or replace function public.caisse_tpe_reste(p_ticket_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select sum(round(l.quantite * l.prix_unitaire, 2))
                     from public.caisse_lignes l where l.ticket_id = p_ticket_id), 0)
       - coalesce((select sum(x.montant)
                     from public.caisse_tpe_transactions x
                    where x.ticket_id = p_ticket_id
                      and x.statut = 'approuve'
                      and x.rembourse_statut is distinct from 'fait'), 0);
$$;

revoke all on function public.caisse_tpe_reste(uuid) from public, anon, authenticated, service_role;

-- 3.3 Le plafond d'une transaction (caisse_reglages.config, cle tpe_plafond,
-- en francs, de 1 a 100000) ; absent ou hors bornes : 5000.
create or replace function public.caisse_tpe_plafond(p_etablissement_id text)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_brut jsonb;
  v_n    numeric;
begin
  select r.config -> 'tpe_plafond' into v_brut
    from public.caisse_reglages r
   where r.etablissement_id = p_etablissement_id;
  if v_brut is null or jsonb_typeof(v_brut) <> 'number' then
    return 5000;
  end if;
  v_n := (v_brut #>> '{}')::numeric;
  if v_n < 1 or v_n > 100000 then
    return 5000;
  end if;
  return round(v_n, 2);
end;
$$;

revoke all on function public.caisse_tpe_plafond(text) from public, anon, authenticated, service_role;

-- 3.4 Un texte venu du prestataire, borne et sans longue suite de chiffres :
-- seconde ligne de defense derriere la liste blanche de l'Edge Function.
create or replace function public.caisse_tpe_texte_propre(p_texte text, p_longueur int)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(left(btrim(regexp_replace(coalesce(p_texte, ''), '[0-9]{7,}', '[masque]', 'g')), p_longueur), '');
$$;

revoke all on function public.caisse_tpe_texte_propre(text, int) from public, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Gardes
-- ----------------------------------------------------------------------------
-- 4.1 Transaction de terminal : nait en demande, suit la table des
-- transitions (la meme que machine.js), garde son identite, et son resultat
-- ne bouge plus une fois final. Seul le remboursement se note ensuite, sur
-- une transaction approuvee. Ne se supprime pas, sauf celle d'un ticket de
-- test (purge du mode test, v6).
create or replace function public.caisse_tpe_transaction_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ok boolean;
begin
  if tg_op = 'DELETE' then
    if old.test then
      return old;
    end if;
    raise exception 'caisse: une transaction de terminal ne se supprime pas'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.statut <> 'demande' or new.final_at is not null or new.tranche_at is not null
       or new.rembourse_statut is not null then
      raise exception 'caisse: une transaction de terminal nait en demande'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.id, new.etablissement_id, new.ticket_id, new.terminal_id, new.test, new.prestataire,
      new.montant, new.devise, new.reference, new.demande_par, new.created_at)
     is distinct from
     (old.id, old.etablissement_id, old.ticket_id, old.terminal_id, old.test, old.prestataire,
      old.montant, old.devise, old.reference, old.demande_par, old.created_at) then
    raise exception 'caisse: une transaction de terminal garde son ticket, son terminal et son montant'
      using errcode = '42501';
  end if;

  if old.statut in ('approuve', 'refuse', 'annule', 'expire') then
    if new.statut is distinct from old.statut
       or (new.prestataire_id, new.marque, new.fin_carte, new.code_autorisation, new.pourboire, new.message,
           new.final_at, new.tranche_par, new.tranche_par_nom, new.tranche_at, new.tranche_motif)
          is distinct from
          (old.prestataire_id, old.marque, old.fin_carte, old.code_autorisation, old.pourboire, old.message,
           old.final_at, old.tranche_par, old.tranche_par_nom, old.tranche_at, old.tranche_motif) then
      raise exception 'caisse: le resultat d''une transaction de terminal ne se modifie plus'
        using errcode = '42501';
    end if;
    if old.rembourse_statut = 'fait'
       and (new.rembourse_statut, new.rembourse_genre, new.rembourse_par, new.rembourse_par_nom,
            new.rembourse_at, new.rembourse_message)
           is distinct from
           (old.rembourse_statut, old.rembourse_genre, old.rembourse_par, old.rembourse_par_nom,
            old.rembourse_at, old.rembourse_message) then
      raise exception 'caisse: un remboursement fait ne se modifie plus'
        using errcode = '42501';
    end if;
  else
    if new.statut is distinct from old.statut then
      v_ok := case old.statut
        when 'demande'   then new.statut in ('en_cours', 'approuve', 'refuse', 'annule', 'expire', 'incertain')
        when 'en_cours'  then new.statut in ('approuve', 'refuse', 'annule', 'expire', 'incertain')
        when 'incertain' then new.statut in ('approuve', 'refuse', 'annule', 'expire')
        else false end;
      if not coalesce(v_ok, false) then
        raise exception 'caisse: transition de terminal impossible (% vers %)', old.statut, new.statut
          using errcode = '42501';
      end if;
      if new.statut in ('approuve', 'refuse', 'annule', 'expire') then
        new.final_at := clock_timestamp();
      end if;
    end if;
    -- Le pourboire ne change qu'a l'accord (pourboire saisi sur le terminal).
    if new.pourboire is distinct from old.pourboire and new.statut <> 'approuve' then
      raise exception 'caisse: le pourboire d''une transaction ne change qu''a l''accord du terminal'
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.caisse_tpe_transaction_garde() from public, anon, authenticated, service_role;

drop trigger if exists trg_caisse_tpe_transaction_garde on public.caisse_tpe_transactions;
create trigger trg_caisse_tpe_transaction_garde
  before insert or update or delete on public.caisse_tpe_transactions
  for each row execute function public.caisse_tpe_transaction_garde();

drop trigger if exists trg_caisse_tpe_transactions_vidage on public.caisse_tpe_transactions;
create trigger trg_caisse_tpe_transactions_vidage
  before truncate on public.caisse_tpe_transactions
  for each statement execute function public.caisse_piece_figee('la table des transactions de terminal');

-- Un bouclement saisi ne se modifie ni ne se supprime : une correction est
-- une nouvelle saisie, la derniere vaut.
drop trigger if exists trg_caisse_tpe_bouclement_fige on public.caisse_tpe_bouclements;
create trigger trg_caisse_tpe_bouclement_fige
  before update or delete on public.caisse_tpe_bouclements
  for each row execute function public.caisse_piece_figee('un bouclement de terminal');

-- 4.2 Un terminal qui disparait (suppression de sa maison) emporte son
-- secret : rien ne reste dans le coffre.
create or replace function public.caisse_tpe_terminal_efface()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from vault.secrets s where s.name = 'caisse_tpe:' || old.id::text;
  return old;
end;
$$;

revoke all on function public.caisse_tpe_terminal_efface() from public, anon, authenticated, service_role;

drop trigger if exists trg_caisse_tpe_terminal_efface on public.caisse_tpe_terminaux;
create trigger trg_caisse_tpe_terminal_efface
  after delete on public.caisse_tpe_terminaux
  for each row execute function public.caisse_tpe_terminal_efface();

-- 4.3 Paiements : le lien vers une transaction ne s'ecrit pas depuis l'ecran.
-- L'ancien chemin d'encaissement (paiement insere par l'API, puis statut) ne
-- peut donc pas poser un paiement « terminal relie ». Un paiement ne se
-- modifie jamais (garde v1) : le lien pose par caisse_encaisser est definitif.
create or replace function public.caisse_paiement_garde_v9()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.tpe_transaction_id is not null and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'caisse: un paiement par terminal relie se pose par l''encaissement'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.caisse_paiement_garde_v9() from public, anon, authenticated, service_role;

drop trigger if exists trg_caisse_paiement_garde_v9 on public.caisse_paiements;
create trigger trg_caisse_paiement_garde_v9
  before insert on public.caisse_paiements
  for each row execute function public.caisse_paiement_garde_v9();

-- 4.4 Tickets : ce qu'un terminal a pris ne se perd pas. Passe apres les
-- gardes v1 a v7 et avant le scellement (ordre des noms : _garde_v9 puis
-- _sceller). Vaut pour la RPC caisse_encaisser comme pour l'ancien chemin.
--   - un ticket qui porte une transaction en route (demande, en_cours,
--     incertain) ne s'encaisse pas et ne s'abandonne pas : on attend la
--     reponse, ou un responsable tranche ;
--   - a l'encaissement, chaque transaction approuvee et non remboursee du
--     ticket doit etre portee par un de ses paiements ;
--   - un ticket qui porte une transaction approuvee et non remboursee ne
--     s'abandonne pas et ne se supprime pas ;
--   - un ticket dont un remboursement est demande et pas encore note ne
--     s'encaisse pas ;
--   - la suppression d'un ticket de test emporte ses transactions simulees.
create or replace function public.caisse_ticket_garde_v9()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.test then
      delete from public.caisse_tpe_transactions x where x.ticket_id = old.id and x.test;
      return old;
    end if;
    if exists (select 1 from public.caisse_tpe_transactions x where x.ticket_id = old.id) then
      raise exception 'caisse: ce ticket porte une transaction de terminal, il ne se supprime pas'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.statut = 'ouvert' and new.statut <> 'ouvert' and not old.test then
    if exists (
      select 1 from public.caisse_tpe_transactions x
       where x.ticket_id = old.id and x.statut in ('demande', 'en_cours', 'incertain')) then
      raise exception 'caisse: un paiement par carte attend sa reponse sur le terminal';
    end if;
    if new.statut = 'encaisse' and exists (
      select 1 from public.caisse_tpe_transactions x
       where x.ticket_id = old.id
         and x.statut = 'approuve'
         and x.rembourse_statut is distinct from 'fait'
         and not exists (
           select 1 from public.caisse_paiements p
            where p.ticket_id = old.id and p.tpe_transaction_id = x.id)) then
      raise exception 'caisse: un paiement accepte sur le terminal manque a l''encaissement';
    end if;
    -- Un remboursement demande et pas encore note : on attend sa reponse
    -- (sinon le ticket serait encaisse avec une carte rendue au client).
    if new.statut = 'encaisse' and exists (
      select 1 from public.caisse_tpe_transactions x
       where x.ticket_id = old.id and x.statut = 'approuve' and x.rembourse_statut = 'demande') then
      raise exception 'caisse: un remboursement sur le terminal est en cours pour ce ticket';
    end if;
    if new.statut = 'annule' and exists (
      select 1 from public.caisse_tpe_transactions x
       where x.ticket_id = old.id
         and x.statut = 'approuve'
         and x.rembourse_statut is distinct from 'fait') then
      raise exception 'caisse: ce ticket porte un paiement par carte accepte, a rembourser sur le terminal avant l''abandon';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.caisse_ticket_garde_v9() from public, anon, authenticated, service_role;

drop trigger if exists trg_caisse_ticket_garde_v9 on public.caisse_tickets;
create trigger trg_caisse_ticket_garde_v9
  before update or delete on public.caisse_tickets
  for each row execute function public.caisse_ticket_garde_v9();

-- 4.5 Lignes : le total d'un ticket ouvert ne descend jamais sous ce qu'un
-- terminal a pris ou est en train de prendre (transactions en route, ou
-- approuvees et non remboursees). Sans cette garde, une fusion vers un autre
-- ticket, une remise, un offert ou le retrait d'une ligne laisserait un
-- paiement par carte sans rien en face : le client paierait deux fois, ou le
-- ticket ne pourrait plus s'encaisser. Declencheur AFTER : la garde v2
-- (caisse_ligne_garde) a deja pris le verrou du ticket. Sans transaction de
-- terminal sur le ticket, il ne fait rien.
create or replace function public.caisse_ligne_garde_v9()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_pris  numeric;
  v_total numeric;
begin
  for v_id in
    select distinct y.id from unnest(array[
      case when tg_op <> 'INSERT' then old.ticket_id end,
      case when tg_op <> 'DELETE' then new.ticket_id end]) y(id) where y.id is not null
  loop
    select coalesce(sum(x.montant), 0) into v_pris
      from public.caisse_tpe_transactions x
      join public.caisse_tickets t on t.id = x.ticket_id and not t.test and t.statut = 'ouvert'
     where x.ticket_id = v_id
       and (x.statut in ('demande', 'en_cours', 'incertain')
            or (x.statut = 'approuve' and x.rembourse_statut is distinct from 'fait'));
    if v_pris > 0 then
      select coalesce(sum(round(l.quantite * l.prix_unitaire, 2)), 0) into v_total
        from public.caisse_lignes l where l.ticket_id = v_id;
      if v_total < v_pris then
        raise exception 'caisse: ce ticket porte un paiement par carte (%), son total ne peut pas descendre en dessous (%)', v_pris, v_total;
      end if;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.caisse_ligne_garde_v9() from public, anon, authenticated, service_role;

drop trigger if exists trg_caisse_ligne_garde_v9 on public.caisse_lignes;
create trigger trg_caisse_ligne_garde_v9
  after insert or update or delete on public.caisse_lignes
  for each row execute function public.caisse_ligne_garde_v9();

-- ----------------------------------------------------------------------------
-- 5. Fonctions de l'Edge Function caisse-tpe (service_role seulement)
-- ----------------------------------------------------------------------------
-- La personne (p_uid) est celle dont l'Edge Function a verifie le jeton.
-- Chaque fonction relit ses droits : l'Edge Function ne decide de rien.

-- 5.1 Relier un terminal : consultant et patron de la maison. Le secret
-- (texte, jamais relu ici) part au coffre sous le nom caisse_tpe:<id>.
create or replace function public.caisse_tpe_terminal_poser(
  p_uid              text,
  p_etablissement_id text,
  p_prestataire      text,
  p_nom              text,
  p_numero_serie     text,
  p_secret           text,
  p_cle_fin          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_acces jsonb := public.caisse_tpe_acces(p_uid, p_etablissement_id);
  v_role  text := v_acces ->> 'role';
  v_nom   text := nullif(btrim(coalesce(p_nom, '')), '');
  v_serie text := btrim(coalesce(p_numero_serie, ''));
  v       public.caisse_tpe_terminaux%rowtype;
begin
  if v_role is null or not (v_role = any(array['consultant', 'patron'])) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if p_prestataire is null or p_prestataire !~ '^[a-z][a-z0-9_]{1,29}$' then
    raise exception 'caisse: prestataire de terminal inconnu';
  end if;
  if v_nom is null or char_length(v_nom) > 40 then
    raise exception 'caisse: nom du terminal invalide (1 a 40 caracteres)';
  end if;
  if v_serie !~ '^[A-Za-z0-9._-]{1,40}$' then
    raise exception 'caisse: numero de serie du terminal invalide';
  end if;
  if p_secret is null or char_length(p_secret) < 2 or char_length(p_secret) > 4000 then
    raise exception 'caisse: cle du terminal manquante';
  end if;
  if exists (
    select 1 from public.caisse_tpe_terminaux t
     where t.etablissement_id = p_etablissement_id and t.prestataire = p_prestataire
       and t.numero_serie = v_serie and t.actif) then
    raise exception 'caisse: ce terminal est deja relie a cette maison';
  end if;

  insert into public.caisse_tpe_terminaux
    (etablissement_id, nom, prestataire, numero_serie, cle_fin, relie_par, relie_par_nom)
  values
    (p_etablissement_id, v_nom, p_prestataire, v_serie,
     case when char_length(coalesce(p_cle_fin, '')) = 4 then p_cle_fin end,
     p_uid, v_acces ->> 'nom')
  returning * into v;

  perform vault.create_secret(p_secret, 'caisse_tpe:' || v.id::text, 'Caisse : secret du terminal de paiement');

  insert into public.journal_activite
    (etablissement_id, acteur_id, acteur_nom, acteur_role, module, operation,
     ligne_id, libelle, colonnes_modifiees, avant, apres)
  values
    (p_etablissement_id, p_uid, v_acces ->> 'nom', v_role, 'caisse', 'INSERT',
     v.id::text, 'Terminal de paiement relié : ' || v.nom,
     array['terminal'], '{}'::jsonb,
     jsonb_build_object('prestataire', v.prestataire, 'numero_serie', v.numero_serie));

  return to_jsonb(v);
end;
$$;

revoke all on function public.caisse_tpe_terminal_poser(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.caisse_tpe_terminal_poser(text, text, text, text, text, text, text) to service_role;

-- 5.2 Retirer un terminal : consultant et patron. Le terminal reste en base
-- (ses transactions le citent), inactif ; son secret quitte le coffre.
create or replace function public.caisse_tpe_terminal_retirer(p_uid text, p_terminal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v       public.caisse_tpe_terminaux%rowtype;
  v_acces jsonb;
  v_role  text;
begin
  select * into v from public.caisse_tpe_terminaux where id = p_terminal_id for update;
  if not found then
    raise exception 'caisse: terminal introuvable';
  end if;
  v_acces := public.caisse_tpe_acces(p_uid, v.etablissement_id);
  v_role := v_acces ->> 'role';
  if v_role is null or not (v_role = any(array['consultant', 'patron'])) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if not v.actif then
    return to_jsonb(v);
  end if;
  if exists (
    select 1 from public.caisse_tpe_transactions x
     where x.terminal_id = v.id and x.statut in ('demande', 'en_cours', 'incertain')) then
    raise exception 'caisse: un paiement est en route sur ce terminal';
  end if;

  update public.caisse_tpe_terminaux
     set actif = false, retire_par = p_uid, retire_at = now()
   where id = v.id
  returning * into v;

  delete from vault.secrets s where s.name = 'caisse_tpe:' || v.id::text;

  insert into public.journal_activite
    (etablissement_id, acteur_id, acteur_nom, acteur_role, module, operation,
     ligne_id, libelle, colonnes_modifiees, avant, apres)
  values
    (v.etablissement_id, p_uid, v_acces ->> 'nom', v_role, 'caisse', 'UPDATE',
     v.id::text, 'Terminal de paiement retiré : ' || v.nom,
     array['actif'], jsonb_build_object('actif', true), jsonb_build_object('actif', false));

  return to_jsonb(v);
end;
$$;

revoke all on function public.caisse_tpe_terminal_retirer(text, uuid) from public, anon, authenticated;
grant execute on function public.caisse_tpe_terminal_retirer(text, uuid) to service_role;

-- 5.3 Le terminal et son secret, pour parler au prestataire. Reserve a qui a
-- la caisse de la maison du terminal. Le secret ne quitte jamais l'Edge
-- Function : cette fonction n'est pas appelable par l'API des ecrans.
create or replace function public.caisse_tpe_terminal_secret(p_uid text, p_terminal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v        public.caisse_tpe_terminaux%rowtype;
  v_acces  jsonb;
  v_secret text;
begin
  select * into v from public.caisse_tpe_terminaux where id = p_terminal_id;
  if not found then
    raise exception 'caisse: terminal introuvable';
  end if;
  v_acces := public.caisse_tpe_acces(p_uid, v.etablissement_id);
  if not coalesce((v_acces ->> 'peut')::boolean, false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if not v.actif then
    raise exception 'caisse: ce terminal n''est plus relie';
  end if;
  select d.decrypted_secret into v_secret
    from vault.decrypted_secrets d
   where d.name = 'caisse_tpe:' || v.id::text;
  if v_secret is null then
    raise exception 'caisse: cle du terminal introuvable, le relier a nouveau';
  end if;
  return jsonb_build_object('terminal', to_jsonb(v), 'secret', v_secret, 'role', v_acces ->> 'role');
end;
$$;

revoke all on function public.caisse_tpe_terminal_secret(text, uuid) from public, anon, authenticated;
grant execute on function public.caisse_tpe_terminal_secret(text, uuid) to service_role;

-- 5.4 Demarrer une transaction. Le serveur ne croit pas l'ecran : ticket
-- ouvert, de la maison du terminal, personne qui a la caisse, montant dans le
-- reste a payer et sous le plafond, CHF, aucune autre transaction en route
-- sur le ticket ni sur le terminal. La meme reference rend la meme
-- transaction (nouvelle = false) : un second appel ne debite pas deux fois.
create or replace function public.caisse_tpe_demarrer(
  p_uid         text,
  p_ticket_id   uuid,
  p_terminal_id uuid,
  p_montant     numeric,
  p_pourboire   numeric,
  p_reference   uuid,
  p_devise      text default 'CHF'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket    public.caisse_tickets%rowtype;
  v_terminal  public.caisse_tpe_terminaux%rowtype;
  v_tx        public.caisse_tpe_transactions%rowtype;
  v_acces     jsonb;
  v_montant   numeric := round(coalesce(p_montant, 0), 2);
  v_pourboire numeric := round(coalesce(p_pourboire, 0), 2);
  v_plafond   numeric;
  v_reste     numeric;
  v_contrainte text;
begin
  if p_reference is null then
    raise exception 'caisse: reference de transaction manquante';
  end if;

  -- Le verrou du ticket : deux demarrages du meme ticket passent l'un apres
  -- l'autre, le second voit la transaction du premier.
  select * into v_ticket from public.caisse_tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'caisse: ticket introuvable';
  end if;
  v_acces := public.caisse_tpe_acces(p_uid, v_ticket.etablissement_id);
  if not coalesce((v_acces ->> 'peut')::boolean, false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;

  -- Verrou partage sur le terminal : un retrait (caisse_tpe_terminal_retirer)
  -- attend la fin de ce demarrage, il ne passe pas entre la lecture et
  -- l'ecriture de la transaction.
  select * into v_terminal from public.caisse_tpe_terminaux where id = p_terminal_id for key share;
  if not found or v_terminal.etablissement_id <> v_ticket.etablissement_id then
    raise exception 'caisse: terminal inconnu pour cette maison' using errcode = '42501';
  end if;

  -- Une transaction restee sans reponse (ecran ferme, fonction interrompue)
  -- ne tient pas le terminal pour toujours : au bout de trois minutes elle
  -- devient incertaine. Son ticket reste a trancher ; le terminal est libre.
  update public.caisse_tpe_transactions
     set statut = 'incertain', message = 'Le terminal ne répond pas.'
   where (terminal_id = p_terminal_id or ticket_id = p_ticket_id)
     and statut in ('demande', 'en_cours')
     and reference <> p_reference
     and updated_at < clock_timestamp() - interval '3 minutes';

  -- Idempotence : la meme tentative, rejouee.
  select * into v_tx from public.caisse_tpe_transactions where reference = p_reference;
  if found then
    if v_tx.ticket_id <> p_ticket_id or v_tx.terminal_id <> p_terminal_id
       or v_tx.montant <> v_montant or v_tx.pourboire <> v_pourboire
       or v_tx.demande_par is distinct from p_uid then
      raise exception 'caisse: reference de transaction deja utilisee';
    end if;
    return jsonb_build_object('transaction', to_jsonb(v_tx), 'nouvelle', false);
  end if;

  if not v_terminal.actif then
    raise exception 'caisse: ce terminal n''est plus relie';
  end if;
  if v_ticket.statut <> 'ouvert' then
    raise exception 'caisse: le ticket n''est pas ouvert';
  end if;
  if v_ticket.test and v_terminal.prestataire <> 'simule' then
    raise exception 'caisse: un ticket de test ne part jamais sur un vrai terminal';
  end if;
  if not v_ticket.test and v_terminal.prestataire = 'simule' then
    raise exception 'caisse: le terminal simule ne sert que les tickets de test';
  end if;
  if coalesce(p_devise, 'CHF') <> 'CHF' then
    raise exception 'caisse: le terminal n''encaisse qu''en francs suisses';
  end if;
  if p_montant is null or v_montant <= 0 or v_pourboire < 0 then
    raise exception 'caisse: montant de paiement invalide';
  end if;
  v_plafond := public.caisse_tpe_plafond(v_ticket.etablissement_id);
  if v_montant + v_pourboire > v_plafond then
    raise exception 'caisse: montant au-dessus du plafond du terminal (%)', v_plafond;
  end if;
  v_reste := public.caisse_tpe_reste(p_ticket_id);
  if v_montant > v_reste + 0.004 then
    raise exception 'caisse: montant superieur au reste a payer (% pour %)', v_montant, v_reste;
  end if;

  if exists (
    select 1 from public.caisse_tpe_transactions x
     where x.ticket_id = p_ticket_id and x.statut in ('demande', 'en_cours', 'incertain')) then
    raise exception 'caisse: un paiement par carte est deja en route pour ce ticket';
  end if;
  if exists (
    select 1 from public.caisse_tpe_transactions x
     where x.terminal_id = p_terminal_id and x.statut in ('demande', 'en_cours')) then
    raise exception 'caisse: ce terminal est occupe par un autre paiement';
  end if;

  begin
    insert into public.caisse_tpe_transactions
      (etablissement_id, ticket_id, terminal_id, test, prestataire, montant, pourboire, devise,
       reference, demande_par, demande_par_nom)
    values
      (v_ticket.etablissement_id, p_ticket_id, p_terminal_id, v_ticket.test, v_terminal.prestataire,
       v_montant, v_pourboire, 'CHF', p_reference, p_uid, v_acces ->> 'nom')
    returning * into v_tx;
  exception when unique_violation then
    -- Deux demarrages au meme instant : un seul passe.
    get stacked diagnostics v_contrainte = constraint_name;
    if v_contrainte = 'caisse_tpe_transactions_terminal_en_route_key' then
      raise exception 'caisse: ce terminal est occupe par un autre paiement';
    elsif v_contrainte = 'caisse_tpe_transactions_ticket_en_route_key' then
      raise exception 'caisse: un paiement par carte est deja en route pour ce ticket';
    end if;
    raise exception 'caisse: reference de transaction deja utilisee';
  end;

  return jsonb_build_object('transaction', to_jsonb(v_tx), 'nouvelle', true);
end;
$$;

revoke all on function public.caisse_tpe_demarrer(text, uuid, uuid, numeric, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.caisse_tpe_demarrer(text, uuid, uuid, numeric, numeric, uuid, text) to service_role;

-- 5.5 Noter ce que le prestataire a rendu (deja passe par la liste blanche
-- de l'Edge Function ; les textes sont rebornes ici). Une transition que la
-- table n'admet pas (resultat tardif sur une transaction finale) ne change
-- rien et rend la transaction telle qu'elle est.
--   p_champs : prestataire_id, marque, fin_carte, code_autorisation, message,
--   pourboire (lu a l'accord seulement).
create or replace function public.caisse_tpe_noter(p_transaction_id uuid, p_statut text, p_champs jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx      public.caisse_tpe_transactions%rowtype;
  v_c       jsonb := coalesce(p_champs, '{}'::jsonb);
  v_ok      boolean;
  v_fin     text := v_c ->> 'fin_carte';
  v_code    text := v_c ->> 'code_autorisation';
  v_tip     numeric;
begin
  select * into v_tx from public.caisse_tpe_transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'caisse: transaction de terminal introuvable';
  end if;
  if p_statut is null
     or p_statut not in ('en_cours', 'approuve', 'refuse', 'annule', 'expire', 'incertain') then
    raise exception 'caisse: statut de terminal inconnu';
  end if;

  v_ok := case v_tx.statut
    when 'demande'   then p_statut in ('en_cours', 'approuve', 'refuse', 'annule', 'expire', 'incertain')
    when 'en_cours'  then p_statut in ('approuve', 'refuse', 'annule', 'expire', 'incertain')
    when 'incertain' then p_statut in ('approuve', 'refuse', 'annule', 'expire')
    else false end;
  if not coalesce(v_ok, false) then
    -- Le terminal annonce un accord pour une transaction deja close
    -- autrement (refusee, annulee, tranchee « non paye ») : rien ne change
    -- ici, mais le client a peut-etre ete debite. Une ligne au Journal
    -- d'activite, une seule par transaction, pour qu'un responsable regarde.
    if p_statut = 'approuve' and v_tx.statut in ('refuse', 'annule', 'expire') and not v_tx.test
       and not exists (
         select 1 from public.journal_activite j
          where j.etablissement_id = v_tx.etablissement_id and j.module = 'caisse'
            and j.ligne_id = v_tx.ticket_id::text
            and j.libelle = 'Terminal : accord reçu après coup, à vérifier sur le terminal'
            and j.apres ->> 'transaction' = v_tx.id::text) then
      insert into public.journal_activite
        (etablissement_id, acteur_id, acteur_nom, acteur_role, module, operation,
         ligne_id, libelle, colonnes_modifiees, avant, apres)
      values
        (v_tx.etablissement_id, null, 'Terminal de paiement', null, 'caisse', 'UPDATE',
         v_tx.ticket_id::text, 'Terminal : accord reçu après coup, à vérifier sur le terminal',
         array['statut'],
         jsonb_build_object('statut', v_tx.statut, 'montant', v_tx.montant),
         jsonb_build_object('annonce', 'approuve', 'transaction', v_tx.id));
    end if;
    return to_jsonb(v_tx);
  end if;

  -- Un accord sans identifiant du prestataire ne se pose pas : on ne pourrait
  -- ni le retrouver ni le rembourser. Il devient un doute, a trancher.
  if p_statut = 'approuve' and v_tx.prestataire_id is null
     and nullif(btrim(coalesce(v_c ->> 'prestataire_id', '')), '') is null then
    if v_tx.statut = 'incertain' then
      return to_jsonb(v_tx);
    end if;
    p_statut := 'incertain';
    v_c := v_c || jsonb_build_object('message', 'Accord du terminal sans identifiant.');
  end if;

  v_tip := v_tx.pourboire;
  if p_statut = 'approuve' and jsonb_typeof(v_c -> 'pourboire') = 'number' then
    v_tip := round((v_c ->> 'pourboire')::numeric, 2);
    if v_tip < 0 or v_tip > 100000 then
      v_tip := v_tx.pourboire;
    end if;
  end if;

  update public.caisse_tpe_transactions
     set statut = p_statut,
         prestataire_id = coalesce(left(nullif(btrim(coalesce(v_c ->> 'prestataire_id', '')), ''), 80), prestataire_id),
         marque = coalesce(public.caisse_tpe_texte_propre(v_c ->> 'marque', 30), marque),
         fin_carte = coalesce(case when v_fin ~ '^[0-9]{4}$' then v_fin end, fin_carte),
         code_autorisation = coalesce(case when v_code ~ '^[A-Za-z0-9]{1,12}$' then v_code end, code_autorisation),
         message = case when p_statut = 'approuve' then null
                        else coalesce(public.caisse_tpe_texte_propre(v_c ->> 'message', 200), message) end,
         pourboire = v_tip
   where id = p_transaction_id
  returning * into v_tx;

  -- Le premier paiement reel accepte d'un terminal : la section des Reglages
  -- cesse de dire qu'il n'a encore rien encaisse.
  if p_statut = 'approuve' and not v_tx.test then
    update public.caisse_tpe_terminaux
       set premier_paiement_reel_at = now()
     where id = v_tx.terminal_id and premier_paiement_reel_at is null;
  end if;

  return to_jsonb(v_tx);
end;
$$;

revoke all on function public.caisse_tpe_noter(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.caisse_tpe_noter(uuid, text, jsonb) to service_role;

-- 5.6 Lire une transaction, pour qui a la caisse de sa maison.
create or replace function public.caisse_tpe_lire(p_uid text, p_transaction_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx    public.caisse_tpe_transactions%rowtype;
  v_acces jsonb;
begin
  select * into v_tx from public.caisse_tpe_transactions where id = p_transaction_id;
  if not found then
    raise exception 'caisse: transaction de terminal introuvable';
  end if;
  v_acces := public.caisse_tpe_acces(p_uid, v_tx.etablissement_id);
  if not coalesce((v_acces ->> 'peut')::boolean, false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  return jsonb_build_object('transaction', to_jsonb(v_tx), 'role', v_acces ->> 'role');
end;
$$;

revoke all on function public.caisse_tpe_lire(text, uuid) from public, anon, authenticated;
grant execute on function public.caisse_tpe_lire(text, uuid) to service_role;

-- 5.7 Trancher un resultat incertain : consultant, patron, resp_cuisine, avec
-- un motif, au Journal d'activite. « paye » : la transaction devient
-- approuvee (le terminal a debite, le responsable l'a vu sur le terminal) ;
-- « non_paye » : annulee. Rien n'est debite ici : on note ce qui s'est passe.
create or replace function public.caisse_tpe_trancher(
  p_uid text, p_transaction_id uuid, p_decision text, p_motif text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx    public.caisse_tpe_transactions%rowtype;
  v_acces jsonb;
  v_role  text;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
begin
  select * into v_tx from public.caisse_tpe_transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'caisse: transaction de terminal introuvable';
  end if;
  v_acces := public.caisse_tpe_acces(p_uid, v_tx.etablissement_id);
  v_role := v_acces ->> 'role';
  if v_role is null or not (v_role = any(array['consultant', 'patron', 'resp_cuisine'])) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('paye', 'non_paye') then
    raise exception 'caisse: decision inconnue';
  end if;
  if v_tx.statut <> 'incertain' then
    raise exception 'caisse: seule une transaction incertaine se tranche';
  end if;
  if v_motif is null or char_length(v_motif) < 3 or char_length(v_motif) > 300 then
    raise exception 'caisse: un motif est obligatoire (3 a 300 caracteres)';
  end if;
  if v_motif ~ '[0-9]{12,}' then
    raise exception 'caisse: pas de numero de carte dans un motif';
  end if;

  update public.caisse_tpe_transactions
     set statut = case p_decision when 'paye' then 'approuve' else 'annule' end,
         message = case p_decision when 'paye' then null else 'Tranché : non payé' end,
         tranche_par = p_uid, tranche_par_nom = v_acces ->> 'nom',
         tranche_at = clock_timestamp(), tranche_motif = v_motif
   where id = p_transaction_id
  returning * into v_tx;

  if not v_tx.test then
    insert into public.journal_activite
      (etablissement_id, acteur_id, acteur_nom, acteur_role, module, operation,
       ligne_id, libelle, colonnes_modifiees, avant, apres)
    values
      (v_tx.etablissement_id, p_uid, v_acces ->> 'nom', v_role, 'caisse', 'UPDATE',
       v_tx.ticket_id::text,
       'Paiement par carte incertain tranché : ' || case p_decision when 'paye' then 'payé' else 'non payé' end,
       array['statut'],
       jsonb_build_object('statut', 'incertain', 'montant', v_tx.montant),
       jsonb_build_object('statut', v_tx.statut, 'motif', v_motif, 'transaction', v_tx.id));
  end if;

  return to_jsonb(v_tx);
end;
$$;

revoke all on function public.caisse_tpe_trancher(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.caisse_tpe_trancher(text, uuid, text, text) to service_role;

-- 5.8 Remboursement sur le terminal : un geste a part, explicite, consultant
-- et patron. Jamais automatique : caisse_annuler_ticket ne rembourse rien.
-- Possible sur une transaction approuvee dont le ticket est annule, ou encore
-- ouvert (la carte a ete prise, le client paie finalement autrement). Un
-- ticket encaisse s'annule d'abord, depuis l'historique.
--   _demander : verifie et marque la demande, rend la transaction et si
--     l'accord date du meme jour (annulation du jour, sinon remboursement) ;
--   _noter    : note le resultat. Un echec laisse la mention « a faire sur le
--     terminal » ; la demande peut etre refaite.
create or replace function public.caisse_tpe_rembourser_demander(p_uid text, p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx     public.caisse_tpe_transactions%rowtype;
  v_acces  jsonb;
  v_role   text;
  v_statut text;
  v_ticket uuid;
begin
  -- Meme ordre de verrous que caisse_encaisser : le ticket, puis la
  -- transaction. Un encaissement et un remboursement ne se croisent pas.
  select x.ticket_id into v_ticket from public.caisse_tpe_transactions x where x.id = p_transaction_id;
  if not found then
    raise exception 'caisse: transaction de terminal introuvable';
  end if;
  select t.statut into v_statut from public.caisse_tickets t where t.id = v_ticket for update;
  select * into v_tx from public.caisse_tpe_transactions where id = p_transaction_id for update;
  v_acces := public.caisse_tpe_acces(p_uid, v_tx.etablissement_id);
  v_role := v_acces ->> 'role';
  if v_role is null or not (v_role = any(array['consultant', 'patron'])) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if v_tx.statut <> 'approuve' then
    raise exception 'caisse: seul un paiement accepte se rembourse';
  end if;
  if v_tx.rembourse_statut = 'fait' then
    raise exception 'caisse: ce paiement est deja rembourse';
  end if;
  -- Une demande deja partie et pas encore notee : pas de seconde demande
  -- (double tap). Passe deux minutes sans reponse, elle peut etre refaite.
  if v_tx.rembourse_statut = 'demande' and v_tx.rembourse_at > clock_timestamp() - interval '2 minutes' then
    raise exception 'caisse: un remboursement est deja en cours pour ce paiement';
  end if;
  if v_statut = 'encaisse' then
    raise exception 'caisse: annuler d''abord le ticket, depuis l''historique';
  end if;

  update public.caisse_tpe_transactions
     set rembourse_statut = 'demande', rembourse_par = p_uid, rembourse_par_nom = v_acces ->> 'nom',
         rembourse_at = clock_timestamp(), rembourse_genre = null, rembourse_message = null
   where id = p_transaction_id
  returning * into v_tx;

  return jsonb_build_object(
    'transaction', to_jsonb(v_tx),
    'meme_jour', (v_tx.final_at at time zone 'Europe/Zurich')::date = (now() at time zone 'Europe/Zurich')::date);
end;
$$;

revoke all on function public.caisse_tpe_rembourser_demander(text, uuid) from public, anon, authenticated;
grant execute on function public.caisse_tpe_rembourser_demander(text, uuid) to service_role;

create or replace function public.caisse_tpe_rembourser_noter(
  p_transaction_id uuid, p_fait boolean, p_genre text, p_message text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx   public.caisse_tpe_transactions%rowtype;
  v_role text;
begin
  select * into v_tx from public.caisse_tpe_transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'caisse: transaction de terminal introuvable';
  end if;
  if v_tx.rembourse_statut is distinct from 'demande' then
    return to_jsonb(v_tx);
  end if;

  update public.caisse_tpe_transactions
     set rembourse_statut = case when coalesce(p_fait, false) then 'fait' else 'echec' end,
         rembourse_genre = case when p_genre in ('void', 'refund') then p_genre end,
         rembourse_message = public.caisse_tpe_texte_propre(p_message, 200)
   where id = p_transaction_id
  returning * into v_tx;

  if not v_tx.test then
    select p.role into v_role from public.profiles p where p.id = v_tx.rembourse_par;
    insert into public.journal_activite
      (etablissement_id, acteur_id, acteur_nom, acteur_role, module, operation,
       ligne_id, libelle, colonnes_modifiees, avant, apres)
    values
      (v_tx.etablissement_id, v_tx.rembourse_par, v_tx.rembourse_par_nom, v_role, 'caisse', 'UPDATE',
       v_tx.ticket_id::text,
       case when v_tx.rembourse_statut = 'fait' then 'Paiement par carte remboursé sur le terminal'
            else 'Remboursement à faire sur le terminal (la demande a échoué)' end,
       array['remboursement'],
       jsonb_build_object('montant', v_tx.montant, 'pourboire', v_tx.pourboire),
       jsonb_build_object('remboursement', v_tx.rembourse_statut, 'genre', v_tx.rembourse_genre, 'transaction', v_tx.id));
  end if;

  return to_jsonb(v_tx);
end;
$$;

revoke all on function public.caisse_tpe_rembourser_noter(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.caisse_tpe_rembourser_noter(uuid, boolean, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 6. RPC de l'ecran (authenticated)
-- ----------------------------------------------------------------------------
-- 6.1 Le total du bouclement d'un terminal pour un jour d'exploitation.
-- Consultant, patron, resp_cuisine. Une correction est une nouvelle saisie.
create or replace function public.caisse_tpe_bouclement_poser(
  p_etablissement_id text, p_terminal_id uuid, p_jour date, p_montant numeric)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  text := auth.uid()::text;
  v_role text;
  v_nom  text;
  v      public.caisse_tpe_bouclements%rowtype;
begin
  v_role := public.caisse_role_actif(p_etablissement_id);
  if v_role is null or not (v_role = any(array['consultant', 'patron', 'resp_cuisine'])) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if p_jour is null or p_jour > public.caisse_jour_exploitation(p_etablissement_id, now()) then
    raise exception 'caisse: jour de bouclement invalide';
  end if;
  if p_montant is null or p_montant < 0 or p_montant > 10000000 then
    raise exception 'caisse: total du bouclement invalide';
  end if;
  if not exists (
    select 1 from public.caisse_tpe_terminaux t
     where t.id = p_terminal_id and t.etablissement_id = p_etablissement_id) then
    raise exception 'caisse: terminal inconnu pour cette maison' using errcode = '42501';
  end if;
  select nullif(btrim(concat_ws(' ', p.prenom, p.nom)), '') into v_nom
    from public.profiles p where p.id = v_uid;

  insert into public.caisse_tpe_bouclements
    (etablissement_id, terminal_id, jour_exploitation, montant, saisi_par, saisi_par_nom)
  values
    (p_etablissement_id, p_terminal_id, p_jour, round(p_montant, 2), v_uid, v_nom)
  returning * into v;
  return to_jsonb(v);
end;
$$;

revoke all on function public.caisse_tpe_bouclement_poser(text, uuid, date, numeric) from public, anon, authenticated;
grant execute on function public.caisse_tpe_bouclement_poser(text, uuid, date, numeric) to authenticated;

-- 6.2 Les liens paiement vers terminal d'une periode, pour le rapport des
-- moyens de paiement, et les bouclements saisis. Consultant et patron (le
-- responsable de cuisine ne lit pas les paiements, regle de la v8). Vrais
-- tickets numerotes seulement, 62 jours au plus.
create or replace function public.caisse_tpe_rapport(
  p_etablissement_id text, p_debut date, p_fin date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  v_role := public.caisse_role_actif(p_etablissement_id);
  if v_role is null or not (v_role = any(array['consultant', 'patron'])) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  if p_debut is null or p_fin is null or p_fin < p_debut or p_fin - p_debut > 61 then
    raise exception 'caisse: periode de rapport invalide';
  end if;

  return jsonb_build_object(
    'liens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'paiement_id', p.id, 'transaction_id', x.id, 'terminal_id', x.terminal_id,
               'marque', x.marque, 'tranche', x.tranche_at is not null,
               'rembourse', x.rembourse_statut)
             order by p.created_at, p.id)
        from public.caisse_tickets t
        join public.caisse_paiements p on p.ticket_id = t.id
        join public.caisse_tpe_transactions x on x.id = p.tpe_transaction_id
       where t.etablissement_id = p_etablissement_id
         and t.test = false
         and t.numero is not null
         and (t.jour_exploitation between p_debut and p_fin
              or t.annule_jour between p_debut and p_fin)), '[]'::jsonb),
    'terminaux', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nom', m.nom, 'prestataire', m.prestataire, 'actif', m.actif)
             order by m.nom, m.id)
        from public.caisse_tpe_terminaux m
       where m.etablissement_id = p_etablissement_id), '[]'::jsonb),
    'bouclements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'terminal_id', b.terminal_id, 'jour', b.jour_exploitation, 'montant', b.montant,
               'saisi_par_nom', b.saisi_par_nom, 'created_at', b.created_at)
             order by b.jour_exploitation, b.terminal_id)
        from (
          select distinct on (y.terminal_id, y.jour_exploitation) y.*
            from public.caisse_tpe_bouclements y
           where y.etablissement_id = p_etablissement_id
             and y.jour_exploitation between p_debut and p_fin
           order by y.terminal_id, y.jour_exploitation, y.created_at desc, y.id
        ) b), '[]'::jsonb));
end;
$$;

revoke all on function public.caisse_tpe_rapport(text, date, date) from public, anon, authenticated;
grant execute on function public.caisse_tpe_rapport(text, date, date) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. caisse_encaisser (v7), reprise : le paiement « terminal relie »
-- ----------------------------------------------------------------------------
-- Meme signature, meme reponse. Seul ajout : un paiement peut porter « tpe »,
-- l'identifiant d'une transaction de terminal. Il doit alors etre en carte,
-- et la transaction : approuvee, du meme ticket, du meme montant et du meme
-- pourboire, pas de test, pas remboursee, citee une seule fois. Le lien est
-- pose avec le paiement. Le declencheur caisse_ticket_garde_v9 refuse ensuite
-- l'encaissement s'il manque une transaction approuvee du ticket.
-- Un appel sans « tpe » (le front en ligne) suit exactement le chemin de la v7.
-- Rappel des regles de la v7, inchangees :
-- Tout membre qui a la caisse (caisse_peut_utiliser, v5 : compte actif,
-- rattache, droit caisse). Une transaction : paiements, passage a encaisse,
-- sceau (numero sous verrou, taux, total, empreinte) par le declencheur.
--   p_paiements : [{ moyen, libelle, montant, recu, pourboire, tpe }]
--     moyen    : especes, carte, autre ;
--     montant  : la part du ticket reglee par ce moyen. La somme fait le
--                total, au centime ;
--     recu     : especes donnees par le client (facultatif) ; le rendu est
--                calcule ici ;
--     pourboire : a part, jamais dans le total ;
--     tpe      : v9, l'identifiant de la transaction de terminal (facultatif).
--   Arrondi aux 5 centimes : sur la part reglee en especes seulement, si le
--   reglage arrondi_especes n'est pas coupe ; l'ecart est porte par le
--   dernier paiement en especes.
--   p_a_emporter : null = ce que porte deja le ticket.
-- Refuse un ticket vide, deja encaisse ou annule. Ticket de test : aucun
-- numero, aucun maillon ; un seul paiement simule, marque TEST, sans
-- pourboire ni rendu, et sans lien vers une transaction.
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

-- ----------------------------------------------------------------------------
-- 8. caisse_totaux_jour (v7), reprise : la cle « cartes »
-- ----------------------------------------------------------------------------
-- Toutes les cles de la v7 sont rendues a l'identique. Ajout : « cartes »,
-- les paiements par carte du jour, par terminal relie d'un cote, saisis a la
-- main de l'autre (ventes, annulations du jour, net). Les montants suivent la
-- regle des moyens : ce que la maison garde, pourboires a part.
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

comment on function public.caisse_tpe_demarrer(text, uuid, uuid, numeric, numeric, uuid, text) is
  'Caisse v9 : demarre une transaction de terminal apres avoir relu le ticket, les droits, le reste a payer et le plafond. Idempotente sur la reference. Appelee par l''Edge Function caisse-tpe seulement.';
comment on function public.caisse_tpe_terminal_secret(text, uuid) is
  'Caisse v9 : le terminal et son secret (coffre), pour l''Edge Function caisse-tpe seulement. Jamais appelable par l''API des ecrans.';

-- ============================================================================
-- ROLLBACK (a executer manuellement si besoin, front v9 retire et Edge
-- Function caisse-tpe supprimee d'abord). Des qu'un paiement « terminal
-- relie » a ete encaisse, les transactions sont des pieces a garder : exporter
-- caisse_tpe_transactions AVANT, ou ne pas revenir en arriere.
--
--   -- 1. rejouer caisse_encaisser et caisse_totaux_jour de 20261110_caisse_v7.sql
--   drop function if exists public.caisse_tpe_rapport(text, date, date);
--   drop function if exists public.caisse_tpe_bouclement_poser(text, uuid, date, numeric);
--   drop function if exists public.caisse_tpe_rembourser_noter(uuid, boolean, text, text);
--   drop function if exists public.caisse_tpe_rembourser_demander(text, uuid);
--   drop function if exists public.caisse_tpe_trancher(text, uuid, text, text);
--   drop function if exists public.caisse_tpe_lire(text, uuid);
--   drop function if exists public.caisse_tpe_noter(uuid, text, jsonb);
--   drop function if exists public.caisse_tpe_demarrer(text, uuid, uuid, numeric, numeric, uuid, text);
--   drop function if exists public.caisse_tpe_terminal_secret(text, uuid);
--   drop function if exists public.caisse_tpe_terminal_retirer(text, uuid);
--   drop function if exists public.caisse_tpe_terminal_poser(text, text, text, text, text, text, text);
--   drop trigger if exists trg_caisse_ligne_garde_v9 on public.caisse_lignes;
--   drop function if exists public.caisse_ligne_garde_v9();
--   drop trigger if exists trg_caisse_ticket_garde_v9 on public.caisse_tickets;
--   drop function if exists public.caisse_ticket_garde_v9();
--   drop trigger if exists trg_caisse_paiement_garde_v9 on public.caisse_paiements;
--   drop function if exists public.caisse_paiement_garde_v9();
--   drop index if exists public.caisse_paiements_tpe_transaction_key;
--   alter table public.caisse_paiements drop constraint if exists caisse_paiements_tpe_carte;
--   alter table public.caisse_paiements drop column if exists tpe_transaction_id;
--   delete from vault.secrets where name like 'caisse_tpe:%';
--   drop table if exists public.caisse_tpe_bouclements;
--   drop table if exists public.caisse_tpe_transactions;
--   drop table if exists public.caisse_tpe_terminaux;
--   drop function if exists public.caisse_tpe_terminal_efface();
--   drop function if exists public.caisse_tpe_transaction_garde();
--   drop function if exists public.caisse_tpe_texte_propre(text, int);
--   drop function if exists public.caisse_tpe_plafond(text);
--   drop function if exists public.caisse_tpe_reste(uuid);
--   drop function if exists public.caisse_tpe_acces(text, text);
--   drop function if exists public.caisse_tpe_lecteur(text);
-- ============================================================================
