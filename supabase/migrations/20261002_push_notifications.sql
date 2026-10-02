-- ================================================================
-- Notifications push (Web Push) des nouvelles réservations en ligne
-- (Edge Function « notifications »).
--
-- push_abonnements : un appareil (téléphone, tablette, poste) abonné par un
--   membre de l'équipe pour un établissement. Écrit par l'app sous RLS.
-- push_config : clés VAPID (créées par la fonction au premier besoin) et
--   secret interne de l'appel base → fonction. Aucune politique RLS : seul le
--   rôle service (la fonction) la lit.
-- Déclencheur push_nouvelle_resa : à chaque réservation insérée avec
--   origine = 'en_ligne', appel asynchrone (pg_net) de la fonction. Il ne
--   bloque ni ne fait jamais échouer la réservation.
--
-- Appliquée le 02.10.2026 en étapes séparées (pg_net à part, déclencheur avec
-- lock_timeout) : un seul lot dépassait le délai de l'outil de migration.
-- Additive uniquement : rien de ce que lit le front déployé ne change.
-- Inverse : 20261002_push_notifications.rollback.sql
-- ================================================================

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_abonnements (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null,
  -- Pas de clé étrangère vers etablissements : son verrou sur cette table très
  -- sollicitée bloquait l'application. La fonction filtre de toute façon par
  -- établissement et par accès du membre au moment d'envoyer.
  etablissement_id text not null,
  endpoint         text not null,
  p256dh           text not null,
  auth             text not null,
  appareil         text,
  created_at       timestamptz not null default now(),
  dernier_envoi_at timestamptz,
  unique (endpoint, etablissement_id)
);
create index if not exists push_abonnements_etab_idx on public.push_abonnements (etablissement_id);
create index if not exists push_abonnements_user_idx on public.push_abonnements (user_id);

alter table public.push_abonnements enable row level security;

drop policy if exists push_abo_sel on public.push_abonnements;
create policy push_abo_sel on public.push_abonnements for select
  using (user_id = auth.uid()::text);
drop policy if exists push_abo_ins on public.push_abonnements;
create policy push_abo_ins on public.push_abonnements for insert
  with check (user_id = auth.uid()::text and public.user_can_access_etab(etablissement_id));
drop policy if exists push_abo_upd on public.push_abonnements;
create policy push_abo_upd on public.push_abonnements for update
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text and public.user_can_access_etab(etablissement_id));
drop policy if exists push_abo_del on public.push_abonnements;
create policy push_abo_del on public.push_abonnements for delete
  using (user_id = auth.uid()::text);

create table if not exists public.push_config (
  id             int primary key default 1 check (id = 1),
  secret_interne text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  vapid          jsonb,
  contact        text not null default 'https://samperconsulting-app.com',
  updated_at     timestamptz not null default now()
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (id) values (1) on conflict (id) do nothing;

create or replace function public.push_nouvelle_resa()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_secret text;
begin
  if new.origine is distinct from 'en_ligne' then
    return new;
  end if;
  select secret_interne into v_secret from public.push_config where id = 1;
  if v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := 'https://ppmtoiqgajwcdkbnrcll.supabase.co/functions/v1/notifications',
    body := jsonb_build_object('action', 'nouvelle_resa', 'reservationId', new.id, 'secret', v_secret),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  -- Une notification ne doit jamais coûter une réservation.
  raise warning 'push_nouvelle_resa : %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.push_nouvelle_resa() from public, anon, authenticated;

drop trigger if exists push_nouvelle_resa on public.reservations;
create trigger push_nouvelle_resa
  after insert on public.reservations
  for each row execute function public.push_nouvelle_resa();
