import React from 'react';
import { notifyLegacy, confirmLegacy } from '../../legacy/legacyApi.js';
import { normalizeName } from '../../services/recipeProductMatching.js';
import { rapprocherLigneDoc, nomDepuisLibelle, ligneInventaireDepuisDoc, appliquerDecision } from './achatsLogic.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lignes lues sur les documents que l'app n'a pas reconnues avec certitude :
// une entrée par libellé, à rattacher à un produit de l'inventaire (suggestion,
// choix dans la liste, création du produit) ou à ignorer (port, consigne).
// Une décision vaut pour toutes les lignes de même libellé, dans tous les
// documents de l'établissement, ce mois-ci et les suivants.
//
// Extrait d'AchatsPanel.jsx (07.10.2026) pour servir aussi après une lecture
// (« Vérifier la lecture »), sur un seul document. Rien n'est rendu quand il
// n'y a rien à rattacher.
//
// Props : documents (ceux dont les lignes sont à examiner), ctx (contexte de
// rapprochement), produits ([{ cle, nom, unite, prixUnit }]), catalogue,
// perimetreActif, canCreer (créer un produit dans l'inventaire), docsRef (tous
// les documents de l'établissement, pour propager une décision),
// enregistrerDoc(doc), onAjouterLignes(lignes).
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Number(n) || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LignesARattacher({
  documents, ctx, produits, catalogue, perimetreActif, canCreer, docsRef, enregistrerDoc, onAjouterLignes,
}) {
  const [creations, setCreations] = React.useState({}); // cle libellé -> nom en cours
  const [busy, setBusy] = React.useState(false);

  // Lignes à rattacher, une par libellé : décider une fois vaut pour tous
  // les documents qui portent ce libellé, ce mois-ci et les suivants.
  const aRattacher = React.useMemo(() => {
    const m = new Map();
    (documents || []).forEach(d => {
      (d.lignes || []).forEach(l => {
        const r = rapprocherLigneDoc(l, ctx);
        if (r.mode !== 'aucun' && r.mode !== 'ambigu') return;
        const cle = normalizeName(l.libelle);
        if (!m.has(cle)) m.set(cle, { cle, ligne: l, fournisseur: d.fournisseurNom, suggestions: r.suggestions, montant: 0, occurrences: 0 });
        const e = m.get(cle);
        e.montant += Number(l.montantLigne) || 0;
        e.occurrences += 1;
      });
    });
    return Array.from(m.values()).sort((a, b) => b.montant - a.montant);
  }, [documents, ctx]);

  const nomsProduits = React.useMemo(
    () => (produits || []).map(p => p.nom).sort((a, b) => a.localeCompare(b, 'fr')),
    [produits],
  );

  // Applique une décision à toutes les lignes portant ce libellé, dans tous
  // les documents de l'établissement.
  const decider = async (cleLibelle, patch) => {
    for (const d of appliquerDecision(docsRef.current || [], cleLibelle, patch)) await enregistrerDoc(d);
  };
  const rattacher = (cleLibelle, produitNom) => decider(cleLibelle, { lien: 'manuel', produitNom });
  const ignorer = (cleLibelle) => decider(cleLibelle, { lien: 'ignore', produitNom: null });

  // Crée la ligne d'inventaire depuis la ligne de document, puis rattache.
  const creerDepuisDoc = async (entree, nom) => {
    const nomFinal = String(nom || '').trim();
    if (!nomFinal) return;
    setBusy(true);
    try {
      await onAjouterLignes([ligneInventaireDepuisDoc(entree.ligne, nomFinal, catalogue)]);
      await rattacher(entree.cle, nomFinal);
      setCreations(c => { const s = { ...c }; delete s[entree.cle]; return s; });
    } finally { setBusy(false); }
  };

  const toutCreer = async () => {
    const cibles = aRattacher.filter(e => e.suggestions.length === 0);
    if (!cibles.length) return;
    if (!confirmLegacy(`Ajouter ${cibles.length} produit${cibles.length > 1 ? 's' : ''} lu${cibles.length > 1 ? 's' : ''} sur les documents à l'inventaire « ${perimetreActif} » ?\nNom, unité et prix sont repris des documents ; vous pourrez les compter tout de suite.`)) return;
    setBusy(true);
    try {
      const lignes = cibles.map(e => ligneInventaireDepuisDoc(e.ligne, nomDepuisLibelle(e.ligne.libelle, e.ligne.conditionnement), catalogue));
      await onAjouterLignes(lignes);
      for (let i = 0; i < cibles.length; i += 1) await rattacher(cibles[i].cle, lignes[i].produit);
      notifyLegacy(`${cibles.length} produit${cibles.length > 1 ? 's' : ''} ajouté${cibles.length > 1 ? 's' : ''} à l'inventaire.`, 'success');
    } finally { setBusy(false); }
  };

  if (!aRattacher.length) return null;

  return (
        <div style={st.carte}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={st.titre}>À rattacher ({aRattacher.length})</div>
            {canCreer && aRattacher.some(e => e.suggestions.length === 0) && (
              <button type="button" style={st.btn} disabled={busy} onClick={toutCreer}>
                {(() => {
                  const n = aRattacher.filter(e => e.suggestions.length === 0).length;
                  return n > 1 ? `Ajouter les ${n} produits inconnus à l'inventaire` : 'Ajouter le produit inconnu à l\'inventaire';
                })()}
              </button>
            )}
          </div>
          <div style={st.sousTitre}>
            Lignes lues que l'app n'a pas reconnues avec certitude. Votre choix est mémorisé : ce libellé sera reconnu tout seul sur les prochains documents.
          </div>
          <datalist id="achats-produits-inventaire">
            {nomsProduits.map(n => <option key={n} value={n} />)}
          </datalist>
          {aRattacher.map(e => (
            <div key={e.cle} style={st.aRattacher}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div data-no-translate style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', wordBreak: 'break-word' }}>{e.ligne.libelle}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                  <span data-no-translate>{e.fournisseur || 'Fournisseur non lu'}</span>
                  {', '}CHF {chf(e.montant)}{e.occurrences > 1 ? ` sur ${e.occurrences} documents` : ''}
                </div>
              </div>
              <div style={st.actionsLigne}>
                {e.suggestions.map(s => (
                  <button key={s.produit.cle} type="button" style={st.suggestion} onClick={() => rattacher(e.cle, s.produit.nom)}>
                    {s.produit.nom} <span style={{ color: 'var(--text3, var(--text2))' }}>{s.confidence}%</span>
                  </button>
                ))}
                <input
                  list="achats-produits-inventaire"
                  placeholder="Produit de l'inventaire…"
                  style={st.inputRattacher}
                  onChange={ev => {
                    const p = (produits || []).find(x => x.nom === ev.target.value);
                    if (p) rattacher(e.cle, p.nom);
                  }}
                />
                {canCreer && (creations[e.cle] != null ? (
                  <span style={{ display: 'flex', gap: 6, flex: '1 1 220px', minWidth: 0 }}>
                    <input
                      autoFocus
                      value={creations[e.cle]}
                      onChange={ev => setCreations(c => ({ ...c, [e.cle]: ev.target.value }))}
                      onKeyDown={ev => { if (ev.key === 'Enter') creerDepuisDoc(e, creations[e.cle]); if (ev.key === 'Escape') setCreations(c => { const s = { ...c }; delete s[e.cle]; return s; }); }}
                      style={{ ...st.inputRattacher, flex: 1 }}
                      aria-label="Nom du produit à créer"
                    />
                    <button type="button" style={st.btnMini} disabled={busy} onClick={() => creerDepuisDoc(e, creations[e.cle])}>Créer</button>
                  </span>
                ) : (
                  <button type="button" style={st.btnMini} onClick={() => setCreations(c => ({ ...c, [e.cle]: nomDepuisLibelle(e.ligne.libelle, e.ligne.conditionnement) }))}>
                    Nouveau produit
                  </button>
                ))}
                <button type="button" style={st.btnMini} onClick={() => ignorer(e.cle)} title="Port, consigne, emballage : hors stock">Ignorer</button>
              </div>
            </div>
          ))}
        </div>
  );
}

const st = {
  carte: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  titre: { fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  sousTitre: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 },
  btn: { padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  btnMini: { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 36, whiteSpace: 'nowrap' },
  aRattacher: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' },
  actionsLigne: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', flex: '2 1 300px', minWidth: 0 },
  suggestion: { padding: '6px 10px', borderRadius: 7, border: '1px solid transparent', background: 'var(--accent-light)', color: 'var(--text)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 36 },
  inputRattacher: { flex: '1 1 160px', minWidth: 0, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--font)', minHeight: 36, boxSizing: 'border-box' },
};
