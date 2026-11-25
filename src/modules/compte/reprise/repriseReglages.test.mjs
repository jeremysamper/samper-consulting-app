// node --test : reprendre les réglages d'un autre établissement (lot 02 du
// panel). Qui peut reprendre d'où, ce qui diffère, ce qui s'écrit : clé par
// clé, rien d'inventé, rien d'effacé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NON_REPRISES, REPRENABLES, apercu, comparer, idsSources, maisonsSources, valeurAEcrire } from './repriseReglages.js';
import { SECTIONS } from '../registreReglages.js';
import { fusionnerConfig } from '../../../utils/reglagesModules.js';
import { versBase } from '../../../utils/reglagesMaison.js';

const entree = (id) => REPRENABLES.find((e) => e.section === id);
const ETABS = [{ id: 'a', nom: 'Brasserie' }, { id: 'b', nom: 'Auberge' }, { id: 'c', nom: '' }];

test('idsSources et maisonsSources : les autres établissements du profil, et eux seuls', () => {
  assert.deepEqual(idsSources({ role: 'patron', etablissementIds: ['a'] }, 'a'), []);
  assert.deepEqual(maisonsSources({ role: 'patron', etablissementIds: ['a', 'b'] }, ETABS, 'a'), [{ id: 'b', nom: 'Auberge' }]);
  assert.deepEqual(idsSources({ role: 'patron' }, 'a'), []);
  assert.deepEqual(idsSources({ etablissementIds: ['a', 'b'] }, 'a'), []);
  assert.deepEqual(idsSources(null, 'a'), []);
  assert.deepEqual(idsSources({ role: 'patron', etablissementIds: ['b', 'c'] }, 'a'), [], 'établissement affiché absent du profil');
  assert.deepEqual(maisonsSources({ role: 'patron', etablissementIds: ['a', 'c', 'z'] }, ETABS, 'a'), [], 'id sans nom connu, non proposé');
});

test('comparer : non réglé là-bas, identique après normalisation, différent avec le détail', () => {
  const f = entree('horaires_fermetures');
  assert.equal(comparer(f, null, { jours_fermes: [1] }).etat, 'non_regle_la_bas');
  assert.equal(comparer(f, {}, { jours_fermes: [1] }).etat, 'non_regle_la_bas');
  assert.equal(comparer(f, { jours_fermes: [2, 1, 1] }, { jours_fermes: ['1', 2] }).etat, 'identique');
  const r = comparer(f, { jours_fermes: [1, 2] }, { jours_fermes: [1] });
  assert.equal(r.etat, 'different');
  assert.deepEqual(r.ecarts, [{ cle: 'jours_fermes', libelle: 'Jours de fermeture', format: 'jours', ici: [1], labas: [1, 2] }]);
  // L'ordre des périodes est normalisé par le lecteur.
  const p1 = { du: '2027-01-04', au: '2027-01-10', motif: 'Hiver' };
  const p2 = { du: '2026-12-01', au: '2026-12-02', motif: '' };
  assert.equal(comparer(f, { periodes: [p1, p2] }, { periodes: [p2, p1] }).etat, 'identique');
  // Module : une config vide ou absente là-bas n'est pas réglée.
  const pertes = entree('pertes');
  assert.equal(comparer(pertes, null, { motifs: ['Casse'] }).etat, 'non_regle_la_bas');
  assert.equal(comparer(pertes, {}, { motifs: ['Casse'] }).etat, 'non_regle_la_bas');
  assert.equal(comparer(pertes, { motifs: [' Casse '] }, { motifs: ['Casse'] }).etat, 'identique');
  const rp = comparer(pertes, { motifs: ['Casse', 'Autre'] }, { motifs: ['Casse'], valideurs: ['patron'] });
  assert.equal(rp.etat, 'different');
  assert.deepEqual(rp.ecarts.map((e) => e.cle), ['motifs'], 'valideurs absents là-bas : ni différence ni écriture');
});

test('valeurAEcrire, pointage : borneSeulement d\'ici gardé, dans les deux sens', () => {
  const e = entree('planning_pointage');
  const v1 = valeurAEcrire(e, { arrondi_min: 5, borne_seulement: false }, { borne_seulement: true });
  assert.equal(v1.borneSeulement, true);
  assert.equal(v1.arrondiMin, 5);
  const v2 = valeurAEcrire(e, { arrondi_min: 5, borne_seulement: true }, { borne_seulement: false });
  assert.equal(v2.borneSeulement, false);
  assert.equal(versBase.pointage(v2).borne_seulement, false);
  // La borne seule ne règle rien.
  assert.equal(comparer(e, { borne_seulement: true }, {}).etat, 'non_regle_la_bas');
  assert.equal(valeurAEcrire(e, { borne_seulement: true }, {}), null);
});

test('valeurAEcrire, objectifs : un nul là-bas laisse celui d\'ici ; tout nul, non réglé', () => {
  const e = entree('objectifs');
  const v = valeurAEcrire(e, { matiere_pct: 28, personnel_pct: null }, { matiere_pct: 30, personnel_pct: 33, ca_mensuel_ht: 90000 });
  assert.deepEqual(v, { matierePct: 28, personnelPct: 33, caMensuelHt: 90000 });
  assert.equal(comparer(e, { matiere_pct: null, personnel_pct: null, ca_mensuel_ht: null }, { matiere_pct: 30 }).etat, 'non_regle_la_bas');
  assert.equal(valeurAEcrire(e, {}, { matiere_pct: 30 }), null);
});

test('valeurAEcrire, module : clé inconnue d\'ici gardée, clé absente là-bas gardée', () => {
  const e = entree('groupes');
  const ici = { delai_alerte_jours: 14, types_actifs: ['mariage'], cle_future: 'x' };
  const changes = valeurAEcrire(e, { delai_alerte_jours: 21 }, ici);
  assert.deepEqual(changes, { delai_alerte_jours: 21 });
  const ecrite = fusionnerConfig(ici, changes);
  assert.equal(ecrite.cle_future, 'x');
  assert.deepEqual(ecrite.types_actifs, ['mariage']);
});

test('pour chaque entrée : comparer rend identique sur ce que valeurAEcrire écrit', () => {
  const sources = {
    horaires_fermetures: { jours_fermes: [1, 2], services_fermes: { 7: ['soir'] }, periodes: [{ du: '2027-01-04', au: '2027-01-17', motif: 'Hiver' }] },
    planning_pointage: { arrondi_min: 5, avance: 'prevue', cloture_auto_h: 12, borne_seulement: true },
    objectifs: { matiere_pct: 28, personnel_pct: 35, ca_mensuel_ht: null },
    pertes: { motifs: ['Casse', 'Autre'], valideurs: ['patron'] },
    groupes: { delai_alerte_jours: 21, statuts: { lu: { libelle: 'Lu', actif: false } }, types_actifs: ['mariage'] },
    fiches_salle: { valideurs: ['patron'], brouillons_visibles_salle: true, champs: { temps: false, accords: true, allergenes: true } },
    kds: { son: false, attention_minutes: 9, retard_minutes: 15 },
    demandes: { categories: [{ libelle: 'Peignoir', pole: 'etages', priorite: 'normale', delai_minutes: 30 }] },
    journal: { vue: 'detail', export: 'xlsx' },
    statistiques: { vue_defaut: 'mois_contre_mois' },
  };
  const cibles = {
    horaires_fermetures: { jours_fermes: [3] },
    planning_pointage: { arrondi_min: 0, borne_seulement: false },
    objectifs: { matiere_pct: 30, ca_mensuel_ht: 80000 },
  };
  for (const e of REPRENABLES) {
    const src = sources[e.section];
    assert.ok(src, `jeu de test pour ${e.section}`);
    const ici = cibles[e.section] || { cle_inconnue: 1 };
    assert.equal(comparer(e, src, ici).etat, 'different', e.section);
    const v = valeurAEcrire(e, src, ici);
    const apres = e.module ? fusionnerConfig(ici, v) : versBase[e.bloc](v);
    assert.equal(comparer(e, src, apres).etat, 'identique', e.section);
    if (e.module) assert.equal(apres.cle_inconnue, 1, e.section);
  }
  // Pointage : la borne d'ici n'a pas bougé.
  const p = valeurAEcrire(entree('planning_pointage'), sources.planning_pointage, cibles.planning_pointage);
  assert.equal(versBase.pointage(p).borne_seulement, false);
});

test('liste blanche : ni mep, ni catalogue, ni etages, ni repas ; sections connues du registre', () => {
  const ids = SECTIONS.map((s) => s.id);
  for (const e of REPRENABLES) {
    assert.ok(!['mep', 'catalogue', 'etages', 'repas'].includes(e.module), e.section);
    assert.ok(ids.includes(e.section), e.section);
  }
  for (const e of NON_REPRISES) assert.ok(ids.includes(e.section), e.section);
});

test('aperçu : une lecture en échec rend le message d\'échec et aucune ligne à cocher', () => {
  const entrees = REPRENABLES;
  const ok = { ok: true, fermetures: { jours_fermes: [1] }, pointage: null, objectifs: null, modules: {} };
  assert.deepEqual(apercu(entrees, { ok: false }, ok), { echec: true, lignes: [] });
  assert.deepEqual(apercu(entrees, ok, { ok: false }), { echec: true, lignes: [] });
  const v = apercu(entrees, ok, { ok: true, fermetures: null, pointage: null, objectifs: null, modules: {} });
  assert.equal(v.echec, false);
  assert.deepEqual(v.lignes.filter((l) => l.cochable).map((l) => l.entree.section), ['horaires_fermetures']);
  assert.equal(v.lignes.find((l) => l.entree.section === 'pertes').etat, 'non_regle_la_bas');
});
