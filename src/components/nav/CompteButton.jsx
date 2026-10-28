// ─────────────────────────────────────────────────────────────────────────────
// Entrée de l'espace Compte (paramètres, rôles, alertes), sur la ligne de
// « Mon compte » : pied de la barre latérale, en-tête de la page d'accueil
// tactile. Toujours visible sans défiler, quelle que soit la longueur du menu
// (le menu latéral est plein à 1440 px). Affichée par l'appelant seulement si
// peutOuvrirCompte (moduleConfig).
//
// Variantes : 'desktop' (sur l'encre de la barre) et 'accueil' (fond clair).
// Texte seul, pas de pictogramme devant le libellé.
// ─────────────────────────────────────────────────────────────────────────────

export default function CompteButton({ onOpen, actif = false, variant = 'desktop' }) {
  const accueil = variant === 'accueil';
  return (
    <button
      type="button"
      className={accueil ? 'sc-accueil-compte' : 'sc-nav-compte'}
      style={{ ...s.bouton, ...(accueil ? s.boutonAccueil : null), ...(actif ? (accueil ? s.actifAccueil : s.actif) : null) }}
      onClick={(e) => { e.stopPropagation(); onOpen?.(); }}
      aria-current={actif ? 'page' : undefined}
    >
      Compte
    </button>
  );
}

const s = {
  bouton: {
    flexShrink: 0, minHeight: 44, padding: '6px 10px',
    background: 'none', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--nav-border)', borderRadius: 8,
    color: 'var(--nav-text-active)', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  boutonAccueil: {
    minHeight: 48, padding: '6px 14px', borderRadius: 'var(--r-lg)',
    background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)', fontSize: 14,
  },
  actif: { background: 'var(--nav-active)' },
  actifAccueil: { background: 'var(--surface2)' },
};
