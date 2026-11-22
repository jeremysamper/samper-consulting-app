// ─────────────────────────────────────────────────────────────────────────────
// Commande V1 (plan 15, lot 4, décision D3) : une commande par fournisseur et
// par livraison. On tape seulement « il en reste combien » ; la quantité vient
// du stock cible du jour de livraison, plus les besoins des groupes, arrondie
// au conditionnement supérieur. Util pur, sans React ni base.
//
// La règle de quantité a une seule source en base
// (commande_quantite_arrondie, recopiée dans quantite_calculee à chaque
// écriture) ; elle est recopiée ici pour l'affichage en direct pendant la
// frappe, et la valeur enregistrée est relue ensuite.
// ─────────────────────────────────────────────────────────────────────────────

import { zurichAjouterJours, zurichDateHeure, zurichNowMinutes, zurichToday } from '../../utils/zurichTime.js';

// Copie de commande_quantite_arrondie. Null tant que rien n'est connu (la
// ligne attend son reste), 0 si le besoin est nul.
export function quantiteArrondie(cible, reste, groupes, conditionnement) {
  const connu = (v) => v !== null && v !== undefined && v !== '';
  const partStock = !connu(cible) || !connu(reste) ? null : Math.max(Number(cible) - Number(reste), 0);
  const partGroupes = Math.max(Number(groupes) || 0, 0);
  if (partStock == null && partGroupes === 0) return null;
  const besoin = (partStock || 0) + partGroupes;
  if (besoin <= 0) return 0;
  const c = Number(conditionnement);
  if (!(c > 0)) return besoin;
  return Math.round(Math.ceil(besoin / c - 1e-9) * c * 1e6) / 1e6;
}

// Quantité retenue d'une ligne : la saisie libre si elle existe, sinon le
// calcul (en direct, avec le reste en cours de frappe s'il est donné).
export function quantiteRetenue(ligne, resteEnCours) {
  if (ligne?.quantite !== null && ligne?.quantite !== undefined) return Number(ligne.quantite);
  const reste = resteEnCours !== undefined ? resteEnCours : ligne?.reste;
  return quantiteArrondie(ligne?.stock_cible, reste, ligne?.besoin_groupes, ligne?.conditionnement);
}

// ── Unités ───────────────────────────────────────────────────────────────────
// La base compte dans l'unité de référence du produit (g, ml, pcs) ; la
// cuisine lit et tape en kg, en litres ou en pièces.
export function uniteAffichage(uniteRef) {
  if (uniteRef === 'g') return { libelle: 'kg', facteur: 1000 };
  if (uniteRef === 'ml') return { libelle: 'l', facteur: 1000 };
  if (uniteRef === 'pcs' || uniteRef === 'pce') return { libelle: 'pièces', facteur: 1 };
  return { libelle: uniteRef || '', facteur: 1 };
}

const arrondi = (n, chiffres = 3) => Math.round(Number(n) * 10 ** chiffres) / 10 ** chiffres;
export const nombreFr = (n) => String(arrondi(n)).replace('.', ',');

// Quantité de base vers le texte affiché : 2500 g → « 2,5 kg ».
export function formatQuantite(q, uniteRef) {
  if (q === null || q === undefined || q === '') return '';
  const u = uniteAffichage(uniteRef);
  return `${nombreFr(Number(q) / u.facteur)} ${u.libelle}`.trim();
}

// Valeur de champ (unité d'affichage) depuis la base, et l'inverse.
export function versChamp(q, uniteRef) {
  if (q === null || q === undefined || q === '') return '';
  return nombreFr(Number(q) / uniteAffichage(uniteRef).facteur);
}
export function depuisChamp(texte, uniteRef) {
  const t = String(texte ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined; // illisible
  return arrondi(n * uniteAffichage(uniteRef).facteur, 3);
}

// Colis : 20000 g en cartons de 10 kg → 2. Null sans conditionnement.
export function nombreColis(q, conditionnement) {
  const c = Number(conditionnement);
  if (q === null || q === undefined || !(c > 0)) return null;
  return arrondi(Number(q) / c, 2);
}

// Texte de la quantité à commander : « 2 × Carton 10 kg (20 kg) », ou la
// quantité seule sans conditionnement connu.
export function libelleCommande(ligne, q) {
  if (q === null || q === undefined) return '';
  const n = nombreColis(q, ligne?.conditionnement);
  const total = formatQuantite(q, ligne?.unite);
  if (n == null) return total;
  const libelle = String(ligne?.conditionnement_libelle || '').trim() || 'colis';
  return `${nombreFr(n)} × ${libelle} (${total})`;
}

// ── Jours et heures ──────────────────────────────────────────────────────────
// 1 = lundi à 7 = dimanche, comme isodow et commande_cibles.jour_livraison.
export function jourIso(dateISO) {
  const [y, m, d] = String(dateISO).split('-').map(Number);
  const j = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return j === 0 ? 7 : j;
}

const NOMS_JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
// « mercredi 25.11 ».
export function jourEnClair(dateISO) {
  if (!dateISO) return '';
  const [, m, d] = String(dateISO).split('-');
  return `${NOMS_JOURS[jourIso(dateISO)]} ${d}.${m}`;
}

// Prochaine livraison encore commandable : un des jours de livraison du
// fournisseur dont l'heure limite (veille selon le délai, heure de Zurich)
// n'est pas passée. Même calcul que la base pour envoyer_avant. Null sans
// jours de livraison réglés.
export function prochaineLivraison(fournisseur, maintenant = { jour: zurichToday(), minutes: zurichNowMinutes() }) {
  const jours = Array.isArray(fournisseur?.jours_livraison) ? fournisseur.jours_livraison : [];
  if (!jours.length) return null;
  const delai = Number.isInteger(fournisseur?.delai_commande_jours) ? fournisseur.delai_commande_jours : 1;
  const heure = fournisseur?.heure_limite ? String(fournisseur.heure_limite).slice(0, 5) : null;
  const [hh, mm] = (heure || '23:59').split(':').map(Number);
  const limiteMinutes = hh * 60 + mm;
  for (let d = 0; d < 22; d += 1) {
    const date = zurichAjouterJours(maintenant.jour, d);
    if (!jours.includes(jourIso(date))) continue;
    const limite = zurichAjouterJours(date, -delai);
    if (limite < maintenant.jour) continue;
    if (limite === maintenant.jour && maintenant.minutes >= limiteMinutes) continue;
    return { date, limite, heure };
  }
  return null;
}

// Heure limite d'une commande, en clair : « mardi 24.11 à 18:00 ».
export function limiteEnClair(envoyerAvantIso) {
  if (!envoyerAvantIso) return '';
  const z = zurichDateHeure(envoyerAvantIso);
  return `${jourEnClair(z.jour)} à ${z.heure}`;
}

export function limitePassee(envoyerAvantIso, maintenant = new Date()) {
  return !!envoyerAvantIso && new Date(envoyerAvantIso).getTime() < maintenant.getTime();
}

// ── Courriel au fournisseur ──────────────────────────────────────────────────
// Le texte du brouillon : une ligne par produit commandé, quantité en colis
// quand le conditionnement est connu, référence du fournisseur si elle existe.
export function courrielCommande({ fournisseur, commande, lignes, etablissement }) {
  const maison = etablissement?.nom || '';
  const aCommander = (lignes || [])
    .map((l) => ({ l, q: quantiteRetenue(l) }))
    .filter(({ q }) => q !== null && q > 0);
  const sujet = `Commande ${maison ? `${maison} ` : ''}pour la livraison du ${jourEnClair(commande?.date_livraison)}`.replace(/\s+/g, ' ').trim();
  const lignesTexte = aCommander.map(({ l, q }) => {
    const ref = l.reference_fourn ? ` (réf. ${l.reference_fourn})` : '';
    return `- ${l.nom}${ref} : ${libelleCommande(l, q)}`;
  });
  const corps = [
    'Bonjour,',
    '',
    `Voici notre commande pour la livraison du ${jourEnClair(commande?.date_livraison)} :`,
    '',
    ...lignesTexte,
    '',
    ...(commande?.note ? [commande.note, ''] : []),
    'Merci de nous confirmer la livraison.',
    '',
    'Meilleures salutations,',
    maison,
  ].join('\n').trim();
  return { a: fournisseur?.email || '', sujet, corps, nbLignes: aCommander.length };
}

// Brouillon Gmail préécrit (fenêtre de rédaction plein écran, compte déjà
// connecté), mailto en repli : même forme que les factures.
export function lienGmail({ a = '', sujet = '', corps = '' }) {
  const params = new URLSearchParams({ view: 'cm', fs: '1', tf: '1', to: a, su: sujet, body: corps });
  return `https://mail.google.com/mail/?${params.toString()}`;
}
export function lienMailto({ a = '', sujet = '', corps = '' }) {
  return `mailto:${encodeURIComponent(a)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
}

// Charge utile du PDF partagé (pdfUtils.exportCommandePdf) : une rubrique,
// les produits commandés avec leur quantité en colis.
export function pdfCommande({ fournisseur, commande, lignes }) {
  const items = (lignes || [])
    .map((l) => ({ l, q: quantiteRetenue(l) }))
    .filter(({ q }) => q !== null && q > 0)
    .map(({ l, q }) => ({ nom: l.nom, qtyText: libelleCommande(l, q), coche: false }));
  return {
    titre: `Commande ${fournisseur?.nom || commande?.fournisseur_nom || ''}`.trim(),
    sousTitre: `Livraison du ${jourEnClair(commande?.date_livraison)}`,
    totalCount: items.length,
    sansCompteurCoche: true,
    groups: [{ categorie: fournisseur?.nom || commande?.fournisseur_nom || 'Commande', items }],
  };
}

// ── Besoins des groupes ──────────────────────────────────────────────────────
// Liste de courses d'un groupe (Groupes, computeListeCourses) ramenée aux
// produits d'un fournisseur : { produitId: quantité dans l'unité de référence }.
// Les unités canoniques de la liste (g, ml, pcs) sont celles du catalogue ;
// une ligne d'une autre famille n'est pas comptée.
export function besoinsGroupePourFournisseur(liste, produitsFournisseur) {
  const parId = new Map((produitsFournisseur || []).map((p) => [p.id, p]));
  const memeFamille = (u, ref) => u === ref || (['pcs', 'pce'].includes(u) && ['pcs', 'pce'].includes(ref));
  const besoins = {};
  (liste?.items || []).forEach((it) => {
    const p = it.produitId ? parId.get(it.produitId) : null;
    if (!p || !memeFamille(it.unite, p.unite_ref) || !(Number(it.besoin) > 0)) return;
    besoins[p.id] = arrondi((besoins[p.id] || 0) + Number(it.besoin), 3);
  });
  return besoins;
}

// Groupes à prendre dans la commande d'une livraison : ceux qui ont lieu
// entre la livraison et le délai d'alerte des groupes (14 jours par défaut),
// pas annulés, et pas encore portés dans une commande de ce fournisseur.
export function groupesAPrendre(groupes, { dateLivraison, delaiJours = 14, dejaPris = new Set() }) {
  if (!dateLivraison) return [];
  const fin = zurichAjouterJours(dateLivraison, delaiJours);
  return (groupes || []).filter((g) => g?.dateEvenement
    && g.dateEvenement >= dateLivraison && g.dateEvenement <= fin
    && !g.annule && !dejaPris.has(g.id));
}
