// ═══════════════════════════════════════════════════════════════
// AUTH — Écran de connexion Supabase
// ═══════════════════════════════════════════════════════════════

const Auth = ({ onLogin }) => {
  const [mode, setMode] = React.useState('signin'); // signin | reset
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [info, setInfo] = React.useState('');

  if (!window.SB) {
    return (
      <div style={as.screen}>
        <div style={as.panel}>
          <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 10 }}>⚙️</div>
          <div style={as.title}>Configuration requise</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginTop: 14 }}>
            Le fichier <code style={as.code}>components/config.js</code> n'est pas configuré.
            Ouvrez-le et remplacez les valeurs <code style={as.code}>VOTRE-PROJET.supabase.co</code> et
            <code style={as.code}>VOTRE_ANON_KEY_ICI</code> par les vraies clés de votre projet Supabase.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 12, padding: 10, background: 'var(--bg)', borderRadius: 8 }}>
            💡 Vos clés Supabase se trouvent dans : <strong>Settings → Data API</strong>
          </div>
        </div>
      </div>
    );
  }

  const handleSignIn = async (e) => {
    if (e) e.preventDefault();
    setError(''); setInfo(''); setLoading(true);
    try {
      const { user } = await window.SB.auth.signIn(email.trim(), password);
      if (user) {
        const profile = await window.SB.db.getProfile(user.id);
        if (!profile) {
          setError('Compte créé mais profil introuvable. Contactez le consultant.');
          setLoading(false);
          return;
        }
        if (profile.actif === false) {
          setError('Ce compte a été désactivé. Contactez le consultant.');
          await window.SB.auth.signOut();
          setLoading(false);
          return;
        }
        onLogin(profile);
      }
    } catch (err) {
      setError(err.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' : (err.message || 'Erreur de connexion.'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    if (e) e.preventDefault();
    if (!email.trim()) { setError('Saisissez votre email.'); return; }
    setError(''); setInfo(''); setLoading(true);
    try {
      await window.SB.auth.resetPassword(email.trim());
      setInfo('Si ce compte existe, un email de réinitialisation vient d\'être envoyé.');
    } catch (err) {
      setError(err.message || 'Erreur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={as.screen}>
      <div style={as.panel}>
        {/* Logo header */}
        <div style={as.logoWrap}>
          <div style={as.logoBox}>SC</div>
          <div style={as.brandText}>
            <div style={as.brandTitle}>Samper Consulting</div>
            <div style={as.brandSub}>Gestion culinaire professionnelle</div>
          </div>
        </div>

        <div style={as.title}>{mode === 'signin' ? 'Connexion' : 'Réinitialiser le mot de passe'}</div>

        {error && <div style={as.errorBox}>{error}</div>}
        {info && <div style={as.infoBox}>{info}</div>}

        <form onSubmit={mode === 'signin' ? handleSignIn : handleReset}>
          <div style={as.field}>
            <label style={as.label}>Email</label>
            <input
              type="email"
              autoComplete="email"
              style={as.input}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="prenom.nom@exemple.com"
              required
              disabled={loading}
            />
          </div>

          {mode === 'signin' && (
            <div style={as.field}>
              <label style={as.label}>Mot de passe</label>
              <input
                type="password"
                autoComplete="current-password"
                style={as.input}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>
          )}

          <button type="submit" style={{ ...as.submitBtn, opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }} disabled={loading}>
            {loading ? 'Chargement…' : mode === 'signin' ? 'Se connecter' : 'Envoyer le lien'}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12 }}>
          {mode === 'signin' ? (
            <button type="button" onClick={() => { setMode('reset'); setError(''); setInfo(''); }} style={as.linkBtn}>
              Mot de passe oublié ?
            </button>
          ) : (
            <button type="button" onClick={() => { setMode('signin'); setError(''); setInfo(''); }} style={as.linkBtn}>
              ← Retour à la connexion
            </button>
          )}
        </div>

        <div style={as.footer}>
          Les comptes sont créés par le consultant depuis le module <strong>Rôles & Accès</strong>.
        </div>
      </div>
    </div>
  );
};

const as = {
  screen: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)', fontFamily: 'var(--font)' },
  panel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '32px 36px', width: 440, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 },
  logoBox: { width: 48, height: 48, borderRadius: 10, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)', letterSpacing: 1 },
  brandText: { flex: 1 },
  brandTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  brandSub: { fontSize: 11, color: 'var(--text2)', marginTop: 2 },
  title: { fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', marginBottom: 18 },
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { width: '100%', padding: '11px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none' },
  submitBtn: { width: '100%', padding: '12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', marginTop: 4 },
  linkBtn: { background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)', padding: 4 },
  errorBox: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 },
  infoBox: { background: '#dbeafe', border: '1px solid #93c5fd', color: '#1e40af', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 },
  footer: { marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.5 },
  code: { background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 11 },
};

Object.assign(window, { Auth });
