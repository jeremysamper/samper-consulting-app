// node --test : prévision des couverts (previsionCouverts.js) et lecture de
// la météo (meteo.js).
// Lancer : node src/modules/previsions/previsionCouverts.test.mjs
//      ou : npm.cmd run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  construirePrevision, mesurerEffet, couvertsParService, jourSemaine, pensionParService, phrasePension,
  SEMAINES, SEMAINES_MIN, JOURS_MIN_PAR_CLASSE,
} from './previsionCouverts.js';
import {
  npaDepuisAdresse, heureLocale, lireMeteo, meteoDuService, classeDuJour, chargerMeteo,
} from './meteo.js';
import { zurichAjouterJours } from '../../utils/zurichTime.js';

const AUJ = '2026-11-19';   // un jeudi

// Une réservation honorée par jour et par service, du premier jour à hier.
function historique(depuis, jusqua, couverts) {
  const resas = [];
  for (let d = depuis; d <= jusqua; d = zurichAjouterJours(d, 1)) {
    for (const service of ['midi', 'soir']) {
      const n = couverts(d, service);
      if (n > 0) resas.push({ date_service: d, service, nb_couverts: n, statut: 'arrive' });
    }
  }
  return resas;
}

// Réponse de la route, au format compact, pour des jours donnés.
function reponseMeteo({ jours = [], historique: histo = [], heures = [] } = {}) {
  return {
    source: 'MeteoSwiss', run: '202611190500',
    point: { id: 198300, nom: 'Evolène', npa: '1983', altitude: 1365 },
    station: { abbr: 'EVO', nom: 'Evolène / Villa', altitude: 1825, distanceKm: 1 },
    heures, jours, historique: histo,
  };
}

const HIER = zurichAjouterJours(AUJ, -1);

// ── 1. Historique plein ────────────────────────────────────────────────
test('historique plein : moyenne des 8 derniers mêmes services, annulées, no-shows et demandes exclues', () => {
  const resas = historique('2026-08-01', HIER, (d, s) => {
    const w = jourSemaine(d);
    if (w === 4) return s === 'soir' ? 40 : 20;          // jeudis
    if (w === 5) return s === 'soir' ? 50 : 0;           // vendredis, pas de midi
    return 10;
  });
  // Hors réalisé : une annulée, un no-show et une demande restée sans réponse.
  resas.push({ date_service: '2026-11-12', service: 'soir', nb_couverts: 99, statut: 'annule' });
  resas.push({ date_service: '2026-11-12', service: 'soir', nb_couverts: 99, statut: 'no_show' });
  resas.push({ date_service: '2026-11-12', service: 'soir', nb_couverts: 99, statut: 'demande' });
  // Une réservation passée restée « attendue » compte : 8 couverts de plus
  // sur un jeudi, soit 1 de plus en moyenne sur 8 semaines.
  resas.push({ date_service: '2026-11-05', service: 'soir', nb_couverts: 8, statut: 'confirme' });

  const p = construirePrevision({ aujourdhui: AUJ, premiereDate: '2026-08-01', resas, etatMeteo: 'indisponible' });
  assert.equal(p.statut, 'prevision');
  assert.equal(p.jours.length, 7);
  assert.equal(p.jours[0].jour, AUJ);
  const jeudi = p.jours[0].services;
  assert.equal(jeudi.soir.semaines, SEMAINES);
  assert.equal(jeudi.soir.moyenne, 41);
  assert.equal(jeudi.soir.valeur, 41);
  assert.equal(jeudi.midi.valeur, 20);
  const vendredi = p.jours[1].services;
  assert.equal(vendredi.soir.valeur, 50);
  assert.equal(vendredi.midi.valeur, 0, 'un service fermé se prévoit à zéro');
  assert.equal(p.semainesMax, SEMAINES);
});

test('le brunch est le midi', () => {
  const m = couvertsParService([
    { date_service: '2026-11-15', service: 'brunch', nb_couverts: 12, statut: 'parti' },
    { date_service: '2026-11-15', service: 'midi', nb_couverts: 3, statut: 'arrive' },
  ], { realise: true });
  assert.equal(m.get('2026-11-15|midi'), 15);
});

// ── 2. Historique court ────────────────────────────────────────────────
test('historique court : moins de 8 semaines, la moyenne porte sur ce qui existe', () => {
  const premiere = '2026-10-14';   // un mercredi : 5 jeudis depuis
  const resas = historique(premiere, HIER, () => 30);
  const p = construirePrevision({ aujourdhui: AUJ, premiereDate: premiere, resas, etatMeteo: 'indisponible' });
  const jeudi = p.jours[0].services.soir;
  assert.equal(jeudi.etat, 'prevision');
  assert.equal(jeudi.semaines, 5);
  assert.equal(jeudi.valeur, 30);
  // Le mercredi de la semaine prévue a 6 mercredis derrière lui, le 14.10 compris.
  assert.equal(p.jours[6].services.soir.semaines, 6);
  assert.equal(p.semainesMax, 6);
});

test('historique de moins de 4 semaines : pas de prévision', () => {
  const premiere = '2026-11-01';
  const resas = historique(premiere, HIER, () => 30);
  const p = construirePrevision({ aujourdhui: AUJ, premiereDate: premiere, resas, etatMeteo: 'indisponible' });
  assert.equal(p.statut, 'historique_court');
  assert.ok(p.semainesMax < SEMAINES_MIN);
  for (const j of p.jours) {
    assert.equal(j.services.soir.etat, 'historique_court');
    assert.equal(j.services.soir.valeur, null);
  }
});

test('aucune réservation : pas de prévision', () => {
  const p = construirePrevision({ aujourdhui: AUJ, premiereDate: null, resas: [], etatMeteo: 'indisponible' });
  assert.equal(p.statut, 'historique_court');
  assert.equal(p.semainesMax, 0);
});

// ── 3. Plancher des réservations ───────────────────────────────────────
test('plancher : les réservations prises au-dessus de la moyenne font la prévision', () => {
  const resas = historique('2026-08-01', HIER, () => 22);
  resas.push({ date_service: AUJ, service: 'soir', nb_couverts: 26, statut: 'confirme' });
  resas.push({ date_service: AUJ, service: 'soir', nb_couverts: 4, statut: 'demande' });   // comptée, comme au planning
  resas.push({ date_service: AUJ, service: 'soir', nb_couverts: 50, statut: 'no_show' }); // jamais comptée
  resas.push({ date_service: AUJ, service: 'midi', nb_couverts: 10, statut: 'confirme' });
  const p = construirePrevision({ aujourdhui: AUJ, premiereDate: '2026-08-01', resas, etatMeteo: 'indisponible' });
  const soir = p.jours[0].services.soir;
  assert.equal(soir.reserves, 30);
  assert.equal(soir.calcul, 22);
  assert.equal(soir.valeur, 30);
  assert.equal(soir.plancher, true);
  const midi = p.jours[0].services.midi;
  assert.equal(midi.reserves, 10);
  assert.equal(midi.valeur, 22);
  assert.equal(midi.plancher, false);
});

// ── 4. Effet météo mesuré ──────────────────────────────────────────────
// Un jour sur trois de précipitations ; ces jours-là, le soir fait la moitié.
function histoMeteo(depuis) {
  const pluie = [];
  let i = 0;
  for (let d = depuis; d <= HIER; d = zurichAjouterJours(d, 1)) {
    pluie.push([d, i % 3 === 0 ? 6.5 : 0]);
    i += 1;
  }
  return pluie;
}

test('effet météo mesuré : appliqué aux jours de précipitations prévus', () => {
  const depuis = '2026-07-01';
  const pluie = histoMeteo(depuis);
  const mouille = new Map(pluie);
  const resas = historique(depuis, HIER, (d, s) => {
    const n = s === 'soir' ? 40 + (jourSemaine(d) % 3) : 20;   // un peu de variation
    return s === 'soir' && mouille.get(d) >= 1 ? Math.round(n / 2) : n;
  });
  const meteo = lireMeteo(reponseMeteo({
    historique: pluie,
    jours: [[AUJ, 12.4, 4, 1.5], [zurichAjouterJours(AUJ, 1), 0, 7, 2]],
  }));
  const p = construirePrevision({ aujourdhui: AUJ, premiereDate: depuis, resas, meteo, etatMeteo: 'ok' });
  const e = p.effets.soir;
  assert.equal(e.mesurable, true);
  assert.ok(e.nPrecip >= JOURS_MIN_PAR_CLASSE && e.nSec >= JOURS_MIN_PAR_CLASSE);
  assert.ok(e.tauxPrecip < -0.2, `effet pluie ${e.tauxPrecip}`);
  assert.ok(e.tauxSec > 0.05, `effet sec ${e.tauxSec}`);

  const jeudi = p.jours[0];
  assert.equal(jeudi.classe, 'precipitations');
  assert.equal(jeudi.services.soir.effet.classe, 'precipitations');
  assert.ok(jeudi.services.soir.valeur < jeudi.services.soir.moyenne);
  assert.equal(jeudi.services.soir.valeur, Math.round(jeudi.services.soir.moyenne * (1 + e.tauxPrecip)));
  const vendredi = p.jours[1];
  assert.equal(vendredi.classe, 'sec');
  assert.ok(vendredi.services.soir.valeur > vendredi.services.soir.moyenne);
  // Le midi ne bouge pas avec la pluie : aucun effet, la prévision reste la moyenne.
  assert.equal(p.effets.midi.mesurable, false);
  assert.equal(p.effets.midi.raison, 'ecart_non_significatif');
  assert.equal(jeudi.services.midi.effet, null);
  assert.equal(jeudi.services.midi.valeur, 20);
  // Hors des jours publiés par MétéoSuisse : pas de classe, pas de correction.
  assert.equal(p.jours[3].classe, null);
  assert.equal(p.jours[3].services.soir.effet, null);
});

// ── 5. Effet non mesurable ─────────────────────────────────────────────
test('effet non mesurable : trop peu de jours de précipitations, la météo ne corrige rien', () => {
  const depuis = '2026-08-01';
  const pluie = histoMeteo(depuis).map(([d], i) => [d, i < 3 ? 9 : 0]);   // trois jours mouillés
  const resas = historique(depuis, HIER, () => 35);
  const meteo = lireMeteo(reponseMeteo({
    historique: pluie,
    jours: [[AUJ, 20, 3, 0]],
    heures: [['202611191800', 1.2, 0], ['202611191900', 0.8, 0]],   // 19 h et 20 h à Zurich
  }));
  const p = construirePrevision({ aujourdhui: AUJ, premiereDate: depuis, resas, meteo, etatMeteo: 'ok' });
  assert.equal(p.effets.soir.mesurable, false);
  assert.equal(p.effets.soir.raison, 'jours_insuffisants');
  const soir = p.jours[0].services.soir;
  assert.equal(soir.effet, null);
  assert.equal(soir.valeur, 35);
  assert.ok(soir.temps, 'la météo du service s\'affiche quand même');
  assert.equal(soir.temps.libelle, 'Pluie ou neige');
});

test('effet non mesurable : autant de couverts par tous les temps', () => {
  const depuis = '2026-07-01';
  const pluie = histoMeteo(depuis);
  const resas = historique(depuis, HIER, (d) => 30 + (Number(d.slice(8)) % 5));
  const r = mesurerEffet({
    service: 'soir', aujourdhui: AUJ, premiereDate: depuis,
    realises: couvertsParService(resas, { realise: true }), pluieParJour: new Map(pluie),
  });
  assert.equal(r.mesurable, false);
  assert.equal(r.raison, 'ecart_non_significatif');
});

test('effet non mesurable : aucune station de mesure', () => {
  const resas = historique('2026-08-01', HIER, () => 30);
  const meteo = lireMeteo({ ...reponseMeteo({ jours: [[AUJ, 5, 4, 1]] }), station: null, historique: [] });
  const p = construirePrevision({ aujourdhui: AUJ, premiereDate: '2026-08-01', resas, meteo, etatMeteo: 'ok' });
  assert.equal(p.effets.soir.raison, 'sans_mesures');
  assert.equal(p.jours[0].services.soir.valeur, 30);
});

// ── 6. Météo indisponible ──────────────────────────────────────────────
test('météo indisponible : prévision des seules réservations, sans temps ni effet', () => {
  const resas = historique('2026-08-01', HIER, () => 30);
  const p = construirePrevision({ aujourdhui: AUJ, premiereDate: '2026-08-01', resas, meteo: null, etatMeteo: 'indisponible' });
  assert.equal(p.meteo, null);
  assert.equal(p.effets.soir.raison, 'sans_meteo');
  assert.equal(p.jours[0].services.soir.temps, null);
  assert.equal(p.jours[0].services.soir.valeur, 30);
});

test('météo indisponible : une page HTML à la place de la route est refusée', async () => {
  assert.equal(lireMeteo(null), null);
  assert.equal(lireMeteo('<!doctype html>'), null);
  const html = async () => ({ ok: true, status: 200, headers: { get: () => 'text/html' }, json: async () => ({}) });
  await assert.rejects(() => chargerMeteo('1983', { aujourdhui: AUJ, fetchFn: html }));
  const panne = async () => ({ ok: false, status: 502, headers: { get: () => 'application/json' }, json: async () => ({ erreur: 'meteo_indisponible' }) });
  await assert.rejects(() => chargerMeteo('1983', { aujourdhui: AUJ, fetchFn: panne }));
  const bon = async (url) => {
    assert.equal(url, '/api/meteo?npa=1983');
    return { ok: true, status: 200, headers: { get: () => 'application/json; charset=utf-8' }, json: async () => reponseMeteo({ jours: [[AUJ, 0, 5, 1]] }) };
  };
  const m = await chargerMeteo('1983', { aujourdhui: AUJ, fetchFn: bon });
  assert.equal(m.point.nom, 'Evolène');
  assert.equal(classeDuJour(m, AUJ), 'sec');
});

// ── 7. Établissement sans localisation ─────────────────────────────────
test('localisation : le NPA vient de l\'adresse, sinon rien', () => {
  assert.equal(npaDepuisAdresse('Route de Fonville 2, 1983 Evolène'), '1983');
  assert.equal(npaDepuisAdresse("Rte d'Anzère 70, 1966 Ayent"), '1966');
  assert.equal(npaDepuisAdresse('de, Rte de Montana 2, 3974 Crans-Montana'), '3974');
  assert.equal(npaDepuisAdresse('CH-1973 Nax'), '1973');
  assert.equal(npaDepuisAdresse('Route de collombé 24 A'), null);
  assert.equal(npaDepuisAdresse(null), null);
  assert.equal(npaDepuisAdresse(''), null);
});

test('établissement sans localisation : prévision sans météo', () => {
  const resas = historique('2026-08-01', HIER, () => 18);
  const p = construirePrevision({ aujourdhui: AUJ, premiereDate: '2026-08-01', resas, etatMeteo: 'sans_localisation' });
  assert.equal(p.etatMeteo, 'sans_localisation');
  assert.equal(p.meteo, null);
  assert.equal(p.jours[0].services.soir.temps, null);
  assert.equal(p.jours[0].services.soir.valeur, 18);
});

// ── Lecture de la météo ────────────────────────────────────────────────
test('heures : UTC vers Zurich, hiver et été', () => {
  assert.deepEqual(heureLocale('202611191100'), { jour: '2026-11-19', heure: 12 });
  assert.deepEqual(heureLocale('202607011100'), { jour: '2026-07-01', heure: 13 });
  assert.deepEqual(heureLocale('202611192300'), { jour: '2026-11-20', heure: 0 });
  assert.equal(heureLocale('2026-11-19'), null);
});

test('temps du service : neige, pluie, soleil et temps sec', () => {
  const meteo = lireMeteo(reponseMeteo({
    jours: [['2026-11-19', 8, 0.5, -3], ['2026-11-20', 6, 9, 4], ['2026-11-21', 0, 6, 1]],
    heures: [
      // 19.11 midi (11, 12 et 13 h UTC) : neige, le maximum ne passe pas 1 °C
      ['202611191100', 0.4, 0], ['202611191200', 0.3, 0], ['202611191300', 0.1, 0],
      // 20.11 soir (18 à 21 h UTC) : pluie, le minimum reste à 4 °C
      ['202611201800', 0.5, 0], ['202611201900', 0.2, 0],
      // 21.11 midi : soleil ; soir : sec
      ['202611211100', 0, 50], ['202611211200', 0, 45], ['202611211300', 0, 40],
      ['202611211800', 0, 0], ['202611211900', 0, 0], ['202611212000', 0, 0], ['202611212100', 0, 0],
    ],
  }));
  assert.equal(meteoDuService(meteo, '2026-11-19', 'midi').libelle, 'Neige');
  assert.equal(meteoDuService(meteo, '2026-11-19', 'midi').pluieMm, 0.8);
  assert.equal(meteoDuService(meteo, '2026-11-20', 'soir').libelle, 'Pluie');
  assert.equal(meteoDuService(meteo, '2026-11-21', 'midi').libelle, 'Ensoleillé');
  assert.equal(meteoDuService(meteo, '2026-11-21', 'soir').libelle, 'Temps sec');
  assert.equal(meteoDuService(meteo, '2026-11-21', 'soir').tmax, 6);
  assert.equal(meteoDuService(meteo, '2026-11-30', 'soir'), null, 'hors publication');
  assert.equal(classeDuJour(meteo, '2026-11-19'), 'precipitations');
  assert.equal(classeDuJour(meteo, '2026-11-21'), 'sec');
  assert.equal(classeDuJour(meteo, '2026-11-30'), null);
});

// ── Lot 06 du panel : hôtes en pension ─────────────────────────────────────
const DEMAIN = zurichAjouterJours(AUJ, 1);
const sejourBrut = (o = {}) => ({ id: 's1', statut: 'en_maison', pension: 'demi', arrivee: HIER, depart: DEMAIN, nb_adultes: 2, nb_enfants: 0, ...o });

test('pension : demi-pension de 2, arrivée hier, départ demain', () => {
  const t = pensionParService({ sejours: [sejourBrut()], liens: [], resas: [], aujourdhui: AUJ });
  assert.equal(t.get(`${AUJ}|soir`), 2);
  assert.equal(t.get(`${AUJ}|midi`) || 0, 0);
  assert.equal(t.get(`${DEMAIN}|soir`) || 0, 0);
});

test('pension : complète de 1, midi et soir de chaque nuit du séjour', () => {
  const depart = zurichAjouterJours(AUJ, 3);
  const t = pensionParService({ sejours: [sejourBrut({ pension: 'complete', arrivee: AUJ, depart, nb_adultes: 1 })], liens: [], resas: [], aujourdhui: AUJ });
  for (let i = 0; i < 3; i += 1) {
    const d = zurichAjouterJours(AUJ, i);
    assert.equal(t.get(`${d}|midi`), 1, d);
    assert.equal(t.get(`${d}|soir`), 1, d);
  }
  assert.equal(t.get(`${depart}|midi`) || 0, 0);
  assert.equal(t.size, 6);
});

test('pension : petit-déjeuner, aucune, annulé, no-show et parti ne comptent pas', () => {
  const sejours = [
    sejourBrut({ id: 'a', pension: 'petit_dejeuner' }),
    sejourBrut({ id: 'b', pension: 'aucune' }),
    sejourBrut({ id: 'c', statut: 'annule' }),
    sejourBrut({ id: 'd', statut: 'no_show' }),
    sejourBrut({ id: 'e', statut: 'parti' }),
  ];
  assert.equal(pensionParService({ sejours, liens: [], resas: [], aujourdhui: AUJ }).size, 0);
});

test('pension : séjour relié à une réservation du soir exclu ce soir-là seulement, enfants comptés', () => {
  const s = sejourBrut({ id: 7, depart: zurichAjouterJours(AUJ, 2), nb_enfants: 1 });
  const resas = [{ id: 42, date_service: AUJ, service: 'soir', nb_couverts: 3, statut: 'confirme' }];
  const liens = [{ sejour_id: '7', type: 'reservation', cible_id: '42' }];
  const t = pensionParService({ sejours: [s], liens, resas, aujourdhui: AUJ });
  assert.equal(t.get(`${AUJ}|soir`) || 0, 0);
  assert.equal(t.get(`${DEMAIN}|soir`), 3);
  const annulee = pensionParService({ sejours: [s], liens, resas: [{ ...resas[0], statut: 'annule' }], aujourdhui: AUJ });
  assert.equal(annulee.get(`${AUJ}|soir`), 3);
  const autreType = pensionParService({ sejours: [s], liens: [{ ...liens[0], type: 'groupe' }], resas, aujourdhui: AUJ });
  assert.equal(autreType.get(`${AUJ}|soir`), 3);
});

test('pension : une réservation de brunch reliée exclut le midi', () => {
  const s = sejourBrut({ pension: 'complete', depart: zurichAjouterJours(AUJ, 2) });
  const resas = [{ id: 'r1', date_service: AUJ, service: 'brunch', nb_couverts: 2, statut: 'demande' }];
  const t = pensionParService({ sejours: [s], liens: [{ sejour_id: 's1', type: 'reservation', cible_id: 'r1' }], resas, aujourdhui: AUJ });
  assert.equal(t.get(`${AUJ}|midi`) || 0, 0);
  assert.equal(t.get(`${AUJ}|soir`), 2);
  assert.equal(t.get(`${DEMAIN}|midi`), 2);
});

test('plancher : réservés et pension ensemble, jamais ajoutés à la moyenne', () => {
  const resas = [
    ...historique('2026-08-01', HIER, (d, s) => (s === 'soir' ? 30 : 0)),
    { date_service: AUJ, service: 'soir', nb_couverts: 10, statut: 'confirme' },
  ];
  const base = { aujourdhui: AUJ, premiereDate: '2026-08-01', resas, etatMeteo: 'indisponible' };
  const haut = construirePrevision({ ...base, pension: new Map([[`${AUJ}|soir`, 25]]) }).jours[0].services.soir;
  assert.equal(haut.calcul, 30);
  assert.equal(haut.valeur, 35);
  assert.equal(haut.plancher, true);
  assert.equal(haut.pension, 25);
  const bas = construirePrevision({ ...base, pension: new Map([[`${AUJ}|soir`, 5]]) }).jours[0].services.soir;
  assert.equal(bas.valeur, 30);
  assert.equal(bas.plancher, false);
  assert.equal(bas.pension, 5);
});

test("sans pension : même prévision qu'avant, au champ pension: 0 près", () => {
  const resas = historique('2026-08-01', HIER, () => 12);
  const base = { aujourdhui: AUJ, premiereDate: '2026-08-01', resas, etatMeteo: 'indisponible' };
  const sans = construirePrevision(base);
  assert.deepEqual(sans, construirePrevision({ ...base, pension: new Map() }));
  for (const j of sans.jours) {
    for (const svc of ['midi', 'soir']) {
      const { pension, ...reste } = j.services[svc];
      assert.equal(pension, 0);
      assert.deepEqual(Object.keys(reste).sort(), ['calcul', 'effet', 'etat', 'moyenne', 'plancher', 'reserves', 'semaines', 'temps', 'valeur']);
    }
  }
});

test('service fermé et historique court : pas de valeur, la pension est portée', () => {
  const pension = new Map([[`${AUJ}|soir`, 4], [`${AUJ}|midi`, 2]]);
  const court = construirePrevision({ aujourdhui: AUJ, premiereDate: zurichAjouterJours(AUJ, -10), resas: [], etatMeteo: 'indisponible', pension });
  assert.equal(court.jours[0].services.soir.etat, 'historique_court');
  assert.equal(court.jours[0].services.soir.valeur, null);
  assert.equal(court.jours[0].services.soir.pension, 4);
  const fermetures = { joursFermes: [4], servicesFermes: {}, periodes: [] };   // jeudi
  const ferme = construirePrevision({ aujourdhui: AUJ, premiereDate: '2026-08-01', resas: historique('2026-08-01', HIER, () => 9), etatMeteo: 'indisponible', fermetures, pension });
  assert.equal(ferme.jours[0].services.midi.etat, 'ferme');
  assert.equal(ferme.jours[0].services.midi.valeur, null);
  assert.equal(ferme.jours[0].services.midi.pension, 2);
});

test('phrase de la pension : lue, en échec avec Réessayer, sinon rien', () => {
  assert.deepEqual(phrasePension('pret'), { texte: "Les hôtes en pension comptent dans la prévision. Source : les séjours de l'Hébergement.", reessayer: false });
  assert.deepEqual(phrasePension('erreur'), { texte: "Les séjours n'ont pas pu être lus : la prévision ne compte pas les hôtes en pension.", reessayer: true });
  assert.equal(phrasePension('eteinte'), null);
  assert.equal(phrasePension('chargement'), null);
});
