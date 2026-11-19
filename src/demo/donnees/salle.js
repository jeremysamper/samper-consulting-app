// Salle de démonstration : plan, réservations des jours autour d'aujourd'hui,
// clients fictifs, groupes et prévisions de couverts.
import { ETAB, aujourdhui, jour, jourSemaine, instant, graine } from './base.js';

export const SALLES = [
  { id: 'salle-principale', etablissement_id: ETAB, nom: 'Salle', ordre: 0, actif: true, created_at: '2026-02-01T08:00:00Z', updated_at: '2026-02-01T08:00:00Z' },
  { id: 'salle-terrasse', etablissement_id: ETAB, nom: 'Véranda', ordre: 1, actif: true, created_at: '2026-02-01T08:00:00Z', updated_at: '2026-02-01T08:00:00Z' },
];

const table = (id, nom, places, forme, x, y, salle = 'salle-principale', zone = null) => ({
  id: 'tb-' + id,
  etablissement_id: ETAB,
  nom,
  nb_places: places,
  forme,
  pos_x: x,
  pos_y: y,
  largeur: forme === 'rectangle' ? (places >= 6 ? 180 : 120) : (places >= 4 ? 100 : 80),
  hauteur: forme === 'rectangle' ? 80 : (places >= 4 ? 100 : 80),
  zone,
  actif: true,
  salle_id: salle,
  created_at: '2026-02-01T08:00:00Z',
  updated_at: '2026-02-01T08:00:00Z',
});

export const SALLE_TABLES = [
  table('1', '1', 2, 'ronde', 80, 90),
  table('2', '2', 2, 'ronde', 220, 90),
  table('3', '3', 4, 'ronde', 360, 80),
  table('4', '4', 4, 'ronde', 500, 80),
  table('5', '5', 4, 'rectangle', 80, 260),
  table('6', '6', 4, 'rectangle', 260, 260),
  table('7', '7', 6, 'rectangle', 440, 250),
  table('8', '8', 2, 'ronde', 660, 90),
  table('9', '9', 8, 'rectangle', 640, 250),
  table('10', '10', 4, 'ronde', 120, 420),
  table('11', '11', 4, 'ronde', 280, 420),
  table('12', '12', 2, 'ronde', 440, 430),
  table('21', '21', 4, 'ronde', 80, 90, 'salle-terrasse'),
  table('22', '22', 4, 'ronde', 240, 90, 'salle-terrasse'),
  table('23', '23', 6, 'rectangle', 400, 80, 'salle-terrasse'),
  table('24', '24', 2, 'ronde', 80, 240, 'salle-terrasse'),
  table('25', '25', 2, 'ronde', 240, 240, 'salle-terrasse'),
];

export const SALLE_ELEMENTS = [
  { id: 'el-bar', etablissement_id: ETAB, salle_id: 'salle-principale', type: 'bar', libelle: 'Bar', pos_x: 620, pos_y: 420, largeur: 220, hauteur: 60, rotation: 0, created_at: '2026-02-01T08:00:00Z', updated_at: '2026-02-01T08:00:00Z' },
  { id: 'el-porte', etablissement_id: ETAB, salle_id: 'salle-principale', type: 'porte', libelle: null, pos_x: 0, pos_y: 520, largeur: 70, hauteur: 70, rotation: 0, created_at: '2026-02-01T08:00:00Z', updated_at: '2026-02-01T08:00:00Z' },
  { id: 'el-baie', etablissement_id: ETAB, salle_id: 'salle-terrasse', type: 'baie', libelle: null, pos_x: 40, pos_y: 20, largeur: 520, hauteur: 10, rotation: 0, created_at: '2026-02-01T08:00:00Z', updated_at: '2026-02-01T08:00:00Z' },
];

// Clients fictifs (noms courants, coordonnées en domaine .test).
const CLIENTS_BRUTS = [
  ['Martin', 'Paul', 'anniversaire'], ['Bernard', 'Élise', null], ['Dubois', 'Marc', null], ['Thomas', 'Julie', 'vegetarien'],
  ['Robert', 'Sophie', null], ['Richard', 'Antoine', null], ['Petit', 'Camille', 'Gluten'], ['Durand', 'Louis', null],
  ['Leroy', 'Manon', null], ['Moreau', 'Hélène', 'Fruits à coque'], ['Simon', 'Nicolas', null], ['Laurent', 'Chloé', null],
  ['Lefebvre', 'Mathieu', null], ['Michel', 'Sarah', 'vegan'], ['Garcia', 'Daniel', null], ['David', 'Laura', null],
  ['Bertrand', 'Olivier', null], ['Roux', 'Pauline', 'Lactose'], ['Vincent', 'Thierry', null], ['Fournier', 'Marie', null],
  ['Morel', 'Hugo', null], ['Girard', 'Nathalie', null], ['André', 'Kevin', null], ['Mercier', 'Alice', 'Poissons'],
];

export const RESA_CLIENTS = CLIENTS_BRUTS.map(([nom, prenom, note], i) => ({
  id: `cl-${i + 1}`,
  etablissement_id: ETAB,
  prenom,
  nom,
  email: `${prenom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@exemple.test`,
  telephone: `079 000 ${String(10 + i).padStart(2, '0')} ${String(30 + i).padStart(2, '0')}`,
  date_naissance: null,
  allergies: note && /^[A-Z]/.test(note) ? note : null,
  preferences: i % 5 === 0 ? 'Table près de la fenêtre' : null,
  notes: i % 7 === 0 ? 'Habitué, vient souvent le vendredi.' : null,
  consentement_marketing: i % 3 === 0,
  consentement_at: i % 3 === 0 ? '2026-05-10T10:00:00Z' : null,
  consentement_source: i % 3 === 0 ? 'equipe' : null,
  desinscrit_at: null,
  desinscription_token: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  lightspeed_customer_id: null,
  archive: false,
  created_by: 'demo-hote',
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-01T10:00:00Z',
  email_cle: null,
  telephone_cle: null,
}));

// ── Réservations : trois semaines passées, la semaine qui vient ─────────────

export function genererReservations() {
  const alea = graine('resa-' + aujourdhui());
  const reservations = [];
  const tags = [];
  const liens = [];
  const tablesLibres = SALLE_TABLES.filter((t) => t.salle_id === 'salle-principale');
  let k = 0;
  for (let d = -21; d <= 10; d += 1) {
    const date = jour(d);
    const js = jourSemaine(date);
    if (js === 1) continue; // fermé le lundi
    const fort = js === 5 || js === 6;
    for (const service of ['midi', 'soir']) {
      if (service === 'midi' && js === 0) continue;
      const nb = Math.round((fort ? 9 : 5) * (service === 'soir' ? 1.2 : 0.8) * (d > 3 ? 0.6 : 1) + alea() * 3);
      const utilisees = new Set();
      for (let i = 0; i < nb; i += 1) {
        k += 1;
        const cl = RESA_CLIENTS[Math.floor(alea() * RESA_CLIENTS.length)];
        const couverts = [2, 2, 2, 3, 4, 4, 5, 6][Math.floor(alea() * 8)];
        const heures = service === 'midi' ? ['11:45', '12:00', '12:15', '12:30', '12:45', '13:00'] : ['18:30', '19:00', '19:15', '19:30', '20:00', '20:30'];
        const heure = heures[Math.floor(alea() * heures.length)];
        let statut = 'confirme';
        if (d < 0) statut = alea() < 0.06 ? 'no_show' : alea() < 0.05 ? 'annule' : 'parti';
        if (d === 0) {
          const maintenant = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
          if (heure < maintenant) statut = service === 'midi' ? 'parti' : 'arrive';
        }
        if (d > 0 && d <= 3 && i === 0 && service === 'soir') statut = 'demande';
        const id = `resa-${k}`;
        reservations.push({
          id,
          etablissement_id: ETAB,
          date_service: date,
          service,
          heure_arrivee: heure + ':00',
          nb_couverts: couverts,
          nom: `${cl.nom} ${cl.prenom}`,
          telephone: cl.telephone,
          est_groupe: false,
          notes_libres: cl.preferences || null,
          statut,
          created_by: statut === 'demande' ? null : 'demo-hote',
          created_at: instant(jour(Math.min(d, 0) - 3), '10:15'),
          updated_at: instant(jour(Math.min(d, 0) - 3), '10:15'),
          email: cl.email,
          origine: statut === 'demande' ? 'en_ligne' : (alea() < 0.15 ? 'passage' : 'equipe'),
          client_id: cl.id,
          passeport_gourmand: alea() < 0.04,
          groupe_evenement_id: null,
        });
        const client = CLIENTS_BRUTS[Number(cl.id.slice(3)) - 1];
        if (client[2]) {
          const type = /^[A-Z]/.test(client[2]) ? 'allergene' : client[2] === 'anniversaire' ? 'occasion' : 'regime';
          tags.push({ id: `rt-${k}`, reservation_id: id, type_tag: type, valeur: client[2], libre: false, created_at: instant(date, '10:00') });
        }
        if (d >= -1 && d <= 1) {
          const t = tablesLibres.find((tb) => !utilisees.has(tb.id) && tb.nb_places >= couverts);
          if (t) { utilisees.add(t.id); liens.push({ id: `rtb-${k}`, reservation_id: id, table_id: t.id, created_at: instant(date, '10:00') }); }
        }
      }
    }
  }
  return { reservations, tags, liens };
}

// ── Groupes ─────────────────────────────────────────────────────────────────

export const GROUPE_MENUS = [
  {
    id: 'gm-1', etablissement_id: ETAB, type_groupe: 'standard', numero: 1, nom: 'Menu des Mélèzes', prix_pax: 58,
    description: 'Trois plats, servi à partir de 10 personnes.',
    lignes: [{ type: 'entree', texte: 'Velouté de courge, crème de noisette' }, { type: 'plat', texte: 'Suprême de volaille, risotto aux champignons' }, { type: 'dessert', texte: 'Tarte fine aux pommes, glace vanille' }],
    regles: {}, created_at: '2026-09-01T08:00:00Z', updated_at: '2026-09-01T08:00:00Z',
  },
  {
    id: 'gm-2', etablissement_id: ETAB, type_groupe: 'standard', numero: 2, nom: 'Menu valaisan', prix_pax: 49,
    description: 'Le terroir en trois temps.',
    lignes: [{ type: 'entree', texte: 'Terrine de campagne, pickles' }, { type: 'plat', texte: 'Croûte au fromage' }, { type: 'dessert', texte: 'Meringues, double crème de la Gruyère' }],
    regles: {}, created_at: '2026-09-01T08:00:00Z', updated_at: '2026-09-01T08:00:00Z',
  },
];

export function genererGroupes() {
  const evenements = [
    { d: 2, h: '19:00', nom: 'Association des amis du vin', contact: 'Mme Bernard, 079 000 11 22', pax: 18, menu: 1, statut: 'lu', all: ['fruits_coque'], vege: 2 },
    { d: 6, h: '12:00', nom: 'Repas d\'entreprise, Atelier Nord', contact: 'M. Simon, 079 000 33 44', pax: 24, menu: 2, statut: 'a_lire', all: [], vege: 3 },
    { d: 13, h: '19:30', nom: 'Anniversaire 50 ans, famille Roux', contact: 'Mme Roux, 079 000 55 66', pax: 32, menu: 1, statut: 'a_lire', all: ['lactose'], vege: 0 },
    { d: -5, h: '12:00', nom: 'Club de randonnée', contact: 'M. Girard, 079 000 77 88', pax: 14, menu: 2, statut: 'pret', all: [], vege: 1 },
  ];
  return evenements.map((e, i) => ({
    id: `ge-${i + 1}`,
    etablissement_id: ETAB,
    date_evenement: jour(e.d),
    heure: e.h + ':00',
    type_groupe: 'standard',
    menu_numero: e.menu,
    nom: e.nom,
    contact: e.contact,
    nb_pax: e.pax,
    allergenes_ids: e.all,
    allergies_note: e.all.length ? 'Voir la liste nominative jointe.' : null,
    modifications: null,
    commentaires: i === 0 ? 'Apéritif au bar à 18 h 30.' : null,
    statut: e.statut,
    lu_par: e.statut !== 'a_lire' ? 'demo-chef' : null,
    lu_at: e.statut !== 'a_lire' ? instant(jour(e.d - 7), '09:00') : null,
    pret_par: e.statut === 'pret' ? 'demo-chef' : null,
    pret_at: e.statut === 'pret' ? instant(jour(e.d), '11:00') : null,
    modifie_at: null,
    annule: false,
    created_by: 'demo-patron',
    created_at: instant(jour(e.d - 20), '14:00'),
    updated_at: instant(jour(e.d - 20), '14:00'),
    choix: {},
    nb_vegetariens: e.vege,
    nb_enfants: 0,
  }));
}

export const RESERVATION_EN_LIGNE_PARAMETRES = [{
  etablissement_id: ETAB,
  en_ligne_actif: true,
  slug: 'brasserie-demo',
  mode: 'demande',
  horaires: {},
  capacite_service: 60,
  capacite_creneau: null,
  max_couverts: 8,
  delai_min_heures: 2,
  horizon_jours: 60,
  pas_minutes: 15,
  jours_fermes: [],
  message_en_ligne: 'Pour un groupe de plus de 8 personnes, appelez-nous.',
  created_at: '2026-03-01T08:00:00Z',
  updated_at: '2026-03-01T08:00:00Z',
  capacite_demi_heure: null,
  rythme: {},
  capacite_jours: {},
  services_fermes: {},
}];

export function genererPrevisions(reservations) {
  const parJour = {};
  for (const r of reservations) {
    if (r.statut === 'annule') continue;
    const j = (parJour[r.date_service] ||= { midi: 0, soir: 0 });
    j[r.service] += r.nb_couverts;
  }
  return Object.entries(parJour).map(([date, c], i) => ({
    id: `prev-${i}`,
    etablissement_id: ETAB,
    date_service: date,
    couverts_midi: c.midi,
    couverts_soir: c.soir,
    couverts_brunch: 0,
    nb_groupes: 0,
    tags_critiques: [],
    last_updated_at: instant(date, '08:00'),
  }));
}
