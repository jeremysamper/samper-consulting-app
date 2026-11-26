// ─────────────────────────────────────────────────────────────────────────────
// Fin de journée de la caisse (lot 20 du panel, 26.11.2026).
//
// L'écran « Fin de journée » liste les produits dont le compteur de portions
// du jour (lot 12) garde un reste. Pour chacun, la personne remet la case à
// zéro (la case revient en vente sans nombre, par la RPC qui pose le
// compteur) ou passe le reste en perte (la saisie du module Pertes s'ouvre
// préremplie, rien n'est écrit sans sa validation).
//
// Fonctions pures : le jour de Zurich est un paramètre, comme dans rupture.js.
// ─────────────────────────────────────────────────────────────────────────────

import { etatDisponibilite } from './rupture.js';

// Cases avec un reste aujourd'hui : compteur daté du jour de Zurich et
// au-dessus de zéro. boutons : plat_id -> ligne de caisse_boutons
// (listBoutons) ; plats : les plats de la maison. Un produit épuisé durable
// (il n'a pas de reste du jour, D3), une case sans nombre, un compteur d'un
// autre jour ou tombé à zéro, un plat inconnu de la maison : absents.
// Rend [{ platId, nom, nomCourt, restant }], rangées par nom affiché.
export function casesFinDeJournee(boutons, plats, jourZurich) {
  const parId = new Map((plats || []).filter((p) => p && p.id).map((p) => [p.id, p]));
  const cases = [];
  for (const [platId, bouton] of Object.entries(boutons || {})) {
    const plat = parId.get(platId);
    if (!plat || !bouton) continue;
    const { etat, restant } = etatDisponibilite(bouton, jourZurich);
    if (etat !== 'compte' || !(restant > 0)) continue;
    const nom = String(plat.nom || '').trim();
    const nomCourt = String(bouton.nom_court || '').trim() || nom;
    cases.push({ platId, nom: nom || nomCourt, nomCourt, restant });
  }
  return cases.sort((a, b) => a.nomCourt.localeCompare(b.nomCourt, 'fr'));
}

export const MOTIF_FIN_DE_SERVICE = 'Fin de service';

const cle = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Motif de la perte préremplie : « Fin de service » s'il est dans les motifs
// de la maison (casse et accents ignorés), sinon le plus proche qui existe,
// dans cet ordre : un motif qui parle de fin de service, de journée ou de
// soirée ; les invendus ; la surproduction (motif d'origine des pertes) ; les
// restes ; « Autre » ; le premier motif. Sans motif du tout : « Autre », comme
// le défaut de la saisie de Pertes. Rend toujours le texte exact de la maison.
export function motifFinDeService(motifs) {
  const liste = (motifs || []).filter((m) => typeof m === 'string' && m.trim());
  if (!liste.length) return 'Autre';
  const cles = liste.map(cle);
  const trouve = (essai) => {
    const i = cles.findIndex(essai);
    return i >= 0 ? liste[i] : null;
  };
  return trouve((c) => c === cle(MOTIF_FIN_DE_SERVICE))
    || trouve((c) => c.includes('fin de service'))
    || trouve((c) => /fin (de |du )?(journee|soiree|soir|jour)/.test(c))
    || trouve((c) => c.includes('invendu'))
    || trouve((c) => c.includes('surproduction'))
    || trouve((c) => /\brestes?\b/.test(c))
    || trouve((c) => c === 'autre')
    || liste[0];
}
