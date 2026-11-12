// Famille Comptabilité du catalogue des Statistiques : chaque mesure lit un
// chiffre de la synthèse d'une période (syntheseCompta.js), rendue pour chaque
// tranche par syntheseDe de useCompta, avec les ventes, le personnel et la
// TVA de la Comptabilité. Sans React ni service.
//
// Trois particularités de l'écran d'origine, gardées telles quelles :
//   - le hors TVA s'arrondit sur le total de chaque taux : la somme des points
//     peut s'écarter du total de quelques centimes, et le tableau le dit ;
//   - la marge brute et le résultat sont des soldes : sans coût matière connu
//     (un jour sans facture), la synthèse rend « n/a ». Ils se recalculent
//     donc sur chaque pas comme un taux et ne s'additionnent pas ;
//   - le coût du personnel n'est lu que pour la direction (`reserve`) ; pour
//     les autres le résultat reste « avant personnel », comme dans le module.
// Une valeur inconnue vaut null (« n/a »), jamais 0.

const pct = (v) => (v == null ? null : v / 100);

export const familleComptabilite = {
  id: 'comptabilite',
  libelle: 'Comptabilité',
  journee: 'le jour de la vente saisie ou clôturée',
  calculer(donnees, tranches) {
    return tranches.map((t) => ({ ...donnees.syntheseDe({ type: 'libre', debut: t.debut, fin: t.fin }), debut: t.debut, fin: t.fin }));
  },
  mesures: [
    {
      id: 'comptabilite.ca_ttc', libelle: 'Ventes TVA comprise', unite: 'chf', nature: 'flux',
      valeur: (p) => p.ventes?.ttc ?? null,
      ventilations: [{ id: 'taux', libelle: 'Par taux de TVA', parts: (p) => (p.ventes?.parTaux || []).map((t) => ({ cle: `t${t.taux}`, libelle: `${String(t.taux).replace('.', ',')} %`, brut: true, valeur: t.ttc })) }],
      phrase: 'Chiffre du jour saisi ou clôturé par la caisse, à défaut ventes de la caisse reliée, plus les notes de séjour d\'un hôtel.',
    },
    {
      id: 'comptabilite.ca_ht', libelle: 'Chiffre d\'affaires hors TVA', unite: 'chf', nature: 'flux',
      valeur: (p) => p.ca,
      phrase: 'Ventes moins la TVA, calculée sur le total de chaque taux : la somme des points peut s\'écarter du total de quelques centimes.',
    },
    {
      id: 'comptabilite.matiere', libelle: 'Coût matière', unite: 'chf', nature: 'flux',
      valeur: (p) => p.matiere?.ht ?? null,
      phrase: 'Achats hors TVA de la période, par date de facture, avec la règle des Analyses des dépenses.',
    },
    {
      id: 'comptabilite.matiere_pct', libelle: 'Coût matière en % du chiffre', unite: 'pct', nature: 'taux',
      valeur: (p) => pct(p.ratios?.matierePct),
      phrase: 'Coût matière divisé par le chiffre d\'affaires hors TVA ; recalculé sur chaque pas.',
    },
    {
      id: 'comptabilite.marge_brute', libelle: 'Marge brute', unite: 'chf', nature: 'taux',
      valeur: (p) => p.margeBrute,
      phrase: 'Chiffre d\'affaires hors TVA moins le coût matière, recalculée sur chaque pas ; n/a pour un pas sans vente ou sans facture chiffrée.',
    },
    {
      id: 'comptabilite.charges', libelle: 'Charges fixes hors TVA', unite: 'chf', nature: 'flux',
      valeur: (p) => p.charges,
      phrase: 'Charges fixes saisies, au prorata des jours du pas.',
    },
    {
      id: 'comptabilite.personnel', libelle: 'Coût du personnel estimé', unite: 'chf', nature: 'flux', reserve: 'direction',
      valeur: (p) => p.personnel,
      phrase: 'Estimation depuis les heures pointées, les salaires saisis et les charges sociales. Réservé à la direction.',
    },
    {
      id: 'comptabilite.personnel_pct', libelle: 'Coût du personnel en % du chiffre', unite: 'pct', nature: 'taux', reserve: 'direction',
      valeur: (p) => pct(p.ratios?.personnelPct),
      phrase: 'Coût du personnel estimé divisé par le chiffre d\'affaires hors TVA. Réservé à la direction.',
    },
    {
      id: 'comptabilite.tva_estimee', libelle: 'TVA estimée à payer', unite: 'chf', nature: 'flux',
      valeur: (p) => p.tvaEstimee ?? null,
      phrase: 'TVA collectée moins impôt préalable, ou chiffre fois le taux de la dette fiscale nette, comme la Vue d\'ensemble ; arrondie sur le total, la somme des points peut s\'en écarter de quelques centimes.',
    },
    {
      id: 'comptabilite.resultat', libelle: 'Résultat estimé', unite: 'chf', nature: 'taux',
      valeur: (p) => p.resultat,
      phrase: 'Marge brute moins les charges fixes et, pour la direction, le coût du personnel estimé ; recalculé sur chaque pas, n/a quand la marge l\'est.',
    },
  ],
};
