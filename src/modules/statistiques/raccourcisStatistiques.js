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

// Ordre des pilules d'analyses, en tête du module (14.11.2026 : les tuiles et
// onglets d'origine sont partis des modules, ces analyses s'ouvrent d'ici).
export const ORDRE_ANALYSES = ['caisse', 'reservations', 'achats', 'comptabilite', 'marges', 'pos'];

export const RACCOURCIS = {
  // Caisse, « Rapports » : les chiffres de la caisse sur le graphique (mêmes
  // points que les Rapports, serieRapports), puis le rapport complet de la
  // caisse, monté tel quel (`ecran`) : journal, heures, exports et dossier
  // fiduciaire n'y changent pas. Une vue dont aucune mesure n'est visible pour
  // le niveau de la personne (cuisine) n'est pas proposée.
  caisse: {
    famille: 'caisse',
    libelle: 'Caisse',
    vues: [
      { id: 'chiffre', libelle: 'Chiffre d\'affaires', court: 'Chiffre', periode: 'mois', pas: 'jour', comparaison: 'precedente',
        graphiques: [{ mesures: ['caisse.ca_ttc'] }] },
      { id: 'plats', libelle: 'Plats vendus', court: 'Plats', periode: 'mois', pas: 'jour', comparaison: 'precedente',
        tableaux: [{ titre: 'Tous les produits', mesures: ['caisse.plats_qte', 'caisse.plats_ttc'], ventilation: 'produit', tri: 'decroissant' }],
        graphiques: [{ mesures: ['caisse.plats_qte'], ventilation: 'categorie' }] },
      { id: 'services', libelle: 'Services', periode: 'mois', pas: 'jour', comparaison: 'precedente',
        graphiques: [{ mesures: ['caisse.ca_ttc'], ventilation: 'service' }] },
      { id: 'paiements', libelle: 'Paiements', periode: 'mois', pas: 'jour', comparaison: 'precedente',
        graphiques: [{ mesures: ['caisse.net_encaisse'], ventilation: 'moyen' }] },
      { id: 'personnes', libelle: 'Personnes', periode: 'mois', pas: 'jour', comparaison: 'precedente',
        graphiques: [{ mesures: ['caisse.ventes'], ventilation: 'personne' }] },
      { id: 'rapport', libelle: 'Rapport complet', court: 'Rapport', ecran: 'rapport_caisse', periode: 'mois', pas: 'jour',
        graphiques: [{ mesures: ['caisse.ca_ttc'] }] },
    ],
  },
  // Comptabilité, « Vue d'ensemble » (carte Résultat estimé) : ses neuf
  // chiffres en lignes, comparés à la période précédente, sur la période du
  // module. Une période d'inventaire garde l'écran d'origine (variation de
  // stock, que les Statistiques ne comptent pas).
  comptabilite: {
    famille: 'comptabilite',
    libelle: 'Comptabilité',
    vues: [
      { id: 'ensemble', libelle: 'Vue d\'ensemble', periode: 'mois', pas: 'mois', comparaison: 'precedente', explications: true,
        chiffres: ['comptabilite.ca_ht', 'comptabilite.matiere', 'comptabilite.marge_brute', 'comptabilite.personnel', 'comptabilite.charges',
          'comptabilite.resultat', 'comptabilite.matiere_pct', 'comptabilite.personnel_pct', 'comptabilite.tva_estimee'],
        graphiques: [{ mesures: ['comptabilite.ca_ht', 'comptabilite.resultat'] }] },
    ],
  },
  // Comptabilité, « Marges » : par carte (la carte se choisit en tête du
  // tableau) et par fiche, aux prix et coûts d'aujourd'hui (nature état), une
  // ligne par plat ou par fiche et la ligne « un plat de chaque ».
  marges: {
    famille: 'marges',
    libelle: 'Marges',
    vues: [
      { id: 'cartes', libelle: 'Par carte', court: 'Cartes', periode: 'mois', pas: 'mois', graphiques: [{ mesures: ['marges.carte_marge'] }],
        tableaux: [{ mesures: ['marges.carte_cout', 'marges.carte_prix', 'marges.carte_marge', 'marges.carte_food_cost'] }] },
      { id: 'fiches', libelle: 'Par fiche', court: 'Fiches', periode: 'mois', pas: 'mois', graphiques: [{ mesures: ['marges.fiche_marge'] }],
        tableaux: [{ mesures: ['marges.fiche_cout', 'marges.fiche_prix', 'marges.fiche_marge', 'marges.fiche_food_cost'] }] },
    ],
  },
  // Réservations, « Le rapport » : une vue par section du rapport, ses blocs en
  // lignes et en tableaux, sur le mois comparé à la période précédente (les
  // réglages d'ouverture du rapport).
  reservations: {
    famille: 'reservations',
    libelle: 'Réservations',
    vues: [
      { id: 'cles', libelle: 'Chiffres clés', court: 'Clés', periode: 'mois', pas: 'jour', comparaison: 'precedente',
        chiffres: ['reservations.couverts', 'reservations.tables', 'reservations.couverts_par_semaine', 'reservations.taille_moyenne', 'reservations.taux_no_show', 'reservations.taux_non_pointe', 'reservations.occupation', 'reservations.taux_annulation', 'reservations.couverts_jour_ouverture'],
        // Le détail par jour du rapport, sous le graphique, ses neuf colonnes.
        tableaux: [{ titre: 'Détail par jour', mesures: ['reservations.tables', 'reservations.couverts', 'reservations.couverts_en_ligne', 'reservations.couverts_equipe', 'reservations.couverts_passage', 'reservations.annulees', 'reservations.no_show', 'reservations.non_pointees', 'reservations.occupation'], ventilation: 'jour_service', apres: true }],
        graphiques: [{ mesures: ['reservations.couverts', 'reservations.tables', 'reservations.no_show'] }] },
      { id: 'canaux', libelle: 'Canaux', periode: 'mois', pas: 'semaine', comparaison: 'precedente',
        chiffres: ['reservations.demandes_recues', 'reservations.demandes_acceptees', 'reservations.demandes_annulees', 'reservations.demandes_en_attente'],
        tableaux: [{ titre: 'Part des couverts par canal', mesures: ['reservations.couverts', 'reservations.tables', 'reservations.taille_moyenne'], ventilation: 'canal', part: true }],
        graphiques: [{ mesures: ['reservations.couverts'], ventilation: 'canal' }] },
      { id: 'enligne', libelle: 'Part en ligne par semaine', court: 'En ligne', periode: 'mois', pas: 'semaine', comparaison: 'precedente',
        graphiques: [{ mesures: ['reservations.part_en_ligne'] }] },
      { id: 'temps', libelle: 'Temporalité', court: 'Temps', periode: 'mois', pas: 'jour', comparaison: 'precedente',
        chiffres: ['reservations.meilleur_jour', 'reservations.jour_calme', 'reservations.meilleure_semaine'],
        tableaux: [
          { titre: 'Répartition par service', mesures: ['reservations.couverts', 'reservations.tables'], ventilation: 'service', part: true },
          { titre: 'Moyenne par jour de la semaine', mesures: ['reservations.couverts_jour_ouverture'], ventilation: 'jour_semaine' },
        ],
        graphiques: [{ mesures: ['reservations.couverts'] }] },
      { id: 'arrivees', libelle: 'Heures d\'arrivée', court: 'Arrivées', periode: 'mois', pas: 'semaine', comparaison: 'precedente',
        tableaux: [{ titre: 'Heures d\'arrivée', mesures: ['reservations.arrivees_1', 'reservations.arrivees_2', 'reservations.arrivees_3', 'reservations.arrivees_4', 'reservations.arrivees_5', 'reservations.arrivees_6', 'reservations.arrivees_7'], ventilation: 'creneau' }],
        graphiques: [{ mesures: ['reservations.couverts'], ventilation: 'creneau' }] },
      { id: 'anticipation', libelle: 'Anticipation', court: 'Délais', periode: 'mois', pas: 'semaine', comparaison: 'precedente',
        chiffres: ['reservations.anticipees', 'reservations.delai_moyen', 'reservations.delai_median'],
        tableaux: [
          { titre: 'Délai de réservation (tables)', mesures: ['reservations.anticipees'], ventilation: 'delai', part: true },
          { titre: 'Délai par canal', mesures: ['reservations.anticipees', 'reservations.delai_moyen', 'reservations.delai_median'], ventilation: 'canal' },
          { titre: 'Carnet à venir (couverts)', mesures: ['carnet.couverts', 'carnet.avant', 'carnet.variation'] },
        ],
        graphiques: [{ mesures: ['reservations.delai_moyen'] }] },
      { id: 'composition', libelle: 'Composition des tables', court: 'Tables', periode: 'mois', pas: 'semaine', comparaison: 'precedente',
        chiffres: ['reservations.groupes', 'reservations.placement'],
        tableaux: [
          { titre: 'Taille des tables', mesures: ['reservations.tables'], ventilation: 'taille', part: true },
          { titre: 'Tables les plus utilisées', mesures: ['reservations.places_table', 'reservations.tables', 'reservations.couverts'], ventilation: 'table' },
          { titre: 'Couverts par zone', mesures: ['reservations.couverts'], ventilation: 'zone' },
        ],
        graphiques: [{ mesures: ['reservations.groupes'] }] },
      { id: 'clientele', libelle: 'Clientèle', court: 'Clients', periode: 'mois', pas: 'semaine', comparaison: 'precedente',
        chiffres: ['reservations.avec_fiche', 'reservations.clients_uniques', 'reservations.clients_venus', 'reservations.clients_revenus', 'reservations.taux_retour', 'reservations.passeport'],
        tableaux: [
          { titre: 'Meilleurs clients', mesures: ['reservations.clients_reservations', 'reservations.clients_couverts'], ventilation: 'client' },
          { titre: 'Occasions', mesures: ['reservations.tags_occasion', 'reservations.tags_occasion_couverts'], ventilation: 'valeur' },
          { titre: 'Allergènes', mesures: ['reservations.tags_allergene', 'reservations.tags_allergene_couverts'], ventilation: 'valeur' },
          { titre: 'Régimes', mesures: ['reservations.tags_regime', 'reservations.tags_regime_couverts'], ventilation: 'valeur' },
        ],
        graphiques: [{ mesures: ['reservations.clients_venus'] }] },
    ],
  },
  // Ventes POS, « Meilleures et moins bonnes ventes » : tous les plats vendus,
  // du plus vendu au moins vendu, sur les 7, 14 ou 30 jours finis hier, avec
  // la période d'avant et l'écart, comme l'ancien classement de Ventes POS, parti en S3.
  pos: {
    famille: 'pos',
    libelle: 'Ventes POS',
    vues: [
      { id: 'j7', libelle: '7 jours', periode: { id: 'libre', jours: 7 }, pas: 'jour', comparaison: 'precedente',
        tableaux: [{ titre: 'Plats vendus', mesures: ['pos.qte'], ventilation: 'plat', tri: 'decroissant', comparaison: true }],
        graphiques: [{ mesures: ['pos.qte'], ventilation: 'plat' }] },
      { id: 'j14', libelle: '14 jours', periode: { id: 'libre', jours: 14 }, pas: 'jour', comparaison: 'precedente',
        tableaux: [{ titre: 'Plats vendus', mesures: ['pos.qte'], ventilation: 'plat', tri: 'decroissant', comparaison: true }],
        graphiques: [{ mesures: ['pos.qte'], ventilation: 'plat' }] },
      { id: 'j30', libelle: '30 jours', periode: { id: 'libre', jours: 30 }, pas: 'jour', comparaison: 'precedente',
        tableaux: [{ titre: 'Plats vendus', mesures: ['pos.qte'], ventilation: 'plat', tri: 'decroissant', comparaison: true }],
        graphiques: [{ mesures: ['pos.qte'], ventilation: 'plat' }] },
    ],
  },
  // Factures & achats, « Analyses des dépenses » : quatre vues pour ses blocs
  // de chiffres (les dates à vérifier sont restées dans le module), sur douze
  // mois comme l'écran d'origine ; le périmètre se choisit dans le module
  // (Tous par défaut, comme l'écran d'origine).
  achats: {
    famille: 'achats',
    libelle: 'Achats',
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
  return { famille: r.famille, raccourci: id, vue: v.id, periode: periode || v.periode, pas: v.pas, comparaison: v.comparaison || '', graphiques: v.graphiques, chiffres: v.chiffres || [], tableaux: v.tableaux || [], explications: v.explications === true };
}
