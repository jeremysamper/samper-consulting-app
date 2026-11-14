-- Retour aux listes fermees de v3 et v4. NOT VALID : les lignes deja
-- habillees d'une couleur ou d'un picto nouveau restent (aucune donnee
-- effacee) ; seules les ecritures suivantes reprennent l'ancienne liste.
-- A jouer apres le retour du front a sa version precedente.

alter table public.caisse_boutons drop constraint if exists caisse_boutons_couleur_check;
alter table public.caisse_boutons add constraint caisse_boutons_couleur_check
  check (couleur is null or couleur in ('rouge','orange','jaune','vert','turquoise','bleu','violet','rose')) not valid;

alter table public.caisse_boutons drop constraint if exists caisse_boutons_picto_check;
alter table public.caisse_boutons add constraint caisse_boutons_picto_check
  check (picto is null or picto in ('croissant','ble','feuille','cloche','gateau','verre','cadeau','eclair')) not valid;

alter table public.caisse_categories drop constraint if exists caisse_categories_couleur_check;
alter table public.caisse_categories add constraint caisse_categories_couleur_check
  check (couleur is null or couleur in ('rouge','orange','jaune','vert','turquoise','bleu','violet','rose')) not valid;

alter table public.caisse_categories drop constraint if exists caisse_categories_picto_check;
alter table public.caisse_categories add constraint caisse_categories_picto_check
  check (picto is null or picto in ('croissant','ble','feuille','cloche','gateau','verre','cadeau','eclair')) not valid;
