// node --test : avis « plats prêts » de la caisse, côté Edge Function
// notifications (action plats_prets). Les règles sont prises dans le fichier
// même que la fonction importe :
//   - composition du message, sujet du service de push, choix du destinataire ;
//   - le déroulé (regroupement, prise, relecture, envoi, solde) sur une base
//     en mémoire.
// Les règles de la base (qui a envoyé, file des avis) sont prouvées à part,
// par l'essai à blanc de la migration 20261112_caisse_prets_avis. Ce que
// décide l'écran est dans avisPret.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composerAvisPret, destinataireDe, libelleSuite, sujetPush, tagAvis, traiterPlatsPrets,
  DUREE_DE_VIE_S, FENETRE_MS, PURGE_MS, VIBRATION,
} from '../../../supabase/functions/notifications/platsPrets.js';
import { libelleMode } from './reglages.js';

const TICKET = '7b0f3a52-91c4-4d2e-8a6b-0c1d2e3f4a5b';
const ETAB = 'maison-a';
const A = 'compte-serveur-a';
const B = 'compte-serveur-b';
const OUVREUR = 'compte-ouvreur';

const ligne = (id, libelle, plus = {}) => ({
  id, libelle, quantite: 1, statut: 'envoye', pret_at: null, envoye_par: A, ...plus,
});
const prete = (id, libelle, plus = {}) => ligne(id, libelle, { pret_at: '2026-11-12T18:00:00Z', ...plus });
const base = { ticketId: TICKET, etabId: ETAB, test: false, tableNom: '12', suite: 1, libellesMaison: null, ouvertPar: OUVREUR, pour: A };

// ── Composition du message ───────────────────────────────────────────────────

test('suite complète : « Tout est prêt » et le nombre de plats de la suite', () => {
  const m = composerAvisPret({ ...base, lignes: [prete('l1', 'Burger'), prete('l2', 'Frites', { quantite: 2 })], nouvelles: ['l2'] });
  assert.equal(m.titre, 'Table 12 : En direct');
  assert.equal(m.corps, 'Tout est prêt (3 plats)');
  assert.equal(m.url, '/?page=caisse&etab=maison-a');
  assert.deepEqual(m.vibration, [200, 100, 200]);
  assert.equal(m.silent, undefined, 'jamais de silence forcé');
});

test('suite complète d\'un seul plat : singulier', () => {
  const m = composerAvisPret({ ...base, lignes: [prete('l1', 'Soupe du jour')], nouvelles: ['l1'] });
  assert.equal(m.corps, 'Tout est prêt (1 plat)');
});

test('suite partielle : le nombre de plats prêts et leurs noms, le plat qui vient de sortir en tête', () => {
  const m = composerAvisPret({
    ...base,
    lignes: [
      prete('l1', 'Burger', { pret_at: '2026-11-12T18:00:00Z' }),
      prete('l2', 'Salade César', { pret_at: '2026-11-12T18:02:00Z', quantite: 2 }),
      ligne('l3', 'Entrecôte'),
    ],
    nouvelles: ['l2'],
  });
  assert.equal(m.corps, '3 plats prêts : 2 × Salade César, Burger');
});

test('suite partielle d\'un seul plat prêt : singulier', () => {
  const m = composerAvisPret({ ...base, lignes: [prete('l1', 'Burger'), ligne('l2', 'Frites')], nouvelles: ['l1'] });
  assert.equal(m.corps, '1 plat prêt : Burger');
});

test('plus de trois plats prêts : trois noms au plus, le compte reste entier', () => {
  const lignes = [prete('l1', 'Un'), prete('l2', 'Deux'), prete('l3', 'Trois'), prete('l4', 'Quatre'), prete('l5', 'Cinq'), ligne('l6', 'Six')];
  const m = composerAvisPret({ ...base, lignes, nouvelles: ['l1', 'l2', 'l3', 'l4', 'l5'] });
  assert.match(m.corps, /^5 plats prêts : /);
  const noms = m.corps.replace(/^5 plats prêts : /, '').replace(/\.\.\.$/, '').split(', ');
  assert.equal(noms.length, 3);
  assert.ok(m.corps.endsWith('...'), 'la liste coupée se voit');
});

test('ticket de test : TEST en tête du titre', () => {
  const m = composerAvisPret({ ...base, test: true, lignes: [prete('l1', 'Burger')], nouvelles: ['l1'] });
  assert.equal(m.titre, 'TEST Table 12 : En direct');
});

test('vente directe : pas de table dans le titre', () => {
  const m = composerAvisPret({ ...base, tableNom: null, suite: 2, lignes: [prete('l1', 'Café')], nouvelles: ['l1'] });
  assert.equal(m.titre, 'Vente directe : À suivre');
});

test('nom de suite : celui de la maison s\'il existe, sinon En direct, À suivre, À suivre 2', () => {
  const maison = ['Apéritif', 'Entrées', ''];
  assert.equal(libelleSuite(maison, 1), 'Apéritif');
  assert.equal(libelleSuite(maison, 2), 'Entrées');
  assert.equal(libelleSuite(maison, 3), 'À suivre 2', 'un nom vide laisse le défaut');
  assert.equal(libelleSuite(null, 1), 'En direct');
  assert.equal(libelleSuite(null, 2), 'À suivre');
  assert.equal(libelleSuite(null, 4), 'À suivre 3');
  const m = composerAvisPret({ ...base, suite: 2, libellesMaison: maison, lignes: [prete('l1', 'Tartare')], nouvelles: ['l1'] });
  assert.equal(m.titre, 'Table 12 : Entrées');
});

test('nom de suite : la même règle que l\'écran de la caisse (libelleMode)', () => {
  for (const libelles of [undefined, ['Apéro', 'Plats'], ['', 'Plats', 'Desserts']]) {
    for (const suite of [1, 2, 3, 4]) {
      assert.equal(libelleSuite(libelles, suite), libelleMode({ modes: { libelles } }, suite), `${JSON.stringify(libelles)} suite ${suite}`);
    }
  }
});

test('ni le client ni un montant : seuls la table, la suite et les plats sortent', () => {
  const m = composerAvisPret({
    ...base,
    lignes: [prete('l1', 'Burger', { prix_unitaire: 28.5, note: 'pour M. Dupont', remise_montant: 5 })],
    nouvelles: ['l1'],
    client: 'Dupont', total: 123.45,
  });
  const tout = JSON.stringify(m);
  for (const interdit of ['Dupont', '28.5', '123.45', 'CHF']) assert.equal(tout.includes(interdit), false, interdit);
});

test('une ligne servie ou jamais partie ne compte pas dans la suite envoyée', () => {
  const m = composerAvisPret({
    ...base,
    lignes: [prete('l1', 'Burger'), prete('l2', 'Frites', { statut: 'servi' }), ligne('l3', 'Glace', { statut: 'en_attente' })],
    nouvelles: ['l1'],
  });
  assert.equal(m.corps, 'Tout est prêt (1 plat)');
});

test('deux envoyeurs dans la même suite : chacun ses plats tant que tout n\'est pas prêt', () => {
  const lignes = [prete('l1', 'Burger', { envoye_par: A }), prete('l2', 'Risotto', { envoye_par: B }), ligne('l3', 'Tarte', { envoye_par: B })];
  assert.equal(composerAvisPret({ ...base, pour: A, lignes, nouvelles: ['l1'] }).corps, '1 plat prêt : Burger');
  assert.equal(composerAvisPret({ ...base, pour: B, lignes, nouvelles: ['l2'] }).corps, '1 plat prêt : Risotto');
  assert.equal(composerAvisPret({ ...base, pour: 'un-autre', lignes, nouvelles: [] }), null, 'rien à dire à qui n\'a rien envoyé');
});

test('ligne envoyée avant la colonne envoye_par : ses plats sont ceux de l\'ouvreur', () => {
  const lignes = [prete('l1', 'Burger', { envoye_par: null }), ligne('l2', 'Frites', { envoye_par: null })];
  assert.equal(composerAvisPret({ ...base, pour: OUVREUR, lignes, nouvelles: ['l1'] }).corps, '1 plat prêt : Burger');
});

// ── Une suite, un avis : le tag et le sujet du service de push ───────────────

test('deux suites d\'un même ticket : tags différents dans leurs 32 premiers caractères', () => {
  const t1 = tagAvis(TICKET, 1);
  const t2 = tagAvis(TICKET, 2);
  assert.equal(t1, `pret-1-${TICKET}`);
  assert.notEqual(t1.slice(0, 32), t2.slice(0, 32));
  assert.notEqual(sujetPush(t1), sujetPush(t2), '« À suivre » ne remplace pas « En direct » dans la file du service de push');
  assert.ok(sujetPush(t1).length <= 32);
  assert.match(sujetPush(t1), /^[A-Za-z0-9_-]+$/);
  const m1 = composerAvisPret({ ...base, suite: 1, lignes: [prete('l1', 'Burger')], nouvelles: ['l1'] });
  const m2 = composerAvisPret({ ...base, suite: 2, lignes: [prete('l2', 'Tarte')], nouvelles: ['l2'] });
  assert.notEqual(m1.tag.slice(0, 32), m2.tag.slice(0, 32));
});

test('un plat coché plus tard dans la même suite : même tag, l\'avis remplace le précédent', () => {
  assert.equal(tagAvis(TICKET, 1), tagAvis(TICKET, 1));
});

test('sujet des messages existants inchangé (réservation, alerte, essai)', () => {
  const ancien = (tag) => tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  for (const tag of ['resa-1f0c9d1e-2222-4333-8444-555566667777', 'alerte-0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'test']) {
    assert.equal(sujetPush(tag), ancien(tag));
  }
});

test('réglages de l\'avis : fenêtre de 6 secondes, durée de vie de 15 minutes, motif de vibration', () => {
  assert.equal(FENETRE_MS, 6000);
  assert.equal(DUREE_DE_VIE_S, 900);
  assert.deepEqual(VIBRATION, [200, 100, 200]);
});

// ── Choix du destinataire ────────────────────────────────────────────────────

const profils = new Map([
  [A, { id: A, role: 'serveur', actif: true, etablissement_ids: [ETAB] }],
  [B, { id: B, role: 'patron', actif: null, etablissement_ids: [ETAB, 'maison-b'] }],
  [OUVREUR, { id: OUVREUR, role: 'consultant', actif: true, etablissement_ids: [ETAB] }],
  ['parti', { id: 'parti', role: 'serveur', actif: false, etablissement_ids: [ETAB] }],
  ['ailleurs', { id: 'ailleurs', role: 'serveur', actif: true, etablissement_ids: ['maison-b'] }],
  ['sans-maison', { id: 'sans-maison', role: 'serveur', actif: true, etablissement_ids: null }],
]);
const ticket = { ouvert_par: OUVREUR };

test('destinataire : le compte qui a envoyé la ligne, quel que soit son rôle', () => {
  assert.equal(destinataireDe({ envoye_par: A }, ticket, profils, ETAB), A);
  assert.equal(destinataireDe({ envoye_par: B }, ticket, profils, ETAB), B, 'actif null vaut actif, comme user_can_access_etab');
});

test('destinataire : repli sur la personne qui a ouvert le ticket quand la ligne n\'a pas d\'envoyeur', () => {
  assert.equal(destinataireDe({ envoye_par: null }, ticket, profils, ETAB), OUVREUR);
  assert.equal(destinataireDe({}, { ouvert_par: null }, profils, ETAB), null, 'ni envoyeur ni ouvreur : personne');
});

test('destinataire : un compte désactivé ne reçoit rien, et ne passe pas la main à l\'ouvreur', () => {
  assert.equal(destinataireDe({ envoye_par: 'parti' }, ticket, profils, ETAB), null);
  assert.equal(destinataireDe({ envoye_par: null }, { ouvert_par: 'parti' }, profils, ETAB), null);
});

test('destinataire : un compte qui n\'est pas rattaché à l\'établissement du ticket ne reçoit rien', () => {
  assert.equal(destinataireDe({ envoye_par: 'ailleurs' }, ticket, profils, ETAB), null);
  assert.equal(destinataireDe({ envoye_par: 'sans-maison' }, ticket, profils, ETAB), null);
  assert.equal(destinataireDe({ envoye_par: B }, ticket, profils, 'maison-b'), B);
});

test('destinataire : un compte sans profil ne reçoit rien ; la liste des profils peut être un tableau', () => {
  assert.equal(destinataireDe({ envoye_par: 'inconnu' }, ticket, profils, ETAB), null);
  assert.equal(destinataireDe({ envoye_par: A }, ticket, [...profils.values()], ETAB), A);
  assert.equal(destinataireDe({ envoye_par: A }, ticket, null, ETAB), null);
});

// ── Le déroulé de l'action plats_prets, sur une base en mémoire ─────────────
// La base : des tableaux, et le peu du client de requêtes que le déroulé
// emploie (select, update, delete, eq, in, lt, maybeSingle). Une mise à jour
// est une seule instruction, comme dans la vraie base : deux exécutions ne
// peuvent pas prendre le même avis.

function fausseBase(tables, { panne } = {}) {
  const ecritures = [];
  const executer = (q) => {
    if (panne && panne(q)) return { data: null, error: { message: 'panne simulée' } };
    const table = tables[q.nom] || (tables[q.nom] = []);
    const vises = table.filter((r) => q.filtres.every((f) => f(r)));
    if (q.op === 'select') {
      return { data: q.unique ? (vises[0] ? { ...vises[0] } : null) : vises.map((r) => ({ ...r })), error: null };
    }
    ecritures.push({ table: q.nom, op: q.op, lignes: vises.length });
    if (q.op === 'update') {
      vises.forEach((r) => Object.assign(r, q.valeurs));
      return { data: q.renvoie ? vises.map((r) => ({ ...r })) : null, error: null };
    }
    tables[q.nom] = table.filter((r) => !vises.includes(r));
    return { data: null, error: null };
  };
  const from = (nom) => {
    const q = { nom, op: 'select', filtres: [], valeurs: null, renvoie: false, unique: false };
    const api = {
      select() { if (q.op !== 'select') q.renvoie = true; return api; },
      update(v) { q.op = 'update'; q.valeurs = v; return api; },
      delete() { q.op = 'delete'; return api; },
      eq(c, v) { q.filtres.push((r) => String(r[c]) === String(v)); return api; },
      in(c, vs) { const s = new Set(vs.map(String)); q.filtres.push((r) => s.has(String(r[c]))); return api; },
      lt(c, v) { q.filtres.push((r) => String(r[c]) < String(v)); return api; },
      maybeSingle() { q.unique = true; return api; },
      then(ok, ko) { return Promise.resolve().then(() => executer(q)).then(ok, ko); },
    };
    return api;
  };
  return { from, tables, ecritures };
}

const MAINTENANT = Date.parse('2026-11-12T18:00:10Z');
const avis = (id, ligneId, plus = {}) => ({
  id, ligne_id: ligneId, ticket_id: TICKET, etablissement_id: ETAB, suite: 1, destinataire: A,
  pret_at: '2026-11-12T18:00:00Z', etat: 'a_envoyer', created_at: '2026-11-12T18:00:00Z', traite_at: null, ...plus,
});
const ligneBase = (id, libelle, plus = {}) => ({
  id, ticket_id: TICKET, suite: 1, libelle, quantite: 1, statut: 'envoye', pret_at: '2026-11-12T18:00:00Z', envoye_par: A, ...plus,
});
const appareil = (id, userId, etabId = ETAB) => ({ id, user_id: userId, etablissement_id: etabId, endpoint: `https://push.invalid/${id}`, p256dh: 'k', auth: 'a' });

function monde(plus = {}) {
  return {
    caisse_tickets: [{ id: TICKET, etablissement_id: ETAB, statut: 'ouvert', test: false, table_id: 't12', ouvert_par: OUVREUR }],
    caisse_lignes: [ligneBase('l1', 'Burger'), ligneBase('l2', 'Frites')],
    caisse_prets_avis: [avis('a1', 'l1')],
    profiles: [...profils.values()].map((p) => ({ ...p })),
    salle_tables: [{ id: 't12', nom: '12' }],
    caisse_reglages: [{ etablissement_id: ETAB, config: { modes: { libelles: ['', 'Plats chauds'] } } }],
    push_abonnements: [appareil('d1', A), appareil('d2', A), appareil('d3', A, 'maison-b'), appareil('d4', B), appareil('d5', OUVREUR)],
    ...plus,
  };
}

// L'envoi et l'attente, tenus par l'essai.
function outils(base) {
  const envois = [];
  const attentes = [];
  return {
    envois,
    attentes,
    deps: {
      sb: base,
      envoyer: async (appareils, message, dureeDeVie) => {
        envois.push({ appareils: appareils.map((a) => a.id), message, dureeDeVie });
        return { envoyes: appareils.length, echecs: 0, expires: 0 };
      },
      attendre: (ms) => { attentes.push(ms); return Promise.resolve(); },
      maintenant: () => MAINTENANT,
    },
  };
}
const etats = (base) => Object.fromEntries(base.tables.caisse_prets_avis.map((a) => [a.id, a.etat]));

test('déroulé : un plat coché, un avis envoyé aux appareils de l\'envoyeur abonnés à l\'établissement', async () => {
  const base = fausseBase(monde());
  const o = outils(base);
  const res = await traiterPlatsPrets(o.deps, TICKET, 1, false);
  assert.deepEqual(o.attentes, [FENETRE_MS], 'la fenêtre de regroupement est attendue une fois');
  assert.equal(o.envois.length, 1);
  assert.deepEqual(o.envois[0].appareils, ['d1', 'd2'], 'ni l\'appareil abonné à une autre maison, ni ceux des autres comptes');
  assert.equal(o.envois[0].dureeDeVie, DUREE_DE_VIE_S);
  assert.equal(o.envois[0].message.titre, 'Table 12 : En direct');
  assert.equal(o.envois[0].message.corps, 'Tout est prêt (2 plats)');
  assert.deepEqual(o.envois[0].message.vibration, VIBRATION);
  assert.deepEqual(etats(base), { a1: 'envoye' });
  assert.deepEqual({ pris: res.pris, envoyes: res.envoyes, appareils: res.appareils, sans_envoi: res.sans_envoi }, { pris: 1, envoyes: 1, appareils: 2, sans_envoi: 0 });
});

test('déroulé : les plats cochés dans la fenêtre font un seul avis, un plat plus tard en fait un nouveau', async () => {
  const tables = monde({ caisse_lignes: [ligneBase('l1', 'Burger'), ligneBase('l2', 'Frites', { pret_at: null }), ligneBase('l3', 'Tarte', { pret_at: null })] });
  const base = fausseBase(tables);
  const envois = [];
  const portes = [];
  const deps = {
    sb: base,
    envoyer: async (appareils, message) => { envois.push(message); return { envoyes: appareils.length, echecs: 0, expires: 0 }; },
    attendre: () => new Promise((ouvrir) => { portes.push(ouvrir); }),
    maintenant: () => MAINTENANT,
  };
  const tic = () => new Promise((r) => setImmediate(r));

  // Plat 1 coché : son appel arrive et attend.
  const appel1 = traiterPlatsPrets(deps, TICKET, 1, false);
  await tic();
  // Plat 2 coché deux secondes plus tard : son avis, puis son appel.
  tables.caisse_lignes[1].pret_at = '2026-11-12T18:00:02Z';
  tables.caisse_prets_avis.push(avis('a2', 'l2'));
  const appel2 = traiterPlatsPrets(deps, TICKET, 1, false);
  await tic();
  assert.equal(portes.length, 2, 'les deux appels attendent leur fenêtre');

  // La fenêtre du premier se ferme : il prend les deux avis, un seul message.
  portes[0]();
  const r1 = await appel1;
  assert.equal(r1.pris, 2);
  assert.equal(envois.length, 1);
  assert.equal(envois[0].corps, '2 plats prêts : Frites, Burger');
  // Celle du second : plus rien à prendre, aucun message.
  portes[1]();
  const r2 = await appel2;
  assert.equal(r2.pris, 0);
  assert.equal(envois.length, 1);
  assert.deepEqual(etats(base), { a1: 'envoye', a2: 'envoye' });

  // Plat 3 coché plus tard : nouvel avis, même tag (il remplace le précédent
  // à l'écran et fait vibrer de nouveau).
  tables.caisse_lignes[2].pret_at = '2026-11-12T18:03:00Z';
  tables.caisse_prets_avis.push(avis('a3', 'l3'));
  const appel3 = traiterPlatsPrets(deps, TICKET, 1, false);
  await tic();
  portes[2]();
  await appel3;
  assert.equal(envois.length, 2);
  assert.equal(envois[1].corps, 'Tout est prêt (3 plats)');
  assert.equal(envois[1].tag, envois[0].tag);
});

test('déroulé : deux exécutions qui se réveillent ensemble ne prennent pas deux fois le même avis', async () => {
  const base = fausseBase(monde({ caisse_prets_avis: [avis('a1', 'l1'), avis('a2', 'l2')] }));
  const o = outils(base);
  const [r1, r2] = await Promise.all([traiterPlatsPrets(o.deps, TICKET, 1, false), traiterPlatsPrets(o.deps, TICKET, 1, false)]);
  assert.equal(o.envois.length, 1, 'un seul message');
  assert.deepEqual([r1.pris, r2.pris].sort(), [0, 2]);
});

test('déroulé : chaque suite a son avis, la suite 2 ne prend pas ceux de la suite 1', async () => {
  const tables = monde({
    caisse_lignes: [ligneBase('l1', 'Burger'), ligneBase('l4', 'Tarte', { suite: 2 })],
    caisse_prets_avis: [avis('a1', 'l1'), avis('a4', 'l4', { suite: 2 })],
  });
  const base = fausseBase(tables);
  const o = outils(base);
  await traiterPlatsPrets(o.deps, TICKET, 2, false);
  assert.equal(o.envois.length, 1);
  assert.equal(o.envois[0].message.titre, 'Table 12 : Plats chauds', 'nom de suite de la maison');
  assert.deepEqual(etats(base), { a1: 'a_envoyer', a4: 'envoye' });
  await traiterPlatsPrets(o.deps, TICKET, 1, false);
  assert.equal(o.envois.length, 2);
  assert.notEqual(o.envois[0].message.tag.slice(0, 32), o.envois[1].message.tag.slice(0, 32));
});

test('déroulé : plat décoché, ligne servie ou ticket fermé pendant la fenêtre, aucun envoi', async () => {
  const decoche = fausseBase(monde({ caisse_lignes: [ligneBase('l1', 'Burger', { pret_at: null })] }));
  let o = outils(decoche);
  let res = await traiterPlatsPrets(o.deps, TICKET, 1, false);
  assert.equal(o.envois.length, 0);
  assert.deepEqual(etats(decoche), { a1: 'sans_envoi' });
  assert.equal(res.motif, 'plus_rien_de_pret');

  const servie = fausseBase(monde({ caisse_lignes: [ligneBase('l1', 'Burger', { statut: 'servi' })] }));
  o = outils(servie);
  await traiterPlatsPrets(o.deps, TICKET, 1, false);
  assert.equal(o.envois.length, 0);
  assert.deepEqual(etats(servie), { a1: 'sans_envoi' });

  const ferme = fausseBase(monde({ caisse_tickets: [{ id: TICKET, etablissement_id: ETAB, statut: 'encaisse', test: false, table_id: null, ouvert_par: OUVREUR }] }));
  o = outils(ferme);
  res = await traiterPlatsPrets(o.deps, TICKET, 1, false);
  assert.equal(o.envois.length, 0);
  assert.deepEqual(etats(ferme), { a1: 'sans_envoi' });
  assert.equal(res.motif, 'ticket_ferme');
});

test('déroulé : envoyeur désactivé, d\'une autre maison ou sans appareil abonné, aucun envoi et jamais « tous les abonnés »', async () => {
  for (const [compte, libelle] of [['parti', 'désactivé'], ['ailleurs', 'autre maison'], [B, 'sans appareil ici']]) {
    const tables = monde({ caisse_lignes: [ligneBase('l1', 'Burger', { envoye_par: compte })] });
    if (compte === B) tables.push_abonnements = tables.push_abonnements.filter((a) => a.user_id !== B);
    const base = fausseBase(tables);
    const o = outils(base);
    await traiterPlatsPrets(o.deps, TICKET, 1, false);
    assert.equal(o.envois.length, 0, libelle);
    assert.deepEqual(etats(base), { a1: 'sans_envoi' }, libelle);
  }
});

test('déroulé : ligne sans envoyeur, l\'avis va à la personne qui a ouvert le ticket', async () => {
  const base = fausseBase(monde({ caisse_lignes: [ligneBase('l1', 'Burger', { envoye_par: null })] }));
  const o = outils(base);
  await traiterPlatsPrets(o.deps, TICKET, 1, false);
  assert.deepEqual(o.envois.map((e) => e.appareils), [['d5']]);
});

test('déroulé : deux envoyeurs dans la suite, un message chacun sur ses seuls appareils', async () => {
  const tables = monde({
    caisse_lignes: [ligneBase('l1', 'Burger', { envoye_par: A }), ligneBase('l2', 'Risotto', { envoye_par: B }), ligneBase('l3', 'Tarte', { envoye_par: B, pret_at: null })],
    caisse_prets_avis: [avis('a1', 'l1'), avis('a2', 'l2', { destinataire: B })],
  });
  const base = fausseBase(tables);
  const o = outils(base);
  await traiterPlatsPrets(o.deps, TICKET, 1, false);
  const parAppareils = Object.fromEntries(o.envois.map((e) => [e.appareils.join('+'), e.message.corps]));
  assert.deepEqual(parAppareils, { 'd1+d2': '1 plat prêt : Burger', d4: '1 plat prêt : Risotto' });
});

test('déroulé : ticket de test, TEST en tête ; vente directe sans table', async () => {
  const base = fausseBase(monde({ caisse_tickets: [{ id: TICKET, etablissement_id: ETAB, statut: 'ouvert', test: true, table_id: null, ouvert_par: OUVREUR }] }));
  const o = outils(base);
  await traiterPlatsPrets(o.deps, TICKET, 1, false);
  assert.equal(o.envois[0].message.titre, 'TEST Vente directe : En direct');
});

test('déroulé : essai à blanc (dryRun), rien n\'est attendu, pris, envoyé ni écrit', async () => {
  const tables = monde({ caisse_prets_avis: [avis('a1', 'l1'), avis('vieux', 'l2', { suite: 3, etat: 'envoye', created_at: '2026-11-01T10:00:00Z' })] });
  const avant = JSON.stringify(tables);
  const base = fausseBase(tables);
  const o = outils(base);
  const res = await traiterPlatsPrets(o.deps, TICKET, 1, true);
  assert.deepEqual(o.attentes, []);
  assert.equal(o.envois.length, 0);
  assert.deepEqual(base.ecritures, []);
  assert.equal(JSON.stringify(base.tables), avant);
  assert.equal(res.dryRun, true);
  assert.deepEqual(res.apercu, [{
    titre: 'Table 12 : En direct', corps: 'Tout est prêt (2 plats)', url: '/?page=caisse&etab=maison-a',
    tag: `pret-1-${TICKET}`, appareils: 2, lignes: 1,
  }]);
});

test('déroulé : rien en attente (ticket inconnu), réponse vide sans attente ni écriture', async () => {
  const base = fausseBase(monde({ caisse_prets_avis: [] }));
  const o = outils(base);
  const res = await traiterPlatsPrets(o.deps, TICKET, 1, false);
  assert.deepEqual({ pris: res.pris, apercu: res.apercu }, { pris: 0, apercu: [] });
  assert.deepEqual(o.attentes, []);
  assert.deepEqual(base.ecritures, []);
});

test('déroulé : les avis de plus de deux jours sont purgés après un envoi, pas les récents', async () => {
  const vieux = new Date(MAINTENANT - PURGE_MS - 60000).toISOString();
  const recent = new Date(MAINTENANT - PURGE_MS + 60000).toISOString();
  const base = fausseBase(monde({
    caisse_prets_avis: [avis('a1', 'l1'), avis('vieux', 'l2', { suite: 2, etat: 'envoye', created_at: vieux }), avis('recent', 'l2', { suite: 2, etat: 'annule', created_at: recent })],
  }));
  const o = outils(base);
  await traiterPlatsPrets(o.deps, TICKET, 1, false);
  assert.deepEqual(Object.keys(etats(base)).sort(), ['a1', 'recent']);
});

test('déroulé : service de push en échec sur tous les appareils, l\'avis finit sans_envoi', async () => {
  const base = fausseBase(monde());
  const o = outils(base);
  o.deps.envoyer = async (appareils) => ({ envoyes: 0, echecs: appareils.length, expires: 0 });
  const res = await traiterPlatsPrets(o.deps, TICKET, 1, false);
  assert.deepEqual(etats(base), { a1: 'sans_envoi' });
  assert.equal(res.echecs, 2);
});

test('déroulé : la file illisible lève (la fonction répond 500), le ticket illisible solde sans envoi', async () => {
  const fileEnPanne = fausseBase(monde(), { panne: (q) => q.nom === 'caisse_prets_avis' && q.op === 'select' });
  await assert.rejects(() => traiterPlatsPrets(outils(fileEnPanne).deps, TICKET, 1, false), /panne simulée/);

  const ticketEnPanne = fausseBase(monde(), { panne: (q) => q.nom === 'caisse_tickets' });
  const o = outils(ticketEnPanne);
  const res = await traiterPlatsPrets(o.deps, TICKET, 1, false);
  assert.equal(o.envois.length, 0);
  assert.equal(res.motif, 'lecture');
  assert.deepEqual(etats(ticketEnPanne), { a1: 'sans_envoi' });
});
