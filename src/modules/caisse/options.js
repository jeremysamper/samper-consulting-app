// Parametres d'une ligne de caisse (caisse_lignes.options, migration v2) :
// tableau de { type: 'cuisson' | 'sans' | 'message', valeur, cible }.
// Le libelle rendu ici est celui que caisse_envoyer_bon ecrit dans les
// modifiers du bon KDS : les deux affichages restent les memes mots.

export const CUISSONS = ['bleu', 'saignant', 'à point', 'bien cuit'];

export function libelleOption(o) {
  if (!o || !o.valeur) return '';
  if (o.type === 'sans') return 'sans ' + o.valeur;
  if (o.type === 'message' && o.cible === 'bar') return 'bar : ' + o.valeur;
  return o.valeur;
}

// La cuisson est unique par ligne : poser la meme la retire, une autre la remplace.
export function basculerCuisson(options, valeur) {
  const autres = (options || []).filter((o) => o.type !== 'cuisson');
  const active = (options || []).some((o) => o.type === 'cuisson' && o.valeur === valeur);
  return active ? autres : [...autres, { type: 'cuisson', valeur, cible: null }];
}

export function basculerSans(options, valeur) {
  const v = String(valeur || '').trim();
  if (!v) return options || [];
  const present = (options || []).some((o) => o.type === 'sans' && o.valeur === v);
  if (present) return (options || []).filter((o) => !(o.type === 'sans' && o.valeur === v));
  return [...(options || []), { type: 'sans', valeur: v, cible: null }];
}

export function ajouterMessage(options, valeur, cible) {
  const v = String(valeur || '').trim();
  if (!v) return options || [];
  return [...(options || []), { type: 'message', valeur: v, cible: cible === 'bar' ? 'bar' : 'cuisine' }];
}

export function retirerOption(options, option) {
  return (options || []).filter((o) => o !== option);
}
