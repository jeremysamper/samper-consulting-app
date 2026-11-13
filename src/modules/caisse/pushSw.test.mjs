// node --test : public/push-sw.js, chargé tel quel dans un faux service worker.
// La rafale des plats prêts : chaque envoi s'affiche, puis les notifications
// déjà affichées du même groupe se ferment ; il n'en reste qu'une. Les
// messages sans groupe (réservations, alertes, essai) ne ferment rien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../../../public/push-sw.js', import.meta.url), 'utf8');

function fauxServiceWorker() {
  const affichees = [];
  const ecouteurs = {};
  const self = {
    location: { origin: 'https://app.invalid' },
    addEventListener: (type, fn) => { ecouteurs[type] = fn; },
    clients: { matchAll: async () => [], openWindow: async () => null },
    registration: {
      showNotification: async (titre, options) => {
        const n = { titre, ...options, ouverte: true, close() { this.ouverte = false; } };
        // Comme Chrome : un tag identique remplace la notification affichée.
        if (options.tag) affichees.forEach((x) => { if (x.tag === options.tag) x.ouverte = false; });
        affichees.push(n);
      },
      getNotifications: async () => affichees.filter((n) => n.ouverte),
    },
  };
  vm.runInNewContext(SOURCE, { self, Date, Math, Array, URL, console });
  const recevoir = async (message) => {
    let attente = null;
    ecouteurs.push({ data: { json: () => message, text: () => JSON.stringify(message) }, waitUntil: (p) => { attente = p; } });
    await attente;
  };
  return { recevoir, ouvertes: () => affichees.filter((n) => n.ouverte), affichees };
}

const avis = (envoi, plus = {}) => ({
  titre: 'Table 12 : En direct', corps: 'Tout est prêt (2 plats)', url: '/?page=caisse&etab=e',
  tag: `pret-1-${envoi}-t1`, groupe: 'pret-1-t1', vibration: [200, 100, 200], ...plus,
});

test('rafale : trois envois affichés l\'un après l\'autre, une seule notification reste', async () => {
  const sw = fauxServiceWorker();
  for (const k of [1, 2, 3]) await sw.recevoir(avis(k));
  assert.equal(sw.affichees.length, 3, 'chaque envoi s\'affiche (et fait vibrer)');
  assert.equal(sw.ouvertes().length, 1);
  assert.equal(sw.ouvertes()[0].tag, 'pret-1-3-t1', 'la dernière reste');
  assert.deepEqual(sw.ouvertes()[0].vibrate, [200, 100, 200]);
  assert.equal(sw.ouvertes()[0].silent, undefined, 'jamais de silence forcé');
});

test('deux suites d\'un même ticket : chacune garde sa notification', async () => {
  const sw = fauxServiceWorker();
  await sw.recevoir(avis(1));
  await sw.recevoir(avis(1, { tag: 'pret-2-1-t1', groupe: 'pret-2-t1', titre: 'Table 12 : À suivre' }));
  assert.equal(sw.ouvertes().length, 2);
});

test('sans tag effectif (iPhone) : la clé propre à chaque affichage ferme quand même les précédentes', async () => {
  const sw = fauxServiceWorker();
  // Deux avis successifs dont le premier envoi porte le même tag.
  await sw.recevoir(avis(1));
  await sw.recevoir(avis(1, { corps: 'Tout est prêt (3 plats)' }));
  assert.equal(sw.ouvertes().length, 1);
  assert.equal(sw.ouvertes()[0].body, 'Tout est prêt (3 plats)');
});

test('messages sans groupe (réservation, alerte, essai) : rien n\'est fermé', async () => {
  const sw = fauxServiceWorker();
  await sw.recevoir(avis(1));
  await sw.recevoir({ titre: 'Nouvelle réservation en ligne', corps: 'x', url: '/?page=previsions', tag: 'resa-r1' });
  await sw.recevoir({ titre: 'Notifications activées', corps: 'y', url: '/?page=previsions', tag: 'test' });
  assert.equal(sw.ouvertes().length, 3);
  const resa = sw.ouvertes().find((n) => n.tag === 'resa-r1');
  assert.equal(resa.vibrate, undefined, 'pas de motif ajouté aux autres messages');
  assert.equal(resa.data.groupe, null);
});

test('liste des notifications illisible : l\'affichage tient, aucune erreur', async () => {
  const sw = fauxServiceWorker();
  await sw.recevoir(avis(1));
  sw.affichees[0].close = () => { throw new Error('refus'); };
  await assert.doesNotReject(() => sw.recevoir(avis(2)));
});
