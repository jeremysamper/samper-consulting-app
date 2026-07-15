// Styles KDS — passe cuisine. Couleurs via tokens app.css (dark-mode automatique).
export const s = {
  root: { padding: '14px 16px 40px', maxWidth: 1500, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  title: { fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--text)', margin: 0, lineHeight: 1.1 },
  sub: { fontSize: 13, color: 'var(--text2)', marginTop: 2 },
  kpi: { marginLeft: 'auto', fontSize: 13, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' },

  banner: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--warning-bg-soft)', border: '1px solid var(--warning-bd)', color: 'var(--warning-text)', fontSize: 13, marginBottom: 14 },
  bannerBtn: { marginLeft: 'auto', padding: '6px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--warning-bd)', background: 'transparent', color: 'var(--warning-text)', cursor: 'pointer', fontSize: 13, fontWeight: 600 },

  board: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12, alignItems: 'start' },
  empty: { textAlign: 'center', color: 'var(--text3)', padding: '48px 0', fontSize: 14 },

  ticketHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' },
  table: { fontWeight: 700, fontSize: 16, color: 'var(--text)' },
  couv: { fontSize: 12, color: 'var(--text2)' },
  timer: { marginLeft: 'auto', fontSize: 13, fontVariantNumeric: 'tabular-nums' },
  body: { display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px' },

  row: { display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' },
  mainBtn: { display: 'flex', alignItems: 'center', gap: 9, flex: 1, textAlign: 'left', padding: '8px 9px', border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', color: 'inherit', minWidth: 0 },
  mark: { flex: '0 0 auto', width: 18, textAlign: 'center', fontSize: 15, fontWeight: 700 },
  itemName: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  itemMods: { fontSize: 12, color: 'var(--text3)', marginTop: 1 },
  holdBtn: { flex: '0 0 auto', padding: '6px 9px', border: 'none', background: 'transparent', color: 'var(--info-text)', cursor: 'pointer', fontSize: 12, fontWeight: 600 },

  voidRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 'var(--r-sm)', background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)' },
  voidText: { flex: 1, textDecoration: 'line-through', color: 'var(--danger-text)', fontSize: 13 },
  voidTag: { fontSize: 11, color: 'var(--danger-text)', fontWeight: 600 },

  suiteBlock: { borderTop: '1px dashed var(--info-bd)', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--info-bg-soft)' },
  suiteHead: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--info-text)' },
  suiteRelance: { marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--info-text)', border: '1px solid var(--info-bd)', background: 'transparent', borderRadius: 'var(--r-sm)', padding: '3px 9px', cursor: 'pointer' },
  suiteRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 'var(--r-sm)', background: 'var(--surface)' },
  suiteName: { flex: 1, fontSize: 13, color: 'var(--text2)', minWidth: 0 },
  relanceBtn: { flex: '0 0 auto', fontSize: 12, fontWeight: 600, color: 'var(--success-text)', border: '1px solid var(--success-bd)', background: 'transparent', borderRadius: 'var(--r-sm)', padding: '3px 9px', cursor: 'pointer' },

  footer: { padding: '8px 12px 12px', borderTop: '1px solid var(--border)' },
  completeBtn: { width: '100%', padding: '9px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--accent-bd)', background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  served: { marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--success-text)' },

  doneWrap: { marginTop: 22 },
  doneHead: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--text2)', marginBottom: 10 },
  doneGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 },
  doneCard: { border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface2)', padding: '10px 12px' },
  doneCardHead: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  doneLine: { fontSize: 12, color: 'var(--text2)' },
  reopenBtn: { marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--text2)', border: '1px solid var(--border2)', background: 'transparent', borderRadius: 'var(--r-sm)', padding: '6px 12px', cursor: 'pointer', minHeight: 36 },

  // ── Onboarding « connecter Lightspeed » ──
  onboard: { maxWidth: 560, margin: '24px auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh-sm)', padding: '22px 24px' },
  onboardTitle: { fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--text)', margin: '0 0 4px' },
  onboardSub: { fontSize: 13, color: 'var(--text2)', margin: '0 0 16px' },
  onboardSteps: { display: 'flex', flexDirection: 'column', gap: 12, margin: '0 0 18px' },
  onboardStep: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  onboardNum: { flex: '0 0 auto', width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-light)', border: '1px solid var(--accent-bd)', color: 'var(--accent)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  onboardText: { fontSize: 14, color: 'var(--text)', lineHeight: 1.45 },
  onboardHint: { fontSize: 12, color: 'var(--text3)', marginTop: 2 },
  onboardCta: { width: '100%', padding: '12px 16px', borderRadius: 'var(--r)', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', minHeight: 48 },
  onboardNote: { fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 10 },

  // ── Indicateur de synchro (header) ──
  syncWrap: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' },
  syncDot: (ok) => ({ width: 8, height: 8, borderRadius: '50%', background: ok ? 'var(--success-strong)' : 'var(--danger-strong)' }),
};

export function ticketStyle(ageColor) {
  return { border: `1px solid ${ageColor}`, borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--surface)', boxShadow: 'var(--sh-sm)' };
}

// Etat visuel d'une ligne « a faire » selon son bump.
export function faireRowStyle(bumped) {
  return {
    ...s.row,
    background: bumped ? 'var(--success-bg-soft)' : 'var(--surface)',
    borderColor: bumped ? 'var(--success-bd)' : 'var(--border)',
  };
}
