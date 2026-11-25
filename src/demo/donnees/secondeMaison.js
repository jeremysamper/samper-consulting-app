// Seconde maison fictive de la démo (lot 02 du panel, 25.11.2026), semée
// seulement avec ?maisons=2 : de quoi reprendre ses réglages dans la Brasserie
// Démo. Ses réglages diffèrent de ceux de la Brasserie ; sa mise en place
// aussi, pour montrer une section qui ne se reprend pas.
import { ETABLISSEMENT } from './base.js';

export const ETAB_2 = 'etab-demo-2';
const LE = '2026-03-01T08:00:00Z';

export const ETABLISSEMENT_2 = {
  ...ETABLISSEMENT,
  id: ETAB_2,
  nom: 'Auberge Démo',
  type: 'Restaurant',
  adresse: 'Rue du Bourg 4, 1950 Sion',
  email: 'contact@auberge-demo.ch',
  notes: 'Seconde maison de démonstration, données fictives.',
};

export function reglagesSecondeMaison() {
  return {
    reglages_maison: [{
      etablissement_id: ETAB_2,
      fermetures: {
        jours_fermes: [1, 2],
        services_fermes: { 7: ['soir'] },
        periodes: [{ du: '2027-01-04', au: '2027-01-17', motif: "Vacances d'hiver" }],
      },
      // La borne seulement là-bas : elle ne doit jamais passer à la Brasserie.
      pointage: { arrondi_min: 5, avance: 'prevue', cloture_auto_h: 12, borne_seulement: true },
      updated_at: LE,
    }],
    objectifs_maison: [{
      etablissement_id: ETAB_2,
      objectifs: { matiere_pct: 28, personnel_pct: 35, ca_mensuel_ht: null },
      updated_at: LE,
    }],
    reglages_modules: [
      {
        module: 'pertes',
        config: { motifs: ['DLC dépassée', 'Surproduction', 'Casse', 'Retour client', 'Repas du personnel'], valideurs: ['consultant', 'patron', 'resp_cuisine'] },
      },
      {
        module: 'groupes',
        config: {
          delai_alerte_jours: 21,
          statuts: { a_lire: { libelle: 'Nouveau' }, lu: { libelle: 'Lu', actif: false }, pret: { libelle: 'Prêt' } },
          types_actifs: ['mariage', 'seminaire', 'groupe'],
        },
      },
      { module: 'kds', config: { son: false, attention_minutes: 9, retard_minutes: 15 } },
      { module: 'mep', config: { postes: ['Garde-manger', 'Rôtisserie'] } },
    ].map((r) => ({ etablissement_id: ETAB_2, updated_at: LE, updated_by: 'demo-patron', ...r })),
  };
}
