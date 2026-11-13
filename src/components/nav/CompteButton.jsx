// ─────────────────────────────────────────────────────────────────────────────
// Entrée de la page des réglages, sur la ligne de « Mon compte » : pied de la
// barre latérale, en-tête de la page d'accueil tactile. Toujours visible sans
// défiler, quelle que soit la longueur du menu (le menu latéral est plein à
// 1440 px). Affichée par l'appelant si peutOuvrirCompte (moduleConfig) :
// toute personne connectée, chacune avec ses seules sections.
//
// Variantes : 'desktop' (pied du menu) et 'accueil' (en-tête de l'accueil
// tactile). Une pilule de bouton secondaire ; quand la page des réglages est
// ouverte, c'est l'entrée choisie : l'aplat sombre. Texte seul, pas de
// pictogramme devant le libellé.
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
      Réglages
    </button>
  );
}

const s = {
  bouton: {
    flexShrink: 0, minHeight: 44, padding: '6px 10px',
    background: 'var(--btn-fond)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', borderRadius: 'var(--r-full)',
    color: 'var(--btn-texte)', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 'var(--g2)',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
  boutonAccueil: {
    minHeight: 48, padding: '6px 14px', fontSize: 14,
  },
  actif: { background: 'var(--nav-active)', borderColor: 'var(--nav-active)', color: 'var(--nav-text-active)' },
  actifAccueil: { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' },
};
