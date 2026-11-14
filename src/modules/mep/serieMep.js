// ─────────────────────────────────────────────────────────────────────────────
// Préparations de la mise en place par tranche, sans React ni service (testé
// par node --test, serieMep.test.mjs), pour le module Statistiques. Même règle
// que l'avancement d'une liste (MiseEnPlace.jsx) : préparations faites sur
// préparations de la liste. Jour : la date de service de la liste.
//   listes : [{ dateService, items: [{ fait }] }]
// ─────────────────────────────────────────────────────────────────────────────

// Avancement d'un ensemble de préparations : faites sur préparations. Lu par
// le détail d'une liste (MepDetail.jsx, une section) et par serieMep.
export function avancementMep(items) {
  const liste = items || [];
  const faites = liste.filter((i) => i.fait).length;
  return { preparations: liste.length, faites, taux: liste.length ? faites / liste.length : null };
}

export function serieMep(listes, tranches) {
  const datees = (listes || []).filter((l) => /^\d{4}-\d{2}-\d{2}/.test(String(l?.dateService || '')));
  return (tranches || []).map((t) => {
    const dedans = datees.filter((l) => l.dateService.slice(0, 10) >= t.debut && l.dateService.slice(0, 10) <= t.fin);
    return { debut: t.debut, fin: t.fin, vide: dedans.length === 0, listes: dedans.length, ...avancementMep(dedans.flatMap((l) => l.items || [])) };
  });
}
