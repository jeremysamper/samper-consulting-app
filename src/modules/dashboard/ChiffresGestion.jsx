import React from 'react';
import { Carte, t } from './tableauUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Chiffres de gestion : réservés à la direction (consultant, patron). La
// brigade n'en a pas l'usage pendant le service.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (v) => `CHF ${Math.round(v || 0).toLocaleString('fr-CH')}`;

export default function ChiffresGestion({ chiffres, stock, avecPertes, avecStock, avecCouverts, avecPlanning, peutOuvrir, ouvrir }) {
  const tuiles = [
    avecPertes && {
      id: 'pertes', page: 'pertes', label: 'Pertes du mois', valeur: chf(chiffres.valeurPertes),
      detail: chiffres.aValider ? `${chiffres.aValider} à valider` : 'Toutes validées',
      ton: chiffres.aValider ? 'var(--warning-text)' : 'var(--text2)',
    },
    avecStock && {
      id: 'stock', page: 'inventaire', label: 'Stock valorisé', valeur: chf(stock.valeur),
      detail: stock.detail, ton: 'var(--text2)',
    },
    avecPlanning && {
      id: 'heures', page: 'planning', label: 'Heures planifiées', valeur: `${chiffres.heures.toLocaleString('fr-CH')} h`,
      detail: 'Sur les sept prochains jours', ton: 'var(--text2)',
    },
    avecCouverts && {
      id: 'couverts', page: 'previsions', label: 'Couverts réservés', valeur: chiffres.couvertsSemaine.toLocaleString('fr-CH'),
      detail: 'Sur les sept prochains jours', ton: 'var(--text2)',
    },
  ].filter(Boolean);

  if (!tuiles.length) return null;

  return (
    <Carte titre="Chiffres de gestion" sousTitre="Visible par la direction seulement">
      <div style={{ overflow: 'hidden' }}><div style={s.grille}>
        {tuiles.map((tu) => {
          const contenu = (
            <>
              <span style={s.label}>{tu.label}</span>
              <span style={s.valeur}>{tu.valeur}</span>
              <span style={{ ...t.texte2, color: tu.ton }}>{tu.detail}</span>
            </>
          );
          return peutOuvrir(tu.page) ? (
            <button key={tu.id} type="button" className="tdb-lien" onClick={() => ouvrir(tu.page)} style={{ ...s.tuile, ...s.tuileBouton }}>
              {contenu}
            </button>
          ) : (
            <div key={tu.id} style={s.tuile}>{contenu}</div>
          );
        })}
      </div></div>
    </Carte>
  );
}

const s = {
  // Filet à gauche de chaque chiffre ; la marge négative (filet + retrait)
  // masque celui du premier de chaque rangée et l'aligne sur le titre, quel
  // que soit le nombre de colonnes.
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', rowGap: 14, marginLeft: -17 },
  tuile: {
    display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, textAlign: 'left',
    padding: '4px 16px', background: 'transparent', borderLeft: '1px solid var(--border)',
  },
  tuileBouton: { borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderRadius: 0, cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)' },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--text2)' },
  valeur: { fontFamily: 'var(--font-num)', fontSize: 26, lineHeight: 1.1, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
};
