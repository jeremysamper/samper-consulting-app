// ─────────────────────────────────────────────────────────────────────────────
// Calculs de la caisse v7 : totaux, TVA par taux, paiements.
//
// Fonctions pures, en centimes entiers (jamais de somme de flottants), et
// miroir exact de la base (migration 20261110_caisse_v7) :
//   - total d'une ligne = quantité x prix unitaire, arrondi au centime ;
//   - prix TVA comprise : TVA d'un taux = TTC x taux / (100 + taux), arrondie
//     au centime sur le total du taux, par ticket ;
//   - arrondi aux 5 centimes sur la part réglée en espèces seulement, porté
//     par le dernier paiement en espèces ; le montant d'un paiement reste la
//     part du ticket qu'il règle (la somme des montants fait le total), la
//     maison garde montant + arrondi ;
//   - le pourboire est à part : ni dans le total, ni dans la base de TVA.
// La base refait tous ces calculs à l'encaissement et fait foi : ce fichier
// sert à l'écran (reste à payer, rendu) et aux documents (quittance, clôture).
// ─────────────────────────────────────────────────────────────────────────────

export const TAUX_NORMAL = 8.1;
export const TAUX_REDUIT = 2.6;
export const TAUX_HEBERGEMENT = 3.8;
export const TAUX_LEGAUX = [TAUX_NORMAL, TAUX_REDUIT, TAUX_HEBERGEMENT, 0];
// Seuil du ticket de caisse sans nom du client (OTVA art. 57).
export const SEUIL_NOM_CLIENT = 400;

// Francs vers centimes entiers, sans le bruit des flottants (372.49999 -> 372.5 -> 373).
export const centimes = (x) => Math.round(Number((Number(x || 0) * 100).toFixed(6)));
const francs = (c) => c / 100;

export function totalLigne(l) {
  return francs(centimes(Number(l.quantite) * Number(l.prix_unitaire)));
}

export function totalLignes(lignes) {
  return francs((lignes || []).reduce((s, l) => s + centimes(Number(l.quantite) * Number(l.prix_unitaire)), 0));
}

// TVA comprise dans un montant, au centime, moitié arrondie vers le haut
// (comme round() de la base), en entiers : le taux en dixièmes de pour cent.
export function tvaComprise(ttc, taux) {
  const t = Math.round(Number(taux) * 10);
  const d = 1000 + t;
  return francs(Math.floor((2 * centimes(ttc) * t + d) / (2 * d)));
}

// Détail par taux d'un ticket, du taux le plus haut au plus bas. Une ligne
// sans taux figé (ticket encore ouvert) compte au taux normal.
export function detailTva(lignes) {
  const parTaux = new Map();
  (lignes || []).forEach((l) => {
    const taux = l.taux_tva == null ? TAUX_NORMAL : Number(l.taux_tva);
    parTaux.set(taux, (parTaux.get(taux) || 0) + centimes(Number(l.quantite) * Number(l.prix_unitaire)));
  });
  return [...parTaux.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([taux, c]) => {
      const ttc = francs(c);
      const tva = tvaComprise(ttc, taux);
      return { taux, ttc, tva, ht: francs(c - centimes(tva)) };
    });
}

export function totalTva(lignes) {
  return francs(detailTva(lignes).reduce((s, t) => s + centimes(t.tva), 0));
}

export function arrondiCinqCentimes(montant) {
  return francs(Math.round(centimes(montant) / 5) * 5);
}

// Prépare les paiements d'un ticket comme la base les écrira.
//   paiements : [{ moyen, libelle, montant, recu, pourboire }]
// Rend les lignes (montant, pourboire, rendu, arrondi), le reste à payer, le
// rendu, l'écart d'arrondi, ce que la maison encaisse, et `complet` : la somme
// des montants fait le total et les espèces reçues couvrent ce qui est dû.
export function preparerPaiements({ total, paiements, arrondiEspeces = true }) {
  const liste = (paiements || []).map((p) => ({
    moyen: p.moyen,
    libelle: p.libelle || null,
    montant: centimes(p.montant),
    pourboire: centimes(p.pourboire),
    recu: p.recu == null || p.recu === '' ? null : centimes(p.recu),
  }));
  const du = centimes(total);
  const somme = liste.reduce((s, p) => s + p.montant, 0);
  const especes = liste.reduce((s, p) => s + (p.moyen === 'especes' ? p.montant : 0), 0);
  let dernier = -1;
  liste.forEach((p, i) => { if (p.moyen === 'especes') dernier = i; });
  const arrondi = arrondiEspeces && dernier >= 0 ? Math.round(especes / 5) * 5 - especes : 0;

  let couvert = true;
  const lignes = liste.map((p, i) => {
    const ecart = i === dernier ? arrondi : 0;
    let rendu = 0;
    if (p.moyen === 'especes' && p.recu != null) {
      rendu = p.recu - (p.montant + ecart) - p.pourboire;
      if (rendu < 0) { couvert = false; rendu = 0; }
    }
    return {
      moyen: p.moyen, libelle: p.libelle, montant: francs(p.montant), pourboire: francs(p.pourboire),
      rendu: francs(rendu), arrondi: francs(ecart),
    };
  });

  return {
    paiements: lignes,
    reste: francs(Math.max(0, du - somme)),
    complet: liste.length > 0 && somme === du && couvert,
    arrondi: francs(arrondi),
    rendu: francs(lignes.reduce((s, p) => s + centimes(p.rendu), 0)),
    pourboire: francs(liste.reduce((s, p) => s + p.pourboire, 0)),
    encaisse: francs(somme + arrondi),
  };
}

// « 2026-000123 » : le numéro d'un ticket tel qu'il s'écrit partout.
export function numeroTicket(ticket) {
  if (!ticket || ticket.numero == null) return null;
  return `${ticket.annee}-${String(ticket.numero).padStart(6, '0')}`;
}

// Le jour d'exploitation en cours, comme la base : la journée finit à l'heure
// réglée (04:00 par défaut). `aujourdhui` (AAAA-MM-JJ) et `minutes` (depuis
// minuit) sont ceux de Zurich ; `veille` rend le jour d'avant.
export function jourExploitation({ aujourdhui, minutes, finJournee = '04:00', veille }) {
  const [h, m] = String(finJournee).split(':').map(Number);
  return minutes < (h * 60 + m) ? veille(aujourdhui) : aujourdhui;
}
