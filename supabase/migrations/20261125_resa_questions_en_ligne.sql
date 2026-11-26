-- ================================================================
-- Questions à choix de la réservation d'une table en ligne (lot 18).
--
-- La direction règle une ou deux questions à choix dans Réglages >
-- Réservation en ligne (colonne questions_en_ligne). La page publique
-- /table/<adresse> les lit par la fonction anonyme
-- table_en_ligne_questions et écrit la réponse dans le message, en lignes
-- « Libellé : Choix » après la ligne « Allergies : ... ». La fonction
-- resa_reserver_en_ligne range le message tel quel dans notes_libres ;
-- ce déclencheur en tire une étiquette « autre » de la réservation, par
-- la même voie que les allergènes (20261117_resa_allergenes_en_ligne).
--
-- Additif et idempotent : une colonne, une contrainte, deux fonctions,
-- un déclencheur. Aucune policy, aucune fonction existante ne change ;
-- l'Edge Function spa-mailer n'est pas redéployée. Seule une ligne qui
-- vaut mot pour mot un choix réglé par la maison devient une étiquette ;
-- une erreur ne coûte jamais la réservation.
-- Retour arrière : 20261125_resa_questions_en_ligne.rollback.sql.
-- ================================================================

begin;

set local lock_timeout = '3s';

-- 1. Colonne et contrainte de forme -------------------------------
alter table public.reservation_en_ligne_parametres
  add column if not exists questions_en_ligne jsonb not null default '[]'::jsonb;

comment on column public.reservation_en_ligne_parametres.questions_en_ligne is
  'Questions à choix posées au visiteur (lot 18) : [{ id, libelle, choix: [texte], obligatoire }], deux au plus. Nettoyées par src/reservation/questionsEnLigne.js.';

do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservation_en_ligne_parametres'::regclass
      and conname = 'resa_en_ligne_questions_forme'
  ) then
    alter table public.reservation_en_ligne_parametres
      add constraint resa_en_ligne_questions_forme
      check (case when jsonb_typeof(questions_en_ligne) = 'array'
                  then jsonb_array_length(questions_en_ligne) <= 2 else false end);
  end if;
end
$do$;

-- 2. Lecture anonyme des questions d'une adresse ouverte -----------
create or replace function public.table_en_ligne_questions(p_adresse text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_brut jsonb;
  v_q jsonb;
  v_c jsonb;
  v_choix jsonb;
  v_libelle text;
  v_sortie jsonb := '[]'::jsonb;
begin
  if p_adresse is null then
    return '[]'::jsonb;
  end if;

  select p.questions_en_ligne into v_brut
  from public.reservation_en_ligne_parametres p
  where p.slug = lower(btrim(p_adresse)) and p.en_ligne_actif
  limit 1;

  if v_brut is null or jsonb_typeof(v_brut) <> 'array' then
    return '[]'::jsonb;
  end if;

  -- Reconstruit champ par champ : aucune autre clé de la ligne ne sort.
  for v_q in select e.value from jsonb_array_elements(v_brut) e loop
    exit when jsonb_array_length(v_sortie) >= 2;
    continue when jsonb_typeof(v_q) <> 'object'
      or jsonb_typeof(v_q -> 'libelle') is distinct from 'string'
      or jsonb_typeof(v_q -> 'choix') is distinct from 'array';
    -- Texte servi tel que le déclencheur le compare : un libellé ou un
    -- choix hors forme (vide, rogné, plus de 40 caractères) est sauté,
    -- jamais raccourci (une réponse raccourcie ne poserait aucune étiquette).
    v_libelle := v_q ->> 'libelle';
    continue when v_libelle <> btrim(v_libelle)
      or length(v_libelle) not between 1 and 40
      or lower(v_libelle) = 'allergies';

    v_choix := '[]'::jsonb;
    for v_c in select e.value from jsonb_array_elements(v_q -> 'choix') e loop
      exit when jsonb_array_length(v_choix) >= 6;
      continue when jsonb_typeof(v_c) <> 'string'
        or length(v_c #>> '{}') not between 1 and 40;
      v_choix := v_choix || jsonb_build_array(v_c #>> '{}');
    end loop;
    continue when jsonb_array_length(v_choix) < 2;

    v_sortie := v_sortie || jsonb_build_array(jsonb_build_object(
      'id', case when jsonb_typeof(v_q -> 'id') = 'string' then left(v_q ->> 'id', 24) else '' end,
      'libelle', v_libelle,
      'choix', v_choix,
      'obligatoire', coalesce(v_q -> 'obligatoire' = 'true'::jsonb, false)
    ));
  end loop;

  return v_sortie;
end
$fn$;

revoke all on function public.table_en_ligne_questions(text) from public, anon, authenticated;
grant execute on function public.table_en_ligne_questions(text) to anon, authenticated, service_role;

comment on function public.table_en_ligne_questions(text) is
  'Page publique /table/<adresse> (lot 18) : les questions à choix d''une adresse ouverte, [{ id, libelle, choix, obligatoire }], deux au plus, six choix au plus, 40 caractères par texte. [] pour une adresse nulle, inconnue ou fermée.';

-- 3. Étiquettes tirées des réponses --------------------------------
create or replace function public.resa_tags_questions_en_ligne()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_questions jsonb;
  v_q jsonb;
  v_ligne text;
  v_lignes text[] := '{}';
  v_prefixe text;
begin
  if new.origine is distinct from 'en_ligne' or new.notes_libres is null then
    return new;
  end if;

  begin
    select p.questions_en_ligne into v_questions
    from public.reservation_en_ligne_parametres p
    where p.etablissement_id = new.etablissement_id;

    if v_questions is null or jsonb_typeof(v_questions) <> 'array' then
      return new;
    end if;

    -- Lignes avant la première ligne vide, quatre au plus.
    foreach v_ligne in array string_to_array(new.notes_libres, chr(10)) loop
      v_ligne := rtrim(v_ligne, chr(13));
      exit when v_ligne = '';
      v_lignes := v_lignes || v_ligne;
      exit when cardinality(v_lignes) >= 4;
    end loop;

    -- Comparaison de chaînes, sans expression bâtie sur le libellé.
    for v_q in select e.value from jsonb_array_elements(v_questions) e loop
      continue when jsonb_typeof(v_q) <> 'object'
        or jsonb_typeof(v_q -> 'libelle') is distinct from 'string'
        or jsonb_typeof(v_q -> 'choix') is distinct from 'array'
        or btrim(v_q ->> 'libelle') = ''
        or lower(btrim(v_q ->> 'libelle')) = 'allergies';
      v_prefixe := (v_q ->> 'libelle') || ' : ';
      foreach v_ligne in array v_lignes loop
        if left(v_ligne, length(v_prefixe)) = v_prefixe
          and exists (
            select 1 from jsonb_array_elements(v_q -> 'choix') c
            where jsonb_typeof(c.value) = 'string'
              and c.value #>> '{}' = substr(v_ligne, length(v_prefixe) + 1)
          ) then
          if not exists (
            select 1 from public.reservation_tags t
            where t.reservation_id = new.id and t.type_tag = 'autre' and t.valeur = v_ligne
          ) then
            insert into public.reservation_tags (reservation_id, type_tag, valeur, libre)
            values (new.id, 'autre', v_ligne, true);
          end if;
          exit; -- une seule étiquette par question
        end if;
      end loop;
    end loop;
  exception when others then
    raise warning 'resa_tags_questions_en_ligne : % (%)', sqlerrm, new.id;
  end;

  return new;
end
$fn$;

revoke all on function public.resa_tags_questions_en_ligne() from public, anon, authenticated;

-- 4. Déclencheur ----------------------------------------------------
drop trigger if exists trg_resa_tags_questions_en_ligne on public.reservations;
create trigger trg_resa_tags_questions_en_ligne
  after insert on public.reservations
  for each row execute function public.resa_tags_questions_en_ligne();

commit;

-- 5. La fonction anonyme est servie sans attendre.
notify pgrst, 'reload schema';
