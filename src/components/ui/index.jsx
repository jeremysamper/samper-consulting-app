import React from 'react';
import SegmentedTabs from './SegmentedTabs.jsx';

export { SegmentedTabs };

export function Card({ children, style = {}, onClick }) {
  return (
    <div
      onClick={onClick}
      /* Les états hover/active vivent dans app.css (.ui-card--clickable) :
         impossible de les écrire en style inline. */
      className={onClick ? 'ui-card ui-card--clickable' : 'ui-card'}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        padding: '16px 18px',
        boxShadow: 'var(--sh-xs)',
        cursor: onClick ? 'pointer' : 'default',
        ...style
      }}
    >
      {children}
    </div>
  );
}

export function Btn({
  children,
  variant = 'ghost',
  small = false,
  onClick,
  disabled = false,
  style = {},
  type = 'button',
  title,
  ariaLabel
}) {
  const variants = {
    /* Dégradé accent2 → accent : donne au bouton principal un léger volume
       (pétrole en light, aqua en dark) sans changer sa couleur perçue. */
    primary: { background: 'linear-gradient(160deg, var(--accent2), var(--accent) 62%)', color: '#fff', border: '1px solid var(--accent)', boxShadow: 'var(--sh-xs)' },
    ghost: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
    danger: { background: 'var(--danger-bg-soft)', color: 'var(--danger-text)', border: '1px solid var(--danger-bd)' },
    success: { background: 'var(--success-bg-soft)', color: 'var(--success-text)', border: '1px solid var(--success-bd)' },
    tab: { background: 'transparent', color: 'var(--text2)', border: 'none', borderBottom: '2px solid transparent', borderRadius: 0 },
    tabActive: { background: 'transparent', color: 'var(--accent)', border: 'none', borderBottom: '2px solid var(--accent)', borderRadius: 0 }
  };

  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      /* La hauteur est posée en inline juste dessous, donc aucune feuille de
         style ne peut la relever sur mobile sans !important. Cette classe donne
         un point d'accroche à la règle tactile de app.css (pointer: coarse),
         qui remonte les 32/38px à 44px sur tablette et téléphone. */
      className={`ui-btn ui-btn--${variants[variant] ? variant : 'ghost'}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: small ? 32 : 38,
        padding: small ? '5px 10px' : '8px 14px',
        borderRadius: 'var(--r-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font)',
        fontSize: small ? 12 : 13,
        fontWeight: 700,
        opacity: disabled ? 0.6 : 1,
        whiteSpace: 'nowrap',
        ...(variants[variant] || variants.ghost),
        ...style
      }}
    >
      {children}
    </button>
  );
}

export function Input({ value, onChange, placeholder, type = 'text', style = {}, ...props }) {
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      className="ui-input"
      style={{
        width: '100%',
        padding: '8px 12px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'var(--font)',
        fontSize: 13,
        ...style
      }}
      {...props}
    />
  );
}

// TabBar délègue désormais au SegmentedTabs (bande compacte 1 ligne scrollable)
// pour que tous les usages existants profitent du rendu mobile compact.
export function TabBar({ tabs, active, onChange, style = {} }) {
  return <SegmentedTabs tabs={tabs} active={active} onChange={onChange} style={style} />;
}

export function SectionHeader({ title, sub, action, style = {} }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, ...style }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>{title}</div>
        {sub ? <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{sub}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function KpiCard({ label, value, sub, delta, color, chart, glow = false, style = {} }) {
  /* glow : liseré accent + halo (aqua en dark) façon chip lumineuse.
     Surcharge du raccourci border COMPLET, jamais borderColor seul
     (voir lint:borders). */
  const glowStyle = glow
    ? { border: '1px solid var(--accent-bd)', boxShadow: 'var(--glow-accent)' }
    : {};
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 9, ...glowStyle, ...style }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: color || 'var(--text)', fontFamily: 'var(--font-serif)', lineHeight: 1 }}>
          {value}
        </div>
        {delta !== undefined ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: Number(delta) >= 0 ? 'var(--success-text)' : 'var(--danger-text)', marginBottom: 2 }}>
            {Number(delta) >= 0 ? '+' : ''}{delta}
          </div>
        ) : null}
      </div>
      {sub ? <div style={{ fontSize: 12, color: 'var(--text2)' }}>{sub}</div> : null}
      {chart}
    </Card>
  );
}
