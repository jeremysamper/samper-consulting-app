// ================================================================
// Avis « plats prêts » de la caisse : les règles et le déroulé, sans
// dépendance à Deno. Importé par index.ts (action plats_prets) et essayé sous
// Node (src/modules/caisse/platsPrets.test.mjs), le déroulé sur une base en
// mémoire.
//
// Une ligne de caisse cochée au KDS (caisse_lignes.pret_at) fait un avis
// (table caisse_prets_avis). La fonction regroupe les avis d'un ticket et
// d'une suite, puis prévient la personne qui a envoyé les plats.
// ================================================================

// Les plats d'un même ticket et d'une même suite cochés dans cette fenêtre
// font un seul avis.
export const FENETRE_MS = 6000;
// Un avis qui n'a pas pu être remis au téléphone au bout de 15 minutes ne
// l'est plus : un « c'est prêt » d'il y a une heure ne sert à personne.
export const DUREE_DE_VIE_S = 15 * 60;
// Motif de vibration porté par le message. Jamais de silence forcé : le son
// reste réglé par le téléphone.
export const VIBRATION = [200, 100, 200];
// Les avis soldés sont gardés deux jours, pour comprendre un envoi manqué.
export const PURGE_MS = 2 * 24 * 3600 * 1000;

// Sujet du service de push : un message en attente est remplacé par le suivant
// de même sujet. 32 caractères au plus, lettres, chiffres, tiret et souligné.
export function sujetPush(tag) {
  return String(tag || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
}

// La suite vient en tête : « À suivre » ne remplace jamais « En direct », ni
// à l'écran (tag) ni dans la file du service de push (sujet, 32 caractères).
export function tagAvis(ticketId, suite) {
  return `pret-${suite}-${ticketId}`;
}

// Nom d'une suite : celui de la maison s'il existe, sinon En direct, À suivre,
// À suivre 2... Même règle que libelleMode (src/modules/caisse/reglages.js).
export function libelleSuite(libellesMaison, suite) {
  const n = Number(suite) || 1;
  const maison = Array.isArray(libellesMaison) ? String(libellesMaison[n - 1] || '').trim() : '';
  if (maison) return maison;
  if (n <= 1) return 'En direct';
  return n === 2 ? 'À suivre' : `À suivre ${n - 1}`;
}

function profilDe(profils, id) {
  if (!profils) return null;
  if (typeof profils.get === 'function') return profils.get(String(id)) || null;
  return profils.find((p) => String(p.id) === String(id)) || null;
}

// À qui va l'avis d'une ligne : le compte qui l'a envoyée en cuisine ; à
// défaut (ligne envoyée avant la colonne envoye_par) celui qui a ouvert le
// ticket ; à défaut personne. Quel que soit son rôle, mais seulement si son
// profil est actif et rattaché à l'établissement du ticket. Un envoyeur
// désactivé ne passe pas la main à l'ouvreur : personne n'est prévenu.
export function destinataireDe(ligne, ticket, profils, etabId) {
  const id = ligne?.envoye_par || ticket?.ouvert_par || null;
  if (!id) return null;
  const p = profilDe(profils, id);
  if (!p || p.actif === false) return null;
  if (!Array.isArray(p.etablissement_ids) || !p.etablissement_ids.includes(etabId)) return null;
  return String(id);
}

const quantite = (l) => Math.max(1, Math.round(Number(l?.quantite) || 1));
const nombre = (lignes) => lignes.reduce((s, l) => s + quantite(l), 0);
const plats = (n, pret) => (n > 1 ? `${n} plats${pret ? ' prêts' : ''}` : `1 plat${pret ? ' prêt' : ''}`);
const nomDe = (l) => {
  const q = quantite(l);
  const nom = String(l?.libelle || '').trim() || 'Plat';
  return q > 1 ? `${q} × ${nom}` : nom;
};

// Le message d'un destinataire pour une suite d'un ticket.
//   lignes    : toutes les lignes du ticket dans cette suite
//               ({ id, libelle, quantite, statut, pret_at, envoye_par }) ;
//   pour      : le destinataire ; nouvelles : ids des lignes qui viennent de
//               passer à prêt (nommées en premier).
// Titre : « Table 12 : En direct », « Vente directe : À suivre », précédé de
// TEST pour un ticket de test. Corps : « Tout est prêt (n plats) » quand toute
// la suite envoyée est prête, sinon « n plats prêts : » et trois noms au plus,
// ceux du destinataire. Jamais le nom du client, jamais un montant.
// Rend null s'il n'y a rien à dire à cette personne.
export function composerAvisPret({ ticketId, etabId, test, tableNom, suite, libellesMaison, lignes, ouvertPar, pour, nouvelles }) {
  const envoyees = (lignes || []).filter((l) => l.statut === 'envoye');
  const pretes = envoyees.filter((l) => l.pret_at);
  const siennes = pretes.filter((l) => String(l.envoye_par || ouvertPar || '') === String(pour));
  if (!siennes.length) return null;

  const table = String(tableNom || '').trim();
  const titre = `${test ? 'TEST ' : ''}${table ? `Table ${table}` : 'Vente directe'} : ${libelleSuite(libellesMaison, suite)}`;

  let corps;
  if (pretes.length === envoyees.length) {
    corps = `Tout est prêt (${plats(nombre(envoyees), false)})`;
  } else {
    const neuves = new Set((nouvelles || []).map(String));
    const ordre = [...siennes].sort((a, b) => {
      const na = neuves.has(String(a.id)) ? 0 : 1;
      const nb = neuves.has(String(b.id)) ? 0 : 1;
      return na - nb || String(b.pret_at).localeCompare(String(a.pret_at));
    });
    const noms = ordre.slice(0, 3).map(nomDe).join(', ');
    corps = `${plats(nombre(siennes), true)} : ${noms}${ordre.length > 3 ? '...' : ''}`;
  }

  return {
    titre,
    corps,
    url: `/?page=caisse&etab=${encodeURIComponent(etabId)}`,
    tag: tagAvis(ticketId, suite),
    vibration: VIBRATION,
  };
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Le déroulé de l'action plats_prets, pour un ticket et une suite.
//   deps.sb       : client de la base (rôle de service) ;
//   deps.envoyer  : (appareils, message, dureeDeVieSecondes) => { envoyes,
//                   echecs, expires } ; deps.attendre, deps.maintenant : pour
//                   les essais.
//
// Un appel par ligne cochée (déclencheur de la base). Regroupement : chaque
// appel note les avis en attente à son arrivée, attend la fenêtre, puis ne
// prend la suite que si l'un de ces avis attend encore ; il prend alors tout
// ce qui attend, d'une seule mise à jour (une seule exécution les obtient).
// Les plats cochés dans la fenêtre partent donc ensemble, par l'appel du
// premier ; les appels des suivants ne trouvent plus rien. Un plat coché après
// la prise ouvre une fenêtre neuve. Aucune comparaison d'horloges entre la
// base et la fonction.
// Relecture au moment d'envoyer : le ticket a pu se fermer, un plat être
// décoché ou noté servi pendant la fenêtre. Chaque avis pris finit envoye ou
// sans_envoi ; un avis pris et jamais soldé (exécution interrompue) reste
// en_cours et ne repart pas, comme une alerte.
// dryRun : pas d'attente, rien n'est pris, envoyé ni écrit ; rend l'aperçu.
export async function traiterPlatsPrets(deps, ticketId, suite, dryRun) {
  const { sb, envoyer } = deps;
  const attendre = deps.attendre || pause;
  const maintenant = deps.maintenant || (() => Date.now());
  const bilan = { pris: 0, envoyes: 0, sans_envoi: 0, appareils: 0, echecs: 0, expires: 0 };
  const apercu = [];
  const rendre = (plus = {}) => ({ ...bilan, dryRun, apercu, ...plus });

  const enAttente = async () => {
    const { data, error } = await sb.from('caisse_prets_avis').select('id, ligne_id')
      .eq('ticket_id', ticketId).eq('suite', suite).eq('etat', 'a_envoyer');
    if (error) throw new Error(error.message);
    return data || [];
  };

  const vus = await enAttente();
  if (!vus.length) return rendre();
  let pris = vus;
  if (!dryRun) {
    await attendre(FENETRE_MS);
    const encore = new Set((await enAttente()).map((a) => a.id));
    if (!vus.some((a) => encore.has(a.id))) return rendre();
    const { data, error } = await sb.from('caisse_prets_avis')
      .update({ etat: 'en_cours', traite_at: new Date(maintenant()).toISOString() })
      .eq('ticket_id', ticketId).eq('suite', suite).eq('etat', 'a_envoyer').select('id, ligne_id');
    if (error) throw new Error(error.message);
    pris = data || [];
    if (!pris.length) return rendre();
  }
  bilan.pris = pris.length;

  const solder = async (ids, etat) => {
    if (!ids.length) return;
    if (etat === 'envoye') bilan.envoyes += ids.length; else bilan.sans_envoi += ids.length;
    if (dryRun) return;
    await sb.from('caisse_prets_avis').update({ etat, traite_at: new Date(maintenant()).toISOString() }).in('id', ids);
  };
  const tous = pris.map((a) => a.id);

  const [t, l] = await Promise.all([
    sb.from('caisse_tickets').select('id, etablissement_id, statut, test, table_id, ouvert_par').eq('id', ticketId).maybeSingle(),
    sb.from('caisse_lignes').select('id, libelle, quantite, statut, pret_at, envoye_par').eq('ticket_id', ticketId).eq('suite', suite),
  ]);
  const ticket = t.data;
  if (t.error || l.error || !ticket || ticket.statut !== 'ouvert') {
    await solder(tous, 'sans_envoi');
    return rendre({ motif: t.error || l.error ? 'lecture' : 'ticket_ferme' });
  }
  const etabId = String(ticket.etablissement_id);
  const lignes = l.data || [];
  const parId = new Map(lignes.map((x) => [String(x.id), x]));
  const estValide = (a) => {
    const x = parId.get(String(a.ligne_id));
    return Boolean(x && x.statut === 'envoye' && x.pret_at);
  };
  const valides = pris.filter(estValide);
  await solder(pris.filter((a) => !estValide(a)).map((a) => a.id), 'sans_envoi');
  if (!valides.length) return rendre({ motif: 'plus_rien_de_pret' });

  const comptes = [...new Set(valides
    .map((a) => String(parId.get(String(a.ligne_id)).envoye_par || ticket.ouvert_par || ''))
    .filter(Boolean))];
  const [p, tab, reg] = await Promise.all([
    comptes.length
      ? sb.from('profiles').select('id, role, actif, etablissement_ids').in('id', comptes)
      : Promise.resolve({ data: [], error: null }),
    ticket.table_id
      ? sb.from('salle_tables').select('nom').eq('id', ticket.table_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.from('caisse_reglages').select('config').eq('etablissement_id', etabId).maybeSingle(),
  ]);
  if (p.error) {
    await solder(valides.map((a) => a.id), 'sans_envoi');
    return rendre({ motif: 'lecture' });
  }
  const profils = new Map((p.data || []).map((x) => [String(x.id), x]));
  const libellesMaison = reg.data?.config?.modes?.libelles;

  // Un message par destinataire : le plus souvent un seul, deux si la suite a
  // été envoyée par deux personnes.
  const groupes = new Map();
  const sansDestinataire = [];
  for (const a of valides) {
    const qui = destinataireDe(parId.get(String(a.ligne_id)), ticket, profils, etabId);
    if (!qui) { sansDestinataire.push(a.id); continue; }
    groupes.set(qui, [...(groupes.get(qui) || []), a]);
  }
  await solder(sansDestinataire, 'sans_envoi');

  for (const [qui, avis] of groupes) {
    const ids = avis.map((a) => a.id);
    // Seulement ses appareils abonnés à cet établissement.
    const { data: abos } = await sb.from('push_abonnements')
      .select('id, user_id, endpoint, p256dh, auth').eq('user_id', qui).eq('etablissement_id', etabId);
    const appareils = abos || [];
    const message = composerAvisPret({
      ticketId, etabId, test: ticket.test === true, tableNom: tab.data?.nom || null, suite,
      libellesMaison, lignes, ouvertPar: ticket.ouvert_par, pour: qui,
      nouvelles: avis.map((a) => a.ligne_id),
    });
    if (dryRun) {
      apercu.push(message
        ? { titre: message.titre, corps: message.corps, url: message.url, tag: message.tag, appareils: appareils.length, lignes: avis.length }
        : { appareils: appareils.length, lignes: avis.length, motif: 'rien_a_dire' });
      continue;
    }
    if (!message || !appareils.length) { await solder(ids, 'sans_envoi'); continue; }
    const res = await envoyer(appareils, message, DUREE_DE_VIE_S);
    await solder(ids, res.envoyes > 0 ? 'envoye' : 'sans_envoi');
    bilan.appareils += res.envoyes; bilan.echecs += res.echecs; bilan.expires += res.expires;
  }

  if (!dryRun) {
    await sb.from('caisse_prets_avis').delete().lt('created_at', new Date(maintenant() - PURGE_MS).toISOString());
  }
  return rendre();
}
