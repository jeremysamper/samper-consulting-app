import { st } from '../../../components/ui/Fenetres.jsx';

// Pièces communes des écrans de devis et de factures (direction Galet, jetons
// d'app.css). Un statut se dit par ses jetons de fond et d'encre, avec son
// texte : la couleur seule ne porte rien.

const TONS = {
  neutre: { fond: 'var(--piste)', texte: 'var(--text2)' },
  info: { fond: 'var(--info-bg)', texte: 'var(--info-text)' },
  succes: { fond: 'var(--success-bg)', texte: 'var(--success-text)' },
  alerte: { fond: 'var(--warning-bg)', texte: 'var(--warning-text)' },
  danger: { fond: 'var(--danger-bg)', texte: 'var(--danger-text)' },
};

export const TON_DEVIS = { brouillon: 'neutre', envoye: 'info', accepte: 'succes', refuse: 'neutre', expire: 'alerte' };
export const TON_FACTURE = { prevue: 'neutre', a_payer: 'info', partiel: 'alerte', payee: 'succes', en_retard: 'danger', annulee: 'neutre' };

export function Pastille({ ton = 'neutre', children }) {
  const t = TONS[ton] || TONS.neutre;
  return (
    <span style={{ ...sf.pastille, background: t.fond, color: t.texte }}>{children}</span>
  );
}

export function Champ({ label, children, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, ...style }}>
      <span style={st.label}>{label}</span>
      {children}
    </label>
  );
}

export const sf = {
  pastille: {
    display: 'inline-flex', alignItems: 'center', flexShrink: 0, whiteSpace: 'nowrap',
    padding: '3px 10px', borderRadius: 'var(--r-full)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)',
  },
  champ: st.champ,
  // Champ d'un document figé (devis accepté) : sur la piste, sans contour,
  // pour qu'il ne se lise pas comme modifiable.
  champFige: { ...st.champ, background: 'var(--piste)', borderColor: 'transparent', color: 'var(--text)' },
  zone: { ...st.champ, minHeight: 72, resize: 'vertical', lineHeight: 1.45 },
  petit: { ...st.champ, minHeight: 40, padding: '8px 10px' },
  nombre: { ...st.champ, minHeight: 40, padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' },
  chiffre: { fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  titreBloc: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  remarque: st.remarque,
  ligneTotal: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
    fontSize: 'var(--t2)', color: 'var(--text2)',
  },
  total: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
    fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)',
  },
  pilule: (actif) => ({
    minHeight: 36, padding: '6px 14px', borderRadius: 'var(--r-full)', cursor: 'pointer',
    borderWidth: 1, borderStyle: 'solid', borderColor: actif ? 'var(--accent)' : 'var(--btn-bord)',
    background: actif ? 'var(--accent)' : 'var(--btn-fond)', color: actif ? 'var(--on-accent)' : 'var(--btn-texte)',
    fontSize: 'var(--t1)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)',
  }),
  encart: (ton) => ({
    padding: '10px 12px', borderRadius: 'var(--r)', fontSize: 'var(--t1)', lineHeight: 1.5,
    background: (TONS[ton] || TONS.info).fond, color: (TONS[ton] || TONS.info).texte,
  }),
  boutonLigne: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', minWidth: 0, textAlign: 'left',
    padding: '10px 0', background: 'transparent', borderWidth: 0, borderRadius: 0, cursor: 'pointer',
    fontFamily: 'var(--font)', color: 'var(--text)',
  },
  suppr: {
    width: 40, height: 40, borderRadius: '50%', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',
    background: 'var(--btn-fond)', color: 'var(--text2)', cursor: 'pointer', fontSize: 'var(--t3)', lineHeight: 1,
    fontFamily: 'var(--font)',
  },
};
