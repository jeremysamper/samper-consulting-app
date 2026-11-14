import React from 'react';
import { BarChart3, CalendarClock, ChevronsRight, ClipboardCheck, ConciergeBell, FlaskConical, History, LayoutGrid, Zap, ReceiptText, SlidersHorizontal } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { useEcranModule, ECRAN_ACCUEIL } from '../../components/parcours/useEcranModule.js';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { dbService } from '../../services/dbService.js';
import { ouvrirCompte } from '../../services/navigationService.js';
import { useReglageModifie } from '../../services/reglagesSignal.js';
import { usePlanSalle } from '../../hooks/usePlanSalle.js';
import { zurichAjouterJours, zurichDateHeure, zurichNowMinutes, zurichToday } from '../../utils/zurichTime.js';
import * as caisse from '../../services/caisseService.js';
import * as tpe from '../../services/caisseTpeService.js';
import PlanTables, { etatTicket } from './PlanTables.jsx';
import TicketEcran from './TicketEcran.jsx';
import QuiEstLa from './QuiEstLa.jsx';
import BandeauTest from './BandeauTest.jsx';
import InvitationAvisPret from './InvitationAvisPret.jsx';
import Historique from './Historique.jsx';
import Cloture from './Cloture.jsx';
import { ROLES_MODE_TEST, idPoste, lireModeTest, oublierModeTest, retenirModeTest } from './modeTest.js';
import { peutHabillerCaisse } from './gardesCaisse.js';
import { heureCourte, minutesDe, nomsParTable, reservationsAttachables, reservationsSansTicket } from './clients.js';
import { cartesEtArticlesEnVente, fusionnerReglages } from './reglages.js';
import { useMaintenant } from './mesures.js';
import { resumeService } from './resumeService.js';
import { CarteTablesOuvertes, ReperesCaisse } from './CartesCaisse.jsx';
import './caisse.css';

// Rapports (v8) : chargés à la demande, ils ne pèsent pas sur la prise de commande.
const Rapports = React.lazy(() => import('./rapports/Rapports.jsx'));

// ─────────────────────────────────────────────────────────────────────────────
// Caisse v1 : prise de commande par table depuis le plan de salle, ventes
// directes au comptoir, bons envoyés au KDS (RPC caisse_envoyer_bon),
// encaissement simple. Accueil à tuiles comme les autres modules par tâche.
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
// v8 : rapports. Une tuile « Rapports » pour consultant, patron et
// responsable de cuisine (la base rend à chacun ce qu'il peut lire : tout pour
// la direction, les plats vendus et les services pour le responsable de
// cuisine ; elle refuse les autres rôles). Jamais en mode test.
// ─────────────────────────────────────────────────────────────────────────────

const dateCH = (jour) => { const [a, m, j] = String(jour || '').split('-'); return j ? `${j}.${m}.${a}` : ''; };

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const totalTicket = (t) => (t.lignes || []).reduce((s, l) => s + Number(l.quantite) * Number(l.prix_unitaire), 0);

export default function Caisse({ user, etablissement, legacyVersion }) {
  const etabId = etablissement?.id;
  const plan = usePlanSalle(etabId);
  const { ecran, setEcran, retourAccueil } = useEcranModule('caisse', {
    repris: ['tables', 'tickets', 'sans_ticket'],
  });

  const [tickets, setTickets] = React.useState([]);
  const [erreurTickets, setErreurTickets] = React.useState(null);
  const [tables, setTables] = React.useState([]);
  const [salles, setSalles] = React.useState([]);
  // Plats et cartes tels que lus ; les articles en vente en sont déduits avec
  // le réglage « Cartes en vente » (voir plus bas).
  const [plats, setPlats] = React.useState([]);
  const [cartesLues, setCartesLues] = React.useState([]);
  // Réservations d'aujourd'hui et de la veille (v5), et la table dont la
  // feuille « Qui est à cette table ? » est ouverte.
  const [reservations, setReservations] = React.useState([]);
  const [quiTable, setQuiTable] = React.useState(null);
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
  const reglages = React.useMemo(() => fusionnerReglages(config), [config]);
  // Mode test (v6) : la clé du poste gardée sur l'appareil, ou null. Un
  // responsable seul l'active ; la proposition de vider suit la sortie.
  const poste = React.useMemo(() => idPoste(), []);
  const [cleTest, setCleTest] = React.useState(() => lireModeTest(etabId));
  const modeTest = Boolean(cleTest);
  const peutActiverTest = ROLES_MODE_TEST.includes(user?.role);
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
    setCategories([]); setConfig({});
    setReservations([]); setQuiTable(null); setPlats([]); setCartesLues([]);
    setTickets([]); setCleTest(lireModeTest(etabId)); setProposerVider(false);
    setTerminaux([]);
  }, [etabId]);
  // Cartes en vente et articles vendables : fermé par défaut (une carte
  // archivée ou cachée ne vend jamais), sans réglage tout vend comme avant.
  const { cartesEnVente, articles } = React.useMemo(
    () => cartesEtArticlesEnVente({ plats, cartes: cartesLues, cartesIds: reglages.cartes_ids }),
    [plats, cartesLues, reglages.cartes_ids],
  );
  const rechargerReglages = React.useCallback(async () => {
    if (!etabId) return;
    const [c, r] = await Promise.all([caisse.listCategories(etabId), caisse.getReglages(etabId)]);
    if (!c.error) setCategories(c.data);
    if (!r.error) setConfig(r.data);
  }, [etabId]);
  const maintenant = useMaintenant();
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

  // Plan de salle (lecture seule) et articles : rechargés au changement
  // d'établissement et après l'hydratation post-login (legacyVersion).
  React.useEffect(() => {
    let vivant = true;
    (async () => {
      if (!etabId) return;
      const [t, s] = await Promise.all([plan.listTables(), plan.listSalles()]);
      if (!vivant) return;
      setTables(t.data || []);
      setSalles(s.data || []);
      const db = dbService.getDb();
      if (!db) return;
      const [platsLus, cartes] = await Promise.all([
        db.listPlats(etabId),
        db.listCartes(etabId),
      ]);
      if (!vivant) return;
      setPlats(platsLus || []);
      setCartesLues(cartes || []);
    })();
    return () => { vivant = false; };
  }, [etabId, plan, legacyVersion]);

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
  useReglageModifie('caisse', () => { rechargerGrille(); rechargerTerminaux(); rechargerTickets(); });

  // Realtime : une arrivée cochée à l'accueil, une réservation prise au
  // téléphone, une table posée sur le plan de salle.
  React.useEffect(() => {
    const rt = dbService.getRealtime();
    if (!rt?.subscribeReload || !etabId) return undefined;
    return rt.subscribeReload(['reservations', 'reservation_tables'], rechargerReservations);
  }, [etabId, rechargerReservations]);

  const jour = zurichToday();
  const sansTicket = reservationsSansTicket(reservations, {
    jour, maintenantMinutes: zurichNowMinutes(), delaiMinutes: reglages.delai_no_show_min, tickets,
  });
  const nomsTables = nomsParTable(reservations, { jour, tickets });

  const ticket = tickets.find((t) => t.id === ticketId) || null;
  // Le ticket courant a été encaissé ou annulé ailleurs : l'écran ne reste
  // pas ouvert sur un ticket disparu.
  React.useEffect(() => {
    if (ecran === 'ticket' && ticketId && !ticket) retourAccueil();
  }, [ecran, ticketId, ticket, retourAccueil]);

  const ticketsParTable = {};
  tickets.forEach((t) => { if (t.table_id && !ticketsParTable[t.table_id]) ticketsParTable[t.table_id] = t; });

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

  async function entrerModeTest() {
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
    // Table libre : la caisse demande qui s'assoit avant d'ouvrir le ticket.
    setQuiTable(table);
  }

  // Réponse de la feuille « Qui est à cette table ? ». La RPC est idempotente
  // (double tap, deux postes sur la même table) ; le verrou local évite le
  // second appel.
  async function ouvrirPour(choix) {
    if (verrouOuverture.current || !quiTable) return;
    verrouOuverture.current = true;
    setOuverture(true);
    try {
      // En mode test, la même feuille s'ouvre (on s'entraîne au vrai geste),
      // mais la base ouvre un ticket de test : ni réservation ni fiche client.
      const { data, error, modeTestInactif } = await caisse.ouvrirTicket({
        etablissementId: etabId, tableId: quiTable.id, ...choix,
        ...(modeTest ? { test: true, poste, posteCle: cleTest } : null),
      });
      if (modeTestInactif) { sortirDuTestIci(error); return; }
      if (error) { notify(error, 'error'); return; }
      if (data?.deja_ouvert) notify('Cette table avait déjà un ticket ouvert.', 'info');
      await Promise.all([rechargerTickets(), rechargerReservations()]);
      setQuiTable(null);
      setTicketId(data.ticket_id);
      setEcran('ticket');
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
    const { data, error } = await caisse.creerTicket(etabId, null);
    if (error) { notify(error, 'error'); return; }
    await rechargerTickets();
    setTicketId(data.id);
    setEcran('ticket');
  }

  function nomTable(t) {
    if (!t.table_id) return null;
    return tables.find((x) => x.id === t.table_id)?.nom || null;
  }

  // Réglages de la caisse : une section de la page des réglages, pour les trois
  // rôles que la base laisse écrire (gardesCaisse.js). L'accueil et le ticket y
  // mènent d'un toucher ; depuis le ticket la page se pose par-dessus, le ticket
  // reste ouvert et le geste retour y ramène.
  const ouvrirReglages = (parDessus = false) => ouvrirCompte('caisse', { parDessus });

  // Bandeau du mode test : en tête de chaque écran de la caisse, sans exception.
  const bandeauTest = modeTest ? <BandeauTest onQuitter={quitterModeTest} enCours={testEnCours} /> : null;

  // ── Accueil à tuiles ──
  if (ecran === ECRAN_ACCUEIL) {
    const tuiles = [
      {
        id: 'tables',
        libelle: 'Prendre une table',
        Icone: LayoutGrid,
        etat: tables.some((t) => t.actif !== false)
          ? <><span>{tickets.filter((t) => t.table_id).length}</span> <span>tables servies</span></>
          : 'Aucune table dans le plan de salle',
        onClick: () => { setModeTables('ouvrir'); setEcran('tables'); },
      },
      {
        id: 'direct',
        libelle: 'Vente directe',
        Icone: Zap,
        etat: 'Sans table, encaissement immédiat',
        onClick: venteDirecte,
      },
      {
        id: 'tickets',
        libelle: 'Tickets ouverts',
        Icone: ReceiptText,
        etat: <><span>{tickets.length}</span> <span>ouverts</span>{', '}<span>{chf(tickets.reduce((s, t) => s + totalTicket(t), 0))}</span> <span>CHF</span></>,
        onClick: () => setEcran('tickets'),
      },
      // En mode test, pas de « Réservations sans ticket » : un tap y poserait
      // un vrai statut sur une vraie réservation.
      ...(modeTest ? [] : [{
        id: 'sans_ticket',
        libelle: 'Réservations sans ticket',
        Icone: CalendarClock,
        etat: sansTicket.length
          ? <><span>{sansTicket.length}</span> <span>à vérifier : no-show ou arrivé ?</span></>
          : 'Aucune réservation en retard',
        onClick: () => setEcran('sans_ticket'),
      }]),
      // v7 : de vraies ventes seulement, jamais en mode test.
      ...(modeTest ? [] : [{
        id: 'historique',
        libelle: 'Historique et quittances',
        Icone: History,
        etat: 'Tickets encaissés, par jour ou par numéro',
        onClick: () => setEcran('historique'),
      }]),
      ...(modeTest || !peutHabiller ? [] : [{
        id: 'cloture',
        libelle: 'Clôture de caisse',
        Icone: ClipboardCheck,
        etat: etatJour?.cloture
          ? "La caisse d'aujourd'hui est clôturée"
          : <><span>{etatJour?.tickets_du_jour ?? 0}</span> <span>tickets à clôturer aujourd'hui</span></>,
        onClick: () => setEcran('cloture'),
      }]),
      ...(modeTest || !peutHabiller ? [] : [{
        id: 'rapports',
        libelle: 'Rapports',
        Icone: BarChart3,
        etat: peutAnnuler ? 'Chiffres, plats vendus, fichiers pour la fiduciaire' : 'Plats vendus et services, midi et soir',
        onClick: () => setEcran('rapports'),
      }]),
    ];
    const enRetard = !modeTest && peutHabiller ? (etatJour?.a_cloturer || []) : [];
    return (
      <>
        {bandeauTest}
        {proposerVider && peutActiverTest && !modeTest && (
          <div style={st.propositionVider} data-cadre="" data-caisse-vider-tests="">
            <p style={st.propositionTexte}>
              Les tickets de test restent en base jusqu'à leur purge automatique, sous 24 heures. Vous pouvez les vider maintenant.
            </p>
            <span style={st.propositionActions}>
              <Btn variant="primary" disabled={testEnCours} onClick={viderLesTests} style={st.btn44}>Vider les tickets de test</Btn>
              <Btn variant="ghost" onClick={() => setProposerVider(false)} style={st.btn44}>Plus tard</Btn>
            </span>
          </div>
        )}
        {erreurTickets && (
          <div style={st.erreur}>
            <p style={{ margin: 0 }}>{erreurTickets}</p>
            <Btn variant="primary" onClick={rechargerTickets} style={st.btn44}>Réessayer</Btn>
          </div>
        )}
        {enRetard.length > 0 && (
          <div style={st.propositionVider} data-cadre="" data-caisse-non-cloturee="">
            <p style={st.propositionTexte}>
              <span>La caisse du</span> <span style={st.num}>{dateCH(enRetard[0].jour)}</span> <span>n'est pas clôturée.</span>
              {enRetard.length > 1 && <>{' '}<span style={st.num}>{enRetard.length}</span> <span>jours attendent leur clôture.</span></>}
            </p>
            <span style={st.propositionActions}>
              <Btn variant="primary" onClick={() => setEcran('cloture')} style={st.btn44}>Clôturer</Btn>
            </span>
          </div>
        )}
        {/* Hors mode test : un poste en essai ne s'abonne à rien. */}
        {!modeTest && <InvitationAvisPret user={user} etablissement={etablissement} />}
        {/* Direction Galet : repères et carte « Tables ouvertes » autour des
            tuiles, par largeur de conteneur (caisse.css). Ils redisent ce que
            l'accueil lit déjà ; au téléphone, ni l'un ni l'autre. */}
        <div className="caisse-page">
          <div className="caisse-grille">
            <div className="caisse-haut">
              <div className="caisse-tuiles"><AccueilModule tuiles={tuiles} /></div>
              {(tables.some((t) => t.actif !== false) || tickets.length > 0) && (
                <CarteTablesOuvertes resume={resumeService(tickets, tables, (t) => etatTicket(t, maintenant))} />
              )}
            </div>
            <ReperesCaisse
              ouverts={tickets.length}
              totalOuvert={tickets.reduce((s, t) => s + totalTicket(t), 0)}
              sansTicket={sansTicket.length}
              etatJour={etatJour}
              montrerSansTicket={!modeTest}
              montrerCloture={!modeTest && peutHabiller}
            />
          </div>
        </div>
        {(peutHabiller || (peutActiverTest && !modeTest)) && (
          <div style={st.reglagesAccueil}>
            {peutHabiller && (
              <Btn variant="ghost" onClick={() => ouvrirReglages()} style={st.btn44}>
                <SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
                <span>Réglages de la caisse</span>
              </Btn>
            )}
            {peutActiverTest && !modeTest && (
              <Btn variant="ghost" disabled={testEnCours} onClick={entrerModeTest} style={st.btn44}>
                <FlaskConical size={18} strokeWidth={1.75} aria-hidden="true" />
                <span>Mode test</span>
              </Btn>
            )}
          </div>
        )}
      </>
    );
  }

  // ── Plan de salle (ouvrir ou déplacer) ──
  if (ecran === 'tables') {
    const deplacement = modeTables === 'deplacer';
    return (
      <>
      {bandeauTest}
      <EcranTache
        titre={deplacement ? 'Choisir la nouvelle table' : 'Prendre une table'}
        etat={deplacement ? null : 'Touchez une table pour ouvrir son ticket'}
        onRetour={() => {
          if (deplacement) { setModeTables('ouvrir'); setEcran('ticket'); return; }
          retourAccueil();
        }}
      >
        {tables.some((t) => t.actif !== false) ? (
          <PlanTables salles={salles} tables={tables} ticketsParTable={ticketsParTable} noms={nomsTables} onTapTable={tapTable} />
        ) : (
          <div style={st.videBloc}>
            <p style={st.vide}>Aucune table dans le plan de salle. Dessinez la salle dans Réservations, ou vendez sans table.</p>
            <Btn variant="primary" onClick={venteDirecte} style={st.btn44}>Vente directe</Btn>
          </div>
        )}
        {quiTable && !deplacement && (
          <QuiEstLa
            key={quiTable.id}
            table={quiTable}
            etablissementId={etabId}
            reservations={reservationsAttachables(reservations, { jour, tableId: quiTable.id, tickets })}
            enCours={ouverture}
            onChoisir={ouvrirPour}
            onClose={() => setQuiTable(null)}
          />
        )}
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

  // ── Rapports (v8) ──
  if (ecran === 'rapports' && !modeTest && peutHabiller) {
    return (
      <React.Suspense fallback={<p style={st.vide}>Chargement…</p>}>
        <Rapports etablissement={etablissement} reglages={reglages} onRetour={retourAccueil} />
      </React.Suspense>
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
            return (
              <button key={t.id} type="button" style={st.ticketRow} onClick={() => { setTicketId(t.id); setEcran('ticket'); }}>
                <span style={st.ticketTable}>
                  {nom ? <span data-no-translate>{nom}</span> : <span>Direct</span>}
                </span>
                <span style={st.ticketInfos}>
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

  // ── Le ticket ──
  if (ecran === 'ticket' && ticket) {
    const nom = nomTable(ticket);
    const autresMemeTable = tickets.filter((t) => t.id !== ticket.id && t.table_id && t.table_id === ticket.table_id);
    return (
      <>
      {bandeauTest}
      <EcranTache
        titre={nom ? <><span>Table</span> <span data-no-translate>{nom}</span></> : 'Vente directe'}
        etat={<span><span>Ouvert à</span> <span>{zurichDateHeure(ticket.created_at).heure}</span></span>}
        onRetour={retourAccueil}
      >
        {/* key : un autre ticket remonte l'écran, le mode revient à « En direct ». */}
        <TicketEcran
          key={ticket.id}
          ticket={ticket}
          articles={articles}
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
          onOuvrirReglages={() => ouvrirReglages(true)}
          ticketsMemeTable={autresMemeTable}
          onDeplacer={() => { setModeTables('deplacer'); setEcran('tables'); }}
          onFusionne={rechargerTickets}
          onClos={() => { rechargerTickets(); rechargerReservations(); rechargerJournee(); retourAccueil(); }}
          reload={rechargerTickets}
          modeTest={modeTest}
          onQuittance={quittance}
          terminaux={terminaux}
          role={user?.role}
        />
      </EcranTache>
      </>
    );
  }

  // Écran sans objet (ticket disparu, ou « Réservations sans ticket » repris
  // par un poste passé en mode test) : le bandeau reste, l'accueil revient.
  return bandeauTest;
}

const st = {
  erreur: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12, color: 'var(--text)' },
  vide: { color: 'var(--text3)', fontSize: 'var(--t2)' },
  videBloc: { display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', marginTop: 12 },
  btn44: { minHeight: 44, flexShrink: 0 },
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
  reglagesAccueil: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 },
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
