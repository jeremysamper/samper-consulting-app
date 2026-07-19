// Styles partages du module Mise en place. Inline JSX + tokens CSS (dark mode).
// Mobile d'abord : gros points de contact, lisible sur tablette de cuisine.

export const s = {
  root: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' },

  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' },
  title: { fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)', margin: 0 },
  sub: { fontSize: 12, color: 'var(--text2)', marginTop: 2 },

  addBtn: { padding: '10px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  ghostBtn: { padding: '10px 16px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' },
  backBtn: { background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--text2)', fontFamily: 'var(--font)', flexShrink: 0 },
  dangerBtn: { padding: '9px 14px', background: 'none', border: '1px solid var(--danger-bd)', color: 'var(--danger-strong)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },

  // Liste des listes
  cardsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  listeCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', fontFamily: 'var(--font)' },
  listeNom: { fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  listeDate: { fontSize: 12, color: 'var(--accent)', fontWeight: 600 },
  listeMeta: { fontSize: 12, color: 'var(--text2)' },

  // Barre d'avancement
  progressTrack: { height: 8, background: 'var(--bg)', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--border)' },
  progressFill: { height: '100%', background: 'var(--accent)', borderRadius: 5, transition: 'width .35s' },
  progressLabel: { fontSize: 11, color: 'var(--text2)', fontWeight: 600, marginTop: 4 },

  empty: { padding: '28px 18px', textAlign: 'center', color: 'var(--text2)', fontSize: 14, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12 },

  // Sections detail
  section: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  sectionHead: { padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 },
  sectionTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  sectionHint: { fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', lineHeight: 1.5 },
  sectionUrgent: { borderLeft: '4px solid var(--danger-strong)' },
  sectionGrosse: { borderLeft: '4px solid var(--accent)' },

  // Item (case a cocher + label + qty)
  itemRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)', minHeight: 56 },
  checkbox: { width: 26, height: 26, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--accent)' },
  itemBody: { flex: 1, minWidth: 0 },
  itemLabel: { fontSize: 15, fontWeight: 600, color: 'var(--text)' },
  itemLabelDone: { textDecoration: 'line-through', color: 'var(--text2)', fontWeight: 500 },
  itemMeta: { fontSize: 12, color: 'var(--text2)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  qtyTag: { fontSize: 12, fontWeight: 700, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '3px 9px', whiteSpace: 'nowrap' },
  aQualifier: { fontSize: 11, fontWeight: 600, color: 'var(--warning-text)', background: 'var(--warning-bg)', borderRadius: 8, padding: '2px 8px' },
  itemDel: { background: 'none', border: 'none', color: 'var(--danger-strong)', fontSize: 18, cursor: 'pointer', flexShrink: 0, lineHeight: 1, padding: 4 },

  // Editeur
  editorCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { padding: '11px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', outline: 'none', width: '100%', boxSizing: 'border-box', minWidth: 0 },
  // Plancher a 200px : le champ date rendu par iOS occupe ~192px et ne
  // retrecit pas, il debordait de la carte a 150px.
  formRow2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },

  pickList: { display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' },
  pickRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', minHeight: 48 },
  pickRowSel: { background: 'var(--bg)' },
  pickName: { flex: 1, minWidth: 0, fontSize: 14, color: 'var(--text)', fontWeight: 500 },

  chipCong: { fontSize: 11, fontWeight: 600, borderRadius: 8, padding: '2px 8px', whiteSpace: 'nowrap' },
  chipGrosse: { background: 'var(--success-bg)', color: 'var(--success-text)' },
  chipUrgent: { background: 'var(--warning-bg)', color: 'var(--warning-text)' },

  selItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', flexWrap: 'wrap' },
  selName: { flex: 1, minWidth: 120, fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  qtyInput: { width: 74, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', outline: 'none' },
  uniteInput: { width: 78, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', outline: 'none' },

  toggleGroup: { display: 'flex', gap: 6 },
  toggleBtn: { padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  toggleActive: { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' },

  actionsRow: { display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' },
  moduleActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
};

// Formatage date de service (date simple, sans fuseau).
export function formatDateService(d) {
  if (!d) return 'Sans date';
  const parts = String(d).slice(0, 10).split('-');
  if (parts.length !== 3) return String(d);
  const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return dt.toLocaleDateString('fr-CH', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

// Formatage horodatage « fait » en Europe/Zurich (stocke en UTC).
export function formatFaitAt(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('fr-CH', {
      timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch (e) { return ''; }
}
