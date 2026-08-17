// ═══════════════════════════════════════════════════════════════
// QR-FACTURE SUISSE — données du Swiss QR Code (norme SPC v0200)
// ───────────────────────────────────────────────────────────────
// Ce fichier ne dessine rien : il produit et valide la CHAÎNE encodée dans le
// QR code, plus la matrice de modules. Le dessin (récépissé + section paiement)
// vit dans pdf.js avec les autres générateurs vectoriels.
//
// Deux règles de la norme qui expliquent la plupart des choix ci-dessous :
//
// 1. Depuis le 21 novembre 2025 seules les adresses STRUCTURÉES sont admises
//    (type S : rue / n° / NPA / localité / pays séparés). L'adresse combinée
//    (type K, deux lignes libres) n'est plus acceptée — d'où l'analyseur
//    parserAdresse() qui découpe le bloc client saisi en texte libre.
// 2. Le jeu de caractères est restreint au latin. Un caractère hors jeu ne fait
//    pas échouer la génération : il produit un QR que certaines banques
//    refusent, panne invisible jusqu'au non-paiement. On assainit donc en
//    entrée plutôt que d'espérer.
//
// L'IBAN de Samper Consulting (BCVS) est un IBAN ordinaire, pas un QR-IBAN :
// la référence QRR lui est interdite, on utilise SCOR (référence créancier
// ISO 11649) construite sur le numéro de facture.
// ═══════════════════════════════════════════════════════════════

// ─── Jeu de caractères autorisé ──────────────────────────────────────────────
// Substitutions d'abord (typographie française et signes courants), puis on
// retire ce qui reste hors du latin imprimable. Aligné sur pdfSafeText de
// pdf.js dans l'esprit, mais plus strict : la norme prime sur la lisibilité.
const SUBSTITUTIONS_QR = {
  '’': "'", '‘': "'", '‛': "'", '′': "'",
  '“': '"', '”': '"', '„': '"', '«': '"', '»': '"',
  '–': '-', '—': '-', '−': '-', '‐': '-', '‑': '-',
  '…': '...', ' ': ' ', ' ': ' ', ' ': ' ',
  '•': '-', '°': 'o', '€': 'EUR', '⁄': '/',
  'Œ': 'OE', 'œ': 'oe', 'Ÿ': 'Y',
};

// Latin imprimable : ASCII 0x20-0x7E + lettres accentuées Latin-1 (0xC0-0xFF
// privé de × et ÷, qui ne sont pas des lettres et ne figurent pas au jeu).
const LATIN_AUTORISE = /[\x20-\x7EÀ-ÖØ-öø-ÿ]/;

export function assainirQr(valeur) {
  if (valeur == null) return '';
  return String(valeur)
    .normalize('NFC')
    .split('')
    .map((c) => (Object.prototype.hasOwnProperty.call(SUBSTITUTIONS_QR, c) ? SUBSTITUTIONS_QR[c] : c))
    .join('')
    .split('')
    .map((c) => {
      if (LATIN_AUTORISE.test(c)) return c;
      // Dernière chance : é décomposé, ligatures… on retire les diacritiques
      // plutôt que de perdre la lettre.
      const nu = c.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      return LATIN_AUTORISE.test(nu) ? nu : '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const tronquer = (valeur, max) => assainirQr(valeur).slice(0, max);

// ─── IBAN ────────────────────────────────────────────────────────────────────
export const nettoyerIban = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Modulo 97 sur une chaîne alphanumérique (lettres → 10..35), calculé par
// tranches : le nombre entier dépasserait Number.MAX_SAFE_INTEGER.
function mod97(chaine) {
  let reste = 0;
  for (const c of chaine) {
    const v = /[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55);
    reste = Number(`${reste}${v}`) % 97;
  }
  return reste;
}

export function ibanValide(iban) {
  const v = nettoyerIban(iban);
  if (!/^(CH|LI)[0-9]{2}[0-9A-Z]{17}$/.test(v)) return false;
  return mod97(v.slice(4) + v.slice(0, 4)) === 1;
}

// Un QR-IBAN porte un identifiant d'institution entre 30000 et 31999 ; il EXIGE
// une référence QRR et interdit SCOR/NON. L'inverse pour un IBAN ordinaire.
export function estQrIban(iban) {
  const v = nettoyerIban(iban);
  if (v.length < 9) return false;
  const iid = parseInt(v.slice(4, 9), 10);
  return iid >= 30000 && iid <= 31999;
}

export const formaterIban = (iban) => nettoyerIban(iban).replace(/(.{4})/g, '$1 ').trim();

// ─── Référence créancier SCOR (ISO 11649) ────────────────────────────────────
// « RF » + 2 chiffres de contrôle + 21 caractères alphanumériques au plus.
// Le numéro de facture FAC-20260817-01 devient RF..FAC2026081701 : le paiement
// revient sur le relevé bancaire avec le numéro attaché.
export function referenceScor(numeroFacture) {
  const base = String(numeroFacture || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 21);
  if (!base) return '';
  const controle = 98 - mod97(`${base}RF00`);
  return `RF${String(controle).padStart(2, '0')}${base}`;
}

// Affichage : blocs de 4 depuis la gauche (SCOR). La chaîne encodée dans le QR,
// elle, reste sans espace.
export const formaterReference = (ref) => String(ref || '').replace(/(.{4})/g, '$1 ').trim();

// ─── Adresse structurée ──────────────────────────────────────────────────────
// Le bloc client est saisi en texte libre dans le module Factures. On le
// découpe pour en tirer une adresse structurée, seule forme admise par la
// norme. Formats reconnus :
//
//   Le Rucher SA              Hôtel Woodland            Chez Machin
//   Route du Village 12       Rue du Lac 3bis           Case postale 42
//   1997 Haute-Nendaz         CH-1950 Sion              F-74500 Évian
//                             Suisse                    France
//
// Renvoie null si la ligne NPA + localité est introuvable : mieux vaut un champ
// « Payable par » vide à remplir à la main (la norme le prévoit, avec coins
// d'angle) qu'une adresse fausse dans le QR.
const PAYS_CONNUS = {
  suisse: 'CH', schweiz: 'CH', svizzera: 'CH', switzerland: 'CH', ch: 'CH',
  france: 'FR', fr: 'FR',
  allemagne: 'DE', deutschland: 'DE', germany: 'DE', de: 'DE',
  italie: 'IT', italia: 'IT', italy: 'IT', it: 'IT',
  autriche: 'AT', osterreich: 'AT', austria: 'AT', at: 'AT',
  liechtenstein: 'LI', li: 'LI',
  belgique: 'BE', be: 'BE', luxembourg: 'LU', lu: 'LU',
};

// « 1997 Haute-Nendaz », « CH-1950 Sion », « F-74500 Évian », « 75008 Paris ».
const RE_NPA_LOCALITE = /^(?:([A-Z]{1,2})\s*-\s*)?(\d{4,5})\s+(.{2,})$/i;
// Numéro en fin de rue : « Route du Village 12 », « Rue du Lac 3bis », « Ch. des Prés 4-6 ».
// Le suffixe va jusqu'à trois lettres (a, bis, ter) ; au-delà c'est un mot, et
// la ligne repart entière dans le champ rue plutôt que d'être coupée de travers.
const RE_RUE_NUMERO = /^(.*?[^\s,])[\s,]+(\d+\s?[A-Za-z]{0,3}(?:\s?[-/]\s?\d+\s?[A-Za-z]{0,3})?)$/;

export function parserAdresse(bloc) {
  const lignes = String(bloc || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lignes.length < 2) return null;

  let pays = '';
  let restantes = lignes;

  // Une dernière ligne qui n'est qu'un nom de pays donne le pays et sort du lot.
  const derniere = restantes[restantes.length - 1];
  const codePays = PAYS_CONNUS[derniere.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
  if (codePays && restantes.length > 2) {
    pays = codePays;
    restantes = restantes.slice(0, -1);
  }

  const ligneNpa = restantes[restantes.length - 1];
  const m = RE_NPA_LOCALITE.exec(ligneNpa);
  if (!m) return null;
  const [, prefixePays, npa, localite] = m;
  if (!pays) pays = (prefixePays && PAYS_CONNUS[prefixePays.toLowerCase()]) || 'CH';

  const nom = restantes[0];
  const lignesRue = restantes.slice(1, -1);
  if (!nom) return null;

  // Plusieurs lignes de rue (mention « à l'attention de », étage…) : la
  // dernière porte l'adresse postale, les précédentes complètent le nom.
  // Aucune ligne de rue reste valable : la norme rend la rue facultative,
  // seuls nom, NPA, localité et pays sont exigés.
  const rueBrute = lignesRue.length ? lignesRue[lignesRue.length - 1] : '';
  const complementNom = lignesRue.slice(0, -1).join(', ');
  const mr = rueBrute ? RE_RUE_NUMERO.exec(rueBrute) : null;

  return {
    nom: tronquer(complementNom ? `${nom}, ${complementNom}` : nom, 70),
    rue: tronquer(mr ? mr[1] : rueBrute, 70),
    numero: tronquer(mr ? mr[2].replace(/\s+/g, '') : '', 16),
    npa: tronquer(npa, 16),
    localite: tronquer(localite, 35),
    pays: pays || 'CH',
  };
}

// ─── Montant ─────────────────────────────────────────────────────────────────
// Le QR veut « 2900.00 » ; l'humain lit « 2 900.00 ». Deux fonctions, jamais
// l'une pour l'autre.
export const montantQr = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '');
export const montantLisible = (n) => {
  if (!Number.isFinite(Number(n))) return '';
  // Les milliers se groupent sur la partie entière seulement : appliquer le
  // regroupement à « 2900.00 » entier découperait aussi les décimales.
  const [entiere, decimales] = Number(n).toFixed(2).split('.');
  return `${entiere.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${decimales}`;
};

// ─── Construction et validation ──────────────────────────────────────────────
// Un objet unique, assaini, que la validation et le dessin partagent : le PDF
// n'assainit plus rien de son côté, il dessine ce qui a été validé.
export function construireQrFacture({
  iban, creancier, debiteur, montant, devise = 'CHF', numeroFacture, message, avecReference = true,
}) {
  const ibanNet = nettoyerIban(iban);
  const reference = avecReference && !estQrIban(ibanNet) ? referenceScor(numeroFacture) : '';
  const champsCreancier = creancier || {};

  return {
    iban: ibanNet,
    creancier: {
      nom: tronquer(champsCreancier.nom, 70),
      rue: tronquer(champsCreancier.rue, 70),
      numero: tronquer(champsCreancier.numero, 16),
      npa: tronquer(champsCreancier.npa, 16),
      localite: tronquer(champsCreancier.localite, 35),
      pays: (champsCreancier.pays || 'CH').toUpperCase().slice(0, 2),
    },
    debiteur: debiteur ? {
      nom: tronquer(debiteur.nom, 70),
      rue: tronquer(debiteur.rue, 70),
      numero: tronquer(debiteur.numero, 16),
      npa: tronquer(debiteur.npa, 16),
      localite: tronquer(debiteur.localite, 35),
      pays: (debiteur.pays || 'CH').toUpperCase().slice(0, 2),
    } : null,
    montant: Number.isFinite(Number(montant)) && Number(montant) > 0 ? Number(montant) : null,
    devise: devise === 'EUR' ? 'EUR' : 'CHF',
    typeReference: reference ? 'SCOR' : 'NON',
    reference,
    message: tronquer(message, 140),
  };
}

// Renvoie la liste des motifs qui empêchent d'émettre le QR. Vide = bon pour
// l'impression. On ne bloque jamais la facture elle-même : c'est l'appelant qui
// décide de sortir le document sans QR.
export function validerQrFacture(d) {
  const erreurs = [];
  if (!d?.iban) erreurs.push('IBAN manquant.');
  else if (!ibanValide(d.iban)) erreurs.push('IBAN invalide (doit être un compte suisse ou liechtensteinois).');
  else if (estQrIban(d.iban) && d.typeReference !== 'QRR') {
    erreurs.push('Cet IBAN est un QR-IBAN : il exige une référence QR, non gérée ici.');
  }

  // La rue est facultative dans la norme ; nom, NPA, localité et pays non.
  const c = d?.creancier || {};
  if (!c.nom) erreurs.push('Nom du créancier manquant.');
  if (!c.npa) erreurs.push('NPA du créancier manquant.');
  if (!c.localite) erreurs.push('Localité du créancier manquante.');
  if (!/^[A-Z]{2}$/.test(c.pays || '')) erreurs.push('Pays du créancier manquant.');

  if (d?.montant != null && (d.montant < 0.01 || d.montant > 999999999.99)) {
    erreurs.push('Montant hors des bornes admises (0.01 à 999 999 999.99).');
  }

  if (d?.typeReference === 'SCOR' && !/^RF[0-9]{2}[A-Z0-9]{1,21}$/.test(d.reference || '')) {
    erreurs.push('Référence SCOR malformée.');
  }

  if (erreurs.length === 0 && payloadSpc(d).length > 997) {
    erreurs.push('Les données dépassent la taille maximale du QR code (997 caractères).');
  }
  return erreurs;
}

// ─── Charge utile SPC ────────────────────────────────────────────────────────
// 31 lignes obligatoires jusqu'au marqueur de fin « EPD ». Les blocs vides
// comptent : le créancier final (lignes 12-18) est toujours vide mais ses sept
// lignes doivent être là, sinon tout le reste est décalé d'un cran et les
// scanners lisent le montant à la place de la devise.
export function payloadSpc(d) {
  const bloc = (a) => (a
    ? ['S', a.nom, a.rue, a.numero, a.npa, a.localite, a.pays]
    : ['', '', '', '', '', '', '']);

  const lignes = [
    'SPC',                                   // 1  type
    '0200',                                  // 2  version
    '1',                                     // 3  type de codage
    d.iban,                                  // 4
    ...bloc(d.creancier),                    // 5-11  créancier
    ...bloc(null),                           // 12-18 créancier final : vide
    d.montant != null ? montantQr(d.montant) : '', // 19
    d.devise,                                // 20
    ...bloc(d.debiteur),                     // 21-27 débiteur
    d.typeReference,                         // 28
    d.reference || '',                       // 29
    d.message || '',                         // 30 informations supplémentaires
    'EPD',                                   // 31 fin des données de paiement
  ];
  return lignes.join('\r\n');
}

// ─── Matrice de modules ──────────────────────────────────────────────────────
// Segment unique en mode octet : la norme impose l'UTF-8, et laisser
// l'encodeur découper la chaîne en segments numériques/alphanumériques ferait
// un QR valide mais hors de ce que les scanners bancaires attendent.
// Niveau de correction M, imposé lui aussi.
let qrcodeLib = null;

export async function matriceQr(payload) {
  if (!qrcodeLib) qrcodeLib = await import('qrcode');
  const creer = qrcodeLib.create || qrcodeLib.default?.create;
  const symbole = creer([{ data: payload, mode: 'byte' }], { errorCorrectionLevel: 'M' });
  const { size, data } = symbole.modules;
  return {
    taille: size,
    version: symbole.version,
    estNoir: (ligne, colonne) => !!data[ligne * size + colonne],
  };
}
