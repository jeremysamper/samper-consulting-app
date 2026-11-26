// ─────────────────────────────────────────────────────────────────────────────
// Plusieurs chambres en une saisie (lot 14 du panel) : un groupe, un séminaire.
// Fichier pur, testé par node --test (sejoursGroupe.test.mjs) : il n'importe
// pas hotelData.js, qui lit Supabase à son chargement.
//
// Une ligne = un séjour à créer : { cle, chambreId, nom, nbAdultes }. Les
// valeurs communes (dates, pension, tarif, prix, origine, notes) sont dans
// `commun`. Les chambres se proposent une à une par chambreProposee, chaque
// chambre déjà retenue comptant comme prise pour les lignes suivantes : un
// séjour factice par ligne, chacun avec son propre id (chambreLibre ignore un
// séjour qui porte l'id du candidat, et le candidat n'en a pas).
// ─────────────────────────────────────────────────────────────────────────────

import { chambreLibre, chambreProposee } from './checkin.js';

export const MAX_CHAMBRES = 20;
export const MIN_CHAMBRES = 2;
export const ADULTES_PAR_DEFAUT = 2;

const OCCUPE = new Set(['prevu', 'en_maison']);
const nuitsCommunes = (a, b) => a.arrivee < b.depart && b.arrivee < a.depart;

export const bornerNombre = (n) => Math.min(MAX_CHAMBRES, Math.max(MIN_CHAMBRES, Math.round(Number(n)) || MIN_CHAMBRES));

const factice = (ligne, commun) => ({
  id: `ligne-${ligne.cle}`, chambreId: ligne.chambreId, statut: 'prevu', arrivee: commun.arrivee, depart: commun.depart,
});
const candidat = (ligne, commun) => ({
  arrivee: commun.arrivee, depart: commun.depart, nbAdultes: Number(ligne.nbAdultes) || 0, nbEnfants: 0, chambreId: null, statut: 'prevu',
});

// Clé neuve, plus grande que toutes celles des lignes données.
function prochaineCle(lignes) {
  const max = lignes.reduce((m, l) => Math.max(m, Number(String(l.cle).replace(/\D/g, '')) || 0), 0);
  return max + 1;
}

const ligneVide = (n) => ({ cle: `l${n}`, chambreId: '', nom: '', nbAdultes: ADULTES_PAR_DEFAUT });

// Pose une chambre proposée sur chaque ligne sans chambre, dans l'ordre. Les
// chambres des autres lignes comptent comme prises. Plus rien de libre : la
// ligne garde chambreId ''.
export function proposerManquantes(lignes, chambres, sejours, commun, tarif = null) {
  if (!commun?.arrivee || !commun?.depart || commun.depart <= commun.arrivee) return lignes;
  const pris = [...(sejours || [])];
  lignes.forEach((l) => { if (l.chambreId) pris.push(factice(l, commun)); });
  return lignes.map((l) => {
    if (l.chambreId) return l;
    const c = chambreProposee(chambres, pris, candidat(l, commun), tarif);
    if (!c) return l;
    const suite = { ...l, chambreId: c.id };
    pris.push(factice(suite, commun));
    return suite;
  });
}

export function proposerLignes(chambres, sejours, commun, nombre, tarif = null) {
  const n = Math.max(0, Math.min(MAX_CHAMBRES, Math.round(Number(nombre)) || 0));
  const lignes = Array.from({ length: n }, (_, i) => ligneVide(i + 1));
  return proposerManquantes(lignes, chambres, sejours, commun, tarif);
}

// Le nombre change : les lignes déjà saisies restent telles quelles ; on
// ajoute des lignes proposées à la fin, ou on retire les dernières.
export function ajusterLignes(lignes, nombre, chambres, sejours, commun, tarif = null) {
  const n = Math.max(0, Math.min(MAX_CHAMBRES, Math.round(Number(nombre)) || 0));
  if (n <= lignes.length) return lignes.slice(0, n);
  const debut = prochaineCle(lignes);
  const ajout = Array.from({ length: n - lignes.length }, (_, i) => ligneVide(debut + i));
  const tout = [...lignes, ...ajout];
  const cles = new Set(ajout.map((l) => l.cle));
  const proposees = proposerManquantes(tout, chambres, sejours, commun, tarif);
  // Seules les lignes ajoutées reçoivent une chambre : une ligne laissée sans
  // chambre à la main le reste.
  return proposees.map((l, i) => (cles.has(l.cle) ? l : tout[i]));
}

// Les dates changent : une chambre encore libre (et pas déjà gardée par une
// ligne au-dessus) reste sur sa ligne, sinon la ligne est reproposée. Une
// ligne laissée sans chambre le reste. Nom et adultes ne bougent pas.
export function reproposerLignes(lignes, chambres, sejours, commun, tarif = null) {
  if (!commun?.arrivee || !commun?.depart || commun.depart <= commun.arrivee) return lignes;
  const gardees = new Set();
  const aReproposer = new Set();
  const premier = lignes.map((l) => {
    if (!l.chambreId) return l;
    const libre = chambreLibre({ id: l.chambreId }, sejours, candidat(l, commun));
    if (libre && !gardees.has(l.chambreId)) { gardees.add(l.chambreId); return l; }
    aReproposer.add(l.cle);
    return { ...l, chambreId: '' };
  });
  const proposees = proposerManquantes(premier, chambres, sejours, commun, tarif);
  return proposees.map((l, i) => (aReproposer.has(l.cle) ? l : premier[i]));
}

// Le séjour existant qui occupe cette chambre sur ces nuits, ou null.
export function sejourQuiGene(sejours, chambreId, commun) {
  if (!chambreId) return null;
  return (sejours || []).find((s) => s.chambreId === chambreId && OCCUPE.has(s.statut) && nuitsCommunes(s, commun)) || null;
}

// Erreurs par ligne avant l'envoi. `genes` donne le séjour qui gêne, pour
// l'afficher en nœuds séparés (le nom et les dates ne partent pas au traducteur).
export function verifierLignes(lignes, chambres, sejours, commun) {
  const erreurs = {};
  const genes = {};
  const compte = new Map();
  lignes.forEach((l) => { if (l.chambreId) compte.set(l.chambreId, (compte.get(l.chambreId) || 0) + 1); });
  const doublons = [...compte.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  lignes.forEach((l) => {
    if (!(Number(l.nbAdultes) >= 1)) { erreurs[l.cle] = 'Au moins un adulte par chambre.'; return; }
    if (l.chambreId && doublons.includes(l.chambreId)) { erreurs[l.cle] = 'Cette chambre est choisie sur une autre ligne.'; return; }
    const gene = sejourQuiGene(sejours, l.chambreId, commun);
    if (gene) {
      genes[l.cle] = gene;
      erreurs[l.cle] = `Chambre déjà prise du ${gene.arrivee} au ${gene.depart} (${gene.nomHote}).`;
    }
  });
  return { erreurs, doublons, genes };
}

// Nombre de chambres libres sur ces nuits (actives, hors service non).
export function chambresLibres(chambres, sejours, commun) {
  if (!commun?.arrivee || !commun?.depart || commun.depart <= commun.arrivee) return 0;
  return (chambres || []).filter((c) => c.actif !== false && c.statutMenage !== 'hors_service'
    && chambreLibre(c, sejours, candidat({ nbAdultes: 1 }, commun))).length;
}

export function nomDeLigne(commun, ligne, rang) {
  const saisi = String(ligne?.nom || '').trim();
  return saisi || `${String(commun?.nomGroupe || '').trim()} (${rang})`;
}

export function prixDeCommun(commun) {
  const brut = String(commun?.prixNuit ?? '').trim();
  return brut === '' ? null : Number(brut.replace(',', '.'));
}

// Les lignes à insérer, aux noms de colonnes de la base. Toutes portent le
// même jeu de clés : dans une insertion en tableau, une clé absente d'une
// ligne part à null et non à la valeur par défaut de la base. Ni forfait, ni
// bracelet, ni statut (prevu par défaut).
export function valeursSejours(commun, lignes) {
  const texte = (v) => String(v || '').trim() || null;
  const prix = prixDeCommun(commun);
  return lignes.map((l, i) => ({
    nom_hote: nomDeLigne(commun, l, i + 1),
    arrivee: commun.arrivee,
    depart: commun.depart,
    nb_adultes: Number(l.nbAdultes) || 0,
    nb_enfants: 0,
    pension: commun.pension,
    chambre_id: l.chambreId || null,
    tarif_id: commun.tarifId || null,
    prix_nuit: prix,
    origine: texte(commun.origine),
    demandes_speciales: texte(commun.demandesSpeciales),
    notes: texte(commun.notes),
  }));
}
