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

// ── Affichage ──────────────────────────────────────────────────────────────
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const ISO = /^\d{4}-\d{2}-\d{2}/;

// Date d'une perte comme partout dans l'app : « 22.11 », l'année en plus
// quand elle n'est pas celle d'aujourd'hui (« 22.11.2025 »).
export function datePerte(iso, aujourdhui) {
  const s = String(iso || '');
  if (!ISO.test(s)) return s;
  const jm = `${s.slice(8, 10)}.${s.slice(5, 7)}`;
  return String(aujourdhui || '').slice(0, 4) === s.slice(0, 4) ? jm : `${jm}.${s.slice(0, 4)}`;
}

// Unité accordée à la quantité : « 6 portions », « 1 portion ». Les unités
// de mesure (kg, l, ml, pcs) ne changent pas.
const ACCORDABLES = ['portion', 'pièce', 'botte', 'unité'];
export function unitePerte(quantite, unite) {
  const u = String(unite || '');
  const base = u.endsWith('s') && ACCORDABLES.includes(u.slice(0, -1)) ? u.slice(0, -1) : u;
  if (!ACCORDABLES.includes(base)) return u;
  return Number(quantite) > 1 ? `${base}s` : base;
}

// Période couverte par un ensemble de pertes, écrite : « novembre 2026 »
// quand tout tombe dans un même mois, sinon « du 8 octobre au 22 novembre
// 2026 ». '' sans perte datée.
export function periodePertes(pertes) {
  const dates = (pertes || []).map((p) => String(p?.date || '').slice(0, 10)).filter((d) => ISO.test(d)).sort();
  if (!dates.length) return '';
  const debut = dates[0];
  const fin = dates[dates.length - 1];
  const mois = (d) => `${MOIS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
  if (debut.slice(0, 7) === fin.slice(0, 7)) return mois(debut);
  const jour = (d) => { const j = Number(d.slice(8, 10)); return j === 1 ? '1er' : String(j); };
  const sansAnnee = (d) => `${jour(d)} ${MOIS[Number(d.slice(5, 7)) - 1]}`;
  return debut.slice(0, 4) === fin.slice(0, 4)
    ? `du ${sansAnnee(debut)} au ${sansAnnee(fin)} ${fin.slice(0, 4)}`
    : `du ${sansAnnee(debut)} ${debut.slice(0, 4)} au ${sansAnnee(fin)} ${fin.slice(0, 4)}`;
}
