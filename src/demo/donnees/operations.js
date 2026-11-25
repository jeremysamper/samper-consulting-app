// Données de démonstration du quotidien : planning, HACCP, inventaire, pertes,
// commande, mise en place, SOP, documents, messages, points et comptabilité.
import { ETAB, EQUIPE, aujourdhui, jour, jourSemaine, lundi, instant, graine, deuxDec } from './base.js';
import { PRODUITS, PRODUIT } from './catalogue.js';
import { RECETTES } from './cuisine.js';
import { SOP_TEMPLATES } from '../../data/sopTemplates.js';

// ── Planning ─────────────────────────────────────────────────────────────────

export const PLANNING_GROUPES = [
  { id: '00000000-0000-4000-8000-0000000000c1', etablissement_id: ETAB, nom: 'Cuisine', famille: 'cuisine', ordre: 1, created_at: '2026-02-01T08:00:00Z' },
  { id: '00000000-0000-4000-8000-0000000000c2', etablissement_id: ETAB, nom: 'Salle', famille: 'salle', ordre: 2, created_at: '2026-02-01T08:00:00Z' },
  // Lot 6a : groupe ajouté par la maison (sans famille de rôle) pour le spa.
  { id: '00000000-0000-4000-8000-0000000000c3', etablissement_id: ETAB, nom: 'Spa', famille: null, ordre: 3, created_at: '2026-02-01T08:00:00Z' },
];
const G_CUISINE = PLANNING_GROUPES[0].id;
const G_SALLE = PLANNING_GROUPES[1].id;
const G_SPA = PLANNING_GROUPES[2].id;
const groupeDe = (role) => (role === 'praticien_spa' ? G_SPA : ['serveur', 'hote'].includes(role) ? G_SALLE : G_CUISINE);

export const PLANNING_GROUPE_MEMBRES = EQUIPE
  .filter((u) => u.role !== 'patron')
  .map((u) => ({ etablissement_id: ETAB, user_id: u.id, groupe_id: groupeDe(u.role), updated_at: '2026-02-01T08:00:00Z' }));

// Horaires types par personne : [jours de repos (0 = dimanche), segments].
const RYTHMES = {
  'demo-chef': [[1, 2], [['08:30', '14:30'], ['17:30', '22:30']]],
  'demo-cuisinier': [[1, 3], [['09:00', '14:30'], ['17:30', '22:00']]],
  'demo-cuis-2': [[1, 4], [['09:30', '14:30'], ['18:00', '22:30']]],
  'demo-cuis-3': [[1, 0], [['07:30', '15:30']]],
  'demo-cuis-4': [[1, 2], [['11:00', '15:00'], ['18:30', '23:00']]],
  'demo-serveur': [[1, 2], [['11:00', '14:30'], ['18:00', '23:00']]],
  'demo-serv-2': [[1, 3], [['11:00', '15:00'], ['18:00', '23:30']]],
  'demo-serv-3': [[1, 0], [['17:00', '00:30']]],
  'demo-hote': [[1, 6], [['10:30', '14:30'], ['17:30', '21:30']]],
  'demo-spa': [[1, 2], [['09:30', '18:30']]],
};

export function genererShifts() {
  const alea = graine('shifts-' + aujourdhui());
  const shifts = [];
  const debutSemaine = lundi();
  const maintenant = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  let k = 0;
  for (let d = -21; d <= 13; d += 1) {
    const date = jour(d, debutSemaine);
    const js = jourSemaine(date);
    for (const [uid, [repos, segments]] of Object.entries(RYTHMES)) {
      if (repos.includes(js)) continue;
      segments.forEach(([debut, fin], i) => {
        k += 1;
        const passe = date < aujourdhui() || (date === aujourdhui() && fin <= maintenant && fin > debut);
        const commence = date < aujourdhui() || (date === aujourdhui() && debut <= maintenant);
        const ecart = Math.round((alea() - 0.6) * 10);
        const decale = (hhmm, min) => { const [h, m] = hhmm.split(':').map(Number); const t = Math.max(0, h * 60 + m + min); return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}:00`; };
        shifts.push({
          id: `sh-${k}`,
          etablissement_id: ETAB,
          user_id: uid,
          date,
          debut: debut + ':00',
          fin: fin + ':00',
          pause: segments.length === 1 && fin > debut ? 30 : 0,
          poste: null,
          type_shift: segments.length > 1 ? (i === 0 ? 'midi' : 'soir') : 'simple',
          statut: 'confirmé',
          pointage_debut: commence ? decale(debut, ecart) : null,
          pointage_fin: passe ? decale(fin, Math.round(alea() * 12)) : null,
          note: null,
          created_at: instant(jour(-28), '09:00'),
          updated_at: instant(jour(-28), '09:00'),
          pointage_fin_auto: false,
        });
      });
    }
  }
  return shifts;
}

export const ABSENCES = [
  { id: 'abs-1', etablissement_id: ETAB, user_id: 'demo-serv-2', motif: 'conge', date_debut: jour(4), date_fin: jour(8), statut: 'acceptee', created_by: 'demo-patron', created_at: instant(jour(-10), '10:00'), updated_at: instant(jour(-10), '10:00') },
  { id: 'abs-2', etablissement_id: ETAB, user_id: 'demo-cuis-2', motif: 'maladie', date_debut: jour(-9), date_fin: jour(-8), statut: 'acceptee', created_by: 'demo-chef', created_at: instant(jour(-9), '07:40'), updated_at: instant(jour(-9), '07:40') },
  { id: 'abs-3', etablissement_id: ETAB, user_id: 'demo-cuis-3', motif: 'formation', date_debut: jour(11), date_fin: jour(11), statut: 'acceptee', created_by: 'demo-chef', created_at: instant(jour(-3), '10:00'), updated_at: instant(jour(-3), '10:00') },
  // Demande de congé en attente : la colonne « À traiter » du planning (lot L5).
  { id: 'abs-4', etablissement_id: ETAB, user_id: 'demo-serveur', motif: 'vacances', date_debut: jour(9), date_fin: jour(10), statut: 'demande', created_by: 'demo-serveur', created_at: instant(jour(-1), '16:20'), updated_at: instant(jour(-1), '16:20') },
];

export const CONTRATS_TRAVAIL = EQUIPE.filter((u) => u.role !== 'patron').map((u, i) => ({
  id: `ct-${i + 1}`,
  etablissement_id: ETAB,
  profile_id: u.id,
  taux: u.id === 'demo-serv-3' ? 60 : u.id === 'demo-hote' ? 80 : 100,
  heures_semaine: 42,
  vacances_jours: 25,
  debut: '2026-03-01',
  fin: null,
  note: null,
  created_at: '2026-03-01T08:00:00Z',
  updated_at: '2026-03-01T08:00:00Z',
  created_by: 'demo-patron',
}));

export const PLANNING_MODELES = [
  { id: '00000000-0000-4000-8000-0000000000d1', etablissement_id: ETAB, nom: 'Coupure midi et soir', segments: [{ debut: '09:00', fin: '14:30' }, { debut: '17:30', fin: '22:30' }], ordre: 0, created_at: '2026-03-01T08:00:00Z', updated_at: '2026-03-01T08:00:00Z' },
  { id: '00000000-0000-4000-8000-0000000000d2', etablissement_id: ETAB, nom: 'Journée continue', segments: [{ debut: '07:30', fin: '15:30' }], ordre: 1, created_at: '2026-03-01T08:00:00Z', updated_at: '2026-03-01T08:00:00Z' },
];

// ── HACCP ────────────────────────────────────────────────────────────────────

export const HACCP_ZONES = [
  { id: 'hz-cf1', etablissement_id: ETAB, nom: 'Chambre froide positive', type: 'froid', cible: 3, min_val: 0, max_val: 4, unite: '°C', icone: '❄', actif: true },
  { id: 'hz-cf2', etablissement_id: ETAB, nom: 'Frigo garde-manger', type: 'froid', cible: 3, min_val: 0, max_val: 4, unite: '°C', icone: '❄', actif: true },
  { id: 'hz-poisson', etablissement_id: ETAB, nom: 'Frigo poisson', type: 'froid', cible: 1, min_val: 0, max_val: 2, unite: '°C', icone: '❄', actif: true },
  { id: 'hz-congel', etablissement_id: ETAB, nom: 'Congélateur', type: 'congelation', cible: -20, min_val: -25, max_val: -18, unite: '°C', icone: '❄', actif: true },
  { id: 'hz-bain', etablissement_id: ETAB, nom: 'Bain-marie du passe', type: 'chaud', cible: 65, min_val: 63, max_val: 80, unite: '°C', icone: '♨', actif: true },
].map((z) => ({ ...z, created_at: '2026-02-01T08:00:00Z', updated_at: '2026-02-01T08:00:00Z' }));

export const HACCP_CRENEAUX = [
  { id: 'hc-matin', etablissement_id: ETAB, label: 'Ouverture', heure: '08:30:00', actif: true, jours: [2, 3, 4, 5, 6, 7] },
  { id: 'hc-midi', etablissement_id: ETAB, label: 'Avant le service du soir', heure: '17:00:00', actif: true, jours: [2, 3, 4, 5, 6, 7] },
].map((c) => ({ ...c, created_at: '2026-02-01T08:00:00Z', updated_at: '2026-02-01T08:00:00Z' }));

export const HACCP_CTRL_TEMPLATES = [
  { id: 'ht-nettoyage', etablissement_id: ETAB, label: 'Nettoyage des plans de travail', type: 'hygiene', frequence: 'Quotidien', actif: true, description: 'Désinfection après chaque service.' },
  { id: 'ht-huile', etablissement_id: ETAB, label: 'Contrôle de l\'huile de friture', type: 'hygiene', frequence: 'Quotidien', actif: true, description: 'Bandelette, changement au-delà de 24 % de composés polaires.' },
  { id: 'ht-reception', etablissement_id: ETAB, label: 'Réception des marchandises', type: 'reception', frequence: 'Quotidien', actif: true, description: 'Température et intégrité des colis.' },
  { id: 'ht-hottes', etablissement_id: ETAB, label: 'Nettoyage des filtres de hotte', type: 'hygiene', frequence: 'Hebdomadaire', actif: true, description: null },
].map((t) => ({ ...t, created_at: '2026-02-01T08:00:00Z', updated_at: '2026-02-01T08:00:00Z' }));

export function genererHaccp() {
  const alea = graine('haccp-' + aujourdhui());
  const releves = [];
  const controles = [];
  const maintenant = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const operateurs = ['Inès Garnier', 'Julien Lambert', 'Hugo Perret'];
  let k = 0;
  for (let d = -20; d <= 0; d += 1) {
    const date = jour(d);
    if (jourSemaine(date) === 1) continue;
    for (const c of HACCP_CRENEAUX) {
      const heure = c.heure.slice(0, 5);
      if (d === 0 && heure > maintenant) continue;
      for (const z of HACCP_ZONES) {
        k += 1;
        let valeur = z.cible + (alea() - 0.5) * (z.type === 'chaud' ? 3.5 : 1.8);
        // Un écart corrigé, il y a quatre jours, pour la démo.
        if (d === -4 && z.id === 'hz-cf2' && c.id === 'hc-matin') valeur = 6.2;
        valeur = Math.round(valeur * 10) / 10;
        const conforme = valeur >= z.min_val && valeur <= z.max_val;
        releves.push({
          id: `hr-${k}`,
          etablissement_id: ETAB,
          zone_id: z.id,
          date,
          heure: `${heure}:00`,
          valeur,
          operateur: operateurs[(k + d) % operateurs.length],
          conforme,
          commentaire: conforme ? null : 'Porte mal fermée. Corrigé, nouveau relevé à 3,1 °C après 30 minutes.',
          created_at: instant(date, heure),
        });
      }
    }
    for (const t of HACCP_CTRL_TEMPLATES) {
      if (t.frequence === 'Hebdomadaire' && jourSemaine(date) !== 2) continue;
      if (d === 0 && maintenant < '15:00') continue;
      k += 1;
      controles.push({
        id: `hk-${k}`,
        etablissement_id: ETAB,
        template_id: t.id,
        date,
        heure: '15:00:00',
        statut: 'conforme',
        operateur: operateurs[k % operateurs.length],
        notes: null,
        created_at: instant(date, '15:00'),
      });
    }
  }
  return { releves, controles };
}

export const HACCP_TRACABILITE = [
  { id: 'htr-1', etablissement_id: ETAB, date: jour(-1), produit: 'Filet de bœuf suisse, lot 4471', photo_url: null, storage_path: null, operateur: 'Julien Lambert', notes: 'Étiquette fournisseur conservée.', created_at: instant(jour(-1), '09:10') },
  { id: 'htr-2', etablissement_id: ETAB, date: jour(-2), produit: 'Filet de féra, lot L-1127', photo_url: null, storage_path: null, operateur: 'Inès Garnier', notes: null, created_at: instant(jour(-2), '08:50') },
];

export const ETIQUETTES_PERSO = [
  { id: '00000000-0000-4000-8000-0000000000e1', etablissement_id: ETAB, nom: 'Vinaigrette maison', duree_vie_jours: 5, duree_vie_congele_jours: null, duree_vie_decongele_jours: 2, created_by: 'demo-chef', created_at: '2026-09-01T08:00:00Z', updated_at: '2026-09-01T08:00:00Z' },
  { id: '00000000-0000-4000-8000-0000000000e2', etablissement_id: ETAB, nom: 'Bouillon de légumes', duree_vie_jours: 3, duree_vie_congele_jours: 90, duree_vie_decongele_jours: 2, created_by: 'demo-chef', created_at: '2026-09-01T08:00:00Z', updated_at: '2026-09-01T08:00:00Z' },
];

// ── Inventaire, pertes, commande ────────────────────────────────────────────

const ZONES_STOCK = { Viandes: 'Chambre froide', 'Poissons & fruits de mer': 'Chambre froide', 'Fruits & légumes': 'Chambre froide', 'Produits laitiers': 'Chambre froide', 'Crèmerie / fromages': 'Chambre froide', Surgelés: 'Congélateur', Boissons: 'Cave', Alcools: 'Cave' };

function lignesInventaire(alea, avecComptage) {
  return PRODUITS.filter((pr) => pr.categorie !== 'Hygiène / non alimentaire').map((pr, i) => {
    const unite = pr.unite_ref === 'g' ? 'kg' : pr.unite_ref === 'ml' ? 'l' : 'pce';
    const prixUnit = pr.unite_ref === 'pce' ? pr.prix_unitaire : deuxDec(pr.prix_unitaire * 1000);
    const theo = unite === 'pce' ? Math.round(4 + alea() * 30) : Math.round((0.5 + alea() * 8) * 10) / 10;
    const reel = avecComptage ? Math.max(0, Math.round((theo + (alea() - 0.55) * theo * 0.12) * 10) / 10) : null;
    const ecart = reel == null ? null : Math.round((reel - theo) * 10) / 10;
    return {
      id: `l-${i}`,
      produit: pr.nom,
      produitId: pr.id,
      categorie: pr.categorie,
      zone: ZONES_STOCK[pr.categorie] || 'Économat',
      unite,
      prixUnit,
      stockTheo: theo,
      precedent: theo,
      stockReel: reel,
      ecart,
      valeur: reel == null ? 0 : deuxDec(reel * prixUnit),
      ecartValeur: ecart == null ? null : deuxDec(ecart * prixUnit),
      ...(reel != null ? { compteLe: instant(jour(-7), '15:30') } : {}),
    };
  });
}

export function genererInventaires() {
  const alea = graine('inv');
  const passe = lignesInventaire(alea, true);
  const enCours = lignesInventaire(graine('inv2'), false).map((l, i) => (i < 22 ? { ...l, stockReel: l.stockTheo, ecart: 0, valeur: deuxDec(l.stockTheo * l.prixUnit), ecartValeur: 0, compteLe: instant(aujourdhui(), '10:00') } : l));
  const total = (lignes) => deuxDec(lignes.reduce((s, l) => s + (l.valeur || 0), 0));
  return [
    { id: 'inv-mois-1', etablissement_id: ETAB, date: jour(-37), statut: 'validé', valide_par: 'demo-chef', valeur_totale: deuxDec(total(passe) * 0.94), lignes: passe.map((l) => ({ ...l, compteLe: instant(jour(-37), '15:30') })), nom: 'Général', created_at: instant(jour(-37), '14:00'), updated_at: instant(jour(-37), '16:00') },
    { id: 'inv-mois-2', etablissement_id: ETAB, date: jour(-7), statut: 'validé', valide_par: 'demo-chef', valeur_totale: total(passe), lignes: passe, nom: 'Général', created_at: instant(jour(-7), '14:00'), updated_at: instant(jour(-7), '16:00') },
    { id: 'inv-en-cours', etablissement_id: ETAB, date: aujourdhui(), statut: 'en cours', valide_par: null, valeur_totale: total(enCours), lignes: enCours, nom: 'Général', created_at: instant(aujourdhui(), '09:30'), updated_at: instant(aujourdhui(), '10:00') },
  ];
}

export const PERTES = [
  [-1, 'Crème entière 35 %', 'Produits laitiers', 1.5, 'l', 7.2, 'DLC dépassée', 'demo-cuisinier', true],
  [-2, 'Filet de féra du Léman', 'Poissons & fruits de mer', 0.4, 'kg', 56, 'Erreur de préparation', 'demo-cuis-2', true],
  [-3, 'Gratin dauphinois', 'Plats', 6, 'portion', 2.6, 'Surproduction', 'demo-chef', true],
  [-5, 'Mesclun', 'Fruits & légumes', 0.6, 'kg', 18, 'DLC dépassée', 'demo-cuisinier', true],
  [-6, 'Mousse au chocolat noir', 'Desserts', 4, 'portion', 1.9, 'Surproduction', 'demo-cuis-3', true],
  [-8, 'Œufs suisses plein air', 'Produits laitiers', 6, 'pcs', 0.62, 'Casse', 'demo-cuis-4', true],
  [-11, 'Filet de bœuf suisse', 'Viandes', 0.35, 'kg', 68, 'Retour client', 'demo-chef', true],
  [-14, 'Pommes Golden', 'Fruits & légumes', 1.2, 'kg', 3.4, 'DLC dépassée', 'demo-cuis-2', true],
  [0, 'Beurre blanc', 'Sauces', 0.5, 'l', 9, 'Surproduction', 'demo-cuisinier', false],
].map(([d, produit, categorie, quantite, unite, valeur, motif, par, valide], i) => ({
  id: `pe-${i + 1}`,
  etablissement_id: ETAB,
  date: jour(d),
  produit,
  categorie,
  quantite,
  unite,
  valeur_unit: valeur,
  motif,
  declare_par: par,
  valide,
  valide_par: valide ? 'demo-chef' : null,
  commentaire: null,
  created_at: instant(jour(d), '22:15'),
  updated_at: instant(jour(d), '22:15'),
}));

export const COMMANDE_ITEMS = [
  ['boeuf-filet', 2, 'pièce'], ['volaille-supreme', 1, 'carton'], ['fera', 1, 'carton'], ['truite', 1, 'carton'],
  ['courge', 1, 'carton'], ['pomme-de-terre-ferme', 1, 'pièce'], ['champignon', 2, 'carton'], ['mache', 2, 'pièce'],
  ['creme', 6, 'pièce'], ['beurre', 3, 'pièce'], ['raclette', 1, 'pièce'], ['oeuf', 2, 'pièce'],
  ['riz-carnaroli', 1, 'pièce'], ['chocolat', 1, 'pièce'],
].map(([cle, quantite, unite], i) => {
  const pr = PRODUIT[cle];
  return {
    id: `ci-${i + 1}`,
    etablissement_id: ETAB,
    cle: 'p:' + pr.id,
    produit_id: pr.id,
    nom: pr.nom,
    categorie: pr.categorie,
    unite,
    besoin: quantite,
    quantite,
    coche: i < 4,
    source: 'auto',
    ordre: i,
    created_at: instant(aujourdhui(), '08:00'),
    updated_at: instant(aujourdhui(), '08:00'),
  };
});

// ── Mise en place ───────────────────────────────────────────────────────────

const MEP_LISTE_ID = '00000000-0000-4000-8000-0000000000f1';
export const MEP_LISTES = [
  { id: MEP_LISTE_ID, etablissement_id: ETAB, nom: 'Service du soir', date_service: aujourdhui(), created_by: 'demo-chef', created_at: instant(aujourdhui(), '09:00') },
  { id: '00000000-0000-4000-8000-0000000000f2', etablissement_id: ETAB, nom: 'Service du midi', date_service: aujourdhui(), created_by: 'demo-chef', created_at: instant(aujourdhui(), '08:00') },
];

const MEP = [
  ['veloute-courge', 'Velouté de courge', 5, 'l', true, true],
  ['sauce-poivre', 'Sauce au poivre', 1.5, 'l', false, true],
  ['gratin', 'Gratin dauphinois', 2, 'plaques', false, false],
  ['risotto', 'Risotto précuit', 3, 'kg', false, false],
  ['beurre-blanc', 'Beurre blanc', 1, 'l', false, false],
  ['legumes', 'Légumes taillés', 2.5, 'kg', false, true],
  ['mousse-chocolat', 'Mousse au chocolat', 24, 'portions', false, true],
  ['creme-brulee', 'Crèmes brûlées', 12, 'ramequins', false, false],
];
export const MEP_ITEMS = MEP.map(([r, label, quantite, unite, congelable, fait], i) => ({
  id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
  liste_id: MEP_LISTE_ID,
  recette_id: 'r-' + r,
  label,
  quantite,
  unite,
  congelable,
  fait,
  fait_par: fait ? 'demo-cuisinier' : null,
  fait_at: fait ? instant(aujourdhui(), '11:30') : null,
  ordre: i,
  created_at: instant(aujourdhui(), '09:00'),
}));

// ── SOP, kit, documents ─────────────────────────────────────────────────────

export const SOPS = SOP_TEMPLATES.slice(0, 5).map((t, i) => ({
  id: `sop-${i + 1}`,
  etablissement_id: ETAB,
  titre: t.titre,
  description: t.description || null,
  categorie: t.categorie,
  frequence: t.frequence,
  sections: t.sections,
  tags: t.tags || [],
  is_template: false,
  source_template: null,
  ordre: i,
  actif: true,
  // Lot 2 : la première procédure revient à l'ouverture, pour la cuisine.
  roles_designes: i === 0 ? ['resp_cuisine', 'cuisinier'] : [],
  rappel_actif: i === 0,
  rappel_moment: i === 0 ? 'ouverture' : null,
  rappel_heure: null,
  rappel_jours: null,
  created_at: '2026-03-01T08:00:00Z',
  updated_at: '2026-03-01T08:00:00Z',
}));

// Lot 5 : les types sont ceux de la base ('folder', 'file' : l'écran ne
// reconnaissait pas 'dossier' et 'fichier') ; le dossier HACCP porte le nom
// qu'ouvre le module HACCP ; les contrats sont réservés à la direction
// (roles_visibles vide).
export const DOCUMENTS = [
  { id: 'doc-dossier-hygiene', parent_id: null, type: 'folder', nom: 'HACCP', storage_path: null, mime_type: null, taille: null },
  { id: 'doc-dossier-rh', parent_id: null, type: 'folder', nom: 'Équipe', storage_path: null, mime_type: null, taille: null },
  { id: 'doc-dossier-fournisseurs', parent_id: null, type: 'folder', nom: 'Fournisseurs', storage_path: null, mime_type: null, taille: null },
  { id: 'doc-dossier-contrats', parent_id: null, type: 'folder', nom: 'Contrats', storage_path: null, mime_type: null, taille: null, roles_visibles: [] },
  { id: 'doc-plan-nettoyage', parent_id: 'doc-dossier-hygiene', type: 'file', nom: 'Plan de nettoyage.pdf', storage_path: 'demo/plan-nettoyage.pdf', mime_type: 'application/pdf', taille: 184320 },
  { id: 'doc-autocontrole', parent_id: 'doc-dossier-hygiene', type: 'file', nom: 'Concept d\'autocontrôle.pdf', storage_path: 'demo/autocontrole.pdf', mime_type: 'application/pdf', taille: 402112 },
  { id: 'doc-reglement', parent_id: 'doc-dossier-rh', type: 'file', nom: 'Règlement du personnel.pdf', storage_path: 'demo/reglement.pdf', mime_type: 'application/pdf', taille: 251904 },
  { id: 'doc-conditions', parent_id: 'doc-dossier-fournisseurs', type: 'file', nom: 'Conditions Primeurs du Rhône.pdf', storage_path: 'demo/conditions.pdf', mime_type: 'application/pdf', taille: 96256 },
  { id: 'doc-contrat-ines', parent_id: 'doc-dossier-contrats', type: 'file', nom: 'Contrat Inès Garnier.pdf', storage_path: 'demo/contrat-ines.pdf', mime_type: 'application/pdf', taille: 128000 },
].map((d) => ({ roles_visibles: null, ...d, etablissement_id: ETAB, uploaded_by: 'demo-patron', description: null, created_at: '2026-04-01T08:00:00Z', updated_at: '2026-04-01T08:00:00Z' }));

// ── Messages ────────────────────────────────────────────────────────────────

export function genererMessages() {
  const m = (de, a, texte, d, h, lu = true) => ({ de, a, texte, d, h, lu });
  const fils = [
    m('demo-chef', 'demo-patron', 'Bonjour Claire, le fournisseur de bœuf augmente ses prix de 5 % le mois prochain.', -2, '09:12'),
    m('demo-patron', 'demo-chef', 'Merci Julien. On regarde ensemble le chiffrage de la carte jeudi ?', -2, '09:40'),
    m('demo-chef', 'demo-patron', 'Parfait, je prépare les fiches.', -2, '09:42'),
    m('demo-serveur', 'demo-patron', 'Le groupe de jeudi confirme 18 personnes, deux végétariens.', -1, '16:05'),
    m('demo-patron', 'demo-serveur', 'Super, je préviens la cuisine.', -1, '16:20'),
    m('demo-chef', 'demo-cuisinier', 'Inès, pense à lancer le fond brun demain matin.', -1, '22:30'),
    m('demo-cuisinier', 'demo-chef', 'C\'est noté, je m\'en occupe à 8 h.', 0, '07:55'),
    m('demo-patron', 'demo-chef', 'Belle soirée hier, bravo à toute la brigade.', 0, '09:05', false),
    m('demo-chef', 'demo-serveur', 'Ce soir, le tartare de truite est limité à 12 portions.', 0, '10:15', false),
    m('demo-patron', 'demo-cuisinier', 'Merci pour le relevé HACCP de ce matin.', 0, '10:20', false),
  ];
  return fils.map((x, i) => ({
    id: `00000000-0000-4000-8000-0000000002${String(i).padStart(2, '0')}`,
    sender_id: x.de,
    recipient_id: x.a,
    message: x.texte,
    created_at: instant(jour(x.d), x.h),
    read_at: x.lu ? instant(jour(x.d), x.h) : null,
    audio_path: null,
    audio_duree_s: null,
  }));
}

export const PROFILE_CONTACTS = EQUIPE.map((u, i) => ({ user_id: u.id, tel: `079 000 ${String(40 + i).padStart(2, '0')} 00`, updated_at: '2026-03-01T08:00:00Z' }));

// ── Points et boutique ──────────────────────────────────────────────────────

export const POINTS_REGLAGES = [{
  etablissement_id: ETAB,
  actif: true,
  roles_participants: ['resp_cuisine', 'cuisinier', 'serveur', 'hote'],
  exclus: [],
  bareme: {},
  updated_at: '2026-10-01T08:00:00Z',
  updated_by: 'demo-patron',
  plafond_jour_total: 40,
  plafond_mois_total: 400,
}];

export const POINTS_CADEAUX = [
  ['Un repas pour deux à la brasserie', 'Entrée, plat et dessert, boissons comprises.', 400],
  ['Une demi-journée de congé', 'À poser avec le planning, hors week-end.', 600],
  ['Un bon de librairie de 30 CHF', 'Valable dans les librairies de la ville.', 250],
  ['Un couteau d\'office', 'Lame inox, manche en bois.', 300],
  ['Une bouteille de Cornalin', 'De la Cave des Coteaux.', 150],
  ['Une place de cinéma', 'Séance au choix.', 120],
].map(([nom, description, cout], i) => ({
  id: `00000000-0000-4000-8000-0000000003${String(i).padStart(2, '0')}`,
  etablissement_id: ETAB,
  nom,
  description,
  cout,
  stock: i === 1 ? 2 : null,
  actif: true,
  ordre: i,
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T08:00:00Z',
  categorie: 'commun',
  photo_url: null,
  photo_credit: null,
  photo_source: null,
}));

export function genererPointsMouvements() {
  const alea = graine('points');
  const actions = [['haccp_releve', 'Relevé HACCP', 2], ['pointage_heure', 'Arrivée à l\'heure', 1], ['perte_declaree', 'Perte déclarée', 2], ['mep_faite', 'Mise en place cochée', 1], ['inventaire_ligne', 'Inventaire compté', 3]];
  const gens = EQUIPE.filter((u) => u.role !== 'patron');
  const out = [];
  let k = 0;
  for (let d = -25; d <= 0; d += 1) {
    for (const u of gens) {
      if (alea() < 0.35) continue;
      const [action, libelle, pts] = actions[Math.floor(alea() * actions.length)];
      k += 1;
      out.push({
        id: `00000000-0000-4000-8000-${String(10000 + k).padStart(12, '0')}`,
        etablissement_id: ETAB,
        user_id: u.id,
        points: pts * (1 + Math.floor(alea() * 3)),
        action,
        source_table: null,
        source_id: null,
        sens: 'credit',
        libelle,
        created_at: instant(jour(d), '15:00'),
        created_by: null,
        evenement: null,
      });
    }
  }
  return out;
}

// ── Comptabilité ────────────────────────────────────────────────────────────

export const COMPTA_REGLAGES = [{ etablissement_id: ETAB, methode_tva: 'effective', taux_tdfn: null, charges_sociales_pct: 16, cout_horaire_moyen: 32, updated_by: 'demo-patron', updated_at: '2026-03-01T08:00:00Z', seuil_hausse_prix_pct: 5, delai_paiement_jours: 30, categories_charges: [] }];

export const CHARGES_FIXES = [
  ['Loyer', 'loyer', 6500, 0, 'Gérance des Mélèzes'],
  ['Électricité et gaz', 'energie', 1450, 8.1, 'Services industriels'],
  ['Assurances', 'assurance', 620, 0, 'Assurance commerce'],
  ['Leasing du lave-vaisselle', 'leasing', 280, 8.1, 'Hygiène Pro'],
  ['Logiciels et abonnements', 'autre', 190, 8.1, null],
].map(([libelle, categorie, montant, tva, fournisseur], i) => ({
  id: `chf-${i + 1}`, etablissement_id: ETAB, libelle, categorie, montant, tva_taux: tva, periodicite: 'mensuelle', jour_echeance: 1,
  debut: '2026-01-01', fin: null, fournisseur, note: null, created_by: 'demo-patron', created_at: '2026-01-05T08:00:00Z', updated_at: '2026-01-05T08:00:00Z',
}));

export function genererAchats() {
  const alea = graine('achats');
  const docs = [];
  const fournisseurs = [['f-boucherie', 'Boucherie des Alpes', 1400], ['f-primeurs', 'Primeurs du Rhône', 620], ['f-laiterie', 'Laiterie du Vallon', 540], ['f-epicerie', 'Épicerie fine Martin', 380], ['f-pecherie', 'Pêcherie du Léman', 760], ['f-cave', 'Cave des Coteaux', 980]];
  let k = 0;
  for (let d = -45; d <= -1; d += 3) {
    const [fid, nom, base] = fournisseurs[k % fournisseurs.length];
    k += 1;
    const ht = deuxDec(base * (0.7 + alea() * 0.6));
    const taux = fid === 'f-cave' ? 8.1 : 2.6;
    const regle = d < -20;
    docs.push({
      id: `ach-${k}`,
      etablissement_id: ETAB,
      perimetre: 'Général',
      type_document: 'facture',
      fournisseur_nom: nom,
      fournisseur_id: fid,
      numero: `F-${2026}${String(400 + k)}`,
      date_document: jour(d),
      total_ht: ht,
      lignes: [],
      exclu: false,
      source: 'manuel',
      nom_fichier: null,
      created_at: instant(jour(d), '11:00'),
      created_by: 'demo-chef',
      updated_at: instant(jour(d), '11:00'),
      total_ttc: deuxDec(ht * (1 + taux / 100)),
      date_echeance: jour(d + 30),
      regle_le: regle ? jour(d + 20) : null,
      regle_mode: regle ? 'virement' : null,
      regle_note: null,
      tva_taux: taux,
      montant_tva: deuxDec(ht * taux / 100),
    });
  }
  return docs;
}

export function genererVentesJour() {
  const alea = graine('ventes');
  const out = [];
  for (let d = -60; d <= -1; d += 1) {
    const date = jour(d);
    const js = jourSemaine(date);
    if (js === 1) continue;
    const base = js === 5 || js === 6 ? 6200 : js === 0 ? 4100 : 3500;
    out.push({ id: `vj-${d}`, etablissement_id: ETAB, jour: date, taux: 8.1, montant_ttc: deuxDec(base * (0.85 + alea() * 0.3)), source: 'caisse', note: null, created_by: 'demo-patron', created_at: instant(date, '23:30'), updated_at: instant(date, '23:30') });
  }
  return out;
}

export const SALAIRES_ESTIMES = EQUIPE.filter((u) => u.role !== 'patron').map((u, i) => ({
  id: `sal-${i + 1}`, etablissement_id: ETAB, profile_id: u.id, mode: 'mensuel',
  montant: u.role === 'resp_cuisine' ? 6200 : u.role === 'cuisinier' ? 4600 : 4300, treizieme: true,
  debut: '2026-03-01', fin: null, note: null, created_by: 'demo-patron', created_at: '2026-03-01T08:00:00Z', updated_at: '2026-03-01T08:00:00Z',
}));

// Fiches dont la démo garde la trace dans le journal d'activité.
// Lot 5 (plan 15) : sept modifications de suite du même inventaire, pour la
// ligne regroupée « 7 modifications », et des champs changés sur les
// recettes et produits. La vue journal_activite_semaine du front (semaine en
// cours) lit les mêmes lignes (donnees/index.js).
export function genererJournal() {
  const inventaire = ['08:12', '08:15', '08:20', '08:24', '08:31', '08:36', '08:40']
    .map((h) => ['demo-chef', 'Julien Lambert', 'resp_cuisine', 'inventaires', 'UPDATE', 'Général', 0, h, ['lignes', 'updated_at']]);
  const lignes = [
    ['demo-chef', 'Julien Lambert', 'resp_cuisine', 'recettes', 'UPDATE', 'Sauce au poivre', -1, '15:20', ['etapes', 'ingredients', 'updated_at']],
    ['demo-cuisinier', 'Inès Garnier', 'cuisinier', 'haccp', 'INSERT', 'Relevé Chambre froide positive', 0, '08:50', null],
    ['demo-patron', 'Claire Morel', 'patron', 'planning', 'UPDATE', 'Horaire de Lucas Meier', -1, '11:02', null],
    ['demo-hote', 'Nina Rossi', 'hote', 'reservations', 'INSERT', 'Réservation Bernard Élise', 0, '10:12', null],
    ['demo-chef', 'Julien Lambert', 'resp_cuisine', 'pertes', 'UPDATE', 'Perte validée : Crème entière 35 %', 0, '09:15', ['valide', 'valide_par']],
    ...inventaire,
    ['demo-patron', 'Claire Morel', 'patron', 'produits', 'UPDATE', 'Beurre de cuisine 82 %', 0, '11:40', ['prix_unitaire', 'fournisseur_id']],
    ['demo-patron', 'Claire Morel', 'patron', 'recettes', 'INSERT', 'Tarte fine aux pommes', 0, '14:05', null],
    ['demo-chef', 'Julien Lambert', 'resp_cuisine', 'produits', 'DELETE', 'Crème fraîche 25 % (ancien format)', 0, '16:22', null],
  ];
  return lignes.map(([id, nom, role, module, op, libelle, d, h, colonnes], i) => ({
    id: `00000000-0000-4000-8000-0000000004${String(i).padStart(2, '0')}`,
    created_at: instant(jour(d), h), etablissement_id: ETAB, acteur_id: id, acteur_nom: nom, acteur_role: role,
    module, operation: op, ligne_id: null, libelle, colonnes_modifiees: colonnes, avant: null, apres: null,
  }));
}

export const RECETTES_POUR_MEP = RECETTES;
