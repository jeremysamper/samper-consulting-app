// ─────────────────────────────────────────────────────────────────────────────
// Chiffres des groupes par tranche, sans React ni service (testé par node
// --test, serieGroupes.test.mjs), pour le module Statistiques. Mêmes règles
// que la liste du mois du calendrier (Groupes.jsx l. 181 à 183) :
//   groupes  : groupes non annulés, à la date de l'événement ;
//   convives : somme des pax des groupes non annulés ;
//   annules  : groupes annulés.
// ─────────────────────────────────────────────────────────────────────────────

export function chiffresGroupes(groupes) {
  const actifs = (groupes || []).filter((g) => !g.annule);
  return {
    groupes: actifs.length,
    convives: actifs.reduce((s, g) => s + (Number(g.nbPax) || 0), 0),
    annules: (groupes || []).length - actifs.length,
  };
}

// Un point par tranche [{ debut, fin }] ; vide quand aucun groupe, annulé ou
// non, n'y tombe.
export function serieGroupes(groupes, tranches) {
  const dates = (groupes || []).filter((g) => /^\d{4}-\d{2}-\d{2}/.test(String(g?.dateEvenement || '')));
  return (tranches || []).map((t) => {
    const dedans = dates.filter((g) => g.dateEvenement.slice(0, 10) >= t.debut && g.dateEvenement.slice(0, 10) <= t.fin);
    return { debut: t.debut, fin: t.fin, vide: dedans.length === 0, ...chiffresGroupes(dedans) };
  });
}
