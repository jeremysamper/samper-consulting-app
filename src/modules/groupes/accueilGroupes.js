// ─────────────────────────────────────────────────────────────────────────────
// Repères de l'accueil des Groupes (direction Galet), fonction pure testée par
// accueilGroupes.test.mjs. Elle ne lit que les groupes déjà chargés par le
// module (useGroupes). Un groupe annulé ne compte pas, comme dans la liste du
// mois et le bandeau d'anticipation.
//   aVenir    groupes non annulés à partir d'aujourd'hui, et leurs pax
//   aLire     parmi eux, ceux que la brigade n'a pas encore lus (a_lire)
//   aPreparer parmi eux, ceux lus mais pas encore préparés (lu)
// ─────────────────────────────────────────────────────────────────────────────

export function reperesGroupes(groupes, aujourdhuiISO) {
  const aVenir = (groupes || []).filter((g) => !g.annule && String(g.dateEvenement || '') >= aujourdhuiISO);
  return {
    aVenir: aVenir.length,
    pax: aVenir.reduce((s, g) => s + (Number(g.nbPax) || 0), 0),
    aLire: aVenir.filter((g) => (g.statut || 'a_lire') === 'a_lire').length,
    aPreparer: aVenir.filter((g) => g.statut === 'lu').length,
  };
}
