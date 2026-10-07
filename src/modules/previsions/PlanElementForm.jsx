import { useState, useRef, useEffect } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { ELEMENT_PAR_TYPE } from './planDecor.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// Nom d'un élément de décor : la zone « Cuisine », le bar « Bar à vins ».
// Seuls le bar, la banque d'accueil et les zones portent un nom ; le reste
// (tourner, dupliquer, supprimer) se fait depuis la barre du plan, l'élément
// sélectionné.
// ═══════════════════════════════════════════════════════════════════════════

const SUGGESTIONS = {
  zone: 'Cuisine, WC, vestiaire, escalier, terrasse…',
  bar: 'Bar, bar à vins…',
  accueil: 'Accueil, réception…',
};

export default function PlanElementForm({ element, onClose, onSave }) {
  const isMobile = useIsMobile();
  const def = ELEMENT_PAR_TYPE.get(element.type);
  const [libelle, setLibelle] = useState(element.libelle || '');
  const [loading, setLoading] = useState(false);

  // Faux dès que la fenêtre est fermée : l'écriture partie va à son terme
  // mais ne referme plus rien (voir PlanTableForm).
  const ouvertRef = useRef(true);
  useEffect(() => {
    ouvertRef.current = true;
    return () => { ouvertRef.current = false; };
  }, []);

  async function enregistrer(e) {
    e?.preventDefault();
    setLoading(true);
    try {
      const nom = libelle.trim().slice(0, 60);
      const ok = await onSave(element.id, { libelle: nom || null });
      if (ok && ouvertRef.current) onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="modal-sheet"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center', zIndex: 1000, padding: isMobile ? 0 : 16,
      }}
      onClick={onClose}
    >
      <form
        className="modal-sheet"
        onSubmit={enregistrer}
        style={{
          background: 'var(--surface)', width: isMobile ? '100%' : 380, maxWidth: '100%',
          borderRadius: isMobile ? '16px 16px 0 0' : 14,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
            {def?.label ?? 'Élément'}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{
            background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
            color: 'var(--text2)', padding: 4, lineHeight: 1,
          }}>
            ×
          </button>
        </div>

        <div style={{ padding: '18px 20px' }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 5, display: 'block' }}>
            Nom affiché sur le plan
          </label>
          <input
            type="text"
            value={libelle}
            maxLength={60}
            autoFocus={!isMobile}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder={SUGGESTIONS[element.type] || ''}
            style={{
              width: '100%', padding: '9px 12px', minHeight: 44,
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8,
              background: 'var(--bg)', color: 'var(--text)',
              fontFamily: 'var(--font)', fontSize: 13, boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
            Laissé vide, le plan affiche « {def?.label} ».
          </div>
        </div>

        <div style={{
          padding: '12px 20px',
          borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          {/* Jamais désactivé, même pendant l'écriture (voir ouvertRef). */}
          <button type="button" onClick={onClose} style={{
            padding: '10px 18px', borderRadius: 8,
            borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
            background: 'var(--surface)', color: 'var(--text)',
            cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
          }}>
            {loading ? 'Fermer' : 'Annuler'}
          </button>
          <button type="submit" disabled={loading} style={{
            padding: '10px 20px', borderRadius: 8,
            borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--accent)',
            background: 'var(--accent)', color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700,
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
