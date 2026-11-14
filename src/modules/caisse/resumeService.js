// Résumé du service pour l'accueil de la Caisse (carte « Tables ouvertes ») :
// ce que l'écran lit déjà (tickets ouverts et leurs lignes, tables du plan),
// compté sans rien demander de plus à la base.
//   - actives : tables du plan qui ne sont pas retirées (actif !== false) ;
//   - servies : tables actives qui portent au moins un ticket ouvert (deux
//     tickets sur une même table la comptent une fois) ;
//   - prets, aSuivre : la somme de ce que etatTicket (PlanTables.jsx) dit de
//     chaque ticket, passé en argument pour garder une seule règle : la liste
//     des tickets ouverts et le plan affichent les mêmes nombres.
// Fonction pure : elle ne lit ni l'heure ni la base.
export function resumeService(tickets = [], tables = [], etatDe = () => ({})) {
  const actives = (tables || []).filter((t) => t && t.actif !== false);
  const idsActifs = new Set(actives.map((t) => t.id));
  const servies = new Set();
  let prets = 0;
  let aSuivre = 0;
  for (const t of tickets || []) {
    if (!t) continue;
    if (t.table_id && idsActifs.has(t.table_id)) servies.add(t.table_id);
    const e = etatDe(t) || {};
    prets += Number(e.prets) || 0;
    aSuivre += Number(e.aSuivre) || 0;
  }
  return { actives: actives.length, servies: servies.size, prets, aSuivre };
}

// Part des tables actives qui sont servies, de 0 à 1 (0 sans table).
export function partServies(resume) {
  if (!resume || !resume.actives) return 0;
  return Math.min(1, resume.servies / resume.actives);
}
