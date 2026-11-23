// Données de démonstration : repères communs (établissement, équipe, dates).
// Tout est fictif : aucune personne ni aucun client réel.

export const ETAB = 'etab-demo';

export const ETABLISSEMENT = {
  id: ETAB,
  nom: 'Brasserie Démo',
  // Hôtel-Restaurant (D4, lot 6a) : la carte « Aujourd'hui à l'hôtel » du tableau
  // de bord ne s'affiche que pour un établissement de type hôtel.
  type: 'Hôtel-Restaurant',
  adresse: 'Place des Mélèzes 1, 1950 Sion',
  tel: '027 000 00 00',
  email: 'contact@brasserie-demo.ch',
  couleur: '#003042',
  actif: true,
  notes: 'Établissement de démonstration, données fictives.',
  ccnt_heures_semaine: 42,
  logo_url: null,
  timezone: 'Europe/Zurich',
  modules_actifs: [
    'planning', 'messages', 'comptabilite', 'recettes', 'inventaire', 'pertes', 'haccp', 'sop',
    'fiches_salle', 'documents', 'catalogue', 'previsions', 'caisse', 'groupes', 'commande', 'mep',
    'statistiques', 'kds', 'pos',
    // Branche Hôtel et Spa (D4, lot 6a) : modules à activer, cochés ici.
    'spa', 'hebergement', 'etages', 'demandes', 'activites', 'passations', 'repas', 'technique',
  ],
  created_at: '2026-01-05T08:00:00Z',
  updated_at: '2026-11-01T08:00:00Z',
};

// Une personne par rôle du sélecteur, puis le reste de la brigade.
const p = (id, prenom, nom, role, poste) => ({
  id,
  email: `${prenom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${nom.toLowerCase()}@brasserie-demo.ch`,
  prenom,
  nom,
  avatar: (prenom[0] + nom[0]).toUpperCase(),
  role,
  poste,
  etablissement_ids: [ETAB],
  actif: true,
  created_at: '2026-01-05T08:00:00Z',
  updated_at: '2026-11-01T08:00:00Z',
});

export const EQUIPE = [
  p('demo-patron', 'Claire', 'Morel', 'patron', 'Direction'),
  p('demo-chef', 'Julien', 'Lambert', 'resp_cuisine', 'Chef de cuisine'),
  p('demo-cuisinier', 'Inès', 'Garnier', 'cuisinier', 'Cheffe de partie'),
  p('demo-serveur', 'Sofia', 'Ribeiro', 'serveur', 'Cheffe de rang'),
  p('demo-cuis-2', 'Hugo', 'Perret', 'cuisinier', 'Commis'),
  p('demo-cuis-3', 'Anna', 'Keller', 'cuisinier', 'Pâtissière'),
  p('demo-cuis-4', 'Tom', 'Durand', 'cuisinier', 'Plonge'),
  p('demo-serv-2', 'Lucas', 'Meier', 'serveur', 'Serveur'),
  p('demo-serv-3', 'Léa', 'Fontaine', 'serveur', 'Barmaid'),
  p('demo-hote', 'Nina', 'Rossi', 'hote', 'Accueil'),
  p('demo-spa', 'Maya', 'Lehmann', 'praticien_spa', 'Praticienne spa'),
];

export const ROLES_DEMO = [
  { role: 'patron', libelle: 'Patron', userId: 'demo-patron' },
  { role: 'resp_cuisine', libelle: 'Responsable cuisine', userId: 'demo-chef' },
  { role: 'cuisinier', libelle: 'Cuisinier', userId: 'demo-cuisinier' },
  { role: 'serveur', libelle: 'Serveur', userId: 'demo-serveur' },
  // Lot 6a : l'accueil voit l'hôtel et le spa, la praticienne voit le spa.
  { role: 'hote', libelle: 'Réception', userId: 'demo-hote' },
  { role: 'praticien_spa', libelle: 'Praticienne spa', userId: 'demo-spa' },
];

// ── Dates ────────────────────────────────────────────────────────────────────
// Tout est posé autour d'aujourd'hui (fuseau de Zurich), pour que la démo
// montre toujours une semaine en cours, un service ce soir et un historique.

const fmtJour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' });

export function aujourdhui() {
  return fmtJour.format(new Date());
}

export function jour(decalage = 0, depuis = aujourdhui()) {
  const d = new Date(depuis + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
}

// Décalage de Zurich (UTC+1 en hiver, UTC+2 en été) pour une date donnée.
function decalageZurich(isoJour) {
  const d = new Date(isoJour + 'T12:00:00Z');
  const heure = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', hour12: false }).format(d));
  return heure - 12;
}

// Horodatage UTC d'une heure de Zurich : instant('2026-11-19', '18:30').
export function instant(isoJour, hhmm = '12:00') {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${isoJour}T00:00:00Z`);
  d.setUTCHours(h - decalageZurich(isoJour), m, 0, 0);
  return d.toISOString();
}

export function jourSemaine(isoJour) {
  return new Date(isoJour + 'T12:00:00Z').getUTCDay(); // 0 = dimanche
}

// Lundi de la semaine d'une date.
export function lundi(isoJour = aujourdhui()) {
  const js = jourSemaine(isoJour);
  return jour(js === 0 ? -6 : 1 - js, isoJour);
}

// Générateur pseudo-aléatoire stable : la même démo à chaque ouverture du jour.
export function graine(texte) {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i += 1) { h ^= texte.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const arrondi = (n, pas = 0.05) => Math.round(n / pas) * pas;
export const deuxDec = (n) => Math.round(n * 100) / 100;
