// Devis, factures et paiements des groupes de la démo (23.11.2026) : un devis
// accepté avec son acompte payé et son solde prévu, un devis envoyé pour un
// mariage (prospect), une facture en retard. IBAN : l'exemple public de la
// norme suisse, jamais un vrai compte.
import { ETAB, aujourdhui, jour, instant } from './base.js';

const ligne = (id, libelle, quantite, prixUnitaire, tvaTaux = 8.1, extra = {}) => ({ id, libelle, detail: '', quantite, prixUnitaire, tvaTaux, ...extra });
const total = (lignes) => Math.round(lignes.reduce((s, l) => s + Math.round(l.quantite * l.prixUnitaire * 100), 0)) / 100;

export function genererFacturation() {
  const annee = Number(aujourdhui().slice(0, 4));
  const num = (p, n) => `${p}-${annee}-${String(n).padStart(4, '0')}`;

  const lignesD1 = [
    ligne('d1-l1', 'Menu n°1', 32, 68),
    ligne('d1-l2', 'Apéritif, trois pièces par personne', 32, 12),
    ligne('d1-l3', 'Vins, forfait', 1, 480),
  ];
  const lignesD2 = [
    ligne('d2-l1', 'Menu Prestige', 76, 119, 8.1, { detail: 'Mariage n°3' }),
    ligne('d2-l2', 'Menu enfant', 4, 35),
    ligne('d2-l3', 'Location de la salle', 1, 600),
    ligne('d2-l4', 'Chambres des mariés, une nuit', 2, 180, 3.8),
  ];
  const lignesD3 = [
    ligne('d3-l1', 'Menu n°2', 24, 54),
    ligne('d3-l2', 'Boissons', 1, 310),
  ];

  const base = (id, n, extra) => ({
    id, etablissement_id: ETAB, numero: num('DEV', n), titre: null, client_contact: null, client_telephone: null,
    client_adresse: null, heure: null, menu_numero: null, conditions: null, notes: null, envoye_le: null,
    accepte_le: null, accepte_par: null, refuse_le: null, created_by: 'demo-patron', ...extra,
  });

  const devis = [
    base('dv-1', 1, {
      groupe_evenement_id: 'ge-3', statut: 'accepte', client_nom: 'Famille Roux', client_contact: 'Mme Roux',
      client_email: 'roux@example.ch', client_telephone: '079 000 55 66', client_adresse: 'Chemin des Vignes 4\n1950 Sion',
      type_groupe: 'anniversaire', date_evenement: jour(13), heure: '19:30:00', nb_pax: 32, menu_numero: 1,
      lignes: lignesD1, total: total(lignesD1), date_devis: jour(-30), valide_jusqu: jour(0),
      envoye_le: instant(jour(-30), '10:00'), accepte_le: instant(jour(-25), '16:00'), accepte_par: 'demo-patron',
      created_at: instant(jour(-30), '09:30'), updated_at: instant(jour(-25), '16:00'),
    }),
    base('dv-2', 2, {
      groupe_evenement_id: null, statut: 'envoye', client_nom: 'Léa Morand et Paul Fournier', client_contact: 'Léa Morand',
      client_email: 'lea.morand@example.ch', client_adresse: 'Rue du Rhône 12\n1950 Sion', type_groupe: 'mariage',
      date_evenement: jour(120), heure: '16:00:00', nb_pax: 80, menu_numero: 3, lignes: lignesD2, total: total(lignesD2),
      date_devis: jour(-6), valide_jusqu: jour(24), envoye_le: instant(jour(-6), '11:00'),
      created_at: instant(jour(-6), '10:30'), updated_at: instant(jour(-6), '11:00'),
    }),
    base('dv-3', 3, {
      groupe_evenement_id: 'ge-2', statut: 'accepte', client_nom: 'Atelier Nord Sàrl', client_contact: 'M. Simon',
      client_email: 'compta@atelier-nord.example.ch', client_adresse: 'Route Industrielle 8\n1950 Sion',
      type_groupe: 'seminaire', date_evenement: jour(-40), nb_pax: 24, menu_numero: 2, lignes: lignesD3, total: total(lignesD3),
      date_devis: jour(-70), valide_jusqu: jour(-40), accepte_le: instant(jour(-65), '09:00'), accepte_par: 'demo-patron',
      created_at: instant(jour(-70), '15:00'), updated_at: instant(jour(-65), '09:00'),
    }),
  ];

  const acompte = [ligne('f1-l1', `Acompte 30 % sur devis ${num('DEV', 1)}`, 1, 912)];
  const solde = [...lignesD1.map((l) => ({ ...l, id: `f2-${l.id}` })), ligne('f2-d1', `Acompte ${num('FAC', 2)} déduit`, 1, -912, 8.1, { deduction: 'fa-1' })];
  const facture = (id, extra) => ({
    id, etablissement_id: ETAB, numero: null, groupe_evenement_id: null, libelle: null, ordre: 1, titre: null,
    client_contact: null, client_email: null, client_adresse: null, mention: null, envoyee_le: null, relances: [],
    emise_le: null, emise_par: null, annulee_le: null, motif_annulation: null, notes: null, mode_prevu: 'virement',
    created_by: 'demo-patron', ...extra,
  });

  const factures = [
    facture('fa-3', {
      numero: num('FAC', 1), devis_id: 'dv-3', groupe_evenement_id: 'ge-2', type: 'totale', libelle: 'Facture', statut: 'emise',
      titre: 'Séminaire, 24 personnes', client_nom: 'Atelier Nord Sàrl', client_contact: 'M. Simon',
      client_email: 'compta@atelier-nord.example.ch', client_adresse: 'Route Industrielle 8\n1950 Sion',
      lignes: lignesD3.map((l) => ({ ...l, id: `f3-${l.id}` })), montant: total(lignesD3),
      date_facture: jour(-39), echeance: jour(-9), envoyee_le: instant(jour(-39), '10:00'),
      emise_le: instant(jour(-39), '09:50'), emise_par: 'demo-patron',
      created_at: instant(jour(-39), '09:45'), updated_at: instant(jour(-39), '10:00'),
    }),
    facture('fa-1', {
      numero: num('FAC', 2), devis_id: 'dv-1', groupe_evenement_id: 'ge-3', type: 'acompte', libelle: 'Acompte 30 %', statut: 'emise',
      titre: 'Anniversaire, 32 personnes', client_nom: 'Famille Roux', client_contact: 'Mme Roux',
      client_email: 'roux@example.ch', client_adresse: 'Chemin des Vignes 4\n1950 Sion', lignes: acompte, montant: 912,
      date_facture: jour(-25), echeance: jour(-15), envoyee_le: instant(jour(-25), '16:30'),
      emise_le: instant(jour(-25), '16:20'), emise_par: 'demo-patron',
      created_at: instant(jour(-25), '16:10'), updated_at: instant(jour(-25), '16:30'),
    }),
    facture('fa-2', {
      devis_id: 'dv-1', groupe_evenement_id: 'ge-3', type: 'solde', libelle: 'Solde', ordre: 2, statut: 'prevue',
      titre: 'Anniversaire, 32 personnes', client_nom: 'Famille Roux', client_contact: 'Mme Roux',
      client_email: 'roux@example.ch', client_adresse: 'Chemin des Vignes 4\n1950 Sion', lignes: solde, montant: total(solde),
      date_facture: jour(14), echeance: jour(44),
      created_at: instant(jour(-25), '16:10'), updated_at: instant(jour(-25), '16:10'),
    }),
  ];

  const paiements = [
    { id: 'pa-1', etablissement_id: ETAB, facture_id: 'fa-1', date_paiement: jour(-18), montant: 912, mode: 'virement', reference: 'Relevé bancaire', note: null, created_by: 'demo-patron', created_at: instant(jour(-18), '08:30') },
    { id: 'pa-2', etablissement_id: ETAB, facture_id: 'fa-3', date_paiement: jour(-5), montant: 500, mode: 'twint', reference: null, note: 'Premier versement', created_by: 'demo-patron', created_at: instant(jour(-5), '14:00') },
  ];

  const reglages = [{
    etablissement_id: ETAB, raison_sociale: 'Brasserie Démo SA', rue: 'Place des Mélèzes', numero: '1', npa: '1950',
    localite: 'Sion', pays: 'CH', telephone: '027 000 00 00', email: 'contact@brasserie-demo.ch',
    iban: 'CH9300762011623852957', assujetti_tva: true, numero_tva: 'CHE-000.000.000 TVA', delai_paiement_jours: 30,
    validite_devis_jours: 30, acompte_pct: 30,
    conditions: "Acompte de 30 % à la confirmation. Nombre définitif de personnes 7 jours avant l'événement ; il sert à la facture de solde. Annulation sans frais jusqu'à 30 jours avant.",
    mention_facture: 'Merci de votre confiance.', updated_at: instant(jour(-60), '09:00'),
  }];

  const compteurs = [
    { etablissement_id: ETAB, prefixe: 'DEV', annee, dernier: 3 },
    { etablissement_id: ETAB, prefixe: 'FAC', annee, dernier: 2 },
  ];

  return { devis, factures, paiements, reglages, compteurs };
}
