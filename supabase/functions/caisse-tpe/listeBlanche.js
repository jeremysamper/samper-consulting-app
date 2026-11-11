// SAMPER CONSULTING - caisse-tpe : la liste blanche.
//
// Tout ce qu'un adaptateur rend passe par ici avant d'aller plus loin (base,
// réponse à l'écran). On ne RETIRE pas ce qui est interdit : on ne RECOPIE que
// ce qui est permis. Un champ que ce fichier ne nomme pas n'existe plus après
// lui : numéro de carte, date d'expiration, cryptogramme, piste, reçu du
// terminal, réponse brute du prestataire.
//
// Permis : identifiant de transaction du prestataire, statut, montant,
// pourboire, devise, marque, code d'autorisation, et les quatre derniers
// chiffres (quatre chiffres exactement, rien d'autre).
// Fonctions pures, sans import : lues par l'Edge Function et par les tests.

const STATUTS = ['en_cours', 'approuve', 'refuse', 'annule', 'expire', 'incertain', 'injoignable'];

// Contrôle de Luhn sur une suite de chiffres.
function luhn(chiffres) {
  let somme = 0;
  for (let i = 0; i < chiffres.length; i += 1) {
    let n = Number(chiffres[chiffres.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    somme += n;
  }
  return somme % 10 === 0;
}

// Vrai si le texte porte un numéro de carte : 13 à 19 chiffres d'un seul
// tenant, ou groupés comme sur une carte (quatre par quatre, ou 4-6-5), qui
// passent le contrôle de Luhn. Un identifiant technique (uuid, suite collée à
// des lettres) n'en est pas un.
export function contientNumeroDeCarte(texte) {
  const t = String(texte ?? '');
  const suites = [
    ...(t.match(/(?<![0-9A-Za-z-])\d{13,19}(?![0-9A-Za-z-])/g) || []),
    ...(t.match(/(?<![0-9A-Za-z-])\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}(?![0-9A-Za-z-])/g) || []),
    ...(t.match(/(?<![0-9A-Za-z-])\d{4}[ -]\d{6}[ -]\d{5}(?![0-9A-Za-z-])/g) || []),
  ];
  return suites.some((s) => luhn(s.replace(/[ -]/g, '')));
}

// Un texte d'affichage : borné, sans caractère de contrôle, sans longue suite
// de chiffres (sept ou plus, espaces et tirets compris).
export function textePropre(valeur, longueur) {
  if (typeof valeur !== 'string') return null;
  const t = valeur
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\d(?:[ -]?\d){6,}/g, '[masqué]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, longueur);
  return t || null;
}

const entier = (v) => (Number.isInteger(v) && v >= 0 && v <= 1000000000 ? v : null);

// L'identifiant du prestataire : un mot court, jamais un numéro de carte.
function identifiant(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const t = String(v).trim();
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(t)) return null;
  // Plus strict que pour un texte : aucune suite de 13 à 19 chiffres qui
  // passe le contrôle de Luhn, où qu'elle soit dans l'identifiant.
  if ((t.match(/\d{13,19}/g) || []).some(luhn)) return null;
  return t;
}

// Le résultat d'un adaptateur, réduit à la liste blanche.
export function resultatPropre(brut) {
  if (!brut || typeof brut !== 'object') return { statut: 'injoignable' };
  const fin = typeof brut.finCarte === 'string' && /^\d{4}$/.test(brut.finCarte) ? brut.finCarte : null;
  const code = typeof brut.codeAutorisation === 'string' && /^[A-Za-z0-9]{1,12}$/.test(brut.codeAutorisation)
    ? brut.codeAutorisation : null;
  return {
    statut: STATUTS.includes(brut.statut) ? brut.statut : 'incertain',
    idPrestataire: identifiant(brut.idPrestataire),
    montantCentimes: entier(brut.montantCentimes),
    pourboireCentimes: entier(brut.pourboireCentimes),
    devise: typeof brut.devise === 'string' && /^[A-Z]{3}$/.test(brut.devise) ? brut.devise : null,
    marque: textePropre(brut.marque, 30),
    finCarte: fin,
    codeAutorisation: code,
    message: textePropre(brut.message, 160),
  };
}

// La réponse d'un remboursement, réduite à trois champs.
export function remboursementPropre(brut) {
  if (!brut || typeof brut !== 'object') return { fait: false, genre: null, message: 'Le terminal ne répond pas.' };
  return {
    fait: brut.fait === true,
    genre: brut.genre === 'void' || brut.genre === 'refund' ? brut.genre : null,
    message: textePropre(brut.message, 160),
  };
}

// Ce qu'un écran reçoit d'une transaction : les colonnes utiles à l'affichage,
// nommées une à une. Jamais l'identifiant du prestataire, jamais une clé.
export function vueTransaction(t) {
  if (!t) return null;
  return {
    id: t.id,
    ticket_id: t.ticket_id,
    terminal_id: t.terminal_id,
    statut: t.statut,
    montant: Number(t.montant),
    pourboire: Number(t.pourboire),
    devise: t.devise,
    test: t.test === true,
    marque: t.marque ?? null,
    fin_carte: t.fin_carte ?? null,
    code_autorisation: t.code_autorisation ?? null,
    message: t.message ?? null,
    created_at: t.created_at,
    final_at: t.final_at ?? null,
    tranche: t.tranche_at != null,
    rembourse_statut: t.rembourse_statut ?? null,
    rembourse_genre: t.rembourse_genre ?? null,
    rembourse_message: t.rembourse_message ?? null,
  };
}

// Ce qu'un écran reçoit d'un terminal : jamais sa clé.
export function vueTerminal(t) {
  if (!t) return null;
  return {
    id: t.id,
    etablissement_id: t.etablissement_id,
    nom: t.nom,
    prestataire: t.prestataire,
    numero_serie: t.numero_serie,
    actif: t.actif === true,
    cle_fin: t.cle_fin ?? null,
    relie_at: t.relie_at ?? null,
    relie_par_nom: t.relie_par_nom ?? null,
    premier_paiement_reel_at: t.premier_paiement_reel_at ?? null,
  };
}
