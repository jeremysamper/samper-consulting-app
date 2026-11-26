import React from 'react';

// Coche qui se trace : la réponse visible d'une validation (enregistré,
// envoyé, encaissé). Elle se dessine à son montage, par la classe .mvt-coche
// d'app.css ; pour la rejouer, la remonter (une clé qui change). Sa couleur
// est celle du texte qui l'entoure. Décorative : le texte posé à côté dit
// l'état, elle est cachée au lecteur d'écran.
export default function Coche({ taille = 18, epaisseur = 2.4, style }) {
  return (
    <svg
      className="mvt-coche"
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={epaisseur}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, ...style }}
    >
      <path pathLength="1" d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
