// Tour des nouveautés du plan 15 dans la démo : allumé par ?nouveautes=1 dans
// l'adresse de /demo.html, et par rien d'autre. Sans ce paramètre, la démo
// reste exactement celle de l'intégration (ni horloge fixée, ni jeu retouché,
// ni panneau).
export const TOUR_ACTIF = (() => {
  try {
    return new URLSearchParams(window.location.search).get('nouveautes') === '1';
  } catch {
    return false;
  }
})();

// Moment de la mesure du lot 7 : dimanche 22 novembre 2026, 17 h 20 à Zurich.
// Les notes « après » du panneau ont été prises à ce moment, sur ce jeu.
export const MOMENT_DU_TOUR = '2026-11-22T16:20:00Z';
export const MOMENT_DU_TOUR_LIBELLE = 'dimanche 22 novembre 2026, 17 h 20';
