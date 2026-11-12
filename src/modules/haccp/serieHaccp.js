// ─────────────────────────────────────────────────────────────────────────────
// Chiffres des relevés HACCP par tranche, sans React ni service (testé par
// node --test, serieHaccp.test.mjs). Mêmes règles que les chiffres du registre
// des relevés (HACCP.jsx l. 656 à 663) :
//   relevés   : nombre de relevés ;
//   anomalies : relevés non conformes (`conforme` faux, posé à la saisie) ;
//   taux      : conformes divisés par relevés, sans l'arrondi à l'unité de
//               l'affichage ; null sans relevé ;
//   parZone   : le dernier relevé de chaque zone dans la tranche (date puis
//               heure), une température relevée ne s'additionne pas.
// ─────────────────────────────────────────────────────────────────────────────

const plusRecent = (a, b) => (a.date !== b.date ? a.date > b.date : String(a.heure || '') >= String(b.heure || ''));

export function chiffresReleves(releves) {
  const liste = releves || [];
  const anomalies = liste.filter((r) => !r.conforme).length;
  const parZone = {};
  liste.forEach((r) => {
    const v = Number(r.valeur);
    if (!r.zoneId || !Number.isFinite(v)) return;
    const z = parZone[r.zoneId];
    if (!z || plusRecent(r, z)) parZone[r.zoneId] = { valeur: v, date: r.date, heure: r.heure || '' };
  });
  return {
    releves: liste.length,
    anomalies,
    conformes: liste.length - anomalies,
    taux: liste.length ? (liste.length - anomalies) / liste.length : null,
    parZone,
  };
}

// Un point par tranche [{ debut, fin }] ; vide quand aucun relevé n'y tombe.
export function serieHaccp(releves, tranches) {
  const datees = (releves || []).filter((r) => /^\d{4}-\d{2}-\d{2}/.test(String(r?.date || '')));
  return (tranches || []).map((t) => {
    const dedans = datees.filter((r) => r.date.slice(0, 10) >= t.debut && r.date.slice(0, 10) <= t.fin);
    return { debut: t.debut, fin: t.fin, vide: dedans.length === 0, ...chiffresReleves(dedans) };
  });
}
