// Jeu d'essai des groupes, partagé par les tests (serieGroupes,
// Statistiques) : 1 100 groupes sur un an, un sur neuf annulé.
export function jeuGroupes() {
  return Array.from({ length: 1100 }, (_, i) => ({
    id: `g${i}`, dateEvenement: new Date(Date.UTC(2026, 0, 1 + (i * 3) % 365)).toISOString().slice(0, 10),
    nom: `Groupe ${i}`, nbPax: 8 + (i % 30), annule: i % 9 === 0,
  }));
}
