import React from 'react';
import { iconeCategorie } from './visuelFiche.js';
import './fiches.css';

// ─── PhotoFiche : la photo d'une fiche, ou son visuel de remplacement ───────
// Dimensions toujours posées (le cadre réserve sa place en aspect-ratio : la
// grille ne saute pas pendant le chargement) ; chargement paresseux sauf pour
// le héros d'une fiche ouverte, visible tout de suite. En 4G, seules les
// photos qui arrivent à l'écran partent.
// Photo cassée ou absente : aplat pétrole, picto au trait de la catégorie, ou
// l'initiale du nom si la catégorie est inconnue. Jamais un cadre vide.
// alt vide par défaut : le nom est écrit juste à côté (sur la photo ou dans la
// ligne), le répéter ferait lire deux fois le plat au lecteur d'écran.
const DIMENSIONS = {
  vignette: [800, 600],
  heros: [1200, 500],
  miniature: [72, 72],
};

const initiale = (nom) => {
  const t = String(nom || '').trim();
  return t ? t.charAt(0).toUpperCase() : '';
};

export default function PhotoFiche({ src, alt = '', categorie, nom, variante = 'vignette' }) {
  // L'adresse en échec est retenue telle quelle : une nouvelle adresse
  // (photo changée) repart d'elle-même, sans effet à remettre à zéro.
  const [srcEnEchec, setSrcEnEchec] = React.useState(null);
  const [largeur, hauteur] = DIMENSIONS[variante] || DIMENSIONS.vignette;

  if (src && srcEnEchec !== src) {
    return (
      <img
        className="fv-photo"
        src={src}
        alt={alt}
        width={largeur}
        height={hauteur}
        loading={variante === 'heros' ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setSrcEnEchec(src)}
      />
    );
  }

  const Icone = iconeCategorie(categorie);
  const nommee = alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': 'true' };
  return (
    <span className="fv-remplacement" {...nommee}>
      {Icone
        ? <Icone className="fv-remplacement-picto" strokeWidth={1.25} aria-hidden="true" />
        : <span className="fv-initiale" aria-hidden="true" data-no-translate="">{initiale(nom)}</span>}
    </span>
  );
}
