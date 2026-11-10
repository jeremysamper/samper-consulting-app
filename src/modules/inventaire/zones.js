// ─────────────────────────────────────────────────────────────────────────────
// Zones de stockage d'un inventaire (Cave, Économat, Froid positif, Froid
// négatif...).
//
// Une zone est portée par chaque ligne du JSONB `lignes` : pas de table. Elle
// sert à deux choses : compter une zone après l'autre, dans l'ordre où l'on
// fait le tour, et ventiler l'état d'inventaire (colonne « Zone » et synthèse
// par zone de l'export).
//
// Un produit peut vivre dans deux zones (le même beurre au frais et en
// surgélation) : `zones` en garde la liste, `zone` la première (lue telle
// quelle par les anciennes versions de l'app et par les exports). Une ligne à
// plusieurs zones se compte zone par zone : `parZone` garde la quantité de
// chaque zone ({ q, le }), `stockReel` leur somme (RPC
// inventaire_saisir_stock_zone, migration 20261106).
// ─────────────────────────────────────────────────────────────────────────────

// Les quatre zones du tour, dans l'ordre, proposées en cases sur chaque produit.
export const ZONES_PRINCIPALES = ['Cave', 'Économat', 'Froid positif', 'Froid négatif'];

// Anciennes suggestions, gardées pour l'ordre du tour des lignes déjà rangées.
export const ZONES_SUGGEREES = [...ZONES_PRINCIPALES, 'Chambre froide', 'Congélateur', 'Bar', 'Réserve'];

export const SANS_ZONE = 'Sans zone';

const propre = (z) => String(z || '').trim();

// Zones d'une ligne, sans doublon ; [] si elle n'est rangée nulle part.
export const zonesOf = (ligne) => {
  const liste = Array.isArray(ligne?.zones) && ligne.zones.length ? ligne.zones : [ligne?.zone];
  return Array.from(new Set(liste.map(propre).filter(Boolean)));
};

// Première zone : celle des exports et des anciennes versions.
export const zoneOf = (ligne) => zonesOf(ligne)[0] || '';

// Libellé de la zone d'une ligne dans un export ou une étiquette.
export const libelleZones = (ligne) => zonesOf(ligne).join(' + ');

export const estMultiZone = (ligne) => zonesOf(ligne).length > 1;

export const dansLaZone = (ligne, zone) => zonesOf(ligne).includes(zone);

// Quantité comptée dans une zone d'une ligne à plusieurs zones (null = pas encore).
export const quantiteZone = (ligne, zone) => {
  const v = ligne?.parZone?.[zone];
  return v && v.q != null && v.q !== '' ? Number(v.q) : null;
};

// Somme des quantités par zone (null si aucune zone n'est comptée).
export const sommeParZone = (parZone) => {
  const valeurs = Object.values(parZone || {}).filter(v => v && v.q != null && v.q !== '');
  return valeurs.length ? +valeurs.reduce((s, v) => s + (Number(v.q) || 0), 0).toFixed(4) : null;
};

// Range une ligne dans une liste de zones (vide = retirer toute zone). Le
// comptage déjà fait reste juste : passer de une à deux zones attribue la
// quantité comptée à la première zone ; revenir à une zone garde la somme des
// zones restantes.
export const avecZones = (ligne, zonesVoulues) => {
  const zones = Array.from(new Set((zonesVoulues || []).map(propre).filter(Boolean)));
  const { zone: _z, zones: _zs, parZone: ancien, ...reste } = ligne;
  if (zones.length === 0) return reste;
  if (zones.length === 1) {
    const base = { ...reste, zone: zones[0] };
    if (!ancien) return base;
    // La zone gardée était comptée : elle seule reste. Sinon le produit a
    // changé de place, son total compté le suit.
    const somme = sommeParZone(ancien[zones[0]] ? { [zones[0]]: ancien[zones[0]] } : {});
    return somme != null ? { ...base, stockReel: somme } : base;
  }
  let parZone = {};
  if (ancien) {
    zones.forEach(z => { if (ancien[z]) parZone[z] = ancien[z]; });
  } else if (ligne.stockReel != null && ligne.stockReel !== '') {
    const premiere = zonesOf(ligne)[0] && zones.includes(zonesOf(ligne)[0]) ? zonesOf(ligne)[0] : zones[0];
    parZone = { [premiere]: { q: Number(ligne.stockReel), le: ligne.compteLe || new Date().toISOString() } };
  }
  const base = { ...reste, zone: zones[0], zones };
  if (!Object.keys(parZone).length) return ancien ? { ...base, stockReel: null } : base;
  return { ...base, parZone, stockReel: sommeParZone(parZone) };
};

// Zone proposée pour un produit qu'on ajoute sans être dans une zone :
// d'après son nom puis sa catégorie. Vide quand rien ne la désigne.
const FROID_NEGATIF = /(surgel|congel|sorbet|frozen|creme glacee|\bglaces\b)/;
const CAVE = /(\bvins?\b|biere|cidre|champagne|prosecco|spiritueux|whisky|rhum|\bgin\b|vodka|liqueur|eau-de-vie|grappa|cognac|porto|martini|aperol|campari|limonade|coca|tonic|eau minerale|henniez|ice tea)/;
const FROID_POSITIF = /(viande|volaille|poulet|boeuf|veau|porc|agneau|canard|poisson|saumon|truite|crevette|fruits de mer|\blait\b|creme|beurre|fromage|yaourt|yogourt|seret|mascarpone|mozzarella|\boeufs?\b|jambon|\blard\b|saucisse|charcuterie|salade|herbes fraiches|\bfrais\b|tofu)/;
const ECONOMAT = /(farine|sucre|\bsel\b|poivre|epice|huile|vinaigre|\briz\b|pates|semoule|polenta|conserve|cereale|chocolat|cacao|levure|fecule|amande|noisette|\bnoix\b|graine|lentille|bouillon|moutarde|ketchup|confiture|\bmiel\b|biscuit|\bcafe\b|\bthe\b|infusion|sachet|papier|emballage|nettoyant)/;

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const zoneSuggeree = (ligne) => {
  const nom = sansAccents(ligne?.produit);
  const cat = sansAccents(ligne?.categorie);
  if (FROID_NEGATIF.test(nom)) return 'Froid négatif';
  if (ECONOMAT.test(nom)) return 'Économat';
  if (CAVE.test(nom) || /boisson|\bvins?\b|cave/.test(cat)) return 'Cave';
  // Une préparation maison (fiche recette) se garde au frais.
  if (ligne?.recetteId || FROID_POSITIF.test(nom) || /viande|poisson|laitier|legume|fruit/.test(cat)) return 'Froid positif';
  if (/epicerie|feculent/.test(cat)) return 'Économat';
  return '';
};

// Zones présentes dans des lignes, dans l'ordre du tour : les zones connues
// d'abord (cave, économat, froid positif, froid négatif), les autres ensuite
// par ordre alphabétique.
export const ordreZones = (zones) => {
  const rang = (z) => {
    const i = ZONES_SUGGEREES.indexOf(z);
    return i === -1 ? ZONES_SUGGEREES.length : i;
  };
  return Array.from(new Set(zones.filter(Boolean)))
    .sort((a, b) => rang(a) - rang(b) || a.localeCompare(b, 'fr'));
};

export const zonesDesLignes = (lignes) => ordreZones((lignes || []).flatMap(zonesOf));

// Options d'une liste de choix : zones déjà utilisées, puis zones du tour.
export const optionsZones = (lignes) => ordreZones([...zonesDesLignes(lignes), ...ZONES_PRINCIPALES]);
