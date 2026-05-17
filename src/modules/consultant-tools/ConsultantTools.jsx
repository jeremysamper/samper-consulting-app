import React from 'react';
import * as XLSX from 'xlsx';
import { getDemoData } from '../../data/demoData.js';
import SafeModule from '../../legacy/SafeModule.jsx';
import { alertLegacy, confirmLegacy, getBrowserWindow, notifyLegacy, readLegacyStorage, writeLegacyStorage } from '../../legacy/legacyApi.js';
import { readText, removeStorageKeys } from '../../utils/storage.js';
import { Factures } from '../factures/index.js';
import { Parametres } from '../parametres/index.js';
import { Roles } from '../roles/index.js';
import { pdfUtils } from '../../services/pdf.js';
import { CarteSimulation } from './CarteSimulation.jsx';
import { CarteCreator } from './CarteCreator.jsx';
import { dbService } from '../../services/dbService.js';

// ─────────────────────────────────────────────────────
// OUTILS CONSULTANT — Création et édition de recettes
// Interface simple : liste à gauche, éditeur à droite
// ─────────────────────────────────────────────────────

import { ALLERGENES_OPTIONS, CATEGORIES_REC, UNITES_REC, adjustPrixUnitForUnit, convertFactor } from './ConsultantTools.constants.js';
import PhotoUploader from './PhotoUploader.jsx';
import { cts } from './ConsultantTools.styles.js';
import DebouncedField from '../../components/ui/DebouncedField.jsx';

const safeText = (value) => String(value ?? '').toLowerCase();
const CONSULTANT_TOOLS_TABS = ['recettes', 'creation_carte', 'simulation', 'roles', 'etablissements', 'factures'];

// ─── Stabilité de la saisie : brouillons localStorage + détection de conflit ───
const RECIPE_DRAFT_PREFIX = 'sc_recipe_draft_';

// Sérialise les champs significatifs d'une recette (comparaison conflit / brouillon).
const serializeRecipeCore = (r) => {
  if (!r) return '';
  return JSON.stringify({
    nom: r.nom || '', categorie: r.categorie || '', portions: r.portions || 0,
    prixVente: r.prixVente || 0, statut: r.statut || '', version: r.version || 1,
    tempsPreparation: r.tempsPreparation || 0, tempsCuisson: r.tempsCuisson || 0,
    allergenesIds: r.allergenesIds || [], notesConsultant: r.notesConsultant || '',
    dressage: r.dressage || '', conservation: r.conservation || '',
    photoUrl: r.photoUrl || null, ingredients: r.ingredients || [], etapes: r.etapes || [],
  });
};

const getDraftStore = () => {
  try { return getBrowserWindow()?.localStorage || null; } catch (e) { return null; }
};
const writeRecipeDraft = (id, recipe) => {
  const store = getDraftStore();
  if (!store || !id) return;
  try { store.setItem(RECIPE_DRAFT_PREFIX + id, JSON.stringify({ recipe, savedAt: Date.now() })); }
  catch (e) { /* quota dépassé : on ignore */ }
};
const readRecipeDraft = (id) => {
  const store = getDraftStore();
  if (!store || !id) return null;
  try { const v = store.getItem(RECIPE_DRAFT_PREFIX + id); return v ? JSON.parse(v) : null; }
  catch (e) { return null; }
};
const clearRecipeDraft = (id) => {
  const store = getDraftStore();
  if (!store || !id) return;
  try { store.removeItem(RECIPE_DRAFT_PREFIX + id); } catch (e) { /* noop */ }
};

const ConsultantToolsGate = (props) => {
  if (props.user?.role !== 'consultant') {
    return (
      <div style={{ padding: 60, textAlign: 'center', maxWidth: 480, margin: '40px auto' }}>
        <div style={{ fontSize: 48, opacity: 0.3 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 12, fontFamily: 'var(--font-serif)' }}>
          Accès réservé
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6, lineHeight: 1.5 }}>
          Le module "Outils consultant" est réservé au rôle consultant.
          Si vous pensez que c'est une erreur, contactez votre administrateur.
        </div>
      </div>
    );
  }
  return <ConsultantToolsInner {...props} />;
};

const ConsultantToolsInner = ({ user, etablissement }) => {
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const etabId = etablissement?.id || 'etab-1';
  // Catalogue produits pour autocomplétion ingrédients
  const [catalogue, setCatalogue] = React.useState([]);
  React.useEffect(() => {
    if (!legacySB) return;
    let mounted = true;
    legacySB.db.listProduits(etabId).then(ps => { if (mounted) setCatalogue(Array.isArray(ps) ? ps : []); }).catch(() => {});
    const unsub = legacySB.realtime.subscribe('produits', async () => {
      try { const ps = await legacySB.db.listProduits(etabId); if (mounted) setCatalogue(Array.isArray(ps) ? ps : []); } catch(e) {}
    });
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId]);

  // ─── Plats (hiérarchie) ───
  const [plats, setPlats] = React.useState([]);
  const [expandedPlats, setExpandedPlats] = React.useState(new Set());
  const [showPlatForm, setShowPlatForm] = React.useState(false);
  const [editPlat, setEditPlat] = React.useState(null);
  const [linkPlatPickerForRecette, setLinkPlatPickerForRecette] = React.useState(null);
  // ─── Onglet actif ───
  // Onglets dispo : 'recettes' | 'creation_carte' | 'simulation' | 'roles' | 'etablissements' | 'factures'
  // Si on arrive ici via une redirection (ancien lien /factures par ex.),
  // on lit une cle UI locale temporaire pour ouvrir le bon onglet d'entree.
  const [activeTab, setActiveTab] = React.useState(() => {
    try {
      const pre = readText('sc_consultant_tools_tab', '');
      if (pre) {
        removeStorageKeys(['sc_consultant_tools_tab']);
        if (CONSULTANT_TOOLS_TABS.includes(pre)) {
          return pre;
        }
      }
    } catch(e) {}
    return 'recettes';
  });
  React.useEffect(() => {
    const browserWindow = getBrowserWindow();
    if (!browserWindow) return undefined;

    const handleTabNavigation = (event) => {
      const nextTab = event?.detail?.tab;
      if (CONSULTANT_TOOLS_TABS.includes(nextTab)) {
        setActiveTab(nextTab);
      }
    };

    browserWindow.addEventListener('sc:consultant-tools-tab', handleTabNavigation);
    return () => browserWindow.removeEventListener('sc:consultant-tools-tab', handleTabNavigation);
  }, []);

  React.useEffect(() => {
    if (!legacySB) return;
    let mounted = true;
    legacySB.db.listPlats(etabId).then(ps => { if (mounted) setPlats(Array.isArray(ps) ? ps : []); }).catch(() => {});
    const unsub1 = legacySB.realtime.subscribe('plats', async () => {
      try { const ps = await legacySB.db.listPlats(etabId); if (mounted) setPlats(Array.isArray(ps) ? ps : []); } catch(e) {}
    });
    const unsub2 = legacySB.realtime.subscribe('plat_recettes', async () => {
      try { const ps = await legacySB.db.listPlats(etabId); if (mounted) setPlats(Array.isArray(ps) ? ps : []); } catch(e) {}
    });
    return () => { mounted = false; unsub1 && unsub1(); unsub2 && unsub2(); };
  }, [etabId]);

  const [recettes, setRecettes] = React.useState(() => legacySB ? [] : readLegacyStorage('sc_recettes', demoData.recettes));
  const [selectedId, setSelectedId] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  // Filtrer par établissement
  const recettesEtab = recettes.filter(r => (r.etablissementId || 'etab-1') === etabId);

  // Chargement initial + realtime depuis Supabase
  React.useEffect(() => {
    if (!legacySB) return;
    let unsub = null, mounted = true;
    (async () => {
      try {
        const recs = await legacySB.db.listRecettes(etabId);
        if (mounted) {
          const safeRecs = Array.isArray(recs) ? recs : [];
          setRecettes(safeRecs);
          if (!selectedId && safeRecs[0]) setSelectedId(safeRecs[0].id);
          // Détection des brouillons localStorage non sauvegardés (crash / hors-ligne)
          const drafts = [];
          for (const r of safeRecs) {
            const d = readRecipeDraft(r.id);
            if (!d || !d.recipe) continue;
            if (serializeRecipeCore(d.recipe) !== serializeRecipeCore(r)) {
              drafts.push({ id: r.id, nom: r.nom, recipe: d.recipe, savedAt: d.savedAt });
            } else {
              clearRecipeDraft(r.id); // brouillon identique à la DB → obsolète
            }
          }
          if (mounted && drafts.length) setPendingDrafts(drafts);
        }
      } catch (err) { console.error('[ConsultantTools load]', err); }
    })();
    unsub = legacySB.realtime.subscribe('recettes', async () => {
      try {
        const recs = await legacySB.db.listRecettes(etabId);
        if (!mounted) return;
        const fresh = Array.isArray(recs) ? recs : [];
        setRecettes(prev => {
          const editingId = selectedIdRef.current;
          // Anti-clobber : si la recette en cours d'édition est « sale »,
          // on conserve sa version locale plutôt que d'écraser avec le serveur.
          if (editingId && dirtyRef.current) {
            const localRec = prev.find(r => r.id === editingId);
            const serverRec = fresh.find(r => r.id === editingId);
            if (serverRec && lastSavedSerializedRef.current &&
                serializeRecipeCore(serverRec) !== lastSavedSerializedRef.current) {
              notifyLegacy('⚠ Recette modifiée depuis un autre appareil. Vos modifications locales sont conservées.', 'warning');
            }
            if (localRec) return fresh.map(r => (r.id === editingId ? localRec : r));
          }
          return fresh;
        });
      } catch (e) { /* refetch realtime silencieux */ }
    });
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId]);

  // Si changement d'établissement rend selectedId invalide
  React.useEffect(() => {
    if (selectedId && !recettesEtab.find(r => r.id === selectedId)) {
      setSelectedId(recettesEtab[0]?.id || null);
    }
  }, [etabId, recettes.length]);

  // Recalcul des dérivés (foodCost, etc.) — local, pas de persistance auto
  React.useEffect(() => {
    recettes.forEach(r => {
      r.coutMatiere = (r.ingredients || []).reduce((s, i) => s + (Number(i.quantite) || 0) * (Number(i.prixUnit) || 0), 0);
      r.coutPortion = r.portions ? r.coutMatiere / r.portions : 0;
      r.foodCost = r.prixVente ? (r.coutPortion / r.prixVente * 100) : null;
      r.margeGrossePct = r.prixVente ? ((r.prixVente - r.coutPortion) / r.prixVente * 100) : null;
      if (r.tempsPreparation != null && r.tempsCuisson != null) {
        r.tempsTotal = Number(r.tempsPreparation) + Number(r.tempsCuisson);
      }
    });
    demoData.recettes = recettes;
    if (!legacySB) writeLegacyStorage('sc_recettes', recettes);
  }, [recettes]);

  const selected = recettes.find(r => r.id === selectedId);
  const searchValue = safeText(search);
  const filtered = recettesEtab.filter(r => searchValue === '' || safeText(r.nom).includes(searchValue));

  // ═══ Sauvegarde différée + stabilité de la saisie ═══
  const saveTimerRef = React.useRef(null);
  const [saveStatus, setSaveStatus] = React.useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = React.useState('');
  // Ref de recettes pour accès hors render (timers, callbacks realtime)
  const recettesRef = React.useRef(recettes);
  React.useEffect(() => { recettesRef.current = recettes; }, [recettes]);
  // Ref du selectedId — closure stable pour les callbacks realtime
  const selectedIdRef = React.useRef(selectedId);
  React.useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  // dirtyRef : true entre une édition et son save confirmé
  const dirtyRef = React.useRef(false);
  // id de la recette dont un save est en attente (découplé de la closure)
  const pendingSaveIdRef = React.useRef(null);
  // sérialisation du dernier état sauvegardé (détection d'édition concurrente)
  const lastSavedSerializedRef = React.useRef('');

  // Scaling : ratio appliqué en temps réel (1 = quantités de base, 2 = double, etc.)
  const [scalingPortions, setScalingPortions] = React.useState('');
  const [showScalingModal, setShowScalingModal] = React.useState(false);
  // Scaling par grammage cible d'un ingrédient : { ingId, targetQty }
  const [scalingTarget, setScalingTarget] = React.useState({ ingId: '', targetQty: '' });
  // Picker catalogue : null = fermé, 'multi' = ajout en masse, ID ligne = remplacement d'une ligne précise
  const [catalogPicker, setCatalogPicker] = React.useState(null);
  const [pickerSearch, setPickerSearch] = React.useState('');
  const [pickerCat, setPickerCat] = React.useState('Tous');
  const [pickerSelected, setPickerSelected] = React.useState(new Set());
  // Brouillons localStorage non sauvegardés détectés au chargement
  const [pendingDrafts, setPendingDrafts] = React.useState([]);
  React.useEffect(() => {
    if (catalogPicker === null) { setPickerSearch(''); setPickerCat('Tous'); setPickerSelected(new Set()); }
  }, [catalogPicker]);
  React.useEffect(() => { setScalingPortions(''); setShowScalingModal(false); setScalingTarget({ ingId: '', targetQty: '' }); setCatalogPicker(null); }, [selectedId]);

  // Persiste une recette vers Supabase. Réutilisé par le debounce, le flush et le retry réseau.
  const performSave = React.useCallback(async (id) => {
    if (!legacySB || !id) return;
    const curr = recettesRef.current.find(r => r.id === id);
    if (!curr) return;
    setSaveStatus('saving');
    try {
      await legacySB.db.upsertRecette(curr);
      if (pendingSaveIdRef.current === id) {
        dirtyRef.current = false;
        pendingSaveIdRef.current = null;
      }
      lastSavedSerializedRef.current = serializeRecipeCore(curr);
      clearRecipeDraft(id);
      setSaveStatus('saved');
      setSaveError('');
      setTimeout(() => setSaveStatus(prev => (prev === 'saved' ? 'idle' : prev)), 2000);
    } catch (err) {
      console.error('[upsertRecette]', err);
      setSaveStatus('error');
      setSaveError(err.message || 'Erreur sync');
      // brouillon localStorage conservé → retry au retour réseau
    }
  }, [legacySB]);

  // Saisie : state local immédiat + backup localStorage + save Supabase débouncé 600 ms.
  const updateSelected = (updates) => {
    if (!selected) return;
    setRecettes(prev => prev.map(r => r.id === selectedId ? { ...r, ...updates } : r));
    if (legacySB) {
      dirtyRef.current = true;
      pendingSaveIdRef.current = selectedId;
      writeRecipeDraft(selectedId, { ...selected, ...updates }); // backup anti-crash immédiat
      setSaveStatus('saving');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        performSave(selectedId);
      }, 600);
    }
  };

  // Force l'exécution immédiate d'un save en attente (changement de recette, démontage).
  const flushSave = React.useCallback(() => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    if (pendingSaveIdRef.current) performSave(pendingSaveIdRef.current);
  }, [performSave]);

  // Flush avant de changer de recette / d'établissement, et au démontage.
  React.useEffect(() => () => { flushSave(); }, [selectedId, etabId, flushSave]);

  // Retry automatique de la sauvegarde au retour de la connexion réseau.
  React.useEffect(() => {
    if (!legacySB) return undefined;
    const browserWindow = getBrowserWindow();
    if (!browserWindow) return undefined;
    const onOnline = () => {
      if (dirtyRef.current && pendingSaveIdRef.current) performSave(pendingSaveIdRef.current);
    };
    browserWindow.addEventListener('online', onOnline);
    return () => browserWindow.removeEventListener('online', onOnline);
  }, [legacySB, performSave]);

  // Restaure les brouillons localStorage détectés au chargement (crash / hors-ligne).
  const restoreDrafts = () => {
    if (!pendingDrafts.length) return;
    setRecettes(prev => prev.map(r => {
      const d = pendingDrafts.find(x => x.id === r.id);
      return d ? { ...r, ...d.recipe, id: r.id } : r;
    }));
    if (legacySB) {
      pendingDrafts.forEach(d => {
        legacySB.db.upsertRecette({ ...d.recipe, id: d.id })
          .then(() => clearRecipeDraft(d.id))
          .catch(err => console.error('[restoreDrafts]', err));
      });
    }
    notifyLegacy(`${pendingDrafts.length} brouillon(s) restauré(s).`, 'success');
    setPendingDrafts([]);
  };
  const dismissDrafts = () => {
    pendingDrafts.forEach(d => clearRecipeDraft(d.id));
    setPendingDrafts([]);
  };

  const createNew = async () => {
    const newRec = {
      id: 'rec-' + Date.now(),
      etablissementId: etabId,
      nom: 'Nouvelle recette',
      portions: 4,
      categorie: 'Plats',
      statut: 'brouillon',
      version: 1,
      prixVente: 0,
      tempsPreparation: 0,
      tempsCuisson: 0,
      tempsTotal: 0,
      allergenesIds: [],
      notesConsultant: '',
      modifie: new Date().toISOString().slice(0, 10),
      modifiePar: user.id,
      ingredients: [],
      etapes: [],
      dressage: '',
      conservation: '',
    };
    setRecettes(prev => [newRec, ...prev]);
    setSelectedId(newRec.id);
    if (legacySB) {
      try { await legacySB.db.upsertRecette(newRec); }
      catch (err) { notifyLegacy('Erreur création : ' + err.message, 'error'); }
    }
  };

  const duplicate = async () => {
    if (!selected) return;
    const copy = JSON.parse(JSON.stringify(selected));
    copy.id = 'rec-' + Date.now();
    copy.nom = selected.nom + ' (copie)';
    copy.version = 1;
    copy.statut = 'brouillon';
    copy.modifie = new Date().toISOString().slice(0, 10);
    copy.modifiePar = user.id;
    copy.ingredients = (copy.ingredients || []).map((i, idx) => ({ ...i, id: 'i' + Date.now() + '_' + idx }));
    setRecettes(prev => [copy, ...prev]);
    setSelectedId(copy.id);
    if (legacySB) {
      try { await legacySB.db.upsertRecette(copy); }
      catch (err) { notifyLegacy('Erreur duplication : ' + err.message, 'error'); }
    }
  };

  const deleteRecette = async () => {
    if (!selected) return;
    const idToDelete = selectedId;
    if (legacySB) {
      try { await legacySB.db.deleteRecette(idToDelete); }
      catch (err) { notifyLegacy('Erreur suppression : ' + err.message, 'error'); return; }
    }
    const next = recettes.filter(r => r.id !== idToDelete);
    setRecettes(next);
    setSelectedId(next[0]?.id || null);
    setShowDeleteConfirm(false);
  };

  // ═══ Synchronisation carte active ═══
  // État local des cartes pour que isRecetteActive se re-render quand on change
  const [cartesLocal, setCartesLocal] = React.useState(() => legacySB ? [] : readLegacyStorage('sc_cartes', demoData.cartes));

  React.useEffect(() => {
    if (!legacySB) return;
    let unsub = null, mounted = true;
    (async () => {
      try { const c = await legacySB.db.listCartes(etabId); if (mounted) setCartesLocal(c); } catch(e) {}
    })();
    unsub = legacySB.realtime.subscribe('cartes', async () => {
      try { const c = await legacySB.db.listCartes(etabId); if (mounted) setCartesLocal(c); } catch(e) {}
    });
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId]);

  const toggleActifSurCarte = async (recette, actif) => {
    if (!recette) return;
    const source = legacySB ? cartesLocal : readLegacyStorage('sc_cartes', demoData.cartes);
    let carteEtab = source.find(c => (c.etablissementId || 'etab-1') === etabId);

    // Créer une carte par défaut si aucune n'existe
    if (!carteEtab) {
      carteEtab = {
        id: 'carte-' + etabId + '-' + Date.now(),
        etablissementId: etabId,
        nom: 'Carte principale',
        dateDebut: new Date().toISOString().slice(0, 10),
        dateFin: null,
        plats: [],
      };
    } else {
      // Cloner pour ne pas muter
      carteEtab = { ...carteEtab, plats: [...(carteEtab.plats || [])] };
    }

    if (actif) {
      if (!carteEtab.plats.find(p => p.recetteId === recette.id)) {
        carteEtab.plats.push({
          id: 'p-' + Date.now(),
          nom: recette.nom,
          categorie: recette.categorie,
          prix: recette.prixVente || 0,
          allergenes: recette.allergenesIds || [],
          recetteId: recette.id,
        });
      }
    } else {
      carteEtab.plats = carteEtab.plats.filter(p => p.recetteId !== recette.id);
    }

    if (legacySB) {
      try { await legacySB.db.upsertCarte(carteEtab); }
      catch (err) { notifyLegacy('Erreur sync carte : ' + err.message, 'error'); return; }
    } else {
      const cartes = readLegacyStorage('sc_cartes', demoData.cartes);
      const idx = cartes.findIndex(c => c.id === carteEtab.id);
      if (idx >= 0) cartes[idx] = carteEtab; else cartes.push(carteEtab);
      demoData.cartes = cartes;
      writeLegacyStorage('sc_cartes', cartes);
    }

    // Mettre à jour le statut local (sera persisté par le useEffect de recettes)
    const newStatut = actif ? 'active' : 'brouillon';
    setRecettes(prev => prev.map(r => r.id === recette.id ? { ...r, statut: newStatut } : r));
    if (legacySB) {
      try { await legacySB.db.upsertRecette({ ...recette, statut: newStatut }); } catch(e) {}
    }
  };

  const isRecetteActive = (recette) => {
    if (!recette) return false;
    const source = legacySB ? cartesLocal : readLegacyStorage('sc_cartes', demoData.cartes);
    const carteEtab = source.find(c => (c.etablissementId || 'etab-1') === etabId);
    return carteEtab?.plats?.some(p => p.recetteId === recette.id) || false;
  };

  // ═══ Import / Export XLSX ═══
  const downloadTemplate = () => {
    if (typeof XLSX === 'undefined') { alertLegacy('Bibliothèque XLSX non chargée.'); return; }
    const wb = XLSX.utils.book_new();
    // Feuille 1 : Recettes (exemple pré-rempli)
    const recettesRows = [
      ['Nom de la recette', 'Catégorie', 'Portions', 'Prix de vente (CHF)', 'Temps préparation (min)', 'Temps cuisson (min)', 'Allergènes (séparés par ;)', 'Notes consultant'],
      ['Risotto aux asperges', 'Plats', 4, 28.50, 15, 20, 'lactose', 'Servir chaud, décorer avec parmesan'],
      ['Mousse au chocolat', 'Desserts', 6, 12.00, 20, 0, 'lactose;oeufs', 'Préparer la veille'],
    ];
    const wsRecettes = XLSX.utils.aoa_to_sheet(recettesRows);
    wsRecettes['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 25 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsRecettes, 'Recettes');

    // Feuille 2 : Ingrédients (liés par "Nom de la recette")
    const ingredientsRows = [
      ['Nom de la recette', 'Ingrédient', 'Quantité', 'Unité', 'Prix unitaire (CHF)', 'Catégorie'],
      ['Risotto aux asperges', 'Riz Arborio', 320, 'g', 0.012, 'Féculents'],
      ['Risotto aux asperges', 'Asperges vertes', 400, 'g', 0.018, 'Légumes'],
      ['Risotto aux asperges', 'Parmesan', 80, 'g', 0.045, 'Produits laitiers'],
      ['Risotto aux asperges', 'Bouillon de légumes', 1000, 'ml', 0.004, 'Autres'],
      ['Mousse au chocolat', 'Chocolat noir 70%', 200, 'g', 0.025, 'Autres'],
      ['Mousse au chocolat', 'Œufs', 4, 'pcs', 0.50, 'Autres'],
      ['Mousse au chocolat', 'Crème entière', 250, 'ml', 0.006, 'Produits laitiers'],
    ];
    const wsIng = XLSX.utils.aoa_to_sheet(ingredientsRows);
    wsIng['!cols'] = [{ wch: 30 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 20 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsIng, 'Ingrédients');

    // Feuille 3 : Étapes (liées par "Nom de la recette" avec ordre)
    const etapesRows = [
      ['Nom de la recette', 'Ordre', 'Description'],
      ['Risotto aux asperges', 1, 'Faire revenir l\'oignon dans l\'huile d\'olive'],
      ['Risotto aux asperges', 2, 'Ajouter le riz et nacrer pendant 2 minutes'],
      ['Risotto aux asperges', 3, 'Déglacer au vin blanc puis ajouter le bouillon louche par louche'],
      ['Risotto aux asperges', 4, 'Incorporer les asperges en fin de cuisson'],
      ['Risotto aux asperges', 5, 'Ajouter le parmesan hors du feu et rectifier l\'assaisonnement'],
      ['Mousse au chocolat', 1, 'Faire fondre le chocolat au bain-marie'],
      ['Mousse au chocolat', 2, 'Séparer les blancs des jaunes'],
      ['Mousse au chocolat', 3, 'Incorporer les jaunes au chocolat fondu'],
      ['Mousse au chocolat', 4, 'Monter les blancs en neige ferme'],
      ['Mousse au chocolat', 5, 'Incorporer délicatement les blancs au mélange chocolaté'],
      ['Mousse au chocolat', 6, 'Réfrigérer 4h minimum'],
    ];
    const wsEtapes = XLSX.utils.aoa_to_sheet(etapesRows);
    wsEtapes['!cols'] = [{ wch: 30 }, { wch: 8 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsEtapes, 'Étapes');

    // Feuille 4 : Instructions
    const instrRows = [
      ['Instructions d\'utilisation du template'],
      [''],
      ['1. Remplissez la feuille "Recettes" : une ligne = une recette'],
      ['2. Dans "Ingrédients", utilisez exactement le même "Nom de la recette" pour lier les ingrédients'],
      ['3. Dans "Étapes", idem — numérotez l\'ordre des étapes'],
      ['4. Catégories acceptées : Entrées, Plats, Desserts, Fromages, Sauces, Fonds, Amuse-bouches, Garnitures'],
      ['5. Allergènes acceptés (séparés par ;) : gluten, lactose, oeufs, poissons, crustaces, fruits_coque, sulfites, arachides, soja, celeri, moutarde, sesame, mollusques, lupin'],
      ['6. Unités acceptées : g, kg, ml, L, pcs, cs, cc, pincée'],
      ['7. Importez ensuite le fichier via le bouton "Importer XLSX" dans Outils consultant'],
      [''],
      ['Les recettes importées seront ajoutées à l\'établissement courant en tant que brouillons.'],
    ];
    const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
    wsInstr['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

    XLSX.writeFile(wb, 'template-recettes-samper.xlsx');
  };

  // Parser pour fiche recette unique (format Samper interne)
  // Détection des sections par mots-clés : "Produit :", "Ingrédients :", "Étapes", "Astuce"
  const parseFicheUnique = (rows) => {
    // Extraire toutes les lignes [col1, col2] en ignorant les colonnes vides en début
    const lines = rows.map(r => {
      // Trouver les 2 premières cellules non-null
      const cells = (r || []).filter(c => c !== null && c !== undefined && String(c).trim() !== '');
      return cells;
    }).filter(cells => cells.length > 0);


    if (lines.length === 0) return null;

    // ─── DÉTECTION DE CATÉGORIE ───
    // On scanne les 8 premières lignes à la recherche de mots-clés
    // car le mot-clé peut être dans le titre fusionné ("Fiche recette - Froid"),
    // dans une cellule libre ("Plat", "Entrée"), etc.
    let categorie = 'Plats';
    let catFound = false;
    for (let i = 0; i < Math.min(8, lines.length); i++) {
      const fullLine = lines[i].map(c => String(c || '')).join(' ').toLowerCase();
      // Section "Produit :" ou "Ingrédients :" → on arrête le scan, on est passé l'en-tête
      if (/^\s*(produit|ingr[\u00e9e]dients|plat)\s*:/.test(fullLine)) break;
      if (/froid|entr[\u00e9e]e/.test(fullLine)) { categorie = 'Entrées'; catFound = true; break; }
      if (/dessert|sucr/.test(fullLine)) { categorie = 'Desserts'; catFound = true; break; }
      if (/fromage/.test(fullLine)) { categorie = 'Fromages'; catFound = true; break; }
      if (/\bplat\b|\bchaud\b/.test(fullLine)) { categorie = 'Plats'; catFound = true; break; }
    }

    // Trouver nom : "Produit :" > "Plat :" > fallback
    let nom = '';
    let platParent = '';
    for (const l of lines) {
      const label = String(l[0] || '').toLowerCase().replace(/[:\s]+$/, '').trim();
      const val = String(l[1] || '').trim();
      if (label === 'produit' && val) nom = val;
      if (label === 'plat' && val) platParent = val;
    }
    if (!nom && platParent) nom = platParent;
    if (!nom) nom = 'Recette importée';

    // Trouver portions : ligne qui contient "X portions"
    let portions = 4;
    for (const l of lines) {
      const txt = l.join(' ').toLowerCase();
      const m = txt.match(/(\d+)\s*portions?/i);
      if (m) { portions = parseInt(m[1]) || 4; break; }
    }

    // Parse des sections : on itère ligne par ligne en gérant les états
    const ingredients = [];
    const etapes = [];
    let notesConsultant = '';
    let section = null; // null | 'ingredients' | 'etapes' | 'astuce'

    for (const l of lines) {
      const col1 = String(l[0] || '').trim();
      const col1Low = col1.toLowerCase();
      const col2 = l[1] !== undefined ? String(l[1]).trim() : '';

      // Détection des sections
      if (/^ingr[\u00e9e]dients?\s*:?/i.test(col1)) { section = 'ingredients'; continue; }
      if (/^[\u00e9e]tapes?\b/i.test(col1)) { section = 'etapes'; continue; }
      if (/^astuce/i.test(col1)) { section = 'astuce'; continue; }
      // Sections à ignorer une fois rencontrées (déjà lues via "Produit :" / "Plat :")
      if (['produit', 'plat', 'fiche recette', 'portions'].some(k => col1Low.startsWith(k))) continue;
      if (/^\d+\s*portions?$/i.test(col1)) continue;

      if (section === 'ingredients') {
        // Une ligne d'ingrédient : col1 = nom, col2 = quantité (ex "300 g", "1 L", "4 g", "Qs", "4 citrons")
        if (!col1) continue;
        const produit = col1;
        let quantite = 0, unite = 'g';
        if (col2) {
          // Cas "Qs" / "QS" / "qsp" / "selon goût" → quantité 0, unité libre
          if (/^(qs|qsp|selon|au\s*go[uû]t|pm)\b/i.test(col2)) {
            quantite = 0;
            unite = 'g';
          } else {
            // Parser "300 g" ou "1 L" ou "3kg" ou "1.5 L" ou "4 citrons"
            const m = col2.match(/^([\d,.]+)\s*(.*)$/);
            if (m) {
              quantite = parseFloat(m[1].replace(',', '.')) || 0;
              unite = (m[2] || 'g').trim().toLowerCase();
              // Normaliser quelques unités courantes
              if (unite === 'kg') { quantite *= 1000; unite = 'g'; }
              else if (unite === 'l') { quantite *= 1000; unite = 'ml'; }
              else if (unite === 'cl') { quantite *= 10; unite = 'ml'; }
              else if (!['g', 'ml', 'pcs', 'cs', 'cc', 'tsp', 'tbsp', 'btl'].includes(unite)) {
                // Pour les unités libres (citrons, gousses, etc.) → on stocke en pcs
                unite = 'pcs';
              }
            }
          }
        }
        ingredients.push({
          id: 'i-' + Date.now() + '-' + ingredients.length,
          nom: produit,
          quantite,
          unite,
          prixUnit: 0,
          categorie: 'Autres',
        });
      } else if (section === 'etapes') {
        // Une étape : col1 est le texte. Si se termine par ":" c'est un sous-titre de section
        if (!col1) continue;
        etapes.push(col1);
      } else if (section === 'astuce') {
        if (col1) notesConsultant += (notesConsultant ? '\n' : '') + col1;
      }
    }


    return {
      nom,
      categorie,
      portions,
      prixVente: 0,
      tempsPreparation: 0,
      tempsCuisson: 0,
      tempsTotal: 0,
      statut: 'brouillon',
      version: 1,
      allergenesIds: [],
      notesConsultant: notesConsultant + (platParent && platParent !== nom ? (notesConsultant ? '\n\n' : '') + 'Accompagne : ' + platParent : ''),
      modifie: new Date().toISOString().slice(0, 10),
      ingredients,
      etapes,
      dressage: '',
      conservation: '',
    };
  };

  const handleImportXLSX = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') { alertLegacy('Bibliothèque XLSX non chargée.'); return; }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });

        // ─── DÉTECTION AUTOMATIQUE DU FORMAT ───
        // Format 1 (multi-recettes) : feuilles "Recettes", "Ingrédients", "Étapes"
        // Format 2 (fiche unique) : structure avec "Produit :" / "Plat :" / "Ingrédients :"
        const hasMultiFormat = wb.Sheets['Recettes'] || wb.SheetNames.some(n => n.toLowerCase().includes('recettes'));
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const firstRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        // Détection : on cherche des marqueurs caractéristiques d'une fiche unique
        // ("Fiche recette", "Produit :", "Ingrédients :" ou "Plat :")
        let isFicheUnique = false;
        let foundMarkers = [];
        for (let i = 0; i < Math.min(15, firstRows.length); i++) {
          const row = firstRows[i] || [];
          for (let j = 0; j < Math.min(5, row.length); j++) {
            const cell = String(row[j] || '').trim().toLowerCase();
            if (/^fiche\s*recette/i.test(cell)) foundMarkers.push('header');
            if (/^produit\s*:?$/i.test(cell)) foundMarkers.push('produit');
            if (/^plat\s*:?$/i.test(cell)) foundMarkers.push('plat');
            if (/^ingr[\u00e9e]dients?\s*:?$/i.test(cell)) foundMarkers.push('ingredients');
            if (/^[\u00e9e]tapes?\b/i.test(cell)) foundMarkers.push('etapes');
          }
        }
        // Si on trouve "Ingrédients :" + au moins un autre marqueur (Produit/Plat/header), c'est une fiche unique
        if (foundMarkers.includes('ingredients') &&
            (foundMarkers.includes('produit') || foundMarkers.includes('plat') || foundMarkers.includes('header'))) {
          isFicheUnique = true;
        }
        if (isFicheUnique) {
          // ═══ FORMAT FICHE UNIQUE ═══
          const recette = parseFicheUnique(firstRows);
          if (!recette) { notifyLegacy('Impossible de parser cette fiche. Vérifiez le format.', 'error'); return; }
          if (!recette.ingredients || recette.ingredients.length === 0) {
            alertLegacy(`⚠ Import effectué mais AUCUN ingrédient détecté.\n\nVérifiez que votre fichier Excel a bien une section "Ingrédients :" suivie des lignes produit/quantité.\n\n(${recette.etapes?.length || 0} étapes trouvées)`);
          }
          recette.id = 'rec-' + Date.now();
          recette.etablissementId = etabId;
          recette.modifiePar = user.id;

          setRecettes(prev => [recette, ...prev]);
          setSelectedId(recette.id);

          if (legacySB) {
            try { await legacySB.db.upsertRecette(recette); }
            catch (err) { notifyLegacy(`⚠ Recette créée localement mais erreur sync : ${err.message}`, 'error'); return; }
          }
          alertLegacy(`✓ Recette "${recette.nom}" importée avec succès (${recette.ingredients.length} ingrédients, ${recette.etapes.length} étapes).`);
          return;
        }

        if (!hasMultiFormat) {
          alertLegacy('Format non reconnu.\n\nFormats acceptés :\n• Template multi-recettes (feuilles "Recettes" + "Ingrédients" + "Étapes")\n• Fiche unique commençant par "Fiche recette"');
          return;
        }

        // ═══ FORMAT MULTI-RECETTES (template original) ═══
        const shRec = wb.Sheets['Recettes'] || wb.Sheets[wb.SheetNames[0]];
        const shIng = wb.Sheets['Ingrédients'] || wb.Sheets['Ingredients'];
        const shEt = wb.Sheets['Étapes'] || wb.Sheets['Etapes'];

        if (!shRec) { alertLegacy('Feuille "Recettes" introuvable.'); return; }
        const rowsRec = XLSX.utils.sheet_to_json(shRec, { header: 1 });
        const rowsIng = shIng ? XLSX.utils.sheet_to_json(shIng, { header: 1 }) : [];
        const rowsEt = shEt ? XLSX.utils.sheet_to_json(shEt, { header: 1 }) : [];

        // Sauter l'en-tête
        const imported = [];
        for (let i = 1; i < rowsRec.length; i++) {
          const row = rowsRec[i];
          if (!row || !row[0]) continue;
          const nom = String(row[0]).trim();
          if (!nom) continue;

          const recette = {
            id: 'rec-' + Date.now() + '-' + i,
            etablissementId: etabId,
            nom,
            categorie: String(row[1] || 'Plats').trim(),
            portions: parseInt(row[2]) || 4,
            prixVente: parseFloat(row[3]) || 0,
            tempsPreparation: parseInt(row[4]) || 0,
            tempsCuisson: parseInt(row[5]) || 0,
            tempsTotal: (parseInt(row[4]) || 0) + (parseInt(row[5]) || 0),
            allergenesIds: row[6] ? String(row[6]).split(';').map(s => s.trim()).filter(Boolean) : [],
            notesConsultant: String(row[7] || '').trim(),
            statut: 'brouillon',
            version: 1,
            modifie: new Date().toISOString().slice(0, 10),
            modifiePar: user.id,
            dressage: '',
            conservation: '',
            ingredients: [],
            etapes: [],
          };

          // Ingrédients liés
          for (let j = 1; j < rowsIng.length; j++) {
            const r = rowsIng[j];
            if (!r || !r[0]) continue;
            if (String(r[0]).trim() === nom) {
              recette.ingredients.push({
                id: 'i' + Date.now() + '_' + i + '_' + j,
                nom: String(r[1] || '').trim(),
                quantite: parseFloat(r[2]) || 0,
                unite: String(r[3] || 'g').trim(),
                prixUnit: parseFloat(r[4]) || 0,
                categorie: String(r[5] || 'Autres').trim(),
              });
            }
          }

          // Étapes liées (triées par ordre)
          const etapesOf = [];
          for (let j = 1; j < rowsEt.length; j++) {
            const r = rowsEt[j];
            if (!r || !r[0]) continue;
            if (String(r[0]).trim() === nom) {
              etapesOf.push({ ordre: parseInt(r[1]) || 999, desc: String(r[2] || '').trim() });
            }
          }
          etapesOf.sort((a, b) => a.ordre - b.ordre);
          recette.etapes = etapesOf.map(e => e.desc).filter(Boolean);

          imported.push(recette);
        }

        if (imported.length === 0) { alertLegacy('Aucune recette valide trouvée dans le fichier.'); return; }
        setRecettes(prev => [...imported, ...prev]);
        setSelectedId(imported[0].id);

        // Push vers Supabase si configuré
        if (legacySB) {
          try {
            for (const rec of imported) {
              await legacySB.db.upsertRecette(rec);
            }
          } catch (err) {
            notifyLegacy(`⚠ Import réussi localement mais erreur de synchronisation : ${err.message}`, 'error');
            return;
          }
        }

        alertLegacy(`✓ ${imported.length} recette${imported.length > 1 ? 's' : ''} importée${imported.length > 1 ? 's' : ''} avec succès.`);
      } catch (err) {
        console.error(err);
        notifyLegacy('Erreur lors de l\'import : ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // reset input
  };

  // ── Actions ingrédients
  const addIngredient = () => {
    if (!selected) return;
    const newIng = { id: 'i' + Date.now(), nom: '', quantite: 0, unite: 'g', prixUnit: 0, categorie: 'Autres' };
    updateSelected({ ingredients: [...selected.ingredients, newIng] });
  };

  const updateIngredient = (idx, field, value) => {
    const updated = [...(selected.ingredients || [])];
    updated[idx] = { ...updated[idx], [field]: value };
    updateSelected({ ingredients: updated });
  };

  const removeIngredient = (idx) => {
    const updated = (selected.ingredients || []).filter((_, i) => i !== idx);
    updateSelected({ ingredients: updated });
  };

  // Lie un produit du catalogue à un ingrédient (par index OU par id)
  // Adapte le prixUnit en fonction de l'unité actuelle de l'ingrédient si elle existe
  // et est compatible avec l'unité du catalogue. Sinon utilise l'unité du catalogue.
  const linkProductToIngredient = (idx, p, opts = {}) => {
    const updated = [...(selected.ingredients || [])];
    if (idx < 0 || idx >= updated.length) return;
    const ing = updated[idx];
    const catUnit = p.uniteRef || 'g';
    const catPrice = Number(p.prixUnitaire) || 0;
    // Si l'ingrédient a déjà une unité compatible (g/kg ou ml/L), on garde cette unité
    // et on convertit le prix. Sinon on adopte l'unité du catalogue.
    let finalUnit = catUnit;
    let finalPrix = catPrice;
    if (ing.unite && ing.unite !== catUnit) {
      const factor = convertFactor(catUnit, ing.unite);
      if (factor !== null) {
        finalUnit = ing.unite;
        finalPrix = catPrice * factor;
      }
    }
    updated[idx] = {
      ...ing,
      nom: p.nom,
      unite: finalUnit,
      prixUnit: Math.round(finalPrix * 1000000) / 1000000,
      produitId: p.id,
    };
    // ─── BUG FIX : un seul appel updateSelected pour éviter la race condition ───
    const patch = { ingredients: updated };
    if (p.allergenes && p.allergenes.length > 0 && !opts.skipAllergenes) {
      const current = selected.allergenesIds || [];
      const merged = [...new Set([...current, ...p.allergenes])];
      if (merged.length > current.length) {
        patch.allergenesIds = merged;
      }
    }
    updateSelected(patch);
  };

  // ── Actions étapes
  const addEtape = () => {
    if (!selected) return;
    updateSelected({ etapes: [...selected.etapes, ''] });
  };

  const updateEtape = (idx, value) => {
    const updated = [...(selected.etapes || [])];
    updated[idx] = value;
    updateSelected({ etapes: updated });
  };

  const removeEtape = (idx) => {
    updateSelected({ etapes: selected.etapes.filter((_, i) => i !== idx) });
  };

  const moveEtape = (idx, direction) => {
    const updated = [...(selected.etapes || [])];
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= updated.length) return;
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    updateSelected({ etapes: updated });
  };

  // ── Allergènes toggle
  const toggleAllergene = (aid) => {
    const current = selected.allergenesIds || [];
    const next = current.includes(aid) ? current.filter(a => a !== aid) : [...current, aid];
    updateSelected({ allergenesIds: next });
  };

  // ── Calculs dérivés pour affichage live
  const coutMatiere = selected ? (selected.ingredients || []).reduce((s, i) => s + (Number(i.quantite) || 0) * (Number(i.prixUnit) || 0), 0) : 0;
  const coutPortion = (selected?.portions > 0) ? coutMatiere / Number(selected.portions) : 0;
  const foodCost = selected && selected.prixVente ? (coutPortion / selected.prixVente * 100) : null;
  const margeBrute = selected && selected.prixVente ? selected.prixVente - coutPortion : 0;
  const tempsTotal = selected ? (Number(selected.tempsPreparation) || 0) + (Number(selected.tempsCuisson) || 0) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Barre d'onglets — espace admin consultant */}
      <div style={cts.tabsBar} className="no-print">
        <button
          style={{ ...cts.tabBtn, ...(activeTab === 'recettes' ? cts.tabBtnActive : {}) }}
          onClick={() => setActiveTab('recettes')}
        >📖 Plats & Recettes</button>
        <button
          style={{ ...cts.tabBtn, ...(activeTab === 'creation_carte' ? cts.tabBtnActive : {}) }}
          onClick={() => setActiveTab('creation_carte')}
        >Création carte</button>
        <button
          style={{ ...cts.tabBtn, ...(activeTab === 'simulation' ? cts.tabBtnActive : {}) }}
          onClick={() => setActiveTab('simulation')}
        >📊 Simulation carte</button>
        <div style={cts.tabsDivider} />
        <button
          style={{ ...cts.tabBtn, ...(activeTab === 'roles' ? cts.tabBtnActive : {}) }}
          onClick={() => setActiveTab('roles')}
        >🔐 Rôles & accès</button>
        <button
          style={{ ...cts.tabBtn, ...(activeTab === 'etablissements' ? cts.tabBtnActive : {}) }}
          onClick={() => setActiveTab('etablissements')}
        >🏛 Établissements</button>
        <button
          style={{ ...cts.tabBtn, ...(activeTab === 'factures' ? cts.tabBtnActive : {}) }}
          onClick={() => setActiveTab('factures')}
        >€ Factures</button>
      </div>

      {/* Routage des onglets — reutilise les composants migres via imports.
          Chaque onglet est isolé dans un SafeModule pour qu'un crash n'affecte pas les autres. */}
      {activeTab === 'creation_carte' ? (
        SafeModule
          ? <SafeModule name="Création de carte"><CarteCreator plats={plats} recettes={recettesEtab} etablissement={etablissement} legacySB={legacySB} etabId={etabId} user={user}/></SafeModule>
          : <CarteCreator plats={plats} recettes={recettesEtab} etablissement={etablissement} legacySB={legacySB} etabId={etabId} user={user}/>
      ) : activeTab === 'simulation' ? (
        SafeModule
          ? <SafeModule name="Simulation carte"><CarteSimulation plats={plats} recettes={recettesEtab} etablissement={etablissement}/></SafeModule>
          : <CarteSimulation plats={plats} recettes={recettesEtab} etablissement={etablissement}/>
      ) : activeTab === 'roles' ? (
        Roles
          ? (SafeModule
              ? <SafeModule name="Rôles & accès">{React.createElement(Roles, { user })}</SafeModule>
              : React.createElement(Roles, { user }))
          : <div style={cts.fallback}>Module Rôles & accès non chargé.</div>
      ) : activeTab === 'etablissements' ? (
        Parametres
          ? (SafeModule
              ? <SafeModule name="Établissements">{React.createElement(Parametres, { user })}</SafeModule>
              : React.createElement(Parametres, { user }))
          : <div style={cts.fallback}>Module Établissements non chargé.</div>
      ) : activeTab === 'factures' ? (
        Factures
          ? (SafeModule
              ? <SafeModule name="Factures">{React.createElement(Factures, { user, etablissement })}</SafeModule>
              : React.createElement(Factures, { user, etablissement }))
          : <div style={cts.fallback}>Module Factures non chargé.</div>
      ) : (
    <div style={cts.root}>
      {/* Colonne gauche : liste */}
      <div style={cts.leftCol} className="no-print">
        <div style={cts.leftHeader}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ ...cts.newBtn, flex: 1 }} onClick={createNew}>+ Recette</button>
            <button
              style={{ ...cts.newBtn, flex: 1, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
              onClick={() => { setEditPlat(null); setShowPlatForm(true); }}
            >+ Plat</button>
          </div>
          <input
            style={cts.search}
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{display:'flex', gap:6, marginTop:8}}>
            <button style={{...cts.ghostBtn, flex:1, fontSize:11, padding:'6px 8px'}} onClick={downloadTemplate}>📄 Template XLSX</button>
            <label style={{...cts.ghostBtn, flex:1, fontSize:11, padding:'6px 8px', textAlign:'center', cursor:'pointer'}}>
              📥 Importer XLSX
              <input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImportXLSX}/>
            </label>
          </div>
        </div>
        <div style={cts.leftList}>
          {(() => {
            // Construction de l'arborescence : pour chaque plat, trouver ses recettes
            const recettesParPlat = {};
            const recettesOrphelines = [...filtered];
            (plats || []).forEach(p => {
              const ids = (p.recettes || []).map(pr => pr.recetteId);
              recettesParPlat[p.id] = filtered.filter(r => ids.includes(r.id));
              // Retirer ces recettes des orphelines (mais sans déduplication car une recette peut être dans plusieurs plats)
            });
            // Une recette est orpheline SEULEMENT si elle n'apparaît dans aucun plat
            const allLinkedRecetteIds = new Set();
            (plats || []).forEach(p => (p.recettes || []).forEach(pr => allLinkedRecetteIds.add(pr.recetteId)));
            const orphelines = filtered.filter(r => !allLinkedRecetteIds.has(r.id));

            const renderRecetteItem = (r, indent = 0) => (
              <div
                key={r.id + '-' + indent}
                style={{
                  ...cts.recetteItem,
                  ...(selectedId === r.id ? cts.recetteItemActive : {}),
                  paddingLeft: 14 + indent * 18,
                }}
                onClick={() => setSelectedId(r.id)}
              >
                <div style={cts.recItemName}>
                  {indent > 0 && <span style={{ color: 'var(--text2)', marginRight: 4 }}>↳</span>}
                  {r.nom}
                </div>
                <div style={cts.recItemMeta}>
                  {r.categorie} · {r.portions || '?'} p. · v{r.version || 1}
                  {r.foodCost && (
                    <span style={{ marginLeft: 6, color: r.foodCost < 30 ? '#16a34a' : r.foodCost < 35 ? '#d97706' : '#dc2626', fontWeight: 600 }}>
                      {' '}FC {r.foodCost.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            );

            const visiblePlats = (plats || []).filter(p =>
              searchValue === '' ||
              safeText(p.nom).includes(searchValue) ||
              recettesParPlat[p.id]?.length > 0
            );

            return (
              <>
                {/* ─── Plats avec leurs recettes ─── */}
                {visiblePlats.length === 0 && plats.length === 0 && (
                  <div style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text2)', borderBottom: '1px solid var(--border)', fontStyle: 'italic' }}>
                    Aucun plat. Cliquez "+ Plat" pour créer une hiérarchie.
                  </div>
                )}
                {visiblePlats.map(plat => {
                  const platRecettes = recettesParPlat[plat.id] || [];
                  const isExpanded = expandedPlats.has(plat.id);
                  return (
                    <div key={plat.id}>
                      <div
                        style={{
                          ...cts.platHeader,
                          background: isExpanded ? 'var(--bg)' : 'transparent',
                        }}
                      >
                        <button
                          style={cts.platToggle}
                          onClick={() => {
                            const next = new Set(expandedPlats);
                            isExpanded ? next.delete(plat.id) : next.add(plat.id);
                            setExpandedPlats(next);
                          }}
                          title={isExpanded ? 'Réduire' : 'Développer'}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={cts.platName}>🍽 {plat.nom}</div>
                          <div style={cts.platMeta}>
                            {plat.categorie}
                            {plat.prixVente != null && ` · CHF ${plat.prixVente.toFixed(2)}`}
                            {' · '}{platRecettes.length} recette{platRecettes.length > 1 ? 's' : ''}
                          </div>
                        </div>
                        <button
                          style={cts.platEditBtn}
                          onClick={() => { setEditPlat(plat); setShowPlatForm(true); }}
                          title="Modifier le plat"
                        >✎</button>
                      </div>
                      {isExpanded && (
                        <>
                          {platRecettes.length === 0 ? (
                            <div style={{ padding: '8px 14px 8px 38px', fontSize: 11, color: 'var(--text2)', fontStyle: 'italic' }}>
                              Aucune recette rattachée
                            </div>
                          ) : (
                            platRecettes.map(r => renderRecetteItem(r, 1))
                          )}
                        </>
                      )}
                    </div>
                  );
                })}

                {/* ─── Recettes orphelines (non rattachées à un plat) ─── */}
                {orphelines.length > 0 && (
                  <>
                    {plats.length > 0 && (
                      <div style={cts.orphelinHeader}>
                        Recettes sans plat ({orphelines.length})
                      </div>
                    )}
                    {orphelines.map(r => renderRecetteItem(r, 0))}
                  </>
                )}

                {filtered.length === 0 && (
                  <div style={{padding: 16, fontSize: 12, color: 'var(--text2)'}}>Aucune recette.</div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Colonne droite : éditeur */}
      {!selected ? (
        <div style={cts.emptyState}>
          <div style={{ fontSize: 40, opacity: 0.4 }}>📖</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>Aucune recette sélectionnée</div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>Créez une nouvelle recette ou sélectionnez-en une dans la liste.</div>
          <button style={cts.newBtn} onClick={createNew}>+ Nouvelle recette</button>
        </div>
      ) : (
        <div style={cts.rightCol}>
          {/* Bannière de restauration de brouillons non sauvegardés */}
          {pendingDrafts.length > 0 && (
            <div className="no-print" style={{
              margin: '0 0 10px', padding: '10px 14px', borderRadius: 8,
              background: '#fef3c7', border: '1px solid #fde68a',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 13, color: '#92400e', flex: 1, minWidth: 200 }}>
                ⚠ {pendingDrafts.length} brouillon(s) non sauvegardé(s) détecté(s) — des modifications locales n'ont pas été synchronisées.
              </span>
              <button
                style={{ ...cts.ghostBtn, background: '#15803d', color: '#fff', borderColor: '#15803d' }}
                onClick={restoreDrafts}
              >Restaurer</button>
              <button style={cts.ghostBtn} onClick={dismissDrafts}>Ignorer</button>
            </div>
          )}
          {/* Actions bar */}
          <div style={cts.actionBar} className="no-print">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={cts.ghostBtn} onClick={duplicate}>⧉ Dupliquer</button>
              <button
                style={{ ...cts.ghostBtn, background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}
                onClick={() => setLinkPlatPickerForRecette(selected.id)}
              >
                🍽 Rattacher à un plat
                {(() => {
                  const linkedCount = plats.filter(p => p.recettes.some(pr => pr.recetteId === selected.id)).length;
                  return linkedCount > 0 ? ` (${linkedCount})` : '';
                })()}
              </button>
              <button style={{...cts.ghostBtn, color: '#dc2626', borderColor: '#fca5a5'}} onClick={() => setShowDeleteConfirm(true)}>🗑 Supprimer</button>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {saveStatus === 'saving' && <span style={{ fontSize: 11, color: 'var(--text2)' }}>⏳ Sauvegarde…</span>}
              {saveStatus === 'saved' && <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>✓ Sauvegardé</span>}
              {saveStatus === 'error' && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }} title={saveError}>⚠ Erreur sync</span>}
              <button style={cts.ghostBtn} onClick={() => pdfUtils?.printElement('consultant-recette-print', 'Fiche recette ' + selected.nom)}>🖨 Imprimer</button>
              <button style={cts.ghostBtn} onClick={() => pdfUtils?.exportElementToPdf('consultant-recette-print', `recette-${selected.nom.replace(/[^a-z0-9]/gi,'_')}.pdf`)}>⬇ Export PDF</button>
            </div>
          </div>

          <div id="consultant-recette-print" style={cts.printZone}>
            {/* Header édition */}
            <div style={cts.header}>
              {/* Photo */}
              <PhotoUploader
                photoUrl={selected.photoUrl}
                emoji="📖"
                onUpload={async (file) => {
                  try {
                    const { url } = await legacySB.db.uploadRecettePhoto({ etabId, type: 'recette', id: selected.id, file });
                    updateSelected({ photoUrl: url });
                  } catch (err) { notifyLegacy('Erreur upload : ' + err.message, 'error'); }
                }}
                onRemove={() => updateSelected({ photoUrl: null })}
              />
              <div style={{flex: 1}}>
                <DebouncedField
                  type="text"
                  value={selected.nom || ''}
                  onCommit={v => updateSelected({ nom: v })}
                  style={cts.titleInput}
                  placeholder="Nom de la recette"
                />
                <div style={{display: 'flex', gap: 14, marginTop: 8, alignItems: 'center', flexWrap: 'wrap'}}>
                  <div style={cts.inlineField}>
                    <label>Catégorie</label>
                    <select value={selected.categorie || 'Plats'} onChange={e => updateSelected({ categorie: e.target.value })} style={cts.inlineInput}>
                      {CATEGORIES_REC.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={cts.inlineField}>
                    <label>Statut</label>
                    <select value={selected.statut || 'brouillon'} onChange={e => updateSelected({ statut: e.target.value })} style={cts.inlineInput}>
                      <option value="brouillon">Brouillon</option>
                      <option value="active">Active</option>
                      <option value="archivée">Archivée</option>
                    </select>
                  </div>
                  <div style={cts.inlineField}>
                    <label>Version</label>
                    <DebouncedField type="number" min="1" value={selected.version || 1} onCommit={v => updateSelected({ version: Number(v) || 1 })} style={{...cts.inlineInput, width: 60}} />
                  </div>
                  <div style={{...cts.inlineField, marginLeft:'auto'}}>
                    <label style={{fontSize:11, fontWeight:600, color:'#15803d'}}>Publier sur la carte active</label>
                    <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'6px 10px', background: isRecetteActive(selected) ? '#dcfce7' : '#f3f4f6', border:'1px solid', borderColor: isRecetteActive(selected) ? '#86efac' : 'var(--border)', borderRadius:8}}>
                      <input type="checkbox"
                        checked={isRecetteActive(selected)}
                        onChange={e => toggleActifSurCarte(selected, e.target.checked)}
                        style={{accentColor:'#15803d'}}/>
                      <span style={{fontSize:12, fontWeight:600, color: isRecetteActive(selected) ? '#15803d' : 'var(--text2)'}}>
                        {isRecetteActive(selected) ? '✓ Visible sur la carte' : 'Non publiée'}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Grille principale */}
            <div style={cts.grid}>
              {/* Bloc paramètres */}
              <div style={cts.card}>
                <div style={cts.cardTitle}>Paramètres</div>
                <div style={cts.paramGrid}>
                  <div style={cts.field}>
                    <label style={cts.label}>Portions</label>
                    <DebouncedField type="number" min="1" value={selected.portions || 1} onCommit={v => updateSelected({ portions: Number(v) })} style={cts.input} />
                  </div>
                  <div style={cts.field}>
                    <label style={cts.label}>Prix vente (CHF)</label>
                    <DebouncedField type="number" min="0" step="0.10" value={selected.prixVente || 0} onCommit={v => updateSelected({ prixVente: Number(v) })} style={cts.input} />
                  </div>
                  <div style={cts.field}>
                    <label style={cts.label}>Temps prépa (min)</label>
                    <DebouncedField type="number" min="0" value={selected.tempsPreparation || 0} onCommit={v => updateSelected({ tempsPreparation: Number(v) })} style={cts.input} />
                  </div>
                  <div style={cts.field}>
                    <label style={cts.label}>Temps cuisson (min)</label>
                    <DebouncedField type="number" min="0" value={selected.tempsCuisson || 0} onCommit={v => updateSelected({ tempsCuisson: Number(v) })} style={cts.input} />
                  </div>
                  <div style={cts.field}>
                    <label style={cts.label}>Temps total (auto)</label>
                    <input type="text" value={`${tempsTotal} min`} disabled style={{ ...cts.input, background: 'var(--bg)', color: 'var(--accent)', fontWeight: 700 }} />
                  </div>
                </div>
              </div>

              {/* Bloc analyse économique */}
              <div style={cts.card}>
                <div style={cts.cardTitle}>Analyse économique</div>
                <div style={cts.kpiGrid}>
                  <div style={cts.kpiItem}>
                    <span style={cts.kpiLabel}>Coût matière total</span>
                    <strong style={{ color: 'var(--text)' }}>CHF {coutMatiere.toFixed(2)}</strong>
                  </div>
                  <div style={cts.kpiItem}>
                    <span style={cts.kpiLabel}>Coût par portion</span>
                    <strong style={{ color: 'var(--accent)' }}>CHF {coutPortion.toFixed(2)}</strong>
                  </div>
                  <div style={cts.kpiItem}>
                    <span style={cts.kpiLabel}>Food cost %</span>
                    <strong style={{ color: foodCost == null ? 'var(--text2)' : foodCost < 30 ? '#16a34a' : foodCost < 35 ? '#d97706' : '#dc2626' }}>
                      {foodCost == null ? '—' : foodCost.toFixed(1) + ' %'}
                    </strong>
                  </div>
                  <div style={cts.kpiItem}>
                    <span style={cts.kpiLabel}>Marge brute / portion</span>
                    <strong style={{ color: margeBrute >= 0 ? '#16a34a' : '#dc2626' }}>CHF {margeBrute.toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              {/* Allergènes */}
              <div style={{...cts.card, gridColumn: '1/-1'}}>
                <div style={cts.cardTitle}>Allergènes</div>
                <div style={{ padding: '10px 14px 4px', fontSize: 11, color: 'var(--text2)', fontStyle: 'italic' }}>
                  {catalogue.length > 0
                    ? '✓ Auto-détectés depuis le catalogue lors de la sélection d\'un ingrédient. Cliquer pour ajuster manuellement.'
                    : 'Sélectionner manuellement. Alimentez le catalogue produits pour une auto-détection.'}
                </div>
                <div style={{ padding: '6px 14px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ALLERGENES_OPTIONS.map(a => {
                    const active = (selected.allergenesIds || []).includes(a.id);
                    return (
                      <button
                        key={a.id}
                        onClick={() => toggleAllergene(a.id)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 20,
                          border: active ? '1px solid #d97706' : '1px solid var(--border)',
                          background: active ? '#fef3c7' : 'var(--surface)',
                          color: active ? '#92400e' : 'var(--text2)',
                          fontSize: 12,
                          fontWeight: active ? 700 : 500,
                          cursor: 'pointer',
                          fontFamily: 'var(--font)'
                        }}
                      >
                        {active ? '✓ ' : '+ '}{a.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ingrédients */}
              <div style={{...cts.card, gridColumn: '1/-1'}}>
                <div style={{...cts.cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8}}>
                  <span>Ingrédients ({(selected.ingredients || []).length})</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(selected.ingredients || []).length > 0 && (
                      <button
                        style={{ padding: '5px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 7, color: '#92400e', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
                        onClick={() => setShowScalingModal(true)}
                      >
                        ⚖ Calculer
                      </button>
                    )}
                    {catalogue.length > 0 && (
                      <button
                        style={{ padding: '5px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
                        onClick={() => setCatalogPicker('multi')}
                      >
                        🔍 Depuis catalogue
                      </button>
                    )}
                    <button style={cts.smallBtn} onClick={addIngredient}>+ Ingrédient</button>
                  </div>
                </div>

                <div style={{padding: 14}}>
                  <div style={cts.ingHead}>
                    <span>Nom</span>
                    <span>
                      Qté
                      {parseFloat(scalingPortions) > 0 && parseFloat(scalingPortions) !== Number(selected.portions) && (
                        <span style={{ fontSize: 10, color: '#92400e', marginLeft: 4 }}>(recalculé)</span>
                      )}
                    </span>
                    <span>Unité</span>
                    <span>Prix / unité</span>
                    <span>Coût</span>
                    <span></span>
                  </div>
                  {(selected.ingredients || []).length === 0 && (
                    <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' }}>
                      Aucun ingrédient. Cliquez sur "+ Ingrédient" pour commencer.
                    </div>
                  )}
                  {(selected.ingredients || []).map((ing, idx) => {
                    // Suggestions discrètes (3+ chars, max 5 résultats)
                    const showSugg = (ing.nom || '').length >= 3 && catalogue.length > 0 && !ing.produitId;
                    const suggestions = showSugg
                      ? catalogue
                          .filter(p => safeText(p.nom).includes(safeText(ing.nom)))
                          .slice(0, 5)
                      : [];
                    const isLinked = !!ing.produitId;

                    return (
                    <div key={ing.id} style={{ ...cts.ingRow, position: 'relative' }}>
                      {/* Champ nom */}
                      <div style={{ position: 'relative', flex: 2, display: 'flex', alignItems: 'stretch', gap: 4 }}>
                        {isLinked && (
                          <span
                            style={{ display: 'flex', alignItems: 'center', padding: '0 6px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 5, fontSize: 11, color: '#15803d', cursor: 'pointer' }}
                            title="Lié au catalogue · clic pour délier"
                            onClick={() => updateIngredient(idx, 'produitId', null)}
                          >⛓</span>
                        )}
                        <DebouncedField
                          key={`${ing.id}:${ing.produitId || ''}`}
                          type="text"
                          value={ing.nom || ''}
                          onCommit={v => {
                            if (isLinked) {
                              const updated = [...(selected.ingredients || [])];
                              updated[idx] = { ...updated[idx], produitId: null, nom: v };
                              updateSelected({ ingredients: updated });
                            } else {
                              updateIngredient(idx, 'nom', v);
                            }
                          }}
                          placeholder="Ingrédient"
                          style={{ ...cts.ingInput, flex: 1, width: 'auto' }}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          style={{ padding: '0 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12, cursor: 'pointer', color: 'var(--text2)', whiteSpace: 'nowrap' }}
                          title="Choisir depuis le catalogue"
                          onClick={() => setCatalogPicker(ing.id)}
                        >🔍</button>
                        {suggestions.length > 0 && (
                          <div style={cts.suggestionsCompact}>
                            {(suggestions || []).map(p => (
                              <div key={p.id} style={cts.suggItemCompact}
                                onMouseDown={() => linkProductToIngredient(idx, p)}
                              >
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
                                {p.prixUnitaire > 0 && <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-serif)', whiteSpace: 'nowrap', marginLeft: 6 }}>{p.prixUnitaire.toFixed(3)}/{p.uniteRef}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <DebouncedField type="number" min="0" step="0.01" value={ing.quantite} onCommit={v => updateIngredient(idx, 'quantite', Number(v))} style={cts.ingInput} />
                      <select value={ing.unite} onChange={e => {
                        const newUnit = e.target.value;
                        const oldUnit = ing.unite;
                        const factor = convertFactor(oldUnit, newUnit);
                        // Mise à jour groupée en un seul updateSelected : évite 3 re-renders
                        // et 3 reports du debounce pour une seule action de l'utilisateur.
                        const updated = [...(selected.ingredients || [])];
                        if (factor !== null && factor !== 1) {
                          // Conversion automatique : on ajuste à la fois la quantité ET le prix
                          // Ex: 500 g à 0.005 CHF/g → 0.5 kg à 5 CHF/kg (cohérent)
                          const newQty = (Number(ing.quantite) || 0) / factor;
                          const newPrix = (Number(ing.prixUnit) || 0) * factor;
                          updated[idx] = {
                            ...updated[idx],
                            unite: newUnit,
                            quantite: Math.round(newQty * 10000) / 10000,
                            prixUnit: Math.round(newPrix * 100000) / 100000,
                          };
                        } else {
                          updated[idx] = { ...updated[idx], unite: newUnit };
                        }
                        updateSelected({ ingredients: updated });
                      }} style={cts.ingInput}>
                        {UNITES_REC.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <DebouncedField
                        type="number" min="0" step="0.001"
                        value={ing.prixUnit}
                        onCommit={v => updateIngredient(idx, 'prixUnit', Number(v))}
                        style={cts.ingInput}
                      />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', alignSelf: 'center', textAlign: 'right' }}>
                        {((Number(ing.quantite) || 0) * (Number(ing.prixUnit) || 0)).toFixed(2)}
                      </span>
                      <button onClick={() => removeIngredient(idx)} style={cts.deleteLineBtn} title="Supprimer">✕</button>
                    </div>
                    );
                  })}
                </div>
              </div>

              {/* Étapes */}
              <div style={{...cts.card, gridColumn: '1/-1'}}>
                <div style={{...cts.cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <span>Étapes de préparation ({selected.etapes.length})</span>
                  <button style={cts.smallBtn} onClick={addEtape}>+ Étape</button>
                </div>
                <div style={{padding: 14}}>
                  {selected.etapes.length === 0 && (
                    <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' }}>
                      Aucune étape. Cliquez sur "+ Étape" pour détailler la préparation.
                    </div>
                  )}
                  {(selected.etapes || []).map((etape, idx) => (
                    <div key={idx} style={cts.etapeRow}>
                      <div style={cts.etapeNum}>{idx + 1}</div>
                      <DebouncedField
                        as="textarea"
                        value={etape || ''}
                        onCommit={v => updateEtape(idx, v)}
                        placeholder="Décrire l'étape…"
                        rows={2}
                        style={cts.etapeInput}
                      />
                      <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                        <button onClick={() => moveEtape(idx, -1)} disabled={idx === 0} style={cts.moveBtn} title="Monter">▲</button>
                        <button onClick={() => moveEtape(idx, 1)} disabled={idx === selected.etapes.length - 1} style={cts.moveBtn} title="Descendre">▼</button>
                      </div>
                      <button onClick={() => removeEtape(idx)} style={cts.deleteLineBtn} title="Supprimer">✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes & dressage */}
              <div style={cts.card}>
                <div style={cts.cardTitle}>Notes du consultant</div>
                <div style={{padding: 14}}>
                  <DebouncedField
                    as="textarea"
                    value={selected.notesConsultant || ''}
                    onCommit={v => updateSelected({ notesConsultant: v })}
                    placeholder="Conseils techniques, points d'attention, tours de main…"
                    rows={5}
                    style={cts.textarea}
                  />
                </div>
              </div>
              <div style={cts.card}>
                <div style={cts.cardTitle}>Dressage & conservation</div>
                <div style={{padding: 14, display: 'flex', flexDirection: 'column', gap: 10}}>
                  <div>
                    <label style={cts.label}>Dressage</label>
                    <DebouncedField
                      as="textarea"
                      value={selected.dressage || ''}
                      onCommit={v => updateSelected({ dressage: v })}
                      placeholder="Présentation de l'assiette…"
                      rows={2}
                      style={cts.textarea}
                    />
                  </div>
                  <div>
                    <label style={cts.label}>Conservation</label>
                    <DebouncedField
                      as="textarea"
                      value={selected.conservation || ''}
                      onCommit={v => updateSelected({ conservation: v })}
                      placeholder="Durée, température, conditionnement…"
                      rows={2}
                      style={cts.textarea}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modale suppression — enrichie : montre les plats impactés */}
      {showDeleteConfirm && (() => {
        // Cherche dans les plats ceux qui contiennent cette recette
        const platsImpactes = (plats || []).filter(p =>
          (p.recettes || []).some(pr => pr.recetteId === selected?.id)
        );
        return (
          <div style={cts.overlay} onClick={() => setShowDeleteConfirm(false)}>
            <div style={cts.modal} onClick={e => e.stopPropagation()}>
              <div style={{padding: 20, maxWidth: 480}}>
                <div style={{fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)', marginBottom: 10}}>
                  Supprimer cette recette ?
                </div>
                <div style={{fontSize: 13, color: 'var(--text2)', marginBottom: 12}}>
                  Vous êtes sur le point de supprimer <strong>{selected?.nom}</strong>. Cette action est irréversible.
                </div>

                {/* Avertissement plats impactés */}
                {platsImpactes.length > 0 && (
                  <div style={{
                    background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8,
                    padding: 12, marginBottom: 14,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                      ⚠ Cette recette est utilisée dans {platsImpactes.length} plat{platsImpactes.length > 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#92400e', marginBottom: 8, lineHeight: 1.5 }}>
                      Si vous supprimez la recette, ces plats perdront leur composante (les autres recettes liées resteront en place) :
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#78350f' }}>
                      {platsImpactes.slice(0, 8).map(p => (
                        <li key={p.id} style={{ marginBottom: 2 }}>
                          <strong>{p.nom}</strong>
                          <span style={{ color: '#92400e', fontSize: 11 }}> — {p.categorie}</span>
                        </li>
                      ))}
                      {platsImpactes.length > 8 && (
                        <li style={{ fontStyle: 'italic' }}>… et {platsImpactes.length - 8} autre{platsImpactes.length - 8 > 1 ? 's' : ''}</li>
                      )}
                    </ul>
                  </div>
                )}

                <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
                  <button style={cts.ghostBtn} onClick={() => setShowDeleteConfirm(false)}>Annuler</button>
                  <button style={{...cts.newBtn, background: '#dc2626'}} onClick={deleteRecette}>
                    {platsImpactes.length > 0 ? 'Supprimer quand même' : 'Supprimer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Modale calculateur de quantités ─── */}
      {/* ─── Modale création/édition plat ─── */}
      {showPlatForm && (() => {
        const p = editPlat || { nom: '', categorie: 'Plats', prixVente: '', description: '' };
        const setP = (patch) => setEditPlat({ ...p, ...patch });
        const savePlat = async () => {
          if (!p.nom?.trim()) { alertLegacy('Le nom du plat est obligatoire.'); return; }
          try {
            await legacySB.db.upsertPlat({
              ...p,
              etablissementId: etabId,
              prixVente: p.prixVente === '' ? null : Number(p.prixVente),
            });
            setShowPlatForm(false);
            setEditPlat(null);
          } catch (err) {
            notifyLegacy('Erreur : ' + err.message, 'error');
          }
        };
        const deletePlat = async () => {
          if (!p.id) return;
          if (!confirmLegacy(`Supprimer le plat "${p.nom}" ? Les recettes restent, mais elles ne seront plus rattachées à ce plat.`)) return;
          try {
            await legacySB.db.deletePlat(p.id);
            setShowPlatForm(false);
            setEditPlat(null);
          } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
        };
        return (
          <div style={cts.overlay} onClick={() => { setShowPlatForm(false); setEditPlat(null); }}>
            <div style={{ ...cts.modal, width: 480, maxWidth: '94vw' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>
                  🍽 {p.id ? 'Modifier le plat' : 'Nouveau plat'}
                </div>
                <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' }} onClick={() => { setShowPlatForm(false); setEditPlat(null); }}>✕</button>
              </div>
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <PhotoUploader
                    photoUrl={p.photoUrl}
                    emoji="🍽"
                    onUpload={async (file) => {
                      // Pour les nouveaux plats sans id, on génère un id temporaire
                      const tempId = p.id || ('plat-temp-' + Date.now());
                      try {
                        const { url } = await legacySB.db.uploadRecettePhoto({ etabId, type: 'plat', id: tempId, file });
                        setP({ photoUrl: url });
                      } catch (err) { notifyLegacy('Erreur upload : ' + err.message, 'error'); }
                    }}
                    onRemove={() => setP({ photoUrl: null })}
                  />
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Nom du plat *</label>
                    <input
                      autoFocus
                      type="text"
                      value={p.nom || ''}
                      onChange={e => setP({ nom: e.target.value })}
                      placeholder="Ex: Filet de bœuf Rossini"
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 14, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', marginTop: 4 }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Catégorie</label>
                    <select
                      value={p.categorie || 'Plats'}
                      onChange={e => setP({ categorie: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 14, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', marginTop: 4, cursor: 'pointer' }}
                    >
                      {['Entrées', 'Plats', 'Poissons', 'Viandes', 'Pâtes & Risottos', 'Fromages', 'Desserts', 'Boissons', 'Menus'].map(c =>
                        <option key={c} value={c}>{c}</option>
                      )}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Prix de vente (CHF)</label>
                    <input
                      type="number" min="0" step="0.50"
                      value={p.prixVente ?? ''}
                      onChange={e => setP({ prixVente: e.target.value })}
                      placeholder="0.00"
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 14, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', marginTop: 4 }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Description (optionnelle)</label>
                  <textarea
                    value={p.description || ''}
                    onChange={e => setP({ description: e.target.value })}
                    placeholder="Description courte du plat pour la carte…"
                    rows={2}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', marginTop: 4, resize: 'vertical' }}
                  />
                </div>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                {p.id && (
                  <button style={{ ...cts.ghostBtn, color: '#dc2626', borderColor: '#fca5a5' }} onClick={deletePlat}>🗑 Supprimer</button>
                )}
                <div style={{ flex: 1 }} />
                <button style={cts.ghostBtn} onClick={() => { setShowPlatForm(false); setEditPlat(null); }}>Annuler</button>
                <button style={{ ...cts.newBtn, padding: '8px 16px' }} onClick={savePlat}>{p.id ? 'Enregistrer' : 'Créer le plat'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Modale rattacher recette à un plat ─── */}
      {linkPlatPickerForRecette !== null && selected && (() => {
        const linkedPlatIds = new Set(
          plats.filter(p => p.recettes.some(pr => pr.recetteId === selected.id)).map(p => p.id)
        );
        return (
          <div style={cts.overlay} onClick={() => setLinkPlatPickerForRecette(null)}>
            <div style={{ ...cts.modal, width: 460, maxWidth: '94vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>🍽 Rattacher à un plat</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>"{selected.nom}" peut appartenir à plusieurs plats</div>
                </div>
                <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' }} onClick={() => setLinkPlatPickerForRecette(null)}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {plats.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
                    Aucun plat. Créez-en d'abord avec "+ Plat".
                  </div>
                ) : (
                  plats.map(p => {
                    const isLinked = linkedPlatIds.has(p.id);
                    return (
                      <div key={p.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
                          borderBottom: '1px solid var(--border)', cursor: 'pointer',
                          background: isLinked ? '#dcfce7' : 'transparent',
                        }}
                        onClick={async () => {
                          try {
                            if (isLinked) {
                              await legacySB.db.unlinkRecetteFromPlat(p.id, selected.id);
                            } else {
                              await legacySB.db.linkRecetteToPlat(p.id, selected.id, 'composant', 0);
                            }
                          } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
                        }}
                      >
                        <span style={{ fontSize: 14 }}>{isLinked ? '✓' : '○'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.nom}</div>
                          <div style={{ fontSize: 11, color: 'var(--text2)' }}>{p.categorie}{p.prixVente != null ? ` · CHF ${p.prixVente.toFixed(2)}` : ''}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                <button style={cts.ghostBtn} onClick={() => setLinkPlatPickerForRecette(null)}>Fermer</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Modale picker catalogue ─── */}
      {catalogPicker !== null && selected && (() => {
        const isMultiMode = catalogPicker === 'multi';
        const cats = ['Tous', ...new Set(catalogue.map(p => p.categorie).filter(Boolean))];
        const filtered = catalogue.filter(p =>
          (pickerCat === 'Tous' || p.categorie === pickerCat) &&
          (safeText(pickerSearch) === '' || safeText(p.nom).includes(safeText(pickerSearch)))
        ).sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || '')));

        const linkProductToLine = (p, lineIdx) => linkProductToIngredient(lineIdx, p);

        const addMultiple = () => {
          const ingsToAdd = [...pickerSelected].map(pid => catalogue.find(p => p.id === pid)).filter(Boolean);
          const newIngs = [...(selected.ingredients || [])];
          let allergsToMerge = new Set(selected.allergenesIds || []);
          for (const p of ingsToAdd) {
            newIngs.push({
              id: 'i-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
              nom: p.nom,
              quantite: 0,
              unite: p.uniteRef || 'g',
              prixUnit: p.prixUnitaire || 0,
              produitId: p.id,
              prixUnit_old: undefined,
            });
            (p.allergenes || []).forEach(a => allergsToMerge.add(a));
          }
          updateSelected({ ingredients: newIngs, allergenesIds: [...allergsToMerge] });
          setCatalogPicker(null);
        };

        return (
          <div style={cts.overlay} onClick={() => setCatalogPicker(null)}>
            <div style={{ ...cts.modal, width: 700, maxWidth: '94vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>
                    🔍 {isMultiMode ? 'Ajouter depuis le catalogue' : 'Choisir un produit'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                    {isMultiMode
                      ? 'Sélectionnez plusieurs produits puis cliquez sur "Ajouter"'
                      : 'Cliquez sur un produit pour remplacer cet ingrédient'}
                  </div>
                </div>
                <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' }} onClick={() => setCatalogPicker(null)}>✕</button>
              </div>

              {/* Filtres */}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  autoFocus
                  type="text"
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  placeholder="Rechercher un produit…"
                  style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)' }}
                />
                <select
                  value={pickerCat}
                  onChange={e => setPickerCat(e.target.value)}
                  style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}
                >
                  {cats.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Liste produits */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
                    {catalogue.length === 0 ? 'Catalogue vide. Ajoutez des produits dans le module Catalogue.' : 'Aucun produit ne correspond à votre recherche.'}
                  </div>
                ) : (
                  filtered.map(p => {
                    const isPickerChecked = isMultiMode && pickerSelected.has(p.id);
                    return (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px',
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          background: isPickerChecked ? 'var(--accent-light)' : 'transparent',
                        }}
                        onClick={() => {
                          if (isMultiMode) {
                            const next = new Set(pickerSelected);
                            isPickerChecked ? next.delete(p.id) : next.add(p.id);
                            setPickerSelected(next);
                          } else {
                            // Mode remplacement d'une ligne précise
                            const lineIdx = (selected.ingredients || []).findIndex(i => i.id === catalogPicker);
                            if (lineIdx !== -1) linkProductToLine(p, lineIdx);
                            setCatalogPicker(null);
                          }
                        }}
                      >
                        {isMultiMode && (
                          <input type="checkbox" checked={isPickerChecked} readOnly style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</div>
                          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                            {p.categorie}{p.fournisseurNom ? ` · ${p.fournisseurNom}` : ''}{p.referenceFourn ? ` · réf ${p.referenceFourn}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {p.prixUnitaire > 0 ? (
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-serif)' }}>
                              CHF {p.prixUnitaire.toFixed(4)}
                            </div>
                          ) : <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>}
                          <div style={{ fontSize: 10, color: 'var(--text2)' }}>/{p.uniteRef}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                  {filtered.length} produit{filtered.length > 1 ? 's' : ''}
                  {isMultiMode && pickerSelected.size > 0 && ` · ${pickerSelected.size} sélectionné${pickerSelected.size > 1 ? 's' : ''}`}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={cts.ghostBtn} onClick={() => setCatalogPicker(null)}>Annuler</button>
                  {isMultiMode && (
                    <button
                      style={{ ...cts.smallBtn, background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 16px', opacity: pickerSelected.size === 0 ? 0.5 : 1 }}
                      onClick={addMultiple}
                      disabled={pickerSelected.size === 0}
                    >
                      Ajouter {pickerSelected.size > 0 ? `(${pickerSelected.size})` : ''}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showScalingModal && selected && (() => {
        const basePortions = Number(selected.portions) || 1;
        const ings = selected.ingredients || [];

        // ─── Calcul du ratio selon le mode actif ───
        // Priorité : si un ingrédient cible est défini ET que sa qté cible est valide, on utilise ce mode
        // Sinon on utilise le mode portions
        const targetIng = scalingTarget.ingId ? ings.find(i => i.id === scalingTarget.ingId) : null;
        const targetQty = parseFloat(scalingTarget.targetQty);
        const useGramMode = targetIng && !isNaN(targetQty) && targetQty > 0 && Number(targetIng.quantite) > 0;

        let ratio = 1;
        if (useGramMode) {
          ratio = targetQty / Number(targetIng.quantite);
        } else {
          const targetP = parseFloat(scalingPortions);
          if (!isNaN(targetP) && targetP > 0) ratio = targetP / basePortions;
        }
        const isScaled = ratio !== 1;
        const finalPortions = useGramMode ? Math.round(basePortions * ratio * 100) / 100 : (parseFloat(scalingPortions) || basePortions);

        // Ingrédients utilisables comme cible (ceux avec quantité > 0)
        const candidateIngs = ings.filter(i => Number(i.quantite) > 0 && i.nom);

        return (
          <div style={cts.overlay} onClick={() => setShowScalingModal(false)}>
            <div style={{ ...cts.modal, width: 620, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>⚖ Calculateur de quantités</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Les valeurs de base de la recette ne sont pas modifiées</div>
                </div>
                <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' }} onClick={() => setShowScalingModal(false)}>✕</button>
              </div>

              {/* ─── Mode 1 : par portions ─── */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: useGramMode ? 'var(--bg)' : '#fefce8', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.4, width: '100%' }}>
                  Méthode 1 — Par nombre de portions
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                  Base : <strong style={{ color: 'var(--text)' }}>{basePortions} portion{basePortions > 1 ? 's' : ''}</strong>
                </div>
                <span style={{ fontSize: 16, color: 'var(--text2)' }}>→</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Pour :</label>
                  <input
                    type="number" min="0.1" step="1"
                    value={scalingPortions}
                    onChange={e => { setScalingPortions(e.target.value); setScalingTarget({ ingId: '', targetQty: '' }); }}
                    placeholder={String(basePortions)}
                    style={{ width: 70, padding: '7px 10px', border: '2px solid ' + (useGramMode ? 'var(--border)' : 'var(--accent)'), borderRadius: 8, fontSize: 16, fontWeight: 700, textAlign: 'center', fontFamily: 'var(--font)', background: '#fff', color: 'var(--text)' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>portions</span>
                </div>
              </div>

              {/* ─── Mode 2 : par grammage cible ─── */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: useGramMode ? '#fefce8' : 'var(--bg)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.4, width: '100%' }}>
                  Méthode 2 — Par quantité cible d'un ingrédient
                </div>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Avec</span>
                <select
                  value={scalingTarget.ingId}
                  onChange={e => { setScalingTarget({ ingId: e.target.value, targetQty: '' }); setScalingPortions(''); }}
                  style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', maxWidth: 240, cursor: 'pointer' }}
                >
                  <option value="">— Choisir un ingrédient —</option>
                  {candidateIngs.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.nom} ({i.quantite} {i.unite})
                    </option>
                  ))}
                </select>
                {scalingTarget.ingId && targetIng && (
                  <>
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>=</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={scalingTarget.targetQty}
                      onChange={e => { setScalingTarget(prev => ({ ...prev, targetQty: e.target.value })); setScalingPortions(''); }}
                      placeholder={String(targetIng.quantite)}
                      style={{ width: 90, padding: '7px 10px', border: '2px solid ' + (useGramMode ? 'var(--accent)' : 'var(--border)'), borderRadius: 8, fontSize: 16, fontWeight: 700, textAlign: 'center', fontFamily: 'var(--font)', background: '#fff', color: 'var(--text)' }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>{targetIng.unite}</span>
                  </>
                )}
              </div>

              {/* Bandeau de résultat */}
              {isScaled && (
                <div style={{ padding: '10px 20px', background: '#fef3c7', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                    Facteur appliqué : × {ratio < 1 ? ratio.toFixed(3) : Number.isInteger(ratio) ? ratio : ratio.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 12, color: '#92400e' }}>
                    → équivaut à {finalPortions} portion{finalPortions > 1 ? 's' : ''}
                  </div>
                  <button
                    style={{ marginLeft: 'auto', padding: '4px 10px', background: 'none', color: '#92400e', border: '1px solid #fde68a', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}
                    onClick={() => { setScalingPortions(''); setScalingTarget({ ingId: '', targetQty: '' }); }}
                  >
                    Réinitialiser
                  </button>
                </div>
              )}

              {/* Tableau des ingrédients recalculés */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px', gap: 4, padding: '6px 20px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  <span>Ingrédient</span>
                  <span style={{ textAlign: 'right' }}>Base ({basePortions} p.)</span>
                  <span style={{ textAlign: 'right', color: isScaled ? '#92400e' : 'var(--text2)' }}>
                    {isScaled ? `Recalculé` : '—'}
                  </span>
                </div>
                {ings.map((ing, idx) => {
                  const qBase = Number(ing.quantite) || 0;
                  const qCalc = qBase * ratio;
                  const fmt = (q) => {
                    if (q === 0) return '—';
                    if (q >= 1000 && ing.unite === 'g') return `${(q/1000).toFixed(q % 1000 === 0 ? 0 : 2)} kg`;
                    if (q >= 1000 && ing.unite === 'ml') return `${(q/1000).toFixed(q % 1000 === 0 ? 0 : 2)} L`;
                    if (q % 1 === 0) return `${q} ${ing.unite}`;
                    if (q < 1) return `${Math.round(q * 1000) / 1000} ${ing.unite}`;
                    return `${Math.round(q * 10) / 10} ${ing.unite}`;
                  };
                  const isTargetIng = useGramMode && ing.id === scalingTarget.ingId;
                  return (
                    <div key={ing.id || idx} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px', gap: 4, padding: '9px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center', background: isTargetIng ? '#fef3c7' : (idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)') }}>
                      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: isTargetIng ? 700 : 500 }}>
                        {isTargetIng && '🎯 '}{ing.nom || '—'}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'right' }}>{fmt(qBase)}</span>
                      <span style={{ fontSize: 13, fontWeight: isScaled ? 700 : 400, color: isScaled ? '#92400e' : 'var(--text2)', textAlign: 'right' }}>
                        {isScaled ? fmt(qCalc) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text2)', flex: 1 }}>
                  Les valeurs de base restent inchangées.
                </span>
                <button style={cts.ghostBtn} onClick={() => setShowScalingModal(false)}>Fermer</button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
      )}
    </div>
  );
};

// On expose le Gate (qui vérifie le rôle) sous le nom ConsultantTools
// pour que le routing principal n'ait rien à changer.
export default ConsultantToolsGate;
