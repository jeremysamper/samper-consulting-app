import React from 'react';
import { alertLegacy, confirmLegacy, notifyLegacy } from '../../legacy/legacyApi.js';
import { dbService } from '../../services/dbService.js';
import { canManageModule } from '../../data/demoData.js';
import CatalogueAiImporter from './import/CatalogueAiImporter.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';

// ═══════════════════════════════════════════════════════════════
// MODULE CATALOGUE - Base de données produits & fournisseurs
// ═══════════════════════════════════════════════════════════════

const CATEGORIES_PRODUITS = [
  'Viandes', 'Poissons & fruits de mer', 'Fruits & légumes',
  'Épicerie sèche', 'Produits laitiers', 'Crèmerie / fromages',
  'Boulangerie / pâtisserie', 'Boissons', 'Alcools',
  'Surgelés', 'Condiments / sauces', 'Herbes / épices',
  'Hygiène / non alimentaire', 'Autres',
];

const UNITES_REF = [
  { val: 'g',   label: 'g (gramme)' },
  { val: 'ml',  label: 'ml (millilitre)' },
  { val: 'pcs', label: 'pcs (pièce)' },
];

const safeText = (value) => String(value ?? '').toLowerCase();

const Catalogue = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const legacySB = dbService.getBridge();
  const canWrite = canManageModule(user.role, 'catalogue');
  const isConsultant = user.role === 'consultant';

  const [produits, setProduits] = React.useState([]);
  const [fournisseurs, setFournisseurs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState('produits'); // 'produits' | 'fournisseurs'
  const [search, setSearch] = React.useState('');
  const [catFilter, setCatFilter] = React.useState('Tous');
  const [showProdForm, setShowProdForm] = React.useState(false);
  const [showFournForm, setShowFournForm] = React.useState(false);
  const [editProd, setEditProd] = React.useState(null);
  const [editFourn, setEditFourn] = React.useState(null);
  const [importing, setImporting] = React.useState(false);
  const [importReport, setImportReport] = React.useState(null); // { newItems, duplicates, aberrants }
  const [showAiImport, setShowAiImport] = React.useState(false);
  const [selected, setSelected] = React.useState(new Set());
  const fileRef = React.useRef(null);

  // ═══ Helpers de validation ═══
  // Normalise un nom pour comparaison (minuscule, sans accents, sans espaces multiples)
  const normalizeName = (s) => (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Détecte un prix unitaire aberrant.
  // Renvoie une raison textuelle ou null si OK.
  // Seuils volontairement larges pour ne flagger que les VRAIS bugs d'import.
  const detectAberrantPrice = (prix, uniteRef, nom) => {
    if (prix == null || isNaN(prix)) return 'prix manquant';
    if (prix <= 0) return 'prix nul ou négatif';
    // Pour g et ml : le prix raisonnable est entre 0.0001 CHF/g et 5 CHF/g
    // (en dessous = facteur 1000 manquant ; au-dessus = unité pcs traitée comme g)
    if (uniteRef === 'g' || uniteRef === 'ml') {
      if (prix < 0.00001) return `prix très bas (${prix.toFixed(6)} CHF/${uniteRef}) - vérifier l'unité`;
      if (prix > 10) return `prix très élevé (${prix.toFixed(2)} CHF/${uniteRef}) - vérifier l'unité`;
    }
    // Pour pcs : entre 0.05 CHF et 10000 CHF
    if (uniteRef === 'pcs') {
      if (prix < 0.05) return `prix très bas (${prix.toFixed(4)} CHF/pcs) - vérifier`;
      if (prix > 10000) return `prix très élevé (${prix.toFixed(2)} CHF/pcs) - vérifier`;
    }
    return null;
  };

  // ═══ Load ═══
  React.useEffect(() => {
    if (!legacySB) { setLoading(false); return; }
    let mounted = true;
    const unsubs = [];
    const reload = async () => {
      try {
        const [ps, fs] = await Promise.all([
          legacySB.db.listProduits(etabId),
          legacySB.db.listFournisseurs(etabId),
        ]);
        if (!mounted) return;
        setProduits(Array.isArray(ps) ? ps : []);
        setFournisseurs(Array.isArray(fs) ? fs : []);
      } catch (err) { console.error('[Catalogue]', err); }
      finally { if (mounted) setLoading(false); }
    };
    reload();
    unsubs.push(legacySB.realtime.subscribeReload(
      ['produits', 'fournisseurs', 'produit_fournisseurs'],
      reload,
    ));
    return () => { mounted = false; unsubs.forEach(u => u && u()); };
  }, [etabId]);

  const searchValue = safeText(search);
  const filtered = produits.filter(p =>
    (catFilter === 'Tous' || p.categorie === catFilter) &&
    (searchValue === '' || safeText(p.nom).includes(searchValue) ||
     safeText(p.fournisseurNom).includes(searchValue))
  );

  // ═══ Fournisseur CRUD ═══
  const saveFourn = async (f) => {
    if (!legacySB) return;
    try {
      await legacySB.db.upsertFournisseur({ ...f, etablissementId: etabId });
      setShowFournForm(false);
    } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
  };
  const deleteFourn = async (id) => {
    if (!confirmLegacy('Supprimer ce fournisseur ? Les produits associés perdront le lien.')) return;
    try { await legacySB.db.deleteFournisseur(id); } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
  };

  // ═══ Produit CRUD ═══
  const saveProd = async (p) => {
    if (!legacySB) return;
    try {
      await legacySB.db.upsertProduit({ ...p, etablissementId: etabId });
      setShowProdForm(false);
    } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
  };
  const deleteProd = async (id) => {
    if (!confirmLegacy('Supprimer ce produit du catalogue ?')) return;
    try { await legacySB.db.deleteProduit(id); } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
  };

  // ═══ Import Excel ═══
  // ─── Helpers parsing ───
  // Parse une quantité totale combinant description + colonne "Unité"
  // Ex: desc="Vinaigre, 3 x 1 l" + unit="pq à 3 bt" → 3000 ml
  // Ex: desc="Champagne, 75 cl" + unit="1 bt" → 750 ml
  // Ex: desc="Marlboro Gold Box" + unit="1 co" → 1 pcs
  const parseFullQuantity = (desc, unitStr) => {
    const d = String(desc || '').toLowerCase();
    const u = String(unitStr || '').toLowerCase();
    // 1. Pattern multiplicatif dans la description : "3 x 1 l", "10 x 1 kg"
    let m = d.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|lt|ml|cl)\b/);
    if (m) {
      const n = parseFloat(m[1].replace(',', '.'));
      const q = parseFloat(m[2].replace(',', '.'));
      const unit = m[3];
      const total = n * q;
      if (unit === 'kg') return { quantite: total * 1000, uniteRef: 'g' };
      if (unit === 'g')  return { quantite: total, uniteRef: 'g' };
      if (unit === 'l' || unit === 'lt') return { quantite: total * 1000, uniteRef: 'ml' };
      if (unit === 'cl') return { quantite: total * 10, uniteRef: 'ml' };
      if (unit === 'ml') return { quantite: total, uniteRef: 'ml' };
    }
    // 2. Pattern simple dans la description : ", 20 l", " 400 g"
    m = d.match(/[\s,](\d+(?:[.,]\d+)?)\s*(kg|g|l|lt|ml|cl)\b/);
    if (m) {
      const q = parseFloat(m[1].replace(',', '.'));
      const unit = m[2];
      if (unit === 'kg') return { quantite: q * 1000, uniteRef: 'g' };
      if (unit === 'g')  return { quantite: q, uniteRef: 'g' };
      if (unit === 'l' || unit === 'lt') return { quantite: q * 1000, uniteRef: 'ml' };
      if (unit === 'cl') return { quantite: q * 10, uniteRef: 'ml' };
      if (unit === 'ml') return { quantite: q, uniteRef: 'ml' };
    }
    // 3. Fallback colonne unité : "bx à 20 lt", "pq à 3 bt"
    m = u.match(/à\s*(\d+(?:[.,]\d+)?)\s*(\w+)/);
    if (m) {
      const n = parseFloat(m[1].replace(',', '.'));
      const unit = m[2];
      if (unit === 'lt' || unit === 'l') return { quantite: n * 1000, uniteRef: 'ml' };
      if (unit === 'cl') return { quantite: n * 10, uniteRef: 'ml' };
      if (unit === 'ml') return { quantite: n, uniteRef: 'ml' };
      if (unit === 'kg') return { quantite: n * 1000, uniteRef: 'g' };
      if (unit === 'g')  return { quantite: n, uniteRef: 'g' };
      // Bouteilles, cartons, sachets, pièces : on traite comme pcs
      return { quantite: n, uniteRef: 'pcs' };
    }
    // 4. "1 pc", "1 bt" (un seul élément)
    m = u.match(/^(\d+(?:[.,]\d+)?)\s*(\w+)$/);
    if (m) {
      const n = parseFloat(m[1].replace(',', '.'));
      const unit = m[2];
      if (unit === 'lt' || unit === 'l') return { quantite: n * 1000, uniteRef: 'ml' };
      if (unit === 'kg') return { quantite: n * 1000, uniteRef: 'g' };
      if (unit === 'g')  return { quantite: n, uniteRef: 'g' };
      return { quantite: n, uniteRef: 'pcs' };
    }
    return { quantite: 1, uniteRef: 'pcs' };
  };

  const WOOD_SHEET_CAT = {
    'food': 'Épicerie sèche', 'alimentaire': 'Épicerie sèche',
    'tabak': 'Autres', 'tabac': 'Autres',
    'wein': 'Alcools', 'vin': 'Alcools', 'vins': 'Alcools',
    'spirituosen': 'Alcools', 'spiritueux': 'Alcools', 'alcool': 'Alcools',
    'bier': 'Alcools', 'biere': 'Alcools', 'champagne': 'Alcools',
    'getränke': 'Boissons', 'boissons': 'Boissons', 'boisson': 'Boissons',
    'molkerei': 'Produits laitiers', 'laitier': 'Produits laitiers',
    'cremerie': 'Crèmerie / fromages', 'fromage': 'Crèmerie / fromages',
    'backwaren': 'Boulangerie / pâtisserie', 'boulangerie': 'Boulangerie / pâtisserie', 'patisserie': 'Boulangerie / pâtisserie',
    'früchte': 'Fruits & légumes', 'gemüse': 'Fruits & légumes', 'fruits': 'Fruits & légumes', 'legume': 'Fruits & légumes',
    'metzgerei': 'Viandes', 'viande': 'Viandes', 'boucherie': 'Viandes', 'volaille': 'Viandes',
    'fischerei': 'Poissons & fruits de mer', 'poisson': 'Poissons & fruits de mer', 'maree': 'Poissons & fruits de mer',
    'surgele': 'Surgelés', 'congele': 'Surgelés', 'frozen': 'Surgelés',
    'epice': 'Herbes / épices', 'herbe': 'Herbes / épices', 'gewurz': 'Herbes / épices',
    'condiment': 'Condiments / sauces', 'sauce': 'Condiments / sauces',
    'nonfood': 'Hygiène / non alimentaire', 'nearfood': 'Hygiène / non alimentaire', 'hygiene': 'Hygiène / non alimentaire',
  };

  const detectCategory = (sheetName) => {
    const lower = (sheetName || '').toLowerCase();
    for (const [key, cat] of Object.entries(WOOD_SHEET_CAT)) {
      if (lower.includes(key)) return cat;
    }
    return 'Autres';
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const XLSX = await import('xlsx'); // chargé à la demande (hors bundle du module)
      const data = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(data, { type: 'array' });

      const imported = [];
      const skippedNames = [];

      for (const sheetName of wb.SheetNames) {
        const sh = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sh, { header: 1 });
        if (!rows || rows.length < 2) continue;

        // ─── Détecter le format ───
        // Format Wood/fournisseur : L0 = titre catégorie, L1 = entête (No d'art. | Description | Unité | - | Prix)
        // Format inventaire      : colonne A = vide, col B = catégorie, col C = produit, col D = prixUnit
        // Format catalogue std   : col A = catégorie, col B = nom, col C = unité, col D = prix

        const firstRow = (rows[0] || []).map(c => String(c || '').toLowerCase());
        const secondRow = (rows[1] || []).map(c => String(c || '').toLowerCase());
        const isWoodFormat = secondRow.some(c => c.includes("no d'art") || c.includes('description') || c.includes('artikel'));
        const isInventaireFormat = !isWoodFormat && (String(rows[1]?.[0] || '').trim() === '' && rows[1]?.length >= 8);
        const catFromSheet = detectCategory(sheetName);

        // ─── Format Wood (fournisseur Metro/Transgourmet/etc.) ───
        if (isWoodFormat) {
          for (let i = 2; i < rows.length; i++) {
            const row = rows[i] || [];
            const ref = String(row[0] || '').trim();
            const desc = String(row[1] || '').trim();
            const uniteCond = String(row[2] || '').trim();
            const prixStr = String(row[4] || row[3] || '0').replace(',', '.');
            if (!desc || !desc.match(/[a-zA-ZàâäéèêëîïôùûüÀÂÄÉÈÊËÎÏÔÙÛÜ]/)) continue;
            const prix = parseFloat(prixStr) || 0;
            if (prix === 0) continue;

            const { quantite, uniteRef } = parseFullQuantity(desc, uniteCond);
            const nom = desc.replace(/,?\s*\d+(?:[.,]\d+)?\s*x\s*\d+(?:[.,]\d+)?\s*(kg|g|l|ml|cl|lt)\s*$/i, '')
                           .replace(/,?\s*\d+(?:[.,]\d+)?\s*(kg|g|l|ml|cl|lt)\s*$/i, '')
                           .trim().replace(/,\s*$/, '');
            const prixUnit = quantite > 0 ? prix / quantite : prix;

            imported.push({
              nom,
              categorie: catFromSheet,
              conditionnement: uniteCond,
              uniteRef,
              prixUnitaire: parseFloat(prixUnit.toFixed(6)),
              referenceFourn: ref,
              etablissementId: etabId,
              actif: true,
            });
          }
        // ─── Format inventaire Samper ───
        } else if (isInventaireFormat) {
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i] || [];
            const cat = String(row[1] || '').trim();
            const nom = String(row[2] || '').trim();
            if (!nom || nom.toLowerCase() === 'produit') continue;
            const pxUnit = parseFloat(row[3]) || 0;
            const pxKg = parseFloat(row[5]) || 0;
            const prixUnit = pxKg > 0 ? pxKg / 1000 : pxUnit;
            const uniteRef = pxKg > 0 ? 'g' : 'pcs';
            imported.push({ nom, categorie: cat || 'Autres', uniteRef, prixUnitaire: prixUnit, etablissementId: etabId, actif: true });
          }
        // ─── Format catalogue standard ───
        } else {
          let headerIdx = 0;
          for (let i = 0; i < Math.min(5, rows.length); i++) {
            const joined = (rows[i] || []).map(c => String(c || '').toLowerCase()).join('|');
            if (joined.includes('produit') || joined.includes('nom') || joined.includes('description')) { headerIdx = i; break; }
          }
          for (let i = headerIdx + 1; i < rows.length; i++) {
            const row = rows[i] || [];
            const cat = String(row[0] || '').trim() || catFromSheet;
            const nom = String(row[1] || '').trim();
            if (!nom) continue;
            const uniteRef = String(row[2] || 'pcs').trim();
            const prix = parseFloat(String(row[3] || '0').replace(',', '.')) || 0;
            const cond = String(row[5] || '').trim();
            imported.push({ nom, categorie: cat, uniteRef, prixUnitaire: prix, conditionnement: cond, etablissementId: etabId, actif: true });
          }
        }
      }

      // ─── Analyse pré-import : doublons + prix aberrants ───
      // On ne sauvegarde pas tout de suite. On classe les produits scannés
      // en 3 catégories pour que l'utilisateur valide avant l'écriture en DB.

      // Index des produits existants par référence ET par nom normalisé
      const existingByRef = new Map();
      const existingByName = new Map();
      produits.forEach(p => {
        if (p.referenceFourn && p.referenceFourn.trim()) {
          existingByRef.set(p.referenceFourn.trim().toLowerCase(), p);
        }
        const nKey = normalizeName(p.nom);
        if (nKey) existingByName.set(nKey, p);
      });

      // Index aussi parmi les produits importés (cas où le fichier contient lui-même des doublons)
      const seenInImport = new Set();

      const newItems = [];        // produits OK à importer
      const duplicates = [];      // doublons détectés (vs DB ou intra-fichier)
      const aberrants = [];       // prix aberrants

      for (const p of imported) {
        const refKey = (p.referenceFourn || '').trim().toLowerCase();
        const nameKey = normalizeName(p.nom);

        // Cas 1 : doublon vs DB existante (par référence puis par nom)
        let existingMatch = null;
        if (refKey && existingByRef.has(refKey)) {
          existingMatch = existingByRef.get(refKey);
        } else if (nameKey && existingByName.has(nameKey)) {
          existingMatch = existingByName.get(nameKey);
        }

        // Cas 2 : doublon intra-fichier
        const intraKey = refKey || nameKey;
        const isIntraDup = intraKey && seenInImport.has(intraKey);
        if (intraKey) seenInImport.add(intraKey);

        if (existingMatch || isIntraDup) {
          duplicates.push({
            ...p,
            _existing: existingMatch,
            _intraDup: isIntraDup,
            _matchReason: existingMatch
              ? (refKey && existingByRef.has(refKey) ? 'référence' : 'nom')
              : 'présent 2× dans le fichier',
          });
          continue;
        }

        // Cas 3 : prix aberrant
        const aberrantReason = detectAberrantPrice(p.prixUnitaire, p.uniteRef, p.nom);
        if (aberrantReason) {
          aberrants.push({ ...p, _reason: aberrantReason });
          continue;
        }

        newItems.push(p);
      }

      // Ouvrir la modale de prévisualisation à la place de l'import direct
      setImportReport({
        newItems,
        duplicates,
        aberrants,
        totalScanned: imported.length,
      });
    } catch (err) {
      notifyLegacy('Erreur import : ' + err.message, 'error');
      console.error('[handleImportExcel]', err);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Confirme l'import après prévisualisation
  // mode: 'safe' (uniquement nouveaux) | 'all' (nouveaux + doublons écrasés + aberrants forcés)
  const confirmImport = async (mode = 'safe') => {
    if (!importReport) return;
    setImporting(true);
    try {
      const toImport = mode === 'safe'
        ? importReport.newItems
        : [...importReport.newItems, ...importReport.duplicates, ...importReport.aberrants];
      let saved = 0;
      const errors = [];
      for (const p of toImport) {
        try {
          // Si c'est un doublon avec un existing, on conserve l'id existant pour update
          const payload = p._existing ? { ...p, id: p._existing.id } : p;
          // Nettoyer les champs internes
          delete payload._existing;
          delete payload._intraDup;
          delete payload._matchReason;
          delete payload._reason;
          await legacySB.db.upsertProduit(payload);
          saved++;
        } catch (err) {
          errors.push(p.nom);
          console.error('[upsertProduit]', err);
        }
      }
      setImportReport(null);
      notifyLegacy(`✓ Import terminé : ${saved} produit(s)${errors.length ? `\n⚠ ${errors.length} en erreur (voir console).` : '.'}`, 'success');
    } finally {
      setImporting(false);
    }
  };

  const cats = ['Tous', ...CATEGORIES_PRODUITS];
  const totalValeur = produits.reduce((s, p) => s + (p.prixUnitaire || 0), 0);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;

  return (
    <div style={cat.root}>
      {/* Header */}
      <div style={cat.header}>
        <div>
          <div style={cat.title}>Catalogue produits</div>
          <div style={cat.sub}>{produits.length} produit{produits.length > 1 ? 's' : ''} · {fournisseurs.length} fournisseur{fournisseurs.length > 1 ? 's' : ''}</div>
        </div>
        {canWrite && (
          <div className="module-actions">
            {isConsultant && (
            <button style={{ ...cat.btn, background: 'var(--ai-bg-soft)', color: 'var(--ai-text)', borderColor: 'var(--ai-bd)' }} onClick={() => setShowAiImport(true)}>
              ✨ Import IA
            </button>
            )}
            <label style={{ ...cat.btn, background: 'var(--surface)', border: '1px solid var(--border)', cursor: importing ? 'wait' : 'pointer', color: 'var(--text)' }}>
              {importing ? '⏳ Import…' : '📥 Importer Excel'}
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportExcel} disabled={importing} />
            </label>
            <button style={cat.btn} onClick={() => { setEditFourn(null); setShowFournForm(true); }}>+ Fournisseur</button>
            <button style={{ ...cat.btn, background: 'var(--accent)', color: '#fff', border: 'none' }} onClick={() => { setEditProd(null); setShowProdForm(true); }}>+ Produit</button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <SegmentedTabs
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'produits', label: `🛒 Produits (${produits.length})` },
          { id: 'fournisseurs', label: `🏭 Fournisseurs (${fournisseurs.length})` },
        ]}
      />

      {activeTab === 'produits' && (
        <>
          {/* Filtres */}
          <div style={cat.filters}>
            <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher produit ou fournisseur…" />
            <SegmentedTabs
              size="sm"
              active={catFilter}
              onChange={setCatFilter}
              tabs={cats.map(c => ({ id: c, label: c === 'Tous' ? `Tous (${produits.length})` : c }))}
            />
          </div>

          {/* Table produits */}
          {filtered.length === 0 ? (
            <div style={cat.empty}>
              <div style={{ fontSize: 40, opacity: 0.3 }}>🛒</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>
                {produits.length === 0 ? 'Catalogue vide' : 'Aucun résultat'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
                {produits.length === 0 ? 'Importez votre fichier Excel ou ajoutez un produit manuellement.' : 'Modifiez vos filtres.'}
              </div>
            </div>
          ) : (
            <>
              {/* Barre sélection de masse */}
              {canWrite && (
                <div style={cat.selectBar}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={e => {
                        if (e.target.checked) setSelected(new Set(filtered.map(p => p.id)));
                        else setSelected(new Set());
                      }}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }}
                    />
                    {selected.size > 0
                      ? `${selected.size} produit${selected.size > 1 ? 's' : ''} sélectionné${selected.size > 1 ? 's' : ''}`
                      : 'Tout sélectionner'}
                  </label>

                  {selected.size > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: 'var(--text2)' }}>Attribuer fournisseur :</span>
                      <select
                        style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}
                        value=""
                        onChange={async e => {
                          const fournisseurId = e.target.value;
                          if (!fournisseurId) return;
                          const fourn = fournisseurs.find(f => f.id === fournisseurId);
                          if (!fourn) return;
                          if (!confirmLegacy(`Attribuer "${fourn.nom}" à ${selected.size} produit${selected.size > 1 ? 's' : ''} sélectionné${selected.size > 1 ? 's' : ''} ?`)) return;
                          let ok = 0;
                          for (const prodId of selected) {
                            const prod = produits.find(p => p.id === prodId);
                            if (!prod) continue;
                            try {
                              await legacySB.db.upsertProduit({ ...prod, fournisseurId, etablissementId: etabId });
                              ok++;
                            } catch (err) { console.error(err); }
                          }
                          setSelected(new Set());
                          alertLegacy(`✓ ${ok} produit${ok > 1 ? 's' : ''} mis à jour.`);
                        }}
                      >
                        <option value="">Choisir…</option>
                        {(fournisseurs || []).map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                      </select>
                      <button
                        style={{ ...cat.miniBtn, color: 'var(--danger-strong)', borderColor: 'var(--danger-bd)' }}
                        onClick={async () => {
                          if (!confirmLegacy(
                            `Supprimer définitivement ${selected.size} produit${selected.size > 1 ? 's' : ''} sélectionné${selected.size > 1 ? 's' : ''} ?\n\n` +
                            `Cette action est irréversible. Les liaisons avec les recettes seront aussi perdues.`
                          )) return;
                          let ok = 0;
                          let errors = 0;
                          for (const prodId of selected) {
                            try {
                              await legacySB.db.deleteProduit(prodId);
                              ok++;
                            } catch (err) {
                              console.error('[deleteProduit]', prodId, err);
                              errors++;
                            }
                          }
                          setSelected(new Set());
                          if (errors > 0) {
                            notifyLegacy(`${ok} produit(s) supprimé(s), ${errors} en erreur (voir console).`, 'warning');
                          } else {
                            notifyLegacy(`✓ ${ok} produit${ok > 1 ? 's' : ''} supprimé${ok > 1 ? 's' : ''}.`, 'success');
                          }
                        }}
                        title="Supprimer définitivement les produits sélectionnés"
                      >
                        🗑 Supprimer
                      </button>
                      <button
                        style={{ ...cat.miniBtn, color: 'var(--text2)' }}
                        onClick={() => setSelected(new Set())}
                      >
                        Désélectionner
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div style={cat.tableWrap}>
                <table style={cat.table}>
                  <thead>
                    <tr>
                      {canWrite && <th style={{ ...cat.th, width: 36 }}></th>}
                      {['Produit', 'Référence', 'Catégorie', 'Fournisseur', 'Prix / unité', 'Unité', ''].map(h => (
                        <th key={h} style={cat.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(filtered || []).map(p => (
                      <tr key={p.id} style={{ ...cat.tr, background: selected.has(p.id) ? 'var(--accent-light)' : 'transparent' }}>
                        {canWrite && (
                          <td style={{ ...cat.td, width: 36 }}>
                            <input
                              type="checkbox"
                              checked={selected.has(p.id)}
                              onChange={e => {
                                const next = new Set(selected);
                                e.target.checked ? next.add(p.id) : next.delete(p.id);
                                setSelected(next);
                              }}
                              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--accent)' }}
                            />
                          </td>
                        )}
                        <td style={{ ...cat.td, fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.nom}>{p.nom}</td>
                        <td style={{ ...cat.td, fontFamily: 'monospace', fontSize: 11, color: 'var(--text2)' }}>{p.referenceFourn || '-'}</td>
                        <td style={cat.td}><span style={cat.catBadge}>{p.categorie}</span></td>
                        {/* Sélecteur fournisseur inline */}
                        <td style={cat.td}>
                          {canWrite ? (
                            <select
                              value={p.fournisseurId || ''}
                              onChange={async e => {
                                const fId = e.target.value || null;
                                try {
                                  await legacySB.db.upsertProduit({ ...p, fournisseurId: fId, etablissementId: etabId });
                                } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); }
                              }}
                              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'var(--font)', background: 'var(--bg)', color: p.fournisseurId ? 'var(--text)' : 'var(--text2)', maxWidth: 160, cursor: 'pointer' }}
                            >
                              <option value="">Aucun</option>
                              {(fournisseurs || []).map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                            </select>
                          ) : (
                            p.fournisseurNom || <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>-</span>
                          )}
                        </td>
                        <td style={{ ...cat.td, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-serif)' }}>
                          {p.prixUnitaire > 0 ? `CHF ${p.prixUnitaire.toFixed(4)}` : <span style={{ color: 'var(--text2)' }}>-</span>}
                        </td>
                        <td style={{ ...cat.td, color: 'var(--text2)' }}>/{p.uniteRef}</td>
                        <td style={cat.tdAction}>
                          {canWrite && (
                            <>
                              <button style={cat.miniBtn} onClick={() => { setEditProd(p); setShowProdForm(true); }}>✎</button>
                              <button style={{ ...cat.miniBtn, color: 'var(--danger-strong)' }} onClick={() => deleteProd(p.id)}>🗑</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {activeTab === 'fournisseurs' && (
        <div style={cat.tableWrap}>
          {fournisseurs.length === 0 ? (
            <div style={cat.empty}>
              <div style={{ fontSize: 40, opacity: 0.3 }}>🏭</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>Aucun fournisseur</div>
            </div>
          ) : (
            <table style={cat.table}>
              <thead>
                <tr>
                  {['Nom', 'Contact', 'Téléphone', 'Email', 'Nb produits', ''].map(h => (
                    <th key={h} style={cat.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(fournisseurs || []).map(f => {
                  const nbProd = produits.filter(p => p.fournisseurId === f.id || p.fournisseurs?.some(pf => pf.fournisseurId === f.id)).length;
                  return (
                    <tr key={f.id} style={cat.tr}>
                      <td style={{ ...cat.td, fontWeight: 600 }}>{f.nom}</td>
                      <td style={cat.td}>{f.contact || '-'}</td>
                      <td style={cat.td}>{f.tel || '-'}</td>
                      <td style={cat.td}>{f.email || '-'}</td>
                      <td style={cat.td}><span style={cat.catBadge}>{nbProd} produit{nbProd > 1 ? 's' : ''}</span></td>
                      <td style={cat.tdAction}>
                        {canWrite && (
                          <>
                            <button style={cat.miniBtn} onClick={() => { setEditFourn(f); setShowFournForm(true); }}>✎</button>
                            <button style={{ ...cat.miniBtn, color: 'var(--danger-strong)' }} onClick={() => deleteFourn(f.id)}>🗑</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── Modal Produit ─── */}
      {showProdForm && (
        <ProduitForm
          prod={editProd}
          fournisseurs={fournisseurs}
          etabId={etabId}
          onSave={saveProd}
          onClose={() => setShowProdForm(false)}
        />
      )}

      {/* ─── Modal Fournisseur ─── */}
      {showFournForm && (
        <FournisseurForm
          fourn={editFourn}
          onSave={saveFourn}
          onClose={() => setShowFournForm(false)}
        />
      )}

      {/* ─── Modal Prévisualisation Import ─── */}
      {importReport && (
        <ImportPreviewModal
          report={importReport}
          importing={importing}
          onCancel={() => setImportReport(null)}
          onConfirmSafe={() => confirmImport('safe')}
          onConfirmAll={() => confirmImport('all')}
        />
      )}

      {/* ─── Modal Import IA ─── */}
      {showAiImport && (
        <CatalogueAiImporter
          etabId={etabId}
          existingProduits={produits}
          fournisseurs={fournisseurs}
          onClose={() => setShowAiImport(false)}
        />
      )}

    </div>
  );
};

const ALLERGENES_OPTIONS = [
  { id: 'gluten', label: 'Gluten', emoji: '🌾' },
  { id: 'lactose', label: 'Lactose', emoji: '🥛' },
  { id: 'oeufs', label: 'Œufs', emoji: '🥚' },
  { id: 'poissons', label: 'Poissons', emoji: '🐟' },
  { id: 'crustaces', label: 'Crustacés', emoji: '🦐' },
  { id: 'fruits_coque', label: 'Fruits à coque', emoji: '🥜' },
  { id: 'sulfites', label: 'Sulfites', emoji: '🍷' },
  { id: 'arachides', label: 'Arachides', emoji: '🥜' },
  { id: 'soja', label: 'Soja', emoji: '🫘' },
  { id: 'celeri', label: 'Céleri', emoji: '🥬' },
  { id: 'moutarde', label: 'Moutarde', emoji: '🌻' },
  { id: 'sesame', label: 'Sésame', emoji: '🌿' },
  { id: 'mollusques', label: 'Mollusques', emoji: '🦑' },
  { id: 'lupin', label: 'Lupin', emoji: '🌱' },
];

// ─── Formulaire Produit ───
const ProduitForm = ({ prod, fournisseurs, etabId, onSave, onClose }) => {
  const legacySB = dbService.getBridge();
  const [form, setForm] = React.useState(prod || {
    nom: '', categorie: 'Épicerie sèche', sousCategorie: '', uniteRef: 'g',
    prixUnitaire: '', fournisseurId: '', referenceFourn: '', conditionnement: '',
    notes: '', actif: true, allergenes: [],
  });
  const [pfRows, setPfRows] = React.useState(prod?.fournisseurs || []);
  const [showAddPF, setShowAddPF] = React.useState(false);
  const [newPF, setNewPF] = React.useState({ fournisseurId: '', prixAchat: '', conditionnement: '', quantiteCond: '', uniteCond: 'g', estPrincipal: false, reference: '' });
  const [saving, setSaving] = React.useState(false);

  const up = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addPF = async () => {
    if (!newPF.fournisseurId || !newPF.prixAchat) { alertLegacy('Sélectionnez un fournisseur et renseignez un prix.'); return; }
    const pf = { ...newPF, produitId: prod?.id };
    if (prod?.id && legacySB) {
      try {
        await legacySB.db.upsertProduitFournisseur({ ...pf, produitId: prod.id });
        // rechargement via realtime
      } catch (err) { notifyLegacy('Erreur : ' + err.message, 'error'); return; }
    }
    setPfRows(prev => [...prev, { ...pf, id: 'tmp-' + Date.now(), fournisseurNom: fournisseurs.find(f => f.id === newPF.fournisseurId)?.nom || '' }]);
    setNewPF({ fournisseurId: '', prixAchat: '', conditionnement: '', quantiteCond: '', uniteCond: 'g', estPrincipal: false, reference: '' });
    setShowAddPF(false);
  };

  const handleSave = async () => {
    if (!form.nom.trim()) { alertLegacy('Le nom est obligatoire.'); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="modal-full-overlay" style={cat.overlay} onClick={onClose}>
      <div className="modal-full" style={cat.modal} onClick={e => e.stopPropagation()}>
        <div style={cat.modalHead}>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-serif)' }}>
            {prod ? 'Modifier' : 'Nouveau'} produit
          </div>
          <button style={cat.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={cat.modalBody}>
          {/* Infos de base */}
          <div style={cat.row2}>
            <div>
              <label style={cat.lbl}>Nom *</label>
              <input style={cat.inp} value={form.nom} onChange={e => up('nom', e.target.value)} placeholder="Gambas entières fraîches" />
            </div>
            <div>
              <label style={cat.lbl}>Catégorie</label>
              <select style={cat.inp} value={form.categorie} onChange={e => up('categorie', e.target.value)}>
                {CATEGORIES_PRODUITS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={cat.row3}>
            <div>
              <label style={cat.lbl}>Unité de référence</label>
              <select style={cat.inp} value={form.uniteRef} onChange={e => up('uniteRef', e.target.value)}>
                {UNITES_REF.map(u => <option key={u.val} value={u.val}>{u.label}</option>)}
              </select>
            </div>
            <div>
              <label style={cat.lbl}>Prix unitaire (CHF / unité)</label>
              <input style={cat.inp} type="number" step="0.0001" value={form.prixUnitaire} onChange={e => up('prixUnitaire', e.target.value)} placeholder="ex: 0.0285 CHF/g" />
            </div>
            <div>
              <label style={cat.lbl}>Conditionnement</label>
              <input style={cat.inp} value={form.conditionnement} onChange={e => up('conditionnement', e.target.value)} placeholder="Carton 5kg" />
            </div>
          </div>
          <div style={cat.row2}>
            <div>
              <label style={cat.lbl}>Fournisseur principal</label>
              <select style={cat.inp} value={form.fournisseurId} onChange={e => up('fournisseurId', e.target.value)}>
                <option value="">Aucun</option>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={cat.lbl}>Référence fournisseur</label>
              <input style={cat.inp} value={form.referenceFourn} onChange={e => up('referenceFourn', e.target.value)} placeholder="REF-123" />
            </div>
          </div>
          <div>
            <label style={cat.lbl}>Notes</label>
            <textarea style={{ ...cat.inp, resize: 'vertical' }} rows={2} value={form.notes} onChange={e => up('notes', e.target.value)} />
          </div>

          {/* Allergènes */}
          <div>
            <label style={cat.lbl}>Allergènes contenus dans ce produit</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {ALLERGENES_OPTIONS.map(a => {
                const active = (form.allergenes || []).includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    style={{
                      padding: '4px 10px', borderRadius: 14, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'var(--font)', border: '1px solid',
                      background: active ? 'var(--warning-bg)' : 'var(--bg)',
                      borderColor: active ? 'var(--warning-strong)' : 'var(--border)',
                      color: active ? 'var(--warning-text)' : 'var(--text2)',
                    }}
                    onClick={() => up('allergenes', active
                      ? (form.allergenes || []).filter(x => x !== a.id)
                      : [...(form.allergenes || []), a.id]
                    )}
                  >
                    {a.emoji} {a.label}
                  </button>
                );
              })}
            </div>
            {(form.allergenes || []).length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--warning-text)', marginTop: 6, fontWeight: 600 }}>
                ⚠ {(form.allergenes || []).length} allergène{(form.allergenes || []).length > 1 ? 's' : ''} sélectionné{(form.allergenes || []).length > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Fournisseurs multiples (uniquement si le produit existe déjà) */}
          {prod?.id && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ ...cat.lbl, margin: 0 }}>Fournisseurs & prix alternatifs</label>
                <button style={cat.miniLink} onClick={() => setShowAddPF(true)}>+ Ajouter</button>
              </div>
              {pfRows.length > 0 && (
                <table style={{ ...cat.table, fontSize: 11, marginBottom: 6 }}>
                  <thead><tr>
                    <th style={cat.th}>Fournisseur</th><th style={cat.th}>Prix achat</th>
                    <th style={cat.th}>Conditionnement</th><th style={cat.th}>Prix/unité</th>
                    <th style={cat.th}>Principal</th>
                  </tr></thead>
                  <tbody>
                    {(pfRows || []).map(pf => (
                      <tr key={pf.id} style={cat.tr}>
                        <td style={cat.td}>{pf.fournisseurNom}</td>
                        <td style={cat.td}>CHF {pf.prixAchat}</td>
                        <td style={cat.td}>{pf.conditionnement || '-'}</td>
                        <td style={{ ...cat.td, fontWeight: 600, color: 'var(--accent)' }}>
                          {pf.prixUnitaire ? `${parseFloat(pf.prixUnitaire).toFixed(4)}` : '-'}
                        </td>
                        <td style={cat.td}>{pf.estPrincipal ? '⭐' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {showAddPF && (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 6 }}>
                  <div style={cat.row3}>
                    <div>
                      <label style={cat.lbl}>Fournisseur</label>
                      <select style={cat.inp} value={newPF.fournisseurId} onChange={e => setNewPF(p => ({ ...p, fournisseurId: e.target.value }))}>
                        <option value="">Choisir…</option>
                        {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={cat.lbl}>Prix achat (CHF)</label>
                      <input style={cat.inp} type="number" step="0.01" value={newPF.prixAchat} onChange={e => setNewPF(p => ({ ...p, prixAchat: e.target.value }))} />
                    </div>
                    <div>
                      <label style={cat.lbl}>Qté conditionnement</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input style={{ ...cat.inp, flex: 2 }} type="number" step="0.001" value={newPF.quantiteCond} onChange={e => setNewPF(p => ({ ...p, quantiteCond: e.target.value }))} placeholder="5" />
                        <select style={{ ...cat.inp, flex: 1 }} value={newPF.uniteCond} onChange={e => setNewPF(p => ({ ...p, uniteCond: e.target.value }))}>
                          {['g','kg','ml','L','pcs','cs'].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <input type="checkbox" checked={newPF.estPrincipal} onChange={e => setNewPF(p => ({ ...p, estPrincipal: e.target.checked }))} />
                      Fournisseur principal
                    </label>
                    <button style={cat.ghostBtn} onClick={() => setShowAddPF(false)}>Annuler</button>
                    <button style={{ ...cat.btn, background: 'var(--accent)', color: '#fff', border: 'none' }} onClick={addPF}>Ajouter</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={cat.modalFoot}>
          <button style={cat.ghostBtn} onClick={onClose}>Annuler</button>
          <button style={{ ...cat.btn, background: 'var(--accent)', color: '#fff', border: 'none', opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Enregistrement…' : prod ? 'Modifier' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Formulaire Fournisseur ───
const FournisseurForm = ({ fourn, onSave, onClose }) => {
  const [form, setForm] = React.useState(fourn || { nom: '', contact: '', tel: '', email: '', adresse: '', notes: '', actif: true });
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = async () => {
    if (!form.nom.trim()) { alertLegacy('Le nom est obligatoire.'); return; }
    await onSave(form);
  };
  return (
    <div className="modal-full-overlay" style={cat.overlay} onClick={onClose}>
      <div className="modal-full" style={{ ...cat.modal, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={cat.modalHead}>
          <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-serif)' }}>{fourn ? 'Modifier' : 'Nouveau'} fournisseur</div>
          <button style={cat.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={cat.modalBody}>
          <label style={cat.lbl}>Nom *</label>
          <input style={cat.inp} value={form.nom} onChange={e => up('nom', e.target.value)} placeholder="Metro, Transgourmet, …" />
          <div style={cat.row2}>
            <div><label style={cat.lbl}>Contact</label><input style={cat.inp} value={form.contact} onChange={e => up('contact', e.target.value)} /></div>
            <div><label style={cat.lbl}>Téléphone</label><input style={cat.inp} value={form.tel} onChange={e => up('tel', e.target.value)} /></div>
          </div>
          <label style={cat.lbl}>Email</label>
          <input style={cat.inp} type="email" value={form.email} onChange={e => up('email', e.target.value)} />
          <label style={cat.lbl}>Adresse</label>
          <input style={cat.inp} value={form.adresse} onChange={e => up('adresse', e.target.value)} />
          <label style={cat.lbl}>Notes</label>
          <textarea style={{ ...cat.inp, resize: 'vertical' }} rows={2} value={form.notes} onChange={e => up('notes', e.target.value)} />
        </div>
        <div style={cat.modalFoot}>
          <button style={cat.ghostBtn} onClick={onClose}>Annuler</button>
          <button style={{ ...cat.btn, background: 'var(--accent)', color: '#fff', border: 'none' }} onClick={handleSave}>
            {fourn ? 'Modifier' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Styles ───
const cat = {
  root: { display: 'flex', flexDirection: 'column', gap: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  sub: { fontSize: 13, color: 'var(--text2)', marginTop: 4 },
  btn: { padding: '8px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' },
  ghostBtn: { padding: '8px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' },
  tabs: { display: 'flex', gap: 6, borderBottom: '2px solid var(--border)', paddingBottom: 0 },
  tab: { padding: '8px 16px', background: 'none', border: 'none', borderBottom: '2px solid transparent', marginBottom: -2, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, color: 'var(--text2)' },
  tabActive: { borderBottomColor: 'var(--accent)', color: 'var(--accent)' },
  // Une seule ligne : loupe + onglets de catégories qui coulissent.
  filters: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' },
  filterBtn: { padding: '5px 12px', borderRadius: 16, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  filterActive: { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' },
  tableWrap: { overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 },
  selectBar: { padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: '1px solid var(--border)', background: 'var(--bg)', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid var(--border)' },
  td: { padding: '9px 14px', verticalAlign: 'middle' },
  tdAction: { padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' },
  catBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent)', fontSize: 10, fontWeight: 600 },
  miniBtn: { width: 26, height: 26, border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg)', cursor: 'pointer', fontSize: 12 },
  miniLink: { background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 600 },
  empty: { padding: 60, textAlign: 'center', color: 'var(--text2)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  modal: { background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)' },
  modalBody: { padding: '16px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 },
  modalFoot: { padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text2)' },
  lbl: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
  inp: { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
};

// ─── Modale de prévisualisation d'import : doublons + prix aberrants ───
const ImportPreviewModal = ({ report, importing, onCancel, onConfirmSafe, onConfirmAll }) => {
  const [activeTab, setActiveTab] = React.useState('summary');
  const { newItems, duplicates, aberrants, totalScanned } = report;

  return (
    <div className="modal-full-overlay" style={ipm.overlay} onClick={onCancel}>
      <div className="modal-full" style={ipm.modal} onClick={e => e.stopPropagation()}>
        <div style={ipm.header}>
          <div>
            <div style={ipm.title}>📋 Prévisualisation de l'import</div>
            <div style={ipm.subtitle}>{totalScanned} ligne{totalScanned > 1 ? 's' : ''} analysée{totalScanned > 1 ? 's' : ''}</div>
          </div>
          <button style={ipm.closeBtn} onClick={onCancel}>✕</button>
        </div>

        {/* KPIs */}
        <div style={ipm.kpisRow}>
          <div style={{ ...ipm.kpiBox, borderColor: 'var(--success-strong)' }}>
            <div style={ipm.kpiLabel}>✓ Nouveaux</div>
            <div style={{ ...ipm.kpiValue, color: 'var(--success-strong)' }}>{newItems.length}</div>
          </div>
          <div style={{ ...ipm.kpiBox, borderColor: duplicates.length > 0 ? 'var(--warning-strong)' : 'var(--border)' }}>
            <div style={ipm.kpiLabel}>⚠ Doublons</div>
            <div style={{ ...ipm.kpiValue, color: duplicates.length > 0 ? 'var(--warning-strong)' : 'var(--text2)' }}>{duplicates.length}</div>
          </div>
          <div style={{ ...ipm.kpiBox, borderColor: aberrants.length > 0 ? 'var(--danger-strong)' : 'var(--border)' }}>
            <div style={ipm.kpiLabel}>🚫 Prix suspects</div>
            <div style={{ ...ipm.kpiValue, color: aberrants.length > 0 ? 'var(--danger-strong)' : 'var(--text2)' }}>{aberrants.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={ipm.tabsBar}>
          <button
            style={{ ...ipm.tab, ...(activeTab === 'summary' ? ipm.tabActive : {}) }}
            onClick={() => setActiveTab('summary')}
          >Résumé</button>
          {duplicates.length > 0 && (
            <button
              style={{ ...ipm.tab, ...(activeTab === 'duplicates' ? ipm.tabActive : {}) }}
              onClick={() => setActiveTab('duplicates')}
            >⚠ Doublons ({duplicates.length})</button>
          )}
          {aberrants.length > 0 && (
            <button
              style={{ ...ipm.tab, ...(activeTab === 'aberrants' ? ipm.tabActive : {}) }}
              onClick={() => setActiveTab('aberrants')}
            >🚫 Prix suspects ({aberrants.length})</button>
          )}
        </div>

        {/* Body selon l'onglet */}
        <div style={ipm.body}>
          {activeTab === 'summary' && (
            <div style={{ padding: '8px 4px' }}>
              <div style={ipm.summaryItem}>
                <span style={{ fontSize: 22 }}>✓</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{newItems.length} nouveaux produits prêts à être ajoutés</div>
                  <div style={ipm.summaryHint}>Aucun conflit détecté avec votre catalogue actuel.</div>
                </div>
              </div>
              {duplicates.length > 0 && (
                <div style={{ ...ipm.summaryItem, background: 'var(--warning-bg)', borderColor: 'var(--warning-bd)' }}>
                  <span style={{ fontSize: 22 }}>⚠</span>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--warning-text)' }}>{duplicates.length} doublon{duplicates.length > 1 ? 's' : ''} détecté{duplicates.length > 1 ? 's' : ''}</div>
                    <div style={ipm.summaryHint}>Ces produits existent déjà (même référence ou nom). Si vous importez "tout", ils seront <strong>écrasés</strong> par les nouvelles valeurs.</div>
                  </div>
                </div>
              )}
              {aberrants.length > 0 && (
                <div style={{ ...ipm.summaryItem, background: 'var(--danger-bg-soft)', borderColor: 'var(--danger-bd)' }}>
                  <span style={{ fontSize: 22 }}>🚫</span>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--danger-strong)' }}>{aberrants.length} prix suspect{aberrants.length > 1 ? 's' : ''}</div>
                    <div style={ipm.summaryHint}>Probablement un mauvais ratio prix/quantité dans la source. Vérifiez l'onglet "Prix suspects" avant d'importer.</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'duplicates' && (
            <div style={ipm.list}>
              {duplicates.map((p, i) => (
                <div key={i} style={ipm.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={ipm.rowName}>{p.nom}</div>
                    <div style={ipm.rowMeta}>
                      {p.intraDup ? (
                        <span style={{ color: 'var(--warning-strong)' }}>↔ Présent 2× dans le fichier</span>
                      ) : (
                        <>↔ Doublon (par {p._matchReason}) - existant : <strong>{p._existing?.nom}</strong> {p._existing?.prixUnitaire ? `· ${p._existing.prixUnitaire.toFixed(4)} CHF/${p._existing.uniteRef}` : ''}</>
                      )}
                    </div>
                    <div style={ipm.rowMeta}>
                      Nouveau prix : <strong>{p.prixUnitaire?.toFixed(4)} CHF/{p.uniteRef}</strong>
                      {p._existing?.prixUnitaire && p.prixUnitaire !== p._existing.prixUnitaire && (
                        <span style={{ marginLeft: 6, color: p.prixUnitaire > p._existing.prixUnitaire ? 'var(--danger-strong)' : 'var(--success-strong)', fontWeight: 600 }}>
                          {p.prixUnitaire > p._existing.prixUnitaire ? '↑' : '↓'} {Math.abs((p.prixUnitaire / p._existing.prixUnitaire - 1) * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'aberrants' && (
            <div style={ipm.list}>
              {aberrants.map((p, i) => (
                <div key={i} style={{ ...ipm.row, background: 'var(--danger-bg-soft)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={ipm.rowName}>{p.nom}</div>
                    <div style={{ ...ipm.rowMeta, color: 'var(--danger-strong)' }}>🚫 {p._reason}</div>
                    <div style={ipm.rowMeta}>
                      Catégorie : {p.categorie}
                      {p.referenceFourn && ` · réf ${p.referenceFourn}`}
                      {p.conditionnement && ` · ${p.conditionnement}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={ipm.footer}>
          <button style={ipm.ghostBtn} onClick={onCancel} disabled={importing}>Annuler</button>
          <div style={{ flex: 1 }}/>
          {(duplicates.length > 0 || aberrants.length > 0) && (
            <button
              style={{ ...ipm.ghostBtn, background: 'var(--warning-bg)', borderColor: 'var(--warning-bd)', color: 'var(--warning-text)' }}
              onClick={onConfirmAll}
              disabled={importing}
              title="Importer aussi les doublons (écrasement) et les prix suspects"
            >
              {importing ? '⏳…' : `Tout importer (${newItems.length + duplicates.length + aberrants.length})`}
            </button>
          )}
          <button
            style={ipm.primaryBtn}
            onClick={onConfirmSafe}
            disabled={importing || newItems.length === 0}
          >
            {importing ? '⏳ Import…' : `✓ Importer ${newItems.length} nouveau${newItems.length > 1 ? 'x' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

const ipm = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 },
  modal: { background: 'var(--surface)', borderRadius: 12, width: 720, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' },
  header: { padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' },
  subtitle: { fontSize: 11, color: 'var(--text2)', marginTop: 2 },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' },
  kpisRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: '14px 20px' },
  kpiBox: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' },
  kpiLabel: { fontSize: 10, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-serif)', marginTop: 4 },
  tabsBar: { display: 'flex', gap: 4, padding: '0 20px', borderBottom: '1px solid var(--border)' },
  tab: { padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12, color: 'var(--text2)', borderBottom: '2px solid transparent' },
  tabActive: { color: 'var(--accent)', borderBottomColor: 'var(--accent)', fontWeight: 600 },
  body: { flex: 1, overflowY: 'auto', padding: '6px 20px' },
  summaryItem: { display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, marginBottom: 8, background: 'var(--success-bg-soft)', border: '1px solid var(--success-bd)', borderRadius: 8 },
  summaryHint: { fontSize: 11, color: 'var(--text2)', marginTop: 4, lineHeight: 1.4 },
  list: { paddingTop: 4 },
  row: { padding: '10px 12px', borderBottom: '1px solid var(--border)' },
  rowName: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  rowMeta: { fontSize: 11, color: 'var(--text2)', marginTop: 3 },
  footer: { padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  primaryBtn: { padding: '9px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600 },
  ghostBtn: { padding: '8px 14px', background: 'none', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13 },
};

export default Catalogue;
