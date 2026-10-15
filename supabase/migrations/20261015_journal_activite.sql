-- Journal d'activité : qui a créé, modifié ou supprimé quoi, par établissement.
-- Alimenté par un déclencheur sur recettes, produits, pertes et inventaires.
-- Lecture réservée au consultant et au patron ; aucune écriture directe possible.

create table if not exists public.journal_activite (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  etablissement_id text not null,
  acteur_id text, acteur_nom text, acteur_role text,
  module text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  ligne_id text, libelle text, colonnes_modifiees text[], avant jsonb, apres jsonb
);
create index if not exists journal_activite_etab_date_idx
  on public.journal_activite (etablissement_id, created_at desc);

create or replace function public.journal_activite_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_uid text := auth.uid()::text;
  v_cols text[]; v_nom text; v_role text;
begin
  if v_row->>'etablissement_id' is null then return null; end if;
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_cols from jsonb_object_keys(v_new) k
    where k not in ('updated_at','created_at') and v_new->k is distinct from v_old->k;
    if v_cols is null then return null; end if;
  end if;
  if v_uid is not null then
    -- profiles porte prenom et nom séparément
    select nullif(trim(concat_ws(' ', p.prenom, p.nom)), ''), p.role into v_nom, v_role
    from public.profiles p where p.id = v_uid;
  end if;
  insert into public.journal_activite (etablissement_id, acteur_id, acteur_nom, acteur_role,
    module, operation, ligne_id, libelle, colonnes_modifiees, avant, apres)
  values (v_row->>'etablissement_id', v_uid, v_nom, v_role, tg_table_name, tg_op, v_row->>'id',
    -- pertes n'a pas de nom : le produit perdu sert de libellé
    left(coalesce(v_row->>'nom', v_row->>'titre', v_row->>'libelle', v_row->>'designation', v_row->>'produit'), 120),
    v_cols,
    case tg_op when 'UPDATE' then (select jsonb_object_agg(k, v_old->k) from unnest(v_cols) k)
               when 'DELETE' then v_old end,
    case tg_op when 'UPDATE' then (select jsonb_object_agg(k, v_new->k) from unnest(v_cols) k) end);
  return null;
exception when others then
  raise warning 'journal_activite_log failed on %: %', tg_table_name, sqlerrm;
  return null;
end; $$;
revoke all on function public.journal_activite_log() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['recettes','produits','pertes','inventaires'] loop
    execute format('drop trigger if exists trg_journal_activite on public.%I', t);
    execute format('create trigger trg_journal_activite after insert or update or delete on public.%I for each row execute function public.journal_activite_log()', t);
  end loop;
end $$;

alter table public.journal_activite enable row level security;
revoke all on public.journal_activite from anon, authenticated;
grant select on public.journal_activite to authenticated;
drop policy if exists journal_activite_select on public.journal_activite;
create policy journal_activite_select on public.journal_activite for select to authenticated
  using (user_can_access_etab(etablissement_id)
         and (select current_user_role()) = any (array['consultant','patron']));

create or replace view public.journal_activite_semaine with (security_invoker = true) as
select j.*, (j.created_at at time zone 'Europe/Zurich') as quand_local
from public.journal_activite j
where j.created_at >= (date_trunc('week', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich');
revoke all on public.journal_activite_semaine from anon, authenticated;
grant select on public.journal_activite_semaine to authenticated;
