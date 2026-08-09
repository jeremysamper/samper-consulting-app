import { useState } from 'react';
import SamperMark from '../../components/brand/SamperMark.jsx';
import { notify } from '../../components/toast/index.js';
import { authService } from '../../services/supabase.js';
import { authErrorMessage, MIN_PASSWORD_LENGTH, validateNewPassword } from './authMessages.js';
import { authStyles as as } from './authStyles.js';

/**
 * Écran « nouveau mot de passe », affiché quand l'app est ouverte depuis le
 * lien reçu par mail. Le lien a déjà ouvert une session côté supabase-js : il
 * ne reste qu'à poser le nouveau mot de passe.
 *
 * @param ready       l'état d'auth est résolu (INITIAL_SESSION passé)
 * @param hasSession  le lien a bien ouvert une session (sinon lien mort)
 * @param email       adresse du compte concerné, pour lever tout doute
 * @param linkErrorCode  code d'erreur renvoyé dans l'URL (otp_expired…)
 * @param onDismiss   quitte l'écran (URL nettoyée par le hook appelant)
 */
export default function ResetPassword({ ready, hasSession, email, linkErrorCode, onDismiss }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [reveal, setReveal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Lien mort : soit Supabase l'a explicitement refusé (#error=…), soit il n'a
  // ouvert aucune session. Dans les deux cas, inutile d'afficher le formulaire.
  const linkIsDead = ready && (Boolean(linkErrorCode) || !hasSession);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const invalid = validateNewPassword(password, confirmation);
    if (invalid) {
      setError(invalid);
      return;
    }

    setLoading(true);
    try {
      await authService.updatePassword(password);
      notify('Mot de passe mis à jour', 'success');
      // La session ouverte par le lien reste valable : on entre dans l'app sans
      // refaire saisir l'identifiant qui vient d'être choisi.
      onDismiss();
    } catch (err) {
      setError(authErrorMessage(err, 'Impossible de mettre à jour le mot de passe.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={as.screen}>
      <div style={as.panel}>
        <div style={as.logoWrap}>
          <SamperMark size={48} radius={10} title={null} />
          <div style={as.brandText}>
            <div style={as.brandTitle}>Samper Consulting</div>
            <div style={as.brandSub}>Gestion culinaire professionnelle</div>
          </div>
        </div>

        <div style={as.title}>Nouveau mot de passe</div>

        {!ready && (
          <div style={as.infoBox}>Vérification du lien…</div>
        )}

        {linkIsDead && (
          <>
            <div style={as.errorBox}>
              Ce lien a expiré ou a déjà été utilisé. Les liens de réinitialisation
              ne sont valables qu'une heure et une seule fois.
            </div>
            <div style={as.hint}>
              Retourne à l'écran de connexion, clique sur « Mot de passe oublié ? »
              et ouvre le nouveau mail sur ce même appareil.
            </div>
            <button type="button" style={as.submitBtn} onClick={onDismiss}>
              Retour à la connexion
            </button>
          </>
        )}

        {ready && !linkIsDead && (
          <>
            <div style={as.hint}>
              Choisis un nouveau mot de passe pour ce compte.
              {email ? <><br /><span style={as.emailBadge}>{email}</span></> : null}
            </div>

            {error && <div style={as.errorBox}>{error}</div>}

            <form onSubmit={handleSubmit}>
              <div style={as.field}>
                <label style={as.label}>Nouveau mot de passe</label>
                <input
                  type={reveal ? 'text' : 'password'}
                  autoComplete="new-password"
                  style={as.input}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={`${MIN_PASSWORD_LENGTH} caractères minimum`}
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div style={as.field}>
                <label style={as.label}>Confirmer le mot de passe</label>
                <input
                  type={reveal ? 'text' : 'password'}
                  autoComplete="new-password"
                  style={as.input}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder="Retape le même mot de passe"
                  required
                  disabled={loading}
                />
                <button type="button" style={as.toggleReveal} onClick={() => setReveal(v => !v)}>
                  {reveal ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
                </button>
              </div>

              <button
                type="submit"
                style={{ ...as.submitBtn, opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }}
                disabled={loading}
              >
                {loading ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
              </button>
            </form>

            <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12 }}>
              <button type="button" onClick={onDismiss} style={as.linkBtn}>
                Annuler
              </button>
            </div>
          </>
        )}

        <div style={as.footer}>
          Un souci persistant ? Contacte le consultant, il peut réinitialiser
          l'accès depuis le module <strong>Rôles &amp; Accès</strong>.
        </div>
      </div>
    </div>
  );
}
