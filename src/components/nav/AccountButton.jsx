import { ChevronRight } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Pied de la barre latérale et du tiroir mobile : le nom de l'utilisateur, et
// rien d'autre à l'écran. Un clic ouvre « Mon compte » (AccountModal) : nom,
// téléphone, mot de passe, déconnexion.
// ─────────────────────────────────────────────────────────────────────────────

// Variantes : 'desktop' (pied de barre), 'mobile' (pied du tiroir), 'accueil'
// (en-tête de la page d'accueil tactile, sur fond clair : couleurs du texte,
// pas celles de l'encre de la barre). `style` : ajustement de l'appelant
// (pleine largeur sur téléphone).
export default function AccountButton({ user, onOpen, variant = 'desktop', style }) {
  const mobile = variant === 'mobile';
  const accueil = variant === 'accueil';
  const fullName = [user?.prenom, user?.nom].filter(Boolean).join(' ') || user?.email || 'Mon compte';
  const initials = user?.avatar || fullName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <button
      type="button"
      className={accueil ? 'sc-accueil-account' : 'sc-nav-account'}
      style={{ ...s.trigger, ...(mobile ? s.triggerMobile : null), ...(accueil ? s.triggerAccueil : null), ...style }}
      onClick={(e) => { e.stopPropagation(); onOpen?.(); }}
      aria-haspopup="dialog"
      // Nom accessible = le nom affiché. Pas d'aria-label composé : une chaîne
      // par utilisateur partirait à la traduction IA.
      title="Mon compte"
    >
      <span style={{ ...s.avatar, ...(mobile ? s.avatarMobile : null), ...(accueil ? s.avatarAccueil : null) }} aria-hidden="true" data-no-translate="">{initials}</span>
      <span style={{ ...s.name, ...(mobile ? s.nameMobile : null) }} data-no-translate="">{fullName}</span>
      <ChevronRight size={15} aria-hidden="true" style={{ ...s.chevron, ...(accueil ? s.chevronAccueil : null) }} />
    </button>
  );
}

const s = {
  trigger: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44,
    padding: '6px 10px', background: 'none', border: 'none', borderRadius: 8,
    color: 'var(--nav-text-active)', fontFamily: 'var(--font)', cursor: 'pointer', textAlign: 'left',
  },
  triggerMobile: { minHeight: 52, padding: '6px 12px' },
  triggerAccueil: { width: 'auto', minHeight: 48, padding: '6px 12px 6px 8px', borderRadius: 'var(--r-lg)', color: 'var(--text)' },
  // Initiales neutres : l'ancienne pastille à la couleur du rôle se fondait
  // dans l'encre pétrole (consultant #003042 sur #032d3f ≈ 1:1).
  avatar: {
    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--nav-active)', border: '1px solid var(--nav-border)',
    color: 'var(--nav-text-active)', fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
  },
  avatarMobile: { width: 32, height: 32, fontSize: 12 },
  avatarAccueil: { width: 32, height: 32, fontSize: 12, background: 'var(--surface2)', border: 'none', color: 'var(--text2)' },
  name: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  nameMobile: { fontSize: 14 },
  chevron: { flexShrink: 0, color: 'var(--nav-text)' },
  chevronAccueil: { color: 'var(--text3)' },
};
