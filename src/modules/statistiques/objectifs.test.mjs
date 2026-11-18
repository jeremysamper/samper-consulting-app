// node --test : objectifs de la maison dans Statistiques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { objectifsDe, verdictObjectif } from './objectifs.js';

test('seuls les objectifs réglés sortent ; le chiffre mensuel ne se trace qu\'au mois', () => {
  assert.deepEqual(objectifsDe({ matierePct: null, personnelPct: null, caMensuelHt: null }, 'jour'), {});
  const jour = objectifsDe({ matierePct: 28, personnelPct: null, caMensuelHt: 90000 }, 'jour');
  assert.deepEqual(Object.keys(jour).sort(), ['comptabilite.ca_ht', 'comptabilite.matiere_pct']);
  assert.equal(jour['comptabilite.ca_ht'].trace, false);
  assert.equal(objectifsDe({ caMensuelHt: 90000 }, 'mois')['comptabilite.ca_ht'].trace, true);
  assert.equal(jour['comptabilite.matiere_pct'].trace, true);
});

test('verdict : un coût sous l\'objectif est atteint, le chiffre mensuel n\'a pas de verdict', () => {
  const o = objectifsDe({ matierePct: 28, caMensuelHt: 90000 }, 'mois');
  assert.equal(verdictObjectif(27.4, o['comptabilite.matiere_pct']), 'atteint');
  assert.equal(verdictObjectif(28, o['comptabilite.matiere_pct']), 'atteint');
  assert.equal(verdictObjectif(31.2, o['comptabilite.matiere_pct']), 'manque');
  assert.equal(verdictObjectif(null, o['comptabilite.matiere_pct']), null);
  assert.equal(verdictObjectif(120000, o['comptabilite.ca_ht']), null);
});
