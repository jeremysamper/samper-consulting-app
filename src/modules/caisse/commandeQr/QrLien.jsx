import React from 'react';
import { matriceQr } from '../../../services/qrFacture.js';

// Un QR en SVG qui porte une adresse (même dessin que QrBon.jsx). Encre du
// texte sur la surface ; à l'impression, la feuille d'export remet les jetons
// en couleurs fixes.
export default function QrLien({ texte, taille = 184, label = 'QR' }) {
  const [chemin, setChemin] = React.useState(null);
  React.useEffect(() => {
    let vivant = true;
    if (!texte) { setChemin(null); return undefined; }
    matriceQr(texte).then((m) => {
      if (!vivant) return;
      let d = '';
      for (let l = 0; l < m.taille; l += 1) {
        for (let c = 0; c < m.taille; c += 1) {
          if (m.estNoir(l, c)) d += `M${c + 4} ${l + 4}h1v1h-1z`;
        }
      }
      setChemin({ d, n: m.taille + 8 });
    }).catch(() => { if (vivant) setChemin(null); });
    return () => { vivant = false; };
  }, [texte]);
  if (!chemin) return <div style={{ width: taille, height: taille }} aria-hidden="true" />;
  return (
    <svg
      width={taille}
      height={taille}
      viewBox={`0 0 ${chemin.n} ${chemin.n}`}
      role="img"
      aria-label={label}
      style={{ display: 'block', background: 'var(--surface)', borderRadius: 'var(--r-sm)', shapeRendering: 'crispEdges' }}
    >
      <path d={chemin.d} fill="var(--text)" />
    </svg>
  );
}
