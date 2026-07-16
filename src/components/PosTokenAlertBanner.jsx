import React from 'react';

/**
 * PosTokenAlertBanner
 *
 * Bandeau d'alerte global affiché quand ≥1 connexion POS est dégradée.
 * Persistant - pas de bouton "Ignorer" (c'est un état métier, pas une notif).
 *
 * variant='banner'  → bande pleine largeur, au-dessus du header (desktop)
 * variant='pill'    → pastille rouge compacte dans la barre de boutons (mobile)
 *
 * @param {object}   props
 * @param {Array}    props.unhealthy     Liste des connexions dégradées (depuis usePosConnectionHealth)
 * @param {function} props.onReconnect   Callback → navigate vers Paramètres (Option A)
 * @param {string}   [props.variant]     'banner' (défaut) | 'pill'
 */
export default function PosTokenAlertBanner({ unhealthy = [], onReconnect, variant = 'banner' }) {
  if (!unhealthy.length) return null;

  const n = unhealthy.length;
  const message = n === 1
    ? `⚠ Lightspeed déconnecté pour ${unhealthy[0].nom} - la sync des ventes est en pause.`
    : `⚠ Lightspeed déconnecté pour ${n} établissements - la sync est en pause.`;

  // ── Pastille mobile ──────────────────────────────────────────────
  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={onReconnect}
        title={message}
        aria-label={message}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: 'var(--danger-strong, var(--danger-strong))',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          fontWeight: 700,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        ⚠
      </button>
    );
  }

  // ── Bandeau desktop ──────────────────────────────────────────────
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '9px 20px',
        background: 'var(--danger-soft, var(--danger-bg-soft))',
        borderBottom: '2px solid var(--danger-strong, var(--danger-strong))',
        flexShrink: 0,
      }}
    >
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--danger-strong, var(--danger-text))',
        fontFamily: 'var(--font)',
        lineHeight: 1.4,
      }}>
        {message}
      </span>
      <button
        type="button"
        onClick={onReconnect}
        style={{
          padding: '5px 14px',
          borderRadius: 6,
          border: '1.5px solid var(--danger-strong, var(--danger-strong))',
          background: 'transparent',
          color: 'var(--danger-strong, var(--danger-strong))',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'var(--font)',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        Reconnecter →
      </button>
    </div>
  );
}
