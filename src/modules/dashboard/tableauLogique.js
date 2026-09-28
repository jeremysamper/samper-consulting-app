// ─────────────────────────────────────────────────────────────────────────────
// Logique du tableau de bord : ce qui se passe aujourd'hui, demain, cette
// semaine, et ce qu'il reste à faire. Fonctions pures (aucun accès réseau),
// pour que l'affichage reste simple et que les règles se testent seules.
// Heures en minutes depuis minuit, heure de Zurich.
// ─────────────────────────────────────────────────────────────────────────────

import { addDays, isoDate, parseLocalDate } from '../../utils/dateHelpers.js';
import { absenceDe, absencesDuJour, couvre, metaMotif } from '../../utils/absences.js';
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

// ── Phrase d'accueil ──────────────────────────────────────────────────────
// Ce que la brigade doit savoir en arrivant, en une ligne :
// « 42 couverts ce midi et 68 ce soir. 1 groupe de 14 à 19 h. Lucas en congé. »
export function resumeDuJour({ couverts, groupes, absents, avecCouverts, nomDe }) {
  const phrases = [];
  if (avecCouverts && couverts.total > 0) {
    const parts = [];
    if (couverts.brunch) parts.push(`${couverts.brunch} au brunch`);
    if (couverts.midi) parts.push(`${couverts.midi} ce midi`);
    if (couverts.soir) parts.push(`${couverts.soir} ce soir`);
    parts[0] = parts[0].replace(/^(\d+)/, (n) => `${n} couvert${Number(n) > 1 ? 's' : ''}`);
    const liste = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}` : parts[0];
    phrases.push(`${liste}.`);
  }
  if (groupes.length === 1) {
    const g = groupes[0];
    phrases.push(`Un groupe de ${g.nbPax}${g.heure ? ` à ${heureParlee(g.heure)}` : ''}.`);
  } else if (groupes.length > 1) {
    const pax = groupes.reduce((t, g) => t + (g.nbPax || 0), 0);
    phrases.push(`${groupes.length} groupes, ${pax} personnes en tout.`);
  }
  if (absents.length) {
    const noms = absents.map((a) => nomDe(a.userId));
    const liste = noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}` : noms[0];
    const motif = absents.length === 1 && absents[0].motif !== 'absence' ? ` (${metaMotif(absents[0].motif).label.toLowerCase()})` : '';
    phrases.push(`${absents.length > 1 ? 'Absences' : 'Absence'} : ${liste}${motif}.`);
  }
  return phrases.join(' ');
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
          page: 'planning',
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
