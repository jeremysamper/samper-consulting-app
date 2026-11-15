import React from 'react';
import { Gift } from 'lucide-react';

// Photo d'un cadeau de la boutique, vignette carrée (rayon --r, fond --piste
// tant que l'image charge). Les photos du catalogue sont des photos entières du
// vrai produit, déjà cadrées au carré : elles remplissent la vignette. Une
// photo envoyée par la direction est recadrée au centre. Sans photo, ou si
// elle ne se charge pas : le picto du cadeau. L'image est décorative, le nom
// est écrit juste à côté.
export default function PhotoCadeau({ url, taille = null, style }) {
  const [echec, setEchec] = React.useState(false);
  React.useEffect(() => { setEchec(false); }, [url]);
  const fixe = taille != null;
  return (
    <div
      className="points-photo"
      style={{
        position: 'relative',
        width: fixe ? taille : '100%',
        height: fixe ? taille : undefined,
        aspectRatio: fixe ? undefined : '1 / 1',
        flexShrink: 0,
        overflow: 'hidden',
        borderRadius: fixe ? 'var(--r-sm)' : 'var(--r)',
        background: 'var(--piste)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text3)',
        ...style,
      }}
    >
      {url && !echec ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setEchec(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <Gift size={fixe ? 18 : 32} strokeWidth={1.6} aria-hidden="true" />
      )}
    </div>
  );
}
