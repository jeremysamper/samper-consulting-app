// node --test : chiffres de la grille du Planning (grillePlanning.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heuresDues, heuresParJour, nombreAPourvoir, servicesAPourvoir, teinteHeures } from './grillePlanning.js';

const proche = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} au lieu de ${b}`);
const horaire = (id, userId, date, debut, fin, extra = {}) => ({ id, userId, date, debut, fin, pause: 0, ...extra });
const dates = ['2026-11-23', '2026-11-24', '2026-11-25'];

test('à pourvoir : horaire d\'une personne absente (acceptée) et horaire proposé à l\'échange', () => {
  const shifts = [
    horaire('s1', 'u1', '2026-11-23', '18:00', '23:00'),
    horaire('s0', 'u1', '2026-11-23', '09:00', '14:00'),
    horaire('s2', 'u2', '2026-11-24', '09:00', '14:00'),
    horaire('s3', 'u3', '2026-11-24', '09:00', '14:00'),
    horaire('s4', 'u4', '2026-11-25', '09:00', '14:00'),
    horaire('s5', 'u5', '2026-11-30', '09:00', '14:00'),
  ];
  const absences = [
    { userId: 'u1', dateDebut: '2026-11-23', dateFin: '2026-11-23', statut: 'acceptee' },
    { userId: 'u4', dateDebut: '2026-11-25', dateFin: '2026-11-25', statut: 'demande' },
    { userId: 'u5', dateDebut: '2026-11-30', dateFin: '2026-11-30', statut: 'acceptee' },
  ];
  const echanges = [
    { id: 'e1', shift_id: 's2', statut: 'propose' },
    { id: 'e2', shift_id: 's3', statut: 'repris', repreneur: 'u9' },
  ];
  const r = servicesAPourvoir({ shifts, absences, echanges, dates });
  assert.deepEqual(r['2026-11-23'].map((x) => [x.shift.id, x.raison]), [['s0', 'absence'], ['s1', 'absence']], 'triés par heure');
  assert.deepEqual(r['2026-11-24'].map((x) => [x.shift.id, x.raison, x.echangeId]), [['s2', 'echange', 'e1']], 'un échange repris n\'est plus à pourvoir');
  assert.deepEqual(r['2026-11-25'], [], 'une demande en attente ne libère pas le service');
  assert.equal(r['2026-11-30'], undefined, 'hors des jours affichés');
  assert.equal(nombreAPourvoir(r), 3);
});

test('à pourvoir : une absence passe avant l\'échange, un horaire vide est ignoré', () => {
  const shifts = [horaire('s1', 'u1', '2026-11-23', '09:00', '14:00'), horaire('s2', 'u2', '2026-11-23', '00:00', '00:00')];
  const r = servicesAPourvoir({
    shifts,
    absences: [{ userId: 'u1', dateDebut: '2026-11-20', dateFin: '2026-11-30' }],
    echanges: [{ id: 'e1', shift_id: 's1', statut: 'propose' }],
    dates,
  });
  assert.deepEqual(r['2026-11-23'].map((x) => x.raison), ['absence']);
});

test('total du jour : lignes affichées seulement, pause déduite, coupure additionnée', () => {
  const shifts = [
    horaire('a', 'u1', '2026-11-23', '09:00', '14:00', { pause: 30 }),
    horaire('b', 'u1', '2026-11-23', '18:00', '22:00'),
    horaire('c', 'u2', '2026-11-23', '10:00', '15:00'),
    horaire('d', 'u3', '2026-11-24', '10:00', '12:00'),
  ];
  const tous = heuresParJour({ shifts, dates });
  proche(tous['2026-11-23'], 4.5 + 4 + 5);
  proche(tous['2026-11-24'], 2);
  assert.equal(tous['2026-11-25'], 0);
  const filtre = heuresParJour({ shifts, dates, userIds: new Set(['u1']) });
  proche(filtre['2026-11-23'], 8.5);
  assert.equal(filtre['2026-11-24'], 0);
});

test('heures dues : contrat (taux, jours d\'absence créditée déduits), sinon CCNT, sinon rien', () => {
  const contrats = [{ profileId: 'u1', taux: 50, heuresSemaine: 42, debut: '2026-01-01', fin: null }];
  const semaine = { debut: '2026-11-23', fin: '2026-11-29' };
  const r = heuresDues({ userId: 'u1', ...semaine, contrats, heuresSemaineEtab: 42 });
  assert.equal(r.base, 'contrat');
  proche(r.heures, 21);
  const avecConge = heuresDues({
    userId: 'u1', ...semaine, contrats, heuresSemaineEtab: 42,
    absences: [
      { userId: 'u1', motif: 'vacances', dateDebut: '2026-11-23', dateFin: '2026-11-23', statut: 'acceptee' },
      { userId: 'u1', motif: 'vacances', dateDebut: '2026-11-24', dateFin: '2026-11-24', statut: 'demande' },
    ],
  });
  proche(avecConge.heures, 21 * 6 / 7);
  const ccnt = heuresDues({ userId: 'u2', debut: '2026-11-23', fin: '2026-12-06', contrats, heuresSemaineEtab: 42 });
  assert.deepEqual(ccnt, { heures: 84, base: 'ccnt' });
  assert.equal(heuresDues({ userId: 'u2', ...semaine, contrats, heuresSemaineEtab: null }), null);
});

test('teinte du total : sous 80 %, jusqu\'à 100 %, au-delà', () => {
  assert.equal(teinteHeures(0, 42), 'var(--text2)');
  assert.equal(teinteHeures(30, 42), 'var(--text2)');
  assert.equal(teinteHeures(42, 42), 'var(--lien)');
  assert.equal(teinteHeures(43, 42), 'var(--warning-text)');
  assert.equal(teinteHeures(10, null), 'var(--text2)');
});
