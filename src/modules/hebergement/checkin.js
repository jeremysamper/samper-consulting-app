// ─────────────────────────────────────────────────────────────────────────────
// Check-in pré-rempli (plan 15, lot 6b) : la chambre proposée à un séjour
// prévu qui n'en a pas encore. Fichier pur, testé par node --test
// (checkin.test.mjs) : hotelData.js lit Supabase à son chargement.
//
// Une chambre se propose si elle est active, hors service non, et libre sur
// toutes les nuits du séjour. Parmi elles : la catégorie du tarif d'abord,
// puis une chambre prête (inspectée, propre) avant une chambre à faire, puis
// assez grande pour le séjour, puis le plus petit numéro.
// ─────────────────────────────────────────────────────────────────────────────

const OCCUPE = new Set(['prevu', 'en_maison']);
const RANG_MENAGE = { inspectee: 0, propre: 1, en_cours: 2, a_faire: 3 };

const nuitsCommunes = (a, b) => a.arrivee < b.depart && b.arrivee < a.depart;

export function chambreLibre(chambre, sejours, sejour) {
  return !(sejours || []).some((x) => x.id !== sejour.id && x.chambreId === chambre.id && OCCUPE.has(x.statut) && nuitsCommunes(x, sejour));
}

export function chambreProposee(chambres, sejours, sejour, tarif = null) {
  const personnes = (Number(sejour.nbAdultes) || 1) + (Number(sejour.nbEnfants) || 0);
  const categorie = String(tarif?.categorie || '').toLowerCase();
  const candidates = (chambres || []).filter((c) => c.actif !== false && c.statutMenage !== 'hors_service' && chambreLibre(c, sejours, sejour));
  const rang = (c) => [
    categorie && String(c.categorie || '').toLowerCase() === categorie ? 0 : 1,
    RANG_MENAGE[c.statutMenage] ?? 9,
    (Number(c.capacite) || 0) >= personnes ? 0 : 1,
  ];
  return candidates.sort((a, b) => {
    const ra = rang(a);
    const rb = rang(b);
    for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return String(a.numero).localeCompare(String(b.numero), 'fr', { numeric: true });
  })[0] || null;
}
