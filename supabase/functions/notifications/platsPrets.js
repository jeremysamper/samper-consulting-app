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
// reste réglé par le téléphone. Lu par Chrome sur ordinateur seulement :
// l'iPhone et Chrome sur Android (8 et plus) vibrent selon leurs propres
// réglages, une fois et brièvement par notification.
export const VIBRATION = [200, 100, 200];
// D'où la rafale : chaque avis part RAFALE_ENVOIS fois, à RAFALE_ECART_MS
// d'écart, pour que le téléphone vibre plusieurs fois. Le service worker
// n'en laisse qu'une à l'écran (champ groupe).
export const RAFALE_ENVOIS = 3;
export const RAFALE_ECART_MS = 3000;
// Les avis soldés sont gardés deux jours, pour comprendre un envoi manqué.
export const PURGE_MS = 2 * 24 * 3600 * 1000;

// Sujet du service de push : un message en attente est remplacé par le suivant
// de même sujet. 32 caractères au plus, lettres, chiffres, tiret et souligné.
export function sujetPush(tag) {
  return String(tag || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
}

// Groupe d'un avis : un ticket et une suite. Le service worker ferme les
// notifications déjà affichées du même groupe quand une nouvelle arrive.
export function groupeAvis(ticketId, suite) {
  return `pret-${suite}-${ticketId}`;
}

// Tag d'un envoi de la rafale. La suite vient en tête, puis le rang de l'envoi :
// « À suivre » ne remplace jamais « En direct », et les envois d'une même
// rafale ne se fusionnent ni à l'écran (tag) ni dans la file du service de
// push (sujet, 32 caractères).
export function tagAvis(ticketId, suite, envoi = 1) {
  return `pret-${suite}-${envoi}-${ticketId}`;
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
    tag: tagAvis(ticketId, suite, 1),
    groupe: groupeAvis(ticketId, suite),
    vibration: VIBRATION,
  };
}

// Un rappel de la rafale part-il encore ? Oui tant que la situation annoncée
// tient : ticket ouvert, chaque plat de l'avis encore prêt et pas encore noté
// servi, et aucun avis plus récent sur la même suite (c'est lui qui prend le
// relais, avec sa propre rafale).
export function rappelValable({ ticket, lignes, lignesAvis, avisConnus, avisSuite }) {
  if (!ticket || ticket.statut !== 'ouvert') return false;
  const parId = new Map((lignes || []).map((x) => [String(x.id), x]));
  const toutesPretes = (lignesAvis || []).every((id) => {
    const x = parId.get(String(id));
    return Boolean(x && x.statut === 'envoye' && x.pret_at);
  });
  if (!toutesPretes) return false;
  const connus = new Set((avisConnus || []).map(String));
  return !(avisSuite || []).some((a) => a.etat !== 'annule' && !connus.has(String(a.id)));
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Le déroulé de l'action plats_prets, pour un ticket et une suite.
//   deps.sb       : client de la base (rôle de service) ;
//   deps.envoyer  : (appareils, message, dureeDeVieSecondes) => { envoyes,
//                   echecs, expires } ; deps.attendre, deps.maintenant : pour
//                   les essais ;
//   deps.enArrierePlan : (promesse) => void, facultatif. Les rappels de la
//                   rafale y partent et la fonction répond après le premier
//                   envoi (EdgeRuntime.waitUntil). Sans lui, ils sont attendus
//                   avant de répondre.
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
// Rafale : après le premier envoi d'un message, RAFALE_ENVOIS - 1 rappels à
// RAFALE_ECART_MS d'écart, chacun avec son tag et son sujet. Avant chaque
// rappel, ticket et lignes sont relus (rappelValable) : un plat noté servi ou
// décoché, un ticket fermé ou un avis plus récent sur la suite arrêtent la
// rafale. Les rappels ne changent pas l'état des avis.
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

  // Avis de la suite connus au moment de la prise : un avis apparu ensuite
  // est plus récent et arrête la rafale de celui-ci.
  const lireAvisSuite = async () => {
    const { data, error } = await sb.from('caisse_prets_avis').select('id, etat')
      .eq('ticket_id', ticketId).eq('suite', suite);
    return error ? null : data || [];
  };
  const avisConnus = dryRun ? [] : ((await lireAvisSuite()) || pris).map((a) => a.id);

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

  const rappels = [];
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
        ? {
          titre: message.titre, corps: message.corps, url: message.url, tag: message.tag, groupe: message.groupe,
          envois: RAFALE_ENVOIS, appareils: appareils.length, lignes: avis.length,
        }
        : { appareils: appareils.length, lignes: avis.length, motif: 'rien_a_dire' });
      continue;
    }
    if (!message || !appareils.length) { await solder(ids, 'sans_envoi'); continue; }
    const res = await envoyer(appareils, message, DUREE_DE_VIE_S);
    await solder(ids, res.envoyes > 0 ? 'envoye' : 'sans_envoi');
    bilan.appareils += res.envoyes; bilan.echecs += res.echecs; bilan.expires += res.expires;
    if (res.envoyes > 0) rappels.push({ appareils, message, lignesAvis: avis.map((a) => a.ligne_id) });
  }

  if (!dryRun) {
    await sb.from('caisse_prets_avis').delete().lt('created_at', new Date(maintenant() - PURGE_MS).toISOString());
  }
  if (dryRun || !rappels.length || RAFALE_ENVOIS < 2) return rendre();

  const rafale = async () => {
    const r = { rappels: 0, appareils: 0, arret: null };
    try {
      let restants = rappels;
      for (let envoi = 2; envoi <= RAFALE_ENVOIS && restants.length; envoi++) {
        await attendre(RAFALE_ECART_MS);
        const [t2, l2, avisSuite] = await Promise.all([
          sb.from('caisse_tickets').select('id, statut').eq('id', ticketId).maybeSingle(),
          sb.from('caisse_lignes').select('id, statut, pret_at').eq('ticket_id', ticketId).eq('suite', suite),
          lireAvisSuite(),
        ]);
        if (t2.error || l2.error || !avisSuite) { r.arret = 'lecture'; break; }
        restants = restants.filter((x) => rappelValable({
          ticket: t2.data, lignes: l2.data, lignesAvis: x.lignesAvis, avisConnus, avisSuite,
        }));
        if (!restants.length) { r.arret = 'situation_changee'; break; }
        for (const x of restants) {
          const res = await envoyer(x.appareils, { ...x.message, tag: tagAvis(ticketId, suite, envoi) }, DUREE_DE_VIE_S);
          r.rappels += 1;
          r.appareils += res.envoyes;
        }
      }
    } catch (e) {
      r.arret = `erreur : ${e instanceof Error ? e.message : String(e)}`;
    }
    return r;
  };

  if (deps.enArrierePlan) {
    deps.enArrierePlan(rafale());
    return rendre({ rafale: 'en_fond' });
  }
  return rendre({ rafale: await rafale() });
}
