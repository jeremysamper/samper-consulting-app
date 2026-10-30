// ─────────────────────────────────────────────────────────────────────────────
// Plans de duplication du Planning : ce qui sera créé, remplacé, gardé ou
// sauté, calculé avant d'écrire. Pur, sans React : la fenêtre Dupliquer, la
// fenêtre « Dupliquer vers… » et leurs tests appellent ces fonctions, et le
// résumé lu avant de valider vient du même plan que l'écriture.
//
// Règles tenues partout :
// - conflit = chevauchement horaire, jamais « même personne, même jour » : un
//   midi et un soir coexistent (service coupé) ;
// - un horaire déjà pointé n'est jamais effacé, et rien n'est posé par-dessus ;
// - une personne absente (congé, formation, absence) ce jour-là n'en reçoit pas ;
// - les pointages ne sont jamais recopiés.
// ─────────────────────────────────────────────────────────────────────────────
import { ajouterJours, chevauche } from './planningModeles.js';
import { cleCase, estPointe } from './planningGlisser.js';

const copieDe = (src, userId, date, etablissementId) => ({
  etablissementId,
  userId,
  date,
  debut: src.debut,
  fin: src.fin,
  pause: src.pause || 0,
  poste: src.poste || '',
  typeShift: src.typeShift || 'simple',
  statut: 'confirmé',
  note: src.note || null,
  pointageDebut: null,
  pointageFin: null,
});

// Plan général. cibles(source) : les dates où recopier cet horaire, chez la
// même personne. Compteurs du résumé :
// - dejaPresents : horaires existants distincts qui ont bloqué une copie ;
// - joursAbsence : couples (personne, jour) distincts sautés (une coupure un
//   jour d'absence compte 1) ;
// - pointesGardes : horaires déjà pointés laissés en place en mode Remplacer.
export function planDuplication({ sources, cibles, existants, remplacer = false, remplacementLarge = null, estAbsent, etablissementId }) {
  const aCreer = [];
  const aSupprimer = new Set();
  const presents = new Set();
  const absences = new Set();
  const pointes = new Set();
  let doublons = 0;

  // Remplacement large (semaine) : la semaine cible de chaque personne concernée
  // repart de zéro, sauf ce qui est déjà pointé.
  if (remplacer && remplacementLarge) {
    remplacementLarge.forEach(({ userId, dates }) => {
      existants.forEach(e => {
        if (e.userId !== userId || !dates.has(e.date)) return;
        if (estPointe(e)) pointes.add(e.id); else aSupprimer.add(e.id);
      });
    });
  }

  sources.forEach(src => {
    cibles(src).forEach(date => {
      if (estAbsent && estAbsent(src.userId, date)) { absences.add(cleCase(src.userId, date)); return; }
      const enPlace = existants.filter(e => e.userId === src.userId && e.date === date && !aSupprimer.has(e.id) && chevauche(e.debut, e.fin, src.debut, src.fin));
      if (enPlace.length) {
        if (!remplacer) { enPlace.forEach(e => presents.add(e.id)); return; }
        const bloquants = enPlace.filter(estPointe);
        if (bloquants.length) { bloquants.forEach(e => pointes.add(e.id)); return; }
        enPlace.forEach(e => aSupprimer.add(e.id));
      }
      if (aCreer.some(c => c.userId === src.userId && c.date === date && chevauche(c.debut, c.fin, src.debut, src.fin))) { doublons += 1; return; }
      aCreer.push(copieDe(src, src.userId, date, etablissementId));
    });
  });

  return { sources, aCreer, aSupprimer: [...aSupprimer], dejaPresents: presents.size, joursAbsence: absences.size, pointesGardes: pointes.size, doublons };
}

// Semaines entières (ou celle d'une personne) recopiées `offsets` jours plus
// loin. En mode Remplacer, la semaine cible de chaque personne concernée repart
// de zéro (sauf le pointé).
export function planSemaines({ debutSource, offsets, existants, personneId = null, remplacer = false, estAbsent, etablissementId }) {
  // Fin de semaine calculée une fois : le filtre parcourt tout l'historique.
  const finSource = ajouterJours(debutSource, 6);
  const sources = existants.filter(s => s.date >= debutSource && s.date <= finSource && (!personneId || s.userId === personneId));
  const datesCibles = new Set();
  offsets.forEach(o => { for (let i = 0; i < 7; i += 1) datesCibles.add(ajouterJours(debutSource, o + i)); });
  const personnes = [...new Set(sources.map(s => s.userId))];
  return planDuplication({
    sources,
    cibles: (s) => offsets.map(o => ajouterJours(s.date, o)),
    existants,
    remplacer,
    remplacementLarge: personnes.map(userId => ({ userId, dates: datesCibles })),
    estAbsent,
    etablissementId,
  });
}

// « Reprendre la semaine du … » : la semaine d'avant recopiée SUR la semaine
// affichée (qui commence à `semaine`). Toujours en mode garder.
export const planReprendre = ({ semaine, existants, estAbsent, etablissementId }) =>
  planSemaines({ debutSource: ajouterJours(semaine, -7), offsets: [7], existants, estAbsent, etablissementId });

// « Copier cette semaine sur la suivante » : la semaine affichée recopiée sur
// celle d'après. Toujours en mode garder.
export const planVersSuivante = ({ semaine, existants, estAbsent, etablissementId }) =>
  planSemaines({ debutSource: semaine, offsets: [7], existants, estAbsent, etablissementId });

// « Dupliquer vers… » (mode sélection) : chaque horaire choisi recopié chez
// chaque personne et chaque jour cochés. Un horaire qui chevauche la copie est
// remplacé, SAUF s'il est déjà pointé : la copie sur ce créneau est alors
// sautée (le pointage, ce sont des heures de salaire). Un horaire qui ne
// chevauche pas est gardé ; un jour d'absence est sauté ; une case d'origine ne
// reçoit jamais de copie d'elle-même.
export function planCopieVers({ sources, userIds, dates, existants, estAbsent, etablissementId }) {
  const aCreer = [];
  const aSupprimer = new Set();
  const absences = new Set();
  const pointes = new Set();
  let doublons = 0;
  let cases = 0;

  [...userIds].forEach(userId => {
    [...dates].forEach(date => {
      if (sources.some(s => s.userId === userId && s.date === date)) return;
      if (estAbsent && estAbsent(userId, date)) { absences.add(cleCase(userId, date)); return; }
      cases += 1;
      sources.forEach(src => {
        const enPlace = existants.filter(e => e.userId === userId && e.date === date && chevauche(e.debut, e.fin, src.debut, src.fin));
        const bloquants = enPlace.filter(estPointe);
        if (bloquants.length) { bloquants.forEach(e => pointes.add(e.id)); return; }
        if (aCreer.some(c => c.userId === userId && c.date === date && chevauche(c.debut, c.fin, src.debut, src.fin))) { doublons += 1; return; }
        enPlace.forEach(e => aSupprimer.add(e.id));
        aCreer.push(copieDe(src, userId, date, etablissementId));
      });
    });
  });

  return { sources, aCreer, aSupprimer: [...aSupprimer], dejaPresents: 0, joursAbsence: absences.size, pointesGardes: pointes.size, doublons, cases };
}

// Accord d'une phrase du résumé : 0 et 1 au singulier.
export const accord = (n, un, plusieurs) => (n > 1 ? plusieurs : un);

// Le résumé lu avant de valider, en morceaux { cle, n, texte } : la fenêtre
// écrit chaque nombre dans son propre nœud, la phrase autour reste une entrée
// du glossaire. Les compteurs nuls sont omis, sauf le premier.
export function resumeDuplication(plan, {
  copies = ['horaire sera copié', 'horaires seront copiés'],
  remplaces = ['remplacé', 'remplacés'],
} = {}) {
  const parts = [{ cle: 'copies', n: plan.aCreer.length, texte: accord(plan.aCreer.length, ...copies) }];
  const ajouter = (cle, n, un, plusieurs) => { if (n > 0) parts.push({ cle, n, texte: accord(n, un, plusieurs) }); };
  ajouter('remplaces', plan.aSupprimer.length, ...remplaces);
  ajouter('presents', plan.dejaPresents || 0, 'déjà présent gardé', 'déjà présents gardés');
  ajouter('pointes', plan.pointesGardes || 0, 'déjà pointé gardé', 'déjà pointés gardés');
  ajouter('absences', plan.joursAbsence || 0, 'jour d\'absence sauté', 'jours d\'absence sautés');
  return parts;
}
