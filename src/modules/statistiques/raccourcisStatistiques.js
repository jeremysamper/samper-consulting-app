// ─────────────────────────────────────────────────────────────────────────────
// Raccourcis des écrans d'analyse partis vers Statistiques (S3). Un raccourci
// prend la place de la tuile ou de l'onglet d'origine et ouvre le module
// préréglé par ouvrirStatistiques (D14), sur la première de ses vues. Les
// autres vues sont proposées en puces au-dessus du graphique (libellé court au
// téléphone, pour tenir sur une ligne) : un toucher par
// bloc de l'ancien écran, au lieu de le chercher en faisant défiler.
//
// Données pures, sans import : un module d'origine les lit sans charger
// Statistiques. Les mesures sont celles du catalogue ; ce que la personne ne
// voit pas tombe à l'ouverture (D11).
// ─────────────────────────────────────────────────────────────────────────────

const DOUZE_MOIS = { periode: 'douze_mois', pas: 'mois' };

export const RACCOURCIS = {
  // Comptabilité, « Vue d'ensemble » (carte Résultat estimé) : ses neuf
  // chiffres en lignes, comparés à la période précédente, sur la période du
  // module. Une période d'inventaire garde l'écran d'origine (variation de
  // stock, que les Statistiques ne comptent pas).
  comptabilite: {
    famille: 'comptabilite',
    vues: [
      { id: 'ensemble', libelle: 'Vue d\'ensemble', periode: 'mois', pas: 'mois', comparaison: 'precedente',
        chiffres: ['comptabilite.ca_ht', 'comptabilite.matiere', 'comptabilite.marge_brute', 'comptabilite.personnel', 'comptabilite.charges',
          'comptabilite.resultat', 'comptabilite.matiere_pct', 'comptabilite.personnel_pct', 'comptabilite.tva_estimee'],
        graphiques: [{ mesures: ['comptabilite.ca_ht', 'comptabilite.resultat'] }] },
    ],
  },
  // Factures & achats, « Analyses des dépenses » : quatre vues pour ses blocs
  // de chiffres (les dates à vérifier sont restées dans le module), sur douze
  // mois comme l'écran d'origine ; le périmètre se choisit dans le module
  // (Tous par défaut, comme l'écran d'origine).
  achats: {
    famille: 'achats',
    vues: [
      { id: 'depenses', libelle: 'Dépenses par mois', court: 'Dépenses', ...DOUZE_MOIS, comparaison: 'n1', graphiques: [{ mesures: ['achats.depenses', 'achats.factures'] }] },
      { id: 'fournisseurs', libelle: 'Par fournisseur', court: 'Fournisseurs', ...DOUZE_MOIS, graphiques: [{ mesures: ['achats.depenses'], ventilation: 'fournisseur' }] },
      { id: 'rayons', libelle: 'Par rayon', court: 'Rayons', ...DOUZE_MOIS, graphiques: [{ mesures: ['achats.depenses'], ventilation: 'rayon' }] },
      { id: 'prix', libelle: 'Prix d\'un produit', court: 'Prix', ...DOUZE_MOIS, graphiques: [{ mesures: ['achats.prix_produit'] }] },
    ],
  },
};

// Demande d'ouverture d'un raccourci (sa première vue, ou celle nommée), sur
// la période de la vue ou sur celle donnée par le module d'origine.
export function demandeRaccourci(id, vueId = null, periode = null) {
  const r = RACCOURCIS[id];
  if (!r) return null;
  const v = r.vues.find((x) => x.id === vueId) || r.vues[0];
  return { famille: r.famille, raccourci: id, vue: v.id, periode: periode || v.periode, pas: v.pas, comparaison: v.comparaison || '', graphiques: v.graphiques, chiffres: v.chiffres || [], tableau: v.tableau || null };
}
