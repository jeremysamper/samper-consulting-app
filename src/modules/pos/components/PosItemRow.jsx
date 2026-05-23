/**
 * PosItemRow — Ligne de plat POS avec badge, recette mappée et actions
 *
 * États possibles :
 *   • Mappé + manually_validated     → 🟢 [Modifier] [Délier]
 *   • Mappé + !manually_validated    → badge selon confidence [✓ Valider] [Modifier]
 *   • Non mappé + suggestion ≥ 85    → 🟢 auto [✓ Confirmer] [Changer]
 *   • Non mappé + suggestion 50–84   → 🟡 suggestion [✓ Valider] [Changer]
 *   • Non mappé + suggestion < 50    → ⚪ manuel [Choisir une recette]
 */

import { useState } from 'react';
import { Btn } from '../../../components/ui/index.jsx';
import { MatchBadge } from './MatchBadge.jsx';
import { RecipeSelector } from './RecipeSelector.jsx';
import { getMatchStatus } from '../lib/dice-coefficient.js';

/**
 * @param {{
 *   item:       { id: string, name: string, accounting_group?: string },
 *   mapping:    { recipe_id: string, confidence: number, manually_validated: boolean } | null,
 *   suggestion: { recipeId: string, recipeName: string, score: number } | null,
 *   recettes:   Array<{ id: string, nom: string }>,
 *   canEdit:    boolean,
 *   onValidate: () => void,
 *   onChange:   (recipeId: string, score: number) => void,
 *   onUnlink:   () => void,
 * }} props
 */
export function PosItemRow({
  item, mapping, suggestion, recettes,
  canEdit, onValidate, onChange, onUnlink,
}) {
  const [showSelector, setShowSelector] = useState(false);
  const [busy, setBusy]                 = useState(false);

  // ── Calcul du statut affiché ────────────────────────────────────
  let status;
  let displayedRecipeName = null;
  let displayedScore      = null;
  let showValidate        = false; // bouton ✓

  if (mapping) {
    // Mapping en base
    displayedRecipeName = recettes.find((r) => r.id === mapping.recipe_id)?.nom ?? '(recette supprimée)';
    displayedScore      = mapping.confidence > 0 ? mapping.confidence : null;
    if (mapping.manually_validated) {
      status       = 'auto';
      showValidate = false;
    } else {
      status       = getMatchStatus(mapping.confidence);
      showValidate = true;
    }
  } else if (suggestion) {
    // Suggestion client-side uniquement
    displayedRecipeName = suggestion.recipeName;
    displayedScore      = suggestion.score;
    status              = getMatchStatus(suggestion.score);
    showValidate        = true;
  } else {
    status = 'manual';
  }

  // ── Handlers ───────────────────────────────────────────────────
  async function handleValidate() {
    setBusy(true);
    try { await onValidate(); } finally { setBusy(false); }
  }

  async function handleSelect(recipe) {
    setShowSelector(false);
    setBusy(true);
    try { await onChange(recipe.id, suggestion?.recipeId === recipe.id ? (suggestion?.score ?? 0) : 0); }
    finally { setBusy(false); }
  }

  async function handleUnlink() {
    setBusy(true);
    try { await onUnlink(); } finally { setBusy(false); }
  }

  // ── Rendu ───────────────────────────────────────────────────────
  return (
    <>
      <div style={{
        background:    'var(--surface)',
        border:        '1px solid var(--border)',
        borderRadius:  10,
        padding:       '12px 16px',
        display:       'flex',
        alignItems:    'center',
        gap:           12,
        flexWrap:      'wrap',
        opacity:       busy ? 0.6 : 1,
        transition:    'opacity 0.15s',
      }}>
        {/* Colonne gauche : badge + nom POS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 180px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <MatchBadge status={status} score={displayedScore} />
            {item.accounting_group && (
              <span style={{
                fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font)',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '1px 6px',
              }}>
                {item.accounting_group}
              </span>
            )}
          </div>
          <div style={{
            fontSize:   14,
            fontWeight: 600,
            color:      'var(--text)',
            fontFamily: 'var(--font)',
            overflow:   'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {item.name}
          </div>
        </div>

        {/* Flèche */}
        <div style={{ color: 'var(--text3)', fontSize: 16, flexShrink: 0 }}>→</div>

        {/* Colonne droite : recette */}
        <div style={{
          flex:          '1 1 200px',
          fontSize:      13,
          color:         displayedRecipeName ? 'var(--text)' : 'var(--text3)',
          fontStyle:     displayedRecipeName ? 'normal' : 'italic',
          overflow:      'hidden',
          textOverflow:  'ellipsis',
          whiteSpace:    'nowrap',
        }}>
          {displayedRecipeName ?? 'Aucune correspondance'}
        </div>

        {/* Actions */}
        {canEdit && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
            {showValidate && (
              <Btn
                variant="success"
                onClick={handleValidate}
                disabled={busy}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                ✓ Valider
              </Btn>
            )}

            {(mapping || (suggestion && status !== 'manual')) && (
              <Btn
                variant="ghost"
                onClick={() => setShowSelector(true)}
                disabled={busy}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                {mapping ? 'Modifier' : 'Changer'}
              </Btn>
            )}

            {!mapping && status === 'manual' && (
              <Btn
                variant="ghost"
                onClick={() => setShowSelector(true)}
                disabled={busy}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                Choisir une recette
              </Btn>
            )}

            {mapping && (
              <Btn
                variant="ghost"
                onClick={handleUnlink}
                disabled={busy}
                style={{
                  fontSize: 12, padding: '4px 10px',
                  color: 'var(--text3)',
                }}
              >
                Délier
              </Btn>
            )}
          </div>
        )}
      </div>

      {/* Modal RecipeSelector */}
      {showSelector && (
        <RecipeSelector
          recettes={recettes}
          posItemName={item.name}
          currentRecipeId={mapping?.recipe_id ?? null}
          onSelect={handleSelect}
          onClose={() => setShowSelector(false)}
        />
      )}
    </>
  );
}
