import { useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { getSupabaseConfigState } from '../../services/supabase.js';

export default function Auth({ onSignIn, onResetPassword }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // "Rester connecté 30 jours" — coché par défaut.
  // Si décoché, on stocke un flag sessionStorage après connexion :
  // useAuth.js le lit au prochain boot et déconnecte silencieusement.
  const [rememberMe, setRememberMe] = useState(true);
  const supabaseState = getSupabaseConfigState();

  if (!supabaseState.ready) {
    return (
      <div style={as.screen}>
        <div style={as.panel}>
          <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 10 }}>⚙️</div>
          <div style={as.title}>Configuration requise</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginTop: 14 }}>
            Les variables <code style={as.code}>VITE_SUPABASE_URL</code> et <code style={as.code}>VITE_SUPABASE_ANON_KEY</code> doivent être renseignées dans <code style={as.code}>.env</code>.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 12, padding: 10, background: 'var(--bg)', borderRadius: 8 }}>
            Vos clés Supabase se trouvent dans : <strong>Settings → Data API</strong>
          </div>
        </div>
      </div>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      if (mode === 'signin') {
        await onSignIn(email.trim(), password);
        // Si l'utilisateur n'a pas coché "Rester connecté", on marque la session
        // comme éphémère. useAuth.js effacera la session au prochain boot (nouvelle ouverture PWA).
        if (!rememberMe) {
          try { sessionStorage.setItem('sc_session_only', '1'); } catch (_) {}
        } else {
          try { sessionStorage.removeItem('sc_session_only'); } catch (_) {}
        }
        notify('Connexion réussie');
      } else {
        if (!email.trim()) {
          setError('Saisissez votre email.');
          return;
        }
        await onResetPassword(email.trim());
        setInfo("Si ce compte existe, un email de réinitialisation vient d'être envoyé.");
      }
    } catch (err) {
      const fallback = mode === 'signin' ? 'Email ou mot de passe incorrect.' : 'Erreur pendant la demande.';
      setError(err?.message === 'Invalid login credentials' ? fallback : err?.message || fallback);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={as.screen}>
      <div style={as.panel}>
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

        <form onSubmit={handleSubmit}>
          <div style={as.field}>
            <label style={as.label}>Email</label>
            <input
              type="email"
              autoComplete="email"
              style={as.input}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>
          )}

          {mode === 'signin' && (
            <label style={as.rememberLabel}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={as.rememberCheckbox}
                disabled={loading}
              />
              <span>Rester connecté 30 jours</span>
            </label>
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
}

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
  errorBox: { background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)', color: 'var(--danger-text)', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 },
  infoBox: { background: 'var(--info-bg-soft)', border: '1px solid var(--info-bd)', color: 'var(--info-text)', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 },
  rememberLabel: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text2)', cursor: 'pointer', userSelect: 'none', marginTop: 4, marginBottom: 14 },
  rememberCheckbox: { width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 },
  footer: { marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.5 },
  code: { background: 'var(--bg)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 11 }
};
