import React from 'react';
import { createPortal } from 'react-dom';
import { useBackLayer } from '../../hooks/useBackLayer.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fenêtres du Planning : centrées sur ordinateur, tiroir du bas sur téléphone
// (modal-sheet). Rendues dans <body> : sur téléphone la barre d'actions défile
// et couperait tout ce qui est posé dedans. Se ferment par ×, Échap, un tap à
// côté ou le geste retour.
// ─────────────────────────────────────────────────────────────────────────────

export function Fenetre({ id, titre, sousTitre, onClose, largeur = 460, children, pied = null }) {
  useBackLayer(true, onClose, id);
  React.useEffect(() => {
    const echap = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [onClose]);
  return createPortal(
    <div className="modal-sheet-overlay" style={st.voile} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-sheet" style={{ ...st.fenetre, width: `min(${largeur}px, 100%)` }} role="dialog" aria-modal="true" aria-label={titre}>
        <button type="button" onClick={onClose} aria-label="Fermer" style={st.fermer}>×</button>
        <div style={st.titre}>{titre}</div>
        {sousTitre && <div style={st.sousTitre}>{sousTitre}</div>}
        <div style={st.corps}>{children}</div>
        {pied && <div style={st.pied}>{pied}</div>}
      </div>
    </div>,
    document.body,
  );
}

// Liste de choix d'une fenêtre : un titre en gras, une ligne d'explication.
export function Choix({ titre, detail, onClick, danger = false, actif = false, disabled = false }) {
  return (
    <button
      type="button"
      style={{ ...st.choix, ...(actif ? st.choixActif : null), ...(disabled ? { opacity: 0.5, cursor: 'default' } : null) }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <span style={{ ...st.choixTitre, ...(danger ? { color: 'var(--danger-strong)' } : null) }}>{titre}</span>
      {detail && <span style={st.choixDetail}>{detail}</span>}
    </button>
  );
}

// Bouton nommé qui ouvre une fenêtre de choix rangés par sections.
// sections = [{ titre?, items: [{ titre, detail?, onClick, danger? } | null] }]
export function BoutonActions({ id, label, style, titre, sousTitre, sections }) {
  const [ouvert, setOuvert] = React.useState(false);
  const fermer = React.useCallback(() => setOuvert(false), []);
  const visibles = sections
    .map(s => ({ ...s, items: (s.items || []).filter(Boolean) }))
    .filter(s => s.items.length);
  if (!visibles.length) return null;
  return (
    <>
      <button type="button" style={style} onClick={() => setOuvert(true)} aria-haspopup="dialog" aria-expanded={ouvert}>
        {label}
      </button>
      {ouvert && (
        <Fenetre id={id} titre={titre} sousTitre={sousTitre} onClose={fermer}>
          {visibles.map((s, i) => (
            <div key={s.titre || i} style={st.section}>
              {s.titre && <div style={st.sectionTitre}>{s.titre}</div>}
              {s.items.map(it => (
                <Choix key={it.titre} {...it} onClick={() => { fermer(); it.onClick(); }} />
              ))}
            </div>
          ))}
        </Fenetre>
      )}
    </>
  );
}

// Groupe d'options exclusives (radio), en lignes lisibles au doigt.
export function Options({ nom, valeur, onChange, options }) {
  return (
    <div style={st.options} role="radiogroup" aria-label={nom}>
      {options.filter(Boolean).map(o => (
        <label key={o.v} style={{ ...st.option, ...(valeur === o.v ? st.optionActive : null) }}>
          <input type="radio" name={nom} checked={valeur === o.v} onChange={() => onChange(o.v)} style={st.radio} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={st.optionTitre}>{o.label}</span>
            {o.detail && <span style={st.optionDetail}>{o.detail}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export const st = {
  voile: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  fenetre: { position: 'relative', maxHeight: '88vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', padding: '20px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box' },
  fermer: { position: 'absolute', top: 6, right: 8, width: 40, height: 40, border: 'none', background: 'transparent', color: 'var(--text2)', fontSize: 24, cursor: 'pointer', lineHeight: 1 },
  titre: { fontSize: 17, fontWeight: 700, paddingRight: 32, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  sousTitre: { fontSize: 13, color: 'var(--text2)', marginTop: -6 },
  corps: { display: 'flex', flexDirection: 'column', gap: 14 },
  pied: { display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', paddingTop: 4 },
  section: { display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 },
  sectionTitre: { fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginTop: 2 },
  choix: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, width: '100%', textAlign: 'left', padding: '12px 14px', minHeight: 52, background: 'var(--bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0, boxSizing: 'border-box' },
  choixActif: { borderColor: 'var(--accent)' },
  choixTitre: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  choixDetail: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, whiteSpace: 'normal' },
  options: { display: 'flex', flexDirection: 'column', gap: 2 },
  option: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 2px', cursor: 'pointer', minHeight: 44, boxSizing: 'border-box' },
  optionActive: {},
  radio: { width: 18, height: 18, marginTop: 1, flexShrink: 0, accentColor: 'var(--accent)' },
  optionTitre: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  optionDetail: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--text2)' },
  champ: { width: '100%', padding: '10px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14, boxSizing: 'border-box', minHeight: 44 },
  primaire: { padding: '11px 18px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  secondaire: { padding: '11px 16px', background: 'var(--surface)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', color: 'var(--text)', borderRadius: 8, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  apercu: { fontSize: 13, color: 'var(--text)', lineHeight: 1.5 },
  remarque: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 },
};
