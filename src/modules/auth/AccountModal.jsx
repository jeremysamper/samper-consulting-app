import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { authService, profileService } from '../../services/supabase.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { messageErreur } from '../../utils/messageErreur.js';
import { zurichDateHeure } from '../../utils/zurichTime.js';
import { authErrorMessage } from './authMessages.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Mon compte » : ouvert d'un clic sur son nom, en bas de la barre latérale.
//
//   - prénom, nom : modifiables (le trigger profiles_verrou_champs_sensibles
//     n'autorise que ces colonnes-là à leur propriétaire) ;
//   - téléphone : table profile_contacts, visible par soi, le patron d'un
//     établissement commun et le consultant, pas par les collègues ;
//   - e-mail : lecture seule, seul le consultant le change (verrou en base) ;
//   - mot de passe (modale existante), rangement du menu (consultant) et
//     déconnexion, qui n'est plus dans le header ;
//   - double authentification (consultant) : un code TOTP en plus du mot de
//     passe à chaque nouvelle session. Réservée au consultant : sur un compte
//     partagé par une brigade, un téléphone de plus fermerait la porte à tous.
//
// Styles inline = desktop/tablette ; les classes modal-sheet* en font une
// feuille posée en bas d'écran sur mobile (≤ 767 px), comme ChangePasswordModal.
// ─────────────────────────────────────────────────────────────────────────────

// Souple exprès : +41 79 123 45 67, 079 123 45 67, (022) 310-45-60…
const PHONE_PATTERN = /^\+?[\d\s().-]+$/;

function initialsOf(prenom, nom) {
  return `${(prenom || '').trim().charAt(0)}${(nom || '').trim().charAt(0)}`.toUpperCase();
}

function cleanPhone(value) {
  return value.trim().replace(/\s+/g, ' ');
}

// Clé TOTP lisible à recopier : groupes de quatre caractères.
function groupSecret(secret) {
  return (secret || '').replace(/(.{4})(?=.)/g, '$1 ');
}

// Retrait d'un appareil : un code de n'importe quel appareil inscrit suffit,
// celui qu'on retire peut être le téléphone perdu.
async function verifyWithAnyFactor(factors, firstId, code) {
  const ids = [firstId, ...factors.map((f) => f.id).filter((id) => id !== firstId)];
  let lastError = null;
  for (const id of ids) {
    try {
      await authService.verifyTotp(id, code);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function DoubleAuthSection({ disabled }) {
  const [state, setState] = useState('loading'); // loading | ready | error
  const [factors, setFactors] = useState([]);
  // null, { kind: 'enroll', id, qrCode, secret } ou { kind: 'remove', factorId }
  const [step, setStep] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const { verified } = await authService.listTotpFactors();
      if (!aliveRef.current) return;
      setFactors(verified);
      setState('ready');
    } catch (err) {
      console.warn('[Mon compte] lecture de la double authentification impossible', err);
      if (aliveRef.current) setState('error');
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => { aliveRef.current = false; };
  }, [load]);

  async function startEnroll() {
    setError('');
    setBusy(true);
    try {
      const next = await authService.enrollTotp();
      if (!aliveRef.current) return;
      setCode('');
      setStep({ kind: 'enroll', ...next });
    } catch (err) {
      if (aliveRef.current) setError(authErrorMessage(err, 'Activation impossible pour le moment.'));
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  function startRemove(factorId) {
    setError('');
    setCode('');
    setStep({ kind: 'remove', factorId });
  }

  function cancelStep() {
    // Inscription abandonnée : le facteur jamais vérifié part tout de suite.
    if (step?.kind === 'enroll') {
      authService.unenrollFactor(step.id).catch((err) => console.warn('[Mon compte] facteur non vérifié laissé en place', err));
    }
    setStep(null);
    setCode('');
    setError('');
  }

  async function submitCode(event) {
    event.preventDefault();
    setError('');
    if (code.length !== 6) {
      setError('Le code compte 6 chiffres.');
      return;
    }
    setBusy(true);
    try {
      if (step.kind === 'enroll') {
        await authService.verifyTotp(step.id, code);
        notify('Double authentification activée', 'success');
      } else {
        await verifyWithAnyFactor(factors, step.factorId, code);
        await authService.unenrollFactor(step.factorId);
        notify('Appareil retiré', 'success');
      }
      if (!aliveRef.current) return;
      setStep(null);
      setCode('');
      await load();
    } catch (err) {
      if (!aliveRef.current) return;
      setCode('');
      setError(authErrorMessage(err, 'Code incorrect ou expiré. Saisissez le code affiché en ce moment.'));
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  const locked = disabled || busy;

  return (
    <div>
      <div style={s.sectionTitle}>Double authentification</div>
      {error && <div style={s.errorBox} role="alert">{error}</div>}

      {state === 'loading' && <div style={s.hint}>Chargement…</div>}
      {state === 'error' && <div style={s.hint}>Double authentification indisponible pour le moment.</div>}

      {state === 'ready' && !step && (
        <>
          {factors.length === 0 ? (
            <div style={s.mfaText}>
              Désactivée. Une fois activée, un code à 6 chiffres affiché par votre téléphone vous sera demandé à chaque nouvelle connexion.
            </div>
          ) : (
            <>
              <div style={s.mfaOn}>Activée</div>
              {factors.map((factor) => (
                <div key={factor.id} style={s.factorRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.factorName}>Application d'authentification</div>
                    <div style={s.hint}>
                      <span>Ajoutée le</span> <span>{zurichDateHeure(factor.created_at).date}</span>
                    </div>
                  </div>
                  <button type="button" style={s.removeBtn} onClick={() => startRemove(factor.id)} disabled={locked}>
                    Retirer
                  </button>
                </div>
              ))}
            </>
          )}
          <button type="button" className="sc-pop-item" style={s.action} onClick={startEnroll} disabled={locked}>
            <span style={{ flex: 1 }}>
              {busy ? 'Préparation…' : factors.length === 0 ? 'Activer la double authentification' : 'Ajouter un autre appareil'}
            </span>
            <ChevronRight size={16} aria-hidden="true" style={s.chevron} />
          </button>
        </>
      )}

      {step?.kind === 'enroll' && (
        <>
          <div style={s.mfaText}>
            Scannez ce code avec votre application d'authentification (Google Authenticator, Microsoft Authenticator, 1Password).
          </div>
          <div style={s.qrWrap}>
            <img src={step.qrCode} alt="Code QR à scanner" width={176} height={176} style={{ display: 'block' }} />
          </div>
          <div style={s.mfaText}>Ou saisissez cette clé dans l'application.</div>
          <div style={s.secret} data-no-translate="">{groupSecret(step.secret)}</div>
          <div style={s.mfaText}>Puis saisissez le code à 6 chiffres qu'elle affiche.</div>
        </>
      )}

      {step?.kind === 'remove' && (
        <div style={s.mfaText}>
          Pour confirmer le retrait, saisissez le code affiché par l'un de vos appareils.
        </div>
      )}

      {step && (
        <form onSubmit={submitCode}>
          <label style={s.field}>
            <span style={s.label}>Code</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              style={{ ...s.input, ...s.codeInput }}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              autoFocus
              disabled={locked}
            />
          </label>
          <div style={s.btnRow}>
            <button type="button" style={s.secondary} onClick={cancelStep} disabled={busy}>
              Annuler
            </button>
            <button
              type="submit"
              style={{ ...(step.kind === 'remove' ? s.danger : s.primary), ...s.rowBtn, opacity: locked ? 0.5 : 1 }}
              disabled={locked}
            >
              {busy ? 'Vérification…' : step.kind === 'remove' ? 'Retirer' : 'Activer'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function AccountModal({ user, onClose, onSaved, onChangePassword, onOrganize, onLogout }) {
  const [prenom, setPrenom] = useState(user.prenom || '');
  const [nom, setNom] = useState(user.nom || '');
  const [tel, setTel] = useState('');
  const [savedTel, setSavedTel] = useState('');
  const [telState, setTelState] = useState('loading'); // loading | ready | error
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useBackLayer(true, onClose, 'account');

  useEffect(() => {
    let alive = true;
    profileService.getOwnContact(user.id)
      .then((contact) => {
        if (!alive) return;
        setTel(contact.tel);
        setSavedTel(contact.tel);
        setTelState('ready');
      })
      .catch((err) => {
        console.warn('[Mon compte] lecture du téléphone impossible', err);
        if (alive) setTelState('error');
      });
    return () => { alive = false; };
  }, [user.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || saving) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const nextPrenom = prenom.trim();
  const nextNom = nom.trim();
  const nextTel = cleanPhone(tel);
  const nameChanged = nextPrenom !== (user.prenom || '') || nextNom !== (user.nom || '');
  const telChanged = telState === 'ready' && nextTel !== savedTel;
  const dirty = nameChanged || telChanged;
  const fullName = [user.prenom, user.nom].filter(Boolean).join(' ') || user.email;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!dirty) return;
    if (!nextPrenom) {
      setError('Le prénom ne peut pas être vide.');
      return;
    }
    if (nextTel && (!PHONE_PATTERN.test(nextTel) || nextTel.replace(/\D/g, '').length < 6 || nextTel.length > 32)) {
      setError('Numéro de téléphone invalide : chiffres, espaces et + uniquement.');
      return;
    }

    setSaving(true);
    try {
      if (nameChanged) {
        // Initiales recalculées seulement si elles suivaient l'ancien nom : un
        // avatar posé à la main par le consultant n'est pas écrasé.
        const avatar = !user.avatar || user.avatar === initialsOf(user.prenom, user.nom)
          ? initialsOf(nextPrenom, nextNom)
          : user.avatar;
        const updated = await profileService.updateOwnIdentity(user.id, { prenom: nextPrenom, nom: nextNom, avatar });
        onSaved?.(updated);
      }
      if (telChanged) {
        await profileService.saveOwnContact(user.id, nextTel);
        setSavedTel(nextTel);
        setTel(nextTel);
      }
      notify('Compte mis à jour', 'success');
    } catch (err) {
      setError('Enregistrement impossible. ' + messageErreur(err, 'mon compte'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-sheet-overlay"
      style={s.overlay}
      onClick={saving ? undefined : onClose}
    >
      <div
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
        style={s.card}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={s.head}>
          <span style={s.avatar} aria-hidden="true" data-no-translate="">{user.avatar || initialsOf(user.prenom, user.nom)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="account-title" style={s.title}>Mon compte</div>
            <div style={s.sub} data-no-translate="">{fullName}</div>
          </div>
          <button type="button" style={s.close} onClick={onClose} disabled={saving} aria-label="Fermer">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {error && <div style={s.errorBox} role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={s.row}>
            <label style={s.field}>
              <span style={s.label}>Prénom</span>
              <input
                type="text"
                autoComplete="given-name"
                style={s.input}
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                disabled={saving}
              />
            </label>
            <label style={s.field}>
              <span style={s.label}>Nom</span>
              <input
                type="text"
                autoComplete="family-name"
                style={s.input}
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                disabled={saving}
              />
            </label>
          </div>

          <label style={s.field}>
            <span style={s.label}>Téléphone</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              style={s.input}
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              placeholder={telState === 'loading' ? 'Chargement…' : '+41 79 123 45 67'}
              disabled={saving || telState !== 'ready'}
            />
            <span style={s.hint}>
              {telState === 'error'
                ? 'Téléphone indisponible pour le moment.'
                : 'Visible par vous, votre patron et le consultant.'}
            </span>
          </label>

          <label style={s.field}>
            <span style={s.label}>E-mail</span>
            <input type="email" style={{ ...s.input, ...s.inputReadOnly }} value={user.email || ''} readOnly />
            <span style={s.hint}>Modifiable par le consultant.</span>
          </label>

          <button
            type="submit"
            style={{ ...s.primary, opacity: dirty && !saving ? 1 : 0.5, cursor: dirty && !saving ? 'pointer' : 'default' }}
            disabled={!dirty || saving}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>

        <div style={s.divider} />

        <button type="button" className="sc-pop-item" style={s.action} onClick={onChangePassword} disabled={saving}>
          <span style={{ flex: 1 }}>Changer mon mot de passe</span>
          <ChevronRight size={16} aria-hidden="true" style={s.chevron} />
        </button>
        {onOrganize && (
          <button type="button" className="sc-pop-item" style={s.action} onClick={onOrganize} disabled={saving}>
            <span style={{ flex: 1 }}>Organiser le menu</span>
            <ChevronRight size={16} aria-hidden="true" style={s.chevron} />
          </button>
        )}

        {user.role === 'consultant' && (
          <>
            <div style={s.divider} />
            <DoubleAuthSection disabled={saving} />
          </>
        )}

        <div style={s.divider} />

        <button type="button" style={s.logout} onClick={onLogout} disabled={saving}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0, 22, 32, 0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16,
  },
  card: {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
    padding: '20px 22px', width: 440, maxWidth: '100%', maxHeight: 'calc(100% - 32px)', overflowY: 'auto',
    boxShadow: 'var(--sh-lg)', boxSizing: 'border-box',
  },
  head: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar: {
    width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'var(--accent-light)', color: 'var(--accent)',
    fontSize: 14, fontWeight: 700,
  },
  title: { fontSize: 17, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  sub: { fontSize: 12, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  close: {
    width: 36, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', borderRadius: 8, color: 'var(--text2)', cursor: 'pointer', padding: 0,
  },
  errorBox: {  borderLeft: '2px solid var(--danger-bd)', color: 'var(--danger-text)',
    padding: '10px 0 10px 12px',  fontSize: 12, marginBottom: 14,
  },
  // Deux colonnes qui passent l'une sous l'autre quand la feuille est étroite.
  row: { display: 'flex', flexWrap: 'wrap', columnGap: 12 },
  field: { display: 'flex', flexDirection: 'column', flex: '1 1 160px', minWidth: 0, marginBottom: 12 },
  label: {
    fontSize: 11, fontWeight: 500, color: 'var(--text2)', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  input: {
    width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14,
    color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none',
  },
  inputReadOnly: { color: 'var(--text2)', background: 'var(--surface2)', cursor: 'default' },
  hint: { fontSize: 12, color: 'var(--text3)', marginTop: 5 },
  // flexShrink 0 : empilés en colonne sous la règle tactile globale (min-height 44 px).
  primary: {
    width: '100%', minHeight: 44, flexShrink: 0, marginTop: 4, borderRadius: 8,
    background: 'var(--accent)', color: 'var(--on-accent)', border: '1px solid var(--accent)',
    fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)',
  },
  divider: { height: 1, background: 'var(--border)', margin: '16px 0 8px' },
  action: {
    display: 'flex', alignItems: 'center', width: '100%', minHeight: 44, flexShrink: 0, padding: '0 10px',
    background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text)',
    fontFamily: 'var(--font)', fontSize: 14, fontWeight: 500, textAlign: 'left', cursor: 'pointer',
  },
  chevron: { color: 'var(--text3)', flexShrink: 0 },
  logout: {
    width: '100%', minHeight: 44, flexShrink: 0, marginTop: 4, borderRadius: 8,
    background: 'var(--danger-bg-soft)', color: 'var(--danger-text)', border: '1px solid transparent',
    fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer',
  },

  // Double authentification
  sectionTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text)', padding: '4px 10px 0' },
  mfaText: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, margin: '6px 10px 10px' },
  mfaOn: { fontSize: 13, fontWeight: 700, color: 'var(--success-text)', margin: '6px 10px 4px' },
  factorRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px' },
  factorName: { fontSize: 14, color: 'var(--text)' },
  removeBtn: {
    minHeight: 44, flexShrink: 0, padding: '0 14px', borderRadius: 8, background: 'transparent',
    color: 'var(--danger-text)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 500,
    fontFamily: 'var(--font)', cursor: 'pointer',
  },
  // Fond clair imposé, thème sombre compris : un lecteur de code QR veut du sombre sur clair.
  qrWrap: { width: 'fit-content', margin: '0 auto 10px', padding: 10, borderRadius: 8, background: '#ffffff' },
  secret: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13, color: 'var(--text)',
    background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', margin: '0 10px 10px',
    wordBreak: 'break-all', userSelect: 'all',
  },
  codeInput: { fontFamily: 'var(--font-num)', fontSize: 20, letterSpacing: 6, textAlign: 'center' },
  btnRow: { display: 'flex', gap: 8 },
  rowBtn: { flex: '1 1 0', width: 'auto', minWidth: 0, marginTop: 0, cursor: 'pointer' },
  secondary: {
    flex: '1 1 0', minWidth: 0, minHeight: 44, borderRadius: 8, background: 'transparent', color: 'var(--text)',
    border: '1px solid var(--border)', fontSize: 14, fontWeight: 500, fontFamily: 'var(--font)', cursor: 'pointer',
  },
  danger: {
    minHeight: 44, flexShrink: 0, borderRadius: 8, background: 'var(--danger-fill)', color: 'var(--on-danger)',
    border: '1px solid transparent', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)',
  },
};
