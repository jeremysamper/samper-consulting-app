import React from 'react';
import { getDemoData, canManageModule } from '../../data/demoData.js';
import { pdfUtils } from '../../services/pdf.js';
import { alertLegacy, confirmLegacy, notifyLegacy, readLegacyStorage, writeLegacyStorage } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { useSelection } from '../../hooks/useSelection.js';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import { exportRowsToXlsx } from '../../utils/exportXlsx.js';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { normalizeSearch } from '../../utils/searchText.js';
import { PERIMETRE_DEFAUT, PERIMETRES_SUGGERES, perimetreOf, listePerimetres, valeurStockConsolidee } from '../../utils/inventairePerimetres.js';
import { userDisplayName } from '../../utils/userDisplay.js';

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Recalcule écarts et valeurs d'un inventaire (muté sur place, puis renvoyé).
// Hors du composant : appelé aussi bien depuis l'écran « aucun inventaire »
// (création du premier) que depuis l'écran garni.
const recalcInventaire = (inventory) => {
  inventory.lignes.forEach(l => {
    l.ecart = +(l.stockReel - l.stockTheo).toFixed(2);
    l.valeur = +(l.stockReel * l.prixUnit).toFixed(2);
    l.ecartValeur = +(l.ecart * l.prixUnit).toFixed(2);
  });
  inventory.valeurTotale = +inventory.lignes.reduce((s, l) => s + l.valeur, 0).toFixed(2);
  return inventory;
};

// Plus récent d'abord : la liste arrive déjà triée de la base, mais un
// inventaire créé dans la session est simplement empilé en tête.
const parDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

// Quantité saisie au comptage. La virgule est le séparateur décimal en Suisse
// romande et le clavier numérique iOS en français en propose une :
// `parseFloat('9,5')` vaut 9, la décimale disparaît sans que rien ne le signale.
// Renvoie null si la saisie est vide ou illisible - l'appelant décide alors.
const parseQuantite = (valeur) => {
  const brut = String(valeur ?? '').trim().replace(',', '.');
  if (brut === '') return null;
  const nombre = Number.parseFloat(brut);
  return Number.isFinite(nombre) ? nombre : null;
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
  const [selectedId, setSelectedId] = React.useState(() => readLegacyStorage('sc_inventaire_selected', inventaires[0]?.id));
  const [catFilter, setCatFilter] = React.useState('Tous');
  const [typeFilter, setTypeFilter] = React.useState('Tous');
  const [search, setSearch] = React.useState('');
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
  const [showAddLine, setShowAddLine] = React.useState(false);
  const [newLine, setNewLine] = React.useState({ produit: '', categorie: 'Autres', unite: 'pcs', stockTheo: 0, stockReel: 0, prixUnit: 0 });
  // Autocomplétion catalogue : index de la suggestion en cours de focus (-1 = aucune)
  const [autocompleteFocus, setAutocompleteFocus] = React.useState(-1);
  const [autocompleteOpen, setAutocompleteOpen] = React.useState(false);
  const perms = demoData.permissions[user.role] || {};
  const canManage = !!perms.inventaire && canManageModule(user.role, 'inventaire');
  // Actions d'import/export/impression réservées à consultant + patron
  const canExport = ['consultant', 'patron'].includes(user.role);
  const sel = useSelection();
  const [bulkBusy, setBulkBusy] = React.useState(false);

  // ═══ Load Supabase + Realtime ═══
  // Lecture stricte : une erreur remonte au lieu de rendre []. Sans ça un JWT
  // expiré au réveil d'une tablette affiche « Aucun inventaire » alors que la
  // base est pleine — et la brigade recrée un périmètre en double par-dessus.
  const [loadError, setLoadError] = React.useState(false);
  const reloadRef = React.useRef(null);
  React.useEffect(() => {
    if (!legacySB) return;
    let unsub = null, mounted = true;
    const reload = async () => {
      try {
        const invs = await legacySB.db.listInventaires(etabId, { strict: true });
        if (!mounted) return;
        appliquerListe(() => invs);
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

  // ─── Catalogue produits (pour autocomplétion à l'ajout de ligne) ───
  const [catalogue, setCatalogue] = React.useState([]);
  React.useEffect(() => {
    if (!legacySB) return;
    let mounted = true;
    legacySB.db.listProduits(etabId)
      .then(ps => { if (mounted) setCatalogue(ps || []); })
      .catch(err => console.warn('[Inventaire] catalogue load failed', err));
    const unsub = legacySB.realtime.subscribeReload('produits', async () => {
      try {
        const ps = await legacySB.db.listProduits(etabId);
        if (mounted) setCatalogue(ps || []);
      } catch(e) {}
    });
    return () => { mounted = false; unsub && unsub(); };
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

  // Helper pour push un inventaire modifié vers Supabase
  const saveInv = async (inv) => {
    if (!legacySB) return;
    try { await legacySB.db.upsertInventaire(inv); }
    catch (err) { console.error('[upsertInventaire]', err); notifyLegacy('Erreur sync : ' + err.message, 'error'); }
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

  // Remplace les lignes de l'inventaire courant et recalcule écarts et valeurs.
  // Les lignes non touchées sont recopiées : `recalcInventaire` écrit dans les
  // objets qu'il reçoit, il ne doit pas atteindre ceux du rendu précédent.
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

  const createInventory = async () => {
    const nom = nomPerimetreSaisi();
    const date = newInv.date || aujourdhui();
    // Deux comptages du même stock le même jour = double saisie neuf fois sur
    // dix. On laisse passer, mais après confirmation explicite.
    const doublon = inventairesEtab.find(i => perimetreOf(i) === nom && i.date === date);
    if (doublon && !confirmLegacy(`Un inventaire « ${nom} » existe déjà au ${date}.\nEn créer un second quand même ?`)) return;

    // Modèle : le dernier inventaire DU MÊME périmètre. Dupliquer la cuisine
    // dans les boissons n'aurait aucun sens.
    const source = newInv.base === 'dupliquer'
      ? inventairesEtab.filter(i => perimetreOf(i) === nom).sort(parDateDesc)[0]
      : null;
    const clone = source ? JSON.parse(JSON.stringify(source)) : { lignes: [] };
    clone.id = 'inv-' + Date.now();
    clone.etablissementId = etabId;
    clone.nom = nom;
    clone.date = date;
    clone.statut = 'en cours';
    clone.validePar = null;
    // Reprise : le stock réel compté devient le stock théorique attendu.
    clone.lignes = (clone.lignes || []).map((l, idx) => ({ ...l, id: 'l' + Date.now() + idx, stockTheo: l.stockReel || 0, stockReel: l.stockReel || 0 }));
    recalcInventaire(clone);
    appliquerListe(liste => [clone, ...liste]);
    setPerimetre(nom);
    setSelectedId(clone.id);
    setShowNew(false);
    try {
      if (!await saveInvAvecPerimetre(clone)) alertePerimetreNonEnregistre();
    } catch (err) {
      console.error('[createInventory]', err);
      notifyLegacy('Erreur création inventaire : ' + err.message, 'error');
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
        notifyLegacy(
          fusion
            ? `${renommes.length} inventaire(s) rattaché(s) à « ${cible} ».`
            : `Périmètre renommé en « ${cible} ».`,
          'success'
        );
      }
    } catch (err) {
      console.error('[renommerPerimetre]', err);
      notifyLegacy('Erreur renommage : ' + err.message, 'error');
    }
    setRenameBusy(false);
    setShowRename(false);
  };

  const renderRenameModal = () => {
    if (!showRename) return null;
    const cible = (renameValue || '').trim();
    const fusion = cible && cible !== perimetreActif && perimetres.includes(cible);
    return (
      <div className="modal-sheet-overlay" style={invs.overlay} onClick={() => !renameBusy && setShowRename(false)}>
        <div className="modal-sheet" style={invs.modal} onClick={e => e.stopPropagation()}>
          <div style={invs.modalHeader}>
            <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>Renommer le périmètre</div>
            <button style={invs.closeBtn} onClick={() => setShowRename(false)} disabled={renameBusy}>✕</button>
          </div>
          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
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
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' }}>
              <button style={invs.exportBtn} onClick={() => setShowRename(false)} disabled={renameBusy}>Annuler</button>
              <button style={invs.addBtn} onClick={renommerPerimetre} disabled={renameBusy}>
                {renameBusy ? 'Renommage…' : (fusion ? 'Fusionner' : 'Renommer')}
              </button>
            </div>
          </div>
        </div>
      </div>
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
      <div className="modal-sheet-overlay" style={invs.overlay} onClick={() => setShowNew(false)}>
        <div className="modal-sheet" style={invs.modal} onClick={e => e.stopPropagation()}>
          <div style={invs.modalHeader}>
            <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>Nouvel inventaire</div>
            <button style={invs.closeBtn} onClick={() => setShowNew(false)}>✕</button>
          </div>
          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
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
                <option value="vierge">Inventaire vierge</option>
              </select>
              <div style={invs.fieldHint}>
                {newInv.base === 'vierge'
                  ? 'Aucune ligne : les produits seront ajoutés un par un ou importés en XLSX.'
                  : sourceDuplication
                    ? `${(sourceDuplication.lignes || []).length} produit(s) repris de l'inventaire du ${sourceDuplication.date} — les stocks réels comptés deviennent les stocks théoriques.`
                    : `Aucun inventaire précédent dans « ${nomRetenu} » : il démarrera vierge.`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' }}>
              <button style={invs.exportBtn} onClick={() => setShowNew(false)}>Annuler</button>
              <button style={invs.addBtn} onClick={createInventory}>Créer</button>
            </div>
          </div>
        </div>
      </div>
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

  if (!inv) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, opacity: 0.4 }}>📦</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginTop: 10, fontFamily: 'var(--font-serif)' }}>Aucun inventaire pour cet établissement</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6, marginBottom: 16 }}>
          Créez un inventaire par périmètre : cuisine, boissons, matériel… chacun avec son propre rythme de comptage.
        </div>
        {loadError && <div style={invs.loadError}>Données indisponibles pour le moment — ne créez pas d'inventaire avant d'avoir réessayé.</div>}
        {canManage && <button style={invs.addBtn} onClick={() => openNewInventory()} type="button">+ Créer le premier inventaire</button>}
        {/* Pas de renommage ici : sans inventaire, il n'y a aucun périmètre à renommer. */}
        {renderNewInventoryModal()}
      </div>
    );
  }

  const cats = ['Tous', ...Array.from(new Set((inv.lignes || []).map(l => l.categorie)))];
  const filtered = (inv.lignes || []).filter(l =>
    (catFilter === 'Tous' || l.categorie === catFilter) &&
    (typeFilter === 'Tous' || (l.type || '') === typeFilter) &&
    (search === '' || normalizeSearch(l.produit).includes(normalizeSearch(search)))
  );
  // Liste des types présents dans l'inventaire (pour afficher le filtre si au moins 1 ligne a un type)
  const hasTypes = inv.lignes.some(l => l.type);

  // ─── Validation ───
  // Un inventaire validé est une pièce comptable : il se fige. Les lignes ne
  // bougent plus tant qu'il n'est pas explicitement rouvert — sinon la valeur
  // de stock validée le mois dernier peut changer après coup sans trace.
  const estValide = inv.statut === 'validé';
  const canEditLignes = canManage && !estValide;
  const validateurNom = inv.validePar ? userDisplayName(inv.validePar) : '';

  // Gabarit de colonnes partagé par l'en-tête et les lignes : deux chaînes
  // séparées finissaient toujours par diverger. « Stock réel » passe en
  // minmax quand elle porte un champ de saisie : en fr pur, la colonne tombait
  // à 54px sur tablette (police forcée à 16px par la règle tactile), soit
  // quatre caractères visibles pour saisir une quantité. Le tableau déborde et
  // défile dans son conteneur, la page ne pane pas pour autant.
  const colonnesTableau = (sel.active ? '34px ' : '')
    + `2fr 1fr 1fr ${canEditLignes ? 'minmax(124px, 1.6fr)' : '1fr'} 1fr 1.2fr 1.2fr`
    + (canManage ? ' 90px' : '');

  const validerInventaire = async () => {
    if (!canManage || estValide) return;
    if (!confirmLegacy(`Valider l'inventaire « ${perimetreActif} » du ${inv.date} ?\nLes lignes seront figées jusqu'à réouverture.`)) return;
    await majInventaire(base => ({ ...base, statut: 'validé', validePar: user.id }));
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
    if (quantite === ligne.stockReel) return;
    await majLignes(lignes => lignes.map(l => (l.id === ligneId ? { ...l, stockReel: quantite } : l)));
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
    if (!canEditLignes || !confirmLegacy('Supprimer cette ligne d\'inventaire ?')) return;
    await majLignes(lignes => lignes.filter(l => l.id !== lineId));
  };

  // ─── Mode sélection : suppression et export Excel en lot ───
  const supprimerLignesSelection = async () => {
    if (!canEditLignes || sel.count === 0) return;
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
      notifyLegacy('Erreur export : ' + err.message, 'error');
    }
    setBulkBusy(false);
  };

  // Supprimer l'inventaire affiché. Le garde-fou porte sur l'établissement
  // entier et non sur le périmètre : vider un périmètre entier (une cave fermée,
  // un inventaire matériel créé par erreur) est légitime tant qu'il reste au
  // moins un inventaire ailleurs.
  const deleteInventory = async () => {
    if (!canManage || inventairesEtab.length <= 1) return;
    const dernierDuPerimetre = inventaires.length === 1;
    const question = dernierDuPerimetre
      ? `Supprimer cet inventaire ?\nC'est le dernier du périmètre « ${perimetreActif} » : le périmètre disparaîtra de la liste.`
      : 'Supprimer cet inventaire ?';
    if (!confirmLegacy(question)) return;
    const idToDelete = inv.id;
    if (legacySB) {
      try { await legacySB.db.deleteInventaire(idToDelete); }
      catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    }
    appliquerListe(liste => liste.filter(i => i.id !== idToDelete));
    const remaining = inventaires.filter(i => i.id !== idToDelete);
    // Plus rien dans ce périmètre : l'effet de réconciliation rebascule sur le
    // premier périmètre restant.
    setSelectedId(remaining[0]?.id);
  };

  // ═══ Ajout manuel d'un produit ═══
  // (les states showAddLine/newLine sont déclarés en haut du composant pour respecter les règles des hooks)

  const openAddLine = () => {
    setNewLine({ produit: '', categorie: cats.find(c => c !== 'Tous') || 'Autres', unite: 'pcs', stockTheo: 0, stockReel: 0, prixUnit: 0 });
    setShowAddLine(true);
  };

  const addLine = async () => {
    if (!canEditLignes) return;
    if (!newLine.produit.trim()) { alertLegacy('Le nom du produit est requis.'); return; }
    const line = {
      id: 'l' + Date.now(),
      produit: newLine.produit.trim(),
      categorie: newLine.categorie || 'Autres',
      unite: newLine.unite || 'pcs',
      stockTheo: parseQuantite(newLine.stockTheo) || 0,
      stockReel: parseQuantite(newLine.stockReel) || 0,
      prixUnit: parseQuantite(newLine.prixUnit) || 0,
    };
    await majLignes(lignes => [...lignes, line]);
    setShowAddLine(false);
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
            `✓ Inventaire importé dans « ${perimetreActif} »\n\n` +
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

        // Ce format fusionne dans l'inventaire affiché — impossible s'il est
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
        notifyLegacy(`✓ Import terminé\n${nouveaux} produit${nouveaux > 1 ? 's' : ''} ajouté${nouveaux > 1 ? 's' : ''}\n${misAJour} produit${misAJour > 1 ? 's' : ''} mis à jour`, 'success');
      } catch (err) {
        console.error(err);
        notifyLegacy('Erreur lors de l\'import : ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const totEcart = (inv.lignes || []).reduce((s,l) => s + Math.abs(l.ecartValeur), 0);
  const totPositif = (inv.lignes || []).filter(l => l.ecart > 0).length;
  const totNegatif = (inv.lignes || []).filter(l => l.ecart < 0).length;
  const totNul = (inv.lignes || []).filter(l => l.ecart === 0).length;

  const deltaValeur = previousInv ? (inv.valeurTotale - previousInv.valeurTotale) : null;
  const deltaPct = (previousInv && previousInv.valeurTotale > 0)
    ? (deltaValeur / previousInv.valeurTotale * 100)
    : null;

  // Le périmètre fait partie de l'identité du document : un PDF « Inventaire »
  // sans mention Cuisine / Boissons / Matériel n'est pas exploitable en archive.
  const titreDocument = `Inventaire ${perimetreActif} - ${inv.date}`;
  const nomFichierPdf = `inventaire-${perimetreActif.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${inv.date}.pdf`;

  const printInventory = () => {
    if (!pdfUtils?.printElement) {
      notifyLegacy('Export PDF indisponible pour le moment.', 'error');
      return;
    }
    pdfUtils.printElement('inventaire-print', titreDocument, { etablissement, orientation: 'landscape' });
  };

  const exportInventoryPdf = () => {
    if (!pdfUtils?.exportElementToPdf) {
      notifyLegacy('Export PDF indisponible pour le moment.', 'error');
      return;
    }
    pdfUtils.exportElementToPdf('inventaire-print', nomFichierPdf, { etablissement, title: titreDocument, orientation: 'landscape' });
  };

  const valeurTousPerimetres = valeurStockConsolidee(inventairesEtab);

  return (
    <div style={invs.root}>
      {/* Périmètres : une pile d'inventaires par zone comptée. L'onglet actif
          commande tout le reste de l'écran. */}
      <div style={invs.perimetreBar} className="no-print">
        <SegmentedTabs
          size="sm"
          active={perimetreActif}
          onChange={(id) => (id === '__new__' ? openNewInventory('') : setPerimetre(id))}
          tabs={[
            ...perimetres.map(p => ({
              id: p,
              label: `${p} (${inventairesEtab.filter(i => perimetreOf(i) === p).length})`,
            })),
            ...(canManage ? [{ id: '__new__', label: '+ Périmètre' }] : []),
          ]}
        />
      </div>

      {loadError && (
        <div style={invs.loadError} className="no-print">
          Données indisponibles pour le moment — la liste affichée peut être incomplète.
          <button style={{ ...invs.exportBtn, marginLeft: 10 }} onClick={() => reloadRef.current?.()}>Réessayer</button>
        </div>
      )}

      <div style={invs.header} className="no-print">
        <div style={invs.headerLeft}>
          <select style={invs.invSelect} value={inv.id} onChange={e => setSelectedId(e.target.value)}>
            {(inventaires || []).map(i => <option key={i.id} value={i.id}>{i.date} - {i.statut}</option>)}
          </select>
          <span style={{...invs.badge, background: estValide ? 'var(--success-bg)' : 'var(--warning-bg)', color: estValide ? 'var(--success-text)' : 'var(--warning-text)'}}>
            {estValide ? (validateurNom ? `✓ Validé par ${validateurNom}` : '✓ Validé') : '⏳ En cours'}
          </span>
        </div>
        <div className="module-actions">
          {canManage && !estValide && <button style={invs.validateBtn} onClick={validerInventaire}>✓ Valider l'inventaire</button>}
          {canManage && estValide && <button style={invs.exportBtn} onClick={rouvrirInventaire}>↩ Rouvrir</button>}
          {canManage && <button style={invs.addBtn} onClick={() => openNewInventory(perimetreActif)}>+ Nouvel inventaire</button>}
          {canManage && <button style={invs.exportBtn} onClick={openRename}>✎ Renommer le périmètre</button>}
          {canEditLignes && <button style={invs.exportBtn} onClick={openAddLine}>+ Ajouter produit</button>}
          {canEditLignes && !sel.active && <button style={invs.exportBtn} onClick={sel.enter}>☑ Sélectionner</button>}
          {canExport && <button style={invs.exportBtn} onClick={downloadInventoryTemplate}>📄 Template XLSX</button>}
          {canExport && (
            <label style={{...invs.exportBtn, cursor:'pointer'}}>
              📥 Importer XLSX
              <input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImportInventoryXLSX}/>
            </label>
          )}
          {canManage && inventairesEtab.length > 1 && <button style={invs.deleteBtn} onClick={deleteInventory}>Supprimer inventaire</button>}
          {canExport && <button style={invs.exportBtn} onClick={printInventory}>🖨 Imprimer</button>}
          {canExport && <button style={invs.exportBtn} onClick={exportInventoryPdf}>⬇ Export PDF</button>}
        </div>
      </div>

      <div id="inventaire-print">
        {/* Identité du document : reprise telle quelle dans l'impression et le PDF,
            où les onglets de périmètre (no-print) ont disparu. */}
        <div style={invs.docTitle}>
          <span style={invs.docTitlePerimetre}>{perimetreActif}</span>
          <span style={invs.docTitleDate}>Inventaire du {inv.date}</span>
          {/* Sur un document imprimé, « validé » sans nom de valideur ne prouve rien. */}
          <span style={invs.docTitleDate}>
            {estValide ? `· Validé${validateurNom ? ' par ' + validateurNom : ''}` : '· En cours'}
          </span>
        </div>

        <div style={invs.kpiBar}>
          <div style={invs.kpiCard}><div style={invs.kpiLabel}>Valeur du stock ({perimetreActif})</div><div style={invs.kpiVal}>CHF {inv.valeurTotale.toLocaleString('fr-CH', {minimumFractionDigits:2})}</div></div>
          {/* Consolidé : dernier inventaire de CHAQUE périmètre. Additionner
              toute la liste compterait plusieurs fois le même stock. */}
          {perimetres.length > 1 && (
            <div style={invs.kpiCard}>
              <div style={invs.kpiLabel}>Stock total ({perimetres.length} périmètres)</div>
              <div style={invs.kpiVal}>CHF {valeurTousPerimetres.toLocaleString('fr-CH', {minimumFractionDigits:2})}</div>
            </div>
          )}
          {/* Évolution vs inventaire précédent */}
          {previousInv && deltaValeur != null && (
            <div style={invs.kpiCard}>
              <div style={invs.kpiLabel}>
                Évolution vs précédent
                <span style={{ fontSize: 9, color: 'var(--text2)', fontWeight: 400, marginLeft: 4 }}>
                  ({previousInv.date})
                </span>
              </div>
              <div style={{
                ...invs.kpiVal,
                color: deltaValeur > 0 ? 'var(--success-strong)' : deltaValeur < 0 ? 'var(--danger-strong)' : 'var(--text2)',
              }}>
                {deltaValeur > 0 ? '+' : ''}CHF {deltaValeur.toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {deltaPct != null && (
                  <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 6, opacity: 0.85 }}>
                    ({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          )}
          <div style={invs.kpiCard}><div style={invs.kpiLabel}>Écarts défavorables</div><div style={{...invs.kpiVal, color:'var(--danger-strong)'}}>−CHF {totEcart.toFixed(2)}</div></div>
          <div style={invs.kpiCard}><div style={invs.kpiLabel}>Lignes conformes</div><div style={{...invs.kpiVal, color:'var(--success-text)'}}>{totNul} / {(inv.lignes || []).length}</div></div>
          <div style={invs.kpiCard}><div style={invs.kpiLabel}>Écarts négatifs</div><div style={{...invs.kpiVal, color:'var(--danger-strong)'}}>{totNegatif} lignes</div></div>
          <div style={invs.kpiCard}><div style={invs.kpiLabel}>Écarts positifs</div><div style={{...invs.kpiVal, color:'var(--success-strong)'}}>{totPositif} lignes</div></div>
        </div>

        <div style={invs.filters} className="no-print">
          <SegmentedTabs
            size="sm"
            active={catFilter}
            onChange={setCatFilter}
            tabs={cats.map(c => ({ id: c, label: c }))}
          />
          {hasTypes && (
            <div style={{display:'flex', gap:6, alignItems:'center'}}>
              <span style={{fontSize:11, color:'var(--text2)', fontWeight:600, textTransform:'uppercase', letterSpacing:0.4}}>Type :</span>
              <SegmentedTabs
                size="sm"
                active={typeFilter}
                onChange={setTypeFilter}
                tabs={['Tous', 'sec', 'positif', 'negatif'].map(t => ({ id: t, label: t === 'negatif' ? 'Négatif' : t === 'sec' ? 'Sec' : t === 'positif' ? 'Positif' : 'Tous' }))}
              />
            </div>
          )}
          <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher un produit…" />
        </div>

        {sel.active && (
          <SelectionToolbar
            count={sel.count}
            total={filtered.length}
            allSelected={sel.count > 0 && sel.count === filtered.length}
            onToggleAll={() => (sel.count === filtered.length ? sel.clear() : sel.selectAll(filtered.map(l => l.id)))}
            onDelete={supprimerLignesSelection}
            onExport={exporterLignesSelection}
            exportLabel="⬇ Exporter Excel"
            onCancel={sel.exit}
            busy={bulkBusy}
          />
        )}

        {canEditLignes && filtered.length > 0 && (
          <div style={invs.saisieHint} className="no-print">
            Tapez la quantité comptée dans la colonne « Stock réel ». La virgule est acceptée ;
            Entrée passe à la ligne suivante. Écarts et valeurs se recalculent à la sortie du champ.
          </div>
        )}

        <div style={invs.tableWrap} className="grid-table-scroll">
          <div className="grid-table-row" style={{...invs.tableHead, gridTemplateColumns: colonnesTableau}}>
            {sel.active && <span className="no-print"/>}
            <span>Produit</span><span>Catégorie</span><span style={{textAlign:'right'}}>Stock théorique</span><span style={{textAlign:'right'}}>Stock réel</span><span style={{textAlign:'right'}}>Écart</span><span style={{textAlign:'right'}}>Valeur (CHF)</span><span style={{textAlign:'right'}}>Écart valeur</span>{canManage && <span className="no-print"/>}
          </div>
          {(filtered || []).map(l => {
            const ecartColor = l.ecart < 0 ? 'var(--danger-strong)' : l.ecart > 0 ? 'var(--success-strong)' : 'var(--text2)';
            // Badge type (sec/positif/négatif) si ligne importée via format Samper
            const typeBadge = l.type ? (
              <span style={{
                display: 'inline-block', fontSize: 9, fontWeight: 700, marginLeft: 6, padding: '2px 6px', borderRadius: 4, verticalAlign: 'middle',
                background: l.type === 'sec' ? '#f3e8d6' : l.type === 'positif' ? 'var(--success-bg)' : 'var(--danger-bg)',
                color: l.type === 'sec' ? 'var(--accent)' : l.type === 'positif' ? 'var(--success-text)' : 'var(--danger-text)',
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>{l.type}</span>
            ) : null;
            return (
              <div key={l.id} className="grid-table-row" style={{
                ...invs.tableRow,
                gridTemplateColumns: colonnesTableau,
                ...(sel.active && sel.isSelected(l.id) ? { background: 'var(--bg)' } : {}),
              }}>
                {sel.active && (
                  <span className="no-print" style={{ display: 'flex', alignItems: 'center' }}>
                    <input type="checkbox" checked={sel.isSelected(l.id)} onChange={() => sel.toggle(l.id)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  </span>
                )}
                <span style={invs.prodName}>{l.produit}{typeBadge}</span>
                <span style={invs.cell}><span style={invs.catTag}>{l.categorie}</span></span>
                <span style={{...invs.cell, textAlign:'right'}}>{l.stockTheo} {l.unite}</span>
                <span style={{...invs.cellBold, textAlign:'right'}}>
                  {canEditLignes ? (
                    <span style={invs.stockSaisie}>
                      <input
                        // type="text" + inputMode="decimal" et non type="number" :
                        // sur iOS le pavé numérique français propose une virgule que
                        // type="number" rejette en silence (champ vidé au tap).
                        type="text"
                        inputMode="decimal"
                        aria-label={`Stock réel - ${l.produit} (${l.unite})`}
                        ref={el => { if (el) stockRefs.current[l.id] = el; else delete stockRefs.current[l.id]; }}
                        value={stockDraft[l.id] ?? String(l.stockReel ?? '')}
                        onChange={e => setStockDraft(d => ({ ...d, [l.id]: e.target.value }))}
                        onFocus={e => e.target.select()}
                        onBlur={e => commitStockReel(l.id, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitStockReel(l.id, e.target.value);
                            focusLigneSuivante(l.id, filtered);
                          } else if (e.key === 'Escape') {
                            // Abandon de la frappe : on revient à la quantité enregistrée.
                            setStockDraft(d => { const suite = { ...d }; delete suite[l.id]; return suite; });
                            e.target.blur();
                          }
                        }}
                        style={invs.stockInput}
                      />
                      <span style={invs.stockUnite}>{l.unite}</span>
                    </span>
                  ) : (
                    <>{l.stockReel} {l.unite}</>
                  )}
                </span>
                <span style={{...invs.cell, textAlign:'right', color:ecartColor, fontWeight:600}}>{l.ecart > 0 ? '+' : ''}{l.ecart} {l.unite}</span>
                <span style={{...invs.cellBold, textAlign:'right'}}>{l.valeur.toLocaleString('fr-CH', {minimumFractionDigits:2})}</span>
                <span style={{...invs.cell, textAlign:'right', color:ecartColor, fontWeight:600}}>{l.ecartValeur > 0 ? '+' : ''}{l.ecartValeur.toFixed(2)}</span>
                {canManage && <span className="no-print">{canEditLignes && <button style={invs.deleteBtn} onClick={() => deleteLine(l.id)}>Supprimer</button>}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {renderNewInventoryModal()}
      {renderRenameModal()}

      {/* Modale ajout produit manuel */}
      {showAddLine && (
        <div className="modal-sheet-overlay" style={invs.overlay} onClick={() => setShowAddLine(false)}>
          <div className="modal-sheet" style={{...invs.modal, width: 500}} onClick={e=>e.stopPropagation()}>
            <div style={invs.modalHeader}>
              <div style={{fontWeight:700, fontSize:16, fontFamily:'var(--font-serif)'}}>Ajouter un produit à l'inventaire</div>
              <button style={invs.closeBtn} onClick={() => setShowAddLine(false)}>✕</button>
            </div>
            <div style={{padding:'22px', display:'flex', flexDirection:'column', gap:14}}>
              {/* Champ nom du produit avec autocomplétion catalogue */}
              <div style={{ position: 'relative' }}>
                <label style={invs.fieldLabel}>
                  Nom du produit *
                  {catalogue.length > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text2)', fontWeight: 400, fontStyle: 'italic' }}>
                      ({catalogue.length} produits dans le catalogue - tapez pour rechercher)
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  style={invs.fieldInput}
                  value={newLine.produit}
                  placeholder={catalogue.length > 0 ? "Tapez pour piocher dans le catalogue ou saisir un nom libre" : "Ex : Filet de bœuf CH"}
                  autoComplete="off"
                  onChange={e => {
                    setNewLine({...newLine, produit: e.target.value});
                    setAutocompleteOpen(true);
                    setAutocompleteFocus(-1);
                  }}
                  onFocus={() => setAutocompleteOpen(true)}
                  onBlur={() => {
                    // Délai pour laisser le clic sur une suggestion arriver
                    setTimeout(() => setAutocompleteOpen(false), 150);
                  }}
                  onKeyDown={e => {
                    const q = normalizeSearch(newLine.produit).trim();
                    const matches = catalogue
                      .filter(p => p.nom && normalizeSearch(p.nom).includes(q))
                      .slice(0, 8);
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setAutocompleteFocus(i => Math.min(i + 1, matches.length - 1));
                      setAutocompleteOpen(true);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setAutocompleteFocus(i => Math.max(i - 1, -1));
                    } else if (e.key === 'Enter' && autocompleteFocus >= 0 && matches[autocompleteFocus]) {
                      e.preventDefault();
                      const p = matches[autocompleteFocus];
                      setNewLine({
                        ...newLine,
                        produit: p.nom,
                        categorie: p.categorie || 'Autres',
                        unite: p.uniteRef || 'pcs',
                        prixUnit: p.prixUnitaire || 0,
                      });
                      setAutocompleteOpen(false);
                      setAutocompleteFocus(-1);
                    } else if (e.key === 'Escape') {
                      setAutocompleteOpen(false);
                    }
                  }}
                />
                {/* Dropdown suggestions */}
                {autocompleteOpen && newLine.produit.trim() && catalogue.length > 0 && (() => {
                  const q = normalizeSearch(newLine.produit).trim();
                  const matches = catalogue
                    .filter(p => p.nom && normalizeSearch(p.nom).includes(q))
                    .slice(0, 8);
                  if (matches.length === 0) return null;
                  return (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 6, maxHeight: 280, overflowY: 'auto',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 10,
                      marginTop: 2,
                    }}>
                      {matches.map((p, i) => (
                        <div
                          key={p.id}
                          onMouseDown={e => {
                            // mouseDown plutôt que click pour battre le onBlur
                            e.preventDefault();
                            setNewLine({
                              ...newLine,
                              produit: p.nom,
                              categorie: p.categorie || 'Autres',
                              unite: p.uniteRef || 'pcs',
                              prixUnit: p.prixUnitaire || 0,
                            });
                            setAutocompleteOpen(false);
                            setAutocompleteFocus(-1);
                          }}
                          onMouseEnter={() => setAutocompleteFocus(i)}
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            borderBottom: i < matches.length - 1 ? '1px solid var(--border)' : 'none',
                            background: i === autocompleteFocus ? 'var(--bg)' : 'transparent',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.nom}</div>
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                              {p.categorie || 'Autres'}
                              {p.uniteRef && ` · ${p.uniteRef}`}
                              {p.fournisseurNom && ` · ${p.fournisseurNom}`}
                            </div>
                          </div>
                          {p.prixUnitaire != null && p.prixUnitaire > 0 && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                              {p.prixUnitaire.toFixed(p.prixUnitaire < 1 ? 4 : 2)} CHF/{p.uniteRef}
                            </div>
                          )}
                        </div>
                      ))}
                      <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text2)', borderTop: '1px solid var(--border)', background: 'var(--bg)', fontStyle: 'italic' }}>
                        ↑↓ pour naviguer · Entrée pour valider · Échap pour fermer
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                <div>
                  <label style={invs.fieldLabel}>Catégorie</label>
                  <select style={invs.fieldInput} value={newLine.categorie} onChange={e => setNewLine({...newLine, categorie: e.target.value})}>
                    {['Viandes','Poissons','Légumes','Fruits','Produits laitiers','Féculents','Épicerie','Boissons','Autres'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={invs.fieldLabel}>Unité</label>
                  <select style={invs.fieldInput} value={newLine.unite} onChange={e => setNewLine({...newLine, unite: e.target.value})}>
                    {['pcs','kg','g','L','ml','btl','cs','cc'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10}}>
                <div>
                  <label style={invs.fieldLabel}>Stock théorique</label>
                  <input type="number" step="0.01" style={invs.fieldInput} value={newLine.stockTheo}
                    onChange={e => setNewLine({...newLine, stockTheo: e.target.value})}/>
                </div>
                <div>
                  <label style={invs.fieldLabel}>Stock réel</label>
                  <input type="number" step="0.01" style={invs.fieldInput} value={newLine.stockReel}
                    onChange={e => setNewLine({...newLine, stockReel: e.target.value})}/>
                </div>
                <div>
                  <label style={invs.fieldLabel}>Prix unit. (CHF)</label>
                  <input type="number" step="0.01" style={invs.fieldInput} value={newLine.prixUnit}
                    onChange={e => setNewLine({...newLine, prixUnit: e.target.value})}/>
                </div>
              </div>
              <div style={{display:'flex', gap:10, justifyContent:'flex-end', marginTop:4}}>
                <button style={invs.exportBtn} onClick={() => setShowAddLine(false)}>Annuler</button>
                <button style={invs.addBtn} onClick={addLine}>Ajouter à l'inventaire</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const invs = {
  root: {display:'flex',flexDirection:'column',gap:16}, header: {display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}, headerLeft: {display:'flex',alignItems:'center',gap:12}, headerRight: {display:'flex',gap:8,flexWrap:'wrap'},
  // minWidth:0 : sans ça la barre d'onglets, enfant flex, est clampée à sa
  // largeur de contenu et pousse la page en scroll horizontal sur mobile.
  perimetreBar: {display:'flex',alignItems:'center',gap:10,minWidth:0,maxWidth:'100%'},
  docTitle: {display:'flex',alignItems:'baseline',gap:10,flexWrap:'wrap',marginBottom:4},
  docTitlePerimetre: {fontSize:17,fontWeight:700,fontFamily:'var(--font-serif)',color:'var(--text)'},
  docTitleDate: {fontSize:12,color:'var(--text2)'},
  loadError: {background:'var(--warning-bg)',color:'var(--warning-text)',border:'1px solid var(--warning-bd)',borderRadius:8,padding:'10px 14px',fontSize:12,display:'flex',alignItems:'center',flexWrap:'wrap',gap:6},
  fieldHint: {fontSize:11,color:'var(--text2)',marginTop:6,lineHeight:1.45},
  saisieHint: {fontSize:11,color:'var(--text2)',lineHeight:1.5,padding:'8px 12px',background:'var(--bg)',border:'1px dashed var(--border)',borderRadius:8},
  // Le champ prend la largeur de sa cellule ; l'unité reste collée à droite et
  // ne se comprime jamais (flexShrink 0), sinon « pcs » se coupe en « p… ».
  stockSaisie: {display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6,width:'100%',minWidth:0},
  stockInput: {width:'100%',maxWidth:110,minWidth:64,padding:'6px 8px',textAlign:'right',border:'1px solid var(--border)',borderRadius:6,background:'var(--bg)',color:'var(--text)',fontSize:13,fontWeight:600,fontFamily:'var(--font)',boxSizing:'border-box'},
  stockUnite: {fontSize:11,color:'var(--text2)',flexShrink:0},
  invSelect: {padding:'8px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--surface)',fontFamily:'var(--font)',cursor:'pointer'}, badge: {display:'inline-block',padding:'5px 12px',borderRadius:12,fontSize:12,fontWeight:600},
  addBtn: {padding:'8px 16px',background:'var(--accent)',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
  validateBtn: {padding:'8px 16px',background:'var(--success-bg)',border:'1px solid var(--success-bd)',color:'var(--success-text)',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--font)'},
  exportBtn: {padding:'8px 16px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:8,fontSize:13,cursor:'pointer',fontFamily:'var(--font)'},
  deleteBtn:{padding:'6px 10px',background:'none',border:'1px solid var(--danger-bd)',color:'var(--danger-strong)',borderRadius:8,fontSize:12,cursor:'pointer',fontFamily:'var(--font)'},
  kpiBar: {display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12}, kpiCard: {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px'}, kpiLabel: {fontSize:11,fontWeight:600,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,marginBottom:6}, kpiVal: {fontSize:20,fontWeight:700,fontFamily:'var(--font-serif)',color:'var(--text)'},
  filters: {display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',minWidth:0}, catTabs: {display:'flex',gap:4,flexWrap:'wrap'}, catBtn: {padding:'5px 14px',border:'1px solid var(--border)',borderRadius:20,background:'var(--surface)',color:'var(--text2)',fontSize:12,cursor:'pointer',fontFamily:'var(--font)'}, catActive: {background:'var(--nav)',color:'#fff',borderColor:'var(--nav)'},
  tableWrap: {background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}, tableHead: {display:'grid',padding:'10px 18px',background:'var(--bg)',fontSize:10,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,borderBottom:'1px solid var(--border)',gap:12}, tableRow: {display:'grid',padding:'11px 18px',borderBottom:'1px solid var(--border)',gap:12,alignItems:'center'}, prodName: {fontSize:13,fontWeight:600,color:'var(--text)'}, cell: {fontSize:13,color:'var(--text)'}, cellBold: {fontSize:13,fontWeight:600,color:'var(--text)'}, catTag: {fontSize:10,fontWeight:600,background:'var(--bg)',border:'1px solid var(--border)',color:'var(--text2)',padding:'2px 8px',borderRadius:10},
  overlay: {position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}, modal: {background:'var(--surface)',borderRadius:14,width:420,maxWidth:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}, modalHeader: {display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 22px',borderBottom:'1px solid var(--border)'}, closeBtn: {background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--text2)'}, fieldLabel: {display:'block',fontSize:12,fontWeight:600,color:'var(--text2)',marginBottom:6,textTransform:'uppercase',letterSpacing:0.4}, fieldInput: {width:'100%',padding:'9px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--bg)',fontFamily:'var(--font)',boxSizing:'border-box'},
};

export default Inventaire;
