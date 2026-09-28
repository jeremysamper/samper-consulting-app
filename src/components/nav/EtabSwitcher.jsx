import React from 'react';
import { Check, ChevronDown } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Titre de la page + établissement courant, dans le header (desktop et mobile).
//
// La barre latérale ne porte plus que le logo, les modules et le compte :
// l'établissement vit ici, sous le titre, visible depuis n'importe quel module.
// Sur téléphone, il n'apparaissait qu'en ouvrant le tiroir.
//
//   ligne 1 : titre du module
//   ligne 2 : ● établissement ⌄
//
//   - un seul établissement : simple repère, rien à choisir ;
//   - plusieurs : le bloc entier est un bouton qui ouvre la liste (même modèle
//     que le sélecteur de langue compact : fermeture au tap extérieur et sur
//     Échap). Le bloc entier et non la seule ligne 2 : une ligne de 12 px
//     serait une cible trop petite au doigt, et la règle tactile globale
//     (min-height 44 px) l'aurait fait gonfler le header.
//
// Sur deux lignes et non en pastille à côté du titre : sur iPad paysage, barre
// ouverte, le header n'a pas la largeur d'une pastille lisible (elle tombait à
// « Hôtel … »).
//
// Les noms d'établissement sont des noms propres : data-no-translate. Pas
// d'aria-label composé avec le nom non plus (le moteur traduit aria-label) :
// le nom accessible du bouton est son texte, l'action est dans title.
// ─────────────────────────────────────────────────────────────────────────────

export default function EtabSwitcher({ etabs = [], current, onSelect, title, variant = 'desktop' }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const mobile = variant === 'mobile';
  const multiple = Boolean(current) && etabs.length > 1;

  React.useEffect(() => {
    if (!open) return undefined;
    // Capture : le tap ne doit pas d'abord déclencher ce qu'il vise sous la liste.
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    // preventDefault : l'Échap global de la coque (qui referme le tiroir et
    // les panneaux) ignore une touche déjà traitée.
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

  // Un changement d'établissement (ici, par la palette ou ailleurs) referme la liste.
  React.useEffect(() => { setOpen(false); }, [current?.id]);

  const dot = (etab) => <span style={{ ...s.dot, background: etab.couleur || 'var(--accent)' }} aria-hidden="true" />;
  const align = mobile ? s.alignCenter : s.alignStart;

  const body = (
    <>
      <span style={{ ...s.title, ...(mobile ? s.titleMobile : null) }}>{title}</span>
      {current && (
        <span style={{ ...s.line, ...(mobile ? s.lineMobile : null) }}>
          {dot(current)}
          <span style={s.etabName} data-no-translate="">{current.nom}</span>
          {multiple && <ChevronDown size={13} aria-hidden="true" style={s.chevron} />}
        </span>
      )}
    </>
  );

  return (
    <div ref={rootRef} style={{ ...s.wrap, ...(mobile ? s.wrapMobile : null) }}>
      {multiple ? (
        <button
          ref={triggerRef}
          type="button"
          className="sc-title-switch"
          style={{ ...s.block, ...s.button, ...align }}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Changer d'établissement"
        >
          {body}
        </button>
      ) : (
        <div style={{ ...s.block, ...align }}>{body}</div>
      )}
      {open && (
        <div style={{ ...s.menu, ...(mobile ? s.menuMobile : null) }} role="menu" aria-label="Établissement">
          <div style={s.menuHeader} aria-hidden="true">Établissement</div>
          {etabs.map((etab) => {
            const active = etab.id === current.id;
            return (
              <button
                key={etab.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className="sc-pop-item"
                style={{ ...s.item, ...(active ? s.itemActive : null) }}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (!active) onSelect?.(etab);
                }}
              >
                {dot(etab)}
                <span style={s.itemName} data-no-translate="">{etab.nom}</span>
                {active && <Check size={15} aria-hidden="true" style={s.chevron} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const s = {
  // Marge négative sur l'enveloppe (et non sur le bouton) : le texte reste
  // aligné et seul le fond de survol déborde. Posée sur le bouton, elle
  // retranchait 16 px à sa largeur intrinsèque et la date se coupait même
  // quand le header avait toute la place.
  wrap: { position: 'relative', minWidth: 0, display: 'flex', marginLeft: -8 },
  // position static : la liste se cale alors sur le header entier (sticky,
  // donc bloc conteneur) et non sur le titre, décentré par le hamburger à
  // gauche et les trois boutons à droite ; centrée sur lui, elle sortait de
  // l'écran par la gauche.
  wrapMobile: { position: 'static', flex: 1, justifyContent: 'center', marginLeft: 0 },
  block: {
    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1,
    minWidth: 0, maxWidth: '100%', padding: '3px 8px', fontFamily: 'var(--font)', color: 'var(--text)',
  },
  button: { background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer' },
  alignStart: { alignItems: 'flex-start', textAlign: 'left' },
  alignCenter: { alignItems: 'center', textAlign: 'center' },
  title: {
    display: 'block', maxWidth: '100%', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-serif)',
    color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.25,
  },
  titleMobile: { textAlign: 'center' },
  line: {
    display: 'flex', alignItems: 'center', gap: 5, maxWidth: '100%', minWidth: 0,
    fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', lineHeight: 1.35, whiteSpace: 'nowrap',
  },
  lineMobile: { fontSize: 12, justifyContent: 'center' },
  etabName: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  chevron: { flexShrink: 0, opacity: 0.8 },

  menu: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 220, maxWidth: 320,
    maxHeight: '60vh', overflowY: 'auto', padding: 4,
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
    boxShadow: 'var(--sh-lg)', zIndex: 210, display: 'flex', flexDirection: 'column',
  },
  // Sous le header, pleine largeur avec une marge, centrée au-delà de 420 px.
  menuMobile: { top: '100%', left: 10, right: 10, margin: '4px auto 0', minWidth: 0, maxWidth: 420 },
  menuHeader: {
    padding: '8px 10px 6px', fontSize: 10, fontWeight: 700, letterSpacing: 0.6,
    textTransform: 'uppercase', color: 'var(--text3)',
  },
  // flexShrink 0 : colonne flex défilante + min-height tactile = lignes écrasées sinon.
  item: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 40, flexShrink: 0,
    padding: '0 10px', background: 'transparent', border: 'none', borderRadius: 6,
    color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 500,
    textAlign: 'left', cursor: 'pointer',
  },
  itemActive: { background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 700 },
  itemName: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
