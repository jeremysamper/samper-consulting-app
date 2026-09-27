import React from 'react';
import { optionsZones } from './zones.js';

// Liste de choix d'une zone de stockage : zones déjà utilisées dans
// l'inventaire, suggestions, et « Nouvelle zone… » pour en créer une (une cave
// à fromages, un frigo du bar) sans passer par un écran de réglages.
const NOUVELLE = '__nouvelle__';

export default function ChoixZone({ value, onChange, lignes, style, ariaLabel = 'Zone de stockage', videLabel = 'Sans zone' }) {
  const options = optionsZones(lignes);
  const courante = String(value || '');
  // Une zone saisie ailleurs doit rester affichable même hors des options.
  const liste = courante && !options.includes(courante) ? [courante, ...options] : options;
  return (
    <select
      value={courante}
      aria-label={ariaLabel}
      style={style}
      onChange={(e) => {
        const v = e.target.value;
        if (v !== NOUVELLE) { onChange(v); return; }
        const saisie = (window.prompt('Nom de la nouvelle zone (ex : Cave à fromages)') || '').trim();
        if (saisie) onChange(saisie);
      }}
    >
      <option value="">{videLabel}</option>
      {liste.map(z => <option key={z} value={z}>{z}</option>)}
      <option value={NOUVELLE}>Nouvelle zone…</option>
    </select>
  );
}
