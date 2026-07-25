/**
 * RecipeSelector - Modal de sélection d'une recette
 *
 * Affiche la liste complète des recettes avec :
 *   • Recherche textuelle (contains + tri Dice)
 *   • Mise en évidence de la recette actuellement mappée
 *   • Bouton Annuler
 *
 * @param {{
 *   recettes:        Array<{ id: string, nom: string }>,
 *   posItemName:     string,
 *   currentRecipeId: string | null,
 *   onSelect:        (recipe: { id: string, nom: string }) => void,
 *   onClose:         () => void,
 * }} props
 */

import { useState, useMemo } from 'react';
import { Input, Btn } from '../../../components/ui/index.jsx';
import { diceScore } from '../lib/dice-coefficient.js';
import { normalizeSearch } from '../../../utils/searchText.js';

export function RecipeSelector({ recettes, posItemName, currentRecipeId, onSelect, onClose }) {
  const [search, setSearch] = useState('');

  // Filtre + tri par similarité Dice avec la recherche
  const filtered = useMemo(() => {
    const q = normalizeSearch(search.trim());
    if (!q) return [...recettes].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

    return recettes
      .filter((r) => normalizeSearch(r.nom).includes(q))
      .map((r) => ({ ...r, _score: diceScore(q, r.nom) }))
      .sort((a, b) => b._score - a._score);
  }, [recettes, search]);

  // Fermeture sur clic overlay
  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="modal-sheet-overlay"
      onClick={handleOverlayClick}
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         1000,
        background:     'rgba(0,0,0,0.45)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        16,
      }}
    >
      <div className="modal-sheet" style={{
        background:    'var(--surface)',
        border:        '1px solid var(--border)',
        borderRadius:  16,
        padding:       0,
        width:         '100%',
        maxWidth:      480,
        maxHeight:     '75vh',
        display:       'flex',
        flexDirection: 'column',
        boxShadow:     '0 8px 40px rgba(0,0,0,0.18)',
        overflow:      'hidden',
      }}>
        {/* En-tête */}
        <div style={{
          padding:       '20px 20px 16px',
          borderBottom:  '1px solid var(--border)',
          flexShrink:    0,
        }}>
          <div style={{
            fontSize:     14,
            fontWeight:   700,
            color:        'var(--text)',
            fontFamily:   'var(--font-serif)',
            marginBottom: 4,
          }}>
            Choisir une recette
          </div>
          {posItemName && (
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
              pour <strong>{posItemName}</strong>
            </div>
          )}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une recette…"
            autoFocus
          />
        </div>

        {/* Liste */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{
              padding:    32,
              textAlign:  'center',
              color:      'var(--text3)',
              fontSize:   13,
            }}>
              Aucune recette ne correspond à « {search} »
            </div>
          ) : (
            filtered.map((r) => {
              const isCurrent = r.id === currentRecipeId;
              return (
                <button
                  key={r.id}
                  onClick={() => onSelect(r)}
                  style={{
                    width:          '100%',
                    textAlign:      'left',
                    padding:        '12px 20px',
                    background:     isCurrent ? 'var(--nav-active, var(--info-bg-soft))' : 'transparent',
                    border:         'none',
                    borderBottom:   '1px solid var(--border)',
                    cursor:         'pointer',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'space-between',
                    gap:            8,
                    fontFamily:     'var(--font)',
                    transition:     'background 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = 'var(--bg)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{
                    fontSize:   13,
                    color:      'var(--text)',
                    fontWeight: isCurrent ? 700 : 400,
                    flexGrow:   1,
                  }}>
                    {r.nom}
                  </span>
                  {isCurrent && (
                    <span style={{ fontSize: 14, color: 'var(--success-text)', flexShrink: 0 }}>✓</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Pied */}
        <div style={{
          padding:      '12px 20px',
          borderTop:    '1px solid var(--border)',
          flexShrink:   0,
          display:      'flex',
          justifyContent: 'flex-end',
        }}>
          <Btn variant="ghost" onClick={onClose}>Annuler</Btn>
        </div>
      </div>
    </div>
  );
}
