// ─────────────────────────────────────────────────────────────────────────────
// Briefing d'avant-service, salle et cuisine (lot C9 du benchmark, C3 de ce
// chantier, 18.11.2026). Fichier pur, testé par briefingLogique.test.mjs.
//
// Une page lisible en deux minutes, assemblée depuis ce que l'app sait déjà :
// les réservations du service (couverts, arrivées, groupes, notes des
// clients), l'équipe prévue et les absents, ce qu'il faut surveiller (frigo
// hors norme, passation importante). Phrases courtes et complètes ; une
// rubrique sans donnée ne s'écrit pas, rien n'est inventé.
// ─────────────────────────────────────────────────────────────────────────────

const STATUTS_ANNULES = new Set(['annule', 'annulee', 'annulée', 'refuse', 'refusee', 'no_show', 'demande']);
export const SERVICES_BRIEFING = [{ id: 'midi', label: 'Midi' }, { id: 'soir', label: 'Soir' }, { id: 'brunch', label: 'Brunch' }];

const heure = (t) => (t ? String(t).slice(0, 5).replace(':', ' h ') : '');
const minutes = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const nombre = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const liste = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`);

// Service proposé à l'ouverture : midi avant 15 h, sinon le soir.
export function serviceParDefaut(minutesZurich) {
  return minutesZurich < 15 * 60 ? 'midi' : 'soir';
}

// Un horaire est du service s'il en couvre une partie : midi et brunch de
// 11 h à 15 h, soir de 17 h 30 à 23 h. Un horaire qui finit après minuit
// compte jusqu'à minuit.
const FENETRES = { midi: [11 * 60, 15 * 60], brunch: [10 * 60, 15 * 60], soir: [17 * 60 + 30, 23 * 60] };
export function horaireDuService(h, service) {
  const [debutS, finS] = FENETRES[service] || FENETRES.soir;
  const d = minutes(h?.debut);
  let f = minutes(h?.fin);
  if (d == null || f == null) return false;
  if (f <= d) f = 24 * 60;
  return d < finS && f > debutS;
}

// reservations : [{ nb_couverts, nom, est_groupe, heure_arrivee, notes_libres, statut }]
// equipe       : [{ nom, debut, fin }] horaires du jour (déjà nommés)
// absents      : [{ nom, motif }]
// relevesHors  : [{ zoneNom, valeur, unite, heure }]
// importantes  : [texte] passations importantes du jour
// → { sections: [{ id, titre, lignes }], texte (pour la lecture à voix haute), couverts }
export function briefingService({ service = 'soir', reservations = [], equipe = [], absents = [], relevesHors = [], importantes = [] }) {
  const sections = [];

  const resas = reservations.filter((r) => r && !STATUTS_ANNULES.has(String(r.statut || '').toLowerCase()))
    .slice().sort((a, b) => String(a.heure_arrivee || '').localeCompare(String(b.heure_arrivee || '')));
  const couverts = resas.reduce((s, r) => s + (nombre(r.nb_couverts) || 0), 0);
  const lignesResas = [];
  if (resas.length) {
    const premiere = resas.find((r) => r.heure_arrivee);
    lignesResas.push(`${couverts} couverts réservés en ${resas.length} réservation${resas.length > 1 ? 's' : ''}.${premiere ? ` Premières arrivées à ${heure(premiere.heure_arrivee)}.` : ''}`);
    resas.filter((r) => r.est_groupe).forEach((r) => {
      lignesResas.push(`Groupe ${r.nom || 'sans nom'} : ${nombre(r.nb_couverts) || 0} personnes${r.heure_arrivee ? ` à ${heure(r.heure_arrivee)}` : ''}.`);
    });
    const notes = resas.filter((r) => String(r.notes_libres || '').trim());
    notes.slice(0, 8).forEach((r) => {
      const note = String(r.notes_libres).trim().replace(/\s+/g, ' ');
      lignesResas.push(`${r.nom || 'Un client'}${r.heure_arrivee ? `, ${heure(r.heure_arrivee)}` : ''} : ${note}${/[.!?]$/.test(note) ? '' : '.'}`);
    });
    if (notes.length > 8) lignesResas.push(`Et ${notes.length - 8} autres réservations avec une note.`);
  } else {
    lignesResas.push('Aucune réservation pour ce service.');
  }
  sections.push({ id: 'reservations', titre: 'Les réservations', lignes: lignesResas });

  const presents = equipe.filter((h) => horaireDuService(h, service))
    .sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
  const lignesEquipe = [];
  if (presents.length) lignesEquipe.push(`Au service : ${liste(presents.map((h) => `${h.nom} (${heure(h.debut)} à ${heure(h.fin)})`))}.`);
  if (absents.length) lignesEquipe.push(`Absents aujourd'hui : ${liste(absents.map((a) => (a.motif ? `${a.nom} (${String(a.motif).toLowerCase()})` : a.nom)))}.`);
  if (lignesEquipe.length) sections.push({ id: 'equipe', titre: "L'équipe", lignes: lignesEquipe });

  const lignesSurveiller = [];
  relevesHors.slice(0, 4).forEach((r) => {
    const v = nombre(r.valeur);
    lignesSurveiller.push(`${r.zoneNom || 'Un frigo'} était à ${v != null ? String(v).replace('.', ',') : '?'} ${r.unite || '°C'}${r.heure ? ` à ${heure(r.heure)}` : ''}. Vérifiez-le avant le service.`);
  });
  importantes.filter(Boolean).slice(0, 4).forEach((t) => {
    const texte = String(t).trim().replace(/\s+/g, ' ');
    lignesSurveiller.push(`Passation importante : ${texte}${/[.!?]$/.test(texte) ? '' : '.'}`);
  });
  if (lignesSurveiller.length) sections.push({ id: 'surveiller', titre: 'À surveiller', lignes: lignesSurveiller });

  const texte = sections.map((s) => `${s.titre}. ${s.lignes.join(' ')}`).join(' ');
  return { sections, texte, couverts };
}
