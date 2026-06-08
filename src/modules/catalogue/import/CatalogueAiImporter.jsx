import React from 'react';
import { notifyLegacy, confirmLegacy } from '../../../legacy/legacyApi.js';
import { dbService } from '../../../services/dbService.js';
import CatalogueImportPreview from './CatalogueImportPreview.jsx';

// ═══════════════════════════════════════════════════════════════
// CatalogueAiImporter — import de catalogue produits assisté par IA.
//
// L'IA lit un fichier fournisseur brut (Excel/CSV/PDF, formats variables),
// en extrait des produits structurés ET signale les anomalies. Pour les
// gros fichiers, l'analyse se fait par LOTS successifs (chunks) afin que
// la totalité des lignes soit traitée. Un contrôle local complète la
// vérification (doublons / prix aberrants). L'utilisateur choisit le
// fournisseur, relit et corrige avant l'insertion par lots.
// ═══════════════════════════════════════════════════════════════

// Nombre de lignes de produits envoyées à l'IA par appel.
// 40 lignes max pour rester sous la limite de tokens et éviter les réponses tronquées.
const CHUNK_ROWS = 40;
// Appels IA menés en parallèle.
const PARSE_CONCURRENCY = 4;

// Les 14 catégories officielles du catalogue — doit être identique à CATEGORIES_PRODUITS (Catalogue.jsx).
const CATALOGUE_CATS = [
  'Viandes', 'Poissons & fruits de mer', 'Fruits & légumes',
  'Épicerie sèche', 'Produits laitiers', 'Crèmerie / fromages',
  'Boulangerie / pâtisserie', 'Boissons', 'Alcools',
  'Surgelés', 'Condiments / sauces', 'Herbes / épices',
  'Hygiène / non alimentaire', 'Autres',
];

// Normalise la catégorie renvoyée par l'IA vers une des 14 catégories officielles.
// L'IA peut répondre "Légumes", "Viandes", "Crémerie"… ce filtre corrige.
function normalizeCategory(raw) {
  const n = (raw || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (!n) return 'Autres';
  const exact = CATALOGUE_CATS.find(c =>
    c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === n
  );
  if (exact) return exact;
  // Viandes — avant fromage/cremerie pour éviter les faux positifs
  if (/viande|boucherie|boeuf|veau|porc|agneau|gibier|volaille|poulet|canard|dinde|lapin/.test(n)) return 'Viandes';
  // Poissons & fruits de mer
  if (/poisson|maree|saumon|thon|cabillaud|sole|dorade|truite|fruit.?de.?mer|crevette|moule|huitre|homard|langoustine/.test(n)) return 'Poissons & fruits de mer';
  // Fruits & légumes
  if (/legume|fruit|tomate|carotte|pomme.?de.?terre|salade|oignon|courgette|epinard|champignon/.test(n)) return 'Fruits & légumes';
  // Crèmerie / fromages — fromage avant lait pour éviter "fromage blanc" → Produits laitiers
  if (/fromage|comte|gruyere|emmental|roquefort|brie|camembert|parmesan|mozzarella|cremerie/.test(n)) return 'Crèmerie / fromages';
  // Produits laitiers
  if (/lait|creme|beurre|yaourt|serac|mascarpone|ricotta/.test(n)) return 'Produits laitiers';
  // Boulangerie / pâtisserie
  if (/boulangerie|patisserie|pain|viennoiserie|gateau|tarte|croissant|brioche|biscuit/.test(n)) return 'Boulangerie / pâtisserie';
  // Alcools — vin, bière, spiritueux
  if (/\bvin\b|champagne|whisky|cognac|rhum|vodka|gin|porto|liqueur|spiritueux|alcool|biere/.test(n)) return 'Alcools';
  // Boissons sans alcool
  if (/boisson|eau|jus|soda|sirop|\bthe\b|cafe|infusion/.test(n)) return 'Boissons';
  // Surgelés
  if (/surgele|congele|glace/.test(n)) return 'Surgelés';
  // Condiments / sauces
  if (/condiment|sauce|moutarde|ketchup|vinaigre|curry|paprika|cumin|poivre|piment/.test(n)) return 'Condiments / sauces';
  // Herbes / épices
  if (/epice|herbe|basilic|thym|romarin|persil|coriandre|laurier|menthe/.test(n)) return 'Herbes / épices';
  // Hygiène / non alimentaire
  if (/hygiene|nonfood|detergent|savon|desinfectant|emballage|materiel/.test(n)) return 'Hygiène / non alimentaire';
  // Épicerie sèche (fallback large)
  if (/epicerie|farine|pate|riz|sucre|bouillon|conserve|lentille|semoule|polenta/.test(n)) return 'Épicerie sèche';
  return 'Autres';
}

// Déduit la catégorie probable à partir du nom de la feuille Excel.
// Sert d'indice de contexte passé à l'IA dans l'en-tête de chaque lot.
function categoryFromSheetName(sheetName) {
  const n = (sheetName || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/viande|boucherie|boeuf|veau|porc|agneau|gibier|volaille|poulet|metzgerei/.test(n)) return 'Viandes';
  if (/poisson|maree|fischerei|seafood/.test(n)) return 'Poissons & fruits de mer';
  if (/legume|fruit|fruchte|gemuse|maraicher/.test(n)) return 'Fruits & légumes';
  if (/cremerie|fromage|molkerei/.test(n)) return 'Crèmerie / fromages';
  if (/laitier|dairy/.test(n)) return 'Produits laitiers';
  if (/boulangerie|patisserie|pain|backwaren|viennoiserie/.test(n)) return 'Boulangerie / pâtisserie';
  if (/alcool|\bvin\b|vins|wein|spiritueux|spirituosen|champagne|biere|bier/.test(n)) return 'Alcools';
  if (/boisson|getranke|soda|jus/.test(n)) return 'Boissons';
  if (/surgele|congele|frozen/.test(n)) return 'Surgelés';
  if (/condiment|sauce|vinaigre/.test(n)) return 'Condiments / sauces';
  if (/epice|herbe|gewurz/.test(n)) return 'Herbes / épices';
  if (/hygiene|nonfood|nearfood|detergent|emballage|non.alimentaire/.test(n)) return 'Hygiène / non alimentaire';
  if (/epicerie|alimentation|food\b|sec\b/.test(n)) return 'Épicerie sèche';
  return 'Autres';
}

// Normalise un nom pour comparaison (minuscule, sans accents/ponctuation).
const normalizeName = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// Détecte un prix unitaire aberrant — renvoie un libellé ou null.
const detectAberrantPrice = (prix, uniteRef) => {
  if (prix == null || isNaN(prix)) return 'prix manquant';
  if (prix <= 0) return 'prix nul';
  if (uniteRef === 'g' || uniteRef === 'ml') {
    if (prix < 0.00001) return 'prix très bas — vérifier l\'unité';
    if (prix > 10) return 'prix très élevé — vérifier l\'unité';
  }
  if (uniteRef === 'pcs') {
    if (prix < 0.05) return 'prix très bas — vérifier';
    if (prix > 10000) return 'prix très élevé — vérifier';
  }
  return null;
};

// Découpe une liste de lignes en lots, chaque lot préfixé d'un en-tête
// de contexte (titres de colonnes) pour que l'IA comprenne la structure.
function chunkLines(header, rows) {
  // Filtre les lignes vides OU entièrement composées de séparateurs/espaces (" | | | ").
  const clean = rows.map(r => String(r || '').trim()).filter(l => l.replace(/[\s|]/g, '').length > 0);
  const out = [];
  for (let i = 0; i < clean.length; i += CHUNK_ROWS) {
    const part = clean.slice(i, i + CHUNK_ROWS);
    out.push((header ? header + '\n' : '') + part.join('\n'));
  }
  return out;
}

// Convertit un fichier (Excel, CSV ou PDF) en lots de texte pour l'IA.
// Renvoie { chunks: string[], stats: SheetStat[] }.
// Correction clé : les 2 premières lignes d'une feuille (titre + colonnes) sont placées
// UNIQUEMENT dans l'en-tête de contexte (répété en préfixe de chaque lot) — elles ne
// sont PAS renvoyées une seconde fois dans les données, ce qui évitait la duplication.
async function fileToChunks(file) {
  const name = (file.name || '').toLowerCase();
  const toLine = (r) => (Array.isArray(r) ? r : []).map(c => (c == null ? '' : String(c))).join(' | ');

  if (name.endsWith('.csv') || file.type === 'text/csv') {
    const lines = (await file.text()).split(/\r?\n/);
    const header = lines[0] || '';
    const data = lines.slice(1);
    const chunks = chunkLines(header, data);
    return {
      chunks,
      stats: [{ sheet: 'CSV', rowsTotal: lines.length, rowsData: data.length, chunks: chunks.length, skipped: false, catHint: 'Autres' }],
    };
  }

  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const { pdfToText } = await import('./pdfText.js');
    const { text, scanned } = await pdfToText(await file.arrayBuffer());
    if (scanned) {
      throw new Error('PDF scanné (image) — sélectionnez un PDF avec du texte sélectionnable, ou un fichier Excel/CSV.');
    }
    const lines = text.split(/\r?\n/);
    const chunks = chunkLines('', lines);
    return {
      chunks,
      stats: [{ sheet: 'PDF', rowsTotal: lines.length, rowsData: lines.length, chunks: chunks.length, skipped: false, catHint: 'Autres' }],
    };
  }

  // ── Excel / XLS ──
  const XLSX = await import('xlsx'); // chargé à la demande (hors bundle du module)
  const buf = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'array' });
  const chunks = [];
  const stats = [];

  wb.SheetNames.forEach((sn) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn] || {}, { header: 1, blankrows: false });
    if (!rows.length) {
      stats.push({ sheet: sn, rowsTotal: 0, rowsData: 0, chunks: 0, skipped: true, catHint: 'Autres' });
      return;
    }

    // Catégorie déduite du nom de la feuille → indice de contexte pour l'IA
    const catHint = categoryFromSheetName(sn);

    // En-tête de contexte : nom de feuille + catégorie suggérée + 2 premières lignes
    const headerParts = [`# Feuille : ${sn}`];
    if (catHint !== 'Autres') headerParts.push(`# Catégorie suggérée : ${catHint}`);
    rows.slice(0, 2).forEach(r => headerParts.push(toLine(r)));
    const ctxHeader = headerParts.join('\n');

    // Données : à partir de la ligne 2 pour éviter de dupliquer les en-têtes déjà dans ctxHeader.
    const dataLines = rows.slice(2).map(toLine);
    const sheetChunks = chunkLines(ctxHeader, dataLines);
    chunks.push(...sheetChunks);

    stats.push({
      sheet: sn,
      rowsTotal: rows.length,
      rowsData: dataLines.length,
      chunks: sheetChunks.length,
      skipped: false,
      catHint,
    });
  });

  return { chunks, stats };
}

const CatalogueAiImporter = ({ etabId, existingProduits = [], fournisseurs = [], onClose }) => {
  const legacySB = dbService.getBridge();
  const [step, setStep] = React.useState('pick'); // pick | parsing | preview | inserting
  const [fileName, setFileName] = React.useState('');
  const [fournisseurId, setFournisseurId] = React.useState('');
  const [produits, setProduits] = React.useState([]);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const fileRef = React.useRef(null);
  const cancelRef = React.useRef(false);
  const [fileStats, setFileStats] = React.useState(null);   // statistiques par feuille
  const [parseErrors, setParseErrors] = React.useState(0);  // lots IA ayant échoué

  // Index des produits déjà au catalogue (référence + nom normalisé).
  const existIndex = React.useMemo(() => {
    const byRef = new Map();
    const byName = new Map();
    (existingProduits || []).forEach((p) => {
      const ref = (p.referenceFourn || '').trim().toLowerCase();
      if (ref) byRef.set(ref, p);
      const n = normalizeName(p.nom);
      if (n) byName.set(n, p);
    });
    return { byRef, byName };
  }, [existingProduits]);

  // Ajoute les drapeaux locaux (doublon, prix aberrant, _tempId) aux produits IA.
  const annotate = (p, idx = 0) => {
    const issues = [...(p.issues || [])];
    const refKey = (p.referenceFourn || '').trim().toLowerCase();
    const nameKey = normalizeName(p.nom);
    // Normalise la catégorie IA vers les catégories officielles.
    const categorie = normalizeCategory(p.categorie);
    const existing = (refKey && existIndex.byRef.get(refKey))
      || (nameKey && existIndex.byName.get(nameKey))
      || null;
    if (existing && !issues.some(i => i.toLowerCase().includes('doublon') || i.toLowerCase().includes('catalogue'))) {
      issues.push('déjà au catalogue');
    }
    const ab = detectAberrantPrice(Number(p.prixUnitaire), p.uniteRef);
    if (ab && !issues.some(i => i.toLowerCase().includes('prix'))) issues.push(ab);
    if (!p.nom) issues.push('nom manquant');
    return {
      ...p,
      categorie,
      _tempId: 'p' + idx + '-' + Math.random().toString(36).slice(2, 6),
      issues,
      _selected: !!p.nom,
      _existing: existing,
      _dupAction: existing ? 'update' : null,
    };
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (!legacySB) { notifyLegacy('Base de données indisponible.', 'error'); return; }
    setFileName(file.name);
    setStep('parsing');
    setProgress({ done: 0, total: 0 });
    cancelRef.current = false;
    try {
      const { chunks, stats } = await fileToChunks(file);
      setFileStats(stats || []);
      if (!chunks.length) {
        notifyLegacy('Fichier vide ou illisible — aucune donnée détectée.', 'error');
        setStep('pick');
        return;
      }
      // Gros fichier : on prévient avant de lancer de nombreux appels IA.
      if (chunks.length > 8 && !confirmLegacy(
        `Ce fichier est volumineux : l'IA l'analysera en ${chunks.length} lots `
        + `(~${chunks.length} appels IA, cela peut prendre quelques minutes).\n\n`
        + `Astuce : pour un fichier fournisseur déjà bien structuré, le bouton `
        + `« Importer Excel » classique est instantané et sans coût IA.\n\n`
        + `Lancer l'analyse IA ?`
      )) {
        setStep('pick');
        return;
      }
      const { parseCatalogue } = await import('../../../services/aiService.js');
      setProgress({ done: 0, total: chunks.length });
      setParseErrors(0);
      const all = [];
      let errCount = 0;
      for (let i = 0; i < chunks.length; i += PARSE_CONCURRENCY) {
        if (cancelRef.current) break;
        const batch = chunks.slice(i, i + PARSE_CONCURRENCY);
        const res = await Promise.allSettled(batch.map(c => parseCatalogue(c)));
        res.forEach((r) => {
          if (r.status === 'fulfilled') all.push(...(r.value.produits || []));
          else {
            errCount++;
            console.warn('[CatalogueAiImporter] lot IA en erreur :', r.reason);
          }
        });
        setProgress({ done: Math.min(i + PARSE_CONCURRENCY, chunks.length), total: chunks.length });
      }
      setParseErrors(errCount);
      if (!all.length) {
        notifyLegacy('Aucun produit détecté par l\'IA dans ce fichier.', 'info');
        setStep('pick');
        return;
      }
      if (cancelRef.current) {
        notifyLegacy(`Analyse interrompue — ${all.length} produit(s) déjà détecté(s).`, 'info');
      }
      setProduits(all.map((p, i) => annotate(p, i)));
      setStep('preview');
    } catch (err) {
      notifyLegacy('Import IA impossible : ' + (err.message || err), 'error');
      setStep('pick');
    }
  };

  // Un produit est importable s'il est coché, nommé, et non « ignoré ».
  const isImportable = (p) => !!p._selected && !!(p.nom || '').trim() && p._dupAction !== 'skip';

  const doImport = async () => {
    const toImport = produits.filter(isImportable);
    if (!toImport.length) { notifyLegacy('Aucun produit sélectionné.', 'info'); return; }
    setStep('inserting');
    setProgress({ done: 0, total: toImport.length });
    let saved = 0;
    let errors = 0;
    for (let i = 0; i < toImport.length; i += 10) {
      const batch = toImport.slice(i, i + 10);
      const res = await Promise.allSettled(batch.map((p) => {
        const payload = {
          nom: p.nom.trim(),
          categorie: p.categorie || 'Autres',
          uniteRef: p.uniteRef || 'g',
          conditionnement: p.conditionnement || '',
          prixUnitaire: Number(p.prixUnitaire) || 0,
          referenceFourn: p.referenceFourn || '',
          fournisseurId: fournisseurId || null,
          etablissementId: etabId,
          actif: true,
        };
        // Mise à jour du produit existant uniquement si l'action est « update ».
        if (p._existing && p._dupAction === 'update') payload.id = p._existing.id;
        return legacySB.db.upsertProduit(payload);
      }));
      res.forEach((r) => { if (r.status === 'fulfilled') saved += 1; else errors += 1; });
      setProgress({ done: Math.min(i + 10, toImport.length), total: toImport.length });
    }
    notifyLegacy(
      `✓ Import IA terminé : ${saved} produit(s)${errors ? ` · ${errors} en erreur` : ''}.`,
      errors ? 'warning' : 'success',
    );
    onClose();
  };

  const selectedCount = produits.filter(isImportable).length;
  const dupCount = produits.filter(p => p._existing).length;
  const flaggedCount = produits.filter(p => (p.issues || []).length > 0 || (p.confidence || 0) < 60).length;
  const fournisseurNom = (fournisseurs.find(f => f.id === fournisseurId) || {}).nom || '';

  return (
    <div style={st.overlay} onClick={step === 'preview' || step === 'pick' ? onClose : undefined}>
      <div style={st.modal} onClick={e => e.stopPropagation()}>
        <div style={st.head}>
          <div>
            <div style={st.title}>✨ Import catalogue assisté par IA</div>
            <div style={st.sub}>
              {fileName ? fileName : 'L\'IA lit n\'importe quel fichier fournisseur et vérifie chaque ligne.'}
            </div>
          </div>
          <button style={st.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={st.body}>
          {step === 'pick' && (
            <div style={st.pickZone}>
              <div style={{ fontSize: 40, opacity: 0.4 }}>📄</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                Choisir un fichier fournisseur
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', maxWidth: 440 }}>
                Excel (.xlsx, .xls), CSV ou PDF — quel que soit le format des colonnes.
                Les gros fichiers sont analysés par lots pour traiter toutes les lignes.
              </div>

              {/* Choix du fournisseur appliqué à tous les produits importés */}
              <div style={{ width: 'min(360px,90%)' }}>
                <label style={st.fieldLabel}>Fournisseur de ce fichier</label>
                <select
                  style={st.select}
                  value={fournisseurId}
                  onChange={e => setFournisseurId(e.target.value)}
                >
                  <option value="">— Aucun fournisseur —</option>
                  {(fournisseurs || []).map(f => (
                    <option key={f.id} value={f.id}>{f.nom}</option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                  Appliqué à tous les produits importés depuis ce fichier.
                </div>
              </div>

              <label style={st.primaryBtn}>
                Sélectionner un fichier
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf"
                  style={{ display: 'none' }}
                  onChange={handleFile}
                />
              </label>
            </div>
          )}

          {step === 'parsing' && (
            <div style={st.pickZone}>
              <div style={{ fontSize: 36 }}>⏳</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                Analyse du fichier par l'IA…
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                {progress.total > 0
                  ? `Lot ${progress.done} / ${progress.total}`
                  : 'Préparation des lots…'}
              </div>
              {progress.total > 0 && (
                <div style={st.progressTrack}>
                  <div style={{ ...st.progressFill, width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
              )}
              <button style={st.ghostBtn} onClick={() => { cancelRef.current = true; }}>
                Interrompre
              </button>
            </div>
          )}

          {step === 'preview' && (
            <>
              <div style={st.banner}>
                <strong>{produits.length}</strong> produit(s) détecté(s) ·{' '}
                <strong>{selectedCount}</strong> à importer ·{' '}
                {dupCount > 0 && (
                  <span style={{ color: '#b45309' }}><strong>{dupCount}</strong> doublon(s) · </span>
                )}
                {flaggedCount > 0
                  ? <span style={{ color: '#b45309' }}><strong>{flaggedCount}</strong> ligne(s) à vérifier</span>
                  : <span style={{ color: 'var(--success-text)' }}>aucune anomalie</span>}
                {fournisseurNom && <span> · Fournisseur : <strong>{fournisseurNom}</strong></span>}
                {parseErrors > 0 && (
                  <span style={{ color: 'var(--danger-strong)' }}> · <strong>{parseErrors}</strong> lot(s) IA en erreur (voir console)</span>
                )}
              </div>
              {/* Diagnostique par feuille — affiché seulement si plusieurs feuilles */}
              {fileStats && fileStats.length > 1 && (
                <div style={st.sheetStats}>
                  {fileStats.map(s => (
                    <div key={s.sheet} style={{ ...st.sheetItem, ...(s.skipped ? st.sheetItemSkipped : {}) }}>
                      <span style={{ fontWeight: 600 }}>📄 {s.sheet}</span>
                      {s.skipped
                        ? <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>feuille vide — ignorée</span>
                        : <>
                            <span style={{ color: 'var(--text2)' }}>
                              {s.rowsData} ligne{s.rowsData !== 1 ? 's' : ''} · {s.chunks} lot{s.chunks !== 1 ? 's' : ''} IA
                            </span>
                            {s.catHint && s.catHint !== 'Autres' && (
                              <span style={st.catHintBadge}>{s.catHint}</span>
                            )}
                          </>
                      }
                    </div>
                  ))}
                </div>
              )}
              <CatalogueImportPreview produits={produits} onChange={setProduits} />
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                Les lignes surlignées portent une anomalie ou une confiance faible.
                Pour un produit déjà au catalogue, choisissez l'action : mettre à jour,
                créer quand même ou ignorer.
              </div>
            </>
          )}

          {step === 'inserting' && (
            <div style={st.pickZone}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                Ajout au catalogue…
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                {progress.done} / {progress.total} produit(s)
              </div>
              <div style={st.progressTrack}>
                <div style={{ ...st.progressFill, width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}
        </div>

        {step === 'preview' && (
          <div style={st.foot}>
            <button style={st.ghostBtn} onClick={onClose}>Annuler</button>
            <button
              style={{ ...st.primaryBtn, opacity: selectedCount ? 1 : 0.5, cursor: selectedCount ? 'pointer' : 'not-allowed' }}
              onClick={selectedCount ? doImport : undefined}
            >
              Importer {selectedCount} produit{selectedCount > 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const st = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  modal: { background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 980, maxHeight: '90vh', display: 'flex', flexDirection: 'column' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 18px', borderBottom: '1px solid var(--border)', gap: 12 },
  title: { fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  sub: { fontSize: 12, color: 'var(--text2)', marginTop: 3 },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text2)' },
  body: { padding: '16px 18px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 },
  foot: { padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' },
  pickZone: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 20px' },
  fieldLabel: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 },
  select: { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' },
  primaryBtn: { padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', border: 'none', background: 'var(--accent)', color: '#fff', display: 'inline-block' },
  ghostBtn: { padding: '9px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)' },
  banner: { padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' },
  progressTrack: { width: 'min(360px,80vw)', height: 10, background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' },
  progressFill: { height: '100%', background: 'var(--accent)', transition: 'width 0.2s' },
  // Diagnostique par feuille
  sheetStats: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  sheetItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text)' },
  sheetItemSkipped: { opacity: 0.55 },
  catHintBadge: { display: 'inline-block', padding: '1px 7px', borderRadius: 8, background: '#ede9fe', color: '#5b21b6', fontSize: 10, fontWeight: 600 },
};

export default CatalogueAiImporter;
