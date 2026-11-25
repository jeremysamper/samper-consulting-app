// Branche Hôtel de la démo (D4, lot 6a) : douze chambres, des séjours autour
// d'aujourd'hui (arrivées, départs, en maison, historique du mois), les hôtes,
// la note, les forfaits et activités, les demandes, les passations, le room
// service et la technique. Tout est fictif : aucune personne ni aucun client réel.
import { ETAB, aujourdhui, jour, instant, deuxDec } from './base.js';
import { SPA_CLIENTS } from './spa.js';

// Identifiants au format uuid : bloc de table (2 chiffres) puis numéro.
const uid = (bloc, n) => `00000000-0000-4000-8000-00000006${bloc}${String(n).padStart(2, '0')}`;
// Variante à trois chiffres pour les tables de plus de 99 lignes.
const uid3 = (bloc, n) => `00000000-0000-4000-8000-0000006${bloc}${String(n).padStart(3, '0')}`;
const CREE = '2026-03-01T08:00:00Z';
const HOTE = 'demo-hote';
const PATRON = 'demo-patron';
const CHEF = 'demo-chef';
const SERVEUR = 'demo-serveur';

// ── Réglages et tarifs ───────────────────────────────────────────────────────

export const HOTEL_REGLAGES = [{
  etablissement_id: ETAB,
  commune: 'Sion',
  taxe_sejour_adulte: 2.5,
  taxe_sejour_enfant: 1.25,
  age_enfant_exonere: 6,
  age_enfant_reduit: 16,
  taxe_hebergement: 1,
  tva_taux: 3.8,
  numero_hesta: 'DEMO-0001',
  mention_note: 'Merci de votre séjour. Données de démonstration.',
  updated_at: CREE,
}];

const tarif = (n, nom, categorie, pension, prix_nuit, personnes_incluses, prix_personne_sup, prix_enfant) => ({
  id: uid('01', n), etablissement_id: ETAB, nom, categorie, pension, prix_nuit, personnes_incluses, prix_personne_sup, prix_enfant,
  valable_du: null, valable_au: null, actif: true, ordre: n, created_at: CREE, updated_at: CREE,
});

export const TARIFS = [
  tarif(1, 'Simple, petit-déjeuner', 'Simple', 'petit_dejeuner', 125, 1, 0, 0),
  tarif(2, 'Double, petit-déjeuner', 'Double', 'petit_dejeuner', 185, 2, 45, 30),
  tarif(3, 'Double, demi-pension', 'Double', 'demi', 255, 2, 75, 45),
  tarif(4, 'Twin, petit-déjeuner', 'Twin', 'petit_dejeuner', 180, 2, 45, 30),
  tarif(5, 'Junior suite, petit-déjeuner', 'Junior suite', 'petit_dejeuner', 265, 2, 55, 35),
  tarif(6, 'Familiale, petit-déjeuner', 'Familiale', 'petit_dejeuner', 290, 2, 45, 30),
];
const TARIF_PAR_CATEGORIE = { Simple: TARIFS[0], Double: TARIFS[1], Twin: TARIFS[3], 'Junior suite': TARIFS[4], Familiale: TARIFS[5] };

// ── Chambres ────────────────────────────────────────────────────────────────

// [numéro, étage, catégorie, capacité, statut de ménage, note]
const CHAMBRES_BRUTES = [
  ['101', '1er étage', 'Simple', 1, 'inspectee', ''],
  ['102', '1er étage', 'Double', 2, 'a_faire', ''],
  ['103', '1er étage', 'Double', 2, 'propre', 'Vue sur le vignoble.'],
  ['104', '1er étage', 'Twin', 2, 'en_cours', ''],
  ['201', '2e étage', 'Double', 2, 'a_faire', ''],
  ['202', '2e étage', 'Double', 2, 'propre', 'Balcon.'],
  ['203', '2e étage', 'Junior suite', 3, 'inspectee', 'Canapé-lit pour un enfant.'],
  ['204', '2e étage', 'Twin', 2, 'propre', ''],
  ['301', '3e étage', 'Double', 2, 'a_faire', ''],
  ['302', '3e étage', 'Familiale', 4, 'a_faire', 'Deux pièces communicantes.'],
  ['303', '3e étage', 'Junior suite', 3, 'en_cours', 'Baignoire.'],
  ['304', '3e étage', 'Double', 2, 'hors_service', ''],
];

export const CHAMBRES = CHAMBRES_BRUTES.map(([numero, etage, categorie, capacite, statut, notes], i) => ({
  id: uid('02', i + 1),
  etablissement_id: ETAB,
  numero,
  etage,
  categorie,
  capacite,
  statut_menage: statut,
  hors_service_motif: statut === 'hors_service' ? 'Fuite sous le lavabo. Le technicien passe aujourd\'hui.' : null,
  attribuee_a: ['102', '201', '301', '302'].includes(numero) ? HOTE : null,
  notes: notes || null,
  ordre: i + 1,
  actif: true,
  created_at: CREE,
  updated_at: instant(aujourdhui(), '07:30'),
}));
const ch = (numero) => CHAMBRES.find((c) => c.numero === numero);

// ── Hôtes ───────────────────────────────────────────────────────────────────

// [prénom, nom, langue, nationalité, localité, allergies, préférences, vip, naissance]
const HOTES_BRUTS = [
  ['Élodie', 'Marchand', 'fr', 'Suisse', 'Lausanne', '', 'Oreiller ferme.', false, '1984-04-12'],
  ['Thomas', 'Weber', 'de', 'Suisse', 'Berne', 'Noix', '', false, '1979-09-03'],
  ['Giulia', 'Bianchi', 'it', 'Italie', 'Milan', '', 'Chambre calme, loin de l\'ascenseur.', false, '1990-01-27'],
  ['James', 'Carter', 'en', 'Royaume-Uni', 'Londres', '', 'Journal en anglais le matin.', false, '1972-06-18'],
  ['Sophie', 'Delacroix', 'fr', 'France', 'Annecy', 'Gluten', '', false, '1988-11-05'],
  ['Markus', 'Huber', 'de', 'Autriche', 'Innsbruck', '', '', false, '1966-02-14'],
  ['Isabelle', 'Roux', 'fr', 'Suisse', 'Genève', '', 'Fleurs blanches en chambre. Cliente fidèle.', true, '1975-08-22'],
  ['Pieter', 'de Vries', 'en', 'Pays-Bas', 'Utrecht', '', 'Vélo à disposition.', false, '1983-05-30'],
  ['Lucía', 'Fernández', 'es', 'Espagne', 'Valence', 'Lactose', '', false, '1992-03-09'],
  ['Claude', 'Berger', 'fr', 'Suisse', 'Fribourg', '', '', false, '1958-12-01'],
  ['Hanna', 'Schmid', 'de', 'Allemagne', 'Munich', '', 'Petit-déjeuner en chambre.', false, '1986-07-16'],
  ['Marco', 'Conti', 'it', 'Suisse', 'Lugano', 'Crustacés', '', false, '1981-10-24'],
  ['Laura', 'Meyer', 'de', 'Suisse', 'Zurich', '', '', false, '1995-04-02'],
  ['Olivier', 'Fournier', 'fr', 'Belgique', 'Namur', '', 'Lit bébé.', false, '1987-09-19'],
  ['Emma', 'Wilson', 'en', 'États-Unis', 'Boston', '', '', false, '1991-02-08'],
  ['Antoine', 'Perrin', 'fr', 'Suisse', 'Neuchâtel', '', 'Anniversaire de mariage pendant le séjour.', true, '1970-06-11'],
];

const sansAccent = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

export const HOTES = HOTES_BRUTS.map(([prenom, nom, langue, nationalite, , allergies, preferences, vip, naissance], i) => ({
  id: uid('03', i + 1),
  etablissement_id: ETAB,
  prenom,
  nom,
  email: `${sansAccent(prenom)}.${sansAccent(nom)}@exemple.test`,
  telephone: `079 000 ${String(60 + i).padStart(2, '0')} ${String(20 + i).padStart(2, '0')}`,
  langue,
  date_naissance: naissance,
  nationalite,
  allergies: allergies || null,
  preferences: preferences || null,
  occasions: i === 15 ? 'Anniversaire de mariage' : null,
  vip,
  notes: null,
  consentement_marketing: i % 3 === 0,
  consentement_at: i % 3 === 0 ? CREE : null,
  consentement_source: i % 3 === 0 ? 'equipe' : null,
  desinscrit_at: null,
  resa_client_id: null,
  // Isabelle Roux est aussi cliente du spa : les deux fiches sont reliées.
  spa_client_id: prenom === 'Isabelle' && nom === 'Roux' ? SPA_CLIENTS.find((c) => c.prenom === prenom && c.nom === nom).id : null,
  archive: false,
  created_by: HOTE,
  created_at: CREE,
  updated_at: CREE,
}));
const LOCALITE = Object.fromEntries(HOTES_BRUTS.map((b, i) => [HOTES[i].id, b[4]]));
const PAYS_DOMICILE = Object.fromEntries(HOTES_BRUTS.map((b, i) => [HOTES[i].id, b[3]]));

// ── Forfaits ────────────────────────────────────────────────────────────────

export const FORFAITS = [
  { id: uid('04', 1), etablissement_id: ETAB, nom: 'Bien-être', description: 'Accès au spa chaque jour et un massage de 30 minutes par séjour.', prix_par_nuit: 45, actif: true, ordre: 1, created_at: CREE, updated_at: CREE },
  { id: uid('04', 2), etablissement_id: ETAB, nom: 'Gourmand', description: 'Dîner du chef et un verre de vin du Valais chaque soir.', prix_par_nuit: 70, actif: true, ordre: 2, created_at: CREE, updated_at: CREE },
];
const F_BIEN_ETRE = FORFAITS[0].id;
const F_GOURMAND = FORFAITS[1].id;

const droit = (n, forfait_id, libelle, categorie, quantite_par_sejour, quantite_par_jour) => ({
  id: uid('05', n), etablissement_id: ETAB, forfait_id, libelle, categorie, quantite_par_sejour, quantite_par_jour, ordre: n, created_at: CREE,
});
export const FORFAIT_DROITS = [
  droit(1, F_BIEN_ETRE, 'Accès au spa', 'spa', null, 1),
  droit(2, F_BIEN_ETRE, 'Massage 30 minutes', 'spa', 1, null),
  droit(3, F_GOURMAND, 'Dîner du chef', 'restauration', null, 1),
  droit(4, F_GOURMAND, 'Verre de vin du Valais', 'boissons', null, 1),
];

// ── Séjours ─────────────────────────────────────────────────────────────────

// [n°, chambre, hôte (index), arrivée (décalage), départ (décalage), statut,
//  pension, adultes, enfants, origine, forfait, bracelet, demandes spéciales]
const SEJOURS_BRUTS = [
  // Départs du jour.
  [1, '102', 0, -3, 0, 'parti', 'petit_dejeuner', 2, 0, 'Booking', null, '', ''],
  [2, '201', 1, -2, 0, 'en_maison', 'demi', 2, 0, 'Téléphone', F_GOURMAND, 'B-2014', 'Allergie aux noix, cuisine prévenue.'],
  [3, '302', 13, -4, 0, 'en_maison', 'petit_dejeuner', 2, 2, 'Site internet', null, '', 'Lit bébé dans la chambre.'],
  // En maison.
  [4, '103', 2, -1, 2, 'en_maison', 'petit_dejeuner', 2, 0, 'Booking', null, '', ''],
  [5, '104', 3, -2, 1, 'en_maison', 'petit_dejeuner', 2, 0, 'Expedia', null, '', ''],
  [6, '202', 4, -1, 3, 'en_maison', 'demi', 2, 0, 'Site internet', null, '', 'Sans gluten au dîner.'],
  [7, '301', 5, -3, 2, 'en_maison', 'complete', 1, 0, 'Téléphone', null, '', 'Pension complète : déjeuner au restaurant.'],
  [8, '303', 6, -2, 4, 'en_maison', 'petit_dejeuner', 2, 0, 'Directe', F_BIEN_ETRE, 'B-3031', 'Cliente fidèle : fleurs blanches à l\'arrivée.'],
  // Arrivées du jour.
  [9, '102', 7, 0, 2, 'prevu', 'petit_dejeuner', 2, 0, 'Booking', null, '', 'Arrivée tardive, vers 22 h.'],
  [10, '201', 8, 0, 3, 'prevu', 'demi', 2, 0, 'Site internet', null, '', 'Sans lactose.'],
  [11, '203', 15, 0, 4, 'prevu', 'petit_dejeuner', 2, 0, 'Directe', F_BIEN_ETRE, '', 'Anniversaire de mariage : bouteille en chambre.'],
  [12, '101', 9, 0, 1, 'prevu', 'petit_dejeuner', 1, 0, 'Téléphone', null, '', ''],
  // À venir.
  [13, '302', 10, 1, 5, 'prevu', 'petit_dejeuner', 2, 1, 'Booking', null, '', ''],
  [14, '104', 11, 1, 3, 'prevu', 'demi', 2, 0, 'Site internet', F_GOURMAND, '', 'Allergie aux crustacés.'],
  [15, '304', 12, 3, 6, 'prevu', 'petit_dejeuner', 2, 0, 'Booking', null, '', ''],
  [16, '101', 14, 2, 4, 'prevu', 'petit_dejeuner', 1, 0, 'Expedia', null, '', ''],
  [17, '204', 3, 6, 8, 'annule', 'petit_dejeuner', 2, 0, 'Booking', null, '', ''],
  // Historique du mois.
  [18, '103', 10, -6, -3, 'parti', 'petit_dejeuner', 2, 0, 'Booking', null, '', ''],
  [19, '202', 12, -5, -2, 'parti', 'demi', 2, 0, 'Site internet', null, '', ''],
  [20, '301', 14, -8, -5, 'parti', 'petit_dejeuner', 2, 0, 'Expedia', null, '', ''],
  [21, '101', 2, -4, -2, 'parti', 'petit_dejeuner', 1, 0, 'Téléphone', null, '', ''],
  [22, '203', 4, -7, -3, 'parti', 'petit_dejeuner', 2, 1, 'Directe', F_BIEN_ETRE, '', ''],
  [23, '302', 0, -10, -6, 'parti', 'petit_dejeuner', 2, 2, 'Booking', null, '', ''],
  [24, '204', 7, -1, 1, 'no_show', 'petit_dejeuner', 2, 0, 'Booking', null, '', ''],
];

export const SEJOURS = SEJOURS_BRUTS.map(([n, numero, iHote, a, d, statut, pension, nb_adultes, nb_enfants, origine, forfait_id, identifiant, demandes]) => {
  const chambre = ch(numero);
  const hote = HOTES[iHote];
  const t = TARIF_PAR_CATEGORIE[chambre.categorie];
  const tarifDemi = chambre.categorie === 'Double' && pension === 'demi' ? TARIFS[2] : null;
  const tarifRetenu = tarifDemi || t;
  return {
    id: uid('06', n),
    etablissement_id: ETAB,
    // Lot 6b : une arrivée du jour sans chambre encore, pour montrer le
    // check-in qui en propose une (fiche du séjour).
    chambre_id: n === 12 ? null : chambre.id,
    client_id: null,
    hote_id: hote.id,
    tarif_id: tarifRetenu.id,
    forfait_id: forfait_id || null,
    identifiant: identifiant || null,
    prix_nuit: tarifRetenu.prix_nuit,
    nom_hote: `${hote.prenom} ${hote.nom}`,
    nb_adultes,
    nb_enfants,
    arrivee: jour(a),
    depart: jour(d),
    statut,
    pension,
    origine,
    demandes_speciales: demandes || null,
    notes: null,
    created_by: HOTE,
    created_at: instant(jour(Math.min(a, 0) - 12), '10:00'),
    updated_at: instant(jour(Math.min(a, 0)), '15:00'),
  };
});
const sj = (n) => SEJOURS.find((s) => s.id === uid('06', n));
const occupe = (s) => s.statut === 'en_maison' || s.statut === 'parti';

// Occupants (registre des étrangers et taxe de séjour) : un par adulte et par
// enfant des séjours arrivés.
export const SEJOUR_OCCUPANTS = SEJOURS.filter(occupe).flatMap((s, i) => {
  const hote = HOTES.find((h) => h.id === s.hote_id);
  const out = [];
  for (let k = 0; k < s.nb_adultes + s.nb_enfants; k += 1) {
    const principal = k === 0;
    const enfant = k >= s.nb_adultes;
    out.push({
      id: uid3('07', out.length + 1 + i * 4),
      etablissement_id: ETAB,
      sejour_id: s.id,
      hote_id: principal ? hote.id : null,
      prenom: principal ? hote.prenom : ['Camille', 'Léo', 'Zoé', 'Noah'][k % 4],
      nom: hote.nom,
      date_naissance: principal ? hote.date_naissance : (enfant ? `20${String(14 + k).padStart(2, '0')}-05-1${k}` : '1985-03-15'),
      nationalite: hote.nationalite,
      domicile_adresse: null,
      domicile_localite: LOCALITE[hote.id],
      domicile_pays: PAYS_DOMICILE[hote.id],
      piece_type: principal && hote.nationalite !== 'Suisse' ? 'passeport' : (principal ? 'carte_identite' : null),
      piece_numero: principal ? `X${String(4100000 + i * 7).slice(0, 7)}` : null,
      arrivee: s.arrivee,
      depart: s.depart,
      exonere_taxe: false,
      exonere_motif: null,
      created_by: HOTE,
      created_at: instant(s.arrivee, '16:00'),
      updated_at: instant(s.arrivee, '16:00'),
    });
  }
  return out;
});

const nuits = (s) => Math.round((Date.parse(s.depart) - Date.parse(s.arrivee)) / 86400000);

// Note de séjour : nuitées et taxes calculées à l'arrivée, extras, encaissement
// des séjours partis.
export function genererLignesSejour({ ticketsChambre = [] } = {}) {
  const lignes = [];
  let k = 0;
  const ligne = (s, j, type, libelle, quantite, prix_unitaire, tva_taux, heure = '18:00') => {
    k += 1;
    lignes.push({
      id: uid3('08', k),
      etablissement_id: ETAB, sejour_id: s.id, jour: j, type, libelle, quantite, prix_unitaire,
      montant: deuxDec(quantite * prix_unitaire), tva_taux, note: null, created_by: HOTE,
      created_at: instant(j, heure), origine: null, origine_id: null,
    });
  };
  for (const s of SEJOURS.filter(occupe)) {
    const n = nuits(s);
    const t = TARIFS.find((x) => x.id === s.tarif_id);
    ligne(s, s.arrivee, 'nuitee', `Nuitée, ${t.nom}`, n, s.prix_nuit, 3.8, '16:00');
    if (s.nb_enfants && t.prix_enfant) ligne(s, s.arrivee, 'nuitee', 'Enfant', n * s.nb_enfants, t.prix_enfant, 3.8, '16:00');
    if (s.forfait_id) {
      const f = FORFAITS.find((x) => x.id === s.forfait_id);
      ligne(s, s.arrivee, 'extra', `Forfait ${f.nom}`, n, f.prix_par_nuit, 8.1, '16:00');
    }
    ligne(s, s.arrivee, 'taxe_sejour', 'Taxe de séjour, adulte', n * s.nb_adultes, 2.5, null, '16:00');
    if (s.nb_enfants) ligne(s, s.arrivee, 'taxe_sejour', 'Taxe de séjour, enfant', n * s.nb_enfants, 1.25, null, '16:00');
    ligne(s, s.arrivee, 'taxe_hebergement', 'Taxe d\'hébergement', n * (s.nb_adultes + s.nb_enfants), 1, null, '16:00');
  }
  // Extras des séjours en maison.
  ligne(sj(4), jour(-1), 'extra', 'Minibar, eau minérale', 2, 4.5, 8.1, '22:10');
  ligne(sj(6), jour(-1), 'extra', 'Bouteille de Petite Arvine', 1, 58, 8.1, '20:40');
  ligne(sj(7), jour(-2), 'extra', 'Blanchisserie, chemise', 3, 6, 8.1, '09:15');
  ligne(sj(8), jour(-1), 'extra', 'Room service, plateau du soir', 1, 42, 8.1, '21:30');
  ligne(sj(8), jour(-1), 'remise', 'Geste fidélité', 1, -30, 3.8, '21:35');
  ligne(sj(2), jour(-1), 'extra', 'Minibar, chocolat', 1, 6.5, 8.1, '23:00');
  // Lot 05 du panel : un ticket de la Caisse déjà porté sur la note (chambre 103).
  ticketsChambre.filter((t) => t.porte).forEach((t) => {
    ligne(sj(4), t.jour, 'extra', `Restaurant, ticket n° ${t.annee}-${String(t.numero).padStart(6, '0')}`, 1, t.montant, null, '21:20');
    Object.assign(lignes[lignes.length - 1], { origine: 'caisse_ticket', origine_id: t.ticket_id, created_by: SERVEUR });
  });
  // Encaissement des séjours partis : la note est soldée.
  for (const s of SEJOURS.filter((x) => x.statut === 'parti')) {
    const total = lignes.filter((l) => l.sejour_id === s.id).reduce((t, l) => t + l.montant, 0);
    ligne(s, s.depart, 'paiement', 'Encaissement, Carte', 1, -deuxDec(total), null, '10:30');
  }
  // Acompte versé à la réservation pour la suite junior en maison.
  ligne(sj(8), jour(-2), 'paiement', 'Encaissement, Virement', 1, -300, null, '16:10');
  return lignes;
}

// ── Étages : journal de ménage, minibar, objets trouvés, linge, couverture ──

export function genererEtages() {
  const journal = [];
  const passage = (n, numero, ancien, nouveau, decalage, heure, par = HOTE) => journal.push({
    id: uid('09', n), etablissement_id: ETAB, chambre_id: ch(numero).id, ancien, nouveau, par, at: instant(jour(decalage), heure),
  });
  passage(1, '103', 'a_faire', 'en_cours', 0, '08:40');
  passage(2, '103', 'en_cours', 'propre', 0, '09:15');
  passage(3, '202', 'a_faire', 'propre', 0, '09:40');
  passage(4, '104', 'a_faire', 'en_cours', 0, '10:05');
  passage(5, '203', 'propre', 'inspectee', 0, '10:20', PATRON);
  passage(6, '101', 'propre', 'inspectee', 0, '10:25', PATRON);
  passage(7, '304', 'propre', 'hors_service', 0, '07:50');
  passage(8, '303', 'a_faire', 'en_cours', 0, '10:30');
  passage(9, '204', 'en_cours', 'propre', -1, '14:10');
  passage(10, '102', 'propre', 'a_faire', 0, '10:35');

  const minibar = [
    [1, '103', 4, 'Eau minérale', 2, -1, '22:00'],
    [2, '202', 6, 'Bière blonde', 1, -1, '23:10'],
    [3, '201', 2, 'Chocolat noir', 1, -1, '22:45'],
    [4, '303', 8, 'Jus d\'abricot', 2, 0, '09:50'],
  ].map(([n, numero, s, article, quantite, d, h]) => ({
    id: uid('10', n), etablissement_id: ETAB, chambre_id: ch(numero).id, sejour_id: sj(s).id, article, quantite, note: null, par: HOTE, created_at: instant(jour(d), h),
  }));

  const objets = [
    { id: uid('11', 1), etablissement_id: ETAB, chambre_id: ch('102').id, sejour_id: sj(1).id, description: 'Chargeur de téléphone blanc', lieu: 'Table de nuit', trouve_le: jour(0), statut: 'trouve', rendu_le: null, rendu_a: null, note: 'L\'hôte a été prévenu par message.', par: HOTE, created_at: instant(jour(0), '10:40'), updated_at: instant(jour(0), '10:40') },
    { id: uid('11', 2), etablissement_id: ETAB, chambre_id: ch('203').id, sejour_id: sj(22).id, description: 'Écharpe en laine grise', lieu: 'Penderie', trouve_le: jour(-3), statut: 'rendu', rendu_le: jour(-1), rendu_a: 'Envoi postal', note: null, par: HOTE, created_at: instant(jour(-3), '11:00'), updated_at: instant(jour(-1), '09:00') },
    { id: uid('11', 3), etablissement_id: ETAB, chambre_id: null, sejour_id: null, description: 'Lunettes de soleil', lieu: 'Terrasse', trouve_le: jour(-2), statut: 'trouve', rendu_le: null, rendu_a: null, note: null, par: SERVEUR, created_at: instant(jour(-2), '15:20'), updated_at: instant(jour(-2), '15:20') },
  ];

  const linge = [
    [1, 0, 'sale', 'draps', 14], [2, 0, 'sale', 'serviettes', 22], [3, 0, 'propre', 'draps', 20], [4, 0, 'propre', 'serviettes', 30],
    [5, 0, 'propre', 'peignoirs', 6], [6, -1, 'sale', 'draps', 12], [7, -1, 'sale', 'serviettes', 18], [8, -1, 'propre', 'draps', 16],
  ].map(([n, d, sens, type, quantite]) => ({
    id: uid('12', n), etablissement_id: ETAB, chambre_id: null, jour: jour(d), sens, type, quantite, note: null, par: HOTE, created_at: instant(jour(d), sens === 'sale' ? '11:30' : '14:00'),
  }));

  const turndown = ['103', '104', '202', '301', '303'].map((numero, i) => ({
    id: uid('13', i + 1), etablissement_id: ETAB, chambre_id: ch(numero).id, jour: jour(-1), fait_par: HOTE, at: instant(jour(-1), `19:${String(10 + i * 8).padStart(2, '0')}`),
  }));

  return { chambres_statut_journal: journal, chambres_minibar: minibar, objets_trouves: objets, linge_mouvements: linge, chambres_turndown: turndown };
}

// ── Demandes interpôles ─────────────────────────────────────────────────────

export function genererDemandes() {
  // [n°, chambre, séjour, origine, pôle, titre, détail, priorité, échéance (décalage, heure), statut, escaladée, attribuée, créée (décalage, heure), créée par]
  const brutes = [
    [1, '303', 8, 'hote', 'etages', 'Deux oreillers supplémentaires', 'Oreillers fermes si possible.', 'normale', [0, '12:00'], 'en_cours', false, HOTE, [0, '08:20'], HOTE],
    [2, '304', null, 'collegue', 'technique', 'Fuite sous le lavabo', 'L\'eau coule au sol. Chambre mise hors service.', 'urgente', [0, '11:00'], 'ouverte', true, PATRON, [0, '07:45'], HOTE],
    [3, '201', 2, 'hote', 'cuisine', 'Petit-déjeuner sans noix', 'Rappel pour le service de demain matin.', 'haute', [1, '07:00'], 'ouverte', false, CHEF, [-1, '19:30'], HOTE],
    [4, '102', 9, 'collegue', 'reception', 'Arrivée tardive vers 22 h', 'Laisser la clé au coffre de nuit.', 'normale', [0, '21:30'], 'ouverte', false, HOTE, [0, '09:10'], SERVEUR],
    [5, '202', 6, 'hote', 'restaurant', 'Table près de la fenêtre ce soir', 'Deux couverts à 19 h 30.', 'basse', [0, '18:00'], 'faite', false, SERVEUR, [0, '10:00'], HOTE],
    [6, '203', 11, 'collegue', 'etages', 'Bouteille et fleurs en chambre', 'Anniversaire de mariage. Avant 15 h.', 'haute', [0, '15:00'], 'ouverte', false, HOTE, [-1, '17:00'], PATRON],
    [7, '104', 5, 'hote', 'technique', 'Télévision sans signal', 'Le décodeur ne s\'allume plus.', 'normale', [-1, '18:00'], 'en_cours', false, PATRON, [-1, '16:40'], HOTE],
    [8, '301', 7, 'hote', 'spa', 'Massage demain à 10 h', 'Massage suédois de 60 minutes.', 'normale', [0, '17:00'], 'faite', false, 'demo-spa', [-1, '20:15'], HOTE],
    // Lot 6b : une demande du pôle Technique sans ordre de travail encore,
    // que la technique transforme en ordre en un toucher.
    [9, '202', 6, 'hote', 'technique', 'Lampe de chevet en panne', 'Côté fenêtre. L\'ampoule a été changée, rien ne s\'allume.', 'normale', [0, '20:00'], 'ouverte', false, null, [0, '09:40'], HOTE],
  ];
  const demandes = brutes.map(([n, numero, s, origine, pole, titre, detail, priorite, [ed, eh], statut, escaladee, assignee, [cd, chh], par]) => ({
    id: uid('14', n),
    etablissement_id: ETAB,
    chambre_id: numero ? ch(numero).id : null,
    sejour_id: s ? sj(s).id : null,
    origine,
    pole,
    titre,
    detail,
    photo_url: null,
    priorite,
    echeance: instant(jour(ed), eh),
    statut,
    escaladee,
    escaladee_at: escaladee ? instant(jour(0), '08:30') : null,
    assignee_a: assignee,
    cree_par: par,
    faite_par: statut === 'faite' ? assignee : null,
    faite_at: statut === 'faite' ? instant(jour(0), '10:45') : null,
    created_at: instant(jour(cd), chh),
    updated_at: instant(jour(0), '10:45'),
  }));
  const journal = [];
  let k = 0;
  const trace = (d, action, detail, par, at) => { k += 1; journal.push({ id: uid('15', k), etablissement_id: ETAB, demande_id: d.id, action, detail, par, at }); };
  for (const d of demandes) {
    // Même forme que le déclencheur demandes_journal_ecrire.
    trace(d, 'creee', d.pole, d.cree_par, d.created_at);
    if (d.assignee_a) trace(d, 'assignation', d.assignee_a, d.cree_par, d.created_at);
    if (d.escaladee) trace(d, 'escalade', 'oui', d.cree_par, d.escaladee_at);
    if (d.statut === 'en_cours') trace(d, 'statut', 'en_cours', d.assignee_a, instant(jour(0), '09:00'));
    if (d.statut === 'faite') trace(d, 'statut', 'faite', d.assignee_a, d.faite_at);
  }
  return { demandes, demandes_journal: journal };
}

// ── Activités ───────────────────────────────────────────────────────────────

export function genererActivites() {
  // [n°, décalage, début, fin, titre, description, lieu, places, prix, inclus forfait, annulée]
  const brutes = [
    [1, 0, '07:30', '08:15', 'Yoga du matin', 'Séance douce pour tous les niveaux. Tapis fournis.', 'Salle panoramique', 8, 0, true, false],
    [2, 0, '09:30', '12:30', 'Balade le long d\'un bisse', 'Marche facile de 8 km avec un guide. Prévoir de bonnes chaussures.', 'Départ devant l\'hôtel', 12, 0, true, false],
    [3, 0, '17:30', '18:30', 'Dégustation de vins du Valais', 'Cinq vins de la région, avec le sommelier.', 'Bar', 10, 25, false, false],
    [4, 1, '07:30', '08:15', 'Yoga du matin', 'Séance douce pour tous les niveaux. Tapis fournis.', 'Salle panoramique', 8, 0, true, false],
    [5, 1, '15:00', '16:30', 'Atelier raclette', 'Le chef montre la raclette au feu de bois. Dégustation comprise.', 'Terrasse', 14, 35, false, false],
    [6, 2, '10:00', '16:00', 'Sortie raquettes', 'Annulée : pas assez de neige.', 'Départ devant l\'hôtel', 10, 40, false, true],
    [7, 3, '18:00', '19:00', 'Apéritif du directeur', 'Verre de bienvenue pour les hôtes de la semaine.', 'Salon', null, 0, true, false],
    [8, -1, '17:30', '18:30', 'Dégustation de vins du Valais', 'Cinq vins de la région, avec le sommelier.', 'Bar', 10, 25, false, false],
  ];
  const activites = brutes.map(([n, d, debut, fin, titre, description, lieu, places, prix, inclus, annulee]) => ({
    id: uid('16', n), etablissement_id: ETAB, titre, description, lieu, debut: instant(jour(d), debut), fin: instant(jour(d), fin),
    places, prix, inclus_forfait: inclus, responsable: n === 3 || n === 8 ? SERVEUR : n === 5 ? CHEF : HOTE, annulee,
    created_by: HOTE, created_at: instant(jour(-14), '10:00'), updated_at: instant(jour(-14), '10:00'),
  }));
  // [n°, activité, séjour, personnes, statut]
  const inscriptions = [
    [1, 1, 8, 1, 'present'], [2, 1, 6, 2, 'present'], [3, 2, 4, 2, 'inscrit'], [4, 2, 7, 1, 'inscrit'], [5, 2, 5, 2, 'inscrit'],
    [6, 3, 2, 2, 'inscrit'], [7, 3, 6, 2, 'inscrit'], [8, 3, 8, 2, 'inscrit'], [9, 3, 5, 1, 'annule'], [10, 5, 4, 2, 'inscrit'],
    [11, 5, 11, 2, 'inscrit'], [12, 8, 7, 1, 'present'], [13, 8, 6, 2, 'present'],
  ].map(([n, a, s, nb, statut]) => ({
    id: uid('17', n), etablissement_id: ETAB, activite_id: uid('16', a), sejour_id: sj(s).id, nb_personnes: nb, statut, note: null,
    created_by: HOTE, created_at: instant(jour(-1), '18:00'), updated_at: instant(jour(-1), '18:00'),
  }));
  // Droits des forfaits déjà consommés.
  const consommations = [
    [1, 8, 1, 'Accès au spa', -1, 'Spa', '16:00'], [2, 8, 1, 'Accès au spa', 0, 'Spa', '09:30'], [3, 8, 2, 'Massage 30 minutes', -1, 'Spa', '17:00'],
    [4, 2, 3, 'Dîner du chef', -2, 'Restaurant', '19:45'], [5, 2, 4, 'Verre de vin du Valais', -2, 'Restaurant', '19:50'],
    [6, 2, 3, 'Dîner du chef', -1, 'Restaurant', '19:40'], [7, 2, 4, 'Verre de vin du Valais', -1, 'Bar', '22:00'],
  ].map(([n, s, dr, libelle, d, lieu, h]) => ({
    id: uid('18', n), etablissement_id: ETAB, sejour_id: sj(s).id, droit_id: uid('05', dr), libelle, quantite: 1, jour: jour(d), lieu, at: instant(jour(d), h), par: dr <= 2 ? 'demo-spa' : SERVEUR, created_at: instant(jour(d), h),
  }));
  return { activites, activite_inscriptions: inscriptions, consommations };
}

// ── Passations et tâches récurrentes ────────────────────────────────────────

export function genererPassations() {
  // [n°, pôle, décalage, service, contenu, important, auteur, heure]
  const brutes = [
    [1, 'reception', 0, 'matin', 'Chambre 304 hors service jusqu\'à réparation de la fuite. Le séjour Meyer arrive dans trois jours : à confirmer avec la technique.', true, HOTE, '07:55'],
    [2, 'reception', -1, 'soir', 'Arrivée tardive en 102 ce soir vers 22 h, clé au coffre de nuit. Monsieur Weber (201) part demain, note à préparer.', false, HOTE, '21:40'],
    [3, 'reception', -1, 'nuit', 'Nuit calme. Un hôte de la 104 a signalé la télévision : demande créée pour la technique.', false, HOTE, '06:30'],
    [4, 'etages', 0, 'matin', 'Quatre départs à faire avant 14 h : 102, 201, 302, puis 301 en recouche. La 203 est inspectée pour l\'anniversaire.', true, HOTE, '08:05'],
    [5, 'cuisine', 0, 'matin', 'Deux allergies chez les hôtes : noix en 201, crustacés pour l\'arrivée de demain en 104. Dîner sans gluten en 202.', true, CHEF, '09:20'],
    [6, 'cuisine', -1, 'soir', 'Seize couverts hôtel au dîner. Stock de Petite Arvine bas, commande passée.', false, CHEF, '22:15'],
    [7, 'restaurant', 0, 'matin', 'Table 12 réservée pour la 202 à 19 h 30, près de la fenêtre.', false, SERVEUR, '10:05'],
    [8, 'direction', -2, 'apres_midi', 'Point avec le chauffagiste prévu la semaine prochaine pour l\'entretien de la chaudière.', false, PATRON, '15:30'],
  ];
  const passations = brutes.map(([n, pole, d, service, contenu, important, auteur, h]) => ({
    id: uid('19', n), etablissement_id: ETAB, pole, jour: jour(d), service, contenu, important, created_by: auteur, created_at: instant(jour(d), h), updated_at: instant(jour(d), h),
  }));
  const lectures = [
    [1, 2, PATRON], [2, 2, CHEF], [3, 3, PATRON], [4, 6, PATRON], [5, 8, HOTE], [6, 5, PATRON], [7, 1, PATRON],
  ].map(([n, p, user_id]) => ({ id: uid('20', n), etablissement_id: ETAB, passation_id: uid('19', p), user_id, at: instant(jour(0), '09:30') }));

  // [n°, pôle, titre, détail, récurrence, jour de la semaine, jour du mois, heure]
  const taches = [
    [1, 'reception', 'Préparer les arrivées du lendemain', 'Vérifier les demandes spéciales et les allergies.', 'quotidien', null, null, '16:00'],
    [2, 'reception', 'Contrôler la caisse de la réception', '', 'quotidien', null, null, '22:00'],
    [3, 'etages', 'Inventaire du linge propre', 'Compter draps, serviettes et peignoirs.', 'hebdomadaire', 1, null, '14:00'],
    [4, 'etages', 'Couverture du soir', 'Chambres en maison seulement.', 'quotidien', null, null, '19:00'],
    [5, 'technique', 'Relever les compteurs d\'eau et d\'électricité', '', 'mensuel', null, 1, '08:00'],
    [6, 'cuisine', 'Commander le pain du petit-déjeuner', 'Compter les couverts de demain dans Repas hôtel.', 'quotidien', null, null, '15:00'],
    [7, 'direction', 'Envoyer le registre des hôtes à la commune', '', 'mensuel', null, 5, '10:00'],
  ];
  const taches_recurrentes = taches.map(([n, pole, titre, detail, recurrence, jour_semaine, jour_mois, heure], i) => ({
    id: uid('21', n), etablissement_id: ETAB, pole, titre, detail: detail || null, recurrence, jour_semaine, jour_mois, heure: `${heure}:00`,
    actif: true, ordre: i, created_at: CREE, updated_at: CREE,
  }));
  const taches_faites = [
    [1, 1, -1, HOTE, '16:10'], [2, 2, -1, HOTE, '22:05'], [3, 4, -1, HOTE, '19:30'], [4, 6, -1, CHEF, '15:05'], [5, 6, 0, CHEF, '09:40'],
  ].map(([n, t, d, fait_par, h]) => ({ id: uid('22', n), etablissement_id: ETAB, tache_id: uid('21', t), jour: jour(d), fait_par, at: instant(jour(d), h) }));

  return { passations, passation_lectures: lectures, taches_recurrentes, taches_faites };
}

// ── Room service ────────────────────────────────────────────────────────────

export function genererRoomService() {
  const commande = (n, s, articles, statut, d, h, souhaite, porte = false) => {
    const sejour = sj(s);
    return {
      id: uid('23', n), etablissement_id: ETAB, sejour_id: sejour.id, chambre_id: sejour.chambre_id, articles,
      total: deuxDec(articles.reduce((t, a) => t + a.quantite * a.prix, 0)), statut,
      souhaite_a: souhaite ? instant(jour(d), souhaite) : null, note: null, portee_sur_note: porte,
      created_by: HOTE, livree_par: statut === 'livree' ? SERVEUR : null, livree_at: statut === 'livree' ? instant(jour(d), souhaite || h) : null,
      created_at: instant(jour(d), h), updated_at: instant(jour(d), h),
    };
  };
  return [
    commande(1, 8, [{ libelle: 'Plateau du soir', quantite: 1, prix: 42 }], 'livree', -1, '20:50', '21:30', true),
    commande(2, 4, [{ libelle: 'Petit-déjeuner continental', quantite: 2, prix: 0 }, { libelle: 'Jus d\'orange pressé', quantite: 2, prix: 6 }], 'livree', 0, '07:15', '08:00'),
    commande(3, 6, [{ libelle: 'Club sandwich', quantite: 1, prix: 24 }, { libelle: 'Eau minérale', quantite: 1, prix: 5 }], 'en_cuisine', 0, '11:50', '12:30'),
    commande(4, 7, [{ libelle: 'Assiette valaisanne', quantite: 1, prix: 29 }, { libelle: 'Verre de Fendant', quantite: 1, prix: 8.5 }], 'recue', 0, '12:05', '19:00'),
  ];
}

// ── Technique ───────────────────────────────────────────────────────────────

export function genererTechnique() {
  // [n°, nom, catégorie, lieu, chambre, n° de série, fournisseur]
  const equipements = [
    [1, 'Chaudière à pellets', 'chauffage', 'Sous-sol', null, 'CH-2019-4412', 'Chauffage Rhône SA'],
    [2, 'Ascenseur principal', 'ascenseur', 'Cage d\'escalier', null, 'ASC-88231', 'Ascenseurs du Valais'],
    [3, 'Lave-linge industriel', 'autre', 'Buanderie', null, 'LL-55-210', 'Pro Linge Sàrl'],
    [4, 'Sauna finlandais', 'spa', 'Spa', null, 'SA-7702', 'Bien-Être Technique'],
    [5, 'Hotte de la cuisine', 'cuisine', 'Cuisine', null, 'HT-3301', 'Cuisines Pro'],
    [6, 'Climatisation de la 303', 'electricite', '3e étage', '303', 'CL-1180', 'Froid Service'],
    [7, 'Détection incendie', 'securite', 'Tout le bâtiment', null, 'DI-2020', 'Sécurité Alpes'],
    [8, 'Robinetterie de la 304', 'plomberie', '3e étage', '304', '', ''],
  ].map(([n, nom, categorie, lieu, numero, serie, fournisseur]) => ({
    id: uid('24', n), etablissement_id: ETAB, nom, categorie, lieu, chambre_id: numero ? ch(numero).id : null, numero_serie: serie || null,
    fournisseur: fournisseur || null, actif: true, notes: null, created_at: CREE, updated_at: CREE,
  }));
  // [n°, titre, détail, catégorie, équipement, périodicité, dernière fois (décalage), prochaine fois (décalage)]
  const plans = [
    [1, 'Entretien de la chaudière', 'Nettoyage et contrôle de combustion.', 'chauffage', 1, 365, -358, 7],
    [2, 'Contrôle de l\'ascenseur', 'Visite du contrat d\'entretien.', 'ascenseur', 2, 90, -95, -5],
    [3, 'Détartrage du lave-linge', '', 'autre', 3, 30, -30, 0],
    [4, 'Nettoyage des filtres de la hotte', '', 'cuisine', 5, 14, -10, 4],
    [5, 'Test des détecteurs', 'Un détecteur par étage, à tour de rôle.', 'securite', 7, 30, -12, 18],
  ].map(([n, titre, detail, categorie, eq, periodicite, derniere, prochaine]) => ({
    id: uid('25', n), etablissement_id: ETAB, titre, detail: detail || null, categorie, equipement_id: uid('24', eq), chambre_id: null, lieu: null,
    periodicite_jours: periodicite, derniere_fois: jour(derniere), prochaine_fois: jour(prochaine), actif: true, created_at: CREE, updated_at: CREE,
  }));
  // [n°, titre, détail, catégorie, priorité, statut, chambre, équipement, demande, plan, prévu le, attribué, minutes, coût, pièces, compte rendu, créé (décalage, heure)]
  const ordres = [
    [1, 'Fuite sous le lavabo', 'Siphon ou flexible à changer.', 'plomberie', 'urgente', 'en_cours', '304', 8, 2, null, 0, PATRON, null, null, '', '', [0, '07:50']],
    [2, 'Télévision sans signal', 'Décodeur à tester, sinon à remplacer.', 'electricite', 'normale', 'planifie', '104', null, 7, null, 0, PATRON, null, null, '', '', [-1, '16:45']],
    [3, 'Contrôle de l\'ascenseur', 'Visite trimestrielle en retard.', 'ascenseur', 'haute', 'ouvert', null, 2, null, 2, 1, null, null, null, '', '', [-5, '08:00']],
    [4, 'Détartrage du lave-linge', '', 'autre', 'normale', 'ouvert', null, 3, null, 3, 0, null, null, null, '', '', [0, '06:00']],
    [5, 'Ampoule de la salle de bain', 'Ampoule grillée au-dessus du miroir.', 'electricite', 'basse', 'termine', '202', null, null, null, -2, PATRON, 15, 8.5, 'Ampoule LED E14', 'Ampoule changée, testée.', [-2, '09:00']],
    [6, 'Bruit de la climatisation', 'Le client entend un sifflement la nuit.', 'electricite', 'normale', 'termine', '303', 6, null, null, -3, PATRON, 45, null, '', 'Filtre nettoyé, plus de sifflement.', [-4, '10:30']],
  ].map(([n, titre, detail, categorie, priorite, statut, numero, eq, dem, plan, prevu, assigne, minutes, cout, pieces, cr, [cd, chh]]) => ({
    id: uid('26', n), etablissement_id: ETAB, titre, detail: detail || null, categorie, priorite, statut,
    chambre_id: numero ? ch(numero).id : null, equipement_id: eq ? uid('24', eq) : null, lieu: numero ? null : 'Parties communes',
    demande_id: dem ? uid('14', dem) : null, plan_id: plan ? uid('25', plan) : null, prevu_le: jour(prevu), assigne_a: assigne,
    temps_minutes: minutes, cout, pieces: pieces || null, photo_url: null, compte_rendu: cr || null,
    termine_par: statut === 'termine' ? assigne : null, termine_at: statut === 'termine' ? instant(jour(prevu), '11:00') : null,
    created_by: HOTE, created_at: instant(jour(cd), chh), updated_at: instant(jour(cd), chh),
  }));
  return { equipements, maintenance_plans: plans, ordres_travail: ordres };
}

export function genererHotel({ ticketsChambre = [] } = {}) {
  return {
    hotel_reglages: HOTEL_REGLAGES,
    tarifs: TARIFS,
    chambres: CHAMBRES,
    hotes: HOTES,
    forfaits: FORFAITS,
    forfait_droits: FORFAIT_DROITS,
    sejours: SEJOURS,
    sejour_occupants: SEJOUR_OCCUPANTS,
    sejour_lignes: genererLignesSejour({ ticketsChambre }),
    sejour_liens: [],
    room_service_commandes: genererRoomService(),
    ...genererEtages(),
    ...genererDemandes(),
    ...genererActivites(),
    ...genererPassations(),
    ...genererTechnique(),
  };
}
