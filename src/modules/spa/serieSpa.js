// ─────────────────────────────────────────────────────────────────────────────
// Soins et bons du Spa par tranche, sans React ni service (testé par node
// --test, serieSpa.test.mjs), pour le module Statistiques. Mêmes règles que
// l'agenda (AgendaSpa.jsx) :
//   soins     : rendez-vous ni annulés ni absents (ACTIF, l. 24), au jour du
//               rendez-vous ;
//   minutes   : durée en cabine, somme des durées des soins (l. 57) ;
//   annules   : annulés et absents (l. 56) ;
//   parPraticien : soins et minutes de chaque praticien (l. 218 et 219),
//               « À attribuer » sans praticien.
// Bons : bons cadeaux créés, au jour de Zurich de leur création. Leur valeur
// est un texte (« un massage de 60 minutes »), pas un montant : elle ne
// s'additionne pas.
// ─────────────────────────────────────────────────────────────────────────────

import { zurichDateHeure } from '../../utils/zurichTime.js';

export const ACTIF_SPA = (r) => !['annulee', 'absent'].includes(r.statut);
export const SANS_PRATICIEN_SPA = 'À attribuer';

export function serieSpa({ reservations, bons }, tranches) {
  const rdv = (reservations || []).filter((r) => /^\d{4}-\d{2}-\d{2}/.test(String(r?.dateRdv || '')));
  const bonsDates = (bons || []).filter((b) => b?.createdAt).map((b) => zurichDateHeure(b.createdAt).jour);
  return (tranches || []).map((t) => {
    const dedans = rdv.filter((r) => r.dateRdv.slice(0, 10) >= t.debut && r.dateRdv.slice(0, 10) <= t.fin);
    const actifs = dedans.filter(ACTIF_SPA);
    const parPraticien = {};
    actifs.forEach((r) => {
      const p = r.praticien || SANS_PRATICIEN_SPA;
      const e = parPraticien[p] || (parPraticien[p] = { soins: 0, minutes: 0 });
      e.soins += 1;
      e.minutes += Number(r.dureeMin) || 0;
    });
    return {
      debut: t.debut,
      fin: t.fin,
      vide: dedans.length === 0,
      soins: actifs.length,
      minutes: actifs.reduce((s, r) => s + (Number(r.dureeMin) || 0), 0),
      annules: dedans.length - actifs.length,
      parPraticien,
      bons: bonsDates.filter((j) => j >= t.debut && j <= t.fin).length,
    };
  });
}
