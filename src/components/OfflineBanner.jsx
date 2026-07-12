import { useSyncExternalStore } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { getPendingPunchCount, subscribePendingPunches } from '../services/offline/punchSync.js';
import { applyPwaUpdate, isPwaUpdateReady, subscribePwaUpdate } from '../pwa/registerPwa.js';

/**
 * OfflineBanner
 *
 * Bandeau d'état global, décliné du pattern PosTokenAlertBanner (J6a) :
 * bande fine, visible mais non bloquante, intégrée sous le header mobile
 * et au-dessus du header desktop. Trois états, par priorité :
 *
 *   1. hors-ligne          -> tokens warning + nombre de punches en attente
 *   2. punches en attente  -> tokens info (réseau revenu, sync en cours) ;
 *                             disparaît seul une fois la file vidée
 *   3. mise à jour dispo   -> bouton « Mettre à jour » (skipWaiting maîtrisé)
 *
 * Aucun bouton « Ignorer » : c'est un état, pas une notification.
 */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  const pending = useSyncExternalStore(subscribePendingPunches, getPendingPunchCount, () => 0);
  const updateReady = useSyncExternalStore(subscribePwaUpdate, isPwaUpdateReady, () => false);

  const punchLabel = `${pending} pointage${pending > 1 ? 's' : ''} en attente de synchronisation`;

  if (!online) {
    return (
      <Band
        kind="warning"
        text={pending > 0
          ? `Hors ligne · ${punchLabel}`
          : 'Hors ligne : les pointages et les fiches déjà chargées restent disponibles'}
      />
    );
  }
  if (pending > 0) {
    return <Band kind="info" text={`${punchLabel}...`} />;
  }
  if (updateReady) {
    return (
      <Band
        kind="info"
        text="Nouvelle version de l'app disponible"
        action={{ label: 'Mettre à jour', onClick: applyPwaUpdate }}
      />
    );
  }
  return null;
}

function Band({ kind, text, action }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '7px 16px',
        background: `var(--${kind}-bg-soft, var(--${kind}-bg))`,
        borderBottom: `1.5px solid var(--${kind}-bd, var(--${kind}-text))`,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: `var(--${kind}-text)`,
          fontFamily: 'var(--font)',
          lineHeight: 1.4,
          textAlign: 'center',
        }}
      >
        {text}
      </span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: `1.5px solid var(--${kind}-text)`,
            background: 'transparent',
            color: `var(--${kind}-text)`,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'var(--font)',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
