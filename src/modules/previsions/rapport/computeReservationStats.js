// ═══════════════════════════════════════════════════════════════════════════
// Statistiques du rapport des réservations. Fonction pure : lignes lues en
// base + période + capacité en entrée, objet de chiffres en sortie. Aucun
// calcul dans les composants, qui ne font qu'afficher.
//
// Définitions (affichées telles quelles dans le rapport) :
//   valides       statut différent de « annulé »
//   honorées      arrivé ou parti
//   non pointées  date passée, encore « attendu » ou « à confirmer »
//   prévues       aujourd'hui ou plus tard, « attendu » ou « à confirmer »
//   comptées      honorées + non pointées + prévues : les couverts du rapport
//   échues        valides moins prévues (honorées, no-show, non pointées)
//   table         une réservation, pas une table physique
// Une division par zéro rend null, jamais NaN : l'écran affiche « n/a ».
// ═══════════════════════════════════════════════════════════════════════════

import { zurichAjouterJours, zurichDateHeure, zurichLundi } from '../../../utils/zurichTime.js';
import { ajouterMois, debutMois, jourIso, listeJours, nbJours } from './periodesRapport.js';

export const CANAUX = [
  { id: 'equipe', label: 'Équipe' },
  { id: 'en_ligne', label: 'En ligne' },
  { id: 'passage', label: 'Passage' },
];

export const SERVICES_LABELS = { midi: 'Midi', soir: 'Soir', brunch: 'Brunch' };

export const TRANCHES_TAILLE = [
  { id: '1', label: '1 couvert', min: 1, max: 1 },
  { id: '2', label: '2 couverts', min: 2, max: 2 },
  { id: '3-4', label: '3 à 4 couverts', min: 3, max: 4 },
  { id: '5-6', label: '5 à 6 couverts', min: 5, max: 6 },
  { id: '7-10', label: '7 à 10 couverts', min: 7, max: 10 },
  { id: '11+', label: '11 couverts et plus', min: 11, max: Infinity },
];

export const TRANCHES_DELAI = [
  { id: 'apres', label: 'Saisie après coup', min: -Infinity, max: -1 },
  { id: '0', label: 'Même jour', min: 0, max: 0 },
  { id: '1', label: '1 jour avant', min: 1, max: 1 },
  { id: '2-3', label: '2 à 3 jours avant', min: 2, max: 3 },
  { id: '4-7', label: '4 à 7 jours avant', min: 4, max: 7 },
  { id: '8-14', label: '8 à 14 jours avant', min: 8, max: 14 },
  { id: '15-30', label: '15 à 30 jours avant', min: 15, max: 30 },
  { id: '30+', label: 'Plus de 30 jours avant', min: 31, max: Infinity },
];

export const TYPES_TAGS = [
  { id: 'occasion', label: 'Occasions' },
  { id: 'allergene', label: 'Allergènes' },
  { id: 'regime', label: 'Régimes' },
];

export const HORIZONS_CARNET = [7, 14, 30];

// Libellés des tags prédéfinis (mêmes que la saisie) ; la valeur en base ne
// change pas.
const LIBELLES_TAGS = { fruits_de_mer: 'fruits de mer', vegetarien: 'végétarien', menu_fixe: 'menu fixe' };
const libelleTag = (v) => LIBELLES_TAGS[v] || String(v || '').replace(/_/g, ' ');

const COMPTEES = new Set(['honoree', 'non_pointee', 'prevue']);
const ACCEPTEES = new Set(['confirme', 'arrive', 'parti', 'no_show']);
const AU_CARNET = new Set(['confirme', 'demande', 'arrive', 'parti']);

export const ratio = (a, b) => (b > 0 ? a / b : null);

// Variation d'un volume en %, null sans base de comparaison.
export const variationPct = (actuel, avant) => (
  actuel === null || avant === null || !(avant > 0) ? null : ((actuel - avant) / avant) * 100
);
// Variation d'un taux en points.
export const variationPts = (actuel, avant) => (
  actuel === null || avant === null ? null : (actuel - avant) * 100
);

const somme = (lignes, f = (r) => r.couverts) => lignes.reduce((s, r) => s + f(r), 0);

function mediane(valeurs) {
  if (!valeurs.length) return null;
  const v = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function classer(r, aujourdhui) {
  if (r.statut === 'annule') return 'annulee';
  if (r.statut === 'arrive' || r.statut === 'parti') return 'honoree';
  if (r.statut === 'no_show') return 'no_show';
  return r.date_service < aujourdhui ? 'non_pointee' : 'prevue';
}

// Brunch à part seulement pour une maison qui en fait (horaires ou données) ;
// sinon il rejoint le midi, comme dans le reste du module.
export function aDuBrunch(lignes, parametres) {
  const horaires = parametres?.horaires || {};
  if (Object.values(horaires).some((h) => h && h.brunch)) return true;
  return (lignes || []).some((r) => r.service === 'brunch');
}

const serviceRapport = (s, avecBrunch) => (s === 'brunch' && !avecBrunch ? 'midi' : s);

// Lignes brutes → lignes de travail, une fois pour toutes.
export function preparerLignes(lignes, aujourdhui, avecBrunch) {
  return (lignes || []).map((r) => {
    const cree = r.created_at ? zurichDateHeure(r.created_at).jour : null;
    const client = r.resa_clients;
    const nomClient = client ? [client.prenom, client.nom].filter(Boolean).join(' ').trim() : '';
    const [h, m] = String(r.heure_arrivee || '').split(':').map(Number);
    return {
      id: r.id,
      date: r.date_service,
      svc: serviceRapport(r.service, avecBrunch),
      minutes: Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null,
      couverts: Math.max(0, Number(r.nb_couverts) || 0),
      statut: r.statut,
      classe: classer(r, aujourdhui),
      canal: CANAUX.some((c) => c.id === r.origine) ? r.origine : 'equipe',
      groupe: Boolean(r.est_groupe),
      passeport: Boolean(r.passeport_gourmand),
      clientId: r.client_id || null,
      clientNom: nomClient || String(r.nom || '').trim() || 'Sans nom',
      tablesIds: [...new Set((r.reservation_tables || []).map((t) => t.table_id).filter(Boolean))],
      tags: (r.reservation_tags || []).filter((t) => t && t.type_tag && t.valeur),
      cree,
      delai: cree ? nbJours(cree, r.date_service) - 1 : null,
    };
  });
}

// ── Ouverture et capacité, d'après les réglages de la réservation en ligne ──
// Horaires par jour ISO (« 3 » = mercredi), fermetures datées : jours fermés
// en entier et services fermés une date donnée, passées comprises.
function servicesBrutsOuverts(date, parametres) {
  if ((parametres.jours_fermes || []).includes(date)) return [];
  const h = parametres.horaires?.[String(jourIso(date))] || {};
  const fermes = parametres.services_fermes?.[date] || [];
  return Object.keys(h).filter((s) => h[s] && !fermes.includes(s));
}

function capaciteService(date, s, parametres) {
  const parJour = parametres.capacite_jours?.[String(jourIso(date))]?.[s];
  const v = Number(parJour ?? parametres.capacite_service);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function ouvertureJour(date, ctx) {
  if (!ctx.aParametres) return null;
  const ouverts = servicesBrutsOuverts(date, ctx.parametres)
    .filter((s) => ctx.service === 'tous' || serviceRapport(s, ctx.avecBrunch) === ctx.service);
  return {
    ouvert: ouverts.length > 0,
    capacite: ouverts.reduce((t, s) => t + capaciteService(date, s, ctx.parametres), 0),
    parService: Object.fromEntries(ouverts.map((s) => [serviceRapport(s, ctx.avecBrunch), capaciteService(date, s, ctx.parametres)])),
  };
}

function capaciteJourService(date, svc, ctx) {
  const o = ouvertureJour(date, ctx);
  return o ? (o.parService[svc] || 0) : null;
}

const dansBornes = (r, b) => r.date >= b.debut && r.date <= b.fin;

function filtrer(lignes, bornes, service) {
  return lignes.filter((r) => dansBornes(r, bornes) && (service === 'tous' || r.svc === service));
}

// ── Chiffres clés d'une période (aussi calculés pour la comparaison) ──────
function chiffresCles(lignes, bornes, ctx) {
  const jours = listeJours(bornes.debut, bornes.fin);
  const comptees = lignes.filter((r) => COMPTEES.has(r.classe));
  const valides = lignes.filter((r) => r.classe !== 'annulee');
  const annulees = lignes.filter((r) => r.classe === 'annulee');
  const noShow = lignes.filter((r) => r.classe === 'no_show');
  const nonPointees = lignes.filter((r) => r.classe === 'non_pointee');
  const honorees = lignes.filter((r) => r.classe === 'honoree');
  const prevues = lignes.filter((r) => r.classe === 'prevue');
  const echues = valides.length - prevues.length;
  const couverts = somme(comptees);

  const joursActivite = new Set(comptees.map((r) => r.date)).size;
  let joursOuverture = null;
  let capacite = null;
  if (ctx.aParametres) {
    joursOuverture = 0;
    capacite = 0;
    jours.forEach((d) => {
      const o = ouvertureJour(d, ctx);
      if (o.ouvert) joursOuverture += 1;
      capacite += o.capacite;
    });
  }
  // Sans réglages, les jours avec au moins une réservation tiennent lieu de
  // jours d'ouverture (et l'écran le dit).
  const joursRef = joursOuverture ?? joursActivite;

  return {
    couverts,
    tables: valides.length,
    tablesComptees: comptees.length,
    noShowTables: noShow.length,
    noShowCouverts: somme(noShow),
    annuleesTables: annulees.length,
    annuleesCouverts: somme(annulees),
    nonPointeesTables: nonPointees.length,
    nonPointeesCouverts: somme(nonPointees),
    honoreesTables: honorees.length,
    honoreesCouverts: somme(honorees),
    prevuesTables: prevues.length,
    prevuesCouverts: somme(prevues),
    echuesTables: echues,
    nbJours: jours.length,
    joursOuverture: joursRef,
    joursOuvertureEstimes: joursOuverture === null,
    joursActivite,
    couvertsParJourOuverture: ratio(couverts, joursRef),
    couvertsParJourActivite: ratio(couverts, joursActivite),
    couvertsParSemaine: ratio(couverts, jours.length / 7),
    tailleMoyenne: ratio(couverts, comptees.length),
    capacite,
    occupation: capacite === null ? null : ratio(couverts, capacite),
    tauxAnnulationTables: ratio(annulees.length, lignes.length),
    tauxAnnulationCouverts: ratio(somme(annulees), somme(lignes)),
    tauxNoShow: ratio(noShow.length, echues),
    tauxNonPointe: ratio(nonPointees.length, echues),
  };
}

// ── Canaux ────────────────────────────────────────────────────────────────
function canaux(lignes) {
  const comptees = lignes.filter((r) => COMPTEES.has(r.classe));
  const totalTables = comptees.length;
  const totalCouverts = somme(comptees);
  const parCanal = CANAUX.map((c) => {
    const l = comptees.filter((r) => r.canal === c.id);
    const couverts = somme(l);
    return {
      id: c.id,
      label: c.label,
      tables: l.length,
      couverts,
      partTables: ratio(l.length, totalTables),
      partCouverts: ratio(couverts, totalCouverts),
      tailleMoyenne: ratio(couverts, l.length),
    };
  });
  const enLigne = lignes.filter((r) => r.canal === 'en_ligne');
  return {
    parCanal,
    demandes: {
      recues: enLigne.length,
      acceptees: enLigne.filter((r) => ACCEPTEES.has(r.statut)).length,
      annulees: enLigne.filter((r) => r.statut === 'annule').length,
      enAttente: enLigne.filter((r) => r.statut === 'demande').length,
    },
  };
}

// ── Temporalité ───────────────────────────────────────────────────────────
function temporalite(lignes, bornes, ctx, services) {
  const comptees = lignes.filter((r) => COMPTEES.has(r.classe));
  const jours = listeJours(bornes.debut, bornes.fin);

  const parJourMap = new Map(jours.map((d) => [d, { date: d, valeurs: {}, total: 0, tables: 0 }]));
  comptees.forEach((r) => {
    const j = parJourMap.get(r.date);
    if (!j) return;
    j.valeurs[r.svc] = (j.valeurs[r.svc] || 0) + r.couverts;
    j.total += r.couverts;
    j.tables += 1;
  });
  const parJour = jours.map((d) => {
    const j = parJourMap.get(d);
    const o = ouvertureJour(d, ctx);
    return { ...j, ouvert: o ? o.ouvert : j.tables > 0 };
  });

  // Semaines ISO touchées par la période (les semaines du bord sont partielles).
  const parSemaine = [];
  for (let l = zurichLundi(bornes.debut); l <= bornes.fin; l = zurichAjouterJours(l, 7)) {
    const fin = zurichAjouterJours(l, 6);
    const dedans = comptees.filter((r) => r.date >= l && r.date <= fin);
    const couverts = somme(dedans);
    const enLigne = somme(dedans.filter((r) => r.canal === 'en_ligne'));
    parSemaine.push({
      lundi: l,
      couverts,
      tables: dedans.length,
      partEnLigne: ratio(enLigne, couverts),
      complete: l >= bornes.debut && fin <= bornes.fin,
      fin,
    });
  }

  const parMois = [];
  for (let m = debutMois(bornes.debut); m <= bornes.fin; m = ajouterMois(m, 1)) {
    const cle = m.slice(0, 7);
    const dedans = comptees.filter((r) => r.date.slice(0, 7) === cle);
    parMois.push({ mois: cle, couverts: somme(dedans), tables: dedans.length });
  }

  // Moyenne par jour de la semaine : divisée par le nombre de ces jours-là
  // ouverts (ou avec activité) dans la période.
  const parJourSemaine = [1, 2, 3, 4, 5, 6, 7].map((iso) => {
    const dates = parJour.filter((j) => jourIso(j.date) === iso && (j.ouvert || j.tables > 0));
    const n = dates.length;
    const lignesJour = comptees.filter((r) => jourIso(r.date) === iso);
    const parService = Object.fromEntries(services.map((s) => {
      const l = lignesJour.filter((r) => r.svc === s);
      return [s, { couverts: ratio(somme(l), n), tables: ratio(l.length, n) }];
    }));
    return {
      iso,
      nbJours: n,
      couverts: ratio(somme(lignesJour), n),
      tables: ratio(lignesJour.length, n),
      parService,
    };
  });

  // Arrivées par jour de semaine et créneau de 30 min.
  const valeurs = {};
  const creneauxVus = [];
  comptees.forEach((r) => {
    if (r.minutes === null) return;
    const c = Math.floor(r.minutes / 30) * 30;
    const cle = `${jourIso(r.date)}|${c}`;
    valeurs[cle] = (valeurs[cle] || 0) + r.couverts;
    creneauxVus.push(c);
  });
  const creneaux = [];
  if (creneauxVus.length) {
    const min = Math.min(...creneauxVus);
    const max = Math.max(...creneauxVus);
    for (let c = min; c <= max; c += 30) creneaux.push(c);
  }
  const heatmap = { creneaux, valeurs, max: Math.max(0, ...Object.values(valeurs)) };

  const totalCouverts = somme(comptees);
  const repartition = services.map((s) => {
    const l = comptees.filter((r) => r.svc === s);
    return { service: s, tables: l.length, couverts: somme(l), part: ratio(somme(l), totalCouverts) };
  });

  // Meilleur et pire jour : jours passés seulement (un jour à venir paraît
  // faible tant que ses réservations n'ont pas toutes été prises).
  const passes = parJour.filter((j) => j.date < ctx.aujourdhui);
  const meilleurJour = passes.filter((j) => j.total > 0)
    .reduce((a, j) => (!a || j.total > a.total ? j : a), null);
  const pireJour = passes.filter((j) => j.ouvert)
    .reduce((a, j) => (!a || j.total < a.total ? j : a), null);
  const meilleureSemaine = parSemaine.filter((s) => s.complete && s.fin < ctx.aujourdhui && s.couverts > 0)
    .reduce((a, s) => (!a || s.couverts > a.couverts ? s : a), null);

  return {
    parJour,
    parSemaine,
    parMois,
    moyenneMois: ratio(totalCouverts, jours.length / (365.25 / 12)),
    parJourSemaine,
    heatmap,
    repartition,
    meilleurJour,
    pireJour,
    meilleureSemaine,
  };
}

// ── Anticipation ──────────────────────────────────────────────────────────
function anticipation(lignes, toutes, ctx) {
  const valides = lignes.filter((r) => r.classe !== 'annulee' && r.delai !== null);
  const tranches = TRANCHES_DELAI.map(({ min, max, ...t }) => {
    const l = valides.filter((r) => r.delai >= min && r.delai <= max);
    return { ...t, tables: l.length, couverts: somme(l), part: ratio(l.length, valides.length) };
  }).filter((t) => t.id !== 'apres' || t.tables > 0);
  const delais = (l) => l.map((r) => Math.max(0, r.delai));
  const resume = (l) => {
    const d = delais(l);
    return { tables: l.length, moyenne: d.length ? d.reduce((a, b) => a + b, 0) / d.length : null, mediane: mediane(d) };
  };
  const parCanal = CANAUX.map((c) => ({ id: c.id, label: c.label, ...resume(valides.filter((r) => r.canal === c.id)) }));

  // Carnet à venir : couverts déjà réservés pour les N prochains jours, et ce
  // qui l'était à la date comparable. Une réservation annulée depuis ne compte
  // ni d'un côté ni de l'autre (la date d'annulation n'est pas gardée).
  const carnet = (depuis, N) => somme(toutes.filter((r) => (
    AU_CARNET.has(r.statut)
    && (ctx.service === 'tous' || r.svc === ctx.service)
    && r.date >= depuis && r.date <= zurichAjouterJours(depuis, N - 1)
    && (!r.cree || r.cree <= depuis)
  )));
  const carnets = HORIZONS_CARNET.map((N) => {
    const actuel = carnet(ctx.aujourdhui, N);
    const avant = carnet(ctx.reference, N);
    return { jours: N, actuel, avant, variation: variationPct(actuel, avant) };
  });

  return { tranches, global: resume(valides), parCanal, carnets };
}

// ── Composition des tables ────────────────────────────────────────────────
function composition(lignes, tables) {
  const comptees = lignes.filter((r) => COMPTEES.has(r.classe));
  const total = comptees.length;
  const totalCouverts = somme(comptees);
  const tailles = TRANCHES_TAILLE.map(({ min, max, ...t }) => {
    const l = comptees.filter((r) => r.couverts >= min && r.couverts <= max);
    return { ...t, tables: l.length, couverts: somme(l), part: ratio(l.length, total) };
  });
  const groupes = comptees.filter((r) => r.groupe);

  const parId = new Map((tables || []).map((t) => [t.id, t]));
  const usage = new Map();
  const zones = new Map();
  const zonesRenseignees = (tables || []).some((t) => String(t.zone || '').trim());
  const placees = comptees.filter((r) => r.tablesIds.length > 0);
  placees.forEach((r) => {
    // Une réservation sur plusieurs tables : ses couverts sont partagés.
    const part = r.couverts / r.tablesIds.length;
    r.tablesIds.forEach((id) => {
      const u = usage.get(id) || { id, reservations: 0, couverts: 0 };
      u.reservations += 1;
      u.couverts += part;
      usage.set(id, u);
      if (zonesRenseignees) {
        const z = String(parId.get(id)?.zone || '').trim() || 'Sans zone';
        zones.set(z, (zones.get(z) || 0) + part);
      }
    });
  });
  const topTables = [...usage.values()]
    .sort((a, b) => b.reservations - a.reservations || b.couverts - a.couverts)
    .slice(0, 10)
    .map((u) => ({ ...u, nom: parId.get(u.id)?.nom || 'Table', places: parId.get(u.id)?.nb_places ?? null }));

  return {
    tailles,
    groupes: { tables: groupes.length, couverts: somme(groupes), part: ratio(somme(groupes), totalCouverts) },
    placement: { placees: placees.length, total, taux: ratio(placees.length, total) },
    topTables,
    zones: zonesRenseignees
      ? [...zones.entries()].map(([zone, couverts]) => ({ zone, couverts })).sort((a, b) => b.couverts - a.couverts)
      : null,
  };
}

// ── Clientèle ─────────────────────────────────────────────────────────────
function clientele(lignes) {
  const comptees = lignes.filter((r) => COMPTEES.has(r.classe));
  const avecFiche = comptees.filter((r) => r.clientId);
  const parClient = new Map();
  avecFiche.forEach((r) => {
    const c = parClient.get(r.clientId) || { id: r.clientId, nom: r.clientNom, reservations: 0, couverts: 0, honorees: 0 };
    c.reservations += 1;
    c.couverts += r.couverts;
    if (r.classe === 'honoree') c.honorees += 1;
    parClient.set(r.clientId, c);
  });
  const clients = [...parClient.values()];
  const venus = clients.filter((c) => c.honorees >= 1).length;
  const revenus = clients.filter((c) => c.honorees >= 2).length;

  const tags = TYPES_TAGS.map((t) => {
    const concernees = comptees.filter((r) => r.tags.some((g) => g.type_tag === t.id));
    const parValeur = new Map();
    concernees.forEach((r) => {
      const vus = new Set();
      r.tags.filter((g) => g.type_tag === t.id).forEach((g) => {
        const v = libelleTag(g.valeur);
        if (vus.has(v)) return;
        vus.add(v);
        const x = parValeur.get(v) || { valeur: v, tables: 0, couverts: 0 };
        x.tables += 1;
        x.couverts += r.couverts;
        parValeur.set(v, x);
      });
    });
    return {
      ...t,
      tables: concernees.length,
      couverts: somme(concernees),
      valeurs: [...parValeur.values()].sort((a, b) => b.tables - a.tables || b.couverts - a.couverts),
    };
  });
  const passeport = comptees.filter((r) => r.passeport);

  return {
    avecFiche: { tables: avecFiche.length, couverts: somme(avecFiche) },
    sansFiche: { tables: comptees.length - avecFiche.length, couverts: somme(comptees) - somme(avecFiche) },
    partAvecFiche: ratio(avecFiche.length, comptees.length),
    clientsUniques: clients.length,
    clientsVenus: venus,
    clientsRevenus: revenus,
    tauxRetour: ratio(revenus, venus),
    top: clients
      .sort((a, b) => b.reservations - a.reservations || b.couverts - a.couverts || a.nom.localeCompare(b.nom))
      .slice(0, 10),
    tags,
    passeport: { tables: passeport.length, couverts: somme(passeport) },
  };
}

// ── Tableau détaillé : par jour jusqu'à deux mois, par semaine au-delà ─────
function tableau(lignes, bornes, ctx) {
  const granularite = nbJours(bornes.debut, bornes.fin) <= 62 ? 'jour' : 'semaine';
  const cleDe = (date) => (granularite === 'jour' ? date : zurichLundi(date));
  const agg = new Map();
  lignes.forEach((r) => {
    const cle = `${cleDe(r.date)}|${r.svc}`;
    const a = agg.get(cle) || {
      periode: cleDe(r.date), service: r.svc, tables: 0, couverts: 0,
      equipe: 0, en_ligne: 0, passage: 0, annulees: 0, noShow: 0, nonPointees: 0,
    };
    if (COMPTEES.has(r.classe)) {
      a.tables += 1;
      a.couverts += r.couverts;
      a[r.canal] += r.couverts;
    }
    if (r.classe === 'annulee') a.annulees += 1;
    if (r.classe === 'no_show') a.noShow += 1;
    if (r.classe === 'non_pointee') a.nonPointees += 1;
    agg.set(cle, a);
  });
  const rangees = [...agg.values()].map((a) => {
    let capacite = null;
    if (ctx.aParametres) {
      const jours = granularite === 'jour'
        ? [a.periode]
        : listeJours(a.periode, zurichAjouterJours(a.periode, 6)).filter((d) => d >= bornes.debut && d <= bornes.fin);
      capacite = jours.reduce((t, d) => t + (capaciteJourService(d, a.service, ctx) || 0), 0);
    }
    return { ...a, occupation: capacite === null ? null : ratio(a.couverts, capacite) };
  });
  rangees.sort((x, y) => (x.periode < y.periode ? -1 : x.periode > y.periode ? 1 : x.service.localeCompare(y.service)));
  return { granularite, rangees };
}

// Variations des chiffres clés contre la comparaison : en % pour les volumes,
// en points pour les taux. Une comparaison sans aucune réservation (avant la
// mise en service de l'app, maison fermée) ne dit rien : tout est null, plutôt
// qu'un « +28 pts » contre une occupation nulle faute de saisie.
function variations(c, p, comparaisonVide) {
  const pctSi = (a, b) => (comparaisonVide ? null : variationPct(a, b));
  const ptsSi = (a, b) => (comparaisonVide ? null : variationPts(a, b));
  return {
    couverts: pctSi(c.couverts, p.couverts),
    tables: pctSi(c.tables, p.tables),
    couvertsParJourOuverture: pctSi(c.couvertsParJourOuverture, p.couvertsParJourOuverture),
    couvertsParSemaine: pctSi(c.couvertsParSemaine, p.couvertsParSemaine),
    tailleMoyenne: pctSi(c.tailleMoyenne, p.tailleMoyenne),
    occupation: ptsSi(c.occupation, p.occupation),
    tauxAnnulationTables: ptsSi(c.tauxAnnulationTables, p.tauxAnnulationTables),
    tauxNoShow: ptsSi(c.tauxNoShow, p.tauxNoShow),
    tauxNonPointe: ptsSi(c.tauxNonPointe, p.tauxNonPointe),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Entrée : lignes = réservations lues (fenêtre entière : période, comparaison
// et carnets), parametres = réglages de la réservation en ligne (ou null),
// tables = tables de salle de l'établissement.
// ═══════════════════════════════════════════════════════════════════════════
export function computeReservationStats({
  lignes, periode, comparaison, aujourdhui, reference, service = 'tous', parametres = null, tables = [],
}) {
  const avecBrunch = aDuBrunch(lignes, parametres);
  const aParametres = Boolean(parametres && parametres.horaires && Object.keys(parametres.horaires).length);
  const ctx = { aujourdhui, reference, service, avecBrunch, parametres, aParametres };
  const services = (avecBrunch ? ['midi', 'soir', 'brunch'] : ['midi', 'soir'])
    .filter((s) => service === 'tous' || s === service);

  const toutes = preparerLignes(lignes, aujourdhui, avecBrunch);
  const actuelles = filtrer(toutes, periode, service);
  const precedentes = filtrer(toutes, comparaison, service);
  const chiffres = chiffresCles(actuelles, periode, ctx);
  const chiffresComparaison = chiffresCles(precedentes, comparaison, ctx);

  return {
    avecBrunch,
    aParametres,
    services,
    vide: actuelles.length === 0,
    comparaisonVide: precedentes.length === 0,
    chiffres,
    chiffresComparaison,
    variations: variations(chiffres, chiffresComparaison, precedentes.length === 0),
    canaux: canaux(actuelles),
    temporalite: temporalite(actuelles, periode, ctx, services),
    anticipation: anticipation(actuelles, toutes, ctx),
    composition: composition(actuelles, tables),
    clientele: clientele(actuelles),
    tableau: tableau(actuelles, periode, ctx),
  };
}
