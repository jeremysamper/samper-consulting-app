import React from 'react';
import { Search, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// SearchToggle : recherche repliée en une simple loupe pour gagner de la place
// dans les barres d'outils de module. Un tap sur la loupe déplie le champ
// (focus automatique) ; fermer la recherche efface le filtre pour ne jamais
// laisser un filtre invisible actif. Styles dans app.css (.search-toggle*),
// tokens CSS uniquement.
//
// Props :
//   value       : texte de recherche (état du module parent)
//   onChange    : (texte) => void
//   placeholder : placeholder du champ déplié
// ─────────────────────────────────────────────────────────────────────────────

export default function SearchToggle({ value, onChange, placeholder = 'Rechercher…', style = {} }) {
  // Déplié d'office si un filtre est déjà actif (retour sur le module).
  const [open, setOpen] = React.useState(() => Boolean(value));
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Raccourci « / » (KeyboardShortcuts) : seule la loupe VISIBLE répond - les
  // modules gardés montés en arrière-plan sont en display:none.
  const rootRef = React.useRef(null);
  React.useEffect(() => {
    const onFocusSearch = (e) => {
      if (e.defaultPrevented || !rootRef.current?.getClientRects().length) return;
      e.preventDefault();
      if (open) inputRef.current?.focus();
      else setOpen(true);
    };
    window.addEventListener('sc:focus-search', onFocusSearch);
    return () => window.removeEventListener('sc:focus-search', onFocusSearch);
  }, [open]);

  const close = () => {
    onChange('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        ref={rootRef}
        type="button"
        className="search-toggle-btn no-print"
        style={style}
        onClick={() => setOpen(true)}
        title="Rechercher"
        aria-label="Ouvrir la recherche"
      >
        <Search size={16} />
      </button>
    );
  }

  return (
    <div ref={rootRef} className="search-toggle no-print" style={style}>
      <Search size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
      <input
        ref={inputRef}
        className="search-toggle-input"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') close(); }}
        onBlur={() => { if (!value) setOpen(false); }}
        aria-label={placeholder}
      />
      <button
        type="button"
        className="search-toggle-close mini"
        onClick={close}
        aria-label="Fermer la recherche"
      >
        <X size={14} />
      </button>
    </div>
  );
}
