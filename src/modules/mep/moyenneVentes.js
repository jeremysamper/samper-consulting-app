// Règle de moyenne de la « Mise en place de demain », fonction pure partagée
// par la Mise en place (ventes de la Caisse native) et Ventes POS.
// `ventes` : [{ dow, qty }], dow de 0 (dimanche) à 6 (samedi).
// Deux occurrences ou plus du jour de semaine de demain : leur moyenne,
// arrondie au supérieur, fiable. Sinon : la moyenne de toutes les ventes,
// non fiable. Sans vente : zéro.

export function moyenneJourSemaine(ventes, dowDemain) {
  const liste = Array.isArray(ventes) ? ventes : [];
  const memeJour = liste.filter((s) => s.dow === dowDemain);
  if (memeJour.length >= 2) {
    const somme = memeJour.reduce((acc, s) => acc + s.qty, 0);
    return { qty: Math.ceil(somme / memeJour.length), reliable: true, occurrences: memeJour.length };
  }
  if (liste.length > 0) {
    const somme = liste.reduce((acc, s) => acc + s.qty, 0);
    return { qty: Math.ceil(somme / liste.length), reliable: false, occurrences: liste.length };
  }
  return { qty: 0, reliable: false, occurrences: 0 };
}
