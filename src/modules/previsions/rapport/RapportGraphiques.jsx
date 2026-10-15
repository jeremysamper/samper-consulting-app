import { useState } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// Graphiques du rapport, en CSS (aucune librairie) : barres empilées, barres
// avec ligne de moyenne, barres horizontales, carte des heures d'arrivée.
//
// Tout tient dans la largeur de l'écran (375 px compris) : colonnes en
// flex 1 1 0 et min-width 0, jamais de largeur fixe qui déborderait. Le texte
// reste dans les couleurs de texte ; la couleur est portée par la barre.
// Un tap (ou le survol) sur une barre affiche son détail sous le graphique.
// ═══════════════════════════════════════════════════════════════════════════

export const COULEURS_SERVICES = {
  midi: 'var(--svc-midi)',
  soir: 'var(--svc-soir)',
  brunch: 'var(--svc-brunch)',
};

const nf = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 });

// Plafond « rond » de l'échelle (10, 20, 25, 50, 100…).
function plafond(max) {
  if (!(max > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const n = [1, 2, 2.5, 5, 10].find((k) => k * p >= max);
  return n * p;
}

const legendeStyle = { display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 12, color: 'var(--text2)', marginBottom: 8 };
const pastille = (couleur) => ({ width: 8, height: 8, borderRadius: '50%', background: couleur, flexShrink: 0 });
const detailStyle = { fontSize: 12, color: 'var(--text2)', minHeight: 18, marginTop: 6, fontVariantNumeric: 'tabular-nums' };
const axeXStyle = { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--text3)', marginTop: 4 };

export function Legende({ series }) {
  if (!series || series.length < 2) return null;
  return (
    <div style={legendeStyle}>
      {series.map((s) => (
        <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={pastille(s.couleur)} aria-hidden="true" />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function ecartColonnes(n) {
  if (n > 60) return 0;
  if (n > 31) return 1;
  return 2;
}

// Libellés de l'axe horizontal : un par barre jusqu'à 12 (jours de la
// semaine, mois), sinon début, milieu et fin.
function AxeX({ points }) {
  if (!points.length) return null;
  if (points.length <= 12) {
    return (
      <div style={{ ...axeXStyle, gap: ecartColonnes(points.length) }}>
        {points.map((p) => (
          <span key={p.cle} style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>{p.label}</span>
        ))}
      </div>
    );
  }
  const milieu = points[Math.floor((points.length - 1) / 2)];
  return (
    <div style={axeXStyle}>
      {[points[0], milieu, points[points.length - 1]].map((p, i) => <span key={i}>{p.label}</span>)}
    </div>
  );
}

function Echelle({ max, unite }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)', pointerEvents: 'none' }}>
      {/* Au-dessus du tracé : posé dedans, la barre la plus haute le cachait. */}
      <span style={{ position: 'absolute', right: 0, bottom: 2, fontSize: 10, lineHeight: '12px', color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>
        {nf.format(max)} {unite}
      </span>
    </div>
  );
}

// points : [{ cle, label, valeurs: { midi: n, … }, total, detail }]
// series : [{ id, label, couleur }]
export function BarresEmpilees({ points, series, hauteur = 150, unite = 'couverts', vide = 'Aucun couvert sur la période' }) {
  const [sel, setSel] = useState(null);
  const max = plafond(Math.max(0, ...points.map((p) => p.total)));
  const ecart = ecartColonnes(points.length);
  const choisi = sel !== null ? points[sel] : null;
  if (!points.some((p) => p.total > 0)) return <div style={detailStyle}>{vide}</div>;
  return (
    <div style={{ minWidth: 0 }}>
      <Legende series={series} />
      <div style={{ position: 'relative', height: hauteur, marginTop: 16, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border2)' }}>
        <Echelle max={max} unite={unite} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: ecart }}>
          {points.map((p, i) => {
            const presents = series.filter((s) => (p.valeurs[s.id] || 0) > 0);
            const dessus = presents[presents.length - 1]?.id;
            return (
              <div
                key={p.cle}
                onMouseEnter={() => setSel(i)}
                onClick={() => setSel(i)}
                style={{ flex: '1 1 0', minWidth: 0, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', cursor: 'pointer', background: sel === i ? 'var(--bg2)' : 'transparent' }}
              >
                <div style={{ width: '100%', maxWidth: 24, height: `${(p.total / max) * 100}%`, display: 'flex', flexDirection: 'column-reverse', gap: presents.length > 1 ? 2 : 0 }}>
                  {presents.map((s) => (
                    <div
                      key={s.id}
                      style={{ flex: `${p.valeurs[s.id]} 1 0`, minHeight: 1, background: s.couleur, borderRadius: s.id === dessus ? '4px 4px 0 0' : 0 }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <AxeX points={points} />
      <div style={detailStyle} aria-live="polite">{choisi ? choisi.detail : 'Touchez une barre pour le détail.'}</div>
    </div>
  );
}

// points : [{ cle, label, valeur, detail }] ; moyenne : valeur de la ligne.
export function BarresMoyenne({ points, moyenne, libelleMoyenne, couleur = 'var(--accent)', hauteur = 120, unite = 'couverts', format = (v) => nf.format(v), vide = 'Rien à afficher sur la période' }) {
  const [sel, setSel] = useState(null);
  const maxBrut = Math.max(0, moyenne || 0, ...points.map((p) => p.valeur || 0));
  // Une part (0 à 1) s'affiche en % et plafonne à 100 %.
  const max = unite === '%' ? Math.min(1, plafond(maxBrut * 100) / 100) : plafond(maxBrut);
  const ecart = ecartColonnes(points.length);
  const choisi = sel !== null ? points[sel] : null;
  if (!points.some((p) => (p.valeur || 0) > 0)) return <div style={detailStyle}>{vide}</div>;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ position: 'relative', height: hauteur, marginTop: 16, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border2)' }}>
        <Echelle max={unite === '%' ? max * 100 : max} unite={unite} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: ecart }}>
          {points.map((p, i) => (
            <div
              key={p.cle}
              onMouseEnter={() => setSel(i)}
              onClick={() => setSel(i)}
              style={{ flex: '1 1 0', minWidth: 0, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', cursor: 'pointer', background: sel === i ? 'var(--bg2)' : 'transparent' }}
            >
              <div style={{ width: '100%', maxWidth: 24, height: `${((p.valeur || 0) / max) * 100}%`, background: couleur, borderRadius: '4px 4px 0 0' }} />
            </div>
          ))}
        </div>
        {moyenne > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(moyenne / max) * 100}%`, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--text2)', pointerEvents: 'none' }}>
            <span style={{ position: 'absolute', left: 0, bottom: 2, fontSize: 10, color: 'var(--text2)', background: 'var(--bg)', paddingRight: 4 }}>
              {libelleMoyenne} {format(moyenne)}
            </span>
          </div>
        )}
      </div>
      <AxeX points={points} />
      <div style={detailStyle} aria-live="polite">{choisi ? choisi.detail : 'Touchez une barre pour le détail.'}</div>
    </div>
  );
}

// lignes : [{ cle, label, valeur, texte, sousTexte?, couleur? }] ; une barre
// par ligne, longueur relative au plus grand.
export function BarresHorizontales({ lignes, couleur = 'var(--accent)', largeurLibelle = '9rem', vide = 'Rien à afficher sur la période' }) {
  const max = Math.max(0, ...lignes.map((l) => l.valeur || 0));
  if (!lignes.length || !(max > 0)) return <div style={detailStyle}>{vide}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      {lignes.map((l) => (
        <div key={l.cle} style={{ display: 'grid', gridTemplateColumns: `minmax(0, ${largeurLibelle}) minmax(0, 1fr) auto`, alignItems: 'center', gap: 10, fontSize: 13 }}>
          <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={typeof l.label === 'string' ? l.label : undefined}>{l.label}</span>
          <span style={{ height: 10, minWidth: 0, display: 'block' }} aria-hidden="true">
            <span style={{ display: 'block', height: '100%', width: `${((l.valeur || 0) / max) * 100}%`, minWidth: l.valeur > 0 ? 2 : 0, background: l.couleur || couleur, borderRadius: '0 4px 4px 0' }} />
          </span>
          <span style={{ color: 'var(--text2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' }}>
            {l.texte}
            {l.sousTexte ? <span style={{ color: 'var(--text3)' }}> ({l.sousTexte})</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

// Trois lettres : sous trois lettres, la traduction de l'écran ne touche pas
// un texte (et « Lun » … « Dim » sont au glossaire).
const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const JOURS_LONGS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const heure = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Créneaux de 30 min en lignes, jours en colonnes : 8 colonnes tiennent dans
// un téléphone, alors que 20 créneaux en colonnes déborderaient.
export function CarteChaleur({ creneaux, valeurs, max }) {
  const [sel, setSel] = useState(null);
  if (!creneaux.length || !(max > 0)) return <div style={detailStyle}>Aucune heure d'arrivée sur la période</div>;
  const fond = (v) => (v > 0
    ? `color-mix(in srgb, var(--accent) ${Math.round(12 + 88 * (v / max))}%, transparent)`
    : 'var(--bg2)');
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '3rem repeat(7, minmax(0, 1fr))', gap: 2, fontSize: 11, color: 'var(--text3)' }}>
        <span />
        {JOURS_COURTS.map((j) => <span key={j} style={{ textAlign: 'center' }}>{j}</span>)}
        {creneaux.map((c) => (
          <div key={c} style={{ display: 'contents' }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', lineHeight: '18px' }}>{heure(c)}</span>
            {[1, 2, 3, 4, 5, 6, 7].map((iso) => {
              const v = valeurs[`${iso}|${c}`] || 0;
              // Mots et nombres en nœuds séparés : la traduction de l'écran
              // ne voit que des libellés fixes, pas une phrase par case.
              const detail = (
                <>{JOURS_LONGS[iso - 1]} {heure(c)} à {heure(c + 30)} : {nf.format(v)} {v > 1 ? 'couverts' : 'couvert'}</>
              );
              return (
                <span
                  key={iso}
                  onMouseEnter={() => setSel(detail)}
                  onClick={() => setSel(detail)}
                  style={{ height: 18, background: fond(v), cursor: 'pointer', display: 'block' }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div style={detailStyle} aria-live="polite">{sel || 'Plus la case est foncée, plus il arrive de couverts dans ce créneau.'}</div>
    </div>
  );
}
