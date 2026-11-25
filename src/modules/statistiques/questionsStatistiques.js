// ─────────────────────────────────────────────────────────────────────────────
// Réponses toutes faites des Statistiques (plan 15, lot 5) : une question, un
// toucher, la vue qui y répond. Données pures, sans import : la page des
// réglages les lit (vue d'office de la maison, reglages_modules, module
// 'statistiques') sans charger le module.
//
// Chaque question est une demande au format d'ouvrirStatistiques (D14), lue
// par vueDepuisLien : ce que la personne ne voit pas tombe (le coût du
// personnel est réservé à la direction), une question dont rien n'est
// visible n'est pas proposée.
//
// Les ventes sont celles de la Comptabilité (comptabilite.ca_ttc) : chiffre du
// jour saisi ou clôturé, à défaut la caisse reliée, plus les notes de séjour,
// quelle que soit la caisse de la maison.
// ─────────────────────────────────────────────────────────────────────────────

export const QUESTIONS = [
  {
    id: 'mois_contre_mois',
    libelle: 'Ce mois contre le mois dernier',
    detail: 'Les ventes du mois, comparées aux mêmes jours du mois dernier.',
    demande: {
      periode: 'mois', pas: 'jour', comparaison: 'precedente',
      chiffres: ['comptabilite.ca_ttc'],
      graphiques: [{ mesures: ['comptabilite.ca_ttc'] }],
    },
  },
  {
    id: 'meilleur_jour',
    libelle: 'Meilleur jour',
    detail: 'Les ventes jour par jour sur 30 jours, et les couverts par jour de la semaine.',
    demande: {
      periode: '30j', pas: 'jour',
      graphiques: [
        { mesures: ['comptabilite.ca_ttc'] },
        { mesures: ['reservations.couverts_jour_ouverture'], ventilation: 'jour_semaine' },
      ],
    },
  },
  {
    id: 'cout_personnel',
    libelle: 'Coût du personnel',
    detail: "Le coût estimé du personnel et sa part du chiffre d'affaires, semaine par semaine.",
    demande: {
      periode: 'mois', pas: 'semaine', comparaison: 'precedente',
      chiffres: ['comptabilite.personnel', 'comptabilite.personnel_pct'],
      graphiques: [{ mesures: ['comptabilite.personnel_pct'] }],
    },
  },
];

export const demandeQuestion = (id) => QUESTIONS.find((q) => q.id === id)?.demande || null;

// Vue d'office de la maison (Réglages > Statistiques) : la vue de l'app, ou
// une des questions.
export const VUE_APP = 'app';
export const OPTIONS_VUE_MAISON = [
  { id: VUE_APP, label: "La vue de l'app" },
  ...QUESTIONS.map((q) => ({ id: q.id, label: q.libelle })),
];
