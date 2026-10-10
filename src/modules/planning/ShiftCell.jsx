import React from 'react';
import { pls } from './Planning.styles.js';
import { metaMotif } from '../../utils/absences.js';
import { typeHoraire } from './planningModeles.js';

// Absence (congé, formation, absence) posée en tête de case.
const PuceAbsence = ({ absence }) => {
  const m = metaMotif(absence.motif);
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: m.texte, textAlign: 'center' }}>
      {m.label}
    </div>
  );
};

// Case de la grille : les horaires du jour écrits en clair (« Midi », puis les
// heures), teintés par type. En mode remplissage, toucher la case pose le
// modèle choisi au lieu d'ouvrir la saisie.
const ShiftCell = ({ userId, date, getShiftsDay, canWrite, openAddPrefill, openEditShift, calcHeures, selectionMode = false, selectedIds, toggleShiftSelected, absence = null, onRemplir = null }) => {
  const shifts = getShiftsDay(userId, date);
  const remplir = (e) => { e.stopPropagation(); onRemplir(userId, date); };
  if (shifts.length === 0) return (
    <div
      style={{ ...pls.emptyCell, ...(absence ? { flexDirection: 'column', gap: 2, justifyContent: 'center' } : null), ...(onRemplir ? { background: 'var(--accent-light)' } : null) }}
      onClick={onRemplir ? remplir : () => !selectionMode && canWrite && openAddPrefill(userId, date)}
      role={canWrite && !selectionMode ? 'button' : undefined}
      aria-label={canWrite && !selectionMode ? 'Ajouter un horaire' : undefined}
    >
      {absence && <PuceAbsence absence={absence} />}
      {canWrite && !selectionMode && !absence && <span style={pls.addHint}>+</span>}
    </div>
  );
  const ordered = [...shifts].sort((a, b) => (a.debut || '').localeCompare(b.debut || ''));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, height: '100%' }}>
      {absence && <PuceAbsence absence={absence} />}
      {ordered.map(shift => {
        const heures = calcHeures(shift.debut, shift.fin, shift.pause);
        const enPoste = shift.pointageDebut && !shift.pointageFin;
        const selected = selectionMode && selectedIds?.has(shift.id);
        const t = typeHoraire(shift.typeShift);
        const bg = selected ? 'var(--accent-light)' : enPoste ? 'var(--success-bg)' : t.fond;
        const etat = enPoste ? 'en poste' : shift.pointageFin ? 'pointé' : null;
        const onClick = (e) => {
          e.stopPropagation();
          if (onRemplir) { onRemplir(userId, date); return; }
          if (selectionMode) { toggleShiftSelected?.(shift.id); return; }
          if (canWrite) openEditShift(shift);
        };
        return (
          <div key={shift.id} style={{ ...pls.shiftCell, background: bg, cursor: 'pointer', padding: '4px 6px', border: selected ? '1px solid var(--accent)' : 'none', display: 'flex', alignItems: 'flex-start', gap: 4 }} onClick={onClick}>
            {selectionMode && (
              <input type="checkbox" checked={!!selected} onChange={() => toggleShiftSelected?.(shift.id)} onClick={(e) => e.stopPropagation()} style={{ marginTop: 1 }} aria-label="Sélectionner cet horaire" />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.texte }}>{t.label}{etat ? `, ${etat}` : ''}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{shift.debut}-{shift.fin}</div>
              {(shift.poste || heures) && (
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>{[heures && `${heures} h`, shift.poste].filter(Boolean).join(', ')}</div>
              )}
            </div>
          </div>
        );
      })}
      {canWrite && !selectionMode && !onRemplir && shifts.length < 2 && (
        <div style={{ ...pls.emptyCell, minHeight: 22, padding: '2px', fontSize: 10 }} onClick={(e) => { e.stopPropagation(); openAddPrefill(userId, date); }} role="button" aria-label="Ajouter un second horaire">
          <span style={{ ...pls.addHint, fontSize: 13 }}>+</span>
        </div>
      )}
    </div>
  );
};

export default ShiftCell;
