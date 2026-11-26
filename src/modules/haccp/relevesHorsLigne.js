// ─────────────────────────────────────────────────────────────
// Relevés de température sans réseau : logique pure (lot 08).
//
// Aucun import de service ni de composant : ce fichier se teste sous
// `node --test` (relevesHorsLigne.test.mjs). La file IndexedDB vit dans
// src/services/offline/haccpReleveQueue.js, le rejeu dans haccpReleveSync.js.
//
// Un relevé est une ligne neuve, jamais une mise à jour : il se rejoue sans
// arbitrage. Son `id`, créé sur l'appareil, sert de clé d'idempotence (le
// rejeu insère « si absent »), et sa date et son heure sont celles du geste.
// ─────────────────────────────────────────────────────────────

// Erreurs passagères : la file reste intacte, on retentera.
const CODES_RETENTABLES = new Set(['PGRST202', 'PGRST301']);
// Refus définitifs de la base : droits, zone ou établissement disparu,
// valeur refusée par une contrainte.
const CODES_REFUSES = new Set(['42501', '23503', '23514']);
export const MAX_TENTATIVES = 10;

export function nouvelIdReleve(uuid) {
  return `hr-${uuid}`;
}

// Élément de la file : le relevé tel qu'il partira, plus ce qu'il faut pour
// le rejouer sous le bon compte et le nommer dans un avis.
export function elementDeFile(releve, { userId, maintenantMs, zoneNom = '' }) {
  return {
    id: releve.id,
    etablissementId: releve.etablissementId,
    zoneId: releve.zoneId,
    date: releve.date,
    heure: releve.heure,
    valeur: releve.valeur,
    operateur: releve.operateur || null,
    conforme: releve.conforme,
    commentaire: releve.commentaire || '',
    zoneNom: zoneNom || '',
    userId,
    createdAt: maintenantMs,
    attempts: 0,
  };
}

// Relevé affichable à partir d'un élément de la file.
function releveDeElement(el) {
  return {
    id: el.id,
    etablissementId: el.etablissementId,
    zoneId: el.zoneId,
    date: el.date,
    heure: el.heure,
    valeur: el.valeur,
    operateur: el.operateur,
    conforme: el.conforme,
    commentaire: el.commentaire || '',
    enAttente: true,
  };
}

// Même ordre que listHaccpReleves : date puis heure décroissantes, puis id.
function comparer(a, b) {
  return String(b.date || '').localeCompare(String(a.date || ''))
    || String(b.heure || '').localeCompare(String(a.heure || ''))
    || String(a.id || '').localeCompare(String(b.id || ''));
}

// Liste affichée : le serveur gagne sur un `id` commun. Les relevés écrits en
// ligne pendant la session s'ajoutent tant que le serveur ne les rend pas
// encore (lecture servie par le cache), ceux de la file portent `enAttente`.
export function fusionnerEnAttente(relevesServeur, enAttente, etabId, ecritsSession = []) {
  const vus = new Set();
  const sortie = [];
  for (const r of relevesServeur || []) {
    if (!r || vus.has(r.id)) continue;
    vus.add(r.id);
    sortie.push(r);
  }
  for (const r of ecritsSession || []) {
    if (!r || vus.has(r.id)) continue;
    if (etabId && r.etablissementId && r.etablissementId !== etabId) continue;
    vus.add(r.id);
    sortie.push(r);
  }
  for (const el of enAttente || []) {
    if (!el || vus.has(el.id) || el.etablissementId !== etabId) continue;
    vus.add(el.id);
    sortie.push(releveDeElement(el));
  }
  return sortie.sort(comparer);
}

// Erreur réseau (fetch échoué, délai dépassé) : pas de code PostgREST.
export function estErreurReseau(error) {
  return !!error && !error.code;
}

export function issueRejeu(error, attempts = 0) {
  if (!error) return 'envoye';
  if (estErreurReseau(error) || CODES_RETENTABLES.has(error.code)) return 'reessayer';
  if (CODES_REFUSES.has(error.code)) return 'refuse';
  if ((attempts || 0) + 1 >= MAX_TENTATIVES) return 'refuse';
  return 'tentative';
}

// Rejoue la file dans l'ordre des gestes. Une panne réseau arrête tout sans
// rien toucher ; une erreur inconnue compte une tentative ; un refus retire
// l'élément et prévient (jamais de disparition en silence).
export async function rejouerFile({ elements, envoyer, retirer, garder, avertir }) {
  const ordre = [...(elements || [])].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  let envoyes = 0;
  let refuses = 0;
  let restants = 0;
  for (let i = 0; i < ordre.length; i += 1) {
    const el = ordre[i];
    let error = null;
    try {
      const res = await envoyer(el);
      error = res?.error || null;
    } catch (err) {
      error = err || new Error('envoi impossible');
    }
    const issue = issueRejeu(error, el.attempts || 0);
    if (issue === 'reessayer') {
      restants += ordre.length - i;
      break;
    }
    if (issue === 'envoye') {
      await retirer(el.id);
      envoyes += 1;
    } else if (issue === 'tentative') {
      await garder({ ...el, attempts: (el.attempts || 0) + 1 });
      restants += 1;
    } else {
      await retirer(el.id);
      refuses += 1;
      await avertir(el, error);
    }
  }
  return { envoyes, refuses, restants };
}

// ─── Textes (D8, D9) ───

export function phraseAttente(n) {
  return n > 1
    ? `${n} relevés attendent le réseau. Ils partiront seuls.`
    : `${n} relevé attend le réseau. Il partira seul.`;
}

// Toast d'un lot parti en file. `horsPlage` reprend la fin du toast en ligne.
export function phraseGardes(n, heure, horsPlage = 0) {
  const base = n > 1
    ? `${n} relevés gardés sur cet appareil à ${heure}`
    : `${n} relevé gardé sur cet appareil à ${heure}`;
  const alerte = horsPlage > 0 ? `, ${horsPlage} trop chaud ou trop froid : prévenez le chef` : '';
  const suite = n > 1 ? 'Ils partiront au retour du réseau.' : 'Il partira au retour du réseau.';
  return `${base}${alerte}. ${suite}`;
}

function dateCourte(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
  return m ? `${m[3]}.${m[2]}` : String(date || '');
}

function valeurLisible(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '');
  return String(n).replace('.', ',');
}

export function phraseRefus(element) {
  const zone = element?.zoneNom || 'zone inconnue';
  const heure = String(element?.heure || '').slice(0, 5);
  return `Le relevé hors ligne du ${dateCourte(element?.date)} à ${heure} (${zone} : ${valeurLisible(element?.valeur)} °C) n'a pas été enregistré. Notez-le à la main et prévenez le chef.`;
}
