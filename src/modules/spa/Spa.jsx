import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Cake, Clock, Gift, Leaf, Mail, Plus, UserRound, Users,
} from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { canManageModule } from '../../data/demoData.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { zurichNowMinutes, zurichToday } from '../../utils/zurichTime.js';
import AgendaSpa from './AgendaSpa.jsx';
import BonForm from './BonForm.jsx';
import BonsSpa from './BonsSpa.jsx';
import ClientFiche from './ClientFiche.jsx';
import ClientForm from './ClientForm.jsx';
import ClientsSpa from './ClientsSpa.jsx';
import MailingSpa from './MailingSpa.jsx';
import RendezVousDetail from './RendezVousDetail.jsx';
import ReservationForm from './ReservationForm.jsx';
import SeanceForm from './SeanceForm.jsx';
import SoinsSpa from './SoinsSpa.jsx';
import {
  clientVersDB, mapBon, mapClient, mapReservation, mapSeance, mapSoin,
  plancherReservations, reservationVersDB, seanceVersDB, useSpaParametres, useSpaTable,
} from './spaData.js';
import {
  OngletsSpa, dateLongue, dureeLisible, jourComplet, minutes, nomClient,
  prochainAnniversaire, st,
} from './spaUi.jsx';
import './spa.css';

// ─────────────────────────────────────────────────────────────────────────────
// SPA - réservations, fiches clients et suivi des séances, bons cadeaux,
// e-mails d'anniversaire et d'actualités.
//
// Ambiance propre au module (spa.css) : « onsen contemporain », pour Mizukii
// (mizu = l'eau). Un bandeau d'accueil donne la journée d'un coup d'œil, le
// reste vit dans cinq onglets.
//
// Module « à activer » (moduleConfig.optInModuleKeys) : il n'apparaît que dans
// les établissements où le consultant l'a coché dans Paramètres.
//
// Droits :
//   • toute l'équipe ayant le module lit l'agenda et les fiches, prend les
//     rendez-vous et rédige les comptes rendus (droit « gérer » du module,
//     ouvert à tous les rôles par défaut) ;
//   • carte des soins et bons offerts : direction et réception (RLS) ;
//   • suppression d'une fiche (droit à l'effacement) : consultant et patron ;
//   • e-mails (anniversaires, actualités, historique) : consultant et patron.
// ─────────────────────────────────────────────────────────────────────────────

const ROLES_DIRECTION = ['consultant', 'patron'];
const ROLES_CATALOGUE = ['consultant', 'patron', 'hote'];
const ACTIF = (r) => !['annulee', 'absent'].includes(r.statut);

// Heure de Zurich, relue chaque minute (prochain soin, ligne « maintenant »).
function useMaintenant() {
  const [m, setM] = useState(() => zurichNowMinutes());
  useEffect(() => {
    const id = setInterval(() => setM(zurichNowMinutes()), 60000);
    return () => clearInterval(id);
  }, []);
  return m;
}

export default function Spa({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const role = user?.role;
  const peutGerer = canManageModule(role, 'spa');
  const direction = ROLES_DIRECTION.includes(role);
  const peutCatalogue = ROLES_CATALOGUE.includes(role);
  const aujourdhui = zurichToday();
  const maintenant = useMaintenant();
  const mobile = useIsMobile();

  const [onglet, setOnglet] = useState('agenda');
  const [filtreClients, setFiltreClients] = useState('tous');
  const [date, setDate] = useState(aujourdhui);
  const [depuis, setDepuis] = useState(plancherReservations);

  const [ficheId, setFicheId] = useState(null);
  const [clientForm, setClientForm] = useState(null); // { client? }
  const [rdvForm, setRdvForm] = useState(null); // { reservation?, date?, heure?, praticien?, clientInitial? }
  const [rdvOuvertId, setRdvOuvertId] = useState(null);
  const [finSeance, setFinSeance] = useState(null); // reservation
  const [bonPour, setBonPour] = useState(null); // client

  const clients = useSpaTable('spa_clients', etabId, { map: mapClient, limit: 10000 });
  const soins = useSpaTable('spa_soins', etabId, { map: mapSoin });
  const reservations = useSpaTable('spa_reservations', etabId, {
    map: mapReservation, filtres: [['date_rdv', 'gte', depuis]], cle: depuis, order: [['date_rdv', true]], limit: 10000,
  });
  const seances = useSpaTable('spa_seances', etabId, { map: mapSeance, limit: 10000 });
  const bons = useSpaTable('spa_bons', etabId, { map: mapBon, order: [['created_at', false]], limit: 3000 });
  const { parametres } = useSpaParametres(etabId);

  // L'agenda remonte avant la fenêtre chargée : on l'élargit.
  useEffect(() => { if (date < depuis) setDepuis(date); }, [date, depuis]);

  const clientsParId = useMemo(() => new Map(clients.rows.map((c) => [c.id, c])), [clients.rows]);

  // Par client : nombre de séances, dernière visite, soin le plus reçu.
  const statsClients = useMemo(() => {
    const m = new Map();
    for (const s of seances.rows) {
      const e = m.get(s.clientId) || { nb: 0, derniere: '', soins: new Map() };
      e.nb += 1;
      if (s.dateSeance > e.derniere) e.derniere = s.dateSeance;
      if (s.soin) e.soins.set(s.soin, (e.soins.get(s.soin) || 0) + 1);
      m.set(s.clientId, e);
    }
    for (const e of m.values()) {
      e.soinPrefere = [...e.soins.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    }
    return m;
  }, [seances.rows]);

  const seanceParRdv = useMemo(
    () => new Map(seances.rows.filter((s) => s.reservationId).map((s) => [s.reservationId, s])),
    [seances.rows]
  );
  const praticiens = useMemo(
    () => [...new Set([...reservations.rows.map((r) => r.praticien), ...seances.rows.map((s) => s.praticien)].filter(Boolean))].sort(),
    [reservations.rows, seances.rows]
  );
  const cabines = useMemo(() => [...new Set(reservations.rows.map((r) => r.cabine).filter(Boolean))].sort(), [reservations.rows]);

  // ── La journée d'un coup d'œil ──
  const journee = useMemo(() => {
    const duJour = reservations.rows
      .filter((r) => r.dateRdv === aujourdhui && ACTIF(r))
      .sort((a, b) => a.heureDebut.localeCompare(b.heureDebut));
    const prochain = duJour.find((r) => r.statut !== 'terminee' && minutes(r.heureDebut) + r.dureeMin > maintenant) || null;
    const anniversaires = clients.rows.filter((c) => {
      if (c.archive) return false;
      const a = prochainAnniversaire(c.dateNaissance, aujourdhui);
      return a && a.jours <= 7;
    }).length;
    const bonsValables = bons.rows.filter((b) => !b.utiliseAt && (!b.valableJusqu || b.valableJusqu >= aujourdhui)).length;
    return {
      nb: duJour.length,
      minutes: duJour.reduce((s, r) => s + r.dureeMin, 0),
      prochain,
      anniversaires,
      bonsValables,
    };
  }, [reservations.rows, clients.rows, bons.rows, aujourdhui, maintenant]);

  const fiche = ficheId ? clientsParId.get(ficheId) || null : null;
  const rdvOuvert = rdvOuvertId ? reservations.rows.find((r) => r.id === rdvOuvertId) || null : null;
  const absent = [clients, soins, reservations].some((t) => t.status === 'absent');

  // ── Clients ──
  const sauverClient = useCallback(async (form) => {
    const cible = clientForm?.client;
    return cible ? clients.modifier(cible.id, clientVersDB(form)) : clients.inserer(clientVersDB(form));
  }, [clientForm, clients]);

  const creerClientRapide = useCallback((c) => clients.inserer(clientVersDB(c)), [clients]);

  async function archiver(client, archive) {
    const { error } = await clients.modifier(client.id, { archive });
    if (error) { notify(error, 'error'); return; }
    notify(archive ? 'Fiche archivée : elle reste dans le filtre « Archivés ».' : 'Fiche réactivée.', 'success');
  }

  async function supprimerClient(client) {
    const ok = window.confirm(
      `Supprimer définitivement la fiche de ${nomClient(client)} ?\n\n`
      + 'Ses rendez-vous, comptes rendus de séance, bons cadeaux et e-mails envoyés seront effacés avec elle '
      + '(demande d\'effacement du client). Pour simplement la ranger, utilise « Archiver ».'
    );
    if (!ok) return;
    const { error } = await clients.supprimer(client.id);
    if (error) { notify(error, 'error'); return; }
    notify('Fiche client supprimée.', 'success');
    setFicheId(null);
    reservations.reload();
    seances.reload();
    bons.reload();
  }

  // ── Rendez-vous ──
  async function sauverRdv(form) {
    const cible = rdvForm?.reservation;
    if (cible) return reservations.modifier(cible.id, reservationVersDB(form));
    const res = await reservations.inserer({ ...reservationVersDB(form), statut: 'prevue' });
    if (!res.error && form.dateRdv) setDate(form.dateRdv);
    return res;
  }

  async function changerStatut(r, statut) {
    if (statut === 'annulee' && !window.confirm(`Annuler le rendez-vous de ${nomClient(clientsParId.get(r.clientId))} le ${dateLongue(r.dateRdv)} à ${r.heureDebut} ?`)) return;
    const { error } = await reservations.modifier(r.id, { statut });
    if (error) { notify(error, 'error'); return; }
    const messages = {
      confirmee: 'Rendez-vous confirmé.', annulee: 'Rendez-vous annulé.', absent: 'Client noté absent.', prevue: 'Rendez-vous rétabli.',
    };
    if (messages[statut]) notify(messages[statut], 'success');
    if (statut === 'annulee' || statut === 'absent') setRdvOuvertId(null);
  }

  // Compte rendu de fin de séance : un par rendez-vous (index unique), puis le
  // rendez-vous passe à « terminé ».
  async function sauverFinSeance(s) {
    const existante = seanceParRdv.get(finSeance.id);
    const res = existante
      ? await seances.modifier(existante.id, seanceVersDB(s))
      : await seances.inserer(seanceVersDB(s));
    if (res.error) return res;
    if (finSeance.statut !== 'terminee') {
      const { error } = await reservations.modifier(finSeance.id, { statut: 'terminee' });
      if (error) return { error: `Compte rendu enregistré, mais le rendez-vous n'a pas pu passer à « terminé » : ${error}` };
    }
    setRdvOuvertId(null);
    return res;
  }

  const reserver = (extra = {}) => setRdvForm({ date: onglet === 'agenda' ? date : aujourdhui, ...extra });

  if (!etabId) {
    return (
      <section className="spa" style={st.page}>
        <div style={st.encartAttention}>Aucun établissement sélectionné.</div>
      </section>
    );
  }

  const onglets = [
    { id: 'agenda', label: 'Agenda', icone: CalendarDays },
    { id: 'clients', label: 'Clients', icone: Users },
    { id: 'bons', label: 'Bons cadeaux', icone: Gift },
    { id: 'soins', label: 'Carte des soins', icone: Leaf },
    ...(direction ? [{ id: 'emails', label: 'E-mails', icone: Mail }] : []),
  ];

  const prochain = journee.prochain;
  const clientProchain = prochain ? clientsParId.get(prochain.clientId) : null;
  const enCours = prochain && minutes(prochain.heureDebut) <= maintenant;

  return (
    <section className="spa" style={{ ...st.page, ...(mobile ? { padding: '16px 16px 32px' } : null) }}>
      {/* ── Accueil : la journée d'un coup d'œil ── */}
      <header style={{ ...s.hero, ...(mobile ? { padding: '20px 18px 18px' } : null) }} className="spa-apparition">
        <Onde />
        <div style={s.heroHaut}>
          <div style={{ minWidth: 0 }}>
            <div style={s.heroSurTitre}>
              <span data-no-translate>{etablissement?.nom || 'Spa'}</span>
            </div>
            <h1 style={{ ...s.heroTitre, fontSize: mobile ? 28 : 34 }}>{maintenant < 18 * 60 ? 'Bonjour' : 'Bonsoir'}</h1>
            <div style={s.heroDate}>{capitaliser(jourComplet(aujourdhui))}</div>
          </div>
          {peutGerer && !absent && (
            <div style={{ ...s.heroActions, ...(mobile ? { width: '100%', flexWrap: 'nowrap' } : null) }}>
              <button type="button" onClick={() => reserver()} style={{ ...st.principal, ...(mobile ? s.boutonMobile : null) }}>
                <Plus size={18} strokeWidth={2} aria-hidden="true" /> {mobile ? 'Réserver' : 'Réserver un soin'}
              </button>
              <button type="button" onClick={() => setClientForm({})} style={{ ...st.secondaire, ...(mobile ? s.boutonMobile : null) }}>
                <UserRound size={17} strokeWidth={1.8} aria-hidden="true" /> Nouveau client
              </button>
            </div>
          )}
        </div>

        {/* Téléphone : 2 × 2 tuiles sans ligne de détail, pour que l'agenda
            reste visible sans défiler. */}
        <div style={{ ...s.stats, ...(mobile ? s.statsMobile : null) }}>
          <Stat
            icone={CalendarDays}
            valeur={journee.nb}
            label={journee.nb > 1 ? 'soins aujourd\'hui' : 'soin aujourd\'hui'}
            detail={journee.minutes ? `${dureeLisible(journee.minutes)} en cabine` : 'Journée libre'}
            compact={mobile}
            onClick={() => { setOnglet('agenda'); setDate(aujourdhui); }}
          />
          <Stat
            icone={Clock}
            valeur={prochain ? prochain.heureDebut : null}
            label={prochain ? (enCours ? 'En cours' : 'Prochain soin') : 'Plus de soin aujourd\'hui'}
            detail={prochain ? `${nomClient(clientProchain)}, ${prochain.soinLibelle || 'soin'}` : 'Bonne fin de journée'}
            detailBrut
            compact={mobile}
            onClick={prochain ? () => setRdvOuvertId(prochain.id) : undefined}
          />
          <Stat
            icone={Cake}
            ton="kin"
            valeur={journee.anniversaires}
            label={journee.anniversaires > 1 ? 'anniversaires' : 'anniversaire'}
            detail="dans les 7 prochains jours"
            compact={mobile}
            onClick={() => { setFiltreClients('anniversaires'); setOnglet('clients'); }}
          />
          <Stat
            icone={Gift}
            ton="kin"
            valeur={journee.bonsValables}
            label={journee.bonsValables > 1 ? 'bons valables' : 'bon valable'}
            detail="à utiliser en cabine"
            compact={mobile}
            onClick={() => setOnglet('bons')}
          />
        </div>
      </header>

      <div style={{ margin: '18px 0 20px', display: 'flex' }}>
        <OngletsSpa onglets={onglets} actif={onglet} onChange={setOnglet} />
      </div>

      {absent && (
        <div style={{ ...st.encartAttention, marginBottom: 14 }}>
          Le module Spa est en cours d'activation : sa base de données n'est pas encore en place.
        </div>
      )}

      {!absent && onglet === 'agenda' && (
        <AgendaSpa
          date={date}
          setDate={setDate}
          aujourdhui={aujourdhui}
          maintenant={maintenant}
          reservations={reservations.rows}
          clientsParId={clientsParId}
          praticiens={praticiens}
          status={reservations.status}
          peutCreer={peutGerer}
          onNouveau={(extra) => setRdvForm({ date, ...extra })}
          onOuvrir={(r) => setRdvOuvertId(r.id)}
        />
      )}
      {!absent && onglet === 'clients' && (
        <ClientsSpa
          clients={clients.rows}
          status={clients.status}
          statsClients={statsClients}
          aujourdhui={aujourdhui}
          filtre={filtreClients}
          setFiltre={setFiltreClients}
          onOuvrir={(c) => setFicheId(c.id)}
          onNouveau={peutGerer ? () => setClientForm({}) : null}
        />
      )}
      {!absent && onglet === 'bons' && (
        <BonsSpa
          bons={bons.rows}
          status={bons.status}
          clientsParId={clientsParId}
          aujourdhui={aujourdhui}
          onModifier={bons.modifier}
          onOuvrirClient={(c) => setFicheId(c.id)}
        />
      )}
      {!absent && onglet === 'soins' && (
        <SoinsSpa
          soins={soins.rows}
          status={soins.status}
          peutGerer={peutCatalogue}
          onInserer={soins.inserer}
          onModifier={soins.modifier}
          onSupprimer={soins.supprimer}
        />
      )}
      {!absent && onglet === 'emails' && direction && (
        <MailingSpa etablissement={etablissement} clients={clients.rows} aujourdhui={aujourdhui} />
      )}

      {/* ── Fenêtres ── */}
      {rdvOuvert && !rdvForm && !finSeance && (
        <RendezVousDetail
          reservation={rdvOuvert}
          client={clientsParId.get(rdvOuvert.clientId)}
          seanceExiste={seanceParRdv.has(rdvOuvert.id)}
          peutModifier={peutGerer}
          aujourdhui={aujourdhui}
          onStatut={changerStatut}
          onTerminer={(r) => setFinSeance(r)}
          onModifier={(r) => setRdvForm({ reservation: r })}
          onFicheClient={(c) => { setRdvOuvertId(null); setFicheId(c.id); }}
          onClose={() => setRdvOuvertId(null)}
        />
      )}

      {finSeance && clientsParId.get(finSeance.clientId) && (
        <SeanceForm
          client={clientsParId.get(finSeance.clientId)}
          reservation={finSeance}
          seance={seanceParRdv.get(finSeance.id) || null}
          onSave={sauverFinSeance}
          onClose={() => setFinSeance(null)}
        />
      )}

      {fiche && !clientForm && !rdvForm && !bonPour && (
        <ClientFiche
          client={fiche}
          etablissementId={etabId}
          reservations={reservations.rows}
          stats={statsClients.get(fiche.id)}
          peutGerer={peutGerer}
          peutSupprimer={direction}
          peutOffrir={peutCatalogue}
          onModifier={(c) => setClientForm({ client: c })}
          onReserver={(c) => setRdvForm({ clientInitial: c, date: aujourdhui })}
          onOffrirBon={(c) => setBonPour(c)}
          onArchiver={archiver}
          onSupprimer={supprimerClient}
          onClose={() => setFicheId(null)}
        />
      )}

      {clientForm && (
        <ClientForm
          client={clientForm.client || null}
          onSave={sauverClient}
          onClose={(cree) => {
            setClientForm(null);
            if (cree && !clientForm.client) setFicheId(cree.id);
          }}
        />
      )}

      {rdvForm && peutGerer && (
        <ReservationForm
          reservation={rdvForm.reservation || null}
          dateInitiale={rdvForm.date || null}
          heureInitiale={rdvForm.heure || null}
          praticienInitial={rdvForm.praticien || ''}
          clientInitial={rdvForm.clientInitial || null}
          aujourdhui={aujourdhui}
          clients={clients.rows}
          soins={soins.rows}
          reservations={reservations.rows}
          praticiens={praticiens}
          cabines={cabines}
          onSave={sauverRdv}
          onCreerClient={creerClientRapide}
          onClose={() => setRdvForm(null)}
        />
      )}

      {bonPour && (
        <BonForm
          client={bonPour}
          etablissementId={etabId}
          valeurDefaut={parametres.bonValeur}
          validiteDefaut={parametres.bonValiditeJours}
          onEnvoye={() => bons.reload()}
          onClose={() => setBonPour(null)}
        />
      )}
    </section>
  );
}

const capitaliser = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

// compact (téléphone) : icône plus petite, valeur au-dessus du libellé, sans
// ligne de détail.
function Stat({ icone: Icone, valeur, label, detail, detailBrut = false, ton = 'mizu', onClick, compact = false }) {
  const couleurs = ton === 'kin'
    ? ['var(--spa-kin-soft)', 'var(--spa-kin)']
    : ['var(--spa-mizu-soft)', 'var(--spa-mizu)'];
  const contenu = (
    <>
      <span aria-hidden="true" style={{ ...s.statIcone, ...(compact ? s.statIconeCompacte : null), background: couleurs[0], color: couleurs[1] }}>
        <Icone size={compact ? 16 : 18} strokeWidth={1.8} />
      </span>
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', alignItems: compact ? 'flex-start' : 'baseline', gap: compact ? 0 : 8, minWidth: 0 }}>
          {valeur !== null && <span style={{ ...s.statValeur, fontSize: compact ? 20 : 24 }} data-no-translate>{valeur}</span>}
          <span style={{ ...s.statLabel, fontSize: compact ? 12 : 13 }}>{label}</span>
        </span>
        {!compact && <span style={s.statDetail} data-no-translate={detailBrut ? '' : undefined}>{detail}</span>}
      </span>
    </>
  );
  const style = { ...s.stat, ...(compact ? s.statCompacte : null) };
  if (!onClick) return <div style={style}>{contenu}</div>;
  return (
    <button type="button" onClick={onClick} className="spa-carte-action" style={{ ...style, cursor: 'pointer', textAlign: 'left' }}>
      {contenu}
    </button>
  );
}

// Ondes concentriques : l'eau de Mizukii, en filigrane du bandeau.
function Onde() {
  return (
    <svg aria-hidden="true" viewBox="0 0 240 240" style={s.onde}>
      {[36, 64, 92, 120].map((r) => (
        <circle key={r} cx="200" cy="40" r={r} fill="none" stroke="var(--spa-mizu)" strokeOpacity={0.14 - r / 2000} strokeWidth="1.2" />
      ))}
      <circle className="spa-onde" cx="200" cy="40" r="40" fill="none" stroke="var(--spa-mizu)" strokeOpacity="0.25" strokeWidth="1" />
    </svg>
  );
}

const s = {
  hero: {
    position: 'relative', overflow: 'hidden', borderRadius: 'var(--spa-r-lg)',
    background: 'var(--spa-hero)', border: '1px solid var(--spa-line)',
    padding: '26px 26px 22px', boxShadow: 'var(--spa-shadow)',
  },
  onde: { position: 'absolute', top: -20, right: -20, width: 280, height: 280, pointerEvents: 'none' },
  heroHaut: {
    position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 16,
    alignItems: 'flex-end', justifyContent: 'space-between',
  },
  heroSurTitre: {
    fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--spa-mizu)',
  },
  heroTitre: {
    margin: '6px 0 2px', fontFamily: 'var(--font-serif)', fontWeight: 400,
    fontSize: 34, lineHeight: 1.1, color: 'var(--spa-ink)',
  },
  heroDate: { fontSize: 15, color: 'var(--spa-ink2)' },
  heroActions: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  stats: {
    position: 'relative', marginTop: 22,
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10,
  },
  stat: {
    display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, minHeight: 64,
    padding: '12px 14px', borderRadius: 'var(--spa-r)', fontFamily: 'var(--font)', color: 'var(--spa-ink)',
    background: 'var(--spa-surface)', border: '1px solid var(--spa-line)',
  },
  statsMobile: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 16 },
  statCompacte: { minHeight: 0, padding: '10px 10px', gap: 10, alignItems: 'flex-start' },
  statIconeCompacte: { width: 32, height: 32, borderRadius: 16 },
  boutonMobile: { flex: '1 1 0', minWidth: 0, padding: '10px 12px' },
  statIcone: {
    width: 40, height: 40, borderRadius: 20, flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  statValeur: { fontFamily: 'var(--font-serif)', fontSize: 24, lineHeight: 1, color: 'var(--spa-ink)' },
  statLabel: { fontSize: 13, fontWeight: 600, color: 'var(--spa-ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  statDetail: { fontSize: 12, color: 'var(--spa-ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
};
