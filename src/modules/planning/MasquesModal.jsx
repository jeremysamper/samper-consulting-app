import React from 'react';
import { X } from 'lucide-react';
import { pls } from './Planning.styles.js';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';

// ─────────────────────────────────────────────────────────────────────────────
// Personnes masquées du Planning & Pointage (consultant et patron).
//
// Une personne masquée disparaît de la grille, de la vue jour et du pointage
// pour toute l'équipe de l'établissement. Ses horaires restent en base, elle
// continue de voir les siens pour pointer, et le relevé CCNT la garde.
// ─────────────────────────────────────────────────────────────────────────────

export default function MasquesModal({ onClose, employees, masques, masquer, afficher, roles }) {
  const [enCours, setEnCours] = React.useState(null);
  useBackLayer(true, onClose, 'planning-masques');

  const tries = React.useMemo(
    () => [...employees].sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, 'fr')),
    [employees]
  );
  const nbMasques = tries.filter((e) => masques.has(e.id)).length;

  async function basculer(emp) {
    if (enCours) return;
    setEnCours(emp.id);
    try {
      const estMasque = masques.has(emp.id);
      const { error } = estMasque ? await afficher(emp.id) : await masquer(emp.id);
      if (error) notifyLegacy(error, 'error');
    } finally {
      setEnCours(null);
    }
  }

  return (
    <div className="modal-full-overlay" style={pls.overlay} onClick={onClose}>
      <div className="modal-full" style={{ ...pls.modal, width: 480 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Personnes masquées">
        <div style={pls.modalHeader}>
          <div style={pls.modalTitle}>Personnes masquées</div>
          <button type="button" style={{ ...pls.closeBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 }} onClick={onClose} aria-label="Fermer">
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={s.aide}>
            Une personne masquée n'apparaît plus dans le planning ni dans le pointage de cet établissement, pour toute l'équipe.
            Ses horaires sont conservés, elle voit toujours les siens pour pointer, et le relevé CCNT la garde.
          </div>

          {!tries.length && <div style={s.vide}>Aucun équipier dans cet établissement.</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tries.map((emp) => {
              const estMasque = masques.has(emp.id);
              return (
                <div key={emp.id} style={{ ...s.ligne, ...(estMasque ? s.ligneMasquee : null) }}>
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span style={s.nom} data-no-translate>{emp.prenom} {emp.nom}</span>
                    <span style={s.role}>{roles?.[emp.role]?.label || emp.role}{estMasque ? ', masqué' : ''}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => basculer(emp)}
                    disabled={enCours === emp.id}
                    style={{ ...pls.exportBtn, ...(estMasque ? s.boutonAfficher : null), minHeight: 44, flexShrink: 0, opacity: enCours === emp.id ? 0.6 : 1 }}
                  >
                    {estMasque ? 'Afficher' : 'Masquer'}
                  </button>
                </div>
              );
            })}
          </div>

          {nbMasques > 0 && <div style={s.aide}>{nbMasques} personne{nbMasques > 1 ? 's' : ''} masquée{nbMasques > 1 ? 's' : ''}.</div>}
        </div>
      </div>
    </div>
  );
}

const s = {
  aide: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.45 },
  vide: { fontSize: 13, color: 'var(--text2)', padding: '6px 0' },
  ligne: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', minHeight: 56,
    borderRadius: 10, background: 'var(--bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  ligneMasquee: { background: 'var(--surface2)', borderStyle: 'dashed' },
  boutonAfficher: { background: 'var(--accent-light)', borderColor: 'var(--accent-bd)', color: 'var(--accent)', fontWeight: 600 },
  nom: { display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  role: { display: 'block', fontSize: 12, color: 'var(--text2)' },
};
