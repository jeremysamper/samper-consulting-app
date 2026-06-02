import React from 'react';
import { pls } from './Planning.styles.js';

const ShiftCell = ({ userId, date, getShiftsDay, canWrite, openAddPrefill, openEditShift, calcHeures, selectionMode = false, selectedIds, toggleShiftSelected }) => {
  const shifts = getShiftsDay(userId, date);
  if (shifts.length === 0) return (
    <div style={pls.emptyCell} onClick={() => !selectionMode && canWrite && openAddPrefill(userId, date)}>
      {canWrite && !selectionMode && <span style={pls.addHint}>+</span>}
    </div>
  );
  const ordered = [...shifts].sort((a, b) => (a.debut || '').localeCompare(b.debut || ''));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
      {(ordered || []).map(shift => {
        const heures = calcHeures(shift.debut, shift.fin, shift.pause);
        const enPoste = shift.pointageDebut && !shift.pointageFin;
        const selected = selectionMode && selectedIds?.has(shift.id);
        const bg = selected ? 'var(--accent-light)' : enPoste ? 'var(--success-bg)' : shift.pointageDebut ? 'var(--info-bg)' : shift.typeShift === 'midi' ? 'var(--warning-bg)' : shift.typeShift === 'soir' ? 'var(--info-bg)' : 'var(--surface2)';
        const fg = enPoste ? 'var(--success-text)' : shift.pointageDebut ? 'var(--info-text)' : 'var(--text)';
        const label = shift.typeShift === 'midi' ? '☀' : shift.typeShift === 'soir' ? '🌙' : null;
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
              <div style={{ fontSize: 10, fontWeight: 700, color: fg }}>{label && <span style={{marginRight:3}}>{label}</span>}{shift.debut}–{shift.fin}</div>
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
