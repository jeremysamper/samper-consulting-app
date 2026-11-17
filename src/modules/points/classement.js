// ─────────────────────────────────────────────────────────────────────────────
// Classement de l'équipe (onglet Équipe de la gestion des points, 17.11.2026).
// Fonction pure, sans React : testée dans points.test.mjs.
//
// - Les personnes masquées du planning de l'établissement (planning_masques)
//   n'apparaissent nulle part, et les rangs se comptent sans elles.
// - Sont classés les participants actifs et non exclus, par solde décroissant ;
//   à solde égal, même rang (1, 2, 2, 4), l'ordre suit les points du mois puis
//   le nom. Un solde à zéro n'a pas de rang.
// - Le podium prend les trois premiers qui ont des points ; la liste suit.
// - Les autres (exclus, rôle qui ne participe pas, compte désactivé) restent
//   hors classement, pour que la direction puisse encore les ajuster.
// ─────────────────────────────────────────────────────────────────────────────

const nomTri = (p) => [p?.prenom, p?.nom].filter(Boolean).join(' ');
const parNom = (a, b) => nomTri(a).localeCompare(nomTri(b), 'fr', { sensitivity: 'base' });

export function classerEquipe(soldes, masques) {
  const masque = masques instanceof Set ? masques : new Set(masques || []);
  const visibles = (Array.isArray(soldes) ? soldes : []).filter((p) => p && !masque.has(p.userId));
  const classe = (p) => p.participant && !p.exclu && p.actif !== false;

  const tries = visibles.filter(classe).sort((a, b) => (
    (Number(b.solde) || 0) - (Number(a.solde) || 0)
    || (Number(b.gagneMois) || 0) - (Number(a.gagneMois) || 0)
    || parNom(a, b)
  ));
  let rangPrecedent = 0;
  let soldePrecedent = null;
  const classes = tries.map((p, i) => {
    const solde = Number(p.solde) || 0;
    if (solde !== soldePrecedent) { rangPrecedent = i + 1; soldePrecedent = solde; }
    return { ...p, rang: solde > 0 ? rangPrecedent : null };
  });

  const podium = classes.slice(0, 3).filter((p) => p.rang != null);
  return {
    podium,
    liste: classes.slice(podium.length),
    hors: visibles.filter((p) => !classe(p)).sort(parNom),
  };
}

// Initiales d'une personne pour son rond (prénom puis nom).
export function initiales(p) {
  const lettre = (s) => String(s || '').trim().charAt(0).toLocaleUpperCase('fr');
  return (lettre(p?.prenom) + lettre(p?.nom)) || '?';
}
