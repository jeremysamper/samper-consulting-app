// Badge d'un module (messages non lus, groupes à préparer), identique dans la
// barre latérale et sur la page d'accueil tactile. `badges` vient de
// useVisibleNav. Rien à afficher : null.
export default function NavBadge({ itemId, badges, style }) {
  if (itemId === 'messages' && badges?.messages > 0) {
    return <span style={{ ...s.badge, color: 'var(--on-danger)', background: 'var(--danger-fill)', ...style }}>{badges.messages}</span>;
  }
  if (itemId === 'groupes' && badges?.groupes > 0) {
    return (
      <span
        title="Groupes à préparer dans les 14 prochains jours"
        /* Texte foncé sur ambre clair : du blanc sur --warning-strong tombait
           à ~2:1 de contraste, illisible de loin sur l'iPad du passe. */
        style={{
          ...s.badge, background: 'var(--warning-bg)', color: 'var(--warning-text)',
          boxShadow: 'inset 0 0 0 1px var(--warning-bd)', ...style,
        }}
      >
        {badges.groupes}
      </span>
    );
  }
  return null;
}

const s = {
  badge: {
    fontSize: 11, fontWeight: 700,
    padding: '2px 7px', borderRadius: 99, minWidth: 14, textAlign: 'center',
    lineHeight: 1.4, flexShrink: 0,
  },
};
