import React from 'react';
import * as XLSX from 'xlsx';
import { Btn } from '../../../components/ui/index.jsx';
import { notify } from '../../../components/toast/index.js';
import { parseWorkbook, buildFromMapping, FIELD_LABELS } from './ExcelImporter.js';
import ImportPreview, { isRecipeValid } from './ImportPreview.jsx';
import { getUnrecognizedUnits, resetUnrecognizedUnits } from './UnitParser.js';

const BATCH_SIZE = 10;

// Nettoie une recette importée -> payload accepté par upsertRecette.
function toRecettePayload(recipe, etabId, userId) {
  return {
    id: 'rec-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
    etablissementId: etabId,
    nom: String(recipe.nom || '').trim() || 'Recette importée',
    categorie: recipe.categorie || 'Plats',
    portions: Number(recipe.portions) || 4,
    prixVente: Number(recipe.prixVente) || 0,
    tempsPreparation: Number(recipe.tempsPreparation) || 0,
    tempsCuisson: Number(recipe.tempsCuisson) || 0,
    tempsTotal: (Number(recipe.tempsPreparation) || 0) + (Number(recipe.tempsCuisson) || 0),
    statut: 'brouillon',
    version: 1,
    allergenesIds: recipe.allergenesIds || [],
    notesConsultant: recipe.notesConsultant || '',
    dressage: recipe.dressage || '',
    conservation: recipe.conservation || '',
    modifie: new Date().toISOString().slice(0, 10),
    modifiePar: userId || null,
    ingredients: (recipe.ingredients || []).map((ing, i) => ({
      id: 'i' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 1000),
      nom: String(ing.nom || '').trim(),
      quantite: Number(ing.quantite) || 0,
      unite: ing.unite || 'g',
      prixUnit: Number(ing.prixUnit) || 0,
      categorie: ing.categorie || 'Autres',
      ...(ing.produitId ? { produitId: ing.produitId } : {}),
    })),
    etapes: (recipe.etapes || []).map(e => String(e || '').trim()).filter(Boolean),
  };
}

const overlay = {
  position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(20,16,12,0.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const panel = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
  width: 'min(860px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
  boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
};

// Modale d'import multiple de recettes (Excel / CSV / PDF).
// Props : etabId, legacySB, user, onClose, onImported
export default function ImportLauncher({ etabId, legacySB, user, onClose, onImported }) {
  const [step, setStep] = React.useState('choose'); // choose | mapping | preview | importing | done
  const [parsing, setParsing] = React.useState(false);
  const [parsingMsg, setParsingMsg] = React.useState('Lecture du fichier…');
  const [parseError, setParseError] = React.useState('');
  const [scannedPdf, setScannedPdf] = React.useState(false);
  const [recipes, setRecipes] = React.useState([]);
  const [mappingData, setMappingData] = React.useState(null);
  const [mapping, setMapping] = React.useState({});
  const [parseStats, setParseStats] = React.useState(null);
  const [progress, setProgress] = React.useState({ done: 0, total: 0, imported: 0, failed: 0 });
  // Récap par fichier après un import multiple (fichiers ignorés / en échec).
  const [fileNotes, setFileNotes] = React.useState([]);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef(null);
  const cancelRef = React.useRef(false);

  const reset = () => {
    setStep('choose'); setParseError(''); setScannedPdf(false);
    setRecipes([]); setMappingData(null); setMapping({}); setParseStats(null);
    setFileNotes([]);
  };

  // Détecte le type d'un fichier à partir de son extension / type MIME.
  const detectKind = (file) => {
    const name = String(file.name || '').toLowerCase();
    const type = String(file.type || '').toLowerCase();
    if (type.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif|gif|bmp|tiff?)$/.test(name)) return 'photo';
    if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')
        || type.includes('spreadsheet') || type.includes('excel') || type === 'text/csv') return 'excel';
    return 'unknown';
  };

  // ── Parsing : détection automatique du type + plusieurs fichiers d'un coup ──
  // Chaque fichier est lu selon son type, les recettes sont agrégées dans un
  // seul aperçu. Les fichiers en échec sont listés sans bloquer les autres.
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setParsing(true); setParseError(''); setScannedPdf(false);
    resetUnrecognizedUnits();

    const aggregated = [];
    const notes = [];
    let needsMappingResult = null; // Excel à mapper (seulement si fichier unique)
    let firstStats = null;
    let scannedCount = 0;
    const many = files.length > 1;

    for (let idx = 0; idx < files.length; idx += 1) {
      const file = files[idx];
      const kind = detectKind(file);
      setParsingMsg(
        many ? `Lecture ${idx + 1}/${files.length} · ${file.name}…`
          : (kind === 'photo' ? 'Analyse de la photo par l\'IA, quelques secondes…' : 'Lecture du fichier…'),
      );
      try {
        if (kind === 'excel') {
          const buf = await file.arrayBuffer();
          const result = await parseWorkbook(buf);
          if (result.stats && !firstStats) firstStats = result.stats;
          if (result.needsMapping) {
            if (!many) needsMappingResult = result;
            else notes.push(`${file.name} : colonnes non reconnues, à importer seul pour le mappage manuel.`);
          } else if (result.recipes && result.recipes.length) {
            aggregated.push(...result.recipes);
          } else {
            notes.push(`${file.name} : aucune recette détectée.`);
          }
        } else if (kind === 'pdf') {
          const { parsePdf } = await import('./PdfImporter.js'); // chargement à la demande
          const buf = await file.arrayBuffer();
          const result = await parsePdf(buf);
          if (result.scanned) {
            scannedCount += 1;
            notes.push(`${file.name} : PDF scanné (image), prends-en une photo pour la lecture IA.`);
          } else if (result.recipes && result.recipes.length) {
            aggregated.push(...result.recipes);
          } else {
            notes.push(`${file.name} : aucune recette détectée.`);
          }
        } else if (kind === 'photo') {
          const { ocrRecipe } = await import('../../../services/aiService.js');
          const result = await ocrRecipe(file);
          if (result.recipes && result.recipes.length) {
            aggregated.push(...result.recipes);
          } else {
            notes.push(`${file.name} : aucune recette détectée sur la photo.`);
          }
        } else {
          notes.push(`${file.name} : format non pris en charge.`);
        }
      } catch (err) {
        notes.push(`${file.name} : ${err.message || err}`);
      }
    }

    setParsing(false);
    setParsingMsg('Lecture du fichier…');

    // Fichier Excel unique sans recette exploitable mais avec colonnes à mapper.
    if (needsMappingResult && !aggregated.length) {
      if (firstStats) setParseStats(firstStats);
      setMappingData(needsMappingResult);
      setMapping(needsMappingResult.detected || {});
      setStep('mapping');
      return;
    }

    if (aggregated.length) {
      if (!many && firstStats) setParseStats(firstStats);
      setFileNotes(notes);
      setRecipes(aggregated);
      setStep('preview');
    } else {
      if (!many && scannedCount > 0) setScannedPdf(true);
      setParseError(notes.length ? notes.join('\n') : 'Aucune recette détectée.');
    }
  };

  const onInputChange = (e) => {
    const files = e.target.files;
    e.target.value = '';
    if (files && files.length) handleFiles(files);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) handleFiles(files);
  };

  // ── Mapping de colonnes ──
  const applyMapping = () => {
    if (mapping.titre == null) {
      notify('Sélectionnez au minimum la colonne « Titre de la recette ».', 'warning');
      return;
    }
    try {
      const built = buildFromMapping(mappingData.rows, mappingData.headerRowIndex, mapping);
      if (!built.length) { setParseError('Aucune recette construite avec ce mapping.'); return; }
      setRecipes(built);
      setStep('preview');
    } catch (err) {
      setParseError('Mapping invalide : ' + (err.message || err));
    }
  };

  // ── Insertion en base, par lots ──
  const runImport = async (list) => {
    if (!legacySB) { notify('Base non connectée.', 'error'); return; }
    cancelRef.current = false;
    setStep('importing');
    setProgress({ done: 0, total: list.length, imported: 0, failed: 0 });
    let imported = 0, failed = 0, done = 0;
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      if (cancelRef.current) break;
      const batch = list.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(r => legacySB.db.upsertRecette(toRecettePayload(r, etabId, user && user.id))),
      );
      results.forEach(res => {
        done += 1;
        if (res.status === 'fulfilled') imported += 1;
        else { failed += 1; console.error('[import recette]', res.reason); }
      });
      setProgress({ done, total: list.length, imported, failed });
    }
    setStep('done');
    if (imported > 0) {
      notify(`${imported} recette(s) importée(s).`, failed > 0 ? 'warning' : 'success');
      if (onImported) onImported();
    }
    if (imported === 0) notify('Aucune recette importée.', 'error');
  };

  const importAllValid = () => {
    const list = recipes.filter(r => r._selected !== false && isRecipeValid(r));
    if (!list.length) { notify('Aucune recette valide sélectionnée.', 'warning'); return; }
    runImport(list);
  };

  // ── Template téléchargeable ──
  const downloadTemplate = async () => {
    const XLSX = await import('xlsx'); // chargé à la demande (hors bundle du module)
    const rows = [
      ['titre', 'categorie', 'portions', 'prix_vente', 'ingredient', 'quantite', 'unite', 'etape_numero', 'etape_texte', 'allergenes'],
      ['Risotto aux asperges', 'Plats', 4, 28.5, 'Riz Arborio', 320, 'g', '', '', 'lactose'],
      ['Risotto aux asperges', 'Plats', 4, 28.5, 'Asperges vertes', 400, 'g', '', '', ''],
      ['Risotto aux asperges', 'Plats', 4, 28.5, 'Parmesan', 80, 'g', '', '', 'lactose'],
      ['Risotto aux asperges', 'Plats', 4, 28.5, '', '', '', 1, "Faire revenir l'oignon dans l'huile", ''],
      ['Risotto aux asperges', 'Plats', 4, 28.5, '', '', '', 2, 'Ajouter le riz et nacrer 2 min', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 9 }, { wch: 12 }, { wch: 24 }, { wch: 10 }, { wch: 8 }, { wch: 13 }, { wch: 40 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recettes');
    XLSX.writeFile(wb, 'template-import-recettes.xlsx');
  };

  const headerBar = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
        Import multiple de recettes
      </div>
      <button onClick={onClose} title="Fermer" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text2)' }}>✕</button>
    </div>
  );

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panel}>
        {headerBar}
        <div style={{ padding: 18, overflowY: 'auto' }}>

          {/* ── Choix du format ── */}
          {step === 'choose' && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 0 }}>
                Glissez une ou plusieurs fiches recettes : le type de chaque fichier
                est détecté automatiquement. Les recettes sont créées en brouillon
                sur l'établissement courant.
              </p>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current && fileInputRef.current.click(); } }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                style={{ ...dropZone, ...(dragOver ? dropZoneActive : {}) }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".xlsx,.xls,.csv,.pdf,image/*"
                  style={{ display: 'none' }}
                  onChange={onInputChange}
                />
                <div style={{ fontSize: 40, lineHeight: 1 }}>📥</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                  Glissez vos fiches ici, ou cliquez pour parcourir
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  Excel, CSV, PDF ou photos · plusieurs fichiers à la fois
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <Btn variant="ghost" small onClick={downloadTemplate}>⬇ Télécharger le template Excel</Btn>
              </div>
              {parsing && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--accent)' }}>⟳ {parsingMsg}</div>}
              {parseError && <div style={errBox}>{parseError}</div>}
              {scannedPdf && (
                <div style={{ ...errBox, background: 'var(--warning-bg)', borderColor: 'var(--warning-bd)', color: 'var(--warning-text)' }}>
                  Ce PDF semble être une image scannée (aucun texte sélectionnable).
                  Astuce : prends-en une photo et utilise l'option « Photo » ci-dessus
                  pour le faire lire par l'IA.
                </div>
              )}
            </div>
          )}

          {/* ── Assistant de mapping de colonnes ── */}
          {step === 'mapping' && mappingData && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 0 }}>
                Les colonnes n'ont pas pu être reconnues automatiquement. Associez
                chaque champ cible à une colonne du fichier.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {Object.entries(FIELD_LABELS).map(([field, label]) => (
                  <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text2)' }}>
                      {label}{field === 'titre' ? ' *' : ''}
                    </span>
                    <select
                      value={mapping[field] == null ? '' : mapping[field]}
                      onChange={e => setMapping(m => ({ ...m, [field]: e.target.value === '' ? null : Number(e.target.value) }))}
                      style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }}
                    >
                      <option value="">— ignorer —</option>
                      {mappingData.headers.map(h => <option key={h.index} value={h.index}>{h.label}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {parseError && <div style={errBox}>{parseError}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <Btn variant="ghost" onClick={reset}>← Retour</Btn>
                <Btn variant="primary" onClick={applyMapping}>Continuer</Btn>
              </div>
            </div>
          )}

          {/* ── Aperçu avant import ── */}
          {step === 'preview' && (
            <div>
              {parseStats && (
                <div style={statsBanner}>
                  <strong>{parseStats.sheetsTotal}</strong> feuille(s) dans le classeur ·{' '}
                  <strong>{parseStats.sheetsRead.length}</strong> lue(s) ·{' '}
                  <strong>{parseStats.rowsTotal}</strong> ligne(s) analysée(s) ·{' '}
                  <strong>{recipes.length}</strong> recette(s) détectée(s) ·{' '}
                  <strong>{recipes.reduce((s, r) => s + (r.ingredients || []).length, 0)}</strong> ingrédient(s)
                  {parseStats.sheetsRead.length > 0 && (
                    <span style={{ color: 'var(--text2)' }}>
                      {' '}— {parseStats.sheetsRead.map(s => `${s.name} (${s.count})`).join(', ')}
                    </span>
                  )}
                  {parseStats.sheetsSkipped.length > 0 && (
                    <span style={{ color: '#b45309' }}>
                      {' '}· ignoré(s) : {parseStats.sheetsSkipped.join(', ')}
                    </span>
                  )}
                </div>
              )}
              {fileNotes.length > 0 && (
                <div style={{ ...errBox, background: 'var(--warning-bg)', borderColor: 'var(--warning-bd)', color: 'var(--warning-text)', marginTop: 0, marginBottom: 10 }}>
                  <strong>{fileNotes.length} fichier(s) non importé(s) :</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {fileNotes.map((n, i) => <li key={i} style={{ marginBottom: 2 }}>{n}</li>)}
                  </ul>
                </div>
              )}
              <ImportPreview recipes={recipes} onChange={setRecipes} unrecognizedUnits={getUnrecognizedUnits()} />
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <Btn variant="ghost" onClick={reset}>← Autre fichier</Btn>
                <div style={{ flex: 1 }} />
                <Btn variant="primary" onClick={importAllValid}>
                  Importer les recettes valides ({recipes.filter(r => r._selected !== false && isRecipeValid(r)).length})
                </Btn>
              </div>
            </div>
          )}

          {/* ── Import en cours ── */}
          {step === 'importing' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                Import en cours… {progress.done} / {progress.total}
              </div>
              <div style={{ height: 10, background: 'var(--bg)', borderRadius: 6, margin: '14px 0', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ height: '100%', width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: 'var(--accent)', transition: 'width 0.2s' }} />
              </div>
              <Btn variant="danger" onClick={() => { cancelRef.current = true; }}>Annuler</Btn>
            </div>
          )}

          {/* ── Terminé ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 32 }}>✓</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: '8px 0' }}>
                Import terminé
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                {progress.imported} recette(s) importée(s)
                {progress.failed > 0 ? ` · ${progress.failed} échec(s)` : ''}
                {cancelRef.current ? ' · interrompu' : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                <Btn variant="ghost" onClick={reset}>Importer un autre fichier</Btn>
                <Btn variant="primary" onClick={onClose}>Fermer</Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const statsBanner = {
  marginBottom: 10, padding: '8px 12px', borderRadius: 7, fontSize: 12,
  background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', lineHeight: 1.6,
};
const dropZone = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
  cursor: 'pointer', textAlign: 'center', padding: '34px 18px',
  border: '2px dashed var(--border)', borderRadius: 12, background: 'var(--bg)',
  transition: 'border-color 0.15s, background 0.15s',
};
const dropZoneActive = {
  borderColor: 'var(--accent)', background: 'var(--surface)',
};
const errBox = {
  marginTop: 12, padding: '8px 12px', borderRadius: 6, fontSize: 12,
  background: 'var(--danger-bg-soft)', border: '1px solid var(--danger-bd)', color: 'var(--danger-text)',
};
