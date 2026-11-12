// Jeu d'essai des pertes, partagé par les tests (calculPertes, Statistiques).
const CATS = ['Légumes', 'Viandes', 'Poissons', 'Produits laitiers'];
const MOTIFS = ['DLC dépassée', 'Casse', 'Erreur de production'];

// 1 200 pertes sur un an, quantités et prix à trois décimales.
export function jeuPertes(n = 1200) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const jour = 1 + (i * 7) % 365;
    const d = new Date(Date.UTC(2026, 0, jour));
    out.push({
      id: `pt${i}`, date: d.toISOString().slice(0, 10), produit: `P${i % 40}`,
      categorie: CATS[i % CATS.length], motif: MOTIFS[i % MOTIFS.length],
      quantite: 0.25 + (i % 9) * 0.333, valeurUnit: 3.5 + (i % 13) * 1.17, valide: i % 4 !== 0,
    });
  }
  return out;
}
