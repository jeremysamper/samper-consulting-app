// ─────────────────────────────────────────────────────────────────────────────
// Barème du temps gagné (lot T, 18.11.2026). Fichier pur, lu par les tests.
//
// Chaque geste que l'app fait à la place de quelqu'un est inscrit dans la
// table temps_gagne (geste et nombre, jamais de durée). La durée vient d'ici :
// une estimation prudente, écrite avec ce qu'on faisait avant et la raison du
// chiffre retenu. Toutes les valeurs sont volontairement basses : le temps de
// relecture de ce que l'app a préparé est déduit, et aucun geste n'est compté
// s'il n'a pas abouti. À recaler sur un chronométrage en service.
//
// Un geste inconnu du barème (écrit par une version plus récente du front, ou
// retiré d'ici) compte pour zéro : jamais de durée inventée.
// ─────────────────────────────────────────────────────────────────────────────

export const BAREME = {
  fiche_importee: {
    secondes: 8 * 60,
    libelle: 'Fiches importées',
    unite: 'fiche',
    avant: 'Taper la fiche : nom, portions, une huitaine d\'ingrédients avec leur quantité et leur unité, puis les étapes. Environ 30 champs.',
    pourquoi: 'Une fiche complète se tape en 15 à 20 minutes. On retient 8 minutes, relecture de l\'import déduite.',
  },
  horaire_copie: {
    secondes: 30,
    libelle: 'Horaires de planning copiés',
    unite: 'horaire',
    avant: 'Saisir chaque horaire à la main : ouvrir la case, choisir le début, la fin et la pause, puis enregistrer.',
    pourquoi: 'Un horaire saisi demande quatre gestes, 40 secondes à une minute. On retient 30 secondes, vérification de la copie déduite.',
  },
  facture_lue: {
    secondes: 30,
    libelle: 'Lignes de facture lues',
    unite: 'ligne',
    avant: 'Taper chaque ligne de la facture : produit, quantité, prix.',
    pourquoi: 'Une ligne se tape en 45 secondes à une minute. On retient 30 secondes, contrôle de la lecture déduit.',
  },
  // Les lots suivants ajoutent ici leur geste (passation préparée, briefing,
  // échange de service, relevé par photo) le jour où il existe dans l'app.
};

export const GESTES = Object.keys(BAREME);

export function estGeste(geste) {
  return Object.prototype.hasOwnProperty.call(BAREME, geste);
}

// Lignes de temps_gagne ({ geste, quantite }) vers le total et le détail par
// geste, du plus gros gain au plus petit. Quantité absente : 1 ; quantité non
// entière, nulle ou négative : la ligne est ignorée.
export function resumerTempsGagne(lignes) {
  const parGeste = new Map();
  for (const ligne of lignes || []) {
    const geste = ligne?.geste;
    if (!estGeste(geste)) continue;
    const q = ligne.quantite == null ? 1 : Number(ligne.quantite);
    if (!Number.isInteger(q) || q <= 0) continue;
    const prec = parGeste.get(geste) || { geste, quantite: 0, secondes: 0 };
    prec.quantite += q;
    prec.secondes += q * BAREME[geste].secondes;
    parGeste.set(geste, prec);
  }
  const detail = [...parGeste.values()]
    .map((d) => ({ ...d, libelle: BAREME[d.geste].libelle }))
    .sort((a, b) => b.secondes - a.secondes || a.libelle.localeCompare(b.libelle, 'fr'));
  return { totalSecondes: detail.reduce((s, d) => s + d.secondes, 0), detail };
}

// « 2 h 15 », « 45 min », « 0 min ». Arrondi à la minute inférieure : un
// compteur prudent n'arrondit jamais vers le haut.
export function formatDuree(secondes) {
  const minutes = Math.floor(Math.max(0, Number(secondes) || 0) / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

// Durée d'un geste du barème : « 30 s » sous la minute, sinon comme formatDuree.
export function formatDureeGeste(secondes) {
  const s = Math.max(0, Math.floor(Number(secondes) || 0));
  return s < 60 ? `${s} s` : formatDuree(s);
}
