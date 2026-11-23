// node --test supabase/functions/envoi-documents/logique.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construireCourriel, lireAdresses, modePiece, TAILLE_PIECE_MAX, verifierDemande } from './logique.js';

test('adresses : séparateurs, casse, doublons, invalides nommées', () => {
  const r = lireAdresses(' Patron@Hotel.ch ; compta@hotel.ch,patron@hotel.ch\nfaux@ ');
  assert.deepEqual(r.valides, ['patron@hotel.ch', 'compta@hotel.ch']);
  assert.deepEqual(r.invalides, ['faux@']);
});

test('demande : destinataire obligatoire, copie sans doublon, plafond', () => {
  assert.match(verifierDemande({ a: '', objet: 'x' }).erreur, /destinataire/);
  assert.match(verifierDemande({ a: 'a@b.ch', objet: '  ' }).erreur, /objet/);
  assert.match(verifierDemande({ a: 'a@b', objet: 'x' }).erreur, /non valable/);
  const ok = verifierDemande({ a: 'a@b.ch', cc: 'a@b.ch, c@d.ch', objet: ' Facture   12 ', message: 'Bonjour\r\n' });
  assert.deepEqual(ok, { a: ['a@b.ch'], cc: ['c@d.ch'], objet: 'Facture 12', message: 'Bonjour' });
  const onze = Array.from({ length: 11 }, (_, i) => `p${i}@x.ch`).join(',');
  assert.match(verifierDemande({ a: onze, objet: 'x' }).erreur, /au plus/);
});

test('pièce : PDF léger joint, format refusé ou fichier lourd en lien', () => {
  assert.equal(modePiece({ nom: 'Facture.PDF', taille: 120000 }), 'jointe');
  assert.equal(modePiece({ nom: 'photo.heic', taille: 1000 }), 'lien');
  assert.equal(modePiece({ nom: 'plan.pdf', taille: TAILLE_PIECE_MAX + 1 }), 'lien');
  assert.equal(modePiece({ nom: 'plan.pdf', taille: null }), 'lien');
});

test('courriel : copie omise si vide, HTML échappé, lien ajouté au texte', () => {
  const exp = { name: 'J', email: 'j@x.ch' };
  const c = construireCourriel({ expediteur: exp, a: ['a@b.ch'], cc: [], objet: 'O', message: '<b>Bonjour</b>\nSuite', piece: { nom: 'f.pdf', contenu: 'QUJD' }, lien: null, nomFichier: 'f.pdf' });
  assert.equal('cc' in c, false);
  assert.deepEqual(c.attachment, [{ name: 'f.pdf', content: 'QUJD' }]);
  assert.match(c.htmlContent, /&lt;b&gt;Bonjour&lt;\/b&gt;<br>Suite/);
  const l = construireCourriel({ expediteur: exp, a: ['a@b.ch'], cc: ['c@d.ch'], objet: 'O', message: '', piece: null, lien: 'https://s/x', nomFichier: 'g.heic' });
  assert.deepEqual(l.cc, [{ email: 'c@d.ch' }]);
  assert.equal('attachment' in l, false);
  assert.match(l.textContent, /g\.heic.*7 jours[\s\S]*https:\/\/s\/x/);
});
