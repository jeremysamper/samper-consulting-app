import React from 'react';
import { pls } from './Planning.styles.js';
import { metaMotif } from '../../utils/absences.js';
import { Moon, Sun } from 'lucide-react';

// Pastille d'absence (congé, formation, absence) posée en tête de case.
const PuceAbsence = ({ absence }) => {
  const m = metaMotif(absence.motif);
  return (
    <div style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: m.fond, color: m.texte, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3 }}>
      {m.label}
    </div>
  );
};

const ShiftCell = ({ userId, date, getShiftsDay, canWrite, openAddPrefill, openEditShift, calcHeures, selectionMode = false, selectedIds, toggleShiftSelected, absence = null }) => {
  const shifts = getShiftsDay(userId, date);
  if (shifts.length === 0) return (
    <div style={{ ...pls.emptyCell, ...(absence ? { flexDirection: 'column', gap: 2, justifyContent: 'center' } : null) }} onClick={() => !selectionMode && canWrite && openAddPrefill(userId, date)}>
      {absence && <PuceAbsence absence={absence} />}
      {canWrite && !selectionMode && !absence && <span style={pls.addHint}>+</span>}
    </div>
  );
  const ordered = [...shifts].sort((a, b) => (a.debut || '').localeCompare(b.debut || ''));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
      {absence && <PuceAbsence absence={absence} />}
      {(ordered || []).map(shift => {
        const heures = calcHeures(shift.debut, shift.fin, shift.pause);
        const enPoste = shift.pointageDebut && !shift.pointageFin;
        const selected = selectionMode && selectedIds?.has(shift.id);
        const bg = selected ? 'var(--accent-light)' : enPoste ? 'var(--success-bg)' : shift.pointageDebut ? 'var(--info-bg)' : shift.typeShift === 'midi' ? 'var(--warning-bg)' : shift.typeShift === 'soir' ? 'var(--info-bg)' : 'var(--surface2)';
        const fg = enPoste ? 'var(--success-text)' : shift.pointageDebut ? 'var(--info-text)' : 'var(--text)';
        const label = shift.typeShift === 'midi' ? <Sun size={10} aria-label="Midi" /> : shift.typeShift === 'soir' ? <Moon size={10} aria-label="Soir" /> : null;
        const onClick = (e) => {
          e.stopPropagation();
          if (selectionMode) { toggleShiftSelected?.(shift.id); return; }
          if (canWrite) openEditShift(shift);
        };
        return (
          <div key={shift.id} style={{ ...pls.shiftCell, background: bg, cursor: 'pointer', padding: '3px 6px', border: selected ? '1px solid var(--accent)' : pls.shiftCell.border, display: 'flex', alignItems: 'flex-start', gap: 4 }} onClick={onClick}>
            {selectionMode && (
              <input type="checkbox" checked={!!selected} onChange={() => toggleShiftSelected?.(shift.id)} onClick={(e) => e.stopPropagation()} style={{ marginTop: 1 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: fg }}>{label && <span style={{marginRight:3, verticalAlign:'-1px'}}>{label}</span>}{shift.debut}-{shift.fin}</div>
              {shift.poste && <div style={{ fontSize: 9, color: 'var(--text2)' }}>{shift.poste}</div>}
              {heures && <div style={{ fontSize: 9, fontWeight: 600, color: fg }}>{heures}h</div>}
            </div>
          </div>
        );
      })}
      {canWrite && !selectionMode && shifts.length < 2 && (
        <div style={{...pls.emptyCell, minHeight:16, padding:'2px', fontSize:9}} onClick={(e) => { e.stopPropagation(); openAddPrefill(userId, date, shifts[0]?.typeShift === 'midi' ? 'soir' : 'midi'); }}>
          <span style={{...pls.addHint, fontSize:11}}>+ 2ème</span>
        </div>
      )}
    </div>
  );
};

export default ShiftCell;
