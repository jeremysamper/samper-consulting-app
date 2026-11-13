// S3 : périodes des écrans devenus raccourcis, vues préréglées à plusieurs
// graphiques, accès par raccourci.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PERIODES, bornesDe, vueDepuisLien } from './vueStatistiques.js';
import { bornesPeriode } from '../previsions/rapport/periodesRapport.js';
import { douzeMois } from '../factures-achats/analysesAchats.js';
import { FAMILLES_A_RACCOURCI, GARDES_ECRANS, peutOuvrirStatistiques } from './gardesStatistiques.js';
import { defaultPermissions } from '../moduleConfig.js';

const AUJ = '2026-11-13';

test('les périodes du rapport des réservations ont les bornes du rapport', () => {
  for (const id of ['semaine', 'semaine_prec', 'mois_prec', 'trois_mois']) {
    assert.ok(PERIODES.some((p) => p.id === id), id);
    assert.deepEqual(bornesDe({ id }, AUJ), bornesPeriode(id, AUJ), id);
  }
  // Bord d'année : la semaine dernière d'un 5 janvier.
  assert.deepEqual(bornesDe({ id: 'semaine_prec' }, '2026-01-05'), bornesPeriode('semaine_prec', '2026-01-05'));
});

test('14 jours finissent aujourd\'hui, douze mois sont ceux des analyses des dépenses', () => {
  assert.deepEqual(bornesDe({ id: '14j' }, AUJ), { debut: '2026-10-31', fin: AUJ });
  const mois = douzeMois(AUJ);
  const b = bornesDe({ id: 'douze_mois' }, AUJ);
  assert.equal(b.debut, `${mois[0]}-01`);
  assert.equal(b.fin, '2026-11-30');
  assert.equal(bornesDe({ id: 'douze_mois' }, '2026-01-31').debut, '2025-02-01');
});

test('un raccourci à plusieurs graphiques ne garde que les mesures visibles', () => {
  const visibles = [{ id: 'a', unite: 'chf', famille: 'f' }, { id: 'b', unite: 'chf', famille: 'f' }];
  const vue = vueDepuisLien({ famille: 'f', periode: 'douze_mois', pas: 'mois', comparaison: 'n1', graphiques: [{ mesures: ['a'] }, { mesures: ['x'] }, { mesures: ['b'], ventilation: '' }] }, visibles, AUJ);
  assert.equal(vue.periode.id, 'douze_mois');
  assert.equal(vue.comparaison, 'n1');
  assert.deepEqual(vue.graphiques.map((g) => g.mesures), [['a'], ['b']]);
  assert.equal(vueDepuisLien({ graphiques: [{ mesures: ['x'] }] }, visibles, AUJ), null);
});

test('accès : la clé, ou un écran d\'analyse devenu raccourci, jamais un autre', () => {
  const etab = { id: 'e', modulesActifs: null };
  for (const role of Object.keys(defaultPermissions)) {
    const droits = defaultPermissions[role];
    const attendu = droits.statistiques === true
      || FAMILLES_A_RACCOURCI.some((f) => GARDES_ECRANS[f]({ role, permissions: droits, etablissement: etab }));
    assert.equal(peutOuvrirStatistiques({ role }, droits, etab), attendu, role);
  }
  // Sans la clé et sans écran d'analyse parti : refusé.
  assert.equal(peutOuvrirStatistiques({ role: 'serveur' }, defaultPermissions.serveur, etab), false);
});
