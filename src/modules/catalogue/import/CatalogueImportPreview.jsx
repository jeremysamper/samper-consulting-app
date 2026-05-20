import React from 'react';

// ═══════════════════════════════════════════════════════════════
// CatalogueImportPreview — tableau éditable des produits détectés
// par l'IA avant insertion dans le catalogue.
//
// Chaque ligne porte : champs produit éditables, drapeau `_selected`,
// liste `issues` (anomalies IA + contrôles locaux), `confidence`, et
// pour un doublon `_existing` (produit déjà au catalogue) + `_dupAction`
// (mettre à jour / créer quand même / ignorer).
// ═══════════════════════════════════════════════════════════════

const CATS = [
  'Viandes', 'Poissons & fruits de mer', 'Fruits & légumes',
  'Épicerie sèche', 'Produits laitiers', 'Crèmerie / fromages',
  'Boulangerie / pâtisserie', 'Boissons', 'Alcools',
  'Surgelés', 'Condiments / sauces', 'Herbes / épices',
  'Hygiène / non alimentaire', 'Autres',
];
const UNITES = ['g', 'ml', 'pcs'];

const fmtPrix = (v, u) => (v == null || isNaN(Number(v))
  ? '—'
  : `${Number(v).toFixed(4)} CHF/${u || 'g'}`);

const CatalogueImportPreview = ({ produits, onChange }) => {
  const patch = (tempId, field, value) => {
    onChange(produits.map(p => (p._tempId === tempId ? { ...p, [field]: value } : p)));
  };
  const toggle = (tempId) => {
    onChange(produits.map(p => (p._tempId === tempId ? { ...p, _selected: !p._selected } : p)));
  };

  return (
    <div style={s.wrap}>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}></th>
            <th style={s.th}>Produit</th>
            <th style={s.th}>Catégorie</th>
            <th style={s.th}>Unité</th>
            <th style={s.th}>Prix/u. (CHF)</th>
            <th style={s.th}>Conditionnement</th>
            <th style={s.th}>Réf. fourn.</th>
            <th style={s.th}>État</th>
          </tr>
        </thead>
        <tbody>
          {produits.map((p) => {
            const hasIssues = (p.issues || []).length > 0;
            const lowConf = (p.confidence || 0) < 60;
            const flagged = hasIssues || lowConf;
            const off = !p._selected || p._dupAction === 'skip';
            return (
              <tr
                key={p._tempId}
                style={{ ...s.tr, ...(flagged ? s.trFlag : {}), ...(off ? s.trOff : {}) }}
              >
                <td style={s.td}>
                  <input
                    type="checkbox"
                    checked={!!p._selected}
                    onChange={() => toggle(p._tempId)}
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent)' }}
                  />
                </td>
                <td style={s.td}>
                  <input
                    style={{ ...s.inp, minWidth: 170 }}
                    value={p.nom || ''}
                    onChange={e => patch(p._tempId, 'nom', e.target.value)}
                    placeholder="Nom requis"
                  />
                </td>
                <td style={s.td}>
                  <select style={s.inp} value={p.categorie || 'Autres'} onChange={e => patch(p._tempId, 'categorie', e.target.value)}>
                    {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={s.td}>
                  <select style={{ ...s.inp, width: 64 }} value={p.uniteRef || 'g'} onChange={e => patch(p._tempId, 'uniteRef', e.target.value)}>
                    {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </td>
                <td style={s.td}>
                  <input
                    type="number"
                    step="0.0001"
                    style={{ ...s.inp, width: 96 }}
                    value={p.prixUnitaire ?? 0}
                    onChange={e => patch(p._tempId, 'prixUnitaire', parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td style={s.td}>
                  <input
                    style={{ ...s.inp, minWidth: 110 }}
                    value={p.conditionnement || ''}
                    onChange={e => patch(p._tempId, 'conditionnement', e.target.value)}
                  />
                </td>
                <td style={s.td}>
                  <input
                    style={{ ...s.inp, width: 100 }}
                    value={p.referenceFourn || ''}
                    onChange={e => patch(p._tempId, 'referenceFourn', e.target.value)}
                  />
                </td>
                <td style={s.td}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 230 }}>
                    {flagged && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {(p.issues || []).map((iss, i) => (
                          <span key={i} style={s.issueBadge}>{iss}</span>
                        ))}
                        {lowConf && <span style={s.confBadge}>confiance {p.confidence || 0}%</span>}
                      </div>
                    )}
                    {!flagged && !p._existing && <span style={s.okBadge}>✓ fiable</span>}
                    {p._existing && (
                      <div style={s.dupBox}>
                        <div style={s.dupInfo}>
                          Au catalogue : <strong>{p._existing.nom}</strong>
                          {' · '}{fmtPrix(p._existing.prixUnitaire, p._existing.uniteRef)}
                        </div>
                        <select
                          style={{ ...s.inp, width: '100%' }}
                          value={p._dupAction || 'update'}
                          onChange={e => patch(p._tempId, '_dupAction', e.target.value)}
                        >
                          <option value="update">↻ Mettre à jour</option>
                          <option value="create">＋ Créer quand même</option>
                          <option value="skip">✕ Ignorer</option>
                        </select>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {produits.length === 0 && (
            <tr><td style={{ ...s.td, textAlign: 'center', color: 'var(--text2)' }} colSpan={8}>Aucun produit détecté.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const s = {
  wrap: { overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border)', background: 'var(--bg)', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid var(--border)' },
  trFlag: { background: '#fffbeb' },
  trOff: { opacity: 0.5 },
  td: { padding: '6px 10px', verticalAlign: 'middle' },
  inp: { padding: '5px 7px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font)', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' },
  issueBadge: { fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: '#fef3c7', color: '#92400e' },
  confBadge: { fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: '#fee2e2', color: '#b91c1c' },
  okBadge: { fontSize: 11, fontWeight: 600, color: '#15803d' },
  dupBox: { display: 'flex', flexDirection: 'column', gap: 3, padding: '5px 7px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 7 },
  dupInfo: { fontSize: 10, color: '#9a3412', lineHeight: 1.35 },
};

export default CatalogueImportPreview;
