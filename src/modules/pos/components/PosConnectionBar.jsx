// ================================================================
// PosConnectionBar - Barre de connexion / synchronisation POS
//
// Rendue en haut du module Ventes POS. Rend le module autonome :
// le couplage et la synchro ne sont plus enfermes dans Parametres
// (page reservee au consultant).
//
//   • Non connecte  -> "Connecter Lightspeed" (wizard guide 3 etapes)
//   • Connecte      -> "Synchroniser maintenant" (pos-backfill) + "Tester"
//   • 1re fois      -> "Importer l'historique (14 j)"
//   • Erreur        -> "Reconnecter" (wizard, mode reconnect)
//   • needs_location-> "Choisir le restaurant" (wizard, mode location)
//
// Le flux OAuth (popup + postMessage + choix de location + 1er import)
// vit dans LightspeedConnectWizard ; la barre recharge le statut a la
// fermeture du wizard.
//
// Permissions :
//   Coupler / reconnecter : consultant, patron
//   Synchroniser          : consultant, patron, resp_cuisine
// ================================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../services/supabase.js';
import { notify } from '../../../components/toast/index.js';
import { callPosEdge, POS_OAUTH_FN, POS_BACKFILL_FN } from '../lib/posApi.js';
import LightspeedConnectWizard from './LightspeedConnectWizard.jsx';

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
  card:  { background: 'var(--surface)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 12, padding: '14px 18px' },
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
  const [action, setAction]     = useState(null); // 'syncing' | 'testing'
  const [wizard, setWizard]     = useState(null); // null | 'connect' | 'reconnect' | 'location'
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

  // Ouvre le wizard guide (le flux OAuth complet vit dedans).
  function openWizard(mode) {
    if (!provider) { notify('Aucun provider POS disponible.', 'error'); return; }
    setWizard(mode);
  }

  // Fermeture du wizard : recharge du statut ; si un import a eu lieu,
  // previent le module pour re-fetcher les vues.
  function handleWizardClose({ imported } = {}) {
    setWizard(null);
    loadStatus();
    if (imported) onSynced?.();
  }

  async function handleSync(days) {
    if (!status?.id) return;
    setAction('syncing');
    try {
      const res = await callPosEdge(POS_BACKFILL_FN, null, { connectionId: status.id, days });
      if ((res.daysProcessed ?? 0) === 0 && (res.daysErrored ?? 0) > 0) {
        notify(`Synchro échouée : ${res.errors?.[0]?.error || 'erreur inconnue'}`, 'error');
      } else {
        notify(`Synchronisé : ${res.salesTotal ?? 0} vente(s) sur ${res.daysProcessed} jour(s)`, 'success');
        onSynced?.();
      }
    } catch (err) {
      notify(`Synchro échouée : ${err.message}`, 'error');
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
      notify(res.message || 'Connexion opérationnelle', 'success');
    } catch (err) {
      notify(`Test échoué : ${err.message}`, 'error');
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

  // Wizard guide (connexion / reconnexion / choix du restaurant)
  const wizardEl = (wizard && provider) ? (
    <LightspeedConnectWizard
      etablissement={etablissement}
      provider={provider}
      mode={wizard}
      onClose={handleWizardClose}
    />
  ) : null;

  // ── Chargement initial ──
  if (loading && !status) {
    return (
      <div style={S.card}>
        <div style={S.row}>
          <IconLS />
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>Vérification de la caisse...</span>
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
              <span style={S.pill('success')}>Connecté</span>
            </div>
            <div style={S.sub}>
              {hasData
                ? `Dernière synchro : ${lastSync}`
                : "Aucune donnée importée. Lancez une première synchronisation."}
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
      <>
        <div style={{ ...S.card, borderColor: 'var(--danger-bd)' }}>
          <div style={S.row}>
            <IconLS />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={S.title}>Lightspeed</span>
                <span style={S.pill('danger')}>Déconnecté</span>
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
                <button type="button" onClick={() => openWizard('reconnect')} style={S.primary(false)}>
                  Reconnecter Lightspeed
                </button>
              </div>
            )}
          </div>
        </div>
        {wizardEl}
      </>
    );
  }

  // ── Selection de location requise ──
  if (needsLocation) {
    return (
      <>
        <div style={{ ...S.card, borderColor: 'var(--warning-bd)' }}>
          <div style={S.row}>
            <IconLS />
            <div style={{ minWidth: 0 }}>
              <span style={S.title}>Sélection du restaurant requise</span>
              <div style={S.sub}>
                {canConnect
                  ? 'Plusieurs restaurants détectés sur ce compte Lightspeed. Choisissez celui de cet établissement pour terminer la connexion.'
                  : 'Plusieurs restaurants détectés sur ce compte Lightspeed. Demandez au patron ou au consultant de finaliser la sélection.'}
              </div>
            </div>
            <div style={S.spacer} />
            {canConnect && (
              <div style={S.actions}>
                <button type="button" onClick={() => openWizard('location')} style={S.primary(false)}>
                  Choisir le restaurant
                </button>
              </div>
            )}
          </div>
        </div>
        {wizardEl}
      </>
    );
  }

  // ── Non connecte ──
  return (
    <>
      <div style={S.card}>
        <div style={{ ...S.row, alignItems: 'flex-start' }}>
          <IconLS />
          <div style={{ minWidth: 0, flex: 1 }}>
            <span style={S.title}>Aucune caisse connectée</span>
            <div style={S.sub}>
              {canConnect
                ? 'Connectez votre caisse Lightspeed en 3 étapes guidées pour synchroniser les ventes et activer les vues cuisine (mise en place, top/flop, conso ingrédients).'
                : "La caisse Lightspeed n'est pas connectée. Demandez à un responsable de la connecter."}
            </div>
          </div>
          {canConnect && (
            <div style={S.actions}>
              <button
                type="button"
                onClick={() => openWizard('connect')}
                disabled={!provider}
                style={S.primary(!provider)}
              >
                Connecter Lightspeed
              </button>
            </div>
          )}
        </div>
      </div>
      {wizardEl}
    </>
  );
}
