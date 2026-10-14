import { parseLocalDate } from '../../utils/dateHelpers.js';
import { labelAllergene, sortAllergenes } from '../../utils/allergenes.js';
import {
  labelRegime, libelleFenetre, ligneDeSaison, ligneServieLe, mentionPoste, metaSaison, saisonDeDate,
} from './choixMenu.js';
import { NUMERO_COMPLEMENTS, libelleGroupe, lignesParSection, metaType } from './typesGroupe.js';

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

// Lignes d'une saison (celles de toute l'année comprises), par service. La
// mention dit le régime et la fenêtre : « végétarien, de mai à juin ».
function sectionsPdf(lignes, saison) {
  return lignesParSection((lignes || []).filter((l) => ligneDeSaison(l, saison))).map((s) => ({
    label: s.label,
    lignes: s.lignes.map((l) => ({
      libelle: l.libelle,
      description: l.description,
      mention: [
        labelRegime(l.regime).toLowerCase(),
        libelleFenetre(l),
        // Une pièce servie plusieurs fois se lit sur le menu : « 3 par personne ».
        Number(l.parPersonne) > 0 && Number(l.parPersonne) !== 1
          ? `${String(l.parPersonne).replace('.', ',')} par personne`
          : '',
      ].filter(Boolean).join(', '),
    })),
  }));
}

// Menu seul, imprimé depuis l'onglet Menus pour une saison : aucun bloc
// d'événement.
export function payloadMenuSeul({ typeGroupe, numero, menu, saison }) {
  const s = metaSaison(saison);
  return {
    payload: {
      titre: numero === NUMERO_COMPLEMENTS
        ? `${metaType(typeGroupe).label}, compléments`
        : `${metaType(typeGroupe).label}, menu n°${numero}`,
      sousTitre: saison ? `${s.label}, ${s.detail}` : '',
      menuNom: menu?.nom || '',
      menuDescription: menu?.description || '',
      sections: sectionsPdf(menu?.lignes || [], saison),
      blocs: [],
    },
    filename: `menu-${slugFichier(metaType(typeGroupe).label)}-${numero}${saison ? `-${saison}` : ''}.pdf`,
  };
}

// Plats réellement servis, avec leurs quantités : ce que la brigade produit.
function sectionsProduction(postes) {
  const parSection = new Map();
  (postes || []).forEach((p) => {
    if (!parSection.has(p.sectionLabel)) parSection.set(p.sectionLabel, []);
    parSection.get(p.sectionLabel).push({
      libelle: p.libelle,
      description: p.emprunt ? 'pris dans un autre menu' : '',
      mention: mentionPoste(p),
    });
  });
  return [...parSection.entries()].map(([label, lignes]) => ({ label, lignes }));
}

// Fiche d'un groupe réservé : menu + tout ce que la brigade doit savoir. Avec
// des choix enregistrés, la fiche porte les plats choisis et leurs quantités ;
// sans, le menu de la saison du groupe.
export function payloadFicheGroupe({ groupe, menu, production }) {
  const allergenes = sortAllergenes(groupe.allergenesIds || []).map(labelAllergene);
  const blocs = [];
  if (allergenes.length || groupe.allergiesNote) {
    blocs.push({
      label: 'Allergies et régimes',
      accroche: allergenes.join(', '),
      texte: groupe.allergiesNote || '',
      alerte: true,
    });
  }
  if (production?.aChoisir?.length) {
    blocs.push({
      label: 'Choix à recevoir',
      texte: `Pas encore choisi : ${production.aChoisir.join(', ')}.`,
      alerte: true,
    });
  }
  if (groupe.modifications) {
    blocs.push({ label: 'Modifications du menu', texte: groupe.modifications });
  }
  if (groupe.commentaires) {
    blocs.push({ label: 'Commentaires', texte: groupe.commentaires });
  }

  const vegetariens = Number(groupe.nbVegetariens) || 0;
  const enfants = Number(groupe.nbEnfants) || 0;
  const detailConvives = [
    vegetariens ? `${vegetariens} végé.` : '',
    enfants ? `${enfants} enf.` : '',
  ].filter(Boolean).join(', ');
  const cellules = [
    { k: 'Date', v: dateComplete(groupe.dateEvenement) },
    ...(groupe.heure ? [{ k: 'Heure', v: groupe.heure.replace(':', 'h') }] : []),
    { k: 'Couverts', v: `${groupe.nbPax} pax${detailConvives ? `, ${detailConvives}` : ''}` },
    { k: 'Client', v: groupe.nom },
  ];

  const avecChoix = (production?.postes || []).length > 0;
  const saison = saisonDeDate(groupe.dateEvenement);
  return {
    payload: {
      titre: groupe.menuNumero
        ? `${metaType(groupe.typeGroupe).label}, menu n°${groupe.menuNumero}`
        : metaType(groupe.typeGroupe).label,
      sousTitre: saison ? `${metaSaison(saison).label}, ${metaSaison(saison).detail}` : '',
      cellules,
      menuNom: menu?.nom || '',
      menuDescription: avecChoix ? '' : (menu?.description || ''),
      sections: avecChoix
        ? sectionsProduction(production.postes)
        : sectionsPdf((menu?.lignes || []).filter((l) => ligneServieLe(l, groupe.dateEvenement)), saison),
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
    sousTitre: `${libelleGroupe(groupe.typeGroupe, groupe.menuNumero)}, ${nomCourt}, ${groupe.nbPax} pax, ${dateComplete(groupe.dateEvenement)}`,
    filename: `courses-${groupe.dateEvenement}-${slugFichier(groupe.nom)}.pdf`,
  };
}
