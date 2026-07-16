import React from 'react';
import { dbService } from '../../services/dbService.js';
import { notify } from '../../components/toast/index.js';
import { navigateToPage } from '../../services/navigationService.js';
import { pollKdsOrders } from '../pos/lib/posApi.js';
import { s, ticketStyle, faireRowStyle } from './Kds.styles.js';

// KDS - Passe cuisine branché Lightspeed.
//
// Flux : ce module invoque l'edge function pos-orders-poll toutes les ~15 s
// tant qu'il est affiché (ingestion getCheck -> kds_orders/kds_order_items),
// et écoute Supabase Realtime pour rafraîchir l'écran instantanément.
//
// Pensé pour le rush : lignes hautes (tap au doigt), bump = tap sur la ligne,
// actions optimistes (aucune attente réseau), zéro confirmation sauf si on
// termine une commande avec des plats pas encore faits. L'écran reste allumé
// (wake lock) tant que le KDS est ouvert.
//
// Écriture uniquement via RPC (kds_bump_item / kds_set_suite / kds_complete_order).
const POLL_MS = 15000;
const AGE_WARN_MIN = 7;
const AGE_LATE_MIN = 12;
const CONNECT_ROLES = ['consultant', 'patron'];

function ageOf(openedAt) {
  if (!openedAt) return 0;
  return (Date.now() - new Date(openedAt).getTime()) / 60000;
}
function ageBorder(min) {
  if (min >= AGE_LATE_MIN) return 'var(--danger-strong)';
  if (min >= AGE_WARN_MIN) return 'var(--warning-strong)';
  return 'var(--border)';
}
function ageColor(min) {
  if (min >= AGE_LATE_MIN) return 'var(--danger-strong)';
  if (min >= AGE_WARN_MIN) return 'var(--warning-strong)';
  return 'var(--text2)';
}
function elapsedLabel(openedAt) {
  if (!openedAt) return '';
  const sec = Math.max(0, Math.round((Date.now() - new Date(openedAt).getTime()) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function timeLabel(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

const Kds = ({ user, etablissement, isActive = true }) => {
  const etabId = etablissement?.id || null;
  const legacySB = dbService.getBridge();
  const canConnect = CONNECT_ROLES.includes(user?.role);

  const [orders, setOrders] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  // conn : état de la liaison Lightspeed déduit des réponses du poll.
  const [conn, setConn] = React.useState({ state: 'unknown', lastOkAt: null, error: null });
  const [, setTick] = React.useState(0); // re-render 1 s pour les chronos

  // ── Lecture des commandes (RLS lecture cuisine) ──
  const reload = React.useCallback(async () => {
    if (!legacySB || !etabId) { setLoading(false); return; }
    try {
      const rows = await legacySB.db.listKdsOrders(etabId);
      setOrders(rows || []);
    } catch (err) {
      console.error('[KDS listKdsOrders]', err);
    } finally {
      setLoading(false);
    }
  }, [legacySB, etabId]);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);
    reload();
    let unsub = null;
    if (legacySB) {
      unsub = legacySB.realtime.subscribeReload(['kds_orders', 'kds_order_items'], () => { if (mounted) reload(); });
    }
    return () => { mounted = false; unsub && unsub(); };
  }, [reload, legacySB]);

  // ── Poll Lightspeed ~15 s tant que l'écran est affiché et visible ──
  React.useEffect(() => {
    if (!isActive || !etabId) return undefined;
    let stopped = false;

    const doPoll = async () => {
      if (stopped || document.hidden) return;
      try {
        await pollKdsOrders(etabId);
        if (stopped) return;
        setConn({ state: 'ok', lastOkAt: Date.now(), error: null });
      } catch (err) {
        if (stopped) return;
        const p = err.payload || {};
        const msg = p.error || err.message || '';
        if (p.needs_reconnect) {
          setConn({ state: 'needs_reconnect', lastOkAt: null, error: msg });
        } else if (/Aucune connexion|non active|non configur/i.test(msg)) {
          setConn({ state: 'not_connected', lastOkAt: null, error: msg });
        } else {
          setConn((prev) => ({ state: 'error', lastOkAt: prev.lastOkAt, error: msg }));
        }
      }
    };

    doPoll();
    const id = setInterval(doPoll, POLL_MS);
    // Retour d'onglet / réveil tablette : re-poll immédiat, pas d'attente 15 s.
    const onVisible = () => { if (!document.hidden) doPoll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isActive, etabId]);

  // ── Wake lock : l'écran du passe ne se met pas en veille pendant le service ──
  React.useEffect(() => {
    if (!isActive || !navigator.wakeLock) return undefined;
    let lock = null;
    let released = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch { /* refusé (batterie, permission) : non bloquant */ }
    };
    acquire();
    const onVisible = () => { if (!document.hidden && !released) acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      try { lock && lock.release(); } catch { /* déjà relâché */ }
    };
  }, [isActive]);

  // ── Chronos : tick 1 s quand il y a des tickets au passe ──
  const atPasse = React.useMemo(
    () => orders
      .filter((o) => o.status === 'open' && !o.completedAt)
      .sort((a, b) => new Date(a.openedAt || 0) - new Date(b.openedAt || 0)),
    [orders]
  );
  React.useEffect(() => {
    if (!isActive || atPasse.length === 0) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [isActive, atPasse.length]);

  // Terminées = terminées au passe OU check fermé côté caisse. Conservées pour
  // revue en plein service (fenêtre getCheck ≈ 15 h, on borne à la même durée).
  const terminees = React.useMemo(() => {
    const cutoff = Date.now() - 15 * 3600 * 1000;
    return orders
      .filter((o) => (o.completedAt || o.status === 'closed'))
      .filter((o) => new Date(o.completedAt || o.openedAt || 0).getTime() >= cutoff)
      .sort((a, b) => new Date(b.completedAt || b.openedAt || 0) - new Date(a.completedAt || a.openedAt || 0))
      .slice(0, 20);
  }, [orders]);

  // ── Actions optimistes : l'UI répond au tap, le RPC suit, rollback si erreur ──
  const patchItem = (orderId, itemId, patch) => {
    setOrders((prev) => prev.map((o) => (o.id !== orderId ? o : {
      ...o, items: o.items.map((i) => (i.id !== itemId ? i : { ...i, ...patch })),
    })));
  };
  const patchOrder = (orderId, patch) => {
    setOrders((prev) => prev.map((o) => (o.id !== orderId ? o : { ...o, ...patch })));
  };
  const rpcSafe = async (fn, rollbackMsg) => {
    try { await fn(); } catch (err) {
      console.error('[KDS rpc]', err);
      notify(rollbackMsg + ' : ' + (err?.message || 'erreur'), 'error');
      reload();
    }
  };

  const toggleBump = (order, item) => {
    if (!item.active || item.aSuivre) return;
    const bumped = item.bumpStatus !== 'bumped';
    patchItem(order.id, item.id, { bumpStatus: bumped ? 'bumped' : 'pending' });
    rpcSafe(() => legacySB.db.kdsBumpItem(item.id, bumped), 'Bump non enregistré');
  };

  const holdItem = (order, item) => {
    patchItem(order.id, item.id, { aSuivre: true });
    rpcSafe(() => legacySB.db.kdsSetSuite(item.id, true), 'Mise à suivre non enregistrée');
  };

  const relanceItem = (order, item) => {
    patchItem(order.id, item.id, { aSuivre: false });
    rpcSafe(() => legacySB.db.kdsSetSuite(item.id, false), 'Relance non enregistrée');
  };

  const relanceSuite = (order) => {
    const held = order.items.filter((i) => i.aSuivre && i.active);
    held.forEach((i) => patchItem(order.id, i.id, { aSuivre: false }));
    rpcSafe(async () => {
      for (const i of held) await legacySB.db.kdsSetSuite(i.id, false);
    }, 'Relance non enregistrée');
  };

  const completeOrder = (order) => {
    const pending = order.items.filter((i) => i.active && i.bumpStatus !== 'bumped').length;
    if (pending > 0 && !window.confirm(`${pending} plat(s) pas encore fait(s) - terminer la table quand même ?`)) return;
    patchOrder(order.id, { completedAt: new Date().toISOString() });
    rpcSafe(() => legacySB.db.kdsCompleteOrder(order.id, true), 'Clôture non enregistrée');
  };

  const reopenOrder = (order) => {
    patchOrder(order.id, { completedAt: null });
    rpcSafe(() => legacySB.db.kdsCompleteOrder(order.id, false), 'Réouverture non enregistrée');
  };

  // ── KPI header ──
  const counts = React.useMemo(() => {
    let faire = 0, suite = 0;
    atPasse.forEach((o) => o.items.forEach((i) => {
      if (!i.active) return;
      if (i.aSuivre) suite++;
      else if (i.bumpStatus !== 'bumped') faire++;
    }));
    return { faire, suite };
  }, [atPasse]);

  const openPos = () => navigateToPage('pos');

  // ── Onboarding : caisse pas encore connectée ──
  const renderOnboarding = (reconnect) => (
    <div style={s.onboard}>
      <h3 style={s.onboardTitle}>{reconnect ? 'Reconnexion Lightspeed requise' : 'Connecter la caisse Lightspeed'}</h3>
      <p style={s.onboardSub}>
        {reconnect
          ? 'Le KDS a besoin d’un nouveau droit (commandes en cours). Une reconnexion de 30 secondes suffit.'
          : 'Le KDS affiche les commandes en direct de la caisse. Connexion en 4 étapes, une seule fois.'}
      </p>
      <div style={s.onboardSteps}>
        <div style={s.onboardStep}>
          <span style={s.onboardNum}>1</span>
          <div>
            <div style={s.onboardText}>Ouvrir le module <strong>Ventes POS</strong></div>
            <div style={s.onboardHint}>Bouton ci-dessous - la barre de connexion Lightspeed est en haut du module.</div>
          </div>
        </div>
        <div style={s.onboardStep}>
          <span style={s.onboardNum}>2</span>
          <div>
            <div style={s.onboardText}>Cliquer « {reconnect ? 'Reconnecter' : 'Connecter'} Lightspeed » et valider l’accès</div>
            <div style={s.onboardHint}>
              {canConnect
                ? 'Une fenêtre Lightspeed s’ouvre : accepter les droits ventes + commandes.'
                : 'Réservé au patron ou au consultant - demandez-leur de valider cette étape.'}
            </div>
          </div>
        </div>
        <div style={s.onboardStep}>
          <span style={s.onboardNum}>3</span>
          <div>
            <div style={s.onboardText}>Choisir le restaurant si le compte en a plusieurs</div>
            <div style={s.onboardHint}>Sélecteur affiché automatiquement après l’autorisation.</div>
          </div>
        </div>
        <div style={s.onboardStep}>
          <span style={s.onboardNum}>4</span>
          <div>
            <div style={s.onboardText}>Revenir ici - détection automatique</div>
            <div style={s.onboardHint}>Le KDS vérifie la connexion toutes les 15 secondes, rien d’autre à faire.</div>
          </div>
        </div>
      </div>
      <button style={s.onboardCta} onClick={openPos}>Ouvrir Ventes POS</button>
      {conn.error ? <div style={s.onboardNote}>Détail technique : {conn.error}</div> : null}
    </div>
  );

  // ── Rendu d'un ticket au passe ──
  const renderTicket = (order) => {
    const min = ageOf(order.openedAt);
    const faireItems = order.items.filter((i) => !i.aSuivre);
    const suiteItems = order.items.filter((i) => i.aSuivre && i.active);
    const actifs = order.items.filter((i) => i.active && !i.aSuivre);
    const allBumped = actifs.length > 0 && actifs.every((i) => i.bumpStatus === 'bumped') && suiteItems.length === 0;

    return (
      <div key={order.id} style={ticketStyle(ageBorder(min))}>
        <div style={s.ticketHead}>
          <span style={s.table}>Table {order.tableNo || '-'}</span>
          {order.couverts != null && <span style={s.couv}>{order.couverts} couv.</span>}
          {allBumped
            ? <span style={s.served}>✓ prêt</span>
            : <span style={{ ...s.timer, color: ageColor(min) }}>{elapsedLabel(order.openedAt)}</span>}
        </div>

        <div style={s.body}>
          {faireItems.map((item) => {
            if (!item.active) {
              return (
                <div key={item.id} style={s.voidRow}>
                  <span style={s.voidText}>{item.qty != null ? `${item.qty}× ` : ''}{item.nom}</span>
                  <span style={s.voidTag}>annulé</span>
                </div>
              );
            }
            const bumped = item.bumpStatus === 'bumped';
            return (
              <div key={item.id} style={faireRowStyle(bumped)}>
                <button style={{ ...s.mainBtn, minHeight: 48 }} onClick={() => toggleBump(order, item)}>
                  <span style={{ ...s.mark, color: bumped ? 'var(--success-strong)' : 'var(--text3)' }}>{bumped ? '✓' : '○'}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ ...s.itemName, ...(bumped ? { textDecoration: 'line-through', color: 'var(--text3)' } : {}) }}>
                      {item.qty != null ? `${item.qty}× ` : ''}{item.nom}
                    </span>
                    {item.modifiers.length > 0 && (
                      <span style={{ ...s.itemMods, display: 'block' }}>
                        {item.modifiers.map((m) => (m.quantity > 1 ? `${m.quantity}× ${m.name}` : m.name)).join(' · ')}
                      </span>
                    )}
                  </span>
                </button>
                {!bumped && (
                  <button style={{ ...s.holdBtn, minHeight: 48 }} onClick={() => holdItem(order, item)}>À suivre</button>
                )}
              </div>
            );
          })}
        </div>

        {suiteItems.length > 0 && (
          <div style={s.suiteBlock}>
            <div style={s.suiteHead}>
              À suivre · {suiteItems.length}
              <button style={s.suiteRelance} onClick={() => relanceSuite(order)}>Relancer la suite</button>
            </div>
            {suiteItems.map((item) => (
              <div key={item.id} style={s.suiteRow}>
                <span style={s.suiteName}>
                  {item.qty != null ? `${item.qty}× ` : ''}{item.nom}
                  {item.modifiers.length > 0 && (
                    <span style={{ ...s.itemMods, display: 'block' }}>
                      {item.modifiers.map((m) => (m.quantity > 1 ? `${m.quantity}× ${m.name}` : m.name)).join(' · ')}
                    </span>
                  )}
                </span>
                <button style={s.relanceBtn} onClick={() => relanceItem(order, item)}>Relancer</button>
              </div>
            ))}
          </div>
        )}

        <div style={s.footer}>
          <button style={s.completeBtn} onClick={() => completeOrder(order)}>✓ Terminer la commande</button>
        </div>
      </div>
    );
  };

  // ── États de page ──
  const showOnboarding = (conn.state === 'not_connected' || conn.state === 'needs_reconnect') && atPasse.length === 0;

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <h2 style={s.title}>KDS Cuisine</h2>
          <div style={s.sub}>Commandes Lightspeed en direct - tap sur un plat pour le marquer fait</div>
        </div>
        <div style={s.kpi}>
          {atPasse.length} table{atPasse.length > 1 ? 's' : ''} · {counts.faire} à faire{counts.suite > 0 ? ` · ${counts.suite} à suivre` : ''}
        </div>
        <div style={s.syncWrap}>
          <span style={s.syncDot(conn.state === 'ok')} />
          {conn.state === 'ok' && conn.lastOkAt ? `sync ${timeLabel(new Date(conn.lastOkAt).toISOString())}` : 'hors synchro'}
        </div>
      </div>

      {conn.state === 'error' && (
        <div style={s.banner}>
          Synchronisation Lightspeed en erreur - l’écran continue sur les dernières données.
          <span style={{ fontSize: 12, opacity: 0.8 }}>{conn.error}</span>
        </div>
      )}
      {(conn.state === 'not_connected' || conn.state === 'needs_reconnect') && atPasse.length > 0 && (
        <div style={s.banner}>
          {conn.state === 'needs_reconnect' ? 'Reconnexion Lightspeed requise (droit commandes).' : 'Caisse Lightspeed non connectée.'}
          <button style={s.bannerBtn} onClick={openPos}>Ouvrir Ventes POS</button>
        </div>
      )}

      {loading ? (
        <div style={s.empty}>Chargement du passe…</div>
      ) : showOnboarding ? (
        renderOnboarding(conn.state === 'needs_reconnect')
      ) : atPasse.length === 0 ? (
        <div style={s.empty}>
          Aucune commande en cours.
          <div style={{ fontSize: 12, marginTop: 6 }}>Les tickets apparaissent automatiquement dès l’envoi en caisse.</div>
        </div>
      ) : (
        <div style={s.board}>{atPasse.map(renderTicket)}</div>
      )}

      {terminees.length > 0 && (
        <div style={s.doneWrap}>
          <div style={s.doneHead}>Terminées · {terminees.length}<span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 12 }}> (conservées pour revue)</span></div>
          <div style={s.doneGrid}>
            {terminees.map((o) => (
              <div key={o.id} style={s.doneCard}>
                <div style={s.doneCardHead}>
                  <span style={{ ...s.table, fontSize: 14, color: 'var(--text2)' }}>Table {o.tableNo || '-'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>
                    {o.completedAt ? `terminée ${timeLabel(o.completedAt)}` : 'fermée en caisse'}
                  </span>
                </div>
                {o.items.map((i) => (
                  <div key={i.id} style={{ ...s.doneLine, ...(i.active ? {} : { textDecoration: 'line-through' }) }}>
                    {i.qty != null ? `${i.qty}× ` : ''}{i.nom}
                  </div>
                ))}
                {o.completedAt && o.status === 'open' && (
                  <button style={s.reopenBtn} onClick={() => reopenOrder(o)}>Rouvrir au passe</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Kds;
