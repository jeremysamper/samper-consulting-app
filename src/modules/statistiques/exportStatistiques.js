// Export Excel du tableau des valeurs exactes (D8) : une feuille par
// graphique, avec les briques des classeurs de la caisse (xlsxFeuilles) et le
// téléchargement de l'inventaire (telechargerFichier). Aucune librairie de
// plus. Les nombres partent tels qu'ils sont affichés : exacts, typés, les
// pour cent en pour cent ; une valeur absente laisse la cellule vide.

import { xlsxFeuilles } from '../caisse/rapports/exportsRapport.js';
import { MIME_XLSX } from '../caisse/rapports/lectureRapport.js';
import { telechargerFichier } from '../inventaire/exportXlsxInventaire.js';
import { bornesTranche, libelleTranche } from './agregation.js';
import { libelleUnite, valeurTableur } from './echelles.js';

const T = (titre, largeur = 18) => ({ titre, largeur });
const N = (titre, largeur = 16) => ({ titre, largeur, montant: true });
const rang = (cellules, fort = false) => ({ cellules, fort });
const LIBELLE_NATURE = { flux: 'total', taux: 'recalculé sur la période', stock: 'dernier relevé', etat: "valeur d'aujourd'hui" };

const titreColonne = (c) => `${c.libelle}${libelleUnite(c.unite) ? ` (${libelleUnite(c.unite)})` : ''}`;

// Une feuille pour un tableau rendu par tableauDe() : la période, puis chaque
// série (et sa valeur d'avant quand une comparaison est tracée), une ligne
// par tranche, la période entière en dernière ligne, l'écart d'arrondi dessous.
export function feuilleDe(tableau, { nom, libelleComparaison = '' }) {
  const avecAvant = tableau.lignes.some((l) => l.avant.some((v) => v != null)) || tableau.periode.avant.some((v) => v != null);
  const colonnes = [T('Période', 14), T('Du, au', 26)];
  tableau.colonnes.forEach((c) => {
    colonnes.push(N(titreColonne(c), 22));
    if (avecAvant) colonnes.push(N(`${c.libelle}, ${libelleComparaison || 'avant'}`, 22));
  });
  const ligneDe = (libelle, detail, valeurs, avant, fort) => {
    const cellules = [libelle, detail];
    tableau.colonnes.forEach((c, i) => {
      cellules.push(valeurTableur(valeurs[i], c.unite));
      if (avecAvant) cellules.push(valeurTableur(avant[i], c.unite));
    });
    return rang(cellules, fort);
  };
  const rangs = tableau.lignes.map((l) => ligneDe(libelleTranche(l.tranche), bornesTranche(l.tranche), l.valeurs, l.avant, false));
  rangs.push(ligneDe(tableau.etat ? tableau.libelleTotal || 'Ensemble' : 'Période entière', tableau.colonnes.map((c) => LIBELLE_NATURE[c.nature]).filter((v, i, a) => a.indexOf(v) === i).join(', '), tableau.periode.valeurs, tableau.periode.avant, true));
  if (tableau.arrondis.length) {
    rangs.push(rang([]));
    tableau.arrondis.forEach((a) => rangs.push(rang([`Arrondi, ${a.libelle}`, `la somme des lignes diffère du total de ${a.ecart.toFixed(2)}`])));
  }
  return { nom, colonnes, rangs };
}

export function telechargerTableaux(tableaux, { titre, nomFichier, libelleComparaison = '' }) {
  const feuilles = tableaux.map((t, i) => feuilleDe(t, { nom: `Graphique ${i + 1}`, libelleComparaison }));
  telechargerFichier(xlsxFeuilles(feuilles, titre), nomFichier, MIME_XLSX);
}
