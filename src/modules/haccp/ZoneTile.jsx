import React from 'react';
import { hs } from './HACCP.styles.js';

const ZoneTile = ({ zone, last, trend, inlineReleve, inlineTempInput, canWrite, setInlineReleve, setInlineTempInput, submitInlineReleve }) => {
  const conforme = last ? last.conforme : null;
  const isActive = inlineReleve === zone.id;

  let delaiLabel = null, delaiAlert = false;
  if (last) {
    const lastDt = new Date(`${last.date}T${last.heure}`);
    const diffH = (Date.now() - lastDt.getTime()) / 3600000;
    if (diffH < 1) delaiLabel = `Il y a ${Math.round(diffH * 60)} min`;
    else if (diffH < 24) {
      delaiLabel = `Il y a ${Math.floor(diffH)}h`;
      if (zone.type === 'froid' && diffH > 4) delaiAlert = true;
    } else {
      delaiLabel = `${Math.floor(diffH / 24)}j`;
      delaiAlert = true;
    }
  }

  // ─── Indicateur de tendance (vs 7 jours précédents) ───
  // up   = ↗ (température monte)
  // down = ↘ (température baisse)
  // stable = → (pas de variation significative)
  // Pour une zone froide, ↗ est mauvais ; pour une zone chaude, ↘ est mauvais.
  let trendIcon = null, trendColor = null, trendLabel = null;
  if (trend) {
    if (trend.direction === 'up') {
      trendIcon = '↗';
      trendColor = zone.type === 'froid' ? 'var(--danger-strong)' : 'var(--warning-strong)';
      trendLabel = `+${trend.delta.toFixed(1)}${zone.unite} vs sem. dernière`;
    } else if (trend.direction === 'down') {
      trendIcon = '↘';
      trendColor = zone.type === 'chaud' ? 'var(--danger-strong)' : 'var(--success-strong)';
      trendLabel = `${trend.delta.toFixed(1)}${zone.unite} vs sem. dernière`;
    } else {
      trendIcon = '→';
      trendColor = 'var(--text2)';
      trendLabel = 'stable vs sem. dernière';
    }
  }

  const bg = conforme===null ? 'var(--surface)' : conforme ? 'var(--success-bg-soft)' : 'var(--danger-bg-soft)';
  const bc = conforme===null ? 'var(--border)'  : conforme ? 'var(--success-bd)' : 'var(--danger-bd)';
  const vc = conforme===null ? 'var(--text2)'   : conforme ? 'var(--success-text)' : 'var(--danger-strong)';

  return (
    <div style={{ ...hs.zoneTile, background: bg, border: `2px solid ${bc}`, flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${bc}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{zone.icone}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{zone.nom}</div>
            <div style={{ fontSize: 10, color: 'var(--text2)' }}>Cible {zone.cible}{zone.unite} · [{zone.min ?? '—'}–{zone.max ?? '+∞'}]</div>
          </div>
        </div>
        {last ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-serif)', color: vc, display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
              {last.valeur}{zone.unite}
              {trendIcon && (
                <span
                  style={{ fontSize: 14, color: trendColor, fontWeight: 700 }}
                  title={trendLabel}
                >{trendIcon}</span>
              )}
            </div>
            <div style={{ fontSize: 10, color: delaiAlert ? 'var(--danger-strong)' : 'var(--text2)', fontWeight: delaiAlert ? 700 : 400 }}>
              {delaiAlert ? '⚠ ' : ''}{delaiLabel}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>Aucun relevé</div>
        )}
      </div>
      <div style={{ padding: '10px 14px' }}>
        {!isActive ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div>
              {last && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                  background: conforme ? 'var(--success-bg)' : 'var(--danger-bg)', color: conforme ? 'var(--success-text)' : 'var(--danger-strong)' }}>
                  {conforme ? '✓ Conforme' : '✕ Non conforme'}
                </span>
              )}
              {delaiAlert && <div style={{ fontSize: 10, color: 'var(--danger-strong)', marginTop: 4, fontWeight: 600 }}>⚠ Relevé en retard !</div>}
            </div>
            {canWrite && (
              <button
                style={{ padding: '7px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700 }}
                onClick={() => { setInlineReleve(zone.id); setInlineTempInput(''); }}
              >+ Relever</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              autoFocus type="number" step="0.1"
              value={inlineTempInput}
              onChange={e => setInlineTempInput(e.target.value)}
              placeholder={`${zone.cible}${zone.unite}`}
              style={{ flex: 1, padding: '8px 10px', border: '2px solid var(--accent)', borderRadius: 7, fontSize: 16, fontWeight: 700, textAlign: 'center', fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)' }}
              onKeyDown={e => {
                if (e.key === 'Enter') submitInlineReleve(zone, inlineTempInput);
                if (e.key === 'Escape') setInlineReleve(null);
              }}
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text2)' }}>{zone.unite}</span>
            <button style={{ padding: '8px 12px', background: 'var(--success-strong)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
              onClick={() => submitInlineReleve(zone, inlineTempInput)}>✓</button>
            <button style={{ padding: '8px 10px', background: 'var(--bg)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}
              onClick={() => setInlineReleve(null)}>✕</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ZoneTile;
