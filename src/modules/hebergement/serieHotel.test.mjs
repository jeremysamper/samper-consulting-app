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
