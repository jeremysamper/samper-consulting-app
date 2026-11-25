import React from 'react';

// Les coordonnées légales qui manquent (manquesLegaux de reglages.js), une par
// nœud : le traducteur du DOM traduit chaque mot sans recevoir une phrase
// assemblée.
export default function ListeManques({ manques }) {
  return (
    <>
      {manques.map((m, i) => (
        <React.Fragment key={m}>
          {i > 0 && ', '}
          <span>{m}</span>
        </React.Fragment>
      ))}
    </>
  );
}
