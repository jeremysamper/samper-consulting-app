import { useState } from 'react';
import SamperMark from '../../components/brand/SamperMark.jsx';
import { notify } from '../../components/toast/index.js';
import { getSupabaseConfigState } from '../../services/supabase.js';
import { authErrorMessage } from './authMessages.js';
import { authStyles as as } from './authStyles.js';

// mfa : { factorId } quand le compte a un facteur vérifié et que la session
// est encore aal1 (juste après le mot de passe, ou à l'ouverture de l'app) ;
// l'écran passe alors à l'étape « code ».
export default function Auth({ onSignIn, onResetPassword, onNavigateToDashboard, mfa, onVerifyMfa, onCancelMfa }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  // "Rester connecté 30 jours" - coché par défaut.
  // Si décoché, on stocke un flag sessionStorage après connexion :
  // useAuth.js le lit au prochain boot et déconnecte silencieusement.
  const [rememberMe, setRememberMe] = useState(true);
  const supabaseState = getSupabaseConfigState();

  if (!supabaseState.ready) {
    return (
      <div style={as.screen}>
        <div style={as.panel}>
          <div style={as.title}>Configuration requise</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginTop: 14 }}>
            Les variables <code style={as.code}>VITE_SUPABASE_URL</code> et <code style={as.code}>VITE_SUPABASE_ANON_KEY</code> doivent être renseignées dans <code style={as.code}>.env</code>.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 12, padding: 10, background: 'var(--bg)', borderRadius: 8 }}>
            Vos clés Supabase se trouvent dans : <strong>Settings</strong>, puis <strong>Data API</strong>.
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
        const result = await onSignIn(email.trim(), password);
        // Si l'utilisateur n'a pas coché "Rester connecté", on marque la session
        // comme éphémère. useAuth.js effacera la session au prochain boot (nouvelle ouverture PWA).
        if (!rememberMe) {
          try { sessionStorage.setItem('sc_session_only', '1'); } catch (_) {}
        } else {
          try { sessionStorage.removeItem('sc_session_only'); } catch (_) {}
        }
        // Compte avec double authentification : l'écran passe au code (prop mfa).
        if (result?.mfaRequired) return;
        // SIGNED_IN (nouvelle connexion manuelle) → toujours dashboard
        // TOKEN_REFRESHED (reconnexion silencieuse) → dernière page visitée (géré par readInitialPage)
        onNavigateToDashboard?.();
        notify('Connexion réussie');
      } else {
        if (!email.trim()) {
          setError('Saisissez votre email.');
          return;
        }
        await onResetPassword(email.trim());
        setInfo("Si ce compte existe, un email de réinitialisation vient d'être envoyé. Le lien est valable une heure et une seule fois : ouvrez-le sur cet appareil. Pensez à regarder dans les indésirables.");
      }
    } catch (err) {
      const fallback = mode === 'signin' ? 'Email ou mot de passe incorrect.' : 'Erreur pendant la demande.';
      setError(authErrorMessage(err, fallback));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    setError('');
    if (code.length !== 6) {
      setError('Le code compte 6 chiffres.');
      return;
    }
    setLoading(true);
    try {
      await onVerifyMfa(code);
      onNavigateToDashboard?.();
      notify('Connexion réussie');
    } catch (err) {
      setCode('');
      setError(authErrorMessage(err, 'Code incorrect ou expiré. Saisissez le code affiché en ce moment.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelMfa() {
    setError('');
    setCode('');
    setPassword('');
    try {
      await onCancelMfa();
    } catch (err) {
      setError(authErrorMessage(err, 'La déconnexion a échoué. Réessayez.'));
    }
  }

  const brand = (
    <div style={as.logoWrap}>
      <SamperMark size={48} radius={10} title={null} />
      <div style={as.brandText}>
        <div style={as.brandTitle} data-no-translate="">Ritmo</div>
        <div style={as.brandSub}>Gestion culinaire, par Samper Consulting</div>
      </div>
    </div>
  );

  if (mfa) {
    return (
      <div style={as.screen}>
        <div style={as.panel}>
          {brand}
          <div style={as.title}>Code de vérification</div>
          <div style={as.hint}>Saisissez le code à 6 chiffres affiché par votre application d'authentification.</div>

          {error && <div style={as.errorBox} role="alert">{error}</div>}

          <form onSubmit={handleVerify}>
            <div style={as.field}>
              <label style={as.label} htmlFor="mfa-code">Code</label>
              <input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                style={{ ...as.input, ...as.codeInput }}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                autoFocus
                disabled={loading}
              />
            </div>

            <button type="submit" style={{ ...as.submitBtn, opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }} disabled={loading}>
              {loading ? 'Vérification…' : 'Valider'}
            </button>
          </form>

          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12 }}>
            <button type="button" onClick={handleCancelMfa} style={as.linkBtn} disabled={loading}>
              Utiliser un autre compte
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={as.screen}>
      <div style={as.panel}>
        {brand}

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
              Retour à la connexion
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
