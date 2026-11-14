import React from 'react';
import { Search } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Champ de recherche de l'écran d'arrivée de Cartes & Recettes : toujours
// ouvert, en tête de l'écran. Il cherche dans toutes les fiches de
// l'établissement (nom de la fiche et des plats qui la contiennent), quelle
// que soit la carte affichée. Échap dans le champ, ou la croix, vide la
// frappe et rend la carte. Il n'écrit rien : la frappe vit dans le module.
//
// Raccourci « / » (KeyboardShortcuts) : seul le champ visible répond, les
// modules gardés montés en arrière-plan sont en display none.
// ─────────────────────────────────────────────────────────────────────────────

export default function RechercheFiches({ value, onChange }) {
  const racineRef = React.useRef(null);
  const champRef = React.useRef(null);

  React.useEffect(() => {
    const surRaccourci = (e) => {
      if (e.defaultPrevented || !racineRef.current?.getClientRects().length) return;
      e.preventDefault();
      champRef.current?.focus();
    };
    window.addEventListener('sc:focus-search', surRaccourci);
    return () => window.removeEventListener('sc:focus-search', surRaccourci);
  }, []);

  return (
    <div ref={racineRef} className="rc-recherche" data-recherche-fiches="">
      <Search size={18} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
      <input
        ref={champRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        className="rc-recherche-champ"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.preventDefault(); onChange(''); } }}
        placeholder="Nom d'un plat ou d'une recette"
        aria-label="Nom d'un plat ou d'une recette"
      />
      {value && (
        <button
          type="button"
          className="rc-recherche-effacer mini"
          aria-label="Effacer la recherche"
          onClick={() => { onChange(''); champRef.current?.focus(); }}
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}
