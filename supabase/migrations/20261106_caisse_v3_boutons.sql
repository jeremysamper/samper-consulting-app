-- ════════════════════════════════════════════════════════════════════════════
-- Caisse v3 - habillage des boutons produits (nom court, couleur, picto).
--
-- Table d'habillage dediee plutot que des colonnes sur plats : l'ecriture de
-- plats est ouverte a toute l'equipe (RLS par etablissement seulement), alors
-- que l'habillage de la caisse est reserve a consultant, patron et
-- resp_cuisine ; une table a soi porte ce droit dans sa propre RLS, sans
-- declencheur de colonnes sur une table partagee.
--
--   caisse_boutons : une ligne par plat habille (unique). couleur et picto
--   sont des CLES (palette --caisse-* d'app.css, pictos lucide deja importes),
--   jamais un hex ni un nom de composant. nom_court court (24 caracteres).
--
-- RLS : lecture pour tout membre de l'etablissement ; ecriture pour
-- consultant, patron, resp_cuisine (modele groupe_menus). Le plat habille
-- appartient a l'etablissement de la ligne (declencheur, verification sous la
-- RLS de plats : un plat d'un autre etablissement est invisible, donc refuse).
--
-- Migration additive, idempotente, rejouable sans effet (aucun backfill).
-- Rollback :
--   drop table if exists public.caisse_boutons;
--   drop function if exists public.caisse_bouton_garde();
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.caisse_boutons (
  id               uuid        primary key default gen_random_uuid(),
  etablissement_id text        not null references public.etablissements(id) on delete cascade,
  plat_id          text        not null unique references public.plats(id) on delete cascade,
  nom_court        text        check (nom_court is null or char_length(nom_court) <= 24),
  couleur          text        check (couleur is null or couleur in
                               ('rouge','orange','jaune','vert','turquoise','bleu','violet','rose')),
  picto            text        check (picto is null or picto in
                               ('croissant','ble','feuille','cloche','gateau','verre','cadeau','eclair')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_caisse_boutons_etab on public.caisse_boutons(etablissement_id);

create or replace trigger trg_caisse_boutons_updated_at
  before update on public.caisse_boutons
  for each row execute function public.set_updated_at();

-- Le plat habille appartient a l'etablissement de la ligne.
create or replace function public.caisse_bouton_garde()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.plat_id is distinct from old.plat_id
     or new.etablissement_id is distinct from old.etablissement_id then
    if not exists (
      select 1 from public.plats p
      where p.id = new.plat_id and p.etablissement_id = new.etablissement_id
    ) then
      raise exception 'caisse: plat inconnu pour cet etablissement';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_caisse_bouton_garde on public.caisse_boutons;
create trigger trg_caisse_bouton_garde
  before insert or update on public.caisse_boutons
  for each row execute function public.caisse_bouton_garde();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.caisse_boutons enable row level security;

drop policy if exists caisse_boutons_select on public.caisse_boutons;
create policy caisse_boutons_select on public.caisse_boutons
  for select to authenticated
  using (user_can_access_etab(etablissement_id));

drop policy if exists caisse_boutons_insert on public.caisse_boutons;
create policy caisse_boutons_insert on public.caisse_boutons
  for insert to authenticated
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

drop policy if exists caisse_boutons_update on public.caisse_boutons;
create policy caisse_boutons_update on public.caisse_boutons
  for update to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  )
  with check (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );

drop policy if exists caisse_boutons_delete on public.caisse_boutons;
create policy caisse_boutons_delete on public.caisse_boutons
  for delete to authenticated
  using (
    user_can_access_etab(etablissement_id)
    and (select current_user_role()) = any(array['consultant','patron','resp_cuisine'])
  );
