// ─────────────────────────────────────────────────────────────────────────────
// Conformité d'un planning à la CCNT et à la loi sur le travail.
//
// Pur, sans React ni base : la grille du Planning (pastilles et panneau
// « Conformité CCNT ») et la confirmation avant enregistrement le lisent.
// Testé par conformiteCcnt.test.mjs (node --test).
//
// Sources relevées le 18.11.2026 :
//   CCNT 2017, en vigueur depuis le 1er janvier 2017 (art. 3), texte de
//   l'office de contrôle : l-gav.ch, « Convention actuelle », art. 15 et 16 ;
//   loi sur le travail (LTr, RS 822.11), OLT 1 (RS 822.111) et OLT 2
//   (RS 822.112) : fedlex.admin.ch. L'art. 23 al. 1 OLT 2 (hôtels,
//   restaurants et cafés) rend applicable l'art. 7 al. 2 OLT 2 mais pas
//   l'art. 9 OLT 2 (réduction du repos quotidien) : la règle générale de
//   l'art. 15a LTr vaut donc pour la branche.
//
// Ce qui est contrôlé : les horaires PRÉVUS (debut, fin, pause), mesurés par
// dureeHoraire.js, seule règle de durée de l'app (une fin avant le début tombe
// le lendemain, une fin égale au début vaut 0). Un horaire de durée nulle ne
// compte pas : l'horaire d'un pointage hors planning naît avec fin = début
// (migration 20260930), il ne prévoit aucun travail.
//
// Une semaine va du lundi 0 h au dimanche 24 h (art. 16 al. 1 OLT 1).
//
// Deux niveaux :
//   infraction : la règle n'est pas tenue ; l'enregistrement demande une
//                confirmation qui la nomme (aucun blocage, aucun motif stocké) ;
//   attention  : permis sous condition ou à compenser plus tard ; affiché,
//                jamais confirmé.
//
// Règles écartées faute de texte vérifié ou de donnée : voir le rapport du
// lot (journées qui débordent sur la nuit, demi-journées de repos, repos de
// 35 heures de l'art. 21 al. 2 OLT 1, jeunes travailleurs, délai de deux
// semaines de l'art. 21 ch. 1 CCNT).
//
// API pour les lots suivants (coût du personnel) : journeesDe donne, par jour,
// le travail en minutes, les pauses et l'amplitude d'une personne ; elle sert
// aussi bien un calcul de coût qu'un contrôle.
// ─────────────────────────────────────────────────────────────────────────────

import { dureeMinutes } from './dureeHoraire.js';

const JOUR = 1440;

// Seuils, en minutes.
export const SEUILS = {
  reposQuotidien: 11 * 60,       // LTr art. 15a al. 1
  reposReduit: 8 * 60,           // LTr art. 15a al. 2, une fois par semaine
  amplitude: 14 * 60,            // LTr art. 10 al. 3
  journeeSeptJours: 9 * 60,      // CCNT art. 16 ch. 3 ; OLT 2 art. 7 al. 2 let. a
  reposApresSeptJours: 83 * 60,  // CCNT art. 16 ch. 3 ; OLT 2 art. 7 al. 2 let. c
  jourEntier: 24 * 60,           // CCNT art. 16 ch. 2
  trancheSansPause: 5.5 * 60,    // LTr art. 15 al. 1 let. a ; OLT 1 art. 18 al. 2
  debutJour: 6 * 60,             // LTr art. 10 al. 1 : travail de jour dès 6 h
  finSoir: 23 * 60,              // LTr art. 10 al. 1 : travail du soir jusqu'à 23 h
};

// Chaque règle codée, avec son article et sa source.
export const REGLES = {
  // LTr art. 15a : 11 heures de repos consécutives ; réduit à 8 heures une
  // fois par semaine, si la moyenne sur deux semaines atteint 11 heures
  // (fedlex.admin.ch, RS 822.11). La moyenne n'est pas calculée : la première
  // réduction de la semaine reste un point d'attention.
  reposQuotidien: { titre: 'Repos entre deux journées', article: 'LTr art. 15a', source: 'fedlex.admin.ch, RS 822.11' },
  // CCNT art. 16 ch. 2 : au moins un jour entier de repos par semaine ;
  // ch. 3 : par dérogation, 7 jours d'affilée si la journée n'excède pas
  // 9 heures et si 83 heures de repos consécutives suivent le 7e jour
  // (l-gav.ch). OLT 2 art. 7 al. 2, applicable par l'art. 23 al. 1 OLT 2 ;
  // OLT 1 art. 21 al. 3 : pas plus de six jours consécutifs pour qui
  // travaille le dimanche (fedlex.admin.ch).
  joursConsecutifs: { titre: 'Jours de travail d\'affilée', article: 'CCNT art. 16 ch. 2 et 3', source: 'l-gav.ch ; OLT 2 art. 7 al. 2 et 23 al. 1' },
  // CCNT art. 16 ch. 2 : le jour entier de repos compte au moins 24 heures
  // consécutives (l-gav.ch).
  jourEntier: { titre: 'Jour de repos entier', article: 'CCNT art. 16 ch. 2', source: 'l-gav.ch' },
  // CCNT art. 16 ch. 1 : deux jours de repos par semaine ; ch. 5 : un jour
  // non pris se compense dans les 4 semaines, 12 en établissement saisonnier
  // (l-gav.ch).
  deuxJours: { titre: 'Deux jours de repos par semaine', article: 'CCNT art. 16 ch. 1 et 5', source: 'l-gav.ch' },
  // LTr art. 15 al. 1 : pause de 15 min au-delà de 5 h 30 de travail, 30 min
  // au-delà de 7 h, 1 h au-delà de 9 h ; OLT 1 art. 18 al. 2 : une tranche de
  // plus de 5 h 30 avant ou après une pause donne droit à une pause de plus
  // (fedlex.admin.ch). L'intervalle d'un service coupé compte comme pause.
  pauses: { titre: 'Pauses', article: 'LTr art. 15 ; OLT 1 art. 18', source: 'fedlex.admin.ch, RS 822.11 et 822.111' },
  // LTr art. 10 al. 3 : le travail de jour et du soir tient dans un espace de
  // 14 heures, pauses comprises (fedlex.admin.ch). Contrôlé seulement sur une
  // journée qui reste entre 6 h et 23 h (travail de jour et du soir, art. 10
  // al. 1).
  amplitude: { titre: 'Journée sur 14 heures au plus', article: 'LTr art. 10 al. 3', source: 'fedlex.admin.ch, RS 822.11' },
  // CCNT art. 15 ch. 1 : durée moyenne de 42 h, 43,5 h saisonnier, 45 h petit
  // établissement ; ch. 4 : les heures en plus se compensent ou se paient
  // (l-gav.ch). Une moyenne : une semaine plus longue n'est pas une infraction.
  dureeSemaine: { titre: 'Durée de la semaine', article: 'CCNT art. 15 ch. 1 et 4', source: 'l-gav.ch' },
};

// Textes fixes : la valeur chiffrée vit à part (champ valeur), pour que la
// traduction de l'écran reste sur un petit jeu de phrases.
const TEXTES = {
  reposCourt: 'La loi demande 11 heures, ou 8 heures une fois par semaine.',
  reposReduit: 'C\'est permis une fois par semaine, si la moyenne sur deux semaines atteint 11 heures.',
  reposReduitBis: 'Un seul repos de moins de 11 heures est permis par semaine.',
  septiemeOk: 'Septième jour d\'affilée : permis si chaque journée reste sous 9 heures et si 83 heures de repos suivent.',
  septiemeOkAPrevoir: 'Septième jour d\'affilée : prévoyez ensuite 83 heures de repos d\'affilée.',
  septiemeLong: 'Septième jour d\'affilée avec une journée de plus de 9 heures. Six jours au plus, sept à titre d\'exception.',
  septiemeSansRepos: 'Septième jour d\'affilée sans 83 heures de repos à la suite. Six jours au plus, sept à titre d\'exception.',
  auDela: 'Plus de sept jours de travail d\'affilée. Six jours au plus, sept à titre d\'exception.',
  sansJourEntier: 'Aucun jour de repos entier dans la semaine. Un jour d\'au moins 24 heures est obligatoire.',
  unSeulJour: 'Un seul jour de repos dans la semaine. Le second est à rendre dans les 4 semaines.',
  unSeulJourSaison: 'Un seul jour de repos dans la semaine. Le second est à rendre dans les 12 semaines.',
  pauseCourte: 'Pause trop courte pour la journée : 15 min au-delà de 5 h 30, 30 min au-delà de 7 h, 1 h au-delà de 9 h.',
  trancheSansPause: 'Un service de plus de 5 h 30 sans pause. Une pause de 15 min au moins est demandée.',
  amplitude: 'La journée doit tenir dans 14 heures, pauses comprises.',
  dureeSemaine: 'Au-delà de la moyenne de la CCNT. Les heures en plus sont à compenser ou à payer.',
};
export const TEXTES_CCNT = TEXTES;

// ── Dates et heures ──
const enMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const versNumero = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const versIso = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
export const decaler = (iso, n) => versIso(versNumero(iso) + n);
// Lundi de la semaine d'un jour ISO.
export const lundiDe = (iso) => {
  const n = versNumero(iso);
  const jourSemaine = new Date(n * 86400000).getUTCDay(); // 0 = dimanche
  return versIso(n - ((jourSemaine + 6) % 7));
};

// « 9 h », « 6 h 30 », « 45 min ».
export function libelleDuree(min) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

// ── Journées d'une personne ──
// Map jour ISO -> { date, segments, debut, fin, travail, pauses, ecarts, nuit }.
// Minutes comptées depuis 0 h du jour : une fin après minuit dépasse 1440.
// travail : pause déduite ; ecarts : intervalles d'un service coupé ;
// nuit : une part hors de 6 h à 23 h (travail de nuit, art. 10 et 16 LTr).
export function journeesDe(shifts) {
  const parDate = new Map();
  for (const s of shifts || []) {
    const d = enMinutes(s.debut);
    const f = enMinutes(s.fin);
    if (!s.date || d == null || f == null) continue;
    const travail = dureeMinutes(s.debut, s.fin, s.pause);
    if (!travail) continue;
    const seg = { debut: d, fin: f < d ? f + JOUR : f, pause: Number(s.pause) || 0, travail };
    if (!parDate.has(s.date)) parDate.set(s.date, []);
    parDate.get(s.date).push(seg);
  }
  const out = new Map();
  for (const [date, segs] of parDate) {
    segs.sort((a, b) => a.debut - b.debut);
    let fin = segs[0].fin;
    let ecarts = 0;
    for (let i = 1; i < segs.length; i += 1) {
      if (segs[i].debut > fin) ecarts += segs[i].debut - fin;
      fin = Math.max(fin, segs[i].fin);
    }
    out.set(date, {
      date,
      segments: segs,
      debut: segs[0].debut,
      fin,
      travail: segs.reduce((t, s) => t + s.travail, 0),
      pauses: segs.reduce((t, s) => t + s.pause, 0),
      ecarts,
      nuit: segs.some(s => s.debut < SEUILS.debutJour || s.fin > SEUILS.finSoir),
    });
  }
  return out;
}

// Pause demandée pour un travail du jour (LTr art. 15 al. 1).
export function pauseDemandee(travail) {
  if (travail > 9 * 60) return 60;
  if (travail > 7 * 60) return 30;
  if (travail > SEUILS.trancheSansPause) return 15;
  return 0;
}

// ── Analyse d'une personne ──
// Constats sur [debut, fin] (jours ISO) : { cle, regle, niveau, userId, date,
// portee ('jour' | 'semaine', date = lundi), valeur, texte }. Le contexte lu
// déborde de deux semaines avant et d'une semaine après, pour les jours
// d'affilée, le repos qui suit et la semaine entière.
// absences : celles de l'équipe ({ userId, dateDebut, dateFin }) ; une
// semaine qui en porte une n'est pas contrôlée sur les jours de repos.
export function analyserPersonne({ userId, shifts, absences = [], debut, fin, heuresSemaine = 42, saisonnier = false }) {
  if (!userId || !debut || !fin || debut > fin) return [];
  const ctxDebut = decaler(lundiDe(debut), -14);
  const ctxFin = decaler(fin, 8);
  const j = journeesDe((shifts || []).filter(s => s.userId === userId && s.date >= ctxDebut && s.date <= ctxFin));
  const constats = [];
  const ajouter = (regle, niveau, date, texte, valeur = null, portee = 'jour') => {
    if (portee === 'jour' && (date < debut || date > fin)) return;
    if (portee === 'semaine' && (date > fin || decaler(date, 6) < debut)) return;
    constats.push({ cle: `${regle}|${userId}|${date}`, regle, niveau, userId, date, portee, valeur, texte });
  };
  const jours = [];
  for (let d = ctxDebut; d <= ctxFin; d = decaler(d, 1)) jours.push(d);

  // Repos entre deux journées (LTr art. 15a).
  const reductions = new Map();
  for (let i = 0; i < jours.length - 1; i += 1) {
    const a = j.get(jours[i]);
    const b = j.get(jours[i + 1]);
    if (!a || !b) continue;
    const repos = Math.max(0, b.debut + JOUR - a.fin);
    if (repos >= SEUILS.reposQuotidien) continue;
    const date = jours[i + 1];
    if (repos < SEUILS.reposReduit) { ajouter('reposQuotidien', 'infraction', date, TEXTES.reposCourt, libelleDuree(repos)); continue; }
    const semaine = lundiDe(date);
    const deja = reductions.get(semaine) || 0;
    reductions.set(semaine, deja + 1);
    ajouter('reposQuotidien', deja ? 'infraction' : 'attention', date, deja ? TEXTES.reposReduitBis : TEXTES.reposReduit, libelleDuree(repos));
  }

  // Jours de travail d'affilée (CCNT art. 16 ch. 2 et 3).
  const constatsSuite = new Set();
  for (let i = 0; i < jours.length;) {
    if (!j.has(jours[i])) { i += 1; continue; }
    let k = i;
    while (k + 1 < jours.length && j.has(jours[k + 1])) k += 1;
    const suite = jours.slice(i, k + 1);
    if (suite.length >= 7) {
      const septieme = suite[6];
      let texte;
      let niveau = 'infraction';
      if (suite.length > 7) texte = TEXTES.septiemeSansRepos;
      else if (suite.some(d => j.get(d).travail > SEUILS.journeeSeptJours)) texte = TEXTES.septiemeLong;
      else {
        // Repos qui suit le 7e jour : jusqu'au prochain jour travaillé lu.
        let repos = null;
        for (let n = k + 1; n < jours.length; n += 1) {
          const prochain = j.get(jours[n]);
          if (prochain) { repos = (n - k) * JOUR + prochain.debut - j.get(septieme).fin; break; }
        }
        if (repos != null && repos < SEUILS.reposApresSeptJours) texte = TEXTES.septiemeSansRepos;
        else { niveau = 'attention'; texte = repos == null ? TEXTES.septiemeOkAPrevoir : TEXTES.septiemeOk; }
      }
      ajouter('joursConsecutifs', niveau, septieme, texte, '7 jours');
      constatsSuite.add(septieme);
      for (let n = 7; n < suite.length; n += 1) {
        ajouter('joursConsecutifs', 'infraction', suite[n], TEXTES.auDela, `${n + 1} jours`);
        constatsSuite.add(suite[n]);
      }
    }
    i = k + 1;
  }

  // Jours de repos d'une semaine (CCNT art. 16 ch. 1, 2 et 5). Un jour de
  // repos : aucun horaire n'y commence et le repos qui le couvre fait au moins
  // 24 heures (une fin de service après minuit le grignote).
  const jourDeRepos = (d) => {
    if (j.has(d)) return false;
    const veille = j.get(decaler(d, -1));
    const lendemain = j.get(decaler(d, 1));
    const finAvant = veille ? Math.max(0, veille.fin - JOUR) : 0;
    const debutApres = lendemain ? lendemain.debut + JOUR : 2 * JOUR;
    return debutApres - finAvant >= SEUILS.jourEntier;
  };
  for (let lundi = lundiDe(debut); lundi <= fin; lundi = decaler(lundi, 7)) {
    const dimanche = decaler(lundi, 6);
    const semaine = [];
    for (let n = 0; n < 7; n += 1) semaine.push(decaler(lundi, n));

    const travail = semaine.reduce((t, d) => t + (j.get(d)?.travail || 0), 0);
    if (heuresSemaine > 0 && travail > heuresSemaine * 60) {
      ajouter('dureeSemaine', 'attention', lundi, TEXTES.dureeSemaine, `${libelleDuree(travail)} / ${String(heuresSemaine).replace('.', ',')} h`, 'semaine');
    }

    const absente = absences.some(a => a.userId === userId && a.dateDebut <= dimanche && a.dateFin >= lundi);
    if (absente) continue;
    const repos = semaine.filter(jourDeRepos).length;
    if (repos === 0) {
      // Sept jours d'affilée : la règle des jours d'affilée a déjà parlé
      // (dérogation du ch. 3, ou infraction).
      if (!semaine.some(d => constatsSuite.has(d))) ajouter('jourEntier', 'infraction', lundi, TEXTES.sansJourEntier, null, 'semaine');
    } else if (repos === 1) {
      ajouter('deuxJours', 'attention', lundi, saisonnier ? TEXTES.unSeulJourSaison : TEXTES.unSeulJour, null, 'semaine');
    }
  }

  // Pauses et amplitude, journée par journée.
  for (const [date, jo] of j) {
    if (date < debut || date > fin) continue;
    const demandee = pauseDemandee(jo.travail);
    const prise = jo.pauses + jo.ecarts;
    if (prise < demandee) ajouter('pauses', 'infraction', date, TEXTES.pauseCourte, `${libelleDuree(prise)} / ${libelleDuree(jo.travail)}`);
    else if (jo.segments.some(s => s.travail > SEUILS.trancheSansPause && s.pause < 15)) ajouter('pauses', 'infraction', date, TEXTES.trancheSansPause, null);
    const amplitude = jo.fin - jo.debut;
    if (!jo.nuit && amplitude > SEUILS.amplitude) ajouter('amplitude', 'infraction', date, TEXTES.amplitude, libelleDuree(amplitude));
  }

  const ordre = { infraction: 0, attention: 1 };
  return constats.sort((a, b) => a.date.localeCompare(b.date) || ordre[a.niveau] - ordre[b.niveau] || a.regle.localeCompare(b.regle));
}

// Toute l'équipe : la liste des constats, dans l'ordre des personnes.
export function analyserEquipe({ userIds, ...reste }) {
  return (userIds || []).flatMap(userId => analyserPersonne({ userId, ...reste }));
}

// Constats rattachés à un jour, par case : Map `${userId}|${date}` -> [].
export const cleCaseCcnt = (userId, date) => `${userId}|${date}`;
export function constatsParCase(constats) {
  const out = new Map();
  for (const c of constats || []) {
    if (c.portee !== 'jour') continue;
    const cle = cleCaseCcnt(c.userId, c.date);
    if (!out.has(cle)) out.set(cle, []);
    out.get(cle).push(c);
  }
  return out;
}

// ── Avant une écriture ──
// Horaires après l'écriture : les retraits partent, les ajouts arrivent (un
// ajout qui porte l'id d'un existant le remplace : une modification).
export function appliquerProjet(existants, { ajouts = [], retraits = [] } = {}) {
  const partants = new Set([...retraits, ...ajouts.map(a => a.id)].filter(Boolean));
  return [...(existants || []).filter(s => !partants.has(s.id)), ...ajouts];
}

// Infractions que l'écriture crée : celles d'après qui n'existaient pas avant
// (même règle, même personne, même jour), autour des jours touchés. Une
// infraction déjà là ne redemande rien.
export function infractionsCreees({ existants, ajouts = [], retraits = [], absences = [], heuresSemaine = 42, saisonnier = false }) {
  const apres = appliquerProjet(existants, { ajouts, retraits });
  const partants = new Set(retraits);
  const touches = new Map();
  const toucher = (s) => {
    if (!s?.userId || !s?.date) return;
    if (!touches.has(s.userId)) touches.set(s.userId, []);
    touches.get(s.userId).push(s.date);
  };
  ajouts.forEach(toucher);
  (existants || []).filter(s => partants.has(s.id) || ajouts.some(a => a.id && a.id === s.id)).forEach(toucher);
  const out = [];
  for (const [userId, dates] of touches) {
    dates.sort();
    const debut = decaler(dates[0], -8);
    const fin = decaler(dates[dates.length - 1], 8);
    const args = { userId, absences, debut, fin, heuresSemaine, saisonnier };
    const avant = new Set(analyserPersonne({ ...args, shifts: existants }).filter(c => c.niveau === 'infraction').map(c => c.cle));
    analyserPersonne({ ...args, shifts: apres })
      .filter(c => c.niveau === 'infraction' && !avant.has(c.cle))
      .forEach(c => out.push(c));
  }
  return out;
}
