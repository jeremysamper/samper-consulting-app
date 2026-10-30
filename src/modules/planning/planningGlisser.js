// ─────────────────────────────────────────────────────────────────────────────
// Glisser-déposer des horaires de la grille : la règle de dépôt et les objets
// écrits. Pur, sans React : useGlisserHoraires appelle regleDepot à chaque case
// survolée, useEcrituresHoraires écrit ce que horaireDeplace et copieHoraire
// rendent.
//
// Règles tenues (dans cet ordre, voir regleDepot) :
// - même case : rien ;
// - conflit = chevauchement horaire chez la personne visée, jamais « même
//   personne, même jour » : un midi et un soir coexistent (service coupé) ;
// - un horaire déjà pointé ne se déplace pas, il se copie (sans son pointage) ;
// - un jour d'absence est permis, mais signalé.
// ─────────────────────────────────────────────────────────────────────────────
import { chevauche } from './planningModeles.js';

export const estPointe = (s) => Boolean(s && (s.pointageDebut || s.pointageFin));

// Clé d'une case de la grille (personne, jour), portée par data-planning-case.
// Une date ISO ne contient jamais « | ».
export const cleCase = (userId, date) => `${userId}|${date}`;
export const lireCase = (cle) => {
  const i = String(cle || '').lastIndexOf('|');
  if (i < 0) return null;
  return { userId: cle.slice(0, i), date: cle.slice(i + 1) };
};

// « mer. 04.11. » : le jour tel que la grille l'écrit.
export const jourCourt = (iso) => {
  const d = new Date(iso + 'T12:00:00');
  const jour = d.toLocaleDateString('fr-CH', { weekday: 'short' }).replace(/\.$/, '');
  return `${jour}. ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
};

// Id d'une copie, fabriqué sur l'appareil au format du pont (createShifts
// garde un id fourni) : la ligne optimiste a déjà son id définitif, et l'écho
// realtime de l'INSERT est dédoublonné par id.
export const idCopie = (maintenant = Date.now(), alea = Math.random()) =>
  `s${maintenant}-g${Math.floor(alea * 36 ** 6).toString(36).padStart(6, '0')}`;

const RIEN = { effet: 'rien', bloque: null, conflit: null, absence: null, etat: null };

// Ce que fait un dépôt de `horaire` sur la case `cible` ({ userId, date }).
// copie : Alt ou Ctrl tenu (ou « Copier ici » du bandeau). existants : tous
// les horaires de l'établissement, masqués compris (un horaire masqué existe
// toujours). absence : motif lisible si la personne visée est absente ce jour.
//   -> { effet: 'rien' | 'deplacer' | 'copier', bloque: null | 'chevauche' | 'pointe',
//        conflit: horaire | null, absence: motif | null, etat: null | 'ok' | 'avertir' | 'refus' }
export function regleDepot({ horaire, cible, copie = false, existants = [], absence = null }) {
  if (!horaire || !cible?.userId || !cible?.date) return RIEN;
  if (cible.userId === horaire.userId && cible.date === horaire.date) return RIEN;
  // L'horaire déplacé n'est jamais compté contre lui-même (même personne,
  // autre jour : il quitte sa case).
  const conflit = existants.find(e => e.id !== horaire.id
    && e.userId === cible.userId && e.date === cible.date
    && chevauche(e.debut, e.fin, horaire.debut, horaire.fin)) || null;
  // Le chevauchement passe avant le pointage : « Copier ici » n'est proposé
  // que si la copie est possible.
  if (conflit) return { effet: 'rien', bloque: 'chevauche', conflit, absence: null, etat: 'refus' };
  if (estPointe(horaire) && !copie) return { effet: 'rien', bloque: 'pointe', conflit: null, absence: null, etat: 'refus' };
  return { effet: copie ? 'copier' : 'deplacer', bloque: null, conflit: null, absence: absence || null, etat: absence ? 'avertir' : 'ok' };
}

// Un déplacement ne change que la personne et le jour : heures, pause, type,
// poste, statut, note et pointages restent ceux de l'horaire.
export const horaireDeplace = (horaire, cible) => ({ ...horaire, userId: cible.userId, date: cible.date });

// Une copie est un horaire neuf : mêmes heures, pause, type, poste et note,
// confirmé, jamais pointé.
export const copieHoraire = (horaire, cible, id) => ({
  id,
  etablissementId: horaire.etablissementId,
  userId: cible.userId,
  date: cible.date,
  debut: horaire.debut,
  fin: horaire.fin,
  pause: Number(horaire.pause) || 0,
  poste: horaire.poste || '',
  typeShift: horaire.typeShift || 'simple',
  statut: 'confirmé',
  note: horaire.note || '',
  pointageDebut: null,
  pointageFin: null,
});
