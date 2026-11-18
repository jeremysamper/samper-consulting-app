// ═══════════════════════════════════════════════════════════════
// HACCP : dossier du contrôle des denrées, en fonctions pures.
// ═══════════════════════════════════════════════════════════════
// Le dossier que l'équipe remet à l'inspecteur : page de garde, relevés de
// températures, contrôles du jour, actions correctives, problèmes signalés,
// traçabilité, durées de vie des étiquettes DLC, puis ce que l'établissement
// doit fournir lui-même. Tout vient des données déjà lues par le module ;
// rien n'est inventé. Une rubrique sans donnée n'est pas écrite : elle passe
// dans la liste « À fournir par l'établissement ».
//
// Aucun article de loi n'est cité : le dossier rassemble des faits, il ne
// qualifie rien en droit.
//
// Le rendu jsPDF est dans dossierControlePdf.js ; ce fichier ne touche ni au
// DOM ni au réseau, il se teste en Node (dossierControle.test.mjs).

import { plageEnClair, verdictReleve } from './haccpJour.js';
import { DUREE_VIE_DEFAUT, dureesVie } from '../../utils/etiquettesDlc.js';

export const DUREE_DOSSIER_JOURS = 90;

// Plafond de lignes d'une lecture Supabase non paginée (listHaccpControls).
// Atteint, les contrôles les plus anciens de la période peuvent manquer : le
// dossier le dit au lieu de les compter pour absents.
export const PLAFOND_LECTURE = 1000;

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const capitale = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function partiesDate(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

// Date du calendrier décalée de n jours (sans fuseau, comme haccpJour.js).
export function decalerJours(iso, n) {
  const { y, m, d } = partiesDate(iso);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function joursEntre(debut, fin) {
  const a = partiesDate(debut);
  const b = partiesDate(fin);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000) + 1;
}

export function dateCourte(iso) {
  const { y, m, d } = partiesDate(iso);
  if (!y) return '';
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

export function dateLongue(iso) {
  const { y, m, d } = partiesDate(iso);
  if (!y) return '';
  const jour = JOURS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return capitale(`${jour} ${d} ${MOIS[m - 1]} ${y}`);
}

// Les 90 derniers jours, aujourd'hui compris.
export function periodeParDefaut(aujourdhui, jours = DUREE_DOSSIER_JOURS) {
  return { debut: decalerJours(aujourdhui, -(jours - 1)), fin: aujourdhui };
}

// Période saisie : dates lisibles, début avant la fin, pas dans le futur.
// Rend un message d'erreur, ou null quand la période est bonne.
export function erreurPeriode(debut, fin, aujourdhui) {
  const ok = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  if (!ok(debut) || !ok(fin)) return 'Choisissez une date de début et une date de fin.';
  if (debut > fin) return 'La date de début doit venir avant la date de fin.';
  if (aujourdhui && debut > aujourdhui) return 'La période commence après aujourd\'hui.';
  return null;
}

// 3.5 → « 3,5 », -18 → « -18 ».
export function nombreFr(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

function valeurAvecUnite(valeur, unite) {
  const u = String(unite || '').trim();
  return u ? `${nombreFr(valeur)} ${u}` : nombreFr(valeur);
}

export function plageTexte(zone) {
  const p = plageEnClair(zone);
  const u = String(p.unite || '').trim();
  const v = (n) => (u ? `${nombreFr(n)} ${u}` : nombreFr(n));
  if (p.cle === 'entre') return `entre ${nombreFr(p.min)} et ${v(p.max)}`;
  if (p.cle === 'au_moins') return `au moins ${v(p.min)}`;
  if (p.cle === 'au_plus') return `au plus ${v(p.max)}`;
  return 'sans plage réglée';
}

const dansPeriode = (date, debut, fin) => {
  const d = String(date || '').slice(0, 10);
  return d >= debut && d <= fin;
};

const parDateHeure = (a, b) =>
  String(a.date || '').localeCompare(String(b.date || '')) || String(a.heure || '').localeCompare(String(b.heure || ''));

function grouperParJour(items, versLigne) {
  const jours = new Map();
  items.forEach((it) => {
    const d = String(it.date || '').slice(0, 10);
    if (!jours.has(d)) jours.set(d, []);
    jours.get(d).push(versLigne(it));
  });
  return [...jours.entries()].map(([date, lignes]) => ({ date, label: dateLongue(date), lignes }));
}

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

// ─── Relevés de températures ─────────────────────────────────────────────────
function assemblerReleves(releves, zones, nomPersonne) {
  const zoneDe = (id) => zones.find(z => z.id === id) || null;
  const lignes = releves.slice().sort(parDateHeure);
  const horsPlage = lignes.filter(r => !r.conforme);

  const zonesVues = new Map();
  lignes.forEach((r) => {
    const cle = r.zoneId || '';
    if (!zonesVues.has(cle)) zonesVues.set(cle, []);
    zonesVues.get(cle).push(r);
  });
  const parZone = [...zonesVues.entries()].map(([id, list]) => {
    const zone = zoneDe(id);
    const valeurs = list.map(r => Number(r.valeur)).filter(Number.isFinite);
    return {
      nom: zone?.nom || 'Appareil supprimé',
      plage: zone ? plageTexte(zone) : '',
      total: list.length,
      horsPlage: list.filter(r => !r.conforme).length,
      min: valeurs.length ? valeurAvecUnite(Math.min(...valeurs), zone?.unite) : '',
      max: valeurs.length ? valeurAvecUnite(Math.max(...valeurs), zone?.unite) : '',
    };
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  const ligneReleve = (r) => {
    const zone = zoneDe(r.zoneId);
    const v = zone ? verdictReleve(zone, r.valeur) : null;
    return {
      zone: zone?.nom || 'Appareil supprimé',
      heure: String(r.heure || '').slice(0, 5),
      valeur: valeurAvecUnite(r.valeur, zone?.unite),
      par: nomPersonne(r.operateur),
      conforme: !!r.conforme,
      resultat: r.conforme ? 'Conforme' : (v?.ton === 'danger' ? v.mot : 'Hors plage'),
      commentaire: String(r.commentaire || '').trim(),
    };
  };

  return {
    total: lignes.length,
    conformes: lignes.length - horsPlage.length,
    horsPlage: horsPlage.length,
    taux: lignes.length ? Math.round(((lignes.length - horsPlage.length) / lignes.length) * 100) : null,
    parZone,
    jours: grouperParJour(lignes, ligneReleve),
    // Actions correctives : ce qui a été fait après chaque relevé hors plage.
    actions: horsPlage.map((r) => {
      const l = ligneReleve(r);
      return { date: dateCourte(r.date), heure: l.heure, zone: l.zone, valeur: l.valeur, resultat: l.resultat, par: l.par, fait: l.commentaire };
    }),
  };
}

// ─── Contrôles du jour ───────────────────────────────────────────────────────
function assemblerControles(controles, tpls, nomPersonne, couvertureDepuis) {
  const tplDe = (id) => tpls.find(t => t.id === id) || null;
  const lignes = controles.slice().sort(parDateHeure);
  const problemes = lignes.filter(c => c.statut !== 'conforme');

  const parId = new Map();
  lignes.forEach((c) => {
    const cle = c.templateId || '';
    if (!parId.has(cle)) parId.set(cle, []);
    parId.get(cle).push(c);
  });
  const parModele = [...parId.entries()].map(([id, list]) => {
    const tpl = tplDe(id);
    return {
      nom: tpl?.label || 'Contrôle supprimé',
      frequence: tpl?.frequence || '',
      faits: list.length,
      problemes: list.filter(c => c.statut !== 'conforme').length,
    };
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  const ligneControle = (c) => ({
    date: dateCourte(c.date),
    nom: tplDe(c.templateId)?.label || 'Contrôle supprimé',
    heure: String(c.heure || '').slice(0, 5),
    par: nomPersonne(c.operateur),
    conforme: c.statut === 'conforme',
    resultat: c.statut === 'conforme' ? 'Conforme' : 'Problème signalé',
    notes: String(c.notes || '').trim(),
  });

  return {
    total: lignes.length,
    conformes: lignes.length - problemes.length,
    problemes: problemes.length,
    parModele,
    jours: grouperParJour(lignes, ligneControle),
    couvertureDepuis,
    signales: problemes.map((c) => {
      const l = ligneControle(c);
      return { date: dateCourte(c.date), heure: l.heure, nom: l.nom, par: l.par, notes: l.notes };
    }),
  };
}

// ─── Durées de vie des étiquettes DLC ────────────────────────────────────────
// Une fiche entre dans la liste quand une durée y est saisie ; les autres
// suivent la durée par défaut de l'app (etiquettesDlc.js), comptées à part.
const dureeSaisie = (r) => [r?.dureeVieJours, r?.dureeVieCongeleJours, r?.dureeVieDecongeleJours]
  .some(v => v != null && v !== '' && !Number.isNaN(Number(v)));

function assemblerDlc(recettes, etiquettesPerso) {
  const ligne = (r, source) => {
    const d = dureesVie(r);
    return {
      nom: String(r.nom || '').trim() || 'Sans nom',
      source,
      frais: d.frais,
      congele: d.congele,
      decongele: d.congele == null ? null : d.decongele,
    };
  };
  const actives = recettes.filter(r => r && r.statut !== 'archivée');
  const fiches = actives.filter(dureeSaisie).map(r => ligne(r, 'Fiche recette'));
  const maison = etiquettesPerso.filter(Boolean).map(p => ligne(p, 'Étiquette maison'));
  const lignes = [...fiches, ...maison].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  return { lignes, parDefaut: actives.length - fiches.length, dureeDefaut: { ...DUREE_VIE_DEFAUT } };
}

// ─── Ce que l'app ne contient pas ────────────────────────────────────────────
// Phrases au vous, complètes : la page sert de liste de contrôle à l'équipe.
export const A_FOURNIR_TOUJOURS = [
  { titre: 'Analyse des dangers', detail: 'L\'analyse des dangers et des points critiques de l\'établissement, avec les mesures prévues pour chacun.' },
  { titre: 'Plan de nettoyage et de désinfection', detail: 'Ce qui est nettoyé, à quelle fréquence, avec quel produit et par qui. Les contrôles cochés dans l\'app figurent dans ce dossier, le plan lui-même n\'y est pas.' },
  { titre: 'Formation du personnel', detail: 'Les attestations de formation à l\'hygiène de chaque collaborateur.' },
  { titre: 'Lutte contre les nuisibles', detail: 'Le contrat ou le plan de lutte, et les rapports de passage.' },
  { titre: 'Entretien des appareils et des thermomètres', detail: 'Les dates d\'entretien des appareils de froid et la vérification des thermomètres.' },
  { titre: 'Fournisseurs et bons de livraison', detail: 'La liste des fournisseurs et les bons de livraison de la période.' },
  { titre: 'Retrait et rappel des produits', detail: 'La marche à suivre quand un produit doit être retiré de la vente ou rappelé.' },
  { titre: 'Information sur les allergènes', detail: 'L\'information sur les allergènes donnée aux clients. Les fiches recettes de l\'app la contiennent, ce dossier ne la reprend pas.' },
];

// ─── Assemblage du dossier ───────────────────────────────────────────────────
// lectures : { tracabilite, etiquettes } à false quand la lecture a échoué. Une
// lecture en échec n'est pas une liste vide : la rubrique part dans « À
// fournir » avec la raison, jamais « aucune donnée ».
export function assemblerDossier({
  etablissement = '',
  debut,
  fin,
  editeLe = '',
  heureEdition = '',
  zones = [],
  releves = [],
  tpls = [],
  controles = [],
  tracabilite = [],
  recettes = [],
  etiquettesPerso = [],
  lectures = {},
  nomPersonne = (v) => String(v || ''),
} = {}) {
  const nom = (v) => String(nomPersonne(v) || '').trim();
  const lectTrac = lectures.tracabilite !== false;
  const lectEtiq = lectures.etiquettes !== false;

  // Contrôles : une lecture plafonnée dont le plus ancien est dans la période
  // ne couvre pas tout le début de la période.
  let couvertureDepuis = null;
  if (controles.length >= PLAFOND_LECTURE) {
    const plusAncien = controles.reduce((m, c) => (c.date && (!m || c.date < m) ? c.date : m), '');
    if (plusAncien && plusAncien > debut) couvertureDepuis = plusAncien;
  }

  const rel = assemblerReleves(releves.filter(r => dansPeriode(r.date, debut, fin)), zones, nom);
  const ctl = assemblerControles(controles.filter(c => dansPeriode(c.date, debut, fin)), tpls, nom, couvertureDepuis);
  const trac = lectTrac
    ? tracabilite.filter(t => dansPeriode(t.date, debut, fin)).sort(parDateHeure).map(t => ({
      date: dateCourte(t.date),
      produit: String(t.produit || '').trim(),
      par: nom(t.operateur),
      notes: String(t.notes || '').trim(),
    }))
    : [];
  const dlc = lectEtiq ? assemblerDlc(recettes, etiquettesPerso) : { lignes: [], parDefaut: 0, dureeDefaut: { ...DUREE_VIE_DEFAUT } };

  // Rubriques sans donnée : elles ne s'écrivent pas, elles passent ici.
  const manquants = [];
  if (!rel.total) {
    manquants.push({ titre: 'Relevés de températures', detail: 'Aucun relevé n\'est enregistré dans l\'app pour cette période. Joignez vos relevés papier s\'il y en a.' });
  }
  if (!ctl.total) {
    manquants.push({ titre: 'Contrôles du jour', detail: 'Aucun contrôle n\'est enregistré dans l\'app pour cette période. Joignez vos fiches de contrôle papier s\'il y en a.' });
  }
  if (!lectTrac) {
    manquants.push({ titre: 'Traçabilité des produits reçus', detail: 'Les photos d\'étiquettes n\'ont pas pu être lues au moment de l\'édition. Refaites le dossier, ou montrez-les dans l\'app, écran des photos.' });
  } else if (!trac.length) {
    manquants.push({ titre: 'Traçabilité des produits reçus', detail: 'Aucune photo d\'étiquette n\'est enregistrée dans l\'app pour cette période. Joignez les étiquettes ou les bons gardés.' });
  }
  if (!lectEtiq) {
    manquants.push({ titre: 'Durées de vie des préparations', detail: 'Les fiches n\'ont pas pu être lues au moment de l\'édition. Refaites le dossier.' });
  } else if (!dlc.lignes.length) {
    manquants.push({ titre: 'Durées de vie des préparations', detail: 'Aucune durée de vie n\'est saisie sur les fiches de l\'app. Joignez la liste des durées que vous appliquez.' });
  }

  const sections = [];
  if (rel.total) {
    sections.push({ id: 'releves', titre: 'Relevés de températures', resume: `${pluriel(rel.total, 'relevé', 'relevés')}, ${rel.horsPlage} hors plage` });
    sections.push({ id: 'actions', titre: 'Actions correctives', resume: rel.actions.length ? pluriel(rel.actions.length, 'relevé hors plage', 'relevés hors plage') : 'Aucun relevé hors plage' });
  }
  if (ctl.total) {
    sections.push({ id: 'controles', titre: 'Contrôles du jour', resume: `${pluriel(ctl.total, 'contrôle', 'contrôles')}, ${pluriel(ctl.problemes, 'problème', 'problèmes')}` });
    sections.push({ id: 'problemes', titre: 'Problèmes signalés', resume: ctl.signales.length ? pluriel(ctl.signales.length, 'problème signalé', 'problèmes signalés') : 'Aucun problème signalé' });
  }
  if (trac.length) sections.push({ id: 'tracabilite', titre: 'Traçabilité des produits reçus', resume: pluriel(trac.length, 'photo d\'étiquette', 'photos d\'étiquettes') });
  if (dlc.lignes.length) sections.push({ id: 'dlc', titre: 'Étiquettes DLC : durées de vie', resume: pluriel(dlc.lignes.length, 'préparation', 'préparations') });
  sections.push({ id: 'a_fournir', titre: 'À fournir par l\'établissement', resume: pluriel(manquants.length + A_FOURNIR_TOUJOURS.length, 'document', 'documents') });

  return {
    etablissement: String(etablissement || '').trim(),
    periode: {
      debut,
      fin,
      jours: joursEntre(debut, fin),
      label: `Du ${dateCourte(debut)} au ${dateCourte(fin)}`,
    },
    editeLe: editeLe ? dateCourte(editeLe) : '',
    heureEdition: String(heureEdition || '').slice(0, 5),
    sections,
    releves: rel.total ? rel : null,
    controles: ctl.total ? ctl : null,
    tracabilite: trac,
    dlc,
    aFournir: [...manquants, ...A_FOURNIR_TOUJOURS],
  };
}

// Nom du fichier : dossier-controle-<établissement>-<début>-<fin>.pdf
export function nomFichierDossier(etablissement, debut, fin) {
  const slug = String(etablissement || 'etablissement')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'etablissement';
  return `dossier-controle-${slug}-${debut}-${fin}.pdf`;
}
