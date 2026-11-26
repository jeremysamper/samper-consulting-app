// ─────────────────────────────────────────────────────────────────────────────
// Questions à choix de la réservation d'une table en ligne (lot 18 du panel).
//
// La direction règle une ou deux questions (« Formule » : « Menu du marché »,
// « À la carte ») dans Réglages > Réservation en ligne. Le visiteur répond
// d'un toucher sur /table/<adresse>. La réponse voyage dans le message, en
// lignes « Libellé : Choix » placées après la ligne des allergènes, et un
// déclencheur en tire une étiquette « autre » de la réservation
// (supabase/migrations/20261125_resa_questions_en_ligne.sql).
//
// Fonctions pures, sans React : lues par la page publique, par l'app (les
// réglages) et par la démo. etiquettesDepuisNotes est le miroir en
// JavaScript du déclencheur SQL.
// ─────────────────────────────────────────────────────────────────────────────

export const LIMITES = Object.freeze({ questions: 2, choixMin: 2, choixMax: 6, longueur: 40 });

const ID_OK = /^[a-z0-9-]{1,24}$/;
const SEPARATEUR = ' : ';
// Libellé lu par le déclencheur des allergènes (^Allergies : ) : interdit.
const LIBELLE_RESERVE = 'allergies';

// Un libellé ou un choix gardé : texte, rogné, non vide, 40 caractères au
// plus, sans retour à la ligne ni « espace, deux-points, espace ».
function texteSur(valeur) {
  if (typeof valeur !== 'string') return null;
  const t = valeur.trim();
  if (!t || t.length > LIMITES.longueur) return null;
  if (/[\r\n]/.test(t) || t.includes(SEPARATEUR)) return null;
  return t;
}

// Rend un tableau sûr [{ id, libelle, choix, obligatoire }] depuis n'importe
// quelle valeur. Les deux premières questions bien formées sont gardées.
export function nettoyerQuestions(brut) {
  if (!Array.isArray(brut)) return [];
  const gardees = [];
  for (const q of brut) {
    if (gardees.length >= LIMITES.questions) break;
    if (!q || typeof q !== 'object' || Array.isArray(q)) continue;
    const libelle = texteSur(q.libelle);
    if (!libelle || libelle.toLowerCase() === LIBELLE_RESERVE) continue;
    const vus = new Set();
    const choix = [];
    for (const c of Array.isArray(q.choix) ? q.choix : []) {
      const t = texteSur(c);
      if (!t || vus.has(t.toLowerCase())) continue;
      vus.add(t.toLowerCase());
      choix.push(t);
      if (choix.length >= LIMITES.choixMax) break;
    }
    if (choix.length < LIMITES.choixMin) continue;
    gardees.push({ id: typeof q.id === 'string' ? q.id : '', libelle, choix, obligatoire: q.obligatoire === true });
  }
  // Identifiants : gardés s'ils ont la forme attendue et ne sont pas déjà
  // pris, sinon q1 ou q2 selon le rang (jamais deux fois le même).
  const pris = new Set();
  gardees.forEach((q, i) => {
    let id = ID_OK.test(q.id) && !pris.has(q.id) ? q.id : `q${i + 1}`;
    for (let n = i + 1; pris.has(id); n += 1) id = `q${n + 1}`;
    pris.add(id);
    q.id = id;
  });
  return gardees;
}

// La phrase à afficher dans les réglages pour une question telle qu'elle
// est saisie à l'écran, ou null. Un champ de choix laissé vide est ignoré.
export function erreurQuestion(question) {
  const libelle = typeof question?.libelle === 'string' ? question.libelle.trim() : '';
  if (!libelle) return 'Donnez un nom à cette question.';
  if (libelle.toLowerCase() === LIBELLE_RESERVE) return 'Ce nom de question est réservé : choisissez-en un autre.';
  if (libelle.length > LIMITES.longueur) return 'Le nom de la question dépasse 40 caractères.';
  if (/[\r\n]/.test(libelle) || libelle.includes(SEPARATEUR)) return 'Retirez le signe deux-points du nom de la question.';
  const choix = (Array.isArray(question?.choix) ? question.choix : [])
    .map((c) => (typeof c === 'string' ? c.trim() : ''))
    .filter(Boolean);
  if (choix.length < LIMITES.choixMin) return 'Ajoutez au moins deux choix à cette question.';
  if (choix.length > LIMITES.choixMax) return 'Six choix au plus par question.';
  if (choix.some((c) => c.length > LIMITES.longueur)) return 'Un choix dépasse 40 caractères.';
  if (choix.some((c) => /[\r\n]/.test(c) || c.includes(SEPARATEUR))) return 'Retirez le signe deux-points des choix.';
  if (new Set(choix.map((c) => c.toLowerCase())).size < choix.length) return 'Deux choix portent le même nom.';
  return null;
}

// Les lignes « Libellé : Choix », dans l'ordre des questions, pour les
// seules réponses qui sont un choix de la question.
export function lignesReponses(questions, reponses) {
  const r = reponses || {};
  return (questions || [])
    .filter((q) => typeof r[q.id] === 'string' && q.choix.includes(r[q.id]))
    .map((q) => `${q.libelle}${SEPARATEUR}${r[q.id]}`);
}

// Le message envoyé au restaurant : la ligne des allergènes d'abord (forme
// lue par resa_tags_allergenes_en_ligne), puis les réponses, une ligne vide,
// puis le mot du client. Sans allergène ni réponse : le mot seul.
export function composerMessage({ ligneAllergies = '', lignes = [], mot = '' } = {}) {
  const tete = [ligneAllergies, ...(lignes || [])].filter(Boolean);
  const texte = String(mot || '').trim();
  if (!tete.length) return texte;
  return `${tete.join('\n')}${texte ? `\n\n${texte}` : ''}`;
}

// Les questions obligatoires restées sans réponse valable.
export function questionsSansReponse(questions, reponses) {
  const r = reponses || {};
  return (questions || []).filter((q) => q.obligatoire && !q.choix.includes(r[q.id]));
}

// Miroir du déclencheur resa_tags_questions_en_ligne : lignes situées avant
// la première ligne vide, quatre au plus ; une étiquette par question quand
// une ligne vaut exactement « libellé : choix ».
export function etiquettesDepuisNotes(notes, questions) {
  if (typeof notes !== 'string' || !notes) return [];
  const lignes = [];
  for (const brute of notes.split('\n')) {
    const ligne = brute.replace(/\r+$/, '');
    if (ligne === '') break;
    lignes.push(ligne);
    if (lignes.length >= 4) break;
  }
  const sortie = [];
  for (const q of questions || []) {
    const prefixe = `${q.libelle}${SEPARATEUR}`;
    const trouvee = lignes.find((l) => l.startsWith(prefixe) && q.choix.includes(l.slice(prefixe.length)));
    if (trouvee && !sortie.some((t) => t.valeur === trouvee)) sortie.push({ type_tag: 'autre', valeur: trouvee, libre: true });
  }
  return sortie;
}
