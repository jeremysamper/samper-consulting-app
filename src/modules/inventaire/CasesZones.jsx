import React from 'react';
import { ZONES_PRINCIPALES } from './zones.js';

// Cases de zone d'un produit : un tap range, un second tap retire. Plusieurs
// cases peuvent être cochées (le même produit au froid positif et au froid
// négatif). Remplace la liste déroulante du mode « Ranger » : deux gestes et un
// défilement de moins par produit.
//
// Les quatre zones du tour sont toujours là ; une autre zone déjà portée par le
// produit (Réserve, Bar...) s'affiche à la suite, cochée, pour pouvoir la retirer.

export default function CasesZones({ zones, onChange, nom, disabled = false }) {
  const actives = zones || [];
  const liste = [...ZONES_PRINCIPALES, ...actives.filter(z => !ZONES_PRINCIPALES.includes(z))];
  const basculer = (z) => {
    const suite = actives.includes(z) ? actives.filter(x => x !== z) : [...actives, z];
    // Ordre du tour, pas ordre des taps : la première zone est celle des exports.
    onChange(liste.filter(x => suite.includes(x)));
  };
  return (
    <div role="group" aria-label={`Zones - ${nom}`} style={st.groupe}>
      {liste.map(z => {
        const on = actives.includes(z);
        return (
          <button
            key={z}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => basculer(z)}
            style={{ ...st.case, ...(on ? st.caseOn : {}) }}
          >
            {z}
          </button>
        );
      })}
    </div>
  );
}

const st = {
  groupe: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  // 36 px : cible tactile tenable au doigt sur iPad, quatre cases sur une ligne de carte.
  case: { minHeight: 36, padding: '0 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', borderRadius: 'var(--r)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)', cursor: 'pointer', whiteSpace: 'nowrap' },
  // Case cochée : fond de sélection et trait d'encre, pas d'aplat d'accent.
  caseOn: { borderColor: 'var(--onglet)', background: 'var(--selection)', fontWeight: 'var(--g3)' },
};
