import React from 'react';
import { getDemoData } from '../../data/demoData.js';
import { alertLegacy, confirmLegacy, getBrowserWindow, notifyLegacy, readLegacyStorage } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import ShiftCell from './ShiftCell.jsx';
import { ccntCell, pls } from './Planning.styles.js';
import { dbService } from '../../services/dbService.js';

// ─────────────────────────────────────────────────────
// PLANNING & POINTAGE — Module unifié, par établissement, responsive
// ─────────────────────────────────────────────────────

const Planning = ({ user, etablissement, initialTab }) => {
  const browserWindow = getBrowserWindow();
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const [activeTab, setActiveTab] = React.useState(initialTab || 'planning');

  const getMondayOfCurrentWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  };
  const todayStr = new Date().toISOString().slice(0, 10);

  const [selectedDate, setSelectedDate] = React.useState(getMondayOfCurrentWeek());
  const [pointageDate, setPointageDate] = React.useState(todayStr);
  const [horizon, setHorizon] = React.useState(1);
  const [showDetailModal, setShowDetailModal] = React.useState(false);
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [selectedShift, setSelectedShift] = React.useState(null);
  const [editForm, setEditForm] = React.useState(null);
  const [planning, setPlanning] = React.useState([]); // shifts chargés depuis Supabase
  const [loading, setLoading] = React.useState(true);
  const [isMobile, setIsMobile] = React.useState(browserWindow?.innerWidth < 768);

  // === Export CCNT ===
  const [showCCNTModal, setShowCCNTModal] = React.useState(false);
  const [ccntEmployeeId, setCcntEmployeeId] = React.useState(null);
  const [ccntMonth, setCcntMonth] = React.useState(todayStr.slice(0, 7)); // YYYY-MM
  const [ccntSoldePrec, setCcntSoldePrec] = React.useState(0); // solde d'heures supp reporté du mois précédent
  const [ccntVacances, setCcntVacances] = React.useState({ solde: 0, pris: 0 });
  const [ccntJoursRepos, setCcntJoursRepos] = React.useState({ dus: 0, pris: 0 });
  const [ccntJoursFeries, setCcntJoursFeries] = React.useState({ dus: 0, pris: 0 });

  React.useEffect(() => {
    const h = () => setIsMobile(browserWindow?.innerWidth < 768);
    browserWindow?.addEventListener('resize', h);
    return () => browserWindow?.removeEventListener('resize', h);
  }, []);

  const perms = demoData.permissions[user.role] || {};
  const canWrite = perms.planning && (user.role === 'consultant' || user.role === 'patron' || user.role === 'resp_cuisine');
  const canExport = ['consultant', 'patron'].includes(user.role);

  // canPoint(shift) : seul le propriétaire du shift peut pointer (ou un manager pour corriger)
  const canPointShift = (shift) => {
    if (!shift) return false;
    if (!perms.planning) return false;
    if (shift.userId === user.id) return true;
    return canWrite; // managers peuvent corriger un pointage
  };
  const etabId = etablissement?.id || 'etab-1';

  // Employés de cet établissement (sauf consultant et patron qui ne sont pas planifiés)
  const employees = demoData.utilisateurs.filter(u =>
    u.etablissementIds?.includes(etabId) &&
    !['consultant', 'patron'].includes(u.role) &&
    u.actif !== false
  );

  // Planning de cet établissement uniquement
  const planningEtab = planning.filter(s => (s.etablissementId || 'etab-1') === etabId);

  // ═══ Chargement depuis Supabase + Realtime ═══
  React.useEffect(() => {
    if (!legacySB) {
      // Fallback localStorage si Supabase pas configuré
      setPlanning(readLegacyStorage('sc_planning', demoData.planning));
      setLoading(false);
      return;
    }
    let mounted = true;
    let unsubscribe = null;

    (async () => {
      try {
        const rows = await legacySB.db.listShifts(etabId);
        if (!mounted) return;
        const shifts = rows.map(r => legacySB.db.mapShiftFromDB(r));
        setPlanning(shifts);
      } catch (err) {
        console.error('[Planning] load', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // Realtime en dehors du IIFE async : garantit le cleanup même si le chargement initial échoue
    unsubscribe = legacySB.realtime.subscribe('shifts', (payload) => {
      const row = payload.new || payload.old;
      if (!row || row.etablissement_id !== etabId) return; // pas notre établissement

      setPlanning(prev => {
        if (payload.eventType === 'INSERT') {
          const mapped = legacySB.db.mapShiftFromDB(payload.new);
          if (prev.find(s => s.id === mapped.id)) return prev; // déjà présent (créé par nous)
          return [...prev, mapped];
        }
        if (payload.eventType === 'UPDATE') {
          const mapped = legacySB.db.mapShiftFromDB(payload.new);
          return prev.map(s => s.id === mapped.id ? mapped : s);
        }
        if (payload.eventType === 'DELETE') {
          return prev.filter(s => s.id !== payload.old.id);
        }
        return prev;
      });
    });

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [etabId]);

  const fmtLabel = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-CH', {
    weekday: isMobile ? 'short' : 'short', day: '2-digit', month: '2-digit'
  }).replace('.', '').replace(',', '');

  const DAYS = React.useMemo(() => {
    const arr = [];
    const start = new Date(selectedDate + 'T12:00:00');
    for (let i = 0; i < horizon * 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      arr.push({ date: d.toISOString().slice(0, 10), label: fmtLabel(d.toISOString().slice(0, 10)) });
    }
    return arr;
  }, [selectedDate, horizon, isMobile]);

  const getShift = (userId, date) => planningEtab.find(s => s.userId === userId && s.date === date);
  const getShiftsDay = (userId, date) => planningEtab.filter(s => s.userId === userId && s.date === date);

  const calcHeures = (debut, fin, pause) => {
    if (!debut || !fin) return null;
    const [dh, dm] = debut.split(':').map(Number);
    const [fh, fm] = fin.split(':').map(Number);
    const total = (fh * 60 + fm) - (dh * 60 + dm) - (pause || 0);
    return (total / 60).toFixed(1);
  };

  // ─── Calculs heures par employé ───
  // Semaine = total des 7 jours affichés (DAYS) — change avec la navigation hebdo.
  // Mois = total du mois calendaire de selectedDate — change avec la navigation hebdo.
  // Tous les hooks doivent rester au top niveau du composant (pas après early return).
  const weeklyHoursByUser = React.useMemo(() => {
    const out = {};
    employees.forEach(emp => {
      let total = 0;
      DAYS.forEach(d => {
        const shifts = planningEtab.filter(s => s.userId === emp.id && s.date === d.date);
        shifts.forEach(sh => {
          const h = parseFloat(calcHeures(sh.debut, sh.fin, sh.pause));
          if (!isNaN(h)) total += h;
        });
      });
      out[emp.id] = total;
    });
    return out;
  }, [employees, DAYS, planningEtab]);

  const monthlyHoursByUser = React.useMemo(() => {
    // Mois calendaire de selectedDate (premier jour de la semaine affichée)
    const ref = new Date(selectedDate + 'T12:00:00');
    const year = ref.getFullYear();
    const month = ref.getMonth(); // 0-indexed
    const out = {};
    employees.forEach(emp => {
      let total = 0;
      const userShifts = planningEtab.filter(s => s.userId === emp.id);
      userShifts.forEach(sh => {
        const d = new Date(sh.date + 'T12:00:00');
        if (d.getFullYear() === year && d.getMonth() === month) {
          const h = parseFloat(calcHeures(sh.debut, sh.fin, sh.pause));
          if (!isNaN(h)) total += h;
        }
      });
      out[emp.id] = total;
    });
    return out;
  }, [employees, planningEtab, selectedDate]);

  // Mois courant en label fr (ex: "avril 2026")
  const currentMonthLabel = React.useMemo(() => {
    const ref = new Date(selectedDate + 'T12:00:00');
    return ref.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });
  }, [selectedDate]);

  const deleteShift = async (id) => {
    if (!canWrite || !confirmLegacy('Supprimer cet horaire ?')) return;
    if (legacySB) {
      try {
        await legacySB.db.deleteShift(id);
        // Optimistic update local (realtime fera aussi le refresh)
        setPlanning(prev => prev.filter(s => s.id !== id));
      } catch (err) {
        notifyLegacy('Erreur suppression : ' + err.message, 'error');
        return;
      }
    } else {
      setPlanning(prev => prev.filter(s => s.id !== id));
    }
    setShowDetailModal(false);
  };

  const openNewShift = (userId = '', date = selectedDate, typeShift = 'simple') => {
    const defaults = typeShift === 'midi' ? { debut: '10:00', fin: '15:00', pause: 0 }
                   : typeShift === 'soir' ? { debut: '17:00', fin: '23:00', pause: 0 }
                   : { debut: '09:00', fin: '17:00', pause: 30 };
    setEditForm({
      id: null,
      userId: userId || employees[0]?.id || '',
      etablissementId: etabId,
      date: date || selectedDate,
      typeShift,
      ...defaults,
      poste: '', statut: 'confirmé',
      pointageDebut: null, pointageFin: null,
    });
    setShowEditModal(true);
  };

  const openEditShift = (shift) => {
    setEditForm({ ...shift });
    setShowDetailModal(false);
    setShowEditModal(true);
  };

  const saveShift = async () => {
    if (!editForm.userId || !editForm.date || !editForm.debut || !editForm.fin) {
      alertLegacy('Veuillez remplir employé, date, heure de début et heure de fin.');
      return;
    }
    if (legacySB) {
      try {
        if (editForm.id) {
          const updated = await legacySB.db.updateShift(editForm.id, editForm);
          const mapped = legacySB.db.mapShiftFromDB(updated);
          setPlanning(prev => prev.map(s => s.id === mapped.id ? mapped : s));
        } else {
          const created = await legacySB.db.createShift({ ...editForm, etablissementId: etabId });
          const mapped = legacySB.db.mapShiftFromDB(created);
          setPlanning(prev => [...prev, mapped]);
        }
      } catch (err) {
        notifyLegacy('Erreur enregistrement : ' + err.message, 'error');
        return;
      }
    } else {
      // fallback local
      if (editForm.id) {
        setPlanning(prev => prev.map(s => s.id === editForm.id ? { ...editForm } : s));
      } else {
        setPlanning(prev => [...prev, { ...editForm, id: 's' + Date.now(), etablissementId: etabId }]);
      }
    }
    setShowEditModal(false);
    setEditForm(null);
  };

  const nowTime = () => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  };

  const pointerArrivee = async (shift) => {
    if (legacySB) {
      try {
        const row = await legacySB.db.pointerArrivee(shift.id);
        const mapped = legacySB.db.mapShiftFromDB(row);
        setPlanning(prev => prev.map(s => s.id === shift.id ? mapped : s));
        setSelectedShift(mapped);
      } catch (err) {
        notifyLegacy('Erreur pointage arrivée : ' + err.message, 'error');
      }
    } else {
      const t = nowTime();
      setPlanning(prev => prev.map(s => s.id === shift.id ? { ...s, pointageDebut: t } : s));
      setSelectedShift(prev => prev ? { ...prev, pointageDebut: t } : prev);
    }
  };

  const pointerDepart = async (shift) => {
    if (legacySB) {
      try {
        const row = await legacySB.db.pointerDepart(shift.id);
        const mapped = legacySB.db.mapShiftFromDB(row);
        setPlanning(prev => prev.map(s => s.id === shift.id ? mapped : s));
        setSelectedShift(mapped);
      } catch (err) {
        notifyLegacy('Erreur pointage départ : ' + err.message, 'error');
      }
    } else {
      const t = nowTime();
      setPlanning(prev => prev.map(s => s.id === shift.id ? { ...s, pointageFin: t } : s));
      setSelectedShift(prev => prev ? { ...prev, pointageFin: t } : prev);
    }
  };

  const resetPointage = async (shift) => {
    if (!confirmLegacy('Réinitialiser le pointage ?')) return;
    if (legacySB) {
      try {
        const row = await legacySB.db.updateShift(shift.id, { pointageDebut: null, pointageFin: null });
        const mapped = legacySB.db.mapShiftFromDB(row);
        setPlanning(prev => prev.map(s => s.id === shift.id ? mapped : s));
        setSelectedShift(mapped);
      } catch (err) {
        notifyLegacy('Erreur : ' + err.message, 'error');
      }
    } else {
      setPlanning(prev => prev.map(s => s.id === shift.id ? { ...s, pointageDebut: null, pointageFin: null } : s));
      setSelectedShift(prev => prev ? { ...prev, pointageDebut: null, pointageFin: null } : prev);
    }
  };

  // ═══════════════ DUPLICATION ═══════════════

  // State pour la modale de duplication (journée OU semaine)
  const [duplicateMode, setDuplicateMode] = React.useState(null); // null | 'day' | 'week'
  const [duplicateSource, setDuplicateSource] = React.useState({ userId: '', sourceDate: '', targetDate: '' });

  // ─── État pour la duplication "journée vers plusieurs employés" ───
  // Étend la duplication d'un jour pour cibler N employés sur 1 date OU une plage de dates
  // filtrée par jours de semaine (lun/mer/ven uniquement par ex.).
  const [dupTargetUserIds, setDupTargetUserIds] = React.useState(new Set());
  const [dupUseRange, setDupUseRange] = React.useState(false);
  const [dupRangeEnd, setDupRangeEnd] = React.useState('');
  // Indices ISO : 0=lundi, 1=mardi, ..., 6=dimanche. Tous cochés par défaut.
  const [dupRangeWeekdays, setDupRangeWeekdays] = React.useState(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [dupConflictMode, setDupConflictMode] = React.useState('replace'); // 'replace' | 'skip' | 'add'
  const [dupSaving, setDupSaving] = React.useState(false);

  // State pour la démultiplication d'un horaire vers plusieurs jours × employés
  // Ouverte depuis la modale de détail d'un shift via le bouton "Démultiplier".
  // sourceShift = shift original, targetDates = Set de dates, targetUserIds = Set d'ids users
  const [demultModal, setDemultModal] = React.useState(null); // { sourceShift } | null
  const [demultDates, setDemultDates] = React.useState(new Set());
  const [demultUserIds, setDemultUserIds] = React.useState(new Set());
  const [demultSaving, setDemultSaving] = React.useState(false);

  // Loading guard APRÈS tous les hooks (sinon React error #310 : hooks appelés de manière conditionnelle)
  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;

  const openDuplicateDay = (presetUserId, presetSourceDate) => {
    setDuplicateMode('day');
    const defaultUid = presetUserId || employees[0]?.id || '';
    const defaultSrc = presetSourceDate || todayStr;
    // Date cible par défaut = lendemain (plus pratique que "aujourd'hui = aujourd'hui")
    const tomorrow = new Date(defaultSrc + 'T12:00:00');
    tomorrow.setDate(tomorrow.getDate() + 1);
    const defaultTgt = tomorrow.toISOString().slice(0, 10);
    setDuplicateSource({
      userId: defaultUid,
      sourceDate: defaultSrc,
      targetDate: defaultTgt,
    });
    // Pré-coche l'employé source (décochable si on veut seulement vers d'autres)
    setDupTargetUserIds(new Set(defaultUid ? [defaultUid] : []));
    setDupUseRange(false);
    setDupRangeEnd(defaultTgt);
    setDupRangeWeekdays(new Set([0, 1, 2, 3, 4, 5, 6]));
    setDupConflictMode('replace');
  };

  // ─── Helpers de duplication multi-employés ───
  // Construit la liste des dates cibles selon le mode (single date OR range filtrée par jours de semaine).
  // Indice weekday : 0=lundi, 1=mardi, ..., 6=dimanche (ordre ISO européen).
  const buildDupTargetDates = () => {
    if (!dupUseRange) {
      return duplicateSource.targetDate ? [duplicateSource.targetDate] : [];
    }
    if (!duplicateSource.targetDate || !dupRangeEnd) return [];
    const start = new Date(duplicateSource.targetDate + 'T12:00:00');
    const end = new Date(dupRangeEnd + 'T12:00:00');
    if (end < start) return [];
    const dates = [];
    const cursor = new Date(start);
    // Garde-fou : max 366 jours
    for (let i = 0; i < 366 && cursor <= end; i++) {
      const jsDay = cursor.getDay(); // 0=dim, 1=lun, ..., 6=sam
      const isoDay = jsDay === 0 ? 6 : jsDay - 1; // 0=lun, ..., 6=dim
      if (dupRangeWeekdays.has(isoDay)) {
        dates.push(cursor.toISOString().slice(0, 10));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  };

  const openDuplicateWeek = () => {
    setDuplicateMode('week');
    // Source = lundi de la semaine courante, cible = lundi suivant
    const nextMonday = new Date(selectedDate + 'T12:00:00');
    nextMonday.setDate(nextMonday.getDate() + 7);
    setDuplicateSource({
      userId: '',
      sourceDate: selectedDate,
      targetDate: nextMonday.toISOString().slice(0, 10),
    });
  };

  // Duplique tous les shifts d'un employé à une date source vers N employés sur 1 date OU une plage.
  // Conflits gérés selon dupConflictMode : 'replace' / 'skip' / 'add'.
  const doDuplicateDay = async () => {
    const { userId, sourceDate } = duplicateSource;
    if (!userId) { alertLegacy('Sélectionne un employé source.'); return; }
    if (!sourceDate) { alertLegacy('Sélectionne la date source.'); return; }
    if (dupTargetUserIds.size === 0) { alertLegacy('Sélectionne au moins un employé cible.'); return; }

    const targetDates = buildDupTargetDates();
    if (targetDates.length === 0) { alertLegacy('Aucune date cible valide (vérifie la plage et les jours sélectionnés).'); return; }

    const shiftsToCopy = planningEtab.filter(s => s.userId === userId && s.date === sourceDate);
    if (shiftsToCopy.length === 0) {
      alertLegacy('Aucun horaire à dupliquer pour cet employé à la date source.');
      return;
    }

    setDupSaving(true);
    let created = 0, replaced = 0, skipped = 0;
    const newShifts = [];
    const idsToRemove = new Set();

    try {
      for (const targetUid of dupTargetUserIds) {
        for (const targetDate of targetDates) {
          // Skip la cellule source elle-même (même user + même date)
          if (targetUid === userId && targetDate === sourceDate) continue;

          const existing = planningEtab.filter(s => s.userId === targetUid && s.date === targetDate);
          if (existing.length > 0) {
            if (dupConflictMode === 'skip') {
              skipped += existing.length;
              continue;
            }
            if (dupConflictMode === 'replace') {
              for (const ex of existing) {
                if (legacySB) {
                  try { await legacySB.db.deleteShift(ex.id); } catch (err) { console.error('[dup delete]', err); }
                }
                idsToRemove.add(ex.id);
                replaced++;
              }
            }
            // 'add' : ne supprime rien, on ajoute en plus
          }

          for (const src of shiftsToCopy) {
            const copy = {
              id: 's' + Date.now() + Math.floor(Math.random() * 10000) + '-' + created,
              etablissementId: etabId,
              userId: targetUid,
              date: targetDate,
              debut: src.debut,
              fin: src.fin,
              pause: src.pause,
              poste: src.poste,
              typeShift: src.typeShift,
              statut: 'confirmé',
              pointageDebut: null,
              pointageFin: null,
              note: src.note,
            };
            if (legacySB) {
              try {
                const saved = await legacySB.db.createShift(copy);
                newShifts.push(legacySB.db.mapShiftFromDB(saved));
                created++;
              } catch (err) {
                console.error('[dup create]', err);
                notifyLegacy('Erreur création : ' + err.message, 'error');
              }
            } else {
              newShifts.push(copy);
              created++;
            }
          }
        }
      }

      setPlanning(prev => [...prev.filter(s => !idsToRemove.has(s.id)), ...newShifts]);

      const empCount = dupTargetUserIds.size;
      const dayCount = targetDates.length;
      let msg = `✓ ${created} horaire${created > 1 ? 's' : ''} créé${created > 1 ? 's' : ''} vers ${empCount} employé${empCount > 1 ? 's' : ''} sur ${dayCount} jour${dayCount > 1 ? 's' : ''}`;
      if (replaced > 0) msg += ` (${replaced} remplacé${replaced > 1 ? 's' : ''})`;
      if (skipped > 0) msg += ` — ${skipped} ignoré${skipped > 1 ? 's' : ''}`;
      notifyLegacy(msg, 'success');
      setDuplicateMode(null);
    } finally {
      setDupSaving(false);
    }
  };

  // Duplique TOUTE la semaine (tous les employés) vers une autre semaine
  const doDuplicateWeek = async () => {
    const { sourceDate, targetDate } = duplicateSource;
    if (!sourceDate || !targetDate) { alertLegacy('Remplissez les dates.'); return; }
    if (sourceDate === targetDate) { alertLegacy('La semaine cible doit être différente.'); return; }

    // Construire la liste des 7 jours source et 7 jours cible
    const sourceDays = [];
    const targetDays = [];
    const srcStart = new Date(sourceDate + 'T12:00:00');
    const tgtStart = new Date(targetDate + 'T12:00:00');
    for (let i = 0; i < 7; i++) {
      const d1 = new Date(srcStart); d1.setDate(d1.getDate() + i);
      const d2 = new Date(tgtStart); d2.setDate(d2.getDate() + i);
      sourceDays.push(d1.toISOString().slice(0, 10));
      targetDays.push(d2.toISOString().slice(0, 10));
    }

    const shiftsToCopy = planningEtab.filter(s => sourceDays.includes(s.date));
    if (shiftsToCopy.length === 0) {
      alertLegacy('Aucun horaire à dupliquer sur cette semaine.');
      return;
    }

    // Vérifier les conflits
    const existing = planningEtab.filter(s => targetDays.includes(s.date));
    if (existing.length > 0) {
      if (!confirmLegacy(`La semaine cible contient déjà ${existing.length} horaire(s). Les remplacer ?`)) return;
      if (legacySB) {
        try {
          for (const s of existing) await legacySB.db.deleteShift(s.id);
        } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
      }
    }

    // Créer les nouveaux shifts
    const newShifts = [];
    const now = Date.now();
    for (let i = 0; i < shiftsToCopy.length; i++) {
      const src = shiftsToCopy[i];
      const dayIndex = sourceDays.indexOf(src.date);
      const newDate = targetDays[dayIndex];
      const copy = {
        id: 's' + now + '-' + i,
        etablissementId: etabId,
        userId: src.userId,
        date: newDate,
        debut: src.debut,
        fin: src.fin,
        pause: src.pause,
        poste: src.poste,
        typeShift: src.typeShift,
        statut: 'confirmé',
        pointageDebut: null,
        pointageFin: null,
        note: src.note,
      };
      if (legacySB) {
        try {
          const saved = await legacySB.db.createShift(copy);
          newShifts.push(legacySB.db.mapShiftFromDB(saved));
        } catch (err) { notifyLegacy('Erreur création : ' + err.message, 'error'); return; }
      } else {
        newShifts.push(copy);
      }
    }
    setPlanning(prev => [...prev.filter(s => !existing.find(e => e.id === s.id)), ...newShifts]);
    setDuplicateMode(null);
    alertLegacy(`✓ Semaine dupliquée : ${newShifts.length} horaire${newShifts.length > 1 ? 's' : ''} créé${newShifts.length > 1 ? 's' : ''}.`);
  };

  // ─── Démultiplication d'un horaire vers plusieurs jours × plusieurs employés ───
  // Ouvre la modale dédiée. Pré-coche l'employé source.
  const openDemult = (shift) => {
    setShowDetailModal(false);
    setDemultModal({ sourceShift: shift });
    setDemultDates(new Set()); // vide par défaut, l'utilisateur choisit
    setDemultUserIds(new Set([shift.userId])); // employé source pré-coché
  };

  const closeDemult = () => {
    setDemultModal(null);
    setDemultDates(new Set());
    setDemultUserIds(new Set());
  };

  // Crée N nouveaux shifts (1 par couple date×employé) à partir du shift source.
  // Comportement : "remplace" = supprime tout shift existant à la même date pour cet employé puis crée.
  // C'est le comportement de la duplication journée existante, on garde la cohérence.
  const saveDemult = async () => {
    if (!demultModal?.sourceShift) return;
    if (demultDates.size === 0) { notifyLegacy('Sélectionnez au moins un jour cible.', 'warning'); return; }
    if (demultUserIds.size === 0) { notifyLegacy('Sélectionnez au moins un employé cible.', 'warning'); return; }

    const src = demultModal.sourceShift;
    setDemultSaving(true);
    let created = 0;
    let replaced = 0;
    const newShifts = [];

    try {
      for (const userId of demultUserIds) {
        for (const date of demultDates) {
          // Skip la cellule source elle-même (même user + même date)
          if (userId === src.userId && date === src.date) continue;
          // Supprimer les shifts existants à cette date pour cet employé (cohérent avec dupliquerJournee)
          const existing = planningEtab.filter(s => s.userId === userId && s.date === date);
          for (const ex of existing) {
            if (legacySB) {
              try { await legacySB.db.deleteShift(ex.id); replaced++; }
              catch (err) { console.error('[demult delete]', err); }
            }
          }
          const newShift = {
            id: 'sh' + Date.now() + Math.random().toString(36).slice(2, 6),
            userId,
            etablissementId: etabId,
            date,
            debut: src.debut,
            fin: src.fin,
            pause: src.pause || 0,
            poste: src.poste || '',
            statut: 'confirmé',
            typeShift: src.typeShift || 'simple',
            pointageDebut: null,
            pointageFin: null,
          };
          if (legacySB) {
            try {
              const saved = await legacySB.db.createShift(newShift);
              newShifts.push(saved);
              created++;
            } catch (err) {
              console.error('[demult create]', err);
            }
          } else {
            newShifts.push(newShift);
            created++;
          }
        }
      }
      // Mise à jour optimiste locale (le realtime fera aussi le boulot)
      setPlanning(prev => {
        const idsToRemove = new Set();
        // On retire les anciens shifts qui ont été remplacés
        demultDates.forEach(date => {
          demultUserIds.forEach(uid => {
            prev.filter(s => s.userId === uid && s.date === date).forEach(s => idsToRemove.add(s.id));
          });
        });
        return [...prev.filter(s => !idsToRemove.has(s.id)), ...newShifts];
      });
      const msg = replaced > 0
        ? `✓ ${created} horaire(s) créé(s), ${replaced} remplacé(s).`
        : `✓ ${created} horaire(s) créé(s).`;
      notifyLegacy(msg, 'success');
      closeDemult();
    } finally {
      setDemultSaving(false);
    }
  };

  // ═══════════════ EXPORT CCNT ═══════════════
  // Conforme aux art. 15 et 21 CCNT hôtellerie-restauration suisse

  const openCCNTModal = () => {
    setCcntEmployeeId(employees[0]?.id || null);
    setCcntMonth(todayStr.slice(0, 7));
    setShowCCNTModal(true);
  };

  // Paramètres CCNT (durée contractuelle hebdo selon type d'établissement)
  const getHeuresContractuelles = () => {
    // 42h standard, 43.5h saisonnier, 45h petit établissement
    if (etablissement?.ccntHeuresSemaine) return etablissement.ccntHeuresSemaine;
    if (etablissement?.type === 'saisonnier') return 43.5;
    if (etablissement?.type === 'petit') return 45;
    return 42;
  };

  // Calcul du relevé CCNT pour un employé sur un mois donné
  const buildCCNTData = () => {
    if (!ccntEmployeeId) return null;
    const emp = demoData.utilisateurs.find(u => u.id === ccntEmployeeId);
    if (!emp) return null;

    const heuresHebdo = getHeuresContractuelles();
    const heuresParJour = heuresHebdo / 5; // 5 jours ouvrés (42h/5 = 8.4h)

    // Toutes les dates du mois
    const [y, m] = ccntMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const jours = [];
    let totalMois = 0;
    let totalPrev = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dateObj = new Date(dateStr + 'T12:00:00');
      const dayName = dateObj.toLocaleDateString('fr-CH', { weekday: 'short' });
      const shift = planning.find(s => s.userId === ccntEmployeeId && s.date === dateStr && (s.etablissementId || 'etab-1') === etabId);

      let heuresPrev = 0, heuresReel = 0;
      if (shift) {
        heuresPrev = parseFloat(calcHeures(shift.debut, shift.fin, shift.pause)) || 0;
        if (shift.pointageDebut && shift.pointageFin) {
          heuresReel = parseFloat(calcHeures(shift.pointageDebut, shift.pointageFin, shift.pause)) || 0;
        }
      }

      totalPrev += heuresPrev;
      totalMois += heuresReel;

      jours.push({
        date: dateStr,
        jour: d,
        dayName: dayName.charAt(0).toUpperCase() + dayName.slice(1),
        isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6,
        shift,
        heuresPrev,
        heuresReel,
      });
    }

    // Calcul par semaine (pour voir dépassement 42h/sem)
    const semaines = [];
    let currentSemaine = { debut: null, fin: null, heures: 0, depassement: 0 };
    jours.forEach(j => {
      const d = new Date(j.date + 'T12:00:00');
      const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
      if (dayOfWeek === 1 || !currentSemaine.debut) {
        if (currentSemaine.debut) semaines.push(currentSemaine);
        currentSemaine = { debut: j.date, fin: j.date, heures: 0, depassement: 0 };
      }
      currentSemaine.fin = j.date;
      currentSemaine.heures += j.heuresReel;
    });
    if (currentSemaine.debut) semaines.push(currentSemaine);
    semaines.forEach(s => {
      s.depassement = Math.max(0, s.heures - heuresHebdo);
    });

    // Solde mensuel d'heures supplémentaires
    const heuresAttendues = semaines.reduce((sum, s) => sum + Math.min(s.heures, heuresHebdo) + s.depassement, 0);
    const soldeHeuresSupp = semaines.reduce((sum, s) => sum + s.depassement, 0);
    const soldeCumule = parseFloat(ccntSoldePrec || 0) + soldeHeuresSupp;

    return {
      emp,
      etab: etablissement,
      mois: ccntMonth,
      moisLabel: new Date(y, m - 1, 1).toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' }),
      heuresHebdo,
      heuresParJour,
      jours,
      semaines,
      totalPrev: totalPrev.toFixed(2),
      totalMois: totalMois.toFixed(2),
      soldeHeuresSupp: soldeHeuresSupp.toFixed(2),
      soldePrec: parseFloat(ccntSoldePrec || 0).toFixed(2),
      soldeCumule: soldeCumule.toFixed(2),
      vacances: ccntVacances,
      joursRepos: ccntJoursRepos,
      joursFeries: ccntJoursFeries,
    };
  };

  const exportCCNT = (action) => {
    const data = buildCCNTData();
    if (!data) { alertLegacy('Sélectionnez un employé.'); return; }
    const filename = `releve-ccnt-${data.emp.nom}-${data.mois}.pdf`;
    const title = `Relevé mensuel CCNT — ${data.emp.prenom} ${data.emp.nom} — ${data.moisLabel}`;
    setTimeout(() => {
      if (action === 'print') pdfUtils?.printElement('ccnt-print', title, { etablissement, orientation: 'portrait', noBrandHeader: true });
      else pdfUtils?.exportElementToPdf('ccnt-print', filename, { etablissement, title, orientation: 'portrait', noBrandHeader: true, fitOnePage: true });
    }, 100);
  };

  const allShifts = planningEtab.filter(s => s.date === pointageDate);

  // ── VUE MOBILE : liste par jour avec cartes
  const renderMobilePlanning = () => {
    return (
      <div style={pls.mobilePlanList} id="planning-print">
        <div style={pls.mobileTitle}>Planning — {horizon} semaine{horizon > 1 ? 's' : ''}</div>
        {DAYS.map(d => {
          const shiftsForDay = planningEtab.filter(s => s.date === d.date);
          return (
            <div key={d.date} style={pls.mobileDayBlock}>
              <div style={pls.mobileDayHeader}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{new Date(d.date + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: '2-digit', month: '2-digit' })}</span>
                {canWrite && <button style={pls.mobileDayAdd} onClick={() => openNewShift('', d.date)}>+</button>}
              </div>
              {shiftsForDay.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>Aucun horaire</div>
              ) : shiftsForDay.map(shift => {
                const emp = demoData.utilisateurs.find(u => u.id === shift.userId);
                const role = emp ? demoData.roles[emp.role] : null;
                const enPoste = shift.pointageDebut && !shift.pointageFin;
                return (
                  <div key={shift.id} style={pls.mobileShiftCard} onClick={() => { setSelectedShift(shift); setShowDetailModal(true); }}>
                    <div style={{ ...pls.empAvatar, background: role?.couleur || 'var(--text3)' }}>{emp?.avatar || '?'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{emp?.prenom} {emp?.nom}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                        {shift.typeShift === 'midi' ? '☀ ' : shift.typeShift === 'soir' ? '🌙 ' : ''}
                        {shift.debut}–{shift.fin} · {shift.poste}
                      </div>
                    </div>
                    <div style={{ ...pls.mobileBadge, background: enPoste ? 'var(--success-bg)' : shift.pointageDebut ? 'var(--info-bg)' : 'var(--warning-bg)', color: enPoste ? 'var(--success-text)' : shift.pointageDebut ? 'var(--info-text)' : 'var(--warning-text)' }}>
                      {enPoste ? 'En poste' : shift.pointageFin ? 'Terminé' : shift.pointageDebut ? 'Arrivé' : 'Non pointé'}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // ── VUE MOBILE POINTAGE
  const renderMobilePointage = () => {
    return (
      <div style={pls.mobilePlanList} id="pointage-print">
        <div style={pls.mobileTitle}>Pointages — {new Date(pointageDate + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        {allShifts.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>Aucun horaire ce jour.</div>}
        {(allShifts || []).map(shift => {
          const emp = demoData.utilisateurs.find(u => u.id === shift.userId);
          const role = emp ? demoData.roles[emp.role] : null;
          const heuresPrev = calcHeures(shift.debut, shift.fin, shift.pause);
          const heuresReel = shift.pointageDebut && shift.pointageFin ? calcHeures(shift.pointageDebut, shift.pointageFin, shift.pause) : null;
          const enPoste = shift.pointageDebut && !shift.pointageFin;
          return (
            <div key={shift.id} style={{ ...pls.mobileShiftCard, flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ ...pls.empAvatar, background: role?.couleur || 'var(--text3)' }}>{emp?.avatar || '?'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{emp?.prenom} {emp?.nom}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{shift.poste} · prévu {shift.debut}–{shift.fin}</div>
                </div>
                <div style={{ ...pls.mobileBadge, background: enPoste ? 'var(--success-bg)' : shift.pointageFin ? 'var(--info-bg)' : 'var(--warning-bg)', color: enPoste ? 'var(--success-text)' : shift.pointageFin ? 'var(--info-text)' : 'var(--warning-text)' }}>
                  {enPoste ? 'En poste' : shift.pointageFin ? 'Terminé' : 'Non pointé'}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10, fontSize: 11 }}>
                <div><div style={{ color: 'var(--text2)' }}>Arrivée</div><div style={{ fontWeight: 600 }}>{shift.pointageDebut || '—'}</div></div>
                <div><div style={{ color: 'var(--text2)' }}>Départ</div><div style={{ fontWeight: 600 }}>{shift.pointageFin || '—'}</div></div>
                <div><div style={{ color: 'var(--text2)' }}>Réel</div><div style={{ fontWeight: 600 }}>{heuresReel ? heuresReel + 'h' : '—'}</div></div>
              </div>
              {canPointShift(shift) && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }} className="no-print">
                  {!shift.pointageDebut && <button style={{ ...pls.pointBtn, fontSize: 12, padding: '8px 10px' }} onClick={() => pointerArrivee(shift)}>⏱ Arrivée</button>}
                  {shift.pointageDebut && !shift.pointageFin && <button style={{ ...pls.pointBtn, fontSize: 12, padding: '8px 10px' }} onClick={() => pointerDepart(shift)}>⏱ Départ</button>}
                  {shift.pointageDebut && shift.pointageFin && <button style={{ ...pls.ghostBtn, fontSize: 12, padding: '8px 10px' }} onClick={() => resetPointage(shift)}>Réinit.</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={pls.root}>
      {/* Barre d'onglets + actions */}
      <div style={pls.tabs} className="no-print">
        {[{ id: 'planning', label: 'Planning' }, { id: 'pointage', label: 'Pointage' }].map(t => (
          <button key={t.id} style={{ ...pls.tab, ...(activeTab === t.id ? pls.tabActive : {}) }} onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {activeTab === 'planning' ? (
          <>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={pls.datePicker} />
            {!isMobile && [1, 2, 3].map(n => <button key={n} style={{ ...pls.smallBtn, ...(horizon === n ? pls.smallBtnActive : {}) }} onClick={() => setHorizon(n)}>{n} sem.</button>)}
          </>
        ) : (
          <input type="date" value={pointageDate} onChange={e => setPointageDate(e.target.value)} style={pls.datePicker} />
        )}
      </div>

      {/* Actions secondaires */}
      <div style={pls.actionsBar} className="no-print">
        {canWrite && <button style={pls.addBtn} onClick={() => openNewShift()}>+ Ajouter horaire</button>}
        {canExport && activeTab === 'planning' && <button style={pls.exportBtn} onClick={openDuplicateDay}>📋 Dupliquer journée</button>}
        {canExport && activeTab === 'planning' && <button style={pls.exportBtn} onClick={openDuplicateWeek}>📅 Dupliquer semaine</button>}
        <div style={{ flex: 1 }} />
        {canExport && <button style={{...pls.exportBtn, background:'var(--accent-light)', borderColor:'var(--accent-bd)', color:'var(--accent)'}} onClick={openCCNTModal}>📋 Relevé CCNT</button>}
        {canExport && <button style={pls.exportBtn} onClick={() => pdfUtils?.printElement(activeTab === 'planning' ? 'planning-print' : 'pointage-print', activeTab === 'planning' ? 'Planning' : 'Pointage', { etablissement, orientation: activeTab === 'planning' && !isMobile ? 'landscape' : 'portrait' })}>🖨 Imprimer</button>}
        <button style={pls.exportBtn} onClick={() => pdfUtils?.exportElementToPdf(activeTab === 'planning' ? 'planning-print' : 'pointage-print', activeTab === 'planning' ? 'planning.pdf' : 'pointage.pdf', { etablissement, title: activeTab === 'planning' ? 'Planning' : 'Pointage', orientation: activeTab === 'planning' && !isMobile ? 'landscape' : 'portrait' })}>⬇ PDF</button>
      </div>

      {/* Contenu */}
      {activeTab === 'planning' ? (
        isMobile ? renderMobilePlanning() : (
          <div style={pls.card} id="planning-print">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-serif)' }}>Planning {horizon} semaine{horizon > 1 ? 's' : ''}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>À partir du {new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-CH')}</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ ...pls.grid, gridTemplateColumns: `200px repeat(${DAYS.length}, minmax(90px,1fr))`, minWidth: 200 + DAYS.length * 90 }}>
                <div style={pls.empColHeader} />
                {DAYS.map(d => <div key={d.date} style={pls.dayHeader}><div style={{ fontSize: 11, fontWeight: 700 }}>{d.label}</div></div>)}
                {employees.map(emp => {
                  const role = demoData.roles[emp.role];
                  const totalHours = weeklyHoursByUser[emp.id] || 0;
                  const monthHours = monthlyHoursByUser[emp.id] || 0;
                  const heuresContractSem = getHeuresContractuelles();
                  // Couleur du total semaine selon le contractuel CCNT
                  // < 80% = sous-emploi (gris), 80-100% = OK (bleu accent), >100% = heures supp (orange)
                  const weekRatio = heuresContractSem > 0 ? totalHours / heuresContractSem : 0;
                  const weekColor = weekRatio === 0 ? 'var(--text2)'
                                  : weekRatio < 0.8 ? 'var(--text2)'
                                  : weekRatio <= 1.0 ? 'var(--accent)'
                                  : 'var(--warning-strong)';
                  return (
                    <React.Fragment key={emp.id}>
                      <div style={pls.empCol}>
                        <div style={{ ...pls.empAvatar, background: role?.couleur }}>{emp.avatar}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={pls.empName}>{emp.prenom} {emp.nom}</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 2 }}>
                            <span
                              style={{ fontSize: 11, fontWeight: 700, color: weekColor }}
                              title={`Semaine : ${totalHours.toFixed(1)}h / contractuel ${heuresContractSem}h`}
                            >
                              {totalHours.toFixed(1)}h <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text2)' }}>sem</span>
                            </span>
                            <span
                              style={{ fontSize: 10, color: 'var(--text2)' }}
                              title={`Total ${currentMonthLabel}`}
                            >
                              · {monthHours.toFixed(0)}h <span style={{ fontSize: 9 }}>mois</span>
                            </span>
                          </div>
                        </div>
                      </div>
                      {DAYS.map(d => <div key={d.date} style={pls.dayCell}><ShiftCell key={`${emp.id}-${d.date}`} userId={emp.id} date={d.date} getShiftsDay={getShiftsDay} canWrite={canWrite} openNewShift={openNewShift} setSelectedShift={setSelectedShift} setShowDetailModal={setShowDetailModal} calcHeures={calcHeures}/></div>)}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        )
      ) : (
        isMobile ? renderMobilePointage() : (
          <div style={pls.card} id="pointage-print">
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-serif)', marginBottom: 10 }}>Pointages du {new Date(pointageDate + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
            <div style={pls.ptTable}>
              <div style={pls.ptHead}><span>Employé</span><span>Prévu</span><span>Arrivée</span><span>Départ</span><span>Durée</span><span>Statut</span></div>
              {allShifts.length === 0 && <div style={{ padding: 20, color: 'var(--text2)', fontSize: 13 }}>Aucun horaire pour cette date.</div>}
              {(allShifts || []).map(shift => {
                const emp = demoData.utilisateurs.find(u => u.id === shift.userId);
                const role = emp ? demoData.roles[emp.role] : null;
                const heuresPrev = calcHeures(shift.debut, shift.fin, shift.pause);
                const heuresReel = shift.pointageDebut && shift.pointageFin ? calcHeures(shift.pointageDebut, shift.pointageFin, shift.pause) : null;
                const ecart = heuresPrev && heuresReel ? (parseFloat(heuresReel) - parseFloat(heuresPrev)).toFixed(1) : null;
                const enPoste = shift.pointageDebut && !shift.pointageFin;
                return (
                  <div key={shift.id} style={pls.ptRow} onClick={() => { setSelectedShift(shift); setShowDetailModal(true); }}>
                    <div style={pls.ptEmp}><div style={{ ...pls.ptAvatar, background: role?.couleur }}>{emp?.avatar}</div><div><div style={pls.ptName}>{emp?.prenom} {emp?.nom}</div><div style={{ fontSize: 11, color: 'var(--text2)' }}>{shift.poste}</div></div></div>
                    <span style={pls.ptCell}>{shift.debut}–{shift.fin}<br /><span style={{ fontSize: 11, color: 'var(--text2)' }}>{heuresPrev}h prévues</span></span>
                    <span style={pls.ptCell}>{shift.pointageDebut || '—'}</span>
                    <span style={pls.ptCell}>{shift.pointageFin || (enPoste ? 'En cours' : '—')}</span>
                    <span style={pls.ptCell}>{heuresReel ? <>{heuresReel}h {ecart && <span style={{ color: parseFloat(ecart) > 0 ? 'var(--success-strong)' : 'var(--danger-strong)', fontSize: 11 }}>({ecart > 0 ? '+' : ''}{ecart}h)</span>}</> : '—'}</span>
                    <span style={pls.ptCell}><span style={{ ...pls.statusBadge, background: enPoste ? 'var(--success-bg)' : shift.pointageFin ? 'var(--info-bg)' : 'var(--warning-bg)', color: enPoste ? 'var(--success-text)' : shift.pointageFin ? 'var(--info-text)' : 'var(--warning-text)' }}>{enPoste ? 'En poste' : shift.pointageFin ? 'Terminé' : 'Non pointé'}</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* Modale détail */}
      {showDetailModal && selectedShift && (
        <div style={pls.overlay} onClick={() => setShowDetailModal(false)}>
          <div style={pls.modal} onClick={e => e.stopPropagation()}>
            <div style={pls.modalHeader}><div style={pls.modalTitle}>Détail de l'horaire</div><button style={pls.closeBtn} onClick={() => setShowDetailModal(false)}>✕</button></div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(() => {
                const emp = demoData.utilisateurs.find(u => u.id === selectedShift.userId);
                return <div><strong>Employé :</strong> {emp ? `${emp.prenom} ${emp.nom}` : '—'}</div>;
              })()}
              <div><strong>Date :</strong> {selectedShift.date}</div>
              <div><strong>Horaire :</strong> {selectedShift.debut}–{selectedShift.fin}</div>
              <div><strong>Poste :</strong> {selectedShift.poste || '—'}</div>
              <div><strong>Pause :</strong> {selectedShift.pause} min</div>
              <div><strong>Arrivée :</strong> {selectedShift.pointageDebut || '—'}</div>
              <div><strong>Départ :</strong> {selectedShift.pointageFin || '—'}</div>

              {canPointShift(selectedShift) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  {!selectedShift.pointageDebut && <button style={pls.pointBtn} onClick={() => pointerArrivee(selectedShift)}>⏱ Pointer arrivée</button>}
                  {selectedShift.pointageDebut && !selectedShift.pointageFin && <button style={pls.pointBtn} onClick={() => pointerDepart(selectedShift)}>⏱ Pointer départ</button>}
                  {(selectedShift.pointageDebut || selectedShift.pointageFin) && canWrite && <button style={pls.ghostBtn} onClick={() => resetPointage(selectedShift)}>Réinit. pointage</button>}
                </div>
              )}

              {canWrite && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button style={{ ...pls.addBtn, flex: 1 }} onClick={() => openEditShift(selectedShift)}>Modifier</button>
                    <button style={{ ...pls.exportBtn, color: 'var(--danger-strong)', borderColor: 'var(--danger-bd)', flex: 1 }} onClick={() => deleteShift(selectedShift.id)}>Supprimer</button>
                  </div>
                  <button
                    style={{ ...pls.exportBtn, marginTop: 6 }}
                    onClick={() => openDemult(selectedShift)}
                    title="Copier cet horaire sur plusieurs jours et/ou plusieurs employés"
                  >⚡ Démultiplier sur plusieurs jours/employés</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale ajout/édition */}
      {showEditModal && editForm && (
        <div style={pls.overlay} onClick={() => setShowEditModal(false)}>
          <div style={pls.modal} onClick={e => e.stopPropagation()}>
            <div style={pls.modalHeader}><div style={pls.modalTitle}>{editForm.id ? 'Modifier l\'horaire' : 'Nouvel horaire'}</div><button style={pls.closeBtn} onClick={() => setShowEditModal(false)}>✕</button></div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={pls.fieldLabel}>Employé</label>
                <select style={pls.fieldInput} value={editForm.userId} onChange={e => setEditForm({ ...editForm, userId: e.target.value })}>
                  <option value="">— Sélectionner —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom} — {demoData.roles[e.role]?.label}</option>)}
                </select>
              </div>
              <div>
                <label style={pls.fieldLabel}>Type de service</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { id: 'simple', label: 'Journée continue', icon: '' },
                    { id: 'midi', label: 'Service midi', icon: '☀' },
                    { id: 'soir', label: 'Service soir', icon: '🌙' },
                  ].map(t => (
                    <button key={t.id} type="button"
                      onClick={() => {
                        const defaults = t.id === 'midi' ? { debut: '10:00', fin: '15:00' }
                                       : t.id === 'soir' ? { debut: '17:00', fin: '23:00' }
                                       : { debut: '09:00', fin: '17:00' };
                        setEditForm({ ...editForm, typeShift: t.id, ...defaults });
                      }}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 8, fontSize: 12,
                        background: (editForm.typeShift || 'simple') === t.id ? (t.id === 'midi' ? 'var(--warning-bg)' : t.id === 'soir' ? 'var(--info-bg)' : 'var(--success-bg)') : 'var(--surface)',
                        border: '1px solid',
                        borderColor: (editForm.typeShift || 'simple') === t.id ? (t.id === 'midi' ? 'var(--warning-bd)' : t.id === 'soir' ? 'var(--info-bd)' : 'var(--success-bd)') : 'var(--border)',
                        color: (editForm.typeShift || 'simple') === t.id ? (t.id === 'midi' ? 'var(--warning-text)' : t.id === 'soir' ? 'var(--info-text)' : 'var(--success-text)') : 'var(--text2)',
                        fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
                      }}>
                      {t.icon && <span style={{marginRight:4}}>{t.icon}</span>}{t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10 }}>
                <div><label style={pls.fieldLabel}>Date</label><input type="date" style={pls.fieldInput} value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })} /></div>
                <div><label style={pls.fieldLabel}>Début</label><input type="time" style={pls.fieldInput} value={editForm.debut} onChange={e => setEditForm({ ...editForm, debut: e.target.value })} /></div>
                <div><label style={pls.fieldLabel}>Fin</label><input type="time" style={pls.fieldInput} value={editForm.fin} onChange={e => setEditForm({ ...editForm, fin: e.target.value })} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={pls.fieldLabel}>Pause (min)</label><input type="number" min="0" step="5" style={pls.fieldInput} value={editForm.pause} onChange={e => setEditForm({ ...editForm, pause: Number(e.target.value) })} /></div>
                <div><label style={pls.fieldLabel}>Statut</label><select style={pls.fieldInput} value={editForm.statut} onChange={e => setEditForm({ ...editForm, statut: e.target.value })}>
                  <option value="confirmé">Confirmé</option><option value="modifié">Modifié</option><option value="en attente">En attente</option>
                </select></div>
              </div>
              <div><label style={pls.fieldLabel}>Poste / Tâche</label><input type="text" style={pls.fieldInput} value={editForm.poste} placeholder="Ex : Cuisine, Salle…" onChange={e => setEditForm({ ...editForm, poste: e.target.value })} /></div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>Durée : <strong>{calcHeures(editForm.debut, editForm.fin, editForm.pause) || '—'}h</strong></div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button style={pls.exportBtn} onClick={() => setShowEditModal(false)}>Annuler</button>
                <button style={pls.addBtn} onClick={saveShift}>{editForm.id ? 'Enregistrer' : 'Créer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════ MODALE DUPLIQUER ═════════ */}
      {/* Mode 'day' = duplication multi-employés × multi-dates ; mode 'week' = semaine complète vers semaine */}
      {duplicateMode === 'week' && (
        <div style={pls.overlay} onClick={() => setDuplicateMode(null)}>
          <div style={{ ...pls.modal, width: 480 }} onClick={e => e.stopPropagation()}>
            <div style={pls.modalHeader}>
              <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>Dupliquer une semaine complète</div>
              <button style={pls.closeBtn} onClick={() => setDuplicateMode(null)}>✕</button>
            </div>
            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={pls.fieldLabel}>Lundi de la semaine source</label>
                  <input type="date" style={pls.fieldInput} value={duplicateSource.sourceDate}
                    onChange={e => setDuplicateSource({ ...duplicateSource, sourceDate: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={pls.fieldLabel}>Lundi de la semaine cible</label>
                  <input type="date" style={pls.fieldInput} value={duplicateSource.targetDate}
                    onChange={e => setDuplicateSource({ ...duplicateSource, targetDate: e.target.value })} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--bg)', padding: 10, borderRadius: 6, lineHeight: 1.5 }}>
                💡 Tous les horaires de tous les employés de la semaine source (7 jours à partir du lundi choisi) seront copiés vers la semaine cible. Les pointages ne sont pas copiés.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button style={pls.exportBtn} onClick={() => setDuplicateMode(null)}>Annuler</button>
                <button style={pls.addBtn} onClick={doDuplicateWeek}>Dupliquer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════ MODALE DUPLIQUER JOURNÉE — Multi-employés × Multi-dates ═════════ */}
      {duplicateMode === 'day' && (() => {
        const srcEmp = employees.find(e => e.id === duplicateSource.userId);
        const srcShiftsCount = duplicateSource.userId && duplicateSource.sourceDate
          ? planningEtab.filter(s => s.userId === duplicateSource.userId && s.date === duplicateSource.sourceDate).length
          : 0;
        const targetDates = buildDupTargetDates();
        // Conflits par paire (userId × date) pour affichage
        const conflicts = [];
        dupTargetUserIds.forEach(uid => {
          targetDates.forEach(date => {
            if (uid === duplicateSource.userId && date === duplicateSource.sourceDate) return;
            const ex = planningEtab.filter(s => s.userId === uid && s.date === date);
            if (ex.length > 0) {
              const emp = employees.find(e => e.id === uid);
              conflicts.push({ uid, date, count: ex.length, empName: emp ? `${emp.prenom} ${emp.nom}` : uid });
            }
          });
        });
        const allUsersSelected = employees.length > 0 && employees.every(e => dupTargetUserIds.has(e.id));
        const toggleUser = (uid) => {
          setDupTargetUserIds(prev => {
            const next = new Set(prev);
            if (next.has(uid)) next.delete(uid); else next.add(uid);
            return next;
          });
        };
        const toggleWeekday = (idx) => {
          setDupRangeWeekdays(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
          });
        };
        // Compteur final = (couples (user, date) - exclusion source) × shifts source
        const pairCount = Array.from(dupTargetUserIds).reduce((acc, uid) => {
          return acc + targetDates.filter(d => !(uid === duplicateSource.userId && d === duplicateSource.sourceDate)).length;
        }, 0);
        const totalToCreate = pairCount * srcShiftsCount;
        const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

        return (
          <div style={pls.overlay} onClick={() => !dupSaving && setDuplicateMode(null)}>
            <div style={{ ...pls.modal, maxWidth: 720, width: '94vw', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={pls.modalHeader}>
                <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>📋 Dupliquer une journée vers plusieurs employés</div>
                <button style={pls.closeBtn} onClick={() => !dupSaving && setDuplicateMode(null)}>✕</button>
              </div>
              <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* ── Source ── */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Journée source</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <label style={pls.fieldLabel}>Employé source</label>
                      <select style={pls.fieldInput} value={duplicateSource.userId}
                        onChange={e => {
                          const newUid = e.target.value;
                          setDuplicateSource(prev => ({ ...prev, userId: newUid }));
                          // Si l'ancien userId était pré-coché, on le déplace vers le nouveau
                          setDupTargetUserIds(prev => {
                            const next = new Set(prev);
                            if (duplicateSource.userId) next.delete(duplicateSource.userId);
                            if (newUid) next.add(newUid);
                            return next;
                          });
                        }}>
                        <option value="">— Sélectionner —</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.prenom} {emp.nom}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: '1 1 150px' }}>
                      <label style={pls.fieldLabel}>Date source</label>
                      <input type="date" style={pls.fieldInput} value={duplicateSource.sourceDate}
                        onChange={e => setDuplicateSource(prev => ({ ...prev, sourceDate: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: srcShiftsCount > 0 ? 'var(--text)' : 'var(--text2)' }}>
                    {srcEmp && srcShiftsCount > 0
                      ? <>📌 <strong>{srcShiftsCount}</strong> horaire{srcShiftsCount > 1 ? 's' : ''} trouvé{srcShiftsCount > 1 ? 's' : ''} pour {srcEmp.prenom} {srcEmp.nom} à cette date.</>
                      : <span style={{ fontStyle: 'italic' }}>Aucun horaire à dupliquer pour ce couple employé/date.</span>}
                  </div>
                </div>

                {/* ── Date(s) cible(s) ── */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={pls.fieldLabel}>Date(s) cible(s) ({targetDates.length} jour{targetDates.length > 1 ? 's' : ''})</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={dupUseRange} onChange={e => setDupUseRange(e.target.checked)} />
                      Plage de dates
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 150px' }}>
                      <label style={{ ...pls.fieldLabel, fontSize: 10 }}>{dupUseRange ? 'Du' : 'Date'}</label>
                      <input type="date" style={pls.fieldInput} value={duplicateSource.targetDate}
                        onChange={e => setDuplicateSource(prev => ({ ...prev, targetDate: e.target.value }))} />
                    </div>
                    {dupUseRange && (
                      <div style={{ flex: '1 1 150px' }}>
                        <label style={{ ...pls.fieldLabel, fontSize: 10 }}>Au</label>
                        <input type="date" style={pls.fieldInput} value={dupRangeEnd}
                          onChange={e => setDupRangeEnd(e.target.value)} />
                      </div>
                    )}
                  </div>
                  {dupUseRange && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Jours concernés dans la plage :</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {WEEKDAY_LABELS.map((lbl, idx) => {
                          const checked = dupRangeWeekdays.has(idx);
                          return (
                            <button key={lbl} type="button"
                              onClick={() => toggleWeekday(idx)}
                              style={{
                                padding: '5px 10px', fontSize: 11, fontWeight: 700,
                                border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                                background: checked ? 'var(--accent-light)' : 'var(--surface)',
                                color: checked ? 'var(--accent)' : 'var(--text2)',
                                borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)',
                              }}>
                              {lbl}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Employés cibles ── */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={pls.fieldLabel}>Employés cibles ({dupTargetUserIds.size} sélectionné{dupTargetUserIds.size > 1 ? 's' : ''})</label>
                    <button type="button" style={{ ...pls.exportBtn, fontSize: 11, padding: '4px 8px' }}
                      onClick={() => {
                        if (allUsersSelected) setDupTargetUserIds(new Set());
                        else setDupTargetUserIds(new Set(employees.map(e => e.id)));
                      }}>
                      {allUsersSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {employees.map(emp => {
                      const role = demoData.roles[emp.role];
                      const isSrc = emp.id === duplicateSource.userId;
                      const checked = dupTargetUserIds.has(emp.id);
                      // Conflit pour cet employé sur au moins une date cible ?
                      const hasConflict = conflicts.some(c => c.uid === emp.id);
                      return (
                        <label key={emp.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                            border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: 6, fontSize: 12, cursor: 'pointer',
                            background: checked ? 'var(--accent-light)' : 'var(--surface)',
                          }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleUser(emp.id)} />
                          <div style={{ ...pls.empAvatar, background: role?.couleur, width: 22, height: 22, fontSize: 9 }}>{emp.avatar}</div>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {emp.prenom} {emp.nom}
                            <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 4 }}>{role?.label}</span>
                          </span>
                          {isSrc && <span style={{ fontSize: 9, color: 'var(--text2)' }}>(src)</span>}
                          {checked && hasConflict && <span title="Conflit détecté sur au moins une date cible" style={{ fontSize: 11, color: 'var(--warning-text)' }}>⚠</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* ── Gestion des conflits ── */}
                {conflicts.length > 0 && (
                  <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning-text)', marginBottom: 8 }}>
                      ⚠ {conflicts.length} conflit{conflicts.length > 1 ? 's' : ''} détecté{conflicts.length > 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', maxHeight: 80, overflowY: 'auto', marginBottom: 10, lineHeight: 1.5 }}>
                      {conflicts.slice(0, 8).map((c, i) => (
                        <div key={i}>• <strong>{c.empName}</strong> a déjà {c.count} horaire(s) le {new Date(c.date + 'T12:00:00').toLocaleDateString('fr-CH')}</div>
                      ))}
                      {conflicts.length > 8 && <div>… et {conflicts.length - 8} autres</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text)', flexWrap: 'wrap' }}>
                      {[
                        { v: 'replace', label: 'Écraser', desc: 'Remplace les horaires existants' },
                        { v: 'skip', label: 'Ignorer', desc: 'Ne touche pas aux employés en conflit' },
                        { v: 'add', label: 'Ajouter en plus', desc: 'Crée en plus des existants' },
                      ].map(opt => (
                        <label key={opt.v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input type="radio" name="dupConflictMode" value={opt.v}
                            checked={dupConflictMode === opt.v}
                            onChange={() => setDupConflictMode(opt.v)} />
                          <span><strong>{opt.label}</strong> <span style={{ color: 'var(--text2)', fontSize: 11 }}>— {opt.desc}</span></span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Footer ── */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, fontSize: 12, color: totalToCreate > 0 ? 'var(--text)' : 'var(--text2)' }}>
                    {totalToCreate > 0
                      ? <><strong>{totalToCreate}</strong> horaire{totalToCreate > 1 ? 's' : ''} vers <strong>{dupTargetUserIds.size}</strong> employé{dupTargetUserIds.size > 1 ? 's' : ''} sur <strong>{targetDates.length}</strong> jour{targetDates.length > 1 ? 's' : ''}</>
                      : 'Configuration incomplète'}
                  </span>
                  <button style={pls.exportBtn} onClick={() => setDuplicateMode(null)} disabled={dupSaving}>Annuler</button>
                  <button
                    style={{ ...pls.addBtn, opacity: totalToCreate === 0 || dupSaving ? 0.5 : 1 }}
                    onClick={doDuplicateDay}
                    disabled={totalToCreate === 0 || dupSaving}>
                    {dupSaving ? '⏳ Création…' : `Dupliquer (${totalToCreate})`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═════════ MODALE RELEVÉ CCNT ═════════ */}
      {showCCNTModal && (
        <div style={pls.overlay} onClick={() => setShowCCNTModal(false)}>
          <div style={{ ...pls.modal, width: 560 }} onClick={e => e.stopPropagation()}>
            <div style={pls.modalHeader}>
              <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>Générer un relevé CCNT</div>
              <button style={pls.closeBtn} onClick={() => setShowCCNTModal(false)}>✕</button>
            </div>
            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--warning-text)', lineHeight: 1.5 }}>
                Document conforme aux <strong>articles 15 &amp; 21 CCNT</strong> hôtellerie-restauration suisse. À signer <strong>chaque mois</strong> par le collaborateur et l'employeur, à conserver <strong>5 ans</strong>.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={pls.fieldLabel}>Collaborateur</label>
                  <select style={pls.fieldInput} value={ccntEmployeeId || ''} onChange={e => setCcntEmployeeId(e.target.value)}>
                    <option value="">— Choisir —</option>
                    {employees.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label style={pls.fieldLabel}>Mois</label>
                  <input type="month" style={pls.fieldInput} value={ccntMonth} onChange={e => setCcntMonth(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={pls.fieldLabel}>Solde d'heures supp. reporté du mois précédent (h)</label>
                <input type="number" step="0.25" style={pls.fieldInput} value={ccntSoldePrec} onChange={e => setCcntSoldePrec(parseFloat(e.target.value) || 0)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={pls.fieldLabel}>Vacances dues (jours)</label>
                  <input type="number" step="0.5" style={pls.fieldInput} value={ccntVacances.solde} onChange={e => setCcntVacances({ ...ccntVacances, solde: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label style={pls.fieldLabel}>Vacances prises ce mois (jours)</label>
                  <input type="number" step="0.5" style={pls.fieldInput} value={ccntVacances.pris} onChange={e => setCcntVacances({ ...ccntVacances, pris: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label style={pls.fieldLabel}>Jours de repos dus</label>
                  <input type="number" step="0.5" style={pls.fieldInput} value={ccntJoursRepos.dus} onChange={e => setCcntJoursRepos({ ...ccntJoursRepos, dus: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label style={pls.fieldLabel}>Jours de repos pris</label>
                  <input type="number" step="0.5" style={pls.fieldInput} value={ccntJoursRepos.pris} onChange={e => setCcntJoursRepos({ ...ccntJoursRepos, pris: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label style={pls.fieldLabel}>Jours fériés dus</label>
                  <input type="number" step="0.5" style={pls.fieldInput} value={ccntJoursFeries.dus} onChange={e => setCcntJoursFeries({ ...ccntJoursFeries, dus: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label style={pls.fieldLabel}>Jours fériés pris</label>
                  <input type="number" step="0.5" style={pls.fieldInput} value={ccntJoursFeries.pris} onChange={e => setCcntJoursFeries({ ...ccntJoursFeries, pris: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button style={pls.exportBtn} onClick={() => setShowCCNTModal(false)}>Annuler</button>
                <button style={pls.exportBtn} onClick={() => exportCCNT('print')}>🖨 Imprimer</button>
                <button style={pls.addBtn} onClick={() => exportCCNT('pdf')}>⬇ Exporter en PDF</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════ ZONE D'IMPRESSION CCNT (cachée, utilisée par PDFUtils) ═════════ */}
      {(() => {
        const data = buildCCNTData();
        if (!data) return null;
        return (
          <div id="ccnt-print" style={{ position: 'absolute', left: -99999, top: 0, width: '180mm', background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif', fontSize: 10 }}>
            {/* Bloc 1 : identité */}
            <div style={{ border: '1.5px solid #000', padding: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 6, textAlign: 'center' }}>
                CONTRÔLE DE LA DURÉE DU TRAVAIL
              </div>
              <div style={{ fontSize: 10, textAlign: 'center', marginBottom: 10, fontStyle: 'italic' }}>
                Conformément aux articles 15 &amp; 21 CCNT hôtellerie-restauration suisse
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10 }}>
                <div><strong>Établissement :</strong> {data.etab?.nom || '—'}</div>
                <div><strong>Adresse :</strong> {data.etab?.adresse || '—'}</div>
                <div><strong>Collaborateur :</strong> {data.emp.prenom} {data.emp.nom}</div>
                <div><strong>Fonction :</strong> {data.emp.poste || demoData.roles[data.emp.role]?.label || '—'}</div>
                <div><strong>Mois :</strong> {data.moisLabel}</div>
                <div><strong>Durée hebdomadaire contractuelle :</strong> {data.heuresHebdo} h</div>
              </div>
            </div>

            {/* Bloc 2 : tableau journalier */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, marginBottom: 10 }}>
              <thead>
                <tr style={{ background: '#e5e5e5' }}>
                  <th style={ccntCell}>Date</th>
                  <th style={ccntCell}>Jour</th>
                  <th style={ccntCell}>Arrivée</th>
                  <th style={ccntCell}>Départ</th>
                  <th style={ccntCell}>Pause (min)</th>
                  <th style={ccntCell}>Heures prévues</th>
                  <th style={ccntCell}>Heures effectives</th>
                  <th style={ccntCell}>Observations</th>
                </tr>
              </thead>
              <tbody>
                {data.jours.map(j => (
                  <tr key={j.date} style={{ background: j.isWeekend ? '#f8f8f8' : '#fff' }}>
                    <td style={ccntCell}>{String(j.jour).padStart(2, '0')}</td>
                    <td style={ccntCell}>{j.dayName}</td>
                    <td style={ccntCell}>{j.shift?.pointageDebut || j.shift?.debut || ''}</td>
                    <td style={ccntCell}>{j.shift?.pointageFin || j.shift?.fin || ''}</td>
                    <td style={ccntCell}>{j.shift ? (j.shift.pause || 0) : ''}</td>
                    <td style={{ ...ccntCell, textAlign: 'right' }}>{j.heuresPrev ? j.heuresPrev.toFixed(2) : ''}</td>
                    <td style={{ ...ccntCell, textAlign: 'right', fontWeight: 600 }}>{j.heuresReel ? j.heuresReel.toFixed(2) : ''}</td>
                    <td style={ccntCell}></td>
                  </tr>
                ))}
                <tr style={{ background: '#ddd', fontWeight: 'bold' }}>
                  <td style={ccntCell} colSpan={5}>TOTAL DU MOIS</td>
                  <td style={{ ...ccntCell, textAlign: 'right' }}>{data.totalPrev} h</td>
                  <td style={{ ...ccntCell, textAlign: 'right' }}>{data.totalMois} h</td>
                  <td style={ccntCell}></td>
                </tr>
              </tbody>
            </table>

            {/* Bloc 3 : récapitulatif hebdomadaire (détection dépassement 42h/sem) */}
            <div style={{ border: '1px solid #000', padding: 8, marginBottom: 10, fontSize: 9 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Récapitulatif hebdomadaire</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f0f0f0' }}>
                    <th style={ccntCell}>Semaine</th>
                    <th style={ccntCell}>Heures effectives</th>
                    <th style={ccntCell}>Dépassement {data.heuresHebdo}h</th>
                  </tr>
                </thead>
                <tbody>
                  {data.semaines.map((s, i) => (
                    <tr key={i}>
                      <td style={ccntCell}>Du {s.debut} au {s.fin}</td>
                      <td style={{ ...ccntCell, textAlign: 'right' }}>{s.heures.toFixed(2)} h</td>
                      <td style={{ ...ccntCell, textAlign: 'right', color: s.depassement > 0 ? '#c00' : '#000', fontWeight: s.depassement > 0 ? 700 : 400 }}>{s.depassement > 0 ? '+' + s.depassement.toFixed(2) + ' h' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bloc 4 : soldes */}
            <div style={{ border: '1px solid #000', padding: 8, marginBottom: 10, fontSize: 10 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Communication mensuelle des soldes (art. 15 ch. 5 CCNT)</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ ...ccntCell, width: '50%' }}>Solde d'heures supp. reporté du mois précédent</td>
                    <td style={{ ...ccntCell, textAlign: 'right' }}>{data.soldePrec} h</td>
                  </tr>
                  <tr>
                    <td style={ccntCell}>Heures supplémentaires effectuées ce mois</td>
                    <td style={{ ...ccntCell, textAlign: 'right' }}>+{data.soldeHeuresSupp} h</td>
                  </tr>
                  <tr style={{ background: '#f0f0f0', fontWeight: 'bold' }}>
                    <td style={ccntCell}>Solde cumulé à fin {data.moisLabel}</td>
                    <td style={{ ...ccntCell, textAlign: 'right' }}>{data.soldeCumule} h</td>
                  </tr>
                  <tr><td style={ccntCell}>Vacances — solde dû</td><td style={{ ...ccntCell, textAlign: 'right' }}>{data.vacances.solde} j</td></tr>
                  <tr><td style={ccntCell}>Vacances — prises ce mois</td><td style={{ ...ccntCell, textAlign: 'right' }}>{data.vacances.pris} j</td></tr>
                  <tr><td style={ccntCell}>Jours de repos dus / pris</td><td style={{ ...ccntCell, textAlign: 'right' }}>{data.joursRepos.dus} j / {data.joursRepos.pris} j</td></tr>
                  <tr><td style={ccntCell}>Jours fériés dus / pris</td><td style={{ ...ccntCell, textAlign: 'right' }}>{data.joursFeries.dus} j / {data.joursFeries.pris} j</td></tr>
                </tbody>
              </table>
            </div>

            {/* Bloc 5 : zone signatures */}
            <div style={{ border: '1.5px solid #000', padding: 10, fontSize: 10 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Attestation et signatures</div>
              <div style={{ marginBottom: 10, fontSize: 9, lineHeight: 1.5 }}>
                Le/la soussigné(e) atteste avoir pris connaissance du présent décompte et confirme l'exactitude des heures enregistrées ci-dessus. Conformément à l'art. 21 ch. 4 CCNT, à défaut de signature mensuelle, les enregistrements personnels du collaborateur feront foi.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 14 }}>
                <div>
                  <div style={{ borderBottom: '1px solid #000', height: 40 }}></div>
                  <div style={{ fontSize: 9, marginTop: 3 }}><strong>Signature du collaborateur</strong></div>
                  <div style={{ fontSize: 9, marginTop: 8 }}>Date : _____________________</div>
                </div>
                <div>
                  <div style={{ borderBottom: '1px solid #000', height: 40 }}></div>
                  <div style={{ fontSize: 9, marginTop: 3 }}><strong>Signature et timbre de l'employeur</strong></div>
                  <div style={{ fontSize: 9, marginTop: 8 }}>Date : _____________________</div>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 8, color: '#666', marginTop: 8, textAlign: 'center' }}>
              Document à conserver 5 ans minimum — Art. 73 OLT 1 / Art. 21 CCNT
            </div>
          </div>
        );
      })()}

      {/* ═══ Modale Démultiplication d'un horaire (multi-jours × multi-employés) ═══ */}
      {demultModal && (() => {
        const src = demultModal.sourceShift;
        const srcEmp = demoData.utilisateurs.find(u => u.id === src.userId);
        const heuresSrc = calcHeures(src.debut, src.fin, src.pause);
        const previewCount = demultDates.size * demultUserIds.size;
        // On filtre l'auto-cible (même user + même date que la source) du compte
        const autoExcluded = (demultUserIds.has(src.userId) && demultDates.has(src.date)) ? 1 : 0;
        const realPreview = previewCount - autoExcluded;
        const toggleDate = (date) => {
          setDemultDates(prev => {
            const next = new Set(prev);
            if (next.has(date)) next.delete(date); else next.add(date);
            return next;
          });
        };
        const toggleUser = (uid) => {
          setDemultUserIds(prev => {
            const next = new Set(prev);
            if (next.has(uid)) next.delete(uid); else next.add(uid);
            return next;
          });
        };
        const allDatesSelected = DAYS.length > 0 && DAYS.every(d => demultDates.has(d.date));
        const allUsersSelected = employees.length > 0 && employees.every(e => demultUserIds.has(e.id));
        return (
          <div style={pls.overlay} onClick={closeDemult}>
            <div style={{ ...pls.modal, maxWidth: 720, width: '94vw' }} onClick={e => e.stopPropagation()}>
              <div style={pls.modalHeader}>
                <div style={pls.modalTitle}>⚡ Démultiplier l'horaire</div>
                <button style={pls.closeBtn} onClick={closeDemult}>✕</button>
              </div>
              <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Récapitulatif source */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Horaire à démultiplier</div>
                  <div style={{ fontSize: 13 }}>
                    <strong>{srcEmp ? `${srcEmp.prenom} ${srcEmp.nom}` : '—'}</strong> ·{' '}
                    {src.date} · {src.debut}–{src.fin} · pause {src.pause || 0} min · <strong>{heuresSrc}h</strong>
                    {src.poste && <span style={{ color: 'var(--text2)' }}> · {src.poste}</span>}
                  </div>
                </div>

                {/* Sélection JOURS */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={pls.fieldLabel}>Jours cibles ({demultDates.size} sélectionnés)</label>
                    <button
                      style={{ ...pls.exportBtn, fontSize: 11, padding: '4px 8px' }}
                      onClick={() => {
                        if (allDatesSelected) setDemultDates(new Set());
                        else setDemultDates(new Set(DAYS.map(d => d.date)));
                      }}
                    >{allDatesSelected ? 'Tout désélectionner' : 'Tout sélectionner'}</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
                    {DAYS.map(d => {
                      const isSrc = d.date === src.date;
                      const checked = demultDates.has(d.date);
                      return (
                        <label
                          key={d.date}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px',
                            border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: 6, fontSize: 11, cursor: 'pointer',
                            background: checked ? 'var(--accent-light)' : 'var(--surface)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDate(d.date)}
                          />
                          <span style={{ flex: 1 }}>
                            {d.label}
                            {isSrc && <span style={{ fontSize: 9, color: 'var(--text2)', marginLeft: 4 }}>(src)</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Sélection EMPLOYÉS */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={pls.fieldLabel}>Employés cibles ({demultUserIds.size} sélectionnés)</label>
                    <button
                      style={{ ...pls.exportBtn, fontSize: 11, padding: '4px 8px' }}
                      onClick={() => {
                        if (allUsersSelected) setDemultUserIds(new Set());
                        else setDemultUserIds(new Set(employees.map(e => e.id)));
                      }}
                    >{allUsersSelected ? 'Tout désélectionner' : 'Tout sélectionner'}</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {employees.map(emp => {
                      const role = demoData.roles[emp.role];
                      const isSrc = emp.id === src.userId;
                      const checked = demultUserIds.has(emp.id);
                      return (
                        <label
                          key={emp.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                            border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: 6, fontSize: 12, cursor: 'pointer',
                            background: checked ? 'var(--accent-light)' : 'var(--surface)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleUser(emp.id)}
                          />
                          <div style={{ ...pls.empAvatar, background: role?.couleur, width: 22, height: 22, fontSize: 9 }}>{emp.avatar}</div>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {emp.prenom} {emp.nom}
                            {isSrc && <span style={{ fontSize: 9, color: 'var(--text2)', marginLeft: 4 }}>(src)</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Avertissement */}
                <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 6, padding: 10, fontSize: 11, color: 'var(--warning-text)' }}>
                  ⚠ Si un employé a déjà un horaire à une date sélectionnée, il sera <strong>remplacé</strong> par celui-ci.
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, fontSize: 12, color: realPreview > 0 ? 'var(--text)' : 'var(--text2)' }}>
                    {realPreview > 0
                      ? <><strong>{realPreview}</strong> horaire{realPreview > 1 ? 's' : ''} sera{realPreview > 1 ? 'ont' : ''} créé{realPreview > 1 ? 's' : ''}</>
                      : 'Aucun horaire à créer'}
                  </span>
                  <button style={pls.exportBtn} onClick={closeDemult} disabled={demultSaving}>Annuler</button>
                  <button
                    style={{ ...pls.addBtn, opacity: realPreview === 0 || demultSaving ? 0.5 : 1 }}
                    onClick={saveDemult}
                    disabled={realPreview === 0 || demultSaving}
                  >
                    {demultSaving ? '⏳ Création…' : `⚡ Démultiplier (${realPreview})`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Planning;
