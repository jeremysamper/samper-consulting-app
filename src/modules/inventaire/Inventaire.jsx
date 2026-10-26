import React from 'react';
import { getDemoData, canManageModule, getPermissionsForRole } from '../../data/demoData.js';
import { pdfUtils } from '../../services/pdf.js';
import { alertLegacy, confirmLegacy, notifyLegacy, readLegacyStorage, writeLegacyStorage } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { useSelection } from '../../hooks/useSelection.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { removeStorageKeys } from '../../utils/storage.js';
import { exportRowsToXlsx } from '../../utils/exportXlsx.js';
import { PERIMETRE_DEFAUT, PERIMETRES_SUGGERES, perimetreOf, listePerimetres, valeurStockConsolidee } from '../../utils/inventairePerimetres.js';
import { userDisplayName } from '../../utils/userDisplay.js';
import {
  getPendingSaisieCount,
  listPendingSaisies,
  saisirStockOnlineOrQueue,
  subscribePendingSaisies,
} from '../../services/offline/inventaireSync.js';
import { isNetworkError } from '../../services/offline/offlineNet.js';
import {
  recalcInventaire, parseQuantite, estCompte, cleProduit,
  ligneDepuisProduit, ligneLibre, lignesReprises,
} from './inventaireLignes.js';
import AccueilInventaire from './AccueilInventaire.jsx';
import ChoixPerimetre from './ChoixPerimetre.jsx';
import EnTeteEcran from './EnTeteEcran.jsx';
import EcranComptage from './EcranComptage.jsx';
import EcartsPanel from './EcartsPanel.jsx';
import ImportDocumentsAchats from './ImportDocumentsAchats.jsx';
import VerifierLecture from './VerifierLecture.jsx';
import { useRapprochement } from './useRapprochement.js';
import { estACompleter } from './achatsLogic.js';
import { normalizeName } from '../../services/recipeProductMatching.js';
import AjoutProduitsModal from './AjoutProduitsModal.jsx';
import ProduitsMaisonModal from './ProduitsMaisonModal.jsx';
import {
  construireReferencesPrix, coutUnitaireRecette, masseRecette, ligneDepuisRecette, lierLigne, fichesActives, cartesDesFiches, fichesManquantes,
} from './produitsMaison.js';
import { useAchatsDocuments } from './useAchatsDocuments.js';
import { messageErreur } from '../../utils/messageErreur.js';
import { Btn } from '../../components/ui/index.jsx';
import { BoutonActions, Fenetre } from '../../components/ui/Fenetres.jsx';

// L'onglet Achats embarque la lecture de PDF et le rapprochement : chargé
// seulement quand on l'ouvre, le comptage reste léger sur la tablette.
const AchatsPanel = React.lazy(() => import('./AchatsPanel.jsx'));
// Même principe pour l'onglet Factures (lecture IA, visionneuse).
const FacturesPanel = React.lazy(() => import('./FacturesPanel.jsx'));

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Plus récent d'abord : la liste arrive déjà triée de la base, mais un
// inventaire créé dans la session est simplement empilé en tête.
const parDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

// Écrans du module : l'accueil (une tuile par tâche), puis un écran par tâche
// ('perimetre', 'comptage', 'import', 'verification', 'reglement', 'ecarts').
// Mémorisé sous sc_inventaire_ecran ; seuls les écrans qui se suffisent à
// eux-mêmes sont repris à l'ouverture suivante, un import ou un choix de
// périmètre repart de l'accueil.
const ECRANS_REPRIS = ['accueil', 'comptage', 'ecarts', 'reglement'];
// Clé des anciens onglets de vues : lue une fois pour être effacée.
const ANCIENNE_CLE_VUE = 'sc_inventaire_vue';

const dateCH = (iso) => (iso ? String(iso).split('-').reverse().join('.') : '');

// Actions rares du module, rangées derrière deux boutons nommés : « Exporter »
// (PDF, Excel, impression, ouverts à toute l'équipe) et « Gérer » (création,
// renommage, import...), les BoutonActions partagés de Fenetres.jsx : fenêtre
// en portail, Échap et geste retour, comme dans les autres modules.

// Réapplique les quantités encore en file par-dessus une liste venue du serveur
// (ou du cache du service worker). Une quantité comptée en chambre froide reste
// affichée tant qu'elle n'est pas synchronisée : elle n'existe alors nulle part
// ailleurs que dans IndexedDB.
const recouvrirSaisiesEnAttente = (liste, saisies) => {
  if (!saisies?.length) return liste;
  const parInventaire = new Map();
  saisies.forEach((s) => {
    if (!parInventaire.has(s.inventaireId)) parInventaire.set(s.inventaireId, new Map());
    parInventaire.get(s.inventaireId).set(s.ligneId, s);
  });
  return liste.map((inv) => {
    const parLigne = parInventaire.get(inv.id);
    if (!parLigne) return inv;
    return recalcInventaire({
      ...inv,
      lignes: (inv.lignes || []).map((l) => {
        const saisie = parLigne.get(l.id);
        return saisie ? { ...l, stockReel: saisie.stockReel } : { ...l };
      }),
    });
  });
};

// INVENTAIRE - plusieurs périmètres en parallèle (cuisine, boissons, matériel...)
const Inventaire = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const [inventairesAll, setInventairesAll] = React.useState(() => legacySB ? [] : readLegacyStorage('sc_inventaires', demoData.inventaires));

  // Miroir de la liste, tenu en avance sur le rendu.
  // Une quantité comptée est enregistrée au blur du champ ; si l'utilisateur
  // passe directement du champ à un bouton (« Valider l'inventaire »,
  // « Supprimer »), le blur et le clic tombent dans le même geste. Une écriture
  // qui repartirait de l'objet capturé au rendu précédent réécrirait l'ancienne
  // quantité par-dessus celle qui vient d'être saisie. Toutes les écritures de
  // la liste passent donc par `appliquerListe`, qui met le miroir à jour
  // AVANT le rendu, et toutes les lectures d'écriture par `invCourant`.
  const inventairesRef = React.useRef(inventairesAll);
  const appliquerListe = React.useCallback((calculer) => {
    // `calculer` doit être pure : elle est appliquée au miroir puis rejouée par
    // React sur l'état (mise à jour fonctionnelle, composable avec la file).
    inventairesRef.current = calculer(inventairesRef.current);
    setInventairesAll(calculer);
  }, []);

  // Filtrer par établissement courant
  const inventairesEtab = inventairesAll.filter(i => (i.etablissementId || 'etab-1') === etabId);
  // Périmètres ouverts dans l'établissement (Cuisine, Boissons, Matériel...)
  const perimetres = listePerimetres(inventairesEtab);
  const [perimetre, setPerimetre] = React.useState(() => readLegacyStorage('sc_inventaire_perimetre', PERIMETRE_DEFAUT));
  // Le périmètre mémorisé peut avoir disparu (supprimé, ou autre établissement)
  const perimetreActif = perimetres.includes(perimetre) ? perimetre : (perimetres[0] || PERIMETRE_DEFAUT);
  // Un seul périmètre à l'écran : tout le module (sélecteur de date, KPI,
  // comparaison vs précédent) ne travaille que sur cette pile.
  const inventaires = inventairesEtab.filter(i => perimetreOf(i) === perimetreActif).sort(parDateDesc);
  // Bornes des périodes de l'onglet Factures : chaque inventaire du périmètre.
  const datesInventairesPerimetre = inventaires.map(i => i.date);
  const [selectedId, setSelectedId] = React.useState(() => readLegacyStorage('sc_inventaire_selected', inventaires[0]?.id));
  const [showNew, setShowNew] = React.useState(false);
  // Formulaire « nouvel inventaire » : périmètre + date + modèle de base.
  const [newInv, setNewInv] = React.useState({ nom: PERIMETRE_DEFAUT, nomLibre: '', date: aujourdhui(), base: 'dupliquer' });
  // Renommage du périmètre affiché (réécrit toute sa pile d'inventaires).
  const [showRename, setShowRename] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');
  const [renameBusy, setRenameBusy] = React.useState(false);
  // Saisie du stock compté, par ligne. Le champ garde le texte brut tant qu'il
  // a le focus (« 9, » est un état de frappe valide) ; la ligne n'est écrite
  // qu'au blur, sinon chaque frappe déclencherait un upsert et un rechargement
  // realtime en retour.
  const [stockDraft, setStockDraft] = React.useState({});
  const stockRefs = React.useRef({});
  // Sélecteur d'ajout en masse depuis le catalogue.
  const [showAjout, setShowAjout] = React.useState(false);
  // Liaison aux fiches recettes (produits maison).
  const [showMaison, setShowMaison] = React.useState(false);
  const perms = getPermissionsForRole(user.role);
  const canManage = !!perms.inventaire && canManageModule(user.role, 'inventaire');
  // Import d'un classeur Excel (et son modèle) réservé à consultant + patron.
  // Compter, déposer des documents, voir les écarts et exporter sont ouverts
  // à toute l'équipe qui a accès à l'inventaire.
  const canImportXlsx = ['consultant', 'patron'].includes(user.role);
  // Marquer une facture réglée : droit à part (Rôles & accès, « Régler les
  // factures »), donné au comptable sans lui ouvrir le reste. La base applique
  // la même règle (déclencheur achats_documents_garde_reglement). Hors de ce
  // droit, aucun statut de paiement n'apparaît dans le module.
  const canRegler = canManageModule(user.role, 'factures_achat');
  const [ecran, setEcran] = React.useState(() => {
    // Les onglets de vues n'existent plus : la clé est effacée, sa valeur
    // n'est pas reprise, tout le monde découvre l'accueil du module.
    if (readLegacyStorage(ANCIENNE_CLE_VUE, null) != null) removeStorageKeys([ANCIENNE_CLE_VUE]);
    const memo = readLegacyStorage('sc_inventaire_ecran', 'accueil');
    if (memo === 'reglement' && !canRegler) return 'accueil';
    return ECRANS_REPRIS.includes(memo) ? memo : 'accueil';
  });
  // Type du document qu'on dépose, donné par la tuile d'entrée.
  const [importType, setImportType] = React.useState('facture');
  // Les écrans d'import et de règlement restent montés une fois ouverts : une
  // lecture de documents en cours ne s'arrête pas parce qu'on revient à
  // l'accueil du module.
  const [importOuvert, setImportOuvert] = React.useState(ecran === 'import');
  const [reglementOuvert, setReglementOuvert] = React.useState(ecran === 'reglement');
  // Factures et bons d'achat : une seule liste pour tout le module, lue dès
  // le montage (l'accueil compte les documents à compléter et à régler).
  const achats = useAchatsDocuments(etabId);
  // File des documents à vérifier après lecture (ids), dans l'ordre d'import ;
  // les documents déjà « à compléter » passent en tête à l'ouverture d'une
  // tuile d'import. `suiteVerification` : l'écran repris une fois la file vide.
  const [aVerifier, setAVerifier] = React.useState([]);
  const [suiteVerification, setSuiteVerification] = React.useState('accueil');
  // Fournisseurs connus : suggestions de « Vérifier la lecture », rattachement à l'import.
  const [fournisseurs, setFournisseurs] = React.useState([]);
  const importXlsxRef = React.useRef(null);
  // Export de l'état d'inventaire en cours (Excel ou PDF).
  const [exportEnCours, setExportEnCours] = React.useState(false);
  const sel = useSelection();
  const [bulkBusy, setBulkBusy] = React.useState(false);
  // Quantités comptées pas encore parties. Affiché DANS le module en plus du
  // bandeau global : c'est ici qu'on se demande si son comptage est bien parti.
  const saisiesEnAttente = React.useSyncExternalStore(subscribePendingSaisies, getPendingSaisieCount, () => 0);

  // ═══ Load Supabase + Realtime ═══
  // Lecture stricte : une erreur remonte au lieu de rendre []. Sans ça un JWT
  // expiré au réveil d'une tablette affiche « Aucun inventaire » alors que la
  // base est pleine, et la brigade recrée un périmètre en double par-dessus.
  const [loadError, setLoadError] = React.useState(false);
  const reloadRef = React.useRef(null);
  React.useEffect(() => {
    if (!legacySB) return;
    let unsub = null, mounted = true;
    const reload = async () => {
      try {
        const invs = await legacySB.db.listInventaires(etabId, { strict: true });
        if (!mounted) return;
        // Les quantités encore en file priment sur ce que dit le serveur :
        // sans ce recouvrement, un rechargement (ou le cache hors-ligne du SW)
        // réaffiche l'ancienne valeur et le comptage semble perdu.
        const enAttente = await listPendingSaisies();
        if (!mounted) return;
        appliquerListe(() => recouvrirSaisiesEnAttente(invs, enAttente));
        setLoadError(false);
      } catch (err) {
        console.error('[Inventaire load]', err);
        if (mounted) setLoadError(true);
      }
    };
    reloadRef.current = reload;
    reload();
    unsub = legacySB.realtime.subscribeReload('inventaires', reload);
    return () => { mounted = false; reloadRef.current = null; unsub && unsub(); };
  }, [etabId]);

  // ─── Fiches recettes (produits maison) ───
  // Lues depuis le module Cartes & Recettes, jamais modifiées d'ici.
  const [recettes, setRecettes] = React.useState([]);
  const [recettesChargees, setRecettesChargees] = React.useState(false);
  // { cartes, plats } du module Cartes & Recettes ; null tant que non chargé.
  const [cartesPlats, setCartesPlats] = React.useState(null);
  const cartesParFiche = React.useMemo(
    () => (cartesPlats ? cartesDesFiches(cartesPlats.cartes, cartesPlats.plats) : new Map()),
    [cartesPlats],
  );
  React.useEffect(() => {
    if (!legacySB) return undefined;
    let vivant = true;
    legacySB.db.listRecettes(etabId)
      .then(rs => { if (vivant) { setRecettes(fichesActives(rs)); setRecettesChargees(true); } })
      .catch(err => console.warn('[Inventaire] fiches recettes indisponibles', err));
    // Cartes de chaque fiche (Buffet PDJ, Beverage…) : « + Produits » propose
    // les fiches carte par carte. Facultatif : sans elles, liste à plat.
    Promise.all([legacySB.db.listCartes(etabId), legacySB.db.listPlats(etabId)])
      .then(([cartes, plats]) => { if (vivant) setCartesPlats({ cartes: cartes || [], plats: plats || [] }); })
      .catch(err => console.warn('[Inventaire] cartes indisponibles', err));
    return () => { vivant = false; };
  }, [etabId]);

  // ─── Catalogue produits (pour autocomplétion à l'ajout de ligne) ───
  const [catalogue, setCatalogue] = React.useState([]);
  const [catalogueCharge, setCatalogueCharge] = React.useState(false);
  React.useEffect(() => {
    if (!legacySB) return;
    let mounted = true;
    legacySB.db.listProduits(etabId)
      .then(ps => { if (mounted) { setCatalogue(ps || []); setCatalogueCharge(true); } })
      .catch(err => console.warn('[Inventaire] catalogue load failed', err));
    const unsub = legacySB.realtime.subscribeReload('produits', async () => {
      try {
        const ps = await legacySB.db.listProduits(etabId);
        if (mounted) setCatalogue(ps || []);
      } catch(e) {}
    });
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId]);

  React.useEffect(() => {
    if (!legacySB) return undefined;
    let vivant = true;
    legacySB.db.listFournisseurs(etabId).then(f => { if (vivant) setFournisseurs(f || []); }).catch(() => {});
    return () => { vivant = false; };
  }, [etabId]);

  // Si l'inventaire sélectionné n'appartient pas au périmètre affiché (changement
  // d'onglet, d'établissement, suppression), basculer sur le plus récent.
  React.useEffect(() => {
    if (selectedId && inventaires.some(i => i.id === selectedId)) return;
    setSelectedId(inventaires[0]?.id);
  }, [etabId, perimetreActif, inventairesAll]);

  // Persistance : localStorage en fallback uniquement
  React.useEffect(() => { demoData.inventaires = inventairesAll; if (!legacySB) writeLegacyStorage('sc_inventaires', inventairesAll); }, [inventairesAll]);
  React.useEffect(() => { writeLegacyStorage('sc_inventaire_selected', selectedId); }, [selectedId]);
  React.useEffect(() => { writeLegacyStorage('sc_inventaire_perimetre', perimetreActif); }, [perimetreActif]);
  React.useEffect(() => {
    writeLegacyStorage('sc_inventaire_ecran', ecran);
    if (ecran === 'import') setImportOuvert(true);
    if (ecran === 'reglement') setReglementOuvert(true);
  }, [ecran]);
  // Geste retour, Échap et le bouton « Retour » ramènent à l'accueil du
  // module ; le retour à l'accueil de l'app reste celui de la coque.
  const retourAccueil = React.useCallback(() => { setAVerifier([]); setEcran('accueil'); }, []);
  useBackLayer(ecran !== 'accueil', retourAccueil, 'inventaire-ecran');
  // Échap aussi, sauf quand une fenêtre est ouverte (elle se ferme seule,
  // Fenetres.jsx) ou qu'un champ a la main (Échap y annule la frappe).
  React.useEffect(() => {
    if (ecran === 'accueil') return undefined;
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[data-fenetre], [role="dialog"]')) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      retourAccueil();
    };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [ecran, retourAccueil]);

  // Pile d'inventaires de chaque périmètre, la plus récente d'abord : accueil
  // du module, « Quel périmètre ? » et ouverture directe du comptage.
  const pilesParPerimetre = new Map(perimetres.map(p => [p, inventairesEtab.filter(i => perimetreOf(i) === p).sort(parDateDesc)]));

  // File réelle de « Vérifier la lecture » : les ids encore présents (un
  // document supprimé ailleurs en sort), le premier à l'écran. Ses lignes se
  // rapprochent des produits de SON périmètre, pas forcément celui affiché.
  const fileVerification = aVerifier.filter(id => (achats.tousLesDocs || []).some(d => d.id === id));
  const docAVerifier = (achats.tousLesDocs || []).find(d => d.id === fileVerification[0]) || null;
  const perimetreDoc = docAVerifier ? ((docAVerifier.perimetre || '').trim() || PERIMETRE_DEFAUT) : perimetreActif;
  const pileDoc = pilesParPerimetre.get(perimetreDoc) || [];

  // Helper pour push un inventaire modifié vers Supabase.
  // Porte les modifications de STRUCTURE (création, validation, ajout ou
  // suppression de ligne, renommage, import) : elles réécrivent l'inventaire
  // entier et exigent le réseau. Seul le COMPTAGE des quantités fonctionne
  // hors-ligne, par la file (cf. commitStockReel).
  const saveInv = async (inv) => {
    if (!legacySB) return;
    try { await legacySB.db.upsertInventaire(inv); }
    catch (err) {
      console.error('[upsertInventaire]', err);
      if (isNetworkError(err)) {
        notifyLegacy(
          'Réseau indisponible : cette modification n\'a pas été enregistrée. '
          + 'La saisie des quantités, elle, fonctionne hors-ligne et se synchronise au retour du réseau.',
          'warning', { duration: 7000 }
        );
      } else {
        notifyLegacy('Synchronisation impossible. ' + messageErreur(err, 'inventaire'), 'error');
      }
    }
  };

  // Écriture d'un inventaire dont le PÉRIMÈTRE compte (création, renommage).
  // Renvoie false quand le bridge a dû réécrire sans la colonne `nom` : la
  // migration 20260810 n'est pas appliquée et le périmètre n'a pas été
  // enregistré. Silencieux, ce cas donne un renommage qui « marche » à l'écran
  // et redevient faux au rechargement suivant.
  const saveInvAvecPerimetre = async (inventaire) => {
    if (!legacySB) return true;
    const enregistre = await legacySB.db.upsertInventaire(inventaire);
    return (enregistre?.nom || '') === (inventaire.nom || '');
  };

  const alertePerimetreNonEnregistre = () => notifyLegacy(
    'Le périmètre n\'a pas pu être enregistré : la migration « 20260810_inventaires_perimetre » n\'est pas encore appliquée sur la base. '
    + 'Les inventaires concernés réapparaîtront dans « Général » au prochain chargement.',
    'warning', { duration: 9000 }
  );

  const inv = inventaires.find(i => i.id === selectedId) || inventaires[0];

  // Un changement d'inventaire (autre date, autre périmètre) rend les saisies
  // en cours caduques : elles portent sur des lignes qui ne sont plus à l'écran.
  React.useEffect(() => { setStockDraft({}); stockRefs.current = {}; }, [inv?.id]);

  const invCourant = () => inventairesRef.current.find(i => i.id === inv?.id) || inv;

  // Applique une transformation à l'inventaire affiché puis l'enregistre.
  // `transforme` doit être pure et rendre un nouvel objet.
  const majInventaire = async (transforme) => {
    const base = invCourant();
    if (!base) return null;
    const updated = transforme(base);
    appliquerListe(liste => liste.map(i => (i.id === updated.id ? updated : i)));
    await saveInv(updated);
    return updated;
  };

  // Applique des lignes LOCALEMENT, sans écrire en base. Les lignes non
  // touchées sont recopiées : `recalcInventaire` écrit dans les objets qu'il
  // reçoit, il ne doit pas atteindre ceux du rendu précédent.
  const majLignesLocal = (construireLignes) => {
    const base = invCourant();
    if (!base) return null;
    const updated = recalcInventaire({
      ...base,
      lignes: construireLignes(base.lignes || []).map(l => ({ ...l })),
    });
    appliquerListe(liste => liste.map(i => (i.id === updated.id ? updated : i)));
    return updated;
  };

  // Idem, suivi de l'écriture de l'inventaire entier (modifications de
  // structure). Le comptage des quantités ne passe PAS par ici : il a son
  // propre chemin ligne à ligne, qui survit à l'absence de réseau.
  const majLignes = (construireLignes) => majInventaire(base => recalcInventaire({
    ...base,
    lignes: construireLignes(base.lignes || []).map(l => ({ ...l })),
  }));

  // Ouvre la modale de création, pré-remplie sur le périmètre demandé
  // (vide = « nouveau périmètre », l'utilisateur saisit son nom).
  const openNewInventory = (nomPerimetre) => {
    setNewInv({
      nom: nomPerimetre === '' ? '__autre__' : (nomPerimetre || perimetreActif),
      nomLibre: '',
      date: aujourdhui(),
      base: 'dupliquer',
    });
    setShowNew(true);
  };

  // Périmètre effectivement retenu par le formulaire de création
  const nomPerimetreSaisi = () => (
    (newInv.nom === '__autre__' ? newInv.nomLibre : newInv.nom) || ''
  ).trim() || PERIMETRE_DEFAUT;

  // Crée un inventaire et ouvre son comptage. `base` : 'dupliquer' (reprise
  // du dernier inventaire du même périmètre), 'catalogue' (le choix des
  // produits s'ouvre juste après) ou 'vierge'. Appelée par la fenêtre
  // « Nouvel inventaire » et, sans fenêtre, par « Commencer un nouveau
  // comptage » depuis « Quel périmètre ? ».
  const creerInventaire = async ({ nom, date, base }) => {
    // Deux comptages du même stock le même jour = double saisie neuf fois sur
    // dix. On laisse passer, mais après confirmation explicite.
    const doublon = inventairesEtab.find(i => perimetreOf(i) === nom && i.date === date);
    if (doublon && !confirmLegacy(`Un inventaire « ${nom} » existe déjà au ${date}.\nEn créer un second quand même ?`)) return;

    // Modèle : le dernier inventaire DU MÊME périmètre. Dupliquer la cuisine
    // dans les boissons n'aurait aucun sens.
    const source = base === 'dupliquer'
      ? inventairesEtab.filter(i => perimetreOf(i) === nom).sort(parDateDesc)[0]
      : null;
    const clone = source ? JSON.parse(JSON.stringify(source)) : { lignes: [] };
    clone.id = 'inv-' + Date.now();
    clone.etablissementId = etabId;
    clone.nom = nom;
    clone.date = date;
    clone.statut = 'en cours';
    clone.validePar = null;
    // Reprise : même liste de produits, le stock compté la dernière fois
    // devient le stock théorique et l'indication « préc. ». Le stock réel
    // repart vide : chaque produit est à recompter (« = » le reprend d'un tap).
    clone.lignes = lignesReprises(clone.lignes);
    recalcInventaire(clone);
    appliquerListe(liste => [clone, ...liste]);
    setPerimetre(nom);
    setSelectedId(clone.id);
    setShowNew(false);
    setEcran('comptage');
    // Parti du catalogue : on enchaîne directement sur le choix des produits.
    if (base === 'catalogue') setShowAjout(true);
    try {
      if (!await saveInvAvecPerimetre(clone)) alertePerimetreNonEnregistre();
    } catch (err) {
      console.error('[createInventory]', err);
      notifyLegacy('Inventaire non créé. ' + messageErreur(err, 'inventaire'), 'error');
    }
  };

  const createInventory = () => creerInventaire({
    nom: nomPerimetreSaisi(),
    date: newInv.date || aujourdhui(),
    base: newInv.base,
  });

  // « Je compte » : un seul périmètre dont le dernier inventaire est en cours,
  // le comptage s'ouvre directement ; sinon « Quel périmètre ? ».
  const ouvrirJeCompte = () => {
    const seul = perimetres.length === 1 ? pilesParPerimetre.get(perimetres[0])?.[0] : null;
    if (seul && seul.statut !== 'validé') {
      setPerimetre(perimetres[0]);
      setSelectedId(seul.id);
      setEcran('comptage');
      return;
    }
    setEcran('perimetre');
  };

  // Tuile d'un périmètre dans « Quel périmètre ? » : son inventaire en cours,
  // sinon un nouveau comptage du jour, repris du dernier, sans fenêtre.
  const ouvrirComptagePerimetre = async (nom) => {
    const dernier = pilesParPerimetre.get(nom)?.[0];
    if (dernier && dernier.statut !== 'validé') {
      setPerimetre(nom);
      setSelectedId(dernier.id);
      setEcran('comptage');
      return;
    }
    await creerInventaire({ nom, date: aujourdhui(), base: 'dupliquer' });
  };

  // ─── Documents : import, file de vérification, écritures ───
  // Documents de l'établissement que la lecture n'a pas complétés, les plus
  // anciens d'abord (règle estACompleter, calculée, aucune colonne).
  const idsACompleter = () => (achats.tousLesDocs || [])
    .filter(estACompleter)
    .sort((a, b) => String(a.dateDocument || '').localeCompare(String(b.dateDocument || '')))
    .map(d => d.id);

  const ouvrirVerification = (ids, suite) => {
    setAVerifier(ids);
    setSuiteVerification(suite);
    setEcran('verification');
  };

  // Tuile « Livraison reçue » ou « Facture reçue » : les documents encore à
  // compléter passent d'abord par « Vérifier la lecture », puis l'import.
  const ouvrirImport = (type) => {
    setImportType(type);
    setImportOuvert(true);
    const enAttente = idsACompleter();
    if (enAttente.length) ouvrirVerification(enAttente, 'import');
    else setEcran('import');
  };

  // Un document vient d'être lu et enregistré (pièce puis upsert) : il entre
  // dans la file et l'écran de vérification s'ouvre.
  const documentLu = (doc, pieceGardee) => {
    achats.majDocs(liste => [doc, ...liste]);
    if (pieceGardee) achats.setAvecPieces(s => new Set(s).add(doc.id));
    setAVerifier(file => (file.includes(doc.id) ? file : [...file, doc.id]));
    setSuiteVerification('import');
    setEcran('verification');
  };

  const passerAuSuivant = () => {
    const reste = fileVerification.slice(1);
    setAVerifier(reste);
    if (!reste.length) setEcran(suiteVerification);
  };
  const terminerVerification = () => { setAVerifier([]); setEcran('accueil'); };
  // « Retour » avant « Enregistrer » : les champs tapés sont perdus, le
  // document et sa photo restent, et il reste signalé « à compléter ».
  const quitterVerification = () => {
    if (docAVerifier && estACompleter(docAVerifier)) notifyLegacy('Document gardé, à compléter plus tard.', 'info');
    setAVerifier([]);
    setEcran('accueil');
  };

  // Document entier réécrit (lignes rattachées, type, périmètre) : jamais
  // regle_*, jamais le TTC ni l'échéance (upsertAchatsDocument les ignore).
  const enregistrerDocument = async (doc) => {
    achats.majDocs(liste => liste.map(d => (d.id === doc.id ? doc : d)));
    try {
      await legacySB.db.upsertAchatsDocument(doc);
    } catch (err) {
      notifyLegacy('Document non enregistré. ' + messageErreur(err, 'achats'), 'error');
      achats.reload();
    }
  };

  // « Enregistrer » de « Vérifier la lecture » : l'identité du document par
  // l'upsert entier (fournisseur, numéro, date, total HT, périmètre), puis le
  // montant à payer et l'échéance par l'écriture ciblée des factures
  // (majFactureAchat, seuls champs passés). Optimiste : l'état d'avant est
  // restauré avant toute relecture si l'une des deux échoue.
  const enregistrerLecture = async (doc, v) => {
    const avant = (achats.docsRef.current || []).find(d => d.id === doc.id) || doc;
    const n = normalizeName(v.fournisseurNom);
    const fournisseur = n && (fournisseurs.find(f => normalizeName(f.nom) === n)
      || fournisseurs.find(f => { const y = normalizeName(f.nom); return y && (y.includes(n) || n.includes(y)); }));
    const identite = {
      ...avant,
      fournisseurNom: v.fournisseurNom,
      fournisseurId: fournisseur?.id || null,
      numero: v.numero,
      dateDocument: v.dateDocument,
      totalHT: v.totalHT,
      perimetre: v.perimetre,
    };
    const facture = doc.typeDocument === 'facture';
    const apres = facture
      ? { ...identite, totalTTC: v.totalTTC ?? avant.totalTTC, dateEcheance: v.dateEcheance === undefined ? avant.dateEcheance : v.dateEcheance }
      : identite;
    achats.majDocs(liste => liste.map(d => (d.id === doc.id ? apres : d)));
    try {
      await legacySB.db.upsertAchatsDocument(identite);
      if (facture) {
        const patch = { totalTTC: v.totalTTC };
        if (v.dateEcheance !== undefined) patch.dateEcheance = v.dateEcheance;
        await legacySB.db.majFactureAchat(doc.id, patch);
      }
      return true;
    } catch (err) {
      achats.majDocs(liste => liste.map(d => (d.id === doc.id ? avant : d)));
      notifyLegacy('Document non enregistré. ' + messageErreur(err, 'achats'), 'error');
      achats.reload();
      return false;
    }
  };

  // ─── Renommer le périmètre affiché ───
  // Le périmètre n'est pas une entité à part : c'est le champ `nom` porté par
  // chaque inventaire de la pile. Renommer = réécrire toute la pile.
  const openRename = () => {
    setRenameValue(perimetreActif);
    setShowRename(true);
  };

  const renommerPerimetre = async () => {
    const cible = (renameValue || '').trim();
    if (!cible) { alertLegacy('Le nom du périmètre est requis.'); return; }
    if (cible === perimetreActif) { setShowRename(false); return; }

    const aRenommer = inventaires;
    // Renommer vers un périmètre existant n'est pas une erreur : c'est une
    // fusion (« Bar » qu'on rattache à « Boissons »). On la nomme pour que
    // personne ne la déclenche par accident.
    const fusion = perimetres.includes(cible);
    const question = fusion
      ? `« ${cible} » existe déjà.\n\nLes ${aRenommer.length} inventaire(s) de « ${perimetreActif} » y seront rattachés : les deux piles fusionnent et « ${perimetreActif} » disparaît.\n\nContinuer ?`
      : `Renommer « ${perimetreActif} » en « ${cible} » ?\n${aRenommer.length} inventaire(s) concerné(s).`;
    if (!confirmLegacy(question)) return;

    setRenameBusy(true);
    const renommes = aRenommer.map(i => ({ ...i, nom: cible }));
    try {
      let perimetreEnregistre = true;
      for (const item of renommes) {
        // Séquentiel : au premier échec on s'arrête, plutôt que de laisser une
        // pile à moitié renommée éclatée sur deux onglets.
        if (!await saveInvAvecPerimetre(item)) { perimetreEnregistre = false; break; }
      }
      if (!perimetreEnregistre) {
        alertePerimetreNonEnregistre();
      } else {
        const parId = new Map(renommes.map(i => [i.id, i]));
        appliquerListe(liste => liste.map(i => parId.get(i.id) || i));
        setPerimetre(cible);
        // Les factures et bons du périmètre suivent : sinon ils restent rangés
        // sous un nom qu'aucun onglet ne propose plus, et ne se règlent plus.
        try {
          await legacySB.db.renommerPerimetreAchats(etabId, perimetreActif, cible);
          achats.reload();
        } catch (err) {
          console.error('[renommerPerimetre achats]', err);
          notifyLegacy(`Les factures sont restées rangées dans « ${perimetreActif} ». ${messageErreur(err, 'inventaire')}`, 'warning');
        }
        notifyLegacy(
          fusion
            ? `${renommes.length} inventaire(s) rattaché(s) à « ${cible} ».`
            : `Périmètre renommé en « ${cible} ».`,
          'success'
        );
      }
    } catch (err) {
      console.error('[renommerPerimetre]', err);
      notifyLegacy('Renommage impossible. ' + messageErreur(err, 'inventaire'), 'error');
    }
    setRenameBusy(false);
    setShowRename(false);
  };

  const renderRenameModal = () => {
    if (!showRename) return null;
    const cible = (renameValue || '').trim();
    const fusion = cible && cible !== perimetreActif && perimetres.includes(cible);
    // Fenetre : la fermeture (×, Échap, retour) reste possible pendant
    // l'enregistrement, qui se poursuit et se relit (règle des modales).
    return (
      <Fenetre
        id="inventaire-renommer"
        titre="Renommer le périmètre"
        onClose={() => setShowRename(false)}
        largeur={420}
        pied={(
          <>
            <button style={invs.exportBtn} onClick={() => setShowRename(false)} disabled={renameBusy}>Annuler</button>
            <button style={invs.addBtn} onClick={renommerPerimetre} disabled={renameBusy}>
              {renameBusy ? 'Renommage…' : (fusion ? 'Fusionner' : 'Renommer')}
            </button>
          </>
        )}
      >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
            <div>
              <label style={invs.fieldLabel}>Nouveau nom</label>
              <input
                type="text"
                autoFocus
                style={invs.fieldInput}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !renameBusy) renommerPerimetre(); }}
              />
              <div style={invs.fieldHint}>
                {fusion
                  ? `« ${cible} » existe déjà : les ${inventaires.length} inventaire(s) de « ${perimetreActif} » y seront rattachés (fusion).`
                  : `${inventaires.length} inventaire(s) de « ${perimetreActif} » seront renommés, historique compris.`}
              </div>
            </div>
          </div>
      </Fenetre>
    );
  };

  // Modale « nouvel inventaire ». Fonction et non sous-composant : un composant
  // déclaré dans le rendu serait remonté à chaque frappe et perdrait le focus.
  // Rendue aussi bien depuis l'écran vide que depuis l'écran garni.
  const renderNewInventoryModal = () => {
    if (!showNew) return null;
    const nomRetenu = nomPerimetreSaisi();
    const suggestions = PERIMETRES_SUGGERES.filter(p => !perimetres.includes(p));
    const sourceDuplication = inventairesEtab.filter(i => perimetreOf(i) === nomRetenu).sort(parDateDesc)[0];
    return (
      <Fenetre
        id="inventaire-nouveau"
        titre="Nouvel inventaire"
        onClose={() => setShowNew(false)}
        largeur={420}
        pied={(
          <>
            <button style={invs.exportBtn} onClick={() => setShowNew(false)}>Annuler</button>
            <button style={invs.addBtn} onClick={createInventory}>Créer</button>
          </>
        )}
      >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
            <div>
              <label style={invs.fieldLabel}>Périmètre</label>
              <select
                style={invs.fieldInput}
                value={newInv.nom}
                onChange={e => setNewInv({ ...newInv, nom: e.target.value })}
              >
                {perimetres.length > 0 && (
                  <optgroup label="Périmètres en cours">
                    {perimetres.map(p => <option key={p} value={p}>{p}</option>)}
                  </optgroup>
                )}
                {suggestions.length > 0 && (
                  <optgroup label="Nouveaux périmètres">
                    {suggestions.map(p => <option key={p} value={p}>{p}</option>)}
                  </optgroup>
                )}
                <option value="__autre__">Autre (saisir un nom)…</option>
              </select>
              {newInv.nom === '__autre__' && (
                <input
                  type="text"
                  autoFocus
                  style={{ ...invs.fieldInput, marginTop: 8 }}
                  value={newInv.nomLibre}
                  placeholder="Ex : Cave à vin, Room service, Économat"
                  onChange={e => setNewInv({ ...newInv, nomLibre: e.target.value })}
                />
              )}
              <div style={invs.fieldHint}>
                Chaque périmètre a sa propre pile d'inventaires et son propre historique de valeur.
              </div>
            </div>
            <div>
              <label style={invs.fieldLabel}>Date de l'inventaire</label>
              <input
                type="date"
                style={invs.fieldInput}
                value={newInv.date}
                onChange={e => setNewInv({ ...newInv, date: e.target.value })}
              />
            </div>
            <div>
              <label style={invs.fieldLabel}>Contenu de départ</label>
              <select style={invs.fieldInput} value={newInv.base} onChange={e => setNewInv({ ...newInv, base: e.target.value })}>
                <option value="dupliquer">Reprendre les produits du dernier inventaire de ce périmètre</option>
                <option value="catalogue">Choisir les produits dans le catalogue</option>
                <option value="vierge">Inventaire vierge</option>
              </select>
              <div style={invs.fieldHint}>
                {newInv.base === 'vierge'
                  ? 'Aucune ligne : les produits s\'ajoutent ensuite en tapant leur nom ou depuis le catalogue.'
                  : newInv.base === 'catalogue'
                    ? 'Le choix des produits s\'ouvre juste après : cochez des catégories entières ou quelques produits.'
                    : sourceDuplication
                      ? `${(sourceDuplication.lignes || []).length} produit(s) repris de l'inventaire du ${sourceDuplication.date}. Les quantités sont à recompter ; celle du dernier comptage s'affiche en indication.`
                      : `Aucun inventaire précédent dans « ${nomRetenu} » : il démarrera vierge.`}
              </div>
            </div>
          </div>
      </Fenetre>
    );
  };

  // ─── Comparaison vs inventaire précédent ───
  // ATTENTION : ce useMemo DOIT être déclaré AVANT le early return `if (!inv)`,
  // sinon React voit "1 hook de moins au premier render" et crash (error #310).
  // Tous les hooks doivent être appelés dans le même ordre à chaque render.
  // On cherche l'inventaire à la date juste antérieure DANS LE MÊME PÉRIMÈTRE
  // (`inventaires` est déjà filtré) : comparer la cuisine à la cave donnerait
  // une évolution de stock qui ne veut rien dire.
  const previousInv = React.useMemo(() => {
    if (!inv?.date) return null;
    const candidates = (inventaires || [])
      .filter(i => i.id !== inv.id && i.date && i.date < inv.date)
      .sort((a, b) => b.date.localeCompare(a.date));
    return candidates[0] || null;
  }, [inv?.id, inv?.date, perimetreActif, inventaires.length]);

  // Rapprochement des lignes lues avec les produits de l'inventaire du
  // périmètre du document vérifié (« Écarts et documents » a le sien, sur
  // le périmètre affiché).
  const rapprochement = useRapprochement({
    etabId, inv: pileDoc[0] || inv, previousInv: pileDoc[1] || null, documents: achats.tousLesDocs, catalogue,
  });

  // Prix de référence pour chiffrer les fiches : catalogue, puis produits de
  // l'inventaire affiché et du précédent (prix des factures de la maison).
  const refsPrix = React.useMemo(
    () => construireReferencesPrix({ catalogue, lignesInventaire: [...(inv?.lignes || []), ...(previousInv?.lignes || [])] }),
    [catalogue, inv, previousInv],
  );
  // Recettes des cartes ajoutées d'office à l'inventaire en cours affiché
  // (une fois par inventaire et par ouverture du module) : Buffet PDJ, Goûter…
  // dans « Cuisine », Beverage dans « Boissons » (règles : cartesDuPerimetre).
  // Attend fiches, cartes et catalogue (le prix d'une fiche = son coût matière).
  // La fonction elle-même est posée plus bas, après ajouterLignes.
  const synchroFichesRef = React.useRef(null);
  const fichesSynchroDejaFaites = React.useRef(new Set());
  React.useEffect(() => {
    if (!inv || inv.statut === 'validé' || !recettesChargees || !cartesPlats || !catalogueCharge) return;
    if (fichesSynchroDejaFaites.current.has(inv.id)) return;
    fichesSynchroDejaFaites.current.add(inv.id);
    synchroFichesRef.current?.();
  }, [inv, recettesChargees, cartesPlats, catalogueCharge]);

  const infoFiche = React.useCallback((recette) => {
    const unite = masseRecette(recette).grammes > 0 ? 'kg' : 'pcs';
    const c = coutUnitaireRecette(recette, unite, refsPrix);
    if (!c.prix) return `coût matière non chiffrable${c.detail ? ' (' + c.detail + ')' : ''}`;
    return `${c.prix.toFixed(2)} CHF/${unite === 'kg' ? 'kg' : 'portion'}${c.estime ? ' (estimé)' : ''}`;
  }, [refsPrix]);

  // Aucun inventaire dans l'établissement : l'accueil du module se rend quand
  // même (on peut déjà déposer des documents) ; les écrans qui ont besoin
  // d'un inventaire le disent et proposent d'en créer un.
  const renderSansInventaire = () => (
    <>
      <EnTeteEcran titre={<span data-no-translate>{perimetreActif}</span>} onRetour={retourAccueil} />
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10, fontFamily: 'var(--font-serif)' }}>Aucun inventaire pour cet établissement</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6, marginBottom: 16 }}>
          Créez un inventaire par périmètre : cuisine, boissons, matériel… chacun avec son propre rythme de comptage.
        </div>
        {loadError && <div style={invs.loadError}>Données indisponibles pour le moment. Ne créez pas d'inventaire avant d'avoir réessayé.</div>}
        <button style={invs.addBtn} onClick={() => openNewInventory()} type="button">Créer le premier inventaire</button>
      </div>
    </>
  );

  // ─── Validation ───
  // Un inventaire validé est une pièce comptable : il se fige. Les lignes ne
  // bougent plus tant qu'il n'est pas explicitement rouvert, sinon la valeur
  // de stock validée le mois dernier peut changer après coup sans trace.
  const estValide = inv?.statut === 'validé';
  // Règle du 25.10.2026 : compter, ajouter un produit, ranger, reprendre les
  // restants et terminer le comptage reviennent à tout rôle qui voit le
  // module. La base le permettait déjà (RPC de saisie SECURITY INVOKER, RLS
  // d'inventaires par établissement) : seul le front refusait. Supprimer des
  // lignes, les lier à une fiche et leur appliquer un prix restent derrière
  // la case « Modifier » du module.
  const canEditLignes = !estValide;
  const canGererLignes = canManage && !estValide;
  const validateurNom = inv?.validePar ? userDisplayName(inv.validePar) : '';

  const validerInventaire = async () => {
    if (!inv || estValide) return;
    const nonComptes = (invCourant()?.lignes || []).filter(l => !estCompte(l)).length;
    const question = nonComptes > 0
      ? `${nonComptes} produit${nonComptes > 1 ? 's ne sont' : ' n\'est'} pas encore compté${nonComptes > 1 ? 's' : ''} : ${nonComptes > 1 ? 'ils seront validés' : 'il sera validé'} à 0.\n\nValider quand même l'inventaire « ${perimetreActif} » du ${inv.date} ? Les lignes seront figées jusqu'à réouverture.`
      : `Valider l'inventaire « ${perimetreActif} » du ${inv.date} ?\nLes lignes seront figées jusqu'à réouverture.`;
    if (!confirmLegacy(question)) return;
    await majInventaire(base => recalcInventaire({
      ...base,
      statut: 'validé',
      validePar: user.id,
      lignes: (base.lignes || []).map(l => (estCompte(l) ? { ...l } : { ...l, stockReel: 0 })),
    }));
    notifyLegacy('Inventaire validé.', 'success');
  };

  const rouvrirInventaire = async () => {
    if (!canManage || !estValide) return;
    if (!confirmLegacy('Rouvrir cet inventaire ?\nIl repassera « en cours » et redeviendra modifiable.')) return;
    await majInventaire(base => ({ ...base, statut: 'en cours', validePar: null }));
    notifyLegacy('Inventaire rouvert.', 'info');
  };

  // ─── Saisie du stock compté ───
  // Écrit la quantité d'une ligne. Appelée au blur du champ, donc aussi quand
  // l'utilisateur quitte le champ en cliquant directement sur un bouton.
  const commitStockReel = async (ligneId, valeurSaisie) => {
    setStockDraft(prev => {
      if (!(ligneId in prev)) return prev;
      const suite = { ...prev };
      delete suite[ligneId];
      return suite;
    });
    if (!canEditLignes) return;
    const ligne = (invCourant()?.lignes || []).find(l => l.id === ligneId);
    if (!ligne) return;

    const quantite = parseQuantite(valeurSaisie);
    if (quantite === null || quantite < 0) {
      // Champ vidé ou illisible : on garde le comptage précédent plutôt que de
      // le remettre à zéro. Un stock à 0 se saisit explicitement avec « 0 ».
      if (String(valeurSaisie ?? '').trim() !== '') {
        notifyLegacy(`Quantité illisible pour « ${ligne.produit} » : la valeur précédente est conservée.`, 'warning');
      }
      return;
    }
    // Même quantité sur un produit déjà compté : rien à écrire. Sur un produit
    // pas encore compté, retaper la quantité précédente EST un comptage.
    if (estCompte(ligne) && quantite === Number(ligne.stockReel)) return;

    // 1. Affichage immédiat : écarts et valeurs recalculés sur l'appareil.
    //    Le comptage ne doit jamais attendre le réseau pour s'afficher.
    const updated = majLignesLocal(lignes => lignes.map(l => (l.id === ligneId ? { ...l, stockReel: quantite } : l)));
    if (!updated || !legacySB) return;

    // 2. Persistance ligne à ligne : RPC si le réseau répond, file IndexedDB
    //    sinon. Jamais la réécriture de l'inventaire entier : deux heures de
    //    comptage en cave écraseraient tout ce qui a bougé au pass entre-temps.
    try {
      const resultat = await saisirStockOnlineOrQueue({
        inventaireId: updated.id,
        ligneId,
        stockReel: quantite,
        produit: ligne.produit,
        unite: ligne.unite,
        userId: user.id,
        etablissementId: etabId,
        // Repli tant que la migration 20260810_inventaire_saisie_offline n'est
        // pas appliquée : on retombe sur l'écriture historique.
        sauvegardeHistorique: () => saveInv(updated),
      });
      // Le serveur a gardé une autre valeur : quelqu'un a compté ce produit
      // APRÈS vous (stale), ou la ligne a été supprimée (not_applied). On le
      // dit et on réaffiche l'état réel, sinon l'écran montre une quantité
      // qui n'existe nulle part.
      if (resultat?.statut === 'stale') {
        notifyLegacy(`« ${ligne.produit} » a été recompté plus récemment par quelqu'un d'autre : sa quantité est conservée.`, 'warning', { duration: 7000 });
        reloadRef.current?.();
      } else if (resultat?.statut === 'not_applied') {
        notifyLegacy(`« ${ligne.produit} » n'existe plus dans cet inventaire : quantité non enregistrée.`, 'warning', { duration: 7000 });
        reloadRef.current?.();
      }
    } catch (err) {
      console.error('[commitStockReel]', err);
      notifyLegacy(`Quantité non enregistrée pour « ${ligne.produit} ». ${messageErreur(err, 'inventaire')}`, 'error');
    }
  };

  // Entrée = ligne suivante : on compte une étagère de haut en bas sans lâcher
  // le clavier de la tablette.
  const focusLigneSuivante = (ligneId, lignesVisibles) => {
    const index = lignesVisibles.findIndex(l => l.id === ligneId);
    const suivante = lignesVisibles[index + 1];
    const champ = suivante && stockRefs.current[suivante.id];
    if (champ) { champ.focus(); champ.select(); }
  };

  const deleteLine = async (lineId) => {
    if (!canGererLignes || !confirmLegacy('Supprimer cette ligne d\'inventaire ?')) return;
    await majLignes(lignes => lignes.filter(l => l.id !== lineId));
  };

  // ─── Mode sélection : suppression et export Excel en lot ───
  const supprimerLignesSelection = async () => {
    if (!canGererLignes || sel.count === 0) return;
    if (!confirmLegacy(`Supprimer ${sel.count} ligne(s) d'inventaire ?`)) return;
    setBulkBusy(true);
    await majLignes(lignes => lignes.filter(l => !sel.ids.has(l.id)));
    setBulkBusy(false);
    sel.exit();
    notifyLegacy('Lignes supprimées.', 'success');
  };

  const exporterLignesSelection = async () => {
    // invCourant : exporter juste après une saisie doit sortir la quantité
    // qui vient d'être tapée, pas celle du rendu précédent.
    const rows = (invCourant()?.lignes || []).filter(l => sel.ids.has(l.id));
    if (!rows.length) return;
    setBulkBusy(true);
    const headers = ['Produit', 'Catégorie', 'Unité', 'Stock théorique', 'Stock réel', 'Écart', 'Prix unitaire (CHF)', 'Valeur (CHF)', 'Écart valeur (CHF)'];
    const data = rows.map(l => [l.produit, l.categorie, l.unite, l.stockTheo, l.stockReel, l.ecart, l.prixUnit, l.valeur, l.ecartValeur]);
    try {
      await exportRowsToXlsx(`inventaire-${inv.date}.xlsx`, 'Inventaire', headers, data, [28, 18, 8, 14, 12, 10, 16, 14, 16]);
      notifyLegacy(`${rows.length} ligne(s) exportée(s) en Excel.`, 'success');
    } catch (err) {
      notifyLegacy('Export impossible. ' + messageErreur(err, 'inventaire'), 'error');
    }
    setBulkBusy(false);
  };

  // Supprimer l'inventaire affiché. Le garde-fou porte sur l'établissement
  // entier et non sur le périmètre : vider un périmètre entier (une cave fermée,
  // un inventaire matériel créé par erreur) est légitime tant qu'il reste au
  // moins un inventaire ailleurs.
  const deleteInventory = async () => {
    if (!canManage || !inv || inventairesEtab.length <= 1) return;
    const dernierDuPerimetre = inventaires.length === 1;
    const question = dernierDuPerimetre
      ? `Supprimer cet inventaire ?\nC'est le dernier du périmètre « ${perimetreActif} » : le périmètre disparaîtra de la liste.`
      : 'Supprimer cet inventaire ?';
    if (!confirmLegacy(question)) return;
    const idToDelete = inv.id;
    if (legacySB) {
      try { await legacySB.db.deleteInventaire(idToDelete); }
      catch (err) { notifyLegacy(messageErreur(err, 'inventaire'), 'error'); return; }
    }
    appliquerListe(liste => liste.filter(i => i.id !== idToDelete));
    const remaining = inventaires.filter(i => i.id !== idToDelete);
    // Plus rien dans ce périmètre : l'effet de réconciliation rebascule sur le
    // premier périmètre restant.
    setSelectedId(remaining[0]?.id);
  };

  // ═══ Ajout de produits ═══
  // Trois chemins, du plus rapide au plus complet : taper un nom dans le
  // comptage (catalogue reconnu = unité et prix repris), cocher en masse dans
  // le catalogue, ou reprendre les produits lus sur les factures (onglet Achats).
  // Un produit déjà présent n'est jamais ajouté deux fois.
  const ajouterLignes = async (nouvelles) => {
    if (!canEditLignes || !nouvelles.length) return [];
    const presents = new Set((invCourant()?.lignes || []).map(l => cleProduit(l.produit)));
    const aAjouter = [];
    nouvelles.forEach(l => {
      const cle = cleProduit(l.produit);
      if (!cle || presents.has(cle)) return;
      presents.add(cle);
      aAjouter.push(l);
    });
    if (aAjouter.length) await majLignes(lignes => [...lignes, ...aAjouter]);
    return aAjouter;
  };

  synchroFichesRef.current = async () => {
    if (!canEditLignes) return;
    const base = invCourant();
    if (!base) return;
    const manquantes = fichesManquantes(perimetreOf(base), {
      cartes: cartesPlats?.cartes, plats: cartesPlats?.plats, recettes, lignes: base.lignes,
    });
    if (!manquantes.length) return;
    const ajoutees = await ajouterLignes(manquantes.map(r => ligneDepuisRecette(r, refsPrix)));
    if (ajoutees.length) {
      notifyLegacy(`${ajoutees.length} recette${ajoutees.length > 1 ? 's' : ''} des cartes ajoutée${ajoutees.length > 1 ? 's' : ''} à l'inventaire.`, 'success');
    }
  };

  // `zone` : zone de stockage choisie dans le sélecteur (vide = sans zone).
  const avecZone = (ligne, zone) => (zone ? { ...ligne, zone } : ligne);

  // ─── Produits maison ───
  const ajouterDepuisFiches = async (fiches, zone = '') => {
    const ajoutees = await ajouterLignes(fiches.map(r => ligneDepuisRecette(r, refsPrix, { zone })));
    setShowAjout(false);
    notifyLegacy(`${ajoutees.length} produit${ajoutees.length > 1 ? 's' : ''} maison ajouté${ajoutees.length > 1 ? 's' : ''}.`, 'success');
  };

  // liens : [{ ligneId, recette }] ; recette null = délier.
  const lierFiches = async (liens) => {
    if (!canGererLignes || !liens.length) return;
    const parLigne = new Map(liens.map(x => [x.ligneId, x.recette]));
    await majLignes(lignes => lignes.map(l => (parLigne.has(l.id) ? lierLigne(l, parLigne.get(l.id), refsPrix) : l)));
    const lies = liens.filter(x => x.recette).length;
    notifyLegacy(lies ? `${lies} ligne${lies > 1 ? 's' : ''} liée${lies > 1 ? 's' : ''} à ${lies > 1 ? 'leur' : 'sa'} fiche.` : 'Ligne déliée de sa fiche.', 'success');
  };

  const majPrixMaison = async (maj) => {
    if (!canGererLignes || !maj.length) return;
    const parLigne = new Map(maj.map(x => [x.ligneId, x.prixUnit]));
    await majLignes(lignes => lignes.map(l => (parLigne.has(l.id) ? { ...l, prixUnit: parLigne.get(l.id) } : l)));
    notifyLegacy(`${maj.length} prix mis à jour au coût matière des fiches.`, 'success');
  };

  const ajouterDepuisCatalogue = async (produits, nomsLibres = [], zone = '') => {
    const ajoutees = await ajouterLignes([
      ...produits.map(p => avecZone(ligneDepuisProduit(p), zone)),
      ...nomsLibres.map(nom => avecZone(ligneLibre(nom), zone)),
    ]);
    setShowAjout(false);
    const ignores = produits.length + nomsLibres.length - ajoutees.length;
    notifyLegacy(
      `${ajoutees.length} produit${ajoutees.length > 1 ? 's' : ''} ajouté${ajoutees.length > 1 ? 's' : ''}`
      + (ignores > 0 ? ` (${ignores} déjà présent${ignores > 1 ? 's' : ''})` : '') + '.',
      'success'
    );
  };

  // Ajout rapide depuis le comptage. Renvoie l'id de la ligne à compter,
  // nouvelle ou déjà présente, pour y poser le curseur.
  const ajoutRapide = async (nom, zone = '') => {
    const cle = cleProduit(nom);
    const existante = (invCourant()?.lignes || []).find(l => cleProduit(l.produit) === cle);
    if (existante) {
      notifyLegacy(`« ${existante.produit} » est déjà dans l'inventaire.`, 'info');
      return existante.id;
    }
    const produit = catalogue.find(p => p?.nom && cleProduit(p.nom) === cle);
    const [ligne] = await ajouterLignes([avecZone(produit ? ligneDepuisProduit(produit) : ligneLibre(nom), zone)]);
    return ligne?.id || null;
  };

  const changerUnite = async (ligneId, unite) => {
    if (!canEditLignes) return;
    await majLignes(lignes => lignes.map(l => (l.id === ligneId ? { ...l, unite } : l)));
  };

  // Range une ou plusieurs lignes dans une zone (vide = retirer la zone).
  const changerZone = async (ligneIds, zone) => {
    if (!canEditLignes || !ligneIds.length) return;
    const ids = new Set(ligneIds);
    await majLignes(lignes => lignes.map(l => {
      if (!ids.has(l.id)) return l;
      const { zone: _ancienne, ...reste } = l;
      return zone ? { ...reste, zone } : reste;
    }));
  };

  // Matériel, consommables : ce qui n'a pas bougé se reprend d'un geste.
  const reprendreRestants = async () => {
    if (!canEditLignes) return;
    const restants = (invCourant()?.lignes || []).filter(l => !estCompte(l) && l.precedent != null);
    if (!restants.length) return;
    if (!confirmLegacy(`Reprendre la quantité du dernier inventaire pour ${restants.length} produit${restants.length > 1 ? 's' : ''} pas encore compté${restants.length > 1 ? 's' : ''} ?`)) return;
    await majLignes(lignes => lignes.map(l => (!estCompte(l) && l.precedent != null ? { ...l, stockReel: l.precedent } : l)));
  };

  // Depuis l'onglet Achats : prix du dernier document appliqué aux lignes.
  // `maj` : [{ cle, prixUnit }]
  const majPrixDepuisAchats = async (maj) => {
    if (!canGererLignes || !maj.length) return 0;
    const parCle = new Map(maj.map(m => [m.cle, m.prixUnit]));
    let n = 0;
    await majLignes(lignes => lignes.map(l => {
      const prix = parCle.get(cleProduit(l.produit));
      if (prix == null) return l;
      n += 1;
      return { ...l, prixUnit: +Number(prix).toFixed(4) };
    }));
    return n;
  };

  // ═══ Import / Template XLSX ═══
  const downloadInventoryTemplate = async () => {
    const XLSX = await import('xlsx'); // chargé à la demande (hors bundle du module)
    const wb = XLSX.utils.book_new();
    const rows = [
      ['Produit', 'Catégorie', 'Stock théorique', 'Stock réel', 'Unité', 'Prix unitaire (CHF)'],
      ['Filet de bœuf CH', 'Viandes', 15, 14.2, 'kg', 48.00],
      ['Tomates cerises bio', 'Légumes', 8, 7.5, 'kg', 6.80],
      ['Beurre doux 250g', 'Produits laitiers', 12, 12, 'pcs', 3.20],
      ['Riz Arborio', 'Féculents', 10, 9.8, 'kg', 4.50],
      ['Vin blanc Chasselas', 'Boissons', 24, 22, 'btl', 12.00],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Inventaire');

    const instr = XLSX.utils.aoa_to_sheet([
      ['Instructions d\'utilisation du template inventaire'],
      [''],
      ['1. Remplissez une ligne par produit dans la feuille "Inventaire"'],
      ['2. Colonnes requises : Produit, Catégorie, Stock théorique, Stock réel, Unité, Prix unitaire'],
      ['3. Catégories suggérées : Viandes, Poissons, Légumes, Fruits, Produits laitiers, Féculents, Épicerie, Boissons, Autres'],
      ['4. Unités acceptées : g, kg, ml, L, pcs, btl, cs, cc'],
      ['5. Importez le fichier via le bouton "Importer XLSX" dans le module Inventaire'],
      [''],
      ['L\'import ajoute les produits à l\'inventaire actuellement sélectionné.'],
      ['Les produits dont le nom existe déjà dans l\'inventaire seront mis à jour (stock réel, prix).'],
    ]);
    instr['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, instr, 'Instructions');

    XLSX.writeFile(wb, 'template-inventaire-samper.xlsx');
  };

  // Parser pour format "Samper inventaire" (feuilles Sec/Positif/Négatif)
  // Colonnes attendues : Catégorie | Produit | Prix unitaire | Prix Carton | Prix au Kg | Nbre unitaire | Nbre carton | Kg | Total
  // offset = décalage de colonnes (0 si le tableau commence colonne A, 1 si colonne B, etc.)
  const parseSamperInventorySheet = (rows, typeFeuille, offset = 0) => {
    if (!rows || rows.length < 2) return [];
    // Trouver la ligne d'en-tête (contient "Catégorie" ou "Catégories" + "Produit")
    let headerIdx = -1;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const joined = (rows[i] || []).map(c => String(c || '').toLowerCase()).join('|');
      if (/cat[ée]gorie/.test(joined) && /produit/.test(joined)) { headerIdx = i; break; }
    }
    if (headerIdx === -1) headerIdx = 0;

    const lignes = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const col = (n) => row[offset + n];
      const categorie = String(col(0) || '').trim();
      const produit = String(col(1) || '').trim();
      if (!produit) continue;
      // Ignorer sous-entêtes répétés (ex: "Produit" en cellule produit)
      if (produit.toLowerCase() === 'produit') continue;

      const prixUnitaire = parseFloat(col(2)) || 0;
      const prixCarton   = parseFloat(col(3)) || 0;
      const prixAuKg     = parseFloat(col(4)) || 0;
      const nbreUnit     = parseFloat(col(5)) || 0;
      const nbreCarton   = parseFloat(col(6)) || 0;
      const kg           = parseFloat(col(7)) || 0;
      const total        = parseFloat(col(8)) || 0;

      // ─── Consolidation : 1 ligne par produit, unité principale selon ce qui est rempli
      // Priorité : Kg > Nbre unitaire > Nbre carton
      // Prix unit calculé depuis Total si dispo (plus précis que px_kg/px_unit isolés)
      let stockReel = 0, unite = 'pcs', prixUnit = 0;

      if (kg > 0) {
        stockReel = kg * 1000;
        unite = 'g';
        prixUnit = (total > 0 && stockReel > 0)
          ? total / stockReel
          : (prixAuKg > 0 ? prixAuKg / 1000 : 0);
      } else if (nbreUnit > 0) {
        stockReel = nbreUnit;
        unite = 'pcs';
        prixUnit = (total > 0 && nbreUnit > 0) ? total / nbreUnit : (prixUnitaire || 0);
      } else if (nbreCarton > 0) {
        stockReel = nbreCarton;
        unite = 'cs';
        prixUnit = (total > 0 && nbreCarton > 0) ? total / nbreCarton : (prixCarton || 0);
      } else {
        stockReel = 0;
        unite = 'pcs';
        prixUnit = prixUnitaire || (prixAuKg / 1000) || prixCarton || 0;
      }

      lignes.push({
        id: 'l-' + typeFeuille + '-' + Date.now() + '-' + i,
        produit,
        categorie: categorie || 'Autres',
        unite,
        stockTheo: +stockReel.toFixed(3),
        stockReel: +stockReel.toFixed(3),
        prixUnit: +prixUnit.toFixed(4),
        type: typeFeuille, // 'sec' | 'positif' | 'negatif'
      });
    }
    return lignes;
  };

  const handleImportInventoryXLSX = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx'); // chargé à la demande (hors bundle du module)
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });

        // ─── DÉTECTION AUTO DU FORMAT ───
        const sheetNames = wb.SheetNames.map(n => n.toLowerCase());
        const hasSamperFormat = sheetNames.some(n => n === 'sec' || n === 'positif' || n === 'négatif' || n === 'negatif');

        if (hasSamperFormat) {
          // ═══ FORMAT SAMPER INVENTAIRE (feuilles Sec / Positif / Négatif) ═══
          const allLignes = [];
          const stats = { sec: 0, positif: 0, negatif: 0 };

          // Parser chaque feuille si présente
          const sheetMap = [
            { names: ['Sec', 'sec', 'SEC'], type: 'sec' },
            { names: ['Positif', 'positif', 'POSITIF'], type: 'positif' },
            { names: ['Négatif', 'Negatif', 'négatif', 'negatif', 'NÉGATIF', 'NEGATIF'], type: 'negatif' },
          ];

          for (const sm of sheetMap) {
            const sheetName = sm.names.find(n => wb.Sheets[n]);
            if (!sheetName) continue;
            const sh = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null });

            // Détecter l'offset : certaines feuilles commencent colonne A, d'autres colonne B
            // On cherche sur les 2 premières lignes la position de "Catégorie" ou "Produit"
            let offset = 0;
            for (let i = 0; i < Math.min(3, rows.length); i++) {
              const r = rows[i] || [];
              for (let j = 0; j < Math.min(3, r.length); j++) {
                if (/cat[ée]gorie/i.test(String(r[j] || ''))) { offset = j; break; }
              }
              if (offset > 0) break;
            }

            const lignes = parseSamperInventorySheet(rows, sm.type, offset);
            allLignes.push(...lignes);
            stats[sm.type] = lignes.length;
          }

          if (allLignes.length === 0) {
            alertLegacy('Aucun produit trouvé dans les feuilles Sec / Positif / Négatif.');
            return;
          }

          // Créer un nouvel inventaire (ne pas fusionner - c'est un import complet).
          // Il atterrit dans le périmètre affiché : on importe le classeur de la
          // cuisine depuis l'onglet Cuisine, celui du bar depuis l'onglet Boissons.
          const inventaireImporte = {
            id: 'inv-' + Date.now(),
            etablissementId: etabId,
            nom: perimetreActif,
            date: aujourdhui(),
            statut: 'en cours',
            validePar: null,
            valeurTotale: 0,
            lignes: allLignes,
          };
          const updated = recalcInventaire(inventaireImporte);
          appliquerListe(liste => [updated, ...liste]);
          setSelectedId(updated.id);
          await saveInv(updated);

          notifyLegacy(
            `Inventaire importé dans « ${perimetreActif} »\n\n` +
            `• ${stats.sec} produit${stats.sec > 1 ? 's' : ''} Sec\n` +
            `• ${stats.positif} produit${stats.positif > 1 ? 's' : ''} Positif\n` +
            `• ${stats.negatif} produit${stats.negatif > 1 ? 's' : ''} Négatif\n\n` +
            `Total : ${allLignes.length} lignes`,
            'success', { duration: 6000 }
          );
          return;
        }

        // ═══ FORMAT TEMPLATE SIMPLE (feuille "Inventaire") ═══
        const sh = wb.Sheets['Inventaire'] || wb.Sheets[wb.SheetNames[0]];
        if (!sh) { alertLegacy('Feuille "Inventaire" introuvable.'); return; }
        const rows = XLSX.utils.sheet_to_json(sh, { header: 1 });

        const imported = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[0]) continue;
          const produit = String(row[0]).trim();
          if (!produit) continue;
          imported.push({
            id: 'l' + Date.now() + '-' + i,
            produit,
            categorie: String(row[1] || 'Autres').trim(),
            stockTheo: parseFloat(row[2]) || 0,
            stockReel: parseFloat(row[3]) || 0,
            unite: String(row[4] || 'pcs').trim(),
            prixUnit: parseFloat(row[5]) || 0,
          });
        }

        if (imported.length === 0) { alertLegacy('Aucun produit valide trouvé dans le fichier.'); return; }

        // Ce format fusionne dans l'inventaire affiché : impossible s'il est
        // validé. (Le format Samper multi-feuilles, lui, crée un inventaire
        // neuf : il reste autorisé, plus haut dans cette fonction.)
        if (estValide) {
          alertLegacy(`L'inventaire « ${perimetreActif} » du ${inv.date} est validé : il est figé.\nRouvrez-le pour y importer des produits, ou créez un nouvel inventaire.`);
          return;
        }

        // Fusionner : mise à jour par nom si existe déjà, ajout sinon
        let nouveaux = 0, misAJour = 0;
        await majLignes(lignes => {
          const parNom = new Map(imported.map(l => [l.produit.toLowerCase(), l]));
          const fusionnees = lignes.map(l => {
            const impLine = parNom.get(String(l.produit || '').toLowerCase());
            if (!impLine) return l;
            misAJour++;
            parNom.delete(String(l.produit || '').toLowerCase());
            return { ...l, stockReel: impLine.stockReel, stockTheo: impLine.stockTheo, prixUnit: impLine.prixUnit, unite: impLine.unite, categorie: impLine.categorie };
          });
          const restantes = Array.from(parNom.values());
          nouveaux = restantes.length;
          return [...fusionnees, ...restantes];
        });
        notifyLegacy(`Import terminé\n${nouveaux} produit${nouveaux > 1 ? 's' : ''} ajouté${nouveaux > 1 ? 's' : ''}\n${misAJour} produit${misAJour > 1 ? 's' : ''} mis à jour`, 'success');
      } catch (err) {
        console.error(err);
        notifyLegacy('Import impossible. ' + messageErreur(err, 'inventaire'), 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Le périmètre fait partie de l'identité du document : un PDF « Inventaire »
  // sans mention Cuisine / Boissons / Matériel n'est pas exploitable en archive.
  const titreDocument = `Inventaire ${perimetreActif} - ${inv?.date || ''}`;

  // Le document imprimé est le tableau de l'écran « Écarts et documents » :
  // on s'y rend avant de capturer, sinon l'élément n'est pas dans le DOM.
  const avecEcranEcarts = (action) => {
    if (ecran === 'ecarts') { action(); return; }
    setEcran('ecarts');
    setTimeout(action, 80);
  };

  const printInventory = () => {
    if (!pdfUtils?.printElement) {
      notifyLegacy('Export PDF indisponible pour le moment.', 'error');
      return;
    }
    avecEcranEcarts(() => pdfUtils.printElement('inventaire-print', titreDocument, { etablissement, orientation: 'landscape' }));
  };

  // ─── État d'inventaire (Excel + PDF) au format du classeur établissement ───
  // Reprend report, achats de la période et relevé : les documents lus dans
  // l'onglet Achats sont relus ici, au moment de l'export, pour qu'un document
  // ajouté sur une autre tablette soit pris en compte.
  const exporterEtat = async (format) => {
    if (exportEnCours || !inv) return;
    setExportEnCours(true);
    try {
      const [{ construireEtatInventaire }, documents, aliasCatalogue] = await Promise.all([
        import('./etatInventaire.js'),
        legacySB ? legacySB.db.listAchatsDocuments(etabId).catch(() => []) : [],
        legacySB ? legacySB.db.listProduitAliasEtab(etabId).catch(() => []) : [],
      ]);
      const etat = construireEtatInventaire({
        inv: invCourant(),
        previousInv,
        documents: documents || [],
        catalogue,
        aliasCatalogue,
        etablissementNom: etablissement?.nom || '',
      });
      const base = `inventaire-${perimetreActif.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${inv.date}`;
      if (format === 'xlsx') {
        const { construireXlsxInventaire, telechargerFichier } = await import('./exportXlsxInventaire.js');
        telechargerFichier(construireXlsxInventaire(etat), `${base}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else {
        const { construirePdfInventaire } = await import('./exportPdfInventaire.js');
        const pdf = await construirePdfInventaire(etat);
        pdf.save(`${base}.pdf`);
      }
      if (documents === null) {
        notifyLegacy("Export sans les achats : la table des documents n'est pas disponible.", 'warning');
      }
    } catch (err) {
      console.error('[exporterEtat]', err);
      notifyLegacy('Export impossible. ' + messageErreur(err, 'inventaire'), 'error');
    }
    setExportEnCours(false);
  };

  const valeurTousPerimetres = valeurStockConsolidee(inventairesEtab);

  return (
    <div style={invs.root}>
      {loadError && (
        <div style={invs.loadError} className="no-print">
          Données indisponibles pour le moment. La liste affichée peut être incomplète.
          <button style={{ ...invs.exportBtn, marginLeft: 10 }} onClick={() => reloadRef.current?.()}>Réessayer</button>
        </div>
      )}

      {saisiesEnAttente > 0 && (
        <div style={invs.saisiesAttente} className="no-print">
          {saisiesEnAttente > 1
            ? `${saisiesEnAttente} quantités comptées en attente de synchronisation. Elles partiront seules au retour du réseau : vous pouvez fermer l'app.`
            : "1 quantité comptée en attente de synchronisation. Elle partira seule au retour du réseau : vous pouvez fermer l'app."}
        </div>
      )}

      {ecran === 'accueil' && (
        <AccueilInventaire
          perimetreActif={perimetreActif}
          perimetres={perimetres}
          pilesParPerimetre={pilesParPerimetre}
          inv={inv}
          docs={achats.tousLesDocs}
          canManage={canManage}
          canRegler={canRegler}
          canImportXlsx={canImportXlsx}
          onJeCompte={ouvrirJeCompte}
          onImport={ouvrirImport}
          onReglement={() => setEcran('reglement')}
          onEcarts={() => setEcran('ecarts')}
          onChoisirPerimetre={setPerimetre}
          onNouveauPerimetre={() => openNewInventory('')}
          gerer={{
            aInventaire: !!inv,
            estValide,
            peutSelectionner: canGererLignes && !sel.active,
            aRecettes: recettes.length > 0,
            peutSupprimer: inventairesEtab.length > 1,
            onRenommer: openRename,
            onRouvrir: rouvrirInventaire,
            onSelectionnerLignes: () => { setEcran('ecarts'); sel.enter(); },
            onProduitsMaison: () => setShowMaison(true),
            onImporterXlsx: () => importXlsxRef.current?.click(),
            onModeleXlsx: downloadInventoryTemplate,
            onSupprimer: deleteInventory,
          }}
        />
      )}

      {ecran === 'perimetre' && (
        <ChoixPerimetre
          perimetres={perimetres}
          pilesParPerimetre={pilesParPerimetre}
          onRetour={retourAccueil}
          onOuvrir={ouvrirComptagePerimetre}
          onAutre={() => openNewInventory(perimetreActif)}
        />
      )}

      {ecran === 'comptage' && (inv ? (
        <EcranComptage
          inv={inv}
          perimetreActif={perimetreActif}
          estValide={estValide}
          validateurNom={validateurNom}
          canManage={canManage}
          canEditLignes={canEditLignes}
          onRetour={retourAccueil}
          onAjouter={() => setShowAjout(true)}
          onTerminer={validerInventaire}
          onRouvrir={rouvrirInventaire}
          comptage={{
            lignes: inv.lignes || [],
            canEdit: canEditLignes,
            stockDraft,
            setStockDraft,
            stockRefs,
            commitStockReel,
            onAjoutRapide: ajoutRapide,
            onChangerUnite: changerUnite,
            onChangerZone: (ligneId, zone) => changerZone([ligneId], zone),
            onReprendreRestants: reprendreRestants,
            catalogue,
          }}
        />
      ) : renderSansInventaire())}

      {ecran === 'ecarts' && (inv ? (
        <>
          <EnTeteEcran titre="Écarts et documents" sousTitre={<span data-no-translate>{perimetreActif}</span>} onRetour={retourAccueil}>
            <select style={invs.invSelect} value={inv.id} onChange={e => setSelectedId(e.target.value)} aria-label="Inventaire affiché">
              {(inventaires || []).map(i => <option key={i.id} value={i.id}>{dateCH(i.date)}, {i.statut}</option>)}
            </select>
            <BoutonActions
              id="inventaire-exporter"
              label={exportEnCours ? 'Export en cours…' : 'Exporter'}
              style={invs.exportBtn}
              disabled={exportEnCours}
              titre="Exporter l'inventaire"
              sousTitre={`${perimetreActif}, inventaire du ${dateCH(inv.date)}${estValide ? ', validé' : ', en cours'}`}
              sections={[{
                items: [
                  { titre: 'PDF', detail: "L'état d'inventaire complet, prêt à envoyer ou à archiver.", onClick: () => exporterEtat('pdf') },
                  { titre: 'Excel', detail: 'Le même état au format du classeur, à reprendre dans un tableur.', onClick: () => exporterEtat('xlsx') },
                  { titre: 'Imprimer', detail: "Le tableau des écarts et des valeurs, envoyé à l'imprimante.", onClick: printInventory },
                ],
              }]}
            />
          </EnTeteEcran>
          <EcartsPanel
            inv={inv}
            previousInv={previousInv}
            perimetreActif={perimetreActif}
            perimetres={perimetres}
            estValide={estValide}
            validateurNom={validateurNom}
            valeurTousPerimetres={valeurTousPerimetres}
            canManage={canManage}
            canEditLignes={canEditLignes}
            canGererLignes={canGererLignes}
            sel={sel}
            bulkBusy={bulkBusy}
            stockDraft={stockDraft}
            setStockDraft={setStockDraft}
            stockRefs={stockRefs}
            commitStockReel={commitStockReel}
            focusLigneSuivante={focusLigneSuivante}
            onDeleteLine={deleteLine}
            onSupprimerSelection={supprimerLignesSelection}
            onExporterSelection={exporterLignesSelection}
            onChangerZone={changerZone}
          />
          {/* Consommation de la période et documents : la lecture de PDF et le
              rapprochement restent dans un chunk à part, chargé ici seulement. */}
          <React.Suspense fallback={<div style={{ padding: 30, color: 'var(--text2)', fontSize: 13 }}>Chargement…</div>}>
            <AchatsPanel
              user={user}
              etabId={etabId}
              perimetreActif={perimetreActif}
              perimetres={perimetres}
              inv={inv}
              previousInv={previousInv}
              catalogue={catalogue}
              canEditLignes={canEditLignes}
              canAppliquerPrix={canGererLignes}
              canModifierDocs={canManage}
              canRegler={canRegler}
              achats={achats}
              onAjouterLignes={ajouterLignes}
              onMajPrix={majPrixDepuisAchats}
              onCompleter={(d) => ouvrirVerification([d.id], 'ecarts')}
            />
          </React.Suspense>
        </>
      ) : renderSansInventaire())}

      {/* Créer un produit ou reporter un prix écrit dans l'inventaire AFFICHÉ :
          seulement quand le document vérifié est du même périmètre. */}
      {ecran === 'verification' && (docAVerifier ? (
        <VerifierLecture
          key={docAVerifier.id}
          doc={docAVerifier}
          position={1}
          total={fileVerification.length}
          libelleSuivant={fileVerification.length > 1 ? 'Document suivant' : suiteVerification === 'import' ? 'Déposer d’autres documents' : 'Terminer'}
          perimetres={perimetres}
          fournisseurs={fournisseurs}
          avecPiece={achats.avecPieces.has(docAVerifier.id)}
          etabId={etabId}
          canRegler={canRegler}
          canManage={canManage && perimetreDoc === perimetreActif}
          canCreer={canEditLignes && perimetreDoc === perimetreActif}
          rapprochement={rapprochement}
          catalogue={catalogue}
          docsRef={achats.docsRef}
          enregistrerDoc={enregistrerDocument}
          onAjouterLignes={ajouterLignes}
          onAppliquerPrix={majPrixDepuisAchats}
          onEnregistrer={(valeurs) => enregistrerLecture(docAVerifier, valeurs)}
          onRetour={quitterVerification}
          onSuivant={passerAuSuivant}
          onTerminer={terminerVerification}
        />
      ) : (
        <>
          <EnTeteEcran titre="Vérifier la lecture" onRetour={retourAccueil} />
          <div style={{ fontSize: 13, color: 'var(--text2)', padding: '12px 14px' }}>Rien à vérifier.</div>
        </>
      ))}

      {importOuvert && (
        <div style={{ display: ecran === 'import' ? 'flex' : 'none', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <EnTeteEcran
            titre={importType === 'facture' ? 'Facture reçue' : 'Livraison reçue'}
            sousTitre={<span data-no-translate>{perimetreActif}</span>}
            onRetour={retourAccueil}
          />
          <ImportDocumentsAchats
            user={user}
            etabId={etabId}
            perimetreActif={perimetreActif}
            docsRef={achats.docsRef}
            tableAbsente={achats.tableAbsente}
            type={importType}
            fournisseurs={fournisseurs}
            onImporte={documentLu}
          />
        </div>
      )}

      {reglementOuvert && canRegler && (
        <div style={{ display: ecran === 'reglement' ? 'flex' : 'none', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <EnTeteEcran titre="Je règle les factures" sousTitre={<span data-no-translate>{perimetreActif}</span>} onRetour={retourAccueil} />
          <React.Suspense fallback={<div style={{ padding: 30, color: 'var(--text2)', fontSize: 13 }}>Chargement…</div>}>
            <FacturesPanel
              user={user}
              etabId={etabId}
              perimetreActif={perimetreActif}
              datesInventaires={datesInventairesPerimetre}
              canRegler={canRegler}
              canModifier={canManage || canRegler}
              achats={achats}
            />
          </React.Suspense>
        </div>
      )}

      {canImportXlsx && <input ref={importXlsxRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportInventoryXLSX} />}

      {renderNewInventoryModal()}
      {renderRenameModal()}

      {showMaison && inv && (
        <ProduitsMaisonModal
          lignes={inv.lignes || []}
          recettes={recettes}
          refs={refsPrix}
          canEdit={canGererLignes}
          onLier={lierFiches}
          onMajPrix={majPrixMaison}
          onClose={() => setShowMaison(false)}
        />
      )}

      {showAjout && canEditLignes && inv && (
        <AjoutProduitsModal
          catalogue={catalogue}
          lignesExistantes={inv.lignes || []}
          onAjouter={ajouterDepuisCatalogue}
          recettes={recettes}
          cartesParFiche={cartesParFiche}
          infoFiche={infoFiche}
          onAjouterFiches={ajouterDepuisFiches}
          onClose={() => setShowAjout(false)}
        />
      )}
    </div>
  );
};

const invs = {
  root: {display:'flex',flexDirection:'column',gap:16}, header: {display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}, headerLeft: {display:'flex',alignItems:'center',gap:12}, headerRight: {display:'flex',gap:8,flexWrap:'wrap'},
  // minWidth:0 : sans ça la barre d'onglets, enfant flex, est clampée à sa
  // largeur de contenu et pousse la page en scroll horizontal sur mobile.
  perimetreBar: {display:'flex',alignItems:'center',gap:10,minWidth:0,maxWidth:'100%'},
  loadError: { color:'var(--warning-text)',borderLeft: '2px solid var(--warning-bd)', padding: '10px 0 10px 12px',fontSize:12,display:'flex',alignItems:'center',flexWrap:'wrap',gap:6},
  fieldHint: {fontSize:11,color:'var(--text2)',marginTop:6,lineHeight:1.45},
  saisiesAttente: {fontSize:12,lineHeight:1.5,padding:'10px 14px',borderRadius:8,background:'var(--info-bg, var(--warning-bg))',color:'var(--info-text, var(--warning-text))',border:'1px solid var(--info-bd, var(--warning-bd))'},
  invSelect: {padding:'8px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--surface)',fontFamily:'var(--font)',cursor:'pointer'}, badge: {display:'inline-block',fontSize:13,fontWeight:500,whiteSpace:'nowrap'},
  // Gabarit des boutons de Btn (38 px sur ordinateur, 44 au toucher par la règle globale) : principal et secondaire.
  addBtn: {minHeight:38,padding:'8px 14px',background:'var(--accent)',color:'var(--on-accent)',border:'1px solid var(--accent)',borderRadius:'var(--r-sm)',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'var(--font)'},

  exportBtn: {minHeight:38,padding:'8px 14px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text)',borderRadius:'var(--r-sm)',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6},
  fieldLabel: {display:'block',fontSize:12,fontWeight:500,color:'var(--text2)',marginBottom:6,textTransform:'uppercase',letterSpacing:0.4}, fieldInput: {width:'100%',padding:'9px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--bg)',fontFamily:'var(--font)',boxSizing:'border-box'},
};

export default Inventaire;
