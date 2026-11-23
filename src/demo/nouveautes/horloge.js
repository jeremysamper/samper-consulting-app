// Horloge du tour des nouveautés. Importé en tout premier par src/demo/main.jsx,
// avant le Supabase simulé : le jeu de démo est daté autour de « maintenant »,
// et la version de la base du jour se calcule au chargement de fauxSupabase.js.
//
// Sous ?nouveautes=1 seulement, la page vit au moment de la mesure du lot 7
// (un dimanche ouvert, service du soir) quel que soit le jour de la visite :
// le lundi, jour fermé de la démo, n'aurait ni réservation ni horaire. L'heure
// avance normalement à partir de ce moment ; chaque rechargement y revient.
import { TOUR_ACTIF, MOMENT_DU_TOUR } from './actif.js';

function installerHorloge(cible) {
  const Vraie = window.Date;
  const decalage = cible - Vraie.now();
  function DateDuTour(...args) {
    if (!new.target) return new Vraie(Vraie.now() + decalage).toString();
    return args.length === 0 ? new Vraie(Vraie.now() + decalage) : new Vraie(...args);
  }
  DateDuTour.prototype = Vraie.prototype;
  DateDuTour.now = () => Vraie.now() + decalage;
  DateDuTour.parse = Vraie.parse;
  DateDuTour.UTC = Vraie.UTC;
  window.Date = DateDuTour;
}

if (TOUR_ACTIF) installerHorloge(Date.parse(MOMENT_DU_TOUR));
