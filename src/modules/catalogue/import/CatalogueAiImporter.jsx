import React from 'react';
import * as XLSX from 'xlsx';
import { notifyLegacy } from '../../../legacy/legacyApi.js';
import { dbService } from '../../../services/dbService.js';
import CatalogueImportPreview from './CatalogueImportPreview.jsx';

// ═══════════════════════════════════════════════════════════════
// CatalogueAiImporter — import de catalogue produits assisté par IA.
//
// L'IA lit un fichier fournisseur brut (Excel/CSV, formats variables),
// en extrait des produits structurés ET signale les anomalies. Un
// contrôle local complète la vérification (doublons / prix aberrants).
// L'utilisateur relit et corrige avant l'insertion par lots.
// ═══════════════════════════════════════════════════════════════

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

// Convertit un fichier (Excel, CSV ou PDF) en texte brut pour l'IA.
async function fileToRows(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    return await file.text();
  }
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const { pdfToText } = await import('./pdfText.js');
    const { text, scanned } = await pdfToText(await file.arrayBuffer());
    if (scanned) {
      throw new Error('PDF scanné (image) — sélectionnez un PDF avec du texte sélectionnable, ou un fichier Excel/CSV.');
    }
    return text;
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(data, { type: 'array' });
  const parts = [];
  wb.SheetNames.forEach((sn) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn] || {});
    if (csv && csv.trim()) parts.push(`# Feuille : ${sn}\n${csv}`);
  });
  return parts.join('\n\n');
}

const CatalogueAiImporter = ({ etabId, existingProduits = [], onClose, onImported }) => {
  const legacySB = dbService.getBridge();
  const [step, setStep] = React.useState('pick'); // pick | parsing | preview | inserting
  const [fileName, setFileName] = React.useState('');
  const [produits, setProduits] = React.useState([]);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const fileRef = React.useRef(null);

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

  // Ajoute les drapeaux locaux (doublon, prix aberrant) aux produits IA.
  // `_existing` = produit déjà au catalogue qui correspond ; `_dupAction`
  // = action choisie pour les doublons ('update' | 'create' | 'skip').
  const annotate = (p) => {
    const issues = [...(p.issues || [])];
    const refKey = (p.referenceFourn || '').trim().toLowerCase();
    const nameKey = normalizeName(p.nom);
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
    try {
      const rows = await fileToRows(file);
      if (!rows.trim()) {
        notifyLegacy('Fichier vide ou illisible.', 'error');
        setStep('pick');
        return;
      }
      const { parseCatalogue } = await import('../../../services/aiService.js');
      const { produits: parsed } = await parseCatalogue(rows);
      if (!parsed.length) {
        notifyLegacy('Aucun produit détecté par l\'IA dans ce fichier.', 'info');
        setStep('pick');
        return;
      }
      setProduits(parsed.map(annotate));
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
    if (onImported) onImported(saved);
    onClose();
  };

  const selectedCount = produits.filter(isImportable).length;
  const dupCount = produits.filter(p => p._existing).length;
  const flaggedCount = produits.filter(p => (p.issues || []).length > 0 || (p.confidence || 0) < 60).length;

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
              <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', maxWidth: 420 }}>
                Excel (.xlsx, .xls), CSV ou PDF — quel que soit le format des colonnes.
                L'IA extrait les produits, normalise les unités et signale les anomalies
                (prix suspects, doublons) avant l'ajout au catalogue.
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
                Extraction et vérification des produits. Cela peut prendre quelques secondes.
              </div>
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
                  : <span style={{ color: '#15803d' }}>aucune anomalie</span>}
              </div>
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
  pickZone: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 20px' },
  primaryBtn: { padding: '9px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', border: 'none', background: 'var(--accent)', color: '#fff', display: 'inline-block' },
  ghostBtn: { padding: '9px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)' },
  banner: { padding: '9px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' },
  progressTrack: { width: 'min(360px,80vw)', height: 10, background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' },
  progressFill: { height: '100%', background: 'var(--accent)', transition: 'width 0.2s' },
};

export default CatalogueAiImporter;
