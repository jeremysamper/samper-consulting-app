// Styles partages du module Mise en place. Inline JSX + tokens CSS (dark mode).
// Mobile d'abord : gros points de contact, lisible sur tablette de cuisine.

export const s = {
  root: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' },

  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' },
  sub: { fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 2 },

  addBtn: { padding: '10px 18px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--r)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  ghostBtn: { padding: '10px 16px', background: 'var(--btn-fond)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', color: 'var(--btn-texte)', fontWeight: 'var(--g2)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  dangerBtn: { padding: '9px 14px', background: 'var(--danger-bg-soft)', border: '1px solid transparent', color: 'var(--danger-strong)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)' },

  // Liste des listes
  cardsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  listeCard: { background: 'var(--zone)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', borderRadius: 'var(--r)', color: 'var(--text)', padding: '16px 18px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', fontFamily: 'var(--font)' },
  listeNom: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)', fontFamily: 'var(--font)' },
  listeDate: { fontSize: 'var(--t1)', color: 'var(--lien)', fontWeight: 'var(--g2)' },
  listeMeta: { fontSize: 'var(--t1)', color: 'var(--text2)' },

  // Barre d'avancement
  progressTrack: { height: 8, background: 'var(--bg)', borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--border)' },
  progressFill: { height: '100%', background: 'var(--accent)', borderRadius: 'var(--r)', transition: 'width .35s' },
  progressLabel: { fontSize: 'var(--t1)', color: 'var(--text2)', fontWeight: 'var(--g2)', marginTop: 4 },

  empty: { padding: '28px 18px', textAlign: 'center', color: 'var(--text2)', fontSize: 'var(--t2)', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 'var(--r)' },

  // Sections detail
  section: { background: 'var(--zone)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', borderRadius: 'var(--r)', overflow: 'hidden' },
  sectionHead: { padding: '14px 16px', borderBottom: '1px solid var(--rule-soft)', display: 'flex', flexDirection: 'column', gap: 8 },
  sectionTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', fontFamily: 'var(--font)' },
  sectionHint: { fontSize: 'var(--t1)', color: 'var(--text2)', fontStyle: 'italic', lineHeight: 1.5 },
  sectionUrgent: { borderLeftWidth: 2, borderLeftStyle: 'solid', borderLeftColor: 'var(--danger-strong)' },
  sectionGrosse: { borderLeftWidth: 2, borderLeftStyle: 'solid', borderLeftColor: 'var(--onglet)' },

  // Item (case a cocher + label + qty)
  itemRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--rule-soft)', minHeight: 56 },
  checkbox: { width: 26, height: 26, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--accent)' },
  itemBody: { flex: 1, minWidth: 0 },
  itemLabel: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  itemLabelDone: { textDecoration: 'line-through', color: 'var(--text2)', fontWeight: 'var(--g2)' },
  itemMeta: { fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  qtyTag: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '3px 9px', whiteSpace: 'nowrap' },
  aQualifier: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--warning-text)', background: 'var(--warning-bg)', borderRadius: 'var(--r)', padding: '2px 8px' },
  itemDel: { background: 'none', border: 'none', color: 'var(--danger-strong)', fontSize: 'var(--t3)', cursor: 'pointer', flexShrink: 0, lineHeight: 1, padding: 4 },

  // Editeur
  editorCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  fieldLabel: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)' },
  input: { padding: '11px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', outline: 'none', width: '100%', boxSizing: 'border-box', minWidth: 0 },
  // Plancher a 200px : le champ date rendu par iOS occupe ~192px et ne
  // retrecit pas, il debordait de la carte a 150px.
  formRow2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },

  pickList: { display: 'flex', flexDirection: 'column', border: '1px solid var(--rule-soft)', borderRadius: 'var(--r)', overflow: 'hidden', maxHeight: 320, overflowY: 'auto' },
  pickRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderBottom: '1px solid var(--rule-soft)', cursor: 'pointer', minHeight: 48 },
  pickRowSel: { background: 'var(--selection)' },
  pickName: { flex: 1, minWidth: 0, fontSize: 'var(--t2)', color: 'var(--text)', fontWeight: 'var(--g2)' },

  chipCong: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', borderRadius: 'var(--r)', padding: '2px 8px', whiteSpace: 'nowrap' },
  chipGrosse: { background: 'var(--success-bg)', color: 'var(--success-text)' },
  chipUrgent: { background: 'var(--warning-bg)', color: 'var(--warning-text)' },

  selItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--bg)', flexWrap: 'wrap' },
  selName: { flex: 1, minWidth: 120, fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  qtyInput: { width: 74, padding: '8px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', outline: 'none' },
  uniteInput: { width: 78, padding: '8px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', outline: 'none' },

  toggleGroup: { display: 'flex', gap: 6 },
  toggleBtn: { padding: '8px 12px', background: 'var(--btn-fond)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', color: 'var(--btn-texte)', borderRadius: 'var(--r)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  toggleActive: { background: 'var(--selection)', borderColor: 'var(--onglet)', color: 'var(--text)' },

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
