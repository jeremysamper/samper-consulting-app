// Spa & clients de la démo (D4, lot 6a) : soins, fiches clients, agenda du
// jour et des jours voisins, demandes venues du site, comptes rendus de
// séance et bons. Tout est fictif : aucune personne ni aucun client réel.
import { ETAB, jour, instant } from './base.js';

const uid = (bloc, n) => `00000000-0000-4000-8000-00000007${bloc}${String(n).padStart(2, '0')}`;
const CREE = '2026-03-01T08:00:00Z';
// Praticienne de la démo (profil demo-spa) ; les soins sans nom sont « à attribuer ».
export const PRATICIENNE = 'Maya Lehmann';
const CABINES = ['Cabine Arolle', 'Cabine Edelweiss'];

// [nom, catégorie, durée, prix, description, en ligne]
const SOINS_BRUTS = [
  ['Massage suédois', 'Massages', 60, 130, 'Massage relaxant du corps entier, huile neutre ou parfumée.', true],
  ['Massage aux pierres chaudes', 'Massages', 75, 160, 'Pierres de basalte chauffées, pour dénouer le dos et les épaules.', true],
  ['Massage du dos', 'Massages', 30, 75, 'Massage ciblé du dos et de la nuque.', true],
  ['Soin du visage hydratant', 'Visage', 50, 115, 'Nettoyage, gommage doux, masque et massage du visage.', true],
  ['Gommage au sel des Alpes', 'Corps', 45, 95, 'Gommage du corps au sel et aux huiles végétales, suivi d\'une hydratation.', true],
  ['Réflexologie plantaire', 'Bien-être', 45, 100, 'Pression des zones réflexes des pieds.', false],
];

export const SPA_SOINS = SOINS_BRUTS.map(([nom, categorie, duree_min, prix, description, en_ligne], i) => ({
  id: uid('01', i + 1), etablissement_id: ETAB, nom, categorie, duree_min, prix, description, actif: true, en_ligne, created_at: CREE, updated_at: CREE,
}));
const soin = (i) => SPA_SOINS[i - 1];

// [prénom, nom, naissance (décalage de l'anniversaire en jours, ou date), notes santé, préférences, consentement]
const CLIENTS_BRUTS = [
  ['Nathalie', 'Gerber', 3, 'Enceinte de cinq mois : pas de pierres chaudes.', 'Pression douce.', true],
  ['Stéphane', 'Bonvin', '1977-02-19', '', 'Musique calme, lumière tamisée.', true],
  ['Chloé', 'Vuignier', '1993-07-08', 'Peau sensible, allergie aux huiles essentielles d\'agrumes.', '', true],
  ['Pascal', 'Zufferey', '1969-10-30', 'Douleurs lombaires chroniques.', 'Pression forte sur le dos.', false],
  ['Aurélie', 'Rey', 0, '', 'Thé au gingembre après le soin.', true],
  ['David', 'Pralong', '1985-01-14', '', '', false],
  ['Sandrine', 'Favre', '1981-05-25', 'Migraines fréquentes : éviter les odeurs fortes.', '', true],
  ['Mélanie', 'Crettaz', '1990-12-03', '', 'Toujours en cabine Edelweiss.', true],
  ['Romain', 'Clivaz', '1974-08-17', '', '', false],
  ['Isabelle', 'Roux', '1975-08-22', '', 'Hôte de l\'hôtel, chambre 303.', true],
  ['Fabienne', 'Mabillard', '1966-03-11', 'Varices : pas de massage appuyé des jambes.', '', true],
  ['Kevin', 'Délèze', '1998-09-02', '', '', false],
];

const sansAccent = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
// Anniversaire dans N jours : la date de naissance prend le jour et le mois d'aujourd'hui + N.
const naissance = (v, annee) => (typeof v === 'string' ? v : `${annee}${jour(v).slice(4)}`);

export const SPA_CLIENTS = CLIENTS_BRUTS.map(([prenom, nom, nee, notes_sante, preferences, consentement], i) => ({
  id: uid('02', i + 1),
  etablissement_id: ETAB,
  prenom,
  nom,
  email: `${sansAccent(prenom)}.${sansAccent(nom)}@exemple.test`,
  telephone: `079 000 ${String(80 + i).padStart(2, '0')} ${String(40 + i).padStart(2, '0')}`,
  date_naissance: naissance(nee, 1980 + i),
  adresse: null,
  notes_sante: notes_sante || null,
  preferences: preferences || null,
  notes: null,
  consentement_marketing: consentement,
  consentement_at: consentement ? CREE : null,
  desinscrit_at: null,
  archive: false,
  created_at: instant(jour(-90 + i * 5), '10:00'),
  updated_at: instant(jour(-90 + i * 5), '10:00'),
}));
const client = (i) => SPA_CLIENTS[i - 1];

export function genererSpa() {
  // [n°, client, soin, décalage, heure, praticienne (1 = Maya, 0 = à attribuer), cabine, statut, origine, notes]
  // Les soins du jour restent à terminer : la praticienne écrit le compte rendu.
  const brutes = [
    // Hier.
    [1, 2, 1, -1, '10:00', 1, 0, 'terminee', 'equipe', ''],
    [2, 4, 3, -1, '14:00', 1, 0, 'terminee', 'equipe', ''],
    [3, 9, 5, -1, '16:30', 1, 1, 'absent', 'equipe', 'Pas venu, pas prévenu.'],
    // Aujourd'hui.
    [4, 3, 4, 0, '09:30', 1, 1, 'confirmee', 'equipe', 'Huiles sans agrumes.'],
    [5, 10, 2, 0, '11:00', 1, 0, 'confirmee', 'equipe', 'Massage du forfait Bien-être.'],
    [6, 1, 1, 0, '14:00', 1, 0, 'confirmee', 'equipe', 'Enceinte : position sur le côté.'],
    [7, 7, 6, 0, '15:30', 0, 1, 'prevue', 'equipe', ''],
    [8, 8, 4, 0, '17:00', 1, 1, 'prevue', 'equipe', ''],
    [9, 6, 3, 0, '18:00', 0, 0, 'annulee', 'equipe', 'Annulé par téléphone.'],
    // Demain et après.
    [10, 11, 5, 1, '10:00', 1, 0, 'confirmee', 'equipe', ''],
    [11, 5, 4, 1, '14:30', 1, 1, 'prevue', 'equipe', 'Bon d\'anniversaire à utiliser.'],
    [12, 12, 1, 2, '16:00', 0, 0, 'demande', 'en_ligne', 'Première visite.'],
    [13, 2, 2, 3, '11:00', 0, 0, 'demande', 'en_ligne', ''],
    [14, 4, 3, 7, '09:00', 1, 0, 'prevue', 'equipe', 'Suivi du dos, une semaine après.'],
  ];
  const reservations = brutes.map(([n, c, s, d, heure, prat, cab, statut, origine, notes]) => {
    const so = soin(s);
    return {
      id: uid('03', n),
      etablissement_id: ETAB,
      client_id: client(c).id,
      soin_id: so.id,
      soin_libelle: so.nom,
      date_rdv: jour(d),
      heure_debut: `${heure}:00`,
      duree_min: so.duree_min,
      praticien: prat ? PRATICIENNE : null,
      cabine: origine === 'en_ligne' ? null : CABINES[cab],
      statut,
      notes: notes || null,
      origine,
      created_at: instant(jour(Math.min(d, 0) - 6), '11:00'),
      updated_at: instant(jour(Math.min(d, 0) - 1), '18:00'),
    };
  });

  // Comptes rendus de séance (fiche client) : les soins terminés.
  const seance = (n, c, d, s, observations, produits, ressenti, recommandations, prochaine, reservation_id = null) => ({
    id: uid('04', n), etablissement_id: ETAB, client_id: client(c).id, reservation_id, date_seance: jour(d), soin: soin(s).nom, praticien: PRATICIENNE,
    observations, produits, ressenti, recommandations, prochaine_seance: prochaine == null ? null : jour(prochaine),
    created_at: instant(jour(d), '18:30'), updated_at: instant(jour(d), '18:30'),
  });
  const seances = [
    seance(1, 2, -1, 1, 'Tensions marquées sur les trapèzes.', 'Huile d\'amande douce.', 'Détendu, a dormi pendant le soin.', 'Boire beaucoup d\'eau aujourd\'hui. Étirements de la nuque le soir.', 27, uid('03', 1)),
    seance(2, 4, -1, 3, 'Lombaires très contractées, côté droit surtout.', 'Baume chauffant à l\'arnica.', 'Soulagé, un peu sensible.', 'Chaleur sur le bas du dos. Revenir dans une semaine.', 7, uid('03', 2)),
    seance(3, 4, -15, 1, 'Dos raide après une semaine de chantier.', 'Huile neutre.', 'Bien.', 'Massage du dos toutes les deux semaines.', null),
    seance(4, 3, -28, 4, 'Rougeurs sur les joues, peau réactive.', 'Gamme peaux sensibles, sans parfum.', 'Peau apaisée.', 'Crème apaisante matin et soir.', 0),
    seance(5, 8, -20, 4, 'Peau déshydratée.', 'Masque à l\'acide hyaluronique.', 'Très satisfaite.', 'Soin tous les mois en hiver.', 0),
    seance(6, 10, -60, 2, 'Fatigue générale.', 'Pierres de basalte, huile de sésame.', 'Ravie, souhaite le même soin à chaque séjour.', '', null),
  ];

  const bons = [
    { id: uid('05', 1), etablissement_id: ETAB, client_id: client(5).id, code: 'ANNI-4821', motif: 'anniversaire', valeur: '20 % sur le soin de votre choix', message: 'Joyeux anniversaire de la part de toute l\'équipe du spa.', valable_jusqu: jour(60), envoye_at: instant(jour(-2), '08:00'), utilise_at: null, created_at: instant(jour(-2), '08:00') },
    { id: uid('05', 2), etablissement_id: ETAB, client_id: client(7).id, code: 'CADO-1934', motif: 'cadeau', valeur: 'Un massage suédois de 60 minutes', message: 'Offert par vos collègues. Belle détente !', valable_jusqu: jour(120), envoye_at: instant(jour(-10), '14:20'), utilise_at: null, created_at: instant(jour(-10), '14:20') },
    { id: uid('05', 3), etablissement_id: ETAB, client_id: client(2).id, code: 'CADO-7710', motif: 'cadeau', valeur: 'Un soin du visage', message: null, valable_jusqu: jour(30), envoye_at: instant(jour(-40), '10:00'), utilise_at: instant(jour(-12), '15:00'), created_at: instant(jour(-40), '10:00') },
  ];

  const parametres = [{
    etablissement_id: ETAB,
    anniversaire_actif: true,
    bon_valeur: '20 % sur le soin de votre choix',
    bon_validite_jours: 60,
    anniversaire_sujet: 'Joyeux anniversaire',
    anniversaire_message: 'Toute l\'équipe du spa vous souhaite un bel anniversaire. Voici un bon pour vous faire plaisir.',
    nom_expediteur: 'Spa de la Brasserie Démo',
    email_reponse: 'spa@exemple.test',
    signature: 'L\'équipe du spa',
    en_ligne_actif: true,
    slug: 'brasserie-demo',
    horaires: Object.fromEntries([1, 2, 3, 4, 5, 6].map((j) => [String(j), [{ de: '09:00', a: '19:00' }]])),
    praticiens_en_ligne: [PRATICIENNE],
    delai_min_heures: 2,
    horizon_jours: 60,
    pas_minutes: 30,
    message_en_ligne: 'Votre demande sera confirmée par téléphone dans la journée.',
    updated_at: CREE,
  }];

  return {
    spa_soins: SPA_SOINS,
    spa_clients: SPA_CLIENTS,
    spa_reservations: reservations,
    spa_seances: seances,
    spa_bons: bons,
    spa_parametres: parametres,
    spa_campagnes: [],
    spa_envois: [],
  };
}
