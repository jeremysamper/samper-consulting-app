// ─────────────────────────────────────────────────────────────
// Allergènes réglementaires (annexe II du règlement UE 1169/2011).
// SOURCE UNIQUE : la liste vivait en 4 exemplaires (fiches salle,
// outils consultant, catalogue, export PDF) et rien ne validait ce
// qui entrait en base. Résultat : « aucun », « crustaces si
// ecrevisse » ou « lait » stockés comme des ids, invisibles aux
// filtres et impossibles à décocher dans les formulaires.
//
// Util pur (ni React ni DOM). Deux usages :
//  - référentiel d'affichage : ALLERGENES / ALLERGENES_LABELS
//  - garde-fou d'entrée : resolveAllergene / splitAllergenesText,
//    qui ramènent du texte libre vers les ids canoniques et
//    conservent la précision qui ne rentre pas dans un id.
// ─────────────────────────────────────────────────────────────

export const ALLERGENES = [
  { id: 'gluten', label: 'Gluten' },
  { id: 'lactose', label: 'Lactose' },
  { id: 'oeufs', label: 'Œufs' },
  { id: 'poissons', label: 'Poissons' },
  { id: 'crustaces', label: 'Crustacés' },
  { id: 'fruits_coque', label: 'Fruits à coque' },
  { id: 'sulfites', label: 'Sulfites' },
  { id: 'arachides', label: 'Arachides' },
  { id: 'soja', label: 'Soja' },
  { id: 'celeri', label: 'Céleri' },
  { id: 'moutarde', label: 'Moutarde' },
  { id: 'sesame', label: 'Sésame' },
  { id: 'mollusques', label: 'Mollusques' },
  { id: 'lupin', label: 'Lupin' },
];

export const ALLERGENE_IDS = ALLERGENES.map(a => a.id);
export const ALLERGENES_LABELS = ALLERGENES.reduce((acc, a) => { acc[a.id] = a.label; return acc; }, {});

const IDS = new Set(ALLERGENE_IDS);
export const isAllergeneId = (v) => IDS.has(v);
export const labelAllergene = (v) => ALLERGENES_LABELS[v] || String(v ?? '');

// Sépare une liste stockée en deux : ids connus / valeurs à nettoyer.
// Permet aux formulaires d'afficher une puce supprimable pour ce qui
// n'a pas de bouton dédié - sans ça la valeur survit à chaque save.
export function partitionAllergenes(list) {
  const valides = [];
  const inconnus = [];
  for (const v of (list || [])) {
    if (IDS.has(v)) { if (!valides.includes(v)) valides.push(v); }
    else if (v != null && String(v).trim() !== '' && !inconnus.includes(v)) inconnus.push(v);
  }
  return { valides, inconnus };
}

// Trie selon l'ordre du référentiel (affichage stable quelle que soit
// la provenance des ids) et retire les doublons.
export const sortAllergenes = (ids) =>
  ALLERGENE_IDS.filter(id => (ids || []).includes(id));

// ─── Normalisation du texte libre ───

// minuscules, ligatures étendues (œ → oe, sinon « œufs » n'est jamais
// reconnu : NFD ne décompose pas les ligatures), sans accents.
const norm = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Vocabulaire rencontré dans les colonnes « allergènes » des fichiers
// fournisseurs et des anciennes fiches papier. Le pluriel simple est
// géré par la recherche, inutile de le lister.
const MOTS_CLES = [
  ['gluten', ['gluten', 'ble', 'froment', 'orge', 'seigle', 'avoine', 'epeautre', 'kamut', 'malt', 'chapelure', 'farine de ble']],
  ['lactose', ['lactose', 'lait', 'laitier', 'produit laitier', 'creme', 'beurre', 'fromage', 'yaourt', 'mascarpone', 'parmesan']],
  ['oeufs', ['oeuf', 'jaune d oeuf', 'blanc d oeuf', 'mayonnaise']],
  ['poissons', ['poisson', 'anchois', 'saumon', 'thon', 'cabillaud', 'sardine', 'worcestershire', 'nuoc mam']],
  ['crustaces', ['crustace', 'crevette', 'ecrevisse', 'homard', 'langoustine', 'crabe', 'gambas']],
  ['fruits_coque', ['fruits a coque', 'fruit a coque', 'noix', 'amande', 'noisette', 'pistache', 'cajou', 'pecan', 'macadamia', 'praline']],
  ['sulfites', ['sulfite', 'so2', 'anhydride sulfureux']],
  ['arachides', ['arachide', 'cacahuete']],
  ['soja', ['soja', 'tamari', 'edamame', 'tofu']],
  ['celeri', ['celeri']],
  ['moutarde', ['moutarde']],
  ['sesame', ['sesame', 'tahini', 'houmous']],
  ['mollusques', ['mollusque', 'moule', 'huitre', 'calamar', 'encornet', 'seiche', 'poulpe', 'saint-jacques', 'coquillage', 'escargot']],
  ['lupin', ['lupin']],
];

// Faux amis : ces expressions contiennent un mot-clé sans porter
// l'allergène (« lait de coco ») ou en portent un autre
// (« beurre de cacahuète » = arachides, pas lactose). Neutralisées
// avant la recherche.
const FAUX_AMIS = [
  [/lait de coco/g, ' '],
  [/creme de coco/g, ' '],
  [/noix de coco/g, ' '],
  [/noix de muscade/g, ' '],
  [/beurre de cacahuete/g, ' cacahuete '],
  [/beurre de karite/g, ' '],
  [/lait d ?'?amande/g, ' amande '],
  [/lait de soja/g, ' soja '],
  [/lait d ?'?avoine/g, ' avoine '],
];

// Marqueurs de « rien à déclarer » : la valeur ne contient aucune
// information à conserver, on la supprime au lieu de la garder en note.
const RIEN_A_DECLARER = /^(aucun|aucune|rien|ras|neant|non|nc|n\/a|na|sans)\b|^[-–—.0]+$/;

// Négation : « sans gluten » ne déclare pas le gluten, et la chaîne
// « sans lactose ni gluten » nie les deux. On ne remonte que jusqu'au
// séparateur précédent pour ne pas neutraliser « sans sel, gluten ».
const NEGATION = /(^|[^a-z0-9])(sans|hors|zero|exempte?s?\s+de|pas\s+de|pas\s+d|depourvu)([^a-z0-9]|$)/;

const echappe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Cherche un mot-clé en respectant les frontières de mot (« lait » ne
// doit pas matcher « laitue ») et en sautant les occurrences niées
// (« sans gluten » ne déclare pas le gluten).
const trouve = (s, mot) => {
  const re = new RegExp(`(^|[^a-z0-9])${echappe(mot)}s?($|[^a-z0-9])`, 'g');
  let m;
  while ((m = re.exec(s)) !== null) {
    const segment = s.slice(0, m.index + m[1].length).split(/[,;:()[\]/•|]/).pop();
    if (NEGATION.test(segment)) continue;
    return true;
  }
  return false;
};

// Table des alias exacts (« lait » → lactose) construite depuis le
// vocabulaire : une valeur qui est exactement un alias ne porte aucune
// précision, elle n'a pas à laisser de note derrière elle.
const ALIAS_EXACTS = MOTS_CLES.reduce((acc, [id, mots]) => {
  for (const m of mots) { acc[m] = id; acc[`${m}s`] = id; }
  acc[id] = id;
  acc[id.replace(/_/g, ' ')] = id;
  return acc;
}, {});

// Résout une valeur brute (id, alias ou texte libre) en allergènes
// canoniques. Renvoie { ids, nuance } :
//  - ids    : allergènes déclarés (vide si la valeur ne déclare rien)
//  - nuance : texte d'origine à conserver quand il dit plus que les
//             ids (« si écrevisse », « selon la marque »), sinon ''.
// Principe : on ne perd jamais un allergène. Dans le doute on déclare
// et on garde la phrase d'origine pour que la salle garde la nuance.
export function resolveAllergene(raw) {
  const brut = String(raw ?? '').trim();
  const s0 = norm(brut);
  if (!s0) return { ids: [], nuance: '' };
  const exact = ALIAS_EXACTS[s0];
  if (exact) return { ids: [exact], nuance: '' };

  let s = ` ${s0} `;
  for (const [re, rep] of FAUX_AMIS) s = s.replace(re, rep);

  const ids = ALLERGENE_IDS.filter(id => {
    const mots = (MOTS_CLES.find(([k]) => k === id) || [null, []])[1];
    return mots.some(m => trouve(s, m));
  });
  if (ids.length) return { ids, nuance: brut };
  // Rien de reconnu : bruit pur (« aucun ») ou consigne à relire
  // (« vérifier la composition du fond »), qu'on garde en note.
  return { ids: [], nuance: RIEN_A_DECLARER.test(s0) ? '' : brut };
}

// Normalise une liste de valeurs hétérogènes.
export function normalizeAllergenes(list) {
  const ids = [];
  const nuances = [];
  for (const v of (list || [])) {
    const r = resolveAllergene(v);
    for (const id of r.ids) if (!ids.includes(id)) ids.push(id);
    if (r.nuance && !nuances.includes(r.nuance)) nuances.push(r.nuance);
  }
  return { ids: sortAllergenes(ids), nuances };
}

// Découpe une cellule « allergènes » puis normalise. Le découpage
// ignore les virgules entre parenthèses : « aucun (sans gluten, sans
// lactose) » est UNE valeur, la découper produisait deux fragments
// ininterprétables.
export function splitAllergenesText(raw) {
  const parts = [];
  let cur = '';
  let prof = 0;
  for (const ch of String(raw ?? '')) {
    if (ch === '(' || ch === '[') prof += 1;
    else if (ch === ')' || ch === ']') prof = Math.max(0, prof - 1);
    if ((ch === ',' || ch === ';' || ch === '\n') && prof === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return normalizeAllergenes(parts.map(p => p.trim()).filter(Boolean));
}
