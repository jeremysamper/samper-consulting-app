// node --test : dossier du contrôle des denrées (dossierControle.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  A_FOURNIR_TOUJOURS, DUREE_DOSSIER_JOURS, PLAFOND_LECTURE, assemblerDossier, dateCourte, dateLongue,
  decalerJours, erreurPeriode, joursEntre, nombreFr, nomFichierDossier, periodeParDefaut, plageTexte,
} from './dossierControle.js';

const TODAY = '2026-11-18';
const zone = (id, nom, type, cible, min, max, unite = '°C') => ({ id, nom, type, cible, min, max, unite, actif: true });
const ZONES = [
  zone('z1', 'Chambre froide positive', 'froid', 3, 0, 4),
  zone('z2', 'Chambre froide négative', 'negatif', -18, null, -15),
  zone('z3', 'Bain-marie du passe', 'chaud', 65, 63, null),
];
const TPLS = [
  { id: 't1', label: 'Réception marchandises', frequence: 'À chaque livraison', type: 'reception', actif: true },
  { id: 't2', label: 'Nettoyage des surfaces', frequence: 'Quotidien', type: 'hygiene', actif: true },
];
const NOMS = { u1: 'Marie Dupont', u2: 'Luca Rossi' };
const nomPersonne = (id) => NOMS[id] || '';

let n = 0;
const rel = (date, heure, zoneId, valeur, conforme, commentaire = '', operateur = 'u1') =>
  ({ id: 'r' + (++n), date, heure, zoneId, valeur, conforme, commentaire, operateur });
const ctl = (date, heure, templateId, statut = 'conforme', notes = '', operateur = 'u2') =>
  ({ id: 'c' + (++n), date, heure, templateId, statut, notes, operateur });

const base = (extra = {}) => assemblerDossier({
  etablissement: 'Hôtel Panorama', debut: '2026-08-21', fin: TODAY, editeLe: TODAY, heureEdition: '14:32:10',
  zones: ZONES, tpls: TPLS, nomPersonne, ...extra,
});

test('période par défaut : les 90 derniers jours, aujourd\'hui compris', () => {
  const p = periodeParDefaut(TODAY);
  assert.equal(DUREE_DOSSIER_JOURS, 90);
  assert.deepEqual(p, { debut: '2026-08-21', fin: TODAY });
  assert.equal(joursEntre(p.debut, p.fin), 90);
  assert.equal(decalerJours('2026-03-01', -1), '2026-02-28');
});

test('période saisie : bornes contrôlées', () => {
  assert.equal(erreurPeriode('2026-08-21', TODAY, TODAY), null);
  assert.match(erreurPeriode('', TODAY, TODAY), /date de début/);
  assert.match(erreurPeriode('2026-11-20', '2026-11-19', TODAY), /avant la date de fin/);
  assert.match(erreurPeriode('2026-11-19', '2026-11-25', TODAY), /après aujourd'hui/);
});

test('dates et nombres à la suisse', () => {
  assert.equal(dateCourte('2026-08-01'), '01.08.2026');
  assert.equal(dateLongue('2026-11-18'), 'Mercredi 18 novembre 2026');
  assert.equal(nombreFr(3.5), '3,5');
  assert.equal(nombreFr(-18), '-18');
  assert.equal(nombreFr(4.04), '4');
  assert.equal(plageTexte(ZONES[0]), 'entre 0 et 4 °C');
  assert.equal(plageTexte(ZONES[1]), 'au plus -15 °C');
  assert.equal(plageTexte(ZONES[2]), 'au moins 63 °C');
  assert.equal(plageTexte({ unite: '°C' }), 'sans plage réglée');
});

test('relevés : seuls ceux de la période, triés, avec leur conformité', () => {
  const d = base({
    releves: [
      rel('2026-11-18', '11:30', 'z1', 3, true),
      rel('2026-11-18', '07:00', 'z1', 6.5, false, 'Porte refermée, produits contrôlés'),
      rel('2026-11-17', '18:00', 'z3', 58, false),
      rel('2026-08-20', '07:00', 'z1', 2, true), // la veille du début : hors période
      rel('2026-11-19', '07:00', 'z1', 2, true), // demain : hors période
    ],
  });
  assert.equal(d.releves.total, 3);
  assert.equal(d.releves.horsPlage, 2);
  assert.equal(d.releves.conformes, 1);
  assert.equal(d.releves.taux, 33);
  assert.deepEqual(d.releves.jours.map(j => j.date), ['2026-11-17', '2026-11-18']);
  const j18 = d.releves.jours[1].lignes;
  assert.deepEqual(j18.map(l => l.heure), ['07:00', '11:30']);
  assert.equal(j18[0].resultat, 'Trop chaud');
  assert.equal(j18[0].valeur, '6,5 °C');
  assert.equal(j18[0].par, 'Marie Dupont');
  assert.equal(j18[1].resultat, 'Conforme');
  assert.equal(d.releves.jours[0].lignes[0].resultat, 'Pas assez chaud');
});

test('synthèse par appareil : plage, compte, extrêmes', () => {
  const d = base({ releves: [rel('2026-11-18', '07:00', 'z1', 6.5, false), rel('2026-11-18', '11:30', 'z1', 2, true)] });
  assert.deepEqual(d.releves.parZone, [
    { nom: 'Chambre froide positive', plage: 'entre 0 et 4 °C', total: 2, horsPlage: 1, min: '2 °C', max: '6,5 °C' },
  ]);
});

test('actions correctives : chaque relevé hors plage, avec ce qui a été fait ou rien', () => {
  const d = base({
    releves: [
      rel('2026-11-18', '07:00', 'z1', 6.5, false, 'Porte refermée, produits contrôlés'),
      rel('2026-11-17', '18:00', 'z3', 58, false),
    ],
  });
  assert.deepEqual(d.releves.actions.map(a => [a.date, a.zone, a.fait]), [
    ['17.11.2026', 'Bain-marie du passe', ''],
    ['18.11.2026', 'Chambre froide positive', 'Porte refermée, produits contrôlés'],
  ]);
  assert.equal(d.sections.find(s => s.id === 'actions').resume, '2 relevés hors plage');
});

test('relevé sans hors plage : la rubrique des actions le dit, sans rien inventer', () => {
  const d = base({ releves: [rel('2026-11-18', '07:00', 'z1', 3, true)] });
  assert.equal(d.releves.actions.length, 0);
  assert.equal(d.sections.find(s => s.id === 'actions').resume, 'Aucun relevé hors plage');
});

test('contrôles : conformité, problèmes signalés et synthèse par contrôle', () => {
  const d = base({
    controles: [
      ctl('2026-11-18', '08:00', 't1'),
      ctl('2026-11-18', '15:00', 't2', 'non-conforme', 'Plan de travail du garde-manger à refaire'),
      ctl('2026-11-17', '15:00', 't2'),
      ctl('2026-01-02', '15:00', 't2'), // hors période
    ],
  });
  assert.equal(d.controles.total, 3);
  assert.equal(d.controles.problemes, 1);
  assert.deepEqual(d.controles.parModele, [
    { nom: 'Nettoyage des surfaces', frequence: 'Quotidien', faits: 2, problemes: 1 },
    { nom: 'Réception marchandises', frequence: 'À chaque livraison', faits: 1, problemes: 0 },
  ]);
  assert.deepEqual(d.controles.signales, [
    { date: '18.11.2026', heure: '15:00', nom: 'Nettoyage des surfaces', par: 'Luca Rossi', notes: 'Plan de travail du garde-manger à refaire' },
  ]);
  assert.equal(d.controles.jours[1].lignes[1].resultat, 'Problème signalé');
  assert.equal(d.controles.couvertureDepuis, null);
});

test('contrôles : une lecture plafonnée qui ne remonte pas au début est signalée', () => {
  const plein = Array.from({ length: PLAFOND_LECTURE }, (_, i) => ctl(decalerJours(TODAY, -(i % 40)), '08:00', 't2'));
  const d = base({ controles: plein });
  assert.equal(d.controles.couvertureDepuis, decalerJours(TODAY, -39));
  const court = base({ controles: plein.slice(0, 10) });
  assert.equal(court.controles.couvertureDepuis, null);
});

test('rubrique vide : non écrite, elle passe dans « À fournir »', () => {
  const d = base();
  assert.equal(d.releves, null);
  assert.equal(d.controles, null);
  assert.deepEqual(d.sections.map(s => s.id), ['a_fournir']);
  const titres = d.aFournir.map(a => a.titre);
  assert.deepEqual(titres.slice(0, 4), [
    'Relevés de températures', 'Contrôles du jour', 'Traçabilité des produits reçus', 'Durées de vie des préparations',
  ]);
  assert.equal(d.aFournir.length, 4 + A_FOURNIR_TOUJOURS.length);
  assert.ok(titres.includes('Plan de nettoyage et de désinfection'));
  assert.ok(titres.includes('Formation du personnel'));
  assert.ok(titres.includes('Analyse des dangers'));
});

test('lecture en échec : jamais « aucune photo », la raison est donnée', () => {
  const d = base({ tracabilite: [{ date: TODAY, produit: 'Saumon' }], lectures: { tracabilite: false, etiquettes: false } });
  assert.deepEqual(d.tracabilite, []);
  const trac = d.aFournir.find(a => a.titre === 'Traçabilité des produits reçus');
  assert.match(trac.detail, /n'ont pas pu être lues/);
  assert.doesNotMatch(trac.detail, /Aucune photo/);
  assert.match(d.aFournir.find(a => a.titre === 'Durées de vie des préparations').detail, /pas pu être lues/);
});

test('traçabilité : photos de la période, triées, avec qui les a prises', () => {
  const d = base({
    tracabilite: [
      { date: '2026-11-18', produit: 'Saumon fumé', operateur: 'u2', notes: '', createdAt: 'x' },
      { date: '2026-10-02', produit: '', operateur: 'u1', notes: 'Lot 2231' },
      { date: '2026-05-02', produit: 'Hors période', operateur: 'u1' },
    ],
  });
  assert.deepEqual(d.tracabilite, [
    { date: '02.10.2026', produit: '', par: 'Marie Dupont', notes: 'Lot 2231' },
    { date: '18.11.2026', produit: 'Saumon fumé', par: 'Luca Rossi', notes: '' },
  ]);
  assert.ok(!d.aFournir.some(a => a.titre === 'Traçabilité des produits reçus'));
});

test('étiquettes DLC : fiches avec une durée saisie et étiquettes maison, les autres comptées à part', () => {
  const d = base({
    recettes: [
      { id: 'a', nom: 'Fond de veau', dureeVieJours: 5, dureeVieCongeleJours: 90, dureeVieDecongeleJours: 2 },
      { id: 'b', nom: 'Vinaigrette', dureeVieJours: 7, congelable: false },
      { id: 'c', nom: 'Purée', statut: 'archivée', dureeVieJours: 2 },
      { id: 'd', nom: 'Sauce sans durée' },
      { id: 'e', nom: 'Crème sans durée' },
    ],
    etiquettesPerso: [{ id: 'p', nom: 'Pain maison', dureeVieJours: 2, dureeVieDecongeleJours: 1, dureeVieCongeleJours: 30 }],
  });
  assert.deepEqual(d.dlc.lignes, [
    { nom: 'Fond de veau', source: 'Fiche recette', frais: 5, congele: 90, decongele: 2 },
    { nom: 'Pain maison', source: 'Étiquette maison', frais: 2, congele: 30, decongele: 1 },
    { nom: 'Vinaigrette', source: 'Fiche recette', frais: 7, congele: null, decongele: null },
  ]);
  assert.equal(d.dlc.parDefaut, 2);
});

test('page de garde : établissement, période, date d\'édition, sommaire', () => {
  const d = base({ releves: [rel('2026-11-18', '07:00', 'z1', 3, true)] });
  assert.equal(d.etablissement, 'Hôtel Panorama');
  assert.equal(d.periode.label, 'Du 21.08.2026 au 18.11.2026');
  assert.equal(d.periode.jours, 90);
  assert.equal(d.editeLe, '18.11.2026');
  assert.equal(d.heureEdition, '14:32');
  assert.deepEqual(d.sections.map(s => s.id), ['releves', 'actions', 'a_fournir']);
  assert.equal(d.sections[0].resume, '1 relevé, 0 hors plage');
});

test('aucun article de loi, aucun tiret long dans les textes du dossier', () => {
  const d = base({ releves: [rel('2026-11-18', '07:00', 'z1', 6.5, false)], controles: [ctl(TODAY, '08:00', 't1')] });
  const tout = JSON.stringify(d);
  assert.doesNotMatch(tout, /\bart\.|\barticle\b|ODAlOUs|RS \d/i);
  assert.doesNotMatch(tout, /[\u2014\u2013\u00B7]/);
});

test('nom du fichier sans accent ni espace', () => {
  assert.equal(nomFichierDossier('Hôtel Panorama', '2026-08-21', TODAY), 'dossier-controle-hotel-panorama-2026-08-21-2026-11-18.pdf');
  assert.equal(nomFichierDossier('', 'a', 'b'), 'dossier-controle-etablissement-a-b.pdf');
});
