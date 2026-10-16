import React from 'react';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
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

  // ─── Indicateur de tendance (par rapport aux 7 jours précédents) ───
  // Icône seule (hausse, baisse, stable) avec un nom accessible fixe : le
  // libellé ne porte pas l'écart chiffré, sinon chaque valeur partirait à la
  // traduction. Pour une zone froide, la hausse est mauvaise ; pour une zone
  // chaude, la baisse.
  let TrendIcon = null, trendColor = null, trendLabel = null;
  if (trend) {
    if (trend.direction === 'up') {
      TrendIcon = TrendingUp;
      trendColor = zone.type === 'froid' ? 'var(--danger-strong)' : 'var(--warning-strong)';
      trendLabel = 'En hausse par rapport à la semaine précédente';
    } else if (trend.direction === 'down') {
      TrendIcon = TrendingDown;
      trendColor = zone.type === 'chaud' ? 'var(--danger-strong)' : 'var(--success-strong)';
      trendLabel = 'En baisse par rapport à la semaine précédente';
    } else {
      TrendIcon = ArrowRight;
      trendColor = 'var(--text2)';
      trendLabel = 'Stable par rapport à la semaine précédente';
    }
  }

  // Pas de tuile encadrée : la zone se lit en ligne, son statut porté par la
  // couleur de la valeur et du libellé « Conforme / Non conforme ».
  const vc = conforme===null ? 'var(--text2)'   : conforme ? 'var(--success-text)' : 'var(--danger-strong)';

  return (
    <div style={{ ...hs.zoneTile, borderRadius: 0, borderBottom: '1px solid var(--border)', flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: 0 }}>
      <div style={{ padding: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{zone.nom}</div>
            <div style={{ fontSize: 10, color: 'var(--text2)' }}>Cible {zone.cible}{zone.unite}, de {zone.min ?? '-'} à {zone.max ?? '+∞'}</div>
          </div>
        </div>
        {last ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-num)', color: vc, display: 'flex', alignItems: 'baseline', gap: 4, justifyContent: 'flex-end' }}>
              {last.valeur}{zone.unite}
              {TrendIcon && (
                <span
                  role="img"
                  aria-label={trendLabel}
                  title={trendLabel}
                  style={{ display: 'inline-flex', alignSelf: 'center', color: trendColor }}
                ><TrendIcon size={16} strokeWidth={2.2} aria-hidden="true" /></span>
              )}
            </div>
            <div style={{ fontSize: 10, color: delaiAlert ? 'var(--danger-strong)' : 'var(--text2)', fontWeight: delaiAlert ? 700 : 400 }}>
              {delaiLabel}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>Aucun relevé</div>
        )}
      </div>
      <div style={{ padding: '0 0 10px' }}>
        {!isActive ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div>
              {last && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                  background: conforme ? 'var(--success-bg)' : 'var(--danger-bg)', color: conforme ? 'var(--success-text)' : 'var(--danger-strong)' }}>
                  {conforme ? 'Conforme' : 'Non conforme'}
                </span>
              )}
              {delaiAlert && <div style={{ fontSize: 10, color: 'var(--danger-strong)', marginTop: 4, fontWeight: 600 }}>Relevé en retard !</div>}
            </div>
            {canWrite && (
              <button
                style={{ padding: '7px 14px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700 }}
                onClick={() => { setInlineReleve(zone.id); setInlineTempInput(''); }}
              >Relever</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              autoFocus type="number" step="0.1"
              value={inlineTempInput}
              onChange={e => setInlineTempInput(e.target.value)}
              placeholder={`${zone.cible}${zone.unite}`}
              style={{ flex: '1 1 50px', minWidth: 0, padding: '8px 10px', border: '2px solid var(--accent)', borderRadius: 7, fontSize: 16, fontWeight: 700, textAlign: 'center', fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)' }}
              onKeyDown={e => {
                if (e.key === 'Enter') submitInlineReleve(zone, inlineTempInput);
                if (e.key === 'Escape') setInlineReleve(null);
              }}
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text2)', flexShrink: 0 }}>{zone.unite}</span>
            <button style={{ flexShrink: 0, padding: '8px 12px', background: 'var(--success-fill)', color: 'var(--on-success)', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
              onClick={() => submitInlineReleve(zone, inlineTempInput)}>✓</button>
            <button style={{ flexShrink: 0, padding: '8px 10px', background: 'var(--bg)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}
              onClick={() => setInlineReleve(null)} aria-label="Annuler le relevé">×</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ZoneTile;
