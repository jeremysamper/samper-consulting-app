import { Settings } from 'lucide-react';

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
// pictogramme devant le libellé. `rail` : dans le rail d'icônes du menu, un
// cercle à picto ; le libellé reste dans le bouton, hors de vue, et en
// info-bulle.
// ─────────────────────────────────────────────────────────────────────────────

export default function CompteButton({ onOpen, actif = false, variant = 'desktop', rail = false }) {
  const accueil = variant === 'accueil';
  return (
    <button
      type="button"
      className={accueil ? 'sc-accueil-compte' : 'sc-nav-compte'}
      style={{ ...s.bouton, ...(accueil ? s.boutonAccueil : (rail ? s.rail : s.large)), ...(actif ? (accueil ? s.actifAccueil : s.actif) : null) }}
      onClick={(e) => { e.stopPropagation(); onOpen?.(); }}
      aria-current={actif ? 'page' : undefined}
      title={rail ? 'Réglages' : undefined}
    >
      {rail ? <Settings size={20} strokeWidth={1.75} aria-hidden="true" /> : null}
      <span style={rail ? s.cache : undefined}>Réglages</span>
    </button>
  );
}

const s = {
  large: { width: '100%' },
  rail: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, padding: 0, borderRadius: '50%', position: 'relative' },
  cache: { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 },
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
