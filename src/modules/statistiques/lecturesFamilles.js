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

import { isModuleActiveForEtab, isPageActiveForEtab, peutOuvrirPage } from '../moduleConfig.js';
import { dbService } from '../../services/dbService.js';
import * as caisse from '../../services/caisseService.js';
import { lireFenetre } from '../caisse/rapports/lectureRapport.js';
import { peutHabillerCaisse } from '../caisse/gardesCaisse.js';
import { lireModeTest } from '../caisse/modeTest.js';
import { ROLES_RAPPORT } from '../previsions/rapport/gardeRapport.js';
import { lireReferentiel, lireReservations } from '../previsions/rapport/useRapportReservations.js';
import { estDirection, peutReglerFactures } from '../comptabilite/gardesCompta.js';
import { lireContrats, lirePeriode } from '../planning/contratsService.js';
import { userDisplayName } from '../../utils/userDisplay.js';

// Garde d'un écran d'origine, la chaîne même de LegacyModuleHost.jsx : page
// active pour l'établissement, puis droit d'ouvrir la page.
export const ecranOuvert = (page, { role, permissions, etablissement }) => isPageActiveForEtab(etablissement, page)
  && peutOuvrirPage(page, { role }, permissions);

const echec = (e, defaut) => new Error(typeof e === 'string' && e ? e : (e?.message || defaut));

//   contexte : { role, permissions, etablissement }
export const LECTURES = {
  // Rapports de la caisse : tuile « Rapports » (habillage, hors mode test),
  // puis le niveau rendu par la base (direction ou cuisine).
  caisse: {
    visible: ({ role, permissions, etablissement }) => isModuleActiveForEtab(etablissement, 'caisse')
      && permissions.caisse === true && peutHabillerCaisse(role) && !lireModeTest(etablissement?.id),
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
    visible: ({ role, permissions, etablissement }) => isModuleActiveForEtab(etablissement, 'previsions')
      && permissions.previsions === true && ROLES_RAPPORT.includes(role),
    async lire(etabId, debut, fin) {
      const [lignes, referentiel] = await Promise.all([lireReservations(etabId, debut, fin), lireReferentiel(etabId)]);
      return { lignes, ...referentiel };
    },
  },
  // Analyses des dépenses : droits de l'Inventaire, aucune garde propre.
  // Tous les documents de l'établissement en une lecture (pas de fenêtre).
  achats: {
    sansFenetre: true,
    visible: ({ permissions, etablissement }) => isModuleActiveForEtab(etablissement, 'inventaire') && permissions.inventaire !== false,
    async lire(etabId) {
      const db = dbService.getBridge()?.db;
      if (!db) throw echec(null, 'Lecture indisponible.');
      const [docs, catalogue] = await Promise.all([db.listAchatsDocuments(etabId), db.listProduits(etabId, { strict: true })]);
      if (!Array.isArray(docs)) throw echec(null, 'Documents d\'achat illisibles.');
      return { docs, catalogue: catalogue || [] };
    },
  },
  // Comptabilité : la direction ou qui règle les factures. La lecture est le
  // hook useCompta, appelé par l'écran (parHook).
  comptabilite: {
    parHook: true,
    visible: ({ role, permissions, etablissement }) => isModuleActiveForEtab(etablissement, 'comptabilite')
      && permissions.comptabilite === true && (estDirection(role) || peutReglerFactures(role)),
  },
  // Pertes : l'écran Pertes, toutes les pertes de l'établissement (sans
  // fenêtre, comme l'écran qui ne filtre pas par date).
  pertes: {
    sansFenetre: true,
    visible: (ctx) => ecranOuvert('pertes', ctx),
    async lire(etabId) {
      const db = dbService.getBridge()?.db;
      if (!db) throw echec(null, 'Lecture indisponible.');
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
      const db = dbService.getBridge()?.db;
      if (!db) throw echec(null, 'Lecture indisponible.');
      const [releves, zones] = await Promise.all([db.listHaccpReleves(etabId, { strict: true }), db.listHaccpZones(etabId, { strict: true })]);
      return { releves, zones };
    },
  },
};

export const famillesVisibles = (contexte) => Object.keys(LECTURES).filter((id) => LECTURES[id].visible(contexte));
