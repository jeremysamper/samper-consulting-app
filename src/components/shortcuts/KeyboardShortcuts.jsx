import React from 'react';
import { ArrowLeft, ArrowUpDown, Building2, CornerDownLeft, Keyboard, Moon, PanelLeft, Search, Sun } from 'lucide-react';
import { useBackLayer } from '../../hooks/useBackLayer.js';

// ─────────────────────────────────────────────────────────────────────────────
// Raccourcis clavier PC + palette de commandes (Ctrl/⌘+K).
//
//   Ctrl/⌘ + K    palette : aller à un module, changer d'établissement, actions
//   Alt + 1…9     module n° 1 à 9 du menu (ordre affiché)
//   /             rechercher dans le module (loupe SearchToggle), sinon palette
//   Ctrl/⌘ + B    afficher / masquer le menu latéral
//   Alt + ← / →   retour / avancer (natif, via historyNav)
//   ?             aide des raccourcis
//   Échap         ferme la palette, l'aide, le tiroir, les panneaux
//
// Hors Ctrl/⌘+K, aucun raccourci ne se déclenche pendant une saisie : un
// raccourci ne doit jamais manger une lettre tapée dans un champ.
// ─────────────────────────────────────────────────────────────────────────────

export const IS_MAC = typeof navigator !== 'undefined'
  && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
export const MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl';
const ALT_LABEL = IS_MAC ? '⌥' : 'Alt';

export function isEditableTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target.getAttribute('type') || 'text').toLowerCase();
  return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
}

// Une modale de module ouverte garde la main : les raccourcis de navigation ne
// doivent pas changer de module sous une saisie en cours.
function hasOpenModuleDialog() {
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]:not([data-shortcuts-layer])'));
}

export function useGlobalShortcuts({ navItems, onNavigate, onTogglePalette, onOpenHelp, onToggleSidebar, enabled = true }) {
  const ref = React.useRef();
  ref.current = { navItems, onNavigate, onTogglePalette, onOpenHelp, onToggleSidebar };

  React.useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.isComposing) return;
      const h = ref.current;
      const mod = IS_MAC ? e.metaKey : e.ctrlKey;
      const key = e.key;

      if (mod && !e.altKey && !e.shiftKey && key.toLowerCase() === 'k') {
        e.preventDefault();
        h.onTogglePalette();
        return;
      }

      if (isEditableTarget(e.target) || hasOpenModuleDialog()) return;

      if (mod && !e.altKey && !e.shiftKey && key.toLowerCase() === 'b' && h.onToggleSidebar) {
        e.preventDefault();
        h.onToggleSidebar();
        return;
      }

      if (e.altKey && !mod && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
        const item = h.navItems[Number(e.code.slice(5)) - 1];
        if (item) {
          e.preventDefault();
          h.onNavigate(item.id);
        }
        return;
      }

      if (mod || e.altKey) return;

      if (key === '?') {
        e.preventDefault();
        h.onOpenHelp();
        return;
      }

      if (key === '/') {
        e.preventDefault();
        // Le SearchToggle du module affiché répond en annulant l'événement.
        const ev = new CustomEvent('sc:focus-search', { cancelable: true });
        const handled = !window.dispatchEvent(ev);
        if (!handled) h.onTogglePalette(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

function fold(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function score(entry, tokens) {
  if (!tokens.length) return 1;
  const hay = fold(`${entry.label} ${entry.keywords || ''}`);
  const label = fold(entry.label);
  let total = 0;
  for (const token of tokens) {
    const at = hay.indexOf(token);
    if (at === -1) return 0;
    total += label.startsWith(token) ? 3 : (label.includes(` ${token}`) ? 2 : 1);
  }
  return total;
}

function Kbd({ children }) {
  return <kbd className="sc-kbd" data-no-translate>{children}</kbd>;
}

export function CommandPalette({ open, onClose, entries }) {
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef(null);
  const listRef = React.useRef(null);
  const returnFocusRef = React.useRef(null);

  useBackLayer(open, onClose, 'palette');

  React.useLayoutEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    setQuery('');
    setActive(0);
    // Focus immédiat (pas de rAF) : les lettres tapées juste après Ctrl+K
    // doivent atterrir dans le champ, pas dans la page.
    inputRef.current?.focus();
    return () => {
      const el = returnFocusRef.current;
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus();
    };
  }, [open]);

  const results = React.useMemo(() => {
    const tokens = fold(query).split(/\s+/).filter(Boolean);
    return entries
      .map((entry, i) => ({ entry, s: score(entry, tokens), i }))
      .filter((r) => r.s > 0)
      .sort((a, b) => (tokens.length ? b.s - a.s : 0) || a.i - b.i)
      .map((r) => r.entry);
  }, [entries, query]);

  React.useEffect(() => { setActive(0); }, [query]);

  React.useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (entry) => {
    if (!entry) return;
    onClose();
    // Après la fermeture : la palette consomme d'abord son entrée d'historique,
    // la navigation se pose ensuite par-dessus (historyNav la diffère au besoin).
    entry.run();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(results.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === 'Tab') { e.preventDefault(); }
  };

  let lastGroup = null;
  return (
    <div className="cmdk-overlay" onMouseDown={onClose}>
      <div
        className="cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Aller à"
        data-shortcuts-layer
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cmdk-search">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            className="cmdk-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Aller à un module, un établissement, une action…"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={results[active] ? `cmdk-opt-${active}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>Échap</Kbd>
        </div>
        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef} aria-label="Résultats">
          {results.length === 0 && <div className="cmdk-empty">Aucun résultat pour « {query} »</div>}
          {results.map((entry, index) => {
            const header = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            const Icon = entry.icon;
            return (
              <React.Fragment key={entry.id}>
                {header && <div className="cmdk-group" role="presentation">{header}</div>}
                <div
                  id={`cmdk-opt-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === active}
                  className={`cmdk-item${index === active ? ' is-active' : ''}`}
                  onMouseMove={() => { if (index !== active) setActive(index); }}
                  onClick={() => run(entry)}
                >
                  {Icon ? <Icon size={16} aria-hidden="true" className="cmdk-icon" /> : <span className="cmdk-icon cmdk-dot" aria-hidden="true" />}
                  <span className="cmdk-label">{entry.label}</span>
                  {entry.badge && <span className="cmdk-badge">{entry.badge}</span>}
                  {entry.hint && <span className="cmdk-hint" data-no-translate>{entry.hint}</span>}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div className="cmdk-footer" aria-hidden="true">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> naviguer</span>
          <span><Kbd><CornerDownLeft size={11} /></Kbd> ouvrir</span>
          <span><Kbd>?</Kbd> raccourcis</span>
        </div>
      </div>
    </div>
  );
}

export function ShortcutsHelp({ open, onClose, touch }) {
  useBackLayer(open, onClose, 'shortcuts-help');
  const closeRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const rows = [
    { keys: [MOD_LABEL, 'K'], label: 'Aller à… (modules, établissements, actions)' },
    { keys: [ALT_LABEL, '1…9'], label: 'Ouvrir le module n° 1 à 9 du menu' },
    { keys: [ALT_LABEL, '←'], label: 'Retour au module précédent' },
    { keys: [ALT_LABEL, '→'], label: 'Avancer' },
    { keys: ['/'], label: 'Rechercher dans le module' },
    { keys: [MOD_LABEL, 'B'], label: 'Afficher / masquer le menu latéral' },
    { keys: ['?'], label: 'Afficher cette aide' },
    { keys: ['Échap'], label: 'Fermer la fenêtre ou le panneau ouvert' },
  ];

  return (
    <div className="cmdk-overlay" onMouseDown={onClose}>
      <div
        className="cmdk-panel shortcuts-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        data-shortcuts-layer
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-head">
          <Keyboard size={18} aria-hidden="true" />
          <h2 id="shortcuts-title">Raccourcis clavier</h2>
          <button ref={closeRef} type="button" className="shortcuts-close" onClick={onClose} aria-label="Fermer">
            <Kbd>Échap</Kbd>
          </button>
        </div>
        <dl className="shortcuts-list">
          {rows.map((row) => (
            <div key={row.label} className="shortcuts-row">
              <dt>{row.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</dt>
              <dd>{row.label}</dd>
            </div>
          ))}
        </dl>
        {touch && (
          <p className="shortcuts-note">
            Sur iPad et iPhone : glissez depuis le bord gauche de l'écran pour revenir en arrière.
            Au premier niveau, le même geste ouvre le menu.
          </p>
        )}
      </div>
    </div>
  );
}

// Construit les entrées de la palette depuis l'état de la coque.
export function buildPaletteEntries({ navItems, getLabel, currentPage, onNavigate, etabs, currentEtabId, onSelectEtab, isDark, onToggleTheme, onToggleSidebar, sidebarOpen, onOpenHelp, onBack, canGoBack, onOrganize }) {
  const entries = navItems.map((item, i) => ({
    id: `nav:${item.id}`,
    group: 'Modules',
    label: getLabel(item.id, item.label),
    keywords: `${item.label} ${item.mobileLabel || ''} ${item.group || ''}`,
    badge: item.id === currentPage ? 'Actuel' : null,
    hint: i < 9 ? `${ALT_LABEL} ${i + 1}` : null,
    run: () => onNavigate(item.id),
  }));
  if (etabs.length > 1) {
    etabs.forEach((et) => entries.push({
      id: `etab:${et.id}`,
      group: 'Établissements',
      label: et.nom,
      keywords: 'etablissement restaurant site changer',
      icon: Building2,
      badge: et.id === currentEtabId ? 'Actuel' : null,
      run: () => onSelectEtab(et),
    }));
  }
  if (canGoBack) {
    entries.push({ id: 'act:back', group: 'Actions', label: 'Revenir au module précédent', keywords: 'retour arriere back', icon: ArrowLeft, hint: `${ALT_LABEL} ←`, run: onBack });
  }
  entries.push({ id: 'act:theme', group: 'Actions', label: isDark ? 'Passer en mode clair' : 'Passer en mode sombre', keywords: 'theme sombre clair dark light', icon: isDark ? Sun : Moon, run: onToggleTheme });
  if (onToggleSidebar) {
    entries.push({ id: 'act:sidebar', group: 'Actions', label: sidebarOpen ? 'Masquer le menu latéral' : 'Afficher le menu latéral', keywords: 'sidebar barre laterale menu', icon: PanelLeft, hint: `${MOD_LABEL} B`, run: onToggleSidebar });
  }
  if (onOrganize) {
    entries.push({ id: 'act:organize', group: 'Actions', label: 'Organiser le menu', keywords: 'ordre ranger modules sidebar trier deplacer', icon: ArrowUpDown, run: onOrganize });
  }
  entries.push({ id: 'act:help', group: 'Actions', label: 'Voir les raccourcis clavier', keywords: 'aide clavier shortcuts', icon: Keyboard, hint: '?', run: onOpenHelp });
  return entries;
}
