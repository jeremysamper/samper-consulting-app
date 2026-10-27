import { useState } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// Graphiques des achats en SVG maison, sur le modèle de RapportGraphiques.jsx
// (Réservations) : tracé à la largeur de l'écran (375 px compris), texte dans
// les couleurs de texte, la couleur portée par la barre ou la courbe, un tap
// (ou le survol) sur une colonne affiche son détail sous le graphique.
//
// Le SVG ne porte que les formes (étiré en largeur, preserveAspectRatio
// none) ; les libellés, les « n/a » et les zones de tap sont en HTML par-
// dessus, pour que le texte ne soit jamais déformé. Une valeur null est une
// période sans donnée : « n/a », jamais une barre à zéro.
// ═══════════════════════════════════════════════════════════════════════════

const detailStyle = { fontSize: 12, color: 'var(--text2)', minHeight: 18, marginTop: 6, fontVariantNumeric: 'tabular-nums' };
const axeStyle = { display: 'flex', gap: 2, fontSize: 11, color: 'var(--text3)', marginTop: 4 };
const naStyle = { fontSize: 10, color: 'var(--text3)', lineHeight: '12px', paddingBottom: 2 };
const legendeStyle = { display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 12, color: 'var(--text2)', marginBottom: 8 };

// Plafond « rond » de l'échelle (10, 20, 25, 50, 100…).
function plafond(max) {
  if (!(max > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const n = [1, 2, 2.5, 5, 10].find((k) => k * p >= max);
  return n * p;
}

const nf = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 });

function Echelle({ max, unite }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)', pointerEvents: 'none' }}>
      <span style={{ position: 'absolute', right: 0, bottom: 2, fontSize: 11, lineHeight: '12px', color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>
        <span>{unite}</span> <span>{nf.format(max)}</span>
      </span>
    </div>
  );
}

export function Legende({ series }) {
  return (
    <div style={legendeStyle}>
      {series.map((s) => (
        <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: s.couleur, opacity: s.opacite ?? 1, flexShrink: 0 }} aria-hidden="true" />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// Colonnes cliquables et « n/a » par-dessus le tracé.
function Colonnes({ points, sel, setSel, estVide }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 2 }}>
      {points.map((p, i) => (
        <div
          key={p.cle}
          onMouseEnter={() => setSel(i)}
          onClick={() => setSel(i)}
          style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', cursor: 'pointer', background: sel === i ? 'var(--bg2)' : 'transparent' }}
        >
          {estVide(p) ? <span style={naStyle}>n/a</span> : null}
        </div>
      ))}
    </div>
  );
}

function AxeMois({ points }) {
  return (
    <div style={axeStyle}>
      {points.map((p) => (
        <span key={p.cle} style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>{p.label}</span>
      ))}
    </div>
  );
}

// points : [{ cle, label, valeur (null = n/a), detail }]
export function BarresMois({ points, hauteur = 140, unite = 'CHF', couleur = 'var(--accent)' }) {
  const [sel, setSel] = useState(null);
  const n = points.length;
  const max = plafond(Math.max(0, ...points.map((p) => p.valeur || 0)));
  const choisi = sel !== null ? points[sel] : null;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ position: 'relative', height: hauteur, marginTop: 16, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border2)' }}>
        <Echelle max={max} unite={unite} />
        <svg viewBox={`0 0 ${n * 10} 100`} preserveAspectRatio="none" width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }} aria-hidden="true">
          {points.map((p, i) => (p.valeur > 0 ? (
            <rect key={p.cle} x={i * 10 + 2} width={6} y={100 - (p.valeur / max) * 100} height={(p.valeur / max) * 100} rx={0.6} style={{ fill: couleur }} />
          ) : null))}
        </svg>
        <Colonnes points={points} sel={sel} setSel={setSel} estVide={(p) => p.valeur == null} />
      </div>
      <AxeMois points={points} />
      <div style={detailStyle} aria-live="polite">{choisi ? choisi.detail : 'Touchez une barre pour le détail.'}</div>
    </div>
  );
}

// points : [{ cle, label, a, b, detail }] : deux barres par colonne (a devant,
// b derrière, plus pâle) ; n/a quand ni l'une ni l'autre n'a de donnée.
export function BarresComparees({ points, series, hauteur = 140, unite = 'CHF' }) {
  const [sel, setSel] = useState(null);
  const n = points.length;
  const max = plafond(Math.max(0, ...points.flatMap((p) => [p.a || 0, p.b || 0])));
  const choisi = sel !== null ? points[sel] : null;
  const [sa, sb] = series;
  return (
    <div style={{ minWidth: 0 }}>
      <Legende series={series} />
      <div style={{ position: 'relative', height: hauteur, marginTop: 16, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border2)' }}>
        <Echelle max={max} unite={unite} />
        <svg viewBox={`0 0 ${n * 10} 100`} preserveAspectRatio="none" width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }} aria-hidden="true">
          {points.map((p, i) => (
            <g key={p.cle}>
              {p.b > 0 && <rect x={i * 10 + 1.5} width={3.4} y={100 - (p.b / max) * 100} height={(p.b / max) * 100} rx={0.5} style={{ fill: sb.couleur, fillOpacity: sb.opacite ?? 1 }} />}
              {p.a > 0 && <rect x={i * 10 + 5.1} width={3.4} y={100 - (p.a / max) * 100} height={(p.a / max) * 100} rx={0.5} style={{ fill: sa.couleur, fillOpacity: sa.opacite ?? 1 }} />}
            </g>
          ))}
        </svg>
        <Colonnes points={points} sel={sel} setSel={setSel} estVide={(p) => p.a == null && p.b == null} />
      </div>
      <AxeMois points={points} />
      <div style={detailStyle} aria-live="polite">{choisi ? choisi.detail : 'Touchez un mois pour le détail.'}</div>
    </div>
  );
}

// lignes : [{ cle, label, valeur, texte, sousTexte?, couleur? }] : libellé et
// montant sur une ligne, barre pleine largeur dessous (relative au plus
// grand). Sur deux lignes plutôt qu'en colonnes : un montant long ne réduit
// jamais la barre à rien sur un téléphone.
export function BarresListe({ lignes, couleur = 'var(--accent)', vide = 'Rien à afficher' }) {
  const max = Math.max(0, ...lignes.map((l) => l.valeur || 0));
  if (!lignes.length) return <div style={detailStyle}>{vide}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      {lignes.map((l) => (
        <div key={l.cle} style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 13 }}>
            <span style={{ color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label}</span>
            <span style={{ color: 'var(--text2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>{l.texte}</span>
          </div>
          {l.sousTexte ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>{l.sousTexte}</div> : null}
          <svg viewBox="0 0 100 4" preserveAspectRatio="none" width="100%" height="8" style={{ display: 'block', marginTop: 3 }} aria-hidden="true">
            {max > 0 && l.valeur > 0 ? <rect width={Math.max(0.6, (l.valeur / max) * 100)} height={4} style={{ fill: l.couleur || couleur }} /> : null}
          </svg>
        </div>
      ))}
    </div>
  );
}

const jourMs = (iso) => Date.parse(`${iso}T12:00:00Z`);

// points : [{ cle, date (ISO), valeur, detail }] dans l'ordre des dates ; la
// position horizontale suit le calendrier. Moins de deux dates : « n/a ».
// `unite` : l'unité du prix (kg, L, pièce, colis), rendue dans son nœud.
export function CourbePrix({ points, hauteur = 130, unite, libelleDebut, libelleFin }) {
  const [sel, setSel] = useState(null);
  const dates = new Set(points.map((p) => p.date));
  if (dates.size < 2) return <div style={detailStyle}><span>n/a</span> : <span>un seul prix connu, il en faut au moins deux à des dates différentes.</span></div>;
  const t0 = jourMs(points[0].date);
  const t1 = jourMs(points[points.length - 1].date);
  const vmin = Math.min(...points.map((p) => p.valeur));
  const vmax = Math.max(...points.map((p) => p.valeur));
  const bas = vmin === vmax ? vmin * 0.9 : vmin - (vmax - vmin) * 0.15;
  const haut = vmin === vmax ? vmax * 1.1 : vmax + (vmax - vmin) * 0.15;
  const x = (p) => ((jourMs(p.date) - t0) / (t1 - t0)) * 100;
  const y = (p) => 100 - ((p.valeur - bas) / (haut - bas)) * 100;
  const choisi = sel !== null ? points[sel] : null;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ position: 'relative', height: hauteur, margin: '16px 6px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border2)' }}>
        <div style={{ position: 'absolute', right: 0, top: -14, fontSize: 11, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>
          <span>CHF</span> <span>{haut.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> / <span>{unite}</span>
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block', overflow: 'visible' }} aria-hidden="true">
          <polyline points={points.map((p) => `${x(p)},${y(p)}`).join(' ')} style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((p, i) => (
          <button
            key={p.cle}
            type="button"
            onMouseEnter={() => setSel(i)}
            onClick={() => setSel(i)}
            aria-label={p.ariaLabel}
            style={{ position: 'absolute', left: `${x(p)}%`, top: `${y(p)}%`, width: 22, height: 22, minHeight: 0, margin: '-11px 0 0 -11px', padding: 0, borderWidth: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span style={{ width: sel === i ? 10 : 8, height: sel === i ? 10 : 8, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
          </button>
        ))}
      </div>
      <div style={{ ...axeStyle, justifyContent: 'space-between' }}><span>{libelleDebut}</span><span>{libelleFin}</span></div>
      <div style={detailStyle} aria-live="polite">{choisi ? choisi.detail : 'Touchez un point pour le détail.'}</div>
    </div>
  );
}
