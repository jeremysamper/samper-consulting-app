// Passage de l'ancienne adresse (samperconsulting-app.com) à jouanet.com,
// étape 4 du plan de bascule (27.11.2026).
//
// L'app installée sur un iPad garde son adresse : elle s'ouvre depuis sa copie
// sur l'appareil et ne voit jamais la redirection des visites. Ce qui attend le
// réseau (files IndexedDB, file de la borne, brouillons) est lié à l'adresse et
// ne se lit plus depuis jouanet.com. L'appareil ne passe donc que lorsque tout
// est parti. Fonctions pures : le composant DemenagementJouanet lit les files.

export const ADRESSE_JOUANET = 'https://jouanet.com/';

const ANCIENNES = ['samperconsulting-app.com', 'www.samperconsulting-app.com'];

// Essai du bandeau hors production seulement (aperçu Vercel, poste local) :
// ?essai-demenagement dans l'adresse.
const HOTE_ESSAI = /(\.vercel\.app|^localhost|^127\.0\.0\.1)$/;

export function estAncienneAdresse(lieu) {
  if (!lieu) return false;
  const hote = String(lieu.hostname || '').toLowerCase();
  if (ANCIENNES.includes(hote)) return true;
  let essai = false;
  try { essai = new URLSearchParams(lieu.search || '').has('essai-demenagement'); } catch { essai = false; }
  return essai && HOTE_ESSAI.test(hote);
}

export function compterBrouillons(stockage, prefixe) {
  let n = 0;
  try {
    for (let i = 0; i < stockage.length; i += 1) {
      if (String(stockage.key(i) || '').startsWith(prefixe)) n += 1;
    }
  } catch { return null; }
  return n;
}

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

// Une valeur null est une file qu'on n'a pas pu lire : elle bloque le passage,
// comme une file pleine (lire vide n'est pas lire en échec).
const FILES = [
  ['pointages', 'pointage', 'pointages'],
  ['borne', 'pointage de la borne', 'pointages de la borne'],
  ['inventaire', "quantité d'inventaire", "quantités d'inventaire"],
  ['haccp', 'relevé HACCP', 'relevés HACCP'],
  ['etages', 'statut de chambre', 'statuts de chambre'],
  ['ventes', 'vente en espèces', 'ventes en espèces'],
];

export function resumerAttente(comptes) {
  const enAttente = [];
  let illisible = false;
  for (const [cle, un, plusieurs] of FILES) {
    const n = comptes?.[cle];
    if (n === null || n === undefined || Number.isNaN(n)) { illisible = true; continue; }
    if (n > 0) enAttente.push(pluriel(n, un, plusieurs));
  }
  const b = comptes?.brouillons;
  const brouillons = typeof b === 'number' && b > 0
    ? pluriel(b, 'fiche recette pas encore enregistrée', 'fiches recettes pas encore enregistrées')
    : null;
  return { enAttente, illisible, brouillons, pret: !illisible && enAttente.length === 0 };
}
