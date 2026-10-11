import React from 'react';
import { coutUnitaireRecette, suggererRecette, estMaison } from './produitsMaison.js';

// Liaison des lignes d'inventaire aux fiches recettes (produits maison) et
// mise à jour de leur prix au coût matière actuel des fiches.
//
// Rien n'est écrit tant qu'on ne clique pas : le chiffrage est affiché, les
// liaisons sûres sont proposées, et chaque action enregistre l'inventaire.
//
// Props : lignes, recettes, refs, canEdit, onLier(liens: [{ ligneId, recette|null }]),
//         onMajPrix(maj: [{ ligneId, prixUnit }]), onClose

const chf = (n) => (n == null ? '-' : Number(n).toFixed(2));

export default function ProduitsMaisonModal({ lignes, recettes, refs, canEdit, onLier, onMajPrix, onClose }) {
  const [busy, setBusy] = React.useState(false);
  const parId = React.useMemo(() => new Map((recettes || []).map(r => [r.id, r])), [recettes]);
  const parNom = React.useMemo(() => new Map((recettes || []).map(r => [r.nom, r])), [recettes]);

  const liees = lignes.filter(estMaison).map(l => {
    const recette = parId.get(l.recetteId);
    const calcul = recette ? coutUnitaireRecette(recette, l.unite, refs) : { prix: null, detail: 'fiche supprimée ou archivée' };
    const actuel = Number(l.prixUnit) || 0;
    const aJour = calcul.prix == null || Math.abs(calcul.prix - actuel) < 0.005;
    return { l, recette, calcul, actuel, aJour };
  });
  const aMettreAJour = liees.filter(x => !x.aJour);

  const nonLiees = React.useMemo(() => lignes.filter(l => !estMaison(l)), [lignes]);
  // Rapprochement nom par nom : coûteux, recalculé seulement quand les lignes
  // ou les fiches changent.
  const suggestions = React.useMemo(() => nonLiees
    .map(l => ({ l, s: suggererRecette(l, recettes) }))
    .filter(x => x.s?.recette), [nonLiees, recettes]);
  const sures = suggestions.filter(x => x.s.sure);

  const agir = async (fn) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <div className="modal-full-overlay" style={st.overlay} onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal-full" style={st.panel}>
        <div style={st.header}>
          <div style={{ minWidth: 0 }}>
            <div style={st.titre}>Produits maison</div>
            <div style={st.sousTitre}>
              Les préparations maison (pickles, fonds, confits, desserts) sont liées à leur fiche recette : leur prix est le
              coût matière de la fiche, au kilo ou à la portion selon l'unité de comptage.
            </div>
          </div>
          <button type="button" onClick={onClose} style={st.fermer} title="Fermer">✕</button>
        </div>

        <div style={st.corps}>
          <datalist id="inventaire-fiches">
            {(recettes || []).map(r => <option key={r.id} value={r.nom} />)}
          </datalist>

          {/* ── Liées ── */}
          <div style={st.blocTitre}>
            Liées à une fiche ({liees.length})
            {canEdit && aMettreAJour.length > 0 && (
              <button type="button" style={st.btn} disabled={busy}
                onClick={() => agir(() => onMajPrix(aMettreAJour.map(x => ({ ligneId: x.l.id, prixUnit: +x.calcul.prix.toFixed(4) }))))}>
                Mettre à jour {aMettreAJour.length} prix au coût matière actuel
              </button>
            )}
          </div>
          {liees.length === 0 && <div style={st.vide}>Aucun produit maison pour l'instant. Ajoutez-en depuis « + Produits », onglet Fiches recettes, ou liez une ligne ci-dessous.</div>}
          {liees.map(({ l, recette, calcul, actuel, aJour }) => (
            <div key={l.id} style={st.ligne}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div data-no-translate style={st.nom}>{l.produit}</div>
                <div style={st.info}>
                  fiche « <span data-no-translate>{recette?.nom || l.recetteNom || '?'}</span> »
                  {calcul.detail ? `, ${calcul.detail}` : ''}
                </div>
              </div>
              <div style={st.prix}>
                {aJour
                  ? <>{chf(actuel)} CHF/{l.unite}</>
                  : <>{chf(actuel)} → <strong>{chf(calcul.prix)}</strong> CHF/{l.unite}</>}
                {calcul.estime && <div style={st.estime}>estimé</div>}
              </div>
              {canEdit && (
                <button type="button" style={st.btnMini} disabled={busy} onClick={() => agir(() => onLier([{ ligneId: l.id, recette: null }]))}>Délier</button>
              )}
            </div>
          ))}

          {/* ── Suggestions ── */}
          {canEdit && suggestions.length > 0 && (
            <>
              <div style={st.blocTitre}>
                Fiches reconnues ({suggestions.length})
                {sures.length > 0 && (
                  <button type="button" style={st.btn} disabled={busy}
                    onClick={() => agir(() => onLier(sures.map(x => ({ ligneId: x.l.id, recette: x.s.recette }))))}>
                    {sures.length > 1 ? `Lier les ${sures.length} fiches reconnues avec certitude` : 'Lier la fiche reconnue avec certitude'}
                  </button>
                )}
              </div>
              {suggestions.map(({ l, s }) => {
                const calcul = coutUnitaireRecette(s.recette, l.unite, refs);
                return (
                  <div key={l.id} style={st.ligne}>
                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      <div data-no-translate style={st.nom}>{l.produit}</div>
                      <div style={st.info}>
                        → fiche « <span data-no-translate>{s.recette.nom}</span> » {s.sure ? '' : `(${s.confidence} %, à confirmer)`}
                        {calcul.detail ? `, ${calcul.detail}` : ''}
                      </div>
                    </div>
                    <div style={st.prix}>
                      {chf(Number(l.prixUnit) || 0)} → <strong>{chf(calcul.prix)}</strong> CHF/{l.unite}
                      {calcul.estime && <div style={st.estime}>estimé</div>}
                    </div>
                    <button type="button" style={st.btnMini} disabled={busy} onClick={() => agir(() => onLier([{ ligneId: l.id, recette: s.recette }]))}>Lier</button>
                  </div>
                );
              })}
            </>
          )}

          {/* ── Liaison manuelle ── */}
          {canEdit && nonLiees.length > 0 && (
            <>
              <div style={st.blocTitre}>Lier une autre ligne</div>
              <div style={st.info}>Choisissez la ligne puis sa fiche : son prix devient le coût matière de la fiche.</div>
              <LiaisonManuelle lignes={nonLiees} parNom={parNom} busy={busy} onLier={(ligneId, recette) => agir(() => onLier([{ ligneId, recette }]))} />
            </>
          )}
        </div>

        <div style={st.footer}>
          <span style={{ fontSize: 11, color: 'var(--text2)', flex: '1 1 200px', minWidth: 0, lineHeight: 1.45 }}>
            « Estimé » : un ingrédient de la fiche n'est pas lié au catalogue, son prix vient du produit de même nom
            dans l'inventaire (prix des factures) ou au catalogue de l'établissement, à défaut du prix figé sur la fiche.
          </span>
          <button type="button" onClick={onClose} style={st.btnPrimaire} disabled={busy}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function LiaisonManuelle({ lignes, parNom, busy, onLier }) {
  const [ligneId, setLigneId] = React.useState('');
  const [fiche, setFiche] = React.useState('');
  const recette = parNom.get(fiche);
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
      <select value={ligneId} onChange={e => setLigneId(e.target.value)} style={st.champ} aria-label="Ligne à lier">
        <option value="">Ligne de l'inventaire…</option>
        {lignes.map(l => <option key={l.id} value={l.id}>{l.produit}</option>)}
      </select>
      <input list="inventaire-fiches" value={fiche} onChange={e => setFiche(e.target.value)} placeholder="Fiche recette…" style={st.champ} aria-label="Fiche recette" />
      <button type="button" style={st.btn} disabled={busy || !ligneId || !recette}
        onClick={() => { onLier(ligneId, recette); setLigneId(''); setFiche(''); }}>
        Lier
      </button>
    </div>
  );
}

const st = {
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  panel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(760px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--border)' },
  titre: { fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  sousTitre: { fontSize: 12, color: 'var(--text2)', marginTop: 3, lineHeight: 1.45 },
  fermer: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)', flexShrink: 0 },
  corps: { overflowY: 'auto', flex: 1, padding: '6px 18px 14px' },
  blocTitre: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '14px 0 6px' },
  vide: { fontSize: 12, color: 'var(--text2)', padding: '10px 12px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 8, lineHeight: 1.45 },
  ligne: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border)' },
  nom: { fontSize: 13, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' },
  info: { fontSize: 11, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 },
  prix: { fontSize: 12, color: 'var(--text2)', textAlign: 'right', flexShrink: 0 },
  estime: { fontSize: 10, fontWeight: 700, color: 'var(--warning-text)', textTransform: 'uppercase', letterSpacing: 0.4 },
  btn: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 40 },
  btnMini: { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 36 },
  champ: { flex: '1 1 200px', minWidth: 0, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)', boxSizing: 'border-box' },
  footer: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 18px', borderTop: '1px solid var(--border)' },
  btnPrimaire: { padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
};
