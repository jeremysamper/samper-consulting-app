import { useState, useEffect, useCallback } from 'react';
import { supabase, getSupabaseConfig } from '../../services/supabase.js';
import { notify } from '../../components/toast/index.js';

// ─────────────────────────────────────────────────────────────────
// PosIntegrationsCard
//
// Affiche les intégrations POS disponibles pour un établissement.
// OAuth flow : popup + window.postMessage.
// Tokens JAMAIS lus côté client — tout passe par l'edge function pos-oauth.
//
// Props :
//   etablissement  — objet établissement courant (doit avoir .id)
//   user           — profil utilisateur courant
// ─────────────────────────────────────────────────────────────────

const EDGE_FUNCTION = 'pos-oauth';

// Icône SVG Lightspeed minimaliste
function IconLightspeed() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#FF6B35"/>
      <path d="M10 22L16 10L22 22H18L16 17L14 22H10Z" fill="white"/>
    </svg>
  );
}

// Appelle l'edge function pos-oauth avec l'auth token courant
async function callPosOauth(action, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Non authentifié');

  const { url: supabaseUrl } = getSupabaseConfig();
  const fnUrl = `${supabaseUrl}/functions/v1/${EDGE_FUNCTION}`;

  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...body }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

// ── Sous-composant : carte d'un provider ─────────────────────────
function ProviderCard({ provider, etablissementId, canEdit }) {
  const [status, setStatus]   = useState(null);   // { status, last_sync_at, last_error, token_expires_at }
  const [loading, setLoading] = useState(false);
  const [action, setAction]   = useState(null);   // 'connecting' | 'testing' | 'disconnecting'

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callPosOauth('status', {
        etablissementId,
        providerId: provider.id,
      });
      setStatus(res);
    } catch (err) {
      console.error('[PosIntegrationsCard] loadStatus', err);
    } finally {
      setLoading(false);
    }
  }, [etablissementId, provider.id]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // ── Connexion OAuth via popup ──────────────────────────────────
  async function handleConnect() {
    setAction('connecting');
    try {
      const { url: authUrl } = await callPosOauth('get_auth_url', {
        etablissementId,
        providerId: provider.id,
      });

      // Ouvre le popup OAuth
      const popup = window.open(
        authUrl,
        'lightspeed_oauth',
        'width=600,height=700,left=200,top=100,toolbar=no,menubar=no'
      );

      if (!popup) {
        notify('Popup bloqué par le navigateur — autorisez les popups pour ce site.', 'warning');
        setAction(null);
        return;
      }

      // Écoute le message de succès/erreur depuis la page callback
      const onMessage = (event) => {
        if (event.data?.type === 'pos_oauth_success') {
          window.removeEventListener('message', onMessage);
          notify('Lightspeed connecté avec succès ✓', 'success');
          loadStatus();
          setAction(null);
        } else if (event.data?.type === 'pos_oauth_error') {
          window.removeEventListener('message', onMessage);
          notify(`Erreur OAuth : ${event.data.error}`, 'error');
          setAction(null);
        }
      };

      window.addEventListener('message', onMessage);

      // Timeout de sécurité : si le popup est fermé sans postMessage
      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          window.removeEventListener('message', onMessage);
          setAction(null);
          loadStatus(); // recharge au cas où ça a quand même marché
        }
      }, 1000);
    } catch (err) {
      notify(`Impossible de lancer la connexion : ${err.message}`, 'error');
      setAction(null);
    }
  }

  // ── Test de connexion ──────────────────────────────────────────
  async function handleTest() {
    setAction('testing');
    try {
      const res = await callPosOauth('test', { etablissementId, providerId: provider.id });
      notify(res.message || 'Connexion opérationnelle ✓', 'success');
      loadStatus();
    } catch (err) {
      if (err.message?.includes('reconnexion')) {
        notify('Token expiré — veuillez vous reconnecter à Lightspeed.', 'warning');
      } else {
        notify(`Test échoué : ${err.message}`, 'error');
      }
      loadStatus();
    } finally {
      setAction(null);
    }
  }

  // ── Déconnexion ───────────────────────────────────────────────
  async function handleDisconnect() {
    if (!window.confirm(`Déconnecter ${provider.label} de cet établissement ?\nLes données synchronisées (plats, ventes) seront conservées.`)) return;
    setAction('disconnecting');
    try {
      await callPosOauth('disconnect', { etablissementId, providerId: provider.id });
      notify(`${provider.label} déconnecté.`, 'info');
      loadStatus();
    } catch (err) {
      notify(`Erreur déconnexion : ${err.message}`, 'error');
    } finally {
      setAction(null);
    }
  }

  // ── Helpers UI ────────────────────────────────────────────────
  const isConnected   = status?.status === 'connected';
  const isError       = status?.status === 'error';
  const notConnected  = !status || status.status === 'disconnected' || status.status === 'not_connected';
  const busy          = !!action;

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-CH', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 16,
      padding: '16px 20px', borderBottom: '1px solid var(--border)',
    }}>
      {/* Icône */}
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <IconLightspeed />
      </div>

      {/* Infos + status */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
            {provider.label}
          </span>
          {loading && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>Chargement…</span>
          )}
          {!loading && isConnected && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac',
            }}>Connecté</span>
          )}
          {!loading && isError && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5',
            }}>Erreur</span>
          )}
          {!loading && notConnected && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: 'var(--bg)', color: 'var(--text3)', border: '1px solid var(--border)',
            }}>Non connecté</span>
          )}
        </div>

        {/* Détails de connexion */}
        {isConnected && (
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
            Dernière sync : {formatDate(status.last_sync_at)}
          </div>
        )}
        {isError && status.last_error && (
          <div style={{
            fontSize: 12, color: '#b91c1c', marginTop: 4, lineHeight: 1.5,
            background: '#fef2f2', padding: '6px 10px', borderRadius: 6, marginTop: 6,
          }}>
            ⚠ {status.last_error}
          </div>
        )}
        {notConnected && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            Synchronisez vos ventes quotidiennes et activez les 3 vues cuisine.
          </div>
        )}
      </div>

      {/* Actions */}
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {notConnected && (
            <button
              type="button"
              onClick={handleConnect}
              disabled={busy}
              style={{
                padding: '8px 16px', borderRadius: 8,
                background: busy && action === 'connecting' ? '#fde68a' : 'var(--accent)',
                color: '#fff', border: 'none',
                fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
                fontFamily: 'var(--font)', opacity: busy ? 0.8 : 1,
              }}
            >
              {action === 'connecting' ? 'Connexion…' : 'Connecter'}
            </button>
          )}
          {(isConnected || isError) && (
            <>
              {isConnected && (
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={busy}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    color: 'var(--text)', fontSize: 13, fontWeight: 600,
                    cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--font)',
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {action === 'testing' ? 'Test…' : 'Tester'}
                </button>
              )}
              {isError && (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={busy}
                  style={{
                    padding: '8px 14px', borderRadius: 8,
                    background: '#fff7ed', border: '1px solid #fed7aa',
                    color: '#c2410c', fontSize: 13, fontWeight: 600,
                    cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--font)',
                  }}
                >
                  Reconnecter
                </button>
              )}
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={busy}
                style={{
                  padding: '8px 14px', borderRadius: 8,
                  background: 'var(--surface)', border: '1px solid #fca5a5',
                  color: '#b91c1c', fontSize: 13, fontWeight: 600,
                  cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--font)',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {action === 'disconnecting' ? 'Déconnexion…' : 'Déconnecter'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────────
export default function PosIntegrationsCard({ etablissement, user }) {
  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  const canEdit = ['consultant', 'patron'].includes(user?.role);
  const etablissementId = etablissement?.id;

  useEffect(() => {
    if (!etablissementId) return;
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('pos_providers')
          .select('id, slug, label')
          .order('label');
        if (!mounted) return;
        if (error) {
          console.error('[PosIntegrationsCard] providers', error);
          return;
        }
        setProviders(data || []);
      } finally {
        if (mounted) setLoadingProviders(false);
      }
    })();
    return () => { mounted = false; };
  }, [etablissementId]);

  if (!etablissementId) {
    return (
      <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--text2)' }}>
        Sélectionnez un établissement pour gérer ses intégrations POS.
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Intégrations POS
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            Synchronisation des ventes · {etablissement?.nom || etablissementId}
          </div>
        </div>
        <div style={{
          fontSize: 11, color: 'var(--text3)', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px',
        }}>
          Beta
        </div>
      </div>

      {/* Liste des providers */}
      {loadingProviders ? (
        <div style={{ padding: '24px 20px', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>
          Chargement…
        </div>
      ) : providers.length === 0 ? (
        <div style={{ padding: '24px 20px', fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>
          Aucun provider POS disponible.
        </div>
      ) : (
        providers.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            etablissementId={etablissementId}
            canEdit={canEdit}
          />
        ))
      )}

      {/* Info sécurité */}
      <div style={{
        padding: '10px 20px',
        background: '#f0f9ff',
        borderTop: '1px solid #bae6fd',
        fontSize: 11, color: '#0369a1',
      }}>
        🔐 Les identifiants POS sont chiffrés côté serveur et ne sont jamais exposés dans l'application.
      </div>
    </div>
  );
}
