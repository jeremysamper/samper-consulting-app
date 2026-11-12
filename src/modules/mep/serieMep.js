// ─────────────────────────────────────────────────────────────────────────────
// Préparations de la mise en place par tranche, sans React ni service (testé
// par node --test, serieMep.test.mjs), pour le module Statistiques. Même règle
// que l'avancement d'une liste (MiseEnPlace.jsx) : préparations faites sur
// préparations de la liste. Jour : la date de service de la liste.
//   listes : [{ dateService, items: [{ fait }] }]
// ─────────────────────────────────────────────────────────────────────────────

export function serieMep(listes, tranches) {
  const datees = (listes || []).filter((l) => /^\d{4}-\d{2}-\d{2}/.test(String(l?.dateService || '')));
  return (tranches || []).map((t) => {
    const dedans = datees.filter((l) => l.dateService.slice(0, 10) >= t.debut && l.dateService.slice(0, 10) <= t.fin);
    const items = dedans.flatMap((l) => l.items || []);
    const faites = items.filter((i) => i.fait).length;
    return {
      debut: t.debut,
      fin: t.fin,
      vide: dedans.length === 0,
      listes: dedans.length,
      preparations: items.length,
      faites,
      taux: items.length ? faites / items.length : null,
    };
  });
}
