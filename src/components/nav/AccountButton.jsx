import { ChevronRight } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Pied de la barre latérale et du tiroir mobile : le nom de l'utilisateur, et
// rien d'autre à l'écran. Un clic ouvre « Mon compte » (AccountModal) : nom,
// téléphone, mot de passe, déconnexion.
// ─────────────────────────────────────────────────────────────────────────────

// Variantes : 'desktop' (pied de barre), 'mobile' (pied du tiroir), 'accueil'
// (en-tête de la page d'accueil tactile) et 'barre' (à droite de la barre du
// haut de l'ordinateur : le cercle des initiales puis le nom, qui cède sa
// place sous 1280 px). `style` : ajustement de l'appelant (pleine largeur
// sur téléphone).
export default function AccountButton({ user, onOpen, variant = 'desktop', role = '', style }) {
  const mobile = variant === 'mobile';
  const accueil = variant === 'accueil';
  const barre = variant === 'barre';
  const fullName = [user?.prenom, user?.nom].filter(Boolean).join(' ') || user?.email || 'Mon compte';
  const initials = user?.avatar || fullName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <button
      type="button"
      className={accueil || barre ? 'sc-accueil-account' : 'sc-nav-account'}
      style={{ ...s.trigger, ...(mobile ? s.triggerMobile : null), ...(accueil ? s.triggerAccueil : null), ...(barre ? s.triggerBarre : null), ...style }}
      onClick={(e) => { e.stopPropagation(); onOpen?.(); }}
      aria-haspopup="dialog"
      // Nom accessible = le nom affiché. Pas d'aria-label composé : une chaîne
      // par utilisateur partirait à la traduction IA.
      title="Mon compte"
    >
      <span style={{ ...s.avatar, ...(mobile ? s.avatarMobile : null), ...(accueil ? s.avatarAccueil : null), ...(barre ? s.avatarBarre : null) }} aria-hidden="true" data-no-translate="">{initials}</span>
      {barre ? (
        <span className="app-bar-compte-nom" style={s.blocBarre}>
          <span style={{ ...s.name, ...s.nameBarre }} data-no-translate="">{fullName}</span>
          {role ? <span style={s.roleBarre}>{role}</span> : null}
        </span>
      ) : (
        <span style={{ ...s.name, ...(mobile ? s.nameMobile : null) }} data-no-translate="">{fullName}</span>
      )}
      {barre ? null : <ChevronRight size={15} aria-hidden="true" style={{ ...s.chevron, ...(accueil ? s.chevronAccueil : null) }} />}
    </button>
  );
}

const s = {
  trigger: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44,
    padding: '6px 10px', background: 'none', border: 'none', borderRadius: 'var(--r-full)',
    color: 'var(--text)', fontFamily: 'var(--font)', cursor: 'pointer', textAlign: 'left',
  },
  triggerMobile: { minHeight: 52, padding: '6px 12px' },
  triggerAccueil: { width: 'auto', minHeight: 48, padding: '6px 12px 6px 8px', borderRadius: 'var(--r-full)', color: 'var(--text)' },
  // Initiales neutres, dans un cercle à la couleur des cartes : le menu et
  // l'accueil sont posés sur le fond de page. --nav-active n'y sert plus,
  // c'est l'aplat sombre de l'entrée choisie.
  avatar: {
    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface)', border: '1px solid var(--nav-border)',
    color: 'var(--text2)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', letterSpacing: 0.3,
  },
  avatarMobile: { width: 32, height: 32, fontSize: 12 },
  triggerBarre: { width: 'auto', minHeight: 44, padding: '2px 12px 2px 2px', gap: 8, marginLeft: 6, flexShrink: 0 },
  avatarBarre: { width: 40, height: 40, fontSize: 13, border: 'none' },
  blocBarre: { display: 'flex', flexDirection: 'column', minWidth: 0, maxWidth: 180 },
  nameBarre: { flex: '0 1 auto', fontSize: 'var(--t2)', lineHeight: 1.25 },
  roleBarre: { fontSize: 'var(--t1)', lineHeight: 1.3, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  avatarAccueil: { width: 32, height: 32, fontSize: 12, background: 'var(--surface)', border: 'none', color: 'var(--text2)' },
  name: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 'var(--g2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  nameMobile: { fontSize: 14 },
  chevron: { flexShrink: 0, color: 'var(--nav-text)' },
  chevronAccueil: { color: 'var(--text3)' },
};
