// Essais du rangement des bons du passe (bons.js), dérivés de la règle
// demandée par Jérémy le 2026-11-11 :
//   - un bon par table, avec toutes ses suites dans l'ordre (En direct,
//     À suivre, À suivre 2), chacune distincte ;
//   - le direct validé, le bon reste mais va à la fin ;
//   - il revient dans la file quand la suite est réclamée.
// Les bons KDS simulés suivent ce que fait la base (caisse_bon_interne, v6) :
// un bon neuf par envoi ou réclamation, les plats tenus suivent le dernier bon.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  construireBons, rangerBons, lignesALire, cleDuBon, RANG_TENU,
  POSTE_TOUS, postesEnService, posteParPlat, filtrerParPoste, recapitulatif,
} from './bons.js';

const T1 = '11111111-1111-4111-8111-111111111111';
const L = (n) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;

const plat = (n, nom, extra = {}) => ({
  id: `item-${n}`, lineKey: `caisse:${L(n)}`, nom, qty: 1, modifiers: [],
  firedAt: '2026-11-11T11:00:00Z', active: true, aSuivre: false,
  bumpStatus: 'pending', bumpedAt: null, ...extra,
});
const bonCaisse = (id, suite, heure, items, extra = {}) => ({
  id, lsCheckUuid: `caisse:${T1}:${suite}:abcdef`, tableNo: 'T12', couverts: null,
  openedAt: heure, status: 'open', completedAt: null, items, ...extra,
});
const lignes = new Map([
  [L(1), { suite: 1, ordre: '2026-11-11T10:59:01Z' }],
  [L(2), { suite: 1, ordre: '2026-11-11T10:59:02Z' }],
  [L(3), { suite: 2, ordre: '2026-11-11T10:59:03Z' }],
  [L(4), { suite: 3, ordre: '2026-11-11T10:59:04Z' }],
]);

// Envoi du direct : le direct est à faire, les deux suites sont tenues.
const envoi = () => [bonCaisse('A', 1, '2026-11-11T11:00:00Z', [
  plat(1, 'Tartare'), plat(2, 'Salade'),
  plat(3, 'Entrecôte', { aSuivre: true }), plat(4, 'Moelleux', { aSuivre: true }),
])];

test('les trois suites sont trois sections distinctes, dans l\'ordre', () => {
  const [bon, ...autres] = construireBons(envoi(), lignes);
  assert.equal(autres.length, 0);
  assert.deepEqual(bon.sections.map((s) => [s.suite, s.etat]), [[1, 'faire'], [2, 'attente'], [3, 'attente']]);
  assert.equal(bon.etat, 'faire');
  assert.equal(bon.reclame, false);
  assert.equal(bon.tableNo, 'T12');
});

test('direct validé : le bon passe en attente et se range à la fin', () => {
  const orders = envoi();
  orders[0].items[0] = { ...orders[0].items[0], bumpStatus: 'bumped', bumpedAt: '2026-11-11T11:08:00Z' };
  orders[0].items[1] = { ...orders[0].items[1], bumpStatus: 'bumped', bumpedAt: '2026-11-11T11:09:00Z' };
  const autre = { id: 'Z', lsCheckUuid: 'ls-check-9', tableNo: '4', couverts: 2, openedAt: '2026-11-11T11:05:00Z', status: 'open', completedAt: null,
    items: [{ id: 'z1', lineKey: 'ls:1', nom: 'Burger', qty: 1, modifiers: [], firedAt: null, active: true, aSuivre: false, bumpStatus: 'pending' }] };
  const bons = construireBons([...orders, autre], lignes);
  const { file, fin, terminees } = rangerBons(bons, { maintenant: Date.parse('2026-11-11T11:10:00Z') });
  assert.deepEqual(file.map((b) => b.cle), ['bon:Z']);
  assert.deepEqual(fin.map((b) => [b.cle, b.etat]), [[`caisse:${T1}`, 'attente']]);
  assert.equal(terminees.length, 0);
});

test('un bon tout juste validé garde sa place le temps du délai', () => {
  const orders = envoi();
  orders[0].items[0] = { ...orders[0].items[0], bumpStatus: 'bumped' };
  orders[0].items[1] = { ...orders[0].items[1], bumpStatus: 'bumped' };
  const bons = construireBons(orders, lignes);
  const maintenant = 1000;
  const figes = new Map([[`caisse:${T1}`, { jusqua: 2000, depuis: 5 }]]);
  const pendant = rangerBons(bons, { figes, maintenant });
  assert.equal(pendant.file.length, 1);
  assert.equal(pendant.file[0].sortant, true);
  const apres = rangerBons(bons, { figes, maintenant: 2500 });
  assert.equal(apres.file.length, 0);
  assert.equal(apres.fin.length, 1);
});

test('réclamation : le bon revient dans la file, un seul bon pour la table', () => {
  // La base crée le bon B, y met la suite réclamée (à faire) et y déplace la
  // suite encore tenue. Le bon A garde le direct, fait.
  const A = bonCaisse('A', 1, '2026-11-11T11:00:00Z', [
    plat(1, 'Tartare', { bumpStatus: 'bumped', bumpedAt: '2026-11-11T11:08:00Z' }),
    plat(2, 'Salade', { bumpStatus: 'bumped', bumpedAt: '2026-11-11T11:09:00Z' }),
  ]);
  const B = bonCaisse('B', 2, '2026-11-11T11:30:00Z', [
    plat(3, 'Entrecôte', { firedAt: '2026-11-11T11:30:00Z' }),
    plat(4, 'Moelleux', { aSuivre: true, firedAt: '2026-11-11T11:00:00Z' }),
  ]);
  const bons = construireBons([A, B], lignes);
  assert.equal(bons.length, 1);
  const bon = bons[0];
  assert.equal(bon.etat, 'faire');
  assert.equal(bon.reclame, true);
  assert.deepEqual(bon.sections.map((s) => [s.suite, s.etat]), [[1, 'fait'], [2, 'faire'], [3, 'attente']]);
  // Le chrono repart de la réclamation, pas de l'arrivée de la table.
  assert.equal(bon.depuis, Date.parse('2026-11-11T11:30:00Z'));
  assert.equal(rangerBons(bons).file.length, 1);
});

test('bon A terminé à l\'ancienne, puis réclamation : le bon redevient vivant', () => {
  const A = bonCaisse('A', 1, '2026-11-11T11:00:00Z', [plat(1, 'Tartare')], { completedAt: '2026-11-11T11:10:00Z' });
  assert.equal(construireBons([A], lignes)[0].etat, 'termine');
  const B = bonCaisse('B', 2, '2026-11-11T11:30:00Z', [plat(3, 'Entrecôte')]);
  const bon = construireBons([A, B], lignes)[0];
  assert.equal(bon.etat, 'faire');
  // Le plat du bon terminé ne redevient pas à faire.
  assert.equal(bon.sections[0].plats[0].etat, 'fait');
  assert.equal(bon.nbAFaire, 1);
});

test('ticket encaissé avec une suite jamais réclamée : plus rien à attendre', () => {
  const orders = envoi();
  orders[0].items = orders[0].items.map((i) => (i.aSuivre
    ? { ...i, active: false, aSuivre: false }
    : { ...i, bumpStatus: 'bumped', bumpedAt: '2026-11-11T11:08:00Z' }));
  const bon = construireBons(orders, lignes)[0];
  assert.equal(bon.etat, 'pret');
  assert.equal(rangerBons([bon]).fin.length, 1);
});

test('sans les lignes de caisse : repli sur la suite du bon et un « À suivre » sans numéro', () => {
  const bon = construireBons(envoi(), new Map())[0];
  assert.deepEqual(bon.sections.map((s) => [s.rang, s.suite, s.etat]), [[1, 1, 'faire'], [RANG_TENU, null, 'attente']]);
});

test('bon Lightspeed : seul, plat tenu par la cuisine rangé à part', () => {
  const o = { id: 'X', lsCheckUuid: 'check-uuid-1', tableNo: '7', couverts: 4, openedAt: '2026-11-11T11:00:00Z', status: 'open', completedAt: null,
    items: [
      { id: 'x1', lineKey: 'k1', nom: 'Soupe', qty: 2, modifiers: [], firedAt: null, active: true, aSuivre: false, bumpStatus: 'pending' },
      { id: 'x2', lineKey: 'k2', nom: 'Filet', qty: 2, modifiers: [], firedAt: null, active: true, aSuivre: true, bumpStatus: 'pending' },
    ] };
  assert.equal(cleDuBon(o).caisse, false);
  const bon = construireBons([o], lignes)[0];
  assert.deepEqual(bon.sections.map((s) => [s.rang, s.etat]), [[0, 'faire'], [RANG_TENU, 'attente']]);
  assert.equal(bon.depuis, Date.parse('2026-11-11T11:00:00Z'));
  assert.deepEqual(lignesALire([o]), []);
});

test('lignes à lire : celles des tickets encore au passe seulement', () => {
  const vivant = envoi();
  const T2 = '22222222-2222-4222-8222-222222222222';
  const fini = { id: 'F', lsCheckUuid: `caisse:${T2}:1:xyz`, tableNo: 'T3', openedAt: '2026-11-11T09:00:00Z', status: 'open', completedAt: '2026-11-11T09:30:00Z',
    items: [plat(9, 'Café')] };
  assert.deepEqual(lignesALire([...vivant, fini]).sort(), [L(1), L(2), L(3), L(4)].sort());
});

test('terminées : fenêtre de temps et plus récentes d\'abord', () => {
  const mk = (id, fin) => ({ id, lsCheckUuid: `chk-${id}`, tableNo: id, openedAt: fin, status: 'open', completedAt: fin, items: [] });
  const bons = construireBons([mk('a', '2026-11-11T08:00:00Z'), mk('b', '2026-11-11T10:00:00Z'), mk('c', '2026-11-09T10:00:00Z')], lignes);
  const { terminees } = rangerBons(bons, { maintenant: Date.parse('2026-11-11T12:00:00Z') });
  assert.deepEqual(terminees.map((b) => b.tableNo), ['b', 'a']);
});

// ── Lot L4 (22.11.2026) : récap de la passe et onglets de poste ──
// Une table au froid et au chaud, une autre au chaud seulement, et un bon
// Lightspeed dont les plats n'ont pas de poste.
const T2 = '22222222-2222-4222-8222-222222222222';
const lignesPostes = new Map([
  [L(1), { suite: 1, ordre: '2026-11-11T10:59:01Z', platId: 'p-tartare' }],
  [L(2), { suite: 1, ordre: '2026-11-11T10:59:02Z', platId: 'p-salade' }],
  [L(3), { suite: 2, ordre: '2026-11-11T10:59:03Z', platId: 'p-entrecote' }],
  [L(4), { suite: 3, ordre: '2026-11-11T10:59:04Z', platId: 'p-moelleux' }],
  [L(5), { suite: 1, ordre: '2026-11-11T11:01:00Z', platId: 'p-entrecote' }],
  [L(6), { suite: 1, ordre: '2026-11-11T11:01:01Z', platId: null }],
]);
const postesTest = new Map([
  ['p-tartare', 'froid'], ['p-salade', 'froid'], ['p-entrecote', 'chaud'], ['p-moelleux', 'patisserie'],
]);
const passe = () => [
  ...envoi(),
  { ...bonCaisse('B', 1, '2026-11-11T11:01:00Z', [
    plat(5, 'Entrecôte', { qty: 2, modifiers: [{ name: 'saignant', quantity: 1 }] }),
    plat(6, 'Pain maison'),
  ]), lsCheckUuid: `caisse:${T2}:1:abcdef`, tableNo: 'T4' },
  { id: 'LS', lsCheckUuid: 'ls-check-1', tableNo: '21', couverts: 2, openedAt: '2026-11-11T11:02:00Z', status: 'open', completedAt: null,
    items: [{ id: 'ls1', lineKey: 'ls:1', nom: 'Fondue', qty: 2, modifiers: [], firedAt: null, active: true, aSuivre: false, bumpStatus: 'pending' }] },
];

test('récap : chaque plat compté sur tous les bons, à faire et tenu à part', () => {
  const { direct, aSuivre } = recapitulatif(construireBons(passe(), lignesPostes, postesTest));
  // Entrecôte : 2 à faire à la table T4, 1 tenue à la table T12. Les
  // précisions de cuisson ne séparent pas les plats.
  assert.deepEqual(direct.map((x) => [x.nom, x.qte]), [
    ['Entrecôte', 2], ['Fondue', 2], ['Pain maison', 1], ['Salade', 1], ['Tartare', 1],
  ]);
  assert.deepEqual(aSuivre.map((x) => [x.nom, x.qte]), [['Entrecôte', 1], ['Moelleux', 1]]);
});

test('récap : un plat fait ou annulé ne compte plus, une quantité absente vaut 1', () => {
  const orders = envoi();
  orders[0].items[0] = { ...orders[0].items[0], bumpStatus: 'bumped' };
  orders[0].items[1] = { ...orders[0].items[1], qty: null };
  orders[0].items[3] = { ...orders[0].items[3], active: false, aSuivre: false };
  const { direct, aSuivre } = recapitulatif(construireBons(orders, lignes));
  assert.deepEqual(direct.map((x) => [x.nom, x.qte]), [['Salade', 1]]);
  assert.deepEqual(aSuivre.map((x) => [x.nom, x.qte]), [['Entrecôte', 1]]);
  assert.deepEqual(recapitulatif([]), { direct: [], aSuivre: [] });
});

test('postes en service : ceux d\'au moins une catégorie, dans l\'ordre des onglets', () => {
  assert.deepEqual(postesEnService([{ poste: 'bar' }, { poste: null }, { poste: 'chaud' }, { poste: 'chaud' }]).map((p) => p.id), ['chaud', 'bar']);
  assert.deepEqual(postesEnService([]), []);
  assert.deepEqual(postesEnService(null), []);
});

test('poste d\'un plat : la catégorie choisie, puis le nom de la catégorie de la carte', () => {
  const categories = [
    { id: 'c-ent', nom: 'Entrées', ordre: 0, poste: 'froid' },
    { id: 'c-pla', nom: 'Plats', ordre: 1, poste: 'chaud' },
    { id: 'c-des', nom: 'Desserts', ordre: 2, poste: null },
    { id: 'c-bar', nom: 'Apéritifs', ordre: 3, poste: 'bar' },
  ];
  const boutons = { 'p-spritz': { plat_id: 'p-spritz', categorie_id: 'c-bar' } };
  const plats = new Map([['p-tartare', 'Entrées'], ['p-filet', 'Plats'], ['p-tarte', 'Desserts'], ['p-spritz', 'Boissons'], ['p-pain', null]]);
  const postes = posteParPlat({ categories, boutons, plats });
  assert.equal(postes.get('p-tartare'), 'froid');
  assert.equal(postes.get('p-filet'), 'chaud');
  // Le bouton range le spritz aux Apéritifs, malgré sa catégorie Boissons.
  assert.equal(postes.get('p-spritz'), 'bar');
  // Catégorie sans poste, et plat sans catégorie (rangé dans Plats par défaut).
  assert.equal(postes.has('p-tarte'), false);
  assert.equal(postes.get('p-pain'), 'chaud');
  // Sans catégorie de la maison, celles du code servent : aucun poste.
  assert.equal(posteParPlat({ categories: [], boutons: {}, plats }).size, 0);
});

test('onglet de poste : seulement ses plats, et l\'état du bon recalculé sur eux', () => {
  const orders = passe();
  // Le froid de la table T12 est parti ; le chaud de T4 reste à faire.
  orders[0].items[0] = { ...orders[0].items[0], bumpStatus: 'bumped', bumpedAt: '2026-11-11T11:05:00Z' };
  orders[0].items[1] = { ...orders[0].items[1], bumpStatus: 'bumped', bumpedAt: '2026-11-11T11:06:00Z' };
  const bons = construireBons(orders, lignesPostes, postesTest);
  assert.equal(filtrerParPoste(bons, POSTE_TOUS), bons);
  assert.equal(filtrerParPoste(bons, null), bons);

  const froid = filtrerParPoste(bons, 'froid');
  assert.deepEqual(froid.map((b) => [b.tableNo, b.etat]), [['T12', 'pret']]);
  assert.equal(froid[0].complet.etat, 'attente');
  assert.deepEqual(froid[0].sections.flatMap((x) => x.plats).map((p) => p.nom), ['Tartare', 'Salade']);

  const chaud = filtrerParPoste(bons, 'chaud');
  assert.deepEqual(chaud.map((b) => [b.tableNo, b.etat]), [['T12', 'attente'], ['T4', 'faire']]);
  // Le pain (libellé sans plat) et la fondue Lightspeed n'ont pas de poste :
  // ils ne paraissent que dans « Tous ».
  assert.deepEqual(chaud[1].sections.flatMap((x) => x.plats).map((p) => p.nom), ['Entrecôte']);
  assert.equal(filtrerParPoste(bons, 'bar').length, 0);
  const tous = bons.flatMap((b) => b.sections.flatMap((x) => x.plats));
  assert.deepEqual(tous.filter((p) => p.poste === null).map((p) => p.nom).sort(), ['Fondue', 'Pain maison']);

  // Rangés, puis récap du poste : le chaud à faire est l'entrecôte de T4.
  const { file, fin } = rangerBons(chaud, { maintenant: Date.parse('2026-11-11T11:10:00Z') });
  assert.deepEqual(file.map((b) => b.tableNo), ['T4']);
  assert.deepEqual(fin.map((b) => b.tableNo), ['T12']);
  assert.deepEqual(recapitulatif(chaud).direct.map((x) => [x.nom, x.qte]), [['Entrecôte', 2]]);
});
