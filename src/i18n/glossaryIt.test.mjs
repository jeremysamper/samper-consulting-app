// Glossaire italien (mode « Italiano ») : vocabulaire métier, affixes, chiffres,
// charte et contrat du moteur. Tests purs : node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_GLOSSARY, DO_NOT_TRANSLATE, loadGlossary, lookupGlossary } from './glossary.js';
import { UI_GLOSSARY_IT } from './glossaryIt.js';
import { readFileSync } from 'node:fs';

// domTranslator.js tire le client Supabase (import.meta.env) : sa liste des
// cibles se lit dans la source, sans l'importer.
const TARGET_LANGS = JSON.parse(
  readFileSync(new URL('./domTranslator.js', import.meta.url), 'utf8')
    .match(/export const TARGET_LANGS = (\[[^\]]*\]);/)[1].replace(/'/g, '"'),
);

test('vocabulaire métier imposé (D4) sur des clés réelles', async () => {
  await loadGlossary('it');
  const attendus = {
    Supprimer: 'Elimina',
    Enregistrer: 'Salva',
    Annuler: 'Annulla',
    Modifier: 'Modifica',
    Imprimer: 'Stampa',
    Pointage: 'Timbratura',
    Inventaire: 'Inventario',
    Planning: 'Piano dei turni',
    'Mise en place': 'Mise en place',
    Brigade: 'Brigata',
    Carte: 'Menu',
    'Carte bancaire': 'Carta bancaria',
    Pertes: 'Perdite',
    Établissement: 'Struttura',
    Dressage: 'Impiattamento',
    Réservations: 'Prenotazioni',
    Couverts: 'Coperti',
    Étages: 'Piani',
    TVA: 'IVA',
    Gouvernante: 'Governante',
  };
  for (const [fr, it] of Object.entries(attendus)) {
    assert.equal(lookupGlossary(fr, 'it'), it, fr);
  }
});

test('capitales et points de suspension gardés', async () => {
  await loadGlossary('it');
  assert.equal(lookupGlossary('SUPPRIMER', 'it'), 'ELIMINA');
  assert.equal(lookupGlossary('Chargement…', 'it'), 'Caricamento…');
});

// Exceptions relevées en lançant la même règle sur la table allemande : la
// traduction nomme l'année précédente au lieu de « N-1 », ou change l'exemple
// d'un code. L'italien n'en a besoin d'aucune aujourd'hui ; elles restent
// permises.
const EXCEPTIONS_CHIFFRES = new Set([
  'Même période N-1',
  'vs N-1',
  'Six lettres ou chiffres, par exemple ESSAI1.',
]);

test('chaque traduction garde les nombres de sa clé', () => {
  const chiffres = (s) => (s.match(/\d+/g) || []).sort().join(',');
  const ecarts = Object.keys(UI_GLOSSARY_IT)
    .filter((k) => !EXCEPTIONS_CHIFFRES.has(k) && chiffres(k) !== chiffres(UI_GLOSSARY_IT[k]));
  assert.deepEqual(ecarts, []);
});

test('moins de 8 % de traductions identiques à leur clé', () => {
  const cles = Object.keys(UI_GLOSSARY).filter((k) => /\p{Ll}/u.test(k) && !DO_NOT_TRANSLATE.has(k));
  const identiques = cles.filter((k) => UI_GLOSSARY_IT[k] === k);
  assert.ok(identiques.length / cles.length < 0.08, `${identiques.length} sur ${cles.length}`);
});

// Tiret cadratin, demi-cadratin et point médian, écrits par leur code.
const BANNIS = [0x2014, 0x2013, 0xb7].map((c) => String.fromCharCode(c));

test('charte : ni tiret long, ni point médian, ni traduction vide', () => {
  const fautes = Object.entries(UI_GLOSSARY_IT)
    .filter(([, v]) => typeof v !== 'string' || !v.trim() || BANNIS.some((c) => v.includes(c)))
    .map(([k]) => k);
  assert.deepEqual(fautes, []);
});

test("l'italien est une cible du moteur, le portugais n'en est pas une", async () => {
  assert.ok(TARGET_LANGS.includes('it'));
  await assert.rejects(loadGlossary('pt'));
});
