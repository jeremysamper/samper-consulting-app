import { PAR_ID, POSTES } from './catalogue.js';

// ─────────────────────────────────────────────────────────────────────────────
// Disposition du tableau de bord en widgets : fonctions pures.
//
// Une disposition est une liste ordonnée { id, taille } par poste
// (ordinateur, tablette, téléphone), plus les raccourcis choisis. Comme sur un
// téléphone, pas de position libre : la personne choisit l'ordre et la
// taille, la grille range seule (tableau.css, grid-auto-flow dense).
//
// Valeur gardée (user_settings, clé tdb_disposition) :
//   { v: 1, ordinateur: [...], tablette: [...], telephone: [...], raccourcis: [...] }
// Un poste absent : sa disposition d'origine. Les gardes ne sont pas écrites
// dans la valeur : un widget que la garde refuse ne se rend pas et garde sa
// place dans la liste (il revient si le module est rallumé).
// ─────────────────────────────────────────────────────────────────────────────

export const VERSION = 1;
export const CLE = 'tdb_disposition';
export const CLE_LOCALE = 'sc_tdb_disposition';

export const estVisible = (id, ctx) => {
  const w = PAR_ID.get(id);
  return Boolean(w && ctx && w.visible(ctx));
};

// Taille d'un widget quand rien d'autre ne la dit : celle de l'origine du
// poste si elle est permise, sinon la première de ses tailles.
export function tailleParDefaut(id, poste) {
  const w = PAR_ID.get(id);
  if (!w) return null;
  const o = w.origine && w.origine[poste];
  return o && w.tailles.includes(o) ? o : w.tailles[0];
}

// Tailles d'un groupe de petits widgets (repères du jour, chiffres de
// gestion) qui remplit ses rangées : un trou laissé dans une rangée serait
// comblé par un widget venu de plus bas (grille dense), et l'ordre de lecture
// se perdrait. Téléphone : deux colonnes. Ailleurs : quatre (deux quand la
// place manque, où chaque moyen tient une rangée).
export function taillesDeGroupe(n, poste) {
  if (n <= 0) return [];
  if (poste === 'telephone') {
    const t = Array(n).fill('petit');
    if (n % 2) t[n - 1] = 'moyen';
    return t;
  }
  if (n >= 4) return Array(n).fill('petit');
  if (n === 3) return ['petit', 'petit', 'moyen'];
  return Array(n).fill('moyen');
}

// Disposition d'origine : les cartes d'aujourd'hui, dans le même ordre de
// lecture, selon les gardes du contexte. Au téléphone, une seule carte de mise
// en avant (les autres attendent dans la galerie) et pas de repère qui répète
// la carte de l'équipe.
export function origine(poste, ctx) {
  const vu = (id) => estVisible(id, ctx);
  const tel = poste === 'telephone';
  const liste = [];
  const pose = (id, taille) => { if (vu(id)) liste.push({ id, taille }); };

  let reperes = ['repere-couverts', 'repere-groupes', 'repere-equipe'].filter(vu);
  if (tel && vu('equipe')) reperes = reperes.filter((id) => id !== 'repere-equipe');
  taillesDeGroupe(reperes.length, poste).forEach((taille, i) => liste.push({ id: reperes[i], taille }));

  if (tel) {
    pose('pointage', 'pleine');
    pose('a-faire', 'pleine');
    const avant = ['equipe', 'semaine', 'reservations'].find(vu);
    if (avant) liste.push({ id: avant, taille: avant === 'equipe' ? 'pleine' : 'moyen' });
  } else {
    // Rangée « maintenant » : votre service et à faire d'un côté, les cartes
    // de mise en avant de l'autre, en rangées de la grille de quatre colonnes.
    const pointage = vu('pointage');
    const equipe = vu('equipe');
    const couverts = vu('semaine') && vu('reservations');
    if (!equipe && !couverts) {
      pose('pointage', 'pleine');
      pose('a-faire', 'pleine');
    } else if (pointage && equipe && !couverts) {
      pose('pointage', 'grand');
      pose('equipe', 'grand');
      pose('a-faire', 'pleine');
    } else if (!pointage && equipe && couverts) {
      // La direction : à faire à gauche, l'équipe au-dessus des deux cartes
      // pastel à droite, comme le tableau de bord d'avant.
      pose('a-faire', 'grand');
      pose('equipe', 'moyen');
      pose('semaine', 'petit');
      pose('reservations', 'petit');
    } else {
      const ordre = pointage && equipe
        ? ['pointage', 'equipe', 'a-faire', 'semaine', 'reservations']
        : ['pointage', 'a-faire', 'equipe', 'semaine', 'reservations'];
      ordre.forEach((id) => pose(id, id === 'semaine' || id === 'reservations' ? 'moyen' : 'grand'));
    }
    pose('qui-travaille', 'pleine');
  }

  pose('hotel', 'pleine');
  pose('mot-consultant', 'pleine');
  pose('a-venir', 'pleine');
  const chiffres = ['chiffre-couverts', 'chiffre-heures', 'chiffre-pertes', 'chiffre-stock'].filter(vu);
  taillesDeGroupe(chiffres.length, poste).forEach((taille, i) => liste.push({ id: chiffres[i], taille }));
  pose('regularite', 'pleine');
  return liste;
}

// Lecture prudente d'une liste : identifiant inconnu retiré, doublon retiré,
// taille non permise ramenée à celle de l'origine. Pas une liste : null.
export function normaliserListe(liste, poste) {
  if (!Array.isArray(liste)) return null;
  const vus = new Set();
  const sortie = [];
  liste.forEach((x) => {
    const id = x && typeof x === 'object' ? x.id : null;
    const w = typeof id === 'string' ? PAR_ID.get(id) : null;
    if (!w || vus.has(id)) return;
    vus.add(id);
    sortie.push({ id, taille: w.tailles.includes(x.taille) ? x.taille : tailleParDefaut(id, poste) });
  });
  return sortie;
}

// Lecture prudente d'une valeur gardée. Illisible (pas un objet, autre
// version, aucune liste lisible) : null, et l'écran rend l'origine.
export function normaliser(valeur) {
  let v = valeur;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v) || v.v !== VERSION) return null;
  const sortie = { v: VERSION };
  POSTES.forEach((p) => {
    const l = normaliserListe(v[p], p);
    if (l) sortie[p] = l;
  });
  if (Array.isArray(v.raccourcis)) sortie.raccourcis = [...new Set(v.raccourcis.filter((x) => typeof x === 'string' && x))];
  if (!POSTES.some((p) => sortie[p]) && !sortie.raccourcis) return null;
  return sortie;
}

// La liste du poste : la sienne si elle est gardée, sinon l'origine.
export function listeDuPoste(disposition, poste, ctx) {
  return (disposition && disposition[poste]) || origine(poste, ctx);
}

// ── Gestes du mode « Personnaliser » ───────────────────────────────────────

export function ajouter(liste, id, poste) {
  if (!PAR_ID.has(id) || liste.some((x) => x.id === id)) return liste;
  return [...liste, { id, taille: tailleParDefaut(id, poste) }];
}

export const retirer = (liste, id) => liste.filter((x) => x.id !== id);

export function changerTaille(liste, id, taille) {
  const w = PAR_ID.get(id);
  if (!w || !w.tailles.includes(taille)) return liste;
  return liste.map((x) => (x.id === id ? { ...x, taille } : x));
}

// Un cran vers l'avant (sens 1) ou l'arrière (sens -1), par-dessus les widgets
// que la garde cache (vu(id) faux) : la flèche déplace toujours ce qu'on voit.
export function deplacer(liste, id, sens, vu = () => true) {
  const i = liste.findIndex((x) => x.id === id);
  if (i < 0) return liste;
  let j = i + sens;
  while (j >= 0 && j < liste.length && !vu(liste[j].id)) j += sens;
  if (j < 0 || j >= liste.length) return liste;
  const copie = [...liste];
  const [x] = copie.splice(i, 1);
  copie.splice(j, 0, x);
  return copie;
}

// Glisser : le widget prend la place de la cible (après elle en avançant,
// avant elle en reculant).
export function deplacerA(liste, id, cibleId) {
  const i = liste.findIndex((x) => x.id === id);
  const k = liste.findIndex((x) => x.id === cibleId);
  if (i < 0 || k < 0 || i === k) return liste;
  const copie = [...liste];
  const [x] = copie.splice(i, 1);
  copie.splice(k, 0, x);
  return copie;
}

export const memeListe = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

// ── Raccourcis ─────────────────────────────────────────────────────────────

// Sans choix gardé : les quatre premiers modules du menu.
export const RACCOURCIS_PAR_DEFAUT = 4;
const HORS_RACCOURCIS = new Set(['dashboard', 'accueil']);

export function raccourcisAffiches(choisis, modulesDuMenu) {
  const menu = (modulesDuMenu || []).filter((m) => !HORS_RACCOURCIS.has(m.id));
  if (!Array.isArray(choisis)) return menu.slice(0, RACCOURCIS_PAR_DEFAUT);
  const parId = new Map(menu.map((m) => [m.id, m]));
  return choisis.map((id) => parId.get(id)).filter(Boolean);
}

// Combien de raccourcis montre chaque taille (le reste se règle dans le mode
// « Personnaliser »).
export const CAPACITE_RACCOURCIS = { petit: 2, moyen: 4, grand: 8, pleine: Infinity };

// Les modules du menu de la personne : le filtre de useVisibleNav (droits,
// modules de l'établissement, réservés au consultant), sans ses badges ni ses
// lectures. L'ordre est celui du menu, lu dans sa copie locale.
export function modulesDuMenu({ items, ordre, role, perms, defautsRole, actif }) {
  return (ordre || items).filter((item) => {
    if ((item.id === 'faq' || item.id === 'consultant_tools') && role !== 'consultant') return false;
    if (item.id === 'kds' && !['consultant', 'resp_cuisine', 'cuisinier'].includes(role)) return false;
    if (item.id === 'journal' && !['consultant', 'patron'].includes(role)) return false;
    if (!actif(item.permKey)) return false;
    const p = (perms || {})[item.permKey];
    if (p === false) return false;
    if (p === true) return true;
    return (defautsRole || {})[item.permKey] !== false;
  });
}
