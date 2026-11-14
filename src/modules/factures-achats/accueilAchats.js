// ─────────────────────────────────────────────────────────────────────────────
// Accueil de Factures & achats (direction Galet) : les chiffres des repères et
// des cartes, sans React. Rien n'est lu en plus : tout vient des documents
// d'achat déjà chargés par l'écran (achats_documents), comptés par les règles
// d'avant (totauxFactures, echeancier, depensesParMois, parFournisseur).
//
//   reperesAchats        factures à régler et en retard (TTC, comme « Je règle
//                        les factures »), prochaine échéance
//   depensesSixMois      les six derniers mois des dépenses par mois (montant
//                        retenu de chaque facture, comme les analyses)
//   partsFournisseurs    les dépenses des 12 mois par fournisseur, les
//                        premiers nommés, les suivants en une part
//   prochainesEcheances  les factures à régler les plus pressées, en retard
//                        d'abord
// ─────────────────────────────────────────────────────────────────────────────

import { estFacture, statutPaiement, totauxFactures, trierParEcheance } from '../inventaire/facturesLogic.js';
import { depensesParMois, echeancier, facturesDesDouzeMois, libelleMois, parFournisseur, trierDocuments } from './analysesAchats.js';

const arrondi = (v) => Math.round(v * 100) / 100;
const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

// Factures à régler (montant TTC connu, compte des sans TTC), en retard, et
// la plus proche échéance à venir. Mêmes comptes que les tuiles d'avant.
export function reperesAchats(docs, aujourdhui) {
  const factures = (docs || []).filter(estFacture);
  const t = totauxFactures(factures, aujourdhui);
  const sansTTC = factures.filter(f => !f.regleLe && nombre(f.totalTTC) == null).length;
  const ech = echeancier(docs, aujourdhui);
  const prochaine = ech.tranches.filter(x => x.id !== 'retard' && x.id !== 'sans')
    .flatMap(x => x.factures).map(f => f.dateEcheance).sort()[0] || null;
  return {
    aRegler: { n: t.aRegler.n, montant: arrondi(t.aRegler.montant), sansTTC },
    enRetard: { n: t.enRetard.n, montant: arrondi(t.enRetard.montant) },
    prochaine,
  };
}

// Les six derniers mois de depensesParMois (le mois en cours en dernier).
// Une barre sans facture chiffrée vaut 0 ; total null quand aucun des six
// mois n'a de montant (la carte n'est alors pas rendue).
export function depensesSixMois(docs, aujourdhui) {
  const { points } = depensesParMois(trierDocuments(docs).factures, aujourdhui);
  const six = points.slice(-6);
  const avec = six.filter(p => p.valeur != null);
  return {
    mois: six.map(p => ({ cle: p.cle, libelle: libelleMois(p.cle), valeur: p.valeur == null ? 0 : p.valeur })),
    total: avec.length ? arrondi(avec.reduce((s, p) => s + p.valeur, 0)) : null,
    sansMontant: six.reduce((s, p) => s + p.sansMontant, 0),
  };
}

// Dépenses des 12 mois par fournisseur : les `max` premiers nommés, les
// suivants réunis en « Autres fournisseurs ». Les factures sans montant
// n'entrent dans aucune part. Total null sans montant.
export function partsFournisseurs(docs, aujourdhui, max = 4) {
  const factures = facturesDesDouzeMois(trierDocuments(docs).factures, aujourdhui);
  const groupes = parFournisseur(factures).filter(g => g.montant != null && g.montant > 0);
  const total = groupes.reduce((s, g) => s + g.montant, 0);
  if (!(total > 0)) return { lignes: [], total: null };
  const premiers = groupes.slice(0, max).map(g => ({ cle: g.cle, label: g.label, montant: g.montant, autres: false }));
  const reste = groupes.slice(max);
  const lignes = reste.length
    ? [...premiers, { cle: '__autres__', label: null, n: reste.length, montant: arrondi(reste.reduce((s, g) => s + g.montant, 0)), autres: true }]
    : premiers;
  return {
    lignes: lignes.map(l => ({ ...l, part: Math.round((l.montant / total) * 100) })),
    total: arrondi(total),
  };
}

// Les factures à régler les plus pressées : en retard d'abord (la plus
// ancienne échéance en tête), puis par échéance, puis sans échéance
// (trierParEcheance). `reste` : celles qui ne sont pas listées.
export function prochainesEcheances(docs, aujourdhui, max = 5) {
  const aRegler = trierParEcheance((docs || []).filter(d => estFacture(d) && !d.regleLe));
  return {
    lignes: aRegler.slice(0, max).map(f => ({
      id: f.id,
      fournisseur: String(f.fournisseurNom || '').trim(),
      numero: String(f.numero || '').trim(),
      dateEcheance: f.dateEcheance || null,
      montant: nombre(f.totalTTC),
      enRetard: statutPaiement(f, aujourdhui) === 'en_retard',
    })),
    reste: Math.max(0, aRegler.length - max),
    total: aRegler.length,
  };
}
