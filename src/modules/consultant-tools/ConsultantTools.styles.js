import { getBrowserWindow } from '../../legacy/legacyApi.js';
import { encadreStyle } from '../../components/ui/index.jsx';

export const cts = {
  tabsBar: { display: 'flex', gap: 4, padding: '0 4px', marginBottom: 12, borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' },
  tabBtn: { padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 'var(--t2)', color: 'var(--text2)', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' },
  tabBtnActive: { color: 'var(--text)', borderBottomColor: 'var(--onglet)', fontWeight: 'var(--g2)' },
  tabsDivider: { width: 1, height: 22, background: 'var(--border)', margin: '0 8px' },
  fallback: { padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 'var(--t2)' },
  root: { display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, height: 'calc(100vh - 160px)', minHeight: 600 },
  leftCol: { display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', paddingRight: 16, overflow: 'hidden', minWidth: 0 },
  leftHeader: { padding: '0 0 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 },
  newBtn: { padding: '9px 14px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--r)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  search: { padding: '8px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', outline: 'none' },
  leftList: { flex: 1, overflowY: 'auto' },
  recetteItem: { padding: '11px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .12s' },
  recetteItemActive: { background: 'var(--selection)', borderLeft: '3px solid var(--onglet)' },
  // ─── Hiérarchie cartes > plats ───
  carteHeader: { display: 'flex', alignItems: 'center', gap: 4, padding: '9px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer' },
  carteFolderName: { flex: 1, minWidth: 0, fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  carteCount: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text3)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)', padding: '1px 8px', flexShrink: 0 },
  platHeader: { display: 'flex', alignItems: 'center', gap: 4, padding: '8px 8px 8px 6px', borderBottom: '1px solid var(--border)' },
  platToggle: { width: 22, height: 22, padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--t1)', color: 'var(--text2)', flexShrink: 0 },
  platName: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', fontFamily: 'var(--font)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  platMeta: { fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 2 },
  platEditBtn: { width: 24, height: 24, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--t1)', color: 'var(--text2)', borderRadius: 'var(--r)', flexShrink: 0 },
  orphelinHeader: { padding: '14px 14px 6px', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text2)', borderBottom: '1px solid var(--border)' },
  recItemName: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', marginBottom: 3 },
  recItemMeta: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  // Recette cachée dans Cartes & Recettes (colonne recettes.masquee).
  tagCachee: { display: 'inline-block', marginRight: 6, padding: '0 6px', borderRadius: 'var(--r-full)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', background: 'var(--warning-bg)', color: 'var(--warning-text)' },
  // Encadré de statut (filet gauche au ton, voir Encadre).
  bandeauCachee: { margin: '0 0 10px', fontSize: 'var(--t1)', lineHeight: 1.4, ...encadreStyle('alerte') },
  rightCol: { display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingRight: 4 },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)' },
  actionBar: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  ghostBtn: { padding: '7px 14px', background: 'var(--btn-fond)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', color: 'var(--btn-texte)', fontWeight: 'var(--g2)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  printZone: { display: 'flex', flexDirection: 'column', gap: 16, background: 'transparent' },
  header: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)', padding: '18px 22px' },
  titleInput: { width: '100%', fontSize: 'var(--t4)', fontWeight: 'var(--g3)', color: 'var(--text)', fontFamily: 'var(--font)', border: 'none', background: 'transparent', outline: 'none', padding: 0 },
  inlineField: { display: 'flex', flexDirection: 'column', gap: 3 },
  inlineInput: { padding: '5px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t1)', background: 'var(--surface)', fontFamily: 'var(--font)', color: 'var(--text)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px 32px' },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)', overflow: 'hidden' },
  cardTitle: { padding: '4px 0 10px', fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)', fontFamily: 'var(--font)' },
  paramGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px 16px', padding: '4px 0 14px' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)' },
  input: { padding: '8px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box', width: '100%' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '14px 24px', padding: '4px 0 14px' },
  kpiItem: { display: 'flex', flexDirection: 'column', gap: 4, whiteSpace: 'nowrap', fontSize: 'var(--t3)', fontFamily: 'var(--font-num)' },
  kpiLabel: { fontSize: 'var(--t1)', color: 'var(--text2)', fontWeight: 'var(--g2)', whiteSpace: 'normal', fontFamily: 'var(--font)' },
  smallBtn: { padding: '5px 12px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--r)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  ingHead: { display: 'grid', gridTemplateColumns: '2fr 80px 90px 110px 90px 32px', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)' },
  ingRow: { display: 'grid', gridTemplateColumns: '2fr 80px 90px 110px 90px 32px', gap: 8, padding: '6px 0', alignItems: 'center' },
  ingInput: { padding: '6px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t1)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', outline: 'none', width: '100%', boxSizing: 'border-box' },
  // ─── Barre de recalcul des quantités (carte Ingrédients) ──────────────────
  // Posée sous l'en-tête de la carte, jamais par-dessus la fiche : c'est ce qui
  // remplace l'ancienne modale « Calculateur ». Bordure en longhand, l'état
  // actif ne surchargeant que sa couleur (cf. npm run lint:borders).
  echelleBar: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '9px 16px', background: 'var(--bg)', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)' },
  echelleBarActive: { background: 'var(--warning-bg)', borderBottomColor: 'var(--warning-bd)' },
  echelleLabel: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)' },
  echelleTexte: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  // Pas de filet séparateur : la barre passe à la ligne sous 1000px et le trait
  // se retrouvait collé au bord gauche, à séparer de rien.
  echelleSep: { fontSize: 'var(--t1)', color: 'var(--text2)', marginLeft: 6, fontStyle: 'italic' },
  echelleInput: { width: 72, padding: '5px 8px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', textAlign: 'center', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', outline: 'none', flexShrink: 0 },
  echelleSelect: { maxWidth: 220, padding: '5px 8px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t1)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', cursor: 'pointer' },
  echelleFacteur: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--warning-text)' },
  echelleReset: { marginLeft: 'auto', padding: '5px 12px', background: 'none', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--warning-bd)', borderRadius: 'var(--r)', color: 'var(--warning-text)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 },
  // Aperçu recalculé sous la quantité enregistrée : jamais écrit en base.
  ingQteRecalc: { marginTop: 3, fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--warning-text)', textAlign: 'right' },
  suggestions: { position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: '0 0 8px 8px', zIndex: 50, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', maxHeight: 200, overflowY: 'auto' },
  suggItem: { padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  // Version compacte (autocomplétion discrète)
  suggestionsCompact: { position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', zIndex: 50, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', maxHeight: 180, overflowY: 'auto', marginTop: 2 },
  suggItemCompact: { padding: '5px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', fontSize: 'var(--t1)', color: 'var(--text)' },
  deleteLineBtn: { width: 28, height: 28, border: '1px solid transparent', background: 'var(--danger-bg-soft)', color: 'var(--danger-strong)', borderRadius: 'var(--r)', cursor: 'pointer', fontSize: 'var(--t2)', padding: 0 },
  etapeRow: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  etapeNum: { width: 28, height: 28, borderRadius: '50%', background: 'var(--selection)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', flexShrink: 0, marginTop: 2 },
  etapeInput: { flex: 1, padding: '8px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', outline: 'none', resize: 'vertical', lineHeight: 1.5 },
  moveBtn: { width: 22, height: 22, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', borderRadius: 'var(--r)', cursor: 'pointer', fontSize: 'var(--t1)', padding: 0 },
  textarea: { width: '100%', padding: '8px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--surface)', borderRadius: 'var(--r)', width: 420, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  // ─── Menu « ⋯ » des actions ponctuelles de la colonne gauche ───
  // Le panneau sort de la colonne (280px) : largeur propre et ancrage à droite
  // pour ne pas déborder du cadre.
  menuDot: { position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: 'var(--warning-strong)' },
  menuBackdrop: { position: 'fixed', inset: 0, zIndex: 40 },
  menuPanel: { position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 41, minWidth: 232, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 4, display: 'flex', flexDirection: 'column', gap: 2 },
  menuItem: { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderRadius: 'var(--r)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)', color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap' },
};

if (getBrowserWindow()?.innerWidth < 900) {
  cts.root = { ...cts.root, gridTemplateColumns: '1fr', height: 'auto' };
  cts.leftCol = { ...cts.leftCol, borderRight: 'none', paddingRight: 0, borderBottom: '1px solid var(--border)', paddingBottom: 12 };
  cts.grid = { ...cts.grid, gridTemplateColumns: '1fr' };
}
