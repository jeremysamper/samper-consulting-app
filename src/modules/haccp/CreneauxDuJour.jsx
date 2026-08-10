import React from 'react';
import { hs } from './HACCP.styles.js';

// ─────────────────────────────────────────────────────────────
// Tournées de relevé de la journée affichée.
//
// Rend visible la grille horaire de l'établissement (configurée dans l'onglet
// ✦ Paramètres) et ce qu'il reste à faire : « Ouverture 06:30 ✓ fait »,
// « Fermeture 15:00 · 0/6 zones ». Un seul shift au Rucher, quatre tournées à
// Woodland — la brigade lit sa propre organisation, pas un modèle générique.
//
// Cliquable uniquement sur la journée en cours : la saisie enregistre à la date
// du jour, proposer le bouton sur une date passée ferait enregistrer des relevés
// au mauvais jour.
// ─────────────────────────────────────────────────────────────
const CreneauxDuJour = ({ suivi = [], dateLabel, saisissable, onSaisir }) => {
  if (!suivi.length) return null;

  return (
    <div style={hs.tableCard}>
      <div style={hs.tableCardHeader}>
        Tournées de relevé · {dateLabel}
      </div>
      <div style={hs.creneauStrip}>
        {suivi.map(c => {
          const partiel = !c.complet && c.faites > 0;
          const couleur = c.complet ? 'var(--success-text)' : partiel ? 'var(--warning-strong)' : 'var(--text2)';
          const fond    = c.complet ? 'var(--success-bg-soft)' : partiel ? 'var(--warning-bg-soft)' : 'var(--bg)';
          const bordure = c.complet ? 'var(--success-bd)' : partiel ? 'var(--warning-bd)' : 'var(--border)';
          const contenu = (
            <>
              <span style={hs.creneauHeure}>{c.heure}</span>
              <span style={hs.creneauLabel}>{c.label}</span>
              <span style={{ ...hs.creneauEtat, color: couleur }}>
                {c.complet ? '✓ Relevée' : `${c.faites}/${c.total} zone${c.total > 1 ? 's' : ''}`}
              </span>
            </>
          );
          const style = { ...hs.creneauCard, background: fond, borderColor: bordure };

          return saisissable ? (
            <button
              key={c.id}
              type="button"
              onClick={() => onSaisir(c.heure)}
              style={{ ...style, cursor: 'pointer' }}
              title={`Saisir les relevés de la tournée de ${c.heure}`}
            >{contenu}</button>
          ) : (
            <div key={c.id} style={style}>{contenu}</div>
          );
        })}
      </div>
    </div>
  );
};

export default CreneauxDuJour;
