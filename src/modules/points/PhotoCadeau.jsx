import React from 'react';
import { Gift } from 'lucide-react';

// Photo d'un cadeau de la boutique, tuile intérieure au format 4:3 (jeton
// --piste, rayon --r). Les photos du catalogue sont détourées (fond
// transparent, marge comprise) : l'objet est posé entier sur la tuile, qui
// garde la couleur de l'app en clair comme en sombre. Sans photo, ou si elle
// ne se charge pas : le picto du cadeau. L'image est décorative, le nom est
// écrit juste à côté.
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
        height: fixe ? Math.round(taille * 0.75) : undefined,
        aspectRatio: fixe ? undefined : '4 / 3',
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
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <Gift size={fixe ? 18 : 32} strokeWidth={1.6} aria-hidden="true" />
      )}
    </div>
  );
}
