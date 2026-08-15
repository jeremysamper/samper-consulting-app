import React from 'react';
import { getDemoData, canManageModule } from '../../data/demoData.js';
import { alertLegacy, confirmLegacy, getBrowserWindow, notifyLegacy, readLegacyStorage } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import ShiftCell from './ShiftCell.jsx';
import { ccnt, ccntCell, pls } from './Planning.styles.js';
import { userDisplay } from '../../utils/userDisplay.js';
import { dbService } from '../../services/dbService.js';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { punchOnlineOrQueue } from '../../services/offline/punchSync.js';
import { useResumeRefresh } from '../../hooks/useResumeRefresh.js';

// ─────────────────────────────────────────────────────
// PLANNING & POINTAGE - Module unifié, par établissement, responsive
// ─────────────────────────────────────────────────────

// Famille de poste, pour le résumé de couverture de la vue mobile par jour.
// La couleur visuelle d'un shift reste portée par le rôle de l'employé
// (demoData.roles[role].couleur) - c'est la seule donnée couleur fiable en base.
const roleFamily = (role) => {
  if (role === 'serveur') return 'salle';
  if (role === 'cuisinier' || role === 'resp_cuisine') return 'cuisine';
  return 'autre';
};

// Détection de chevauchement horaire entre deux créneaux ('HH:MM').
// Un service midi et un service soir ne se chevauchent pas → le service coupé
// (double shift) reste possible ; seuls les créneaux qui se recouvrent réellement
// sont traités comme un conflit. Bornes adjacentes (fin = début) = pas de conflit.
const timeToMin = (t) => {
  const [h, m] = (t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const shiftsOverlap = (aDebut, aFin, bDebut, bFin) => {
  const aS = timeToMin(aDebut), aE = timeToMin(aFin);
  const bS = timeToMin(bDebut), bE = timeToMin(bFin);
  return aS < bE && bS < aE;
};

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
  const [mobileDate, setMobileDate] = React.useState(todayStr); // mobile : l'unité de lecture est le jour
  const [horizon, setHorizon] = React.useState(1);
  const [showDetailModal, setShowDetailModal] = React.useState(false);
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [selectedShift, setSelectedShift] = React.useState(null);
  const [editForm, setEditForm] = React.useState(null);
  const [planning, setPlanning] = React.useState([]); // shifts chargés depuis Supabase
  const [loading, setLoading] = React.useState(true);
  // Refetch des shifts de l'effet courant, rejoué au réveil de l'appareil.
  const reloadShiftsRef = React.useRef(null);
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
  const canWrite = !!perms.planning && canManageModule(user.role, 'planning');
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

    // Lecture stricte : une erreur remonte au lieu de rendre []. Le planning
    // déjà affiché n'est donc jamais remplacé par un écran vide (réveil de
    // tablette, réseau coupé) - sans shift affiché, plus aucun bouton de
    // pointage. Planning est le seul module qui écoute le realtime payload par
    // payload : il ne bénéficie pas du rejeu automatique de subscribeReload, on
    // le rebranche donc explicitement sur le réveil (useResumeRefresh).
    const reloadShifts = async () => {
      try {
        const rows = await legacySB.db.listShifts(etabId, { strict: true });
        if (!mounted) return;
        setPlanning(rows.map(r => legacySB.db.mapShiftFromDB(r)));
      } catch (err) {
        console.error('[Planning] load', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    reloadShiftsRef.current = reloadShifts;
    reloadShifts();

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
      if (reloadShiftsRef.current === reloadShifts) reloadShiftsRef.current = null;
      if (unsubscribe) unsubscribe();
    };
  }, [etabId]);

  useResumeRefresh(React.useCallback(() => {
    reloadShiftsRef.current && reloadShiftsRef.current();
  }, []));

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
  // Semaine = total des 7 jours affichés (DAYS) - change avec la navigation hebdo.
  // Mois = total du mois calendaire de selectedDate - change avec la navigation hebdo.
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

  // Manipulation directe : un clic sur une cellule vide ouvre « + Ajouter » (modale unifiée)
  // pré-remplie pour cet employé + ce jour. Le single est le cas dégénéré du groupé.
  const openAddPrefill = (userId = '', date = selectedDate, typeShift = 'simple') => {
    const presets = typeShift === 'midi' ? { d: '10:00', f: '15:00', p: 0 }
                  : typeShift === 'soir' ? { d: '17:00', f: '23:00', p: 0 }
                  : { d: '09:00', f: '17:00', p: 30 };
    const day = date || selectedDate;
    setBatchUserIds(new Set(userId ? [userId] : []));
    setBatchStart(day);
    setBatchEnd(day);
    setBatchWeekdays(new Set([0, 1, 2, 3, 4, 5, 6]));
    setBatchTypeShift(typeShift);
    setBatchDebut(presets.d);
    setBatchFin(presets.f);
    setBatchPause(presets.p);
    setBatchPoste('');
    setBatchConflictMode('skip');
    setShowBatchModal(true);
  };

  // Clic sur un shift existant → édition directe (plus de modale Détail intermédiaire côté planning).
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

  // ─── Pointage arrivée/départ : ne JAMAIS bloquer un punch ───
  // Online : RPC serveur inchangée (heure Zurich générée côté base, anti-double).
  // Hors-ligne ou réseau défaillant (timeout 8 s) : le punch part en file
  // IndexedDB, horodaté au moment du geste, puis rejoué au retour du réseau via
  // la RPC idempotente pointer_offline (zéro doublon même si l'appel online
  // avait abouti côté serveur malgré le timeout). Une erreur MÉTIER (déjà
  // pointé...) reste affichée : seule une défaillance réseau bascule sur la file.
  const applyPunchPatch = (shiftId, patch) => {
    setPlanning(prev => prev.map(s => s.id === shiftId ? { ...s, ...patch } : s));
    setSelectedShift(prev => prev && prev.id === shiftId ? { ...prev, ...patch } : prev);
  };

  const pointer = async (shift, type) => {
    const label = type === 'arrivee' ? 'arrivée' : 'départ';
    if (!legacySB) {
      // Mode démo sans bridge : comportement historique conservé.
      const t = nowTime();
      applyPunchPatch(shift.id, type === 'arrivee' ? { pointageDebut: t } : { pointageFin: t });
      return;
    }
    try {
      const res = await punchOnlineOrQueue({
        call: () => (type === 'arrivee' ? legacySB.db.pointerArrivee(shift.id) : legacySB.db.pointerDepart(shift.id)),
        shiftId: shift.id,
        type,
        userId: user?.id || null,
        etablissementId: shift.etablissementId || etabId || null,
      });
      if (res.mode === 'online') {
        const mapped = legacySB.db.mapShiftFromDB(res.row);
        setPlanning(prev => prev.map(s => s.id === shift.id ? mapped : s));
        setSelectedShift(mapped);
      } else {
        // Hors-ligne : heure optimiste affichée, punch en file (rejeu auto).
        applyPunchPatch(shift.id, type === 'arrivee'
          ? { pointageDebut: res.queued.optimisticTime }
          : { pointageFin: res.queued.optimisticTime });
        notifyLegacy('Pointage enregistré : il sera synchronisé au retour du réseau', 'warning');
      }
    } catch (err) {
      notifyLegacy(`Erreur pointage ${label} : ` + err.message, 'error');
    }
  };

  const pointerArrivee = (shift) => pointer(shift, 'arrivee');
  const pointerDepart = (shift) => pointer(shift, 'depart');

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

  // ─── Correction manuelle du pointage (manager seulement) ───
  // Permet de saisir les heures à la main quand un employé a oublié de pointer.
  // Contrairement au pointage RPC (heure générée côté serveur), c'est ici une action
  // de manager qui écrit directement les champs pointage_debut / pointage_fin.
  const openPointageEdit = (shift) => {
    setPointageEditForm({
      debut: shift.pointageDebut || '',
      fin: shift.pointageFin || '',
    });
    setPointageEditMode(true);
  };

  const cancelPointageEdit = () => {
    setPointageEditMode(false);
    setPointageEditForm({ debut: '', fin: '' });
  };

  const savePointageEdit = async () => {
    if (!selectedShift) return;
    const newDebut = pointageEditForm.debut?.trim() || null;
    const newFin = pointageEditForm.fin?.trim() || null;
    // Validation : fin doit être après debut quand les deux sont renseignés
    if (newDebut && newFin && newFin < newDebut) {
      alertLegacy('Le pointage de départ doit être après l\'arrivée.');
      return;
    }
    // Validation : pas de fin sans début
    if (newFin && !newDebut) {
      alertLegacy('Renseigne d\'abord l\'heure d\'arrivée.');
      return;
    }
    setPointageEditSaving(true);
    try {
      if (legacySB) {
        const row = await legacySB.db.updateShift(selectedShift.id, {
          pointageDebut: newDebut,
          pointageFin: newFin,
        });
        const mapped = legacySB.db.mapShiftFromDB(row);
        setPlanning(prev => prev.map(s => s.id === selectedShift.id ? mapped : s));
        setSelectedShift(mapped);
      } else {
        setPlanning(prev => prev.map(s => s.id === selectedShift.id ? { ...s, pointageDebut: newDebut, pointageFin: newFin } : s));
        setSelectedShift(prev => prev ? { ...prev, pointageDebut: newDebut, pointageFin: newFin } : prev);
      }
      setPointageEditMode(false);
      notifyLegacy('✓ Pointage corrigé manuellement', 'success');
    } catch (err) {
      notifyLegacy('Erreur : ' + err.message, 'error');
    } finally {
      setPointageEditSaving(false);
    }
  };

  // ═══════════════ DUPLICATION ═══════════════

  // State pour la modale de duplication (journée OU semaine)
  const [duplicateMode, setDuplicateMode] = React.useState(null); // null | 'day' | 'week'
  const [duplicateSource, setDuplicateSource] = React.useState({ userId: '', sourceDate: '', targetDate: '' });

  // ─── État pour la correction manuelle du pointage ───
  // Le pointage normal passe par RPC Supabase (heures générées côté serveur,
  // anti-fraude). Cette correction est réservée aux managers et permet de
  // saisir/effacer manuellement les heures quand un employé a oublié de pointer.
  const [pointageEditMode, setPointageEditMode] = React.useState(false);
  const [pointageEditForm, setPointageEditForm] = React.useState({ debut: '', fin: '' });
  const [pointageEditSaving, setPointageEditSaving] = React.useState(false);

  // State pour « Dupliquer vers… » (mode sélection) : copie des horaires sélectionnés
  // vers plusieurs jours × employés. { sourceShifts } = horaires cochés.
  const [demultModal, setDemultModal] = React.useState(null); // { sourceShifts } | null
  const [demultDates, setDemultDates] = React.useState(new Set());
  const [demultUserIds, setDemultUserIds] = React.useState(new Set());
  const [demultSaving, setDemultSaving] = React.useState(false);

  // ─── État pour la suppression multiple (Axe 2) ───
  // Mode sélection : des cases à cocher apparaissent sur chaque horaire, une barre
  // d'action sticky propose « Supprimer la sélection (N) » → une seule requête
  // delete().in('id', [...]). Réservé à canWrite (droit « gérer » du module planning).
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = React.useState(false);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);


  // ─── État pour la saisie groupée d'horaires (Axe 3) ───
  // Crée des horaires pour plusieurs employés × une plage de dates (filtrée par jours
  // de semaine) × un créneau commun, en une seule requête insert([...]).
  const [showBatchModal, setShowBatchModal] = React.useState(false);
  const [batchUserIds, setBatchUserIds] = React.useState(new Set());
  const [batchStart, setBatchStart] = React.useState(selectedDate);
  const [batchEnd, setBatchEnd] = React.useState(selectedDate);
  const [batchWeekdays, setBatchWeekdays] = React.useState(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [batchTypeShift, setBatchTypeShift] = React.useState('simple');
  const [batchDebut, setBatchDebut] = React.useState('09:00');
  const [batchFin, setBatchFin] = React.useState('17:00');
  const [batchPause, setBatchPause] = React.useState(30);
  const [batchPoste, setBatchPoste] = React.useState('');
  const [batchConflictMode, setBatchConflictMode] = React.useState('skip'); // 'skip' = ignorer+signaler | 'replace' = écraser
  const [batchSaving, setBatchSaving] = React.useState(false);

  // Loading guard APRÈS tous les hooks (sinon React error #310 : hooks appelés de manière conditionnelle)
  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;

  // ─── Navigation temporelle (semaine précédente / suivante / aujourd'hui) ───
  const shiftWeek = (delta) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + delta * 7);
    setSelectedDate(d.toISOString().slice(0, 10));
  };
  const goToCurrentWeek = () => setSelectedDate(getMondayOfCurrentWeek());
  // Navigation jour (mobile) : avance/recule d'une journée, et retour à aujourd'hui.
  const shiftMobileDay = (delta) => {
    const d = new Date(mobileDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setMobileDate(d.toISOString().slice(0, 10));
  };
  const goToTodayMobile = () => setMobileDate(todayStr);
  // Libellé « Semaine du JJ mois » à partir du premier jour affiché
  const weekRangeLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' });

  // ═══════════════ SUPPRESSION MULTIPLE (Axe 2) ═══════════════

  // Horaires actuellement visibles dans la vue planning - base du « tout sélectionner ».
  // En mobile, l'unité affichée est le jour ; en desktop, la plage de jours de la grille.
  const visibleShifts = isMobile
    ? planningEtab.filter(s => s.date === mobileDate)
    : planningEtab.filter(s => DAYS.some(d => d.date === s.date));

  const toggleSelectionMode = () => {
    setSelectionMode(prev => {
      if (prev) setSelectedIds(new Set()); // on quitte → on vide la sélection
      return !prev;
    });
  };

  const toggleShiftSelected = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = visibleShifts.length > 0 && visibleShifts.every(s => selectedIds.has(s.id));
  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(visibleShifts.map(s => s.id)));
  };

  const doBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      if (legacySB) {
        await legacySB.db.deleteShifts(ids); // une seule requête delete().in('id', [...])
      }
      const idSet = new Set(ids);
      setPlanning(prev => prev.filter(s => !idSet.has(s.id)));
      notifyLegacy(`✓ ${ids.length} horaire${ids.length > 1 ? 's' : ''} supprimé${ids.length > 1 ? 's' : ''}`, 'success');
      setSelectedIds(new Set());
      setSelectionMode(false);
      setShowBulkDeleteConfirm(false);
    } catch (err) {
      notifyLegacy('Erreur suppression : ' + err.message, 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  // ═══════════════ SAISIE GROUPÉE (Axe 3) ═══════════════

  const openBatchModal = () => {
    setBatchUserIds(new Set());
    setBatchStart(selectedDate);
    setBatchEnd(selectedDate);
    setBatchWeekdays(new Set([0, 1, 2, 3, 4, 5, 6]));
    setBatchTypeShift('simple');
    setBatchDebut('09:00');
    setBatchFin('17:00');
    setBatchPause(30);
    setBatchPoste('');
    setBatchConflictMode('skip');
    setShowBatchModal(true);
  };

  const toggleBatchUser = (uid) => {
    setBatchUserIds(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const toggleBatchWeekday = (idx) => {
    setBatchWeekdays(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // Construit les dates de la plage [batchStart, batchEnd] filtrées par jours de semaine.
  // Indice ISO : 0=lundi … 6=dimanche. Garde-fou : 366 jours max.
  const buildBatchDates = () => {
    if (!batchStart || !batchEnd) return [];
    const start = new Date(batchStart + 'T12:00:00');
    const end = new Date(batchEnd + 'T12:00:00');
    if (end < start) return [];
    const dates = [];
    const cursor = new Date(start);
    for (let i = 0; i < 366 && cursor <= end; i++) {
      const jsDay = cursor.getDay(); // 0=dim … 6=sam
      const isoDay = jsDay === 0 ? 6 : jsDay - 1; // 0=lun … 6=dim
      if (batchWeekdays.has(isoDay)) dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  };

  const doBatchCreate = async () => {
    if (batchUserIds.size === 0) { alertLegacy('Sélectionne au moins un employé.'); return; }
    if (!batchDebut || !batchFin) { alertLegacy('Renseigne le créneau (début et fin).'); return; }
    const dates = buildBatchDates();
    if (dates.length === 0) { alertLegacy('Aucune date valide (vérifie la plage et les jours sélectionnés).'); return; }

    setBatchSaving(true);
    const toCreate = [];
    const idsToRemove = new Set();
    let skipped = 0;
    try {
      for (const uid of batchUserIds) {
        for (const date of dates) {
          // Conflit = chevauchement horaire uniquement. Un horaire existant qui ne
          // chevauche pas le nouveau créneau (ex. midi déjà posé, on ajoute le soir)
          // est conservé → le service coupé reste possible.
          const overlapping = planningEtab.filter(s => s.userId === uid && s.date === date && shiftsOverlap(s.debut, s.fin, batchDebut, batchFin));
          if (overlapping.length > 0) {
            if (batchConflictMode === 'skip') { skipped += overlapping.length; continue; }
            // 'replace' : on ne supprime que les horaires qui se chevauchent
            overlapping.forEach(ex => idsToRemove.add(ex.id));
          }
          toCreate.push({
            etablissementId: etabId,
            userId: uid,
            date,
            debut: batchDebut,
            fin: batchFin,
            pause: batchPause || 0,
            poste: batchPoste || '',
            typeShift: batchTypeShift,
            statut: 'confirmé',
            pointageDebut: null,
            pointageFin: null,
          });
        }
      }

      if (toCreate.length === 0) {
        notifyLegacy(skipped > 0 ? `Aucun horaire créé - ${skipped} conflit(s) ignoré(s).` : 'Aucun horaire à créer.', 'warning');
        setBatchSaving(false);
        return;
      }

      let createdShifts = [];
      if (legacySB) {
        // 'replace' : suppression en masse des conflits (1 requête) avant l'insert en masse
        if (idsToRemove.size > 0) await legacySB.db.deleteShifts(Array.from(idsToRemove));
        const rows = await legacySB.db.createShifts(toCreate);
        createdShifts = (rows || []).map(r => legacySB.db.mapShiftFromDB(r));
      } else {
        createdShifts = toCreate.map((s, i) => ({ ...s, id: 'sb' + Date.now() + '-' + i }));
      }

      setPlanning(prev => [...prev.filter(s => !idsToRemove.has(s.id)), ...createdShifts]);

      const empCount = batchUserIds.size;
      let msg = `✓ ${createdShifts.length} horaire${createdShifts.length > 1 ? 's' : ''} créé${createdShifts.length > 1 ? 's' : ''} pour ${empCount} employé${empCount > 1 ? 's' : ''} sur ${dates.length} jour${dates.length > 1 ? 's' : ''}`;
      if (idsToRemove.size > 0) msg += ` (${idsToRemove.size} remplacé${idsToRemove.size > 1 ? 's' : ''})`;
      if (skipped > 0) msg += ` - ${skipped} conflit${skipped > 1 ? 's' : ''} ignoré${skipped > 1 ? 's' : ''}`;
      notifyLegacy(msg, 'success');
      setShowBatchModal(false);
    } catch (err) {
      notifyLegacy('Erreur saisie groupée : ' + err.message, 'error');
    } finally {
      setBatchSaving(false);
    }
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

  // ─── « Dupliquer vers… » depuis le mode sélection ───
  // Duplique les horaires sélectionnés vers N employés × N jours cochés.
  // Réutilise les méthodes batch (createShifts/deleteShifts) livrées aux axes 2/3.
  const openDuplicateSelection = () => {
    const sources = planningEtab.filter(s => selectedIds.has(s.id));
    if (sources.length === 0) { notifyLegacy('Sélectionnez au moins un horaire.', 'warning'); return; }
    setDemultModal({ sourceShifts: sources });
    setDemultDates(new Set()); // l'utilisateur choisit les jours cibles
    setDemultUserIds(new Set(sources.map(s => s.userId))); // employés d'origine pré-cochés
  };

  const closeDemult = () => {
    setDemultModal(null);
    setDemultDates(new Set());
    setDemultUserIds(new Set());
  };

  // Pour chaque couple (employé × jour) coché, recrée une copie de chaque horaire source.
  // Conflits : on remplace systématiquement l'existant de la cellule (cohérent avec l'ancienne
  // duplication journée). La cellule d'origine d'un horaire source est ignorée (pas de copie sur soi).
  const saveDemult = async () => {
    const sources = demultModal?.sourceShifts || [];
    if (sources.length === 0) return;
    if (demultDates.size === 0) { notifyLegacy('Sélectionnez au moins un jour cible.', 'warning'); return; }
    if (demultUserIds.size === 0) { notifyLegacy('Sélectionnez au moins un employé cible.', 'warning'); return; }

    setDemultSaving(true);
    let replaced = 0;
    const toCreate = [];
    const idsToRemove = new Set();

    try {
      for (const userId of demultUserIds) {
        for (const date of demultDates) {
          // Ne pas dupliquer une cellule sur elle-même (origine d'un horaire sélectionné)
          if (sources.some(s => s.userId === userId && s.date === date)) continue;
          const existing = planningEtab.filter(s => s.userId === userId && s.date === date);
          // On ne retire que les horaires existants qui chevauchent un des créneaux
          // dupliqués → un horaire non chevauchant (ex. midi en place, on duplique un
          // soir) est conservé, le service coupé survit à la duplication.
          existing.forEach(ex => {
            if (sources.some(src => shiftsOverlap(ex.debut, ex.fin, src.debut, src.fin))) {
              idsToRemove.add(ex.id);
              replaced++;
            }
          });
          for (const src of sources) {
            toCreate.push({
              etablissementId: etabId,
              userId,
              date,
              debut: src.debut,
              fin: src.fin,
              pause: src.pause || 0,
              poste: src.poste || '',
              statut: 'confirmé',
              typeShift: src.typeShift || 'simple',
              pointageDebut: null,
              pointageFin: null,
            });
          }
        }
      }

      if (toCreate.length === 0) {
        notifyLegacy('Aucun horaire à créer (vérifie les jours/employés cochés).', 'warning');
        setDemultSaving(false);
        return;
      }

      let createdShifts = [];
      if (legacySB) {
        if (idsToRemove.size > 0) await legacySB.db.deleteShifts(Array.from(idsToRemove));
        const rows = await legacySB.db.createShifts(toCreate);
        createdShifts = (rows || []).map(r => legacySB.db.mapShiftFromDB(r));
      } else {
        createdShifts = toCreate.map((s, i) => ({ ...s, id: 'sh' + Date.now() + '-' + i }));
      }

      setPlanning(prev => [...prev.filter(s => !idsToRemove.has(s.id)), ...createdShifts]);

      let msg = `✓ ${createdShifts.length} horaire${createdShifts.length > 1 ? 's' : ''} créé${createdShifts.length > 1 ? 's' : ''}`;
      if (replaced > 0) msg += ` (${replaced} remplacé${replaced > 1 ? 's' : ''})`;
      notifyLegacy(msg, 'success');
      closeDemult();
      setSelectionMode(false);
      setSelectedIds(new Set());
    } catch (err) {
      notifyLegacy('Erreur duplication : ' + err.message, 'error');
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
    const title = `Relevé mensuel CCNT - ${data.emp.prenom} ${data.emp.nom} - ${data.moisLabel}`;
    setTimeout(() => {
      if (action === 'print') pdfUtils?.printElement('ccnt-print', title, { etablissement, orientation: 'portrait', noBrandHeader: true });
      else pdfUtils?.exportElementToPdf('ccnt-print', filename, { etablissement, title, orientation: 'portrait', noBrandHeader: true, fitOnePage: true });
    }, 100);
  };

  const allShifts = planningEtab.filter(s => s.date === pointageDate);

  // ── VUE MOBILE : agenda par jour (refonte lisibilité)
  // Une seule journée à la fois, navigation jour sticky, cartes « heure-héros »,
  // bandeau couleur par rôle, résumé de couverture. La grille desktop est inchangée.
  const renderMobilePlanning = () => {
    const dayShifts = planningEtab
      .filter(s => s.date === mobileDate)
      .sort((a, b) => (a.debut || '').localeCompare(b.debut || ''));
    const isToday = mobileDate === todayStr;
    const dayLabel = new Date(mobileDate + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
    const dayLabelCap = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

    // Résumé de couverture : nb de personnes + répartition par famille de rôle.
    const uniqueEmpIds = [...new Set(dayShifts.map(s => s.userId))];
    const famCount = { cuisine: 0, salle: 0, autre: 0 };
    uniqueEmpIds.forEach(id => {
      const e = demoData.utilisateurs.find(u => u.id === id);
      famCount[roleFamily(e?.role)]++;
    });
    const coverageParts = [];
    if (famCount.cuisine) coverageParts.push(`${famCount.cuisine} cuisine`);
    if (famCount.salle) coverageParts.push(`${famCount.salle} salle`);
    if (famCount.autre) coverageParts.push(`${famCount.autre} autre${famCount.autre > 1 ? 's' : ''}`);

    return (
      <div style={pls.mobilePlanWrap}>
        {/* En-tête de jour sticky : ‹ jour › + retour à aujourd'hui */}
        <div style={pls.mobileDayNav}>
          <div style={pls.mobileDayNavRow}>
            <button style={pls.mobileNavArrow} onClick={() => shiftMobileDay(-1)} aria-label="Jour précédent">‹</button>
            <div style={pls.mobileDayNavCenter}>
              <span style={{ ...pls.mobileDayName, color: isToday ? 'var(--accent)' : 'var(--text)' }}>{dayLabelCap}</span>
              {isToday && <span style={pls.mobileTodayChip}>Aujourd'hui</span>}
            </div>
            <button style={pls.mobileNavArrow} onClick={() => shiftMobileDay(1)} aria-label="Jour suivant">›</button>
          </div>
          {!isToday && <button style={pls.mobileTodayBtn} onClick={goToTodayMobile}>Revenir à aujourd'hui</button>}
        </div>

        <div style={pls.mobilePlanList} id="planning-print">
          {/* Résumé de couverture du jour : qui / combien / quels postes */}
          {uniqueEmpIds.length > 0 && (
            <div style={pls.mobileCoverage}>
              {`${uniqueEmpIds.length} personne${uniqueEmpIds.length > 1 ? 's' : ''}${coverageParts.length ? ' · ' + coverageParts.join(' · ') : ''}`}
            </div>
          )}

          {dayShifts.length === 0 ? (
            <div style={pls.mobileEmptyDay}>
              <span style={{ color: 'var(--text2)', fontSize: 13 }}>Repos - aucun horaire planifié.</span>
              {canWrite && <button style={pls.mobileAddRow} onClick={() => openAddPrefill('', mobileDate)}>+ Ajouter un horaire</button>}
            </div>
          ) : (
            <>
              {dayShifts.map(shift => {
                const emp = userDisplay(shift.userId);
                const role = emp.role ? demoData.roles[emp.role] : null;
                const roleColor = role?.couleur || 'var(--text3)';
                const enPoste = shift.pointageDebut && !shift.pointageFin;
                const selected = selectionMode && selectedIds.has(shift.id);
                const onCardClick = selectionMode
                  ? () => toggleShiftSelected(shift.id)
                  : () => { if (canWrite) openEditShift(shift); };
                const typeLabel = shift.typeShift === 'midi' ? 'Midi' : shift.typeShift === 'soir' ? 'Soir' : null;
                const statusLabel = enPoste ? 'En poste' : shift.pointageFin ? 'Terminé' : shift.pointageDebut ? 'Arrivé' : null;
                return (
                  <div key={shift.id} style={{ ...pls.mobileCard, ...(selected ? pls.mobileCardSelected : {}) }} onClick={onCardClick}>
                    {/* Bandeau de couleur à gauche, codé par rôle → scan des postes d'un coup d'œil */}
                    <div style={{ ...pls.mobileCardBand, background: roleColor }} />
                    <div style={pls.mobileCardBody}>
                      <div style={pls.mobileCardTop}>
                        {/* Heure = élément héros */}
                        <span style={pls.mobileHour}>{shift.debut} – {shift.fin}</span>
                        {selectionMode
                          ? <input type="checkbox" checked={!!selected} onChange={() => toggleShiftSelected(shift.id)} onClick={(e) => e.stopPropagation()} style={pls.mobileCheckbox} />
                          : (statusLabel && <span style={{ ...pls.mobileStatus, background: enPoste ? 'var(--success-bg)' : shift.pointageFin ? 'var(--info-bg)' : 'var(--warning-bg)', color: enPoste ? 'var(--success-text)' : shift.pointageFin ? 'var(--info-text)' : 'var(--warning-text)' }}>{statusLabel}</span>)}
                      </div>
                      <div style={pls.mobileName}>{emp.name}</div>
                      <div style={pls.mobileMeta}>
                        <span style={{ ...pls.mobileChip, color: roleColor, borderColor: roleColor }}>{shift.poste || role?.label || 'Poste'}{typeLabel ? ` · ${typeLabel}` : ''}</span>
                        {shift.pause > 0 && <span style={pls.mobilePause}>Pause {shift.pause} min</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {canWrite && !selectionMode && (
                <button style={pls.mobileAddRow} onClick={() => openAddPrefill('', mobileDate)}>+ Ajouter un horaire</button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  // ── VUE MOBILE POINTAGE
  const renderMobilePointage = () => {
    return (
      <div style={pls.mobilePlanList} id="pointage-print">
        <div style={pls.mobileTitle}>Pointages - {new Date(pointageDate + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        {allShifts.length === 0 && <div style={{ padding: 20, fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>Aucun horaire ce jour.</div>}
        {(allShifts || []).map(shift => {
          const emp = userDisplay(shift.userId);
          const role = emp.role ? demoData.roles[emp.role] : null;
          const heuresPrev = calcHeures(shift.debut, shift.fin, shift.pause);
          const heuresReel = shift.pointageDebut && shift.pointageFin ? calcHeures(shift.pointageDebut, shift.pointageFin, shift.pause) : null;
          const enPoste = shift.pointageDebut && !shift.pointageFin;
          return (
            <div key={shift.id} style={{ ...pls.mobileShiftCard, flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ ...pls.empAvatar, background: role?.couleur || 'var(--text3)' }}>{emp.avatar}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{emp.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{shift.poste} · prévu {shift.debut}–{shift.fin}</div>
                </div>
                <div style={{ ...pls.mobileBadge, background: enPoste ? 'var(--success-bg)' : shift.pointageFin ? 'var(--info-bg)' : 'var(--warning-bg)', color: enPoste ? 'var(--success-text)' : shift.pointageFin ? 'var(--info-text)' : 'var(--warning-text)' }}>
                  {enPoste ? 'En poste' : shift.pointageFin ? 'Terminé' : 'Non pointé'}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10, fontSize: 11 }}>
                <div><div style={{ color: 'var(--text2)' }}>Arrivée</div><div style={{ fontWeight: 600 }}>{shift.pointageDebut || '-'}</div></div>
                <div><div style={{ color: 'var(--text2)' }}>Départ</div><div style={{ fontWeight: 600 }}>{shift.pointageFin || '-'}</div></div>
                <div><div style={{ color: 'var(--text2)' }}>Réel</div><div style={{ fontWeight: 600 }}>{heuresReel ? heuresReel + 'h' : '-'}</div></div>
              </div>
              {canPointShift(shift) && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }} className="no-print">
                  {!shift.pointageDebut && <button style={{ ...pls.pointBtn, fontSize: 12, padding: '8px 10px' }} onClick={() => pointerArrivee(shift)}>Arrivée</button>}
                  {shift.pointageDebut && !shift.pointageFin && <button style={{ ...pls.pointBtn, fontSize: 12, padding: '8px 10px' }} onClick={() => pointerDepart(shift)}>Départ</button>}
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
      {/* ─── Header : onglets + navigation temporelle ─── */}
      <div style={pls.tabs} className="no-print">
        <SegmentedTabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[{ id: 'planning', label: 'Planning' }, { id: 'pointage', label: 'Pointage' }]}
        />
        <div style={{ flex: 1 }} />
        {activeTab === 'planning' ? (!isMobile && (
          <>
            <div style={pls.weekNav}>
              <button style={pls.navArrow} onClick={() => shiftWeek(-1)} title="Semaine précédente" aria-label="Semaine précédente">‹</button>
              <span style={pls.weekLabel}>Semaine du {weekRangeLabel}</span>
              <button style={pls.navArrow} onClick={() => shiftWeek(1)} title="Semaine suivante" aria-label="Semaine suivante">›</button>
            </div>
            <button style={pls.smallBtn} onClick={goToCurrentWeek}>Aujourd'hui</button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={pls.datePicker} />
            {[1, 2, 3].map(n => <button key={n} style={{ ...pls.smallBtn, ...(horizon === n ? pls.smallBtnActive : {}) }} onClick={() => setHorizon(n)}>{n} sem.</button>)}
          </>
        )) : (
          <input type="date" value={pointageDate} onChange={e => setPointageDate(e.target.value)} style={pls.datePicker} />
        )}
      </div>

      {/* ─── Actions du module (posées, jamais flottantes ; scroll horizontal sur mobile) ─── */}
      <div className="module-actions no-print">
        {canWrite && activeTab === 'planning' && <button style={pls.addBtn} onClick={openBatchModal}>+ Ajouter</button>}
        {canWrite && activeTab === 'planning' && (
          <button
            style={{ ...pls.exportBtn, ...(selectionMode ? { background: 'var(--accent-light)', borderColor: 'var(--accent-bd)', color: 'var(--accent)' } : {}) }}
            onClick={toggleSelectionMode}
          >{selectionMode ? 'Quitter la sélection' : 'Sélectionner'}</button>
        )}
        <div style={{ flex: 1 }} />
        {canExport && activeTab === 'planning' && <button style={pls.exportBtn} onClick={openDuplicateWeek}>Dupliquer la semaine</button>}
        {canExport && <button style={pls.exportBtn} onClick={openCCNTModal}>Relevé CCNT</button>}
        {canExport && <button style={pls.exportBtn} onClick={() => pdfUtils?.printElement(activeTab === 'planning' ? 'planning-print' : 'pointage-print', activeTab === 'planning' ? 'Planning' : 'Pointage', { etablissement, orientation: activeTab === 'planning' && !isMobile ? 'landscape' : 'portrait' })}>Imprimer</button>}
        {canExport && <button style={pls.exportBtn} onClick={() => pdfUtils?.exportElementToPdf(activeTab === 'planning' ? 'planning-print' : 'pointage-print', activeTab === 'planning' ? 'planning.pdf' : 'pointage.pdf', { etablissement, title: activeTab === 'planning' ? 'Planning' : 'Pointage', orientation: activeTab === 'planning' && !isMobile ? 'landscape' : 'portrait' })}>Exporter en PDF</button>}
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
                      {DAYS.map(d => <div key={d.date} style={pls.dayCell}><ShiftCell key={`${emp.id}-${d.date}`} userId={emp.id} date={d.date} getShiftsDay={getShiftsDay} canWrite={canWrite} openAddPrefill={openAddPrefill} openEditShift={openEditShift} calcHeures={calcHeures} selectionMode={selectionMode} selectedIds={selectedIds} toggleShiftSelected={toggleShiftSelected}/></div>)}
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
                const emp = userDisplay(shift.userId);
                const role = emp.role ? demoData.roles[emp.role] : null;
                const heuresPrev = calcHeures(shift.debut, shift.fin, shift.pause);
                const heuresReel = shift.pointageDebut && shift.pointageFin ? calcHeures(shift.pointageDebut, shift.pointageFin, shift.pause) : null;
                const ecart = heuresPrev && heuresReel ? (parseFloat(heuresReel) - parseFloat(heuresPrev)).toFixed(1) : null;
                const enPoste = shift.pointageDebut && !shift.pointageFin;
                return (
                  <div key={shift.id} style={pls.ptRow} onClick={() => { setSelectedShift(shift); setShowDetailModal(true); }}>
                    <div style={pls.ptEmp}><div style={{ ...pls.ptAvatar, background: role?.couleur }}>{emp.avatar}</div><div><div style={pls.ptName}>{emp.name}</div><div style={{ fontSize: 11, color: 'var(--text2)' }}>{shift.poste}</div></div></div>
                    <span style={pls.ptCell}>{shift.debut}–{shift.fin}<br /><span style={{ fontSize: 11, color: 'var(--text2)' }}>{heuresPrev}h prévues</span></span>
                    <span style={pls.ptCell}>{shift.pointageDebut || '-'}</span>
                    <span style={pls.ptCell}>{shift.pointageFin || (enPoste ? 'En cours' : '-')}</span>
                    <span style={pls.ptCell}>{heuresReel ? <>{heuresReel}h {ecart && <span style={{ color: parseFloat(ecart) > 0 ? 'var(--success-strong)' : 'var(--danger-strong)', fontSize: 11 }}>({ecart > 0 ? '+' : ''}{ecart}h)</span>}</> : '-'}</span>
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
        <div className="modal-full-overlay" style={pls.overlay} onClick={() => { setShowDetailModal(false); setPointageEditMode(false); }}>
          <div className="modal-full" style={pls.modal} onClick={e => e.stopPropagation()}>
            <div style={pls.modalHeader}><div style={pls.modalTitle}>Détail de l'horaire</div><button style={pls.closeBtn} onClick={() => { setShowDetailModal(false); setPointageEditMode(false); }}>✕</button></div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(() => {
                const emp = userDisplay(selectedShift.userId);
                return <div><strong>Employé :</strong> {emp.name}</div>;
              })()}
              <div><strong>Date :</strong> {selectedShift.date}</div>
              <div><strong>Horaire :</strong> {selectedShift.debut}–{selectedShift.fin}</div>
              <div><strong>Poste :</strong> {selectedShift.poste || '-'}</div>
              <div><strong>Pause :</strong> {selectedShift.pause} min</div>
              {!pointageEditMode ? (
                <>
                  <div><strong>Arrivée :</strong> {selectedShift.pointageDebut || '-'}</div>
                  <div><strong>Départ :</strong> {selectedShift.pointageFin || '-'}</div>

                  {canPointShift(selectedShift) && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                      {!selectedShift.pointageDebut && <button style={pls.pointBtn} onClick={() => pointerArrivee(selectedShift)}>Pointer arrivée</button>}
                      {selectedShift.pointageDebut && !selectedShift.pointageFin && <button style={pls.pointBtn} onClick={() => pointerDepart(selectedShift)}>Pointer départ</button>}
                      {(selectedShift.pointageDebut || selectedShift.pointageFin) && canWrite && <button style={pls.ghostBtn} onClick={() => resetPointage(selectedShift)}>Réinit.</button>}
                      {canWrite && <button style={pls.ghostBtn} onClick={() => openPointageEdit(selectedShift)} title="Modifier manuellement les heures (oubli de pointage)">Corriger manuellement</button>}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 8, padding: 12, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning-text)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    ✎ Correction manuelle du pointage
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 120px' }}>
                      <label style={pls.fieldLabel}>Arrivée (HH:MM)</label>
                      <input type="time" style={pls.fieldInput} value={pointageEditForm.debut}
                        onChange={e => setPointageEditForm(prev => ({ ...prev, debut: e.target.value }))} />
                    </div>
                    <div style={{ flex: '1 1 120px' }}>
                      <label style={pls.fieldLabel}>Départ (HH:MM)</label>
                      <input type="time" style={pls.fieldInput} value={pointageEditForm.fin}
                        onChange={e => setPointageEditForm(prev => ({ ...prev, fin: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontStyle: 'italic', lineHeight: 1.4 }}>
                    💡 Action manager : utilise ce mode quand un employé a oublié de pointer. Laisse vide pour effacer une heure. Le pointage normal (RPC sécurisé côté serveur) reste prioritaire.
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button style={pls.exportBtn} onClick={cancelPointageEdit} disabled={pointageEditSaving}>Annuler</button>
                    <button style={{ ...pls.addBtn, opacity: pointageEditSaving ? 0.5 : 1 }} onClick={savePointageEdit} disabled={pointageEditSaving}>
                      {pointageEditSaving ? '⏳ Enregistrement…' : 'Enregistrer la correction'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale ajout/édition */}
      {showEditModal && editForm && (
        <div className="modal-full-overlay" style={pls.overlay} onClick={() => setShowEditModal(false)}>
          <div className="modal-full" style={pls.modal} onClick={e => e.stopPropagation()}>
            <div style={pls.modalHeader}><div style={pls.modalTitle}>{editForm.id ? 'Modifier l\'horaire' : 'Nouvel horaire'}</div><button style={pls.closeBtn} onClick={() => setShowEditModal(false)}>✕</button></div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={pls.fieldLabel}>Employé</label>
                <select style={pls.fieldInput} value={editForm.userId} onChange={e => setEditForm({ ...editForm, userId: e.target.value })}>
                  <option value="">Sélectionner…</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom} - {demoData.roles[e.role]?.label}</option>)}
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
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>Durée : <strong>{calcHeures(editForm.debut, editForm.fin, editForm.pause) || '-'}h</strong></div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', marginTop: 4 }}>
                {/* Suppression contextuelle de l'horaire en cours d'édition (pas un raccourci grille) */}
                {editForm.id && canWrite && (
                  <button
                    style={{ ...pls.exportBtn, color: 'var(--danger-strong)', borderColor: 'var(--danger-bd)', marginRight: 'auto' }}
                    onClick={() => { setShowEditModal(false); deleteShift(editForm.id); }}
                  >Supprimer</button>
                )}
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
        <div className="modal-full-overlay" style={pls.overlay} onClick={() => setDuplicateMode(null)}>
          <div className="modal-full" style={{ ...pls.modal, width: 480 }} onClick={e => e.stopPropagation()}>
            <div style={pls.modalHeader}>
              <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>Dupliquer une semaine complète</div>
              <button style={pls.closeBtn} onClick={() => setDuplicateMode(null)}>✕</button>
            </div>
            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <label style={pls.fieldLabel}>Lundi de la semaine source</label>
                  <input type="date" style={pls.fieldInput} value={duplicateSource.sourceDate}
                    onChange={e => setDuplicateSource({ ...duplicateSource, sourceDate: e.target.value })} />
                </div>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <label style={pls.fieldLabel}>Lundi de la semaine cible</label>
                  <input type="date" style={pls.fieldInput} value={duplicateSource.targetDate}
                    onChange={e => setDuplicateSource({ ...duplicateSource, targetDate: e.target.value })} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--bg)', padding: 10, borderRadius: 6, lineHeight: 1.5 }}>
                💡 Tous les horaires de tous les employés de la semaine source (7 jours à partir du lundi choisi) seront copiés vers la semaine cible. Les pointages ne sont pas copiés.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' }}>
                <button style={pls.exportBtn} onClick={() => setDuplicateMode(null)}>Annuler</button>
                <button style={pls.addBtn} onClick={doDuplicateWeek}>Dupliquer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════ MODALE RELEVÉ CCNT ═════════ */}
      {showCCNTModal && (
        <div className="modal-full-overlay" style={pls.overlay} onClick={() => setShowCCNTModal(false)}>
          <div className="modal-full" style={{ ...pls.modal, width: 560 }} onClick={e => e.stopPropagation()}>
            <div style={pls.modalHeader}>
              <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>Générer un relevé CCNT</div>
              <button style={pls.closeBtn} onClick={() => setShowCCNTModal(false)}>✕</button>
            </div>
            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--warning-text)', lineHeight: 1.5 }}>
                Document conforme aux <strong>articles 15 &amp; 21 CCNT</strong> hôtellerie-restauration suisse. À signer <strong>chaque mois</strong> par le collaborateur et l'employeur, à conserver <strong>5 ans</strong>.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <div>
                  <label style={pls.fieldLabel}>Collaborateur</label>
                  <select style={pls.fieldInput} value={ccntEmployeeId || ''} onChange={e => setCcntEmployeeId(e.target.value)}>
                    <option value="">Choisir…</option>
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
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6, flexWrap: 'wrap' }}>
                <button style={pls.exportBtn} onClick={() => setShowCCNTModal(false)}>Annuler</button>
                <button style={pls.exportBtn} onClick={() => exportCCNT('print')}>Imprimer</button>
                <button style={pls.addBtn} onClick={() => exportCCNT('pdf')}>Exporter en PDF</button>
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
          <div id="ccnt-print" style={ccnt.page}>
            {/* Bloc 1 : identité */}
            <div style={ccnt.bloc}>
              <div style={ccnt.titreDoc}>Contrôle de la durée du travail</div>
              <div style={ccnt.sousTitreDoc}>
                Conformément aux articles 15 &amp; 21 CCNT hôtellerie-restauration suisse
              </div>
              <div style={ccnt.identiteGrille}>
                <div><span style={ccnt.etiquette}>Établissement</span> {data.etab?.nom || '-'}</div>
                <div><span style={ccnt.etiquette}>Adresse</span> {data.etab?.adresse || '-'}</div>
                <div><span style={ccnt.etiquette}>Collaborateur</span> {data.emp.prenom} {data.emp.nom}</div>
                <div><span style={ccnt.etiquette}>Fonction</span> {data.emp.poste || demoData.roles[data.emp.role]?.label || '-'}</div>
                <div><span style={ccnt.etiquette}>Mois</span> {data.moisLabel}</div>
                <div><span style={ccnt.etiquette}>Durée hebdomadaire contractuelle</span> {data.heuresHebdo} h</div>
              </div>
            </div>

            {/* Bloc 2 : tableau journalier */}
            <table style={ccnt.table}>
              <thead>
                <tr>
                  <th style={ccnt.th}>Date</th>
                  <th style={ccnt.th}>Jour</th>
                  <th style={ccnt.th}>Arrivée</th>
                  <th style={ccnt.th}>Départ</th>
                  <th style={ccnt.th}>Pause (min)</th>
                  <th style={ccnt.th}>Heures prévues</th>
                  <th style={ccnt.th}>Heures effectives</th>
                  <th style={ccnt.th}>Observations</th>
                </tr>
              </thead>
              <tbody>
                {data.jours.map(j => (
                  <tr key={j.date} style={j.isWeekend ? ccnt.ligneZebre : ccnt.ligneNormale}>
                    <td style={ccntCell}>{String(j.jour).padStart(2, '0')}</td>
                    <td style={ccntCell}>{j.dayName}</td>
                    <td style={ccntCell}>{j.shift?.pointageDebut || j.shift?.debut || ''}</td>
                    <td style={ccntCell}>{j.shift?.pointageFin || j.shift?.fin || ''}</td>
                    <td style={ccntCell}>{j.shift ? (j.shift.pause || 0) : ''}</td>
                    <td style={{ ...ccntCell, ...ccnt.valeur }}>{j.heuresPrev ? j.heuresPrev.toFixed(2) : ''}</td>
                    <td style={{ ...ccntCell, ...ccnt.valeur }}>{j.heuresReel ? j.heuresReel.toFixed(2) : ''}</td>
                    <td style={ccntCell}></td>
                  </tr>
                ))}
                <tr style={ccnt.ligneTotal}>
                  <td style={{ ...ccntCell, ...ccnt.etiquette }} colSpan={5}>Total du mois</td>
                  <td style={{ ...ccntCell, ...ccnt.valeur }}>{data.totalPrev} h</td>
                  <td style={{ ...ccntCell, ...ccnt.valeur }}>{data.totalMois} h</td>
                  <td style={ccntCell}></td>
                </tr>
              </tbody>
            </table>

            {/* Bloc 3 : récapitulatif hebdomadaire (détection dépassement 42h/sem) */}
            <div style={{ ...ccnt.bloc, fontSize: 9 }}>
              <div style={ccnt.titreBloc}>Récapitulatif hebdomadaire</div>
              <table style={ccnt.tableInterne}>
                <thead>
                  <tr>
                    <th style={ccnt.th}>Semaine</th>
                    <th style={ccnt.th}>Heures effectives</th>
                    <th style={ccnt.th}>Dépassement {data.heuresHebdo}h</th>
                  </tr>
                </thead>
                <tbody>
                  {data.semaines.map((s, i) => (
                    <tr key={i} style={i % 2 ? ccnt.ligneZebre : ccnt.ligneNormale}>
                      <td style={ccntCell}>Du {s.debut} au {s.fin}</td>
                      <td style={{ ...ccntCell, ...ccnt.valeur }}>{s.heures.toFixed(2)} h</td>
                      <td style={{ ...ccntCell, ...(s.depassement > 0 ? ccnt.depassement : ccnt.valeur) }}>{s.depassement > 0 ? '+' + s.depassement.toFixed(2) + ' h' : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bloc 4 : soldes */}
            <div style={{ ...ccnt.bloc, fontSize: 10 }}>
              <div style={ccnt.titreBloc}>Communication mensuelle des soldes (art. 15 ch. 5 CCNT)</div>
              <table style={ccnt.tableInterne}>
                <tbody>
                  <tr>
                    <td style={{ ...ccntCell, width: '50%' }}>Solde d'heures supp. reporté du mois précédent</td>
                    <td style={{ ...ccntCell, ...ccnt.valeur }}>{data.soldePrec} h</td>
                  </tr>
                  <tr style={ccnt.ligneZebre}>
                    <td style={ccntCell}>Heures supplémentaires effectuées ce mois</td>
                    <td style={{ ...ccntCell, ...ccnt.valeur }}>+{data.soldeHeuresSupp} h</td>
                  </tr>
                  <tr style={ccnt.ligneTotal}>
                    <td style={{ ...ccntCell, ...ccnt.etiquette }}>Solde cumulé à fin {data.moisLabel}</td>
                    <td style={{ ...ccntCell, ...ccnt.valeur }}>{data.soldeCumule} h</td>
                  </tr>
                  <tr><td style={ccntCell}>Vacances - solde dû</td><td style={{ ...ccntCell, ...ccnt.valeur }}>{data.vacances.solde} j</td></tr>
                  <tr style={ccnt.ligneZebre}><td style={ccntCell}>Vacances - prises ce mois</td><td style={{ ...ccntCell, ...ccnt.valeur }}>{data.vacances.pris} j</td></tr>
                  <tr><td style={ccntCell}>Jours de repos dus / pris</td><td style={{ ...ccntCell, ...ccnt.valeur }}>{data.joursRepos.dus} j / {data.joursRepos.pris} j</td></tr>
                  <tr style={ccnt.ligneZebre}><td style={ccntCell}>Jours fériés dus / pris</td><td style={{ ...ccntCell, ...ccnt.valeur }}>{data.joursFeries.dus} j / {data.joursFeries.pris} j</td></tr>
                </tbody>
              </table>
            </div>

            {/* Bloc 5 : zone signatures */}
            <div style={ccnt.bloc}>
              <div style={ccnt.titreBloc}>Attestation et signatures</div>
              <div style={{ marginBottom: 10, fontSize: 9, lineHeight: 1.5 }}>
                Le/la soussigné(e) atteste avoir pris connaissance du présent décompte et confirme l'exactitude des heures enregistrées ci-dessus. Conformément à l'art. 21 ch. 4 CCNT, à défaut de signature mensuelle, les enregistrements personnels du collaborateur feront foi.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 14 }}>
                <div>
                  <div style={ccnt.signatureLigne}></div>
                  <div style={{ ...ccnt.etiquette, marginTop: 5 }}>Signature du collaborateur</div>
                  <div style={{ fontSize: 9, marginTop: 8 }}>Date : _____________________</div>
                </div>
                <div>
                  <div style={ccnt.signatureLigne}></div>
                  <div style={{ ...ccnt.etiquette, marginTop: 5 }}>Signature et timbre de l'employeur</div>
                  <div style={{ fontSize: 9, marginTop: 8 }}>Date : _____________________</div>
                </div>
              </div>
            </div>

            <div style={ccnt.mentionLegale}>
              Document à conserver 5 ans minimum - Art. 73 OLT 1 / Art. 21 CCNT
            </div>
          </div>
        );
      })()}

      {/* ═══ Modale « Dupliquer vers… » (depuis le mode sélection) ═══ */}
      {demultModal && (() => {
        const sources = demultModal.sourceShifts || [];
        const srcUserIds = new Set(sources.map(s => s.userId));
        const srcDates = new Set(sources.map(s => s.date));
        // Aperçu = couples (employé × jour) cochés non-origine × nombre d'horaires sources
        let targetCells = 0;
        demultUserIds.forEach(uid => {
          demultDates.forEach(date => {
            if (!sources.some(s => s.userId === uid && s.date === date)) targetCells++;
          });
        });
        const realPreview = targetCells * sources.length;
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
          <div className="modal-full-overlay" style={pls.overlay} onClick={closeDemult}>
            <div className="modal-full" style={{ ...pls.modal, maxWidth: 720, width: '94vw' }} onClick={e => e.stopPropagation()}>
              <div style={pls.modalHeader}>
                <div style={pls.modalTitle}>Dupliquer vers…</div>
                <button style={pls.closeBtn} onClick={closeDemult}>✕</button>
              </div>
              <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Récapitulatif sélection */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Horaires à dupliquer</div>
                  <div style={{ fontSize: 13 }}>
                    <strong>{sources.length}</strong> horaire{sources.length > 1 ? 's' : ''} sélectionné{sources.length > 1 ? 's' : ''} · copié{sources.length > 1 ? 's' : ''} vers chaque employé × jour coché ci-dessous
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
                      const isSrc = srcDates.has(d.date);
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
                      const isSrc = srcUserIds.has(emp.id);
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
                    {demultSaving ? '⏳ Création…' : `Dupliquer (${realPreview})`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* ═════════ BARRE D'ACTION SÉLECTION MULTIPLE (Axe 2) ═════════ */}
      {selectionMode && activeTab === 'planning' && (
        <div className="no-print" style={pls.selectionBar}>
          <button style={pls.selectionGhostBtn} onClick={toggleSelectAllVisible}>
            {allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
          <span style={pls.selectionCount}>{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
          <div style={{ flex: 1 }} />
          <button style={pls.selectionGhostBtn} onClick={toggleSelectionMode}>Annuler</button>
          <button
            style={{ ...pls.selectionGhostBtn, opacity: selectedIds.size === 0 ? 0.5 : 1 }}
            disabled={selectedIds.size === 0}
            onClick={openDuplicateSelection}
          >Dupliquer vers…</button>
          <button
            style={{ ...pls.selectionDeleteBtn, opacity: selectedIds.size === 0 ? 0.5 : 1 }}
            disabled={selectedIds.size === 0}
            onClick={() => setShowBulkDeleteConfirm(true)}
          >Supprimer ({selectedIds.size})</button>
        </div>
      )}

      {/* ═════════ MODALE CONFIRMATION SUPPRESSION MULTIPLE ═════════ */}
      {showBulkDeleteConfirm && (
        <div className="modal-full-overlay" style={pls.overlay} onClick={() => !bulkDeleting && setShowBulkDeleteConfirm(false)}>
          <div className="modal-full" style={{ ...pls.modal, width: 420 }} onClick={e => e.stopPropagation()}>
            <div style={pls.modalHeader}>
              <div style={pls.modalTitle}>Supprimer {selectedIds.size} horaire{selectedIds.size > 1 ? 's' : ''} ?</div>
              <button style={pls.closeBtn} onClick={() => !bulkDeleting && setShowBulkDeleteConfirm(false)}>✕</button>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                Cette action est <strong>définitive</strong>. {selectedIds.size} horaire{selectedIds.size > 1 ? 's' : ''} {selectedIds.size > 1 ? 'seront supprimés' : 'sera supprimé'} en une seule opération.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button style={pls.exportBtn} onClick={() => setShowBulkDeleteConfirm(false)} disabled={bulkDeleting}>Annuler</button>
                <button
                  style={{ ...pls.addBtn, background: 'var(--danger-strong)', borderColor: 'var(--danger-strong)', opacity: bulkDeleting ? 0.5 : 1 }}
                  onClick={doBulkDelete}
                  disabled={bulkDeleting}
                >{bulkDeleting ? '⏳ Suppression…' : `Supprimer (${selectedIds.size})`}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════ MODALE SAISIE GROUPÉE (Axe 3) ═════════ */}
      {showBatchModal && (() => {
        const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
        const allEmpSelected = employees.length > 0 && employees.every(e => batchUserIds.has(e.id));
        const dates = buildBatchDates();
        // Conflits = couples (employé, date) dont un horaire existant CHEVAUCHE le créneau
        // (un midi déjà posé n'est pas un conflit quand on ajoute un soir → service coupé).
        let conflictCount = 0;
        batchUserIds.forEach(uid => {
          dates.forEach(date => {
            if (planningEtab.some(s => s.userId === uid && s.date === date && shiftsOverlap(s.debut, s.fin, batchDebut, batchFin))) conflictCount++;
          });
        });
        const totalPairs = batchUserIds.size * dates.length;
        const willCreate = batchConflictMode === 'skip' ? totalPairs - conflictCount : totalPairs;
        const heuresCreneau = calcHeures(batchDebut, batchFin, batchPause);
        return (
          <div className="modal-full-overlay" style={pls.overlay} onClick={() => !batchSaving && setShowBatchModal(false)}>
            <div className="modal-full" style={{ ...pls.modal, maxWidth: 720, width: '94vw', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={pls.modalHeader}>
                <div style={pls.modalTitle}>Saisie groupée d'horaires</div>
                <button style={pls.closeBtn} onClick={() => !batchSaving && setShowBatchModal(false)}>✕</button>
              </div>
              <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* ── Employés ── */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={pls.fieldLabel}>Employés ({batchUserIds.size} sélectionné{batchUserIds.size > 1 ? 's' : ''})</label>
                    <button type="button" style={{ ...pls.exportBtn, fontSize: 11, padding: '4px 8px' }}
                      onClick={() => setBatchUserIds(allEmpSelected ? new Set() : new Set(employees.map(e => e.id)))}>
                      {allEmpSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                    {employees.map(emp => {
                      const role = demoData.roles[emp.role];
                      const checked = batchUserIds.has(emp.id);
                      return (
                        <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, fontSize: 12, cursor: 'pointer', background: checked ? 'var(--accent-light)' : 'var(--surface)' }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleBatchUser(emp.id)} />
                          <div style={{ ...pls.empAvatar, background: role?.couleur, width: 22, height: 22, fontSize: 9 }}>{emp.avatar}</div>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {emp.prenom} {emp.nom}
                            <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 4 }}>{role?.label}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* ── Plage de dates ── */}
                <div>
                  <label style={pls.fieldLabel}>Plage de dates ({dates.length} jour{dates.length > 1 ? 's' : ''})</label>
                  {/* base a 200px : le champ date iOS occupe ~192px, il faut
                      qu'une colonne trop etroite provoque le passage a la ligne */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <label style={{ ...pls.fieldLabel, fontSize: 10 }}>Du</label>
                      <input type="date" style={pls.fieldInput} value={batchStart} onChange={e => setBatchStart(e.target.value)} />
                    </div>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <label style={{ ...pls.fieldLabel, fontSize: 10 }}>Au</label>
                      <input type="date" style={pls.fieldInput} value={batchEnd} onChange={e => setBatchEnd(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Jours concernés :</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {WEEKDAY_LABELS.map((lbl, idx) => {
                        const checked = batchWeekdays.has(idx);
                        return (
                          <button key={lbl} type="button" onClick={() => toggleBatchWeekday(idx)}
                            style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, background: checked ? 'var(--accent-light)' : 'var(--surface)', color: checked ? 'var(--accent)' : 'var(--text2)', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* ── Créneau ── */}
                <div>
                  <label style={pls.fieldLabel}>Créneau</label>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {[
                      { id: 'simple', label: 'Journée continue', d: '09:00', f: '17:00' },
                      { id: 'midi', label: 'Service midi', d: '10:00', f: '15:00' },
                      { id: 'soir', label: 'Service soir', d: '17:00', f: '23:00' },
                    ].map(t => {
                      const active = batchTypeShift === t.id;
                      return (
                        <button key={t.id} type="button"
                          onClick={() => { setBatchTypeShift(t.id); setBatchDebut(t.d); setBatchFin(t.f); }}
                          style={{ flex: 1, padding: '10px 8px', borderRadius: 8, fontSize: 12, background: active ? 'var(--accent-light)' : 'var(--surface)', border: '1px solid', borderColor: active ? 'var(--accent)' : 'var(--border)', color: active ? 'var(--accent)' : 'var(--text2)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                    <div><label style={{ ...pls.fieldLabel, fontSize: 10 }}>Début</label><input type="time" style={pls.fieldInput} value={batchDebut} onChange={e => setBatchDebut(e.target.value)} /></div>
                    <div><label style={{ ...pls.fieldLabel, fontSize: 10 }}>Fin</label><input type="time" style={pls.fieldInput} value={batchFin} onChange={e => setBatchFin(e.target.value)} /></div>
                    <div><label style={{ ...pls.fieldLabel, fontSize: 10 }}>Pause (min)</label><input type="number" min="0" step="5" style={pls.fieldInput} value={batchPause} onChange={e => setBatchPause(Number(e.target.value))} /></div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label style={{ ...pls.fieldLabel, fontSize: 10 }}>Poste / Tâche (optionnel)</label>
                    <input type="text" style={pls.fieldInput} value={batchPoste} placeholder="Ex : Cuisine, Salle…" onChange={e => setBatchPoste(e.target.value)} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>Durée par horaire : <strong>{heuresCreneau || '-'}h</strong></div>
                </div>

                {/* ── Gestion des conflits ── */}
                {conflictCount > 0 && (
                  <div style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning-text)', marginBottom: 8 }}>
                      ⚠ {conflictCount} conflit{conflictCount > 1 ? 's' : ''} détecté{conflictCount > 1 ? 's' : ''} (créneau qui en chevauche un autre)
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text)', flexWrap: 'wrap' }}>
                      {[
                        { v: 'skip', label: 'Ignorer', desc: 'Ne crée pas les créneaux qui se chevauchent' },
                        { v: 'replace', label: 'Écraser', desc: 'Remplace seulement le créneau chevauché' },
                      ].map(opt => (
                        <label key={opt.v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input type="radio" name="batchConflictMode" value={opt.v} checked={batchConflictMode === opt.v} onChange={() => setBatchConflictMode(opt.v)} />
                          <span><strong>{opt.label}</strong> <span style={{ color: 'var(--text2)', fontSize: 11 }}>- {opt.desc}</span></span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Footer + aperçu ── */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, fontSize: 12, color: willCreate > 0 ? 'var(--text)' : 'var(--text2)' }}>
                    {willCreate > 0
                      ? <>Aperçu : <strong>{willCreate}</strong> horaire{willCreate > 1 ? 's' : ''} {willCreate > 1 ? 'seront créés' : 'sera créé'}{conflictCount > 0 && batchConflictMode === 'skip' ? ` (${conflictCount} ignoré${conflictCount > 1 ? 's' : ''})` : ''}</>
                      : 'Configuration incomplète'}
                  </span>
                  <button style={pls.exportBtn} onClick={() => setShowBatchModal(false)} disabled={batchSaving}>Annuler</button>
                  <button style={{ ...pls.addBtn, opacity: willCreate === 0 || batchSaving ? 0.5 : 1 }} onClick={doBatchCreate} disabled={willCreate === 0 || batchSaving}>
                    {batchSaving ? '⏳ Création…' : `Créer (${willCreate})`}
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
