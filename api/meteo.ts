// ================================================================
// api/meteo.ts : météo prévue et précipitations passées d'un NPA suisse,
// tirées des données ouvertes de MétéoSuisse (aucun nouveau sous-traitant,
// aucun secret).
//
// GET ?npa=1983 → JSON compact :
//   point      : le point de prévision MétéoSuisse du NPA (nom, altitude)
//   heures     : [horodatage UTC AAAAMMJJHHMM, pluie mm, ensoleillement min]
//                 pour les 9 jours publiés
//   jours      : [AAAA-MM-JJ, pluie mm du jour local, t max, t min]
//   station    : station de mesure la plus proche (25 km au plus), ou null
//   historique : [AAAA-MM-JJ, pluie mm] des 120 derniers jours mesurés
//
// Pourquoi une route et pas un appel du navigateur : MétéoSuisse ne sert pas
// de prévision par point. Les prévisions locales (collection STAC
// ch.meteoschweiz.ogd-local-forecasting, mise à jour toutes les heures) sont
// des CSV, un fichier par paramètre et par heure de calcul, qui portent les
// 6 000 points du pays : 31 Mo par paramètre horaire. La plupart sont triés
// par type de point puis par numéro de point : la route y cherche le point
// par dichotomie en lectures de plages d'octets (une quinzaine de lectures de
// 4 Ko par fichier) et ne renvoie que lui. Les températures et l'isotherme
// sont triés par heure puis par point (vérifié le 19.11.2026) : on ne lit
// que les températures du jour, fichiers de 1,3 Mo lus en entier ; un gros
// fichier trié par heure n'est jamais téléchargé. La réponse est mise en cache par
// le CDN une heure ; le navigateur la garde pour la journée.
//
// Le passé vient des stations automatiques (collection ch.meteoschweiz.
// ogd-smn) : précipitations du jour (rre150d0, de 6 h UTC à 6 h UTC le
// lendemain), fichier « recent » du 1er janvier à hier, fin du fichier
// « historical » quand la fenêtre remonte avant le 1er janvier.
// ================================================================

export const config = {
  runtime:     'nodejs',
  maxDuration: 25,
};

type Req = { method?: string; url?: string; query?: Record<string, string | string[] | undefined> };
type Res = {
  status: (code: number) => Res;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
};

const BASE       = 'https://data.geo.admin.ch';
const PREV       = 'ch.meteoschweiz.ogd-local-forecasting';
const SMN        = 'ch.meteoschweiz.ogd-smn';
const STAC_ITEMS = `${BASE}/api/stac/v1/collections/${PREV}/items/`;
const META_POINTS   = `${BASE}/${PREV}/ogd-local-forecasting_meta_point.csv`;
const META_STATIONS = `${BASE}/${SMN}/ogd-smn_meta_stations.csv`;

// Paramètres lus. Horaires : la valeur porte sur l'heure qui FINIT à
// l'horodatage. Journaliers en « p » : jour civil à l'heure locale.
const HORAIRES    = ['rre150h0', 'sre000h0'];
const JOURNALIERS = ['rka150p0', 'tre200px', 'tre200pn'];

const TYPE_NPA        = 2;        // point_type_id des centres de NPA
const BLOC            = 4096;     // octets par lecture de dichotomie
const LECTURE_ENTIERE = 4e6;      // un fichier plus petit se lit en entier
const DISTANCE_MAX_M  = 25000;    // station de mesure retenue à 25 km au plus
const JOURS_HISTO     = 120;      // jours de précipitations passées renvoyés
const NPA             = /^[1-9]\d{3}$/;

// ── Lectures ─────────────────────────────────────────────────────────

const latin1 = new TextDecoder('latin1');

async function texte(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return latin1.decode(await r.arrayBuffer());
}

// Plage d'octets. Un serveur qui ignorerait l'en-tête Range renverrait les
// 31 Mo : refusé avant lecture du corps.
async function plage(url: string, debut: number, fin: number): Promise<{ texte: string; taille: number }> {
  const r = await fetch(url, { headers: { Range: `bytes=${debut}-${fin}` } });
  if (r.status !== 206) {
    try { await r.body?.cancel(); } catch { /* corps déjà fermé */ }
    throw new Error(`plage ${r.status} ${url}`);
  }
  const total = Number(/\/(\d+)$/.exec(r.headers.get('content-range') || '')?.[1] || 0);
  return { texte: latin1.decode(await r.arrayBuffer()), taille: total };
}

// Fin de fichier (suffixe), pour les derniers jours d'une année close.
async function finDeFichier(url: string, octets: number): Promise<string> {
  const r = await fetch(url, { headers: { Range: `bytes=-${octets}` } });
  if (r.status !== 206) {
    try { await r.body?.cancel(); } catch { /* corps déjà fermé */ }
    throw new Error(`fin ${r.status} ${url}`);
  }
  return latin1.decode(await r.arrayBuffer());
}

function lignesCsv(t: string): string[][] {
  return t.split(/\r?\n/).filter(Boolean).map((l) => l.split(';'));
}

// Petit cache de la fonction chaude : les métadonnées changent rarement.
const memo = new Map<string, { jusqua: number; valeur: Promise<unknown> }>();
function memoise<T>(cle: string, dureeMs: number, f: () => Promise<T>): Promise<T> {
  const e = memo.get(cle);
  if (e && e.jusqua > Date.now()) return e.valeur as Promise<T>;
  const valeur = f().catch((err) => { memo.delete(cle); throw err; });
  memo.set(cle, { jusqua: Date.now() + dureeMs, valeur });
  return valeur;
}

type Point = { id: number; nom: string; npa: string; altitude: number | null; est: number; nord: number };
type Station = { abbr: string; nom: string; altitude: number | null; est: number; nord: number };

function metaPoints(): Promise<Map<string, Point[]>> {
  return memoise('points', 24 * 3600e3, async () => {
    const [tete, ...lignes] = lignesCsv(await texte(META_POINTS));
    const c = (n: string) => tete.indexOf(n);
    const iId = c('point_id'), iType = c('point_type_id'), iNpa = c('postal_code');
    const iNom = c('point_name'), iAlt = c('point_height_masl');
    const iE = c('point_coordinates_lv95_east'), iN = c('point_coordinates_lv95_north');
    const parNpa = new Map<string, Point[]>();
    for (const l of lignes) {
      if (Number(l[iType]) !== TYPE_NPA || !l[iNpa]) continue;
      const p: Point = {
        id: Number(l[iId]), nom: l[iNom], npa: l[iNpa],
        altitude: l[iAlt] ? Math.round(Number(l[iAlt])) : null,
        est: Number(l[iE]), nord: Number(l[iN]),
      };
      if (!parNpa.has(p.npa)) parNpa.set(p.npa, []);
      parNpa.get(p.npa)!.push(p);
    }
    return parNpa;
  });
}

function metaStations(): Promise<Station[]> {
  return memoise('stations', 24 * 3600e3, async () => {
    const [tete, ...lignes] = lignesCsv(await texte(META_STATIONS));
    const c = (n: string) => tete.indexOf(n);
    const iA = c('station_abbr'), iNom = c('station_name'), iAlt = c('station_height_masl');
    const iE = c('station_coordinates_lv95_east'), iN = c('station_coordinates_lv95_north');
    return lignes
      .filter((l) => l[iA] && l[iE] && l[iN])
      .map((l) => ({
        abbr: l[iA], nom: l[iNom],
        altitude: l[iAlt] ? Math.round(Number(l[iAlt])) : null,
        est: Number(l[iE]), nord: Number(l[iN]),
      }));
  });
}

// Le point d'un NPA : le centre « NPA00 » s'il existe, sinon le premier
// point publié pour ce NPA (1966 Ayent n'a que ses villages, 196602 et
// suivants).
function pointDuNpa(points: Point[]): Point {
  const centre = points.find((p) => p.id % 100 === 0);
  return centre || [...points].sort((a, b) => a.id - b.id)[0];
}

// ── Prévision : dernière heure de calcul complète ───────────────────

type Run = { run: string; fichiers: Record<string, string> };

async function runsDisponibles(): Promise<Run[]> {
  return memoise('runs', 10 * 60e3, async () => {
    const runs: Run[] = [];
    for (const recul of [0, 1]) {
      const jour = new Date(Date.now() - recul * 86400e3).toISOString().slice(0, 10).replace(/-/g, '');
      const r = await fetch(`${STAC_ITEMS}${jour}-ch`);
      if (!r.ok) continue;
      const item = await r.json() as { assets?: Record<string, { href: string }> };
      const parRun = new Map<string, Record<string, string>>();
      for (const [cle, a] of Object.entries(item.assets || {})) {
        const m = /^vnut12\.lssw\.(\d{12})\.([a-z0-9]+)\.csv$/.exec(cle);
        if (!m) continue;
        if (!parRun.has(m[1])) parRun.set(m[1], {});
        parRun.get(m[1])![m[2]] = a.href;
      }
      for (const [run, fichiers] of parRun) {
        if ([...HORAIRES, ...JOURNALIERS].every((p) => fichiers[p])) runs.push({ run, fichiers });
      }
    }
    if (!runs.length) throw new Error('aucune prévision publiée');
    return runs.sort((a, b) => b.run.localeCompare(a.run));
  });
}

// Clé de tri d'une ligne « point_id;point_type_id;date;valeur ».
function cleLigne(l: string): [number, number] | null {
  const [id, type] = l.split(';');
  const a = Number(type), b = Number(id);
  return Number.isFinite(a) && Number.isFinite(b) && id !== '' ? [a, b] : null;
}
const avant = (k: [number, number], cible: [number, number]) => k[0] < cible[0] || (k[0] === cible[0] && k[1] < cible[1]);

// Lignes d'un point. Petit fichier : lu en entier. Gros fichier trié par
// point : dichotomie sur les octets. Gros fichier trié par heure : refusé.
async function lignesDuPoint(url: string, pointId: number): Promise<string[][]> {
  const cible: [number, number] = [TYPE_NPA, pointId];
  const premier = await plage(url, 0, BLOC - 1);
  const taille = premier.taille;
  if (!taille) throw new Error(`taille inconnue ${url}`);
  if (taille <= LECTURE_ENTIERE) {
    return lignesCsv(await texte(url)).filter((l) => {
      const k = cleLigne(l.join(';'));
      return k !== null && k[0] === cible[0] && k[1] === cible[1];
    });
  }
  const [, l1, l2] = premier.texte.split(/\r?\n/);
  if (!l1 || !l2 || l1.split(';')[0] !== l2.split(';')[0]) throw new Error(`fichier trié par heure ${url}`);
  let bas = premier.texte.indexOf('\n') + 1;   // après l'en-tête
  let haut = taille;
  // Invariant : toute ligne qui commence avant « bas » précède le point ;
  // la première ligne du point commence avant « haut ».
  while (haut - bas > BLOC) {
    const milieu = Math.floor((bas + haut) / 2);
    const { texte: t } = await plage(url, milieu, milieu + BLOC - 1);
    const debut = t.indexOf('\n') + 1;
    const fin = t.indexOf('\n', debut);
    const k = debut > 0 && fin > debut ? cleLigne(t.slice(debut, fin)) : null;
    if (!k) { haut = milieu; continue; }
    if (avant(k, cible)) bas = milieu + debut; else haut = milieu;
  }
  // Lecture du bloc du point, prolongée tant qu'il continue.
  const lignes: string[][] = [];
  let pos = bas;
  for (let tour = 0; tour < 8 && pos < taille; tour += 1) {
    const { texte: t } = await plage(url, pos, Math.min(taille - 1, pos + 4 * BLOC - 1));
    // Une lecture qui s'arrête avant la fin du fichier coupe sa dernière
    // ligne : elle sera relue au tour suivant.
    const finFichier = pos + t.length >= taille;
    const coupe = finFichier ? t.length : t.lastIndexOf('\n');
    if (coupe < 0) break;
    let fini = false;
    for (const l of t.slice(0, coupe).split(/\r?\n/)) {
      const k = cleLigne(l);
      if (!k) continue;
      if (avant(k, cible)) continue;
      if (k[0] !== cible[0] || k[1] !== cible[1]) { fini = true; break; }
      lignes.push(l.split(';'));
    }
    if (fini || finFichier) break;
    pos += coupe + 1;
  }
  return lignes;
}

const nombre = (v: string | undefined) => (v === undefined || v === '' ? null : Number(v));

async function prevision(pointId: number) {
  const runs = await runsDisponibles();
  let derniereErreur: unknown = null;
  // La dernière heure de calcul peut être en cours de dépôt : on recule
  // d'une heure, deux au plus, si le point y manque.
  for (const { run, fichiers } of runs.slice(0, 3)) {
    try {
      const params = [...HORAIRES, ...JOURNALIERS];
      // Les précipitations sont indispensables ; un autre paramètre illisible
      // laisse sa colonne vide.
      const lus = await Promise.allSettled(params.map((p) => lignesDuPoint(fichiers[p], pointId)));
      const series = lus.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        if (params[i] === 'rre150h0' || params[i] === 'rka150p0') throw r.reason;
        return [] as string[][];
      });
      const parParam = Object.fromEntries(params.map((p, i) => [p, new Map(series[i].map((l) => [l[2], nombre(l[3])]))]));
      if (!series[0].length) throw new Error(`point ${pointId} absent du calcul ${run}`);
      const heures = [...parParam.rre150h0.keys()].sort().map((t) => [
        t, ...HORAIRES.map((p) => parParam[p].get(t) ?? null),
      ]);
      const jours = [...parParam.rka150p0.keys()].sort().map((t) => [
        `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`,
        ...JOURNALIERS.map((p) => parParam[p].get(t) ?? null),
      ]);
      return { run, heures, jours };
    } catch (e) {
      derniereErreur = e;
    }
  }
  throw derniereErreur || new Error('prévision illisible');
}

// ── Précipitations passées : station la plus proche ─────────────────

const ISO_CH = /^(\d{2})\.(\d{2})\.(\d{4})/;

function precipitations(t: string, iDate: number, iPluie: number): Array<[string, number]> {
  const sortie: Array<[string, number]> = [];
  for (const l of lignesCsv(t)) {
    const m = ISO_CH.exec(l[iDate] || '');
    const v = nombre(l[iPluie]);
    if (m && v !== null && Number.isFinite(v)) sortie.push([`${m[3]}-${m[2]}-${m[1]}`, v]);
  }
  return sortie;
}

async function historique(point: Point) {
  const stations = (await metaStations())
    .map((s) => ({ ...s, distance: Math.hypot(s.est - point.est, s.nord - point.nord) }))
    .filter((s) => s.distance <= DISTANCE_MAX_M)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
  for (const s of stations) {
    const a = s.abbr.toLowerCase();
    const dossier = `${BASE}/${SMN}/${a}/ogd-smn_${a}`;
    let recent: string;
    try { recent = await texte(`${dossier}_d_recent.csv`); } catch { continue; }
    const tete = recent.slice(0, recent.indexOf('\n')).split(';');
    const iDate = tete.indexOf('reference_timestamp');
    const iPluie = tete.indexOf('rre150d0');
    if (iDate < 0 || iPluie < 0) continue;
    let jours = precipitations(recent, iDate, iPluie);
    // Début d'année : le fichier « recent » commence au 1er janvier.
    if (jours.length < JOURS_HISTO) {
      try {
        const queue = await finDeFichier(`${dossier}_d_historical.csv`, 40000);
        const anciens = precipitations(queue.slice(queue.indexOf('\n') + 1), iDate, iPluie);
        const premier = jours[0]?.[0] || '9999';
        jours = [...anciens.filter(([d]) => d < premier), ...jours];
      } catch { /* l'historique récent suffit à ce qu'il couvre */ }
    }
    if (!jours.length) continue;
    return {
      station: { abbr: s.abbr, nom: s.nom, altitude: s.altitude, distanceKm: Math.round(s.distance / 100) / 10 },
      historique: jours.slice(-JOURS_HISTO),
    };
  }
  return { station: null, historique: [] };
}

// ── Route ────────────────────────────────────────────────────────────

function lireNpa(req: Req): string {
  const q = req.query?.npa;
  const brut = Array.isArray(q) ? q[0] : q;
  if (brut) return String(brut).trim();
  try {
    return (new URL(req.url || '', 'http://x').searchParams.get('npa') || '').trim();
  } catch {
    return '';
  }
}

function json(res: Res, code: number, corps: unknown, cache: string) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  return res.status(code).send(JSON.stringify(corps));
}

export default async function handler(req: Req, res: Res) {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { erreur: 'methode' }, 'no-store');
  }
  const npa = lireNpa(req);
  if (!NPA.test(npa)) return json(res, 400, { erreur: 'npa_invalide' }, 'no-store');
  try {
    const points = (await metaPoints()).get(npa);
    if (!points?.length) {
      return json(res, 404, { erreur: 'npa_inconnu' }, 'public, max-age=3600, s-maxage=86400');
    }
    const point = pointDuNpa(points);
    const [prev, passe] = await Promise.all([
      prevision(point.id),
      historique(point).catch(() => ({ station: null, historique: [] })),
    ]);
    return json(res, 200, {
      source: 'MeteoSwiss',
      run: prev.run,
      point: { id: point.id, nom: point.nom, npa: point.npa, altitude: point.altitude },
      heures: prev.heures,
      jours: prev.jours,
      station: passe.station,
      historique: passe.historique,
    }, 'public, max-age=1800, s-maxage=3600, stale-while-revalidate=21600');
  } catch (e) {
    console.error('[api/meteo]', e);
    return json(res, 502, { erreur: 'meteo_indisponible' }, 'no-store');
  }
}
