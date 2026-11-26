import React from 'react';
import { jouer } from '../../utils/mouvement.js';

// Badge d'un module (messages non lus, groupes à préparer), identique dans la
// barre latérale et sur la page d'accueil tactile. `badges` vient de
// useVisibleNav. Rien à afficher : null. Quand son nombre monte, la pastille
// bat une fois (battement du socle de mouvement).
export default function NavBadge({ itemId, badges, style }) {
  const nombre = itemId === 'messages' ? (badges?.messages || 0) : itemId === 'groupes' ? (badges?.groupes || 0) : 0;
  const pastille = React.useRef(null);
  const avant = React.useRef(nombre);
  React.useEffect(() => {
    if (nombre > avant.current) jouer(pastille.current, 'battement');
    avant.current = nombre;
  }, [nombre]);

  if (itemId === 'messages' && nombre > 0) {
    return <span ref={pastille} style={{ ...s.badge, color: 'var(--on-danger)', background: 'var(--danger-fill)', ...style }}>{nombre}</span>;
  }
  if (itemId === 'groupes' && nombre > 0) {
    return (
      <span
        ref={pastille}
        title="Groupes à préparer dans les 14 prochains jours"
        /* Texte foncé sur ambre clair : du blanc sur --warning-strong tombait
           à ~2:1 de contraste, illisible de loin sur l'iPad du passe. */
        style={{
          ...s.badge, background: 'var(--warning-bg)', color: 'var(--warning-text)',
          boxShadow: 'inset 0 0 0 1px var(--warning-bd)', ...style,
        }}
      >
        {nombre}
      </span>
    );
  }
  return null;
}

const s = {
  badge: {
    fontSize: 'var(--t1)', fontWeight: 'var(--g3)',
    padding: '2px 7px', borderRadius: 99, minWidth: 14, textAlign: 'center',
    lineHeight: 1.4, flexShrink: 0,
  },
};
