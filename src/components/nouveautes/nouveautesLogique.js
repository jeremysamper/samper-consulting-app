// ─────────────────────────────────────────────────────────────────────────────
// Note de mise à jour montrée au lancement (lot N1), sans React.
//
// Une note (NOTE_ID) se montre au premier lancement de chaque personne pendant
// NOTE_JOURS jours de Zurich à partir de NOTE_DEBUT, puis plus jamais. Ses
// cartes suivent les modules du menu de la personne (droits du rôle et de la
// personne, modules actifs de l'établissement : useVisibleNav). Les cartes
// Points ont leur propre identifiant dans `vues` : chacune une seule fois.
//   points-equipe  : système allumé et personne qui participe ; hors de la
//                    fenêtre de 7 jours, en tête de la note ou seule.
//   points-gestion : qui gère les points, allumés ou non ; dans la note.
// Une ligne est une suite de morceaux : un texte (traduit par le moteur) ou
// { n } (un nombre, posé dans un nœud data-no-translate).
// ─────────────────────────────────────────────────────────────────────────────

export const NOTE_ID = '2026-11-maj';
export const NOTE_DEBUT = '2026-11-15';
export const NOTE_JOURS = 7;
export const CLE = 'nouveautes_vues';
export const cleLocale = (userId) => `sc_nouveautes_vues_${userId || ''}`;

// Pages de départ où la note ne s'ouvre jamais : le KDS (écran de cuisine en
// service) et le pointage.
export const PAGES_EXCLUES = new Set(['kds', 'pointage']);
export const pageExclue = (page) => PAGES_EXCLUES.has(page);

const POINTS_EQUIPE = {
  id: 'points-equipe',
  picto: 'points',
  titre: 'Gagnez des points',
  lignes: [
    ["Un rond vert", { n: '+2' }, "à côté d'une tâche : elle vous rapporte des points."],
    ["Ils se gagnent avec les relevés des frigos, les photos, les factures, les pertes et l'inventaire."],
    ["Pointer à l'heure vous rapporte aussi", { n: '2' }, "points."],
    ["Les points ne comptent que les jours où vous êtes au planning."],
    ["Avec vos points, choisissez du matériel pro dans la boutique."],
  ],
};

const POINTS_GESTION = {
  id: 'points-gestion',
  picto: 'points',
  titre: 'Points & boutique',
  lignes: [
    ["L'équipe gagne des points à chaque tâche faite dans l'app."],
    ["Elle les échange contre du matériel pro dans la boutique."],
    ["Pour les allumer : module Points & boutique, onglet Réglages."],
  ],
};

const LIGNE_ECHEANCES = ["Suivez les échéances et les paiements."];

const MODULES = [
  {
    id: 'dashboard',
    picto: 'dashboard',
    titre: 'Votre tableau de bord',
    droit: (d) => d.has('dashboard'),
    lignes: [
      ["Avec « Personnaliser », ajoutez, retirez ou déplacez les widgets."],
      ["Choisissez la taille de chaque widget."],
      ["Vous retrouvez le même tableau sur tous vos appareils."],
    ],
  },
  {
    id: 'caisse',
    picto: 'caisse',
    titre: 'Caisse et cuisine',
    droit: (d) => d.has('caisse') || d.has('kds'),
    lignes: [
      ["À la caisse : choisissez la table, ajoutez les plats, puis appuyez sur Envoyer."],
      ["En cuisine, chaque table arrive sur un seul bon."],
      ["Quand la cuisine coche un plat, le serveur est prévenu."],
      ["En fin de repas, encaissez ; en fin de journée, clôturez la caisse."],
    ],
  },
  {
    id: 'commande',
    picto: 'commande',
    titre: 'Commande',
    droit: (d) => d.has('commande'),
    lignes: [
      ["Chaque carte a son onglet."],
      ["Cochez les produits qui manquent."],
      ["L'onglet Ma commande regroupe tout, rangé par rayon."],
      ["Le PDF est prêt à envoyer au fournisseur."],
    ],
  },
  {
    id: 'messages',
    picto: 'messages',
    titre: 'Messages',
    droit: (d) => d.has('messages'),
    lignes: [
      ["La bulle en haut de l'écran ouvre vos messages."],
      ["Écrivez directement à un collègue."],
      ["Les réponses arrivent en direct."],
    ],
  },
  {
    id: 'achats',
    picto: 'achats',
    titre: 'Factures & achats',
    droit: (d) => d.has('inventaire'),
    lignes: [
      ["À la livraison, prenez la facture en photo."],
      LIGNE_ECHEANCES,
      ["Retrouvez les analyses par fournisseur."],
    ],
  },
];

const sansFonctions = ({ droit, ...carte }) => carte;

// Cartes de modules permises, dans l'ordre du brief. `droits` : clés de droit
// (permKey) des modules du menu de la personne.
export function cartesModules(droits, { gereFacturesAchat = false } = {}) {
  const d = droits instanceof Set ? droits : new Set(droits || []);
  return MODULES.filter((m) => m.droit(d)).map((m) => {
    const carte = sansFonctions(m);
    if (m.id === 'achats' && !gereFacturesAchat) {
      return { ...carte, lignes: carte.lignes.filter((l) => l !== LIGNE_ECHEANCES) };
    }
    return carte;
  });
}

const JOUR_MS = 86400000;
const enJours = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / JOUR_MS : NaN;
};

// Rang du jour de Zurich dans la note : 0 le jour de début, NaN si illisible.
export function rangDuJour(jour, debut = NOTE_DEBUT) {
  return enJours(jour) - enJours(debut);
}

export function dansLaFenetre(jour, debut = NOTE_DEBUT, jours = NOTE_JOURS) {
  const rang = rangDuJour(jour, debut);
  return Number.isFinite(rang) && rang >= 0 && rang < jours;
}

// Valeur gardée : { v: 1, vues: { <id>: <date ISO> } }. Tout le reste est jeté.
export function normaliserVues(brut) {
  const vues = {};
  const source = brut && typeof brut === 'object' && brut.vues && typeof brut.vues === 'object' ? brut.vues : {};
  Object.keys(source).forEach((id) => {
    if (typeof source[id] === 'string' && source[id]) vues[id] = source[id];
  });
  return { v: 1, vues };
}

// Union de deux valeurs (poste et compte) : la plus ancienne date l'emporte.
export function fusionnerVues(a, b) {
  const x = normaliserVues(a).vues;
  const y = normaliserVues(b).vues;
  const vues = { ...y };
  Object.keys(x).forEach((id) => {
    if (!vues[id] || x[id] < vues[id]) vues[id] = x[id];
  });
  return { v: 1, vues };
}

export function marquerVues(valeur, ids, quand) {
  const { vues } = normaliserVues(valeur);
  const suite = { ...vues };
  (ids || []).forEach((id) => { if (!suite[id]) suite[id] = quand; });
  return { v: 1, vues: suite };
}

export const memesVues = (a, b) => {
  const x = normaliserVues(a).vues;
  const y = normaliserVues(b).vues;
  const kx = Object.keys(x);
  return kx.length === Object.keys(y).length && kx.every((id) => y[id] === x[id]);
};

// Ce que montre le lancement. Rend { cartes, marquer } : les cartes à montrer
// (vide = rien ne s'ouvre) et les identifiants à garder comme vus quand la
// fenêtre se ferme, à n'importe quelle carte.
//   jour   : date de Zurich (AAAA-MM-JJ) ; vues : valeur gardée ;
//   droits : clés de droit des modules du menu ;
//   points : { actif, participant, gere } (usePointsEtat).
export function composerNote({ jour, vues, droits, gereFacturesAchat = false, points = {}, debut = NOTE_DEBUT } = {}) {
  const deja = normaliserVues(vues).vues;
  const d = droits instanceof Set ? droits : new Set(droits || []);
  const noteOuverte = dansLaFenetre(jour, debut) && !deja[NOTE_ID];
  const voitPoints = d.has('points');
  const equipe = voitPoints && Boolean(points.actif && points.participant) && !deja[POINTS_EQUIPE.id];
  const gestion = noteOuverte && voitPoints && Boolean(points.gere) && !deja[POINTS_GESTION.id];
  const cartes = [
    ...(equipe ? [POINTS_EQUIPE] : []),
    ...(gestion ? [POINTS_GESTION] : []),
    ...(noteOuverte ? cartesModules(d, { gereFacturesAchat }) : []),
  ];
  if (!cartes.length) return { cartes: [], marquer: [] };
  const marquer = [
    ...(noteOuverte ? [NOTE_ID] : []),
    ...(equipe ? [POINTS_EQUIPE.id] : []),
    ...(gestion ? [POINTS_GESTION.id] : []),
  ];
  return { cartes, marquer };
}

// Toutes les chaînes à traduire (titres, lignes, boutons) : le test vérifie
// qu'elles sont dans les deux glossaires.
export const BOUTONS = { passer: 'Passer', suivant: 'Suivant', fin: "C'est parti" };
export function textesATraduire() {
  const cartes = [POINTS_EQUIPE, POINTS_GESTION, ...MODULES];
  const textes = new Set(Object.values(BOUTONS));
  cartes.forEach((c) => {
    textes.add(c.titre);
    c.lignes.forEach((l) => l.forEach((m) => { if (typeof m === 'string') textes.add(m); }));
  });
  return [...textes];
}
