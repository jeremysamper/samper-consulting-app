// Styles KDS - passe cuisine. Couleurs via tokens app.css (dark-mode automatique).
//
// Écran de poste : il se lit debout, à deux mètres, les mains prises. Les
// tailles suivent la largeur de l'écran (clamp) : lisibles sur un iPad, plus
// grandes sur un écran mural. Aucune bordure en raccourci `border` quand une
// couleur change selon l'état (lint:borders) : largeur, style et couleur à part.

const T = {
  table: 'clamp(24px, 2.2vw, 32px)',
  chrono: 'clamp(22px, 2vw, 30px)',
  qte: 'clamp(22px, 1.9vw, 28px)',
  nom: 'clamp(19px, 1.6vw, 24px)',
  nomTenu: 'clamp(17px, 1.4vw, 20px)',
  mods: 'clamp(15px, 1.25vw, 18px)',
  bouton: 'clamp(19px, 1.6vw, 24px)',
};

// Âge du bon dans la file : calme, alerte (7 min), retard (12 min).
const NIVEAUX = {
  calme: { bord: 'var(--border2)', fond: 'var(--surface2)', chrono: 'var(--text2)' },
  alerte: { bord: 'var(--warning-strong)', fond: 'var(--warning-bg-soft)', chrono: 'var(--warning-text)' },
  retard: { bord: 'var(--danger-strong)', fond: 'var(--danger-bg-soft)', chrono: 'var(--danger-text)' },
};

const boutonNu = { border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit', color: 'inherit' };

export const s = {
  // Dans la coque : toute la largeur du module, plus de colonne centrée.
  root: { display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px 32px', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' },
  // Plein écran : calque au-dessus de la coque (sous les fenêtres et les
  // toasts), marges de sécurité des appareils à encoche.
  plein: {
    position: 'fixed', inset: 0, zIndex: 1300, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)',
    display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box',
    overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain',
    padding: 'calc(env(safe-area-inset-top, 0px) + 10px) calc(env(safe-area-inset-right, 0px) + 12px) calc(env(safe-area-inset-bottom, 0px) + 20px) calc(env(safe-area-inset-left, 0px) + 12px)',
  },

  // flexShrink 0 partout : en plein écran le calque est une colonne à hauteur
  // fixe, et un rail qui rétrécit couperait le bas des bons.
  header: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0, flexShrink: 0 },
  title: { fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--text)', margin: '0 6px 0 0', lineHeight: 1.1 },
  // Les deux compteurs sont aussi les deux raccourcis du rail : un toucher
  // pour revenir au début, un toucher pour aller aux bons en attente.
  puce: (forte) => ({
    display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 16px',
    borderWidth: 1, borderStyle: 'solid', borderColor: forte ? 'var(--accent-bd)' : 'var(--border2)',
    borderRadius: 999, background: forte ? 'var(--accent-light)' : 'var(--surface)',
    color: forte ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', font: 'inherit', fontSize: 17, fontWeight: 600,
  }),
  puceNum: { fontFamily: 'var(--font-num)', fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  headerDroite: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  horloge: { fontFamily: 'var(--font-num)', fontSize: 24, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  pleinBtn: {
    minHeight: 48, padding: '0 16px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border2)', borderRadius: 'var(--r)',
    background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', font: 'inherit', fontSize: 16, fontWeight: 600,
  },

  banner: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 'var(--r)', background: 'var(--warning-bg-soft)', border: '1px solid var(--warning-bd)', color: 'var(--warning-text)', fontSize: 16, flexShrink: 0 },
  bannerBtn: { marginLeft: 'auto', minHeight: 44, padding: '0 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--warning-bd)', background: 'transparent', color: 'var(--warning-text)', cursor: 'pointer', fontSize: 15, fontWeight: 600 },

  // Le rail : les bons côte à côte, du plus ancien à faire jusqu'aux bons en
  // attente tout au bout. Il défile seul en largeur, jamais la page.
  rail: {
    position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0, maxWidth: '100%', flexShrink: 0,
    overflowX: 'auto', overscrollBehaviorX: 'contain', scrollSnapType: 'x proximity', WebkitOverflowScrolling: 'touch',
    paddingBottom: 12,
  },
  rienAFaire: { flex: '0 0 auto', alignSelf: 'stretch', display: 'flex', alignItems: 'center', padding: '0 18px', minHeight: 120, color: 'var(--text3)', fontSize: 19, borderRadius: 'var(--r)', border: '1px dashed var(--border2)' },
  separateur: { flex: '0 0 auto', alignSelf: 'stretch', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', width: 30, minHeight: 120, borderLeft: '2px dashed var(--border2)' },
  separateurTexte: { writingMode: 'vertical-rl', fontSize: 15, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.04em', paddingTop: 6, paddingLeft: 6, whiteSpace: 'nowrap' },
  empty: { textAlign: 'center', color: 'var(--text3)', padding: '64px 0', fontSize: 22, flexShrink: 0 },
  emptySub: { fontSize: 15, marginTop: 8 },

  // ── Un bon ──
  table: { fontWeight: 700, fontSize: T.table, color: 'var(--text)', lineHeight: 1.1, minWidth: 0, overflowWrap: 'anywhere' },
  couv: { fontSize: 15, color: 'var(--text2)', whiteSpace: 'nowrap' },
  reclame: { padding: '4px 10px', borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' },
  enteteDroite: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' },
  etatBon: { fontSize: 15, fontWeight: 700, color: 'var(--text2)' },
  etatValide: { fontSize: 17, fontWeight: 700, color: 'var(--success-text)' },

  sectionTete: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 10px', minHeight: 36, padding: '0 2px' },
  sectionNom: (etat) => ({ fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap', color: etat === 'faire' ? 'var(--text)' : (etat === 'attente' ? 'var(--info-text)' : 'var(--text3)') }),
  sectionEtat: (etat) => ({ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', color: etat === 'faire' ? 'var(--accent)' : (etat === 'attente' ? 'var(--info-text)' : 'var(--success-text)') }),
  lancerBtn: { marginLeft: 'auto', minHeight: 44, padding: '0 16px', whiteSpace: 'nowrap', borderRadius: 'var(--r-sm)', border: '1px solid var(--info-bd)', background: 'var(--surface)', color: 'var(--info-text)', cursor: 'pointer', font: 'inherit', fontSize: 15, fontWeight: 700 },

  mainBtn: { ...boutonNu, display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, textAlign: 'left', padding: '8px 12px' },
  texte: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 },
  ligneNom: { display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 },
  mods: { fontSize: T.mods, fontWeight: 600, color: 'var(--warning-text)', lineHeight: 1.25, overflowWrap: 'anywhere' },
  tenirBtn: { ...boutonNu, flex: '0 0 auto', minHeight: 60, padding: '0 12px', borderLeft: '1px solid var(--border)', color: 'var(--info-text)', fontSize: 15, fontWeight: 600 },

  tenuRow: { display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '6px 12px', borderRadius: 'var(--r-sm)', background: 'var(--surface)' },
  relanceBtn: { flex: '0 0 auto', minHeight: 44, padding: '0 12px', whiteSpace: 'nowrap', borderRadius: 'var(--r-sm)', border: '1px solid var(--success-bd)', background: 'transparent', color: 'var(--success-text)', cursor: 'pointer', font: 'inherit', fontSize: 15, fontWeight: 600 },

  voidRow: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '6px 12px', borderRadius: 'var(--r-sm)', background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)' },
  voidText: { flex: 1, minWidth: 0, textDecoration: 'line-through', color: 'var(--danger-text)', fontSize: 17 },
  voidTag: { fontSize: 14, color: 'var(--danger-text)', fontWeight: 700 },

  pied: { padding: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 },
  validerBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', width: '100%', minHeight: 64, padding: '8px 14px',
    border: 'none', borderRadius: 'var(--r)', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer',
    font: 'inherit', fontSize: T.bouton, fontWeight: 700,
  },
  valideInfo: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 64, borderRadius: 'var(--r)', background: 'var(--success-bg-soft)', color: 'var(--success-text)', fontSize: T.bouton, fontWeight: 700 },
  piedTexte: { fontSize: 16, fontWeight: 600, color: 'var(--text2)', textAlign: 'center' },
  terminerBtn: { width: '100%', minHeight: 56, borderRadius: 'var(--r)', border: '1px solid var(--accent-bd)', background: 'var(--accent-light)', color: 'var(--accent)', cursor: 'pointer', font: 'inherit', fontSize: 18, fontWeight: 700 },
  terminerDiscret: { ...boutonNu, alignSelf: 'center', minHeight: 44, padding: '0 14px', color: 'var(--text2)', fontSize: 15, fontWeight: 600, textDecoration: 'underline' },

  // ── Terminées ──
  doneWrap: { marginTop: 10, flexShrink: 0 },
  doneHead: { display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 17, fontWeight: 700, color: 'var(--text2)', marginBottom: 10 },
  doneHeadSub: { fontWeight: 400, color: 'var(--text3)', fontSize: 14 },
  doneGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 },
  doneCard: { border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface2)', padding: '10px 12px', minWidth: 0 },
  doneCardHead: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 },
  doneTable: { fontWeight: 700, fontSize: 18, color: 'var(--text2)', minWidth: 0, overflowWrap: 'anywhere' },
  doneQuand: { marginLeft: 'auto', fontSize: 13, color: 'var(--text3)', whiteSpace: 'nowrap' },
  doneLine: { fontSize: 15, color: 'var(--text2)', lineHeight: 1.35 },
  reopenBtn: { marginTop: 8, minHeight: 44, padding: '0 14px', font: 'inherit', fontSize: 15, fontWeight: 600, color: 'var(--text2)', border: '1px solid var(--border2)', background: 'transparent', borderRadius: 'var(--r-sm)', cursor: 'pointer' },

  // ── Onboarding « connecter Lightspeed » ──
  onboard: { maxWidth: 560, margin: '24px auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh-sm)', padding: '22px 24px' },
  onboardTitle: { fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--text)', margin: '0 0 4px' },
  onboardSub: { fontSize: 13, color: 'var(--text2)', margin: '0 0 16px' },
  onboardSteps: { display: 'flex', flexDirection: 'column', gap: 12, margin: '0 0 18px' },
  onboardStep: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  onboardNum: { flex: '0 0 auto', width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-light)', border: '1px solid var(--accent-bd)', color: 'var(--accent)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  onboardText: { fontSize: 14, color: 'var(--text)', lineHeight: 1.45 },
  onboardHint: { fontSize: 12, color: 'var(--text3)', marginTop: 2 },
  onboardCta: { width: '100%', padding: '12px 16px', borderRadius: 'var(--r)', border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: 14, cursor: 'pointer', minHeight: 48 },
  onboardNote: { fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 10 },

  // ── Indicateur de synchro (header) ──
  syncWrap: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' },
  syncDot: (ok) => ({ width: 10, height: 10, borderRadius: '50%', background: ok ? 'var(--success-strong)' : 'var(--danger-strong)' }),
};

// Un bon du rail. Dans la file : trait plein, à la couleur de son âge. À la
// fin (en attente, tout parti) : trait en pointillé, sans ombre.
export function bonStyle(niveau, enFile) {
  return {
    flex: '0 0 clamp(290px, 29.5vw, 430px)', maxWidth: '88vw', minWidth: 0, boxSizing: 'border-box',
    scrollSnapAlign: 'start', display: 'flex', flexDirection: 'column',
    borderWidth: 2, borderStyle: enFile ? 'solid' : 'dashed',
    borderColor: enFile ? NIVEAUX[niveau].bord : 'var(--border2)',
    borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--surface)',
    boxShadow: enFile ? 'var(--sh-sm)' : 'none',
  };
}

export function enteteStyle(niveau) {
  return { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: NIVEAUX[niveau].fond };
}

export function chronoStyle(niveau) {
  return { fontFamily: 'var(--font-num)', fontSize: T.chrono, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: NIVEAUX[niveau].chrono };
}

// Une suite du bon. En attente : fond et filet d'information, en pointillé.
export function sectionStyle(etat) {
  const attente = etat === 'attente';
  return {
    display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px 10px',
    borderTopWidth: 1, borderTopStyle: attente ? 'dashed' : 'solid',
    borderTopColor: attente ? 'var(--info-bd)' : 'var(--border)',
    background: attente ? 'var(--info-bg-soft)' : 'transparent',
  };
}

// Une ligne « à faire » ou « fait ». grand : la suite en cours (60 px, se
// touche sans viser) ; sinon la ligne d'une suite déjà partie, plus basse.
export function platStyle(fait, grand) {
  return {
    display: 'flex', alignItems: 'stretch', minHeight: grand ? 60 : 44,
    borderWidth: 1, borderStyle: 'solid', borderColor: fait ? 'var(--success-bd)' : 'var(--border)',
    borderRadius: 'var(--r-sm)', background: fait ? 'var(--success-bg-soft)' : 'var(--surface)',
  };
}

export function marqueStyle(fait, grand) {
  const cote = grand ? 30 : 22;
  return {
    flex: `0 0 ${cote}px`, width: cote, height: cote, boxSizing: 'border-box', borderRadius: '50%',
    borderWidth: 2, borderStyle: 'solid', borderColor: fait ? 'var(--success-strong)' : 'var(--text3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: grand ? 18 : 13, fontWeight: 700, lineHeight: 1, color: 'var(--success-strong)',
  };
}

// genre : 'faire' (grand, plein contraste), 'fait' (barré, estompé),
// 'tenu' (annoncé, pas encore parti), 'parti' (suite déjà faite, plus petit).
export function qteStyle(genre) {
  const petit = genre === 'parti';
  return {
    flex: '0 0 auto', fontFamily: 'var(--font-num)', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
    fontSize: petit ? 17 : (genre === 'tenu' ? T.nomTenu : T.qte),
    color: genre === 'faire' ? 'var(--text)' : (genre === 'tenu' ? 'var(--text2)' : 'var(--text3)'),
  };
}

export function nomStyle(genre) {
  const petit = genre === 'parti';
  const efface = genre === 'fait' || petit;
  return {
    minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.2, fontWeight: 600,
    fontSize: petit ? 17 : (genre === 'tenu' ? T.nomTenu : T.nom),
    color: genre === 'faire' ? 'var(--text)' : (genre === 'tenu' ? 'var(--text2)' : 'var(--text3)'),
    textDecoration: efface ? 'line-through' : 'none',
  };
}
