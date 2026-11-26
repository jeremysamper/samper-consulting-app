// Statut d'une chambre sans réseau (lot 23) : tests purs, node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TENTATIVES, appliquerEnAttente, dernierGesteParChambre, issueRejeu, libelleBandeau,
  nouveauGeste, parametresRpc, phraseRefus, rejouerFile,
} from './statutsHorsLigne.js';

const geste = (extra = {}) => nouveauGeste({
  cle: 'k1', etablissementId: 'etab-1', chambreId: 'c1', numero: '12', statut: 'propre',
  gesteAt: '2026-11-26T08:00:00.000Z', userId: 'u1', maintenantMs: 1000, ...extra,
});

// File en mémoire : même contrat que etagesQueue (clé = cle).
function fileMemoire(elements) {
  const m = new Map(elements.map((e) => [e.cle, e]));
  return {
    m,
    retirer: async (cle) => { m.delete(cle); },
    garder: async (el) => { m.set(el.cle, el); },
  };
}

test('ajout : le geste garde son heure, sa clé, et le motif seulement hors service', () => {
  const g = geste({ motif: 'Fuite' });
  assert.equal(g.cle, 'k1');
  assert.equal(g.gesteAt, '2026-11-26T08:00:00.000Z');
  assert.equal(g.motif, null);
  assert.equal(g.attempts, 0);
  assert.equal(geste({ statut: 'hors_service', motif: 'Fuite' }).motif, 'Fuite');
});

test('paramètres de la RPC : heure du geste en rejeu, heure de la base en ligne', () => {
  const g = geste();
  assert.deepEqual(parametresRpc(g), { p_cle: 'k1', p_chambre_id: 'c1', p_statut: 'propre', p_motif: null, p_geste_at: '2026-11-26T08:00:00.000Z' });
  assert.equal(parametresRpc(g, { enLigne: true }).p_geste_at, null);
});

test('affichage : le dernier geste en attente passe par-dessus le serveur, pour son établissement', () => {
  const chambres = [
    { id: 'c1', statutMenage: 'a_faire', horsServiceMotif: '' },
    { id: 'c2', statutMenage: 'a_faire', horsServiceMotif: '' },
  ];
  const file = [
    geste({ cle: 'a', statut: 'en_cours', gesteAt: '2026-11-26T08:00:00.000Z' }),
    geste({ cle: 'b', statut: 'propre', gesteAt: '2026-11-26T08:10:00.000Z' }),
    geste({ cle: 'c', chambreId: 'c2', etablissementId: 'etab-2', statut: 'propre' }),
  ];
  const vue = appliquerEnAttente(chambres, file, 'etab-1');
  assert.deepEqual(vue[0], { id: 'c1', statutMenage: 'propre', horsServiceMotif: '', enAttente: true });
  assert.equal(vue[1], chambres[1]);
  assert.equal(dernierGesteParChambre(file, 'etab-1').get('c1').cle, 'b');
  assert.equal(appliquerEnAttente(chambres, [], 'etab-1'), chambres);
});

test('issue du rejeu : appliqué ou déjà reçu envoyés, plus ancien ignoré, panne réseau gardée', () => {
  assert.equal(issueRejeu('applique', null), 'envoye');
  assert.equal(issueRejeu('deja_recu', null), 'envoye');
  assert.equal(issueRejeu('ignore', null), 'ignore');
  assert.equal(issueRejeu(null, { message: 'Failed to fetch', code: '' }), 'reessayer');
  assert.equal(issueRejeu(null, { code: 'PGRST301' }), 'reessayer');
  assert.equal(issueRejeu(null, { code: '42501' }), 'refuse');
  assert.equal(issueRejeu(null, { code: '22007' }), 'refuse');
  assert.equal(issueRejeu(null, { code: 'P0002' }), 'refuse');
  assert.equal(issueRejeu(null, { code: 'XX000' }, 0), 'tentative');
  assert.equal(issueRejeu(null, { code: 'XX000' }, MAX_TENTATIVES - 1), 'refuse');
  assert.equal(issueRejeu('bizarre', null, 0), 'tentative');
});

test('rejeu : envoi dans l\'ordre des gestes, retrait sur « ignoré » et sur « déjà reçu »', async () => {
  const a = geste({ cle: 'a', gesteAt: '2026-11-26T08:05:00.000Z', createdAt: 2 });
  const b = geste({ cle: 'b', gesteAt: '2026-11-26T08:00:00.000Z', createdAt: 1 });
  const c = geste({ cle: 'c', chambreId: 'c2', gesteAt: '2026-11-26T08:10:00.000Z' });
  const f = fileMemoire([a, b, c]);
  const envoyes = [];
  const reponses = { a: 'applique', b: 'ignore', c: 'deja_recu' };
  const bilan = await rejouerFile({
    elements: [a, b, c],
    envoyer: async (el) => { envoyes.push(el.cle); return { data: reponses[el.cle], error: null }; },
    retirer: f.retirer, garder: f.garder, avertir: async () => assert.fail('aucun avis attendu'),
  });
  assert.deepEqual(envoyes, ['b', 'a', 'c']);
  assert.deepEqual(bilan, { envoyes: 2, ignores: 1, refuses: 0, restants: 0 });
  assert.equal(f.m.size, 0);
});

test('rejeu : une panne réseau arrête tout sans rien retirer, le rejeu suivant repart', async () => {
  const a = geste({ cle: 'a', gesteAt: '2026-11-26T08:00:00.000Z' });
  const b = geste({ cle: 'b', gesteAt: '2026-11-26T08:01:00.000Z' });
  const f = fileMemoire([a, b]);
  let appels = 0;
  const bilan = await rejouerFile({
    elements: [a, b],
    envoyer: async () => { appels += 1; return { data: null, error: { message: 'Failed to fetch', code: '' } }; },
    retirer: f.retirer, garder: f.garder, avertir: async () => {},
  });
  assert.equal(appels, 1);
  assert.deepEqual(bilan, { envoyes: 0, ignores: 0, refuses: 0, restants: 2 });
  assert.equal(f.m.size, 2);
  const encore = await rejouerFile({
    elements: [...f.m.values()],
    envoyer: async () => ({ data: 'applique', error: null }),
    retirer: f.retirer, garder: f.garder, avertir: async () => {},
  });
  assert.equal(encore.envoyes, 2);
  assert.equal(f.m.size, 0);
});

test('rejeu : un refus retire et prévient, une erreur inconnue compte une tentative', async () => {
  const a = geste({ cle: 'a', gesteAt: '2026-11-26T08:00:00.000Z' });
  const b = geste({ cle: 'b', gesteAt: '2026-11-26T08:01:00.000Z' });
  const f = fileMemoire([a, b]);
  const avis = [];
  const bilan = await rejouerFile({
    elements: [a, b],
    envoyer: async (el) => ({ data: null, error: el.cle === 'a' ? { code: '42501' } : { code: 'XX000' } }),
    retirer: f.retirer, garder: f.garder, avertir: async (el) => { avis.push(phraseRefus(el)); },
  });
  assert.deepEqual(bilan, { envoyes: 0, ignores: 0, refuses: 1, restants: 1 });
  assert.deepEqual([...f.m.keys()], ['b']);
  assert.equal(f.m.get('b').attempts, 1);
  assert.deepEqual(avis, ['Chambre 12 : le changement fait hors ligne n\'a pas été enregistré. Refaites-le.']);
});

test('libellé du bandeau', () => {
  assert.equal(libelleBandeau(1), '1 statut de chambre en attente de synchronisation');
  assert.equal(libelleBandeau(3), '3 statuts de chambre en attente de synchronisation');
});
