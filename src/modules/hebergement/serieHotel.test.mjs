// node --test : chiffres de la branche Hôtel sur une période (serieHotel.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { serieHotel, statsPeriode } from './serieHotel.js';
import { zurichAjouterJours } from '../../utils/zurichTime.js';

// ── Témoin : statsMois tel qu'il était dans hotelData.js avant ce lot ──
const premierDuMois = (mois) => `${mois}-01`;
function finDuMois(mois) { const [y, m] = mois.split('-').map(Number); return `${mois}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; }
const joursDuMois = (mois) => Number(finDuMois(mois).slice(8, 10));
const nuitsDe = (s) => Math.max(0, Math.round((Date.parse(`${s.depart}T12:00:00`) - Date.parse(`${s.arrivee}T12:00:00`)) / 86400000));
const personnes = (s) => (s.nbAdultes || 0) + (s.nbEnfants || 0);
function nuitsDansLeMois(arrivee, depart, mois) {
  const debut = premierDuMois(mois);
  const fin = zurichAjouterJours(finDuMois(mois), 1);
  const a = arrivee > debut ? arrivee : debut;
  const d = depart < fin ? depart : fin;
  return d > a ? nuitsDe({ arrivee: a, depart: d }) : 0;
}
const sejourCompte = (s) => s.statut === 'en_maison' || s.statut === 'parti';

// Chiffres du mois : nuitées chambres (séjours en maison ou partis), nuitées
// personnes (occupants, sinon personnes du séjour), arrivées, taux d'occupation
// (nuitées chambres sur chambres actives fois jours), durée moyenne, prix
// moyen par nuitée vendue (lignes nuitée du mois), taxes du mois, et la
// répartition HESTA par pays de domicile.
function statsMoisAncien({ sejours, chambres, occupants, lignes, mois }) {
  const debut = premierDuMois(mois);
  const fin = finDuMois(mois);
  const duMois = sejours.filter((s) => sejourCompte(s) && s.arrivee <= fin && s.depart > debut);
  const nuiteesChambres = duMois.reduce((n, s) => n + nuitsDansLeMois(s.arrivee, s.depart, mois), 0);
  const arrivees = duMois.filter((s) => s.arrivee >= debut && s.arrivee <= fin);
  const idsDuMois = new Set(duMois.map((s) => s.id));
  const parSejour = new Map();
  for (const o of occupants) {
    if (!idsDuMois.has(o.sejourId)) continue;
    parSejour.set(o.sejourId, [...(parSejour.get(o.sejourId) || []), o]);
  }
  let nuiteesPersonnes = 0;
  let arriveesPersonnes = 0;
  const parPays = new Map();
  const compter = (pays, nuitees, arriveesN) => {
    const cle = (pays || '').trim() || 'Non renseigné';
    const e = parPays.get(cle) || { pays: cle, arrivees: 0, nuitees: 0 };
    e.nuitees += nuitees;
    e.arrivees += arriveesN;
    nuiteesPersonnes += nuitees;
    arriveesPersonnes += arriveesN;
    parPays.set(cle, e);
  };
  for (const s of duMois) {
    const liste = parSejour.get(s.id);
    if (liste && liste.length) {
      for (const o of liste) {
        const arr = o.arrivee || s.arrivee;
        compter(o.domicilePays || o.nationalite, nuitsDansLeMois(arr, o.depart || s.depart, mois), arr >= debut && arr <= fin ? 1 : 0);
      }
    } else {
      const p = personnes(s) || 1;
      compter('', nuitsDansLeMois(s.arrivee, s.depart, mois) * p, s.arrivee >= debut && s.arrivee <= fin ? p : 0);
    }
  }
  const chambresActives = chambres.filter((c) => c.actif).length;
  const capacite = chambresActives * joursDuMois(mois);
  const lignesDuMois = lignes.filter((l) => l.jour >= debut && l.jour <= fin);
  const caNuitees = lignesDuMois.filter((l) => l.type === 'nuitee').reduce((n, l) => n + l.montant, 0);
  const taxes = { sejour: 0, hebergement: 0 };
  for (const l of lignesDuMois) {
    if (l.type === 'taxe_sejour') taxes.sejour += l.montant;
    if (l.type === 'taxe_hebergement') taxes.hebergement += l.montant;
  }
  const dureeMoyenne = arrivees.length ? arrivees.reduce((n, s) => n + nuitsDe(s), 0) / arrivees.length : 0;
  return {
    nuiteesChambres, nuiteesPersonnes, arrivees: arrivees.length, arriveesPersonnes,
    tauxOccupation: capacite ? nuiteesChambres / capacite : 0, chambresActives,
    dureeMoyenne, prixMoyen: nuiteesChambres ? caNuitees / nuiteesChambres : 0, caNuitees,
    taxes, parPays: [...parPays.values()].sort((a, b) => b.nuitees - a.nuitees || a.pays.localeCompare(b.pays, 'fr')),
  };
}


// ── Jeu d'essai : 1 100 séjours sur un an, occupants, lignes de note ──
function jeuHotel() {
  const sejours = [];
  const occupants = [];
  const lignes = [];
  for (let i = 0; i < 1100; i += 1) {
    const arrivee = new Date(Date.UTC(2026, 0, 1 + (i % 330))).toISOString().slice(0, 10);
    const depart = zurichAjouterJours(arrivee, 1 + (i % 6));
    const id = `s${i}`;
    sejours.push({ id, chambreId: `c${i % 10}`, arrivee, depart, statut: ['parti', 'en_maison', 'parti', 'annule', 'prevu'][i % 5], nbAdultes: 2, nbEnfants: i % 3 === 0 ? 1 : 0, nomHote: 'x' });
    if (i % 2) occupants.push({ sejourId: id, arrivee, depart, domicilePays: ['CH', 'FR', 'DE', ''][i % 4], nationalite: 'CH' });
    for (let n = 0; n < 1 + (i % 6); n += 1) lignes.push({ jour: zurichAjouterJours(arrivee, n), type: 'nuitee', montant: 140 + (i % 4) * 15 });
    lignes.push({ jour: arrivee, type: 'taxe_sejour', montant: 3.2 }, { jour: arrivee, type: 'taxe_hebergement', montant: 1.1 });
  }
  const chambres = Array.from({ length: 12 }, (_, k) => ({ id: `c${k}`, actif: k < 10 }));
  return { sejours, occupants, lignes, chambres };
}

test("le registre sur un mois : celui de statsMois tel qu'il était, zéros compris", () => {
  const j = jeuHotel();
  for (const mois of ['2026-02', '2026-07', '2026-11', '2026-12']) {
    const ancien = statsMoisAncien({ ...j, mois });
    const n = statsPeriode({ ...j, debut: premierDuMois(mois), fin: finDuMois(mois) });
    assert.equal(n.nuiteesChambres, ancien.nuiteesChambres, mois);
    assert.equal(n.nuiteesPersonnes, ancien.nuiteesPersonnes, mois);
    assert.equal(n.arrivees, ancien.arrivees, mois);
    assert.equal(n.arriveesPersonnes, ancien.arriveesPersonnes, mois);
    assert.equal(n.tauxOccupation ?? 0, ancien.tauxOccupation, mois);
    assert.equal(n.dureeMoyenne ?? 0, ancien.dureeMoyenne, mois);
    assert.equal(n.prixMoyen ?? 0, ancien.prixMoyen, mois);
    assert.equal(n.caNuitees, ancien.caNuitees, mois);
    assert.deepEqual(n.taxes, ancien.taxes, mois);
    assert.deepEqual(n.parPays, ancien.parPays, mois);
  }
});

test('série : les jours font les mois pour les flux, demandes, technique, activités, étages et linge', () => {
  const j = jeuHotel();
  const demandes = Array.from({ length: 1200 }, (_, i) => ({ createdAt: new Date(Date.UTC(2026, 0, 1 + (i % 300), 9)).toISOString(), statut: i % 3 ? 'faite' : 'ouverte', faiteAt: new Date(Date.UTC(2026, 0, 1 + (i % 300), 9 + (i % 30))).toISOString() }));
  const ordres = Array.from({ length: 300 }, (_, i) => ({ statut: i % 4 ? 'termine' : 'ouvert', termineAt: new Date(Date.UTC(2026, 0, 1 + i, 15)).toISOString(), tempsMinutes: 30 + i % 60, cout: 50 + (i % 9) * 10 }));
  const activites = Array.from({ length: 200 }, (_, i) => ({ id: `a${i}`, debut: new Date(Date.UTC(2026, 0, 1 + i, 14)).toISOString(), places: 12, annulee: i % 10 === 0 }));
  const inscriptions = Array.from({ length: 600 }, (_, i) => ({ activiteId: `a${i % 200}`, nbPersonnes: 1 + (i % 3), statut: i % 7 ? 'inscrit' : 'annule' }));
  const journalChambres = Array.from({ length: 1100 }, (_, i) => ({ nouveau: ['propre', 'a_faire', 'en_cours'][i % 3], at: new Date(Date.UTC(2026, 0, 1 + (i % 330), 11)).toISOString() }));
  const linge = Array.from({ length: 800 }, (_, i) => ({ jour: new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString().slice(0, 10), sens: i % 2 ? 'sale' : 'propre', quantite: 1 + (i % 5) }));
  const donnees = { ...j, demandes, ordres, activites, inscriptions, journalChambres, linge };
  const jours = Array.from({ length: 31 }, (_, i) => { const d = `2026-03-${String(i + 1).padStart(2, '0')}`; return { debut: d, fin: d }; });
  const pts = serieHotel(donnees, jours);
  const [mars] = serieHotel(donnees, [{ debut: '2026-03-01', fin: '2026-03-31' }]);
  const somme = (f) => pts.reduce((s, p) => s + f(p), 0);
  assert.equal(somme((p) => p.registre.nuiteesChambres), mars.registre.nuiteesChambres);
  assert.equal(somme((p) => p.registre.nuiteesPersonnes), mars.registre.nuiteesPersonnes);
  assert.equal(somme((p) => p.registre.arrivees), mars.registre.arrivees);
  assert.ok(Math.abs(somme((p) => p.registre.caNuitees) - mars.registre.caNuitees) < 1e-6);
  assert.equal(somme((p) => p.demandes.creees), mars.demandes.creees);
  assert.equal(somme((p) => p.demandes.faites), mars.demandes.faites);
  assert.equal(somme((p) => p.technique.termines), mars.technique.termines);
  assert.equal(somme((p) => p.technique.cout), mars.technique.cout);
  assert.equal(somme((p) => p.activites.inscrits), mars.activites.inscrits);
  assert.equal(somme((p) => p.chambresFaites), mars.chambresFaites);
  assert.equal(somme((p) => p.linge.sale), mars.linge.sale);
  assert.ok(mars.demandes.creees > 0 && mars.technique.termines > 0 && mars.activites.inscrits > 0 && mars.chambresFaites > 0);
});

// ── Lot 13 du panel : classes de taxe, décompte du mois, état du registre ──
import { ageAu, classeTaxe, decompteTaxe, etatRegistre } from './serieHotel.js';

const REGL = { ageEnfantExonere: 6, ageEnfantReduit: 16, taxeSejourAdulte: 2.5, taxeSejourEnfant: 1.25, taxeHebergement: 1 };

test('classeTaxe : exonération, seuils d\'âge, âge inconnu, anniversaire le jour d\'arrivée', () => {
  const arr = '2026-11-10';
  assert.equal(classeTaxe({ exonereTaxe: true, dateNaissance: '2023-01-01' }, arr, REGL), 'exonere_motif');
  assert.equal(classeTaxe({ exonereTaxe: true, dateNaissance: '1980-01-01' }, arr, REGL), 'exonere_motif');
  assert.equal(classeTaxe({ dateNaissance: '2021-01-01' }, arr, REGL), 'exonere_age'); // 5 ans
  assert.equal(classeTaxe({ dateNaissance: '2020-01-01' }, arr, REGL), 'enfant'); // 6 ans
  assert.equal(classeTaxe({ dateNaissance: '2011-01-01' }, arr, REGL), 'enfant'); // 15 ans
  assert.equal(classeTaxe({ dateNaissance: '2010-01-01' }, arr, REGL), 'adulte'); // 16 ans
  assert.equal(classeTaxe({ dateNaissance: '' }, arr, REGL), 'adulte');
  assert.equal(classeTaxe({}, arr, REGL), 'adulte');
  assert.equal(ageAu('2010-11-10', arr), 16);
  assert.equal(classeTaxe({ dateNaissance: '2010-11-10' }, arr, REGL), 'adulte');
  assert.equal(classeTaxe({ dateNaissance: '2010-11-11' }, arr, REGL), 'enfant');
});

const occ = (id, sejourId, extra = {}) => ({ id, sejourId, arrivee: '', depart: '', dateNaissance: '', exonereTaxe: false, exonereMotif: '', ...extra });

test('decompteTaxe : jeu écrit à la main, 4 nuits dans le mois', () => {
  const sejours = [{ id: 's1', statut: 'en_maison', arrivee: '2026-11-10', depart: '2026-11-14', nbAdultes: 3, nbEnfants: 2 }];
  const occupants = [
    occ('o1', 's1', { dateNaissance: '1980-02-02' }),
    occ('o2', 's1', { dateNaissance: '1982-03-03' }),
    occ('o3', 's1', { dateNaissance: '2016-01-01' }), // 10 ans
    occ('o4', 's1', { dateNaissance: '2023-01-01' }), // 3 ans
    occ('o5', 's1', { dateNaissance: '1979-01-01', exonereTaxe: true, exonereMotif: 'Résident de la commune' }),
  ];
  const lignes = [
    { jour: '2026-11-10', type: 'taxe_sejour', montant: 25 },
    { jour: '2026-11-10', type: 'taxe_hebergement', montant: 12 },
  ];
  const d = decompteTaxe({ sejours, occupants, lignes, reglages: REGL, debut: '2026-11-01', fin: '2026-11-30' });
  assert.equal(d.nuitees.adultes, 8);
  assert.equal(d.nuitees.enfants, 4);
  assert.equal(d.nuitees.exonereAge, 4);
  assert.equal(d.nuitees.exonereMotif, 4);
  assert.deepEqual(d.motifs, [{ motif: 'Résident de la commune', nuitees: 4 }]);
  assert.equal(d.du.sejour, 25);
  assert.equal(d.du.hebergement, 12);
  assert.deepEqual(d.ecart, { sejour: 0, hebergement: 0 });
  assert.equal(d.sansInscrit.sejours, 0);
});

test('decompteTaxe : séjour à cheval sur deux mois, seules les nuits du mois comptent, écart non nul', () => {
  const sejours = [{ id: 's1', statut: 'parti', arrivee: '2026-10-29', depart: '2026-11-03', nbAdultes: 1, nbEnfants: 0 }];
  const occupants = [occ('o1', 's1', { dateNaissance: '1980-02-02' })];
  // La note date ses taxes du jour d'arrivée : 5 nuits en octobre.
  const lignes = [{ jour: '2026-10-29', type: 'taxe_sejour', montant: 12.5 }, { jour: '2026-10-29', type: 'taxe_hebergement', montant: 5 }];
  const nov = decompteTaxe({ sejours, occupants, lignes, reglages: REGL, debut: '2026-11-01', fin: '2026-11-30' });
  assert.equal(nov.nuitees.adultes, 2);
  assert.equal(nov.du.sejour, 5);
  assert.equal(nov.notes.sejour, 0);
  assert.equal(nov.ecart.sejour, -5);
  const oct = decompteTaxe({ sejours, occupants, lignes, reglages: REGL, debut: '2026-10-01', fin: '2026-10-31' });
  assert.equal(oct.nuitees.adultes, 3);
  assert.equal(oct.ecart.sejour, 12.5 - 7.5);
});

test('decompteTaxe : séjour sans occupant compté d\'après ses nombres, prévu et annulé ignorés', () => {
  const sejours = [
    { id: 's1', statut: 'en_maison', arrivee: '2026-11-10', depart: '2026-11-12', nbAdultes: 2, nbEnfants: 1 },
    { id: 's2', statut: 'prevu', arrivee: '2026-11-10', depart: '2026-11-12', nbAdultes: 2, nbEnfants: 0 },
    { id: 's3', statut: 'annule', arrivee: '2026-11-10', depart: '2026-11-12', nbAdultes: 2, nbEnfants: 0 },
  ];
  const occupants = [occ('o2', 's2', { dateNaissance: '1980-01-01' })];
  const d = decompteTaxe({ sejours, occupants, lignes: [], reglages: REGL, debut: '2026-11-01', fin: '2026-11-30' });
  assert.equal(d.nuitees.adultes, 4);
  assert.equal(d.nuitees.enfants, 2);
  assert.equal(d.nuitees.total, 6);
  assert.deepEqual(d.sansInscrit, { sejours: 1, nuitees: 6 });
  assert.equal(d.du.sejour, 4 * 2.5 + 2 * 1.25);
});

test('decompteTaxe : motifs regroupés sans casse ni espaces, motif vide sous « Motif non renseigné »', () => {
  const sejours = [{ id: 's1', statut: 'en_maison', arrivee: '2026-11-10', depart: '2026-11-11', nbAdultes: 4, nbEnfants: 0 }];
  const occupants = [
    occ('o1', 's1', { exonereTaxe: true, exonereMotif: 'résident de la commune' }),
    occ('o2', 's1', { exonereTaxe: true, exonereMotif: 'Résident de la commune  ' }),
    occ('o3', 's1', { exonereTaxe: true, exonereMotif: '' }),
    occ('o4', 's1', { exonereTaxe: true, exonereMotif: '   ' }),
  ];
  const d = decompteTaxe({ sejours, occupants, lignes: [], reglages: REGL, debut: '2026-11-01', fin: '2026-11-30' });
  assert.equal(d.motifs.length, 2);
  assert.equal(d.motifs.find((m) => m.nuitees === 2 && /commune/.test(m.motif)).nuitees, 2);
  assert.deepEqual(d.motifs.find((m) => m.motif === 'Motif non renseigné'), { motif: 'Motif non renseigné', nuitees: 2 });
});

// Témoin : la boucle des taxes de lignesAutomatiques avant le lot 13
// (hotelData.js ne se charge pas sous Node).
function quantitesAnciennes(sejour, r, occupants) {
  const mes = occupants.filter((o) => o.sejourId === sejour.id);
  let adultes = 0;
  let enfants = 0;
  if (mes.length) {
    for (const o of mes) {
      const age = ageAu(o.dateNaissance, sejour.arrivee);
      if (o.exonereTaxe || (age != null && age < r.ageEnfantExonere)) continue;
      if (age != null && age < r.ageEnfantReduit) enfants += 1;
      else adultes += 1;
    }
  } else {
    adultes = sejour.nbAdultes || 0;
    enfants = sejour.nbEnfants || 0;
  }
  return { adultes, enfants };
}
function quantitesNouvelles(sejour, r, occupants) {
  const mes = occupants.filter((o) => o.sejourId === sejour.id);
  let adultes = 0;
  let enfants = 0;
  if (mes.length) {
    for (const o of mes) {
      const c = classeTaxe(o, sejour.arrivee, r);
      if (c === 'enfant') enfants += 1;
      else if (c === 'adulte') adultes += 1;
    }
  } else {
    adultes = sejour.nbAdultes || 0;
    enfants = sejour.nbEnfants || 0;
  }
  return { adultes, enfants };
}

test('non-régression : classeTaxe rend les mêmes quantités de taxes que l\'ancienne boucle', () => {
  const sejours = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, statut: 'parti', arrivee: `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`, depart: '2026-12-31', nbAdultes: i % 3, nbEnfants: i % 2 }));
  const occupants = [];
  sejours.forEach((s, i) => {
    if (i % 5 === 0) return;
    for (let k = 0; k < 1 + (i % 4); k += 1) {
      const an = 1960 + ((i * 7 + k * 11) % 66);
      occupants.push(occ(`o${i}-${k}`, s.id, { dateNaissance: (i + k) % 6 ? `${an}-${String(1 + ((i + k) % 12)).padStart(2, '0')}-${String(1 + (k % 27)).padStart(2, '0')}` : '', exonereTaxe: (i + k) % 9 === 0 }));
    }
  });
  for (const r of [REGL, { ageEnfantExonere: 0, ageEnfantReduit: 0 }, { ageEnfantExonere: 12, ageEnfantReduit: 18 }]) {
    for (const s of sejours) assert.deepEqual(quantitesNouvelles(s, r, occupants), quantitesAnciennes(s, r, occupants), s.id);
  }
});

test('etatRegistre : réservé, erreur, chargement, prêt', () => {
  const ok = ['ready', 'ready', 'ready'];
  assert.equal(etatRegistre({ peutGerer: false, statuts: ok }), 'reserve');
  assert.equal(etatRegistre({ peutGerer: true, statuts: ['ready', 'error', 'ready'] }), 'erreur');
  assert.equal(etatRegistre({ peutGerer: true, statuts: ['ready', 'ready', 'absent'] }), 'erreur');
  assert.equal(etatRegistre({ peutGerer: true, statuts: ['ready', 'loading', 'ready'] }), 'chargement');
  assert.equal(etatRegistre({ peutGerer: true, statuts: ok }), 'pret');
});

test('égalité avec le registre : la somme des classes égale les nuitées personnes de statsPeriode', () => {
  const j = jeuHotel();
  const reglages = REGL;
  // Cas aux bords : un séjour sans occupant ni nombre de personnes, un
  // occupant sans dates, un exonéré, un enfant.
  const sejours = [...j.sejours,
    { id: 'bord1', statut: 'parti', arrivee: '2026-03-05', depart: '2026-03-09', nbAdultes: 0, nbEnfants: 0, chambreId: j.chambres[0]?.id },
    { id: 'bord2', statut: 'en_maison', arrivee: '2026-03-28', depart: '2026-04-03', nbAdultes: 2, nbEnfants: 0, chambreId: j.chambres[0]?.id }];
  const occupants = [...j.occupants,
    occ('b1', 'bord2', { dateNaissance: '1990-01-01' }),
    occ('b2', 'bord2', { dateNaissance: '2018-06-01', exonereTaxe: true, exonereMotif: 'Chauffeur' }),
    occ('b3', 'bord2', { dateNaissance: '2022-06-01', arrivee: '2026-03-30', depart: '2026-04-02' })];
  for (const mois of ['2026-01', '2026-03', '2026-04', '2026-07', '2026-12']) {
    const debut = premierDuMois(mois);
    const fin = finDuMois(mois);
    const s = statsPeriode({ ...j, sejours, occupants, debut, fin });
    const d = decompteTaxe({ sejours, occupants, lignes: j.lignes, reglages, debut, fin });
    const somme = d.nuitees.adultes + d.nuitees.enfants + d.nuitees.exonereAge + d.nuitees.exonereMotif;
    assert.equal(somme, s.nuiteesPersonnes, mois);
    assert.equal(d.nuitees.total, s.nuiteesPersonnes, mois);
    assert.ok(Math.abs(d.notes.sejour - s.taxes.sejour) < 0.005, mois);
  }
});
