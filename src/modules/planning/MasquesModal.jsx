import React from 'react';

import { pls } from './Planning.styles.js';
import { notifyLegacy } from '../../legacy/legacyApi.js';

// ─────────────────────────────────────────────────────────────────────────────
// Personnes masquées du Planning & Pointage (consultant et patron).
//
// Une personne masquée disparaît de la grille, de la vue jour et du pointage
// pour toute l'équipe de l'établissement. Ses horaires restent en base, elle
// continue de voir les siens pour pointer, et le relevé CCNT la garde.
// ─────────────────────────────────────────────────────────────────────────────

// Depuis le 12.11.2026 : une section de la page des réglages
// (SectionsPlanning.jsx), le même contenu sans fenêtre ni voile.
export default function MasquesModal({ employees, masques, masquer, afficher, roles }) {
  const [enCours, setEnCours] = React.useState(null);

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
    <div role="region" aria-label="Personnes masquées" style={{ width: '100%', maxWidth: 480, minWidth: 0 }}>
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
  );
}

const s = {
  aide: { fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.45 },
  vide: { fontSize: 'var(--t2)', color: 'var(--text2)', padding: '6px 0' },
  ligne: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', minHeight: 56,
    borderRadius: 'var(--r)', background: 'var(--bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  ligneMasquee: { background: 'var(--surface2)', borderStyle: 'dashed' },
  boutonAfficher: { background: 'var(--selection)', borderColor: 'var(--onglet)', color: 'var(--lien)', fontWeight: 'var(--g2)' },
  nom: { display: 'block', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  role: { display: 'block', fontSize: 'var(--t1)', color: 'var(--text2)' },
};
