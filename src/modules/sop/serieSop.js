// ─────────────────────────────────────────────────────────────────────────────
// Exécutions des procédures par tranche, sans React ni service (testé par
// node --test, serieSop.test.mjs), pour le module Statistiques. Mêmes règles
// que SOP.jsx : une exécution est terminée au statut 'terminee' (l. 159),
// abandonnée au statut 'abandonnee' ; ses étapes cochées sur ses étapes
// (l. 570). Jour : la date d'exécution.
// ─────────────────────────────────────────────────────────────────────────────

// Comptes d'un ensemble d'exécutions, sans dates : la règle de SOP.jsx, lue
// aussi par son en-tête (exécutions terminées).
export function compteSop(executions) {
  const liste = executions || [];
  const etapes = liste.reduce((s, e) => s + (Number(e.totalEtapes) || 0), 0);
  const cochees = liste.reduce((s, e) => s + (Number(e.etapesCochees) || 0), 0);
  return {
    lancees: liste.length,
    terminees: liste.filter((e) => e.statut === 'terminee').length,
    abandonnees: liste.filter((e) => e.statut === 'abandonnee').length,
    etapes,
    cochees,
    tauxEtapes: etapes ? cochees / etapes : null,
  };
}

export function serieSop(executions, tranches) {
  const datees = (executions || []).filter((e) => /^\d{4}-\d{2}-\d{2}/.test(String(e?.dateExecution || '')));
  return (tranches || []).map((t) => {
    const dedans = datees.filter((e) => e.dateExecution.slice(0, 10) >= t.debut && e.dateExecution.slice(0, 10) <= t.fin);
    return { debut: t.debut, fin: t.fin, vide: dedans.length === 0, ...compteSop(dedans) };
  });
}
