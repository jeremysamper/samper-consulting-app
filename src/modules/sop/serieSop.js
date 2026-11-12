// ─────────────────────────────────────────────────────────────────────────────
// Exécutions des procédures par tranche, sans React ni service (testé par
// node --test, serieSop.test.mjs), pour le module Statistiques. Mêmes règles
// que SOP.jsx : une exécution est terminée au statut 'terminee' (l. 159),
// abandonnée au statut 'abandonnee' ; ses étapes cochées sur ses étapes
// (l. 570). Jour : la date d'exécution.
// ─────────────────────────────────────────────────────────────────────────────

export function serieSop(executions, tranches) {
  const datees = (executions || []).filter((e) => /^\d{4}-\d{2}-\d{2}/.test(String(e?.dateExecution || '')));
  return (tranches || []).map((t) => {
    const dedans = datees.filter((e) => e.dateExecution.slice(0, 10) >= t.debut && e.dateExecution.slice(0, 10) <= t.fin);
    const etapes = dedans.reduce((s, e) => s + (Number(e.totalEtapes) || 0), 0);
    const cochees = dedans.reduce((s, e) => s + (Number(e.etapesCochees) || 0), 0);
    return {
      debut: t.debut,
      fin: t.fin,
      vide: dedans.length === 0,
      lancees: dedans.length,
      terminees: dedans.filter((e) => e.statut === 'terminee').length,
      abandonnees: dedans.filter((e) => e.statut === 'abandonnee').length,
      etapes,
      cochees,
      tauxEtapes: etapes ? cochees / etapes : null,
    };
  });
}
