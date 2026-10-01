-- ─────────────────────────────────────────────────────────────────────────────
-- Documents : garde-fou sur le dossier parent + images acceptées au stockage
--
-- 1. Un document ne peut être rangé que dans un DOSSIER du MÊME établissement,
--    et jamais dans lui-même ni dans un de ses propres sous-dossiers.
--    Relevé du 02.10.2026 : deux dossiers de l'Hôtel Panorama (etab-1) avaient
--    été créés le 27.04.2026 dans un dossier de Woodland Village (etab-2) —
--    invisibles des deux établissements, six factures cachées dedans. La
--    cause côté app (dossier courant gardé au changement d'établissement) est
--    corrigée depuis ; ce déclencheur rend la situation impossible quel que
--    soit le client (app, ancienne version en cache, appli legacy).
--    SECURITY INVOKER : le parent est relu sous la RLS de l'appelant, donc un
--    dossier d'un établissement inaccessible est « introuvable », refusé aussi.
--
-- 2. Le bucket `documents` accepte désormais les photos (JPEG, PNG, WebP, HEIC)
--    en plus des PDF. Limite de 50 Mo inchangée. Les politiques du bucket (dossier
--    racine = établissement) ne changent pas.
--
-- Compatible avec le front déployé : il n'envoie que des PDF rangés dans le
-- dossier courant de l'établissement. Données existantes vérifiées avant :
-- 0 parent d'un autre établissement, 0 boucle, 0 parent orphelin.
-- Rollback : 20261002_documents_garde_parent_images.rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.documents_verifier_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent record;
  courant text;
  pas int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Un dossier ne peut pas être rangé dans lui-même.'
      using errcode = '23514';
  end if;

  select id, type, etablissement_id into parent
  from public.documents where id = new.parent_id;

  if not found then
    raise exception 'Dossier de destination introuvable.'
      using errcode = '23503';
  end if;
  if parent.type <> 'folder' then
    raise exception 'La destination n''est pas un dossier.'
      using errcode = '23514';
  end if;
  if parent.etablissement_id <> new.etablissement_id then
    raise exception 'Le dossier de destination appartient à un autre établissement.'
      using errcode = '23514';
  end if;

  -- Boucle : on remonte les ancêtres de la destination ; si on croise le
  -- document déplacé, il serait rangé dans son propre sous-dossier.
  courant := parent.id;
  while courant is not null loop
    if courant = new.id then
      raise exception 'Un dossier ne peut pas être rangé dans un de ses sous-dossiers.'
        using errcode = '23514';
    end if;
    pas := pas + 1;
    exit when pas > 100;
    select d.parent_id into courant from public.documents d where d.id = courant;
  end loop;

  return new;
end;
$$;

comment on function public.documents_verifier_parent() is
  'Déclencheur documents : parent = dossier du même établissement, sans boucle.';

drop trigger if exists documents_verifier_parent on public.documents;
create trigger documents_verifier_parent
  before insert or update of parent_id, etablissement_id on public.documents
  for each row execute function public.documents_verifier_parent();

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
]
where id = 'documents';
