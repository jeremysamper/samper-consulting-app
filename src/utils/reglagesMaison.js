// ─────────────────────────────────────────────────────────────────────────────
// Réglages de la maison (table reglages_maison, 18.11.2026) : la partie pure.
// Valeurs par défaut, lecture prudente d'une ligne et fermetures. Sans React ni
// base : le hook (hooks/useReglagesMaison.js), les modules et les tests
// l'importent. L'évaluateur d'alertes en garde une copie en TypeScript
// (supabase/functions/alerts-evaluator/helpers/fermetures.ts), testée par les
// mêmes cas.
//
// Une ligne absente, un bloc vide ou une valeur illisible valent les défauts :
// un réglage jamais touché ne change rien à l'app d'avant.
// ─────────────────────────────────────────────────────────────────────────────

export const SERVICES = ['brunch', 'midi', 'soir'];
export const ARRONDIS = [0, 5, 15];

export const DEFAUTS = {
  fermetures: { joursFermes: [], servicesFermes: {}, periodes: [] },
  // Repos quotidien de 11 h et pauses de la LTr (art. 15 et 15a) ; 50 h par
  // semaine au plus (LTr art. 9, hôtellerie et restauration) ; deux jours de
  // repos par semaine (CCNT). La journée maximale n'est pas contrôlée par
  // défaut.
  tempsTravail: { actif: true, reposMinH: 11, pausesLoi: true, journeeMaxH: null, semaineMaxH: 50, joursReposSemaine: 2 },
  // Aucun arrondi et l'arrivée comptée dès le pointage : le calcul d'avant.
  pointage: { arrondiMin: 0, avance: 'pointee' },
  objectifs: { matierePct: null, personnelPct: null, caMensuelHt: null },
};

const estObjet = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const nombre = (v, min, max) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normaliserFermetures(brut) {
  const b = estObjet(brut) ? brut : {};
  const joursFermes = [...new Set((Array.isArray(b.jours_fermes) ? b.jours_fermes : [])
    .map(Number).filter((j) => Number.isInteger(j) && j >= 1 && j <= 7))].sort();
  const servicesFermes = {};
  if (estObjet(b.services_fermes)) {
    Object.entries(b.services_fermes).forEach(([jour, liste]) => {
      const j = Number(jour);
      if (!Number.isInteger(j) || j < 1 || j > 7 || !Array.isArray(liste)) return;
      const services = SERVICES.filter((s) => liste.includes(s));
      if (services.length) servicesFermes[String(j)] = services;
    });
  }
  const periodes = (Array.isArray(b.periodes) ? b.periodes : [])
    .filter((p) => estObjet(p) && DATE.test(p.du || '') && DATE.test(p.au || '') && p.du <= p.au)
    .map((p) => ({ du: p.du, au: p.au, motif: typeof p.motif === 'string' ? p.motif.slice(0, 80) : '' }))
    .sort((a, b2) => a.du.localeCompare(b2.du));
  return { joursFermes, servicesFermes, periodes };
}

export function normaliserTempsTravail(brut) {
  const b = estObjet(brut) ? brut : {};
  const d = DEFAUTS.tempsTravail;
  return {
    actif: b.actif === false ? false : d.actif,
    reposMinH: nombre(b.repos_min_h, 8, 14) ?? d.reposMinH,
    pausesLoi: b.pauses_loi === false ? false : d.pausesLoi,
    journeeMaxH: b.journee_max_h == null ? d.journeeMaxH : nombre(b.journee_max_h, 6, 14),
    semaineMaxH: b.semaine_max_h === null ? null : (nombre(b.semaine_max_h, 30, 60) ?? d.semaineMaxH),
    joursReposSemaine: b.jours_repos_semaine === 0 ? 0 : (nombre(b.jours_repos_semaine, 1, 2) ?? d.joursReposSemaine),
  };
}

export function normaliserPointage(brut) {
  const b = estObjet(brut) ? brut : {};
  return {
    arrondiMin: ARRONDIS.includes(Number(b.arrondi_min)) ? Number(b.arrondi_min) : DEFAUTS.pointage.arrondiMin,
    avance: b.avance === 'prevue' ? 'prevue' : DEFAUTS.pointage.avance,
  };
}

export function normaliserObjectifs(brut) {
  const b = estObjet(brut) ? brut : {};
  return {
    matierePct: nombre(b.matiere_pct, 1, 99),
    personnelPct: nombre(b.personnel_pct, 1, 99),
    caMensuelHt: nombre(b.ca_mensuel_ht, 1, 100000000),
  };
}

// Une ligne de reglages_maison (ou rien) en réglages lisibles par l'app.
export function normaliserLigne(ligne) {
  const l = estObjet(ligne) ? ligne : {};
  return {
    fermetures: normaliserFermetures(l.fermetures),
    tempsTravail: normaliserTempsTravail(l.temps_travail),
    pointage: normaliserPointage(l.pointage),
    objectifs: normaliserObjectifs(l.objectifs),
  };
}

// Les réglages lisibles d'un bloc, rendus à la forme de la base (snake_case),
// pour l'écriture.
export const versBase = {
  fermetures: (f) => ({ jours_fermes: f.joursFermes, services_fermes: f.servicesFermes, periodes: f.periodes }),
  tempsTravail: (t) => ({
    actif: t.actif, repos_min_h: t.reposMinH, pauses_loi: t.pausesLoi,
    journee_max_h: t.journeeMaxH, semaine_max_h: t.semaineMaxH, jours_repos_semaine: t.joursReposSemaine,
  }),
  pointage: (p) => ({ arrondi_min: p.arrondiMin, avance: p.avance }),
  objectifs: (o) => ({ matiere_pct: o.matierePct, personnel_pct: o.personnelPct, ca_mensuel_ht: o.caMensuelHt }),
};
export const COLONNES = { fermetures: 'fermetures', tempsTravail: 'temps_travail', pointage: 'pointage', objectifs: 'objectifs' };

// Règles du pointage retenues par établissement, posées par useReglagesMaison
// à chaque lecture et lues par heuresPointees (modules/planning/pointageRegles.js).
// Un établissement jamais lu : les défauts, soit le calcul d'avant.
const reglesPointage = new Map();
export function retenirReglesPointage(etabId, regles) {
  if (etabId) reglesPointage.set(etabId, regles);
}
export const reglesPointagePour = (etabId) => (etabId && reglesPointage.get(etabId)) || DEFAUTS.pointage;

// Jour ISO d'une date « AAAA-MM-JJ » (1 = lundi … 7 = dimanche), compté en UTC :
// aucune heure locale, un passage d'heure ne décale rien.
export function jourIsoDe(dateISO) {
  const [y, m, d] = String(dateISO).split('-').map(Number);
  const j = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return j === 0 ? 7 : j;
}

// La période de fermeture qui couvre ce jour, ou null.
export const periodeDe = (fermetures, dateISO) => (fermetures?.periodes || []).find((p) => p.du <= dateISO && dateISO <= p.au) || null;

// La maison est-elle fermée ce jour-là (jour fermé de la semaine ou période
// datée) ? Avec un service : fermée aussi quand ce service est fermé ce jour
// de la semaine.
export function maisonFermee(fermetures, dateISO, service = null) {
  if (!fermetures || !DATE.test(dateISO || '')) return false;
  const jour = jourIsoDe(dateISO);
  if ((fermetures.joursFermes || []).includes(jour)) return true;
  if (periodeDe(fermetures, dateISO)) return true;
  if (service && (fermetures.servicesFermes?.[String(jour)] || []).includes(service)) return true;
  return false;
}
