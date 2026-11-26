// ─────────────────────────────────────────────────────────────────────────────
// Partage des pourboires selon la règle de la maison (lot 11 du panel), sans
// React ni base (testé par node --test, pourboires.test.mjs).
//
// La règle vit dans caisse_reglages.config, clé pourboires :
//   { mode: 'egales' | 'heures' | 'cle', groupes: [{ id, part }] }
//   - groupes : les groupes du Planning retenus par la maison (planning_groupes.id) ;
//   - part    : la part du groupe en pour cent, lue en mode 'cle' seulement.
// Sans règle, rien n'est calculé : aucune clé n'est inventée par l'app.
//
// Le total partagé est celui du rapport de la caisse (rapport.moyens.pourboires),
// jamais recalculé ici. Les heures sont les heures pointées retenues de la
// période (heuresFaites), jamais les heures prévues.
//
// Calcul en centimes entiers, méthode du plus fort reste : chaque part est
// tronquée au centime, puis les centimes restants vont aux plus forts restes ;
// à égalité, au plus grand nombre d'heures, puis à l'ordre des noms, puis à
// l'identifiant. La somme des parts et du non réparti vaut le total, et deux
// calculs rendent le même résultat.
// ─────────────────────────────────────────────────────────────────────────────

export const MODES_POURBOIRES = ['egales', 'heures', 'cle'];
const MAX_GROUPES = 40;

export const PHRASES_REGLE = {
  egales: 'Les pourboires sont partagés à parts égales entre les personnes qui ont pointé sur la période.',
  heures: 'Les pourboires sont partagés selon les heures pointées de chacun.',
  cle: 'Chaque groupe reçoit sa part, puis elle est partagée selon les heures pointées de chacun.',
};
export const RAISONS = {
  sans_regle: "Aucune règle de partage n'est réglée. Vous la réglez dans Réglages, Caisse, Pourboires.",
  regle_a_revoir: 'La règle de partage ne correspond plus aux groupes du Planning. Vous la corrigez dans Réglages, Caisse, Pourboires.',
  sans_heures: 'Aucune heure pointée sur cette période. Le partage ne peut pas se calculer.',
};

const estObjet = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// Valeur brute de la config -> null (aucune règle) ou une règle propre.
// Jamais d'exception, jamais une règle inventée : un mode inconnu ou aucun
// groupe lisible rend null ; une part hors bornes est ramenée de 0 à 100.
export function lireReglePourboires(valeur) {
  if (!estObjet(valeur)) return null;
  const mode = MODES_POURBOIRES.includes(valeur.mode) ? valeur.mode : null;
  if (!mode || !Array.isArray(valeur.groupes)) return null;
  const vus = new Set();
  const groupes = [];
  valeur.groupes.forEach((g) => {
    if (!estObjet(g)) return;
    const id = String(g.id ?? '').trim().slice(0, 80);
    if (!id || vus.has(id)) return;
    vus.add(id);
    let part = null;
    if (mode === 'cle') {
      const n = Number(g.part);
      part = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
    }
    groupes.push({ id, part });
  });
  if (!groupes.length) return null;
  return { mode, groupes: groupes.slice(0, MAX_GROUPES) };
}

// La règle telle qu'elle s'écrit en base (même forme que la lecture).
export function versConfigPourboires(regle) {
  const r = lireReglePourboires(regle);
  if (!r) return null;
  return { mode: r.mode, groupes: r.groupes.map((g) => (r.mode === 'cle' ? { id: g.id, part: g.part } : { id: g.id })) };
}

// Ce qui empêche d'enregistrer un brouillon de règle, en une phrase, ou null.
export function refusReglePourboires(brouillon) {
  const groupes = (brouillon?.groupes || []).filter((g) => g && g.id);
  if (!groupes.length) return 'Cochez au moins un groupe.';
  if (brouillon.mode === 'cle') {
    const somme = groupes.reduce((s, g) => s + (Number.isFinite(Number(g.part)) ? Math.round(Number(g.part)) : 0), 0);
    if (somme !== 100) return "Les parts des groupes doivent faire 100 %.";
  }
  return null;
}

const comparerNoms = (a, b) => String(a || '').localeCompare(String(b || ''), 'fr');

// Plus fort reste : `total` centimes (entier >= 0) entre des éléments
// { poids (entier >= 0), heures, nom, id }. Rend les centimes de chacun,
// dans l'ordre reçu ; somme = total si la somme des poids est positive.
function distribuer(total, elements) {
  const somme = elements.reduce((s, e) => s + e.poids, 0);
  if (somme <= 0) return elements.map(() => 0);
  const parts = elements.map((e) => Math.floor((total * e.poids) / somme));
  const restes = elements.map((e, i) => ({ i, reste: (total * e.poids) % somme, e }));
  let manque = total - parts.reduce((s, p) => s + p, 0);
  restes.sort((a, b) => (b.reste - a.reste)
    || (b.e.heures - a.e.heures)
    || comparerNoms(a.e.nom, b.e.nom)
    || String(a.e.id).localeCompare(String(b.e.id)));
  for (const r of restes) {
    if (manque <= 0) break;
    if (r.e.poids <= 0) continue;
    parts[r.i] += 1;
    manque -= 1;
  }
  return parts;
}

const minutes = (h) => Math.max(0, Math.round((Number(h) || 0) * 60));
const fr = (c) => c / 100;

// Une personne par identifiant : heures sommées, premier nom et groupe gardés.
function fusionnerPersonnes(personnes) {
  const par = new Map();
  (personnes || []).forEach((p) => {
    if (!p || p.id == null || p.id === '') return;
    const id = String(p.id);
    const heures = Math.max(0, Number(p.heures) || 0);
    const deja = par.get(id);
    if (deja) deja.heures += heures;
    else par.set(id, { id, nom: String(p.nom ?? ''), groupeId: p.groupeId ?? null, heures });
  });
  return [...par.values()];
}

// Le partage d'une période.
//   total     : total des pourboires du rapport, en francs ;
//   regle     : la règle lue (lireReglePourboires) ou null ;
//   personnes : [{ id, nom, groupeId, heures }] qui ont pointé sur la période ;
//   groupes   : [{ id, nom }] de la maison.
export function repartirPourboires({ total, regle, personnes, groupes }) {
  const totalC = Math.round((Number(total) || 0) * 100);
  const signe = totalC < 0 ? -1 : 1;
  const absC = Math.abs(totalC);
  const rendre = (etat, extra = {}) => ({
    etat,
    total: fr(totalC),
    reparti: 0,
    nonReparti: fr(totalC),
    lignes: [],
    groupes: [],
    horsPartage: [],
    raison: RAISONS[etat] || null,
    ...extra,
  });

  if (!regle) return rendre('sans_regle');
  const maison = new Map((groupes || []).filter((g) => g && g.id != null).map((g) => [String(g.id), String(g.nom ?? '')]));
  const retenus = regle.groupes.filter((g) => maison.has(String(g.id)));
  if (!retenus.length) return rendre('regle_a_revoir');
  if (regle.mode === 'cle' && retenus.reduce((s, g) => s + (g.part || 0), 0) !== 100) return rendre('regle_a_revoir');

  const idsRetenus = new Set(retenus.map((g) => String(g.id)));
  const toutes = fusionnerPersonnes(personnes);
  const horsPartage = toutes
    .filter((p) => !idsRetenus.has(String(p.groupeId)))
    .map((p) => ({ id: p.id, nom: p.nom, heures: p.heures }))
    .sort((a, b) => comparerNoms(a.nom, b.nom) || a.id.localeCompare(b.id));
  const participants = toutes.filter((p) => idsRetenus.has(String(p.groupeId)));
  const poidsDe = (p) => (regle.mode === 'egales' ? 1 : minutes(p.heures));
  if (!participants.length || participants.every((p) => poidsDe(p) <= 0)) {
    return rendre('sans_heures', { horsPartage });
  }

  const montants = new Map();
  const groupesRendus = [];
  const enElement = (p) => ({ poids: poidsDe(p), heures: p.heures, nom: p.nom, id: p.id });

  if (regle.mode === 'cle') {
    const membres = (gid) => participants.filter((p) => String(p.groupeId) === String(gid));
    const elementsGroupes = retenus.map((g) => ({
      poids: g.part || 0,
      heures: membres(g.id).reduce((s, p) => s + p.heures, 0),
      nom: maison.get(String(g.id)),
      id: String(g.id),
    }));
    const partsGroupes = distribuer(absC, elementsGroupes);
    retenus.forEach((g, i) => {
      const liste = membres(g.id);
      const centimes = partsGroupes[i];
      const parts = distribuer(centimes, liste.map((p) => ({ ...enElement(p), poids: minutes(p.heures) })));
      parts.forEach((c, k) => montants.set(liste[k].id, c));
      groupesRendus.push({ id: String(g.id), nom: maison.get(String(g.id)), part: g.part, montant: fr(signe * centimes), personnes: liste.length });
    });
  } else {
    const parts = distribuer(absC, participants.map(enElement));
    parts.forEach((c, k) => montants.set(participants[k].id, c));
    retenus.forEach((g) => {
      const liste = participants.filter((p) => String(p.groupeId) === String(g.id));
      const c = liste.reduce((s, p) => s + (montants.get(p.id) || 0), 0);
      groupesRendus.push({ id: String(g.id), nom: maison.get(String(g.id)), part: null, montant: fr(signe * c), personnes: liste.length });
    });
  }

  const lignes = participants
    .map((p) => ({
      id: p.id, nom: p.nom, groupeId: String(p.groupeId), groupeNom: maison.get(String(p.groupeId)) || '',
      heures: p.heures, centimes: montants.get(p.id) || 0,
    }))
    .sort((a, b) => (b.centimes - a.centimes) || comparerNoms(a.nom, b.nom) || a.id.localeCompare(b.id))
    .map(({ centimes, ...l }) => ({ ...l, montant: fr(signe * centimes) }));
  const repartiC = signe * [...montants.values()].reduce((s, c) => s + c, 0);
  return {
    etat: 'ok',
    total: fr(totalC),
    reparti: fr(repartiC),
    nonReparti: fr(totalC - repartiC),
    lignes,
    groupes: groupesRendus,
    horsPartage,
    raison: null,
    mode: regle.mode,
  };
}

// « 12 h 30 » : heures décimales en heures et minutes.
export function heuresMinutes(h) {
  const m = minutes(h);
  return { h: Math.floor(m / 60), min: m % 60 };
}
