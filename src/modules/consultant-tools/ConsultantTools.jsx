import React from 'react';
import { getDemoData } from '../../data/demoData.js';
import ImportLauncher from '../recettes/import/ImportLauncher.jsx';
import SafeModule from '../../legacy/SafeModule.jsx';
import { alertLegacy, confirmLegacy, getBrowserWindow, notifyLegacy, readLegacyStorage, writeLegacyStorage } from '../../legacy/legacyApi.js';
import { readText, writeText, removeStorageKeys } from '../../utils/storage.js';
import { Factures } from '../factures/index.js';
import { Parametres } from '../parametres/index.js';
import { Roles } from '../roles/index.js';
import { pdfUtils } from '../../services/pdf.js';
import { CarteSimulation } from './CarteSimulation.jsx';
import { CarteCreator } from './CarteCreator.jsx';
import { dbService } from '../../services/dbService.js';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';

// ─────────────────────────────────────────────────────
// OUTILS CONSULTANT - Création et édition de recettes
// Interface simple : liste à gauche, éditeur à droite
// ─────────────────────────────────────────────────────

import { ALLERGENES_OPTIONS, CATEGORIES_REC, UNITES_REC, adjustPrixUnitForUnit, convertFactor } from './ConsultantTools.constants.js';
import { partitionAllergenes, normalizeAllergenes, labelAllergene } from '../../utils/allergenes.js';
import { CATEGORIES_PLAT } from '../../utils/categoriesPlat.js';
import PhotoUploader from './PhotoUploader.jsx';
import PlatPicker from './components/PlatPicker.jsx';
import EtablissementTransferModal from './components/EtablissementTransferModal.jsx';
import { cts } from './ConsultantTools.styles.js';
import { Copy, UtensilsCrossed, Trash2, ShieldCheck, Sparkles, Loader2, Check, AlertTriangle, Printer, FileDown, Archive, ArchiveRestore } from 'lucide-react';
import DebouncedField from '../../components/ui/DebouncedField.jsx';
import { matchIngredient } from '../../services/recipeProductMatching.js';
import AmbiguousMatchReview from '../recettes/AmbiguousMatchReview.jsx';
import { useSelection } from '../../hooks/useSelection.js';
import { Btn } from '../../components/ui/index.jsx';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import { exportRowsToXlsx } from '../../utils/exportXlsx.js';
import { buildRecettePdfData, slug } from '../../utils/recettePdfData.js';
import AlertRules from './AlertRules.jsx';
import ConsultantOverview from './ConsultantOverview.jsx';
import { normalizeSearch } from '../../utils/searchText.js';

const CONSULTANT_TOOLS_TABS = ['vue', 'recettes', 'creation_carte', 'simulation', 'roles', 'etablissements', 'factures', 'alertes'];
// Dernier onglet visité, restauré à l'ouverture du module (préférence UI locale).
const LAST_TAB_KEY = 'sc_consultant_tools_last_tab';

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

// Applique un produit catalogue à un ingrédient (lien + unité/prix cohérents).
// Renvoie un nouvel objet ingrédient ; ne mute pas l'entrée.
const applyProductToIngredient = (ing, product) => {
  const catUnit = product.uniteRef || 'g';
  const catPrice = Number(product.prixUnitaire) || 0;
  let finalUnit = catUnit;
  let finalPrix = catPrice;
  if (ing.unite && ing.unite !== catUnit) {
    const factor = convertFactor(catUnit, ing.unite);
    if (factor !== null) { finalUnit = ing.unite; finalPrix = catPrice * factor; }
  }
  const next = {
    ...ing,
    nom: product.nom,
    unite: finalUnit,
    prixUnit: Math.round(finalPrix * 1000000) / 1000000,
    produitId: product.id,
  };
  delete next.needsReview;
  delete next.matchSuggestions;
  return next;
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
    const unsub = legacySB.realtime.subscribeReload('produits', async () => {
      try { const ps = await legacySB.db.listProduits(etabId); if (mounted) setCatalogue(Array.isArray(ps) ? ps : []); } catch(e) {}
    });
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId]);

  // ─── Plats (hiérarchie) ───
  const [plats, setPlats] = React.useState([]);
  const [expandedPlats, setExpandedPlats] = React.useState(new Set());
  // Dossiers cartes dépliés (vide = toutes repliées par défaut). L'arborescence
  // tient ainsi sur un écran à l'arrivée : on ouvre la carte qu'on cherche au
  // lieu de scroller tous les plats de toutes les cartes.
  const [expandedCartes, setExpandedCartes] = React.useState(new Set());
  const [showPlatForm, setShowPlatForm] = React.useState(false);
  const [editPlat, setEditPlat] = React.useState(null);
  const [linkPlatPickerForRecette, setLinkPlatPickerForRecette] = React.useState(null);
  // Rattachement groupé : les recettes cochées en mode sélection vers un plat.
  const [bulkLinkPlatOpen, setBulkLinkPlatOpen] = React.useState(false);
  // Transfert groupé : les recettes cochées vers un autre établissement.
  const [bulkTransferOpen, setBulkTransferOpen] = React.useState(false);
  // Établissements accessibles (cibles de transfert). Même filtre que le
  // sélecteur d'établissement de l'entête : un consultant LIT tous les
  // établissements, mais la RLS n'accepte l'écriture que sur ceux de son profil.
  const [etablissementsAll, setEtablissementsAll] = React.useState([]);
  React.useEffect(() => {
    if (!legacySB) { setEtablissementsAll(demoData.etablissements || []); return undefined; }
    let mounted = true;
    legacySB.db.listEtablissements()
      .then(list => { if (mounted) setEtablissementsAll(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [legacySB, demoData]);
  // ─── Onglet actif ───
  // Onglets dispo : voir CONSULTANT_TOOLS_TABS ('vue' = cockpit d'arrivée).
  // Priorité : redirection ponctuelle (ancien lien /factures par ex., clé
  // one-shot) > dernier onglet visité (persisté) > Vue d'ensemble.
  const [activeTab, setActiveTab] = React.useState(() => {
    try {
      const pre = readText('sc_consultant_tools_tab', '');
      if (pre) {
        removeStorageKeys(['sc_consultant_tools_tab']);
        if (CONSULTANT_TOOLS_TABS.includes(pre)) {
          return pre;
        }
      }
      const last = readText(LAST_TAB_KEY, '');
      if (CONSULTANT_TOOLS_TABS.includes(last)) return last;
    } catch(e) {}
    return 'vue';
  });
  React.useEffect(() => { writeText(LAST_TAB_KEY, activeTab); }, [activeTab]);
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
    const unsub1 = legacySB.realtime.subscribeReload('plats', async () => {
      try { const ps = await legacySB.db.listPlats(etabId); if (mounted) setPlats(Array.isArray(ps) ? ps : []); } catch(e) {}
    });
    const unsub2 = legacySB.realtime.subscribeReload('plat_recettes', async () => {
      try { const ps = await legacySB.db.listPlats(etabId); if (mounted) setPlats(Array.isArray(ps) ? ps : []); } catch(e) {}
    });
    const unsub3 = legacySB.realtime.subscribeReload('carte_plats', async () => {
      try { const ps = await legacySB.db.listPlats(etabId); if (mounted) setPlats(Array.isArray(ps) ? ps : []); } catch(e) {}
    });
    return () => { mounted = false; unsub1 && unsub1(); unsub2 && unsub2(); unsub3 && unsub3(); };
  }, [etabId]);

  const [recettes, setRecettes] = React.useState(() => legacySB ? [] : readLegacyStorage('sc_recettes', demoData.recettes));
  const [selectedId, setSelectedId] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  // Filtrer par établissement
  const recettesEtab = recettes.filter(r => (r.etablissementId || 'etab-1') === etabId);
  // Archivage : statut 'archivée' → hors de l'arborescence, des simulations et
  // des analyses IA groupées. Les archivées restent éditables via leur section.
  const recettesActives = recettesEtab.filter(r => r.statut !== 'archivée');
  const recettesArchivees = recettesEtab.filter(r => r.statut === 'archivée');

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
          const firstOpen = safeRecs.find(r => r.statut !== 'archivée') || safeRecs[0];
          if (!selectedId && firstOpen) setSelectedId(firstOpen.id);
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
    unsub = legacySB.realtime.subscribeReload('recettes', async () => {
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
      setSelectedId((recettesActives[0] || recettesEtab[0])?.id || null);
    }
  }, [etabId, recettes.length]);

  // Recalcul des dérivés (foodCost, etc.) - local, pas de persistance auto
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
  const searchValue = normalizeSearch(search);
  const filtered = recettesActives.filter(r => searchValue === '' || normalizeSearch(r.nom).includes(searchValue));
  const archiveesFiltrees = recettesArchivees.filter(r => searchValue === '' || normalizeSearch(r.nom).includes(searchValue));
  // Section « Archivées » de la liste : repliée par défaut.
  const [showArchivees, setShowArchivees] = React.useState(false);
  // Correspondances catalogue incertaines (héritées d'un import) : compteur
  // partagé entre la Vue d'ensemble et le menu « ⋯ » de la liste.
  const reviewCount = recettesEtab.reduce((s, r) => s + (r.ingredients || []).filter(i => i.needsReview).length, 0);

  // ═══ Sauvegarde différée + stabilité de la saisie ═══
  const saveTimerRef = React.useRef(null);
  const [saveStatus, setSaveStatus] = React.useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = React.useState('');
  // Ref de recettes pour accès hors render (timers, callbacks realtime)
  const recettesRef = React.useRef(recettes);
  React.useEffect(() => { recettesRef.current = recettes; }, [recettes]);
  // Ref du selectedId - closure stable pour les callbacks realtime
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
  // ID de l'ingrédient dont le champ nom a le focus : seules ses suggestions catalogue
  // sont affichées, sinon les panneaux recouvrent les lignes suivantes
  const [focusedIngId, setFocusedIngId] = React.useState(null);
  const [pickerSearch, setPickerSearch] = React.useState('');
  const [pickerCat, setPickerCat] = React.useState('Tous');
  const [pickerSelected, setPickerSelected] = React.useState(new Set());
  // Brouillons localStorage non sauvegardés détectés au chargement
  const [pendingDrafts, setPendingDrafts] = React.useState([]);
  // Écran de résolution des correspondances catalogue ambiguës
  const [showMatchReview, setShowMatchReview] = React.useState(false);
  // Mode sélection multiple de recettes (suppression / export en lot)
  const recSel = useSelection();
  const [recBulkBusy, setRecBulkBusy] = React.useState(false);
  // Menu « ⋯ » : actions ponctuelles sorties de l'en-tête de la colonne gauche
  const [outilsMenuOpen, setOutilsMenuOpen] = React.useState(false);
  // Détection IA des allergènes en cours
  const [allergenAiBusy, setAllergenAiBusy] = React.useState(false);
  // Génération IA de l'analyse HACCP
  const [haccpAiBusy, setHaccpAiBusy] = React.useState(false);
  const [haccpResult, setHaccpResult] = React.useState(null);
  // Suggestions de complétion IA
  const [suggestAiBusy, setSuggestAiBusy] = React.useState(false);
  const [suggestResult, setSuggestResult] = React.useState(null);
  // Détection groupée des allergènes (toutes les recettes)
  const [bulkAllergenProgress, setBulkAllergenProgress] = React.useState(null);
  const bulkAllergenCancelRef = React.useRef(false);
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

  // Archive / restaure la recette sélectionnée. Réversible : la recette sort de
  // la bibliothèque et des plats côté app, mais garde ses liaisons plat_recettes.
  const archiverSelected = (archived) => {
    if (!selected) return;
    updateSelected({ statut: archived ? 'archivée' : 'brouillon' });
    if (archived) setShowArchivees(true);
    notifyLegacy(
      archived
        ? `« ${selected.nom} » archivée. Retrouvez-la dans la section Archivées de la liste.`
        : `« ${selected.nom} » restaurée en brouillon.`,
      'success',
    );
  };

  // Archivage en lot des recettes sélectionnées (mode sélection).
  const archiverRecettesSelection = async () => {
    if (recSel.count === 0) return;
    if (!confirmLegacy(`Archiver ${recSel.count} recette(s) sélectionnée(s) ?\n\nLes recettes sortent de la bibliothèque et des plats, sans être supprimées. Restaurables depuis la section Archivées.`)) return;
    setRecBulkBusy(true);
    const ids = Array.from(recSel.ids);
    let ok = 0;
    for (const id of ids) {
      const r = recettesRef.current.find(x => x.id === id);
      if (!r || r.statut === 'archivée') continue;
      if (legacySB) {
        try { await legacySB.db.upsertRecette({ ...r, statut: 'archivée' }); ok += 1; }
        catch (err) { console.error('[archiverRecette]', err); }
      } else { ok += 1; }
    }
    setRecettes(prev => prev.map(r => (recSel.ids.has(r.id) ? { ...r, statut: 'archivée' } : r)));
    setRecBulkBusy(false);
    recSel.exit();
    setShowArchivees(true);
    notifyLegacy(`${ok} recette(s) archivée(s).`, 'success');
  };

  // ─── Mode sélection : suppression et export Excel de recettes en lot ───
  const supprimerRecettesSelection = async () => {
    if (recSel.count === 0) return;
    if (!confirmLegacy(`Supprimer ${recSel.count} recette(s) sélectionnée(s) ?`)) return;
    setRecBulkBusy(true);
    let ok = 0;
    for (const id of Array.from(recSel.ids)) {
      if (legacySB) {
        try { await legacySB.db.deleteRecette(id); ok += 1; }
        catch (err) { console.error('[deleteRecette]', err); }
      } else { ok += 1; }
    }
    setRecettes(prev => {
      const next = prev.filter(r => !recSel.ids.has(r.id));
      if (recSel.ids.has(selectedId)) setSelectedId(next[0]?.id || null);
      return next;
    });
    setRecBulkBusy(false);
    recSel.exit();
    notifyLegacy(`${ok} recette(s) supprimée(s).`, 'success');
  };

  const exporterRecettesSelection = async () => {
    const rows = recettesEtab.filter(r => recSel.ids.has(r.id));
    if (!rows.length) return;
    setRecBulkBusy(true);
    const headers = ['Nom', 'Catégorie', 'Statut', 'Portions', 'Prix vente (CHF)', 'Coût matière (CHF)', 'Coût/portion (CHF)', 'Food cost (%)', 'Nb ingrédients', 'Nb étapes'];
    const data = rows.map(r => [
      r.nom, r.categorie || '', r.statut || '', r.portions || 0,
      Number(r.prixVente) || 0,
      Number((r.coutMatiere || 0).toFixed(2)),
      Number((r.coutPortion || 0).toFixed(2)),
      r.foodCost != null ? Number(r.foodCost.toFixed(1)) : '',
      (r.ingredients || []).length, (r.etapes || []).length,
    ]);
    try {
      await exportRowsToXlsx(`recettes-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Recettes', headers, data, [30, 14, 12, 9, 16, 18, 18, 13, 14, 11]);
      notifyLegacy(`${rows.length} recette(s) exportée(s) en Excel.`, 'success');
    } catch (err) {
      notifyLegacy('Erreur export : ' + err.message, 'error');
    }
    setRecBulkBusy(false);
  };

  // Rattache toutes les recettes sélectionnées à PLUSIEURS plats en une fois.
  // La modale n'imposait qu'un plat par passage : rattacher une garniture aux
  // quatre plats qui l'utilisent demandait quatre allers-retours, en re-cochant
  // les recettes à chaque fois.
  // linkRecetteToPlat est un upsert (plat_id, recette_id) : les doublons sont
  // impossibles, on saute quand même les recettes déjà liées pour le compteur.
  const rattacherSelectionAuxPlats = async (platsCibles) => {
    const ids = Array.from(recSel.ids);
    if (!ids.length || !platsCibles.length || !legacySB) return;
    setRecBulkBusy(true);
    const parPlat = new Map(); // platId -> recetteIds effectivement liées
    let total = 0, deja = 0, ko = 0;
    for (const plat of platsCibles) {
      const dejaLiees = new Set((plat.recettes || []).map(pr => pr.recetteId));
      const liees = [];
      for (const rid of ids) {
        if (dejaLiees.has(rid)) { deja += 1; continue; }
        try { await legacySB.db.linkRecetteToPlat(plat.id, rid, 'composant', 0); liees.push(rid); }
        catch (err) { console.error('[linkRecetteToPlat]', err); ko += 1; }
      }
      if (liees.length) parPlat.set(plat.id, liees);
      total += liees.length;
    }
    // Mise à jour optimiste ; le realtime plat_recettes reste la source de vérité.
    if (parPlat.size) {
      setPlats(prev => prev.map(p => parPlat.has(p.id)
        ? { ...p, recettes: [...p.recettes, ...parPlat.get(p.id).map(rid => ({ recetteId: rid, role: 'composant', ordre: 0 }))] }
        : p));
    }
    setRecBulkBusy(false);
    setBulkLinkPlatOpen(false);
    recSel.exit();
    const cible = platsCibles.length === 1
      ? `« ${platsCibles[0].nom} »`
      : `${platsCibles.length} plats`;
    const parts = [];
    if (total) parts.push(`${total} rattachement${total > 1 ? 's' : ''} vers ${cible}`);
    if (deja) parts.push(`${deja} déjà liée${deja > 1 ? 's' : ''}`);
    if (ko) parts.push(`${ko} en erreur`);
    notifyLegacy(parts.join(' · ') || 'Aucune recette à rattacher.', ko ? 'warning' : 'success');
  };

  // ─── Transfert groupé vers un autre établissement ───
  // Cibles possibles : les établissements du profil (la RLS refuse l'écriture
  // ailleurs, alors qu'un consultant les LIT tous), hors celui où l'on est déjà
  // et hors inactifs. Même filtre que le sélecteur d'établissement de l'entête.
  const etablissementsCibles = React.useMemo(() => {
    const autorises = user?.etablissementIds?.length
      ? (etablissementsAll || []).filter(e => user.etablissementIds.includes(e.id))
      : (etablissementsAll || []);
    return autorises.filter(e => e.id !== etabId && e.actif !== false);
  }, [etablissementsAll, user, etabId]);

  // Recopie les ingrédients pour l'établissement d'arrivée. Quand un produit du
  // même nom existe à SON catalogue, on relie dessus et on aligne unité + prix :
  // les tarifs fournisseurs ne se suivent pas d'un site à l'autre, garder ceux
  // du départ donnerait un food cost faux là-bas. Sans correspondance, la ligne
  // part telle quelle, sans lien produit ni drapeau de correspondance - ceux-ci
  // désignent le catalogue de départ.
  const recopierIngredients = (ings, catalogueCible) => {
    const parNom = new Map();
    (catalogueCible || []).forEach(p => {
      const k = normalizeSearch(p.nom);
      if (k && !parNom.has(k)) parNom.set(k, p);
    });
    return (ings || []).map(ing => {
      const match = parNom.get(normalizeSearch(ing.nom || ''));
      if (match) return applyProductToIngredient(ing, match);
      const copie = { ...ing };
      delete copie.produitId;
      delete copie.needsReview;
      delete copie.matchSuggestions;
      return copie;
    });
  };

  // « Copier » duplique (rien ne bouge ici). « Déplacer » change
  // l'établissement de la recette ET la retire des plats d'ici : un plat qui
  // garderait un composant parti ailleurs afficherait une ligne fantôme,
  // invisible depuis la bibliothèque.
  const transfererRecettesSelection = async ({ etablissementId, mode, ignorerDoublons, doublonsIds }) => {
    const cible = etablissementsCibles.find(e => e.id === etablissementId);
    if (!cible || !legacySB) return;
    const ignores = new Set(ignorerDoublons ? (doublonsIds || []) : []);
    const rows = recettesEtab.filter(r => recSel.ids.has(r.id) && !ignores.has(r.id));
    if (!rows.length) return;

    setRecBulkBusy(true);
    // Catalogue d'arrivée : une lecture en échec n'annule pas le transfert, les
    // ingrédients partent alors sans lien produit.
    let catalogueCible = [];
    try { catalogueCible = (await legacySB.db.listProduits(etablissementId)) || []; }
    catch (e) { /* ingrédients recopiés bruts */ }

    const deplacement = mode === 'deplacement';
    let ok = 0, ko = 0, liensRetires = 0;
    const deplacees = [];
    for (const r of rows) {
      const payload = {
        ...r,
        // Copie : nouvel id, sinon l'upsert écraserait la recette d'origine et
        // la ferait changer d'établissement au lieu de la dupliquer.
        id: deplacement ? r.id : ('rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
        etablissementId,
        ingredients: recopierIngredients(r.ingredients, catalogueCible),
        modifiePar: user.id,
      };
      try {
        if (deplacement) {
          // Délier AVANT le déplacement : une fois la recette partie, les plats
          // d'ici ne la référencent plus visiblement et le nettoyage n'aurait
          // plus de liste sur laquelle s'appuyer.
          const platsLies = plats.filter(p => (p.recettes || []).some(pr => pr.recetteId === r.id));
          for (const p of platsLies) {
            try { await legacySB.db.unlinkRecetteFromPlat(p.id, r.id); liensRetires += 1; }
            catch (err) { console.error('[unlinkRecetteFromPlat]', err); }
          }
        }
        await legacySB.db.upsertRecette(payload);
        ok += 1;
        if (deplacement) deplacees.push(r.id);
      } catch (err) {
        console.error('[transfertRecette]', err);
        ko += 1;
      }
    }

    // Mise à jour optimiste du départ ; le realtime reste la source de vérité.
    if (deplacees.length) {
      const partis = new Set(deplacees);
      setPlats(prev => prev.map(p => ({ ...p, recettes: (p.recettes || []).filter(pr => !partis.has(pr.recetteId)) })));
      setRecettes(prev => prev.filter(r => !partis.has(r.id)));
    }

    setRecBulkBusy(false);
    setBulkTransferOpen(false);
    recSel.exit();

    const parts = [];
    if (ok) parts.push(`${ok} recette${ok > 1 ? 's' : ''} ${deplacement ? 'déplacée' : 'copiée'}${ok > 1 ? 's' : ''} vers « ${cible.nom} »`);
    if (ignores.size) parts.push(`${ignores.size} déjà présente${ignores.size > 1 ? 's' : ''} ignorée${ignores.size > 1 ? 's' : ''}`);
    if (liensRetires) parts.push(`${liensRetires} lien${liensRetires > 1 ? 's' : ''} plat retiré${liensRetires > 1 ? 's' : ''}`);
    if (ko) parts.push(`${ko} en erreur`);
    notifyLegacy(parts.join(' · ') || 'Aucune recette transférée.', ko ? 'warning' : 'success');
  };

  // Applique la sélection de plats du picker à UNE recette : ce qui a été coché
  // est lié, ce qui a été décoché est délié. Le picker ne fait aucune écriture,
  // la modale peut donc être annulée sans laisser de lien à moitié posé.
  const appliquerPlatsPourRecette = async (recette, platIds) => {
    if (!recette || !legacySB) return;
    const cible = new Set(platIds);
    const avant = new Set(plats.filter(p => (p.recettes || []).some(pr => pr.recetteId === recette.id)).map(p => p.id));
    const aLier = platIds.filter(id => !avant.has(id));
    const aDelier = [...avant].filter(id => !cible.has(id));
    if (!aLier.length && !aDelier.length) { setLinkPlatPickerForRecette(null); return; }
    setRecBulkBusy(true);
    let ko = 0;
    for (const platId of aLier) {
      try { await legacySB.db.linkRecetteToPlat(platId, recette.id, 'composant', 0); }
      catch (err) { console.error('[linkRecetteToPlat]', err); ko += 1; }
    }
    for (const platId of aDelier) {
      try { await legacySB.db.unlinkRecetteFromPlat(platId, recette.id); }
      catch (err) { console.error('[unlinkRecetteFromPlat]', err); ko += 1; }
    }
    setPlats(prev => prev.map(p => {
      if (aLier.includes(p.id)) return { ...p, recettes: [...p.recettes, { recetteId: recette.id, role: 'composant', ordre: 0 }] };
      if (aDelier.includes(p.id)) return { ...p, recettes: p.recettes.filter(pr => pr.recetteId !== recette.id) };
      return p;
    }));
    setRecBulkBusy(false);
    setLinkPlatPickerForRecette(null);
    const parts = [];
    if (aLier.length) parts.push(`${aLier.length} plat${aLier.length > 1 ? 's' : ''} rattaché${aLier.length > 1 ? 's' : ''}`);
    if (aDelier.length) parts.push(`${aDelier.length} lien${aDelier.length > 1 ? 's' : ''} retiré${aDelier.length > 1 ? 's' : ''}`);
    if (ko) parts.push(`${ko} en erreur`);
    notifyLegacy(parts.join(' · '), ko ? 'warning' : 'success');
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
    unsub = legacySB.realtime.subscribeReload('cartes', async () => {
      try { const c = await legacySB.db.listCartes(etabId); if (mounted) setCartesLocal(c); } catch(e) {}
    });
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId]);

  // Cartes non archivées : seules visibles comme dossiers, cases de rattachement
  // et cibles de publication. Les archivées gardent leurs liaisons en base.
  const cartesActivesLocal = (cartesLocal || []).filter(c => !c.archive);

  const toggleActifSurCarte = async (recette, actif) => {
    if (!recette) return;
    const source = legacySB ? cartesLocal : readLegacyStorage('sc_cartes', demoData.cartes);
    let carteEtab = source.find(c => (c.etablissementId || 'etab-1') === etabId && !c.archive);

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
    const carteEtab = source.find(c => (c.etablissementId || 'etab-1') === etabId && !c.archive);
    return carteEtab?.plats?.some(p => p.recetteId === recette.id) || false;
  };

  // ═══ Import multiple de recettes ═══
  // L'import (Excel / CSV / PDF, template, parsing, preview, insertion par
  // lots) est géré par le module dédié src/modules/recettes/import.
  const [showImport, setShowImport] = React.useState(false);

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
    // Le champ nom est remonté (nouvelle key) après le lien : son blur ne fire plus,
    // on retire donc le focus suggestions à la main pour éviter un panneau fantôme au déliage.
    setFocusedIngId(null);
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

  // Valeurs hors référentiel héritées d'anciens imports (« aucun », « lait »,
  // « crustacés si écrevisse ») : aucune puce ne les représentait, elles
  // étaient donc indélébiles et invisibles aux filtres allergènes.
  const allergenesInconnus = partitionAllergenes(selected?.allergenesIds).inconnus;
  const retirerAllergeneInconnu = (v) =>
    updateSelected({ allergenesIds: (selected.allergenesIds || []).filter(a => a !== v) });
  const corrigerAllergeneInconnu = (v) => {
    const { ids } = normalizeAllergenes([v]);
    const restant = (selected.allergenesIds || []).filter(a => a !== v);
    updateSelected({ allergenesIds: [...new Set([...restant, ...ids])] });
  };

  // ── Détection automatique des allergènes par IA ──
  const detectAllergenesIA = async () => {
    if (!selected) return;
    const names = (selected.ingredients || []).map(i => i.nom).filter(Boolean);
    if (!names.length) { notifyLegacy('Ajoutez des ingrédients avant la détection.', 'info'); return; }
    setAllergenAiBusy(true);
    try {
      const { detectAllergens } = await import('../../services/aiService.js');
      const res = await detectAllergens(names, selected.nom);
      const validIds = new Set(ALLERGENES_OPTIONS.map(a => a.id));
      const labelOf = (id) => (ALLERGENES_OPTIONS.find(a => a.id === id) || {}).label || id;
      const detected = (res.allergenes || []).filter(id => validIds.has(id));
      const incertains = (res.incertains || []).filter(id => validIds.has(id));
      const current = selected.allergenesIds || [];
      const added = detected.filter(id => !current.includes(id));
      if (added.length) {
        updateSelected({ allergenesIds: [...new Set([...current, ...detected])] });
      }
      let msg = added.length
        ? `${added.length} allergène(s) ajouté(s) : ${added.map(labelOf).join(', ')}.`
        : 'Aucun nouvel allergène détecté.';
      if (incertains.length) msg += ` À vérifier : ${incertains.map(labelOf).join(', ')}.`;
      notifyLegacy(msg, added.length ? 'success' : 'info');
    } catch (err) {
      notifyLegacy('Détection IA impossible : ' + (err.message || err), 'error');
    } finally {
      setAllergenAiBusy(false);
    }
  };

  // ── Détection groupée des allergènes sur toutes les recettes ──
  const detecterAllergenesToutes = async () => {
    // Les recettes archivées sont exclues de l'analyse groupée (appels IA inutiles).
    const targets = recettesActives.filter(r => (r.ingredients || []).length > 0);
    if (!targets.length) { notifyLegacy('Aucune recette avec des ingrédients à analyser.', 'info'); return; }
    if (!confirmLegacy(
      `Détecter les allergènes de ${targets.length} recette(s) ?\n\n`
      + `Cela effectue ${targets.length} appel(s) à l'IA. Les allergènes détectés sont ajoutés sans retirer les existants.`
    )) return;
    bulkAllergenCancelRef.current = false;
    setBulkAllergenProgress({ done: 0, total: targets.length, added: 0 });
    let done = 0;
    let totalAdded = 0;
    try {
      const { detectAllergens } = await import('../../services/aiService.js');
      const validIds = new Set(ALLERGENES_OPTIONS.map(a => a.id));
      for (let i = 0; i < targets.length; i += 3) {
        if (bulkAllergenCancelRef.current) break;
        const batch = targets.slice(i, i + 3);
        const results = await Promise.allSettled(batch.map(async (r) => {
          const names = (r.ingredients || []).map(x => x.nom).filter(Boolean);
          const res = await detectAllergens(names, r.nom);
          const detected = (res.allergenes || []).filter(id => validIds.has(id));
          const current = r.allergenesIds || [];
          const merged = [...new Set([...current, ...detected])];
          const added = merged.length - current.length;
          if (added > 0) await legacySB.db.upsertRecette({ ...r, allergenesIds: merged });
          return { id: r.id, merged, added };
        }));
        results.forEach(res => {
          done += 1;
          if (res.status === 'fulfilled' && res.value.added > 0) {
            totalAdded += res.value.added;
            setRecettes(prev => prev.map(x => (x.id === res.value.id ? { ...x, allergenesIds: res.value.merged } : x)));
          }
        });
        setBulkAllergenProgress({ done, total: targets.length, added: totalAdded });
      }
    } catch (err) {
      notifyLegacy('Détection groupée interrompue : ' + (err.message || err), 'error');
    }
    setBulkAllergenProgress(null);
    notifyLegacy(
      `Détection terminée : ${done} recette(s) analysée(s), ${totalAdded} allergène(s) ajouté(s)`
      + `${bulkAllergenCancelRef.current ? ' · interrompu' : ''}.`,
      'success',
    );
  };

  // ── Génération d'une analyse HACCP par IA ──
  const genererHaccpIA = async () => {
    if (!selected) return;
    if (!(selected.ingredients || []).length) {
      notifyLegacy('Ajoutez des ingrédients avant de générer l\'analyse HACCP.', 'info');
      return;
    }
    setHaccpAiBusy(true);
    try {
      const { generateHaccp } = await import('../../services/aiService.js');
      const res = await generateHaccp(selected);
      if (!res.points.length && !res.conservation && !res.remarques) {
        notifyLegacy('Aucune analyse HACCP produite. Réessayez.', 'info');
      } else {
        setHaccpResult(res);
      }
    } catch (err) {
      notifyLegacy('Génération HACCP impossible : ' + (err.message || err), 'error');
    } finally {
      setHaccpAiBusy(false);
    }
  };

  // Insère l'analyse HACCP générée dans les notes consultant de la recette.
  const insererHaccpDansNotes = () => {
    if (!haccpResult || !selected) return;
    const lines = ['── Analyse HACCP (générée par IA - à valider par un responsable) ──'];
    (haccpResult.points || []).forEach(p => {
      lines.push(`• ${p.etape || '-'} - ${p.danger || '-'} [${p.type || '-'}]${p.ccp ? ' (CCP)' : ''}`);
      if (p.mesure) lines.push(`  Maîtrise : ${p.mesure}`);
      if (p.limiteCritique) lines.push(`  Limite critique : ${p.limiteCritique}`);
      if (p.surveillance) lines.push(`  Surveillance : ${p.surveillance}`);
    });
    if (haccpResult.conservation) lines.push(`Conservation : ${haccpResult.conservation}`);
    if (haccpResult.remarques) lines.push(`Remarques : ${haccpResult.remarques}`);
    const block = lines.join('\n');
    const current = selected.notesConsultant || '';
    updateSelected({ notesConsultant: current ? `${current}\n\n${block}` : block });
    notifyLegacy('Analyse HACCP insérée dans les notes consultant.', 'success');
    setHaccpResult(null);
  };

  // ── Suggestions de complétion par IA ──
  const suggererIA = async () => {
    if (!selected) return;
    if (!String(selected.nom || '').trim()) {
      notifyLegacy('Donnez d\'abord un nom à la recette.', 'info');
      return;
    }
    setSuggestAiBusy(true);
    try {
      const { suggestRecipe } = await import('../../services/aiService.js');
      const res = await suggestRecipe(selected, (catalogue || []).map(p => p.nom));
      if (!res.ingredients.length && !res.etapes.length) {
        notifyLegacy('L\'IA n\'a pas de suggestion - la recette semble complète.', 'info');
      } else {
        setSuggestResult(res);
      }
    } catch (err) {
      notifyLegacy('Suggestions IA impossibles : ' + (err.message || err), 'error');
    } finally {
      setSuggestAiBusy(false);
    }
  };

  const ajouterIngredientSuggere = (idx) => {
    if (!selected || !suggestResult) return;
    const ing = suggestResult.ingredients[idx];
    if (!ing) return;
    const newIng = { id: 'i' + Date.now() + Math.floor(Math.random() * 1000), nom: ing.nom, quantite: ing.quantite || 0, unite: ing.unite || 'g', prixUnit: 0, categorie: 'Autres' };
    updateSelected({ ingredients: [...(selected.ingredients || []), newIng] });
    setSuggestResult(prev => (prev ? { ...prev, ingredients: prev.ingredients.filter((_, i) => i !== idx) } : prev));
  };
  const ajouterTousIngredientsSuggere = () => {
    if (!selected || !suggestResult || !suggestResult.ingredients.length) return;
    const news = suggestResult.ingredients.map((ing, k) => ({ id: 'i' + Date.now() + '_' + k, nom: ing.nom, quantite: ing.quantite || 0, unite: ing.unite || 'g', prixUnit: 0, categorie: 'Autres' }));
    updateSelected({ ingredients: [...(selected.ingredients || []), ...news] });
    setSuggestResult(prev => (prev ? { ...prev, ingredients: [] } : prev));
  };
  const ajouterEtapeSuggere = (idx) => {
    if (!selected || !suggestResult) return;
    const txt = suggestResult.etapes[idx];
    if (!txt) return;
    updateSelected({ etapes: [...(selected.etapes || []), txt] });
    setSuggestResult(prev => (prev ? { ...prev, etapes: prev.etapes.filter((_, i) => i !== idx) } : prev));
  };
  const ajouterToutesEtapesSuggere = () => {
    if (!selected || !suggestResult || !suggestResult.etapes.length) return;
    updateSelected({ etapes: [...(selected.etapes || []), ...suggestResult.etapes] });
    setSuggestResult(prev => (prev ? { ...prev, etapes: [] } : prev));
  };

  // ── Calculs dérivés pour affichage live
  const coutMatiere = selected ? (selected.ingredients || []).reduce((s, i) => s + (Number(i.quantite) || 0) * (Number(i.prixUnit) || 0), 0) : 0;
  const coutPortion = (selected?.portions > 0) ? coutMatiere / Number(selected.portions) : 0;
  const foodCost = selected && selected.prixVente ? (coutPortion / selected.prixVente * 100) : null;
  const margeBrute = selected && selected.prixVente ? selected.prixVente - coutPortion : 0;
  const tempsTotal = selected ? (Number(selected.tempsPreparation) || 0) + (Number(selected.tempsCuisson) || 0) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Barre d'onglets - deux groupes : création culinaire | administration */}
      <div className="no-print" style={{ marginBottom: 14 }}>
        <SegmentedTabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'vue', label: 'Vue d\'ensemble' },
            { id: 'recettes', label: 'Plats & Recettes' },
            { id: 'creation_carte', label: 'Création carte' },
            { id: 'simulation', label: 'Simulation' },
            { divider: true },
            { id: 'roles', label: 'Rôles & accès' },
            { id: 'etablissements', label: 'Établissements' },
            { id: 'factures', label: 'Factures' },
            { id: 'alertes', label: 'Alertes' },
          ]}
        />
      </div>

      {/* Routage des onglets - reutilise les composants migres via imports.
          Chaque onglet est isolé dans un SafeModule pour qu'un crash n'affecte pas les autres. */}
      {activeTab === 'vue' ? (() => {
        // Cockpit : lit les données déjà chargées ici, et renvoie chaque alerte
        // vers l'onglet Recettes (dont les modales font partie du rendu).
        const overview = (
          <ConsultantOverview
            recettesActives={recettesActives}
            recettesArchivees={recettesArchivees}
            plats={plats}
            cartesActives={cartesActivesLocal}
            pendingDrafts={pendingDrafts}
            reviewCount={reviewCount}
            onOpenRecette={(id) => { setSelectedId(id); setActiveTab('recettes'); }}
            onNewRecette={() => { setActiveTab('recettes'); createNew(); }}
            onNewPlat={() => { setActiveTab('recettes'); setEditPlat(null); setShowPlatForm(true); }}
            onEditPlat={(p) => { setActiveTab('recettes'); setEditPlat(p); setShowPlatForm(true); }}
            onImport={() => { setActiveTab('recettes'); setShowImport(true); }}
            onMatchReview={() => { setActiveTab('recettes'); setShowMatchReview(true); }}
            onBulkAllergenes={() => { setActiveTab('recettes'); detecterAllergenesToutes(); }}
            onRestoreDrafts={restoreDrafts}
            onGoTab={setActiveTab}
          />
        );
        return SafeModule
          ? <SafeModule name="Vue d'ensemble">{overview}</SafeModule>
          : overview;
      })() : activeTab === 'creation_carte' ? (
        SafeModule
          ? <SafeModule name="Création de carte"><CarteCreator plats={plats} recettes={recettesActives} etablissement={etablissement} legacySB={legacySB} etabId={etabId} user={user}/></SafeModule>
          : <CarteCreator plats={plats} recettes={recettesActives} etablissement={etablissement} legacySB={legacySB} etabId={etabId} user={user}/>
      ) : activeTab === 'simulation' ? (
        SafeModule
          ? <SafeModule name="Simulation carte"><CarteSimulation plats={plats} recettes={recettesActives} etablissement={etablissement}/></SafeModule>
          : <CarteSimulation plats={plats} recettes={recettesActives} etablissement={etablissement}/>
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
      ) : activeTab === 'alertes' ? (
        SafeModule
          ? <SafeModule name="Alertes"><AlertRules user={user} etablissement={etablissement} /></SafeModule>
          : <AlertRules user={user} etablissement={etablissement} />
      ) : (
    <div style={cts.root}>
      {showImport && (
        <ImportLauncher
          etabId={etabId}
          legacySB={legacySB}
          user={user}
          onClose={() => setShowImport(false)}
          onImported={async () => {
            try {
              const recs = await legacySB.db.listRecettes(etabId);
              setRecettes(Array.isArray(recs) ? recs : []);
            } catch (e) { /* le realtime rafraîchira la liste */ }
          }}
        />
      )}
      {showMatchReview && (
        <AmbiguousMatchReview
          recettes={recettesEtab}
          catalogue={catalogue}
          legacySB={legacySB}
          onClose={() => setShowMatchReview(false)}
          onResolved={async () => {
            try {
              const recs = await legacySB.db.listRecettes(etabId);
              setRecettes(Array.isArray(recs) ? recs : []);
            } catch (e) { /* le realtime rafraîchira la liste */ }
          }}
        />
      )}
      {/* Progression de la détection groupée des allergènes */}
      {bulkAllergenProgress && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(20,16,12,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(420px,94vw)', padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)', marginBottom: 4 }}>✨ Détection des allergènes</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              {bulkAllergenProgress.done} / {bulkAllergenProgress.total} recette(s) · {bulkAllergenProgress.added} allergène(s) ajouté(s)
            </div>
            <div style={{ height: 10, background: 'var(--bg)', borderRadius: 6, margin: '12px 0', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ height: '100%', width: `${bulkAllergenProgress.total ? (bulkAllergenProgress.done / bulkAllergenProgress.total) * 100 : 0}%`, background: 'var(--accent)', transition: 'width 0.2s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                style={{ ...cts.ghostBtn, color: 'var(--danger-strong)', borderColor: 'var(--danger-bd)' }}
                onClick={() => { bulkAllergenCancelRef.current = true; }}
              >Annuler</button>
            </div>
          </div>
        </div>
      )}
      {/* Colonne gauche : liste */}
      <div style={cts.leftCol} className="no-print">
        {/* En-tête : deux rangées maximum. La colonne fait 280px - les cinq
            rangées d'actions qui s'y empilaient (création, import, sélection,
            allergènes IA, correspondances) mangeaient le haut de la liste. Les
            actions ponctuelles sont passées sous le menu « ⋯ », et le mode
            sélection REMPLACE la barre de création au lieu de s'y ajouter. */}
        <div style={cts.leftHeader}>
          {recSel.active ? (
            <SelectionToolbar
              layout="stack"
              count={recSel.count}
              total={filtered.length}
              allSelected={recSel.count > 0 && recSel.count === filtered.length}
              onToggleAll={() => (recSel.count === filtered.length ? recSel.clear() : recSel.selectAll(filtered.map(r => r.id)))}
              onDelete={supprimerRecettesSelection}
              onExport={exporterRecettesSelection}
              exportLabel="⬇ Excel"
              onCancel={recSel.exit}
              busy={recBulkBusy}
              /* La recherche reste accessible : « Tout » sélectionne la liste
                 filtrée, filtrer puis tout cocher est l'usage courant. */
              headExtra={<SearchToggle value={search} onChange={setSearch} placeholder="Rechercher…" />}
            >
              <Btn small variant="ghost" onClick={() => setBulkLinkPlatOpen(true)} disabled={recSel.count === 0 || recBulkBusy}>
                🍽 Rattacher
              </Btn>
              <Btn small variant="ghost" onClick={archiverRecettesSelection} disabled={recSel.count === 0 || recBulkBusy}>
                🗄 Archiver
              </Btn>
              {/* legacySB : le transfert écrit en base, il n'a pas de sens en
                  mode démo (bridge absent) où il ne ferait rien. */}
              {legacySB && etablissementsCibles.length > 0 && (
                <Btn small variant="ghost" onClick={() => setBulkTransferOpen(true)} disabled={recSel.count === 0 || recBulkBusy}>
                  🏛 Transférer
                </Btn>
              )}
            </SelectionToolbar>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button style={{ ...cts.newBtn, flex: 1 }} onClick={createNew}>+ Recette</button>
                <button
                  style={{ ...cts.newBtn, flex: 1, background: 'var(--warning-bg)', color: 'var(--warning-text)', border: '1px solid var(--warning-bd)' }}
                  onClick={() => { setEditPlat(null); setShowPlatForm(true); }}
                >+ Plat</button>
                <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher…" />
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                <button
                  style={{ ...cts.ghostBtn, flex: 1, fontSize: 11, padding: '6px 8px' }}
                  onClick={recSel.enter}
                >☑ Sélectionner</button>
                {(() => {
                  return (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <button
                        style={{ ...cts.ghostBtn, fontSize: 13, padding: '6px 12px', height: '100%', lineHeight: 1 }}
                        onClick={() => setOutilsMenuOpen(v => !v)}
                        title="Autres outils"
                        aria-haspopup="menu"
                        aria-expanded={outilsMenuOpen}
                      >
                        ⋯
                        {reviewCount > 0 && <span style={cts.menuDot} title={`${reviewCount} correspondance(s) à valider`} />}
                      </button>
                      {outilsMenuOpen && (
                        <>
                          {/* Voile transparent : ferme le menu au clic à côté
                              sans écouteur global sur document. */}
                          <div style={cts.menuBackdrop} onClick={() => setOutilsMenuOpen(false)} />
                          <div style={cts.menuPanel} role="menu">
                            <button
                              className="sc-menu-item"
                              style={cts.menuItem}
                              role="menuitem"
                              onClick={() => { setOutilsMenuOpen(false); setShowImport(true); }}
                            >📥 Importer des recettes</button>
                            <button
                              className="sc-menu-item"
                              style={{ ...cts.menuItem, color: 'var(--ai-text)' }}
                              role="menuitem"
                              disabled={!!bulkAllergenProgress}
                              onClick={() => { setOutilsMenuOpen(false); detecterAllergenesToutes(); }}
                            >✨ Allergènes IA - toutes les recettes</button>
                            {reviewCount > 0 && (
                              <button
                                className="sc-menu-item"
                                style={{ ...cts.menuItem, color: 'var(--warning-text)' }}
                                role="menuitem"
                                onClick={() => { setOutilsMenuOpen(false); setShowMatchReview(true); }}
                              >⚠ Correspondances à valider ({reviewCount})</button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
        <div style={cts.leftList}>
          {(() => {
            // Arborescence : Carte ▸ Plat ▸ Recettes (+ « Non classés » et orphelines)
            const recettesParPlat = {};
            (plats || []).forEach(p => {
              const ids = (p.recettes || []).map(pr => pr.recetteId);
              recettesParPlat[p.id] = filtered.filter(r => ids.includes(r.id));
            });
            // Une recette est orpheline SEULEMENT si elle n'apparaît dans aucun plat
            const allLinkedRecetteIds = new Set();
            (plats || []).forEach(p => (p.recettes || []).forEach(pr => allLinkedRecetteIds.add(pr.recetteId)));
            const orphelines = filtered.filter(r => !allLinkedRecetteIds.has(r.id));

            const renderRecetteItem = (r, indent = 0, keyPrefix = '') => (
              <div
                key={keyPrefix + r.id + '-' + indent}
                style={{
                  ...cts.recetteItem,
                  ...(selectedId === r.id ? cts.recetteItemActive : {}),
                  ...(recSel.active && recSel.isSelected(r.id) ? { background: 'var(--bg)' } : {}),
                  position: 'relative',
                  paddingLeft: 14 + indent * 18 + (recSel.active ? 24 : 0),
                }}
                onClick={() => (recSel.active ? recSel.toggle(r.id) : setSelectedId(r.id))}
              >
                {recSel.active && (
                  <input
                    type="checkbox"
                    checked={recSel.isSelected(r.id)}
                    onChange={() => recSel.toggle(r.id)}
                    onClick={e => e.stopPropagation()}
                    style={{ position: 'absolute', left: 6 + indent * 18, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, cursor: 'pointer' }}
                  />
                )}
                <div style={cts.recItemName}>
                  {indent > 0 && <span style={{ color: 'var(--text2)', marginRight: 4 }}>↳</span>}
                  {r.nom}
                </div>
                <div style={cts.recItemMeta}>
                  {r.categorie} · {r.portions || '?'} p. · v{r.version || 1}
                  {r.foodCost && (
                    <span style={{ marginLeft: 6, color: r.foodCost < 30 ? 'var(--success-strong)' : r.foodCost < 35 ? 'var(--warning-strong)' : 'var(--danger-strong)', fontWeight: 600 }}>
                      {' '}FC {r.foodCost.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            );

            // Un plat est visible si son nom matche ou s'il a une recette filtrée.
            const platMatches = (p) => searchValue === '' || normalizeSearch(p.nom).includes(searchValue) || (recettesParPlat[p.id]?.length > 0);

            // Retire le plat d'UNE carte (lien carte↔plat) sans supprimer le plat
            // ni ses recettes : il reste dans l'établissement et sur les autres cartes.
            const retirerPlatDeCarte = async (plat, carte) => {
              if (!confirmLegacy(`Retirer « ${plat.nom} » de la carte « ${carte.nom} » ?\n\nLe plat n'est pas supprimé : il reste dans l'établissement et sur les autres cartes.`)) return;
              try {
                if (legacySB) await legacySB.db.removePlatFromCarte(carte.id, plat.id);
                setPlats(prev => prev.map(p => p.id === plat.id
                  ? { ...p, carteIds: (p.carteIds || []).filter(id => id !== carte.id) }
                  : p));
              } catch (err) { notifyLegacy('Erreur : ' + (err.message || err), 'error'); }
            };

            const renderPlatBlock = (plat, folder) => {
              const keyPrefix = folder.id + '-';
              const inCarte = folder.id !== '__none__';
              const platRecettes = recettesParPlat[plat.id] || [];
              const isExpanded = expandedPlats.has(plat.id);
              return (
                <div key={keyPrefix + plat.id}>
                  <div style={{ ...cts.platHeader, paddingLeft: 16, background: isExpanded ? 'var(--bg)' : 'transparent' }}>
                    <button
                      style={cts.platToggle}
                      onClick={() => {
                        const next = new Set(expandedPlats);
                        isExpanded ? next.delete(plat.id) : next.add(plat.id);
                        setExpandedPlats(next);
                      }}
                      title={isExpanded ? 'Réduire' : 'Développer'}
                    >{isExpanded ? '▼' : '▶'}</button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={cts.platName}>🍽 {plat.nom}</div>
                      <div style={cts.platMeta}>
                        {plat.categorie}
                        {plat.prixVente != null && ` · CHF ${plat.prixVente.toFixed(2)}`}
                        {' · '}{platRecettes.length} recette{platRecettes.length > 1 ? 's' : ''}
                      </div>
                    </div>
                    {inCarte && (
                      <button
                        style={{ ...cts.platEditBtn, color: 'var(--text3)' }}
                        onClick={(e) => { e.stopPropagation(); retirerPlatDeCarte(plat, { id: folder.id, nom: folder.nom }); }}
                        title={`Retirer de la carte « ${folder.nom} » (ne supprime pas le plat)`}
                      >⊖</button>
                    )}
                    <button
                      style={cts.platEditBtn}
                      onClick={() => { setEditPlat(plat); setShowPlatForm(true); }}
                      title="Modifier le plat"
                    >✎</button>
                  </div>
                  {isExpanded && (platRecettes.length === 0 ? (
                    <div style={{ padding: '8px 14px 8px 56px', fontSize: 11, color: 'var(--text2)', fontStyle: 'italic' }}>
                      Aucune recette rattachée
                    </div>
                  ) : (
                    platRecettes.map(r => renderRecetteItem(r, 2, keyPrefix))
                  ))}
                </div>
              );
            };

            // Dossiers : une carte active par menu + « Non classés » (plats sans
            // carte active - inclut les plats dont toutes les cartes sont archivées,
            // pour qu'ils ne disparaissent pas de la liste).
            const activeCarteIds = new Set(cartesActivesLocal.map(c => c.id));
            const folders = [
              ...cartesActivesLocal.map(c => ({
                id: c.id, nom: c.nom,
                plats: (plats || []).filter(p => (p.carteIds || []).includes(c.id) && platMatches(p)),
              })),
              { id: '__none__', nom: 'Non classés', plats: (plats || []).filter(p => !(p.carteIds || []).some(id => activeCarteIds.has(id)) && platMatches(p)) },
            ];

            return (
              <>
                {plats.length === 0 && (
                  <div style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text2)', borderBottom: '1px solid var(--border)', fontStyle: 'italic' }}>
                    Aucun plat. Cliquez "+ Plat" pour créer une hiérarchie.
                  </div>
                )}

                {/* ─── Cartes ▸ Plats ▸ Recettes ─── */}
                {folders.map(folder => {
                  // En recherche, on masque les dossiers vides ; sinon « Non classés » n'apparaît que s'il a des plats.
                  if (folder.plats.length === 0 && (searchValue !== '' || folder.id === '__none__')) return null;
                  // En recherche, les dossiers restants s'ouvrent d'office :
                  // sinon on ne verrait que des en-têtes de cartes.
                  const collapsed = searchValue === '' && !expandedCartes.has(folder.id);
                  return (
                    <div key={folder.id}>
                      <div
                        style={cts.carteHeader}
                        onClick={() => {
                          const next = new Set(expandedCartes);
                          expandedCartes.has(folder.id) ? next.delete(folder.id) : next.add(folder.id);
                          setExpandedCartes(next);
                        }}
                        title={collapsed ? 'Développer' : 'Réduire'}
                      >
                        <span style={{ fontSize: 10, color: 'var(--text2)' }}>{collapsed ? '▶' : '▼'}</span>
                        <span style={cts.carteFolderName}>{folder.id === '__none__' ? '🗂' : '📋'} {folder.nom}</span>
                        <span style={cts.carteCount}>{folder.plats.length}</span>
                      </div>
                      {!collapsed && folder.plats.map(plat => renderPlatBlock(plat, folder))}
                      {!collapsed && folder.plats.length === 0 && (
                        <div style={{ padding: '8px 14px 8px 30px', fontSize: 11, color: 'var(--text2)', fontStyle: 'italic' }}>
                          Aucun plat sur cette carte
                        </div>
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
                    {orphelines.map(r => renderRecetteItem(r, 0, 'orph-'))}
                  </>
                )}

                {/* ─── Recettes archivées (repliées par défaut) ─── */}
                {archiveesFiltrees.length > 0 && (
                  <>
                    <div
                      style={{ ...cts.orphelinHeader, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => setShowArchivees(v => !v)}
                      title={showArchivees ? 'Réduire' : 'Développer'}
                    >
                      <span style={{ fontSize: 10 }}>{showArchivees ? '▼' : '▶'}</span>
                      <span>🗄 Archivées ({archiveesFiltrees.length})</span>
                    </div>
                    {showArchivees && archiveesFiltrees.map(r => (
                      <div key={'arch-' + r.id} style={{ opacity: 0.6 }}>
                        {renderRecetteItem(r, 0, 'arch-')}
                      </div>
                    ))}
                  </>
                )}

                {filtered.length === 0 && archiveesFiltrees.length === 0 && (
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
              background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 13, color: 'var(--warning-text)', flex: 1, minWidth: 200 }}>
                ⚠ {pendingDrafts.length} brouillon(s) non sauvegardé(s) détecté(s) - des modifications locales n'ont pas été synchronisées.
              </span>
              <button
                style={{ ...cts.ghostBtn, background: 'var(--success-text)', color: '#fff', borderColor: 'var(--success-text)' }}
                onClick={restoreDrafts}
              >Restaurer</button>
              <button style={cts.ghostBtn} onClick={dismissDrafts}>Ignorer</button>
            </div>
          )}
          {/* Actions bar */}
          <div style={cts.actionBar} className="no-print">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={{ ...cts.ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={duplicate}><Copy size={14} /> Dupliquer</button>
              <button
                style={{ ...cts.ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--warning-bg)', color: 'var(--warning-text)', borderColor: 'var(--warning-bd)' }}
                onClick={() => setLinkPlatPickerForRecette(selected.id)}
              >
                <UtensilsCrossed size={14} /> Rattacher à un plat
                {(() => {
                  const linkedCount = plats.filter(p => p.recettes.some(pr => pr.recetteId === selected.id)).length;
                  return linkedCount > 0 ? ` (${linkedCount})` : '';
                })()}
              </button>
              {/* borderColor explicite dans les deux branches : React réutilise le
                  nœud <button> au toggle et retirer borderColor sur un border
                  shorthand déclenche un warning de conflit de styles. */}
              {selected.statut === 'archivée' ? (
                <button
                  style={{ ...cts.ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)', borderColor: 'var(--accent-bd)' }}
                  onClick={() => archiverSelected(false)}
                  title="Restaurer la recette (repasse en brouillon)"
                ><ArchiveRestore size={14} /> Désarchiver</button>
              ) : (
                <button
                  style={{ ...cts.ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, borderColor: 'var(--border)' }}
                  onClick={() => archiverSelected(true)}
                  title="Sortir la recette de la bibliothèque et des plats, sans la supprimer"
                ><Archive size={14} /> Archiver</button>
              )}
              <button style={{ ...cts.ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--danger-strong)', borderColor: 'var(--danger-bd)' }} onClick={() => setShowDeleteConfirm(true)}><Trash2 size={14} /> Supprimer</button>
              <button
                style={{ ...cts.ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--ai-bg-soft)', color: 'var(--ai-text)', borderColor: 'var(--ai-bd)' }}
                onClick={genererHaccpIA}
                disabled={haccpAiBusy}
              ><ShieldCheck size={14} /> {haccpAiBusy ? 'Analyse HACCP…' : 'Analyse HACCP (IA)'}</button>
              <button
                style={{ ...cts.ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--ai-bg-soft)', color: 'var(--ai-text)', borderColor: 'var(--ai-bd)' }}
                onClick={suggererIA}
                disabled={suggestAiBusy}
              ><Sparkles size={14} /> {suggestAiBusy ? 'Suggestions…' : 'Suggestions (IA)'}</button>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {saveStatus === 'saving' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text2)' }}><Loader2 size={12} /> Sauvegarde…</span>}
              {saveStatus === 'saved' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--success-text)', fontWeight: 600 }}><Check size={12} /> Sauvegardé</span>}
              {saveStatus === 'error' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--danger-strong)', fontWeight: 600 }} title={saveError}><AlertTriangle size={12} /> Erreur sync</span>}
              <button style={{ ...cts.ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => pdfUtils?.exportRecettePdf(buildRecettePdfData(selected, { isConsultant: user?.role === 'consultant', portions: selected.portions }), { etablissement, autoPrint: true })}><Printer size={14} /> Imprimer</button>
              <button style={{ ...cts.ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => pdfUtils?.exportRecettePdf(buildRecettePdfData(selected, { isConsultant: user?.role === 'consultant', portions: selected.portions }), { etablissement, filename: `Fiche_${slug(selected.nom)}.pdf` })}><FileDown size={14} /> Export PDF</button>
            </div>
          </div>

          {/* Modale d'analyse HACCP générée par IA */}
          {haccpResult && (
            <div
              className="no-print"
              style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(20,16,12,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
              onClick={(e) => { if (e.target === e.currentTarget) setHaccpResult(null); }}
            >
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(760px,96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>🛡 Analyse HACCP - {selected.nom}</div>
                  <button onClick={() => setHaccpResult(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' }}>✕</button>
                </div>
                <div style={{ padding: 18, overflowY: 'auto' }}>
                  <div style={{ fontSize: 11, color: 'var(--warning-text)', background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
                    Généré par IA - à valider par un responsable avant utilisation.
                  </div>
                  {(haccpResult.points || []).length === 0 && (
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>Aucun point de maîtrise identifié.</div>
                  )}
                  {(haccpResult.points || []).map((p, i) => (
                    <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8, background: 'var(--bg)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.etape || '-'}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10, background: '#e0e7ff', color: '#3730a3' }}>{p.type || '-'}</span>
                        {p.ccp && <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10, background: 'var(--danger-bg)', color: 'var(--danger-text)' }}>CCP</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4 }}>⚠ {p.danger || '-'}</div>
                      {p.mesure && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Maîtrise : {p.mesure}</div>}
                      {p.limiteCritique && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Limite critique : {p.limiteCritique}</div>}
                      {p.surveillance && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Surveillance : {p.surveillance}</div>}
                    </div>
                  ))}
                  {haccpResult.conservation && (
                    <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text)' }}><strong>Conservation :</strong> {haccpResult.conservation}</div>
                  )}
                  {haccpResult.remarques && (
                    <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text2)' }}><strong>Remarques :</strong> {haccpResult.remarques}</div>
                  )}
                </div>
                <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button style={cts.ghostBtn} onClick={() => setHaccpResult(null)}>Fermer</button>
                  <button
                    style={{ ...cts.ghostBtn, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }}
                    onClick={insererHaccpDansNotes}
                  >Insérer dans les notes</button>
                </div>
              </div>
            </div>
          )}

          {/* Modale des suggestions de complétion IA */}
          {suggestResult && (
            <div
              className="no-print"
              style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(20,16,12,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
              onClick={(e) => { if (e.target === e.currentTarget) setSuggestResult(null); }}
            >
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(680px,96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>✨ Suggestions IA - {selected.nom}</div>
                  <button onClick={() => setSuggestResult(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' }}>✕</button>
                </div>
                <div style={{ padding: 18, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text2)' }}>Ingrédients suggérés ({suggestResult.ingredients.length})</div>
                    {suggestResult.ingredients.length > 0 && <button style={cts.smallBtn} onClick={ajouterTousIngredientsSuggere}>+ Tout ajouter</button>}
                  </div>
                  {suggestResult.ingredients.length === 0 && <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', marginBottom: 10 }}>Aucune suggestion d'ingrédient.</div>}
                  {suggestResult.ingredients.map((ing, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{ing.nom}</span>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{ing.quantite || ''} {ing.unite}</span>
                      <button style={cts.smallBtn} onClick={() => ajouterIngredientSuggere(i)}>+ Ajouter</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 6px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text2)' }}>Étapes suggérées ({suggestResult.etapes.length})</div>
                    {suggestResult.etapes.length > 0 && <button style={cts.smallBtn} onClick={ajouterToutesEtapesSuggere}>+ Tout ajouter</button>}
                  </div>
                  {suggestResult.etapes.length === 0 && <div style={{ fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>Aucune suggestion d'étape.</div>}
                  {suggestResult.etapes.map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{e}</span>
                      <button style={cts.smallBtn} onClick={() => ajouterEtapeSuggere(i)}>+ Ajouter</button>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                  <button style={cts.ghostBtn} onClick={() => setSuggestResult(null)}>Fermer</button>
                </div>
              </div>
            </div>
          )}

          <div style={cts.printZone}>
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
                    <label style={{fontSize:11, fontWeight:600, color:'var(--success-text)'}}>Publier sur la carte active</label>
                    <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'6px 10px', background: isRecetteActive(selected) ? 'var(--success-bg)' : 'var(--surface2)', border:'1px solid', borderColor: isRecetteActive(selected) ? 'var(--success-bd)' : 'var(--border)', borderRadius:8}}>
                      <input type="checkbox"
                        checked={isRecetteActive(selected)}
                        onChange={e => toggleActifSurCarte(selected, e.target.checked)}
                        style={{accentColor:'var(--success-text)'}}/>
                      <span style={{fontSize:12, fontWeight:600, color: isRecetteActive(selected) ? 'var(--success-text)' : 'var(--text2)'}}>
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
                    <strong style={{ color: foodCost == null ? 'var(--text2)' : foodCost < 30 ? 'var(--success-strong)' : foodCost < 35 ? 'var(--warning-strong)' : 'var(--danger-strong)' }}>
                      {foodCost == null ? '-' : foodCost.toFixed(1) + ' %'}
                    </strong>
                  </div>
                  <div style={cts.kpiItem}>
                    <span style={cts.kpiLabel}>Marge brute / portion</span>
                    <strong style={{ color: margeBrute >= 0 ? 'var(--success-strong)' : 'var(--danger-strong)' }}>CHF {margeBrute.toFixed(2)}</strong>
                  </div>
                </div>
              </div>

              {/* Allergènes */}
              <div style={{...cts.card, gridColumn: '1/-1'}}>
                <div style={{...cts.cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                  <span>Allergènes</span>
                  <button
                    onClick={detectAllergenesIA}
                    disabled={allergenAiBusy}
                    title="Détecter les allergènes à partir des ingrédients (IA)"
                    style={{
                      padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                      fontFamily: 'var(--font)', cursor: allergenAiBusy ? 'wait' : 'pointer',
                      background: 'var(--ai-bg-soft)', border: '1px solid var(--ai-bd)', color: 'var(--ai-text)',
                      opacity: allergenAiBusy ? 0.6 : 1,
                    }}
                  >{allergenAiBusy ? '✨ Analyse…' : '✨ Détecter (IA)'}</button>
                </div>
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
                          border: active ? '1px solid var(--warning-strong)' : '1px solid var(--border)',
                          background: active ? 'var(--warning-bg)' : 'var(--surface)',
                          color: active ? 'var(--warning-text)' : 'var(--text2)',
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
                {allergenesInconnus.length > 0 && (
                  <div style={{ margin: '0 14px 14px', padding: '8px 10px', background: 'var(--warning-bg-soft)', border: '1px solid var(--warning-bd)', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning-text)', marginBottom: 6 }}>
                      {allergenesInconnus.length} valeur{allergenesInconnus.length > 1 ? 's' : ''} hors liste (import ancien) - à convertir ou retirer
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {allergenesInconnus.map(v => {
                        const { ids } = normalizeAllergenes([v]);
                        return (
                          <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px', border: '1.5px dashed var(--warning-bd)', borderRadius: 20, background: 'var(--surface)', fontSize: 11, color: 'var(--warning-text)' }}>
                            {v}
                            {ids.length > 0 && (
                              <button
                                className="touch-target"
                                onClick={() => corrigerAllergeneInconnu(v)}
                                title={`Remplacer par ${ids.map(labelAllergene).join(' + ')}`}
                                style={{ border: 'none', background: 'none', color: 'var(--warning-text)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', padding: '0 4px' }}
                              >→ {ids.map(labelAllergene).join(' + ')}</button>
                            )}
                            <button
                              className="touch-target"
                              onClick={() => retirerAllergeneInconnu(v)}
                              title="Retirer cette valeur"
                              style={{ border: 'none', background: 'none', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', padding: '0 4px' }}
                            >✕</button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Ingrédients */}
              <div style={{...cts.card, gridColumn: '1/-1'}}>
                <div style={{...cts.cardTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8}}>
                  <span>Ingrédients ({(selected.ingredients || []).length})</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(selected.ingredients || []).length > 0 && (
                      <button
                        style={{ padding: '5px 12px', background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 7, color: 'var(--warning-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
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

                <div style={{padding: 14}} className="grid-table-scroll">
                  <div style={cts.ingHead} className="grid-table-row">
                    <span>Nom</span>
                    <span>
                      Qté
                      {parseFloat(scalingPortions) > 0 && parseFloat(scalingPortions) !== Number(selected.portions) && (
                        <span style={{ fontSize: 10, color: 'var(--warning-text)', marginLeft: 4 }}>(recalculé)</span>
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
                    // Suggestions discrètes (3+ chars, max 5 résultats),
                    // uniquement pour la ligne en cours d'édition : le panneau est
                    // en position absolue et recouvrirait les lignes suivantes.
                    const showSugg = focusedIngId === ing.id && (ing.nom || '').length >= 3 && catalogue.length > 0 && !ing.produitId;
                    const suggestions = showSugg
                      ? catalogue
                          .filter(p => normalizeSearch(p.nom).includes(normalizeSearch(ing.nom)))
                          .slice(0, 5)
                      : [];
                    const isLinked = !!ing.produitId;

                    return (
                    <div key={ing.id} className="grid-table-row" style={{ ...cts.ingRow, position: 'relative' }}>
                      {/* Champ nom */}
                      <div style={{ position: 'relative', flex: 2, display: 'flex', alignItems: 'stretch', gap: 4 }}>
                        {isLinked && (
                          <span
                            style={{ display: 'flex', alignItems: 'center', padding: '0 6px', background: 'var(--success-bg)', border: '1px solid var(--success-bd)', borderRadius: 5, fontSize: 11, color: 'var(--success-text)', cursor: 'pointer' }}
                            title="Lié au catalogue (matching automatique) · clic pour délier"
                            onClick={() => updateIngredient(idx, 'produitId', null)}
                          >⛓</span>
                        )}
                        {!isLinked && ing.needsReview && (
                          <span
                            style={{ display: 'flex', alignItems: 'center', padding: '0 6px', background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 5, fontSize: 11, color: 'var(--warning-text)', cursor: 'pointer' }}
                            title="Correspondance catalogue incertaine · cliquer pour choisir"
                            onClick={() => { setPickerSearch(ing.nom || ''); setCatalogPicker(ing.id); }}
                          >⚠</span>
                        )}
                        <DebouncedField
                          key={`${ing.id}:${ing.produitId || ''}:${ing.needsReview ? 'r' : ''}`}
                          type="text"
                          value={ing.nom || ''}
                          onCommit={v => {
                            // Matching automatique catalogue au commit du nom.
                            const updated = [...(selected.ingredients || [])];
                            let next = { ...updated[idx], nom: v, produitId: null };
                            delete next.needsReview;
                            delete next.matchSuggestions;
                            const result = matchIngredient(v, catalogue);
                            if (result.status === 'matched' && result.product) {
                              next = applyProductToIngredient(next, result.product);
                            } else if (result.status === 'ambiguous') {
                              next.needsReview = true;
                              next.matchSuggestions = (result.suggestions || [])
                                .filter(s => s.product)
                                .map(s => ({ produitId: s.product.id, nom: s.product.nom, confidence: s.confidence }));
                            }
                            updated[idx] = next;
                            updateSelected({ ingredients: updated });
                          }}
                          placeholder="Ingrédient"
                          style={{ ...cts.ingInput, flex: 1, width: 'auto' }}
                          autoComplete="off"
                          onFocus={() => setFocusedIngId(ing.id)}
                          onBlur={() => setFocusedIngId(cur => (cur === ing.id ? null : cur))}
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

      {/* Modale suppression - enrichie : montre les plats impactés */}
      {showDeleteConfirm && (() => {
        // Cherche dans les plats ceux qui contiennent cette recette
        const platsImpactes = (plats || []).filter(p =>
          (p.recettes || []).some(pr => pr.recetteId === selected?.id)
        );
        return (
          <div className="modal-sheet-overlay" style={cts.overlay} onClick={() => setShowDeleteConfirm(false)}>
            <div className="modal-sheet" style={cts.modal} onClick={e => e.stopPropagation()}>
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
                    background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 8,
                    padding: 12, marginBottom: 14,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning-text)', marginBottom: 6 }}>
                      ⚠ Cette recette est utilisée dans {platsImpactes.length} plat{platsImpactes.length > 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--warning-text)', marginBottom: 8, lineHeight: 1.5 }}>
                      Si vous supprimez la recette, ces plats perdront leur composante (les autres recettes liées resteront en place) :
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#78350f' }}>
                      {platsImpactes.slice(0, 8).map(p => (
                        <li key={p.id} style={{ marginBottom: 2 }}>
                          <strong>{p.nom}</strong>
                          <span style={{ color: 'var(--warning-text)', fontSize: 11 }}> - {p.categorie}</span>
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
                  <button style={{...cts.newBtn, background: 'var(--danger-strong)'}} onClick={deleteRecette}>
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
            const saved = await legacySB.db.upsertPlat({
              ...p,
              etablissementId: etabId,
              prixVente: p.prixVente === '' ? null : Number(p.prixVente),
            });
            // Affectation aux cartes (M2M) - l'id existe désormais (création ou édition).
            const platId = saved?.id || p.id;
            if (platId) await legacySB.db.setPlatCartes(platId, p.carteIds || []);
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
          <div className="modal-full-overlay" style={cts.overlay} onClick={() => { setShowPlatForm(false); setEditPlat(null); }}>
            <div className="modal-full" style={{ ...cts.modal, width: 480, maxWidth: '94vw' }} onClick={e => e.stopPropagation()}>
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
                      {CATEGORIES_PLAT.map(c => <option key={c} value={c}>{c}</option>)}
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
                {/* ─── Cartes (menus) où figure ce plat ─── */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Cartes (menus)</label>
                  {cartesActivesLocal.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6, fontStyle: 'italic' }}>
                      Aucune carte. Créez-en dans « Cartes &amp; Recettes » pour pouvoir y rattacher ce plat.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {cartesActivesLocal.map(c => {
                        const checked = (p.carteIds || []).includes(c.id);
                        return (
                          <label key={c.id}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                              border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 20,
                              background: checked ? 'var(--accent-light)' : 'var(--surface)',
                              color: checked ? 'var(--accent)' : 'var(--text2)', fontSize: 12, cursor: 'pointer', fontWeight: checked ? 700 : 500,
                            }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const cur = p.carteIds || [];
                                setP({ carteIds: checked ? cur.filter(id => id !== c.id) : [...cur, c.id] });
                              }}
                            />
                            {c.nom}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                {p.id && (
                  <button style={{ ...cts.ghostBtn, color: 'var(--danger-strong)', borderColor: 'var(--danger-bd)' }} onClick={deletePlat}>🗑 Supprimer</button>
                )}
                <div style={{ flex: 1 }} />
                <button style={cts.ghostBtn} onClick={() => { setShowPlatForm(false); setEditPlat(null); }}>Annuler</button>
                <button style={{ ...cts.newBtn, padding: '8px 16px' }} onClick={savePlat}>{p.id ? 'Enregistrer' : 'Créer le plat'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── Modale rattacher UNE recette à des plats ─── */}
      {linkPlatPickerForRecette !== null && selected && (
        <PlatPicker
          key={selected.id}
          title="Rattacher à un plat"
          subtitle={`« ${selected.nom} » peut appartenir à plusieurs plats : cochez-les, puis enregistrez. Décocher retire le lien.`}
          plats={plats}
          cartes={cartesActivesLocal}
          initialSelected={plats.filter(p => (p.recettes || []).some(pr => pr.recetteId === selected.id)).map(p => p.id)}
          confirmLabel={(n) => `Enregistrer (${n})`}
          emptyHint={'Aucun plat. Créez-en un d\'abord avec « + Plat ».'}
          busy={recBulkBusy}
          onConfirm={(ids) => appliquerPlatsPourRecette(selected, ids)}
          onClose={() => setLinkPlatPickerForRecette(null)}
          onCreatePlat={() => { setLinkPlatPickerForRecette(null); setEditPlat(null); setShowPlatForm(true); }}
        />
      )}

      {/* ─── Modale rattacher la sélection (multi-recettes) à plusieurs plats ─── */}
      {bulkLinkPlatOpen && (() => {
        const selIds = Array.from(recSel.ids);
        const dejaCount = (p) => selIds.filter(rid => (p.recettes || []).some(pr => pr.recetteId === rid)).length;
        // Un plat qui a déjà TOUTES les recettes de la sélection est coché et
        // verrouillé : le décocher signifierait délier en masse, ce que cette
        // modale ne fait pas (le retrait se gère recette par recette).
        const complets = plats.filter(p => selIds.length > 0 && dejaCount(p) === selIds.length).map(p => p.id);
        return (
          <PlatPicker
            title="Rattacher la sélection à des plats"
            subtitle={`${selIds.length} recette${selIds.length > 1 ? 's' : ''} sélectionnée${selIds.length > 1 ? 's' : ''} : cochez tous les plats qui les recevront comme composants.`}
            plats={plats}
            cartes={cartesActivesLocal}
            lockedIds={complets}
            badgeFor={(p) => {
              const n = dejaCount(p);
              if (!n) return null;
              return (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--success-text)', background: 'var(--success-bg)', border: '1px solid var(--success-bd)', borderRadius: 10, padding: '2px 8px', flexShrink: 0 }}>
                  {n === selIds.length ? 'déjà toutes liées' : `${n}/${selIds.length} déjà liée${n > 1 ? 's' : ''}`}
                </span>
              );
            }}
            confirmLabel={(n) => `Rattacher à ${n} plat${n > 1 ? 's' : ''}`}
            emptyHint={'Aucun plat. Créez-en un d\'abord avec « + Nouveau plat ».'}
            busy={recBulkBusy}
            onConfirm={(ids) => rattacherSelectionAuxPlats(plats.filter(p => ids.includes(p.id) && !complets.includes(p.id)))}
            onClose={() => setBulkLinkPlatOpen(false)}
            onCreatePlat={() => { setBulkLinkPlatOpen(false); setEditPlat(null); setShowPlatForm(true); }}
          />
        );
      })()}

      {/* ─── Modale transfert de la sélection vers un autre établissement ─── */}
      {bulkTransferOpen && (
        <EtablissementTransferModal
          recettes={recettesEtab.filter(r => recSel.ids.has(r.id))}
          etablissements={etablissementsCibles}
          sourceNom={etablissement?.nom || ''}
          loadRecettesCible={(id) => legacySB.db.listRecettes(id, { strict: true })}
          busy={recBulkBusy}
          onConfirm={transfererRecettesSelection}
          onClose={() => setBulkTransferOpen(false)}
        />
      )}

      {/* ─── Modale picker catalogue ─── */}
      {catalogPicker !== null && selected && (() => {
        const isMultiMode = catalogPicker === 'multi';
        const cats = ['Tous', ...new Set(catalogue.map(p => p.categorie).filter(Boolean))];
        const filtered = catalogue.filter(p =>
          (pickerCat === 'Tous' || p.categorie === pickerCat) &&
          (normalizeSearch(pickerSearch) === '' || normalizeSearch(p.nom).includes(normalizeSearch(pickerSearch)))
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
          <div className="modal-full-overlay" style={cts.overlay} onClick={() => setCatalogPicker(null)}>
            <div className="modal-full" style={{ ...cts.modal, width: 700, maxWidth: '94vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
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
                          ) : <span style={{ color: 'var(--text2)', fontSize: 12 }}>-</span>}
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
          <div className="modal-full-overlay" style={cts.overlay} onClick={() => setShowScalingModal(false)}>
            <div className="modal-full" style={{ ...cts.modal, width: 620, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>⚖ Calculateur de quantités</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>Les valeurs de base de la recette ne sont pas modifiées</div>
                </div>
                <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' }} onClick={() => setShowScalingModal(false)}>✕</button>
              </div>

              {/* ─── Mode 1 : par portions ─── */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: useGramMode ? 'var(--bg)' : 'var(--warning-bg-soft)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning-text)', textTransform: 'uppercase', letterSpacing: 0.4, width: '100%' }}>
                  Méthode 1 - Par nombre de portions
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
                    style={{ width: 70, padding: '7px 10px', border: '2px solid ' + (useGramMode ? 'var(--border)' : 'var(--accent)'), borderRadius: 8, fontSize: 16, fontWeight: 700, textAlign: 'center', fontFamily: 'var(--font)', background: 'var(--surface)', color: 'var(--text)' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>portions</span>
                </div>
              </div>

              {/* ─── Mode 2 : par grammage cible ─── */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: useGramMode ? 'var(--warning-bg-soft)' : 'var(--bg)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning-text)', textTransform: 'uppercase', letterSpacing: 0.4, width: '100%' }}>
                  Méthode 2 - Par quantité cible d'un ingrédient
                </div>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Avec</span>
                <select
                  value={scalingTarget.ingId}
                  onChange={e => { setScalingTarget({ ingId: e.target.value, targetQty: '' }); setScalingPortions(''); }}
                  style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', maxWidth: 240, cursor: 'pointer' }}
                >
                  <option value="">Choisir un ingrédient…</option>
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
                      style={{ width: 90, padding: '7px 10px', border: '2px solid ' + (useGramMode ? 'var(--accent)' : 'var(--border)'), borderRadius: 8, fontSize: 16, fontWeight: 700, textAlign: 'center', fontFamily: 'var(--font)', background: 'var(--surface)', color: 'var(--text)' }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text2)' }}>{targetIng.unite}</span>
                  </>
                )}
              </div>

              {/* Bandeau de résultat */}
              {isScaled && (
                <div style={{ padding: '10px 20px', background: 'var(--warning-bg)', borderBottom: '1px solid var(--warning-bd)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning-text)' }}>
                    Facteur appliqué : × {ratio < 1 ? ratio.toFixed(3) : Number.isInteger(ratio) ? ratio : ratio.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--warning-text)' }}>
                    → équivaut à {finalPortions} portion{finalPortions > 1 ? 's' : ''}
                  </div>
                  <button
                    style={{ marginLeft: 'auto', padding: '4px 10px', background: 'none', color: 'var(--warning-text)', border: '1px solid var(--warning-bd)', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}
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
                  <span style={{ textAlign: 'right', color: isScaled ? 'var(--warning-text)' : 'var(--text2)' }}>
                    {isScaled ? `Recalculé` : '-'}
                  </span>
                </div>
                {ings.map((ing, idx) => {
                  const qBase = Number(ing.quantite) || 0;
                  const qCalc = qBase * ratio;
                  const fmt = (q) => {
                    if (q === 0) return '-';
                    if (q >= 1000 && ing.unite === 'g') return `${(q/1000).toFixed(q % 1000 === 0 ? 0 : 2)} kg`;
                    if (q >= 1000 && ing.unite === 'ml') return `${(q/1000).toFixed(q % 1000 === 0 ? 0 : 2)} L`;
                    if (q % 1 === 0) return `${q} ${ing.unite}`;
                    if (q < 1) return `${Math.round(q * 1000) / 1000} ${ing.unite}`;
                    return `${Math.round(q * 10) / 10} ${ing.unite}`;
                  };
                  const isTargetIng = useGramMode && ing.id === scalingTarget.ingId;
                  return (
                    <div key={ing.id || idx} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px', gap: 4, padding: '9px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center', background: isTargetIng ? 'var(--warning-bg)' : (idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)') }}>
                      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: isTargetIng ? 700 : 500 }}>
                        {isTargetIng && '🎯 '}{ing.nom || '-'}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'right' }}>{fmt(qBase)}</span>
                      <span style={{ fontSize: 13, fontWeight: isScaled ? 700 : 400, color: isScaled ? 'var(--warning-text)' : 'var(--text2)', textAlign: 'right' }}>
                        {isScaled ? fmt(qCalc) : '-'}
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
