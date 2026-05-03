// ═══════════════════════════════════════════════════════════════
// TOAST — Système de notifications légères, non bloquantes
// ═══════════════════════════════════════════════════════════════
// API publique :
//   window.notify(message, type)        → type: 'info' | 'success' | 'error' | 'warning'
//   window.notify('Sauvegardé')         → success par défaut si pas de type
//   window.notify('Erreur', 'error')
//   window.notify('Heads up', 'warning', { duration: 5000 })
//
// Remplacement direct de alert() :
//   alert('Erreur : ' + err.message);            ← AVANT
//   window.notify('Erreur : ' + err.message, 'error');  ← APRÈS
//
// Position : bas-centre, mobile-first (ne couvre pas le menu hamburger en haut)
// Auto-dismiss après 3.5s (configurable via opts.duration)
// Empilement vertical des toasts
// ═══════════════════════════════════════════════════════════════

(function() {
  // État partagé : liste des toasts actifs
  let toasts = [];
  let nextId = 1;
  let listeners = [];

  const subscribe = (fn) => {
    listeners.push(fn);
    return () => { listeners = listeners.filter(l => l !== fn); };
  };
  const emit = () => listeners.forEach(fn => fn(toasts));

  // API publique
  window.notify = (message, type = 'success', opts = {}) => {
    const id = nextId++;
    const duration = typeof opts.duration === 'number' ? opts.duration : 3500;
    const toast = {
      id,
      message: String(message || ''),
      type: ['info', 'success', 'error', 'warning'].includes(type) ? type : 'info',
      createdAt: Date.now(),
    };
    toasts = [...toasts, toast];
    emit();
    if (duration > 0) {
      setTimeout(() => window.dismissNotify(id), duration);
    }
    return id;
  };

  window.dismissNotify = (id) => {
    toasts = toasts.filter(t => t.id !== id);
    emit();
  };

  // Composant React rendu globalement (mounté depuis index.html)
  window.ToastContainer = () => {
    const [list, setList] = React.useState([]);
    React.useEffect(() => {
      const unsub = subscribe(setList);
      return unsub;
    }, []);

    if (list.length === 0) return null;

    return (
      <div style={tst.container}>
        {list.map(t => (
          <div
            key={t.id}
            style={{ ...tst.toast, ...tst[t.type] }}
            onClick={() => window.dismissNotify(t.id)}
            role="status"
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
          >
            <span style={tst.icon}>
              {t.type === 'success' ? '✓' :
               t.type === 'error'   ? '✕' :
               t.type === 'warning' ? '⚠' : 'ℹ'}
            </span>
            <span style={tst.message}>{t.message}</span>
            <span style={tst.dismiss}>×</span>
          </div>
        ))}
      </div>
    );
  };

  const tst = {
    container: {
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      pointerEvents: 'none',
      maxWidth: 'calc(100vw - 32px)',
      width: 'auto',
    },
    toast: {
      pointerEvents: 'auto',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '12px 16px',
      borderRadius: 10,
      minWidth: 260,
      maxWidth: 480,
      fontSize: 13,
      fontFamily: 'var(--font, -apple-system, sans-serif)',
      lineHeight: 1.45,
      cursor: 'pointer',
      boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
      animation: 'sc-toast-in 0.22s ease-out',
      backgroundColor: '#1f2937',
      color: '#fff',
      border: '1px solid transparent',
    },
    icon: { fontSize: 16, fontWeight: 700, flexShrink: 0, marginTop: 1 },
    message: { flex: 1, wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
    dismiss: { fontSize: 18, opacity: 0.5, flexShrink: 0, marginLeft: 4 },
    success: { backgroundColor: '#15803d', borderColor: '#166534' },
    error:   { backgroundColor: '#b91c1c', borderColor: '#991b1b' },
    warning: { backgroundColor: '#b45309', borderColor: '#92400e' },
    info:    { backgroundColor: '#1f2937', borderColor: '#374151' },
  };

  // Animation CSS injectée (une seule fois)
  if (typeof document !== 'undefined' && !document.getElementById('sc-toast-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'sc-toast-style';
    styleEl.textContent = `
      @keyframes sc-toast-in {
        from { opacity: 0; transform: translateY(8px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(styleEl);
  }
})();
