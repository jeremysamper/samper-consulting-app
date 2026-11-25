// node --test : lecture des ventes de la Caisse native (ventesCaisse.js), faux client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireVentesCaisse } from './ventesCaisse.js';

// Faux client : chaque table rend ses pages dans l'ordre ; une page peut être une erreur.
function fauxClient(pages) {
  const appels = [];
  const compte = {};
  return {
    appels,
    from(table) {
      const req = { table, select: null, filtres: [] };
      appels.push(req);
      const b = {
        select(s) { req.select = s; return b; },
        eq(c, v) { req.filtres.push(['eq', c, v]); return b; },
        not(c, o, v) { req.filtres.push(['not', c, o, v]); return b; },
        gte(c, v) { req.filtres.push(['gte', c, v]); return b; },
        lte(c, v) { req.filtres.push(['lte', c, v]); return b; },
        order(c) { req.filtres.push(['order', c]); return b; },
        range(de, a) {
          req.range = [de, a];
          const i = compte[table] || 0;
          compte[table] = i + 1;
          const p = (pages[table] || [])[i];
          return Promise.resolve(p && p.error ? { data: null, error: p.error } : { data: p || [], error: null });
        },
      };
      return b;
    },
  };
}

const ligne = (n, jour = '2026-11-20') => ({ id: `l${n}`, plat_id: 'A', quantite: 1, caisse_tickets: { jour_exploitation: jour } });
const page = (n, base = 0) => Array.from({ length: n }, (_, i) => ligne(base + i));

test('une seconde page en erreur fait échouer toute la lecture', async () => {
  const c = fauxClient({ caisse_lignes: [page(1000), { error: { message: 'boom' } }] });
  const r = await lireVentesCaisse(c, 'etab-1', '2026-11-11', '2026-11-24');
  assert.equal(r.data, null);
  assert.deepEqual(r.error, { message: 'boom' });
  assert.ok(!c.appels.some((a) => a.table === 'plats' || a.table === 'recettes'));
});

test('deux pages réussies rendent toutes les lignes', async () => {
  const c = fauxClient({
    caisse_lignes: [page(1000), page(5, 1000)],
    plats: [[{ id: 'A', nom: 'Plat A', plat_recettes: [{ recette_id: 'r1' }] }]],
    recettes: [[{ id: 'r1', nom: 'Fiche 1' }]],
  });
  const r = await lireVentesCaisse(c, 'etab-1', '2026-11-11', '2026-11-24');
  assert.equal(r.error, null);
  assert.equal(r.data.lignes.length, 1005);
  assert.deepEqual(r.data.lignes[0], { jour: '2026-11-20', platId: 'A', qty: 1 });
  assert.deepEqual(r.data.plats, [{ id: 'A', nom: 'Plat A', recetteIds: ['r1'] }]);
  assert.deepEqual(r.data.recettes, [{ id: 'r1', nom: 'Fiche 1' }]);
});

test('zéro ligne : ni plats ni fiches lus', async () => {
  const c = fauxClient({ caisse_lignes: [[]] });
  const r = await lireVentesCaisse(c, 'etab-1', '2026-11-11', '2026-11-24');
  assert.deepEqual(r, { data: { lignes: [], plats: [], recettes: [] }, error: null });
  assert.deepEqual(c.appels.map((a) => a.table), ['caisse_lignes']);
});

test('sélection et filtres des lignes de caisse', async () => {
  const c = fauxClient({ caisse_lignes: [[ligne(1), { id: 'l2', plat_id: 'A', quantite: 2, caisse_tickets: null }]], plats: [[]], recettes: [[]] });
  const r = await lireVentesCaisse(c, 'etab-1', '2026-11-11', '2026-11-24');
  const l = c.appels.find((a) => a.table === 'caisse_lignes');
  assert.equal(l.select, 'id, plat_id, quantite, caisse_tickets!inner(jour_exploitation)');
  assert.deepEqual(l.filtres, [
    ['eq', 'caisse_tickets.etablissement_id', 'etab-1'],
    ['eq', 'caisse_tickets.test', false],
    ['not', 'caisse_tickets.numero', 'is', null],
    ['eq', 'caisse_tickets.statut', 'encaisse'],
    ['gte', 'caisse_tickets.jour_exploitation', '2026-11-11'],
    ['lte', 'caisse_tickets.jour_exploitation', '2026-11-24'],
    ['order', 'id'],
  ]);
  assert.equal(r.data.lignes.length, 1);
  assert.equal(c.appels.find((a) => a.table === 'plats').select, 'id, nom, plat_recettes(recette_id)');
});
