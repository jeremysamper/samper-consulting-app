-- Inverse de 20261119_points_auteur_connecte : remet les colonnes candidates
-- (corps des migrations P1 à P3). Un seul passage.

set local lock_timeout = '3s';

create or replace function public.points_trg_haccp_releves()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    -- Un crédit par (zone, jour de Zurich, matin ou soir), toutes personnes.
    perform public.points_verser(new.etablissement_id, new.operateur, 'releve_haccp', 'haccp_releves', new.id,
      coalesce(nullif(btrim(new.zone_id), ''), 'sans-zone') || ':' || public.points_jour_zurich() || ':'
        || public.points_moment_zurich(now()));
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('haccp_releves', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_haccp_releves : %', sqlerrm;
  return null;
end;
$fn$;

create or replace function public.points_trg_haccp_controls()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    perform public.points_crediter(new.etablissement_id, new.operateur, 'controle_haccp', 'haccp_controls', new.id);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('haccp_controls', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_haccp_controls : %', sqlerrm;
  return null;
end;
$fn$;

create or replace function public.points_trg_haccp_tracabilite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_auteur text;
  v_produit text;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    v_produit := lower(btrim(coalesce(new.produit, '')));
    if v_produit = '' or (coalesce(btrim(new.photo_url), '') = '' and coalesce(btrim(new.storage_path), '') = '') then
      return null;
    end if;
    v_auteur := public.points_auteur(new.operateur, new.etablissement_id);
    if v_auteur is null then
      return null;
    end if;
    perform public.points_verser(new.etablissement_id, v_auteur, 'photo_tracabilite', 'haccp_tracabilite', new.id,
      v_auteur || ':' || v_produit || ':' || public.points_jour_zurich());
  elsif tg_op in ('UPDATE', 'DELETE') then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('haccp_tracabilite', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_haccp_tracabilite : %', sqlerrm;
  return null;
end;
$fn$;

create or replace function public.points_trg_achats_documents()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_cle text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_cle := case when new.source in ('scan', 'pdf')
                  then public.points_cle_facture(coalesce(nullif(btrim(new.fournisseur_id), ''), new.fournisseur_nom), new.numero) end;
    if tg_op = 'UPDATE' and v_cle is null then
      if exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
        perform public.points_annuler('achats_documents', old.id);
      end if;
      return null;
    end if;
    if v_cle is null
       or not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    perform public.points_verser(new.etablissement_id, new.created_by, 'facture_achat', 'achats_documents', new.id, v_cle);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('achats_documents', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_achats_documents : %', sqlerrm;
  return null;
end;
$fn$;

create or replace function public.points_trg_scans_facture()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_cle text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_cle := public.points_cle_facture(new.fournisseur_id, new.numero_facture);
    if tg_op = 'UPDATE' and v_cle is null then
      if exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
        perform public.points_annuler('scans_facture', old.id);
      end if;
      return null;
    end if;
    if v_cle is null
       or not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    perform public.points_verser(new.etablissement_id, new.created_by, 'facture_achat', 'scans_facture', new.id, v_cle);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('scans_facture', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_scans_facture : %', sqlerrm;
  return null;
end;
$fn$;

create or replace function public.points_trg_pertes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    if coalesce(btrim(new.produit), '') = '' or coalesce(new.quantite, 0) <= 0 then
      return null;
    end if;
    -- Points fixes : jamais liés à la quantité ni à la valeur perdue.
    perform public.points_verser(new.etablissement_id, new.declare_par, 'perte_declaree', 'pertes', new.id, null);
  elsif tg_op in ('UPDATE', 'DELETE') then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('pertes', old.id);
  end if;
  return null;
exception when others then
  raise warning 'points_trg_pertes : %', sqlerrm;
  return null;
end;
$fn$;

create or replace function public.points_trg_inventaires()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  z record;
begin
  if tg_op = 'UPDATE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = new.etablissement_id and r.actif) then
      return null;
    end if;
    if new.statut is distinct from 'validé' then
      return null;
    end if;
    -- Même périmètre déjà payé dans les 7 jours : rien.
    if exists (
      select 1
      from public.inventaires i
      join public.points_mouvements m
        on m.etablissement_id = i.etablissement_id
       and m.sens = 'credit'
       and m.created_at >= now() - interval '7 days'
       and ((m.source_table = 'inventaires' and m.source_id = i.id)
            or (m.source_table = 'inventaire_saisies_offline' and left(m.source_id, length(i.id) + 1) = i.id || ':'))
      where i.etablissement_id = new.etablissement_id
        and i.id <> new.id
        and lower(btrim(coalesce(i.nom, ''))) = lower(btrim(coalesce(new.nom, '')))
    ) then
      return null;
    end if;
    perform public.points_verser(new.etablissement_id, new.valide_par, 'inventaire_valide', 'inventaires', new.id,
      'inv:' || new.id);
    for z in
      select c.user_id, c.zone
      from (
        select s.user_id, btrim(coalesce(s.zone, '')) as zone, min(s.created_at) as premier,
               row_number() over (partition by s.user_id order by min(s.created_at)) as rang
        from public.inventaire_saisies_offline s
        where s.inventaire_id = new.id
          -- Saisie fusionnée par la RPC de comptage (ni périmée, ni écrite à côté).
          and s.applique
          -- J1 (P3) : comptée un jour où la personne était au planning ; le
          -- jour du comptage, donné par l'appareil, est borné à 48 h de l'écriture.
          and s.compte_le between s.created_at - interval '48 hours' and s.created_at + interval '5 minutes'
          and public.points_programme(s.user_id, new.etablissement_id, (s.compte_le at time zone 'Europe/Zurich')::date)
          and exists (
            select 1
            from jsonb_array_elements(case when jsonb_typeof(new.lignes) = 'array' then new.lignes else '[]'::jsonb end) l
            where l ->> 'id' = s.ligne_id
              and (btrim(coalesce(s.zone, '')) = ''
                   or btrim(coalesce(l ->> 'zone', '')) = btrim(s.zone)
                   or (jsonb_typeof(l -> 'zones') = 'array'
                       and exists (select 1 from jsonb_array_elements_text(l -> 'zones') zz where btrim(zz) = btrim(s.zone))))
          )
        group by s.user_id, btrim(coalesce(s.zone, ''))
      ) c
      where c.rang <= 5
      order by c.premier
    loop
      perform public.points_verser(new.etablissement_id, z.user_id, 'comptage_zone', 'inventaire_saisies_offline',
        new.id || ':' || z.zone, 'inv:' || new.id || ':' || z.zone || ':' || z.user_id);
    end loop;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.points_reglages r where r.etablissement_id = old.etablissement_id) then
      return null;
    end if;
    perform public.points_annuler('inventaires', old.id);
    insert into public.points_mouvements
      (etablissement_id, user_id, points, action, source_table, source_id, sens, libelle, created_by)
    select m.etablissement_id, m.user_id, -m.points, m.action, m.source_table, m.source_id, 'annulation',
           'Annulation : ' || coalesce(m.libelle, ''), (select auth.uid())::text
    from public.points_mouvements m
    where m.etablissement_id = old.etablissement_id
      and m.source_table = 'inventaire_saisies_offline'
      and left(m.source_id, length(old.id) + 1) = old.id || ':'
      and m.sens = 'credit'
    on conflict (source_table, source_id, user_id, sens) where source_table is not null do nothing;
  end if;
  return null;
exception when others then
  raise warning 'points_trg_inventaires : %', sqlerrm;
  return null;
end;
$fn$;
