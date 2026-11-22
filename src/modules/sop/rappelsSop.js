// ─────────────────────────────────────────────────────────────────────────────
// Rappels des procédures dans « À faire maintenant » (plan 15, lot 5), logique
// pure : testée par node --test (rappelsSop.test.mjs).
//
// Une procédure dont le rappel est allumé (Réglages > SOP, colonnes de sops du
// lot 2a) apparaît chez la personne qui est au planning ce jour-là, à son rôle
// (rôles désignés, vide = toute l'équipe), un jour de rappel (null = tous), au
// moment réglé. Le moment se lit sur les horaires du jour :
//   - à l'ouverture : chez qui commence le plus tôt dans la maison, de
//     30 minutes avant ce début à 2 heures après ;
//   - avant le service : au début de l'horaire de la personne, de 30 minutes
//     avant à 1 heure après ;
//   - après le service : à la fin de son horaire, d'1 heure avant à
//     30 minutes après ;
//   - à la fermeture : chez qui finit le plus tard, d'1 heure avant cette fin
//     à 30 minutes après ;
//   - à une heure : pendant 2 heures, chez qui travaille à cette heure.
// Une procédure terminée aujourd'hui (par n'importe qui) ne revient pas. Une
// exécution commencée par la personne et pas finie se reprend, toute la
// journée, là où elle s'est arrêtée.
// ─────────────────────────────────────────────────────────────────────────────

const enMinutes = (h) => {
  const m = /^(\d{2}):(\d{2})/.exec(String(h || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Début et fin d'un horaire en minutes ; une fin après minuit passe au-delà
// de 24 h.
function bornes(s) {
  const debut = enMinutes(s?.debut);
  let fin = enMinutes(s?.fin);
  if (debut == null || fin == null) return null;
  if (fin <= debut) fin += 24 * 60;
  return { debut, fin };
}

// Jour de la semaine ISO (lundi = 1, dimanche = 7) d'une date « AAAA-MM-JJ ».
export function jourSemaineIso(jour) {
  const [y, m, d] = String(jour).split('-').map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

export const LIBELLES_MOMENT = {
  ouverture: "À faire à l'ouverture",
  avant_service: 'À faire avant le service',
  apres_service: 'À faire après le service',
  fermeture: 'À faire à la fermeture',
  heure: 'À faire à',
};

// La fenêtre du rappel pour cette personne, ou null s'il ne la concerne pas.
export function fenetreRappel(sop, mesHoraires, horairesDuJour) {
  const tous = horairesDuJour.map(bornes).filter(Boolean);
  const miens = mesHoraires.map(bornes).filter(Boolean);
  if (!miens.length) return null;
  switch (sop.rappelMoment) {
    case 'ouverture': {
      const tot = Math.min(...tous.map((b) => b.debut));
      return miens.some((b) => b.debut === tot) ? { debut: tot - 30, fin: tot + 120 } : null;
    }
    case 'fermeture': {
      const tard = Math.max(...tous.map((b) => b.fin));
      return miens.some((b) => b.fin === tard) ? { debut: tard - 60, fin: tard + 30 } : null;
    }
    case 'avant_service': {
      const b = miens.slice().sort((x, y) => x.debut - y.debut)[0];
      return { debut: b.debut - 30, fin: b.debut + 60, plusieurs: miens.map((x) => ({ debut: x.debut - 30, fin: x.debut + 60 })) };
    }
    case 'apres_service': {
      const b = miens.slice().sort((x, y) => x.fin - y.fin)[0];
      return { debut: b.fin - 60, fin: b.fin + 30, plusieurs: miens.map((x) => ({ debut: x.fin - 60, fin: x.fin + 30 })) };
    }
    case 'heure': {
      const h = enMinutes(sop.rappelHeure);
      if (h == null) return null;
      return miens.some((b) => h >= b.debut - 30 && h <= b.fin) ? { debut: h, fin: h + 120 } : null;
    }
    default:
      return null;
  }
}

const dans = (f, maintenant) => maintenant >= f.debut && maintenant <= f.fin;

// Les rappels à montrer maintenant.
//   sops        : procédures du pont (mapSopFromDB)
//   executions  : exécutions du jour (mapSopExecFromDB)
//   shifts      : horaires (mapShiftFromDB), au moins ceux du jour
//   userId, role, jour (« AAAA-MM-JJ », Zurich), maintenant (minutes, Zurich)
// Rend [{ sop, exec, enCours, retard, detail }], les reprises d'abord.
export function rappelsDuJour({ sops, executions, shifts, userId, role, jour, maintenant }) {
  const duJour = (shifts || []).filter((s) => s?.date === jour);
  const miens = duJour.filter((s) => s.userId === userId);
  const jourIso = jourSemaineIso(jour);
  const execsJour = (executions || []).filter((e) => String(e.dateExecution || '').slice(0, 10) === jour);
  const terminees = new Set(execsJour.filter((e) => e.statut === 'terminee').map((e) => e.sopId));
  const out = [];
  (sops || []).forEach((sop) => {
    if (!sop || sop.actif === false || sop.isTemplate) return;
    if (terminees.has(sop.id)) return;
    const enCours = execsJour
      .filter((e) => e.sopId === sop.id && e.statut === 'en_cours' && e.operateurId === userId)
      .sort((a, b) => String(b.heureDebut || '').localeCompare(String(a.heureDebut || '')))[0];
    if (enCours) {
      out.push({ sop, exec: enCours, enCours: true, retard: false, detail: 'Commencée, à reprendre où vous en étiez' });
      return;
    }
    if (!sop.rappelActif || !sop.rappelMoment) return;
    if (Array.isArray(sop.rolesDesignes) && sop.rolesDesignes.length && !sop.rolesDesignes.includes(role)) return;
    if (Array.isArray(sop.rappelJours) && sop.rappelJours.length && !sop.rappelJours.includes(jourIso)) return;
    const f = fenetreRappel(sop, miens, duJour);
    if (!f) return;
    const fenetres = f.plusieurs || [f];
    const active = fenetres.find((x) => dans(x, maintenant));
    if (!active) return;
    const detail = sop.rappelMoment === 'heure'
      ? `${LIBELLES_MOMENT.heure} ${String(sop.rappelHeure || '').slice(0, 5)}`
      : LIBELLES_MOMENT[sop.rappelMoment];
    out.push({ sop, exec: null, enCours: false, retard: maintenant - active.debut > 60, detail });
  });
  return out.sort((a, b) => Number(b.enCours) - Number(a.enCours));
}
