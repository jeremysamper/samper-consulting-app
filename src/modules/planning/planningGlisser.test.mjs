// node --test : règle de dépôt du glisser-déposer (planningGlisser.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleCase, copieHoraire, estPointe, horaireDeplace, idCopie, lireCase, regleDepot } from './planningGlisser.js';

const h = (id, userId, date, debut, fin, extra = {}) => ({
  id, etablissementId: 'e1', userId, date, debut, fin, pause: 0, poste: 'Salle', typeShift: 'midi', statut: 'confirmé', note: '', pointageDebut: null, pointageFin: null, ...extra,
});
const midiMarco = h('m1', 'marco', '2026-11-03', '10:00', '15:00');

test('même case : rien', () => {
  const r = regleDepot({ horaire: midiMarco, cible: { userId: 'marco', date: '2026-11-03' }, existants: [midiMarco] });
  assert.equal(r.effet, 'rien');
  assert.equal(r.bloque, null);
  assert.equal(r.etat, null);
});

test('case libre : déplacer', () => {
  const r = regleDepot({ horaire: midiMarco, cible: { userId: 'marco', date: '2026-11-02' }, existants: [midiMarco] });
  assert.equal(r.effet, 'deplacer');
  assert.equal(r.etat, 'ok');
});

test('Alt ou Ctrl : copier', () => {
  const r = regleDepot({ horaire: midiMarco, cible: { userId: 'julie', date: '2026-11-03' }, copie: true, existants: [midiMarco] });
  assert.equal(r.effet, 'copier');
  assert.equal(r.etat, 'ok');
});

test('chevauchement chez la cible : refus avec le conflit', () => {
  const lucie = h('l1', 'lucie', '2026-11-03', '10:00', '15:00');
  const r = regleDepot({ horaire: midiMarco, cible: { userId: 'lucie', date: '2026-11-03' }, existants: [midiMarco, lucie] });
  assert.equal(r.effet, 'rien');
  assert.equal(r.bloque, 'chevauche');
  assert.equal(r.conflit, lucie);
  assert.equal(r.etat, 'refus');
});

test('bornes adjacentes (15:00 / 15:00) : permis', () => {
  const apresMidi = h('a1', 'lucie', '2026-11-03', '15:00', '18:00');
  const r = regleDepot({ horaire: midiMarco, cible: { userId: 'lucie', date: '2026-11-03' }, existants: [midiMarco, apresMidi] });
  assert.equal(r.effet, 'deplacer');
});

test('un midi sur une case qui a un soir : permis (coupure)', () => {
  const soir = h('s1', 'lucie', '2026-11-03', '17:00', '23:00', { typeShift: 'soir' });
  const r = regleDepot({ horaire: midiMarco, cible: { userId: 'lucie', date: '2026-11-03' }, existants: [midiMarco, soir] });
  assert.equal(r.effet, 'deplacer');
  assert.equal(r.etat, 'ok');
});

test('même personne, autre jour qui a déjà le même horaire : refus', () => {
  const lundi = h('m0', 'marco', '2026-11-02', '10:00', '15:00');
  const r = regleDepot({ horaire: midiMarco, cible: { userId: 'marco', date: '2026-11-02' }, existants: [midiMarco, lundi] });
  assert.equal(r.bloque, 'chevauche');
  assert.equal(r.conflit, lundi);
});

test('pointé sans copie : refus « pointe »', () => {
  const pointe = { ...midiMarco, pointageDebut: '10:01', pointageFin: '14:59' };
  const r = regleDepot({ horaire: pointe, cible: { userId: 'marco', date: '2026-11-02' }, existants: [pointe] });
  assert.equal(r.effet, 'rien');
  assert.equal(r.bloque, 'pointe');
  assert.equal(r.etat, 'refus');
});

test('pointé avec copie : copier', () => {
  const pointe = { ...midiMarco, pointageDebut: '10:01' };
  const r = regleDepot({ horaire: pointe, cible: { userId: 'marco', date: '2026-11-02' }, copie: true, existants: [pointe] });
  assert.equal(r.effet, 'copier');
});

test('pointé vers une case qui chevauche : refus « chevauche », pas « pointe »', () => {
  const pointe = { ...midiMarco, pointageDebut: '10:01', pointageFin: '14:59' };
  const lucie = h('l1', 'lucie', '2026-11-03', '11:00', '14:00');
  const r = regleDepot({ horaire: pointe, cible: { userId: 'lucie', date: '2026-11-03' }, existants: [pointe, lucie] });
  assert.equal(r.bloque, 'chevauche');
});

test('absence chez la cible : permis, avec le motif et l\'état « avertir »', () => {
  const r = regleDepot({ horaire: midiMarco, cible: { userId: 'julie', date: '2026-11-04' }, existants: [midiMarco], absence: 'Vacances' });
  assert.equal(r.effet, 'deplacer');
  assert.equal(r.absence, 'Vacances');
  assert.equal(r.etat, 'avertir');
});

test('l\'horaire déplacé n\'est pas compté contre lui-même', () => {
  // La liste porte déjà l'horaire sur la case visée (état optimiste, écho
  // realtime) : même id, il n'est pas un conflit.
  const r = regleDepot({ horaire: midiMarco, cible: { userId: 'marco', date: '2026-11-04' }, existants: [{ ...midiMarco, date: '2026-11-04' }] });
  assert.equal(r.effet, 'deplacer');
  assert.equal(r.conflit, null);
});

test('sans cible : rien', () => {
  assert.equal(regleDepot({ horaire: midiMarco, cible: null, existants: [] }).effet, 'rien');
});

test('retour arrière vers une case de départ reprise entre-temps : refus « chevauche »', () => {
  // Le soir de Sarah a quitté mercredi pour lundi ; un « Soir » a été posé
  // mercredi depuis. Annuler (même règle que le dépôt) ne le remet pas.
  const deplace = h('s1', 'sarah', '2026-11-02', '18:00', '23:30', { typeShift: 'soir' });
  const pose = h('s2', 'sarah', '2026-11-04', '17:00', '23:00', { typeShift: 'soir' });
  const r = regleDepot({ horaire: deplace, cible: { userId: 'sarah', date: '2026-11-04' }, existants: [deplace, pose] });
  assert.equal(r.bloque, 'chevauche');
  assert.equal(r.conflit.id, 's2');
  // Un midi posé à sa place ne gêne pas le retour du soir (service coupé).
  const midi = h('s3', 'sarah', '2026-11-04', '10:00', '15:00');
  assert.equal(regleDepot({ horaire: deplace, cible: { userId: 'sarah', date: '2026-11-04' }, existants: [deplace, midi] }).effet, 'deplacer');
});

test('horaireDeplace ne change que la personne et le jour', () => {
  const pointe = { ...midiMarco, pause: 30, note: 'clé', statut: 'modifié' };
  const d = horaireDeplace(pointe, { userId: 'julie', date: '2026-11-05' });
  assert.deepEqual(d, { ...pointe, userId: 'julie', date: '2026-11-05' });
  assert.equal(d.id, 'm1');
});

test('copieHoraire ne porte jamais de pointage', () => {
  const pointe = { ...midiMarco, pointageDebut: '10:01', pointageFin: '14:59', statut: 'modifié', pause: 15 };
  const c = copieHoraire(pointe, { userId: 'julie', date: '2026-11-05' }, 'sX');
  assert.equal(c.id, 'sX');
  assert.equal(c.pointageDebut, null);
  assert.equal(c.pointageFin, null);
  assert.equal(c.statut, 'confirmé');
  assert.equal(c.userId, 'julie');
  assert.equal(c.date, '2026-11-05');
  assert.equal(c.debut, '10:00');
  assert.equal(c.pause, 15);
  assert.equal(c.poste, 'Salle');
  assert.equal(estPointe(c), false);
});

test('idCopie suit le format du pont et ne se répète pas', () => {
  const a = idCopie(1761800000000, 0.1);
  assert.match(a, /^s1761800000000-g[0-9a-z]{6}$/);
  assert.notEqual(idCopie(), idCopie());
});

test('cleCase et lireCase font l\'aller-retour', () => {
  const cle = cleCase('11111111-1111-4111-8111-111111111125', '2026-11-03');
  assert.deepEqual(lireCase(cle), { userId: '11111111-1111-4111-8111-111111111125', date: '2026-11-03' });
  assert.equal(lireCase('sans-barre'), null);
});
