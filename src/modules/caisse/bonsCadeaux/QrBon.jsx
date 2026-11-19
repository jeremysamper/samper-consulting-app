import React from 'react';
import { matriceQr } from '../../../services/qrFacture.js';

// Le QR d'un bon, en SVG : il porte le code seul. Encre du texte sur la
// surface : en thème sombre il s'inverse, et le lecteur de la caisse lit les
// deux sens (LecteurBon.jsx).
export default function QrBon({ code, taille = 168 }) {
  const [chemin, setChemin] = React.useState(null);
  React.useEffect(() => {
    let vivant = true;
    matriceQr(code).then((m) => {
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
  }, [code]);
  if (!chemin) return <div style={{ width: taille, height: taille }} aria-hidden="true" />;
  return (
    <svg
      width={taille}
      height={taille}
      viewBox={`0 0 ${chemin.n} ${chemin.n}`}
      role="img"
      aria-label="QR du bon cadeau"
      style={{ display: 'block', background: 'var(--surface)', borderRadius: 'var(--r-sm)', shapeRendering: 'crispEdges' }}
    >
      <path d={chemin.d} fill="var(--text)" />
    </svg>
  );
}
