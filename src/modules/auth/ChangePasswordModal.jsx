import { useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { authService } from '../../services/supabase.js';
import { authErrorMessage, MIN_PASSWORD_LENGTH, validateNewPassword } from './authMessages.js';

/**
 * Changement volontaire du mot de passe, pour un utilisateur déjà connecté.
 * Le mot de passe actuel est revérifié avant d'en poser un nouveau : un poste
 * laissé ouvert en cuisine ne doit pas suffire à s'approprier le compte.
 */
export default function ChangePasswordModal({ email, onClose }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [reveal, setReveal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!current) {
      setError('Saisis ton mot de passe actuel.');
      return;
    }
    const invalid = validateNewPassword(password, confirmation);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (current === password) {
      setError('Le nouveau mot de passe doit être différent de l’ancien.');
      return;
    }

    setLoading(true);
    try {
      try {
        await authService.verifyPassword(email, current);
      } catch (_) {
        // On ne relaie pas le message Supabase ici : la seule cause utile est
        // « ce n'est pas le bon mot de passe actuel ».
        setError('Mot de passe actuel incorrect.');
        return;
      }

      await authService.updatePassword(password);
      notify('Mot de passe mis à jour', 'success');
      onClose();
    } catch (err) {
      setError(authErrorMessage(err, 'Impossible de mettre à jour le mot de passe.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    // Styles inline = desktop/tablette ; les classes modal-* ne stylent qu'en
    // mobile (≤767px), où la modale devient une feuille posée en bas d'écran.
    <div
      className="modal-sheet-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1200, padding: 16,
      }}
      onClick={loading ? undefined : onClose}
    >
      <div
        className="modal-sheet"
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: '22px 24px', width: 420, maxWidth: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)', boxSizing: 'border-box',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={s.title}>Changer mon mot de passe</div>
        <div style={s.sub}>{email}</div>

        {error && <div style={s.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={s.field}>
            <label style={s.label}>Mot de passe actuel</label>
            <input
              type="password"
              autoComplete="current-password"
              style={s.input}
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
              disabled={loading}
              autoFocus
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Nouveau mot de passe</label>
            <input
              type={reveal ? 'text' : 'password'}
              autoComplete="new-password"
              style={s.input}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={`${MIN_PASSWORD_LENGTH} caractères minimum`}
              required
              disabled={loading}
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Confirmer le nouveau mot de passe</label>
            <input
              type={reveal ? 'text' : 'password'}
              autoComplete="new-password"
              style={s.input}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              disabled={loading}
            />
            <button type="button" style={s.toggleReveal} onClick={() => setReveal(v => !v)}>
              {reveal ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
            </button>
          </div>

          {/* flexShrink: 0 — sans lui la règle tactile globale (min-height 44px)
              écrase la hauteur des boutons en colonne sur mobile. */}
          <div style={s.actions}>
            <button type="button" style={{ ...s.btn, ...s.btnGhost }} onClick={onClose} disabled={loading}>
              Annuler
            </button>
            <button
              type="submit"
              style={{ ...s.btn, ...s.btnPrimary, opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }}
              disabled={loading}
            >
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const s = {
  title: { fontSize: 17, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  sub: { fontSize: 12, color: 'var(--text2)', marginTop: 3, marginBottom: 16, wordBreak: 'break-all' },
  field: { marginBottom: 13 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { width: '100%', padding: '10px 13px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none' },
  toggleReveal: { background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--font)', padding: 0, marginTop: 6 },
  errorBox: { background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)', color: 'var(--danger-text)', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 },
  actions: { display: 'flex', gap: 10, marginTop: 18 },
  // minHeight 44 et non 42 : posé en inline, il prendrait le pas sur la règle
  // tactile globale (button:not(.mini) { min-height: 44px }) sur mobile.
  btn: { flex: 1, flexShrink: 0, minHeight: 44, borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer' },
  btnGhost: { background: 'var(--bg)', color: 'var(--text2)', border: '1px solid var(--border)' },
  btnPrimary: { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' },
};
