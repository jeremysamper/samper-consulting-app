// ─────────────────────────────────────────────────────────────────────────────
// Contrôles du temps de travail sur les horaires PRÉVUS (18.11.2026), réglés
// dans Réglages > Planning > Temps de travail (reglages_maison.temps_travail).
// Ils signalent, ils ne bloquent jamais : le planning reste libre, la case dit
// ce qui est à vérifier.
//
//   repos     moins de reposMinH heures entre la fin d'une journée et le début
//             de la suivante (LTr art. 15a : 11 h) ; signalé sur la journée
//             qui commence trop tôt ;
//   pause     pauses et coupures du jour plus courtes que la loi pour la durée
//             travaillée (LTr art. 15 : 15 min au-delà de 5 h 30, 30 min
//             au-delà de 7 h, 1 h au-delà de 9 h) ;
//   journee   plus de journeeMaxH heures travaillées dans le jour ;
//   semaine   plus de semaineMaxH heures dans la semaine (lundi à dimanche),
//             signalé sur le dernier horaire de la semaine ;
//   repos_semaine  moins de joursReposSemaine jours sans horaire dans une
//             semaine entière de la période regardée.
//
// Durées : dureeMinutes (dureeHoraire.js), seule règle de durée de l'app. Une
// fin avant le début tombe le lendemain. Pur, testé par tempsTravail.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────

import { dureeMinutes } from './dureeHoraire.js';

const enMinutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const numeroJour = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const versIso = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const lundiDe = (iso) => {
  const n = numeroJour(iso);
  const j = new Date(n * 86400000).getUTCDay();
  return n - (j === 0 ? 6 : j - 1);
};
const h = (minutes) => {
  const heures = Math.floor(minutes / 60);
  const reste = Math.round(minutes % 60);
  return reste ? `${heures} h ${String(reste).padStart(2, '0')}` : `${heures} h`;
};

// Pause exigée par la loi pour une durée travaillée (minutes).
export function pauseExigee(minutesTravaillees) {
  if (minutesTravaillees > 9 * 60) return 60;
  if (minutesTravaillees > 7 * 60) return 30;
  if (minutesTravaillees > 5.5 * 60) return 15;
  return 0;
}

// Les horaires d'une personne pour un jour, en minutes absolues depuis le
// numéro du jour (une fin après minuit déborde sur le lendemain).
function bornes(shift) {
  const d = enMinutes(shift.debut);
  const f = enMinutes(shift.fin);
  if (d == null || f == null || !shift.date) return null;
  const base = numeroJour(shift.date) * 1440;
  const fin = f < d ? f + 1440 : f;
  if (fin === d) return null;
  return { debut: base + d, fin: base + fin };
}

// shifts : horaires { id, userId, date, debut, fin, pause } ; regles : bloc
// tempsTravail normalisé (utils/reglagesMaison.js) ; periode : { debut, fin }
// facultative, pour les jours de repos (seules les semaines entières dedans).
// Rend une Map id d'horaire -> [{ code, libelle, valeur, phrase }] : libelle
// et phrase sont des textes fixes (seule la règle y entre, peu de variantes à
// traduire), valeur est la mesure, à poser dans un nœud data-no-translate.
export function controlesTempsTravail({ shifts, regles, periode = null }) {
  const alertes = new Map();
  if (!regles || regles.actif === false) return alertes;
  const ajouter = (id, alerte) => {
    if (!alertes.has(id)) alertes.set(id, []);
    alertes.get(id).push(alerte);
  };

  const parPersonne = new Map();
  (shifts || []).forEach((s) => {
    if (!s?.userId || !s.date) return;
    const b = bornes(s);
    if (!b) return;
    if (!parPersonne.has(s.userId)) parPersonne.set(s.userId, []);
    parPersonne.get(s.userId).push({ s, ...b, travail: dureeMinutes(s.debut, s.fin, s.pause) || 0 });
  });

  parPersonne.forEach((liste) => {
    liste.sort((a, b) => a.debut - b.debut);
    const parJour = new Map();
    liste.forEach((x) => {
      if (!parJour.has(x.s.date)) parJour.set(x.s.date, []);
      parJour.get(x.s.date).push(x);
    });
    const jours = [...parJour.keys()].sort();

    jours.forEach((date, i) => {
      const du = parJour.get(date);
      const travail = du.reduce((t, x) => t + x.travail, 0);
      const premier = du[0];
      const dernier = du[du.length - 1];

      // Pauses : pauses saisies et coupures entre deux horaires du jour.
      if (regles.pausesLoi) {
        const exigee = pauseExigee(travail);
        const pauses = du.reduce((t, x) => t + (Number(x.s.pause) || 0), 0)
          + du.slice(1).reduce((t, x, k) => t + Math.max(0, x.debut - du[k].fin), 0);
        if (exigee > pauses) {
          ajouter(dernier.s.id, { code: 'pause', libelle: 'Pause courte', valeur: `${pauses} min`, phrase: `${exigee} min de pause demandées par la loi pour cette journée` });
        }
      }

      if (regles.journeeMaxH && travail > regles.journeeMaxH * 60) {
        ajouter(dernier.s.id, { code: 'journee', libelle: 'Journée longue', valeur: h(travail), phrase: `${regles.journeeMaxH} h de travail au plus par jour` });
      }

      // Repos avec la journée précédente, si elle a été lue.
      const veille = i > 0 ? jours[i - 1] : null;
      if (veille && regles.reposMinH && numeroJour(date) - numeroJour(veille) <= 2) {
        const finVeille = Math.max(...parJour.get(veille).map((x) => x.fin));
        const repos = premier.debut - finVeille;
        if (repos >= 0 && repos < regles.reposMinH * 60) {
          ajouter(premier.s.id, { code: 'repos', libelle: 'Repos court', valeur: h(repos), phrase: `${regles.reposMinH} h de repos demandées depuis la journée précédente` });
        }
      }
    });

    // Semaines : heures et jours de repos.
    const semaines = new Map();
    jours.forEach((date) => {
      const lundi = lundiDe(date);
      if (!semaines.has(lundi)) semaines.set(lundi, []);
      semaines.get(lundi).push(date);
    });
    semaines.forEach((dates, lundi) => {
      const horaires = dates.flatMap((d) => parJour.get(d));
      const total = horaires.reduce((t, x) => t + x.travail, 0);
      const dernier = horaires[horaires.length - 1];
      if (regles.semaineMaxH && total > regles.semaineMaxH * 60) {
        ajouter(dernier.s.id, { code: 'semaine', libelle: 'Semaine longue', valeur: h(total), phrase: `${regles.semaineMaxH} h de travail au plus par semaine` });
      }
      const dimanche = versIso(lundi + 6);
      const entiere = periode && periode.debut <= versIso(lundi) && dimanche <= periode.fin;
      if (entiere && regles.joursReposSemaine && 7 - dates.length < regles.joursReposSemaine) {
        const libre = 7 - dates.length;
        ajouter(dernier.s.id, { code: 'repos_semaine', libelle: 'Jours de repos', valeur: `${libre} / 7`, phrase: regles.joursReposSemaine > 1 ? `${regles.joursReposSemaine} jours de repos demandés par semaine` : `${regles.joursReposSemaine} jour de repos demandé par semaine` });
      }
    });
  });

  return alertes;
}
