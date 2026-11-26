// Glossaire portugais (mode « Português ») : vocabulaire métier, affixes,
// chiffres, charte, registre pt-PT et contrat du moteur. Tests purs : node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_GLOSSARY, DO_NOT_TRANSLATE, loadGlossary, lookupGlossary } from './glossary.js';
import { UI_GLOSSARY_PT } from './glossaryPt.js';
import { readFileSync } from 'node:fs';

// domTranslator.js tire le client Supabase (import.meta.env) : sa liste des
// cibles se lit dans la source, sans l'importer.
const TARGET_LANGS = JSON.parse(
  readFileSync(new URL('./domTranslator.js', import.meta.url), 'utf8')
    .match(/export const TARGET_LANGS = (\[[^\]]*\]);/)[1].replace(/'/g, '"'),
);

test('vocabulaire métier imposé sur des clés réelles', async () => {
  await loadGlossary('pt');
  const attendus = {
    Supprimer: 'Eliminar',
    Enregistrer: 'Guardar',
    Annuler: 'Cancelar',
    Modifier: 'Editar',
    Imprimer: 'Imprimir',
    Pointage: 'Ponto',
    Inventaire: 'Inventário',
    Planning: 'Escala',
    'Mise en place': 'Mise en place',
    Brigade: 'Brigada',
    Carte: 'Ementa',
    'Carte des boissons': 'Carta de bebidas',
    'Carte bancaire': 'Cartão bancário',
    Pertes: 'Perdas',
    Établissement: 'Estabelecimento',
    Dressage: 'Empratamento',
    Réservations: 'Reservas',
    Couverts: 'Cobertos',
    Étages: 'Andares',
    TVA: 'IVA',
    Gouvernante: 'Governanta',
    Caisse: 'Caixa',
    Ticket: 'Conta',
    Chiffrage: 'Custeio',
  };
  for (const [fr, pt] of Object.entries(attendus)) {
    assert.equal(lookupGlossary(fr, 'pt'), pt, fr);
  }
});

test('capitales et points de suspension gardés', async () => {
  await loadGlossary('pt');
  assert.equal(lookupGlossary('SUPPRIMER', 'pt'), 'ELIMINAR');
  assert.equal(lookupGlossary('Chargement…', 'pt'), 'A carregar…');
});

// Mêmes exceptions que l'italien et l'allemand : la traduction peut nommer
// l'année précédente ou changer l'exemple d'un code. Le portugais n'en a
// besoin d'aucune aujourd'hui ; elles restent permises.
const EXCEPTIONS_CHIFFRES = new Set([
  'Même période N-1',
  'vs N-1',
  'Six lettres ou chiffres, par exemple ESSAI1.',
]);

test('chaque traduction garde les nombres de sa clé', () => {
  const chiffres = (s) => (s.match(/\d+/g) || []).sort().join(',');
  const ecarts = Object.keys(UI_GLOSSARY_PT)
    .filter((k) => !EXCEPTIONS_CHIFFRES.has(k) && chiffres(k) !== chiffres(UI_GLOSSARY_PT[k]));
  assert.deepEqual(ecarts, []);
});

test('moins de 8 % de traductions identiques à leur clé', () => {
  const cles = Object.keys(UI_GLOSSARY).filter((k) => /\p{Ll}/u.test(k) && !DO_NOT_TRANSLATE.has(k));
  const identiques = cles.filter((k) => UI_GLOSSARY_PT[k] === k);
  assert.ok(identiques.length / cles.length < 0.08, `${identiques.length} sur ${cles.length}`);
});

// Tiret cadratin, demi-cadratin et point médian, écrits par leur code.
const BANNIS = [0x2014, 0x2013, 0xb7].map((c) => String.fromCharCode(c));

test('charte : ni tiret long, ni point médian, ni traduction vide', () => {
  const fautes = Object.entries(UI_GLOSSARY_PT)
    .filter(([, v]) => typeof v !== 'string' || !v.trim() || BANNIS.some((c) => v.includes(c)))
    .map(([k]) => k);
  assert.deepEqual(fautes, []);
});

// Portugais du Portugal : les formes brésiliennes courantes en interface et
// le tutoiement ne doivent pas apparaître. « Arquivo » reste : au Portugal,
// c'est l'archive (le fichier se dit « ficheiro »).
const BRESIL_OU_TU = /\b(tela|usuário|usuários|equipe|celular|registro|compartilhar|configurações|você pode|tu|teu|tua)\b/iu;

test('registre pt-PT : ni forme brésilienne courante, ni tutoiement', () => {
  const fautes = Object.entries(UI_GLOSSARY_PT)
    .filter(([, v]) => BRESIL_OU_TU.test(v))
    .map(([k, v]) => `${k} => ${v}`);
  assert.deepEqual(fautes, []);
});

test('le portugais est une cible du moteur, une langue sans glossaire n\'en est pas une', async () => {
  assert.ok(TARGET_LANGS.includes('pt'));
  await assert.rejects(loadGlossary('nl'));
});
