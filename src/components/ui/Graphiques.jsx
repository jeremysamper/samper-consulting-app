import React from 'react';

// Graphiques simples de la direction Galet, tracés en SVG : un anneau, des
// barres, un demi-arc. Ils ne portent que des valeurs déjà calculées par
// l'appelant et n'inventent aucun chiffre. Muets pour un lecteur d'écran
// (aria-hidden) : le nombre se dit toujours par un texte posé à côté.
// Couleurs : des jetons passés par l'appelant, jamais une valeur en dur. Sur
// une carte de mise en avant, l'encre est celle de la carte
// (carteAvantStyles(ton), src/components/ui/index.jsx).

// Anneau : la part d'une valeur dans un total, de 0 à 1.
//   couleur : l'encre de la part
//   piste   : le fond de l'anneau (dans une tuile de la carte nuit, le fond
//             de la carte : var(--carte-nuit))
export function Anneau({ part, couleur = 'var(--accent)', piste = 'var(--piste)', taille = 44 }) {
  const p = Math.max(0, Math.min(1, part || 0)) * 100;
  return (
    <svg width={taille} height={taille} viewBox="0 0 44 44" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="22" cy="22" r="17" fill="none" strokeWidth="6" style={{ stroke: piste }} />
      {p > 0 && (
        <circle
          cx="22" cy="22" r="17" fill="none" strokeWidth="6" strokeLinecap="round" pathLength="100"
          strokeDasharray={`${p} ${100 - p}`} transform="rotate(-90 22 22)" style={{ stroke: couleur }}
        />
      )}
    </svg>
  );
}

// Barres : une barre par valeur, la plus haute à pleine hauteur. Sous chaque
// barre, sa valeur (dans son nœud, data-no-translate) et son libellé : ce
// sont eux qui disent les nombres, les barres sont muettes.
//   fort       : l'indice de la barre mise en avant (aujourd'hui), -1 pour aucune
//   encre      : barres, valeurs et libellés
//   encreForte : la barre mise en avant
export function Barres({ valeurs = [], libelles = [], fort = -1, encre = 'var(--text)', encreForte = 'var(--accent)', hauteur = 84 }) {
  const n = valeurs.length;
  if (!n) return null;
  const max = Math.max(1, ...valeurs);
  const pas = 40; const largeur = 22; const L = pas * n; const H = hauteur;
  return (
    <div style={{ minWidth: 0 }}>
      <svg viewBox={`0 0 ${L} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block' }}>
        {valeurs.map((v, i) => {
          const h = Math.max(3, (v / max) * (H - 4));
          return (
            <rect
              key={i} x={i * pas + (pas - largeur) / 2} y={H - h} width={largeur} height={h} rx="5"
              style={{ fill: i === fort ? encreForte : encre, opacity: v ? 1 : 0.3 }}
            />
          );
        })}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, marginTop: 6 }}>
        {valeurs.map((v, i) => (
          <span key={i} style={g.colonne}>
            <span style={{ ...g.valeur, color: encre }} data-no-translate>{v}</span>
            {libelles[i] != null && (
              <span style={{ fontSize: 'var(--t1)', fontWeight: i === fort ? 'var(--g3)' : 'var(--g1)', color: encre }}>{libelles[i]}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// Arc : un demi-cercle partagé entre des parts, chacune à sa couleur. Ce que
// l'appelant pose en enfant (le total et son libellé) s'inscrit au pied de
// l'arc.
//   parts : [{ valeur, couleur }], une part à 0 n'est pas tracée
//   total : par défaut, la somme des parts
//   piste : le fond de l'arc
const TRACE_ARC = 'M 14 92 A 76 76 0 0 1 166 92';

export function Arc({ parts = [], total, piste = 'var(--piste)', children }) {
  const visibles = parts.filter((x) => x.valeur > 0);
  const somme = total == null ? visibles.reduce((a, x) => a + x.valeur, 0) : total;
  // Départ de chaque part sur l'arc : le cumul des parts qui la précèdent.
  const departs = visibles.map((_, i) => visibles.slice(0, i).reduce((a, x) => a + (x.valeur / somme) * 100, 0));
  return (
    <div style={g.arc}>
      <svg viewBox="0 0 180 100" width="100%" style={{ display: 'block', maxWidth: 240, margin: '0 auto' }} aria-hidden="true">
        <path d={TRACE_ARC} fill="none" strokeWidth="12" style={{ stroke: piste }} />
        {somme > 0 && visibles.map((x, i) => {
          const p = (x.valeur / somme) * 100;
          return (
            <path
              key={i} d={TRACE_ARC} fill="none" strokeWidth="12" pathLength="100"
              strokeDasharray={`${p} ${100 - p}`} strokeDashoffset={-departs[i]} style={{ stroke: x.couleur }}
            />
          );
        })}
      </svg>
      {children != null && <div style={g.arcPied}>{children}</div>}
    </div>
  );
}

const g = {
  colonne: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 0 },
  valeur: { fontFamily: 'var(--font-num)', fontSize: 'var(--t2)', fontVariantNumeric: 'tabular-nums' },
  arc: { position: 'relative', minWidth: 0 },
  arcPied: { position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center' },
};
