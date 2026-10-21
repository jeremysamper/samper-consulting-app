import { normalizeSearch } from '../../utils/searchText.js';
import { NUMERO_COMPLEMENTS, plurielSection, rangSection } from './typesGroupe.js';

// ═══════════════════════════════════════════════════════════════════════════
// Menus à choix : saisons, règles de choix, ce que le client a coché, et ce
// que la cuisine doit produire. Util pur (ni React ni DOM), partagé par
// l'éditeur de menus, l'écran de choix, la fiche, les PDF et la liste de
// courses.
//
// SAISONS
// Un menu est un palier de prix (« mariage n°2 », 95 CHF) ; c'est chaque
// ligne qui porte sa saison : `saison` vaut 'ete' (mai à septembre), 'hiver'
// (octobre à avril) ou rien (toute l'année). Une ligne peut avoir une
// fenêtre plus courte dans sa saison (`moisDebut` / `moisFin`, « de mai à
// juin »). La date du groupe décide de tout : on ne voit, ne choisit et ne
// commande que ce qui est servi ce jour-là.
//
// RÈGLES (menu.regles.sections[section])
//   servi      tout est servi à tous (trou valaisan)
//   table      `nombre` choix pour toute la table (une entrée, trois
//              apéritifs) ; `versionVege` : si le choix n'est pas végétarien,
//              les végétariens reçoivent une version végétarienne choisie à part
//   carte      les organisateurs retiennent `retenir` options dont `dontVege`
//              végétariennes, puis chaque convive choisit : quantités par plat
//   quantites  chaque option se commande dans son unité (stations)
// Options : parPersonne (pièces par convive), auMoinsChaud, puiserDans
// (« ou une deuxième entrée » puise dans les entrées), facultatif, formules
// ([{ id, label, prix, premium, aucunChoix }]), label.
//
// CHOIX (groupe.choix)
//   { formules: { section: id },
//     sections: { section: { items: [{ id, libelle, quantite }], vege: { id, libelle } } },
//     emprunts: [{ id, section, source: { typeGroupe, numero, ligneId }, libelle,
//                  platId, recetteIds, regime, supplement, quantite }] }
// Un emprunt est un plat pris dans un autre menu, à titre exceptionnel, avec un
// supplément par personne saisi à la main. Il compte comme une option choisie
// de sa rubrique. Le libellé est recopié dans le choix : si le menu change
// plus tard, ce qui a été vendu au client reste lisible.
// ═══════════════════════════════════════════════════════════════════════════

// ── Saisons ────────────────────────────────────────────────────────────────
export const SAISONS = [
  { id: 'ete', label: 'Été', detail: 'mai à septembre' },
  { id: 'hiver', label: 'Hiver', detail: 'octobre à avril' },
];

export const NOMS_MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const MOIS_ETE = new Set([5, 6, 7, 8, 9]);

export const saisonDuMois = (mois) => (MOIS_ETE.has(Number(mois)) ? 'ete' : 'hiver');

export function moisDe(dateISO) {
  const m = Number(String(dateISO || '').slice(5, 7));
  return m >= 1 && m <= 12 ? m : null;
}

export function saisonDeDate(dateISO) {
  const m = moisDe(dateISO);
  return m ? saisonDuMois(m) : null;
}

export function metaSaison(id) {
  return SAISONS.find((s) => s.id === id) || { id: '', label: "Toute l'année", detail: '' };
}

const moisValide = (m) => Number.isInteger(Number(m)) && Number(m) >= 1 && Number(m) <= 12;
const prepositionDe = (mot) => (/^[aeiouyâàéèêîïôûœ]/i.test(mot) ? `d'${mot}` : `de ${mot}`);

// « de mai à juin », « d'octobre à décembre », ou '' sans fenêtre.
export function libelleFenetre(ligne) {
  const d = Number(ligne?.moisDebut);
  const f = Number(ligne?.moisFin);
  if (!moisValide(d) || !moisValide(f)) return '';
  if (d === f) return `en ${NOMS_MOIS[d - 1]}`;
  return `${prepositionDe(NOMS_MOIS[d - 1])} à ${NOMS_MOIS[f - 1]}`;
}

// Fenêtre éventuellement à cheval sur l'année (novembre à février).
export function moisDansFenetre(mois, debut, fin) {
  if (!moisValide(debut) || !moisValide(fin)) return true;
  const m = Number(mois); const d = Number(debut); const f = Number(fin);
  return d <= f ? (m >= d && m <= f) : (m >= d || m <= f);
}

export const ligneDeSaison = (ligne, saison) => !saison || !ligne?.saison || ligne.saison === saison;

// La ligne est-elle servie à cette date (bonne saison et dans sa fenêtre) ?
export function ligneServieLe(ligne, dateISO) {
  const m = moisDe(dateISO);
  if (!m) return true;
  return ligneDeSaison(ligne, saisonDuMois(m)) && moisDansFenetre(m, ligne?.moisDebut, ligne?.moisFin);
}

// ── Régimes ────────────────────────────────────────────────────────────────
export const REGIMES = [
  { id: 'vegetarien', label: 'Végétarien' },
  { id: 'poisson', label: 'Poisson' },
  { id: 'viande', label: 'Viande' },
];
export const labelRegime = (id) => REGIMES.find((r) => r.id === id)?.label || '';
export const estVege = (ligne) => ligne?.regime === 'vegetarien';
// Seule une option poisson ou viande appelle une version végétarienne : un
// plateau de fromages ou un dessert, sans régime marqué, se sert à tous.
export const exigeVersionVege = (ligne) => ligne?.regime === 'poisson' || ligne?.regime === 'viande';

// ── Règles ─────────────────────────────────────────────────────────────────
export const MODES = [
  { id: 'servi', label: 'Servi à tous' },
  { id: 'table', label: 'Au choix, pour toute la table' },
  { id: 'carte', label: 'Carte, chaque convive choisit' },
  { id: 'quantites', label: 'En quantités' },
];
const MODES_IDS = new Set(MODES.map((m) => m.id));

const DEFAUTS_MARIAGE = {
  entree: { mode: 'carte', retenir: 3, dontVege: 1 },
  plat: { mode: 'carte', retenir: 3, dontVege: 1 },
  poisson: { mode: 'table', nombre: 1, versionVege: true },
  fromage: { mode: 'table', nombre: 1, versionVege: true },
  dessert: { mode: 'table', nombre: 1 },
  mignardises: { mode: 'table', nombre: 1 },
};
const DEFAUTS_TABLE = {
  aperitif: { mode: 'table', nombre: 1 },
  entree: { mode: 'table', nombre: 1, versionVege: true },
  poisson: { mode: 'table', nombre: 1, versionVege: true },
  plat: { mode: 'table', nombre: 1, versionVege: true },
  fromage: { mode: 'table', nombre: 1 },
  dessert: { mode: 'table', nombre: 1 },
  mignardises: { mode: 'table', nombre: 1 },
};
const DEFAUTS_COMMUNS = {
  stations: { mode: 'quantites', facultatif: true },
  gateau: { mode: 'table', nombre: 1, facultatif: true },
};

function regleParDefaut(typeGroupe, sectionId) {
  if (DEFAUTS_COMMUNS[sectionId]) return DEFAUTS_COMMUNS[sectionId];
  if (typeGroupe === 'apero_dinatoire') return { mode: 'servi' };
  const table = typeGroupe === 'mariage' ? DEFAUTS_MARIAGE : DEFAUTS_TABLE;
  return table[sectionId] || { mode: 'servi' };
}

// Règle d'une rubrique : défaut du type, puis carte des compléments, puis menu.
export function regleSection(sectionId, { menu, complements, typeGroupe }) {
  const r = {
    ...regleParDefaut(typeGroupe, sectionId),
    ...(complements?.regles?.sections?.[sectionId] || {}),
    ...(menu?.regles?.sections?.[sectionId] || {}),
  };
  if (!MODES_IDS.has(r.mode)) r.mode = 'servi';
  return r;
}

// Phrase qui dit la règle au client et à la brigade.
export function phraseRegle(regle) {
  switch (regle.mode) {
    case 'table': {
      const n = Number(regle.nombre) || 1;
      const vege = regle.versionVege ? ', avec sa version végétarienne pour les végétariens' : '';
      return n > 1 ? `${n} au choix, pour toute la table` : `Un choix pour toute la table${vege}`;
    }
    case 'carte': {
      const n = Number(regle.retenir) || 3;
      const v = Number(regle.dontVege) || 0;
      return `Les organisateurs en retiennent ${n}${v ? `, dont ${v} végétarienne${v > 1 ? 's' : ''}` : ''}, chaque convive choisit la sienne`;
    }
    case 'quantites': return 'Quantités à commander, en supplément';
    default: return 'Servi à tous';
  }
}

// ── Rubriques à l'écran de choix ───────────────────────────────────────────
// Lignes du menu et de la carte des compléments réunies par rubrique, dans
// l'ordre du service. Pour la date du groupe : `lignes` est servi ce jour-là,
// `horsFenetre` est de la bonne saison mais hors de sa fenêtre (montré grisé),
// `puisees` vient d'une autre rubrique (« ou une deuxième entrée »).
export function rubriquesDuChoix({ menu, complements, typeGroupe, dateISO }) {
  const saison = saisonDeDate(dateISO);
  const lignes = [
    ...(menu?.lignes || []).map((l) => ({ ...l, origine: 'menu' })),
    ...((complements && complements !== menu) ? (complements.lignes || []) : []).map((l) => ({ ...l, origine: 'complements' })),
  ];
  const ids = [...new Set([
    ...lignes.map((l) => l.section),
    ...Object.keys(menu?.regles?.sections || {}),
  ])].filter(Boolean).sort((a, b) => rangSection(a) - rangSection(b));

  return ids.map((id) => {
    const regle = regleSection(id, { menu, complements, typeGroupe });
    const deSaison = lignes.filter((l) => l.section === id && ligneDeSaison(l, saison));
    const puiserDans = Array.isArray(regle.puiserDans) ? regle.puiserDans : [];
    return {
      id,
      label: regle.label || plurielSection(id),
      regle,
      lignes: deSaison.filter((l) => ligneServieLe(l, dateISO)),
      horsFenetre: deSaison.filter((l) => !ligneServieLe(l, dateISO)),
      puisees: puiserDans.length
        ? lignes.filter((l) => puiserDans.includes(l.section) && ligneServieLe(l, dateISO))
        : [],
    };
  }).filter((r) => r.lignes.length || r.horsFenetre.length || r.puisees.length);
}

// ── Choix ──────────────────────────────────────────────────────────────────
const nombreOuNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function choixVide() {
  return { formules: {}, sections: {}, emprunts: [] };
}

export function normaliserChoix(brut) {
  const o = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  const sections = {};
  Object.entries(o.sections && typeof o.sections === 'object' ? o.sections : {}).forEach(([sid, v]) => {
    if (!v || typeof v !== 'object') return;
    const items = (Array.isArray(v.items) ? v.items : [])
      .filter((i) => i && i.id)
      .map((i) => ({ id: String(i.id), libelle: String(i.libelle || ''), quantite: nombreOuNull(i.quantite) }));
    const vege = v.vege && v.vege.id ? { id: String(v.vege.id), libelle: String(v.vege.libelle || '') } : null;
    if (items.length || vege) sections[sid] = { items, vege };
  });
  const emprunts = (Array.isArray(o.emprunts) ? o.emprunts : [])
    .filter((e) => e && e.id && e.section)
    .map((e) => ({
      id: String(e.id),
      section: String(e.section),
      source: e.source && typeof e.source === 'object'
        ? { typeGroupe: e.source.typeGroupe || '', numero: Number(e.source.numero) || 0, ligneId: e.source.ligneId || '' }
        : null,
      libelle: String(e.libelle || ''),
      platId: e.platId || null,
      recetteIds: Array.isArray(e.recetteIds) ? e.recetteIds.filter(Boolean) : [],
      regime: e.regime || '',
      supplement: nombreOuNull(e.supplement) ?? 0,
      quantite: nombreOuNull(e.quantite),
    }));
  const formules = {};
  Object.entries(o.formules && typeof o.formules === 'object' ? o.formules : {}).forEach(([sid, f]) => {
    if (typeof f === 'string' && f) formules[sid] = f;
  });
  return { formules, sections, emprunts };
}

export function choixEstVide(choix) {
  const c = normaliserChoix(choix);
  return !Object.keys(c.sections).length && !c.emprunts.length && !Object.keys(c.formules).length;
}

// Ligne d'un menu par son id, dans tous les menus de l'établissement.
function ligneDesMenus(menus, source) {
  if (!source) return null;
  const menu = (menus || []).find((m) => m.typeGroupe === source.typeGroupe && m.numero === Number(source.numero));
  return menu ? (menu.lignes || []).find((l) => l.id === source.ligneId) || null : null;
}

// Un emprunt se lit d'abord dans son menu d'origine (le plat a pu être relié
// à sa fiche depuis), sinon dans ce qui a été recopié au moment du choix.
export function ligneEmprunt(emprunt, menus) {
  const vivante = ligneDesMenus(menus, emprunt.source);
  return {
    id: emprunt.id,
    section: emprunt.section,
    libelle: emprunt.libelle || vivante?.libelle || '',
    platId: vivante?.platId || emprunt.platId || null,
    recetteIds: (vivante?.recetteIds?.length ? vivante.recetteIds : emprunt.recetteIds) || [],
    regime: vivante?.regime || emprunt.regime || '',
    parPersonne: vivante?.parPersonne,
    chaud: vivante?.chaud,
    premium: vivante?.premium,
    emprunt: true,
    supplement: emprunt.supplement || 0,
  };
}

function ligneParId(rubrique, id) {
  return rubrique.lignes.find((l) => l.id === id)
    || rubrique.puisees.find((l) => l.id === id)
    || rubrique.horsFenetre.find((l) => l.id === id)
    || null;
}

// Ce qui est retenu dans une rubrique : options du menu puis emprunts.
// `horsSaison` signale un choix fait pour une autre date (le groupe a été
// déplacé) : il reste visible pour qu'on le remplace, il ne part pas en cuisine.
export function selectionRubrique(rubrique, choix, menus) {
  const c = choix || choixVide();
  const items = (c.sections[rubrique.id]?.items || []).map((it) => {
    const ligne = ligneParId(rubrique, it.id);
    const horsSaison = !ligne || rubrique.horsFenetre.some((l) => l.id === it.id);
    return {
      cle: it.id,
      ligne: ligne || { id: it.id, libelle: it.libelle, section: rubrique.id },
      quantite: it.quantite,
      horsSaison,
      emprunt: false,
    };
  });
  const emprunts = (c.emprunts || []).filter((e) => e.section === rubrique.id).map((e) => ({
    cle: e.id,
    ligne: ligneEmprunt(e, menus),
    quantite: e.quantite,
    horsSaison: false,
    emprunt: true,
  }));
  return [...items, ...emprunts];
}

export function formuleChoisie(rubrique, choix) {
  const formules = Array.isArray(rubrique.regle.formules) ? rubrique.regle.formules : [];
  const id = choix?.formules?.[rubrique.id];
  return formules.find((f) => f.id === id) || null;
}

export function versionVege(rubrique, choix) {
  const v = choix?.sections?.[rubrique.id]?.vege;
  if (!v) return null;
  return ligneParId(rubrique, v.id) || { id: v.id, libelle: v.libelle, regime: 'vegetarien' };
}

// ── Convives ───────────────────────────────────────────────────────────────
// Les enfants (compris dans nb_pax) ont leur menu : ils ne sont pas comptés
// dans les plats du menu. Les végétariens sont comptés parmi les adultes.
export function convives(groupe) {
  const total = Math.max(0, Number(groupe?.nbPax) || 0);
  const enfants = Math.min(total, Math.max(0, Number(groupe?.nbEnfants) || 0));
  const adultes = total - enfants;
  const vegetariens = Math.min(adultes, Math.max(0, Number(groupe?.nbVegetariens) || 0));
  return { total, enfants, adultes, vegetariens };
}

// ── État d'une rubrique (ce qui manque) ────────────────────────────────────
// { complet, messages: [texte], resume } ; `complet` faux bloque la mention
// « choix complets », jamais l'enregistrement : un choix partiel se garde.
export function etatRubrique(rubrique, choix, menus, ctx) {
  const r = rubrique.regle;
  const sel = selectionRubrique(rubrique, choix, menus).filter((s) => !s.horsSaison);
  const messages = [];
  if (r.mode === 'servi') return { complet: true, messages, resume: 'Servi à tous' };

  if (r.mode === 'quantites') {
    sel.forEach((s) => {
      const min = Number(s.ligne.minimum) || 0;
      const q = Number(s.quantite) || 0;
      if (q > 0 && min > q) messages.push(`${s.ligne.libelle} : minimum ${min}`);
    });
    const pris = sel.filter((s) => Number(s.quantite) > 0).length;
    return { complet: true, messages, resume: pris ? `${pris} retenue${pris > 1 ? 's' : ''}` : 'Aucune' };
  }

  const formules = Array.isArray(r.formules) ? r.formules : [];
  const formule = formuleChoisie(rubrique, choix);
  if (formule?.aucunChoix) return { complet: true, messages, resume: formule.label };
  if (!sel.length) {
    if (r.facultatif) return { complet: true, messages, resume: 'Pas retenu' };
    return { complet: false, messages: ['À choisir'], resume: 'À choisir' };
  }
  if (formules.length && !formule) messages.push('Formule à choisir');
  if (formule && !formule.premium && sel.some((s) => s.ligne.premium)) {
    messages.push('Pièce premium retenue : formule premium nécessaire');
  }

  if (r.mode === 'carte') {
    const n = Number(r.retenir) || 3;
    const v = Number(r.dontVege) || 0;
    const veges = sel.filter((s) => estVege(s.ligne)).length;
    if (sel.length !== n) messages.push(`${sel.length} retenue${sel.length > 1 ? 's' : ''} sur ${n}`);
    if (veges < v) messages.push(`dont ${v} végétarienne à retenir`);
    const total = sel.reduce((s, x) => s + (Number(x.quantite) || 0), 0);
    if (total > 0 && total !== ctx.adultes) messages.push(`${total} assiettes réparties pour ${ctx.adultes} convives`);
    const complet = sel.length === n && veges >= v;
    return {
      complet,
      messages,
      resume: total > 0 ? `${sel.length} retenues, ${total} assiettes` : `${sel.length} retenue${sel.length > 1 ? 's' : ''} sur ${n}`,
      quantitesASaisir: total === 0,
    };
  }

  // table
  const n = Number(r.nombre) || 1;
  if (sel.length < n) messages.push(`${sel.length} sur ${n}`);
  if (sel.length > n) messages.push(`${sel.length} choisis pour ${n}`);
  const chauds = Number(r.auMoinsChaud) || 0;
  if (chauds && sel.filter((s) => s.ligne.chaud).length < chauds) {
    messages.push(`Au moins ${chauds} pièce chaude`);
  }
  const besoinVege = r.versionVege && sel.length === 1 && exigeVersionVege(sel[0].ligne) && ctx.vegetariens > 0;
  if (besoinVege && !versionVege(rubrique, choix)) messages.push('Version végétarienne à choisir');
  const complet = sel.length === n && !messages.some((m) => /à choisir|nécessaire|Au moins/.test(m));
  return { complet, messages, resume: `${sel.length} sur ${n}` };
}

// ── Production ─────────────────────────────────────────────────────────────
const parPersonneDe = (regle, ligne) => (
  Number(regle.parPersonne) > 0 ? Number(regle.parPersonne)
    : Number(ligne?.parPersonne) > 0 ? Number(ligne.parPersonne) : 1
);

// Ce que la cuisine produit pour ce groupe : un poste par plat, avec son
// nombre de portions. `aChoisir` liste les rubriques encore vides (rien n'est
// inventé à leur place), `estimation` marque une répartition faite en
// attendant les quantités du plan de table.
export function postesProduction({ groupe, menu, complements, menus }) {
  const ctx = convives(groupe);
  const choix = normaliserChoix(groupe?.choix);
  const rubriques = rubriquesDuChoix({ menu, complements, typeGroupe: groupe?.typeGroupe, dateISO: groupe?.dateEvenement });
  const postes = [];
  const aChoisir = [];

  rubriques.forEach((rub) => {
    const r = rub.regle;
    const ajouter = (ligne, portions, extra = {}) => {
      const p = Math.ceil(Number(portions) || 0);
      if (!(p > 0) || !ligne) return;
      postes.push({
        section: rub.id,
        sectionLabel: rub.label,
        ligneId: ligne.id,
        libelle: String(ligne.libelle || '').trim(),
        platId: ligne.platId || null,
        recetteIds: Array.isArray(ligne.recetteIds) ? ligne.recetteIds : [],
        parPersonne: parPersonneDe(r, ligne),
        portions: p,
        emprunt: !!ligne.emprunt,
        ...extra,
      });
    };

    if (r.mode === 'servi') {
      rub.lignes.forEach((l) => ajouter(l, ctx.adultes * parPersonneDe(r, l), { couverts: ctx.adultes }));
      return;
    }

    const sel = selectionRubrique(rub, choix, menus).filter((s) => !s.horsSaison);

    if (r.mode === 'quantites') {
      sel.forEach((s) => {
        const q = Number(s.quantite) || 0;
        if (q > 0) ajouter(s.ligne, q * (Number(s.ligne.portionsParUnite) || 1), { quantite: q, unite: s.ligne.unite || '' });
      });
      return;
    }

    const formule = formuleChoisie(rub, choix);
    if (formule?.aucunChoix) return;
    if (!sel.length) {
      if (!r.facultatif) aChoisir.push(rub.label);
      return;
    }

    if (r.mode === 'carte') {
      const total = sel.reduce((s, x) => s + (Number(x.quantite) || 0), 0);
      if (total > 0) {
        sel.forEach((s) => {
          const q = Number(s.quantite) || 0;
          ajouter(s.ligne, q * parPersonneDe(r, s.ligne), { couverts: q });
        });
        return;
      }
      // Répartition estimée : les végétariens sur les options végétariennes,
      // les autres convives à parts égales sur le reste. Arrondi au-dessus.
      const veges = sel.filter((s) => estVege(s.ligne));
      const autres = sel.filter((s) => !estVege(s.ligne));
      if (veges.length && autres.length && ctx.vegetariens > 0) {
        const partVege = Math.ceil(ctx.vegetariens / veges.length);
        const partAutre = Math.ceil((ctx.adultes - ctx.vegetariens) / autres.length);
        veges.forEach((s) => ajouter(s.ligne, partVege * parPersonneDe(r, s.ligne), { couverts: partVege, estimation: true }));
        autres.forEach((s) => ajouter(s.ligne, partAutre * parPersonneDe(r, s.ligne), { couverts: partAutre, estimation: true }));
      } else {
        const part = Math.ceil(ctx.adultes / sel.length);
        sel.forEach((s) => ajouter(s.ligne, part * parPersonneDe(r, s.ligne), { couverts: part, estimation: true }));
      }
      return;
    }

    // table
    if (r.versionVege && sel.length === 1 && exigeVersionVege(sel[0].ligne) && ctx.vegetariens > 0) {
      const principal = sel[0].ligne;
      ajouter(principal, (ctx.adultes - ctx.vegetariens) * parPersonneDe(r, principal), { couverts: ctx.adultes - ctx.vegetariens });
      const v = versionVege(rub, choix);
      if (v) ajouter(v, ctx.vegetariens * parPersonneDe(r, v), { couverts: ctx.vegetariens, vege: true });
      else aChoisir.push(`${rub.label}, version végétarienne`);
      return;
    }
    sel.forEach((s) => ajouter(s.ligne, ctx.adultes * parPersonneDe(r, s.ligne), { couverts: ctx.adultes }));
  });

  return { postes, aChoisir, convives: ctx, rubriques };
}

// « 30 couverts », « environ 34 couverts », « 156 pièces », « 12 douzaines ».
export function mentionPoste(p) {
  if (p.quantite != null) {
    const unite = p.unite ? ` ${p.unite}${p.quantite > 1 && !/s$/.test(p.unite) ? 's' : ''}` : '';
    return `${String(p.quantite).replace('.', ',')}${unite}`;
  }
  const n = p.parPersonne > 1 ? p.portions : (p.couverts ?? p.portions);
  const unite = p.parPersonne > 1 ? 'pièces' : (n > 1 ? 'couverts' : 'couvert');
  return `${p.estimation ? 'environ ' : ''}${n} ${unite}${p.vege ? ', végétariens' : ''}`;
}

// ── Tarif ──────────────────────────────────────────────────────────────────
const prixUnitaire = (texte) => {
  const m = String(texte || '').match(/(\d+(?:[.,]\d+)?)\s*CHF/);
  return m ? Number(m[1].replace(',', '.')) : null;
};

// Prix par personne : menu, suppléments des plats empruntés, formules (apéritif,
// gâteau maison) ; et à part le montant des stations, vendues à l'unité.
export function tarif({ menu, rubriques, choix, menus }) {
  const c = normaliserChoix(choix);
  const lignes = [];
  if (menu?.prixPax != null) lignes.push({ label: menu.nom ? `Menu ${menu.nom}` : 'Menu', prix: Number(menu.prixPax) });
  c.emprunts.forEach((e) => {
    if (Number(e.supplement)) {
      lignes.push({ label: `Supplément, ${ligneEmprunt(e, menus).libelle}`, prix: Number(e.supplement) });
    }
  });
  (rubriques || []).forEach((rub) => {
    const f = formuleChoisie(rub, c);
    if (f && Number(f.prix) > 0) lignes.push({ label: `${rub.label}, ${f.label.toLowerCase()}`, prix: Number(f.prix) });
  });
  let stations = 0;
  (rubriques || []).filter((rub) => rub.regle.mode === 'quantites').forEach((rub) => {
    selectionRubrique(rub, c, menus).forEach((s) => {
      const q = Number(s.quantite) || 0;
      const pu = prixUnitaire(s.ligne.prix);
      if (q > 0 && pu != null) stations += q * pu;
    });
  });
  const parPersonne = lignes.reduce((s, l) => s + l.prix, 0);
  return { lignes, parPersonne, stations };
}

export const formatChf = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace('.', ',')} CHF`;
};

// ── Liaison des plats à leurs fiches ───────────────────────────────────────
// Clé d'un plat entre menus : « même plat qu'au mariage à 95 » s'écrit de la
// même façon d'un PDF à l'autre, aux apostrophes et aux espaces près.
export const cleLibelle = (s) => normalizeSearch(String(s || '').replace(/[’']/g, "'"))
  .replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();

export const ligneReliee = (l) => !!(l?.platId || (Array.isArray(l?.recetteIds) && l.recetteIds.length));

// Clé de report d'une liaison : même libellé ET même saison. Un libellé
// identique vise une fiche différente selon la saison (« Mini tartelette de
// saison » : abricots l'été, fruits d'hiver l'hiver) ; relier la ligne d'été
// ne touche donc pas celle d'hiver. Une ligne sans saison (toute l'année) ne
// se reporte que vers les lignes sans saison, et inversement : elle sert les
// deux saisons, alors qu'une ligne d'été ou d'hiver de même libellé peut
// viser une autre fiche. Vide pour une ligne sans libellé, qui ne se reporte
// nulle part.
export const cleLiaison = (l) => {
  const libelle = cleLibelle(l?.libelle);
  return libelle ? `${libelle}|${l?.saison || ''}` : '';
};

// Applique une liaison à toutes les lignes de même clé (cleLiaison), dans
// tous les menus. Rend seulement les menus modifiés, prêts à enregistrer.
export function propagerLiaison(menus, cle, liaison) {
  if (!cle) return [];
  const platId = liaison?.platId || null;
  const recetteIds = Array.isArray(liaison?.recetteIds) ? liaison.recetteIds.filter(Boolean) : [];
  return (menus || []).map((m) => {
    let change = false;
    const lignes = (m.lignes || []).map((l) => {
      if (cleLiaison(l) !== cle) return l;
      if ((l.platId || null) === platId && JSON.stringify(l.recetteIds || []) === JSON.stringify(recetteIds)) return l;
      change = true;
      return { ...l, platId, recetteIds };
    });
    return change ? { ...m, lignes } : null;
  }).filter(Boolean);
}

export const estComplements = (menu) => Number(menu?.numero) === NUMERO_COMPLEMENTS;
