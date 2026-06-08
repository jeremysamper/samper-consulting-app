/**
 * PosEmptyState — Empty states réutilisables pour les 3 vues cuisine POS
 *
 * @param {{
 *   type:                'no_mapping' | 'no_sales' | 'no_connection' | 'loading' | 'error',
 *   message?:            string,
 *   onNavigateToMapping?: () => void,
 *   onRetry?:            () => void,
 * }} props
 */
export function PosEmptyState({ type, message, onNavigateToMapping, onRetry }) {
  // ── Loading ─────────────────────────────────────────────────────
  if (type === 'loading') {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
        Chargement des données…
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────
  if (type === 'error') {
    return (
      <div style={{
        background:   'var(--danger-bg-soft)',
        border:       '1px solid #fecaca',
        borderRadius: 10,
        padding:      '20px 24px',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', marginBottom: 2 }}>
            Erreur de chargement
          </div>
          <div style={{ fontSize: 12, color: 'var(--danger-strong)' }}>{message ?? 'Une erreur est survenue.'}</div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              padding:    '6px 14px',
              background: 'var(--surface)',
              border:     '1px solid var(--border)',
              borderRadius: 7,
              fontSize:   12,
              fontWeight: 600,
              color:      'var(--text)',
              cursor:     'pointer',
              fontFamily: 'var(--font)',
              flexShrink: 0,
            }}
          >
            Réessayer
          </button>
        )}
      </div>
    );
  }

  // ── Configs pour les états informatifs ───────────────────────────
  const configs = {
    no_connection: {
      icon:   '◑',
      title:  'Aucune caisse connectée',
      desc:   'Connectez votre caisse Lightspeed avec le bouton en haut de cette page, puis lancez une synchronisation.',
      action: null,
    },
    no_mapping: {
      icon:   '⇄',
      title:  'Aucun plat mappé',
      desc:   'Les vues cuisine nécessitent que vos plats POS soient liés à leurs recettes. Commencez par le mapping.',
      action: onNavigateToMapping
        ? { label: 'Aller au mapping', onClick: onNavigateToMapping }
        : null,
    },
    no_sales: {
      icon:   '◈',
      title:  'Aucune vente sur cette période',
      desc:   message ?? 'Aucune donnée de vente Lightspeed disponible pour la période sélectionnée.',
      action: null,
    },
  };

  const config = configs[type];
  if (!config) return null;

  return (
    <div style={{
      background:    'var(--surface)',
      border:        '1px solid var(--border)',
      borderRadius:  12,
      padding:       '40px 32px',
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      gap:           12,
      textAlign:     'center',
    }}>
      <div style={{ fontSize: 36, opacity: 0.15 }}>{config.icon}</div>
      <div style={{
        fontSize:   15,
        fontWeight: 700,
        fontFamily: 'var(--font-serif)',
        color:      'var(--text)',
      }}>
        {config.title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 400, lineHeight: 1.6 }}>
        {config.desc}
      </div>
      {config.action && (
        <button
          onClick={config.action.onClick}
          style={{
            marginTop:  4,
            padding:    '8px 20px',
            background: 'var(--accent)',
            color:      '#fff',
            border:     'none',
            borderRadius: 8,
            fontSize:   13,
            fontWeight: 600,
            cursor:     'pointer',
            fontFamily: 'var(--font)',
          }}
        >
          {config.action.label}
        </button>
      )}
    </div>
  );
}
