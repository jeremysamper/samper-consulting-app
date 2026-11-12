import { useMemo, useState } from 'react';
import { bornesTranche, libelleTranche } from './agregation.js';
import { libelleUnite, nombreDe, positionSur, rangsEtiquettes } from './echelles.js';

// ═════════════════════════════════════════════════════════════════════
// Le graphique des Statistiques (D5) : un seul composant, en SVG fait main sur
// le modèle de GraphiquesAchats.jsx. Le SVG ne porte que les formes, étirées
// à la largeur ; les textes, les marqueurs et les zones de toucher sont en
// HTML par-dessus, jamais déformés.
//
// Trois tracés : courbe (mesures dans le temps), barres (une ventilation ou
// une seule tranche), barres empilées (une ventilation dans le temps).
// Une série ne se distingue jamais par la couleur seule (D6) : chacune a son
// marqueur, son numéro en bout de courbe et dans la légende ; la comparaison
// reprend la couleur de sa série, en tirets.
// Une valeur absente n'est jamais tracée à zéro : la courbe s'interrompt, la
// barre manque, le détail dit « n/a » (D9).
// Les axes et les valeurs sont en data-no-translate (D18).
// ═════════════════════════════════════════════════════════════════════

const FORMES = ['rond', 'carre', 'triangle', 'losange', 'croix', 'plus'];
export const couleurSerie = (rang) => `var(--serie-${(rang % 6) + 1})`;
const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);

export function Marqueur({ rang, taille = 10, creux = false }) {
  const c = couleurSerie(rang);
  const forme = FORMES[rang % FORMES.length];
  const plein = { fill: creux ? 'var(--surface)' : c, stroke: c, strokeWidth: 1.6 };
  const trait = { fill: 'none', stroke: c, strokeWidth: 2.2, strokeLinecap: 'round' };
  return (
    <svg width={taille} height={taille} viewBox="0 0 12 12" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      {forme === 'rond' && <circle cx="6" cy="6" r="4.2" style={plein} />}
      {forme === 'carre' && <rect x="2" y="2" width="8" height="8" style={plein} />}
      {forme === 'triangle' && <path d="M6 1.6 L10.8 10 L1.2 10 Z" style={plein} />}
      {forme === 'losange' && <path d="M6 1.2 L10.8 6 L6 10.8 L1.2 6 Z" style={plein} />}
      {forme === 'croix' && <path d="M2.2 2.2 L9.8 9.8 M9.8 2.2 L2.2 9.8" style={trait} />}
      {forme === 'plus' && <path d="M6 1.6 L6 10.4 M1.6 6 L10.4 6" style={trait} />}
    </svg>
  );
}

const st = {
  legende: { display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 13, color: 'var(--text2)', marginBottom: 10 },
  itemLegende: { display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 },
  numero: { fontFamily: 'var(--font-num)', fontSize: 12, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  graduation: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)', pointerEvents: 'none' },
  chiffreAxe: { position: 'absolute', bottom: 2, fontSize: 11, lineHeight: '12px', color: 'var(--text3)', fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums', background: 'var(--surface)', padding: '0 3px' },
  axe: { position: 'relative', height: 16, marginTop: 4, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' },
  detail: { marginTop: 8, minHeight: 44, fontSize: 13, color: 'var(--text2)' },
  detailTitre: { fontFamily: 'var(--font-num)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums', marginBottom: 4 },
  detailLigne: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '2px 0' },
  valeur: { fontFamily: 'var(--font-num)', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  bout: { position: 'absolute', transform: 'translate(6px, -50%)', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text)', fontFamily: 'var(--font-num)', background: 'var(--surface)', padding: '0 3px', borderRadius: 3, pointerEvents: 'none', whiteSpace: 'nowrap' },
};

// Nom d'une série : une donnée saisie ou un chiffre ne se traduit pas.
export function NomSerie({ s }) {
  return s.brut || s.donnee ? <span data-no-translate>{s.libelle}</span> : <span>{s.libelle}</span>;
}

// Valeur exacte et son unité, dans deux nœuds (D18).
export function Valeur({ v, unite, court = false }) {
  const u = libelleUnite(unite);
  if (!estNombre(v)) return <span style={st.valeur}>n/a</span>;
  return (
    <span style={{ whiteSpace: 'nowrap' }} data-no-translate>
      {unite === 'chf' ? <><span>{u}</span>{' '}</> : null}
      <span style={st.valeur}>{nombreDe(v, unite, { court })}</span>
      {u && unite !== 'chf' ? <>{' '}<span>{u}</span></> : null}
    </span>
  );
}

export function Legende({ series, comparaison, libelleComparaison }) {
  return (
    <div style={st.legende} data-stat-legende="">
      {series.map((s) => (
        <span key={s.id} style={st.itemLegende}>
          <span style={st.numero} data-no-translate>{s.rang + 1}</span>
          <Marqueur rang={s.rang} />
          <NomSerie s={s} />
          {libelleUnite(s.unite) ? <span data-no-translate>({libelleUnite(s.unite)})</span> : null}
        </span>
      ))}
      {comparaison ? (
        <span style={st.itemLegende}>
          <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><path d="M1 5 L25 5" style={{ stroke: 'var(--text2)', strokeWidth: 2, strokeDasharray: '5 4', fill: 'none' }} /></svg>
          <span>En tirets :</span> <span>{libelleComparaison}</span>
        </span>
      ) : null}
    </div>
  );
}

// Les colonnes du tracé selon le type : des tranches (temps), des séries
// (une seule tranche) ou des catégories (ventilation sur la période).
function colonnesDe({ type, series, tranches, ventilation }) {
  if (type === 'barres' && ventilation) {
    return { genre: 'categories', colonnes: series.map((s) => ({ cle: s.id, serie: s, barres: [{ s, v: s.total, avant: s.totalComparaison }] })) };
  }
  if (type === 'barres' && tranches.length <= 1) {
    return { genre: 'series', colonnes: series.map((s) => ({ cle: s.id, serie: s, barres: [{ s, v: s.valeurs[0] ?? null, avant: s.comparaison ? s.comparaison[0] ?? null : null }] })) };
  }
  return { genre: 'temps', colonnes: tranches.map((t, i) => ({ cle: t.cle, tranche: t, rang: i, barres: series.map((s) => ({ s, v: s.valeurs[i] ?? null, avant: s.comparaison ? s.comparaison[i] ?? null : null })) })) };
}

// composition : rendue par composer() ; tranches : celles de la période.
export default function Graphique({ composition, tranches, hauteur = 260, libelleComparaison = '' }) {
  const { type, series, echelles, ventilation, comparaison } = composition;
  const [sel, setSel] = useState(null);
  const { genre, colonnes } = useMemo(() => colonnesDe({ type, series, tranches, ventilation }), [type, series, tranches, ventilation]);
  const n = colonnes.length;
  const echelleDe = (s) => (s.axe === 'd' && echelles.d ? echelles.d : echelles.g);
  const y = (s, v) => { const p = positionSur(echelleDe(s), v); return p == null ? null : 100 - p * 100; };
  const zero = (s) => 100 - positionSur(echelleDe(s), 0) * 100;
  const x = (i) => i * 10 + 5;
  const choisie = sel != null && sel < n ? colonnes[sel] : null;
  const unites = composition.unites;

  // Courbes : un chemin par série, interrompu aux valeurs absentes.
  const chemin = (s, valeurs) => {
    let d = '';
    let leve = true;
    valeurs.forEach((v, i) => {
      const yy = y(s, v);
      if (yy == null) { leve = true; return; }
      d += `${leve ? 'M' : 'L'}${x(i)} ${yy.toFixed(3)} `;
      leve = false;
    });
    return d;
  };
  // Marqueurs : tous jusqu'à 45 points, sinon un sur k, le dernier toujours.
  const pasMarqueur = n <= 45 ? 1 : Math.ceil(n / 24);
  const dernierRang = (s) => { for (let i = s.valeurs.length - 1; i >= 0; i -= 1) if (estNombre(s.valeurs[i])) return i; return -1; };

  const rangsAxe = genre === 'temps' ? rangsEtiquettes(n, 7) : [];
  const libelleAxeDroit = unites[1] ? libelleUnite(unites[1]) : '';

  return (
    <div style={{ minWidth: 0 }} data-stat-graphique={type}>
      <Legende series={series} comparaison={comparaison && type === 'courbe'} libelleComparaison={libelleComparaison} />
      <div style={{ position: 'relative', height: hauteur, marginTop: 14, marginRight: type === 'courbe' ? 26 : 0 }}>
        {echelles.g.graduations.map((g) => {
          const frac = positionSur(echelles.g, g);
          const droite = echelles.d ? echelles.d.min + frac * (echelles.d.max - echelles.d.min) : null;
          return (
            <div key={g} style={{ ...st.graduation, bottom: `${frac * 100}%`, borderTopColor: g === 0 && echelles.g.min < 0 ? 'var(--text3)' : 'var(--border)' }} data-no-translate>
              <span style={{ ...st.chiffreAxe, left: 0 }}>{unites[0] === 'chf' ? 'CHF ' : ''}{nombreDe(g, unites[0], { court: true })}{unites[0] === 'pct' ? ' %' : unites[0] === 'min' ? ' min' : ''}</span>
              {droite != null ? <span style={{ ...st.chiffreAxe, right: 0 }}>{unites[1] === 'chf' ? 'CHF ' : ''}{nombreDe(droite, unites[1], { court: true })}{libelleAxeDroit && unites[1] !== 'chf' ? ` ${libelleAxeDroit}` : ''}</span> : null}
            </div>
          );
        })}
        <svg viewBox={`0 0 ${Math.max(n, 1) * 10} 100`} preserveAspectRatio="none" width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block', overflow: 'visible' }} aria-hidden="true">
          {type === 'courbe' && series.map((s) => (
            <g key={s.id}>
              {s.comparaison ? <path d={chemin(s, s.comparaison)} vectorEffect="non-scaling-stroke" style={{ fill: 'none', stroke: couleurSerie(s.rang), strokeWidth: 2, strokeDasharray: '6 5', opacity: 0.75 }} /> : null}
              <path d={chemin(s, s.valeurs)} vectorEffect="non-scaling-stroke" style={{ fill: 'none', stroke: couleurSerie(s.rang), strokeWidth: 2.2, strokeLinejoin: 'round' }} />
            </g>
          ))}
          {type === 'barres' && colonnes.map((c, i) => c.barres.slice(0, 1).map(({ s, v, avant }) => {
            const yy = y(s, v);
            const z = zero(s);
            const ya = comparaison || genre !== 'temps' ? y(s, avant) : null;
            return (
              <g key={c.cle}>
                {ya != null ? <rect x={i * 10 + 1.4} width={3.2} y={Math.min(ya, z)} height={Math.abs(z - ya)} style={{ fill: couleurSerie(s.rang), fillOpacity: 0.35 }} /> : null}
                {yy != null ? <rect x={ya != null ? i * 10 + 5 : i * 10 + 2} width={ya != null ? 3.6 : 6} y={Math.min(yy, z)} height={Math.abs(z - yy)} rx={0.5} style={{ fill: couleurSerie(s.rang) }} /> : null}
              </g>
            );
          }))}
          {type === 'empile' && colonnes.map((c, i) => {
            let haut = 0;
            let bas = 0;
            return (
              <g key={c.cle}>
                {c.barres.map(({ s, v }) => {
                  if (!estNombre(v) || v === 0) return null;
                  const de = v >= 0 ? haut : bas;
                  const a = de + v;
                  if (v >= 0) haut = a; else bas = a;
                  const y1 = y(s, de);
                  const y2 = y(s, a);
                  return <rect key={s.id} x={i * 10 + 1.5} width={7} y={Math.min(y1, y2)} height={Math.abs(y1 - y2)} style={{ fill: couleurSerie(s.rang), stroke: 'var(--surface)', strokeWidth: 0.6 }} vectorEffect="non-scaling-stroke" />;
                })}
              </g>
            );
          })}
          {choisie && genre === 'temps' ? <path d={`M${x(sel)} 0 L${x(sel)} 100`} vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--text3)', strokeWidth: 1, fill: 'none' }} /> : null}
        </svg>
        {type === 'courbe' && series.map((s) => s.valeurs.map((v, i) => {
          const yy = y(s, v);
          const dernier = i === dernierRang(s);
          if (yy == null || (!dernier && i % pasMarqueur !== 0 && sel !== i)) return null;
          return (
            <span key={`${s.id}-${i}`} style={{ position: 'absolute', left: `${((i + 0.5) / n) * 100}%`, top: `${yy}%`, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
              <Marqueur rang={s.rang} taille={sel === i ? 12 : 9} />
            </span>
          );
        }))}
        {type === 'courbe' && series.map((s) => {
          const i = dernierRang(s);
          if (i < 0) return null;
          return <span key={`bout-${s.id}`} style={{ ...st.bout, left: `${((i + 0.5) / n) * 100}%`, top: `${y(s, s.valeurs[i])}%` }} data-no-translate data-stat-bout="">{s.rang + 1}</span>;
        })}
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          {colonnes.map((c, i) => (
            <div
              key={c.cle}
              onMouseEnter={() => setSel(i)}
              onClick={() => setSel(i)}
              data-stat-colonne=""
              style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', cursor: 'pointer', background: sel === i && genre !== 'temps' ? 'var(--bg2)' : 'transparent', opacity: sel === i && genre !== 'temps' ? 0.35 : 1 }}
            >
              {type !== 'courbe' && c.barres.every((b) => !estNombre(b.v)) ? <span style={{ fontSize: 10, color: 'var(--text3)', lineHeight: '12px', paddingBottom: 2 }}>n/a</span> : null}
            </div>
          ))}
        </div>
      </div>
      {genre === 'temps' ? (
        <div style={{ ...st.axe, marginRight: type === 'courbe' ? 26 : 0 }} data-no-translate>
          {rangsAxe.map((i, k) => (
            <span key={i} style={{ position: 'absolute', left: `${((i + 0.5) / n) * 100}%`, transform: k === 0 && n > 7 ? 'translateX(-20%)' : k === rangsAxe.length - 1 && n > 7 ? 'translateX(-80%)' : 'translateX(-50%)', whiteSpace: 'nowrap' }}>
              {libelleTranche(colonnes[i].tranche, { court: true })}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 2, marginTop: 4, fontSize: 11, color: 'var(--text3)' }}>
          {colonnes.map((c) => (
            <span key={c.cle} style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} data-no-translate>{c.serie.rang + 1}</span>
          ))}
        </div>
      )}
      <div style={st.detail} aria-live="polite" data-stat-detail="">
        {choisie ? (
          <>
            {genre === 'temps' ? <div style={st.detailTitre} data-no-translate>{bornesTranche(choisie.tranche)}</div> : null}
            {choisie.barres.map(({ s, v, avant }) => (
              <div key={s.id} style={st.detailLigne}>
                <span style={st.numero} data-no-translate>{s.rang + 1}</span>
                <Marqueur rang={s.rang} />
                <NomSerie s={s} />
                <Valeur v={v} unite={s.unite} />
                {s.comparaison || (genre !== 'temps' && s.totalComparaison !== null && s.totalComparaison !== undefined) ? <span style={{ color: 'var(--text3)' }}><span>avant :</span> <Valeur v={avant} unite={s.unite} /></span> : null}
              </div>
            ))}
          </>
        ) : <span>Touchez le graphique pour lire les valeurs exactes.</span>}
      </div>
    </div>
  );
}
