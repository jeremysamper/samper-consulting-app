import React from 'react';
import { coutUnitaireRecette, suggererRecette, estMaison } from './produitsMaison.js';
import { montantLisible } from '../../services/qrFacture.js';
import { Fenetre } from '../../components/ui/Fenetres.jsx';

// Liaison des lignes d'inventaire aux fiches recettes (produits maison) et
// mise à jour de leur prix au coût matière actuel des fiches.
//
// Rien n'est écrit tant qu'on ne clique pas : le chiffrage est affiché, les
// liaisons sûres sont proposées, et chaque action enregistre l'inventaire.
//
// Props : lignes, recettes, refs, canEdit, onLier(liens: [{ ligneId, recette|null }]),
//         onMajPrix(maj: [{ ligneId, prixUnit }]), onClose

// Même écriture des montants que le reste du module (milliers groupés).
const chf = (n) => (n == null ? '-' : (montantLisible(n) || '-'));

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

  // Fenetre : portail, rôle de dialogue, Échap, « × » nommé, geste retour ;
  // le corps défile seul, le pied reste visible.
  return (
    <Fenetre
      id="inventaire-produits-maison"
      titre="Produits maison"
      sousTitre="Les préparations maison (pickles, fonds, confits, desserts) sont liées à leur fiche recette : leur prix est le coût matière de la fiche, au kilo ou à la portion selon l'unité de comptage."
      onClose={onClose}
      largeur={760}
      pied={(
        <>
          <span style={{ fontSize: 11, color: 'var(--text2)', flex: '1 1 200px', minWidth: 0, lineHeight: 1.45 }}>
            « Estimé » : un ingrédient de la fiche n'est pas lié au catalogue, son prix vient du produit de même nom
            dans l'inventaire (prix des factures) ou au catalogue de l'établissement, à défaut du prix figé sur la fiche.
          </span>
          <button type="button" onClick={onClose} style={st.btnPrimaire} disabled={busy}>Fermer</button>
        </>
      )}
    >
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
          {liees.length === 0 && <div style={st.vide}>Aucun produit maison pour l'instant. Ajoutez-en depuis « Ajouter des produits », onglet Fiches recettes, ou liez une ligne ci-dessous.</div>}
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
                  : <>{chf(actuel)} puis <strong>{chf(calcul.prix)}</strong> CHF/{l.unite}</>}
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
                        Fiche « <span data-no-translate>{s.recette.nom}</span> » {s.sure ? '' : <>({s.confidence} %, à confirmer)</>}
                        {calcul.detail ? `, ${calcul.detail}` : ''}
                      </div>
                    </div>
                    <div style={st.prix}>
                      {chf(Number(l.prixUnit) || 0)} puis <strong>{chf(calcul.prix)}</strong> CHF/{l.unite}
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
    </Fenetre>
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
  // Hauteur bornée : le corps défile seul, le pied de la fenêtre reste visible.
  corps: { overflowY: 'auto', maxHeight: '56vh', padding: '6px 0 14px' },
  blocTitre: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '14px 0 6px' },
  vide: { fontSize: 12, color: 'var(--text2)', padding: '10px 12px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 8, lineHeight: 1.45 },
  ligne: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border)' },
  nom: { fontSize: 13, fontWeight: 500, color: 'var(--text)', wordBreak: 'break-word' },
  info: { fontSize: 11, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 },
  prix: { fontSize: 12, color: 'var(--text2)', textAlign: 'right', flexShrink: 0 },
  estime: { fontSize: 11, fontWeight: 700, color: 'var(--warning-text)', textTransform: 'uppercase', letterSpacing: 0.4 },
  btn: { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 40 },
  btnMini: { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 36 },
  champ: { flex: '1 1 200px', minWidth: 0, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)', boxSizing: 'border-box' },
  btnPrimaire: { padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
};
