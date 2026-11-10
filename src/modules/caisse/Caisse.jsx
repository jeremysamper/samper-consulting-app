import React from 'react';
import { LayoutGrid, Zap, ReceiptText } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { useEcranModule, ECRAN_ACCUEIL } from '../../components/parcours/useEcranModule.js';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { dbService } from '../../services/dbService.js';
import { usePlanSalle } from '../../hooks/usePlanSalle.js';
import { zurichDateHeure } from '../../utils/zurichTime.js';
import * as caisse from '../../services/caisseService.js';
import PlanTables from './PlanTables.jsx';
import TicketEcran from './TicketEcran.jsx';

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
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const totalTicket = (t) => (t.lignes || []).reduce((s, l) => s + Number(l.quantite) * Number(l.prix_unitaire), 0);

export default function Caisse({ user, etablissement, legacyVersion }) {
  const etabId = etablissement?.id;
  const plan = usePlanSalle(etabId);
  const { ecran, setEcran, retourAccueil } = useEcranModule('caisse', {
    repris: ['tables', 'tickets'],
  });

  const [tickets, setTickets] = React.useState([]);
  const [erreurTickets, setErreurTickets] = React.useState(null);
  const [tables, setTables] = React.useState([]);
  const [salles, setSalles] = React.useState([]);
  const [articles, setArticles] = React.useState([]);
  // Habillage des boutons produits (v3) : plat_id -> { nom_court, couleur, picto }.
  const [boutons, setBoutons] = React.useState({});
  const peutHabiller = ['consultant', 'patron', 'resp_cuisine'].includes(user?.role);
  const rechargerBoutons = React.useCallback(async () => {
    if (!etabId) return;
    const { data } = await caisse.listBoutons(etabId);
    setBoutons(data || {});
  }, [etabId]);
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
      const [plats, cartes] = await Promise.all([
        db.listPlats(etabId),
        db.listCartes(etabId),
      ]);
      if (!vivant) return;
      const cartesActives = new Set((cartes || []).filter((c) => !c.archive && !c.masquee).map((c) => c.id));
      const actifs = (plats || []).filter((p) => p.actif !== false);
      const surCarte = actifs.filter((p) => (p.carteIds || []).some((id) => cartesActives.has(id)));
      setArticles(surCarte.length ? surCarte : actifs);
    })();
    return () => { vivant = false; };
  }, [etabId, plan, legacyVersion]);

  React.useEffect(() => { rechargerTickets(); }, [rechargerTickets]);
  React.useEffect(() => { rechargerBoutons(); }, [rechargerBoutons, legacyVersion]);

  // Realtime : un autre iPad qui vend, la direction qui annule.
  React.useEffect(() => {
    const rt = dbService.getRealtime();
    if (!rt?.subscribeReload || !etabId) return undefined;
    return rt.subscribeReload(['caisse_tickets', 'caisse_lignes'], rechargerTickets);
  }, [etabId, rechargerTickets]);

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
    const { data, error } = await caisse.creerTicket(etabId, table.id);
    if (error) { notify(error, 'error'); return; }
    await rechargerTickets();
    setTicketId(data.id);
    setEcran('ticket');
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
          ]}
        />
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
          <PlanTables salles={salles} tables={tables} ticketsParTable={ticketsParTable} onTapTable={tapTable} />
        ) : (
          <div style={st.videBloc}>
            <p style={st.vide}>Aucune table dans le plan de salle. Dessinez la salle dans Réservations, ou vendez sans table.</p>
            <Btn variant="primary" onClick={venteDirecte} style={st.btn44}>Vente directe</Btn>
          </div>
        )}
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
            return (
              <button key={t.id} type="button" data-cadre="" style={st.ticketRow} onClick={() => { setTicketId(t.id); setEcran('ticket'); }}>
                <span style={st.ticketTable}>
                  {nom ? <span data-no-translate>{nom}</span> : <span>Direct</span>}
                </span>
                <span style={st.ticketInfos}>
                  <span>{(t.lignes || []).length}</span> <span>articles</span>
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
        <TicketEcran
          ticket={ticket}
          articles={articles}
          boutons={boutons}
          peutHabiller={peutHabiller}
          onBoutonsChange={rechargerBoutons}
          ticketsMemeTable={autresMemeTable}
          onDeplacer={() => { setModeTables('deplacer'); setEcran('tables'); }}
          onFusionne={rechargerTickets}
          onClos={() => { rechargerTickets(); retourAccueil(); }}
          reload={rechargerTickets}
        />
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
  ticketInfos: { color: 'var(--text2)', fontSize: 13, flex: 1 },
  ticketHeure: { color: 'var(--text2)', fontSize: 13, fontFamily: 'var(--font-num)' },
  ticketTotal: { fontFamily: 'var(--font-num)', fontWeight: 600 },
};
