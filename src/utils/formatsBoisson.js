// ─────────────────────────────────────────────────────────────
// Formats de vente d'une boisson (table plat_formats, migration
// 20261122_carte_boissons_formats) : « 1 dl », « 50 cl »... chacun
// avec son prix. Partagé par la Carte des boissons, la Caisse, la
// page publique de commande et les rapports.
//
// Contrat de la base : une ligne de caisse vendue dans un format
// garde plat_id et porte dans options l'élément
//   { type: 'format', id: <plat_formats.id>, valeur: <libellé> },
// son libellé dit « Nom, 1 dl ». La base lit le prix du format et
// refuse une ligne sans format sur un plat qui ne se vend que dans
// ses formats.
//
// Util pur (ni React ni DOM).
// ─────────────────────────────────────────────────────────────

export const LIBELLE_FORMAT_MAX = 20;

const nombre = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Formats rangés comme la base les rend : ordre, puis libellé.
export function trierFormats(formats) {
  return [...(formats || [])].sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0)
    || String(a.libelle).localeCompare(String(b.libelle), 'fr'));
}

// Formats par plat, depuis les lignes de plat_formats.
export function formatsParPlat(lignes) {
  const m = new Map();
  (lignes || []).forEach((f) => {
    if (!f?.plat_id) return;
    if (!m.has(f.plat_id)) m.set(f.plat_id, []);
    m.get(f.plat_id).push({ id: f.id, libelle: f.libelle, prix: Number(f.prix), ordre: Number(f.ordre) || 0 });
  });
  m.forEach((liste, id) => m.set(id, trierFormats(liste)));
  return m;
}

// Volume d'un libellé en centilitres (« 1 dl » = 10, « 37,5 cl » = 37.5,
// « 1,5 l » = 150), ou null pour un libellé sans volume (« verre »).
export function volumeEnCl(libelle) {
  const m = String(libelle || '').trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*(ml|cl|dl|l)\b/);
  if (!m) return null;
  const n = nombre(m[1]);
  if (n == null) return null;
  return { ml: n / 10, cl: n, dl: n * 10, l: n * 100 }[m[2]];
}

const cleLibelle = (l) => String(l || '').trim().toLowerCase();

// Colonnes de formats d'une rubrique, comme sur une carte papier : les
// libellés présents, du plus petit volume au plus grand, les libellés sans
// volume ensuite.
export function colonnesFormats(boissons) {
  const vus = new Map();
  (boissons || []).forEach((b) => (b.formats || []).forEach((f) => {
    const k = cleLibelle(f.libelle);
    if (k && !vus.has(k)) vus.set(k, f.libelle);
  }));
  return [...vus.values()].sort((a, b) => {
    const va = volumeEnCl(a);
    const vb = volumeEnCl(b);
    if (va != null && vb != null && va !== vb) return va - vb;
    if (va != null && vb == null) return -1;
    if (va == null && vb != null) return 1;
    return a.localeCompare(b, 'fr');
  });
}

// Le format d'une boisson qui porte ce libellé (colonne), ou null.
export const formatDeLibelle = (boisson, libelle) =>
  (boisson?.formats || []).find((f) => cleLibelle(f.libelle) === cleLibelle(libelle)) || null;

// Prix à afficher sur une case ou une ligne : un format, son prix ; plusieurs,
// le plus petit, précédé de « dès » ; aucun, le prix de vente du plat.
export function prixAffiche(boisson) {
  const formats = boisson?.formats || [];
  if (formats.length) {
    const prix = Math.min(...formats.map((f) => Number(f.prix) || 0));
    return { prix, des: formats.length > 1 };
  }
  const p = boisson?.prixVente ?? boisson?.prix ?? null;
  return { prix: p == null ? null : Number(p), des: false };
}

// ── Lignes de caisse ──

export const libelleAvecFormat = (nom, libelleFormat) => (libelleFormat ? `${nom}, ${libelleFormat}` : nom);

export function optionFormat(format) {
  return { type: 'format', id: format.id, valeur: format.libelle };
}

export function formatDeLigne(ligne) {
  const o = (Array.isArray(ligne?.options) ? ligne.options : []).find((x) => x?.type === 'format');
  return o ? { id: o.id || null, libelle: o.valeur || '' } : null;
}

// Format lu dans le libellé d'une ligne (« Fendant, Fils de Charles Favre
// (Sion), 1 dl » -> « 1 dl ») : le dernier segment après « , » quand il dit un
// volume. Repli des rapports quand leur lecture (caisse_rapport_donnees) ne
// rend pas la clé options, ce qu'elle fait depuis le lot C (migration
// 20261123_carte_boissons_droits). Un format sans volume (« Verre ») n'y est
// pas lu.
export function formatDuLibelle(libelle) {
  const t = String(libelle || '');
  const i = t.lastIndexOf(', ');
  if (i <= 0) return null;
  const fin = t.slice(i + 2).trim();
  return volumeEnCl(fin) != null && fin.length <= LIBELLE_FORMAT_MAX ? fin : null;
}

export const optionsSansFormat = (options) => (Array.isArray(options) ? options : []).filter((o) => o?.type !== 'format');

// Une ligne « nue » dans ce format (ou sans format) : même format, sans
// note ni autre paramètre. C'est la seule où un toucher de plus fait +1.
export function ligneNueDuFormat(ligne, format) {
  if (ligne?.note || optionsSansFormat(ligne?.options).length) return false;
  const f = formatDeLigne(ligne);
  return format ? f?.id === format.id : !f;
}

// ── Saisie des formats (Carte des boissons) ──

// Formats saisis -> formats propres, ou { erreur } à dire à la personne.
// Une ligne vide (ni libellé ni prix) est ignorée.
export function validerFormats(saisis) {
  const propres = [];
  const vus = new Set();
  for (const s of saisis || []) {
    const libelle = String(s?.libelle ?? '').trim();
    const brut = String(s?.prix ?? '').trim();
    if (!libelle && !brut) continue;
    if (!libelle) return { erreur: 'Donnez un nom à chaque format, par exemple 1 dl ou 75 cl.' };
    if (libelle.length > LIBELLE_FORMAT_MAX) return { erreur: `Le nom d'un format tient en ${LIBELLE_FORMAT_MAX} signes au plus.` };
    const prix = nombre(brut);
    if (prix == null || prix <= 0) return { erreur: `Indiquez un prix pour le format ${libelle}.` };
    const k = cleLibelle(libelle);
    if (vus.has(k)) return { erreur: `Le format ${libelle} est saisi deux fois.` };
    vus.add(k);
    propres.push({ id: s.id || null, libelle, prix: Math.round(prix * 100) / 100, ordre: propres.length });
  }
  return { formats: propres };
}
