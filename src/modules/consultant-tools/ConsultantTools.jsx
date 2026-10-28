import React from 'react';
import { getDemoData } from '../../data/demoData.js';
import ImportLauncher from '../recettes/import/ImportLauncher.jsx';
import SafeModule from '../../legacy/SafeModule.jsx';
import { getBrowserWindow, notifyLegacy, readLegacyStorage, writeLegacyStorage } from '../../legacy/legacyApi.js';
import { readText, writeText, removeStorageKeys, UI_STORAGE_KEYS } from '../../utils/storage.js';
import { Factures } from '../factures/index.js';
import { pdfUtils } from '../../services/pdf.js';
import { dbService } from '../../services/dbService.js';
import { navigateToPage, ouvrirCompte } from '../../services/navigationService.js';
import { ongletCompteDepuisOutils } from '../moduleConfig.js';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// OUTILS CONSULTANT - Chiffrage des fiches et des plats, administration.
// Liste à gauche, chiffrage de la fiche choisie à droite. L'édition des fiches
// et des plats (nom, ingrédients, étapes, allergènes, cartes) vit dans
// Cartes & Recettes depuis le 27.10.2026 : « Modifier la fiche » y mène.
// ─────────────────────────────────────────────────────────────────────────────

import { cts } from './ConsultantTools.styles.js';
import { fmtQte } from '../../utils/echelleRecette.js';
import { AlertTriangle, ChevronDown, ChevronRight, Link2, Loader2, Pencil } from 'lucide-react';
import DebouncedField from '../../components/ui/DebouncedField.jsx';
import { BoutonActions, Fenetre, st as fst } from '../../components/ui/Fenetres.jsx';
import {
  applyProductToIngredient,
  buildProduitIndex,
  computeCoutMatiere,
  describePrixIngredient,
} from '../../services/prixResolution.js';
import AmbiguousMatchReview from '../recettes/AmbiguousMatchReview.jsx';
import BulkProductLinker from './components/BulkProductLinker.jsx';
import EtablissementTransferModal from './components/EtablissementTransferModal.jsx';
import { useSelection } from '../../hooks/useSelection.js';
import { Btn } from '../../components/ui/index.jsx';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import { exportRowsToXlsx } from '../../utils/exportXlsx.js';
import { buildRecettePdfData, slug } from '../../utils/recettePdfData.js';
import { makeSearchMatcher, normalizeSearch } from '../../utils/searchText.js';
import { messageErreur } from '../../utils/messageErreur.js';

// Onglets retirés le 27.10.2026 : 'vue', 'creation_carte', 'simulation' ; le
// même jour « Plats & Recettes » ('recettes') est devenu « Chiffrage ». Un
// ancien lien ou un onglet mémorisé qui les nomme retombe sur 'chiffrage'.
// Le 28.10.2026, Rôles & accès, Établissements et Alertes sont passés dans
// l'espace Compte : un lien vers l'un d'eux y mène (ongletCompteDepuisOutils),
// un onglet mémorisé qui en nomme un retombe sur 'chiffrage'.
const CONSULTANT_TOOLS_TABS = ['chiffrage', 'factures'];
const ongletValide = (t) => (t === 'recettes' ? 'chiffrage' : t);
// Dernier onglet visité, restauré à l'ouverture du module (préférence UI locale).
const LAST_TAB_KEY = UI_STORAGE_KEYS.consultantToolsLastTab;

// La liaison ingrédient -> produit vit dans prixResolution : elle est partagée
// avec AmbiguousMatchReview et ne doit surtout pas diverger d'un écran à l'autre.

const ConsultantToolsGate = (props) => {
  if (props.user?.role !== 'consultant') {
    return (
      <div style={{ padding: 60, textAlign: 'center', maxWidth: 480, margin: '40px auto' }}>
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
  // Catalogue produits : prix des lignes liées, liaison en masse.
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

  // Index du catalogue pour le calcul de coût : le prix d'un ingrédient lié se
  // lit au catalogue, pas dans la copie figée de la recette. Tant que le
  // catalogue n'est pas chargé, chaque ingrédient retombe sur son prixUnit -
  // un repli, jamais un zéro qui ferait passer une recette pour gratuite.
  const produitIndex = React.useMemo(() => buildProduitIndex(catalogue), [catalogue]);

  // ─── Plats (hiérarchie) ───
  const [plats, setPlats] = React.useState([]);
  const [expandedPlats, setExpandedPlats] = React.useState(new Set());
  // Dossiers cartes dépliés (vide = toutes repliées par défaut). L'arborescence
  // tient ainsi sur un écran à l'arrivée : on ouvre la carte qu'on cherche au
  // lieu de scroller tous les plats de toutes les cartes.
  const [expandedCartes, setExpandedCartes] = React.useState(new Set());
  // Prix de vente d'un plat : la fenêtre ouverte depuis son crayon.
  const [platPrix, setPlatPrix] = React.useState(null);
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
  // Onglets dispo : voir CONSULTANT_TOOLS_TABS.
  // Priorité : redirection ponctuelle (ancien lien /factures par ex., clé
  // one-shot) > dernier onglet visité (persisté) > Chiffrage. Une valeur hors
  // de la liste (onglet retiré) passe à la suivante.
  // Clé ponctuelle qui nomme un onglet passé dans Compte : lue avant activeTab
  // (qui l'efface), renvoyée vers Compte une fois le module monté.
  const [renvoiCompte] = React.useState(() => ongletCompteDepuisOutils(ongletValide(readText('sc_consultant_tools_tab', ''))));
  const [activeTab, setActiveTab] = React.useState(() => {
    try {
      const pre = ongletValide(readText('sc_consultant_tools_tab', ''));
      if (pre) {
        removeStorageKeys(['sc_consultant_tools_tab']);
        if (CONSULTANT_TOOLS_TABS.includes(pre)) {
          return pre;
        }
      }
      const last = ongletValide(readText(LAST_TAB_KEY, ''));
      if (CONSULTANT_TOOLS_TABS.includes(last)) return last;
      // Dernier onglet passé dans Compte : Compte s'ouvrira dessus, avant que
      // l'effet ci-dessous ne remplace ce souvenir par 'chiffrage'.
      const versCompte = ongletCompteDepuisOutils(last);
      if (versCompte && !readText(UI_STORAGE_KEYS.compteLastTab, '')) writeText(UI_STORAGE_KEYS.compteLastTab, versCompte);
    } catch(e) {}
    return 'chiffrage';
  });
  React.useEffect(() => { writeText(LAST_TAB_KEY, activeTab); }, [activeTab]);
  React.useEffect(() => { if (renvoiCompte) ouvrirCompte(renvoiCompte); }, [renvoiCompte]);
  React.useEffect(() => {
    const browserWindow = getBrowserWindow();
    if (!browserWindow) return undefined;

    const handleTabNavigation = (event) => {
      const nextTab = ongletValide(event?.detail?.tab);
      if (CONSULTANT_TOOLS_TABS.includes(nextTab)) {
        setActiveTab(nextTab);
      } else if (ongletCompteDepuisOutils(nextTab)) {
        ouvrirCompte(ongletCompteDepuisOutils(nextTab));
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

  // Filtrer par établissement
  const recettesEtab = recettes.filter(r => (r.etablissementId || 'etab-1') === etabId);
  // Archivage : statut 'archivée' → section Archivées de la liste.
  const recettesActives = recettesEtab.filter(r => r.statut !== 'archivée');
  const recettesArchivees = recettesEtab.filter(r => r.statut === 'archivée');

  // Chargement initial + realtime depuis Supabase. Les écritures d'ici sont
  // ciblées (prix de vente, prix d'une ligne) : la version de la base fait foi.
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
          if (firstOpen) setSelectedId(cur => cur || firstOpen.id);
        }
      } catch (err) { console.error('[ConsultantTools load]', err); }
    })();
    unsub = legacySB.realtime.subscribeReload('recettes', async () => {
      try {
        const recs = await legacySB.db.listRecettes(etabId);
        if (mounted) setRecettes(Array.isArray(recs) ? recs : []);
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
      r.coutMatiere = computeCoutMatiere(r.ingredients, produitIndex);
      r.coutPortion = r.portions ? r.coutMatiere / r.portions : 0;
      r.foodCost = r.prixVente ? (r.coutPortion / r.prixVente * 100) : null;
      r.margeGrossePct = r.prixVente ? ((r.prixVente - r.coutPortion) / r.prixVente * 100) : null;
      if (r.tempsPreparation != null && r.tempsCuisson != null) {
        r.tempsTotal = Number(r.tempsPreparation) + Number(r.tempsCuisson);
      }
    });
    demoData.recettes = recettes;
    if (!legacySB) writeLegacyStorage('sc_recettes', recettes);
    // produitIndex en dépendance : quand le catalogue finit de charger, ou qu'un
    // prix change en realtime, les coûts se recalculent sans réenregistrer les recettes.
  }, [recettes, produitIndex]);

  const selected = recettes.find(r => r.id === selectedId);

  // Par mots, dans n'importe quel ordre (« confit de sanglier » trouve « Sanglier confit »).
  const matchRecette = makeSearchMatcher(search);
  const filtered = recettesActives.filter(r => matchRecette(r.nom));
  const archiveesFiltrees = recettesArchivees.filter(r => matchRecette(r.nom));
  // Section « Archivées » de la liste : repliée par défaut.
  const [showArchivees, setShowArchivees] = React.useState(false);
  // Correspondances catalogue incertaines (héritées d'un import) : compteur
  // affiché sur le bouton « Gérer » de la liste.
  const reviewCount = recettesEtab.reduce((s, r) => s + (r.ingredients || []).filter(i => i.needsReview).length, 0);
  // Ingrédients sans lien catalogue : tant qu'ils sont majoritaires, un prix tenu
  // au catalogue n'atteint presque aucune recette. C'est ce que débloque la liaison en masse.
  const unlinkedCount = recettesEtab.reduce(
    (s, r) => s + (r.ingredients || []).filter(i => i && !i.produitId && (i.nom || '').trim()).length,
    0,
  );

  // ═══ Écritures du chiffrage ═══
  const [saveStatus, setSaveStatus] = React.useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = React.useState('');
  const ecrire = async (action) => {
    setSaveStatus('saving');
    try {
      await action();
      setSaveStatus('saved');
      setSaveError('');
      setTimeout(() => setSaveStatus(prev => (prev === 'saved' ? 'idle' : prev)), 2000);
      return true;
    } catch (err) {
      console.error('[Chiffrage]', err);
      setSaveStatus('error');
      setSaveError(messageErreur(err, 'outils consultant', 'Synchronisation impossible.'));
      return false;
    }
  };
  const majLocale = (id, patch) => setRecettes(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const enregistrerPrixVente = (recette, valeur) => {
    const prix = Number(valeur) || 0;
    if (prix === (Number(recette.prixVente) || 0)) return;
    majLocale(recette.id, { prixVente: prix });
    if (legacySB) ecrire(() => legacySB.db.setRecettePrixVente(recette.id, prix));
  };

  const enregistrerPrixLigne = (recette, ingId, valeur) => {
    const prix = Number(valeur) || 0;
    const ligne = (recette.ingredients || []).find(i => i.id === ingId);
    if (!ligne || prix === (Number(ligne.prixUnit) || 0)) return;
    majLocale(recette.id, { ingredients: (recette.ingredients || []).map(i => (i.id === ingId ? { ...i, prixUnit: prix } : i)) });
    if (legacySB) {
      ecrire(async () => {
        const ingredients = await legacySB.db.setRecetteIngredientPrix(recette.id, ingId, prix);
        majLocale(recette.id, { ingredients });
      });
    }
  };

  const enregistrerPrixPlat = async (plat, valeur) => {
    const prixVente = String(valeur).trim() === '' ? null : Number(valeur);
    if (!legacySB) { setPlatPrix(null); return; }
    // upsertPlat ne lit que ses colonnes : nom, cartes et recettes restent.
    const ok = await ecrire(() => legacySB.db.upsertPlat({ ...plat, prixVente, etablissementId: etabId }));
    if (ok) {
      setPlats(prev => prev.map(p => (p.id === plat.id ? { ...p, prixVente } : p)));
      setPlatPrix(null);
    }
  };

  // L'éditeur de la fiche est dans Cartes & Recettes : clé ponctuelle pour
  // une première ouverture du module, événement s'il est déjà monté.
  const modifierDansCartes = (id) => {
    if (!id) return;
    writeText(UI_STORAGE_KEYS.recettesEditer, id);
    const w = getBrowserWindow();
    if (w) w.dispatchEvent(new w.CustomEvent('sc:recettes-editer', { detail: { id } }));
    navigateToPage('cartes');
  };

  // Mode sélection multiple de recettes (export chiffré, cacher, transférer)
  const recSel = useSelection();
  const [recBulkBusy, setRecBulkBusy] = React.useState(false);
  const recettesRef = React.useRef(recettes);
  React.useEffect(() => { recettesRef.current = recettes; }, [recettes]);

  // Cache (flag=true) ou réaffiche des recettes dans Cartes & Recettes, pour
  // tous les rôles. Elles restent ici, entières, et continuent de servir la
  // production (MEP, commande, étiquettes). Update ciblé hors sauvegarde
  // automatique : cf. setRecettesMasquees. Renvoie le nombre de recettes
  // basculées, ou null si l'écriture a échoué (l'état local ne bouge pas).
  const masquerRecettes = async (ids, flag) => {
    const aBasculer = ids.filter(id => {
      const r = recettesRef.current.find(x => x.id === id);
      return r && (r.masquee === true) !== flag;
    });
    if (!aBasculer.length) return 0;
    if (legacySB) {
      try { await legacySB.db.setRecettesMasquees(aBasculer, flag); }
      catch (err) {
        // 42703 / PGRST204 = colonne `masquee` absente : migration 20260928 pas
        // encore appliquée. Message lisible plutôt qu'un code SQL brut.
        const colonneAbsente = err?.code === '42703' || err?.code === 'PGRST204';
        notifyLegacy(
          colonneAbsente
            ? 'Masquage de recette indisponible : la mise à jour de la base n\'a pas encore été appliquée.'
            : 'Recette non masquée. ' + messageErreur(err, 'outils consultant'),
          'error',
        );
        return null;
      }
    }
    const touchees = new Set(aBasculer);
    setRecettes(prev => prev.map(r => (touchees.has(r.id) ? { ...r, masquee: flag } : r)));
    return aBasculer.length;
  };

  const cacherSelected = async (flag) => {
    if (!selected) return;
    const nom = selected.nom;
    const n = await masquerRecettes([selected.id], flag);
    if (!n) return;
    notifyLegacy(
      flag
        ? `« ${nom} » cachée : plus visible dans Cartes & Recettes, pour aucun rôle.`
        : `« ${nom} » de nouveau visible dans Cartes & Recettes.`,
      'success',
    );
  };

  // Mode sélection : si toutes les recettes cochées sont déjà cachées, le
  // bouton les rend visibles ; sinon il cache celles qui ne le sont pas.
  const selectionToutesCachees = recSel.count > 0
    && recettesEtab.filter(r => recSel.isSelected(r.id)).every(r => r.masquee === true);
  const cacherRecettesSelection = async () => {
    if (recSel.count === 0) return;
    const flag = !selectionToutesCachees;
    setRecBulkBusy(true);
    const n = await masquerRecettes(Array.from(recSel.ids), flag);
    setRecBulkBusy(false);
    if (n === null) return;
    recSel.exit();
    notifyLegacy(
      flag
        ? `${n} recette(s) cachée(s) dans Cartes & Recettes.`
        : `${n} recette(s) de nouveau visible(s) dans Cartes & Recettes.`,
      'success',
    );
  };

  // ─── Mode sélection : export Excel chiffré ───
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
      notifyLegacy('Export impossible. ' + messageErreur(err, 'outils consultant'), 'error');
    }
    setRecBulkBusy(false);
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
  // part sans lien produit, sans drapeau de correspondance et sans prix : les
  // trois désignent le catalogue de départ. Le prix figé est remis à zéro pour
  // la même raison que le lien : un tarif d'un site ne chiffre pas un autre
  // site (l'ingrédient apparaît « à lier » à l'arrivée).
  const recopierIngredients = (ings, catalogueCible) => {
    const parNom = new Map();
    (catalogueCible || []).forEach(p => {
      const k = normalizeSearch(p.nom);
      if (k && !parNom.has(k)) parNom.set(k, p);
    });
    return (ings || []).map(ing => {
      const match = parNom.get(normalizeSearch(ing.nom || ''));
      if (match) return applyProductToIngredient(ing, match);
      const copie = { ...ing, prixUnit: 0 };
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
    notifyLegacy(parts.join(', ') || 'Aucune recette transférée.', ko ? 'warning' : 'success');
  };

  // ═══ Cartes (dossiers de l'arbre) ═══
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

  // Cartes non archivées : seules visibles comme dossiers. Les archivées
  // gardent leurs liaisons en base.
  const cartesActivesLocal = (cartesLocal || []).filter(c => !c.archive);

  // ═══ Import multiple de recettes ═══
  // L'import (Excel / CSV / PDF, template, parsing, preview, insertion par
  // lots) est géré par le module dédié src/modules/recettes/import.
  const [showImport, setShowImport] = React.useState(false);
  // Écran de résolution des correspondances catalogue ambiguës
  const [showMatchReview, setShowMatchReview] = React.useState(false);
  const [showBulkLinker, setShowBulkLinker] = React.useState(false);

  // ── Calculs dérivés pour affichage live
  const coutMatiere = selected ? computeCoutMatiere(selected.ingredients, produitIndex) : 0;
  const coutPortion = (selected?.portions > 0) ? coutMatiere / Number(selected.portions) : 0;
  const foodCost = selected && selected.prixVente ? (coutPortion / selected.prixVente * 100) : null;
  const margeBrute = selected && selected.prixVente ? selected.prixVente - coutPortion : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Barre d'onglets - deux groupes : chiffrage | facturation client.
          L'administration (paramètres, rôles, alertes) vit dans l'espace Compte. */}
      <div className="no-print" style={{ marginBottom: 14 }}>
        <SegmentedTabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: 'chiffrage', label: 'Chiffrage' },
            { divider: true },
            { id: 'factures', label: 'Factures' },
          ]}
        />
      </div>

      {/* Routage des onglets - reutilise les composants migres via imports.
          Chaque onglet est isolé dans un SafeModule pour qu'un crash n'affecte pas les autres. */}
      {activeTab === 'factures' ? (
        Factures
          ? (SafeModule
              ? <SafeModule name="Factures">{React.createElement(Factures, { user, etablissement })}</SafeModule>
              : React.createElement(Factures, { user, etablissement }))
          : <div style={cts.fallback}>Module Factures non chargé.</div>
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
      {showBulkLinker && (
        <BulkProductLinker
          recettes={recettesEtab}
          catalogue={catalogue}
          legacySB={legacySB}
          etabId={etabId}
          onClose={() => setShowBulkLinker(false)}
          onDone={async () => {
            try {
              const [recs, ps] = await Promise.all([
                legacySB.db.listRecettes(etabId),
                legacySB.db.listProduits(etabId),
              ]);
              if (Array.isArray(recs)) setRecettes(recs);
              if (Array.isArray(ps)) setCatalogue(ps);
            } catch (e) { /* le realtime rafraîchira les listes */ }
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
      {/* Colonne gauche : liste */}
      <div style={cts.leftCol} className="no-print">
        {/* En-tête : une rangée (Gérer, chercher), ou la barre de sélection
            qui la remplace. */}
        <div style={cts.leftHeader}>
          {recSel.active ? (
            <SelectionToolbar
              layout="stack"
              count={recSel.count}
              total={filtered.length}
              allSelected={recSel.count > 0 && recSel.count === filtered.length}
              onToggleAll={() => (recSel.count === filtered.length ? recSel.clear() : recSel.selectAll(filtered.map(r => r.id)))}
              onExport={exporterRecettesSelection}
              exportLabel="Excel"
              onCancel={recSel.exit}
              busy={recBulkBusy}
              /* La recherche reste accessible : « Tout » sélectionne la liste
                 filtrée, filtrer puis tout cocher est l'usage courant. */
              headExtra={<SearchToggle value={search} onChange={setSearch} placeholder="Rechercher…" />}
            >
              <Btn small variant="ghost" onClick={cacherRecettesSelection} disabled={recSel.count === 0 || recBulkBusy}>
                {selectionToutesCachees ? 'Rendre visible' : 'Cacher'}
              </Btn>
              {/* legacySB : le transfert écrit en base, il n'a pas de sens en
                  mode démo (bridge absent) où il ne ferait rien. */}
              {legacySB && etablissementsCibles.length > 0 && (
                <Btn small variant="ghost" onClick={() => setBulkTransferOpen(true)} disabled={recSel.count === 0 || recBulkBusy}>
                  Transférer
                </Btn>
              )}
            </SelectionToolbar>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <BoutonActions
                id="chiffrage-gerer"
                label={`Gérer${reviewCount > 0 ? ` (${reviewCount})` : ''}`}
                style={{ ...cts.ghostBtn, flex: 1 }}
                titre="Gérer les recettes"
                sections={[{ items: [
                  { titre: 'Sélectionner plusieurs recettes', detail: 'Pour les exporter en Excel chiffré, les cacher ou les transférer.', onClick: recSel.enter },
                  reviewCount > 0 && { titre: `Correspondances à valider (${reviewCount})`, detail: 'Ingrédients rapprochés du catalogue avec un doute.', onClick: () => setShowMatchReview(true) },
                  unlinkedCount > 0 && { titre: `Lier les ingrédients au catalogue (${unlinkedCount})`, detail: 'Ingrédients encore sans produit du catalogue.', onClick: () => setShowBulkLinker(true) },
                  { titre: 'Importer des recettes', detail: 'Depuis un fichier Excel ou un document.', onClick: () => setShowImport(true) },
                ] }]}
              />
              <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher…" />
            </div>
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
                  {r.masquee === true && (
                    <span style={cts.tagCachee} title="Invisible dans Cartes & Recettes">Cachée</span>
                  )}
                  {r.categorie}, {r.portions || '?'} p., v{r.version || 1}
                  {r.foodCost && (
                    <span style={{ marginLeft: 6, color: r.foodCost < 30 ? 'var(--success-strong)' : r.foodCost < 35 ? 'var(--warning-strong)' : 'var(--danger-strong)', fontWeight: 500 }}>
                      {' '}FC {r.foodCost.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            );

            // Un plat est visible si son nom matche ou s'il a une recette filtrée.
            const platMatches = (p) => matchRecette(p.nom) || (recettesParPlat[p.id]?.length > 0);

            const renderPlatBlock = (plat, folder) => {
              const keyPrefix = folder.id + '-';
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
                    >{isExpanded ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}</button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={cts.platName}>{plat.nom}</div>
                      <div style={cts.platMeta}>
                        {plat.categorie}
                        {plat.prixVente != null && `, CHF ${plat.prixVente.toFixed(2)}`}
                        {', '}{platRecettes.length} recette{platRecettes.length > 1 ? 's' : ''}
                      </div>
                    </div>
                    <button
                      style={cts.platEditBtn}
                      onClick={() => setPlatPrix(plat)}
                      title="Prix de vente du plat"
                      aria-label="Prix de vente du plat"
                    ><Pencil size={14} aria-hidden="true" /></button>
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
                    Aucun plat. Les plats se créent dans Cartes & Recettes.
                  </div>
                )}

                {/* ─── Cartes ▸ Plats ▸ Recettes ─── */}
                {folders.map(folder => {
                  // En recherche, on masque les dossiers vides ; sinon « Non classés » n'apparaît que s'il a des plats.
                  if (folder.plats.length === 0 && (matchRecette.active || folder.id === '__none__')) return null;
                  // En recherche, les dossiers restants s'ouvrent d'office :
                  // sinon on ne verrait que des en-têtes de cartes.
                  const collapsed = !matchRecette.active && !expandedCartes.has(folder.id);
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
                        <span style={{ fontSize: 11, color: 'var(--text2)' }}>{!collapsed ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}</span>
                        <span style={cts.carteFolderName}>{folder.nom}</span>
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
                      <span style={{ fontSize: 11 }}>{showArchivees ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}</span>
                      <span>Archivées ({archiveesFiltrees.length})</span>
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

      {/* Colonne droite : chiffrage */}
      {!selected ? (
        <div style={cts.emptyState}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>Aucune recette sélectionnée</div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>Choisissez une recette dans la liste. Les fiches se créent dans Cartes & Recettes, avec la tuile « Nouvelle fiche » de l'accueil du module.</div>
        </div>
      ) : (
        <div style={cts.rightCol}>
          <div style={cts.actionBar} className="no-print">
            <button type="button" style={cts.newBtn} onClick={() => modifierDansCartes(selected.id)}>Modifier la fiche</button>
            <BoutonActions
              id="recette-exporter"
              label="Exporter"
              style={cts.ghostBtn}
              titre="Exporter la fiche chiffrée"
              sousTitre={selected.nom}
              sections={[{ items: [
                { titre: 'Télécharger le PDF', detail: 'La fiche technique sur une page, food cost compris.', onClick: () => pdfUtils?.exportRecettePdf(buildRecettePdfData(selected, { isConsultant: true, portions: selected.portions }), { etablissement, filename: `Fiche_${slug(selected.nom)}.pdf` }) },
                { titre: 'Imprimer', detail: 'La même fiche, envoyée à l\'imprimante.', onClick: () => pdfUtils?.exportRecettePdf(buildRecettePdfData(selected, { isConsultant: true, portions: selected.portions }), { etablissement, autoPrint: true }) },
              ] }]}
            />
            <BoutonActions
              id="recette-actions"
              label="Actions"
              style={cts.ghostBtn}
              titre="Actions sur la recette"
              sousTitre={selected.nom}
              sections={[{ items: [
                selected.masquee === true
                  ? { titre: 'Rendre visible', detail: 'La recette réapparaît dans Cartes & Recettes.', onClick: () => cacherSelected(false) }
                  : { titre: 'Cacher', detail: 'Invisible dans Cartes & Recettes pour tous ; elle reste ici et en production.', onClick: () => cacherSelected(true) },
              ] }]}
            />
            <div style={{ flex: 1 }} />
            {saveStatus === 'saving' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text2)' }}><Loader2 size={12} /> Sauvegarde…</span>}
            {saveStatus === 'saved' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--success-text)', fontWeight: 500 }}>Sauvegardé</span>}
            {saveStatus === 'error' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--danger-strong)', fontWeight: 500 }} title={saveError}>Enregistrement échoué</span>}
          </div>

          {/* Une recette cachée ne se distingue pas ici : le bandeau dit où
              elle n'apparaît plus, et ce qui continue de l'utiliser. */}
          {selected.masquee === true && (
            <div className="no-print" style={cts.bandeauCachee}>
              Recette cachée : invisible dans Cartes & Recettes, pour tous les rôles. Elle reste utilisée par la mise en place, la commande et les étiquettes, et ses allergènes comptent toujours dans les plats qui la contiennent.
            </div>
          )}

          <div style={cts.printZone}>
            <div style={cts.header}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>{selected.nom}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                {selected.categorie}, {selected.portions || '?'} portion{Number(selected.portions) > 1 ? 's' : ''}, v{selected.version || 1}, {selected.statut || 'brouillon'}
              </div>
            </div>

            <div style={cts.grid}>
              <div style={cts.card}>
                <div style={cts.cardTitle}>Prix de vente</div>
                <div style={cts.paramGrid}>
                  <div style={cts.field}>
                    <label style={cts.label}>Prix vente (CHF)</label>
                    <DebouncedField key={selected.id} type="number" min="0" step="0.10" value={selected.prixVente || 0} onCommit={v => enregistrerPrixVente(selected, v)} style={cts.input} />
                  </div>
                </div>
              </div>

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

              {/* Ingrédients : quantités en lecture (elles se changent dans la
                  fiche), prix par unité modifiable sur une ligne sans lien. */}
              <div style={{...cts.card, gridColumn: '1/-1'}}>
                <div style={cts.cardTitle}>Ingrédients ({(selected.ingredients || []).length})</div>
                <div style={{padding: 14}} className="grid-table-scroll">
                  <div style={{ ...cts.ingHead, gridTemplateColumns: COLONNES_CHIFFRAGE }} className="grid-table-row">
                    <span>Nom</span>
                    <span>Qté</span>
                    <span>Unité</span>
                    <span>Prix / unité</span>
                    <span>Coût</span>
                  </div>
                  {(selected.ingredients || []).length === 0 && (
                    <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' }}>
                      Aucun ingrédient. Ils se saisissent dans la fiche : « Modifier la fiche », en haut.
                    </div>
                  )}
                  {(selected.ingredients || []).map((ing) => {
                    // Prix effectivement retenu pour le coût matière. Sur une ligne
                    // liée il vient du catalogue : le champ passe en lecture seule,
                    // sinon on afficherait un prix modifiable que le calcul ignore.
                    const prixInfo = describePrixIngredient(ing, produitIndex);
                    const prixDuCatalogue = prixInfo.source === 'catalogue';
                    return (
                      <div key={ing.id} className="grid-table-row" style={{ ...cts.ingRow, gridTemplateColumns: COLONNES_CHIFFRAGE }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 13, color: 'var(--text)' }}>
                          {ing.produitId && <span style={{ color: 'var(--success-text)', display: 'inline-flex' }} title="Lié au catalogue"><Link2 size={13} aria-hidden="true" /></span>}
                          {!ing.produitId && ing.needsReview && <span style={{ color: 'var(--warning-text)', display: 'inline-flex' }} title="Correspondance catalogue incertaine"><AlertTriangle size={13} aria-hidden="true" /></span>}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.nom || 'Sans nom'}</span>
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--text)', textAlign: 'right' }} data-no-translate>{fmtQte(Number(ing.quantite) || 0)}</span>
                        <span style={{ fontSize: 13, color: 'var(--text2)' }}>{ing.unite}</span>
                        {prixDuCatalogue ? (
                          <input
                            type="text"
                            readOnly
                            value={prixInfo.prix.toFixed(3)}
                            title={`Prix du catalogue (${prixInfo.produit?.nom || ''}). Délier la ligne dans la fiche pour saisir un prix à la main`}
                            style={{ ...cts.ingInput, color: 'var(--text2)', background: 'var(--bg)', cursor: 'not-allowed' }}
                          />
                        ) : (
                          <DebouncedField
                            key={selected.id + ':' + ing.id}
                            type="number" min="0" step="0.001"
                            value={ing.prixUnit}
                            onCommit={v => enregistrerPrixLigne(selected, ing.id, v)}
                            title={prixInfo.source === 'incompatible'
                              ? `Unités non convertibles (catalogue en ${prixInfo.produit?.uniteRef}, ligne en ${ing.unite}), prix saisi à la main`
                              : undefined}
                            style={{
                              ...cts.ingInput,
                              ...(prixInfo.source === 'incompatible'
                                ? { borderColor: 'var(--warning-bd)', background: 'var(--warning-bg)' }
                                : {}),
                            }}
                          />
                        )}
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', alignSelf: 'center', textAlign: 'right' }}>
                          {((Number(ing.quantite) || 0) * prixInfo.prix).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Prix de vente d'un plat ─── */}
      {platPrix && (
        <PrixPlatFenetre plat={platPrix} onClose={() => setPlatPrix(null)} onEnregistrer={(v) => enregistrerPrixPlat(platPrix, v)} />
      )}

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
    </div>
      )}
    </div>
  );
};

// Nom, qté, unité, prix par unité, coût. Le nom garde 140 px : la colonne de
// droite est étroite sur tablette (la table défile alors en largeur).
const COLONNES_CHIFFRAGE = 'minmax(140px, 2fr) 70px 60px 100px 80px';

// Prix de vente d'un plat (vide = pas de prix). Entrée enregistre.
function PrixPlatFenetre({ plat, onClose, onEnregistrer }) {
  const [valeur, setValeur] = React.useState(plat.prixVente ?? '');
  const pied = (
    <>
      <button type="button" style={fst.secondaire} onClick={onClose}>Annuler</button>
      <button type="button" style={fst.primaire} onClick={() => onEnregistrer(valeur)}>Enregistrer</button>
    </>
  );
  return (
    <Fenetre id="chiffrage-prix-plat" titre="Prix de vente du plat" sousTitre={plat.nom} onClose={onClose} largeur={380} pied={pied}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={fst.label}>Prix de vente (CHF)</span>
        <input
          autoFocus
          type="number" min="0" step="0.50" inputMode="decimal"
          value={valeur}
          onChange={e => setValeur(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnregistrer(valeur); } }}
          placeholder="0.00"
          style={fst.champ}
        />
      </label>
    </Fenetre>
  );
}

// On expose le Gate (qui vérifie le rôle) sous le nom ConsultantTools
// pour que le routing principal n'ait rien à changer.
export default ConsultantToolsGate;
