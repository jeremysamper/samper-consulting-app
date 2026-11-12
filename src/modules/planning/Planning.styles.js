import { BRAND, WEB_TYPE } from '../../design/brandTokens.js';

// ─── Relevé CCNT : styles du document imprimable ────────────────────────────
// Document remis au collaborateur et opposable en cas de contrôle : il suit la
// même DA que les autres exports (tokens de marque, trois niveaux, aucun gras),
// et rien n'y est écrit en dur.
// ccntCell vit hors de `pls` parce qu'il s'applique à une table HTML native.
const ccntCell = {
  border: `0.5pt solid ${BRAND.color.ruleLight}`,
  padding: '3px 5px',
  fontSize: 9,
  verticalAlign: 'middle',
  ...WEB_TYPE.data,
};

const ccnt = {
  page: { position: 'absolute', left: -99999, top: 0, width: '180mm', background: BRAND.color.white, color: BRAND.color.ink, fontSize: 10, ...WEB_TYPE.data },
  bloc: { border: `0.5pt solid ${BRAND.color.rule}`, borderLeft: `2.2pt solid ${BRAND.color.accent}`, padding: 10, marginBottom: 10 },
  titreDoc: { fontSize: 16, marginBottom: 6, textAlign: 'center', color: BRAND.color.primary, ...WEB_TYPE.voice },
  sousTitreDoc: { fontSize: 10, textAlign: 'center', marginBottom: 10, color: BRAND.color.stone, ...WEB_TYPE.voiceItalic },
  identiteGrille: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10 },
  etiquette: { fontSize: 8, color: BRAND.color.stone, ...WEB_TYPE.label },
  titreBloc: { fontSize: 8, marginBottom: 6, color: BRAND.color.primary, ...WEB_TYPE.label },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 9, marginBottom: 10, border: `0.5pt solid ${BRAND.color.rule}` },
  tableInterne: { width: '100%', borderCollapse: 'collapse' },
  th: { border: `0.5pt solid ${BRAND.color.primary}`, padding: '4px 5px', fontSize: 7, background: BRAND.color.primary, color: BRAND.color.white, verticalAlign: 'middle', ...WEB_TYPE.label },
  ligneZebre: { background: BRAND.color.zebra },
  ligneNormale: { background: BRAND.color.white },
  ligneTotal: { background: BRAND.color.tint, borderTop: `1pt solid ${BRAND.color.primary}` },
  // Les heures sont des montants : elles se lisent en Lora.
  valeur: { textAlign: 'right', ...WEB_TYPE.voice },
  depassement: { textAlign: 'right', color: BRAND.color.primary, ...WEB_TYPE.voice },
  signatureLigne: { borderBottom: `0.5pt solid ${BRAND.color.rule}`, height: 40 },
  mentionLegale: { fontSize: 8, color: BRAND.color.stone, marginTop: 8, textAlign: 'center', ...WEB_TYPE.data },
};

const pls = {
  root: { display: 'flex', flexDirection: 'column', gap: 14 },
  tabs: { display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' },
  tab: { padding: '8px 16px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', borderRadius: 'var(--r)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  actionsBar: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  addBtn: { padding: '9px 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--r)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', cursor: 'pointer', fontFamily: 'var(--font)' },
  exportBtn: { padding: '8px 14px', background: 'var(--btn-fond)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', color: 'var(--btn-texte)', fontWeight: 'var(--g2)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  ghostBtn: { padding: '8px 14px', background: 'var(--btn-fond)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', color: 'var(--btn-texte)', fontWeight: 'var(--g2)', borderRadius: 'var(--r)', fontSize: 'var(--t1)', cursor: 'pointer', fontFamily: 'var(--font)' },
  pointBtn: { padding: '10px 16px', background: 'var(--success-fill)', color: 'var(--on-success)', border: 'none', borderRadius: 'var(--r)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', cursor: 'pointer', fontFamily: 'var(--font)', flex: 1 },
  datePicker: { padding: '8px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', background: 'var(--surface)', fontFamily: 'var(--font)', fontSize: 'var(--t2)' },
  smallBtn: { padding: '7px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontWeight: 'var(--g2)', borderRadius: 'var(--r)', fontSize: 'var(--t1)', cursor: 'pointer' },
  smallBtnActive: { background: 'var(--selection)', color: 'var(--text)', borderColor: 'var(--onglet)' },
  // Grille de la semaine et pointages du jour : un Panneau (O11), retrait d'avant.
  panneau: { padding: 16 },
  grid: { display: 'grid', gap: 0 },
  empColHeader: { height: 48, borderBottom: '1px solid var(--rule-soft)', background: 'var(--bg)' },
  dayHeader: { height: 48, borderBottom: '1px solid var(--rule-soft)', borderLeft: '1px solid var(--rule-soft)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 },
  empCol: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--rule-soft)', background: 'var(--bg)', position: 'sticky', left: 0, zIndex: 1 },
  empAvatar: { width: 30, height: 30, borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontWeight: 'var(--g3)', fontSize: 'var(--t1)', flexShrink: 0 },
  empName: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)' },
  // Téléphone (consultant / patron), sous le nom (PhoneLink).
  phoneLink: { display: 'inline-block', marginTop: 2, fontSize: 'var(--t1)' },
  // Mobile : cible de tap confortable sans agrandir la carte.
  mobilePhone: { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', minHeight: 32, fontSize: 'var(--t2)' },
  dayCell: { minHeight: 72, padding: 6, borderLeft: '1px solid var(--rule-soft)', borderBottom: '1px solid var(--rule-soft)' },
  // Fond neutre : le type (midi, soir, longue) se lit au filet gauche (ShiftCell).
  shiftCell: { borderRadius: 'var(--r)', padding: '8px 6px', position: 'relative' },
  // Glisser-déposer (useGlisserHoraires) : un horaire attrapable ne sélectionne
  // pas de texte et n'ouvre pas le menu d'appui long ; l'horaire traîné pâlit,
  // celui de l'appui long se soulève. Case visée : filet intérieur en ombre
  // (jamais en bordure), fond et filet selon la règle de dépôt.
  horaireAttrapable: { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' },
  horaireOrigine: { opacity: 0.35, outline: '2px dashed var(--onglet)', outlineOffset: -2 },
  horaireSouleve: { transform: 'scale(1.04)', zIndex: 2 },
  caseVisee: {
    ok: { background: 'var(--selection)', boxShadow: 'inset 0 0 0 2px var(--onglet)' },
    avertir: { background: 'var(--warning-bg)', boxShadow: 'inset 0 0 0 2px var(--warning-text)' },
    refus: { background: 'var(--danger-bg)', boxShadow: 'inset 0 0 0 2px var(--danger-strong)' },
  },
  enteteGrille: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 10 },
  // Ligne d'aide du glisser : lisible d'un coup d'œil (texte plein, filet accent à gauche), sans cadre.
  aideGrille: { flex: '1 1 260px', minWidth: 0, fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', textAlign: 'left', paddingLeft: 10, borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: 'var(--btn-bord)' },
  dateGrille: { flex: '1 1 260px', minWidth: 0, fontSize: 'var(--t1)', color: 'var(--text2)', textAlign: 'right' },
  emptyCell: { height: '100%', minHeight: 58, border: '1px dashed var(--border)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  addHint: { fontSize: 'var(--t3)', color: 'var(--text2)' },
  ptTable: { display: 'flex', flexDirection: 'column' },
  ptHead: { display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr 120px', padding: '8px 16px', background: 'var(--bg)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)', borderBottom: '1px solid var(--rule-soft)' },
  ptRow: { display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr 120px', padding: '12px 16px', borderBottom: '1px solid var(--rule-soft)', alignItems: 'center', cursor: 'pointer' },
  ptEmp: { display: 'flex', alignItems: 'center', gap: 10 },
  ptAvatar: { width: 30, height: 30, borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', fontWeight: 'var(--g3)', fontSize: 'var(--t1)' },
  ptName: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)' },
  ptCell: { fontSize: 'var(--t2)' },
  statusBadge: { display: 'inline-block', padding: '3px 9px', borderRadius: 'var(--r)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)' },

  // Mobile
  mobilePlanList: { display: 'flex', flexDirection: 'column', gap: 10 },
  mobileTitle: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', fontFamily: 'var(--font)', padding: '4px 0' },
  mobileDayBlock: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)', overflow: 'hidden' },
  mobileDayHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--rule-soft)' },
  mobileDayAdd: { width: 26, height: 26, borderRadius: 'var(--r)', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', fontSize: 'var(--t2)', cursor: 'pointer', fontFamily: 'var(--font)' },
  mobileShiftCard: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--rule-soft)', cursor: 'pointer' },
  mobileBadge: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', padding: '3px 8px', borderRadius: 'var(--r)', whiteSpace: 'nowrap' },

  // Mobile - vue agenda par jour (refonte lisibilité)
  mobilePlanWrap: { display: 'flex', flexDirection: 'column' },
  mobileDayNav: { position: 'sticky', top: 0, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 8, padding: '6px 0 10px', marginBottom: 6, background: 'var(--bg)', borderBottom: '1px solid var(--rule-soft)' },
  mobileDayNavRow: { display: 'flex', alignItems: 'center', gap: 8 },
  mobileNavArrow: { width: 44, height: 44, flexShrink: 0, borderRadius: 'var(--r)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontWeight: 'var(--g2)', fontSize: 'var(--t4)', lineHeight: 1, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  mobileDayNavCenter: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, textAlign: 'center', overflow: 'hidden' },
  mobileDayName: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', fontFamily: 'var(--font)', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  mobileTodayChip: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text)', background: 'var(--selection)', padding: '1px 8px', borderRadius: 'var(--r)' },
  mobileTodayBtn: { width: '100%', minHeight: 44, borderRadius: 'var(--r)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', cursor: 'pointer', fontFamily: 'var(--font)' },
  // Pointage en un geste depuis la liste desktop / iPad.
  ptAction: { display: 'flex', justifyContent: 'flex-end' },
  ptPointBtn: { minHeight: 44, minWidth: 100, padding: '0 14px', background: 'var(--success-fill)', color: 'var(--on-success)', border: 'none', borderRadius: 'var(--r)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', cursor: 'pointer', fontFamily: 'var(--font)' },
  // Groupes (Salle, Cuisine, groupes ajoutés) : filtre et titres de section.
  groupeFiltre: { marginBottom: 10, minWidth: 0, maxWidth: '100%' },
  // Bandeau du mode remplissage, collé sous la barre d'actions.
  remplissage: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 0', borderBottom: '2px solid var(--onglet)', fontSize: 'var(--t2)', color: 'var(--text)', position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg)' },
  groupeCompte: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text3)', marginLeft: 4 },
  groupeTitreGrille: { gridColumn: '1 / -1', padding: '10px 12px 6px', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', background: 'var(--bg)', borderBottom: '1px solid var(--rule-soft)' },
  groupeTitrePointage: { padding: '10px 16px 6px', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', background: 'var(--bg)', borderBottom: '1px solid var(--rule-soft)' },
  groupeTitreMobile: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', padding: '10px 2px 2px' },
  mobileCoverage: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)', padding: '2px 2px 4px' },
  mobileCard: { position: 'relative', display: 'flex', alignItems: 'stretch', background: 'var(--surface)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', cursor: 'pointer', minHeight: 44 },
  mobileCardSelected: { borderColor: 'var(--onglet)', background: 'var(--selection)' },
  mobileCardBand: { width: 5, flexShrink: 0 },
  mobileCardBody: { flex: 1, minWidth: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 },
  mobileCardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mobileHour: { fontSize: 'var(--t4)', fontWeight: 'var(--g3)', color: 'var(--text)', letterSpacing: 0.3, fontFamily: 'var(--font)' },
  mobileCheckbox: { width: 22, height: 22, flexShrink: 0 },
  mobileStatus: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', padding: '3px 9px', borderRadius: 'var(--r)', whiteSpace: 'nowrap', flexShrink: 0 },
  mobileName: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  mobileMeta: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  mobileChip: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', padding: '2px 9px', borderRadius: 'var(--r-full)', borderWidth: 1, borderStyle: 'solid', background: 'transparent', whiteSpace: 'nowrap' },
  mobilePause: { fontSize: 'var(--t1)', color: 'var(--text3)', fontWeight: 'var(--g1)' },
  mobileEmptyDay: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 16px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 'var(--r)' },
  mobileAddRow: { width: '100%', minHeight: 44, padding: '11px 14px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 'var(--r)', color: 'var(--lien)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', cursor: 'pointer', fontFamily: 'var(--font)' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 },
  modal: { background: 'var(--surface)', borderRadius: 'var(--r)', width: 480, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--sh-lg)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  modalTitle: { fontWeight: 'var(--g3)', fontSize: 'var(--t3)', fontFamily: 'var(--font)' },
  closeBtn: { background: 'none', border: 'none', fontSize: 'var(--t3)', cursor: 'pointer', color: 'var(--text2)' },
  fieldLabel: { display: 'block', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)', marginBottom: 6 },
  fieldInput: { width: '100%', padding: '9px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', boxSizing: 'border-box' },

  // Navigation temporelle du header (Refonte UI/UX)
  weekNav: { display: 'flex', alignItems: 'center', gap: 4 },
  navArrow: { width: 34, height: 34, borderRadius: 'var(--r)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', fontWeight: 'var(--g2)', fontSize: 'var(--t3)', lineHeight: 1, cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  weekLabel: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', minWidth: 130, textAlign: 'center' },

  // Menu overflow ⋯
  overflowBackdrop: { position: 'fixed', inset: 0, zIndex: 40 },
  overflowMenu: { position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50, minWidth: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-lg)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2 },
  overflowItem: { textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderRadius: 'var(--r)', fontSize: 'var(--t2)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 40 },

  // Barre d'action sticky pour la sélection multiple (Axe 2)
  selectionBar: { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1100, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--surface)', borderTop: '1px solid var(--border)', boxShadow: 'var(--sh-lg)', flexWrap: 'wrap' },
  selectionCount: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  selectionGhostBtn: { padding: '10px 14px', background: 'var(--btn-fond)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', color: 'var(--btn-texte)', borderRadius: 'var(--r)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  selectionDeleteBtn: { padding: '10px 16px', background: 'var(--danger-fill)', color: 'var(--on-danger)', border: 'none', borderRadius: 'var(--r)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
};

export { ccnt, ccntCell, pls };
