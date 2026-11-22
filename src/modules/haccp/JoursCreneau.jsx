import React from 'react';

// Jours d'une heure de relevé (haccp_creneaux.jours, 1 = lundi). Rien quand
// elle vaut chaque jour. Chaque jour est un nœud à part : le glossaire le
// traduit seul, jamais une phrase assemblée.
export const JOURS_SEMAINE = [
  { id: 1, label: 'Lundi' }, { id: 2, label: 'Mardi' }, { id: 3, label: 'Mercredi' }, { id: 4, label: 'Jeudi' },
  { id: 5, label: 'Vendredi' }, { id: 6, label: 'Samedi' }, { id: 7, label: 'Dimanche' },
];

export default function JoursCreneau({ jours }) {
  if (!Array.isArray(jours) || !jours.length || jours.length === 7) return null;
  const choisis = JOURS_SEMAINE.filter((j) => jours.includes(j.id));
  return (
    <div style={{ fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 }} data-jours-creneau="">
      <span>Jours de relevé :</span>{' '}
      {choisis.map((j, i) => (
        <React.Fragment key={j.id}>
          {i > 0 && ', '}
          <span>{j.label}</span>
        </React.Fragment>
      ))}
    </div>
  );
}
