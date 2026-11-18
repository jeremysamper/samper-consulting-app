// node --test : heures pointées retenues selon les règles du pointage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bornesRetenues, heuresPointees } from './pointageRegles.js';
import { heuresFaites } from './soldesHeures.js';
import { DEFAUTS, retenirReglesPointage } from '../../utils/reglagesMaison.js';

const s = (pointageDebut, pointageFin, debut = '08:00', pause = 0, etablissementId = 'e-test') => ({ debut, fin: '16:00', pause, pointageDebut, pointageFin, etablissementId });

test('défauts : le calcul d\'avant, à la minute', () => {
  assert.equal(heuresPointees(s('07:52', '16:07', '08:00', 30), DEFAUTS.pointage), 7.75);
  assert.equal(heuresPointees(s('07:52', null), DEFAUTS.pointage), null);
});

test('arrivée en avance comptée dès l\'heure prévue, un retard reste', () => {
  const r = { arrondiMin: 0, avance: 'prevue' };
  assert.deepEqual(bornesRetenues(s('07:52', '16:00'), r), { debut: '08:00', fin: '16:00' });
  assert.deepEqual(bornesRetenues(s('08:09', '16:00'), r), { debut: '08:09', fin: '16:00' });
  // Une « avance » de plus de 6 h n'en est pas une.
  assert.deepEqual(bornesRetenues(s('01:00', '09:00', '22:00'), r), { debut: '01:00', fin: '09:00' });
});

test('arrondi au plus proche, dans les deux sens', () => {
  const r = { arrondiMin: 15, avance: 'pointee' };
  assert.deepEqual(bornesRetenues(s('07:52', '16:07'), r), { debut: '07:45', fin: '16:00' });
  assert.deepEqual(bornesRetenues(s('07:53', '16:08'), r), { debut: '08:00', fin: '16:15' });
  assert.deepEqual(bornesRetenues(s('23:53', '02:08', '23:00'), r), { debut: '00:00', fin: '02:15' });
  assert.equal(heuresPointees(s('07:52', '16:07', '08:00', 30), { arrondiMin: 15, avance: 'prevue' }), 7.5);
});

test('les règles retenues pour l\'établissement s\'appliquent partout, les autres gardent les défauts', () => {
  retenirReglesPointage('e-regle', { arrondiMin: 15, avance: 'prevue' });
  const shifts = [s('07:52', '16:07', '08:00', 30, 'e-regle'), s('07:52', '16:07', '08:00', 30, 'e-autre')];
  assert.equal(heuresPointees(shifts[0]), 7.5);
  assert.equal(heuresPointees(shifts[1]), 7.75);
  assert.equal(heuresFaites(shifts), 15.25);
});
