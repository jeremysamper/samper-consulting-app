// ─────────────────────────────────────────────────────────────────────────────
// Fils d'équipe de Messages (plan 15, décision D5), logique pure : testée par
// node --test (filsEquipe.test.mjs).
//
// Trois fils sur la table canaux_messages (lot H6, policies du lot 2a) :
// Cuisine (canal 'cuisine'), Salle (canal 'restaurant') et Toute l'équipe
// (canal 'tous'). La base ne laisse lire et écrire que les participants d'un
// canal (fonction canal_participant) ; PARTICIPANTS en est la copie, à tenir
// en phase avec la migration 20261122_lot2a_d5_canaux_equipe.sql. Elle ne
// sert qu'à choisir les fils montrés : la garde reste en base.
// ─────────────────────────────────────────────────────────────────────────────

export const FILS_EQUIPE = [
  { canal: 'cuisine', libelle: 'Cuisine' },
  { canal: 'restaurant', libelle: 'Salle' },
  { canal: 'tous', libelle: "Toute l'équipe" },
];

const DIRECTION = ['consultant', 'patron'];
export const PARTICIPANTS = {
  direction: DIRECTION,
  cuisine: [...DIRECTION, 'resp_cuisine', 'cuisinier'],
  restaurant: [...DIRECTION, 'serveur', 'hote'],
  reception: [...DIRECTION, 'receptionniste', 'hote'],
  etages: [...DIRECTION, 'gouvernante', 'femme_de_chambre'],
  technique: [...DIRECTION, 'technicien'],
  spa: [...DIRECTION, 'praticien_spa'],
};

export function participe(canal, role) {
  if (!role) return false;
  if (canal === 'tous') return true;
  return (PARTICIPANTS[canal] || []).includes(role);
}

export const filsDuRole = (role) => FILS_EQUIPE.filter((f) => participe(f.canal, role));
export const libelleFil = (canal) => FILS_EQUIPE.find((f) => f.canal === canal)?.libelle || canal;

// L'équipe du soir : qui travaille ce jour-là pendant le service du soir
// (horaire qui finit à 19 h ou plus tard, ou après minuit, ou qui commence à
// 16 h ou plus tard). Heures « HH:MM » du planning.
export function estDuSoir(s) {
  if (!s?.debut || !s?.fin) return false;
  return s.fin < s.debut || s.fin >= '19:00' || s.debut >= '16:00';
}

export function equipeDuSoir(shifts, jour, { sauf = null } = {}) {
  const ids = new Set();
  (shifts || []).forEach((s) => {
    if (s?.date === jour && s.userId && s.userId !== sauf && estDuSoir(s)) ids.add(s.userId);
  });
  return [...ids];
}

// Lecture par fil : user_settings, clé canaux_lus, { "<etab>:<canal>": iso }.
export const CLE_CANAUX_LUS = 'canaux_lus';
export const cleLu = (etabId, canal) => `${etabId}:${canal}`;

export function lireCanauxLus(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const out = {};
  Object.entries(o).forEach(([k, d]) => { if (typeof d === 'string' && !Number.isNaN(Date.parse(d))) out[k] = d; });
  return out;
}

// Messages d'un fil arrivés depuis la dernière lecture, écrits par d'autres.
// Jamais lu : seuls les messages du jour comptent (un fil neuf ne s'ouvre pas
// sur des dizaines de non-lus).
export function nonLusDuFil(messages, { lu = null, moi = null, depuis = null } = {}) {
  const borne = lu || depuis;
  return (messages || []).filter((m) => m.createdBy !== moi && (!borne || String(m.createdAt || '') > borne)).length;
}

// Les fils d'une personne, avec leur dernier message et leurs non-lus.
// `messages` : tous les messages lus (mapMessageCanal), du plus récent au
// plus ancien ou dans le désordre.
export function resumeFils({ role, messages, lus = {}, etabId, moi, debutJour = null }) {
  return filsDuRole(role).map((f) => {
    const duFil = (messages || []).filter((m) => m.canal === f.canal)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return {
      ...f,
      dernier: duFil[0] || null,
      nonLus: nonLusDuFil(duFil, { lu: lus[cleLu(etabId, f.canal)] || null, moi, depuis: debutJour }),
    };
  });
}

export const MAX_MESSAGE_EQUIPE = 2000;
