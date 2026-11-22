// node --test : Commande V1 (commandeV1.js), règle D3 et textes d'envoi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  besoinsGroupePourFournisseur, courrielCommande, depuisChamp, formatQuantite, groupesAPrendre, jourEnClair, jourIso,
  libelleCommande, prochaineLivraison, quantiteArrondie, quantiteRetenue, versChamp,
} from './commandeV1.js';

test('règle de quantité : cible moins reste, groupes, arrondi au colis', () => {
  assert.equal(quantiteArrondie(15000, 7000, 0, 5000), 10000); // besoin 8 kg, colis 5 kg
  assert.equal(quantiteArrondie(15000, 10000, 0, 5000), 5000);
  assert.equal(quantiteArrondie(15000, 16000, 0, 5000), 0); // reste au-dessus de la cible
  assert.equal(quantiteArrondie(15000, null, 0, 5000), null); // attend son reste
  assert.equal(quantiteArrondie(null, null, 2700, 1000), 3000); // groupes seuls
  assert.equal(quantiteArrondie(4000, 1000, 0, null), 3000); // sans colis
  assert.equal(quantiteArrondie(3, 0.5, 0, 0.75), 3); // colis de 0,75
});

test('quantité retenue : la saisie libre remplace le calcul', () => {
  const l = { stock_cible: 15000, reste: 7000, besoin_groupes: 0, conditionnement: 5000, quantite: null };
  assert.equal(quantiteRetenue(l), 10000);
  assert.equal(quantiteRetenue(l, 14000), 5000);
  assert.equal(quantiteRetenue({ ...l, quantite: 2500 }), 2500);
});

test('unités : kg et litres à l’écran, g et ml en base', () => {
  assert.equal(formatQuantite(2500, 'g'), '2,5 kg');
  assert.equal(formatQuantite(750, 'ml'), '0,75 l');
  assert.equal(formatQuantite(12, 'pcs'), '12 pièces');
  assert.equal(versChamp(2500, 'g'), '2,5');
  assert.equal(depuisChamp('2,5', 'g'), 2500);
  assert.equal(depuisChamp('', 'g'), null);
  assert.equal(depuisChamp('abc', 'g'), undefined);
  assert.equal(libelleCommande({ unite: 'g', conditionnement: 10000, conditionnement_libelle: 'Carton 10 kg' }, 20000), '2 × Carton 10 kg (20 kg)');
});

test('jours : isodow et texte', () => {
  assert.equal(jourIso('2026-11-23'), 1); // lundi
  assert.equal(jourIso('2026-11-22'), 7); // dimanche
  assert.equal(jourEnClair('2026-11-25'), 'mercredi 25.11');
});

test('prochaine livraison : heure limite la veille, passée ou non', () => {
  const f = { jours_livraison: [1, 3, 5], heure_limite: '18:00:00', delai_commande_jours: 1 };
  // dimanche 22.11 à 10 h : lundi 23 encore commandable (limite dimanche 18 h).
  assert.deepEqual(prochaineLivraison(f, { jour: '2026-11-22', minutes: 600 }), { date: '2026-11-23', limite: '2026-11-22', heure: '18:00' });
  // dimanche 22.11 à 19 h : lundi passé, mercredi 25.
  assert.equal(prochaineLivraison(f, { jour: '2026-11-22', minutes: 19 * 60 }).date, '2026-11-25');
  assert.equal(prochaineLivraison({ jours_livraison: [] }), null);
});

test('courriel : une ligne par produit commandé, rien pour les lignes vides', () => {
  const m = courrielCommande({
    fournisseur: { email: 'a@b.test' },
    commande: { date_livraison: '2026-11-25' },
    etablissement: { nom: 'Woodland' },
    lignes: [
      { nom: 'Courge', unite: 'g', stock_cible: 15000, reste: 7000, conditionnement: 10000, conditionnement_libelle: 'Carton 10 kg', reference_fourn: 'C-12' },
      { nom: 'Pommes de terre', unite: 'g', stock_cible: 20000, reste: null, conditionnement: 25000 },
    ],
  });
  assert.equal(m.a, 'a@b.test');
  assert.equal(m.nbLignes, 1);
  assert.match(m.corps, /- Courge \(réf\. C-12\) : 1 × Carton 10 kg \(10 kg\)/);
  assert.doesNotMatch(m.corps, /Pommes de terre/);
  assert.match(m.sujet, /mercredi 25\.11/);
});

test('groupes : besoins ramenés au fournisseur, fenêtre de 14 jours', () => {
  const b = besoinsGroupePourFournisseur(
    { items: [{ produitId: 'p1', unite: 'g', besoin: 2700 }, { produitId: 'p2', unite: 'g', besoin: 5 }, { produitId: 'p1', unite: 'ml', besoin: 3 }] },
    [{ id: 'p1', unite_ref: 'g' }],
  );
  assert.deepEqual(b, { p1: 2700 });
  const gs = [
    { id: 'a', dateEvenement: '2026-11-26' },
    { id: 'b', dateEvenement: '2026-12-20' },
    { id: 'c', dateEvenement: '2026-11-27', annule: true },
    { id: 'd', dateEvenement: '2026-11-28' },
  ];
  assert.deepEqual(groupesAPrendre(gs, { dateLivraison: '2026-11-25', dejaPris: new Set(['d']) }).map((g) => g.id), ['a']);
});
