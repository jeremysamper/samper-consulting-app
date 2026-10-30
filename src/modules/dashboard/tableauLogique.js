// ─────────────────────────────────────────────────────────────────────────────
// Logique du tableau de bord : ce qui se passe aujourd'hui, demain, cette
// semaine, et ce qu'il reste à faire. Fonctions pures (aucun accès réseau),
// pour que l'affichage reste simple et que les règles se testent seules.
// Heures en minutes depuis minuit, heure de Zurich.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays, isoDate, parseLocalDate } from '../../utils/dateHelpers.js';
import { absenceDe, absencesDuJour, couvre } from '../../utils/absences.js';
import { libelleGroupe } from '../groupes/typesGroupe.js';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Tolérances : un relevé HACCP est « en retard » 30 min après l'heure de sa
// tournée ; un équipier « pas encore pointé » 15 min après son début.
export const RETARD_RELEVE_MIN = 30;
export const RETARD_POINTAGE_MIN = 15;

export const decaler = (dateISO, n) => isoDate(addDays(parseLocalDate(dateISO), n));

export function enMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export const enHeure = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// Minutes écoulées de `debut` à `fin` (en minutes depuis minuit). Une heure
// pointée par le serveur peut devancer de quelques minutes l'horloge de
// l'appareil : un écart négatif d'au plus une heure vaut 0 (jamais
// « 23 h 58 » en poste) ; au-delà, le service a passé minuit.
export function minutesEcoulees(debut, fin) {
  const ecart = fin - debut;
  if (ecart >= 0) return ecart;
  if (ecart >= -60) return 0;
  return ecart + 1440;
}

// « 2 h 14 », « 45 min »
export function duree(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

// « 19 h », « 19 h 30 » : heure parlée pour les phrases.
export function heureParlee(hhmm) {
  const min = enMinutes(hhmm);
  if (min == null) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

// « Mardi 29 septembre »
export function dateLongue(dateISO) {
  const d = parseLocalDate(dateISO);
  const nom = JOURS[d.getDay()];
  const jour = d.getDate() === 1 ? '1er' : d.getDate();
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${jour} ${MOIS[d.getMonth()]}`;
}

// « aujourd'hui », « demain », « samedi », « samedi 11 octobre » (au-delà d'une semaine)
export function jourRelatif(dateISO, aujourdhui) {
  if (dateISO === aujourdhui) return "aujourd'hui";
  if (dateISO === decaler(aujourdhui, 1)) return 'demain';
  const d = parseLocalDate(dateISO);
  const ecart = Math.round((d - parseLocalDate(aujourdhui)) / 86400000);
  if (ecart > 0 && ecart < 7) return JOURS[d.getDay()];
  return `${JOURS[d.getDay()]} ${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]}`;
}

// ── Équipe ────────────────────────────────────────────────────────────────
// État d'un horaire à l'instant t (aujourd'hui seulement).
//   termine    arrivée et départ pointés
//   en_poste   arrivée pointée
//   en_retard  début passé de plus de 15 min, pas d'arrivée
//   attendu    commence bientôt ou vient de commencer
//   prevu      plus tard dans la journée
export function etatShift(shift, maintenant) {
  if (shift.pointageDebut && shift.pointageFin) return 'termine';
  if (shift.pointageDebut) return 'en_poste';
  const debut = enMinutes(shift.debut);
  if (debut == null) return 'prevu';
  if (maintenant - debut > RETARD_POINTAGE_MIN) return 'en_retard';
  if (debut - maintenant <= 60) return 'attendu';
  return 'prevu';
}

// Horaires d'un jour, triés par heure de début.
export const shiftsDu = (shifts, dateISO) => (shifts || [])
  .filter((s) => s.date === dateISO)
  .sort((a, b) => (a.debut || '').localeCompare(b.debut || ''));

// Personnes d'un jour : un équipier en service coupé (midi + soir) n'apparaît
// qu'une fois, avec ses deux horaires.
export function equipeDu(shifts, dateISO) {
  const parPersonne = new Map();
  shiftsDu(shifts, dateISO).forEach((s) => {
    if (!parPersonne.has(s.userId)) parPersonne.set(s.userId, []);
    parPersonne.get(s.userId).push(s);
  });
  return [...parPersonne.entries()].map(([userId, liste]) => ({ userId, shifts: liste }));
}

// Service d'un horaire : le type posé au planning, sinon l'heure de début
// (avant 16 h, c'est le midi).
export function serviceDuShift(shift) {
  if (shift?.typeShift === 'midi' || shift?.typeShift === 'soir') return shift.typeShift;
  const debut = enMinutes(shift?.debut);
  return debut == null || debut < 16 * 60 ? 'midi' : 'soir';
}

// L'équipe d'un jour rangée par service : « qui est là ce soir ». Une
// personne en service coupé apparaît dans les deux groupes, chaque fois avec
// les seuls horaires de ce service. Les groupes vides sont retirés.
export function equipeParService(shifts, dateISO) {
  return ['midi', 'soir']
    .map((id) => ({ id, personnes: equipeDu(shiftsDu(shifts, dateISO).filter((s) => serviceDuShift(s) === id), dateISO) }))
    .filter((g) => g.personnes.length > 0);
}

// Prochain service d'un équipier après aujourd'hui (dans la fenêtre lue).
export function prochainShift(shifts, userId, aujourdhui) {
  return (shifts || [])
    .filter((s) => s.userId === userId && s.date > aujourdhui)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.debut || '').localeCompare(b.debut || ''))[0] || null;
}

// ── Couverts ──────────────────────────────────────────────────────────────
export function couvertsDu(couverts, dateISO) {
  const r = (couverts || []).find((c) => c.date_service === dateISO);
  const midi = Number(r?.couverts_midi) || 0;
  const soir = Number(r?.couverts_soir) || 0;
  const brunch = Number(r?.couverts_brunch) || 0;
  return { midi, soir, brunch, total: midi + soir + brunch };
}

// ── Groupes ───────────────────────────────────────────────────────────────
export const groupesDu = (groupes, dateISO) => (groupes || []).filter((g) => g.dateEvenement === dateISO);

// « Mariage n°2, 14 personnes à 19 h »
export function phraseGroupe(g) {
  const heure = g.heure ? ` à ${heureParlee(g.heure)}` : '';
  return `${libelleGroupe(g.typeGroupe, g.menuNumero)}, ${g.nbPax} personne${g.nbPax > 1 ? 's' : ''}${heure}`;
}

export const nbAllergies = (g) => (g.allergenesIds || []).length + (g.allergiesNote ? 1 : 0);

// ── État du service ───────────────────────────────────────────────────────
// La ligne d'état de l'en-tête : « Service du midi dans 1 h 10 », d'après les
// horaires de la réservation en ligne (reservation_en_ligne_parametres), seule
// heure de service connue en base. Sans réglage pour ce jour, aucune heure
// n'est inventée : la phrase dit seulement les couverts du service.
//
//   etat     a_venir | en_cours | termine | ferme | sans_heure | aucun
//   service  brunch | midi | soir (le service retenu), ou null
//   dans     minutes jusqu'au début (a_venir), sinon null
//   heure    début du service retenu (HH:MM), sinon null
//   couverts couverts réservés du service retenu
//   demain   couverts de demain par service (etat termine), sinon null
//
// Les horaires sont rangés par jour ISO (« 1 » = lundi … « 7 » = dimanche) ;
// un service se termine, estime-t-on, 90 min après la dernière arrivée.
//
// jours_fermes et services_fermes ferment la réservation EN LIGNE (vacances,
// privatisation, service complet), pas forcément le restaurant : un jour ou
// un service fermé en ligne qui a des couverts se sert quand même. Le jour
// fermé avec des couverts se dit sans compte à rebours (sans_heure) ; un
// service fermé en ligne avec des couverts reste dans la liste du jour.
export const FIN_SERVICE_APRES_MIN = 90;
const ORDRE_SERVICES = ['brunch', 'midi', 'soir'];

export function jourIso(dateISO) {
  const j = parseLocalDate(dateISO).getDay();
  return String(j === 0 ? 7 : j);
}

export function etatDuService({ couverts, couvertsDemain = null, parametres, aujourdhui, maintenant }) {
  const c = couverts || { midi: 0, soir: 0, brunch: 0, total: 0 };
  const etat = (e, extra = {}) => ({ etat: e, service: null, dans: null, heure: null, couverts: 0, demain: null, ...extra });
  const termine = () => etat('termine', { demain: couvertsDemain || { midi: 0, soir: 0, brunch: 0, total: 0 } });

  const jourFerme = Boolean(parametres && (parametres.jours_fermes || []).includes(aujourdhui));
  if (jourFerme && !c.total) return etat('ferme');

  const duJour = jourFerme ? null : (parametres?.horaires?.[jourIso(aujourdhui)] || null);
  const fermes = parametres?.services_fermes?.[aujourdhui] || [];
  const services = duJour
    ? ORDRE_SERVICES
      .filter((id) => duJour[id] && enMinutes(duJour[id].de) != null && enMinutes(duJour[id].a) != null
        && (!fermes.includes(id) || (c[id] || 0) > 0))
      .map((id) => {
        const de = enMinutes(duJour[id].de);
        let a = enMinutes(duJour[id].a);
        if (a < de) a += 1440;
        return { id, de, fin: a + FIN_SERVICE_APRES_MIN, heure: enHeure(de) };
      })
      .sort((x, y) => x.de - y.de)
    : [];

  if (services.length) {
    const s = services.find((x) => maintenant < x.fin);
    if (!s) return termine();
    if (maintenant < s.de) return etat('a_venir', { service: s.id, dans: s.de - maintenant, heure: s.heure, couverts: c[s.id] || 0 });
    return etat('en_cours', { service: s.id, heure: s.heure, couverts: c[s.id] || 0 });
  }

  // Sans horaire connu : le midi jusqu'à 15 h s'il a des couverts (ou le
  // brunch), sinon le soir jusqu'à 22 h, puis la journée est terminée.
  if (!c.total) return etat('aucun');
  if (maintenant < 15 * 60 && (c.midi || c.brunch)) {
    const service = c.midi ? 'midi' : 'brunch';
    return etat('sans_heure', { service, couverts: c[service] });
  }
  if (maintenant < 22 * 60 && c.soir) return etat('sans_heure', { service: 'soir', couverts: c.soir });
  return termine();
}

// ── Repères du jour ───────────────────────────────────────────────────────
// Les trois chiffres de l'en-tête : couverts, groupes, équipe. Chacun dit son
// chiffre et sa phrase, ou une phrase à la place du chiffre quand il n'y a
// rien (vide) ou que la lecture a échoué sans jamais aboutir (echec). Le
// détail est rendu en parties : { n } pour une valeur (nombre, heure), { t }
// pour un texte fixe, chacun dans son propre nœud pour la traduction.
export function reperesDuJour({
  couverts, groupes, equipe, absents, absencesLues, avecCouverts, avecGroupes, avecPlanning, nonLu = () => false,
}) {
  const reperes = [];
  if (avecCouverts) {
    const c = couverts || { midi: 0, soir: 0, brunch: 0, total: 0 };
    const echec = nonLu('couverts');
    const detail = [];
    [['brunch', 'au brunch'], ['midi', 'à midi'], ['soir', 'le soir']].forEach(([id, mot]) => {
      if (!c[id]) return;
      if (detail.length) detail.push({ t: ',' });
      detail.push({ n: c[id] }, { t: mot });
    });
    reperes.push({
      id: 'couverts', page: 'previsions', valeur: c.total, echec, vide: !echec && !c.total,
      libelle: c.total === 1 ? 'couvert aujourd\'hui' : 'couverts aujourd\'hui',
      texte: echec ? 'Réservations indisponibles pour l\'instant' : 'Aucune réservation aujourd\'hui',
      detail: detail.length ? detail : null,
    });
  }
  if (avecGroupes) {
    const liste = groupes || [];
    const echec = nonLu('groupes');
    const pax = liste.reduce((t, g) => t + (Number(g.nbPax) || 0), 0);
    let detail = null;
    if (liste.length === 1) {
      const g = liste[0];
      detail = g.heure ? [{ n: pax }, { t: 'personnes à' }, { n: heureParlee(g.heure) }] : [{ n: pax }, { t: 'personnes' }];
    } else if (liste.length > 1) {
      detail = [{ n: pax }, { t: 'personnes en tout' }];
    }
    reperes.push({
      id: 'groupes', page: 'groupes', valeur: liste.length, echec, vide: !echec && !liste.length,
      libelle: liste.length > 1 ? 'groupes aujourd\'hui' : 'groupe aujourd\'hui',
      texte: echec ? 'Groupes indisponibles pour l\'instant' : 'Aucun groupe aujourd\'hui',
      detail,
    });
  }
  if (avecPlanning) {
    const n = (equipe || []).length;
    const echec = nonLu('shifts');
    const nbAbs = (absents || []).length;
    let detail = null;
    if (absencesLues) detail = nbAbs ? [{ n: nbAbs }, { t: nbAbs > 1 ? 'absences' : 'absence' }] : [{ t: 'Aucune absence' }];
    reperes.push({
      id: 'equipe', page: 'planning', valeur: n, echec, vide: !echec && !n,
      libelle: n > 1 ? 'personnes au planning' : 'personne au planning',
      texte: echec ? 'Planning indisponible pour l\'instant' : 'Personne au planning aujourd\'hui',
      detail,
    });
  }
  return reperes;
}

// ── À faire ───────────────────────────────────────────────────────────────
// Liste triée du plus urgent au moins urgent. ton : danger | warning | info.
export function aFaire({
  aujourdhui, maintenant, haccp, groupes, shifts, absences, nbMessages, pertes,
  avecHaccp, avecGroupes, avecPlanning = true, direction, nomDe,
}) {
  const items = [];

  // Relevés HACCP : tournées passées de plus de 30 min et incomplètes.
  if (avecHaccp && haccp) {
    const zones = (haccp.zones || []).filter((z) => z.actif);
    const creneaux = (haccp.creneaux || []).filter((c) => c.actif)
      .sort((a, b) => (enMinutes(a.heure) ?? 0) - (enMinutes(b.heure) ?? 0));
    if (zones.length && creneaux.length) {
      const zonesIds = new Set(zones.map((z) => z.id));
      const plusProche = (heure) => {
        const cible = enMinutes(heure);
        let best = null; let dist = Infinity;
        creneaux.forEach((c) => { const d = Math.abs((enMinutes(c.heure) ?? 0) - cible); if (d < dist) { best = c; dist = d; } });
        return best;
      };
      creneaux.forEach((c) => {
        const h = enMinutes(c.heure);
        if (h == null || maintenant - h < RETARD_RELEVE_MIN) return;
        const faites = new Set();
        (haccp.releves || []).forEach((r) => {
          if (r.date === aujourdhui && zonesIds.has(r.zoneId) && plusProche(r.heure)?.id === c.id) faites.add(r.zoneId);
        });
        if (faites.size >= zones.length) return;
        items.push({
          id: `haccp-${c.id}`,
          ton: maintenant - h > 120 ? 'danger' : 'warning',
          icone: 'haccp',
          titre: `Relevé de ${c.heure} pas terminé`,
          detail: `${faites.size} zone${faites.size > 1 ? 's' : ''} sur ${zones.length}${c.label ? `, ${c.label}` : ''}`,
          page: 'haccp',
          rang: 0,
        });
      });
    }
  }

  // Groupes à lire (tous) et à préparer dans les 3 jours.
  if (avecGroupes) {
    (groupes || []).forEach((g) => {
      const quand = jourRelatif(g.dateEvenement, aujourdhui);
      const proche = g.dateEvenement <= decaler(aujourdhui, 3);
      if (g.statut === 'a_lire') {
        items.push({
          id: `groupe-${g.id}`,
          ton: proche ? 'danger' : 'warning',
          icone: 'groupe',
          titre: `Groupe à lire : ${g.nom}`,
          detail: `${phraseGroupe(g)}, ${quand}`,
          page: 'groupes',
          rang: proche ? 1 : 4,
        });
      } else if (g.statut === 'lu' && proche) {
        items.push({
          id: `groupe-${g.id}`,
          ton: 'warning',
          icone: 'groupe',
          titre: `Groupe à préparer : ${g.nom}`,
          detail: `${phraseGroupe(g)}, ${quand}`,
          page: 'groupes',
          rang: 2,
        });
      }
    });
  }

  // Direction : équipiers en retard, et horaires posés sur une absence.
  if (direction && avecPlanning) {
    shiftsDu(shifts, aujourdhui).forEach((s) => {
      if (absenceDe(absences, s.userId, aujourdhui)) {
        items.push({
          id: `conflit-${s.id}`,
          ton: 'warning',
          icone: 'equipe',
          titre: `Horaire pendant l'absence de ${nomDe(s.userId)}`,
          detail: `${s.debut} à ${s.fin} : à retirer ou à remplacer`,
          page: 'planning',
          rang: 1,
        });
      } else if (etatShift(s, maintenant) === 'en_retard') {
        items.push({
          id: `retard-${s.id}`,
          ton: 'warning',
          icone: 'equipe',
          titre: `${nomDe(s.userId)} n'a pas pointé`,
          detail: `Attendu à ${s.debut}`,
          page: 'pointage',
          rang: 3,
        });
      }
    });
  }
  if (direction) {
    const aValider = (pertes || []).filter((p) => !p.valide).length;
    if (aValider) {
      items.push({
        id: 'pertes',
        ton: 'info',
        icone: 'pertes',
        titre: `${aValider} perte${aValider > 1 ? 's' : ''} à valider`,
        detail: 'Avant la clôture du mois',
        page: 'pertes',
        rang: 6,
      });
    }
  }

  if (nbMessages > 0) {
    items.push({
      id: 'messages',
      ton: 'info',
      icone: 'messages',
      titre: `${nbMessages} message${nbMessages > 1 ? 's' : ''} non lu${nbMessages > 1 ? 's' : ''}`,
      detail: 'Dans la messagerie',
      page: 'messages',
      rang: 5,
    });
  }

  const poids = { danger: 0, warning: 1, info: 2 };
  return items.sort((a, b) => (poids[a.ton] - poids[b.ton]) || (a.rang - b.rang));
}

// ── Chiffres de gestion (direction) ──────────────────────────────────────
export function chiffresGestion({ pertes, shifts, couverts, aujourdhui }) {
  const debutMois = `${aujourdhui.slice(0, 7)}-01`;
  const duMois = (pertes || []).filter((p) => (p.date || '') >= debutMois);
  const valeurPertes = duMois.reduce((t, p) => t + (p.quantite || 0) * (p.valeurUnit || 0), 0);
  const aValider = (pertes || []).filter((p) => !p.valide).length;
  const semaine = (shifts || []).filter((s) => s.date >= aujourdhui && s.date <= decaler(aujourdhui, 6));
  const minutes = semaine.reduce((t, s) => {
    const d = enMinutes(s.debut); let f = enMinutes(s.fin);
    if (d == null || f == null) return t;
    if (f < d) f += 1440;
    return t + Math.max(0, f - d - (Number(s.pause) || 0));
  }, 0);
  const couvertsSemaine = (couverts || []).reduce((t, c) =>
    t + (Number(c.couverts_midi) || 0) + (Number(c.couverts_soir) || 0) + (Number(c.couverts_brunch) || 0), 0);
  return { valeurPertes, aValider, heures: Math.round(minutes / 6) / 10, couvertsSemaine };
}

// Absences qui touchent un jour, et celles qui commencent dans les 7 jours.
export { absencesDuJour, couvre };
export const absencesAVenir = (absences, aujourdhui) => (absences || [])
  .filter((a) => a.dateDebut > aujourdhui && a.dateDebut <= decaler(aujourdhui, 7))
  .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
