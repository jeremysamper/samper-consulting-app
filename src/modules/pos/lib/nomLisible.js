// Nom d'un article de caisse à l'écran. Lightspeed les écrit souvent tout en
// capitales (« BURGER DE BŒUF SUISSE, FRITES ») : ils s'affichent en
// minuscules, la première lettre en capitale, les accents gardés. Un nom qui
// porte déjà des minuscules reste tel quel (la casse voulue par la maison).
// Affichage seulement : la base garde le nom de la caisse.
export function nomLisible(nom) {
  const texte = String(nom ?? '');
  if (!/\p{Lu}/u.test(texte) || /\p{Ll}/u.test(texte)) return texte;
  const bas = texte.toLocaleLowerCase('fr-CH');
  const i = bas.search(/\p{L}/u);
  if (i < 0) return bas;
  return bas.slice(0, i) + bas.charAt(i).toLocaleUpperCase('fr-CH') + bas.slice(i + 1);
}
