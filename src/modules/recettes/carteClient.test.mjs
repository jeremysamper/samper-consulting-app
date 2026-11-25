// node --test : documents pour le client (carteClient.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  platsImprimables, bilanCarteClient, payloadCarteTable, payloadAllergenesCarte, prixCarte,
  MENTION_SANS_FICHE_CARTE, MENTION_SANS_FICHE_TABLEAU, MENTION_PRIX, COLONNE_AUTRES,
  nomFichierCarte, nomFichierAllergenes, dateEdition,
} from './carteClient.js';
import { allergenesDuPlat } from '../../components/fiches/rangementFiches.js';
import { ALLERGENES, labelAllergene } from '../../utils/allergenes.js';

const [g, l, o] = ALLERGENES.map((a) => a.id);
// Valeurs repères : aucune ne doit sortir dans un document.
const REPERES = ['NOTE-INTERNE-7731', 'NOTE-CONSULTANT-5512', '987.65', '41.37', '63.21', '777.77', 'DRESSAGE-9090'];
const rec = (id, allergenesIds, patch) => ({
  id, nom: `Recette ${id}`, statut: 'validée', masquee: false, allergenesIds,
  notes: 'NOTE-INTERNE-7731', notesConsultant: 'NOTE-CONSULTANT-5512', coutPortion: 987.65,
  foodCost: 41.37, margeGrossePct: 63.21, prixVente: 777.77, dressage: 'DRESSAGE-9090', ...patch,
});
const plat = (id, nom, categorie, recetteIds, patch) => ({
  id, nom, categorie, actif: true, description: `Description de ${nom}`, prixVente: 24,
  notes: 'NOTE-INTERNE-7731', recettes: recetteIds.map((r, i) => ({ recetteId: r, ordre: i, role: 'composant' })), ...patch,
});

const recettes = [rec('r1', [l, g]), rec('r2', [o]), rec('r3', [g, 'pointe de truffe']), rec('r4', [], { masquee: true })];
const plats = [
  plat('p1', 'Tarte', 'Desserts', ['r1']),
  plat('p2', 'Velouté', 'Entrées', ['r2', 'r1'], { prixVente: 14.5 }),
  plat('p3', 'Risotto', 'Plats', ['r3'], { prixVente: 0, description: '' }),
  plat('p4', 'Plat sans fiche', 'Plats', [], { prixVente: null }),
  plat('p5', 'Plat retiré', 'Plats', ['r1'], { actif: false }),
  plat('p6', 'Eau', 'Boissons', ['r4'], { prixVente: -3 }),
];

test('platsImprimables : exclut l\'inactif, respecte les catégories décochées et l\'ordre de service', () => {
  const tout = platsImprimables(plats, null);
  assert.deepEqual(tout.map(([c]) => c), ['Entrées', 'Plats', 'Desserts', 'Boissons']);
  assert.ok(!tout.flatMap(([, ps]) => ps).some((p) => p.id === 'p5'));
  assert.deepEqual(tout.find(([c]) => c === 'Plats')[1].map((p) => p.id), ['p3', 'p4']);
  const sansDesserts = platsImprimables(plats, new Set(['Entrées', 'Plats', 'Boissons']));
  assert.ok(!sansDesserts.some(([c]) => c === 'Desserts'));
  assert.deepEqual(platsImprimables(plats, []), []);
});

test('bilanCarteClient : nomme les plats sans fiche, compte les plats sans prix', () => {
  const b = bilanCarteClient(plats, recettes);
  assert.equal(b.nombre, 5);
  assert.deepEqual(b.sansFiche, ['Plat sans fiche']);
  assert.equal(b.sansPrix, 3); // 0, null, -3
});

test('prixCarte : deux décimales, vide pour nul, absent ou négatif', () => {
  assert.equal(prixCarte(46), '46.00');
  assert.equal(prixCarte(14.5), '14.50');
  assert.equal(prixCarte(1250), '1 250.00');
  assert.equal(prixCarte(null), '');
  assert.equal(prixCarte(undefined), '');
  assert.equal(prixCarte(0), '');
  assert.equal(prixCarte(-3), '');
  assert.equal(prixCarte('abc'), '');
});

test('payloadCarteTable sans prix : aucun montant, pas de mention de prix', () => {
  const p = payloadCarteTable({ carte: { nom: 'Carte' }, plats, recettesActives: recettes, avecPrix: false, jour: '2026-11-25' });
  for (const s of p.sections) for (const x of s.plats) assert.equal(x.prix, '');
  assert.ok(!p.mentions.includes(MENTION_PRIX));
  assert.ok(!JSON.stringify(p).includes('24.00'));
  const avec = payloadCarteTable({ carte: { nom: 'Carte' }, plats, recettesActives: recettes, avecPrix: true });
  assert.ok(avec.mentions.includes(MENTION_PRIX));
  assert.equal(avec.sections[0].plats[0].prix, '14.50');
});

test('payloadCarteTable : plat sans fiche porte la mention, plat sans description sans ligne', () => {
  const p = payloadCarteTable({ carte: { nom: 'Carte' }, plats, recettesActives: recettes, jour: '2026-11-25' });
  const lignes = p.sections.flatMap((s) => s.plats);
  const sansFiche = lignes.find((x) => x.nom === 'Plat sans fiche');
  assert.equal(sansFiche.allergenes, MENTION_SANS_FICHE_CARTE);
  assert.equal(lignes.find((x) => x.nom === 'Risotto').description, '');
  // Fiche sans allergène (recette cachée) : aucune ligne d'allergènes.
  assert.equal(lignes.find((x) => x.nom === 'Eau').allergenes, '');
  assert.equal(lignes.find((x) => x.nom === 'Velouté').allergenes,
    `Allergènes : ${[g, l, o].map(labelAllergene).join(', ')}`);
  assert.equal(p.meta, 'Édition du 25.11.2026');
});

test('payloadAllergenesCarte : ALLERGENES.length colonnes, « Autres mentions » seulement avec une valeur libre', () => {
  const avec = payloadAllergenesCarte({ carte: { nom: 'Carte' }, plats, recettesActives: recettes });
  assert.equal(avec.colonnes.length, ALLERGENES.length + 1);
  assert.equal(avec.colonnes.at(-1).label, COLONNE_AUTRES);
  const sans = payloadAllergenesCarte({ carte: { nom: 'Carte' }, plats: plats.filter((p) => p.id !== 'p3'), recettesActives: recettes });
  assert.equal(sans.colonnes.length, ALLERGENES.length);
  assert.deepEqual(sans.colonnes.map((c) => c.id), ALLERGENES.map((a) => a.id));
  const lignes = avec.sections.flatMap((s) => s.lignes);
  assert.equal(lignes.find((x) => x.nom === 'Plat sans fiche').mention, MENTION_SANS_FICHE_TABLEAU);
  assert.equal(lignes.find((x) => x.nom === 'Risotto').autres, 'pointe de truffe');
});

test('fuite : ni note, ni coût, ni marge, ni prix de recette dans les payloads', () => {
  const opts = { carte: { nom: 'Carte' }, plats, recettesActives: recettes, avecPrix: true, jour: '2026-11-25' };
  const json = JSON.stringify(payloadCarteTable(opts)) + JSON.stringify(payloadAllergenesCarte(opts));
  for (const r of REPERES) assert.ok(!json.includes(r), r);
});

test('égalité : la carte et le tableau portent exactement allergenesDuPlat', () => {
  const opts = { carte: { nom: 'Carte' }, plats, recettesActives: recettes };
  const carte = payloadCarteTable(opts).sections.flatMap((s) => s.plats);
  const tableau = payloadAllergenesCarte(opts).sections.flatMap((s) => s.lignes);
  for (const p of plats.filter((x) => x.actif !== false)) {
    const a = allergenesDuPlat(p, recettes);
    const c = carte.find((x) => x.nom === p.nom);
    const t = tableau.find((x) => x.nom === p.nom);
    assert.deepEqual(c.allergeneIds, a.ids, p.nom);
    assert.deepEqual(c.libres, a.libres, p.nom);
    assert.deepEqual(t.allergeneIds, a.ids, p.nom);
    assert.deepEqual(t.libres, a.libres, p.nom);
    if (!a.sansFiche) assert.deepEqual(ALLERGENES.filter((r, i) => t.marques[i]).map((r) => r.id), a.ids, p.nom);
    const attendu = [...a.ids.map(labelAllergene), ...a.libres];
    if (attendu.length) assert.equal(c.allergenes, `Allergènes : ${attendu.join(', ')}`);
  }
});

test('noms de fichiers et date d\'édition', () => {
  assert.equal(nomFichierCarte({ nom: "Carte d'automne" }), 'Carte_carte-d-automne.pdf');
  assert.equal(nomFichierAllergenes({ nom: "Carte d'automne" }), 'Allergenes_carte-d-automne.pdf');
  assert.equal(dateEdition(''), '');
});
