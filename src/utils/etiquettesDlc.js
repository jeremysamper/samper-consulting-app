// ─────────────────────────────────────────────────────────────────────────────
// Étiquettes DLC — configuration et référentiel partagé
//
// SEULE source des dimensions d'étiquette et du contenu des lignes : ni le
// module HACCP ni le service PDF n'écrivent une dimension en dur. La surface
// imprimable réelle du DK-11209 est légèrement inférieure au nominal
// 62 × 29 mm ; les marges seront ajustées après la première impression
// physique sur la Brother QL-820NWB, et c'est la raison d'être de ce fichier :
// une seule valeur à corriger.
//
// Transport d'impression = AirPrint natif de l'OS. Aucun driver, aucun SDK :
// l'app produit un PDF à la dimension exacte de l'étiquette, une page par
// étiquette, et la tablette imprime.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays, isoDate, parseLocalDate } from './dateHelpers.js';

// Consommable cible : rouleau prédécoupé, media 29 mm de large, 62 mm par
// étiquette, 800 par rouleau. Le PDF sort en paysage 62 × 29.
export const ETIQUETTE_DK11209 = {
  ref: 'DK-11209',
  widthMm: 62,
  heightMm: 29,
  marginMm: 2,
};

// Échelle de polices (en points), calibrée sur le mode Surgélation : c'est le
// plus dense, six lignes sur 29 mm de hauteur. Si ça tient en surgélation,
// ça tient partout.
//   nomLadder : paliers de réduction du nom, du plus grand au plancher.
//               Sous le plancher on tronque — le critère est la lisibilité à
//               bout de bras dans une chambre froide, pas la complétude.
//   ligne     : lignes de corps (dates, température, opérateur)
//   dlc       : ligne « À consommer jusqu'au », en gras et un cran au-dessus
export const ETIQUETTE_FONTS = {
  nomLadder: [10, 9, 8, 7, 6.5],
  ligne: 7.5,
  dlc: 8.5,
  min: 6,
};

// Durées retenues quand la colonne n'est pas encore lue (front déployé avant
// l'application de la migration). Alignées sur les DEFAULT SQL.
export const DUREE_VIE_DEFAUT = { frais: 3, decongele: 2 };

// Garde-fou de saisie : un 500 involontaire consommerait plus de la moitié
// d'un rouleau de 800.
export const QUANTITE_MAX = 50;
export const QUANTITE_MIN = 1;

// Les trois modes. Un lot d'impression porte UN seul mode : en cuisine, on
// étiquette un lot qui part au même endroit, jamais un mélange frais/surgelé.
//   dates      : champs de date à saisir, globaux au lot (jamais par ligne)
//   dlcDepuis  : champ de date qui sert de point de départ du calcul de DLC
//   temperature: ligne de température de conservation
//   avertissement : mention obligatoire, en gras, sur la ligne de température
export const ETIQUETTE_MODES = [
  {
    id: 'frais',
    label: 'Frais',
    dates: [{ id: 'fabrication', label: 'Date de fabrication' }],
    dlcDepuis: 'fabrication',
    temperature: '0 à 3 °C',
    avertissement: null,
  },
  {
    id: 'surgelation',
    label: 'Surgélation',
    dates: [
      { id: 'fabrication', label: 'Date de fabrication' },
      { id: 'surgelation', label: 'Date de surgélation' },
    ],
    // La DLC part de la date de SURGÉLATION, pas de la fabrication : une
    // préparation refroidie la veille de son passage au congélateur a deux
    // dates distinctes.
    dlcDepuis: 'surgelation',
    temperature: '-18 °C',
    avertissement: null,
  },
  {
    id: 'decongelation',
    label: 'Décongélation',
    dates: [{ id: 'decongelation', label: 'Date de mise en décongélation' }],
    dlcDepuis: 'decongelation',
    temperature: '0 à 3 °C',
    avertissement: 'Ne pas recongeler',
  },
];

export const getMode = (modeId) => ETIQUETTE_MODES.find(m => m.id === modeId) || ETIQUETTE_MODES[0];

// ─── Durées de vie d'une recette ─────────────────────────────────────────────
// Les durées relèvent de l'autocontrôle de l'établissement : saisies sur la
// fiche recette, jamais calculées ni devinées ici. `congele` à null = non
// congelable, ce qui rend les modes surgélation et décongélation indisponibles.
export function dureesVie(recette) {
  const n = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    frais: n(recette?.dureeVieJours) ?? DUREE_VIE_DEFAUT.frais,
    congele: n(recette?.dureeVieCongeleJours),
    decongele: n(recette?.dureeVieDecongeleJours) ?? DUREE_VIE_DEFAUT.decongele,
  };
}

// Éligibilité aux modes surgélation / décongélation : une préparation non
// congelable ne peut être ni surgelée ni décongelée.
export function estEligible(recette, modeId) {
  if (modeId === 'frais') return true;
  return dureesVie(recette).congele != null;
}

// Motif d'inéligibilité affiché sur la ligne désactivée. On distingue le
// « non congelable » qualifié (flag de la fiche, utilisé aussi par Mise en
// place) de la durée simplement pas encore renseignée : la brigade doit savoir
// laquelle des deux corriger.
export function motifNonEligible(recette) {
  return recette?.congelable === false
    ? 'Non congelable'
    : 'Non congelable · durée de surgélation non renseignée';
}

// Durée de vie applicable au mode courant.
export function dureeVieMode(recette, modeId) {
  const d = dureesVie(recette);
  if (modeId === 'surgelation') return d.congele;
  if (modeId === 'decongelation') return d.decongele;
  return d.frais;
}

// ─── Dates ───────────────────────────────────────────────────────────────────
// Tout circule en date seule 'YYYY-MM-DD', donc sans heure ni décalage à
// convertir. La date du jour vient de zurichToday() (fuseau Europe/Zurich et
// non l'horloge du device) et l'arithmétique passe par parseLocalDate, qui
// évite le piège du parsing UTC de new Date('YYYY-MM-DD').
export function ajouterJours(iso, jours) {
  if (!iso || jours == null) return null;
  return isoDate(addDays(parseLocalDate(iso), Number(jours)));
}

// 'YYYY-MM-DD' → 'JJ.MM.AAAA'
export function formatDateFr(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return String(iso);
  return `${d}.${m}.${y}`;
}

// DLC du lot pour une recette : date de référence du mode + durée de vie.
// Retourne null si la recette n'est pas éligible au mode (aucune DLC à afficher).
export function calculerDlc(recette, modeId, dates) {
  const mode = getMode(modeId);
  const duree = dureeVieMode(recette, modeId);
  const depart = dates?.[mode.dlcDepuis];
  if (duree == null || !depart) return null;
  return ajouterJours(depart, duree);
}

// ─── Contenu d'une étiquette ─────────────────────────────────────────────────
// Retourne les lignes prêtes à dessiner. Le service PDF ne décide que de la
// mise en page (fit, paliers de police), jamais du contenu.
//   role  : 'nom' | 'dlc' | 'corps'  → le service choisit la police
//   bold  : nom et ligne de DLC en gras, le reste en corps normal
//   segments : deux fragments sur une même ligne, le second en gras
//              (température + « Ne pas recongeler »)
export function lignesEtiquette({ recette, modeId, dates, operateur }) {
  const mode = getMode(modeId);
  const dlc = calculerDlc(recette, modeId, dates);
  const lignes = [{ role: 'nom', text: recette?.nom || '', bold: true }];

  if (modeId === 'decongelation') {
    lignes.push({ role: 'corps', text: `Décongelé le ${formatDateFr(dates?.decongelation)}` });
  } else {
    lignes.push({ role: 'corps', text: `Fabriqué le ${formatDateFr(dates?.fabrication)}` });
    if (modeId === 'surgelation') {
      lignes.push({ role: 'corps', text: `Surgelé le ${formatDateFr(dates?.surgelation)}` });
    }
  }

  lignes.push({ role: 'dlc', text: `À consommer jusqu'au ${formatDateFr(dlc)}`, bold: true });

  if (mode.avertissement) {
    lignes.push({ role: 'corps', segments: [
      { text: mode.temperature },
      { text: mode.avertissement, bold: true },
    ] });
  } else {
    lignes.push({ role: 'corps', text: mode.temperature });
  }

  // Opérateur vide : on imprime le libellé seul, l'initiale se note à la main.
  lignes.push({ role: 'corps', text: `Opérateur : ${operateur || ''}`.trimEnd() });
  return lignes;
}
