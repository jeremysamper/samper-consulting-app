import test from 'node:test';
import assert from 'node:assert/strict';
import { creerCoeur, gererRequete } from '../../../../supabase/functions/caisse-tpe/coeur.js';
import { ADAPTATEURS } from '../../../../supabase/functions/caisse-tpe/adaptateurs/index.js';
import { simule } from '../../../../supabase/functions/caisse-tpe/adaptateurs/simule.js';
import { DELAI_REPONSE_MS } from '../../../../supabase/functions/caisse-tpe/machine.js';
import { contientNumeroDeCarte, resultatPropre, textePropre, vueTerminal, vueTransaction } from '../../../../supabase/functions/caisse-tpe/listeBlanche.js';
import { creerFausseBase } from './fauxBase.mjs';

// Tests de l'Edge Function caisse-tpe (caisse v9), sans réseau et sans clé
// réelle : le coeur de la fonction tourne sur une base en mémoire, avec le
// terminal simulé et deux adaptateurs d'essai (« faux_reel », un prestataire
// qui n'est pas une simulation ; « piege », dont les réponses portent un
// numéro de carte entier, une date d'expiration et un cryptogramme).
// Les règles de la vraie base sont prouvées à part, par l'essai à blanc de la
// migration.

const CLE = 'CLE-ESSAI-TEMOIN-7b41d09e63';
const PAN = '4111111111111111';
const EXPIRATION = '12/29';
const A = 'maison-a';
const B = 'maison-b';
const u = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;

// Tout ce qui sort : réponses de la fonction, journal de la fonction, console.
const reponses = [];
const journaux = [];
const console_ = [];
['log', 'info', 'warn', 'error', 'debug'].forEach((m) => {
  const origine = console[m].bind(console);
  console[m] = (...a) => { console_.push(a.map(String).join(' ')); if (process.env.BAVARD) origine(...a); };
});

let temps = Date.parse('2026-11-11T12:00:00Z');
const horloge = () => temps;
const attendre = (ms) => { temps += ms; };

const piege = {
  ...simule,
  id: 'piege',
  nom: 'Piège',
  simulation: false,
  vu: 0,
  async statut({ transaction }) {
    piege.vu += 1;
    return {
      statut: 'approuve',
      idPrestataire: 'P-PIEGE-1',
      montantCentimes: Math.round(transaction.montant * 100),
      pourboireCentimes: Math.round(transaction.pourboire * 100),
      devise: 'CHF',
      marque: `Visa ${PAN}`,
      finCarte: PAN,
      codeAutorisation: 'A1B2C3',
      message: `carte ${PAN} exp ${EXPIRATION}`,
      numeroCarte: PAN,
      pan: PAN,
      expiration: EXPIRATION,
      cvv: '123',
      piste: `%B${PAN}^CLIENT/ESSAI^2912`,
      slip: [`CARTE ${PAN}`, `EXP ${EXPIRATION}`],
      brut: { card: { number: PAN, expiry: EXPIRATION, cvc: '123' } },
    };
  },
};
const fauxReel = { ...simule, id: 'faux_reel', nom: 'Faux prestataire réel', simulation: false };

const base = creerFausseBase({ horloge });
const { db, etat, recu } = base;
const adaptateurs = { ...ADAPTATEURS, faux_reel: fauxReel, piege };
const journal = (evenement, details) => journaux.push(`${evenement} ${JSON.stringify(details)}`);
const coeur = creerCoeur({ db, adaptateurs, maintenant: horloge, journal });
const appel = async (uid, corps) => {
  const r = await coeur.traiter(uid, corps);
  reponses.push(JSON.stringify(r));
  return r;
};

const serveur = u(1); const patron = u(2); const resp = u(3); const cuisinier = u(4); const serveurB = u(5); const inactif = u(6);
etat.personnes.set(serveur, { role: 'serveur', maisons: [A], nom: 'Serveur Essai' });
etat.personnes.set(patron, { role: 'patron', maisons: [A], nom: 'Patron Essai' });
etat.personnes.set(resp, { role: 'resp_cuisine', maisons: [A], nom: 'Resp Essai' });
etat.personnes.set(cuisinier, { role: 'cuisinier', maisons: [A], peut: false });
etat.personnes.set(serveurB, { role: 'serveur', maisons: [B] });
etat.personnes.set(inactif, { role: 'patron', maisons: [A], actif: false });

let n = 100;
const ticket = (plus = {}) => {
  const t = { id: u((n += 1)), etablissement_id: A, statut: 'ouvert', test: true, total: 100, ...plus };
  etat.tickets.set(t.id, t);
  return t.id;
};
const ref = () => u((n += 1));
let tSim; let tReel; let tPiege;

test('relier un terminal : patron seulement, la clé part au coffre et ne revient jamais', async () => {
  for (const qui of [serveur, resp, cuisinier, serveurB, inactif]) {
    const r = await appel(qui, { action: 'terminal_relier', etablissement_id: A, prestataire: 'simule', nom: 'Refus', numero_serie: 'SIM-0', secret: { cle: CLE }, code: 'ESSAI1' });
    assert.equal(r.statut, 403);
  }
  assert.equal(etat.terminaux.size, 0);
  const court = await appel(patron, { action: 'terminal_relier', etablissement_id: A, prestataire: 'simule', nom: 'Bar', numero_serie: 'SIM-1', secret: { cle: 'court' }, code: 'ESSAI1' });
  assert.equal(court.statut, 400);
  const code = await appel(patron, { action: 'terminal_relier', etablissement_id: A, prestataire: 'simule', nom: 'Bar', numero_serie: 'SIM-1', secret: { cle: CLE }, code: 'non' });
  assert.equal(code.statut, 400);
  const inconnu = await appel(patron, { action: 'terminal_relier', etablissement_id: A, prestataire: 'payrexx', nom: 'Bar', numero_serie: 'SN-1', secret: { cle: CLE }, code: 'ESSAI1' });
  assert.equal(inconnu.statut, 400);
  assert.equal(etat.terminaux.size, 0);

  const r = await appel(patron, { action: 'terminal_relier', etablissement_id: A, prestataire: 'simule', nom: 'Terminal du bar', numero_serie: 'SIM-1', secret: { cle: CLE, autre: 'ignoré' }, code: 'ESSAI1' });
  assert.equal(r.statut, 200);
  tSim = r.corps.terminal.id;
  assert.deepEqual(Object.keys(r.corps.terminal).sort(), Object.keys(vueTerminal({})).sort());
  assert.equal(r.corps.terminal.cle_fin, CLE.slice(-4));
  assert.equal(JSON.parse(etat.coffre.get(tSim)).cle, CLE);
  assert.deepEqual(Object.keys(JSON.parse(etat.coffre.get(tSim))), ['cle']);

  tReel = (await appel(patron, { action: 'terminal_relier', etablissement_id: A, prestataire: 'faux_reel', nom: 'Terminal réel', numero_serie: 'SN-2', secret: { cle: CLE }, code: 'ESSAI2' })).corps.terminal.id;
  tPiege = (await appel(patron, { action: 'terminal_relier', etablissement_id: A, prestataire: 'piege', nom: 'Terminal piège', numero_serie: 'SN-3', secret: { cle: CLE }, code: 'ESSAI3' })).corps.terminal.id;
});

test('prestataires : ce qu\'il faut saisir, rien de secret ; Payrexx n\'est pas inscrit', async () => {
  const r = await appel(serveur, { action: 'prestataires' });
  assert.equal(r.statut, 200);
  assert.deepEqual(Object.keys(ADAPTATEURS), ['simule']);
  const s = r.corps.prestataires.find((p) => p.id === 'simule');
  assert.equal(s.simulation, true);
  assert.deepEqual(s.champs.map((c) => c.cle), ['cle']);
});

test('accepté : la transaction passe par en cours puis approuvé', async () => {
  const tk = ticket();
  const d = await appel(serveur, { action: 'demarrer', ticket_id: tk, terminal_id: tSim, montant: 42.5, pourboire: 2, reference: ref() });
  assert.equal(d.statut, 200);
  assert.equal(d.corps.transaction.statut, 'en_cours');
  const id = d.corps.transaction.id;
  attendre(1000);
  assert.equal((await appel(serveur, { action: 'statut', transaction_id: id })).corps.transaction.statut, 'en_cours');
  attendre(2500);
  const s = await appel(serveur, { action: 'statut', transaction_id: id });
  assert.equal(s.corps.transaction.statut, 'approuve');
  assert.equal(s.corps.transaction.montant, 42.5);
  assert.equal(s.corps.transaction.pourboire, 2);
  assert.equal(s.corps.transaction.marque, 'Simulation');
  assert.equal(s.corps.transaction.fin_carte, '0000');
  assert.deepEqual(Object.keys(s.corps.transaction).sort(), Object.keys(vueTransaction({})).sort());
  assert.equal(base.reste(tk), 57.5);
  // Un statut redemandé sur une transaction finale ne rappelle pas le terminal.
  const avant = recu.filter((x) => x[0] === 'terminalSecret').length;
  await appel(serveur, { action: 'statut', transaction_id: id });
  assert.equal(recu.filter((x) => x[0] === 'terminalSecret').length, avant);
});

test('refusé : message du prestataire en clair', async () => {
  const tk = ticket();
  const d = await appel(serveur, { action: 'demarrer', ticket_id: tk, terminal_id: tSim, montant: 20.01, reference: ref() });
  attendre(3500);
  const s = await appel(serveur, { action: 'statut', transaction_id: d.corps.transaction.id });
  assert.equal(s.corps.transaction.statut, 'refuse');
  assert.equal(s.corps.transaction.message, 'Carte refusée (simulation).');
  assert.equal(base.reste(tk), 100);
});

test('annulé à la caisse', async () => {
  const tk = ticket();
  const d = await appel(serveur, { action: 'demarrer', ticket_id: tk, terminal_id: tSim, montant: 30, reference: ref() });
  attendre(1000);
  const a = await appel(serveur, { action: 'annuler', transaction_id: d.corps.transaction.id });
  assert.equal(a.corps.transaction.statut, 'annule');
  assert.equal(a.corps.transaction.message, 'Annulé à la caisse.');
  // Le terminal est libre : une nouvelle tentative démarre.
  const d2 = await appel(serveur, { action: 'demarrer', ticket_id: tk, terminal_id: tSim, montant: 30, reference: ref() });
  assert.equal(d2.corps.transaction.statut, 'en_cours');
  attendre(3500);
  assert.equal((await appel(serveur, { action: 'statut', transaction_id: d2.corps.transaction.id })).corps.transaction.statut, 'approuve');
});

test('annulé sur le terminal', async () => {
  const tk = ticket();
  const d = await appel(serveur, { action: 'demarrer', ticket_id: tk, terminal_id: tSim, montant: 20.02, reference: ref() });
  attendre(3500);
  const s = await appel(serveur, { action: 'statut', transaction_id: d.corps.transaction.id });
  assert.equal(s.corps.transaction.statut, 'annule');
  assert.match(s.corps.transaction.message, /sur le terminal/);
});

test('délai dépassé : incertain, rien de posé ; puis retrouvé accepté, sans second débit', async () => {
  const tk = ticket();
  const d = await appel(serveur, { action: 'demarrer', ticket_id: tk, terminal_id: tSim, montant: 20.03, reference: ref() });
  const id = d.corps.transaction.id;
  attendre(60000);
  assert.equal((await appel(serveur, { action: 'statut', transaction_id: id })).corps.transaction.statut, 'en_cours');
  attendre(DELAI_REPONSE_MS - 60000 + 1);
  const s = await appel(serveur, { action: 'statut', transaction_id: id });
  assert.equal(s.corps.transaction.statut, 'incertain');
  assert.equal(base.reste(tk), 100);
  // Pas de nouvelle tentative tant que le doute n'est pas levé.
  const d2 = await appel(serveur, { action: 'demarrer', ticket_id: tk, terminal_id: tSim, montant: 20.03, reference: ref() });
  assert.equal(d2.statut, 400);
  assert.match(d2.corps.error, /deja en route/);
  // Annuler un incertain ne change rien : seul le prestataire ou un responsable tranche.
  assert.equal((await appel(serveur, { action: 'annuler', transaction_id: id })).corps.transaction.statut, 'incertain');
  attendre(20000);
  const s2 = await appel(serveur, { action: 'statut', transaction_id: id });
  assert.equal(s2.corps.transaction.statut, 'approuve');
  assert.equal([...etat.transactions.values()].filter((x) => x.ticket_id === tk).length, 1);
  assert.equal(base.reste(tk), 79.97);
});

test('erreur réseau au démarrage : incertain tout de suite ; le prestataire reste muet, un responsable tranche', async () => {
  const tk = ticket();
  const d = await appel(serveur, { action: 'demarrer', ticket_id: tk, terminal_id: tSim, montant: 20.04, reference: ref() });
  assert.equal(d.statut, 200);
  assert.equal(d.corps.transaction.statut, 'incertain');
  const id = d.corps.transaction.id;
  attendre(5000);
  assert.equal((await appel(serveur, { action: 'statut', transaction_id: id })).corps.transaction.statut, 'incertain');
  assert.equal((await appel(serveur, { action: 'trancher', transaction_id: id, decision: 'non_paye', motif: 'Rien sur le terminal' })).statut, 403);
  assert.equal((await appel(resp, { action: 'trancher', transaction_id: id, decision: 'non_paye', motif: '' })).statut, 400);
  const t = await appel(resp, { action: 'trancher', transaction_id: id, decision: 'non_paye', motif: 'Rien sur le terminal' });
  assert.equal(t.corps.transaction.statut, 'annule');
  assert.equal(t.corps.transaction.tranche, true);
  assert.ok(etat.journal.some((j) => /incertain tranché : non payé/.test(j.libelle)));
});

test('double démarrage : une seule transaction, un seul appel au terminal', async () => {
  const tk = ticket();
  const reference = ref();
  let appels = 0;
  const origine = simule.demarrer;
  simule.demarrer = async (a) => { appels += 1; return origine(a); };
  try {
    const corps = { action: 'demarrer', ticket_id: tk, terminal_id: tSim, montant: 15, reference };
    const [a, b] = await Promise.all([appel(serveur, corps), appel(serveur, corps)]);
    const c = await appel(serveur, corps);
    assert.equal(a.corps.transaction.id, b.corps.transaction.id);
    assert.equal(a.corps.transaction.id, c.corps.transaction.id);
    assert.equal([...etat.transactions.values()].filter((x) => x.ticket_id === tk).length, 1);
    assert.equal(appels, 1);
    // Une autre référence sur le même ticket, pendant que la première est en route : refus.
    const autre = await appel(serveur, { ...corps, reference: ref() });
    assert.equal(autre.statut, 400);
    assert.equal(appels, 1);
    attendre(3500);
    await appel(serveur, { action: 'statut', transaction_id: a.corps.transaction.id });
  } finally {
    simule.demarrer = origine;
  }
});

test('refus de la base : le terminal n\'est jamais appelé', async () => {
  let appels = 0;
  const origine = { s: simule.demarrer, r: fauxReel.demarrer };
  simule.demarrer = async (a) => { appels += 1; return origine.s(a); };
  fauxReel.demarrer = async (a) => { appels += 1; return origine.r(a); };
  try {
    const tk = ticket({ total: 50 });
    const vrai = ticket({ test: false, total: 80 });
    const autreMaison = ticket({ etablissement_id: B, test: false });
    const cas = [
      ['montant supérieur au reste', serveur, { ticket_id: tk, terminal_id: tSim, montant: 50.01 }, 400, /superieur au reste/],
      ['montant nul', serveur, { ticket_id: tk, terminal_id: tSim, montant: 0 }, 400, /invalide/],
      ['montant négatif', serveur, { ticket_id: tk, terminal_id: tSim, montant: -5 }, 400, /invalide/],
      ['au-delà du plafond', serveur, { ticket_id: ticket({ total: 9000 }), terminal_id: tSim, montant: 5000.5 }, 400, /plafond/],
      ['autre devise', serveur, { ticket_id: tk, terminal_id: tSim, montant: 10, devise: 'EUR' }, 400, /francs suisses/],
      ['ticket de test sur un vrai prestataire', serveur, { ticket_id: tk, terminal_id: tReel, montant: 10 }, 400, /ticket de test ne part jamais/],
      ['vrai ticket sur le terminal simulé', serveur, { ticket_id: vrai, terminal_id: tSim, montant: 10 }, 400, /simule ne sert que les tickets de test/],
      ['ticket d\'une autre maison', serveur, { ticket_id: autreMaison, terminal_id: tSim, montant: 10 }, 403, /acces refuse/],
      ['personne d\'une autre maison', serveurB, { ticket_id: tk, terminal_id: tSim, montant: 10 }, 403, /acces refuse/],
      ['cuisinier', cuisinier, { ticket_id: tk, terminal_id: tSim, montant: 10 }, 403, /acces refuse/],
      ['compte désactivé', inactif, { ticket_id: tk, terminal_id: tSim, montant: 10 }, 403, /acces refuse/],
      ['identifiant mal écrit', serveur, { ticket_id: 'x', terminal_id: tSim, montant: 10 }, 400, /Identifiant invalide/],
    ];
    for (const [nom, qui, corps, statut, motif] of cas) {
      const r = await appel(qui, { action: 'demarrer', reference: ref(), ...corps });
      assert.equal(r.statut, statut, nom);
      assert.match(r.corps.error, motif, nom);
    }
    assert.equal(appels, 0);
    // Le vrai ticket, lui, part sur le faux prestataire réel.
    const ok = await appel(serveur, { action: 'demarrer', ticket_id: vrai, terminal_id: tReel, montant: 80, reference: ref() });
    assert.equal(ok.corps.transaction.statut, 'en_cours');
    assert.equal(ok.corps.transaction.test, false);
    assert.equal(appels, 1);
    attendre(3500);
    await appel(serveur, { action: 'statut', transaction_id: ok.corps.transaction.id });
  } finally {
    simule.demarrer = origine.s;
    fauxReel.demarrer = origine.r;
  }
});

test('appel sans jeton refusé, sans toucher à la base', async () => {
  const avant = recu.length;
  const lireUtilisateur = async (autorisation) => (autorisation === 'Bearer bon' ? serveur : null);
  const sans = await gererRequete({ methode: 'POST', autorisation: null, corps: { action: 'prestataires' } }, { coeur, lireUtilisateur });
  assert.equal(sans.statut, 401);
  const vide = await gererRequete({ methode: 'POST', autorisation: 'Bearer ', corps: { action: 'prestataires' } }, { coeur, lireUtilisateur });
  assert.equal(vide.statut, 401);
  const faux = await gererRequete({ methode: 'POST', autorisation: 'Bearer faux', corps: { action: 'demarrer' } }, { coeur, lireUtilisateur });
  assert.equal(faux.statut, 401);
  const panne = await gererRequete({ methode: 'POST', autorisation: 'Bearer bon', corps: {} }, { coeur, lireUtilisateur: async () => { throw new Error('auth en panne'); } });
  assert.equal(panne.statut, 401);
  const get = await gererRequete({ methode: 'GET', autorisation: 'Bearer bon', corps: null }, { coeur, lireUtilisateur });
  assert.equal(get.statut, 405);
  assert.equal(recu.length, avant);
  const bon = await gererRequete({ methode: 'POST', autorisation: 'Bearer bon', corps: { action: 'prestataires' } }, { coeur, lireUtilisateur });
  assert.equal(bon.statut, 200);
  assert.equal((await coeur.traiter(null, { action: 'prestataires' })).statut, 401);
  assert.equal((await coeur.traiter(serveur, { action: 'constructor' })).statut, 400);
  assert.equal((await coeur.traiter(serveur, null)).statut, 400);
});

test('remboursement : patron seulement, jamais automatique ; un échec le dit', async () => {
  const tk = ticket();
  const d = await appel(serveur, { action: 'demarrer', ticket_id: tk, terminal_id: tSim, montant: 60, reference: ref() });
  const id = d.corps.transaction.id;
  attendre(3500);
  await appel(serveur, { action: 'statut', transaction_id: id });
  assert.equal((await appel(serveur, { action: 'rembourser', transaction_id: id })).statut, 403);
  assert.equal((await appel(resp, { action: 'rembourser', transaction_id: id })).statut, 403);
  const origine = simule.rembourser;
  simule.rembourser = async () => { throw new Error(`réseau coupé, clé ${CLE}`); };
  const echec = await appel(patron, { action: 'rembourser', transaction_id: id });
  simule.rembourser = origine;
  assert.equal(echec.corps.transaction.rembourse_statut, 'echec');
  assert.match(echec.corps.transaction.rembourse_message, /à faire sur le terminal/);
  const fait = await appel(patron, { action: 'rembourser', transaction_id: id });
  assert.equal(fait.corps.transaction.rembourse_statut, 'fait');
  assert.equal(fait.corps.transaction.rembourse_genre, 'void');
  assert.equal((await appel(patron, { action: 'rembourser', transaction_id: id })).statut, 400);
  assert.equal(base.reste(tk), 100);
});

test('liste blanche : une réponse qui porte un numéro de carte entier et une date d\'expiration ne laisse aucune trace', async () => {
  const vrai = ticket({ test: false, total: 33 });
  const d = await appel(serveur, { action: 'demarrer', ticket_id: vrai, terminal_id: tPiege, montant: 33, reference: ref() });
  attendre(1000);
  const s = await appel(serveur, { action: 'statut', transaction_id: d.corps.transaction.id });
  assert.equal(piege.vu, 1);
  assert.equal(s.corps.transaction.statut, 'approuve');
  assert.equal(s.corps.transaction.fin_carte, null);
  assert.equal(s.corps.transaction.marque, 'Visa [masqué]');
  assert.equal(s.corps.transaction.code_autorisation, 'A1B2C3');

  // Témoin : la réponse brute de l'adaptateur portait bien ces données.
  const brut = JSON.stringify(await piege.statut({ transaction: { montant: 1, pourboire: 0 } }));
  assert.ok(brut.includes(PAN) && brut.includes(EXPIRATION) && contientNumeroDeCarte(brut));

  const partout = {
    'ce que la base a reçu': JSON.stringify(recu),
    'les tables lisibles': JSON.stringify([[...etat.transactions.values()], [...etat.terminaux.values()], etat.journal]),
    'les réponses de la fonction': reponses.join('\n'),
    'le journal de la fonction': journaux.join('\n'),
    'la console': console_.join('\n'),
  };
  for (const [ou, texte] of Object.entries(partout)) {
    assert.equal(texte.includes(PAN), false, `numéro de carte dans ${ou}`);
    assert.equal(texte.includes(EXPIRATION), false, `date d'expiration dans ${ou}`);
    assert.equal(contientNumeroDeCarte(texte), false, `suite de chiffres de carte dans ${ou}`);
    assert.equal(/"(cvv|pan|piste|slip|brut|numeroCarte|expiration)"/.test(texte), false, `champ interdit dans ${ou}`);
  }
});

test('secret : la clé d\'essai n\'est dans aucune réponse, aucun journal, aucune ligne lisible', async () => {
  // Une panne de l'adaptateur dont le message cite la clé ne la fait pas sortir.
  const tk = ticket();
  const origine = simule.demarrer;
  simule.demarrer = async () => { throw new Error(`Authorization: ${CLE}`); };
  const d = await appel(serveur, { action: 'demarrer', ticket_id: tk, terminal_id: tSim, montant: 12, reference: ref() });
  simule.demarrer = origine;
  assert.equal(d.corps.transaction.statut, 'incertain');
  // Une panne de la base (erreur technique) ne sort pas son texte.
  const lire = db.lire;
  db.lire = async () => { throw new Error(`connexion perdue ${CLE}`); };
  const panne = await appel(serveur, { action: 'statut', transaction_id: d.corps.transaction.id });
  db.lire = lire;
  assert.equal(panne.statut, 500);
  assert.equal(panne.corps.error, 'Erreur technique. Réessayez.');
  await appel(patron, { action: 'terminal_etat', terminal_id: tSim });

  // Témoin : la recherche trouve la clé là où elle doit être, et seulement là.
  assert.equal([...etat.coffre.values()].filter((s) => s.includes(CLE)).length, 3);
  assert.equal(recu.filter((x) => x[0] === 'terminalPoser' && JSON.stringify(x).includes(CLE)).length, 3);
  const horsCoffre = recu.filter((x) => x[0] !== 'terminalPoser');
  const partout = {
    'les appels à la base hors dépôt au coffre': JSON.stringify(horsCoffre),
    'les tables lisibles': JSON.stringify([[...etat.transactions.values()], [...etat.terminaux.values()], etat.journal]),
    'les réponses de la fonction': reponses.join('\n'),
    'le journal de la fonction': journaux.join('\n'),
    'la console': console_.join('\n'),
  };
  for (const [ou, texte] of Object.entries(partout)) {
    assert.equal(texte.includes(CLE), false, `clé d'essai dans ${ou}`);
    assert.equal(texte.includes(CLE.slice(0, 16)), false, `début de la clé dans ${ou}`);
  }
  assert.ok(reponses.length > 60 && journaux.length > 20);
});

test('retirer un terminal : patron seulement, la clé quitte le coffre', async () => {
  assert.equal((await appel(serveur, { action: 'terminal_retirer', terminal_id: tPiege })).statut, 403);
  assert.equal((await appel(resp, { action: 'terminal_retirer', terminal_id: tPiege })).statut, 403);
  const r = await appel(patron, { action: 'terminal_retirer', terminal_id: tPiege });
  assert.equal(r.statut, 200);
  assert.equal(r.corps.terminal.actif, false);
  assert.equal(etat.coffre.has(tPiege), false);
  const d = await appel(serveur, { action: 'demarrer', ticket_id: ticket({ test: false }), terminal_id: tPiege, montant: 10, reference: ref() });
  assert.equal(d.statut, 400);
});

test('liste blanche, fonctions : ce qui passe et ce qui ne passe pas', () => {
  assert.equal(contientNumeroDeCarte(PAN), true);
  assert.equal(contientNumeroDeCarte('4111 1111 1111 1111'), true);
  assert.equal(contientNumeroDeCarte('4111-1111-1111-1111'), true);
  assert.equal(contientNumeroDeCarte('ticket 2026-000123, 42.50 CHF'), false);
  assert.equal(contientNumeroDeCarte('1234'), false);
  assert.equal(textePropre(`Refus ${PAN}`, 160), 'Refus [masqué]');
  assert.equal(textePropre('Carte refusée', 160), 'Carte refusée');
  assert.equal(textePropre(12, 160), null);
  const r = resultatPropre({ statut: 'approuve', finCarte: '12345', codeAutorisation: 'trop long pour un code', devise: 'chf', idPrestataire: PAN, montantCentimes: 12.5 });
  assert.deepEqual(r, { statut: 'approuve', idPrestataire: null, montantCentimes: null, pourboireCentimes: null, devise: null, marque: null, finCarte: null, codeAutorisation: null, message: null });
  assert.equal(resultatPropre(null).statut, 'injoignable');
  assert.equal(resultatPropre({ statut: 'SUCCESS' }).statut, 'incertain');
  assert.equal(resultatPropre({ statut: 'approuve', finCarte: '1234' }).finCarte, '1234');
});

test('une réponse au format de la référence Payrexx, passée telle quelle, ne pose rien', () => {
  // Forme recopiée du schéma « Get Payment » de la référence officielle
  // (developers.payrexx.com/reference/get-terminal-payment, lue le 11.11.2026),
  // valeurs d'essai. Aucun adaptateur Payrexx n'existe : cette forme brute ne
  // traverse donc pas la liste blanche, et son reçu (slip) encore moins.
  const brute = {
    status: 'success',
    data: {
      paymentId: 'pay_0001', status: 'SUCCESS', type: 'CHARGE', amount: 4250, purpose: 'Ticket', currency: 'CHF',
      tipAmount: 200, paymentMethod: 'visa', cardBrand: 'visa', referenceId: 'REF-1', printSlip: true,
      terminal: 'N86W000001', slip: ['VISA', `XXXX XXXX XXXX ${PAN.slice(-4)}`, `${PAN}`],
    },
  };
  const r = resultatPropre(brute);
  assert.equal(r.statut, 'incertain');
  assert.equal(JSON.stringify(r).includes(PAN), false);
  assert.deepEqual(Object.keys(r).sort(), ['codeAutorisation', 'devise', 'finCarte', 'idPrestataire', 'marque', 'message', 'montantCentimes', 'pourboireCentimes', 'statut']);
});
