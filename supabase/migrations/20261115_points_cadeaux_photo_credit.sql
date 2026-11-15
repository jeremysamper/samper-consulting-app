-- ════════════════════════════════════════════════════════════════════════════
-- Points : crédit de la photo d'un cadeau (15.11.2026). Les photos détourées du
-- catalogue viennent de Wikimedia Commons, Unsplash et Pexels ; les licences
-- CC BY et CC BY-SA demandent de citer l'auteur, la licence et l'original.
-- photo_credit : « Auteur, licence, source » ; photo_source : page de l'original.
-- Une photo envoyée par la direction n'a ni l'un ni l'autre.
-- Ajout seul : le front déployé l'ignore. Rejouable.
-- Inverse : supabase/migrations-inverse/20261115_points_cadeaux_photo_credit.sql
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

alter table public.points_cadeaux add column if not exists photo_credit text;
alter table public.points_cadeaux add column if not exists photo_source text;

do $do$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'points_cadeaux_photo_credit_check'
                   and conrelid = 'public.points_cadeaux'::regclass) then
    alter table public.points_cadeaux add constraint points_cadeaux_photo_credit_check
      check (photo_credit is null or length(photo_credit) <= 300);
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'points_cadeaux_photo_source_check'
                   and conrelid = 'public.points_cadeaux'::regclass) then
    alter table public.points_cadeaux add constraint points_cadeaux_photo_source_check
      check (photo_source is null or (length(photo_source) <= 1000 and photo_source ~ '^https://[^[:space:]]+$'));
  end if;
end;
$do$;

comment on column public.points_cadeaux.photo_credit is
  'Crédit de la photo du catalogue (auteur, licence, source), affiché dans « Crédits des photos ». Null : photo de la direction ou aucune.';
comment on column public.points_cadeaux.photo_source is
  'Page de l''original de la photo du catalogue (https). Null : photo de la direction ou aucune.';
