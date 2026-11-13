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

test('le raccourci des achats ouvre sa première vue, chaque vue a ses mesures du catalogue', async () => {
  const { RACCOURCIS, demandeRaccourci } = await import('./raccourcisStatistiques.js');
  const { MESURES } = await import('./catalogueMesures.js');
  const d = demandeRaccourci('achats');
  assert.equal(d.raccourci, 'achats');
  assert.equal(d.vue, 'depenses');
  assert.equal(d.periode, 'douze_mois');
  for (const v of RACCOURCIS.achats.vues) {
    for (const g of v.graphiques) for (const id of g.mesures) assert.ok(MESURES.some((m) => m.id === id), `${v.id} : ${id}`);
  }
  assert.equal(demandeRaccourci('achats', 'prix').vue, 'prix');
  assert.equal(demandeRaccourci('inconnu'), null);
});

test('le filtre de périmètre des achats calcule comme les Analyses des dépenses', async () => {
  const { familleAchats } = await import('./familles/achats.js');
  const { depensesParMois, trierDocuments } = await import('../factures-achats/analysesAchats.js');
  const docs = Array.from({ length: 30 }, (_, i) => ({
    id: `d${i}`, typeDocument: 'facture', dateDocument: `2026-${String(1 + (i % 10)).padStart(2, '0')}-15`, totalHT: 100 + i, perimetre: i % 3 === 0 ? 'Bar' : '',
  }));
  const tranche = [{ debut: '2025-12-01', fin: '2026-11-30', complet: true }];
  for (const perimetre of ['', 'Bar', 'Général']) {
    const p = familleAchats.calculer({ docs, catalogue: [] }, tranche, { filtres: { perimetre } })[0];
    const attendu = depensesParMois(trierDocuments(docs, perimetre).factures, '2026-11-13').total.montant;
    assert.ok(attendu > 0, 'attendu non nul : ' + (perimetre || 'tous'));
    assert.equal(Math.round(p.valeur * 100), Math.round(attendu * 100), perimetre || 'tous');
  }
});

test('un périmètre enregistré qui n\'existe plus retombe sur « Tous » et le calcul trace tout', async () => {
  const { filtresEffectifs } = await import('./vueStatistiques.js');
  const { familleAchats } = await import('./familles/achats.js');
  assert.deepEqual(filtresEffectifs({ perimetre: 'Cave' }, ['Bar', 'Général'], true), {});
  assert.deepEqual(filtresEffectifs({ perimetre: 'Bar' }, ['Bar', 'Général'], true), { perimetre: 'Bar' });
  // Avant la lecture, la liste est vide : rien n'est retiré.
  assert.deepEqual(filtresEffectifs({ perimetre: 'Cave' }, [], false), { perimetre: 'Cave' });
  const docs = [{ id: 'a', typeDocument: 'facture', dateDocument: '2026-11-02', totalHT: 120, perimetre: 'Bar' }, { id: 'b', typeDocument: 'facture', dateDocument: '2026-11-03', totalHT: 80, perimetre: '' }];
  const tranche = [{ debut: '2026-11-01', fin: '2026-11-30', complet: true }];
  const filtres = filtresEffectifs({ perimetre: 'Cave' }, ['Bar', 'Général'], true);
  assert.equal(familleAchats.calculer({ docs, catalogue: [] }, tranche, { filtres })[0].valeur, 200);
});

test('chaque famille à raccourci a sa garde d\'écran et son raccourci', async () => {
  const { RACCOURCIS } = await import('./raccourcisStatistiques.js');
  for (const f of FAMILLES_A_RACCOURCI) {
    assert.equal(typeof GARDES_ECRANS[f], 'function', f);
    assert.ok(Object.values(RACCOURCIS).some((r) => r.famille === f), f);
  }
});

test('présentation dense : la vue garde ses lignes visibles, sans doublon, et le lien les porte', async () => {
  const { nettoyerVue, vueDepuisLien, MAX_CHIFFRES } = await import('./vueStatistiques.js');
  const visibles = [{ id: 'a', unite: 'chf', famille: 'f' }, { id: 'b', unite: 'pct', famille: 'f' }];
  const v = nettoyerVue({ periode: { id: 'mois' }, pas: 'jour', comparaison: '', graphiques: [{ mesures: ['a'] }], chiffres: ['b', 'x', 'a', 'b'] }, visibles, AUJ);
  assert.deepEqual(v.chiffres, ['b', 'a']);
  const l = vueDepuisLien({ famille: 'f', periode: 'mois', graphiques: [{ mesures: ['a'] }], chiffres: ['a', 'b'] }, visibles, AUJ);
  assert.deepEqual(l.chiffres, ['a', 'b']);
  assert.ok(MAX_CHIFFRES >= 9);
});

test('chaque raccourci ne nomme que des mesures du catalogue, graphiques et lignes', async () => {
  const { RACCOURCIS } = await import('./raccourcisStatistiques.js');
  const { MESURES } = await import('./catalogueMesures.js');
  for (const [id, r] of Object.entries(RACCOURCIS)) {
    for (const v of r.vues) {
      const ids = [...v.graphiques.flatMap((g) => g.mesures), ...(v.chiffres || [])];
      for (const m of ids) assert.ok(MESURES.some((x) => x.id === m && x.famille === r.famille), `${id}/${v.id} : ${m}`);
    }
  }
});

test('la vue d\'ensemble part sur la période du module', async () => {
  const { demandeRaccourci } = await import('./raccourcisStatistiques.js');
  assert.equal(demandeRaccourci('comptabilite').periode, 'mois');
  assert.equal(demandeRaccourci('comptabilite', null, 'trimestre').periode, 'trimestre');
  assert.deepEqual(demandeRaccourci('comptabilite', null, { id: 'libre', debut: '2026-09-01', fin: '2026-09-30' }).periode, { id: 'libre', debut: '2026-09-01', fin: '2026-09-30' });
  assert.equal(demandeRaccourci('comptabilite').chiffres.length, 9);
});
