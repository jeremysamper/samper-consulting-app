// node --test : lecture stricte des réglages d'un établissement (lot 02 du
// panel), sur un faux client. Une ligne absente n'est jamais une lecture en
// échec, et l'inverse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireReglagesEtab } from './lectureReprise.js';

// Faux client : `reponses[table]` donne { data, error } ; chaque requête est
// notée dans `appels`.
function fauxClient(reponses) {
  const appels = [];
  const client = {
    appels,
    from(table) {
      const req = { table, filtres: [] };
      appels.push(req);
      const r = () => Promise.resolve(reponses[table] || { data: null, error: null });
      const chaine = {
        select: (cols) => { req.cols = cols; return chaine; },
        eq: (c, v) => { req.filtres.push(['eq', c, v]); return chaine; },
        in: (c, v) => { req.filtres.push(['in', c, v]); return chaine; },
        maybeSingle: () => r(),
        then: (ok, ko) => r().then(ok, ko),
      };
      return chaine;
    },
  };
  return client;
}

test('trois lectures sans ligne : ok, et lignes absentes', async () => {
  const c = fauxClient({ reglages_modules: { data: [], error: null } });
  const r = await lireReglagesEtab(c, 'etab-a', { avecObjectifs: true, modules: ['pertes', 'kds'] });
  assert.deepEqual(r, { ok: true, fermetures: null, pointage: null, objectifs: null, modules: { pertes: null, kds: null } });
  assert.deepEqual(c.appels.map((a) => a.table), ['reglages_maison', 'objectifs_maison', 'reglages_modules']);
  assert.ok(c.appels.every((a) => a.filtres.some(([, col, v]) => col === 'etablissement_id' && v === 'etab-a')));
});

test('une des requêtes en erreur : ok faux pour tout l\'établissement', async () => {
  for (const table of ['reglages_maison', 'objectifs_maison', 'reglages_modules']) {
    const c = fauxClient({
      reglages_maison: { data: { fermetures: { jours_fermes: [1] }, pointage: null }, error: null },
      reglages_modules: { data: [{ module: 'pertes', config: { motifs: ['Casse'] } }], error: null },
      [table]: { data: null, error: { code: 'XX000', message: 'panne' } },
    });
    const r = await lireReglagesEtab(c, 'etab-a', { avecObjectifs: true, modules: ['pertes'] });
    assert.deepEqual(r, { ok: false }, table);
  }
});

test('avecObjectifs faux : aucune requête sur objectifs_maison ; lignes rendues brutes', async () => {
  const c = fauxClient({
    reglages_maison: { data: { fermetures: { jours_fermes: [1] }, pointage: { arrondi_min: 5 } }, error: null },
    reglages_modules: { data: [{ module: 'pertes', config: { motifs: ['Casse'] } }, { module: 'mep', config: { postes: ['x'] } }], error: null },
  });
  const r = await lireReglagesEtab(c, 'etab-a', { avecObjectifs: false, modules: ['pertes', 'kds'] });
  assert.ok(!c.appels.some((a) => a.table === 'objectifs_maison'));
  assert.deepEqual(r, {
    ok: true, fermetures: { jours_fermes: [1] }, pointage: { arrondi_min: 5 }, objectifs: null,
    modules: { pertes: { motifs: ['Casse'] }, kds: null },
  });
});

test('sans client ou sans établissement : ok faux', async () => {
  assert.deepEqual(await lireReglagesEtab(null, 'etab-a'), { ok: false });
  assert.deepEqual(await lireReglagesEtab(fauxClient({}), null), { ok: false });
});
