// ─────────────────────────────────────────────────────────────────────────────
// Brouillon de passation de fin de service (lot C4, 18.11.2026). Fichier pur,
// testé par brouillonPassation.test.mjs.
//
// L'app rédige à partir de ce qu'elle sait déjà du service ; la personne
// relit, corrige et enregistre. Phrases courtes et complètes, une idée par
// ligne. Rien n'est inventé : une section sans donnée ne s'écrit pas.
// ─────────────────────────────────────────────────────────────────────────────

const STATUTS_ANNULES = new Set(['annule', 'annulee', 'annulée', 'refuse', 'refusee', 'no_show', 'demande']);
const NOMS_SERVICE = { midi: 'midi', soir: 'soir', brunch: 'brunch' };

const ajouter = (jour, n) => {
  const [y, m, d] = jour.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const nombre = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const texteNombre = (v) => String(v).replace('.', ',');
// Minuscule initiale, sauf un sigle (DLC) : « Surproduction » devient « surproduction ».
const minusculeInitiale = (t) => (/^[A-ZÉ]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));
const liste = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`);

// Service de passation selon l'heure de Zurich (minutes depuis minuit) : on
// passe la main à la fin d'un service.
export function serviceDeLHeure(minutes) {
  if (minutes >= 5 * 60 && minutes < 15 * 60) return 'matin';
  if (minutes >= 15 * 60 && minutes < 18 * 60) return 'apres_midi';
  if (minutes >= 18 * 60 && minutes < 23 * 60 + 30) return 'soir';
  return 'nuit';
}

// Prochain service de réservation selon l'heure : le midi même avant 11 h
// (passation de la nuit ou du matin), le soir même avant 18 h, sinon le
// lendemain midi (passation du soir).
export function prochainService(jour, minutes) {
  if (minutes < 11 * 60) return { jour, service: 'midi' };
  if (minutes < 18 * 60) return { jour, service: 'soir' };
  return { jour: ajouter(jour, 1), service: 'midi' };
}

// pertes       : [{ produit, quantite, unite, motif }] du jour
// relevesHors  : [{ zoneNom, valeur, unite, heure }] non conformes du jour
// tachesRestantes : [titre] des tâches récurrentes du jour non cochées
// reservations : [{ nb_couverts, est_groupe, nom, statut }] du prochain service
// prochain     : { jour, service } ; aujourdhui : jour ISO
// → { texte, sections } (sections : nombre de rubriques écrites)
export function brouillonPassation({ pertes = [], relevesHors = [], tachesRestantes = [], reservations = [], prochain = null, aujourdhui = null }) {
  const lignes = [];

  const p = pertes.filter((x) => x && x.produit);
  if (p.length) {
    const items = p.slice(0, 6).map((x) => {
      const q = nombre(x.quantite);
      const quantite = q != null ? `${texteNombre(q)}${x.unite ? ` ${x.unite}` : ''} de ` : '';
      return `${quantite}${x.produit}${x.motif ? ` (${minusculeInitiale(String(x.motif))})` : ''}`;
    });
    const reste = p.length > 6 ? `, et ${p.length - 6} autres` : '';
    lignes.push(`Pertes du jour : ${liste(items)}${reste}.`);
  }

  relevesHors.slice(0, 4).forEach((r) => {
    const v = nombre(r.valeur);
    const valeur = v != null ? ` était à ${texteNombre(v)}${r.unite ? ` ${r.unite}` : ' °C'}` : ' était hors norme';
    const heure = r.heure ? ` à ${String(r.heure).slice(0, 5).replace(':', ' h ')}` : '';
    lignes.push(`${r.zoneNom || 'Un frigo'}${valeur}${heure}. Vérifiez-le au prochain relevé.`);
  });

  const t = tachesRestantes.filter(Boolean);
  if (t.length) lignes.push(`Tâches non faites : ${liste(t.slice(0, 6))}${t.length > 6 ? `, et ${t.length - 6} autres` : ''}.`);

  if (prochain) {
    const resas = reservations.filter((r) => r && !STATUTS_ANNULES.has(String(r.statut || '').toLowerCase()));
    const quand = `${prochain.jour === aujourdhui ? 'Ce' : 'Demain'} ${NOMS_SERVICE[prochain.service] || prochain.service}`;
    if (resas.length) {
      const couverts = resas.reduce((s, r) => s + (nombre(r.nb_couverts) || 0), 0);
      const groupes = resas.filter((r) => r.est_groupe);
      const detailGroupes = groupes.length
        ? `, dont ${groupes.length > 1 ? `${groupes.length} groupes` : `le groupe ${groupes[0].nom || ''}`.trim()}`
        : '';
      lignes.push(`${quand} : ${couverts} couverts réservés en ${resas.length} réservation${resas.length > 1 ? 's' : ''}${detailGroupes}.`);
    } else {
      lignes.push(`${quand} : aucune réservation pour l'instant.`);
    }
  }

  const sections = lignes.length;
  if (!sections) lignes.push('Rien de particulier à signaler pour ce service.');
  return { texte: lignes.join('\n'), sections };
}
