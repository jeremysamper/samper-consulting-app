import React from 'react';
import { createPortal } from 'react-dom';
import { useBackLayer } from '../../hooks/useBackLayer.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fenêtres d'actions (Planning, puis tous les modules) : centrées sur
// ordinateur, tiroir du bas sur téléphone
// (modal-sheet). Rendues dans <body> : sur téléphone la barre d'actions défile
// et couperait tout ce qui est posé dedans. Se ferment par ×, Échap, un tap à
// côté ou le geste retour.
//
// Dans la page des réglages (EnSection), la fenêtre d'un réglage devient une
// section : même corps, même pied, posés dans la page, sans voile, sans portail
// et sans entrée d'historique. Seule l'enveloppe change. Une fenêtre ouverte
// depuis la section (un formulaire, une confirmation) reste une vraie fenêtre.
// ─────────────────────────────────────────────────────────────────────────────

const ContexteSection = React.createContext(false);

export function EnSection({ children }) {
  return <ContexteSection.Provider value>{children}</ContexteSection.Provider>;
}

export function useEnSection() {
  return React.useContext(ContexteSection);
}

export function Fenetre({ id, titre, sousTitre, onClose, largeur = 460, children, pied = null }) {
  const enSection = React.useContext(ContexteSection);
  useBackLayer(!enSection, onClose, id);
  const voileRef = React.useRef(null);
  React.useEffect(() => {
    if (enSection) return undefined;
    // Échap ferme la fenêtre du dessus seulement : une fenêtre ouverte depuis
    // une autre (« Gérer » dans une fiche) ne referme pas les deux d'un coup.
    const echap = (e) => {
      if (e.key !== 'Escape') return;
      const voiles = document.querySelectorAll('[data-fenetre]');
      if (voiles.length && voiles[voiles.length - 1] !== voileRef.current) return;
      onClose();
    };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [onClose, enSection]);
  if (enSection) {
    return (
      <ContexteSection.Provider value={false}>
        <div data-section-fenetre={id || ''} style={{ ...st.enSection, maxWidth: Math.max(largeur, 560) }}>
          {sousTitre && <div style={{ ...st.sousTitre, marginTop: 0 }}>{sousTitre}</div>}
          <div style={st.corps}>{children}</div>
          {pied && <div style={st.pied}>{pied}</div>}
        </div>
      </ContexteSection.Provider>
    );
  }
  return createPortal(
    <div ref={voileRef} data-fenetre="" className="modal-sheet-overlay" style={st.voile} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
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
// disabled : le bouton déclencheur reste visible mais inactif (export en cours).
export function BoutonActions({ id, label, style, disabled = false, titre, sousTitre, sections }) {
  const [ouvert, setOuvert] = React.useState(false);
  const fermer = React.useCallback(() => setOuvert(false), []);
  const visibles = sections
    .map(s => ({ ...s, items: (s.items || []).filter(Boolean) }))
    .filter(s => s.items.length);
  if (!visibles.length) return null;
  return (
    <>
      <button type="button" style={style} disabled={disabled} onClick={() => setOuvert(true)} aria-haspopup="dialog" aria-expanded={ouvert}>
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

// Styles partagés des fenêtres et de leurs formulaires, écrits par les jetons
// de la direction Galet (.claude/rules/direction-galet.md) : fenêtre à rayon
// --r-xl et ombre --sh-lg, titre sans serif en --g3, champ à rayon --r et à
// contour --champ-bord sur fond --surface, boutons en pilule, le secondaire
// par les jetons --btn-*, l'aplat sombre pour l'action principale. Un contour
// s'écrit en borderWidth, borderStyle et borderColor : un appelant peut en
// changer la seule couleur (npm run lint:borders).
export const st = {
  voile: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  enSection: { display: 'flex', flexDirection: 'column', gap: 12, width: '100%', minWidth: 0, boxSizing: 'border-box' },
  // Une fenêtre flotte : c'est elle, avec les menus, qui porte une ombre.
  fenetre: { position: 'relative', maxHeight: '88vh', overflowY: 'auto', background: 'var(--surface)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh-lg)', padding: '20px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box' },
  fermer: { position: 'absolute', top: 6, right: 8, width: 40, height: 40, border: 'none', background: 'transparent', color: 'var(--text2)', fontSize: 24, cursor: 'pointer', lineHeight: 1 },
  titre: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', paddingRight: 32, color: 'var(--text)', fontFamily: 'var(--font)' },
  sousTitre: { fontSize: 13, color: 'var(--text2)', marginTop: -6 },
  corps: { display: 'flex', flexDirection: 'column', gap: 14 },
  pied: { display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', paddingTop: 4 },
  section: { display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 },
  sectionTitre: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)', marginTop: 2 },
  // Un choix est une ligne de liste : pas de cadre, un filet en bas. Le
  // contour transparent garde la place du filet sur les quatre côtés.
  choix: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, width: '100%', textAlign: 'left', padding: '12px 0', minHeight: 52, background: 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', borderBottomColor: 'var(--border)', borderRadius: 0, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0, boxSizing: 'border-box' },
  choixActif: { background: 'var(--selection)' },
  choixTitre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  choixDetail: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.4, whiteSpace: 'normal' },
  options: { display: 'flex', flexDirection: 'column', gap: 2 },
  option: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 2px', cursor: 'pointer', minHeight: 44, boxSizing: 'border-box' },
  optionActive: {},
  radio: { width: 18, height: 18, marginTop: 1, flexShrink: 0, accentColor: 'var(--accent)' },
  optionTitre: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  optionDetail: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.4 },
  label: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)' },
  champ: { width: '100%', padding: '10px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 'var(--t2)', boxSizing: 'border-box', minHeight: 44 },
  primaire: { padding: '11px 18px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--r-full)', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  // L'état éteint du bouton secondaire (texte et contour effacés) vit dans
  // app.css, accroché au contour --btn-bord écrit ici.
  secondaire: { padding: '11px 16px', background: 'var(--btn-fond)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', color: 'var(--btn-texte)', borderRadius: 'var(--r-full)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44 },
  apercu: { fontSize: 13, color: 'var(--text)', lineHeight: 1.5 },
  remarque: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.5 },
};
