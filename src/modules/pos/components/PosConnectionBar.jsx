// ================================================================
// PosConnectionBar - Barre de connexion / synchronisation POS
//
// Rendue en haut du module Ventes POS. Rend le module autonome :
// le couplage et la synchro ne sont plus enfermes dans Parametres
// (page reservee au consultant).
//
//   • Non connecte  -> bouton "Connecter Lightspeed" (OAuth popup)
//   • Connecte      -> "Synchroniser maintenant" (pos-backfill) + "Tester"
//   • 1re fois      -> "Importer l'historique (14 j)"
//   • Erreur        -> "Reconnecter"
//   • needs_location-> renvoie vers Parametres pour finaliser
//
// Permissions :
//   Coupler / reconnecter : consultant, patron
//   Synchroniser          : consultant, patron, resp_cuisine
// ================================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../services/supabase.js';
import { notify } from '../../../components/toast/index.js';
import { callPosEdge, POS_OAUTH_FN, POS_BACKFILL_FN } from '../lib/posApi.js';

const CONNECT_ROLES = ['consultant', 'patron'];
const SYNC_ROLES    = ['consultant', 'patron', 'resp_cuisine'];
const RECENT_DAYS   = 7;   // synchro recurrente : 7 derniers jours
const HISTORY_DAYS  = 14;  // 1er import : 14 jours d'historique

function IconLS({ size = 30 }) {
  // Logo Lightspeed (marque tierce) - orange conserve volontairement.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
      <rect width="32" height="32" rx="7" fill="#FF6B35" />
      <path d="M10 22L16 10L22 22H18L16 17L14 22H10Z" fill="white" />
    </svg>
  );
}

function fmtDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('fr-CH', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return null;
  }
}

const S = {
  card:  { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px' },
  row:   { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  title: { fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font)' },
  sub:   { fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.5 },
  pill:  (kind) => ({
    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
    background: `var(--${kind}-bg-soft)`, color: `var(--${kind}-text)`, border: `1px solid var(--${kind}-bd)`,
  }),
  primary: (off) => ({
    padding: '8px 16px', borderRadius: 8, border: 'none',
    background: off ? 'var(--border)' : 'var(--accent)', color: off ? 'var(--text3)' : '#fff',
    fontSize: 13, fontWeight: 600, cursor: off ? 'wait' : 'pointer', fontFamily: 'var(--font)', flexShrink: 0,
  }),
  ghost: (busy) => ({
    padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
    fontFamily: 'var(--font)', flexShrink: 0, opacity: busy ? 0.6 : 1,
  }),
  spacer:  { flex: 1, minWidth: 0 },
  actions: { display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' },
};

export default function PosConnectionBar({ etablissement, user, onSynced }) {
  const etablissementId = etablissement?.id;
  const role = user?.role;
  const canConnect = CONNECT_ROLES.includes(role);
  const canSync    = SYNC_ROLES.includes(role);

  const [provider, setProvider] = useState(null);
  const [status, setStatus]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [action, setAction]     = useState(null); // 'connecting' | 'syncing' | 'testing'
  const busy = !!action;

  // Provider Lightspeed (premier provider POS dispo par defaut)
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const { data } = await supabase.from('pos_providers').select('id, slug, label').order('label');
        if (!on) return;
        const p = (data || []).find((pr) => pr.slug === 'lightspeed') || (data || [])[0] || null;
        setProvider(p);
        // Pas de provider configure -> on sort de l'etat "chargement" (sinon spinner infini,
        // car loadStatus court-circuite tant que provider est null).
        if (!p) setLoading(false);
      } catch {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, []);

  const loadStatus = useCallback(async () => {
    if (!etablissementId || !provider) return;
    setLoading(true);
    try {
      const res = await callPosEdge(POS_OAUTH_FN, 'status', { etablissementId, providerId: provider.id });
      setStatus(res);
    } catch (err) {
      console.error('[PosConnectionBar] status', err);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [etablissementId, provider]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Resultat du popup OAuth (postMessage)
  useEffect(() => {
    const handler = (event) => {
      const d = event.data ?? {};
      if (d.type === 'pos_oauth_success') {
        setAction(null);
        notify(`Lightspeed connecte${d.locationName ? ` (${d.locationName})` : ''}`, 'success');
        loadStatus();
      } else if (d.type === 'pos_oauth_needs_location') {
        setAction(null);
        notify('Plusieurs restaurants detectes. Finalisez dans Parametres -> Integrations POS.', 'warning');
        loadStatus();
      } else if (d.type === 'pos_oauth_error') {
        setAction(null);
        notify(`Connexion echouee : ${d.error || 'reessayez.'}`, 'error');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadStatus]);

  async function handleConnect() {
    if (!provider) { notify('Aucun provider POS disponible.', 'error'); return; }
    setAction('connecting');
    try {
      const { url } = await callPosEdge(POS_OAUTH_FN, 'get_auth_url', { etablissementId, providerId: provider.id });
      const popup = window.open(url, 'lightspeed_oauth', 'width=600,height=720,left=200,top=80');
      if (!popup) {
        notify('Popup bloque - autorisez les popups pour ce site.', 'warning');
        setAction(null);
      }
    } catch (err) {
      notify(`Impossible de lancer la connexion : ${err.message}`, 'error');
      setAction(null);
    }
  }

  async function handleSync(days) {
    if (!status?.id) return;
    setAction('syncing');
    try {
      const res = await callPosEdge(POS_BACKFILL_FN, null, { connectionId: status.id, days });
      if ((res.daysProcessed ?? 0) === 0 && (res.daysErrored ?? 0) > 0) {
        notify(`Synchro echouee : ${res.errors?.[0]?.error || 'erreur inconnue'}`, 'error');
      } else {
        notify(`Synchronise : ${res.salesTotal ?? 0} vente(s) sur ${res.daysProcessed} jour(s)`, 'success');
        onSynced?.();
      }
    } catch (err) {
      notify(`Synchro echouee : ${err.message}`, 'error');
    } finally {
      setAction(null);
      loadStatus();
    }
  }

  async function handleTest() {
    if (!provider) return;
    setAction('testing');
    try {
      const res = await callPosEdge(POS_OAUTH_FN, 'test', { etablissementId, providerId: provider.id });
      notify(res.message || 'Connexion operationnelle', 'success');
    } catch (err) {
      notify(`Test echoue : ${err.message}`, 'error');
    } finally {
      setAction(null);
      loadStatus();
    }
  }

  if (!etablissementId) return null;

  const st            = status?.status;
  const isConnected   = st === 'connected';
  const isError       = st === 'error';
  const needsLocation = st === 'needs_location';
  const hasData       = isConnected && !!status?.last_sync_at;
  const lastSync      = fmtDate(status?.last_sync_at);

  // ── Chargement initial ──
  if (loading && !status) {
    return (
      <div style={S.card}>
        <div style={S.row}>
          <IconLS />
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>Verification de la caisse...</span>
        </div>
      </div>
    );
  }

  // ── Connecte ──
  if (isConnected) {
    return (
      <div style={S.card}>
        <div style={S.row}>
          <IconLS />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={S.title}>Lightspeed</span>
              <span style={S.pill('success')}>Connecte</span>
            </div>
            <div style={S.sub}>
              {hasData
                ? `Derniere synchro : ${lastSync}`
                : "Aucune donnee importee. Lancez une premiere synchronisation."}
            </div>
          </div>
          <div style={S.spacer} />
          {canSync && (
            <div style={S.actions}>
              <button
                type="button"
                onClick={() => handleSync(hasData ? RECENT_DAYS : HISTORY_DAYS)}
                disabled={busy}
                style={S.primary(busy)}
              >
                {action === 'syncing'
                  ? 'Synchronisation...'
                  : hasData ? 'Synchroniser maintenant' : "Importer l'historique (14 j)"}
              </button>
              {canConnect && (
                <button type="button" onClick={handleTest} disabled={busy} style={S.ghost(busy)}>
                  {action === 'testing' ? 'Test...' : 'Tester'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Erreur (token revoque / sync en echec) ──
  if (isError) {
    return (
      <div style={{ ...S.card, borderColor: 'var(--danger-bd)' }}>
        <div style={S.row}>
          <IconLS />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={S.title}>Lightspeed</span>
              <span style={S.pill('danger')}>Deconnecte</span>
            </div>
            <div style={{ ...S.sub, color: 'var(--danger-text)' }}>
              {status?.last_error
                ? status.last_error
                : 'La synchronisation est en pause. Reconnectez la caisse.'}
            </div>
          </div>
          <div style={S.spacer} />
          {canConnect && (
            <div style={S.actions}>
              <button type="button" onClick={handleConnect} disabled={busy} style={S.primary(busy)}>
                {action === 'connecting' ? 'Connexion...' : 'Reconnecter Lightspeed'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Selection de location requise ──
  if (needsLocation) {
    return (
      <div style={{ ...S.card, borderColor: 'var(--warning-bd)' }}>
        <div style={S.row}>
          <IconLS />
          <div style={{ minWidth: 0 }}>
            <span style={S.title}>Selection du restaurant requise</span>
            <div style={S.sub}>
              Plusieurs restaurants detectes sur ce compte Lightspeed. Finalisez la selection dans
              Parametres -&gt; Integrations POS.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Non connecte ──
  return (
    <div style={S.card}>
      <div style={{ ...S.row, alignItems: 'flex-start' }}>
        <IconLS />
        <div style={{ minWidth: 0, flex: 1 }}>
          <span style={S.title}>Aucune caisse connectee</span>
          <div style={S.sub}>
            {canConnect
              ? 'Connectez votre caisse Lightspeed pour synchroniser les ventes et activer les vues cuisine (mise en place, top/flop, conso ingredients).'
              : "La caisse Lightspeed n'est pas connectee. Demandez a un responsable de la connecter."}
          </div>
        </div>
        {canConnect && (
          <div style={S.actions}>
            <button
              type="button"
              onClick={handleConnect}
              disabled={busy || !provider}
              style={S.primary(busy || !provider)}
            >
              {action === 'connecting' ? 'Connexion...' : 'Connecter Lightspeed'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
