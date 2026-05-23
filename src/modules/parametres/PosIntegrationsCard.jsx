import { useState, useEffect, useCallback } from 'react';
import { supabase, getSupabaseConfig } from '../../services/supabase.js';
import { notify } from '../../components/toast/index.js';
import LightspeedSetupGuide from './LightspeedSetupGuide.jsx';

// ─────────────────────────────────────────────────────────────────
// PosIntegrationsCard v3
//
// Gère la connexion Lightspeed par établissement :
//   • Écran de setup guidé (3 étapes) quand aucune connexion n'existe
//   • Ping pour vérifier si les secrets Supabase sont configurés
//   • Flow OAuth popup
//   • Sélecteur multi-location (si compte LS a plusieurs restaurants)
//   • Affichage statut connexion + test + déconnexion
//   • Bloc backfill : importe l'historique 14 jours après connexion
//   • Messages d'erreur OAuth explicites par code
// ─────────────────────────────────────────────────────────────────

const POS_OAUTH_FN    = 'pos-oauth';
const POS_BACKFILL_FN = 'pos-backfill';

// Messages d'erreur OAuth traduits par code d'erreur
const OAUTH_ERRORS = {
  invalid_client:
    "Client ID ou Secret incorrect. Vérifie les secrets Supabase (LS_CLIENT_ID et LS_CLIENT_SECRET).",
  invalid_redirect_uri:
    "Redirect URI non autorisée. Vérifie qu'elle est bien enregistrée dans le portail Lightspeed.",
  access_denied:
    "Autorisation refusée. Réessaie et accepte les permissions demandées.",
  invalid_scope:
    "Scopes insuffisants. Vérifie que financial-api et offline_access sont activés dans le portail Lightspeed.",
};

function IconLightspeed() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="7" fill="#FF6B35"/>
      <path d="M10 22L16 10L22 22H18L16 17L14 22H10Z" fill="white"/>
    </svg>
  );
}

async function callEdgeFn(fnName, action, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Non authentifié');
  const { url: supabaseUrl } = getSupabaseConfig();
  const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
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

// ── Sélecteur de location (modal) ────────────────────────────────
function LocationSelector({ locations, connectionId, etablissementId, providerId, onSelected, onCancel }) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving]     = useState(false);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      await callEdgeFn(POS_OAUTH_FN, 'set_location', {
        etablissementId,
        providerId,
        connectionId,
        businessId: selected.businessId,
        locationId: selected.locationId,
      });
      notify(`Location "${selected.locationName}" sélectionnée ✓`, 'success');
      onSelected();
    } catch (err) {
      notify(`Erreur : ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100, padding: 16,
    }} onClick={onCancel}>
      <div style={{
        background: 'var(--surface)', borderRadius: 14, width: 460,
        maxWidth: '100%', maxHeight: '80vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-serif)' }}>
            Sélectionner votre restaurant
          </div>
          <button type="button" onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ padding: '14px 20px' }}>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
            Plusieurs restaurants ont été détectés sur ce compte Lightspeed.<br/>
            Sélectionnez celui qui correspond à cet établissement Samper.
          </div>
          {locations.map((loc) => (
            <label key={loc.locationId} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8, marginBottom: 6, cursor: 'pointer',
              border: `2px solid ${selected?.locationId === loc.locationId ? 'var(--accent)' : 'var(--border)'}`,
              background: selected?.locationId === loc.locationId ? '#fff7ed' : 'var(--bg)',
            }}>
              <input type="radio" name="location" value={loc.locationId}
                checked={selected?.locationId === loc.locationId}
                onChange={() => setSelected(loc)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{loc.locationName}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{loc.businessName} · {loc.locationId}</div>
              </div>
            </label>
          ))}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>Annuler</button>
          <button type="button" onClick={handleSave} disabled={!selected || saving} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: selected ? 'var(--accent)' : 'var(--border)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: selected ? 'pointer' : 'not-allowed', fontFamily: 'var(--font)', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Enregistrement…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bloc backfill ─────────────────────────────────────────────────
function BackfillBlock({ connectionId, hasData, onComplete }) {
  const [running, setRunning]   = useState(false);
  const [progress, setProgress] = useState(null);
  const [done, setDone]         = useState(false);

  async function handleBackfill() {
    setRunning(true);
    setProgress({ done: 0, total: 14 });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { url: supabaseUrl } = getSupabaseConfig();

      const res = await fetch(`${supabaseUrl}/functions/v1/${POS_BACKFILL_FN}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ connectionId, days: 14 }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `Erreur ${res.status}`);

      setProgress({ done: result.daysProcessed, total: 14 });
      setDone(true);
      notify(`Historique importé : ${result.salesTotal} ventes sur ${result.daysProcessed} jours ✓`, 'success');
      onComplete?.();
    } catch (err) {
      notify(`Backfill échoué : ${err.message}`, 'error');
    } finally {
      setRunning(false);
    }
  }

  if (done) return null;

  return (
    <div style={{
      margin: '10px 20px 14px',
      padding: '12px 16px',
      background: '#eff6ff',
      border: '1px solid #bfdbfe',
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>
            {hasData ? 'Données partielles' : 'Aucune donnée historique importée'}
          </div>
          <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>
            {running && progress
              ? `Backfill en cours… ${progress.done}/${progress.total} jours`
              : `Les 3 vues cuisine nécessitent 14 jours d'historique`}
          </div>
          {running && progress && (
            <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: '#bfdbfe', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: '#2563eb', width: `${(progress.done / progress.total) * 100}%`, transition: 'width 0.3s' }}/>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleBackfill}
          disabled={running}
          style={{
            padding: '8px 16px', borderRadius: 8,
            background: running ? '#93c5fd' : '#2563eb',
            color: '#fff', border: 'none',
            fontSize: 13, fontWeight: 600,
            cursor: running ? 'wait' : 'pointer',
            fontFamily: 'var(--font)', flexShrink: 0,
          }}
        >
          {running ? 'Importation…' : 'Importer les 14 derniers jours'}
        </button>
      </div>
    </div>
  );
}

// ── Écran de setup guidé (3 étapes) ──────────────────────────────
function SetupScreen({ provider, secretsConfigured, onShowGuide, onConnect, busy }) {
  const configured = secretsConfigured === true;
  const checking   = secretsConfigured === null;

  // Indicateur visuel de l'étape 2 (secrets Supabase)
  let step2Icon, step2Color;
  if (checking)        { step2Icon = '⌛'; step2Color = 'var(--text3)'; }
  else if (configured) { step2Icon = '✅'; step2Color = '#15803d'; }
  else                 { step2Icon = '⚠️'; step2Color = '#c2410c'; }

  const steps = [
    { icon: '①', color: 'var(--text2)', label: 'Créer une app sur le portail développeur Lightspeed' },
    { icon: step2Icon, color: step2Color, label: 'Configurer les 4 secrets Supabase' },
    { icon: '→',  color: 'var(--text)',  label: 'Autoriser la connexion' },
  ];

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, borderBottom: '1px solid var(--border)' }}>
      {/* En-tête provider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <IconLightspeed />
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{provider.label}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            Connexion requise pour activer les vues cuisine
          </div>
        </div>
      </div>

      {/* Étapes */}
      <div style={{
        padding: '14px 16px',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        display: 'flex', flexDirection: 'column', gap: 9,
      }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, width: 22, textAlign: 'center', flexShrink: 0, lineHeight: 1 }}>
              {step.icon}
            </span>
            <span style={{ fontSize: 13, color: step.color }}>
              <strong>Étape {i + 1}</strong> — {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Alerte si secrets absents */}
      {secretsConfigured === false && (
        <div style={{
          fontSize: 12, color: '#c2410c',
          background: '#fff7ed', border: '1px solid #fed7aa',
          borderRadius: 8, padding: '8px 12px',
        }}>
          ⚠ Configure d'abord les secrets Supabase (étape 2) avant de connecter.
          Clique sur "Voir le guide" pour les instructions détaillées.
        </div>
      )}

      {/* Boutons */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onShowGuide}
          style={{
            padding: '8px 16px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}
        >
          📖 Voir le guide de configuration
        </button>
        <button
          type="button"
          onClick={onConnect}
          disabled={!configured || busy}
          title={!configured && !checking ? "Configure d'abord les secrets Supabase" : undefined}
          style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: (!configured || busy) ? 'var(--border)' : 'var(--accent)',
            color: (!configured || busy) ? 'var(--text3)' : '#fff',
            fontSize: 13, fontWeight: 600,
            cursor: (!configured || busy) ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font)', transition: 'background 0.15s',
          }}
        >
          {busy ? 'Connexion…' : checking ? 'Vérification…' : 'Connecter Lightspeed'}
        </button>
      </div>
    </div>
  );
}

// ── Carte d'un provider ───────────────────────────────────────────
function ProviderCard({ provider, etablissementId, canEdit }) {
  const [status, setStatus]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [action, setAction]           = useState(null);
  const [pendingLocations, setLocs]   = useState(null);
  const [pendingConnId, setPendingId] = useState(null);
  // Ping : secrets Supabase configurés ? null=vérification, true, false
  const [secretsConfigured, setSecrets] = useState(null);
  const [showGuide, setShowGuide]       = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callEdgeFn(POS_OAUTH_FN, 'status', { etablissementId, providerId: provider.id });
      setStatus(res);
    } catch (err) {
      console.error('[PosIntegrationsCard] loadStatus', err);
    } finally {
      setLoading(false);
    }
  }, [etablissementId, provider.id]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Ping — aucune auth requise, vérifie uniquement la présence des secrets
  useEffect(() => {
    const { url: supabaseUrl } = getSupabaseConfig();
    fetch(`${supabaseUrl}/functions/v1/${POS_OAUTH_FN}?action=ping`)
      .then(r => r.json())
      .then(data => setSecrets(data.configured === true))
      .catch(() => setSecrets(null)); // silencieux si edge function inaccessible
  }, []);

  // Écoute les messages postMessage du popup OAuth
  useEffect(() => {
    const handler = (event) => {
      const { type, locations, connectionId, locationName, error_code } = event.data ?? {};
      if (type === 'pos_oauth_success') {
        setAction(null);
        const name = locationName ? ` (${locationName})` : '';
        notify(`Lightspeed connecté${name} ✓`, 'success');
        loadStatus();
      } else if (type === 'pos_oauth_needs_location') {
        setAction(null);
        setLocs(locations);
        setPendingId(connectionId);
      } else if (type === 'pos_oauth_error') {
        setAction(null);
        // Message traduit selon le code d'erreur OAuth, générique en fallback
        const msg = (error_code && OAUTH_ERRORS[error_code])
          ? OAUTH_ERRORS[error_code]
          : (event.data.error || 'Connexion échouée. Vérifie ta configuration et réessaie.');
        notify(`Erreur OAuth : ${msg}`, 'error');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [loadStatus]);

  async function handleConnect() {
    setAction('connecting');
    try {
      const { url: authUrl } = await callEdgeFn(POS_OAUTH_FN, 'get_auth_url', { etablissementId, providerId: provider.id });
      const popup = window.open(authUrl, 'lightspeed_oauth', 'width=600,height=700,left=200,top=100,toolbar=no,menubar=no');
      if (!popup) {
        notify('Popup bloqué — autorisez les popups pour ce site.', 'warning');
        setAction(null);
      }
      // Le résultat vient via postMessage (géré dans useEffect ci-dessus)
    } catch (err) {
      notify(`Impossible de lancer la connexion : ${err.message}`, 'error');
      setAction(null);
    }
  }

  async function handleTest() {
    setAction('testing');
    try {
      const res = await callEdgeFn(POS_OAUTH_FN, 'test', { etablissementId, providerId: provider.id });
      notify(res.message || 'Connexion opérationnelle ✓', 'success');
      loadStatus();
    } catch (err) {
      notify(`Test échoué : ${err.message}`, 'error');
      loadStatus();
    } finally {
      setAction(null);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm(`Déconnecter ${provider.label} ?\nLes données synchronisées seront conservées.`)) return;
    setAction('disconnecting');
    try {
      await callEdgeFn(POS_OAUTH_FN, 'disconnect', { etablissementId, providerId: provider.id });
      notify(`${provider.label} déconnecté.`, 'info');
      loadStatus();
    } catch (err) {
      notify(`Erreur déconnexion : ${err.message}`, 'error');
    } finally {
      setAction(null);
    }
  }

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const isConnected   = status?.status === 'connected';
  const isError       = status?.status === 'error';
  const needsLocation = status?.status === 'needs_location';
  const notConnected  = !status || status.status === 'disconnected' || status.status === 'not_connected';
  const hasData       = isConnected && !!status?.last_sync_at;
  const showBackfill  = isConnected && !needsLocation;
  const busy          = !!action;

  return (
    <div>
      {/* ── Écran de setup (aucune connexion) — canEdit uniquement ── */}
      {notConnected && canEdit && (
        loading ? (
          <div style={{
            padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
            borderBottom: '1px solid var(--border)',
          }}>
            <IconLightspeed />
            <span style={{ fontSize: 13, color: 'var(--text3)' }}>Vérification de la connexion…</span>
          </div>
        ) : (
          <SetupScreen
            provider={provider}
            secretsConfigured={secretsConfigured}
            onShowGuide={() => setShowGuide(true)}
            onConnect={handleConnect}
            busy={busy}
          />
        )
      )}

      {/* ── Vue lecture seule (non connecté, !canEdit) ── */}
      {notConnected && !canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <IconLightspeed />
          <div>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{provider.label}</span>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Non connecté</div>
          </div>
        </div>
      )}

      {/* ── Vue standard (connecté / erreur / sélection location) ── */}
      {!notConnected && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 20px', borderBottom: pendingLocations || (isConnected && !hasData) ? 'none' : '1px solid var(--border)' }}>
          <div style={{ flexShrink: 0, marginTop: 2 }}><IconLightspeed /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{provider.label}</span>
              {loading && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Chargement…</span>}
              {!loading && isConnected    && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac' }}>Connecté</span>}
              {!loading && isError        && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5' }}>Erreur</span>}
              {!loading && needsLocation  && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>Sélection requise</span>}
            </div>
            {isConnected && (
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
                {status.ls_business_location_id ? `Location : ${status.ls_business_location_id} · ` : ''}
                Dernière sync : {formatDate(status.last_sync_at)}
              </div>
            )}
            {isError && status?.last_error && (
              <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4, background: '#fef2f2', padding: '5px 9px', borderRadius: 6 }}>⚠ {status.last_error}</div>
            )}
            {needsLocation && (
              <div style={{ fontSize: 12, color: '#c2410c', marginTop: 3 }}>
                Plusieurs restaurants détectés — choisissez la location ci-dessous.
              </div>
            )}
          </div>

          {/* Actions */}
          {canEdit && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {needsLocation && (
                <button type="button" onClick={handleConnect} disabled={busy}
                  style={{ padding: '8px 16px', borderRadius: 8, background: busy ? '#fde68a' : 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--font)', opacity: busy ? 0.8 : 1 }}>
                  {action === 'connecting' ? 'Connexion…' : 'Reconnecter'}
                </button>
              )}
              {(isConnected || isError) && (
                <>
                  {isConnected && (
                    <button type="button" onClick={handleTest} disabled={busy}
                      style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--font)', opacity: busy ? 0.6 : 1 }}>
                      {action === 'testing' ? 'Test…' : 'Tester'}
                    </button>
                  )}
                  {isError && (
                    <button type="button" onClick={handleConnect} disabled={busy}
                      style={{ padding: '8px 14px', borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c', fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--font)' }}>
                      Reconnecter
                    </button>
                  )}
                  <button type="button" onClick={handleDisconnect} disabled={busy}
                    style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--surface)', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--font)', opacity: busy ? 0.6 : 1 }}>
                    {action === 'disconnecting' ? 'Déconnexion…' : 'Déconnecter'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Backfill */}
      {showBackfill && (
        <BackfillBlock connectionId={status?.id} hasData={hasData} onComplete={loadStatus} />
      )}

      {/* Sélecteur multi-location (modal) */}
      {pendingLocations && (
        <LocationSelector
          locations={pendingLocations}
          connectionId={pendingConnId}
          etablissementId={etablissementId}
          providerId={provider.id}
          onSelected={() => { setLocs(null); setPendingId(null); loadStatus(); }}
          onCancel={() => { setLocs(null); setPendingId(null); }}
        />
      )}

      {/* Guide de configuration (modal) */}
      {showGuide && (
        <LightspeedSetupGuide onClose={() => setShowGuide(false)} />
      )}
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────────
export default function PosIntegrationsCard({ etablissement, user }) {
  const [providers, setProviders]             = useState([]);
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
        if (!error) setProviders(data || []);
      } finally {
        if (mounted) setLoadingProviders(false);
      }
    })();
    return () => { mounted = false; };
  }, [etablissementId]);

  if (!etablissementId) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', fontSize: 13, color: 'var(--text2)' }}>
        Sélectionnez un établissement pour gérer ses intégrations POS.
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Intégrations POS</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Synchronisation des ventes · {etablissement?.nom || etablissementId}</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px' }}>Beta</div>
      </div>

      {loadingProviders ? (
        <div style={{ padding: '24px 20px', fontSize: 13, color: 'var(--text3)', textAlign: 'center' }}>Chargement…</div>
      ) : providers.length === 0 ? (
        <div style={{ padding: '24px 20px', fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>Aucun provider POS disponible.</div>
      ) : (
        providers.map((p) => (
          <ProviderCard key={p.id} provider={p} etablissementId={etablissementId} canEdit={canEdit} />
        ))
      )}

      <div style={{ padding: '10px 20px', background: '#f0f9ff', borderTop: '1px solid #bae6fd', fontSize: 11, color: '#0369a1' }}>
        🔐 Les identifiants POS sont chiffrés côté serveur et ne sont jamais exposés dans l'application.
      </div>
    </div>
  );
}
