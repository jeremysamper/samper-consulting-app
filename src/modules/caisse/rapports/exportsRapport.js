// ─────────────────────────────────────────────────────────────────────────────
// Fichiers des rapports de la caisse, sans React ni DOM (testé par
// node --test, calculRapports.test.mjs).
//
// Chaque rapport devient une feuille { nom, fichier, colonnes, rangs }, dans
// la forme des feuilles d'exportCompta.js : même classeur Excel (en-têtes
// figés, montants en nombres), mêmes CSV fr_CH (UTF-8 avec BOM, « ; » entre
// les colonnes, « . » décimal, dates JJ.MM.AAAA). Les feuilles lisent le
// rapport calculé par rapportCaisse : mêmes montants qu'à l'écran par
// construction.
//
// Dossier fiduciaire : la sortie comptable d'une période, en un zip. Seuls
// les jours clôturés y entrent ; un jour provisoire est nommé dans le
// lisez-moi et laissé dehors. Le journal des ventes et les encaissements
// sortent des clôtures figées (une clôture complémentaire ne s'additionne
// jamais) ; le journal des tickets sort des tickets numérotés.
// Rien ici n'est une écriture comptable.
// ─────────────────────────────────────────────────────────────────────────────

import { strToU8, zipSync } from 'fflate';
import { classeurXlsx, csvFeuille, feuilleXml } from '../../comptabilite/exportCompta.js';
import { centimes, detailTva } from '../tva.js';
import { LIBELLES_SERVICES, libelleMoyen, numeroDe, piecesRapport, trierPlats } from './calculRapports.js';
import { clePeriode, libellePeriodeCaisse } from './periodesCaisse.js';

const ISO = /^\d{4}-\d{2}-\d{2}/;
export const dateCH = (iso) => (ISO.test(String(iso || '')) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const ZURICH = new Intl.DateTimeFormat('fr-CH', {
  timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
// « 03.11.2026 12:05 », heure de Zurich.
export function dateHeureCH(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(ZURICH.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}
const fr = (c) => c / 100;
const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);
const pct = (p) => (p == null ? null : Math.round(p * 1000) / 10);
// « 1 ticket », « 4 tickets » : l'accord se fait ici.
const nb = (n, un, plusieurs) => `${Number(n || 0)} ${Math.abs(Number(n || 0)) > 1 ? plusieurs : un}`;
const rang = (cellules, fort = false) => ({ cellules, fort });
const vide = () => rang([]);
const M = (titre, largeur = 13) => ({ titre, montant: true, largeur });
const T = (titre, largeur = 18) => ({ titre, largeur });

export const titreRapport = (rapport) => `Caisse, ${libellePeriodeCaisse(rapport.periode)}${rapport.provisoire ? ' (provisoire)' : ''}`;
export const nomFichierRapport = (periode, sorte) => (sorte === 'csv'
  ? `caisse_${clePeriode(periode)}_csv.zip`
  : `caisse_${clePeriode(periode)}.${sorte}`);
export const nomFichierDossier = (periode) => `dossier-caisse_${periode.debut}_${periode.fin}.zip`;

const GENRES_JOURNAL = {
  annulation: 'Annulation', remise: 'Remise', offert: 'Offert', abandon: 'Abandon', correction: 'Correction de réservation',
  test_entree: 'Mode test, entrée', test_sortie: 'Mode test, sortie', test_purge: 'Mode test, purge',
};
export const libelleGenre = (g) => GENRES_JOURNAL[g] || g;

// ── Les feuilles d'un rapport ──
function feuilleSynthese(r, { noShow = null } = {}) {
  const s = r.synthese;
  const rangs = [
    rang(['Chiffre d\'affaires TVA comprise', s.ttc, 'ventes moins annulations'], true),
    rang(['Chiffre d\'affaires hors TVA', s.ht, '']),
    rang(['TVA', s.tva, '']),
    ...s.parTaux.map((t) => rang([`   dont ${String(t.taux).replace('.', ',')} %`, t.ttc, `hors TVA ${t.ht.toFixed(2)}, TVA ${t.tva.toFixed(2)}`])),
    rang(['Ventes encaissées', s.ventesTtc, nb(s.tickets, 'ticket', 'tickets')]),
    rang(['Annulations', s.annulationsTtc ? -s.annulationsTtc : 0, nb(s.annulations, 'ticket annulé', 'tickets annulés')]),
    rang(['Couverts', s.couverts, '']),
    rang(['Ticket moyen', s.ticketMoyen, '']),
    rang(['Dépense moyenne par couvert', s.parCouvert, '']),
    rang(['Midi', s.midi.ttc, s.midi.part == null ? '' : `${pct(s.midi.part)} % du chiffre`]),
    rang(['Soir', s.soir.ttc, s.soir.part == null ? '' : `${pct(s.soir.part)} % du chiffre`]),
    rang(['Sur place', s.surPlace.ttc, s.surPlace.part == null ? '' : `${pct(s.surPlace.part)} % du chiffre`]),
    rang(['À emporter', s.emporter.ttc, s.emporter.part == null ? '' : `${pct(s.emporter.part)} % du chiffre`]),
  ];
  if (noShow) rangs.push(rang(['No-show de la période', noShow.tables, `${nb(noShow.couverts, 'couvert', 'couverts')}, selon le rapport des réservations`]));
  rangs.push(vide(), rang(['Jours de la période', null, null], true));
  r.jours.forEach((j) => rangs.push(rang([
    dateCH(j.jour), j.ttc,
    j.provisoire ? 'provisoire : jour non clôturé' : `clôture n° ${j.cloture.numero}`,
  ])));
  if (r.provisoire) rangs.push(vide(), rang([`Rapport provisoire : ${nb(r.provisoires.length, 'jour n\'est pas clôturé', 'jours ne sont pas clôturés')} (${r.provisoires.map(dateCH).join(', ')}).`, null, null], true));
  return { id: 'synthese', nom: 'Synthèse', fichier: 'synthese.csv', colonnes: [T('Rubrique', 44), M('Valeur', 16), T('Détail', 60)], rangs };
}

function feuilleMoyens(r) {
  const m = r.moyens;
  const rangs = m.lignes.map((l) => rang([l.nom, l.nombre, l.ventes, l.annulations ? -l.annulations : 0, l.net, l.pourboires]));
  rangs.push(rang(['Total', null, null, null, m.net, m.pourboires], true));
  rangs.push(vide(), rang(['Écarts d\'arrondi aux 5 centimes', null, null, null, m.arrondis, null]));
  if (r.ecartsCaisse) {
    rangs.push(vide(), rang(['Écarts de caisse des clôtures', null, null, null, r.ecartsCaisse.total, null], true));
    r.ecartsCaisse.lignes.forEach((e) => rangs.push(rang([
      `${dateCH(e.jour)}, clôture n° ${e.numeroRetenu}${e.motif ? `, ${e.motif}` : ''}`, null, null, null, e.ecart, null,
    ])));
  }
  return {
    id: 'moyens', nom: 'Moyens de paiement', fichier: 'moyens-de-paiement.csv',
    colonnes: [T('Moyen', 40), M('Paiements', 11), M('Ventes'), M('Annulations'), M('Net encaissé', 14), M('Pourboires')],
    rangs,
  };
}

function feuillePlats(r, tri) {
  const p = r.plats;
  const rangs = trierPlats(p.lignes, tri).map((l) => rang([
    l.libelle, l.categorie, l.qte, l.ttc, l.midi.qte, l.midi.ttc, l.soir.qte, l.soir.ttc, l.offertsQte, l.offertsValeur, l.remises,
  ]));
  rangs.push(rang(['Total', nb(p.lignes.length, 'produit', 'produits'), p.qte, p.ttc, p.midi.qte, p.midi.ttc, p.soir.qte, p.soir.ttc, p.offertsQte, p.offertsValeur, p.remises], true));
  return {
    id: 'plats', nom: 'Plats vendus', fichier: 'plats-vendus.csv',
    colonnes: [
      T('Produit', 34), T('Catégorie', 18), M('Quantité', 10), M('Chiffre TTC'), M('Quantité midi', 10), M('Chiffre midi'),
      M('Quantité soir', 10), M('Chiffre soir'), M('Offerts', 9), M('Valeur offerte'), M('Remises'),
    ],
    rangs,
  };
}

function feuilleServices(r) {
  const rangs = r.services.map((s) => rang([
    dateCH(s.jour), LIBELLES_SERVICES[s.service], s.tickets, s.annulations, s.couverts, s.ttc, s.dureeMoyenneMin,
    r.provisoires.includes(s.jour) ? 'provisoire' : 'clôturé',
  ]));
  const s = r.synthese;
  rangs.push(rang(['Total', nb(r.services.length, 'service', 'services'), s.tickets, s.annulations, s.couverts, s.ttc, null, null], true));
  return {
    id: 'services', nom: 'Services', fichier: 'services.csv',
    colonnes: [T('Date', 11), T('Service', 9), M('Tickets', 9), M('Annulations', 11), M('Couverts', 9), M('Chiffre TTC'), M('Durée moyenne d\'une table (min)', 14), T('État', 11)],
    rangs,
  };
}

function feuilleHeures(r) {
  return {
    id: 'heures', nom: 'Heures', fichier: 'heures.csv',
    colonnes: [T('Heure d\'ouverture', 16), M('Tickets', 9), M('Couverts', 9), M('Chiffre TTC')],
    rangs: r.heures.map((h) => rang([`${String(h.heure).padStart(2, '0')}:00`, h.tickets, h.couverts, h.ttc])),
  };
}

function feuillePersonnes(r) {
  return {
    id: 'personnes', nom: 'Personnes', fichier: 'personnes.csv',
    colonnes: [
      T('Personne', 28), M('Tickets ouverts', 10), M('Tickets encaissés', 10), M('Chiffre encaissé'), M('Annulations', 11), M('Montant annulé'),
      M('Remises', 9), M('Montant remis'), M('Offerts', 9), M('Valeur offerte'),
    ],
    rangs: r.personnes.map((p) => rang([p.nom, p.ouverts, p.encaisses, p.ttc, p.annulations, p.annulationsTtc, p.remisesLignes, p.remises, p.offertsLignes, p.offertsValeur])),
  };
}

function feuilleJournal(r) {
  const j = r.journal;
  const rangs = j.entrees.map((e) => rang([dateHeureCH(e.quand), libelleGenre(e.genre), e.piece, e.detail, e.auteur, e.motif, e.montant, e.nombre ?? null]));
  rangs.push(
    vide(),
    rang(['Mode test', `${nb(j.tests.entrees, 'entrée', 'entrées')}, ${nb(j.tests.sorties, 'sortie', 'sorties')}, ${nb(j.tests.purges, 'purge', 'purges')}`, null, null, null, 'tickets de test purgés, hors chiffres', j.tests.montant, j.tests.tickets], true),
  );
  return {
    id: 'journal', nom: 'Journal des écarts', fichier: 'journal-des-ecarts.csv',
    colonnes: [T('Date et heure', 17), T('Genre', 24), T('Ticket', 13), T('Détail', 34), T('Auteur', 22), T('Motif', 34), M('Montant'), M('Nombre', 9)],
    rangs,
  };
}

function feuilleClients(r, { noShow = null } = {}) {
  const c = r.clients;
  const rangs = [
    rang(['Sur réservation', c.reservation.tickets, c.reservation.couverts, c.reservation.ttc]),
    rang(['De passage, à table', c.passage.tickets, c.passage.couverts, c.passage.ttc]),
    rang(['Vente directe', c.direct.tickets, c.direct.couverts, c.direct.ttc]),
    rang(['dont comptes clients', c.comptes.tickets, c.comptes.couverts, c.comptes.ttc]),
  ];
  if (noShow) rangs.push(vide(), rang(['No-show, selon le rapport des réservations', noShow.tables, noShow.couverts, null]));
  return {
    id: 'clients', nom: 'Clients', fichier: 'clients.csv',
    colonnes: [T('Origine', 40), M('Tickets', 9), M('Couverts', 9), M('Chiffre TTC')],
    rangs,
  };
}

// Les feuilles que le niveau du rapport peut lire, dans l'ordre de l'écran.
//   options : { tri } pour les plats, { noShow: { tables, couverts } }
export function feuillesRapport(rapport, { tri = 'qte', noShow = null } = {}) {
  const direction = rapport.niveau === 'direction';
  return [
    direction && feuilleSynthese(rapport, { noShow }),
    direction && feuilleMoyens(rapport),
    feuillePlats(rapport, tri),
    feuilleServices(rapport),
    direction && feuilleHeures(rapport),
    direction && feuillePersonnes(rapport),
    direction && feuilleJournal(rapport),
    direction && feuilleClients(rapport, { noShow }),
  ].filter(Boolean);
}

// ── Sorties ──
// `date` : horodatage des fichiers, à fixer dans un test.
export function xlsxFeuilles(feuilles, titre, { date = new Date() } = {}) {
  return classeurXlsx({
    xml: feuilles.map((f, i) => feuilleXml(f, titre, i === 0)),
    noms: feuilles.map((f) => f.nom),
    titre,
    date,
  });
}

export function zipFichiers(fichiers, { date = new Date() } = {}) {
  const entrees = {};
  Object.entries(fichiers).forEach(([nom, contenu]) => {
    entrees[nom] = [typeof contenu === 'string' ? strToU8(contenu) : contenu, { mtime: date }];
  });
  return zipSync(entrees, { level: 6 });
}

export const xlsxRapport = (rapport, options = {}) => xlsxFeuilles(feuillesRapport(rapport, options), titreRapport(rapport), options);
export const zipCsvRapport = (rapport, options = {}) => zipFichiers(
  Object.fromEntries(feuillesRapport(rapport, options).map((f) => [f.fichier, csvFeuille(f)])),
  options,
);
// Le CSV d'un seul rapport (id d'une feuille), ou null.
export function csvRapport(rapport, id, options = {}) {
  const f = feuillesRapport(rapport, options).find((x) => x.id === id);
  return f ? csvFeuille(f) : null;
}

// ── Dossier fiduciaire ──
const TAUX_COLONNES = [8.1, 2.6, 3.8, 0];
const tauxTexte = (t) => `${String(t).replace('.', ',')} %`;

// Les feuilles du dossier. `donnees` : celles de la direction pour la période
// (caisse_rapport_donnees) ; `rapport` : rapportCaisse des mêmes données.
export function feuillesDossier({ donnees, rapport }) {
  const periode = rapport.periode;
  const dans = (j) => typeof j === 'string' && j >= periode.debut && j <= periode.fin;
  const premieres = (donnees.clotures || []).filter((c) => !c.complement_de && dans(c.jour)).sort((a, b) => a.jour.localeCompare(b.jour));
  const joursClos = new Set(premieres.map((c) => c.jour));
  const comptabilite = new Map(rapport.jours.map((j) => [j.jour, j]));

  // 1. Journal des ventes : par jour clôturé et par taux, depuis les clôtures.
  const ventes = [];
  const sommeTaux = new Map();
  premieres.forEach((c) => {
    const t = c.totaux || {};
    const de = (bloc, taux) => (bloc?.par_taux || []).find((x) => Number(x.taux) === taux) || { ttc: 0, tva: 0, ht: 0 };
    const tous = [...new Set([...(t.ventes?.par_taux || []), ...(t.annulations?.par_taux || []), ...(t.net?.par_taux || [])].map((x) => Number(x.taux)))].sort((a, b) => b - a);
    const source = comptabilite.get(c.jour)?.comptabilite;
    tous.forEach((taux) => {
      const v = de(t.ventes, taux);
      const a = de(t.annulations, taux);
      const n = de(t.net, taux);
      ventes.push(rang([
        dateCH(c.jour), c.numero, taux, nombre(v.ttc), nombre(a.ttc) ? -nombre(a.ttc) : 0, nombre(n.ttc), nombre(n.ht), nombre(n.tva),
        source === 'manuel' ? 'saisie à la main' : source === 'caisse' ? 'caisse' : 'non repris',
      ]));
      const e = sommeTaux.get(taux) || { ventes: 0, annule: 0, ttc: 0, ht: 0, tva: 0 };
      e.ventes += centimes(v.ttc); e.annule += centimes(a.ttc); e.ttc += centimes(n.ttc); e.ht += centimes(n.ht); e.tva += centimes(n.tva);
      sommeTaux.set(taux, e);
    });
  });
  [...sommeTaux.entries()].sort((a, b) => b[0] - a[0]).forEach(([taux, e]) => {
    ventes.push(rang([`Total ${tauxTexte(taux)}`, null, taux, fr(e.ventes), e.annule ? -fr(e.annule) : 0, fr(e.ttc), fr(e.ht), fr(e.tva), null], true));
  });
  const tot = [...sommeTaux.values()].reduce((s, e) => ({
    ventes: s.ventes + e.ventes, annule: s.annule + e.annule, ttc: s.ttc + e.ttc, ht: s.ht + e.ht, tva: s.tva + e.tva,
  }), { ventes: 0, annule: 0, ttc: 0, ht: 0, tva: 0 });
  ventes.push(rang([`Total, ${nb(premieres.length, 'jour clôturé', 'jours clôturés')}`, null, null, fr(tot.ventes), tot.annule ? -fr(tot.annule) : 0, fr(tot.ttc), fr(tot.ht), fr(tot.tva), null], true));

  // 2. Encaissements par jour et par moyen, depuis les clôtures.
  const encaissements = [];
  const sommeMoyens = new Map();
  premieres.forEach((c) => {
    const t = c.totaux || {};
    const cles = new Map();
    (t.moyens || []).forEach((m) => cles.set(`${m.moyen}|${m.libelle || ''}`, { m, ventes: nombre(m.montant), nombre: nombre(m.nombre), annule: 0 }));
    (t.annulations?.moyens || []).forEach((m) => {
      const k = `${m.moyen}|${m.libelle || ''}`;
      if (!cles.has(k)) cles.set(k, { m, ventes: 0, nombre: 0, annule: 0 });
      cles.get(k).annule += nombre(m.montant);
    });
    const pourboire = (m) => nombre((t.pourboires?.par_moyen || []).find((x) => x.moyen === m.moyen && (x.libelle || '') === (m.libelle || ''))?.montant);
    [...cles.values()].forEach((x) => {
      const net = fr(centimes(x.ventes) - centimes(x.annule));
      encaissements.push(rang([dateCH(c.jour), c.numero, libelleMoyen(x.m), x.nombre, x.ventes, x.annule ? -x.annule : 0, net, pourboire(x.m)]));
      const k = libelleMoyen(x.m);
      const e = sommeMoyens.get(k) || { nombre: 0, ventes: 0, annule: 0, pourboires: 0 };
      e.nombre += x.nombre; e.ventes += centimes(x.ventes); e.annule += centimes(x.annule); e.pourboires += centimes(pourboire(x.m));
      sommeMoyens.set(k, e);
    });
  });
  [...sommeMoyens.entries()].forEach(([nom, e]) => {
    encaissements.push(rang([`Total ${nom}`, null, nom, e.nombre, fr(e.ventes), e.annule ? -fr(e.annule) : 0, fr(e.ventes - e.annule), fr(e.pourboires)], true));
  });

  // 3. Clôtures journalières, complémentaires comprises (le comptage qui vaut
  // est celui de la dernière).
  const clotures = (donnees.clotures || []).filter((c) => dans(c.jour)).sort((a, b) => a.numero - b.numero).map((c) => {
    const mere = c.complement_de ? (donnees.clotures || []).find((x) => x.id === c.complement_de) : null;
    return rang([
      c.numero, dateCH(c.jour), mere ? `complémentaire de la n° ${mere.numero}` : 'clôture du jour', dateHeureCH(c.cloture_at), c.cloture_par_nom || '',
      nombre(c.totaux?.net?.ttc), nombre(c.totaux?.especes?.attendues), nombre(c.fond_caisse), nombre(c.especes_comptees), nombre(c.ecart),
      c.motif || '', c.empreinte || '',
    ]);
  });

  // 4. Journal des tickets : chaque ticket numéroté d'un jour clôturé.
  const { tickets: pieces, lignesPar, paiementsPar } = piecesRapport(donnees);
  const duDossier = pieces.filter((t) => joursClos.has(t.jour)).sort((a, b) => a.annee - b.annee || a.numero - b.numero);
  const tickets = duDossier.map((t) => {
    const tva = detailTva(lignesPar.get(t.id) || []);
    const de = (taux) => tva.find((x) => x.taux === taux);
    const autres = tva.filter((x) => !TAUX_COLONNES.includes(x.taux));
    return rang([
      numeroDe(t), dateCH(t.jour), dateHeureCH(t.closed_at), LIBELLES_SERVICES[t.service] || '', t.a_emporter ? 'à emporter' : 'sur place',
      fr(tva.reduce((s, x) => s + centimes(x.ttc), 0)),
      ...TAUX_COLONNES.flatMap((taux) => [de(taux)?.ttc ?? null, de(taux)?.tva ?? null]),
      autres.length ? fr(autres.reduce((s, x) => s + centimes(x.ttc), 0)) : null,
      (paiementsPar.get(t.id) || []).map((p) => `${libelleMoyen(p)} ${(nombre(p.montant) + nombre(p.arrondi)).toFixed(2)}`).join(' + '),
      t.statut === 'annule' ? `annulé le ${dateCH(t.annule_jour)}` : 'encaissé',
    ]);
  });

  // 5. Annulations : celles dont le jour d'annulation est clôturé.
  const annulations = pieces.filter((t) => t.statut === 'annule' && joursClos.has(t.annule_jour))
    .sort((a, b) => String(a.annule_at || '').localeCompare(String(b.annule_at || '')))
    .map((t) => {
      const tva = detailTva(lignesPar.get(t.id) || []);
      return rang([
        numeroDe(t), dateCH(t.jour), dateHeureCH(t.annule_at), dateCH(t.annule_jour), donnees.personnes?.[t.annule_par] || '', t.annule_motif || '',
        fr(tva.reduce((s, x) => s + centimes(x.ttc), 0)), fr(tva.reduce((s, x) => s + centimes(x.tva), 0)),
      ]);
    });

  return [
    {
      id: 'ventes', nom: 'Journal des ventes', fichier: 'journal-des-ventes.csv',
      colonnes: [T('Date', 26), M('Clôture n°', 10), M('Taux (%)', 9), M('Ventes TTC'), M('Annulations TTC', 14), M('Net TTC'), M('Net hors TVA', 14), M('TVA nette'), T('Repris en Comptabilité', 20)],
      rangs: ventes,
    },
    {
      id: 'encaissements', nom: 'Encaissements', fichier: 'encaissements.csv',
      colonnes: [T('Date', 26), M('Clôture n°', 10), T('Moyen', 20), M('Paiements', 10), M('Ventes'), M('Annulations'), M('Net encaissé', 14), M('Pourboires')],
      rangs: encaissements,
    },
    {
      id: 'clotures', nom: 'Clôtures', fichier: 'clotures.csv',
      colonnes: [
        M('Clôture n°', 10), T('Jour d\'exploitation', 14), T('Genre', 26), T('Clôturée le', 17), T('Par', 22), M('Net TTC'), M('Espèces attendues', 14),
        M('Fond de caisse'), M('Espèces comptées', 14), M('Écart de caisse', 12), T('Motif', 30), T('Empreinte', 68),
      ],
      rangs: clotures,
    },
    {
      id: 'tickets', nom: 'Journal des tickets', fichier: 'journal-des-tickets.csv',
      colonnes: [
        T('Numéro', 13), T('Jour d\'exploitation', 12), T('Encaissé le', 17), T('Service', 8), T('Consommation', 12), M('Total TTC'),
        ...TAUX_COLONNES.flatMap((t) => [M(`TTC ${tauxTexte(t)}`, 12), M(`TVA ${tauxTexte(t)}`, 12)]),
        M('TTC autres taux', 12), T('Règlement', 40), T('État', 20),
      ],
      rangs: tickets,
    },
    {
      id: 'annulations', nom: 'Annulations', fichier: 'annulations.csv',
      colonnes: [T('Numéro', 13), T('Jour de la vente', 12), T('Annulé le', 17), T('Jour d\'annulation', 12), T('Par', 22), T('Motif', 40), M('Total TTC'), M('TVA')],
      rangs: annulations,
    },
  ];
}

// Le résultat du contrôle de la chaîne d'intégrité, en clair.
export function texteIntegrite(chaine, { etablissement = '', date = new Date() } = {}) {
  const lignes = [
    `Contrôle de la chaîne d'intégrité de la caisse${etablissement ? `, ${etablissement}` : ''}`,
    `Contrôle lancé le ${dateHeureCH(chaine?.verifie_at || date.toISOString())} (heure de Zurich), à la date de l'export.`,
    '',
  ];
  if (!chaine) {
    lignes.push('Le contrôle n\'a pas pu être lancé : résultat absent de ce dossier.');
  } else {
    lignes.push(
      chaine.ok ? 'Résultat : chaîne intacte. Aucune pièce n\'a été modifiée depuis son scellement.' : 'Résultat : la chaîne est rompue. Une pièce a été modifiée ou manque.',
      `Maillons contrôlés : ${chaine.maillons ?? ''}`,
      `Tickets numérotés : ${chaine.tickets ?? ''}`,
      `Annulations : ${chaine.annulations ?? ''}`,
      `Clôtures : ${chaine.clotures ?? ''}`,
      `Dernière empreinte : ${chaine.derniere_empreinte ?? ''}`,
    );
    (chaine.defauts || []).forEach((d) => lignes.push(`Défaut : ${[d.piece, d.raison].filter(Boolean).join(' : ')}`));
  }
  lignes.push('', 'Le contrôle porte sur toute la caisse de l\'établissement, pas seulement sur la période exportée.');
  return `${lignes.join('\r\n')}\r\n`;
}

export function texteLisezMoi({ rapport, etablissement = '', date = new Date() }) {
  const p = rapport.periode;
  const ecarts = rapport.jours.filter((j) => !j.provisoire && j.ecartCloture);
  const saisis = rapport.jours.filter((j) => !j.provisoire && j.comptabilite === 'manuel');
  const lignes = [
    `Dossier de caisse pour la fiduciaire${etablissement ? `, ${etablissement}` : ''}`,
    `Période : du ${dateCH(p.debut)} au ${dateCH(p.fin)}. Dossier produit le ${dateHeureCH(date.toISOString())} (heure de Zurich).`,
    '',
    'Contenu',
    '- journal-des-ventes.csv : par jour clôturé et par taux de TVA, ventes, annulations et net (TTC, hors TVA, TVA).',
    '- encaissements.csv : par jour clôturé et par moyen de paiement, pourboires à part.',
    '- clotures.csv : chaque clôture de caisse, avec le comptage des espèces, l\'écart de caisse et son empreinte.',
    '- journal-des-tickets.csv : chaque ticket numéroté (numéro, date, total, taux, moyen, état).',
    '- annulations.csv : chaque annulation, avec son auteur et son motif.',
    '- integrite.txt : le résultat du contrôle de la chaîne d\'intégrité à la date de l\'export.',
    '- dossier-caisse.xlsx : les mêmes tableaux dans un classeur.',
    '- synthese.pdf : la synthèse de la période.',
    '',
    'Règles',
    '- Montants en francs suisses, TVA comprise sauf mention. La TVA d\'un taux est la somme des TVA de chaque ticket, arrondie au centime par ticket.',
    '- Une annulation est une écriture inverse dans la clôture du jour de l\'annulation ; le ticket garde son numéro.',
    '- Une clôture complémentaire recompte les espèces d\'un jour : elle ne s\'additionne jamais aux ventes.',
    '- Les tickets du mode test n\'ont pas de numéro et ne figurent nulle part dans ce dossier.',
    '- Les pourboires sont saisis à part : ni dans le chiffre d\'affaires, ni dans la base de TVA.',
    '',
  ];
  if (rapport.provisoire) {
    lignes.push(`${rapport.provisoires.length > 1 ? 'Jours laissés' : 'Jour laissé'} hors du dossier, faute de clôture (${rapport.provisoires.length}) : ${rapport.provisoires.map(dateCH).join(', ')}.`, '');
  } else {
    lignes.push('Tous les jours de vente de la période sont clôturés.', '');
  }
  if (ecarts.length) {
    lignes.push('Attention : le net recalculé depuis les tickets diffère du net figé par la clôture pour les jours suivants.');
    ecarts.forEach((j) => lignes.push(`- ${dateCH(j.jour)} : écart de ${j.ecartCloture.toFixed(2)}`));
    lignes.push('');
  }
  if (saisis.length) {
    lignes.push('Jours où la Comptabilité de l\'app retient une saisie à la main à la place du chiffre de la caisse :');
    saisis.forEach((j) => lignes.push(`- ${dateCH(j.jour)} : saisi ${nombre(j.comptabiliteTtc).toFixed(2)}, caisse ${j.ttc.toFixed(2)}`));
    lignes.push('');
  }
  lignes.push(
    'Deux points ne sont pas confirmés par un texte fédéral lu pour ce dossier et restent à valider par la fiduciaire :',
    '- le traitement TVA des pourboires (ici hors chiffre d\'affaires et hors base de TVA) ;',
    '- l\'arrondi aux 5 centimes des paiements en espèces (ici porté à part, en écart d\'arrondi).',
    '',
    'Ce dossier prépare les chiffres et les pièces. Il ne tient pas les comptes et n\'établit pas le décompte TVA officiel.',
  );
  return `${lignes.join('\r\n')}\r\n`;
}

// Le zip du dossier. `pdf` : octets de la synthèse (facultatif, construit
// dans le navigateur) ; `chaine` : résultat de caisse_verifier_chaine.
export function zipDossier({ donnees, rapport, chaine = null, pdf = null, etablissement = '', date = new Date() }) {
  const feuilles = feuillesDossier({ donnees, rapport });
  const titre = `Dossier de caisse du ${dateCH(rapport.periode.debut)} au ${dateCH(rapport.periode.fin)}`;
  const fichiers = {
    'lisez-moi.txt': texteLisezMoi({ rapport, etablissement, date }),
    ...Object.fromEntries(feuilles.map((f) => [f.fichier, csvFeuille(f)])),
    'integrite.txt': texteIntegrite(chaine, { etablissement, date }),
    'dossier-caisse.xlsx': xlsxFeuilles(feuilles, titre, { date }),
  };
  if (pdf) fichiers['synthese.pdf'] = pdf;
  return zipFichiers(fichiers, { date });
}
