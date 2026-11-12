// Jeu d'essai des inventaires, partagé par les tests (serieInventaire,
// Statistiques) : deux périmètres, un comptage par mois et par périmètre,
// des lignes avec écarts, et un inventaire en cours qui ne doit pas compter.
export function jeuInventaires() {
  const out = [];
  ['Général', 'Bar'].forEach((nom, p) => {
    for (let m = 1; m <= 11; m += 1) {
      const lignes = Array.from({ length: 60 }, (_, k) => ({ produit: `P${k}`, ecartValeur: ((k + m + p) % 7) - 3 + 0.25 }));
      out.push({ id: `inv-${p}-${m}`, nom, date: `2026-${String(m).padStart(2, '0')}-28`, statut: 'validé', valeurTotale: 4000 + m * 37.5 + p * 1200, lignes });
    }
  });
  out.push({ id: 'inv-cours', nom: 'Général', date: '2026-11-30', statut: 'en_cours', valeurTotale: 120, lignes: [{ ecartValeur: -500 }] });
  return out;
}
