-- Retour arrière du lot A, données : retire les formats des 48 vins de
-- Woodland et remet les 6 cartes en mets (elles reviennent dans Cartes &
-- Recettes). Une seule instruction, tout ou rien.
do $retour$
begin
  delete from public.plat_formats
   where etablissement_id = 'etab-2' and plat_id ~ '^wl-vin-[0-9]{2}$';
  update public.cartes set genre = 'mets'
   where id in ('carte-1782730504404-8818', 'carte-1785013828432-d0da', 'carte-1785013801020-36ui', 'carte-1785014354543-5xdn', 'carte-1785014614127-g8s0', 'carte-woodland-vins')
     and genre = 'boissons';
end $retour$;
