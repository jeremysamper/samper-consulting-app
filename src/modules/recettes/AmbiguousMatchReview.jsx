import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { convertFactor } from '../consultant-tools/ConsultantTools.constants.js';

// Applique un produit catalogue à un ingrédient (lien + unité/prix cohérents).
function applyProduct(ing, product) {
  const catUnit = product.uniteRef || 'g';
  const catPrice = Number(product.prixUnitaire) || 0;
  let unite = catUnit;
  let prixUnit = catPrice;
  if (ing.unite && ing.unite !== catUnit) {
    const factor = convertFactor(catUnit, ing.unite);
    if (factor !== null) { unite = ing.unite; prixUnit = catPrice * factor; }
  }
  const next = { ...ing, nom: product.nom, unite, prixUnit: Math.round(prixUnit * 1e6) / 1e6, produitId: product.id };
  delete next.needsReview;
  delete next.matchSuggestions;
  return next;
}
// Lève le drapeau sans lier de produit.
function ignoreMatch(ing) {
  const next = { ...ing };
  delete next.needsReview;
  delete next.matchSuggestions;
  return next;
}

const overlay = {
  position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(20,16,12,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const panel = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
  width: 'min(820px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
};
const chip = (conf) => ({
  fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10,
  background: conf >= 85 ? 'var(--success-bg)' : conf >= 60 ? 'var(--warning-bg)' : 'var(--surface2)',
  color: conf >= 85 ? 'var(--success-text)' : conf >= 60 ? 'var(--warning-text)' : 'var(--text2)',
});

// Écran de résolution des correspondances catalogue ambiguës (needsReview).
// Props : recettes, catalogue, legacySB, onClose, onResolved
export default function AmbiguousMatchReview({ recettes, catalogue, legacySB, onClose, onResolved }) {
  const [filterRecette, setFilterRecette] = React.useState('all');
  const [busy, setBusy] = React.useState(false);
  const [aiBusy, setAiBusy] = React.useState(false);

  const catalogueById = React.useMemo(() => {
    const m = new Map();
    (catalogue || []).forEach(p => m.set(p.id, p));
    return m;
  }, [catalogue]);

  // Lignes à valider, dérivées des recettes.
  const items = [];
  (recettes || []).forEach(r => {
    (r.ingredients || []).forEach(ing => {
      if (ing && ing.needsReview) items.push({ recetteId: r.id, recetteNom: r.nom, ing });
    });
  });
  const filtered = filterRecette === 'all' ? items : items.filter(it => it.recetteId === filterRecette);
  const recetteOptions = Array.from(new Set(items.map(it => it.recetteId)))
    .map(id => ({ id, nom: (recettes.find(r => r.id === id) || {}).nom || id }));

  // Applique un lot de résolutions, groupées par recette (1 upsert par recette).
  const resolveMany = async (resolutions) => {
    if (!legacySB || !resolutions.length) return;
    setBusy(true);
    const byRecette = new Map();
    resolutions.forEach(res => {
      if (!byRecette.has(res.recetteId)) byRecette.set(res.recetteId, []);
      byRecette.get(res.recetteId).push(res);
    });
    let ok = 0;
    for (const [recetteId, list] of byRecette) {
      const recette = recettes.find(r => r.id === recetteId);
      if (!recette) continue;
      const ingredients = (recette.ingredients || []).map(ing => {
        const res = list.find(x => x.ingId === ing.id);
        if (!res) return ing;
        return res.product ? applyProduct(ing, res.product) : ignoreMatch(ing);
      });
      try {
        await legacySB.db.upsertRecette({ ...recette, ingredients });
        ok += list.length;
      } catch (err) {
        console.error('[AmbiguousMatchReview]', err);
      }
    }
    setBusy(false);
    if (ok > 0) {
      notify(`${ok} correspondance(s) résolue(s).`, 'success');
      if (onResolved) onResolved();
    }
  };

  const resolveOne = (it, product) => resolveMany([{ recetteId: it.recetteId, ingId: it.ing.id, product }]);

  // Matching sémantique par IA : l'IA choisit le meilleur produit du catalogue.
  const suggererIA = async (it) => {
    setAiBusy(true);
    try {
      const { matchProductSemantic } = await import('../../services/aiService.js');
      const res = await matchProductSemantic(it.ing.nom, catalogue);
      const product = res.produitId ? catalogueById.get(res.produitId) : null;
      if (product) {
        await resolveMany([{ recetteId: it.recetteId, ingId: it.ing.id, product }]);
      } else {
        notify(`L'IA n'a pas trouvé de correspondance fiable pour « ${it.ing.nom} ».`, 'info');
      }
    } catch (err) {
      notify('Suggestion IA impossible : ' + (err.message || err), 'error');
    } finally {
      setAiBusy(false);
    }
  };

  // Valide automatiquement toutes les suggestions de confiance >= 85 %.
  const validateHighConfidence = () => {
    const resolutions = [];
    filtered.forEach(it => {
      const top = (it.ing.matchSuggestions || [])[0];
      if (top && top.confidence >= 85) {
        const product = catalogueById.get(top.produitId);
        if (product) resolutions.push({ recetteId: it.recetteId, ingId: it.ing.id, product });
      }
    });
    if (!resolutions.length) { notify('Aucune suggestion à 85 %+ à valider.', 'info'); return; }
    resolveMany(resolutions);
  };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
            Correspondances catalogue à valider ({items.length})
          </div>
          <button onClick={onClose} title="Fermer" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '10px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={filterRecette}
            onChange={e => setFilterRecette(e.target.value)}
            style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }}
          >
            <option value="all">Toutes les recettes ({items.length})</option>
            {recetteOptions.map(o => <option key={o.id} value={o.id}>{o.nom}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <Btn small variant="success" disabled={busy} onClick={validateHighConfidence}>
            Valider les suggestions ≥ 85 %
          </Btn>
        </div>

        <div style={{ padding: 14, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text2)', fontSize: 13 }}>
              ✓ Aucune correspondance en attente.
            </div>
          )}
          {filtered.map((it) => {
            const suggestions = it.ing.matchSuggestions || [];
            return (
              <div key={`${it.recetteId}:${it.ing.id}`} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, background: 'var(--bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{it.ing.nom || '(sans nom)'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{it.recetteNom}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {suggestions.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>Aucune suggestion automatique.</span>
                  )}
                  {suggestions.map((s) => {
                    const product = catalogueById.get(s.produitId);
                    return (
                      <button
                        key={s.produitId}
                        disabled={busy || !product}
                        onClick={() => product && resolveOne(it, product)}
                        title={product ? 'Lier ce produit' : 'Produit introuvable au catalogue'}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, cursor: busy ? 'wait' : 'pointer',
                          padding: '5px 10px', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)',
                          background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)',
                        }}
                      >
                        {s.nom}
                        <span style={chip(s.confidence)}>{s.confidence}%</span>
                      </button>
                    );
                  })}
                  <button
                    disabled={busy || aiBusy}
                    onClick={() => suggererIA(it)}
                    title="Laisser l'IA choisir le produit le plus pertinent"
                    style={{
                      padding: '5px 10px', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)',
                      cursor: (busy || aiBusy) ? 'wait' : 'pointer',
                      background: 'var(--ai-bg-soft)', border: '1px solid var(--ai-bd)', color: 'var(--ai-text)', fontWeight: 700,
                    }}
                  >✨ IA</button>
                  <button
                    disabled={busy}
                    onClick={() => resolveOne(it, null)}
                    style={{
                      padding: '5px 10px', borderRadius: 7, fontSize: 12, fontFamily: 'var(--font)', cursor: 'pointer',
                      background: 'var(--surface)', border: '1px dashed var(--border)', color: 'var(--text2)',
                    }}
                  >Ignorer (aucun)</button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <Btn variant="primary" onClick={onClose}>Fermer</Btn>
        </div>
      </div>
    </div>
  );
}
