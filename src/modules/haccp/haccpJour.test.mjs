// node --test : état de la journée HACCP (haccpJour.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RETARD_TOURNEE_MIN, etatDuJour, etatTournees, plageEnClair, verdictReleve, actionsProposees,
  commentaireActions, etatControle, compteControles,
} from './haccpJour.js';

const TODAY = '2026-10-30';
const zone = (id, nom, type, cible, min, max, actif = true, unite = '°C') => ({ id, nom, type, cible, min, max, unite, actif });

// Woodland : 8 zones, tournées 07:00, 11:30, 18:00, 22:30.
const ZONES = [
  zone('z1', 'Chambre froide positive', 'froid', 3, 0, 4),
  zone('z2', 'Chambre froide négative', 'negatif', -18, null, -15),
  zone('z3', 'Frigo du passe', 'froid', 3, 0, 4),
  zone('z4', 'Saladette', 'froid', 3, 0, 4),
  zone('z5', 'Frigo pâtisserie', 'froid', 3, 0, 4),
  zone('z6', 'Frigo du bar', 'froid', 4, 0, 6),
  zone('z7', 'Bain-marie du passe', 'chaud', 65, 63, null),
  zone('z8', 'Lave-vaisselle (rinçage)', 'hygiene', 85, 82, null),
];
const CRENEAUX = [
  { id: 'c1', label: 'Ouverture', heure: '07:00', actif: true },
  { id: 'c2', label: 'Avant service midi', heure: '11:30', actif: true },
  { id: 'c3', label: 'Avant service soir', heure: '18:00', actif: true },
  { id: 'c4', label: 'Fermeture', heure: '22:30', actif: true },
];
let n = 0;
const tournee = (heure, zones = ZONES, date = TODAY) => zones.map(z => ({ id: 'r' + (++n), zoneId: z.id, date, heure, valeur: z.cible, conforme: true }));
const jour = (releves, maintenant, extra = {}) => etatDuJour({ creneaux: CRENEAUX, zones: ZONES, releves, today: TODAY, maintenant, ...extra });

test('seuil de retard aligné sur le tableau de bord', () => {
  assert.equal(RETARD_TOURNEE_MIN, 30);
});

test('Woodland 11:20, ouverture faite : à faire, relevé de 11:30, 0 sur 8', () => {
  const e = jour(tournee('07:00'), '11:20');
  assert.equal(e.statut, 'a_faire');
  assert.equal(e.courante.heure, '11:30');
  assert.equal(e.courante.faites, 0);
  assert.equal(e.courante.total, 8);
  assert.equal(e.faitsJour, 8);
  assert.equal(e.totalJour, 32);
  assert.equal(e.prochaine.heure, '18:00');
});

test('12:05 sans relevé de 11:30 : en retard', () => {
  const e = jour(tournee('07:00'), '12:05');
  assert.equal(e.statut, 'en_retard');
  assert.equal(e.courante.heure, '11:30');
});

test('15:00, ouverture et midi faits : à jour, prochaine 18:00', () => {
  const e = jour([...tournee('07:00'), ...tournee('11:35')], '15:00');
  assert.equal(e.statut, 'a_jour');
  assert.equal(e.prochaine.heure, '18:00');
  assert.deepEqual(e.manquees, []);
});

test('15:00, ouverture manquée, midi fait : manque, manquées = [07:00]', () => {
  const e = jour(tournee('11:30'), '15:00');
  assert.equal(e.statut, 'manque');
  assert.deepEqual(e.manquees.map(t => t.heure), ['07:00']);
  assert.equal(e.manquees[0].faites, 0);
});

test('23:30, tout fait : à jour, pas de prochaine', () => {
  const e = jour(['07:00', '11:30', '18:00', '22:30'].flatMap(h => tournee(h)), '23:30');
  assert.equal(e.statut, 'a_jour');
  assert.equal(e.prochaine, null);
  assert.equal(e.faitsJour, 32);
});

test('un relevé fait à 07:50 compte pour la tournée de 07:00', () => {
  const e = jour(tournee('07:50'), '09:00');
  const t7 = e.tournees.find(t => t.heure === '07:00');
  assert.equal(t7.faites, 8);
  assert.equal(t7.etat, 'fait');
  assert.equal(e.statut, 'a_jour');
});

test('états des tournées autour de leur heure', () => {
  const t = (min) => etatTournees(CRENEAUX, ZONES, [], min).find(x => x.heure === '11:30').etat;
  assert.equal(t(10 * 60 + 59), 'plus_tard');
  assert.equal(t(11 * 60), 'a_faire');
  assert.equal(t(11 * 60 + 59), 'a_faire');
  assert.equal(t(12 * 60), 'en_retard');
});

test('sans tournée : 2 sur 4 à faire, puis 4 sur 4 à jour', () => {
  const quatre = ZONES.slice(0, 4);
  const base = { creneaux: [], zones: quatre, today: TODAY, maintenant: '10:00' };
  const partiel = etatDuJour({ ...base, releves: tournee('08:15', quatre.slice(0, 2)) });
  assert.equal(partiel.statut, 'a_faire');
  assert.equal(partiel.zonesFaitesJour, 2);
  assert.equal(partiel.totalZones, 4);
  assert.equal(partiel.dernierReleve, '08:15');
  const complet = etatDuJour({ ...base, releves: [...tournee('08:15', quatre.slice(0, 2)), ...tournee('09:40', quatre.slice(2))] });
  assert.equal(complet.statut, 'a_jour');
  assert.equal(complet.dernierReleve, '09:40');
});

test('aucune zone active : pas encore réglé', () => {
  assert.equal(etatDuJour({ creneaux: CRENEAUX, zones: [], releves: [], today: TODAY, maintenant: '11:20' }).statut, 'non_regle');
  assert.equal(etatDuJour({ creneaux: CRENEAUX, zones: [{ ...ZONES[0], actif: false }], releves: [], today: TODAY, maintenant: '11:20' }).statut, 'non_regle');
});

test('une zone inactive est ignorée', () => {
  const zones = [...ZONES, zone('z9', 'Ancienne vitrine', 'froid', 4, 0, 6, false)];
  const e = etatDuJour({ creneaux: CRENEAUX, zones, releves: tournee('07:00'), today: TODAY, maintenant: '09:00' });
  assert.equal(e.courante.total, 8);
  assert.equal(e.statut, 'a_jour');
});

test('relevés d\'hier ignorés', () => {
  const e = jour(tournee('07:00', ZONES, '2026-10-29'), '09:00');
  assert.equal(e.statut, 'en_retard');
  assert.equal(e.faitsJour, 0);
});

test('verdicts en mots', () => {
  const frigo = ZONES[2];
  assert.deepEqual(verdictReleve(frigo, 9), { ton: 'danger', mot: 'Trop chaud', sens: 'haut' });
  assert.deepEqual(verdictReleve(frigo, -1), { ton: 'danger', mot: 'Trop froid', sens: 'bas' });
  assert.deepEqual(verdictReleve(frigo, 3), { ton: 'ok', mot: 'Bon', sens: null });
  assert.equal(verdictReleve(ZONES[6], 50).mot, 'Pas assez chaud');
  assert.equal(verdictReleve(ZONES[7], 70).mot, 'Pas assez chaud');
  const ph = zone('p', 'pH', 'custom', 5, 4, 7, true, 'pH');
  assert.deepEqual(verdictReleve(ph, 9), { ton: 'danger', mot: 'Trop haut', sens: 'haut' });
  assert.equal(verdictReleve(ph, 3).mot, 'Trop bas');
  assert.equal(verdictReleve(ZONES[1], '-18,5').mot, 'Bon');
  assert.equal(verdictReleve(ZONES[1], '-12').mot, 'Trop chaud');
  assert.equal(verdictReleve(frigo, ''), null);
  assert.equal(verdictReleve(frigo, 'abc'), null);
});

test('bornes inversées : même échange que la conformité', () => {
  const inverse = zone('i', 'Frigo inversé', 'froid', 3, 4, 0);
  assert.deepEqual(plageEnClair(inverse), { cle: 'entre', min: 0, max: 4, unite: '°C' });
  assert.equal(verdictReleve(inverse, 2).mot, 'Bon');
  assert.equal(verdictReleve(inverse, 5).mot, 'Trop chaud');
  assert.equal(verdictReleve(inverse, -1).mot, 'Trop froid');
});

test('plage en clair', () => {
  assert.deepEqual(plageEnClair(ZONES[1]), { cle: 'au_plus', min: null, max: -15, unite: '°C' });
  assert.deepEqual(plageEnClair(ZONES[6]), { cle: 'au_moins', min: 63, max: null, unite: '°C' });
  assert.equal(plageEnClair(zone('l', 'Libre', 'custom', null, null, null)).cle, 'libre');
});

test('actions proposées par type et sens', () => {
  assert.deepEqual(actionsProposees(ZONES[2], 'haut'), ['Porte fermée, je relève de nouveau dans 30 minutes', 'Produits déplacés dans un autre frigo', 'Chef prévenu', 'Produits jetés', 'Autre chose']);
  assert.deepEqual(actionsProposees(ZONES[1], 'bas'), ['Réglage du frigo corrigé', 'Chef prévenu', 'Autre chose']);
  assert.equal(actionsProposees(ZONES[6], 'bas')[0], 'Remis à chauffer, je relève de nouveau dans 30 minutes');
  assert.deepEqual(actionsProposees(ZONES[6], 'haut'), ['Température baissée', 'Chef prévenu', 'Autre chose']);
  assert.deepEqual(actionsProposees(ZONES[7], 'bas'), ['Cycle relancé', 'Chef prévenu', 'Autre chose']);
  assert.deepEqual(actionsProposees(zone('p', 'pH', 'custom', 5, 4, 7), 'haut'), ['Chef prévenu', 'Autre chose']);
});

test('commentaire écrit : actions jointes, texte libre à la fin, sans « Autre chose »', () => {
  assert.equal(commentaireActions(['Chef prévenu']), 'Chef prévenu');
  assert.equal(commentaireActions(['Produits jetés', 'Chef prévenu', 'Autre chose'], '  sonde changée '), 'Produits jetés. Chef prévenu. sonde changée');
  assert.equal(commentaireActions([], ''), '');
});

test('contrôles selon leur fréquence', () => {
  const tpl = (id, frequence) => ({ id, label: id, frequence, actif: true });
  const ctrl = (templateId, date) => ({ id: templateId + date, templateId, date, heure: '09:00', statut: 'conforme' });
  const hebdo = tpl('hebdo', 'Hebdomadaire');
  assert.equal(etatControle(hebdo, [ctrl('hebdo', '2026-10-27')], TODAY).fait, true);
  assert.equal(etatControle(hebdo, [ctrl('hebdo', '2026-10-23')], TODAY).fait, false);
  const mensuel = tpl('mensuel', 'Mensuel');
  const m = etatControle(mensuel, [ctrl('mensuel', '2026-09-20')], TODAY);
  assert.equal(m.du, true);
  assert.equal(m.fait, false);
  assert.equal(m.dernier.date, '2026-09-20');
  const livraison = tpl('livraison', 'À chaque livraison');
  assert.equal(etatControle(livraison, [], TODAY).du, false);
  assert.equal(etatControle(livraison, [ctrl('livraison', TODAY)], TODAY).du, false);
  const quotidien = tpl('quotidien', 'Quotidien');
  assert.equal(etatControle(quotidien, [ctrl('quotidien', '2026-10-29')], TODAY).fait, false);
  assert.equal(etatControle(quotidien, [ctrl('quotidien', TODAY)], TODAY).fait, true);
  assert.equal(etatControle(tpl('inconnu', 'Toutes les deux heures'), [ctrl('inconnu', '2026-10-29')], TODAY).fait, false);
  // Un contrôle enregistré après la date regardée ne compte pas pour elle.
  assert.equal(etatControle(quotidien, [ctrl('quotidien', TODAY)], '2026-10-29').fait, false);
});

test('compteur de la tuile : contrôles dus seulement', () => {
  const tpls = [
    { id: 'a', frequence: 'Après chaque service', actif: true },
    { id: 'b', frequence: 'À chaque livraison', actif: true },
    { id: 'c', frequence: 'Quotidien', actif: true },
    { id: 'd', frequence: 'Quotidien', actif: true },
    { id: 'e', frequence: 'Avant chaque service', actif: true },
    { id: 'f', frequence: 'Mensuel', actif: false },
  ];
  const controls = [
    { id: '1', templateId: 'b', date: TODAY, heure: '09:10', statut: 'conforme' },
    { id: '2', templateId: 'a', date: '2026-10-29', heure: '15:30', statut: 'non-conforme' },
  ];
  assert.deepEqual(compteControles(tpls, controls, TODAY), { faits: 0, dus: 4 });
  assert.deepEqual(compteControles(tpls, [...controls, { id: '3', templateId: 'c', date: TODAY, heure: '11:20', statut: 'conforme' }], TODAY), { faits: 1, dus: 4 });
});
