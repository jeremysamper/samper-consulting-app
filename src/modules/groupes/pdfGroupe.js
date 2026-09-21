import { parseLocalDate } from '../../utils/dateHelpers.js';
import { labelAllergene, sortAllergenes } from '../../utils/allergenes.js';
import { libelleGroupe, lignesParSection, metaType } from './typesGroupe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Charges utiles des exports PDF du module Groupes. Construites à partir des
// DONNÉES, jamais du DOM : comme les autres PDF vectoriels de l'app, elles
// restent en français quelle que soit la langue affichée à l'écran.
//
// Le rendu lui-même vit dans le service partagé (pdfUtils.exportGroupeMenuPdf
// et pdfUtils.exportCommandePdf) : ce fichier ne connaît ni police ni couleur.
// ─────────────────────────────────────────────────────────────────────────────

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

// « Samedi 3 octobre 2026 » : l'année compte, un mariage se réserve un an avant.
export function dateComplete(dateISO) {
  if (!dateISO) return '';
  const d = parseLocalDate(dateISO);
  const jour = JOURS[d.getDay()];
  return `${jour.charAt(0).toUpperCase() + jour.slice(1)} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

const slugFichier = (s) => String(s || '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  .slice(0, 40);

function sectionsPdf(lignes) {
  return lignesParSection(lignes).map((s) => ({
    label: s.label,
    lignes: s.lignes.map((l) => ({
      libelle: l.libelle,
      description: l.description,
      // Une pièce servie plusieurs fois se lit sur le menu : « 3 par personne ».
      mention: Number(l.parPersonne) > 0 && Number(l.parPersonne) !== 1
        ? `${String(l.parPersonne).replace('.', ',')} par personne`
        : '',
    })),
  }));
}

// Menu seul, imprimé depuis l'onglet Menus : aucun bloc d'événement.
export function payloadMenuSeul({ typeGroupe, numero, menu }) {
  return {
    payload: {
      titre: `${metaType(typeGroupe).label} · Menu n°${numero}`,
      sousTitre: '',
      menuNom: menu?.nom || '',
      menuDescription: menu?.description || '',
      sections: sectionsPdf(menu?.lignes || []),
      blocs: [],
    },
    filename: `menu-${slugFichier(metaType(typeGroupe).label)}-${numero}.pdf`,
  };
}

// Fiche d'un groupe réservé : menu + tout ce que la brigade doit savoir.
export function payloadFicheGroupe({ groupe, menu }) {
  const allergenes = sortAllergenes(groupe.allergenesIds || []).map(labelAllergene);
  const blocs = [];
  if (allergenes.length || groupe.allergiesNote) {
    blocs.push({
      label: 'Allergies et régimes',
      accroche: allergenes.join('  ·  '),
      texte: groupe.allergiesNote || '',
      alerte: true,
    });
  }
  if (groupe.modifications) {
    blocs.push({ label: 'Modifications du menu', texte: groupe.modifications });
  }
  if (groupe.commentaires) {
    blocs.push({ label: 'Commentaires', texte: groupe.commentaires });
  }

  const cellules = [
    { k: 'Date', v: dateComplete(groupe.dateEvenement) },
    ...(groupe.heure ? [{ k: 'Heure', v: groupe.heure.replace(':', 'h') }] : []),
    { k: 'Couverts', v: `${groupe.nbPax} pax` },
    { k: 'Client', v: groupe.nom },
  ];

  return {
    payload: {
      titre: groupe.menuNumero
        ? `${metaType(groupe.typeGroupe).label} · Menu n°${groupe.menuNumero}`
        : metaType(groupe.typeGroupe).label,
      sousTitre: '',
      cellules,
      menuNom: menu?.nom || '',
      menuDescription: menu?.description || '',
      sections: sectionsPdf(menu?.lignes || []),
      blocs,
    },
    filename: `groupe-${groupe.dateEvenement}-${slugFichier(groupe.nom)}.pdf`,
  };
}

// En-tête de la liste de courses d'un groupe.
export function enTeteCourses(groupe) {
  // Le sous-titre tient sur UNE ligne centrée : un nom de société à rallonge
  // est raccourci ('...' ASCII, jsPDF ne rend pas le caractère ellipse).
  const nom = String(groupe.nom || '');
  const nomCourt = nom.length > 42 ? `${nom.slice(0, 39).trimEnd()}...` : nom;
  return {
    titre: 'Liste de courses',
    sousTitre: `${libelleGroupe(groupe.typeGroupe, groupe.menuNumero)} · ${nomCourt} · ${groupe.nbPax} pax · ${dateComplete(groupe.dateEvenement)}`,
    filename: `courses-${groupe.dateEvenement}-${slugFichier(groupe.nom)}.pdf`,
  };
}
