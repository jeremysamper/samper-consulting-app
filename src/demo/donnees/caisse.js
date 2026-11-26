// Caisse de démonstration : catégories, boutons, boissons, tickets encaissés
// des jours passés et quelques tables ouvertes ce soir.
import { ETAB, aujourdhui, jour, jourSemaine, instant, graine, deuxDec } from './base.js';
import { PLATS } from './cuisine.js';

const uid = (prefixe, n) => `00000000-0000-4000-${prefixe}-${String(n).padStart(12, '0')}`;

export const BOISSONS = [
  ['eau', 'Eau minérale 50 cl', 5.5], ['jus', 'Jus de pomme du Valais', 5], ['biere', 'Bière blonde artisanale', 6.5],
  ['fendant-verre', 'Fendant, le verre', 7], ['pinot-verre', 'Pinot noir, le verre', 8], ['cornalin-btl', 'Cornalin, la bouteille', 58],
  ['cafe', 'Café', 4.2], ['the', 'Thé ou infusion', 4.5],
].map(([id, nom, prix], i) => ({
  id: 'pl-b-' + id,
  etablissement_id: ETAB,
  nom,
  categorie: 'Boissons',
  prix_vente: prix,
  description: null,
  notes: null,
  ordre: 100 + i,
  actif: true,
  photo_url: null,
  created_at: '2026-09-02T08:00:00Z',
  updated_at: '2026-09-02T08:00:00Z',
}));

// Vins de la carte des vins (Carte des boissons, lot B) : rangés à part des
// boissons des tickets passés, qui se vendaient sans format.
export const VINS_CARTE = [
  ['fendant-favre', 'Fendant, Fils de Charles Favre (Sion)', 17, 'Vins blancs', 'Chasselas du Valais, frais et minéral.'],
  ['pinot-blanc-travaletti', 'Pinot blanc, Travaletti (St-Romain)', 49, 'Vins blancs', null],
].map(([id, nom, prix, categorie, description], i) => ({
  id: 'pl-b-' + id,
  etablissement_id: ETAB,
  nom,
  categorie,
  prix_vente: prix,
  description,
  notes: null,
  ordre: 120 + i,
  actif: true,
  photo_url: null,
  created_at: '2026-11-22T08:00:00Z',
  updated_at: '2026-11-22T08:00:00Z',
}));

// Formats de vente (Carte des boissons) : le Cornalin se vend en bouteille de
// 75 cl ; le Fendant au décilitre et en 50 cl, par un seul bouton qui demande
// le format ; le Pinot blanc en 75 cl seulement, sans question.
export const PLAT_FORMATS = [
  ['pl-b-cornalin-btl', '75 cl', 58, 4],
  ['pl-b-fendant-favre', '1 dl', 3.5, 0],
  ['pl-b-fendant-favre', '50 cl', 17, 1],
  ['pl-b-pinot-blanc-travaletti', '75 cl', 49, 0],
].map(([platId, libelle, prix, ordre], i) => ({
  id: uid('8006', i + 1),
  plat_id: platId,
  etablissement_id: ETAB,
  libelle,
  prix,
  ordre,
  created_at: '2026-11-22T08:00:00Z',
  updated_at: '2026-11-22T08:00:00Z',
}));

// La carte des vins de la démo : une carte de boissons (cartes.genre), vue
// dans la Carte des boissons et vendue par la caisse, jamais dans Cartes &
// Recettes.
export const CARTE_VINS = {
  id: 'carte-vins', etablissement_id: ETAB, nom: 'Carte des vins', genre: 'boissons', date_debut: null, date_fin: null,
  plats: [], archive: false, ordre: 4, masquee: false, created_at: '2026-11-22T08:00:00Z', updated_at: '2026-11-22T08:00:00Z',
};
export const CARTE_VINS_PLATS = ['pl-b-cornalin-btl', 'pl-b-fendant-favre', 'pl-b-pinot-blanc-travaletti'].map((platId, i) => ({
  id: `cp-v-${i}`, carte_id: CARTE_VINS.id, plat_id: platId, ordre: i, created_at: '2026-11-22T08:00:00Z',
}));

const CATEGORIES = [['Entrées', 8.1], ['Plats', 8.1], ['Desserts', 8.1], ['Boissons', 8.1]];
export const CAISSE_CATEGORIES = CATEGORIES.map(([nom, tva], i) => ({
  id: uid('8001', i + 1),
  etablissement_id: ETAB,
  nom,
  ordre: i,
  couleur: null,
  picto: null,
  actif: true,
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T08:00:00Z',
  taux_tva: tva,
  emporter_reduit: nom !== 'Boissons',
}));

const categorieDe = (pl) => CAISSE_CATEGORIES.find((c) => c.nom === pl.categorie)?.id || CAISSE_CATEGORIES[1].id;

export function genererCaisse() {
  const tousPlats = [...PLATS, ...BOISSONS];
  const PLAT_COMPTE = 'pl-tarte';
  const VIN_EPUISE = 'pl-b-cornalin-btl';
  const boutons = tousPlats.map((pl, i) => ({
    id: uid('8002', i + 1),
    etablissement_id: ETAB,
    plat_id: pl.id,
    nom_court: null,
    couleur: null,
    picto: null,
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-10-01T08:00:00Z',
    categorie_id: categorieDe(pl),
    ordre: i,
    taux_tva: null,
    photo_url: null,
    // Rupture du jour (lot L2) : plus de féra aujourd'hui, pour que la démo
    // montre une case grisée et le compteur.
    rupture_le: pl.id === 'pl-fera' ? aujourdhui() : pl.id === VIN_EPUISE ? jour(-2) : null,
    // Lot 12 du panel : la tarte au compteur (il en reste 3 aujourd'hui), le
    // cornalin en bouteille épuisé depuis deux jours, jusqu'à nouvel arrivage.
    epuise_durable: pl.id === VIN_EPUISE,
    portions_le: pl.id === PLAT_COMPTE ? aujourdhui() : null,
    portions_restantes: pl.id === PLAT_COMPTE ? 3 : null,
  }));

  const alea = graine('caisse-' + aujourdhui());
  const tickets = [];
  const lignes = [];
  const paiements = [];
  const clotures = [];
  let nt = 0;
  let nl = 0;
  let np = 0;
  let numero = 1200;
  const nouvelleLigne = (ticketId, pl, quantite, statut, creeLe, suite = 1) => {
    nl += 1;
    lignes.push({
      id: uid('8004', nl),
      ticket_id: ticketId,
      plat_id: pl.id,
      libelle: pl.nom,
      quantite,
      prix_unitaire: pl.prix_vente,
      suite,
      note: null,
      statut,
      envoye_at: statut !== 'en_attente' ? creeLe : null,
      created_at: creeLe,
      updated_at: creeLe,
      options: [],
      annonce_at: null,
      reclame_at: null,
      pret_at: null,
      taux_tva: 8.1,
      a_emporter: false,
      remise_montant: 0,
      remise_motif: null,
      remise_par: null,
      remise_at: null,
      offert: false,
      prix_origine: null,
      envoye_par: statut !== 'en_attente' ? 'demo-serveur' : null,
    });
    return pl.prix_vente * quantite;
  };
  const entrees = PLATS.filter((p) => p.categorie === 'Entrées');
  const plats = PLATS.filter((p) => p.categorie === 'Plats');
  const desserts = PLATS.filter((p) => p.categorie === 'Desserts');
  const pick = (liste) => liste[Math.floor(alea() * liste.length)];

  // Quatorze jours encaissés.
  for (let d = -14; d <= -1; d += 1) {
    const date = jour(d);
    if (jourSemaine(date) === 1) continue;
    const nbTickets = 12 + Math.floor(alea() * 10);
    let totalJour = 0;
    for (let i = 0; i < nbTickets; i += 1) {
      nt += 1;
      numero += 1;
      const id = uid('8003', nt);
      const service = i < nbTickets * 0.4 ? 'midi' : 'soir';
      const heure = service === 'midi' ? '13:40' : '21:50';
      const couverts = 1 + Math.floor(alea() * 4);
      let total = 0;
      for (let c = 0; c < couverts; c += 1) {
        if (alea() < 0.5) total += nouvelleLigne(id, pick(entrees), 1, 'servi', instant(date, heure));
        total += nouvelleLigne(id, pick(plats), 1, 'servi', instant(date, heure));
        if (alea() < 0.45) total += nouvelleLigne(id, pick(desserts), 1, 'servi', instant(date, heure));
        total += nouvelleLigne(id, pick(BOISSONS), 1 + Math.floor(alea() * 2), 'servi', instant(date, heure));
      }
      total = deuxDec(total);
      totalJour += total;
      tickets.push({
        id, etablissement_id: ETAB, table_id: null, statut: 'encaisse', ouvert_par: 'demo-serveur', note: null,
        created_at: instant(date, service === 'midi' ? '12:10' : '19:20'), closed_at: instant(date, heure), updated_at: instant(date, heure),
        reservation_id: null, client_id: null, couverts, qui: 'passage', test: false, numero, annee: Number(date.slice(0, 4)), service,
        jour_exploitation: date, a_emporter: false, total_ttc: total, empreinte: null, empreinte_precedente: null,
        annule_motif: null, annule_par: null, annule_at: null, annule_jour: null,
      });
      np += 1;
      const moyen = alea() < 0.7 ? 'carte' : alea() < 0.6 ? 'especes' : 'twint';
      paiements.push({ id: uid('8005', np), ticket_id: id, moyen, montant: total, encaisse_par: 'demo-serveur', created_at: instant(date, heure), libelle: null, pourboire: moyen === 'especes' ? 0 : deuxDec(Math.round(alea() * 4)), rendu: 0, arrondi: 0, tpe_transaction_id: null, bon_cadeau_id: null });
    }
    clotures.push({
      id: uid('8006', clotures.length + 1), etablissement_id: ETAB, jour_exploitation: date, numero: clotures.length + 1,
      totaux: { total_ttc: deuxDec(totalJour), tickets: nbTickets }, fond_caisse: 300, especes_comptees: null, ecart: 0, motif: null,
      cloture_par: 'demo-patron', cloture_par_nom: 'Claire Morel', cloture_at: instant(date, '23:45'), empreinte: null, empreinte_precedente: null, complement_de: null,
    });
  }

  // Lot 05 du panel : deux tickets du dernier jour clôturé, payés « Chambre ».
  // Le premier est déjà sur la note d'un séjour en maison (genererHotel), le
  // second n'a pas trouvé sa note : il attend dans « Tickets à porter ».
  const ticketsChambre = [];
  const derniere = clotures[clotures.length - 1];
  if (derniere) {
    [['tb-5', '21:15', true], ['tb-2', '21:40', false]].forEach(([table, heure, porte]) => {
      const date = derniere.jour_exploitation;
      nt += 1;
      numero += 1;
      const id = uid('8003', nt);
      let total = nouvelleLigne(id, pick(plats), 2, 'servi', instant(date, heure));
      total += nouvelleLigne(id, pick(BOISSONS), 2, 'servi', instant(date, heure));
      total = deuxDec(total);
      tickets.push({
        id, etablissement_id: ETAB, table_id: table, statut: 'encaisse', ouvert_par: 'demo-serveur', note: null,
        created_at: instant(date, '19:30'), closed_at: instant(date, heure), updated_at: instant(date, heure),
        reservation_id: null, client_id: null, couverts: 2, qui: 'passage', test: false, numero, annee: Number(date.slice(0, 4)), service: 'soir',
        jour_exploitation: date, a_emporter: false, total_ttc: total, empreinte: null, empreinte_precedente: null,
        annule_motif: null, annule_par: null, annule_at: null, annule_jour: null,
      });
      np += 1;
      paiements.push({ id: uid('8005', np), ticket_id: id, moyen: 'autre', montant: total, encaisse_par: 'demo-serveur', created_at: instant(date, heure), libelle: 'Chambre', pourboire: 0, rendu: 0, arrondi: 0, tpe_transaction_id: null, bon_cadeau_id: null });
      derniere.totaux = { total_ttc: deuxDec(derniere.totaux.total_ttc + total), tickets: derniere.totaux.tickets + 1 };
      ticketsChambre.push({ ticket_id: id, numero, annee: Number(date.slice(0, 4)), jour: date, montant: total, porte });
    });
  }

  // Ce soir : trois tables ouvertes.
  const ouverts = [['tb-3', 4, 'envoye'], ['tb-7', 6, 'en_attente'], ['tb-1', 2, 'envoye']];
  ouverts.forEach(([table, couverts, statut], rang) => {
    nt += 1;
    const id = uid('8003', nt);
    // Ouvertes il y a 20 à 50 minutes, quelle que soit l'heure de la visite.
    const ouvertLe = new Date(Date.now() - (20 + rang * 15) * 60000).toISOString();
    for (let c = 0; c < Math.min(couverts, 3); c += 1) {
      nouvelleLigne(id, pick(plats), 1, statut, ouvertLe, 1);
      nouvelleLigne(id, pick(BOISSONS), 1, 'envoye', ouvertLe, 1);
    }
    tickets.push({
      id, etablissement_id: ETAB, table_id: table, statut: 'ouvert', ouvert_par: 'demo-serveur', note: null,
      created_at: ouvertLe, closed_at: null, updated_at: ouvertLe, reservation_id: null, client_id: null, couverts, qui: 'passage',
      test: false, numero: null, annee: null, service: 'soir', jour_exploitation: aujourdhui(), a_emporter: false, total_ttc: null,
      empreinte: null, empreinte_precedente: null, annule_motif: null, annule_par: null, annule_at: null, annule_jour: null,
    });
  });

  return {
    plats_boissons: [...BOISSONS, ...VINS_CARTE],
    tickets_chambre: ticketsChambre,
    plat_formats: PLAT_FORMATS,
    caisse_categories: CAISSE_CATEGORIES,
    caisse_boutons: boutons,
    // Lot 09 du panel : une formule à prix fixe, trois étapes, deux à choix.
    caisse_formules: [{
      id: '00000000-0000-4000-8009-000000000001',
      etablissement_id: ETAB,
      nom: 'Formule midi',
      prix: 39,
      etapes: [
        { nom: 'Entrée', suite: 1, plat_ids: ['pl-veloute', 'pl-salade'] },
        { nom: 'Plat', suite: 2, plat_ids: ['pl-croute', 'pl-rosti', 'pl-risotto', 'pl-fera'] },
        { nom: 'Dessert', suite: 3, plat_ids: ['pl-mousse', 'pl-tarte'] },
      ],
      actif: true,
      archivee: false,
      ordre: 0,
      created_by: null,
      created_at: '2026-11-20T08:00:00Z',
      updated_at: '2026-11-20T08:00:00Z',
    }],
    // Coordonnées de la quittance : sans elles la caisse n'encaisse que des
    // tickets de test. Numéro de TVA fictif, à la clé de contrôle juste.
    caisse_reglages: [{
      etablissement_id: ETAB,
      config: {
        legal: { raison_sociale: 'Brasserie Démo SA', adresse: 'Place des Mélèzes 1', localite: '1950 Sion', numero_tva: 'CHE-123.456.788 TVA' },
        // Lot 11 du panel : partage des pourboires par groupe, Salle 70 et
        // Cuisine 30 (identifiants de PLANNING_GROUPES) ; le Spa n'est pas
        // retenu, sa praticienne est nommée « Hors partage ».
        pourboires: {
          mode: 'cle',
          groupes: [{ id: '00000000-0000-4000-8000-0000000000c2', part: 70 }, { id: '00000000-0000-4000-8000-0000000000c1', part: 30 }],
        },
      },
      updated_at: '2026-10-01T08:00:00Z',
    }],
    caisse_tickets: tickets,
    caisse_lignes: lignes,
    caisse_paiements: paiements,
    caisse_clotures: clotures,
    caisse_tests_journal: [],
    caisse_bons_cadeaux: [],
    caisse_bons_cadeaux_mouvements: [],
    caisse_tpe_terminaux: [],
    caisse_tpe_transactions: [],
    caisse_tpe_bouclements: [],
    caisse_prets_avis: [],
    ...commandesQr(),
    caisse_compteurs: [{ etablissement_id: ETAB, cle: 'ticket:' + aujourdhui().slice(0, 4), valeur: numero, updated_at: instant(jour(-1), '23:45') }],
  };
}

// Commande par QR (lot L3) : la démo ouvre ses boissons au QR, à l'adresse
// réservée « demo » (/commande/demo, carte de démo sans base), et deux
// commandes attendent le bar, posées quelques minutes avant la visite.
function commandesQr() {
  const boissons = CAISSE_CATEGORIES.find((c) => c.nom === 'Boissons');
  const b = (id) => BOISSONS.find((x) => x.id === 'pl-b-' + id);
  const ligne = (id, quantite) => ({ plat_id: b(id).id, libelle: b(id).nom, quantite, prix_unitaire: b(id).prix_vente });
  // Une ligne vendue dans un format : la forme rangée par commande_qr_envoyer.
  const ligneFormat = (id, libelle, quantite) => {
    const f = PLAT_FORMATS.find((x) => x.plat_id === b(id).id && x.libelle === libelle);
    return { plat_id: b(id).id, libelle: `${b(id).nom}, ${f.libelle}`, quantite, prix_unitaire: f.prix, format_id: f.id, format: f.libelle };
  };
  const ilYA = (min) => new Date(Date.now() - min * 60000).toISOString();
  const commande = (n, champs, lignes, min) => ({
    id: uid('8005', n), etablissement_id: ETAB, table_id: null, table_nom: null, au_bar: false,
    statut: 'a_valider', motif_refus: null, traitee_par: null, traitee_at: null, ticket_id: null,
    lignes, total: deuxDec(lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0)),
    created_at: ilYA(min), ...champs,
  });
  return {
    caisse_commande_qr_parametres: [{
      etablissement_id: ETAB, actif: true, slug: 'demo', categories: boissons ? [boissons.id] : [], plages: [],
      created_at: '2026-11-22T08:00:00Z', updated_at: '2026-11-22T08:00:00Z',
    }],
    caisse_commandes_qr: [
      commande(1, { table_id: 'tb-4', table_nom: '4', prenom: 'Léa' }, [ligne('biere', 2), ligne('fendant-verre', 1)], 6),
      commande(2, { au_bar: true, prenom: 'Marc' }, [ligne('pinot-verre', 2), ligneFormat('cornalin-btl', '75 cl', 1)], 2),
    ],
  };
}
