// ─────────────────────────────────────────────────────────────
// Documents pour le client, tirés d'une carte de Cartes & Recettes :
// « Carte pour la table » (plats, descriptions, prix, allergènes en toutes
// lettres) et « Allergènes de la carte » (un tableau plats par allergènes).
//
// Util pur (ni React ni DOM), testé par carteClient.test.mjs. Les deux
// générateurs vectoriels de src/services/pdf.js ne font que dessiner ce que
// ces fonctions rendent.
//
// Ce qui sort chez le client, et rien d'autre : le nom, la description
// (texte saisi pour la carte), le prix de vente du plat et ses allergènes.
// Les recettes ne sont lues que pour leurs allergènes, par allergenesDuPlat
// (source unique, partagée avec la vitrine de la carte) : ni coût, ni marge,
// ni note interne n'entrent dans un document.
// ─────────────────────────────────────────────────────────────
import { allergenesDuPlat } from '../../components/fiches/rangementFiches.js';
import { grouperParCategorie } from '../../utils/categoriesPlat.js';
import { ALLERGENES, labelAllergene } from '../../utils/allergenes.js';
import { slug } from '../../utils/recettePdfData.js';

// ─── Textes fixes des deux documents (un seul endroit) ───
export const TITRE_TABLEAU = 'Allergènes';
export const PREFIXE_ALLERGENES = 'Allergènes : ';
// Plat sans fiche sur la carte : jamais une ligne vide, qui se lirait « aucun ».
export const MENTION_SANS_FICHE_CARTE = 'Allergènes : demandez à l\'équipe.';
// Plat sans fiche dans le tableau, à la place des cases.
export const MENTION_SANS_FICHE_TABLEAU = 'Allergènes non renseignés : demandez à l\'équipe.';
// Phrase posée une fois sous la dernière catégorie de la carte.
export const PHRASE_ALLERGIES_CARTE = 'Pour toute allergie ou intolérance, adressez-vous à notre équipe avant de commander.';
export const MENTION_PRIX = 'Prix en CHF.';
export const COLONNE_AUTRES = 'Autres mentions';
// Légende sous le tableau des allergènes.
export const LEGENDE_TABLEAU = [
  'Une ligne sans marque : aucun allergène déclaré sur les fiches de la maison.',
  'Document établi d\'après les fiches recettes. Pour toute allergie ou intolérance, adressez-vous à notre équipe.',
];

// Montant sur deux décimales, point décimal (« 46.00 »), groupes de milliers
// séparés par une espace. Écrit à la main : le format « fr-CH » de l'Intl
// diffère selon le moteur (virgule sous Node, point dans le navigateur), et un
// document imprimé doit sortir identique partout. Prix nul, absent ou
// négatif : chaîne vide (le plat s'imprime sans montant, jamais « 0.00 »).
export function prixCarte(n) {
  const v = Number(n);
  if (n == null || n === '' || !Number.isFinite(v) || v <= 0) return '';
  const [entier, decimales] = v.toFixed(2).split('.');
  return `${entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${decimales}`;
}

// Date d'édition « JJ.MM.AAAA » depuis une date « AAAA-MM-JJ » (jour de Zurich).
export function dateEdition(isoJour) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoJour || ''));
  return m ? `Édition du ${m[3]}.${m[2]}.${m[1]}` : '';
}

export const nomFichierCarte = (carte) => `Carte_${slug(carte?.nom || 'carte')}.pdf`;
export const nomFichierAllergenes = (carte) => `Allergenes_${slug(carte?.nom || 'carte')}.pdf`;

const estActif = (p) => p && p.actif !== false;
const texte = (v) => String(v ?? '').trim();

// Plats actifs des catégories retenues, groupés par catégorie dans l'ordre de
// service, dans l'ordre reçu à l'intérieur d'une catégorie.
// categoriesChoisies : Set ou liste ; null ou absent = toutes.
// Rend [[categorie, plats], ...].
export function platsImprimables(platsCarte, categoriesChoisies) {
  const choisies = categoriesChoisies == null ? null : new Set(categoriesChoisies);
  return grouperParCategorie((platsCarte || []).filter(estActif))
    .filter(([cat]) => !choisies || choisies.has(cat));
}

// Bilan affiché avant l'export : nombre de plats, plats sans fiche (nommés),
// nombre de plats sans prix.
export function bilanCarteClient(plats, recettesActives) {
  const actifs = (plats || []).filter(estActif);
  return {
    nombre: actifs.length,
    sansFiche: actifs.filter((p) => allergenesDuPlat(p, recettesActives).sansFiche).map((p) => texte(p.nom)),
    sansPrix: actifs.filter((p) => prixCarte(p.prixVente) === '').length,
  };
}

// Données de la « Carte pour la table ». `plats` : les plats retenus (liste à
// plat, rangée ici par catégorie). `jour` : « AAAA-MM-JJ », jour de Zurich.
export function payloadCarteTable({ carte, plats, recettesActives, avecPrix = true, jour = '' } = {}) {
  const sections = grouperParCategorie((plats || []).filter(estActif)).map(([cat, ps]) => ({
    label: cat,
    plats: ps.map((p) => {
      const a = allergenesDuPlat(p, recettesActives);
      const libelles = [...a.ids.map(labelAllergene), ...a.libres.map(texte)];
      let allergenes = '';
      if (a.sansFiche) allergenes = MENTION_SANS_FICHE_CARTE;
      else if (libelles.length) allergenes = PREFIXE_ALLERGENES + libelles.join(', ');
      return {
        nom: texte(p.nom),
        prix: avecPrix ? prixCarte(p.prixVente) : '',
        description: texte(p.description),
        allergenes,
        allergeneIds: a.ids,
        libres: a.libres,
        sansFiche: a.sansFiche,
      };
    }),
  }));
  return {
    titre: texte(carte?.nom),
    meta: dateEdition(jour),
    sections,
    mentions: [PHRASE_ALLERGIES_CARTE, avecPrix ? MENTION_PRIX : null].filter(Boolean),
  };
}

// Données du tableau « Allergènes de la carte » : une colonne par allergène
// du référentiel, dans son ordre, puis « Autres mentions » seulement si un
// plat retenu porte une valeur hors référentiel.
export function payloadAllergenesCarte({ carte, plats, recettesActives, jour = '' } = {}) {
  let avecAutres = false;
  const sections = grouperParCategorie((plats || []).filter(estActif)).map(([cat, ps]) => ({
    label: cat,
    lignes: ps.map((p) => {
      const a = allergenesDuPlat(p, recettesActives);
      if (a.libres.length) avecAutres = true;
      return {
        nom: texte(p.nom),
        sansFiche: a.sansFiche,
        mention: a.sansFiche ? MENTION_SANS_FICHE_TABLEAU : '',
        marques: a.sansFiche ? [] : ALLERGENES.map((r) => a.ids.includes(r.id)),
        autres: a.libres.map(texte).join(', '),
        allergeneIds: a.ids,
        libres: a.libres,
      };
    }),
  }));
  const colonnes = ALLERGENES.map((r) => ({ id: r.id, label: r.label }));
  if (avecAutres) colonnes.push({ id: 'autres', label: COLONNE_AUTRES });
  return {
    titre: TITRE_TABLEAU,
    sousTitre: texte(carte?.nom),
    meta: dateEdition(jour),
    colonnes,
    avecAutres,
    sections,
    legende: LEGENDE_TABLEAU,
  };
}
