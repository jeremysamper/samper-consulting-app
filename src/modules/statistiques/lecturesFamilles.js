// ─────────────────────────────────────────────────────────────────────────────
// Gardes et lectures des familles du module Statistiques. Rien n'est écrit
// ici : chaque garde est importée du module d'origine, chaque lecture est
// celle de son écran d'origine (D3, D11).
//
// Garde d'une famille : la personne voit la famille si, et seulement si, elle
// voit aujourd'hui l'écran d'origine, par la même condition : module actif
// pour l'établissement, clé de droit de la page (comme LegacyModuleHost.jsx),
// puis la garde propre à l'écran. Aucune RLS ne change : ce que la base
// refuse reste refusé, et s'affiche « non lu ».
//
// Une lecture en échec lève une erreur (jamais une liste vide) : l'écran
// affiche « non lu » et « Réessayer », pas un zéro (D9).
// ─────────────────────────────────────────────────────────────────────────────

import { dbService } from '../../services/dbService.js';
import * as caisse from '../../services/caisseService.js';
import { lireFenetre } from '../caisse/rapports/lectureRapport.js';
import { lireReferentiel, lireReservations } from '../previsions/rapport/useRapportReservations.js';
import { GARDES_ECRANS, ecranOuvert } from './gardesStatistiques.js';
import { lireContrats, lirePeriode } from '../planning/contratsService.js';
import { userDisplayName } from '../../utils/userDisplay.js';
import { lireGroupes } from '../../hooks/useGroupes.js';
import { supabase } from '../../services/supabase.js';
import { toutesLesPages } from '../../utils/lirePages.js';
import { zurichAjouterJours, zurichMinuitIso, zurichToday } from '../../utils/zurichTime.js';
import { mapReservation as mapRdvSpa } from '../spa/spaData.js';
import {
  mapActivite, mapChambre, mapDemande, mapInscription, mapJournal, mapLigne, mapLinge, mapOccupant, mapOrdre, mapSejour,
} from '../hebergement/hotelData.js';

// Gardes des écrans d'origine : gardesStatistiques.js (léger, lu aussi par
// LegacyModuleHost pour l'accès par raccourci).

// Toutes les pages d'une lecture (utils/lirePages.js) ; ici une erreur
// remonte, pour que la famille s'affiche « non lu ».
async function pages(requete) {
  const { data, error } = await toutesLesPages(requete);
  if (error) throw error;
  return data;
}
// Bornes d'un horodatage pour des jours de Zurich [debut, fin].
const bornesHorodatage = (debut, fin) => [zurichMinuitIso(debut), zurichMinuitIso(zurichAjouterJours(fin, 1))];

const echec = (e, defaut) => new Error(typeof e === 'string' && e ? e : (e?.message || defaut));

// Le pont des lectures historiques (legacySupabase.js), ou une erreur.
const pont = () => {
  const db = dbService.getBridge()?.db;
  if (!db) throw echec(null, 'Lecture indisponible.');
  return db;
};

//   contexte : { role, permissions, etablissement }
export const LECTURES = {
  // Rapports de la caisse : tuile « Rapports » (habillage, hors mode test),
  // puis le niveau rendu par la base (direction ou cuisine).
  caisse: {
    visible: GARDES_ECRANS.caisse,
    // Le niveau se demande à la base, comme le font les onglets des Rapports :
    // une journée suffit, la réponse porte `niveau`.
    async sonder(etabId, aujourdhui) {
      const { data, error } = await caisse.rapportDonnees(etabId, aujourdhui, aujourdhui);
      if (error) throw echec(error, 'Rapport illisible.');
      return { niveau: data?.niveau === 'direction' ? 'direction' : 'cuisine' };
    },
    async lire(etabId, debut, fin) {
      const { data, error } = await lireFenetre(etabId, debut, fin);
      if (error || !data) throw echec(error, 'Rapport illisible.');
      return data;
    },
  },
  // Rapport des réservations : ROLES_RAPPORT.
  reservations: {
    visible: GARDES_ECRANS.reservations,
    async lire(etabId, debut, fin) {
      const [lignes, referentiel] = await Promise.all([lireReservations(etabId, debut, fin), lireReferentiel(etabId)]);
      return { lignes, ...referentiel };
    },
  },
  // Carnet à venir du rapport (S3) : les réservations d'un an en arrière à
  // trente jours devant, pour le carnet d'aujourd'hui et celui de la date
  // comparable. Même garde que le rapport.
  carnet: {
    sansFenetre: true,
    visible: GARDES_ECRANS.reservations,
    async lire(etabId) {
      const auj = zurichToday();
      const [lignes, referentiel] = await Promise.all([lireReservations(etabId, zurichAjouterJours(auj, -400), zurichAjouterJours(auj, 30)), lireReferentiel(etabId)]);
      return { lignes, ...referentiel };
    },
  },
  // Analyses des dépenses : droits de l'Inventaire, aucune garde propre.
  // Tous les documents de l'établissement en une lecture (pas de fenêtre).
  achats: {
    sansFenetre: true,
    visible: GARDES_ECRANS.achats,
    async lire(etabId) {
      const db = pont();
      const [docs, catalogue] = await Promise.all([db.listAchatsDocuments(etabId), db.listProduits(etabId, { strict: true })]);
      if (!Array.isArray(docs)) throw echec(null, 'Documents d\'achat illisibles.');
      return { docs, catalogue: catalogue || [] };
    },
  },
  // Comptabilité : la direction ou qui règle les factures. La lecture est le
  // hook useCompta, appelé par l'écran (parHook).
  comptabilite: {
    parHook: true,
    visible: GARDES_ECRANS.comptabilite,
  },
  // Pertes : l'écran Pertes, toutes les pertes de l'établissement (sans
  // fenêtre, comme l'écran qui ne filtre pas par date).
  pertes: {
    sansFenetre: true,
    visible: (ctx) => ecranOuvert('pertes', ctx),
    async lire(etabId) {
      const db = pont();
      return { pertes: await db.listPertes(etabId, { strict: true }) };
    },
  },
  // Planning : la grille et les pointages du jour, à qui ouvre le Planning.
  // Horaires et absences de la fenêtre (lirePeriode, par pages), contrats de
  // l'établissement, noms comme la grille (userDisplayName).
  planning: {
    visible: (ctx) => ecranOuvert('planning', ctx),
    async lire(etabId, debut, fin) {
      const [{ shifts, absences }, contrats] = await Promise.all([lirePeriode(etabId, debut, fin), lireContrats(etabId)]);
      const noms = {};
      [...shifts.map((x) => x.userId), ...contrats.map((c) => c.profileId), ...absences.map((a) => a.userId)]
        .filter(Boolean).forEach((id) => { if (!noms[id]) noms[id] = userDisplayName(id); });
      return { shifts, absences, contrats, noms };
    },
  },
  // HACCP : l'écran HACCP, tous les relevés de l'établissement (sans fenêtre,
  // comme l'écran) et ses zones (nom de la zone choisie).
  haccp: {
    sansFenetre: true,
    visible: (ctx) => ecranOuvert('haccp', ctx),
    async lire(etabId) {
      const db = pont();
      const [releves, zones] = await Promise.all([db.listHaccpReleves(etabId, { strict: true }), db.listHaccpZones(etabId, { strict: true })]);
      return { releves, zones };
    },
  },
  // Inventaire : l'écran Inventaire, tous les inventaires de l'établissement
  // (sans fenêtre : le stock d'un pas dépend des inventaires d'avant).
  inventaire: {
    sansFenetre: true,
    visible: (ctx) => ecranOuvert('inventaire', ctx),
    async lire(etabId) {
      const db = pont();
      return { inventaires: await db.listInventaires(etabId, { strict: true }) };
    },
  },
  // Groupes : le calendrier des groupes, les groupes de la fenêtre.
  groupes: {
    visible: (ctx) => ecranOuvert('groupes', ctx),
    async lire(etabId, debut, fin) {
      return { groupes: await lireGroupes(etabId, debut, fin) };
    },
  },
  // Journal d'activité : consultant et patron (peutOuvrirPage). Les entrées de
  // la fenêtre, jours de Zurich, comme Journal.jsx.
  journal: {
    visible: (ctx) => ecranOuvert('journal', ctx),
    async lire(etabId, debut, fin) {
      const [de, a] = bornesHorodatage(debut, fin);
      const lignes = await pages((x, y) => supabase.from('journal_activite').select('id, created_at, module, operation')
        .eq('etablissement_id', etabId).gte('created_at', de).lt('created_at', a).order('created_at').order('id').range(x, y));
      return { lignes };
    },
  },
  // SOP : l'écran des procédures, les exécutions de la fenêtre.
  sop: {
    visible: (ctx) => ecranOuvert('sop', ctx),
    async lire(etabId, debut, fin) {
      const db = pont();
      return { executions: await db.listSopExecutions(etabId, { dateFrom: debut, dateTo: fin, strict: true }) };
    },
  },
  // Écran de cuisine : consultant, responsable de cuisine et cuisinier
  // (peutOuvrirPage, et la RLS des commandes). Les commandes finies dans la fenêtre.
  kds: {
    visible: (ctx) => ecranOuvert('kds', ctx),
    async lire(etabId, debut, fin) {
      const [de, a] = bornesHorodatage(debut, fin);
      const lignes = await pages((x, y) => supabase.from('kds_orders').select('id, opened_at, completed_at, status')
        .eq('etablissement_id', etabId).gte('completed_at', de).lt('completed_at', a).order('completed_at').order('id').range(x, y));
      return { orders: lignes.map((r) => ({ id: r.id, openedAt: r.opened_at, completedAt: r.completed_at, status: r.status })) };
    },
  },
  // Mise en place : les listes de la fenêtre et l'état de leurs préparations.
  mep: {
    visible: (ctx) => ecranOuvert('mep', ctx),
    async lire(etabId, debut, fin) {
      const lignes = await pages((x, y) => supabase.from('mep_listes').select('id, date_service, mep_items(fait)')
        .eq('etablissement_id', etabId).gte('date_service', debut).lte('date_service', fin).order('date_service').order('id').range(x, y));
      return { listes: lignes.map((l) => ({ id: l.id, dateService: l.date_service, items: l.mep_items || [] })) };
    },
  },
  // Spa : l'agenda et les bons cadeaux, à qui ouvre le Spa.
  spa: {
    visible: (ctx) => ecranOuvert('spa', ctx),
    async lire(etabId, debut, fin) {
      const [de, a] = bornesHorodatage(debut, fin);
      const [rdv, bons] = await Promise.all([
        pages((x, y) => supabase.from('spa_reservations').select('*').eq('etablissement_id', etabId)
          .gte('date_rdv', debut).lte('date_rdv', fin).order('date_rdv').order('id').range(x, y)),
        pages((x, y) => supabase.from('spa_bons').select('id, created_at').eq('etablissement_id', etabId)
          .gte('created_at', de).lt('created_at', a).order('created_at').order('id').range(x, y)),
      ]);
      return { reservations: rdv.map(mapRdvSpa), bons: bons.map((b) => ({ id: b.id, createdAt: b.created_at })) };
    },
  },
  // Ventes POS : comme le top et flop, les articles des connexions actives de
  // la caisse reliée et leurs ventes de la fenêtre.
  pos: {
    visible: (ctx) => ecranOuvert('pos', ctx),
    async lire(etabId, debut, fin) {
      const AUCUNE = { ventes: [], noms: {} };
      const conns = await pages((x, y) => supabase.from('pos_connections').select('id').eq('etablissement_id', etabId).eq('status', 'connected').order('id').range(x, y));
      if (!conns.length) return AUCUNE;
      const items = await pages((x, y) => supabase.from('pos_items').select('id, name').in('pos_connection_id', conns.map((c) => c.id)).order('id').range(x, y));
      if (!items.length) return AUCUNE;
      const ventes = await pages((x, y) => supabase.from('pos_sales').select('id, pos_item_id, date, qty, revenue_cts')
        .in('pos_item_id', items.map((i) => i.id)).gte('date', debut).lte('date', fin).order('date').order('id').range(x, y));
      return { ventes, noms: Object.fromEntries(items.map((i) => [i.id, i.name || i.id])) };
    },
  },
  // Branche Hôtel : une famille par écran, chacune sa garde et ses tables.
  hebergement: {
    visible: (ctx) => ecranOuvert('hebergement', ctx),
    async lire(etabId, debut, fin) {
      const [sejours, chambres, occupants, lignes] = await Promise.all([
        pages((x, y) => supabase.from('sejours').select('*').eq('etablissement_id', etabId).lte('arrivee', fin).gt('depart', debut).order('arrivee').order('id').range(x, y)),
        pages((x, y) => supabase.from('chambres').select('*').eq('etablissement_id', etabId).order('id').range(x, y)),
        pages((x, y) => supabase.from('sejour_occupants').select('*').eq('etablissement_id', etabId).order('id').range(x, y)),
        pages((x, y) => supabase.from('sejour_lignes').select('*').eq('etablissement_id', etabId).gte('jour', debut).lte('jour', fin).order('jour').order('id').range(x, y)),
      ]);
      return { sejours: sejours.map(mapSejour), chambres: chambres.map(mapChambre), occupants: occupants.map(mapOccupant), lignes: lignes.map(mapLigne) };
    },
  },
  demandes: {
    sansFenetre: true,
    visible: (ctx) => ecranOuvert('demandes', ctx),
    async lire(etabId) {
      const demandes = await pages((x, y) => supabase.from('demandes').select('*').eq('etablissement_id', etabId).order('created_at').order('id').range(x, y));
      return { demandes: demandes.map(mapDemande) };
    },
  },
  technique: {
    visible: (ctx) => ecranOuvert('technique', ctx),
    async lire(etabId, debut, fin) {
      const [de, a] = bornesHorodatage(debut, fin);
      const ordres = await pages((x, y) => supabase.from('ordres_travail').select('*').eq('etablissement_id', etabId).gte('termine_at', de).lt('termine_at', a).order('termine_at').order('id').range(x, y));
      return { ordres: ordres.map(mapOrdre) };
    },
  },
  activites: {
    visible: (ctx) => ecranOuvert('activites', ctx),
    async lire(etabId, debut, fin) {
      const [de, a] = bornesHorodatage(debut, fin);
      const [activites, inscriptions] = await Promise.all([
        pages((x, y) => supabase.from('activites').select('*').eq('etablissement_id', etabId).gte('debut', de).lt('debut', a).order('debut').order('id').range(x, y)),
        pages((x, y) => supabase.from('activite_inscriptions').select('*').eq('etablissement_id', etabId).order('id').range(x, y)),
      ]);
      return { activites: activites.map(mapActivite), inscriptions: inscriptions.map(mapInscription) };
    },
  },
  etages: {
    visible: (ctx) => ecranOuvert('etages', ctx),
    async lire(etabId, debut, fin) {
      const [de, a] = bornesHorodatage(debut, fin);
      const [journal, linge] = await Promise.all([
        pages((x, y) => supabase.from('chambres_statut_journal').select('*').eq('etablissement_id', etabId).gte('at', de).lt('at', a).order('at').order('id').range(x, y)),
        pages((x, y) => supabase.from('linge_mouvements').select('*').eq('etablissement_id', etabId).gte('jour', debut).lte('jour', fin).order('jour').order('id').range(x, y)),
      ]);
      return { journalChambres: journal.map(mapJournal), linge: linge.map(mapLinge) };
    },
  },
  // Catalogue : les produits de l'établissement et l'historique de leurs prix
  // (toute la période connue : le choix du produit porte sur la période).
  catalogue: {
    sansFenetre: true,
    visible: (ctx) => ecranOuvert('catalogue', ctx),
    async lire(etabId) {
      const db = pont();
      const produits = await db.listProduits(etabId, { strict: true });
      const ids = (produits || []).map((x) => x.id);
      const releves = [];
      // Par lots de 100 identifiants : un filtre .in() plus long dépasserait la
      // longueur d'URL que le serveur accepte.
      const LOT = 100;
      for (let i = 0; i < ids.length; i += LOT) {
        const lot = ids.slice(i, i + LOT);
        releves.push(...await pages((x, y) => supabase.from('produit_prix_historique').select('id, produit_id, releve_le, prix_unitaire')
          .in('produit_id', lot).order('releve_le').order('id').range(x, y)));
      }
      const avecHistorique = new Set(releves.map((r) => r.produit_id));
      return {
        produits: (produits || []).map((x) => ({ id: x.id, nom: x.nom, avecHistorique: avecHistorique.has(x.id) })),
        releves: releves.map((r) => ({ produitId: r.produit_id, releveLe: r.releve_le, prixUnitaire: r.prix_unitaire })),
      };
    },
  },
  // Marges : l'écran Marges de la Comptabilité, sous la garde de la famille
  // Comptabilité ; ses fiches, plats, cartes et catalogue, comme l'écran.
  marges: {
    sansFenetre: true,
    visible: (ctx) => LECTURES.comptabilite.visible(ctx),
    async lire(etabId) {
      const db = pont();
      const [recettes, plats, cartes, produits] = await Promise.all([
        db.listRecettes(etabId, { strict: true }), db.listPlats(etabId, { strict: true }),
        db.listCartes(etabId, { strict: true }), db.listProduits(etabId, { strict: true }),
      ]);
      return { recettes: recettes || [], plats: plats || [], cartes: cartes || [], produits: produits || [] };
    },
  },
  // Chiffrage : les Outils consultant (peutOuvrirPage : consultant seul) ; ses
  // fiches et le catalogue, comme l'écran.
  chiffrage: {
    sansFenetre: true,
    visible: (ctx) => ecranOuvert('consultant_tools', ctx),
    async lire(etabId) {
      const db = pont();
      const [recettes, produits] = await Promise.all([db.listRecettes(etabId, { strict: true }), db.listProduits(etabId, { strict: true })]);
      return { recettes: recettes || [], produits: produits || [] };
    },
  },
};

export const famillesVisibles = (contexte) => Object.keys(LECTURES).filter((id) => LECTURES[id].visible(contexte));
