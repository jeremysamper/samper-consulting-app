import React from 'react';
import { alertLegacy, getBrowserWindow, notifyLegacy } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import { writeText } from '../../utils/storage.js';
import { ALLERGENES_OPTIONS } from './ConsultantTools.constants.js';
import { normalizeSearch } from '../../utils/searchText.js';

const MENU_CATEGORIES = ['Entrées', 'Plats', 'Fromages', 'Desserts', 'Boissons', 'Menus'];

const formatCHF = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  return `CHF ${number.toFixed(2)}`;
};

const slugFileName = (value) => {
  const normalized = String(value || 'carte')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized || 'carte';
};

const normalizeMenuCategory = (category) => {
  if (!category) return 'Plats';
  if (/entr|amuse/i.test(category)) return 'Entrées';
  if (/dessert/i.test(category)) return 'Desserts';
  if (/fromage/i.test(category)) return 'Fromages';
  if (/boisson|vin|cocktail/i.test(category)) return 'Boissons';
  if (/menu/i.test(category)) return 'Menus';
  return 'Plats';
};

const buildMenuSourceItems = (plats, recettes) => {
  const platItems = (plats || [])
    .filter((plat) => plat.actif !== false)
    .map((plat) => ({
      id: `plat-${plat.id}`,
      sourceId: plat.id,
      sourceType: 'plat',
      name: plat.nom || 'Plat sans nom',
      description: plat.description || '',
      category: normalizeMenuCategory(plat.categorie),
      price: plat.prixVente ?? '',
      allergenes: [],
    }));

  if (platItems.length > 0) return platItems;

  return (recettes || [])
    .filter((recette) => recette.statut !== 'archivée')
    .map((recette) => ({
      id: `recette-${recette.id}`,
      sourceId: recette.id,
      sourceType: 'recette',
      name: recette.nom || 'Recette sans nom',
      description: recette.notesConsultant || recette.dressage || '',
      category: normalizeMenuCategory(recette.categorie),
      price: recette.prixVente ?? '',
      allergenes: recette.allergenesIds || [],
    }));
};

const makeMenuItem = (source, order) => ({
  id: `menu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  sourceId: source?.sourceId || null,
  sourceType: source?.sourceType || 'custom',
  category: source?.category || 'Plats',
  name: source?.name || 'Nouvelle ligne',
  description: source?.description || '',
  price: source?.price ?? '',
  allergenes: source?.allergenes || [],
  order,
});

const ensureDraftFolder = async ({ legacySB, etabId, userId }) => {
  const docs = await legacySB.db.listDocuments(etabId);
  const existing = docs.find((doc) =>
    doc.type === 'folder' &&
    (doc.parentId || null) === null &&
    String(doc.nom || '').trim().toLowerCase() === 'draft'
  );
  if (existing) return existing;

  return legacySB.db.createFolder({
    etablissementId: etabId,
    parentId: null,
    nom: 'Draft',
    userId,
  });
};

const CarteCreator = ({ plats, recettes, etablissement, legacySB, etabId, user }) => {
  const today = new Date().toISOString().slice(0, 10);
  const sourceItems = React.useMemo(() => buildMenuSourceItems(plats, recettes), [plats, recettes]);
  const [title, setTitle] = React.useState(() => `Carte ${etablissement?.nom || ''}`.trim());
  const [subtitle, setSubtitle] = React.useState('Sélection du moment');
  const [validFrom, setValidFrom] = React.useState(today);
  const [note, setNote] = React.useState('');
  const [items, setItems] = React.useState([]);
  const [search, setSearch] = React.useState('');
  const [filterCategory, setFilterCategory] = React.useState('Tous');
  const [draftStatus, setDraftStatus] = React.useState({ state: 'idle', message: '', folderId: null });
  const [exporting, setExporting] = React.useState(false);
  const [showDescriptions, setShowDescriptions] = React.useState(true);
  const [showAllergenes, setShowAllergenes] = React.useState(false);
  const [showAllergenMatrix, setShowAllergenMatrix] = React.useState(false);
  const seededRef = React.useRef(false);

  // Résolution des allergènes d'une ligne de carte (recette directe ou plat → recettes liées).
  const recetteById = React.useMemo(() => new Map((recettes || []).map((r) => [r.id, r])), [recettes]);
  const platById = React.useMemo(() => new Map((plats || []).map((p) => [p.id, p])), [plats]);
  const allergenesOf = React.useCallback((item) => {
    if (item.sourceType === 'recette') {
      const r = recetteById.get(item.sourceId);
      return r ? (r.allergenesIds || []) : (item.allergenes || []);
    }
    if (item.sourceType === 'plat') {
      const p = platById.get(item.sourceId);
      if (!p) return item.allergenes || [];
      const set = new Set();
      (p.recettes || []).forEach((pr) => {
        const r = recetteById.get(pr.recetteId);
        (r?.allergenesIds || []).forEach((a) => set.add(a));
      });
      return [...set];
    }
    return item.allergenes || [];
  }, [recetteById, platById]);

  React.useEffect(() => {
    setTitle(`Carte ${etablissement?.nom || ''}`.trim());
    setItems([]);
    seededRef.current = false;
    setDraftStatus({ state: 'idle', message: '', folderId: null });
  }, [etabId, etablissement?.nom]);

  React.useEffect(() => {
    if (seededRef.current || sourceItems.length === 0) return;
    const seeded = sourceItems.slice(0, 18).map((source, index) => makeMenuItem(source, index));
    setItems(seeded);
    seededRef.current = true;
  }, [sourceItems]);

  const categories = React.useMemo(() => {
    const fromItems = items.map((item) => item.category).filter(Boolean);
    return [...new Set([...MENU_CATEGORIES, ...fromItems])];
  }, [items]);

  const groupedItems = React.useMemo(() => categories
    .map((category) => ({
      category,
      items: items
        .filter((item) => item.category === category)
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    }))
    .filter((group) => group.items.length > 0), [items, categories]);

  const filteredSources = sourceItems.filter((item) => {
    const matchesCategory = filterCategory === 'Tous' || item.category === filterCategory;
    const term = normalizeSearch(search.trim());
    const matchesSearch = !term || normalizeSearch(item.name).includes(term) || normalizeSearch(item.description).includes(term);
    return matchesCategory && matchesSearch && !items.some((menuItem) => menuItem.sourceId === item.sourceId && menuItem.sourceType === item.sourceType);
  });

  const addSource = (source) => {
    setItems((prev) => [...prev, makeMenuItem(source, prev.length)]);
  };

  const addBlank = () => {
    setItems((prev) => [...prev, makeMenuItem({ category: filterCategory === 'Tous' ? 'Plats' : filterCategory }, prev.length)]);
  };

  const updateItem = (id, patch) => {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id).map((item, index) => ({ ...item, order: index })));
  };

  const moveItem = (id, direction) => {
    setItems((prev) => {
      const sorted = [...prev].sort((a, b) => (a.order || 0) - (b.order || 0));
      const index = sorted.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) return prev;
      [sorted[index], sorted[nextIndex]] = [sorted[nextIndex], sorted[index]];
      return sorted.map((item, order) => ({ ...item, order }));
    });
  };

  const resetFromSources = () => {
    setItems(sourceItems.slice(0, 18).map((source, index) => makeMenuItem(source, index)));
    seededRef.current = true;
  };

  const fileName = `${slugFileName(title)}-${validFrom || today}.pdf`;

  const handleExportPdf = async () => {
    if (items.length === 0) {
      notifyLegacy('Ajoutez au moins une ligne à la carte avant l’export.', 'warning');
      return;
    }
    setExporting(true);
    try {
      await pdfUtils?.exportElementToPdf('consultant-carte-print', fileName, {
        title,
        etablissement,
        orientation: 'portrait',
        fitOnePage: items.length <= 12,
      });
    } catch (err) {
      notifyLegacy('Erreur export PDF : ' + (err.message || err), 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportAllergenesPdf = async () => {
    setExporting(true);
    try {
      await pdfUtils?.exportElementToPdf('carte-allergenes-print', `allergenes-${slugFileName(title)}.pdf`, {
        title: 'Tableau des allergènes',
        etablissement,
        orientation: 'landscape',
      });
    } catch (err) {
      notifyLegacy('Erreur export PDF : ' + (err.message || err), 'error');
    } finally {
      setExporting(false);
    }
  };

  const handlePrintAllergenes = () => {
    pdfUtils?.printElement('carte-allergenes-print', 'Tableau des allergènes', { etablissement, orientation: 'landscape' });
  };

  const handleSendDraft = async () => {
    if (!legacySB) {
      alertLegacy('Supabase non configuré : impossible d’envoyer dans Documents.');
      return;
    }
    if (items.length === 0) {
      notifyLegacy('Ajoutez au moins une ligne à la carte avant l’envoi.', 'warning');
      return;
    }

    setDraftStatus({ state: 'saving', message: 'Préparation du PDF…', folderId: null });
    try {
      const draftFolder = await ensureDraftFolder({ legacySB, etabId, userId: user?.id });
      const blob = await pdfUtils.elementToBlobPDF('consultant-carte-print', {
        title,
        etablissement,
        orientation: 'portrait',
        fitOnePage: items.length <= 12,
      });
      const file = new File([blob], fileName, { type: 'application/pdf' });
      await legacySB.db.uploadFile({
        etablissementId: etabId,
        parentId: draftFolder.id,
        file,
        userId: user?.id,
      });
      setDraftStatus({
        state: 'saved',
        message: `Envoyé dans Documents / Draft : ${fileName}`,
        folderId: draftFolder.id,
      });
      notifyLegacy('Carte envoyée dans Documents / Draft.', 'success');
    } catch (err) {
      console.error('[CarteCreator send draft]', err);
      setDraftStatus({ state: 'error', message: err.message || 'Erreur envoi Draft', folderId: null });
      notifyLegacy('Erreur envoi Draft : ' + (err.message || err), 'error');
    }
  };

  const openDraftFolder = () => {
    if (draftStatus.folderId) writeText('sc_documents_open_folder', draftStatus.folderId);
    getBrowserWindow()?.setPage?.('documents');
  };

  return (
    <div style={mcs.root}>
      <div style={mcs.header} className="no-print">
        <div>
          <div style={mcs.title}>Création de carte</div>
          <div style={mcs.subtitle}>Composition simple, export PDF et dépôt direct dans Documents / Draft.</div>
        </div>
        <div style={mcs.headerActions}>
          <button style={cts.ghostBtn} onClick={resetFromSources}>Recharger depuis les plats</button>
          <button style={cts.ghostBtn} onClick={handleExportPdf} disabled={exporting}>
            {exporting ? 'Export…' : 'Export PDF'}
          </button>
          <button style={cts.ghostBtn} onClick={() => setShowAllergenMatrix(true)}>Tableau des allergènes</button>
          <button style={{ ...cts.newBtn, opacity: draftStatus.state === 'saving' ? 0.7 : 1 }} onClick={handleSendDraft} disabled={draftStatus.state === 'saving'}>
            {draftStatus.state === 'saving' ? 'Envoi…' : 'Envoyer dans Draft'}
          </button>
        </div>
      </div>

      {draftStatus.message && (
        <div style={{
          ...mcs.status,
          borderColor: draftStatus.state === 'error' ? '#fca5a5' : '#bbf7d0',
          background: draftStatus.state === 'error' ? '#fef2f2' : '#f0fdf4',
          color: draftStatus.state === 'error' ? '#b91c1c' : '#166534',
        }}>
          <span>{draftStatus.message}</span>
          {draftStatus.state === 'saved' && <button style={mcs.statusBtn} onClick={openDraftFolder}>Ouvrir Documents</button>}
        </div>
      )}

      <div style={mcs.setupRow} className="no-print">
        <div style={mcs.setupField}>
          <label style={cts.label}>Titre</label>
          <input style={cts.input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div style={mcs.setupField}>
          <label style={cts.label}>Sous-titre</label>
          <input style={cts.input} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Ex: Carte printemps" />
        </div>
        <div style={mcs.setupDate}>
          <label style={cts.label}>Date</label>
          <input type="date" style={cts.input} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </div>
        <label style={mcs.checkLabel}>
          <input type="checkbox" checked={showDescriptions} onChange={(e) => setShowDescriptions(e.target.checked)} />
          Descriptions
        </label>
        <label style={mcs.checkLabel}>
          <input type="checkbox" checked={showAllergenes} onChange={(e) => setShowAllergenes(e.target.checked)} />
          Allergènes
        </label>
      </div>

      <div style={mcs.workbench}>
        <section style={mcs.editorPanel}>
          <div style={mcs.panelHeader}>
            <div>
              <div style={mcs.panelTitle}>Composition</div>
              <div style={mcs.panelMeta}>{items.length} ligne{items.length > 1 ? 's' : ''}</div>
            </div>
            <button style={cts.smallBtn} onClick={addBlank}>+ Ligne libre</button>
          </div>

          {items.length === 0 ? (
            <div style={mcs.emptyComposer}>Ajoutez des plats depuis la bibliothèque ou créez une ligne libre.</div>
          ) : (
            <div style={mcs.itemList}>
              {[...items].sort((a, b) => (a.order || 0) - (b.order || 0)).map((item) => (
                <div key={item.id} style={mcs.itemRow}>
                  <div style={mcs.itemMove}>
                    <button style={mcs.iconBtn} onClick={() => moveItem(item.id, -1)} title="Monter">▲</button>
                    <button style={mcs.iconBtn} onClick={() => moveItem(item.id, 1)} title="Descendre">▼</button>
                  </div>
                  <div style={mcs.itemFields}>
                    <div style={mcs.itemTopLine}>
                      <select style={mcs.itemCategory} value={item.category} onChange={(e) => updateItem(item.id, { category: e.target.value })}>
                        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                      <input style={mcs.itemName} value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} placeholder="Nom affiché" />
                      <input style={mcs.itemPrice} type="number" min="0" step="0.50" value={item.price} onChange={(e) => updateItem(item.id, { price: e.target.value })} placeholder="CHF" />
                    </div>
                    <textarea style={mcs.itemDescription} rows={2} value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} placeholder="Description courte sur la carte…" />
                  </div>
                  <button style={mcs.removeBtn} onClick={() => removeItem(item.id)} title="Retirer">×</button>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside style={mcs.libraryPanel} className="no-print">
          <div style={mcs.panelHeader}>
            <div>
              <div style={mcs.panelTitle}>Bibliothèque</div>
              <div style={mcs.panelMeta}>{filteredSources.length} disponible{filteredSources.length > 1 ? 's' : ''}</div>
            </div>
          </div>
          <div style={mcs.libraryFilters}>
            <input style={cts.search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un plat…" />
            <select style={cts.inlineInput} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="Tous">Toutes</option>
              {MENU_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <div style={mcs.sourceList}>
            {filteredSources.length === 0 ? (
              <div style={mcs.libraryEmpty}>Aucun élément à ajouter.</div>
            ) : filteredSources.slice(0, 60).map((source) => (
              <button key={source.id} style={mcs.sourceItem} onClick={() => addSource(source)}>
                <span style={mcs.sourceName}>{source.name}</span>
                <span style={mcs.sourceMeta}>{source.category}{formatCHF(source.price) ? ` · ${formatCHF(source.price)}` : ''}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      <section style={mcs.previewSection}>
        <div style={mcs.previewHeader} className="no-print">
          <div style={mcs.panelTitle}>Aperçu PDF</div>
          <textarea style={mcs.noteInput} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note courte optionnelle en bas de carte…" />
        </div>

        <div id="consultant-carte-print" style={mcs.printSheet}>
          <div style={mcs.printTop}>
            <div>
              <div style={mcs.printEyebrow}>{etablissement?.nom || 'Samper Consulting'}</div>
              <h1 style={mcs.printTitle}>{title || 'Carte'}</h1>
              {subtitle && <div style={mcs.printSubtitle}>{subtitle}</div>}
            </div>
            <div style={mcs.printDate}>
              {validFrom ? new Date(validFrom).toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}
            </div>
          </div>

          {groupedItems.length === 0 ? (
            <div style={mcs.printEmpty}>La carte est vide.</div>
          ) : groupedItems.map((group) => (
            <div key={group.category} style={mcs.printGroup}>
              <h2 style={mcs.printGroupTitle}>{group.category}</h2>
              {group.items.map((item) => (
                <div key={item.id} style={mcs.printItem}>
                  <div style={mcs.printItemMain}>
                    <div style={mcs.printItemName}>{item.name || 'Ligne sans nom'}</div>
                    {showDescriptions && item.description && <div style={mcs.printItemDesc}>{item.description}</div>}
                    {showAllergenes && item.allergenes?.length > 0 && (
                      <div style={mcs.printAllergenes}>Allergènes : {item.allergenes.join(', ')}</div>
                    )}
                  </div>
                  <div style={mcs.printPrice}>{formatCHF(item.price)}</div>
                </div>
              ))}
            </div>
          ))}

          {note && <div style={mcs.printNote}>{note}</div>}
        </div>
      </section>

      {showAllergenMatrix && (
        <div
          className="no-print"
          style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(20,16,12,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAllergenMatrix(false); }}
        >
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(1100px,97vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>Tableau des allergènes - la carte</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={cts.ghostBtn} onClick={handlePrintAllergenes}>🖨 Imprimer</button>
                <button style={cts.ghostBtn} onClick={handleExportAllergenesPdf} disabled={exporting}>{exporting ? 'Export…' : '⬇ Export PDF'}</button>
                <button style={cts.ghostBtn} onClick={() => setShowAllergenMatrix(false)}>Fermer</button>
              </div>
            </div>
            <div style={{ padding: 16, overflow: 'auto' }}>
              <div id="carte-allergenes-print" style={{ background: '#fff', color: '#1f2933', padding: '24px 28px' }}>
                <div style={{ borderBottom: '2px solid #003042', paddingBottom: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: '#003042', fontWeight: 700 }}>{etablissement?.nom || 'Samper Consulting'}</div>
                  <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, margin: '4px 0 0', color: '#111827' }}>Tableau des allergènes</h1>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{title} · {items.length} plat{items.length > 1 ? 's' : ''}</div>
                </div>
                {items.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>La carte est vide.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #003042', color: '#111827' }}>Plat</th>
                        {ALLERGENES_OPTIONS.map((a) => (
                          <th key={a.id} style={{ padding: '6px 3px', borderBottom: '2px solid #003042', color: '#111827', width: 58, fontSize: 9, lineHeight: 1.15 }}>{a.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupedItems.map((group) => (
                        <React.Fragment key={group.category}>
                          <tr>
                            <td colSpan={ALLERGENES_OPTIONS.length + 1} style={{ padding: '8px 8px 3px', fontFamily: 'Georgia, serif', fontSize: 13, color: '#003042', fontWeight: 700 }}>{group.category}</td>
                          </tr>
                          {group.items.map((item) => {
                            const al = allergenesOf(item);
                            return (
                              <tr key={item.id}>
                                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0ece4', color: '#111827', fontWeight: 600 }}>{item.name || 'Ligne sans nom'}</td>
                                {ALLERGENES_OPTIONS.map((a) => (
                                  <td key={a.id} style={{ padding: '5px 3px', borderBottom: '1px solid #f0ece4', textAlign: 'center', color: al.includes(a.id) ? '#003042' : '#d1d5db', fontWeight: 700 }}>
                                    {al.includes(a.id) ? '●' : '·'}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ marginTop: 14, fontSize: 9, color: '#6b7280', fontStyle: 'italic' }}>
                  ● = allergène présent. Tableau indicatif, à vérifier et tenir à jour. 14 allergènes à déclaration obligatoire (UE).
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const mcs = {
  root: { padding: '0 4px 40px', overflowY: 'auto', maxHeight: 'calc(100vh - 140px)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14, flexWrap: 'wrap' },
  title: { fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)' },
  subtitle: { fontSize: 12, color: 'var(--text2)', marginTop: 4 },
  headerActions: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  status: { border: '1px solid', borderRadius: 8, padding: '9px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 13 },
  statusBtn: { background: 'transparent', border: '1px solid currentColor', borderRadius: 6, padding: '5px 10px', color: 'inherit', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12 },
  setupRow: { display: 'grid', gridTemplateColumns: 'minmax(220px, 1.1fr) minmax(220px, 1fr) 150px auto auto', gap: 10, alignItems: 'end', marginBottom: 14 },
  setupField: { display: 'flex', flexDirection: 'column', gap: 4 },
  setupDate: { display: 'flex', flexDirection: 'column', gap: 4 },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text2)', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' },
  workbench: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, alignItems: 'start' },
  editorPanel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  libraryPanel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', position: 'sticky', top: 0 },
  panelHeader: { padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  panelTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.4 },
  panelMeta: { fontSize: 11, color: 'var(--text2)', marginTop: 3 },
  emptyComposer: { padding: 28, textAlign: 'center', color: 'var(--text2)', fontSize: 13 },
  itemList: { padding: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  itemRow: { display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) 28px', gap: 8, padding: 10, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' },
  itemMove: { display: 'flex', flexDirection: 'column', gap: 4 },
  iconBtn: { width: 24, height: 24, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text2)', borderRadius: 5, cursor: 'pointer', fontSize: 10, padding: 0 },
  itemFields: { display: 'flex', flexDirection: 'column', gap: 8 },
  itemTopLine: { display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) 90px', gap: 8 },
  itemCategory: { padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 12 },
  itemName: { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, minWidth: 0 },
  itemPrice: { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, width: '100%', boxSizing: 'border-box' },
  itemDescription: { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 12, lineHeight: 1.4, resize: 'vertical' },
  removeBtn: { width: 26, height: 26, border: '1px solid #fca5a5', background: 'transparent', color: '#dc2626', borderRadius: 6, cursor: 'pointer', fontSize: 16, lineHeight: 1 },
  libraryFilters: { padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 },
  sourceList: { maxHeight: 520, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 },
  sourceItem: { textAlign: 'left', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)' },
  sourceName: { display: 'block', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sourceMeta: { display: 'block', fontSize: 11, color: 'var(--text2)', marginTop: 2 },
  libraryEmpty: { padding: 20, color: 'var(--text2)', fontSize: 12, textAlign: 'center' },
  previewSection: { marginTop: 16 },
  previewHeader: { display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', gap: 12, alignItems: 'start', marginBottom: 10 },
  noteInput: { width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', resize: 'vertical', boxSizing: 'border-box' },
  printSheet: { background: '#fff', color: '#1f2933', border: '1px solid var(--border)', borderRadius: 10, padding: '34px 44px', maxWidth: 860, margin: '0 auto', boxShadow: '0 8px 26px rgba(0,0,0,0.06)' },
  printTop: { display: 'flex', justifyContent: 'space-between', gap: 20, borderBottom: '2px solid #003042', paddingBottom: 18, marginBottom: 24 },
  printEyebrow: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: '#003042', fontWeight: 700 },
  printTitle: { fontFamily: 'Georgia, serif', fontSize: 34, margin: '4px 0 0', color: '#111827', lineHeight: 1.05 },
  printSubtitle: { fontSize: 14, color: '#6b7280', marginTop: 8 },
  printDate: { fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', paddingTop: 6 },
  printGroup: { marginBottom: 24, pageBreakInside: 'avoid' },
  printGroupTitle: { fontFamily: 'Georgia, serif', fontSize: 19, color: '#003042', margin: '0 0 10px', borderBottom: '1px solid #e7dfcf', paddingBottom: 5 },
  printItem: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 100px', gap: 16, padding: '10px 0', borderBottom: '1px solid #f0ece4', alignItems: 'start' },
  printItemMain: { minWidth: 0 },
  printItemName: { fontSize: 15, fontWeight: 700, color: '#111827' },
  printItemDesc: { fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 1.45 },
  printAllergenes: { fontSize: 10, color: '#003042', marginTop: 4, fontWeight: 600 },
  printPrice: { fontSize: 14, fontWeight: 700, color: '#111827', textAlign: 'right', whiteSpace: 'nowrap' },
  printNote: { marginTop: 18, paddingTop: 12, borderTop: '1px solid #e7dfcf', fontSize: 12, color: '#6b7280', lineHeight: 1.5, fontStyle: 'italic' },
  printEmpty: { padding: 30, textAlign: 'center', color: '#6b7280' },
};

if (getBrowserWindow()?.innerWidth < 900) {
  mcs.setupRow = { ...mcs.setupRow, gridTemplateColumns: '1fr' };
  mcs.workbench = { ...mcs.workbench, gridTemplateColumns: '1fr' };
  mcs.libraryPanel = { ...mcs.libraryPanel, position: 'static' };
  mcs.itemTopLine = { ...mcs.itemTopLine, gridTemplateColumns: '1fr' };
  mcs.previewHeader = { ...mcs.previewHeader, gridTemplateColumns: '1fr' };
  mcs.printSheet = { ...mcs.printSheet, padding: '24px 22px' };
  mcs.printTop = { ...mcs.printTop, flexDirection: 'column' };
  mcs.printItem = { ...mcs.printItem, gridTemplateColumns: '1fr' };
  mcs.printPrice = { ...mcs.printPrice, textAlign: 'left' };
}

// ═══════════════════════════════════════════════════════════════
// Garde-fou : Outils consultant réservé au rôle 'consultant'
// (le menu masque déjà l'entrée à terme, mais on protège aussi
//  l'accès direct par URL/bookmark - défense en profondeur)
// ═══════════════════════════════════════════════════════════════


const cts = {
  label: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box', width: '100%' },
  search: { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', outline: 'none' },
  inlineInput: { padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--bg)', fontFamily: 'var(--font)', color: 'var(--text)' },
  ghostBtn: { padding: '7px 14px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' },
  newBtn: { padding: '9px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  smallBtn: { padding: '5px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
};

export { CarteCreator };
