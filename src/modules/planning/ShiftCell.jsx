import React from 'react';
import { pls } from './Planning.styles.js';
import { metaMotif } from '../../utils/absences.js';
import { formatDuree, typeHoraire } from './planningModeles.js';

// Absence (congé, formation, absence) posée en tête de case.
const PuceAbsence = ({ absence }) => {
  const m = metaMotif(absence.motif);
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: m.texte, textAlign: 'center' }}>
      {m.label}
    </div>
  );
};

// Une case qui agit au clic agit aussi au clavier : focusable, Entrée et Espace.
const activable = (agir) => ({
  role: 'button',
  tabIndex: 0,
  onKeyDown: (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); agir(e); }
  },
});

// Case de la grille : les horaires du jour écrits en clair (« Midi », puis les
// heures), teintés par type. En mode remplissage, toucher la case pose le
// modèle choisi au lieu d'ouvrir la saisie.
const ShiftCell = ({ userId, date, getShiftsDay, canWrite, openAddPrefill, openEditShift, calcHeures, selectionMode = false, selectedIds, toggleShiftSelected, absence = null, onRemplir = null }) => {
  const shifts = getShiftsDay(userId, date);
  const remplir = (e) => { e.stopPropagation(); onRemplir(userId, date); };
  if (shifts.length === 0) {
    const ajouter = onRemplir ? remplir : () => !selectionMode && canWrite && openAddPrefill(userId, date);
    const actif = Boolean(onRemplir) || (canWrite && !selectionMode);
    return (
      <div
        style={{ ...pls.emptyCell, ...(absence ? { flexDirection: 'column', gap: 2, justifyContent: 'center' } : null), ...(onRemplir ? { background: 'var(--accent-light)' } : null) }}
        onClick={ajouter}
        {...(actif ? activable(ajouter) : null)}
        aria-label={actif ? 'Ajouter un horaire' : undefined}
      >
        {absence && <PuceAbsence absence={absence} />}
        {canWrite && !selectionMode && !absence && <span style={pls.addHint} aria-hidden="true">+</span>}
      </div>
    );
  }
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
        // Hors sélection (la case à cocher porte alors l'action), l'horaire se
        // modifie au clavier ; son nom, « Modifier l'horaire de 16:00-21:00 »,
        // est assemblé par aria-labelledby : un seul libellé à traduire.
        const modifiable = !selectionMode && (canWrite || Boolean(onRemplir));
        return (
          <div
            key={shift.id}
            style={{ ...pls.shiftCell, background: bg, cursor: 'pointer', padding: '4px 6px', border: selected ? '1px solid var(--accent)' : 'none', display: 'flex', alignItems: 'flex-start', gap: 4 }}
            onClick={onClick}
            {...(modifiable ? { ...activable(onClick), 'aria-labelledby': `shift-lbl-${shift.id} shift-h-${shift.id}` } : null)}
          >
            {modifiable && <span id={`shift-lbl-${shift.id}`} hidden>Modifier l'horaire de</span>}
            {selectionMode && (
              <input type="checkbox" checked={!!selected} onChange={() => toggleShiftSelected?.(shift.id)} onClick={(e) => e.stopPropagation()} style={{ marginTop: 1 }} aria-label="Sélectionner cet horaire" />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.texte }}>{t.label}{etat ? `, ${etat}` : ''}</div>
              <div id={`shift-h-${shift.id}`} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{shift.debut}-{shift.fin}</div>
              {(shift.poste || heures) && (
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>{[heures > 0 && formatDuree(heures), shift.poste].filter(Boolean).join(', ')}</div>
              )}
            </div>
          </div>
        );
      })}
      {canWrite && !selectionMode && !onRemplir && shifts.length < 2 && (
        <div
          style={{ ...pls.emptyCell, minHeight: 22, padding: '2px', fontSize: 11 }}
          onClick={(e) => { e.stopPropagation(); openAddPrefill(userId, date); }}
          {...activable((e) => { e.stopPropagation(); openAddPrefill(userId, date); })}
          aria-label="Ajouter un second horaire"
        >
          <span style={{ ...pls.addHint, fontSize: 13 }} aria-hidden="true">+</span>
        </div>
      )}
    </div>
  );
};

export default ShiftCell;
