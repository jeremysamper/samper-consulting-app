// Styles partagés des écrans plein écran d'authentification (connexion et
// réinitialisation du mot de passe). Un seul objet pour que les deux écrans
// restent rigoureusement identiques : c'est la première chose que voit un
// nouveau membre de brigade.
export const authStyles = {
  screen: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)', fontFamily: 'var(--font)' },
  panel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '32px 36px', width: 440, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 },
  brandText: { flex: 1 },
  brandTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  brandSub: { fontSize: 11, color: 'var(--text2)', marginTop: 2 },
  title: { fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', marginBottom: 18 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { width: '100%', padding: '11px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none' },
  submitBtn: { width: '100%', padding: '12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', marginTop: 4 },
  linkBtn: { background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)', padding: 4 },
  errorBox: { background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)', color: 'var(--danger-text)', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 },
  infoBox: { background: 'var(--info-bg-soft)', border: '1px solid var(--info-bd)', color: 'var(--info-text)', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 },
  rememberLabel: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text2)', cursor: 'pointer', userSelect: 'none', marginTop: 4, marginBottom: 14 },
  rememberCheckbox: { width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 },
  footer: { marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.5 },
  code: { background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 11 },

  // Spécifique à l'écran « nouveau mot de passe »
  hint: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 18 },
  emailBadge: { display: 'inline-block', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginTop: 4 },
  toggleReveal: { background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font)', padding: 0, marginTop: 6 },
};
