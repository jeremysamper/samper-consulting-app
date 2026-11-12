import { bornesTranche, libelleTranche } from './agregation.js';
import { nombreDe } from './echelles.js';
import { Marqueur, NomSerie, Valeur } from './Graphique.jsx';

// Le tableau des valeurs exactes de ce qui est tracé (D8) : une ligne par
// tranche, la période entière en dernière ligne (total d'un flux, valeur
// recalculée d'un taux, dernier relevé d'un stock). Avec une comparaison :
// la valeur d'avant sous chaque valeur, et l'écart sur la période entière.
// Le tableau défile dans son cadre, jamais la page. Chiffres et dates dans
// leurs propres nœuds, en data-no-translate.

const st = {
  cadre: { overflowX: 'auto', maxWidth: '100%', minWidth: 0, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8 },
  table: { borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' },
  th: { textAlign: 'right', padding: '8px 10px', fontWeight: 600, color: 'var(--text2)', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', verticalAlign: 'bottom', whiteSpace: 'nowrap' },
  thPeriode: { textAlign: 'left', position: 'sticky', left: 0, background: 'var(--surface)' },
  td: { textAlign: 'right', padding: '7px 10px', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', whiteSpace: 'nowrap', color: 'var(--text)' },
  tdPeriode: { textAlign: 'left', position: 'sticky', left: 0, background: 'var(--surface)', fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' },
  avant: { display: 'block', fontSize: 12, color: 'var(--text3)' },
  pied: { fontWeight: 600, background: 'var(--bg)' },
  note: { fontSize: 12, color: 'var(--text2)', marginTop: 6 },
};

const NATURE = { flux: 'total', taux: 'recalculé sur la période', stock: 'dernier relevé' };

function Ecart({ e, unite }) {
  if (!e || e.valeur == null) return <span style={st.avant}><span>écart :</span> <span>n/a</span></span>;
  const signe = e.valeur > 0 ? '+' : '';
  return (
    <span style={st.avant} data-no-translate>
      <span>{signe}{nombreDe(e.valeur, unite)}</span>
      {unite === 'pct' ? <span> pts</span> : null}
      {unite !== 'pct' ? <span>{e.pct == null ? ' (n/a)' : ` (${e.pct > 0 ? '+' : ''}${nombreDe(e.pct, 'pct')} %)`}</span> : null}
    </span>
  );
}

export default function TableauValeurs({ tableau, libelleComparaison }) {
  const { colonnes, lignes, periode, arrondis, avecComparaison } = tableau;
  if (!colonnes.length) return null;
  return (
    <div style={{ minWidth: 0 }} data-stat-tableau="">
      <div style={st.cadre} className="table-container">
        <table style={st.table}>
          <thead>
            <tr>
              <th style={{ ...st.th, ...st.thPeriode }}>Période</th>
              {colonnes.map((c) => (
                <th key={c.id} style={st.th}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                    <Marqueur rang={c.rang} />
                    <NomSerie s={c} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.tranche.cle} data-stat-ligne="">
                <td style={{ ...st.td, ...st.tdPeriode }} data-no-translate title={bornesTranche(l.tranche)}>{libelleTranche(l.tranche)}</td>
                {colonnes.map((c, i) => (
                  <td key={c.id} style={st.td}>
                    <Valeur v={l.valeurs[i]} unite={c.unite} />
                    {avecComparaison && l.avant[i] !== null ? <span style={st.avant}><Valeur v={l.avant[i]} unite={c.unite} /></span> : null}
                  </td>
                ))}
              </tr>
            ))}
            <tr data-stat-periode="">
              <td style={{ ...st.td, ...st.tdPeriode, ...st.pied, fontFamily: 'var(--font)' }}>Période entière</td>
              {colonnes.map((c, i) => (
                <td key={c.id} style={{ ...st.td, ...st.pied }}>
                  <Valeur v={periode.valeurs[i]} unite={c.unite} />
                  <span style={st.avant}>{NATURE[c.nature]}</span>
                  {avecComparaison ? (
                    <>
                      <span style={st.avant}><span>{libelleComparaison}</span> : <Valeur v={periode.avant[i]} unite={c.unite} /></span>
                      <Ecart e={periode.ecarts[i]} unite={c.unite} />
                    </>
                  ) : null}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {arrondis.map((a) => (
        <div key={a.id} style={st.note} data-stat-arrondi="">
          <span>Arrondi par taux :</span> <NomSerie s={a} /><span>, la somme des lignes diffère du total de</span>{' '}
          <span data-no-translate style={{ fontFamily: 'var(--font-num)' }}>{nombreDe(Math.abs(a.ecart), a.unite)}</span>. <span>Le total est celui de l'écran d'origine.</span>
        </div>
      ))}
    </div>
  );
}
