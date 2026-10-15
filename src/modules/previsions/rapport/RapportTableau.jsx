import { useMemo, useState } from 'react';
import { SERVICES_LABELS } from './computeReservationStats.js';
import { dateCh, jourIso } from './periodesRapport.js';

// ═══════════════════════════════════════════════════════════════════════════
// Tableau détaillé du rapport (par jour ou par semaine, et par service), trié
// par colonne, et son export CSV. Chiffres agrégés seulement : aucun nom,
// aucun téléphone ne sort de l'écran.
// ═══════════════════════════════════════════════════════════════════════════

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const nf = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 });

// Libellé et date en nœuds séparés : la traduction de l'écran ne voit qu'un
// libellé fixe (« Lun », « Semaine du »), pas une phrase par ligne.
const libellePeriode = (r, granularite) => (
  granularite === 'jour' ? <>{JOURS[jourIso(r.periode) - 1]} {dateCh(r.periode)}</> : <>Semaine du {dateCh(r.periode)}</>
);
const pourcent = (v) => (v === null || v === undefined ? 'n/a' : `${nf.format(v * 100)} %`);

const COLONNES = [
  { cle: 'periode', label: 'Date', texte: true },
  { cle: 'service', label: 'Service', texte: true },
  { cle: 'tables', label: 'Tables' },
  { cle: 'couverts', label: 'Couverts' },
  { cle: 'en_ligne', label: 'En ligne' },
  { cle: 'equipe', label: 'Équipe' },
  { cle: 'passage', label: 'Passage' },
  { cle: 'annulees', label: 'Annulées' },
  { cle: 'noShow', label: 'No-show' },
  { cle: 'nonPointees', label: 'Non pointées' },
  { cle: 'occupation', label: 'Occupation' },
];

function valeurCellule(r, cle, granularite) {
  if (cle === 'periode') return libellePeriode(r, granularite);
  if (cle === 'service') return SERVICES_LABELS[r.service] || r.service;
  if (cle === 'occupation') return pourcent(r.occupation);
  return nf.format(r[cle] || 0);
}

const thStyle = {
  textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--text2)', padding: '6px 8px',
  borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', whiteSpace: 'nowrap',
};
const tdStyle = {
  textAlign: 'right', padding: '6px 8px', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
};
const triStyle = { background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' };

export default function RapportTableau({ tableau }) {
  const [tri, setTri] = useState({ cle: 'periode', sens: 1 });
  const { granularite, rangees } = tableau;

  const triees = useMemo(() => {
    const l = [...rangees];
    l.sort((a, b) => {
      const x = a[tri.cle] ?? -1;
      const y = b[tri.cle] ?? -1;
      const c = typeof x === 'string' ? String(x).localeCompare(String(y)) : x - y;
      return (c || a.periode.localeCompare(b.periode) || a.service.localeCompare(b.service)) * tri.sens;
    });
    return l;
  }, [rangees, tri]);

  if (!rangees.length) return <div style={{ fontSize: 13, color: 'var(--text2)' }}>Aucune réservation sur la période</div>;

  const trier = (cle) => setTri((t) => (t.cle === cle ? { cle, sens: -t.sens } : { cle, sens: cle === 'periode' ? 1 : -1 }));

  return (
    <div style={{ overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
        <thead>
          <tr>
            {COLONNES.map((c) => (
              <th
                key={c.cle}
                style={{ ...thStyle, textAlign: c.texte ? 'left' : 'right' }}
                aria-sort={tri.cle === c.cle ? (tri.sens > 0 ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" onClick={() => trier(c.cle)} style={triStyle}>
                  {c.cle === 'periode' && granularite === 'semaine' ? 'Semaine' : c.label}
                  {tri.cle === c.cle ? (tri.sens > 0 ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {triees.map((r) => (
            <tr key={`${r.periode}|${r.service}`}>
              {COLONNES.map((c) => (
                <td
                  key={c.cle}
                  style={{
                    ...tdStyle,
                    textAlign: c.texte ? 'left' : 'right',
                    color: c.cle === 'nonPointees' && r.nonPointees > 0 ? 'var(--warning-text)' : tdStyle.color,
                  }}
                >
                  {valeurCellule(r, c.cle, granularite)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Champ CSV : guillemets si besoin, et une apostrophe devant ce qu'un tableur
// prendrait pour une formule (même règle que l'export du Journal).
function champCsv(valeur) {
  let s = String(valeur ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exporterCsv(tableau, { debut, fin }) {
  const { granularite, rangees } = tableau;
  const entete = [
    granularite === 'jour' ? 'Date' : 'Semaine du', 'Service', 'Tables', 'Couverts', 'Couverts en ligne',
    'Couverts équipe', 'Couverts passage', 'Annulées', 'No-show', 'Non pointées', 'Occupation (%)',
  ];
  const corps = rangees.map((r) => [
    dateCh(r.periode), SERVICES_LABELS[r.service] || r.service, r.tables, r.couverts, r.en_ligne,
    r.equipe, r.passage, r.annulees, r.noShow, r.nonPointees,
    r.occupation === null ? '' : Math.round(r.occupation * 100),
  ]);
  // BOM : Excel lit alors l'UTF-8 (accents des en-têtes).
  const texte = '﻿' + [entete, ...corps].map((l) => l.map(champCsv).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([texte], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `rapport-reservations-${debut}-${fin}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
