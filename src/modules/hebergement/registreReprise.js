// ─────────────────────────────────────────────────────────────────────────────
// Reprise du registre (lot 13 du panel), sans React ni service (testé par
// node --test, registreReprise.test.mjs). Un habitué relié à sa fiche hôte
// retrouve son domicile et sa pièce d'identité, et les personnes de son
// dernier séjour se reprennent en un geste relu. La recherche passe par la
// fiche hôte (hote_id), jamais par ressemblance de nom : deux personnes du
// même nom n'héritent pas l'une de la pièce de l'autre.
// ─────────────────────────────────────────────────────────────────────────────

const sejourCompte = (s) => s.statut === 'en_maison' || s.statut === 'parti';

// Nom, prénom ou date sans casse, sans accents, espaces resserrés.
export const normaliserTexte = (x) => String(x || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().replace(/\s+/g, ' ').toLowerCase();
const clePersonne = (o) => [o.nom, o.prenom, o.dateNaissance].map(normaliserTexte).join('|');

// La ligne la plus récente du registre reliée à cette fiche hôte, hors séjour
// courant, ou null.
export function dernierPassage(occupants, hoteId, sejourIdCourant) {
  if (!hoteId) return null;
  let meilleure = null;
  for (const o of occupants || []) {
    if (o.hoteId !== hoteId || o.sejourId === sejourIdCourant) continue;
    const cle = `${o.arrivee || ''}|${o.createdAt || ''}`;
    if (!meilleure || cle > meilleure.cle) meilleure = { cle, o };
  }
  return meilleure ? meilleure.o : null;
}

// Les personnes du dernier séjour du même hôte (même fiche, autre séjour, en
// maison ou parti, arrivé avant le séjour courant) qui ne sont pas déjà
// inscrites au séjour courant. Liste vide pour un hôte jamais venu.
export function accompagnantsDuDernierSejour({ sejours, occupants, sejour }) {
  if (!sejour?.hoteId) return [];
  const precedents = (sejours || [])
    .filter((s) => s.hoteId === sejour.hoteId && s.id !== sejour.id && sejourCompte(s) && s.arrivee < sejour.arrivee)
    .sort((a, b) => b.arrivee.localeCompare(a.arrivee));
  const dernier = precedents[0];
  if (!dernier) return [];
  const liste = occupants || [];
  const deja = new Set(liste.filter((o) => o.sejourId === sejour.id).map(clePersonne));
  return liste.filter((o) => o.sejourId === dernier.id && !deja.has(clePersonne(o)));
}

// Champs repris d'un passage : identité, nationalité, domicile et pièce ;
// jamais l'exonération ni son motif (elle se décide à chaque séjour).
export const CHAMPS_REPRIS = ['prenom', 'nom', 'dateNaissance', 'nationalite', 'domicileAdresse', 'domicileLocalite', 'domicilePays', 'pieceType', 'pieceNumero'];

// Remplit les champs encore vides du formulaire : la fiche hôte d'abord pour
// prénom, nom, date de naissance et nationalité, puis le dernier passage.
// Une saisie déjà faite n'est jamais écrasée.
export function completerFormulaire(form, hote, passage) {
  const out = { ...form };
  const source = {};
  for (const k of CHAMPS_REPRIS) {
    const deHote = ['prenom', 'nom', 'dateNaissance', 'nationalite'].includes(k) ? hote?.[k] : '';
    source[k] = deHote || passage?.[k] || '';
  }
  for (const k of CHAMPS_REPRIS) {
    if (!String(out[k] || '').trim() && source[k]) out[k] = source[k];
  }
  return out;
}

// Lecture peut-être coupée : la lecture des personnes s'arrête à sa limite
// (useOccupants, 20000) et l'API de production peut couper avant, à 1000
// lignes par défaut. Le compte exact de l'un ou de l'autre fait douter.
export const lectureTronquee = (n, limite) => n === 1000 || (limite > 0 && n >= limite);
