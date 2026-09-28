import { useEffect, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { profileService } from '../../services/supabase.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Mon compte » : ouvert d'un clic sur son nom, en bas de la barre latérale.
//
//   - prénom, nom : modifiables (le trigger profiles_verrou_champs_sensibles
//     n'autorise que ces colonnes-là à leur propriétaire) ;
//   - téléphone : table profile_contacts, visible par soi, le patron d'un
//     établissement commun et le consultant, pas par les collègues ;
//   - e-mail : lecture seule, seul le consultant le change (verrou en base) ;
//   - mot de passe (modale existante), rangement du menu (consultant) et
//     déconnexion, qui n'est plus dans le header.
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
      setError('Enregistrement impossible : ' + (err?.message || err));
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
            <X size={18} aria-hidden="true" />
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
                : 'Visible par toi, ton patron et le consultant.'}
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
  sub: { fontSize: 12.5, color: 'var(--text2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  close: {
    width: 36, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', borderRadius: 8, color: 'var(--text2)', cursor: 'pointer', padding: 0,
  },
  errorBox: {
    background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)', color: 'var(--danger-text)',
    padding: '10px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 14,
  },
  // Deux colonnes qui passent l'une sous l'autre quand la feuille est étroite.
  row: { display: 'flex', flexWrap: 'wrap', columnGap: 12 },
  field: { display: 'flex', flexDirection: 'column', flex: '1 1 160px', minWidth: 0, marginBottom: 12 },
  label: {
    fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  input: {
    width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14,
    color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none',
  },
  inputReadOnly: { color: 'var(--text2)', background: 'var(--surface2)', cursor: 'default' },
  hint: { fontSize: 11.5, color: 'var(--text3)', marginTop: 5 },
  // flexShrink 0 : empilés en colonne sous la règle tactile globale (min-height 44 px).
  primary: {
    width: '100%', minHeight: 44, flexShrink: 0, marginTop: 4, borderRadius: 8,
    background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)',
    fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font)',
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
    background: 'transparent', color: 'var(--danger-text)', border: '1px solid var(--danger-bd)',
    fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer',
  },
};
