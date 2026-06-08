import React from 'react';

export function Card({ children, style = {}, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '16px 18px',
        boxShadow: '0 8px 24px rgba(31, 41, 51, 0.06)',
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
    primary: { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' },
    ghost: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
    danger: { background: 'var(--danger-bg-soft)', color: '#b91c1c', border: '1px solid var(--danger-bd)' },
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
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: small ? 32 : 38,
        padding: small ? '5px 10px' : '8px 14px',
        borderRadius: 8,
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
      style={{
        width: '100%',
        padding: '8px 12px',
        border: '1px solid var(--border)',
        borderRadius: 8,
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

export function TabBar({ tabs, active, onChange, style = {} }) {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', flexWrap: 'wrap', ...style }}>
      {(Array.isArray(tabs) ? tabs : []).map((tab) => (
        <Btn
          key={tab.id}
          variant={active === tab.id ? 'tabActive' : 'tab'}
          onClick={() => onChange(tab.id)}
          style={{ padding: '10px 14px' }}
        >
          {tab.icon ? <span>{tab.icon}</span> : null}
          {tab.label}
        </Btn>
      ))}
    </div>
  );
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

export function KpiCard({ label, value, sub, delta, color, chart, style = {} }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 9, ...style }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: color || 'var(--text)', fontFamily: 'var(--font-serif)', lineHeight: 1 }}>
          {value}
        </div>
        {delta !== undefined ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: Number(delta) >= 0 ? 'var(--success-text)' : '#b91c1c', marginBottom: 2 }}>
            {Number(delta) >= 0 ? '+' : ''}{delta}
          </div>
        ) : null}
      </div>
      {sub ? <div style={{ fontSize: 12, color: 'var(--text2)' }}>{sub}</div> : null}
      {chart}
    </Card>
  );
}
