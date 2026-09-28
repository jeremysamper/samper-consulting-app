import { ChevronRight } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Pied de la barre latérale et du tiroir mobile : le nom de l'utilisateur, et
// rien d'autre à l'écran. Un clic ouvre « Mon compte » (AccountModal) : nom,
// téléphone, mot de passe, déconnexion.
// ─────────────────────────────────────────────────────────────────────────────

export default function AccountButton({ user, onOpen, variant = 'desktop' }) {
  const mobile = variant === 'mobile';
  const fullName = [user?.prenom, user?.nom].filter(Boolean).join(' ') || user?.email || 'Mon compte';
  const initials = user?.avatar || fullName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <button
      type="button"
      className="sc-nav-account"
      style={{ ...s.trigger, ...(mobile ? s.triggerMobile : null) }}
      onClick={(e) => { e.stopPropagation(); onOpen?.(); }}
      aria-haspopup="dialog"
      // Nom accessible = le nom affiché. Pas d'aria-label composé : une chaîne
      // par utilisateur partirait à la traduction IA.
      title="Mon compte"
    >
      <span style={{ ...s.avatar, ...(mobile ? s.avatarMobile : null) }} aria-hidden="true" data-no-translate="">{initials}</span>
      <span style={{ ...s.name, ...(mobile ? s.nameMobile : null) }} data-no-translate="">{fullName}</span>
      <ChevronRight size={15} aria-hidden="true" style={s.chevron} />
    </button>
  );
}

const s = {
  trigger: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44,
    padding: '6px 10px', background: 'none', border: 'none', borderRadius: 'var(--r-sm)',
    color: 'var(--nav-text-active)', fontFamily: 'var(--font)', cursor: 'pointer', textAlign: 'left',
  },
  triggerMobile: { minHeight: 52, padding: '6px 12px' },
  // Initiales neutres : l'ancienne pastille à la couleur du rôle se fondait
  // dans l'encre pétrole (consultant #003042 sur #032d3f ≈ 1:1).
  avatar: {
    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--nav-active)', border: '1px solid var(--nav-border)',
    color: 'var(--nav-text-active)', fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
  },
  avatarMobile: { width: 32, height: 32, fontSize: 12 },
  name: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  nameMobile: { fontSize: 14 },
  chevron: { flexShrink: 0, color: 'var(--nav-text)' },
};
