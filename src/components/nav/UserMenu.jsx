import React from 'react';
import { ChevronsUpDown } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Pied de la barre latérale et du tiroir mobile : le nom de l'utilisateur, et
// rien d'autre à l'écran. Un clic ouvre, vers le haut, les actions de compte
// qui occupaient auparavant la barre en permanence (mot de passe, rangement du
// menu pour le consultant, déconnexion).
//
// Menu sur fond --surface, comme le menu du logo et les listes du header.
// Libellés sans icône devant (convention du projet).
// ─────────────────────────────────────────────────────────────────────────────

export default function UserMenu({ user, onChangePassword, onOrganize, onLogout, variant = 'desktop' }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const mobile = variant === 'mobile';

  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    // preventDefault : sans lui, l'Échap global de la coque refermerait aussi
    // le tiroir mobile sous le menu.
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const fullName = [user?.prenom, user?.nom].filter(Boolean).join(' ') || user?.email || 'Mon compte';
  const initials = user?.avatar || fullName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const run = (action) => (e) => {
    e.stopPropagation();
    setOpen(false);
    action?.();
  };

  return (
    <div ref={rootRef} style={s.root}>
      {open && (
        <div style={s.menu} role="menu" aria-label="Mon compte">
          <button type="button" role="menuitem" className="sc-menu-item" style={s.item} onClick={run(onChangePassword)}>
            Changer mon mot de passe
          </button>
          {onOrganize && (
            <button type="button" role="menuitem" className="sc-menu-item" style={s.item} onClick={run(onOrganize)}>
              Organiser le menu
            </button>
          )}
          <div style={s.separator} role="separator" />
          <button type="button" role="menuitem" className="sc-menu-item" style={s.item} onClick={run(onLogout)}>
            Se déconnecter
          </button>
        </div>
      )}
      <button
        ref={triggerRef}
        type="button"
        className="sc-nav-account"
        style={{ ...s.trigger, ...(mobile ? s.triggerMobile : null) }}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-haspopup="menu"
        aria-expanded={open}
        // Nom accessible = le nom affiché. Pas d'aria-label composé : une
        // chaîne par utilisateur partirait à la traduction IA.
        title="Mon compte"
      >
        <span style={{ ...s.avatar, ...(mobile ? s.avatarMobile : null) }} aria-hidden="true" data-no-translate="">{initials}</span>
        <span style={{ ...s.name, ...(mobile ? s.nameMobile : null) }} data-no-translate="">{fullName}</span>
        <ChevronsUpDown size={14} aria-hidden="true" style={s.chevron} />
      </button>
    </div>
  );
}

const s = {
  root: { position: 'relative' },
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

  menu: {
    position: 'absolute', left: 0, right: 0, bottom: 'calc(100% + 6px)', padding: 4,
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
    boxShadow: 'var(--sh-lg)', zIndex: 300, display: 'flex', flexDirection: 'column',
  },
  // flexShrink 0 : empilés en colonne sous la règle tactile globale (min-height 44 px).
  item: {
    display: 'flex', alignItems: 'center', width: '100%', minHeight: 40, flexShrink: 0,
    padding: '0 10px', background: 'transparent', border: 'none', borderRadius: 6,
    color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 500,
    textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  separator: { height: 1, background: 'var(--border)', margin: '4px 6px' },
};
