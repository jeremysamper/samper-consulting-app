// ─────────────────────────────────────────────────────────────────────────────
// Bons cadeaux : règles pures, partagées par l'écran, l'encaissement et les
// tests (codeBon.test.mjs). La base tient les mêmes règles
// (migration 20261119_caisse_bons_cadeaux) : l'écran ne fait que les refléter.
//
// Code : 8 signes d'un alphabet sans 0, O, 1, I ni L, écrit XXXX-XXXX. Le QR
// porte le lien de l'app vers le bon (lienDuBon, 19.11.2026) : l'appareil
// photo d'un téléphone l'ouvre directement, et le lien ne dit rien de plus
// que le code imprimé en clair. Le lecteur de la caisse lit le lien comme le
// code seul des premiers bons.
// ─────────────────────────────────────────────────────────────────────────────

export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SIGNE = '[A-HJKMNP-Z2-9]';
const CODE_DANS_TEXTE = new RegExp(`(${SIGNE}{4})[\\s-]?(${SIGNE}{4})`);

// L'origine publique de l'app, comme la réservation en ligne : un bon imprimé
// depuis une préversion mène quand même à l'app de production.
export const ORIGINE_APP = 'https://samperconsulting-app.com';
export const lienDuBon = (code) => `${ORIGINE_APP}/?bon=${encodeURIComponent(code)}`;

// Le code porté par un lien (« ?bon= »), ou null : le paramètre passe avant
// la fouille du texte, où le nom de domaine pourrait faire huit signes.
function codeDuLien(texte) {
  const m = String(texte).match(/[?&]bon=([^&#\s]+)/i);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

export const MONTANTS_RAPIDES = [20, 50, 100, 150, 200];
export const MONTANT_MAX = 5000;
export const VALIDITES = [
  { id: '12', label: '1 an', mois: 12 },
  { id: '24', label: '2 ans', mois: 24 },
  { id: '36', label: '3 ans', mois: 36 },
  { id: 'sans', label: 'Sans limite', mois: null },
];
export const VALIDITE_DEFAUT = '24';

// Ce qu'on tape ou ce que lit le QR → « ABCD-EFGH », ou null. Les minuscules,
// les espaces et le tiret sont tolérés ; un texte plus long (un QR qui
// porterait autre chose autour) est fouillé. Un lien de bon rend son code.
export function normaliserCode(texte) {
  if (texte == null) return null;
  const lien = codeDuLien(texte);
  const brut = String(lien ?? texte).toUpperCase();
  const m = lien != null ? brut.match(new RegExp(`^\\s*(${SIGNE}{4})[\\s-]?(${SIGNE}{4})\\s*$`)) : brut.match(CODE_DANS_TEXTE);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

// Une saisie au clavier qui ressemble à un lien (une douchette qui tape le
// lien du QR, un lien collé) : son code, sinon la saisie mise en forme.
export function saisieDuCode(texte) {
  const v = String(texte || '');
  if (/[/?=:.]/.test(v) || v.replace(/[\s-]/g, '').length > 8) {
    const code = normaliserCode(v);
    if (code) return code;
  }
  return formaterSaisie(v);
}

// Saisie au clavier : majuscules, signes hors alphabet retirés, tiret posé
// après le quatrième signe.
export function formaterSaisie(texte) {
  const signes = String(texte || '').toUpperCase().split('').filter((c) => ALPHABET.includes(c)).slice(0, 8).join('');
  return signes.length > 4 ? `${signes.slice(0, 4)}-${signes.slice(4)}` : signes;
}

// Téléphone : chiffres et espaces, un + en tête permis, au moins 6 chiffres.
export function telephoneValide(t) {
  const v = String(t || '').trim().replace(/\s+/g, ' ');
  return /^\+?[0-9][0-9 ]{5,22}$/.test(v) && v.replace(/[^0-9]/g, '').length >= 6;
}

// Montant d'un bon : positif, au plus 5000, multiple de 5 centimes (il peut se
// payer en espèces). Rend le nombre arrondi au centime, ou null.
export function montantValide(v) {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  if (!Number.isFinite(n)) return null;
  const c = Math.round(n * 100);
  if (c <= 0 || c > MONTANT_MAX * 100 || c % 5 !== 0) return null;
  return c / 100;
}

// « 2026-11-19 » + n mois → « 2028-11-19 » (fin de mois ramenée : 31.01 + 1 mois = 28.02).
export function ajouterMois(jour, mois) {
  const [a, m, j] = String(jour).split('-').map(Number);
  const cible = new Date(Date.UTC(a, m - 1 + mois, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(j, dernier));
  return cible.toISOString().slice(0, 10);
}

export function validiteDepuis(aujourdhui, idValidite) {
  const v = VALIDITES.find((x) => x.id === idValidite);
  return v && v.mois ? ajouterMois(aujourdhui, v.mois) : null;
}

// L'état qu'on montre : celui de la base, plus « echu » pour un bon actif dont
// la date est passée (la base le refuse alors à l'encaissement).
export function etatBon(bon, aujourdhui) {
  if (!bon) return null;
  if (bon.statut === 'annule') return 'annule';
  if (bon.statut === 'epuise' || Number(bon.solde) <= 0) return 'epuise';
  if (bon.valable_jusqu_au && bon.valable_jusqu_au < aujourdhui) return 'echu';
  return 'actif';
}

export const LIBELLES_ETAT = {
  actif: 'Actif',
  epuise: 'Épuisé',
  annule: 'Annulé',
  echu: 'Échu',
};

export const LIBELLES_MOUVEMENT = {
  emission: 'Vendu',
  utilisation: 'Dépensé',
  recredit: 'Rendu au bon (ticket annulé)',
  annulation: 'Annulé, argent rendu',
  prolongation: 'Validité changée',
};

// La part d'un ticket qu'un bon peut régler : son solde, sans dépasser le reste.
export function montantUtilisable(bon, reste) {
  const solde = Math.round(Number(bon?.solde || 0) * 100);
  const r = Math.round(Number(reste || 0) * 100);
  return Math.max(0, Math.min(solde, r)) / 100;
}

// Totaux d'une liste de bons : ce qui reste à honorer (bons actifs, échus
// compris : ils peuvent être prolongés).
export function enCirculation(bons) {
  const actifs = (bons || []).filter((b) => b.statut === 'actif' && Number(b.solde) > 0);
  return {
    nombre: actifs.length,
    montant: Math.round(actifs.reduce((s, b) => s + Number(b.solde) * 100, 0)) / 100,
  };
}

// Mouvements d'un mois (« 2026-11 ») : vendus et dépensés, nets des annulations.
// Le mois d'un mouvement d'argent est celui de son jour d'exploitation (celui
// de la clôture qui le compte) ; à défaut, celui de sa date.
export function bilanDuMois(mouvements, mois) {
  const du = (mouvements || []).filter((m) => String(m.jour_exploitation || m.created_at || '').slice(0, 7) === mois);
  const somme = (genre) => Math.round(du.filter((m) => m.genre === genre).reduce((s, m) => s + Number(m.montant) * 100, 0)) / 100;
  const compte = (genre) => du.filter((m) => m.genre === genre).length;
  return {
    vendus: { nombre: compte('emission'), montant: somme('emission') },
    depenses: { montant: Math.round((somme('utilisation') - somme('recredit')) * 100) / 100, nombre: compte('utilisation') },
    rendus: { nombre: compte('annulation'), montant: somme('annulation') },
  };
}

// Message court à envoyer par SMS : le code suffit pour payer.
export function texteSms({ bon, maison }) {
  const montant = Number(bon.montant_initial).toFixed(2);
  const validite = bon.valable_jusqu_au ? `, valable jusqu'au ${dateCH(bon.valable_jusqu_au)}` : '';
  const chez = maison ? ` chez ${maison}` : '';
  return `Bonjour ${bon.nom}, voici votre bon cadeau de CHF ${montant}${chez}. Code : ${bon.code}${validite}. Présentez ce code à la caisse.`;
}

// Lien sms: (iPhone, Android, iPad avec Messages). Le numéro garde son + ;
// le texte part encodé.
export function lienSms(telephone, texte) {
  const numero = String(telephone || '').replace(/[^0-9+]/g, '');
  return `sms:${numero}?&body=${encodeURIComponent(texte)}`;
}

export function dateCH(jour) {
  const [a, m, j] = String(jour || '').slice(0, 10).split('-');
  return a && m && j ? `${j}.${m}.${a}` : '';
}

// Refus de la base, dits en clair (caisse_encaisser et caisse_bon_cadeau_*).
export const MESSAGES_BONS_CADEAUX = {
  'caisse: bon cadeau introuvable': "Ce bon cadeau n'existe pas dans cet établissement. Vérifiez le code.",
  'caisse: bon cadeau deja pose sur ce ticket': 'Ce bon cadeau est déjà posé sur ce ticket.',
  'caisse: bon cadeau annule': 'Ce bon cadeau est annulé : il ne se dépense plus.',
  'caisse: bon cadeau epuise': 'Ce bon cadeau est épuisé.',
  'caisse: bon cadeau echu': "Ce bon cadeau est échu. Le patron peut prolonger sa validité depuis Bons cadeaux.",
  'caisse: bon cadeau, solde insuffisant': 'Le solde du bon ne couvre pas ce montant. Rouvrez le bon pour relire son solde.',
  'caisse: bon cadeau, moyen invalide': 'Un bon cadeau se pose par le bouton Bon cadeau.',
  'caisse: bon cadeau, ni pourboire ni rendu': 'Pas de pourboire ni de rendu sur un bon cadeau.',
  'caisse: bon cadeau, montant invalide': 'Montant invalide : de 0.05 à 5000 francs, au multiple de 5 centimes.',
  'caisse: bon cadeau, nom invalide': 'Le nom est obligatoire (80 caractères au plus).',
  'caisse: bon cadeau, telephone invalide': 'Numéro de téléphone invalide.',
  'caisse: bon cadeau, message trop long': 'Le message tient en 160 caractères.',
  'caisse: bon cadeau, validite invalide': "La validité va d'aujourd'hui à dix ans au plus.",
  'caisse: bon cadeau deja annule': 'Ce bon cadeau est déjà annulé.',
  "caisse: bon cadeau deja utilise, il ne s'annule plus": "Ce bon a déjà servi : il ne s'annule plus.",
  'caisse: bon cadeau epuise ou annule': 'Ce bon est épuisé ou annulé : sa validité ne change plus.',
};
