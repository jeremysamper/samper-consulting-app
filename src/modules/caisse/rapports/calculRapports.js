// ─────────────────────────────────────────────────────────────────────────────
// Rapports de la caisse (v8), sans React ni DOM (testé par node --test,
// calculRapports.test.mjs). L'écran, le PDF et les fichiers lisent le même
// résultat : rapportCaisse(donnees, periode).
//
// Une seule source : les tickets encaissés et les clôtures figées de la v7,
// tels que les rend la RPC caisse_rapport_donnees. Aucun chiffre n'est
// ressaisi ni stocké une seconde fois.
//
// Le mouvement est l'unité de compte :
//   - un ticket numéroté compte en vente (+) le jour d'exploitation de son
//     encaissement, qu'il ait été annulé depuis ou non ;
//   - son annulation compte en écriture inverse (-) le jour d'exploitation de
//     l'annulation, dans le service du ticket annulé.
// Le chiffre d'une période est le net : ventes moins annulations. C'est la
// règle de la clôture du jour (caisse_totaux_jour), reprise telle quelle :
// la TVA d'un taux est la somme des TVA de chaque ticket, chacune arrondie au
// centime sur le total du taux du ticket ; jamais un recalcul sur un total.
//
// Mode test : un ticket de test n'a pas de numéro et n'entre dans aucun
// rapport. Le filtre est posé une fois, dans piecesRapport, par où passent
// tous les rapports (la base le pose aussi, dans la RPC).
//
// Montants en centimes entiers pendant les calculs, rendus en francs.
// ─────────────────────────────────────────────────────────────────────────────

import { centimes, detailTva } from '../tva.js';

const fr = (c) => c / 100;
const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);
const totalLigneC = (l) => centimes(nombre(l.quantite) * nombre(l.prix_unitaire));
const division = (a, b) => (b > 0 ? a / b : null);

export const SERVICES_CAISSE = ['midi', 'soir'];
export const LIBELLES_SERVICES = { midi: 'Midi', soir: 'Soir' };
export const LIBELLES_MOYENS = { especes: 'Espèces', carte: 'Carte bancaire', autre: 'Autre' };
export const libelleMoyen = (m) => m.libelle || LIBELLES_MOYENS[m.moyen] || m.moyen || '';
export const numeroDe = (t) => (t && t.numero != null ? `${t.annee}-${String(t.numero).padStart(6, '0')}` : '');

function grouper(liste, cle) {
  const m = new Map();
  (liste || []).forEach((x) => {
    const k = x[cle];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  });
  return m;
}

// Heure d'ouverture d'un ticket, à Zurich (0 à 23).
const HEURE_ZURICH = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', hourCycle: 'h23' });
export function heureZurich(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Number(HEURE_ZURICH.format(d).replace(/\D/g, '')) % 24;
}

// ── La lecture des tickets pour TOUS les rapports ──
// Seuls les vrais tickets numérotés passent : ni ticket de test, ni ticket
// encore ouvert, ni abandon (annulé avant encaissement, sans numéro).
export function piecesRapport(donnees) {
  const tickets = (donnees?.tickets || []).filter((t) => t && t.test !== true && t.numero != null);
  const ids = new Set(tickets.map((t) => t.id));
  const lignesPar = grouper((donnees?.lignes || []).filter((l) => ids.has(l.ticket_id)), 'ticket_id');
  const paiementsPar = grouper((donnees?.paiements || []).filter((p) => ids.has(p.ticket_id)), 'ticket_id');
  return { tickets, lignesPar, paiementsPar };
}

// Les mouvements d'une période (voir l'en-tête). Pour une période de type
// service, seuls les tickets de ce service comptent.
export function mouvements(donnees, periode) {
  const { tickets, lignesPar, paiementsPar } = piecesRapport(donnees);
  const dans = (j) => typeof j === 'string' && j >= periode.debut && j <= periode.fin;
  const service = periode.type === 'service' ? periode.service : null;
  const out = [];
  tickets.forEach((t) => {
    if (service && t.service !== service) return;
    const lignes = lignesPar.get(t.id) || [];
    const base = {
      ticket: t,
      lignes,
      paiements: paiementsPar.get(t.id) || [],
      tva: detailTva(lignes),
      total: lignes.reduce((s, l) => s + totalLigneC(l), 0),
    };
    if (dans(t.jour)) out.push({ ...base, signe: 1, jour: t.jour });
    if (t.statut === 'annule' && dans(t.annule_jour)) out.push({ ...base, signe: -1, jour: t.annule_jour });
  });
  return out;
}

// ── Totaux d'un lot de mouvements : TTC, hors TVA, TVA par taux ──
function totaux(mvts) {
  const parTaux = new Map();
  let tickets = 0;
  let annulations = 0;
  let couverts = 0;
  let ventes = 0;
  let annule = 0;
  mvts.forEach((m) => {
    if (m.signe > 0) { tickets += 1; ventes += m.total; } else { annulations += 1; annule += m.total; }
    couverts += m.signe * nombre(m.ticket.couverts);
    m.tva.forEach((x) => {
      const e = parTaux.get(x.taux) || { ttc: 0, tva: 0 };
      e.ttc += m.signe * centimes(x.ttc);
      e.tva += m.signe * centimes(x.tva);
      parTaux.set(x.taux, e);
    });
  });
  const lignes = [...parTaux.entries()].sort((a, b) => b[0] - a[0])
    .map(([taux, e]) => ({ taux, ttc: fr(e.ttc), tva: fr(e.tva), ht: fr(e.ttc - e.tva) }));
  const ttc = ventes - annule;
  const tva = [...parTaux.values()].reduce((s, e) => s + e.tva, 0);
  return {
    tickets, annulations, couverts,
    ventesTtc: fr(ventes), annulationsTtc: fr(annule),
    ttc: fr(ttc), tva: fr(tva), ht: fr(ttc - tva), parTaux: lignes,
  };
}

// 1. Synthèse de période.
function synthese(mvts) {
  const t = totaux(mvts);
  const part = (filtre) => {
    const c = mvts.filter(filtre).reduce((s, m) => s + m.signe * m.total, 0);
    return { ttc: fr(c), part: division(c, centimes(t.ttc)) };
  };
  const nets = t.tickets - t.annulations;
  return {
    ...t,
    ticketMoyen: nets > 0 ? fr(Math.round(centimes(t.ttc) / nets)) : null,
    parCouvert: t.couverts > 0 ? fr(Math.round(centimes(t.ttc) / t.couverts)) : null,
    midi: part((m) => m.ticket.service === 'midi'),
    soir: part((m) => m.ticket.service !== 'midi'),
    surPlace: part((m) => !m.ticket.a_emporter),
    emporter: part((m) => !!m.ticket.a_emporter),
  };
}

// 2. Par moyen de paiement (direction). Comme la clôture : ce que la maison
// garde est montant + arrondi ; les pourboires et les écarts d'arrondi sont
// ceux des ventes ; une annulation retire son montant du moyen.
// v9 : un paiement par carte passé par un terminal relié (p.relie, posé à la
// lecture) a sa propre ligne, « terminal relié » ; dès qu'il y en a une, la
// carte saisie à la main le dit aussi. Sans paiement relié, les lignes sont
// exactement celles de la v8.
function moyens(mvts) {
  const par = new Map();
  let arrondis = 0;
  let pourboires = 0;
  mvts.forEach((m) => {
    m.paiements.forEach((p) => {
      const relie = p.moyen === 'carte' && p.relie === true;
      const cle = `${p.moyen}|${p.libelle || ''}|${relie ? 'relie' : ''}`;
      if (!par.has(cle)) par.set(cle, { moyen: p.moyen, libelle: p.libelle || '', relie, nombre: 0, ventes: 0, annulations: 0, pourboires: 0 });
      const e = par.get(cle);
      const garde = centimes(p.montant) + centimes(p.arrondi);
      if (m.signe > 0) {
        e.nombre += 1;
        e.ventes += garde;
        e.pourboires += centimes(p.pourboire);
        arrondis += centimes(p.arrondi);
        pourboires += centimes(p.pourboire);
      } else {
        e.annulations += garde;
      }
    });
  });
  const ordre = { especes: 0, carte: 1, autre: 2 };
  const avecRelie = [...par.values()].some((e) => e.relie);
  const mode = (e) => (e.relie ? 'relie' : (avecRelie && e.moyen === 'carte' ? 'main' : null));
  const suffixe = { relie: ', terminal relié', main: ', saisie à la main' };
  const lignes = [...par.values()]
    .sort((a, b) => (ordre[a.moyen] ?? 9) - (ordre[b.moyen] ?? 9) || a.libelle.localeCompare(b.libelle, 'fr') || Number(b.relie) - Number(a.relie))
    .map((e) => ({
      moyen: e.moyen, libelle: e.libelle, mode: mode(e), nom: libelleMoyen(e) + (suffixe[mode(e)] || ''), nombre: e.nombre,
      ventes: fr(e.ventes), annulations: fr(e.annulations), net: fr(e.ventes - e.annulations), pourboires: fr(e.pourboires),
    }));
  return {
    lignes,
    net: fr(lignes.reduce((s, l) => s + centimes(l.net), 0)),
    pourboires: fr(pourboires),
    arrondis: fr(arrondis),
  };
}

// Écarts de caisse des clôtures de la période (direction). Le comptage qui
// vaut pour un jour est celui de sa dernière clôture : une clôture
// complémentaire recompte les espèces, elle ne refait pas les ventes.
function ecartsCaisse(clotures, periode) {
  const premieres = (clotures || []).filter((c) => !c.complement_de && c.jour >= periode.debut && c.jour <= periode.fin);
  const lignes = premieres.sort((a, b) => a.jour.localeCompare(b.jour)).map((c) => {
    const suites = (clotures || []).filter((x) => x.complement_de === c.id).sort((a, b) => a.numero - b.numero);
    const derniere = suites[suites.length - 1] || c;
    return {
      jour: c.jour, numero: c.numero, numeroRetenu: derniere.numero, complements: suites.length,
      fond: nombre(derniere.fond_caisse), comptees: nombre(derniere.especes_comptees), ecart: nombre(derniere.ecart),
      motif: derniere.motif || '', par: derniere.cloture_par_nom || '',
    };
  });
  return { lignes, total: fr(lignes.reduce((s, l) => s + centimes(l.ecart), 0)) };
}

// 3. Plats vendus : quantité et chiffre par produit, répartis midi et soir,
// par catégorie de caisse, avec les offerts et les remises. La somme des
// lignes fait le chiffre d'affaires net de la période.
function plats(mvts) {
  const par = new Map();
  const vide = () => ({ qte: 0, ttc: 0 });
  mvts.forEach((m) => {
    const service = m.ticket.service === 'midi' ? 'midi' : 'soir';
    m.lignes.forEach((l) => {
      const cle = l.plat_id ? `p:${l.plat_id}` : `l:${String(l.libelle || '').trim().toLocaleLowerCase('fr')}`;
      if (!par.has(cle)) {
        par.set(cle, {
          cle, platId: l.plat_id || null, libelle: l.libelle || '', categorie: l.categorie || (l.plat_id ? 'Plats' : 'Article libre'),
          qte: 0, ttc: 0, midi: vide(), soir: vide(), offertsQte: 0, offertsValeur: 0, remises: 0,
        });
      }
      const e = par.get(cle);
      const q = m.signe * nombre(l.quantite);
      const c = m.signe * totalLigneC(l);
      e.qte += q;
      e.ttc += c;
      e[service].qte += q;
      e[service].ttc += c;
      if (l.offert) {
        e.offertsQte += q;
        e.offertsValeur += m.signe * centimes(nombre(l.quantite) * nombre(l.prix_origine));
      } else if (l.prix_origine != null) {
        e.remises += m.signe * centimes(l.remise_montant);
      }
    });
  });
  const arrondiQte = (q) => +q.toFixed(3);
  const lignes = [...par.values()].map((e) => ({
    cle: e.cle, platId: e.platId, libelle: e.libelle, categorie: e.categorie,
    qte: arrondiQte(e.qte), ttc: fr(e.ttc),
    midi: { qte: arrondiQte(e.midi.qte), ttc: fr(e.midi.ttc) },
    soir: { qte: arrondiQte(e.soir.qte), ttc: fr(e.soir.ttc) },
    offertsQte: arrondiQte(e.offertsQte), offertsValeur: fr(e.offertsValeur), remises: fr(e.remises),
  })).filter((e) => e.qte !== 0 || e.ttc !== 0 || e.offertsQte !== 0)
    .sort((a, b) => b.qte - a.qte || b.ttc - a.ttc || a.libelle.localeCompare(b.libelle, 'fr'));
  const somme = (f) => lignes.reduce((s, l) => s + f(l), 0);
  const vendus = lignes.filter((l) => l.qte > 0);
  const categories = [...grouper(lignes, 'categorie').entries()].map(([nom, ls]) => ({
    nom, qte: arrondiQte(ls.reduce((s, l) => s + l.qte, 0)), ttc: fr(ls.reduce((s, l) => s + centimes(l.ttc), 0)),
  })).sort((a, b) => b.ttc - a.ttc || a.nom.localeCompare(b.nom, 'fr'));
  return {
    lignes,
    categories,
    qte: arrondiQte(somme((l) => l.qte)),
    ttc: fr(somme((l) => centimes(l.ttc))),
    midi: { qte: arrondiQte(somme((l) => l.midi.qte)), ttc: fr(somme((l) => centimes(l.midi.ttc))) },
    soir: { qte: arrondiQte(somme((l) => l.soir.qte)), ttc: fr(somme((l) => centimes(l.soir.ttc))) },
    offertsQte: arrondiQte(somme((l) => l.offertsQte)),
    offertsValeur: fr(somme((l) => centimes(l.offertsValeur))),
    remises: fr(somme((l) => centimes(l.remises))),
    // Les cinq meilleurs et les cinq moins vendus, en quantité, parmi les
    // produits vendus sur la période ; sans recouvrement quand il y en a peu.
    meilleurs: vendus.slice(0, 5),
    moinsVendus: vendus.slice(5).slice(-5).reverse(),
  };
}

// Tri et recherche de la liste des plats, pour l'écran et les fichiers.
export function trierPlats(lignes, tri = 'qte') {
  const copie = [...(lignes || [])];
  if (tri === 'ttc') return copie.sort((a, b) => b.ttc - a.ttc || b.qte - a.qte || a.libelle.localeCompare(b.libelle, 'fr'));
  if (tri === 'nom') return copie.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
  return copie.sort((a, b) => b.qte - a.qte || b.ttc - a.ttc || a.libelle.localeCompare(b.libelle, 'fr'));
}

// 4. Par service : chaque service de la période. La durée moyenne d'une table
// se mesure sur les ventes servies à table (ni vente directe ni à emporter),
// de l'ouverture du ticket à son encaissement.
function services(mvts) {
  const par = new Map();
  mvts.forEach((m) => {
    const service = m.ticket.service === 'midi' ? 'midi' : 'soir';
    const cle = `${m.jour}|${service}`;
    if (!par.has(cle)) par.set(cle, { jour: m.jour, service, mvts: [], durees: [] });
    const e = par.get(cle);
    e.mvts.push(m);
    if (m.signe > 0 && m.ticket.sur_table && !m.ticket.a_emporter) {
      const minutes = (Date.parse(m.ticket.closed_at) - Date.parse(m.ticket.created_at)) / 60000;
      if (Number.isFinite(minutes) && minutes >= 0) e.durees.push(minutes);
    }
  });
  return [...par.values()]
    .sort((a, b) => a.jour.localeCompare(b.jour) || SERVICES_CAISSE.indexOf(a.service) - SERVICES_CAISSE.indexOf(b.service))
    .map((e) => {
      const t = totaux(e.mvts);
      return {
        jour: e.jour, service: e.service, tickets: t.tickets, annulations: t.annulations, couverts: t.couverts,
        ttc: t.ttc, ht: t.ht, tva: t.tva,
        tables: e.durees.length,
        dureeMoyenneMin: e.durees.length ? Math.round(e.durees.reduce((s, d) => s + d, 0) / e.durees.length) : null,
      };
    });
}

// 5. Par heure d'ouverture des tickets (heure de Zurich) : la charge de la
// salle. Les ventes seules : une annulation n'enlève pas la charge passée.
function heures(mvts) {
  const par = new Map();
  mvts.filter((m) => m.signe > 0).forEach((m) => {
    const h = heureZurich(m.ticket.created_at);
    if (h == null) return;
    if (!par.has(h)) par.set(h, { heure: h, tickets: 0, couverts: 0, ttc: 0 });
    const e = par.get(h);
    e.tickets += 1;
    e.couverts += nombre(m.ticket.couverts);
    e.ttc += m.total;
  });
  return [...par.values()].sort((a, b) => a.heure - b.heure).map((e) => ({ ...e, ttc: fr(e.ttc) }));
}

// 6. Par personne (direction) : tickets ouverts et encaissés, chiffre
// encaissé, annulations faites, remises et offerts accordés.
function personnes(mvts, noms) {
  const par = new Map();
  const de = (id) => {
    const cle = id || '';
    if (!par.has(cle)) {
      par.set(cle, {
        id: id || null, nom: id ? (noms?.[id] || 'Compte supprimé') : 'Non renseigné',
        ouverts: 0, encaisses: 0, ttc: 0, annulations: 0, annulationsTtc: 0,
        remisesLignes: 0, remises: 0, offertsLignes: 0, offertsValeur: 0,
      });
    }
    return par.get(cle);
  };
  mvts.forEach((m) => {
    if (m.signe < 0) {
      const e = de(m.ticket.annule_par);
      e.annulations += 1;
      e.annulationsTtc += m.total;
      return;
    }
    de(m.ticket.ouvert_par).ouverts += 1;
    const caissier = de(m.paiements[0]?.encaisse_par || m.ticket.encaisse_par);
    caissier.encaisses += 1;
    caissier.ttc += m.total;
    m.lignes.forEach((l) => {
      if (l.prix_origine == null) return;
      const e = de(l.remise_par);
      if (l.offert) {
        e.offertsLignes += 1;
        e.offertsValeur += centimes(nombre(l.quantite) * nombre(l.prix_origine));
      } else {
        e.remisesLignes += 1;
        e.remises += centimes(l.remise_montant);
      }
    });
  });
  return [...par.values()].sort((a, b) => b.ttc - a.ttc || a.nom.localeCompare(b.nom, 'fr')).map((e) => ({
    ...e, ttc: fr(e.ttc), annulationsTtc: fr(e.annulationsTtc), remises: fr(e.remises), offertsValeur: fr(e.offertsValeur),
  }));
}

// 7. Journal des écarts (direction) : annulations, remises, offerts,
// abandons, corrections de réservation et usage du mode test, avec motif,
// auteur et heure. Les tickets de test n'y figurent que par leur trace
// (entrées, sorties, purges avec nombre et montant), jamais comme des ventes.
function journal(mvts, donnees, periode) {
  const noms = donnees?.personnes || {};
  const nom = (id) => (id ? (noms[id] || 'Compte supprimé') : '');
  const entrees = [];
  mvts.forEach((m) => {
    const piece = numeroDe(m.ticket);
    if (m.signe < 0) {
      entrees.push({
        genre: 'annulation', quand: m.ticket.annule_at || null, jour: m.jour, piece, detail: '',
        auteur: nom(m.ticket.annule_par), motif: m.ticket.annule_motif || '', montant: fr(-m.total),
      });
      return;
    }
    m.lignes.forEach((l) => {
      if (l.prix_origine == null) return;
      entrees.push({
        genre: l.offert ? 'offert' : 'remise', quand: l.remise_at || m.ticket.closed_at || null, jour: m.jour, piece,
        detail: l.libelle || '', auteur: nom(l.remise_par), motif: l.remise_motif || '',
        montant: l.offert ? fr(centimes(nombre(l.quantite) * nombre(l.prix_origine))) : nombre(l.remise_montant),
      });
    });
  });
  const dansJours = (j) => !j || (j >= periode.debut && j <= periode.fin);
  if (periode.type !== 'service') {
    (donnees?.abandons || []).filter((a) => dansJours(a.jour)).forEach((a) => {
      entrees.push({
        genre: 'abandon', quand: a.closed_at || null, jour: a.jour || null, piece: '', detail: 'Ticket abandonné avant encaissement',
        auteur: nom(a.ouvert_par), motif: '', montant: nombre(a.montant),
      });
    });
    (donnees?.corrections || []).filter((c) => dansJours(c.jour)).forEach((c) => {
      entrees.push({
        genre: 'correction', quand: c.created_at || null, jour: c.jour || null, piece: '', detail: c.libelle || '',
        auteur: c.acteur_nom || '', motif: (c.colonnes || []).join(', '), montant: null,
      });
    });
    (donnees?.tests || []).filter((t) => dansJours(t.jour)).forEach((t) => {
      entrees.push({
        genre: `test_${t.action}`, quand: t.created_at || null, jour: t.jour || null, piece: '', detail: t.poste || '',
        auteur: t.auteur_nom || (t.action === 'purge' ? 'Purge automatique' : ''), motif: '',
        montant: t.action === 'purge' ? nombre(t.montant) : null, nombre: nombre(t.nombre),
      });
    });
  }
  entrees.sort((a, b) => String(a.quand || '').localeCompare(String(b.quand || '')));
  const de = (g) => entrees.filter((e) => e.genre === g);
  const somme = (liste) => fr(liste.reduce((s, e) => s + centimes(e.montant), 0));
  return {
    entrees,
    annulations: { nombre: de('annulation').length, montant: somme(de('annulation')) },
    remises: { nombre: de('remise').length, montant: somme(de('remise')) },
    offerts: { nombre: de('offert').length, montant: somme(de('offert')) },
    abandons: { nombre: de('abandon').length, montant: somme(de('abandon')) },
    corrections: { nombre: de('correction').length },
    tests: {
      entrees: de('test_entree').length,
      sorties: de('test_sortie').length,
      purges: de('test_purge').length,
      tickets: de('test_purge').reduce((s, e) => s + (e.nombre || 0), 0),
      montant: somme(de('test_purge')),
    },
  };
}

// 8. Clients et réservations : d'où viennent les tickets. Les no-show viennent
// du rapport des réservations (computeReservationStats), jamais d'ici.
function clients(mvts) {
  const genres = ['reservation', 'passage', 'direct'];
  const par = Object.fromEntries(genres.map((g) => [g, { tickets: 0, couverts: 0, ttc: 0 }]));
  const comptes = { tickets: 0, couverts: 0, ttc: 0 };
  mvts.forEach((m) => {
    const g = genres.includes(m.ticket.origine) ? m.ticket.origine : (m.ticket.sur_table ? 'passage' : 'direct');
    const cible = [par[g], ...(m.ticket.compte_client ? [comptes] : [])];
    cible.forEach((e) => {
      e.tickets += m.signe;
      e.couverts += m.signe * nombre(m.ticket.couverts);
      e.ttc += m.signe * m.total;
    });
  });
  const rendre = (e) => ({ ...e, ttc: fr(e.ttc) });
  return { reservation: rendre(par.reservation), passage: rendre(par.passage), direct: rendre(par.direct), comptes: rendre(comptes) };
}

// Jours de la période : un jour qui porte des ventes ou des annulations sans
// clôture est provisoire ; il est marqué partout et n'entre pas dans la sortie
// comptable. Pour la direction, le net recalculé depuis les tickets est
// comparé au net figé par la clôture : tout écart est rendu.
function jours(donnees, periode) {
  const mvts = mouvements(donnees, { ...periode, type: 'libre' });
  const par = grouper(mvts, 'jour');
  const clotures = (donnees?.clotures || []).filter((c) => !c.complement_de && c.jour >= periode.debut && c.jour <= periode.fin);
  const ventesJour = grouper(donnees?.ventes_jour || [], 'jour');
  const tous = new Set([...par.keys(), ...clotures.map((c) => c.jour)]);
  return [...tous].sort().map((jour) => {
    const t = totaux(par.get(jour) || []);
    const cloture = clotures.find((c) => c.jour === jour) || null;
    const fige = cloture?.totaux?.net?.ttc;
    const vj = ventesJour.get(jour) || [];
    return {
      jour, ...t,
      cloture: cloture ? { id: cloture.id, numero: cloture.numero, clotureAt: cloture.cloture_at || null, par: cloture.cloture_par_nom || '' } : null,
      provisoire: !cloture,
      netFige: fige == null ? null : nombre(fige),
      ecartCloture: fige == null ? null : fr(centimes(t.ttc) - centimes(fige)),
      // Ce que la Comptabilité retient pour ce jour : 'caisse', 'manuel' ou null.
      comptabilite: vj.length ? (vj.every((v) => v.source === 'caisse') ? 'caisse' : 'manuel') : null,
      comptabiliteTtc: vj.length ? fr(vj.reduce((s, v) => s + centimes(v.montant_ttc), 0)) : null,
    };
  });
}

// ── Le rapport d'une période ──
//   donnees : ce que rend caisse_rapport_donnees (tranches fusionnées)
//   periode : { type, debut, fin, service } (periodesCaisse.js)
// Le niveau (donnees.niveau) dit ce que le rôle peut lire : 'direction' tout,
// 'cuisine' les plats vendus et les services. Ce que le niveau ne voit pas
// vaut null ; la base ne l'a de toute façon pas rendu.
export function rapportCaisse(donnees, periode) {
  const direction = donnees?.niveau === 'direction';
  const mvts = mouvements(donnees, periode);
  const parJour = jours(donnees, periode);
  const provisoires = parJour.filter((j) => j.provisoire).map((j) => j.jour);
  return {
    periode,
    niveau: direction ? 'direction' : 'cuisine',
    jourCourant: donnees?.jour_courant || null,
    vide: mvts.length === 0,
    provisoires,
    provisoire: provisoires.length > 0,
    jours: parJour,
    synthese: synthese(mvts),
    plats: plats(mvts),
    services: services(mvts),
    heures: heures(mvts),
    clients: clients(mvts),
    moyens: direction ? moyens(mvts) : null,
    ecartsCaisse: direction && periode.type !== 'service' ? ecartsCaisse(donnees?.clotures, periode) : null,
    personnes: direction ? personnes(mvts, donnees?.personnes) : null,
    journal: direction ? journal(mvts, donnees, periode) : null,
  };
}

// ── La série d'une période (module Statistiques) ──
//   tranches : [{ debut, fin }] en jours d'exploitation, dans l'ordre, sans
//   recouvrement (les jours, les semaines ou les mois de la période).
// Les mouvements sont rangés une fois dans leur tranche, puis passent par les
// fonctions du rapport : la somme des tranches d'un flux est le chiffre de la
// période, et un taux (ticket moyen, durée d'une table) se lit sur sa
// tranche, numérateur et dénominateur sommés, jamais en moyenne de taux.
// Ce que le niveau ne voit pas vaut null, comme dans rapportCaisse.
export function serieRapports(donnees, periode, tranches) {
  const direction = donnees?.niveau === 'direction';
  const liste = tranches || [];
  const rangDe = (jour) => {
    let a = 0;
    let b = liste.length - 1;
    while (a <= b) {
      const m = (a + b) >> 1;
      if (jour < liste[m].debut) b = m - 1;
      else if (jour > liste[m].fin) a = m + 1;
      else return m;
    }
    return -1;
  };
  const parTranche = liste.map(() => []);
  mouvements(donnees, periode).forEach((m) => {
    const i = rangDe(m.jour);
    if (i >= 0) parTranche[i].push(m);
  });
  return liste.map((t, i) => {
    const mvts = parTranche[i];
    const p = plats(mvts);
    // Même règle que services() : ventes servies à table, hors à emporter.
    let tables = 0;
    let minutes = 0;
    mvts.forEach((m) => {
      if (!(m.signe > 0 && m.ticket.sur_table && !m.ticket.a_emporter)) return;
      const d = (Date.parse(m.ticket.closed_at) - Date.parse(m.ticket.created_at)) / 60000;
      if (Number.isFinite(d) && d >= 0) { tables += 1; minutes += d; }
    });
    const ecarts = direction ? journal(mvts, { personnes: donnees?.personnes }, { ...t, type: 'service' }) : null;
    return {
      debut: t.debut,
      fin: t.fin,
      vide: mvts.length === 0,
      synthese: synthese(mvts),
      plats: { qte: p.qte, ttc: p.ttc, categories: p.categories, offertsValeur: p.offertsValeur, remises: p.remises },
      tables,
      dureeMoyenneMin: tables ? Math.round(minutes / tables) : null,
      clients: direction ? clients(mvts) : null,
      moyens: direction ? moyens(mvts) : null,
      ecartsCaisse: direction && periode.type !== 'service' ? ecartsCaisse(donnees?.clotures, t) : null,
      ecarts: ecarts ? { annulations: ecarts.annulations, remises: ecarts.remises, offerts: ecarts.offerts } : null,
    };
  });
}

// Une période est complète quand elle est finie et que tous ses jours de
// vente sont clôturés.
export function periodeComplete(rapport) {
  return !!rapport && !!rapport.jourCourant && rapport.periode.fin < rapport.jourCourant && !rapport.provisoire;
}

// Comparaison avec la période précédente équivalente, seulement quand elle a
// un sens : la période affichée est complète, la précédente n'a aucun jour
// provisoire, et la caisse tournait déjà au premier jour de la précédente
// (premierJour : jour du premier ticket numéroté de la maison).
//   → null, ou { precedente, ttc, tickets, couverts, ticketMoyen } où chaque
//     chiffre vaut { avant, ecart, pct } (pct null si avant vaut 0).
export function comparaison(courant, precedent, premierJour) {
  if (!periodeComplete(courant) || !precedent || precedent.provisoire) return null;
  if (!premierJour || premierJour > precedent.periode.debut) return null;
  const chiffre = (cle) => {
    const maintenant = courant.synthese[cle];
    const avant = precedent.synthese[cle];
    if (maintenant == null || avant == null) return { avant: avant ?? null, ecart: null, pct: null };
    const ecart = Math.round((maintenant - avant) * 100) / 100;
    return { avant, ecart, pct: avant ? ecart / avant : null };
  };
  return {
    precedente: precedent.periode,
    ttc: chiffre('ttc'), tickets: chiffre('tickets'), couverts: chiffre('couverts'), ticketMoyen: chiffre('ticketMoyen'),
  };
}

// Réunit des tranches lues l'une après l'autre (un ticket vendu dans une
// tranche et annulé dans une autre arrive deux fois : une seule est gardée).
export function fusionnerDonnees(morceaux) {
  const liste = (morceaux || []).filter(Boolean);
  if (!liste.length) return null;
  const unique = (cle, id) => {
    const vus = new Map();
    liste.forEach((m) => (m[cle] || []).forEach((x) => { vus.set(id(x), x); }));
    return [...vus.values()];
  };
  const dernier = liste[liste.length - 1];
  return {
    niveau: dernier.niveau,
    jour_courant: dernier.jour_courant,
    premier_jour: dernier.premier_jour || null,
    tickets: unique('tickets', (x) => x.id),
    lignes: unique('lignes', (x) => x.id),
    paiements: unique('paiements', (x) => x.id),
    clotures: unique('clotures', (x) => x.id),
    ventes_jour: unique('ventes_jour', (x) => `${x.jour}|${x.taux}`),
    abandons: unique('abandons', (x) => x.id),
    corrections: unique('corrections', (x) => x.id),
    tests: unique('tests', (x) => x.id),
    personnes: Object.assign({}, ...liste.map((m) => m.personnes || {})),
  };
}
