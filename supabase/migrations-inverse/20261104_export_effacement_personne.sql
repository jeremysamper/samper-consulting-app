-- Inverse de 20261104_export_effacement_personne et de son complement _2 :
-- a jouer seulement si la production casse. Retire les deux fonctions, la
-- policy, l'index et le verrou du journal des envois, et remet
-- spa_bons_avant_maj au texte de 20260927_spa_module (sans le drapeau).

drop function if exists public.export_personne(text, text);
drop function if exists public.effacer_personne(text, text);

drop trigger if exists trg_spa_envois_verrou_maj on public.spa_envois;
drop function if exists public.spa_envois_verrou_maj();

drop policy if exists spa_envois_update on public.spa_envois;
revoke update on public.spa_envois from authenticated;

drop index if exists public.idx_spa_envois_client;

create or replace function public.spa_bons_avant_maj()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if (select auth.uid()) is not null then
    new.id               := old.id;
    new.etablissement_id := old.etablissement_id;
    new.client_id        := old.client_id;
    new.code             := old.code;
    new.motif            := old.motif;
    new.valeur           := old.valeur;
    new.message          := old.message;
    new.valable_jusqu    := old.valable_jusqu;
    new.envoye_at        := old.envoye_at;
    new.created_by       := old.created_by;
    new.created_at       := old.created_at;
    if new.utilise_at is not null and old.utilise_at is null then
      new.utilise_at  := now();
      new.utilise_par := (select auth.uid())::text;
    elsif new.utilise_at is null then
      new.utilise_par := null;
    else
      new.utilise_at  := old.utilise_at;
      new.utilise_par := old.utilise_par;
    end if;
  end if;
  return new;
end $fn$;
