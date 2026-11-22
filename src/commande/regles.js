// ─────────────────────────────────────────────────────────────────────────────
// Commande par QR (lot L3) : règles pures, partagées par la page publique
// (/commande/<adresse>), la démo et les réglages de la caisse.
//
// Le serveur (commande_qr_envoyer, migration 20261122_caisse_commande_qr)
// revérifie tout : ces règles ne servent qu'à guider le client avant l'envoi.
// Mêmes bornes des deux côtés : 20 lignes, 10 par produit, 30 articles,
// prénom de 1 à 40 signes, table de 1 à 20 signes.
// Montants en centimes pour les calculs, rendus en francs.
// ─────────────────────────────────────────────────────────────────────────────

export const LIMITES = { lignes: 20, parProduit: 10, articles: 30, prenom: 40, table: 20 };
export const PLAGES_MAX = 4;

const centimes = (prix) => Math.round(Number(prix || 0) * 100);

// ── Panier : { [platId]: quantite } ──

export function quantiteDe(panier, platId) {
  return Number(panier?.[platId]) || 0;
}

export function nbArticles(panier) {
  return Object.values(panier || {}).reduce((s, q) => s + (Number(q) || 0), 0);
}

// Un de plus, si les bornes le permettent ; sinon le panier tel quel.
export function ajouter(panier, platId) {
  const actuel = quantiteDe(panier, platId);
  const lignes = Object.keys(panier || {}).length;
  if (actuel >= LIMITES.parProduit) return panier;
  if (nbArticles(panier) >= LIMITES.articles) return panier;
  if (actuel === 0 && lignes >= LIMITES.lignes) return panier;
  return { ...panier, [platId]: actuel + 1 };
}

// Un de moins ; à zéro, la ligne disparaît.
export function retirer(panier, platId) {
  const actuel = quantiteDe(panier, platId);
  if (actuel <= 0) return panier;
  const suite = { ...panier };
  if (actuel === 1) delete suite[platId];
  else suite[platId] = actuel - 1;
  return suite;
}

// Ce qui peut encore s'ajouter : la page grise le « + » sinon.
export function peutAjouter(panier, platId) {
  return ajouter(panier, platId) !== panier;
}

// Les lignes du panier, dans l'ordre de la carte, au prix affiché.
// Un produit qui n'est plus à la carte (rupture, catégorie fermée) sort.
export function lignesPanier(panier, produits) {
  return (produits || [])
    .filter((p) => quantiteDe(panier, p.id) > 0)
    .map((p) => ({ id: p.id, nom: p.nom, prix: Number(p.prix) || 0, quantite: quantiteDe(panier, p.id) }));
}

export function totalPanier(panier, produits) {
  const c = lignesPanier(panier, produits).reduce((s, l) => s + l.quantite * centimes(l.prix), 0);
  return c / 100;
}

// Le panier réduit aux produits encore proposés (après relecture de la carte).
export function nettoyerPanier(panier, produits) {
  const ids = new Set((produits || []).map((p) => p.id));
  const suite = {};
  Object.entries(panier || {}).forEach(([id, q]) => {
    const n = Math.min(Math.floor(Number(q) || 0), LIMITES.parProduit);
    if (ids.has(id) && n > 0) suite[id] = n;
  });
  return suite;
}

// Charge de l'envoi : jamais de prix, le serveur prend les siens.
export function chargeLignes(panier) {
  return Object.entries(panier || {})
    .filter(([, q]) => Number(q) > 0)
    .map(([plat_id, q]) => ({ plat_id, quantite: Math.floor(Number(q)) }));
}

// ── Prénom et table ──

export function prenomPropre(texte) {
  return String(texte || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tablePropre(texte) {
  return String(texte || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

// Rend null quand l'envoi peut partir, sinon le code de ce qui manque
// (mêmes codes que la réponse du serveur).
export function verifierEnvoi({ panier, produits, prenom, auBar, table }) {
  const lignes = lignesPanier(panier, produits);
  if (!lignes.length) return 'vide';
  if (lignes.length > LIMITES.lignes || nbArticles(panier) > LIMITES.articles
      || lignes.some((l) => l.quantite < 1 || l.quantite > LIMITES.parProduit)) return 'panier';
  if (!auBar) {
    const t = tablePropre(table);
    if (t.length < 1 || t.length > LIMITES.table) return 'table';
  }
  const p = prenomPropre(prenom);
  if (p.length < 1 || p.length > LIMITES.prenom) return 'prenom';
  return null;
}

// ── Horaires : plages { de: 'HH:MM', a: 'HH:MM' } de tous les jours ──

const HEURE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function plageValide(p) {
  return Boolean(p) && HEURE.test(p.de || '') && HEURE.test(p.a || '') && p.de !== p.a;
}

export function plagesValides(plages) {
  return Array.isArray(plages) && plages.length <= PLAGES_MAX && plages.every(plageValide);
}

// Miroir de caisse_qr_ouvert : aucune plage = à toute heure ; « a » exclu ;
// une plage qui passe minuit (de > a) couvre le soir et le petit matin.
// minutesZurich : l'heure de Zurich en minutes depuis minuit.
export function ouvertMaintenant(plages, minutesZurich) {
  if (!Array.isArray(plages)) return false;
  if (!plages.length) return true;
  return plages.some((p) => {
    if (!plageValide(p)) return false;
    const de = minutes(p.de);
    const a = minutes(p.a);
    if (de < a) return minutesZurich >= de && minutesZurich < a;
    return minutesZurich >= de || minutesZurich < a;
  });
}

// « de 17 h 00 à 23 h 30 », pour la page et les réglages.
export function libellePlage(p) {
  const h = (s) => `${Number(s.slice(0, 2))} h ${s.slice(3, 5)}`;
  return `de ${h(p.de)} à ${h(p.a)}`;
}

// ── Adresse de la page : /commande/<slug> ──

const FORME_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function slugValide(slug) {
  return FORME_SLUG.test(String(slug || '')) && !String(slug).startsWith('demo');
}

// Une adresse lisible tirée du nom de la maison, avec un suffixe au hasard :
// elle ne se devine pas depuis le nom seul. alea : cinq signes [a-z0-9].
export function slugDepuisNom(nom, alea) {
  const base = String(nom || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 24).replace(/-+$/g, '');
  const suffixe = String(alea || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'qr';
  let slug = base ? `${base}-${suffixe}` : `commande-${suffixe}`;
  if (slug.startsWith('demo')) slug = `qr-${slug}`;
  return slug;
}

export function aleaSlug(hasard = Math.random) {
  const signes = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 5 }, () => signes[Math.floor(hasard() * signes.length)]).join('');
}

export const estAdresseDemo = (slug) => String(slug || '').startsWith('demo');
