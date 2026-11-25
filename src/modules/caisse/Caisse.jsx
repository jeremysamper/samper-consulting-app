import React from 'react';
import { ChevronsRight, ConciergeBell } from 'lucide-react';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { useEcranModule, ECRAN_ACCUEIL } from '../../components/parcours/useEcranModule.js';
import { Btn } from '../../components/ui/index.jsx';
import { BoutonActions } from '../../components/ui/Fenetres.jsx';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { notify } from '../../components/toast/index.js';
import { dbService } from '../../services/dbService.js';
import { useReglageModifie } from '../../services/reglagesSignal.js';
import { usePlanSalle } from '../../hooks/usePlanSalle.js';
import { zurichAjouterJours, zurichDateHeure, zurichNowMinutes, zurichToday } from '../../utils/zurichTime.js';
import * as caisse from '../../services/caisseService.js';
import * as tpe from '../../services/caisseTpeService.js';
import PlanTables, { etatTicket } from './PlanTables.jsx';
import TicketEcran from './TicketEcran.jsx';
import QuiEstLa from './QuiEstLa.jsx';
import QuiRetire, { ReperesRetrait } from './QuiRetire.jsx';
import { reperesRetrait } from './retrait.js';
import BandeauTest from './BandeauTest.jsx';
import InvitationAvisPret from './InvitationAvisPret.jsx';
import Historique from './Historique.jsx';
import Cloture from './Cloture.jsx';
import BonsCadeaux from './bonsCadeaux/BonsCadeaux.jsx';
import { bonEnAttente, oublierBonEnAttente } from './bonsCadeaux/bonEnAttente.js';
import { ROLES_MODE_TEST, idPoste, lireModeTest, oublierModeTest, retenirModeTest } from './modeTest.js';
import { peutHabillerCaisse } from './gardesCaisse.js';
import { heureCourte, minutesDe, nomsParTable, reservationsAttachables, reservationsSansTicket } from './clients.js';
import { articlesDeCaisse, cartesEtArticlesEnVente, fusionnerReglages, manquesLegaux } from './reglages.js';
import ListeManques from './ListeManques.jsx';
import { isModuleActiveForEtab } from '../moduleConfig.js';
import { listFormats } from '../../services/formatsService.js';
import { formatsParPlat } from '../../utils/formatsBoisson.js';
import { useMaintenant } from './mesures.js';
import { useCommandesQr } from './commandeQr/useCommandesQr.js';
import BandeauCommandesQr from './commandeQr/BandeauCommandesQr.jsx';
import { peutGererReservations } from '../previsions/gardeEnLigne.js';
import {
  ajustementsDuService, lignesDeplacement, lignesReunion, lignesSeparation, reservationDirecte,
  reservationsPosees, serviceDuMoment, tablesDuService, tableesDe, ticketsSurPlan,
} from './planService.js';
import './caisse.css';


// ─────────────────────────────────────────────────────────────────────────────
// Caisse v1 : prise de commande par table depuis le plan de salle, ventes
// directes au comptoir, bons envoyés au KDS (RPC caisse_envoyer_bon),
// encaissement simple. Depuis le 17.11.2026 le module s'ouvre sur le plan de
// salle, qui prend la hauteur de l'écran, avec toutes les actions en barre au
// dessus (décision de Jérémy) : plus d'accueil à tuiles ni de repères.
//
// Les articles vendables sont les plats actifs portés par au moins une carte
// active (ni archivée ni masquée) de l'établissement ; sans aucune liaison de
// carte, repli sur tous les plats actifs, pour qu'une maison sans cartes
// reliées puisse quand même vendre. Prix copié sur la ligne au moment du tap.
//
// Realtime : caisse_tickets et caisse_lignes, via subscribeReload (rechargement
// coalescé, rejoué au réveil de l'appareil), cleanup au démontage.
//
// v4 : catégories de caisse (caisse_categories), rangement des produits
// (caisse_boutons.categorie_id et ordre) et réglages de la maison
// (caisse_reglages), rechargés par realtime sur tous les postes. Une lecture
// en échec garde les dernières valeurs connues ; sans aucun réglage en base,
// les défauts du code donnent une caisse complète.
//
// v5 : la caisse sait qui est à la table. Un tap sur une table libre ouvre la
// feuille « Qui est à cette table ? » (réservation du jour, client de passage,
// compte client) ; le ticket est créé par la RPC caisse_ouvrir_ticket, qui
// passe la réservation à « arrivé » ou crée celle du passage. La vente directe
// reste anonyme et garde son chemin d'avant. L'accueil propose les
// réservations confirmées dont l'heure est passée et qu'aucun ticket ne
// porte : un tap par ligne pose no-show ou arrivé, jamais la caisse seule.
// Les cartes en vente se règlent par maison (caisse_reglages.config.cartes_ids).
//
// v6 : mode test, propre au poste (modeTest.js). Un responsable l'active
// depuis l'accueil ; tant qu'il dure, un bandeau le dit sur tous les écrans,
// le poste ne lit et n'ouvre que des tickets de test (caisse_tickets.test),
// rien n'est écrit dans les réservations ni dans le fichier clients, et la
// tuile « Réservations sans ticket » disparaît (elle poserait de vrais
// statuts). Un poste normal ne lit jamais un ticket de test. La base tient
// les mêmes règles : l'écran ne fait que les refléter.
// Le plan et la liste des tickets disent aussi combien de plats la cuisine a
// marqués prêts (caisse_lignes.pret_at, posé par le KDS).
//
// v7 : encaissement conforme. L'encaissement passe par la RPC
// caisse_encaisser (numéro continu, TVA figée par ligne, empreinte) ; deux
// tuiles de plus, « Historique et quittances » (tout rôle qui a la caisse ;
// l'annulation tracée d'un ticket encaissé reste à consultant et patron) et
// « Clôture de caisse » (consultant, patron, resp_cuisine). Un bandeau dit
// aux responsables qu'un jour passé n'est pas clôturé. La quittance et la
// clôture sont des PDF construits depuis les données (documentsCaisse.js).
// Ni l'historique ni la clôture ne s'ouvrent en mode test : ils ne montrent
// que de vraies ventes.
//
// v8 : rapports. Depuis le 14.11.2026 ils s'ouvrent dans Statistiques
// (analyse « Caisse », statistiques/RapportCaisse.jsx), pour les mêmes rôles
// et hors mode test : la tuile « Rapports » a quitté cet accueil.
// ─────────────────────────────────────────────────────────────────────────────

const dateCH = (jour) => { const [a, m, j] = String(jour || '').split('-'); return j ? `${j}.${m}.${a}` : ''; };

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const totalTicket = (t) => (t.lignes || []).reduce((s, l) => s + Number(l.quantite) * Number(l.prix_unitaire), 0);

export default function Caisse({ user, etablissement, legacyVersion }) {
  const etabId = etablissement?.id;
  const plan = usePlanSalle(etabId);
  const { ecran, setEcran, retourAccueil } = useEcranModule('caisse', {
    repris: ['tickets', 'sans_ticket'],
  });

  const [tickets, setTickets] = React.useState([]);
  const [erreurTickets, setErreurTickets] = React.useState(null);
  const [tables, setTables] = React.useState([]);
  const [salles, setSalles] = React.useState([]);
  // Plan du service (organisé dans Réservations) : écarts du jour au plan de
  // base, décor de la salle, et vrai quand la base sait les écrire.
  const [ajustements, setAjustements] = React.useState([]);
  const [ajustDispo, setAjustDispo] = React.useState(false);
  const [elements, setElements] = React.useState([]);
  // Plats et cartes tels que lus ; les articles en vente en sont déduits avec
  // le réglage « Cartes en vente » (voir plus bas).
  const [plats, setPlats] = React.useState([]);
  const [cartesLues, setCartesLues] = React.useState([]);
  // Formats de vente des boissons (plat_id -> formats), en temps réel : un prix
  // de format changé dans la Carte des boissons arrive sur tous les postes.
  const [formats, setFormats] = React.useState(() => new Map());
  const rechargerFormats = React.useCallback(async () => {
    if (!etabId) return;
    const { data, error } = await listFormats(etabId);
    // Lecture en échec : les formats connus restent.
    if (!error) setFormats(formatsParPlat(data));
  }, [etabId]);
  // Allergènes des fiches (recette_id -> ids), pour l'alerte à la commande.
  const [allergenesFiches, setAllergenesFiches] = React.useState(() => new Map());
  // Réservations d'aujourd'hui et de la veille (v5), et la table dont la
  // feuille « Qui est à cette table ? » est ouverte.
  const [reservations, setReservations] = React.useState([]);
  const [quiTable, setQuiTable] = React.useState(null);
  // Feuille « Qui retire la commande ? » d'une vente directe (lot 01).
  const [quiRetire, setQuiRetire] = React.useState(false);
  const [ouverture, setOuverture] = React.useState(false);
  const verrouOuverture = React.useRef(false);
  const [statutEnCours, setStatutEnCours] = React.useState(null);
  // Habillage des boutons produits (v3) : plat_id -> { nom_court, couleur, picto }.
  const [boutons, setBoutons] = React.useState({});
  const peutHabiller = peutHabillerCaisse(user?.role);
  const rechargerBoutons = React.useCallback(async () => {
    if (!etabId) return;
    const { data } = await caisse.listBoutons(etabId);
    setBoutons(data || {});
  }, [etabId]);
  // Catégories et réglages de la maison (v4). L'établissement change : on
  // repart des défauts, jamais des réglages de la maison d'avant.
  const [categories, setCategories] = React.useState([]);
  const [config, setConfig] = React.useState({});
  // Réglages lus en base : tant qu'ils ne le sont pas, les coordonnées
  // légales sont inconnues, ni le bandeau ni l'encaissement ne les réclament.
  const [configLue, setConfigLue] = React.useState(false);
  const reglages = React.useMemo(() => ({ ...fusionnerReglages(config), reglagesLus: configLue }), [config, configLue]);
  const manquesLegal = React.useMemo(() => (configLue ? manquesLegaux(reglages.legal) : []), [configLue, reglages.legal]);
  // Mode test (v6) : la clé du poste gardée sur l'appareil, ou null. Un
  // responsable seul l'active ; la proposition de vider suit la sortie.
  const poste = React.useMemo(() => idPoste(), []);
  const [cleTest, setCleTest] = React.useState(() => lireModeTest(etabId));
  const modeTest = Boolean(cleTest);
  const peutActiverTest = ROLES_MODE_TEST.includes(user?.role);
  // L3 : commandes de boissons par QR en attente (temps réel). Un poste en
  // mode test ne les lit pas : elles deviendraient de vrais tickets.
  const commandesQr = useCommandesQr(etabId, { actif: !modeTest });
  // Bon cadeau ouvert depuis son QR (bonEnAttente, App.jsx) : l'écran des bons
  // s'ouvre sur sa fiche. Jamais en mode test, qui ne montre aucun vrai bon.
  const [bonAOuvrir, setBonAOuvrir] = React.useState(null);
  React.useEffect(() => {
    const code = bonEnAttente();
    if (!code || !etabId) return;
    oublierBonEnAttente();
    if (modeTest) { notify('Quittez le mode test pour ouvrir ce bon cadeau.', 'info'); return; }
    setBonAOuvrir(code);
    setEcran('bons_cadeaux');
  }, [etabId, modeTest, setEcran]);
  const [testEnCours, setTestEnCours] = React.useState(false);
  const [proposerVider, setProposerVider] = React.useState(false);
  // Terminaux de paiement de la maison (v9), reliés et retirés. Une maison
  // qui n'en a jamais relié garde une liste vide : l'encaissement ne lit et
  // n'affiche alors rien de plus que la v7.
  const [terminaux, setTerminaux] = React.useState([]);
  const rechargerTerminaux = React.useCallback(async () => {
    if (!etabId) return;
    const { data, error } = await tpe.listTerminaux(etabId);
    // Lecture en échec : la liste connue reste (la section des réglages a sa
    // propre lecture et dit l'échec).
    if (error) return;
    setTerminaux(data);
  }, [etabId]);
  React.useEffect(() => { rechargerTerminaux(); }, [rechargerTerminaux, legacyVersion]);
  React.useEffect(() => {
    setCategories([]); setConfig({}); setConfigLue(false);
    setReservations([]); setQuiTable(null); setPlats([]); setCartesLues([]); setFormats(new Map());
    setTickets([]); setCleTest(lireModeTest(etabId)); setProposerVider(false);
    setTerminaux([]);
  }, [etabId]);
  // Cartes en vente et articles vendables : fermé par défaut (une carte
  // archivée ou cachée ne vend jamais), sans réglage tout vend comme avant.
  // Chaque article porte ses formats et dit s'il vient d'une carte de boissons.
  const { cartesEnVente, articles } = React.useMemo(
    () => cartesEtArticlesEnVente({
      plats: articlesDeCaisse({ plats, cartes: cartesLues, formats }), cartes: cartesLues, cartesIds: reglages.cartes_ids,
    }),
    [plats, cartesLues, formats, reglages.cartes_ids],
  );
  // Formules à prix fixe (lot 09) : lues avec les réglages. Une lecture en
  // échec n'empêche pas la caisse de s'ouvrir : les formules ne s'affichent
  // pas et un message le dit une fois.
  const [formules, setFormules] = React.useState([]);
  const formulesEchecDit = React.useRef(false);
  const rechargerReglages = React.useCallback(async () => {
    if (!etabId) return;
    const [c, r, f] = await Promise.all([caisse.listCategories(etabId), caisse.getReglages(etabId), caisse.listFormules(etabId)]);
    if (!c.error) setCategories(c.data);
    if (!r.error) { setConfig(r.data); setConfigLue(true); }
    if (f.error) {
      setFormules([]);
      if (!formulesEchecDit.current) {
        formulesEchecDit.current = true;
        notify("Les formules n'ont pas pu être lues. Les produits restent en vente un par un.", 'warning');
      }
    } else {
      setFormules(f.data);
    }
  }, [etabId]);
  const maintenant = useMaintenant();
  const telephone = useIsMobile();
  // v7 : où en est la caisse (jours passés sans clôture). Lu pour les rôles
  // qui clôturent ; la base refuse les autres.
  const peutAnnuler = ['consultant', 'patron'].includes(user?.role);
  const [etatJour, setEtatJour] = React.useState(null);
  const rechargerJournee = React.useCallback(async () => {
    if (!etabId || !peutHabiller) { setEtatJour(null); return; }
    const { data, error } = await caisse.journee(etabId);
    if (!error) setEtatJour(data);
  }, [etabId, peutHabiller]);
  React.useEffect(() => { rechargerJournee(); }, [rechargerJournee, legacyVersion]);

  // Quittance et clôture : PDF construits depuis les données, ouverts dans un
  // onglet. L'onglet s'ouvre dans le geste, avant les lectures : sans cela le
  // navigateur le bloque (repli : téléchargement).
  const ouvrirPdf = React.useCallback(async (construire, nom) => {
    let fenetre = null;
    try { fenetre = window.open('', '_blank'); } catch { fenetre = null; }
    try {
      const doc = await construire();
      if (!doc) { fenetre?.close(); return; }
      if (fenetre) fenetre.location.href = doc.output('bloburl');
      else doc.save(nom);
    } catch (e) {
      console.error('[caisse] document', e);
      fenetre?.close();
      notify("Le document n'a pas pu être produit. Réessayez.", 'error');
    }
  }, []);
  const quittance = React.useCallback((id, client) => ouvrirPdf(async () => {
    const { data, error } = await caisse.getTicketComplet(id);
    if (error) { notify(error, 'error'); return null; }
    const { construireQuittance } = await import('./documentsCaisse.js');
    return construireQuittance({ ticket: data, etablissement, reglages, client });
  }, `quittance-${id}.pdf`), [ouvrirPdf, etablissement, reglages]);
  const pdfCloture = React.useCallback((cloture) => ouvrirPdf(async () => {
    const { construireCloture } = await import('./documentsCaisse.js');
    // v9 : les bouclements saisis pour ce jour (aucune lecture si la maison
    // n'a pas de terminal ; une lecture en échec n'empêche pas le PDF).
    let bouclements = [];
    if (terminaux.length) bouclements = (await tpe.listBouclements(etabId, cloture.jour_exploitation)).data || [];
    return construireCloture({ cloture, etablissement, reglages, bouclements });
  }, `cloture-Z${cloture.numero}.pdf`), [ouvrirPdf, etablissement, reglages, terminaux, etabId]);

  const [ticketId, setTicketId] = React.useState(null);
  // 'ouvrir' : un tap sur une table ouvre ou crée son ticket.
  // 'deplacer' : un tap sur une table y déplace le ticket courant.
  const [modeTables, setModeTables] = React.useState('ouvrir');

  // Un poste normal lit les vrais tickets, un poste en mode test les tickets
  // de test : jamais les deux. Une réponse arrivée après un changement de mode
  // est ignorée (elle porterait les tickets de l'autre monde).
  const lectureTickets = React.useRef(0);
  const rechargerTickets = React.useCallback(async () => {
    if (!etabId) return;
    const tour = ++lectureTickets.current;
    const { data, error } = await caisse.listTicketsOuverts(etabId, { test: modeTest });
    if (tour !== lectureTickets.current) return;
    if (error) { setErreurTickets(error); return; }
    setErreurTickets(null);
    setTickets(data);
  }, [etabId, modeTest]);

  // Plan de salle : tables, salles, décor et écarts du service du jour, tels
  // que Réservations les a posés. Une lecture en échec garde le plan connu.
  const rechargerPlan = React.useCallback(async () => {
    if (!etabId) return;
    const [t, s, el, aj] = await Promise.all([
      plan.listTables(), plan.listSalles(), plan.listElements(), plan.listAjustements(zurichToday()),
    ]);
    if (t.data) setTables(t.data);
    if (s.data) setSalles(s.data);
    if (el.data) setElements(el.data);
    if (aj.data) { setAjustements(aj.data); setAjustDispo(!aj.indispo); }
  }, [etabId, plan]);

  // Articles : relus au changement d'établissement et après l'hydratation
  // post-login (legacyVersion). Le plan a sa propre lecture, plus bas.
  React.useEffect(() => {
    let vivant = true;
    (async () => {
      if (!etabId) return;
      const db = dbService.getDb();
      if (!db) return;
      const [platsLus, cartes, fiches] = await Promise.all([
        db.listPlats(etabId),
        db.listCartes(etabId),
        caisse.listAllergenesFiches(etabId),
      ]);
      if (!vivant) return;
      setPlats(platsLus || []);
      setCartesLues(cartes || []);
      // Lecture en échec : pas d'alerte allergène plutôt qu'une fausse.
      setAllergenesFiches(fiches.data || new Map());
    })();
    return () => { vivant = false; };
  }, [etabId, legacyVersion]);

  // Réservations du jour et de la veille. Une lecture en échec garde les
  // dernières connues : la caisse reste utilisable (passage, vente directe).
  const rechargerReservations = React.useCallback(async () => {
    if (!etabId) return;
    const jour = zurichToday();
    const { data, error } = await caisse.listReservations(etabId, [zurichAjouterJours(jour, -1), jour]);
    if (!error) setReservations(data);
  }, [etabId]);

  React.useEffect(() => { rechargerTickets(); }, [rechargerTickets]);
  React.useEffect(() => { rechargerReservations(); }, [rechargerReservations, legacyVersion]);
  React.useEffect(() => { rechargerBoutons(); }, [rechargerBoutons, legacyVersion]);
  React.useEffect(() => { rechargerReglages(); }, [rechargerReglages, legacyVersion]);
  React.useEffect(() => { rechargerFormats(); }, [rechargerFormats, legacyVersion]);
  React.useEffect(() => {
    const rt = dbService.getRealtime();
    if (!rt?.subscribeReload || !etabId) return undefined;
    return rt.subscribeReload(['plat_formats'], rechargerFormats);
  }, [etabId, rechargerFormats]);

  // Realtime : un autre iPad qui vend, la direction qui annule.
  React.useEffect(() => {
    const rt = dbService.getRealtime();
    if (!rt?.subscribeReload || !etabId) return undefined;
    return rt.subscribeReload(['caisse_tickets', 'caisse_lignes'], rechargerTickets);
  }, [etabId, rechargerTickets]);

  // Realtime : la direction qui règle la caisse pendant le service. La grille
  // de chaque poste suit (catégories, rangement, habillage, réglages).
  const rechargerGrille = React.useCallback(
    () => Promise.all([rechargerBoutons(), rechargerReglages()]),
    [rechargerBoutons, rechargerReglages],
  );
  React.useEffect(() => {
    const rt = dbService.getRealtime();
    if (!rt?.subscribeReload || !etabId) return undefined;
    return rt.subscribeReload(['caisse_categories', 'caisse_reglages', 'caisse_boutons'], rechargerGrille);
  }, [etabId, rechargerGrille]);
  // Les réglages de la caisse vivent dans la page des réglages (section
  // 'caisse') : ce qui y change s'applique ici sans recharger l'app, même sans
  // temps réel (terminaux, tickets de test vidés).
  useReglageModifie('caisse', () => {
    rechargerGrille(); rechargerTerminaux();
    // Poste passé en mode test depuis la page des réglages : l'écran repart
    // sans ticket, sur la clé que la base vient de rendre ; les tickets de
    // test se lisent au rendu suivant.
    const cle = lireModeTest(etabId);
    if (cle && cle !== cleTest) {
      lectureTickets.current += 1;
      setTickets([]);
      setTicketId(null);
      setProposerVider(false);
      setCleTest(cle);
      return;
    }
    rechargerTickets();
  });

  // Realtime : une arrivée cochée à l'accueil, une réservation prise au
  // téléphone, une table posée sur le plan de salle.
  React.useEffect(() => {
    const rt = dbService.getRealtime();
    if (!rt?.subscribeReload || !etabId) return undefined;
    return rt.subscribeReload(['reservations', 'reservation_tables'], rechargerReservations);
  }, [etabId, rechargerReservations]);

  // Realtime : des tables déplacées ou réunies dans Réservations (ou sur un
  // autre poste), une salle redessinée.
  React.useEffect(() => {
    const rt = dbService.getRealtime();
    if (!rt?.subscribeReload || !etabId) return undefined;
    return rt.subscribeReload(['salle_tables_service', 'salle_tables', 'salles', 'salle_elements'], rechargerPlan);
  }, [etabId, rechargerPlan]);

  const jour = zurichToday();
  // Plan relu au changement d'établissement, après l'hydratation post-login
  // et quand le jour change (les écarts du nouveau jour).
  React.useEffect(() => { rechargerPlan(); }, [jour, rechargerPlan, legacyVersion]);
  // Plan du service en cours : midi jusqu'à 16 h, soir ensuite.
  const service = serviceDuMoment(zurichNowMinutes());
  const ajustParTable = React.useMemo(() => ajustementsDuService(ajustements, service), [ajustements, service]);
  const tablesVues = React.useMemo(() => tablesDuService(tables, ajustParTable), [tables, ajustParTable]);
  const tablees = React.useMemo(() => tableesDe(tablesVues.filter((t) => t.actif !== false)), [tablesVues]);
  const sansTicket = reservationsSansTicket(reservations, {
    jour, maintenantMinutes: zurichNowMinutes(), delaiMinutes: reglages.delai_no_show_min, tickets,
  });
  const nomsTables = nomsParTable(reservations, { jour, tickets });

  // Ticket envoyé à l'encaissement depuis ce poste : la liste rechargée ne le
  // contient plus (il n'est plus ouvert), mais l'écran de fin (numéro, rendu,
  // quittance) reste sur sa dernière image jusqu'à « Terminer ».
  const [ticketEncaisse, setTicketEncaisse] = React.useState(null);
  const ticket = tickets.find((t) => t.id === ticketId)
    || (ticketEncaisse && ticketEncaisse.id === ticketId ? ticketEncaisse : null);
  // Le ticket courant a été encaissé ou annulé ailleurs : l'écran ne reste
  // pas ouvert sur un ticket disparu.
  React.useEffect(() => {
    if (ecran === 'ticket' && ticketId && !ticket) retourAccueil();
  }, [ecran, ticketId, ticket, retourAccueil]);

  // Un ticket couvre sa tablée et les tables de sa réservation.
  const ticketsParTable = ticketsSurPlan(tickets, tablees, reservations);
  // Réservation du service posée sur chaque tablée libre : son nom, son heure
  // et ses couverts s'écrivent sur le plan.
  const attendues = {};
  const membresDe = new Map();
  tablees.forEach(({ principale, membres }) => membresDe.set(principale.id, membres));
  membresDe.forEach((membres, id) => {
    if (ticketsParTable[id]) return;
    const r = reservationsPosees(reservations, { jour, service, tableIds: membres.map((m) => m.id), tickets })[0];
    if (r) attendues[id] = { nom: r.nom, heure: heureCourte(r.heure_arrivee), couverts: r.nb_couverts };
  });
  // Déplacer ou réunir des tables pour le service : le droit d'écrire dans
  // Réservations (case Modifier du module, comme la RLS de
  // salle_tables_service). Jamais en mode test : le plan est celui de tous.
  const peutDeplacerTables = ajustDispo && !modeTest && peutGererReservations(user?.role);

  // ── Mode test (v6) ──
  // Retour du poste en mode normal, côté écran : la mémoire locale s'efface,
  // les tickets de test quittent l'écran, on revient à l'accueil.
  const sortirDuTestIci = React.useCallback((message) => {
    oublierModeTest();
    lectureTickets.current += 1;
    setTickets([]);
    setTicketId(null);
    setQuiTable(null);
    setCleTest(null);
    retourAccueil();
    if (message) notify(message, 'info');
  }, [retourAccueil]);

  // L'écran ne reste pas en mode test sur la foi de sa seule mémoire : la base
  // dit si le poste l'est encore (mode expiré, ou quitté par un responsable).
  // Une lecture en échec ne change rien : la base refusera de toute façon un
  // ticket de test sur un poste qui ne l'est plus.
  React.useEffect(() => {
    if (!etabId || !cleTest) return undefined;
    let vivant = true;
    caisse.testEtat(etabId, poste, cleTest).then(({ data, error }) => {
      if (!vivant || error || data?.actif !== false) return;
      sortirDuTestIci('Le mode test a pris fin sur ce poste. Il vend de nouveau pour de vrai.');
    });
    return () => { vivant = false; };
  }, [etabId, cleTest, poste, sortirDuTestIci]);

  // « Réservations sans ticket » n'existe pas en mode test : un poste qui s'y
  // trouvait (écran repris à l'ouverture) revient à l'accueil.
  React.useEffect(() => {
    if (modeTest && ecran === 'sans_ticket') retourAccueil();
  }, [modeTest, ecran, retourAccueil]);

  // Entrée en mode test (18.11.2026) : un geste de cet écran, rendu au module
  // (menu « Plus »), pour les rôles de ROLES_MODE_TEST. Les autres réglages du
  // mode test (envoi en cuisine, purge, journal) restent dans la page des
  // réglages, section Caisse. L'écran repart sans ticket, sur la clé rendue.
  async function entrerEnTest() {
    if (testEnCours || modeTest || !peutActiverTest) return;
    if (!window.confirm('Passer ce poste en mode test ? Les tickets ouverts ici ne compteront pas dans les chiffres. Les autres postes continuent de vendre normalement.')) return;
    setTestEnCours(true);
    try {
      const { data, error } = await caisse.testEntrer(etabId, poste);
      if (error) { notify(error, 'error'); return; }
      if (!data?.cle) { notify("Le mode test n'a pas pu être activé. Réessayez.", 'error'); return; }
      retenirModeTest(etabId, data.cle);
      lectureTickets.current += 1;
      setTickets([]);
      setTicketId(null);
      setProposerVider(false);
      setCleTest(data.cle);
      notify('Mode test activé sur ce poste', 'success');
    } finally {
      setTestEnCours(false);
    }
  }

  // Sortie en un tap. Les tickets de test restent en base jusqu'à leur purge :
  // un responsable se voit proposer de les vider tout de suite.
  async function quitterModeTest() {
    if (testEnCours || !modeTest) return;
    setTestEnCours(true);
    try {
      const { error } = await caisse.testSortir(etabId, poste, cleTest, false);
      if (error) { notify(error, 'error'); return; }
      sortirDuTestIci(null);
      notify('Mode test quitté. Ce poste vend de nouveau pour de vrai.', 'success');
      if (peutActiverTest) setProposerVider(true);
    } finally {
      setTestEnCours(false);
    }
  }

  async function viderLesTests() {
    if (testEnCours || !peutActiverTest) return;
    if (!window.confirm('Supprimer tous les tickets de test de la maison, sur tous les postes ? Les vrais tickets ne sont pas touchés.')) return;
    setTestEnCours(true);
    try {
      const { error } = await caisse.viderTests(etabId, poste);
      if (error) { notify(error, 'error'); return; }
      setProposerVider(false);
      notify('Tickets de test vidés', 'success');
      rechargerTickets();
    } finally {
      setTestEnCours(false);
    }
  }

  async function tapTable(table, ticketExistant) {
    if (modeTables === 'deplacer' && ticketId) {
      if (ticketExistant && ticketExistant.id !== ticketId) {
        notify('Cette table a déjà un ticket ouvert. Fusionnez-les depuis le ticket.', 'warning');
        return;
      }
      const { error } = await caisse.majTicket(ticketId, { table_id: table.id });
      if (error) { notify(error, 'error'); return; }
      await rechargerTickets();
      setModeTables('ouvrir');
      setEcran('ticket');
      return;
    }
    if (ticketExistant) {
      setTicketId(ticketExistant.id);
      setEcran('ticket');
      return;
    }
    // Table libre : la seule réservation du service posée dessus dans
    // Réservations s'ouvre d'un toucher, dès 45 min avant son heure. Sinon
    // (aucune, plusieurs, trop tôt, mode test), la caisse demande qui s'assoit.
    const membres = tablees.get(table.id)?.membres || [table];
    const directe = modeTest ? null : reservationDirecte(reservations, {
      jour, service, tableIds: membres.map((m) => m.id), tickets, maintenantMinutes: zurichNowMinutes(),
    });
    if (directe) {
      const ok = await ouvrirSur(table, { qui: 'reservation', reservationId: directe.id });
      if (ok) notify('Ticket ouvert pour la réservation de la table', 'success');
      return;
    }
    setQuiTable(table);
  }

  // Glisser un ticket sur une autre table du plan : il y passe, si elle est
  // libre (deux tickets se fusionnent depuis le ticket).
  async function transfererTicket(ticketT, tableCible) {
    if (ticketT.table_id === tableCible.id) return;
    const occupant = ticketsParTable[tableCible.id];
    if (occupant && occupant.id !== ticketT.id) {
      notify('Cette table a déjà un ticket ouvert. Fusionnez-les depuis le ticket.', 'warning');
      return;
    }
    const { error } = await caisse.majTicket(ticketT.id, { table_id: tableCible.id });
    if (error) { notify(error, 'error'); return; }
    notify('Ticket changé de table', 'success');
    await rechargerTickets();
  }

  // Écarts du service écrits depuis la caisse, au même endroit que
  // Réservations. Affichés tout de suite, relus ensuite (et par le temps réel
  // sur les autres postes).
  async function ecrireAjustements(lignes, effacer = []) {
    setAjustements((prev) => [
      ...prev.filter((a) => !(a.service === service
        && (effacer.includes(a.table_id) || lignes.some((l) => l.table_id === a.table_id)))),
      ...lignes.map((l) => ({ ...l, date_service: jour, service })),
    ]);
    const r1 = lignes.length ? await plan.enregistrerAjustements(jour, service, lignes) : { error: null };
    const r2 = effacer.length ? await plan.effacerAjustements(jour, service, effacer) : { error: null };
    if (r1.error || r2.error) notify(r1.error || r2.error, 'error');
    rechargerPlan();
  }

  function reunirTables({ source, cible, centre }) {
    const ticketsSource = new Set(source.map((t) => ticketsParTable[t.id]?.id).filter(Boolean));
    const ticketsCible = new Set(cible.map((t) => ticketsParTable[t.id]?.id).filter(Boolean));
    if (ticketsSource.size && ticketsCible.size && [...ticketsSource].some((id) => !ticketsCible.has(id))) {
      notify('Deux tickets sont ouverts : fusionnez-les depuis le ticket avant de réunir les tables.', 'warning');
      return;
    }
    ecrireAjustements(lignesReunion(source, cible, centre, ajustParTable));
  }

  async function remettrePlanDeBase() {
    setAjustements((prev) => prev.filter((a) => a.service !== service));
    const { error } = await plan.effacerAjustements(jour, service);
    if (error) notify(error, 'error');
    rechargerPlan();
  }

  // Réponse de la feuille « Qui est à cette table ? ».
  async function ouvrirPour(choix) {
    if (!quiTable) return;
    await ouvrirSur(quiTable, choix);
  }

  // Ouvre le ticket d'une table. La RPC est idempotente (double tap, deux
  // postes sur la même table) ; le verrou local évite le second appel.
  async function ouvrirSur(table, choix) {
    if (verrouOuverture.current || !table) return false;
    verrouOuverture.current = true;
    setOuverture(true);
    try {
      // En mode test, la même feuille s'ouvre (on s'entraîne au vrai geste),
      // mais la base ouvre un ticket de test : ni réservation ni fiche client.
      const { data, error, modeTestInactif } = await caisse.ouvrirTicket({
        etablissementId: etabId, tableId: table.id, ...choix,
        ...(modeTest ? { test: true, poste, posteCle: cleTest } : null),
      });
      if (modeTestInactif) { sortirDuTestIci(error); return false; }
      if (error) { notify(error, 'error'); return false; }
      if (data?.deja_ouvert) notify('Cette table avait déjà un ticket ouvert.', 'info');
      await Promise.all([rechargerTickets(), rechargerReservations()]);
      setQuiTable(null);
      setTicketId(data.ticket_id);
      setEcran('ticket');
      return true;
    } finally {
      verrouOuverture.current = false;
      setOuverture(false);
    }
  }

  // « Réservations sans ticket » : un tap par ligne, rien n'est posé seul.
  async function poserStatut(resa, statut) {
    if (statutEnCours) return;
    setStatutEnCours(resa.id);
    try {
      const { error } = await caisse.corrigerReservation({
        etablissementId: etabId, reservationId: resa.id, statut,
      });
      if (error) { notify(error, 'error'); return; }
      notify(statut === 'no_show' ? 'Réservation marquée no-show' : 'Réservation marquée arrivée', 'success');
      await rechargerReservations();
    } finally {
      setStatutEnCours(null);
    }
  }

  async function venteDirecte() {
    // En mode test, la vente directe passe par la RPC d'ouverture : un compte
    // de l'API ne crée jamais un ticket de test lui-même.
    if (modeTest) {
      const { data, error, modeTestInactif } = await caisse.ouvrirTicket({
        etablissementId: etabId, test: true, poste, posteCle: cleTest,
      });
      if (modeTestInactif) { sortirDuTestIci(error); return; }
      if (error) { notify(error, 'error'); return; }
      await rechargerTickets();
      setTicketId(data.ticket_id);
      setEcran('ticket');
      return;
    }
    // Lot 01 : hors mode test, la feuille « Qui retire la commande ? ».
    setQuiRetire(true);
  }

  // Ticket ouvert depuis la feuille : la ligne rendue par l'écriture entre
  // dans la liste connue avant la relecture, pour qu'une relecture en échec
  // (qui garde la liste d'avant) ne referme pas l'écran sur un ticket absent.
  async function ouvrirTicketDirect(data) {
    setTickets((liste) => (liste.some((t) => t.id === data.id) ? liste : [...liste, { ...data, lignes: data.lignes || [] }]));
    setQuiRetire(false);
    setTicketId(data.id);
    setEcran('ticket');
    await rechargerTickets();
  }

  // « Continuer sans nom » : le ticket nu d'avant (creerTicket).
  async function venteSansNom() {
    const { data, error } = await caisse.creerTicket(etabId, null);
    if (error) return { error };
    await ouvrirTicketDirect(data);
    return {};
  }

  // « Ouvrir le ticket » : nom, heure promise et mode à emporter.
  async function venteNommee({ ticketId: id, nom, heure, aEmporter }) {
    const { data, error, nouvelId } = await caisse.creerVenteDirecte({
      etablissementId: etabId, ticketId: id, nom, heure, aEmporter,
    });
    if (error) return { error, nouvelId };
    await ouvrirTicketDirect(data);
    return {};
  }

  function nomTable(t) {
    if (!t.table_id) return null;
    return tables.find((x) => x.id === t.table_id)?.nom || null;
  }

  // Réglages de la caisse : une section de la page des réglages, pour les trois
  // rôles que la base laisse écrire (gardesCaisse.js). Depuis le 14.11.2026 on
  // y entre par la page des réglages seule : ni l'accueil ni le ticket n'y
  // mènent plus.

  // Bandeau du mode test : en tête de chaque écran de la caisse, sans exception.
  const bandeauTest = modeTest ? <BandeauTest onQuitter={quitterModeTest} enCours={testEnCours} /> : null;

  // ── Le plan de salle, écran d'arrivée (17.11.2026) ──
  // Toutes les actions en barre au-dessus du plan, qui prend la hauteur qui
  // reste (PlanTables.jsx). Les gardes sont celles des tuiles d'avant : en
  // mode test, ni « Réservations sans ticket » (elle poserait de vrais
  // statuts), ni historique, ni clôture (de vraies ventes seulement) ; la
  // clôture aux rôles qui habillent la caisse. L'écran « tables » ne sert
  // plus qu'à choisir la nouvelle table d'un ticket ; sans déplacement en
  // cours, il rend le plan d'arrivée.
  const deplacement = ecran === 'tables' && modeTables === 'deplacer';
  const avecTables = tables.some((t) => t.actif !== false);
  const vuePlan = (
    <PlanTables
      salles={salles}
      tables={tablesVues}
      tablees={tablees}
      ticketsParTable={ticketsParTable}
      noms={nomsTables}
      attendues={attendues}
      elements={elements}
      onTapTable={tapTable}
      onTransferer={deplacement ? null : transfererTicket}
      choixSeul={deplacement}
      peutDeplacer={peutDeplacerTables}
      onDeplacerGroupe={({ membres, dx, dy }) => ecrireAjustements(lignesDeplacement(membres, dx, dy, ajustParTable))}
      onReunir={reunirTables}
      onSeparer={(membres) => { const s = lignesSeparation(membres, ajustParTable); ecrireAjustements(s.lignes, s.effacer); }}
      onRemettre={remettrePlanDeBase}
    />
  );

  if (ecran === ECRAN_ACCUEIL || (ecran === 'tables' && !deplacement)) {
    const enRetard = !modeTest && peutHabiller ? (etatJour?.a_cloturer || []) : [];
    const choixModeTest = peutActiverTest && !modeTest && {
      titre: 'Passer ce poste en mode test',
      detail: 'Les tickets de ce poste ne comptent plus dans les chiffres.',
      onClick: entrerEnTest,
    };
    return (
      <>
        {bandeauTest}
        {proposerVider && peutActiverTest && !modeTest && (
          <div style={st.propositionVider} data-cadre="" data-caisse-vider-tests="">
            <p style={st.propositionTexte}>
              Les tickets de test restent en base jusqu'à leur purge automatique, sous 24 heures. Vous pouvez les vider maintenant.
            </p>
            <span style={st.propositionActions}>
              <Btn disabled={testEnCours} onClick={viderLesTests} style={st.btn44}>Vider les tickets de test</Btn>
              <Btn variant="ghost" onClick={() => setProposerVider(false)} style={st.btn44}>Plus tard</Btn>
            </span>
          </div>
        )}
        {erreurTickets && (
          <div style={st.erreur}>
            <p style={{ margin: 0 }}>{erreurTickets}</p>
            <Btn onClick={rechargerTickets} style={st.btn44}>Réessayer</Btn>
          </div>
        )}
        {/* Jour non clôturé : la clôture s'ouvre par « Clôture de caisse »,
            dans la barre, pour les mêmes rôles. */}
        {enRetard.length > 0 && (
          <div style={st.propositionVider} data-cadre="" data-caisse-non-cloturee="">
            <p style={st.propositionTexte}>
              <span>La caisse du</span> <span style={st.num}>{dateCH(enRetard[0].jour)}</span> <span>n'est pas clôturée.</span>
              {enRetard.length > 1 && <>{' '}<span style={st.num}>{enRetard.length}</span> <span>jours attendent leur clôture.</span></>}
            </p>
          </div>
        )}
        {/* Coordonnées légales : à compléter avant le premier vrai ticket,
            l'encaissement les réclame (Encaissement.jsx). */}
        {!modeTest && manquesLegal.length > 0 && (
          <div style={st.propositionVider} data-cadre="" data-caisse-legal-manquant="">
            <p style={st.propositionTexte}>
              <span>Avant le premier vrai ticket, complétez les coordonnées de la maison imprimées sur la quittance.</span>
              {' '}<span>Il manque :</span> <ListeManques manques={manquesLegal} />.{' '}
              {peutHabiller
                ? <span>Elles se saisissent dans les réglages de la caisse, rubrique TVA et clôture.</span>
                : <span>Prévenez la direction.</span>}
            </p>
          </div>
        )}
        {/* Hors mode test : un poste en essai ne s'abonne à rien. */}
        {!modeTest && <InvitationAvisPret user={user} etablissement={etablissement} />}
        {/* L3 : commandes QR à valider, en tête du plan. */}
        {!modeTest && (
          <BandeauCommandesQr
            commandes={commandesQr.commandes}
            maintenant={commandesQr.maintenant}
            onTraitee={() => Promise.all([commandesQr.recharger(), rechargerTickets()])}
          />
        )}
        <div className="module-actions caisse-actions no-print" data-caisse-actions="">
          <Btn variant="primary" onClick={venteDirecte} style={st.btn44}>Vente directe</Btn>
          <Btn onClick={() => setEcran('tickets')} style={st.btn44}>
            <span>{modeTest ? 'Tickets de test ouverts' : 'Tickets ouverts'}</span>
            <span style={st.compteBtn}>{tickets.length}</span>
          </Btn>
          {/* Téléphone : les trois autres actions passent dans « Plus », la
              barre tient sur une ligne et le plan garde la hauteur. Le compte
              des réservations sans ticket reste lisible sur le bouton. */}
          {telephone ? (
            <BoutonActions
              id="caisse-plus"
              label={<><span>Plus</span>{!modeTest && sansTicket.length > 0 && <span style={st.compteBtn}>{sansTicket.length}</span>}</>}
              style={st.plus}
              titre="Caisse"
              sections={[{ items: [
                !modeTest && {
                  titre: 'Réservations sans ticket',
                  detail: sansTicket.length > 0 ? <><span style={st.num}>{sansTicket.length}</span> <span>en retard</span></> : null,
                  onClick: () => setEcran('sans_ticket'),
                },
                !modeTest && { titre: 'Historique et quittances', onClick: () => setEcran('historique') },
                !modeTest && { titre: 'Bons cadeaux', detail: 'Vendre, retrouver, suivre', onClick: () => setEcran('bons_cadeaux') },
                !modeTest && peutHabiller && { titre: 'Clôture de caisse', onClick: () => setEcran('cloture') },
                choixModeTest,
              ] }]}
            />
          ) : (
            <>
              {!modeTest && (
                <Btn onClick={() => setEcran('sans_ticket')} style={st.btn44}>
                  <span>Réservations sans ticket</span>
                  {sansTicket.length > 0 && <span style={st.compteBtn}>{sansTicket.length}</span>}
                </Btn>
              )}
              {!modeTest && <Btn onClick={() => setEcran('historique')} style={st.btn44}>Historique et quittances</Btn>}
              {!modeTest && <Btn onClick={() => setEcran('bons_cadeaux')} style={st.btn44}>Bons cadeaux</Btn>}
              {!modeTest && peutHabiller && <Btn onClick={() => setEcran('cloture')} style={st.btn44}>Clôture de caisse</Btn>}
              {choixModeTest && (
                <BoutonActions id="caisse-plus" label="Plus" style={st.plus} titre="Caisse" sections={[{ items: [choixModeTest] }]} />
              )}
            </>
          )}
        </div>
        {avecTables ? vuePlan : (
          <p style={st.vide}>Aucune table dans le plan de salle. Dessinez la salle dans Réservations, ou vendez sans table par « Vente directe ».</p>
        )}
        {quiTable && (
          <QuiEstLa
            key={quiTable.id}
            table={quiTable}
            tableIds={(tablees.get(quiTable.id)?.membres || [quiTable]).map((m) => m.id)}
            etablissementId={etabId}
            reservations={reservationsAttachables(reservations, { jour, tableId: (tablees.get(quiTable.id)?.membres || [quiTable]).map((m) => m.id), tickets })}
            enCours={ouverture}
            onChoisir={ouvrirPour}
            onClose={() => setQuiTable(null)}
          />
        )}
        {quiRetire && !modeTest && (
          <QuiRetire onOuvrir={venteNommee} onSansNom={venteSansNom} onClose={() => setQuiRetire(false)} />
        )}
      </>
    );
  }

  // ── Choisir la nouvelle table d'un ticket ──
  if (deplacement) {
    return (
      <>
      {bandeauTest}
      <EcranTache
        titre="Choisir la nouvelle table"
        onRetour={() => { setModeTables('ouvrir'); setEcran('ticket'); }}
      >
        {avecTables ? vuePlan : <p style={st.vide}>Aucune table dans le plan de salle.</p>}
      </EcranTache>
      </>
    );
  }

  // ── Réservations sans ticket : no-show ou arrivé, un tap par ligne ──
  // Jamais en mode test : l'écran poserait de vrais statuts.
  if (ecran === 'sans_ticket' && !modeTest) {
    const maintenantMin = zurichNowMinutes();
    return (
      <EcranTache
        titre="Réservations sans ticket"
        etat={<span><span>Confirmées, attendues depuis plus de</span> <span style={st.num}>{reglages.delai_no_show_min}</span> <span>min, sans table ouverte</span></span>}
        onRetour={retourAccueil}
      >
        {!sansTicket.length && <p style={st.vide}>Aucune réservation en retard. Rien n'est marqué no-show sans vous.</p>}
        {sansTicket.length > 0 && (
        <div className="caisse-liste" data-cadre="" style={st.listeTickets}>
          {sansTicket.map((r) => {
            const retard = maintenantMin - minutesDe(r.heure_arrivee);
            const occupe = statutEnCours === r.id;
            return (
              <div key={r.id} data-sans-ticket={r.id} style={st.sansTicketRang}>
                <span style={st.sansTicketInfos}>
                  <span style={st.sansTicketNom}>
                    <span style={st.num}>{heureCourte(r.heure_arrivee)}</span> <span data-no-translate>{r.nom}</span>
                  </span>
                  <span style={st.ticketInfosLigne}>
                    <span><span style={st.num}>{r.nb_couverts}</span> <span>couverts</span></span>
                    <span><span>attendue depuis</span> <span style={st.num}>{retard}</span> <span>min</span></span>
                  </span>
                </span>
                <span style={st.sansTicketActions}>
                  <Btn variant="ghost" disabled={occupe} onClick={() => poserStatut(r, 'arrive')} style={st.btn44}>Arrivé sans ticket</Btn>
                  <Btn variant="danger" disabled={occupe} onClick={() => poserStatut(r, 'no_show')} style={st.btn44}>No-show</Btn>
                </span>
              </div>
            );
          })}
        </div>
        )}
      </EcranTache>
    );
  }

  // ── Bons cadeaux (19.11.2026) : vendre, retrouver, suivre. Hors mode test :
  // l'écran ne montre que de vrais bons. ──
  if (ecran === 'bons_cadeaux' && !modeTest) {
    return (
      <BonsCadeaux
        etablissement={etablissement}
        reglages={reglages}
        role={user?.role}
        codeAOuvrir={bonAOuvrir}
        onCodeOuvert={() => setBonAOuvrir(null)}
        onRetour={retourAccueil}
      />
    );
  }

  // ── Historique et quittances (v7) ──
  if (ecran === 'historique' && !modeTest) {
    return (
      <EcranTache titre="Historique et quittances" etat="Les tickets encaissés gardent leur numéro, même annulés" onRetour={retourAccueil}>
        <Historique
          etablissementId={etabId}
          reglages={reglages}
          peutAnnuler={peutAnnuler}
          peutControler={peutHabiller}
          onQuittance={quittance}
          terminaux={terminaux}
        />
      </EcranTache>
    );
  }

  // ── Clôture de caisse (v7) ──
  if (ecran === 'cloture' && !modeTest && peutHabiller) {
    return (
      <EcranTache titre="Clôture de caisse" etat="Vérifier, compter les espèces, figer" onRetour={retourAccueil}>
        <Cloture etablissementId={etabId} onDocument={pdfCloture} onChange={rechargerJournee} terminaux={terminaux} />
      </EcranTache>
    );
  }

  // ── Tickets ouverts ──
  if (ecran === 'tickets') {
    return (
      <>
      {bandeauTest}
      <EcranTache titre={modeTest ? 'Tickets de test ouverts' : 'Tickets ouverts'} onRetour={retourAccueil}>
        {!tickets.length && <p style={st.vide}>Aucun ticket ouvert.</p>}
        {tickets.length > 0 && (
        <div className="caisse-liste" data-cadre="" style={st.listeTickets}>
          {tickets.map((t) => {
            const nom = nomTable(t);
            const e = etatTicket(t, maintenant);
            // Lot 01 : un ticket sans table dit son numéro de retrait, le nom,
            // l'heure promise et « À emporter » ; sans rien, « Direct ».
            const rep = t.table_id ? null : reperesRetrait(t);
            return (
              <button key={t.id} type="button" style={st.ticketRow} onClick={() => { setTicketId(t.id); setEcran('ticket'); }}>
                <span style={st.ticketTable}>
                  {nom ? <span data-no-translate>{nom}</span> : (rep?.numero != null
                    ? <span data-retrait-numero=""><span>Retrait n°</span> <span style={st.num}>{rep.numero}</span></span>
                    : <span>Direct</span>)}
                </span>
                <span style={st.ticketInfos}>
                  {rep && !rep.vide && (
                    <ReperesRetrait reperes={{ ...rep, numero: null }} style={st.ticketClient} />
                  )}
                  {nomsTables[t.table_id] && !nomsTables[t.table_id].attendu && (
                    <span style={st.ticketClient} data-no-translate>{nomsTables[t.table_id].nom}</span>
                  )}
                  <span><span>{(t.lignes || []).length}</span> <span>articles</span></span>
                  {e.minutes != null && (
                    <span><span>Dernier envoi il y a</span> <span style={st.num}>{e.minutes}</span> <span>min</span></span>
                  )}
                  {e.aSuivre > 0 && (
                    <span style={st.ticketSuivre}>
                      <ChevronsRight size={15} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
                      <span style={st.num}>{e.aSuivre}</span> <span>à suivre en attente</span>
                    </span>
                  )}
                  {e.prets > 0 && (
                    <span style={st.ticketPret} data-caisse-prets="">
                      <ConciergeBell size={15} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
                      <span style={st.num}>{e.prets}</span> <span>{e.prets > 1 ? 'prêts en cuisine' : 'prêt en cuisine'}</span>
                    </span>
                  )}
                </span>
                <span style={st.ticketHeure}>{zurichDateHeure(t.created_at).heure}</span>
                <span style={st.ticketTotal}><span>{chf(totalTicket(t))}</span> <span>CHF</span></span>
              </button>
            );
          })}
        </div>
        )}
      </EcranTache>
      </>
    );
  }

  // ── Le ticket : écran de prise de commande en plein écran (21.11.2026),
  // rendu par-dessus la coque ; le bandeau du mode test vit en tête. ──
  if (ecran === 'ticket' && ticket) {
    const nom = nomTable(ticket);
    const autresMemeTable = tickets.filter((t) => t.id !== ticket.id && t.table_id && t.table_id === ticket.table_id);
    // key : un autre ticket remonte l'écran, le mode revient à « En direct ».
    return (
      <TicketEcran
        key={ticket.id}
        titre={nom ? <><span>Table</span> <span data-no-translate>{nom}</span></> : (
          reperesRetrait(ticket).vide ? <span>Vente directe</span> : <ReperesRetrait reperes={reperesRetrait(ticket)} sansNumero="Vente directe" />
        )}
        onRetour={retourAccueil}
        bandeau={bandeauTest}
        ticket={ticket}
        articles={articles}
        formules={formules}
        allergenesFiches={allergenesFiches}
        boutons={boutons}
        categories={categories}
        reglages={reglages}
        cartes={cartesEnVente}
        reservation={reservations.find((r) => r.id === ticket.reservation_id) || null}
        reservations={reservationsAttachables(reservations, {
          jour, tableId: ticket.table_id, tickets, garder: ticket.reservation_id,
        })}
        onReservationsChange={rechargerReservations}
        peutHabiller={peutHabiller}
        onBoutonsChange={rechargerBoutons}
        ticketsMemeTable={autresMemeTable}
        onDeplacer={() => { setModeTables('deplacer'); setEcran('tables'); }}
        onFusionne={rechargerTickets}
        onClos={() => { setTicketEncaisse(null); rechargerTickets(); rechargerReservations(); rechargerJournee(); retourAccueil(); }}
        onEncaissementEnvoye={setTicketEncaisse}
        reload={rechargerTickets}
        modeTest={modeTest}
        onQuittance={quittance}
        terminaux={terminaux}
        role={user?.role}
        hebergementActif={isModuleActiveForEtab(etablissement, 'hebergement')}
      />
    );
  }

  // Écran sans objet (ticket disparu, ou « Réservations sans ticket » repris
  // par un poste passé en mode test) : le bandeau reste, l'accueil revient.
  return bandeauTest;
}

const st = {
  erreur: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12, color: 'var(--text)' },
  vide: { color: 'var(--text3)', fontSize: 'var(--t2)' },
  btn44: { minHeight: 44, flexShrink: 0 },
  // Compte porté par un bouton de la barre (tickets ouverts, réservations sans ticket).
  compteBtn: { fontFamily: 'var(--font-num)', color: 'var(--text2)' },
  // « Plus » au téléphone : la pilule secondaire de Btn, écrite par les jetons.
  plus: {
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 16px', flexShrink: 0, cursor: 'pointer',
    borderRadius: 'var(--r-full)', background: 'var(--btn-fond)', color: 'var(--btn-texte)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',
    fontFamily: 'var(--font)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', whiteSpace: 'nowrap',
  },
  // Liste dans une carte blanche (direction Galet) : les lignes se séparent
  // par leur filet doux, la dernière n'en porte pas (caisse.css).
  listeTickets: {
    display: 'flex', flexDirection: 'column', marginTop: 12, maxWidth: 640, minWidth: 0, padding: '4px 18px', boxSizing: 'border-box',
    background: 'var(--zone)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
  ticketRow: {
    display: 'flex', alignItems: 'baseline', gap: 12, minHeight: 56, padding: '10px 0', boxSizing: 'border-box',
    borderRadius: 0, background: 'transparent', color: 'var(--text)',
    borderWidth: 0, borderBottomWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
    cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 'var(--t2)', textAlign: 'left', width: '100%',
  },
  ticketTable: { fontWeight: 'var(--g3)', flexShrink: 0, minWidth: 70 },
  ticketInfos: { color: 'var(--text2)', fontSize: 'var(--t1)', flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  ticketSuivre: { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text)', fontWeight: 'var(--g3)' },
  ticketClient: { color: 'var(--text)', fontWeight: 'var(--g3)', fontSize: 'var(--t2)', overflowWrap: 'anywhere' },
  ticketInfosLigne: { display: 'flex', flexWrap: 'wrap', gap: '2px 12px', color: 'var(--text2)', fontSize: 'var(--t1)' },
  // Une réservation sans ticket : son heure, son nom, et deux gestes.
  sansTicketRang: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, minHeight: 60, padding: '10px 0', boxSizing: 'border-box',
    color: 'var(--text)', minWidth: 0,
    borderWidth: 0, borderBottomWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
  sansTicketInfos: { display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 200px', minWidth: 0 },
  sansTicketNom: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', overflowWrap: 'anywhere' },
  sansTicketActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  num: { fontFamily: 'var(--font-num)' },
  ticketPret: { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--success-text)', fontWeight: 'var(--g3)' },
  // Après la sortie du mode test : proposition de vider, pour un responsable.
  // Bandeau en carte blanche (direction Galet) : jour non clôturé, tickets
  // de test à vider.
  propositionVider: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '12px 14px 12px 18px', marginBottom: 12, minWidth: 0,
    boxSizing: 'border-box', borderRadius: 'var(--r-lg)', background: 'var(--zone)', boxShadow: 'var(--sh)', color: 'var(--text)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
  propositionTexte: { margin: 0, fontSize: 'var(--t2)', lineHeight: 1.4, flex: '1 1 260px', minWidth: 0 },
  propositionActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  ticketHeure: { color: 'var(--text2)', fontSize: 'var(--t1)', fontFamily: 'var(--font-num)' },
  ticketTotal: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)' },
};
