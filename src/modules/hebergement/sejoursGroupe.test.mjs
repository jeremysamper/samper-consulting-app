// node --test : plusieurs chambres en une saisie (lot 14 du panel).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CHAMBRES, MIN_CHAMBRES, ajusterLignes, chambresLibres, nomDeLigne, proposerLignes, reproposerLignes, valeursSejours, verifierLignes,
} from './sejoursGroupe.js';

const ch = (id, numero, extra = {}) => ({ id, numero, categorie: 'Double', capacite: 2, statutMenage: 'propre', actif: true, ...extra });
const chambres = [ch('c101', '101'), ch('c102', '102'), ch('c103', '103'), ch('c104', '104')];
const commun = {
  nomGroupe: 'Séminaire Alpha', arrivee: '2026-12-01', depart: '2026-12-03', pension: 'demi',
  tarifId: '', prixNuit: '', origine: '', demandesSpeciales: '', notes: '',
};
const ids = (lignes) => lignes.map((l) => l.chambreId);

test('bornes de la saisie', () => {
  assert.equal(MIN_CHAMBRES, 2);
  assert.equal(MAX_CHAMBRES, 20);
});

test('proposerLignes ne propose jamais deux fois la même chambre', () => {
  const lignes = proposerLignes(chambres, [], commun, 4, null);
  assert.equal(lignes.length, 4);
  assert.equal(new Set(ids(lignes)).size, 4);
  assert.deepEqual(ids(lignes), ['c101', 'c102', 'c103', 'c104']);
  assert.ok(lignes.every((l) => l.nbAdultes === 2 && l.nom === ''));
  assert.equal(new Set(lignes.map((l) => l.cle)).size, 4);
});

test('une chambre prise par un séjour prévu ou en maison ne se propose pas ; libérée le jour de l\'arrivée, elle se propose', () => {
  const sejours = [
    { id: 's1', chambreId: 'c101', statut: 'prevu', arrivee: '2026-12-02', depart: '2026-12-04', nomHote: 'Dupont' },
    { id: 's2', chambreId: 'c102', statut: 'en_maison', arrivee: '2026-11-29', depart: '2026-12-02', nomHote: 'Muller' },
    { id: 's3', chambreId: 'c103', statut: 'en_maison', arrivee: '2026-11-28', depart: '2026-12-01', nomHote: 'Rossi' },
  ];
  const lignes = proposerLignes(chambres, sejours, commun, 2, null);
  assert.deepEqual(ids(lignes), ['c103', 'c104']);
});

test('une chambre hors service ou inactive ne se propose pas', () => {
  const liste = [ch('c101', '101', { statutMenage: 'hors_service' }), ch('c102', '102', { actif: false }), ch('c103', '103'), ch('c104', '104')];
  assert.deepEqual(ids(proposerLignes(liste, [], commun, 2, null)), ['c103', 'c104']);
});

test('trois chambres libres pour quatre lignes : la quatrième reste sans chambre', () => {
  const lignes = proposerLignes(chambres.slice(0, 3), [], commun, 4, null);
  assert.deepEqual(ids(lignes), ['c101', 'c102', 'c103', '']);
  assert.equal(chambresLibres(chambres.slice(0, 3), [], commun), 3);
});

test('ajusterLignes garde les lignes saisies', () => {
  const trois = proposerLignes(chambres.concat([ch('c105', '105'), ch('c106', '106')]), [], commun, 3, null)
    .map((l, i) => ({ ...l, nom: `Nom ${i + 1}`, nbAdultes: 1 }));
  trois[1] = { ...trois[1], chambreId: '' };
  const cinq = ajusterLignes(trois, 5, chambres.concat([ch('c105', '105'), ch('c106', '106')]), [], commun, null);
  assert.equal(cinq.length, 5);
  assert.deepEqual(cinq.slice(0, 3), trois);
  assert.equal(new Set(cinq.map((l) => l.cle)).size, 5);
  // Les lignes ajoutées ne reprennent pas une chambre déjà retenue.
  const prises = cinq.map((l) => l.chambreId).filter(Boolean);
  assert.equal(new Set(prises).size, prises.length);
  assert.equal(cinq[3].chambreId !== '' && cinq[4].chambreId !== '', true);
  const deux = ajusterLignes(cinq, 2, chambres, [], commun, null);
  assert.deepEqual(deux, cinq.slice(0, 2));
});

test('verifierLignes : doublon, chambre prise avec le nom qui gêne, zéro adulte', () => {
  const sejours = [{ id: 's1', chambreId: 'c103', statut: 'prevu', arrivee: '2026-12-02', depart: '2026-12-05', nomHote: 'Dupont' }];
  const lignes = [
    { cle: 'l1', chambreId: 'c101', nom: '', nbAdultes: 2 },
    { cle: 'l2', chambreId: 'c101', nom: '', nbAdultes: 2 },
    { cle: 'l3', chambreId: 'c103', nom: '', nbAdultes: 2 },
    { cle: 'l4', chambreId: 'c104', nom: '', nbAdultes: 0 },
    { cle: 'l5', chambreId: '', nom: '', nbAdultes: 1 },
    { cle: 'l6', chambreId: '', nom: '', nbAdultes: 1 },
  ];
  const { erreurs, doublons, genes } = verifierLignes(lignes, chambres, sejours, commun);
  assert.deepEqual(doublons, ['c101']);
  assert.ok(erreurs.l1 && erreurs.l2);
  assert.match(erreurs.l3, /Dupont/);
  assert.equal(genes.l3.id, 's1');
  assert.ok(erreurs.l4);
  assert.equal(erreurs.l5, undefined);
  assert.equal(erreurs.l6, undefined);
});

test('nomDeLigne : le nom saisi, sinon le nom du groupe et le rang', () => {
  assert.equal(nomDeLigne(commun, { nom: '  Mme Keller ' }, 1), 'Mme Keller');
  assert.equal(nomDeLigne(commun, { nom: '' }, 2), 'Séminaire Alpha (2)');
});

test('valeursSejours : une ligne par chambre, mêmes clés partout, ni forfait, ni bracelet, ni statut', () => {
  const lignes = [
    { cle: 'l1', chambreId: 'c101', nom: 'Mme Keller', nbAdultes: 1 },
    { cle: 'l2', chambreId: '', nom: '', nbAdultes: 2 },
  ];
  const v = valeursSejours({ ...commun, origine: ' Agence ' }, lignes);
  assert.equal(v.length, 2);
  assert.equal(v[0].chambre_id, 'c101');
  assert.equal(v[1].chambre_id, null);
  assert.equal(v[0].prix_nuit, null);
  assert.equal(v[1].nom_hote, 'Séminaire Alpha (2)');
  assert.equal(v[0].origine, 'Agence');
  assert.equal(v[0].nb_enfants, 0);
  for (const ligne of v) {
    assert.equal('forfait_id' in ligne, false);
    assert.equal('identifiant' in ligne, false);
    assert.equal('statut' in ligne, false);
  }
  assert.deepEqual(Object.keys(v[0]), Object.keys(v[1]));
  assert.equal(valeursSejours({ ...commun, prixNuit: '145,50' }, lignes)[0].prix_nuit, 145.5);
});

test('reproposerLignes garde une chambre encore libre, remplace une chambre devenue prise, sans doublon', () => {
  const lignes = [
    { cle: 'l1', chambreId: 'c101', nom: 'A', nbAdultes: 1 },
    { cle: 'l2', chambreId: 'c102', nom: 'B', nbAdultes: 3 },
    { cle: 'l3', chambreId: '', nom: 'C', nbAdultes: 2 },
  ];
  const nouvelles = { ...commun, arrivee: '2026-12-10', depart: '2026-12-12' };
  const sejours = [{ id: 's9', chambreId: 'c102', statut: 'prevu', arrivee: '2026-12-11', depart: '2026-12-13', nomHote: 'X' }];
  const r = reproposerLignes(lignes, chambres, sejours, nouvelles, null);
  assert.equal(r[0].chambreId, 'c101');
  assert.notEqual(r[1].chambreId, 'c102');
  assert.notEqual(r[1].chambreId, '');
  assert.notEqual(r[1].chambreId, 'c101');
  assert.equal(r[2].chambreId, '');
  assert.deepEqual(r.map((l) => [l.nom, l.nbAdultes]), [['A', 1], ['B', 3], ['C', 2]]);
});
