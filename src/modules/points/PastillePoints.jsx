import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Pastille « +N » d'un geste qui rapporte (lot P3) : un petit rond vert posé
// en coin du bouton, en position absolue, sans rien décaler. Le bouton porteur
// doit être positionné (position relative) : AccueilModule l'est ; ailleurs,
// passer `porteurPoints(n)` dans le style du bouton. Sans points (n nul), rien
// n'est rendu : ni nœud, ni style.
//
// coin : 'haut' (défaut) ou 'bas' en coin du bouton, 'ligne' au bout du
// libellé dans une rangée qui défile.
//
// Nom accessible « +N points » par aria-labelledby sur deux nœuds : le nombre
// (data-no-translate) et le mot (traduit), jamais une chaîne assemblée.
// `aide` : phrase courte en plus (« versés à la validation »), dite aussi au
// lecteur d'écran et en infobulle.
// ─────────────────────────────────────────────────────────────────────────────

export function porteurPoints(n) {
  return n == null ? null : { position: 'relative' };
}

export default function PastillePoints({ n, aide = null, coin = 'haut' }) {
  const id = React.useId();
  if (n == null) return null;
  const ids = [`${id}-n`, `${id}-m`, aide ? `${id}-a` : null].filter(Boolean).join(' ');
  return (
    <span
      className="points-pastille"
      data-points-pastille={n}
      role="img"
      aria-labelledby={ids}
      title={aide || undefined}
      style={{ ...st.rond, ...(coin === 'ligne' ? st.ligne : coin === 'bas' ? st.bas : st.haut) }}
    >
      <span id={`${id}-n`} data-no-translate aria-hidden="false">+{n}</span>
      <span id={`${id}-m`} style={st.cache}>points</span>
      {aide && <span id={`${id}-a`} style={st.cache}>{aide}</span>}
    </span>
  );
}

const st = {
  // Encre --success-text sur --success-bg : contraste au-delà de 4,5 en clair
  // (#116530 sur #dcfce7) comme en sombre ; filet --success-bd.
  rond: {
    position: 'absolute', right: -6, zIndex: 1, minWidth: 26, height: 22, padding: '0 6px', boxSizing: 'border-box',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
    borderRadius: 'var(--r-full)', background: 'var(--success-bg)', color: 'var(--success-text)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--success-bd)',
    fontFamily: 'var(--font-num)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', lineHeight: 1, whiteSpace: 'nowrap',
  },
  haut: { top: -8 },
  bas: { bottom: -8 },
  // Au bout du libellé, dans le flux : pour un bouton posé dans une rangée qui
  // défile (un rond en coin y serait rogné).
  ligne: { position: 'relative', right: 'auto', marginLeft: 8, verticalAlign: 'middle' },
  cache: {
    position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden',
    clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', borderWidth: 0,
  },
};
