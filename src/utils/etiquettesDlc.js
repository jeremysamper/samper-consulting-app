// ─────────────────────────────────────────────────────────────────────────────
// Étiquettes DLC — configuration et référentiel partagé
//
// SEULE source des dimensions d'étiquette et du contenu des lignes : ni le
// module HACCP ni le service PDF n'écrivent une dimension en dur. La surface
// imprimable réelle est légèrement inférieure à la largeur nominale du media ;
// les marges s'ajustent après impression physique sur la Brother QL-820NWB, et
// c'est la raison d'être de ce fichier : une seule valeur à corriger.
//
// Transport d'impression = AirPrint natif de l'OS. Aucun driver, aucun SDK :
// l'app produit un PDF à la dimension exacte de l'étiquette, une page par
// étiquette, et la tablette imprime.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays, isoDate, parseLocalDate } from './dateHelpers.js';
import { normalizeSearch } from './searchText.js';

// Consommable en service : rouleau PRÉDÉCOUPÉ DK-11209. Le media fait 62 mm de
// large et chaque étiquette 29 mm dans le sens du défilement — et non l'inverse,
// contrairement à ce que laissent croire les fiches produit qui l'annoncent
// « 29 × 62 mm ». C'est d'ailleurs sous ce libellé que la QL-820NWB l'annonce
// en AirPrint, d'où formatAirPrint ci-dessous : le format à choisir sur l'iPad
// n'est PAS écrit dans le même ordre que la géométrie réelle.
//
// La découpe étant faite par le fabricant, la hauteur n'est plus négociable :
// une page = une étiquette, le massicot suit les prédécoupes, la brigade n'a
// rien à séparer aux ciseaux.
//
// Marges NON symétriques, et ce n'est pas un choix esthétique : la tête
// d'impression ne couvre pas toute l'étiquette. D'après le Raster Command
// Reference de Brother (QL-800/810W/820NWB, § 2.3.2, étiquettes prédécoupées,
// ligne « 62 mm x 29 mm ») :
//   largeur  62,0 mm (732 dots) → zone imprimable 58,9 mm (696 dots),
//                                 décalage 1,5 mm (18 dots) de chaque côté
//   longueur 28,9 mm (341 dots) → zone imprimable 22,9 mm (271 dots),
//                                 décalage 3,0 mm (35 dots) en tête et en pied
// La marge verticale vaut donc DEUX FOIS la latérale. Sur bande continue elle
// n'existait pas ; en repassant au prédécoupé, l'oublier ferait rogner la
// première et la dernière ligne sans le moindre message d'erreur.
//
// ─── Si le jour où l'on repasse à la bande continue DK-22205 ────────────────
// ref 'DK-22205', heightMm libre (24), marginYMm 2.5 (plus de zone morte, juste
// le dégagement du massicot), et surtout : AirPrint n'annonce AUCUNE longueur
// continue, il faut donc réactiver le pavage de la feuille 62 × 100 (voir
// pageWidthMm / pageHeightMm / pageMarginYMm, encore honorés par le service PDF)
// et la brigade sépare les étiquettes au trait pointillé.
export const ETIQUETTE_MEDIA = {
  ref: 'DK-11209',
  formatAirPrint: '29 × 62 mm',  // libellé exact à choisir dans la feuille iOS
  widthMm: 62,
  heightMm: 29,
  marginXMm: 2,     // 1,5 mm non imprimable + 0,5 mm de tolérance
  marginYMm: 3.4,   // 3,0 mm non imprimable + 0,4 mm de tolérance
  // Filet de délimitation imprimé au bord de la zone imprimable : sur un
  // rouleau prédécoupé, le bord physique de l'étiquette ne se voit pas une fois
  // collée sur un bac, le cadre rend le format lisible d'un coup d'œil.
  // Épaisseur au trait le plus fin qui sorte net à 300 dpi.
  cadreTraitMm: 0.25,
  cadreRayonMm: 1,
  // Retrait du texte À L'INTÉRIEUR du filet : sans lui, les lettres touchent
  // le trait et l'étiquette devient sale.
  cadrePadXMm: 1.4,
  cadrePadYMm: 0.9,

  // ─── Feuille AirPrint : sans objet sur un prédécoupé ───────────────────────
  // Constat de terrain (iPad, 31.07.2026) : iOS n'imprime PAS le PDF à sa
  // dimension propre, il le met à l'échelle du format de papier choisi dans sa
  // feuille d'impression. Sur un prédécoupé, ce format EXISTE dans la liste
  // (29 × 62 mm) et correspond exactement à l'étiquette : une page = une
  // étiquette, rien à mettre à l'échelle, rien à paver. Le pavage reste codé
  // dans le service PDF et se réveille dès qu'on renseigne pageHeightMm — c'est
  // ce qu'il faut pour une bande continue, dont aucune longueur n'est proposée
  // par AirPrint.
  traitCoupeMm: 0.15,
};

// Échelle de polices (en points), calibrée sur le mode Surgélation : c'est le
// plus dense, cinq lignes sur 29 mm de hauteur. Si ça tient en surgélation,
// ça tient partout. Le service PDF réduit en plus tout le bloc d'un même
// facteur si le media retenu est trop court — la hiérarchie est préservée.
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

// ─── Cases « Divers » ────────────────────────────────────────────────────────
// Étiquettes génériques épinglées en tête de liste et JAMAIS masquées par la
// recherche : en service, un bac sans fiche doit pouvoir sortir une DLC sans
// que personne ne quitte le poste pour aller créer une recette.
//
// Elles n'existent qu'ici : aucune ligne en base, aucun établissement
// particulier, rien à maintenir côté données. Elles portent les mêmes clés
// qu'une recette (dureeVie*), donc estEligible / dureeVieMode / calculerDlc /
// lignesEtiquette les traitent sans un seul cas particulier.
//
// Le jeu dépend du MODE, parce qu'une durée n'y a pas le même sens : les trois
// paliers du barème maison (3 / 5 / 7 j) au froid positif et après
// décongélation, et une seule case à 90 j en surgélation — la durée forfaitaire
// retenue pour une préparation congelée sans fiche.
export const ETIQUETTES_DIVERS = [
  {
    id: 'divers-3j', nom: 'Divers 3 jours', categorie: 'Étiquette libre', divers: true,
    modes: ['frais', 'decongelation'],
    dureeVieJours: 3, dureeVieDecongeleJours: 3, dureeVieCongeleJours: null,
  },
  {
    id: 'divers-5j', nom: 'Divers 5 jours', categorie: 'Étiquette libre', divers: true,
    modes: ['frais', 'decongelation'],
    dureeVieJours: 5, dureeVieDecongeleJours: 5, dureeVieCongeleJours: null,
  },
  {
    id: 'divers-7j', nom: 'Divers 7 jours', categorie: 'Étiquette libre', divers: true,
    modes: ['frais', 'decongelation'],
    dureeVieJours: 7, dureeVieDecongeleJours: 7, dureeVieCongeleJours: null,
  },
  {
    id: 'divers-90j', nom: 'Divers 90 jours', categorie: 'Étiquette libre', divers: true,
    modes: ['surgelation'],
    dureeVieJours: 90, dureeVieDecongeleJours: 2, dureeVieCongeleJours: 90,
  },
];

export const diversPourMode = (modeId) => ETIQUETTES_DIVERS.filter(d => d.modes.includes(modeId));

// ─── Étiquettes « maison » ───────────────────────────────────────────────────
// Étiquettes nommées propres à un établissement (table `etiquettes_perso`),
// pour les préparations courantes qui n'ont pas de fiche recette : un fond
// blanc ou une pâte à crumble sortait jusqu'ici sur une case « Divers 3 jours »,
// avec la bonne DLC mais sans son nom sur le bac.
//
// Elles portent les mêmes clés de durée qu'une recette (dureeVie*), donc
// estEligible / dureeVieMode / calculerDlc / lignesEtiquette les traitent sans
// un seul cas particulier. Contrairement aux cases Divers, elles vivent en base
// et se modifient — à partir du responsable cuisine.
export const ETIQUETTE_PERSO_CATEGORIE = 'Étiquette maison';

// Garde-fou de saisie : au-delà, c'est une faute de frappe, pas une durée de
// conservation. 10 ans couvre largement toute conserve ou surgelé.
export const DUREE_MAX_JOURS = 3650;

const dureeValide = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= DUREE_MAX_JOURS;
};

// Validation du formulaire d'étiquette maison. Retourne un message d'erreur ou
// null. Le contrôle de doublon reproduit l'index unique de la base
// (etablissement_id, lower(btrim(nom))) : mieux vaut un message clair qu'une
// erreur Postgres remontée telle quelle à la brigade.
export function validerEtiquettePerso(form, { existantes = [], id = null } = {}) {
  const nom = String(form?.nom || '').trim();
  if (!nom) return 'Donnez un nom à l\'étiquette.';

  const cle = normaliserNomPerso(nom);
  if (existantes.some(e => e.id !== id && normaliserNomPerso(e.nom) === cle)) {
    return `« ${nom} » existe déjà dans les étiquettes maison.`;
  }

  if (!dureeValide(form?.dureeVieJours)) {
    return 'La durée au froid positif doit être un nombre entier de jours supérieur à 0.';
  }
  // congelable === false → dureeVieCongeleJours restera null : rien à valider.
  if (form?.congelable) {
    if (!dureeValide(form?.dureeVieCongeleJours)) {
      return 'La durée au congélateur doit être un nombre entier de jours supérieur à 0.';
    }
    if (!dureeValide(form?.dureeVieDecongeleJours)) {
      return 'La durée après décongélation doit être un nombre entier de jours supérieur à 0.';
    }
  }
  return null;
}

// Clé de comparaison des noms : casse, accents et espaces de bord ignorés.
// Aligné sur lower(btrim(nom)) côté base, en tolérant en plus les accents et
// les ligatures via normalizeSearch — « Bearnaise » et « Béarnaise » sont la
// même préparation pour une brigade. La base, elle, reste plus permissive :
// elle ne rejettera que le doublon strict, ce message arrive avant.
export const normaliserNomPerso = (nom) => normalizeSearch(String(nom || '').trim());

// Une sélection porte des id de recette ET des id de case Divers : ce test les
// sépare partout où l'un des deux n'a pas de sens (purge des fiches supprimées,
// changement de mode).
export const estDivers = (id) => String(id || '').startsWith('divers-');

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
  // Les cases Divers ne se qualifient pas par une durée de surgélation : elles
  // n'ont pas de fiche, c'est leur liste `modes` qui dit où elles ont cours
  // (cf. diversPourMode). Sans cette sortie, la case Divers du mode
  // Décongélation s'afficherait grisée et non cochable.
  if (recette?.divers) return true;
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
//
// Pas de ligne opérateur : la traçabilité de qui a produit le lot vit dans le
// module HACCP, pas sur 29 mm de hauteur. Une ligne de moins, c'est de la place
// rendue au nom de la préparation et à la DLC, les deux seules informations
// qu'on lit à bout de bras dans une chambre froide.
export function lignesEtiquette({ recette, modeId, dates }) {
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

  return lignes;
}
