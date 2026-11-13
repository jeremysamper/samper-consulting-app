// ─────────────────────────────────────────────────────────────────────────────
// Chiffres des pertes, sans React ni service (testé par node --test,
// calculPertes.test.mjs). Mêmes règles que l'écran Pertes.jsx :
//   - valeur d'une perte : quantité fois valeur unitaire (l. 181, et
//     chiffresGestion du tableau de bord) ;
//   - valeur totale et répartition par catégorie sur le même ensemble
//     (l. 181 à 185), validées ou non ;
//   - déclarations : nombre de pertes de l'ensemble (l. 270).
// L'écran ne filtre pas par date ; seriePertes découpe le même calcul par la
// date de la perte, pour le module Statistiques.
// ─────────────────────────────────────────────────────────────────────────────

export const valeurPerte = (p) => (Number(p?.quantite) || 0) * (Number(p?.valeurUnit) || 0);

const ajouter = (acc, cle, v) => { acc[cle] = (acc[cle] || 0) + v; };

// Totaux d'un ensemble de pertes : { valeur, declarations, parCategorie,
// parMotif } ; parCategorie et parMotif : { libellé: valeur }.
export function totauxPertes(pertes) {
  const out = { valeur: 0, declarations: 0, parCategorie: {}, parMotif: {} };
  (pertes || []).forEach((p) => {
    const v = valeurPerte(p);
    out.valeur += v;
    out.declarations += 1;
    ajouter(out.parCategorie, p.categorie || 'Autres', v);
    ajouter(out.parMotif, p.motif || 'Autres', v);
  });
  return out;
}

// Un point par tranche [{ debut, fin }] : les totaux des pertes datées dans la
// tranche, et `vide` quand aucune perte n'y tombe (« n/a » au graphique).
export function seriePertes(pertes, tranches) {
  const liste = (pertes || []).filter((p) => /^\d{4}-\d{2}-\d{2}/.test(String(p?.date || '')));
  return (tranches || []).map((t) => {
    const dedans = liste.filter((p) => p.date.slice(0, 10) >= t.debut && p.date.slice(0, 10) <= t.fin);
    return { debut: t.debut, fin: t.fin, vide: dedans.length === 0, ...totauxPertes(dedans) };
  });
}

// Les sept derniers jours jusqu'à `aujourdhui` compris (YYYY-MM-DD) : un
// point par jour, { date, valeur, declarations }, du plus ancien au plus
// récent. Même calcul que seriePertes, une tranche d'un jour chacune. Sert à
// la carte « Sept derniers jours » de l'écran Pertes (CartesPertes.jsx).
export function septJoursPertes(pertes, aujourdhui) {
  const [y, m, d] = String(aujourdhui || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return [];
  const jours = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(y, m - 1, d - 6 + i)).toISOString().slice(0, 10));
  return seriePertes(pertes, jours.map((j) => ({ debut: j, fin: j })))
    .map((p) => ({ date: p.debut, valeur: p.valeur, declarations: p.declarations }));
}
