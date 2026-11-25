-- ============================================================================
-- Caisse : encaisser en especes quand le reseau tombe (lot 07 du panel,
-- 25.11.2026)
-- ============================================================================
-- Une maison qui a allume le reglage d'ecran « especes_hors_ligne » garde sur
-- l'appareil, sans reseau, la vente en especes d'un ticket deja ouvert. Au
-- retour du reseau, l'appareil la rejoue par la fonction de cette migration.
--
-- Expand seul, idempotent :
--   1. une table neuve, journal des rejeux (une ligne par cle de l'appareil) ;
--   2. une fonction neuve, caisse_encaisser_hors_ligne, qui APPELLE
--      public.caisse_encaisser telle quelle. La base reste seule a numeroter,
--      a dater et a sceller : numero, heure legale et jour d'exploitation sont
--      ceux du rejeu, jamais ceux du geste. L'heure du geste est gardee a
--      part, a titre d'information, bornee par l'horloge de la base.
--
-- Cette migration ne redefinit rien : ni l'encaissement, ni le scellement, ni
-- la cloture, ni les gardes, ni la chaine, et n'ajoute aucune colonne a une
-- table existante. Le front d'avant ne lit ni la table ni la fonction.
--
-- Pas de begin/commit dans ce fichier : l'outil de migration l'enveloppe deja
-- dans une transaction.
-- Rollback : 20261125_caisse_especes_hors_ligne.rollback.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Journal des rejeux
-- ----------------------------------------------------------------------------
create table if not exists public.caisse_encaissements_hors_ligne (
  client_uuid      uuid primary key,
  etablissement_id text not null,
  ticket_id        uuid references public.caisse_tickets(id) on delete set null,
  statut           text not null check (statut in ('rejoue', 'deja_encaisse', 'refuse')),
  motif            text,
  montant          numeric(12,2),
  geste_at         timestamptz not null,
  rejoue_at        timestamptz not null default now(),
  par              text not null,
  poste            text,
  reponse          jsonb
);

create index if not exists idx_caisse_hors_ligne_ticket
  on public.caisse_encaissements_hors_ligne(ticket_id);
create index if not exists idx_caisse_hors_ligne_etab_date
  on public.caisse_encaissements_hors_ligne(etablissement_id, rejoue_at desc);

alter table public.caisse_encaissements_hors_ligne enable row level security;

-- Aucune ecriture par l'API : la table n'est ecrite que par la fonction
-- ci-dessous, proprietaire de la base. Lecture : consultant, patron et
-- resp_cuisine de l'etablissement (meme policy que caisse_clotures). Un compte
-- sans role ne lit rien : current_user_role() nul ne passe pas le test.
revoke all on public.caisse_encaissements_hors_ligne from public, anon, authenticated;
grant select on public.caisse_encaissements_hors_ligne to authenticated;

drop policy if exists caisse_encaissements_hors_ligne_select on public.caisse_encaissements_hors_ligne;
create policy caisse_encaissements_hors_ligne_select on public.caisse_encaissements_hors_ligne
  for select to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant', 'patron', 'resp_cuisine'])
  );

comment on table public.caisse_encaissements_hors_ligne is 'Caisse, lot 07 du panel : journal des rejeux des ventes en especes gardees sans reseau. Une ligne par cle de l''appareil (client_uuid). Lecture consultant, patron, resp_cuisine ; ecriture par caisse_encaisser_hors_ligne seulement.';
comment on column public.caisse_encaissements_hors_ligne.geste_at is 'Heure du geste sur l''appareil, bornee par l''horloge de la base. A titre d''information : l''heure legale du ticket est celle du rejeu.';
comment on column public.caisse_encaissements_hors_ligne.ticket_id is 'Nul quand le ticket est introuvable ou d''un autre etablissement : jamais un identifiant non verifie.';

-- ----------------------------------------------------------------------------
-- 2. Rejeu d'une vente en especes gardee sans reseau
-- ----------------------------------------------------------------------------
-- Rend { statut: 'rejoue' | 'deja_encaisse' | 'refuse', ... }. Les refus
-- journalises sont rendus comme une reponse normale, sans raise : un raise
-- annulerait la ligne du journal. Seuls levent : un appelant sans droit, une
-- cle deja servie a un autre compte, et une liste de paiements qui n'est pas
-- faite d'especes seules (rien n'est alors journalise).
create or replace function public.caisse_encaisser_hors_ligne(
  p_client_uuid      uuid,
  p_etablissement_id text,
  p_ticket_id        uuid,
  p_paiements        jsonb,
  p_a_emporter       boolean,
  p_geste_at         timestamptz,
  p_poste            text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     text := auth.uid()::text;
  v_peut    boolean;
  v_deja    public.caisse_encaissements_hors_ligne%rowtype;
  v_ticket  public.caisse_tickets%rowtype;
  v_trouve  boolean := false;
  v_ticket_id uuid := null;
  v_statut  text;
  v_motif   text := null;
  v_rep     jsonb;
  v_montant numeric := 0;
  v_un      numeric;
  e         jsonb;
begin
  -- 1. L'appelant : connecte, avec le droit caisse de l'etablissement.
  if v_uid is null or p_client_uuid is null or p_geste_at is null or p_etablissement_id is null then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;
  v_peut := public.caisse_peut_utiliser(p_etablissement_id);
  if not coalesce(v_peut, false) then
    raise exception 'caisse: acces refuse' using errcode = '42501';
  end if;

  -- 2. Deux rejeux de la meme cle passent l'un apres l'autre. Une cle deja
  --    servie rend sa reponse d'origine, a son auteur seulement.
  perform pg_advisory_xact_lock(hashtextextended(p_client_uuid::text, 0));
  select * into v_deja from public.caisse_encaissements_hors_ligne where client_uuid = p_client_uuid;
  if found then
    if v_deja.par is distinct from v_uid or v_deja.etablissement_id is distinct from p_etablissement_id then
      raise exception 'caisse: acces refuse' using errcode = '42501';
    end if;
    return coalesce(v_deja.reponse, '{}'::jsonb) || jsonb_build_object('doublon', true);
  end if;

  -- 3. Des especes, et rien d'autre : plus strict que caisse_encaisser.
  if p_paiements is null or jsonb_typeof(p_paiements) <> 'array'
     or jsonb_array_length(p_paiements) < 1 or jsonb_array_length(p_paiements) > 8 then
    raise exception 'caisse: hors ligne, especes seulement';
  end if;
  for e in select * from jsonb_array_elements(p_paiements) loop
    if jsonb_typeof(e) <> 'object' or (e ->> 'moyen') is distinct from 'especes'
       or e ? 'tpe' or e ? 'bon_cadeau' then
      raise exception 'caisse: hors ligne, especes seulement';
    end if;
    -- Des nombres, pour que rien ne leve hors des refus de la caisse.
    if jsonb_typeof(e -> 'montant') is distinct from 'number'
       or coalesce(jsonb_typeof(e -> 'recu'), 'null') not in ('number', 'null')
       or coalesce(jsonb_typeof(e -> 'pourboire'), 'null') not in ('number', 'null') then
      raise exception 'caisse: montant de paiement invalide';
    end if;
    v_un := (e ->> 'montant')::numeric;
    if v_un < 0 or v_un > 1000000
       or coalesce((e ->> 'recu')::numeric, 0) not between 0 and 1000000
       or coalesce((e ->> 'pourboire')::numeric, 0) not between 0 and 100000 then
      raise exception 'caisse: montant de paiement invalide';
    end if;
    v_montant := v_montant + round(v_un, 2);
  end loop;

  -- 4. Le ticket, sous le verrou que caisse_encaisser reprend dans la meme
  --    transaction. Introuvable ou d'un autre etablissement : refus journalise
  --    sans identifiant de ticket.
  select * into v_ticket from public.caisse_tickets where id = p_ticket_id for update;
  v_trouve := found and v_ticket.etablissement_id = p_etablissement_id;

  if not v_trouve then
    v_statut := 'refuse';
    v_motif := 'caisse: ticket introuvable';
  elsif v_ticket.test then
    v_ticket_id := v_ticket.id;
    v_statut := 'refuse';
    v_motif := 'caisse: hors ligne, pas de ticket de test';
  elsif v_ticket.statut = 'encaisse' then
    -- 5. Deja encaisse (reponse perdue d'un envoi en ligne, ou autre poste) :
    --    on ne peut pas savoir si c'est le meme geste, l'ecran fait verifier.
    v_ticket_id := v_ticket.id;
    v_statut := 'deja_encaisse';
  else
    -- 6. L'encaissement, tel quel. Un refus de la caisse defait tout ce que
    --    caisse_encaisser avait commence (sous-bloc) et se journalise ; toute
    --    autre erreur remonte et annule l'appel, l'appareil reessaiera.
    v_ticket_id := v_ticket.id;
    begin
      v_rep := public.caisse_encaisser(p_ticket_id, p_paiements, p_a_emporter);
      v_statut := 'rejoue';
    exception when raise_exception or insufficient_privilege then
      if sqlerrm like 'caisse:%' then
        v_statut := 'refuse';
        v_motif := sqlerrm;
      else
        raise;
      end if;
    end;
  end if;

  -- 7. La reponse, champ par champ.
  if v_statut = 'rejoue' then
    v_rep := coalesce(v_rep, '{}'::jsonb)
      || jsonb_build_object('statut', 'rejoue', 'geste_at', least(p_geste_at, now()));
  elsif v_statut = 'deja_encaisse' then
    v_rep := jsonb_build_object('statut', 'deja_encaisse', 'ticket_id', v_ticket_id,
                                'numero', v_ticket.numero, 'annee', v_ticket.annee);
  else
    v_rep := jsonb_build_object('statut', 'refuse', 'motif', v_motif, 'ticket_id', v_ticket_id);
  end if;

  -- 8. Le journal. Le verrou de l'etape 2 rend le conflit impossible ; s'il
  --    arrivait quand meme, la ligne deja ecrite fait foi et c'est elle qu'on
  --    rend.
  insert into public.caisse_encaissements_hors_ligne
    (client_uuid, etablissement_id, ticket_id, statut, motif, montant, geste_at, par, poste, reponse)
  values
    (p_client_uuid, p_etablissement_id, v_ticket_id, v_statut, v_motif, v_montant,
     least(p_geste_at, now()), v_uid, nullif(left(btrim(coalesce(p_poste, '')), 60), ''), v_rep)
  on conflict (client_uuid) do nothing;

  select j.reponse into v_rep from public.caisse_encaissements_hors_ligne j where j.client_uuid = p_client_uuid;
  return v_rep;
end;
$$;

revoke all on function public.caisse_encaisser_hors_ligne(uuid, text, uuid, jsonb, boolean, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function public.caisse_encaisser_hors_ligne(uuid, text, uuid, jsonb, boolean, timestamptz, text) to authenticated;

comment on function public.caisse_encaisser_hors_ligne(uuid, text, uuid, jsonb, boolean, timestamptz, text) is 'Caisse, lot 07 du panel : rejeu d''une vente en especes gardee sans reseau. Idempotente par p_client_uuid, especes seulement, jamais un ticket de test. Appelle caisse_encaisser telle quelle : numero, heure et jour sont ceux du rejeu.';
