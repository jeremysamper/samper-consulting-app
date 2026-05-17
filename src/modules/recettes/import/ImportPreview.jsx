import React from 'react';
import { Btn } from '../../../components/ui/index.jsx';
import { CATEGORIES_REC, UNITES_REC } from '../../consultant-tools/ConsultantTools.constants.js';

// Une recette est importable si elle a un nom et au moins un ingrédient.
export const isRecipeValid = (r) => Boolean(r && String(r.nom || '').trim()) && (r.ingredients || []).length > 0;

const cell = { padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 12 };

// Aperçu éditable des recettes détectées avant insertion en base.
// Props : recipes, onChange(recipes), unrecognizedUnits
export default function ImportPreview({ recipes, onChange, unrecognizedUnits = [] }) {
  const [expanded, setExpanded] = React.useState(() => new Set());

  const toggleExpand = (id) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  const patchRecipe = (idx, patch) => {
    onChange(recipes.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const patchIngredient = (rIdx, iIdx, patch) => {
    const recipe = recipes[rIdx];
    const ingredients = recipe.ingredients.map((ing, j) => {
      if (j !== iIdx) return ing;
      const next = { ...ing, ...patch };
      // Une édition manuelle lève le drapeau d'alerte.
      next._import = { ...(ing._import || {}), warning: false };
      return next;
    });
    patchRecipe(rIdx, { ingredients });
  };
  const removeIngredient = (rIdx, iIdx) => {
    patchRecipe(rIdx, { ingredients: recipes[rIdx].ingredients.filter((_, j) => j !== iIdx) });
  };
  const patchEtape = (rIdx, eIdx, value) => {
    patchRecipe(rIdx, { etapes: recipes[rIdx].etapes.map((e, j) => (j === eIdx ? value : e)) });
  };

  const validCount = recipes.filter(isRecipeValid).length;

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
        <strong style={{ color: 'var(--text)' }}>{recipes.length}</strong> recette(s) détectée(s) ·{' '}
        <strong style={{ color: validCount === recipes.length ? '#15803d' : '#d97706' }}>{validCount}</strong> valide(s)
      </div>

      {unrecognizedUnits.length > 0 && (
        <div style={{ margin: '0 0 10px', padding: '8px 12px', borderRadius: 6, background: '#fef3c7', border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
          Unités non reconnues rencontrées : {unrecognizedUnits.join(', ')}. Les lignes concernées sont signalées en rouge — corrigez-les avant import.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '52vh', overflowY: 'auto' }}>
        {recipes.map((r, rIdx) => {
          const id = r._tempId;
          const open = expanded.has(id);
          const selected = r._selected !== false;
          const valid = isRecipeValid(r);
          const flagged = (r.ingredients || []).filter(i => i._import && i._import.warning).length;
          return (
            <div key={id} style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', opacity: selected ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', flexWrap: 'wrap' }}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={e => patchRecipe(rIdx, { _selected: e.target.checked })}
                  title="Inclure dans l'import"
                />
                <input
                  value={r.nom}
                  onChange={e => patchRecipe(rIdx, { nom: e.target.value })}
                  placeholder="Nom de la recette"
                  style={{ ...cell, flex: 1, minWidth: 160, fontWeight: 700, fontSize: 13 }}
                />
                <select value={r.categorie || 'Plats'} onChange={e => patchRecipe(rIdx, { categorie: e.target.value })} style={cell}>
                  {CATEGORIES_REC.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  type="number" min="1" value={r.portions || 1}
                  onChange={e => patchRecipe(rIdx, { portions: Number(e.target.value) || 1 })}
                  title="Portions" style={{ ...cell, width: 56 }}
                />
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                  {(r.ingredients || []).length} ingr. · {(r.etapes || []).length} étape(s)
                </span>
                {!valid && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>⚠ non importable</span>
                )}
                {valid && flagged > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706' }}>⚠ {flagged} ligne(s) à vérifier</span>
                )}
                <Btn small variant="ghost" onClick={() => toggleExpand(id)} style={{ marginLeft: 'auto' }}>
                  {open ? '▲ Réduire' : '▼ Détail'}
                </Btn>
              </div>

              {open && (
                <div style={{ padding: '4px 12px 12px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', margin: '8px 0 4px' }}>INGRÉDIENTS</div>
                  {(r.ingredients || []).length === 0 && (
                    <div style={{ fontSize: 12, color: '#dc2626', fontStyle: 'italic' }}>Aucun ingrédient — recette non importable.</div>
                  )}
                  {(r.ingredients || []).map((ing, iIdx) => {
                    const warn = ing._import && ing._import.warning;
                    return (
                      <div key={ing.id} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center', padding: warn ? 4 : 0, background: warn ? '#fef2f2' : 'transparent', borderRadius: 6, border: warn ? '1px solid #fca5a5' : '1px solid transparent' }}>
                        <input
                          value={ing.nom}
                          onChange={e => patchIngredient(rIdx, iIdx, { nom: e.target.value })}
                          placeholder="Ingrédient"
                          style={{ ...cell, flex: 1 }}
                        />
                        <input
                          type="number" min="0" step="0.01" value={ing.quantite}
                          onChange={e => patchIngredient(rIdx, iIdx, { quantite: Number(e.target.value) })}
                          style={{ ...cell, width: 70 }}
                        />
                        <select value={ing.unite} onChange={e => patchIngredient(rIdx, iIdx, { unite: e.target.value })} style={{ ...cell, width: 64 }}>
                          {UNITES_REC.map(u => <option key={u} value={u}>{u}</option>)}
                          {!UNITES_REC.includes(ing.unite) && <option value={ing.unite}>{ing.unite}</option>}
                        </select>
                        {warn && ing._import.originalText && (
                          <span title={`Texte source : ${ing._import.originalText}`} style={{ fontSize: 11, color: '#dc2626', cursor: 'help' }}>⚠</span>
                        )}
                        <button onClick={() => removeIngredient(rIdx, iIdx)} title="Supprimer" style={{ ...cell, cursor: 'pointer', color: '#dc2626', width: 28 }}>✕</button>
                      </div>
                    );
                  })}

                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', margin: '10px 0 4px' }}>ÉTAPES</div>
                  {(r.etapes || []).length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>Aucune étape détectée.</div>
                  )}
                  {(r.etapes || []).map((etape, eIdx) => (
                    <div key={eIdx} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', paddingTop: 6 }}>{eIdx + 1}</span>
                      <textarea
                        value={etape}
                        onChange={e => patchEtape(rIdx, eIdx, e.target.value)}
                        rows={2}
                        style={{ ...cell, flex: 1, resize: 'vertical' }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
