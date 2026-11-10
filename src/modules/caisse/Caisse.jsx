import React from 'react';
import { CalendarClock, ChevronsRight, LayoutGrid, Zap, ReceiptText, SlidersHorizontal } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { useEcranModule, ECRAN_ACCUEIL } from '../../components/parcours/useEcranModule.js';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { dbService } from '../../services/dbService.js';
import { usePlanSalle } from '../../hooks/usePlanSalle.js';
import { zurichAjouterJours, zurichDateHeure, zurichNowMinutes, zurichToday } from '../../utils/zurichTime.js';
import * as caisse from '../../services/caisseService.js';
import PlanTables, { etatTicket } from './PlanTables.jsx';
import TicketEcran from './TicketEcran.jsx';
import ReglagesCaisse from './ReglagesCaisse.jsx';
import QuiEstLa from './QuiEstLa.jsx';
import { heureCourte, minutesDe, nomsParTable, reservationsAttachables, reservationsSansTicket } from './clients.js';
import { cartesEtArticlesEnVente, fusionnerReglages } from './reglages.js';
import { useMaintenant } from './mesures.js';

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
// ─────────────────────────────────────────────────────────────────────────────

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
  const peutHabiller = ['consultant', 'patron', 'resp_cuisine'].includes(user?.role);
  const rechargerBoutons = React.useCallback(async () => {
    if (!etabId) return;
    const { data } = await caisse.listBoutons(etabId);
    setBoutons(data || {});
  }, [etabId]);
  // Catégories et réglages de la maison (v4). L'établissement change : on
  // repart des défauts, jamais des réglages de la maison d'avant.
  const [categories, setCategories] = React.useState([]);
  const [config, setConfig] = React.useState({});
  const [reglagesOuverts, setReglagesOuverts] = React.useState(false);
  const reglages = React.useMemo(() => fusionnerReglages(config), [config]);
  React.useEffect(() => {
    setCategories([]); setConfig({}); setReglagesOuverts(false);
    setReservations([]); setQuiTable(null); setPlats([]); setCartesLues([]);
  }, [etabId]);
  // Cartes en vente et articles vendables : fermé par défaut (une carte
  // archivée ou cachée ne vend jamais), sans réglage tout vend comme avant.
  const { cartesActives, cartesEnVente, articles } = React.useMemo(
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
  const [ticketId, setTicketId] = React.useState(null);
  // 'ouvrir' : un tap sur une table ouvre ou crée son ticket.
  // 'deplacer' : un tap sur une table y déplace le ticket courant.
  const [modeTables, setModeTables] = React.useState('ouvrir');

  const rechargerTickets = React.useCallback(async () => {
    if (!etabId) return;
    const { data, error } = await caisse.listTicketsOuverts(etabId);
    if (error) { setErreurTickets(error); return; }
    setErreurTickets(null);
    setTickets(data);
  }, [etabId]);

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
      const { data, error } = await caisse.ouvrirTicket({
        etablissementId: etabId, tableId: quiTable.id, ...choix,
      });
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

  // Réglages de la caisse : la feuille s'ouvre depuis l'accueil et depuis le
  // ticket, pour les trois rôles que la base laisse écrire.
  const feuilleReglages = reglagesOuverts && peutHabiller ? (
    <ReglagesCaisse
      etablissementId={etabId}
      articles={articles}
      boutons={boutons}
      categories={categories}
      cartes={cartesActives}
      config={config}
      onChange={rechargerGrille}
      onClose={() => setReglagesOuverts(false)}
    />
  ) : null;

  // ── Accueil à tuiles ──
  if (ecran === ECRAN_ACCUEIL) {
    return (
      <>
        {erreurTickets && (
          <div style={st.erreur}>
            <p style={{ margin: 0 }}>{erreurTickets}</p>
            <Btn variant="primary" onClick={rechargerTickets} style={st.btn44}>Réessayer</Btn>
          </div>
        )}
        <AccueilModule
          tuiles={[
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
            {
              id: 'sans_ticket',
              libelle: 'Réservations sans ticket',
              Icone: CalendarClock,
              etat: sansTicket.length
                ? <><span>{sansTicket.length}</span> <span>à vérifier : no-show ou arrivé ?</span></>
                : 'Aucune réservation en retard',
              onClick: () => setEcran('sans_ticket'),
            },
          ]}
        />
        {peutHabiller && (
          <div style={st.reglagesAccueil}>
            <Btn variant="ghost" onClick={() => setReglagesOuverts(true)} style={st.btn44}>
              <SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
              <span>Réglages de la caisse</span>
            </Btn>
          </div>
        )}
        {feuilleReglages}
      </>
    );
  }

  // ── Plan de salle (ouvrir ou déplacer) ──
  if (ecran === 'tables') {
    const deplacement = modeTables === 'deplacer';
    return (
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
    );
  }

  // ── Réservations sans ticket : no-show ou arrivé, un tap par ligne ──
  if (ecran === 'sans_ticket') {
    const maintenantMin = zurichNowMinutes();
    return (
      <EcranTache
        titre="Réservations sans ticket"
        etat={<span><span>Confirmées, attendues depuis plus de</span> <span style={st.num}>{reglages.delai_no_show_min}</span> <span>min, sans table ouverte</span></span>}
        onRetour={retourAccueil}
      >
        {!sansTicket.length && <p style={st.vide}>Aucune réservation en retard. Rien n'est marqué no-show sans vous.</p>}
        <div style={st.listeTickets}>
          {sansTicket.map((r) => {
            const retard = maintenantMin - minutesDe(r.heure_arrivee);
            const occupe = statutEnCours === r.id;
            return (
              <div key={r.id} data-cadre="" data-sans-ticket={r.id} style={st.sansTicketRang}>
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
      </EcranTache>
    );
  }

  // ── Tickets ouverts ──
  if (ecran === 'tickets') {
    return (
      <EcranTache titre="Tickets ouverts" onRetour={retourAccueil}>
        {!tickets.length && <p style={st.vide}>Aucun ticket ouvert.</p>}
        <div style={st.listeTickets}>
          {tickets.map((t) => {
            const nom = nomTable(t);
            const e = etatTicket(t, maintenant);
            return (
              <button key={t.id} type="button" data-cadre="" style={st.ticketRow} onClick={() => { setTicketId(t.id); setEcran('ticket'); }}>
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
                </span>
                <span style={st.ticketHeure}>{zurichDateHeure(t.created_at).heure}</span>
                <span style={st.ticketTotal}><span>{chf(totalTicket(t))}</span> <span>CHF</span></span>
              </button>
            );
          })}
        </div>
      </EcranTache>
    );
  }

  // ── Le ticket ──
  if (ecran === 'ticket' && ticket) {
    const nom = nomTable(ticket);
    const autresMemeTable = tickets.filter((t) => t.id !== ticket.id && t.table_id && t.table_id === ticket.table_id);
    return (
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
          onOuvrirReglages={() => setReglagesOuverts(true)}
          ticketsMemeTable={autresMemeTable}
          onDeplacer={() => { setModeTables('deplacer'); setEcran('tables'); }}
          onFusionne={rechargerTickets}
          onClos={() => { rechargerTickets(); rechargerReservations(); retourAccueil(); }}
          reload={rechargerTickets}
        />
        {feuilleReglages}
      </EcranTache>
    );
  }

  return null;
}

const st = {
  erreur: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12, color: 'var(--text)' },
  vide: { color: 'var(--text2)', fontSize: 14 },
  videBloc: { display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', marginTop: 12 },
  btn44: { minHeight: 44, flexShrink: 0 },
  listeTickets: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, maxWidth: 640 },
  ticketRow: {
    display: 'flex', alignItems: 'baseline', gap: 12, minHeight: 56, padding: '10px 14px',
    borderRadius: 'var(--r-lg)', background: 'var(--surface2)', color: 'var(--text)', border: 'none',
    cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 15, textAlign: 'left', width: '100%',
  },
  ticketTable: { fontWeight: 600, flexShrink: 0, minWidth: 70 },
  ticketInfos: { color: 'var(--text2)', fontSize: 13, flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  ticketSuivre: { display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text)', fontWeight: 600 },
  ticketClient: { color: 'var(--text)', fontWeight: 600, fontSize: 14, overflowWrap: 'anywhere' },
  ticketInfosLigne: { display: 'flex', flexWrap: 'wrap', gap: '2px 12px', color: 'var(--text2)', fontSize: 13 },
  // Une réservation sans ticket : son heure, son nom, et deux gestes.
  sansTicketRang: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, minHeight: 60, padding: '10px 14px',
    borderRadius: 'var(--r-lg)', background: 'var(--surface2)', color: 'var(--text)', minWidth: 0,
  },
  sansTicketInfos: { display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 200px', minWidth: 0 },
  sansTicketNom: { fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' },
  sansTicketActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  num: { fontFamily: 'var(--font-num)' },
  reglagesAccueil: { display: 'flex', marginTop: 16 },
  ticketHeure: { color: 'var(--text2)', fontSize: 13, fontFamily: 'var(--font-num)' },
  ticketTotal: { fontFamily: 'var(--font-num)', fontWeight: 600 },
};
