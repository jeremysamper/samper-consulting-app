import React from 'react';
import { getDemoData, canManageModule } from '../../data/demoData.js';
import { alertLegacy, confirmLegacy, getBrowserWindow, notifyLegacy } from '../../legacy/legacyApi.js';
import { readText, removeStorageKeys } from '../../utils/storage.js';
import { dbService } from '../../services/dbService.js';
import { useSelection } from '../../hooks/useSelection.js';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { normalizeSearch } from '../../utils/searchText.js';

// ═══════════════════════════════════════════════════════════════
// MODULE DOCUMENTS - Partage hiérarchique de PDFs
// ═══════════════════════════════════════════════════════════════

const Documents = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const browserWindow = getBrowserWindow();
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const [allDocs, setAllDocs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [currentFolder, setCurrentFolder] = React.useState(null); // id du dossier courant, null = racine
  const [search, setSearch] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const [showNewFolder, setShowNewFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [renaming, setRenaming] = React.useState(null);
  const [moving, setMoving] = React.useState(null); // doc à déplacer
  // ─── Prévisualisation inline (PDF en iframe, images en <img>) ───
  const [previewing, setPreviewing] = React.useState(null); // { doc, url } | null
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const sel = useSelection();
  const [bulkBusy, setBulkBusy] = React.useState(false);
  // Fermeture de la modale avec la touche Échap
  React.useEffect(() => {
    if (!previewing) return;
    const onKey = (e) => { if (e.key === 'Escape') setPreviewing(null); };
    browserWindow?.addEventListener('keydown', onKey);
    return () => browserWindow?.removeEventListener('keydown', onKey);
  }, [previewing]);
  const fileInputRef = React.useRef(null);

  const perms = demoData.permissions[user.role] || {};
  const canWrite = perms.documents !== false && canManageModule(user.role, 'documents');
  const canRead = perms.documents !== false;

  // ═══ Load + Realtime ═══
  React.useEffect(() => {
    if (!legacySB) { setLoading(false); return; }
    let unsub = null, mounted = true;

    (async () => {
      try {
        const docs = await legacySB.db.listDocuments(etabId);
        if (mounted) setAllDocs(docs);
      } catch (err) { console.error('[Documents load]', err); }
      finally { if (mounted) setLoading(false); }
    })();

    unsub = legacySB.realtime.subscribeReload('documents', async () => {
      try { const docs = await legacySB.db.listDocuments(etabId); if (mounted) setAllDocs(docs); } catch(e) {}
    });

    return () => { mounted = false; unsub && unsub(); };
  }, [etabId]);

  React.useEffect(() => {
    if (allDocs.length === 0) return;
    const folderId = readText('sc_documents_open_folder', '');
    if (!folderId) return;
    const folder = allDocs.find((doc) => doc.id === folderId && doc.type === 'folder');
    if (!folder) return;
    setCurrentFolder(folder.id);
    removeStorageKeys(['sc_documents_open_folder']);
  }, [allDocs]);

  // Filtrer les documents du dossier courant
  const docsInFolder = allDocs.filter(d =>
    (d.parentId || null) === currentFolder &&
    (search === '' || normalizeSearch(d.nom).includes(normalizeSearch(search)))
  );
  const folders = docsInFolder.filter(d => d.type === 'folder');
  const files = docsInFolder.filter(d => d.type === 'file');

  // Breadcrumb : remonter jusqu'à la racine
  const breadcrumb = React.useMemo(() => {
    const path = [];
    let id = currentFolder;
    const safety = 20;
    let n = 0;
    while (id && n < safety) {
      const f = allDocs.find(d => d.id === id);
      if (!f) break;
      path.unshift(f);
      id = f.parentId;
      n++;
    }
    return path;
  }, [currentFolder, allDocs]);

  // ═══ Actions ═══
  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    if (!legacySB) { alertLegacy('Supabase non configuré.'); return; }
    try {
      await legacySB.db.createFolder({
        etablissementId: etabId,
        parentId: currentFolder,
        nom: newFolderName.trim(),
        userId: user.id,
      });
      setNewFolderName('');
      setShowNewFolder(false);
    } catch (err) {
      notifyLegacy('Erreur création dossier : ' + err.message, 'error');
    }
  };

    if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>;

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (!legacySB) { alertLegacy('Supabase non configuré.'); return; }

    setUploading(true);
    let success = 0, failed = 0;
    for (const file of files) {
      if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
        alertLegacy(`"${file.name}" n'est pas un PDF et sera ignoré.`);
        failed++;
        continue;
      }
      if (file.size > 50 * 1024 * 1024) {
        alertLegacy(`"${file.name}" dépasse 50 Mo. Ignoré.`);
        failed++;
        continue;
      }
      try {
        await legacySB.db.uploadFile({
          etablissementId: etabId,
          parentId: currentFolder,
          file,
          userId: user.id,
        });
        success++;
      } catch (err) {
        console.error('[upload]', err);
        notifyLegacy(`Erreur upload "${file.name}" : ${err.message}`, 'error');
        failed++;
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (success > 0 && failed === 0) {
      // silencieux
    } else if (success > 0 && failed > 0) {
      notifyLegacy(`${success} fichier(s) uploadé(s), ${failed} échec(s).`, 'error');
    }
  };

  // Détecte si un fichier peut être prévisualisé inline (PDF ou image courante).
  // Pour les autres types (Word, Excel, vidéo…), on retombe sur l'ouverture d'onglet classique.
  const isPreviewable = (doc) => {
    const name = (doc.nom || '').toLowerCase();
    return /\.(pdf|jpe?g|png|gif|webp|svg)$/i.test(name);
  };

  const openFile = async (doc) => {
    if (!legacySB) return;
    try {
      const url = await legacySB.db.getFileURL(doc.storagePath);
      if (isPreviewable(doc)) {
        // Prévisualisation inline dans une modale (iframe pour PDF, img pour images)
        setPreviewing({ doc, url });
      } else {
        // Fallback : ouvrir dans un nouvel onglet pour les types non prévisualisables
        browserWindow?.open(url, '_blank');
      }
    } catch (err) {
      notifyLegacy('Erreur ouverture fichier : ' + err.message, 'error');
    }
  };

  const downloadFile = async (doc) => {
    if (!legacySB) return;
    try {
      const url = await legacySB.db.getFileURL(doc.storagePath);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.nom;
      a.click();
    } catch (err) {
      notifyLegacy('Erreur téléchargement : ' + err.message, 'error');
    }
  };

  const moveDoc = async (targetParentId) => {
    if (!moving || !legacySB) return;
    // Éviter de déplacer un dossier dans lui-même ou dans un de ses descendants
    if (targetParentId === moving.id) { notifyLegacy('Impossible de déplacer un dossier dans lui-même.', 'error'); return; }
    try {
      await legacySB.db.moveDocument(moving.id, targetParentId);
      setMoving(null);
    } catch (err) {
      notifyLegacy('Erreur déplacement : ' + err.message, 'error');
    }
  };

  const deleteDoc = async (doc) => {
    const msg = doc.type === 'folder'
      ? `Supprimer le dossier "${doc.nom}" et TOUT son contenu ?\n\nCette action est irréversible.`
      : `Supprimer le fichier "${doc.nom}" ?`;
    if (!confirmLegacy(msg)) return;
    try {
      await legacySB.db.deleteDocument(doc);
    } catch (err) {
      notifyLegacy('Erreur suppression : ' + err.message, 'error');
    }
  };

  // ─── Mode sélection : suppression en lot ───
  const supprimerSelection = async () => {
    if (sel.count === 0) return;
    const docs = allDocs.filter(d => sel.ids.has(d.id));
    const nbFolders = docs.filter(d => d.type === 'folder').length;
    const msg = `Supprimer ${sel.count} élément(s) sélectionné(s) ?`
      + (nbFolders > 0 ? `\n\n${nbFolders} dossier(s) et TOUT leur contenu seront supprimés. Action irréversible.` : '');
    if (!confirmLegacy(msg)) return;
    setBulkBusy(true);
    let ok = 0;
    for (const doc of docs) {
      try { await legacySB.db.deleteDocument(doc); ok += 1; }
      catch (err) { console.error('[deleteDocument]', err); }
    }
    setBulkBusy(false);
    sel.exit();
    notifyLegacy(`${ok} élément(s) supprimé(s).`, 'success');
  };

  const startRename = (doc) => setRenaming({ id: doc.id, currentName: doc.nom, newName: doc.nom });
  const confirmRename = async () => {
    if (!renaming || !renaming.newName.trim() || renaming.newName === renaming.currentName) {
      setRenaming(null);
      return;
    }
    try {
      await legacySB.db.renameDocument(renaming.id, renaming.newName.trim());
      setRenaming(null);
    } catch (err) {
      notifyLegacy('Erreur renommage : ' + err.message, 'error');
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' Ko';
    return (bytes / 1024 / 1024).toFixed(1) + ' Mo';
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (!canRead) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>🔐</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>Accès restreint</div>
      </div>
    );
  }

  return (
    <div style={doc_s.root}>
      {/* Header */}
      <div style={doc_s.header}>
        <div style={doc_s.breadcrumb}>
          <button style={doc_s.crumbBtn} onClick={() => setCurrentFolder(null)}>📁 Documents</button>
          {breadcrumb.map((f, i) => (
            <React.Fragment key={f.id}>
              <span style={doc_s.crumbSep}>/</span>
              <button style={doc_s.crumbBtn} onClick={() => setCurrentFolder(f.id)}>{f.nom}</button>
            </React.Fragment>
          ))}
        </div>

        <div className="module-actions">
          <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher…" />
          {canWrite && !sel.active && docsInFolder.length > 0 && (
            <button style={doc_s.ghostBtn} onClick={sel.enter}>☑ Sélectionner</button>
          )}
          {canWrite && (
            <>
              <button style={doc_s.ghostBtn} onClick={() => setShowNewFolder(true)}>📁 Nouveau dossier</button>
              <label style={{ ...doc_s.addBtn, cursor: uploading ? 'wait' : 'pointer' }}>
                {uploading ? '⏳ Upload…' : '📤 Importer PDF'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
            </>
          )}
        </div>
      </div>

      {/* Barre d'outils du mode sélection */}
      {sel.active && (
        <SelectionToolbar
          count={sel.count}
          total={docsInFolder.length}
          allSelected={sel.count > 0 && sel.count === docsInFolder.length}
          onToggleAll={() => (sel.count === docsInFolder.length ? sel.clear() : sel.selectAll(docsInFolder.map(d => d.id)))}
          onDelete={supprimerSelection}
          onCancel={sel.exit}
          busy={bulkBusy}
        />
      )}

      {/* Contenu */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Chargement…</div>
      ) : docsInFolder.length === 0 ? (
        <div style={doc_s.empty}>
          <div style={{ fontSize: 48, opacity: 0.3 }}>📂</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 10, color: 'var(--text)' }}>
            {search ? 'Aucun résultat' : (currentFolder ? 'Ce dossier est vide' : 'Aucun document')}
          </div>
          {canWrite && !search && (
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>
              Créez un dossier ou importez des PDFs pour commencer.
            </div>
          )}
        </div>
      ) : (
        <div style={doc_s.grid}>
          {/* Dossiers */}
          {folders.map(f => (
            <div
              key={f.id}
              style={{
                ...doc_s.itemCard,
                position: 'relative',
                ...(sel.active && sel.isSelected(f.id) ? { borderColor: 'var(--accent)', background: 'var(--bg)' } : {}),
              }}
              onClick={() => (sel.active ? sel.toggle(f.id) : setCurrentFolder(f.id))}
              onDoubleClick={() => { if (!sel.active) setCurrentFolder(f.id); }}
            >
              {sel.active && (
                <input
                  type="checkbox"
                  checked={sel.isSelected(f.id)}
                  onChange={() => sel.toggle(f.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ position: 'absolute', top: 8, left: 8, width: 18, height: 18, cursor: 'pointer', zIndex: 2 }}
                />
              )}
              <div style={{ fontSize: 42, textAlign: 'center' }}>📁</div>
              {renaming?.id === f.id ? (
                <input
                  autoFocus
                  style={doc_s.renameInput}
                  value={renaming.newName}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setRenaming({ ...renaming, newName: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setRenaming(null); }}
                  onBlur={confirmRename}
                />
              ) : (
                <div style={doc_s.itemName}>{f.nom}</div>
              )}
              <div style={doc_s.itemMeta}>{formatDate(f.createdAt)}</div>
              {canWrite && (
                <div style={doc_s.itemActions} className="no-print">
                  <button className="touch-target" style={doc_s.miniBtn} onClick={(e) => { e.stopPropagation(); setMoving(f); }} title="Déplacer" aria-label="Déplacer">↗</button>
                  <button className="touch-target" style={doc_s.miniBtn} onClick={(e) => { e.stopPropagation(); startRename(f); }} title="Renommer" aria-label="Renommer">✎</button>
                  <button style={{ ...doc_s.miniBtn, color: 'var(--danger-strong)' }} onClick={(e) => { e.stopPropagation(); deleteDoc(f); }} title="Supprimer">🗑</button>
                </div>
              )}
            </div>
          ))}
          {/* Fichiers */}
          {files.map(f => (
            <div
              key={f.id}
              style={{
                ...doc_s.itemCard,
                position: 'relative',
                ...(sel.active && sel.isSelected(f.id) ? { borderColor: 'var(--accent)', background: 'var(--bg)' } : {}),
              }}
              onClick={() => (sel.active ? sel.toggle(f.id) : openFile(f))}
              onDoubleClick={() => { if (!sel.active) openFile(f); }}
              title={sel.active ? 'Cliquer pour sélectionner' : 'Cliquer pour ouvrir'}
            >
              {sel.active && (
                <input
                  type="checkbox"
                  checked={sel.isSelected(f.id)}
                  onChange={() => sel.toggle(f.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ position: 'absolute', top: 8, left: 8, width: 18, height: 18, cursor: 'pointer', zIndex: 2 }}
                />
              )}
              <div style={{ fontSize: 42, textAlign: 'center' }}>📄</div>
              {renaming?.id === f.id ? (
                <input
                  autoFocus
                  style={doc_s.renameInput}
                  value={renaming.newName}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setRenaming({ ...renaming, newName: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setRenaming(null); }}
                  onBlur={confirmRename}
                />
              ) : (
                <div style={doc_s.itemName} title={f.nom}>{f.nom}</div>
              )}
              <div style={doc_s.itemMeta}>{formatSize(f.taille)} · {formatDate(f.createdAt)}</div>
              <div style={doc_s.itemActions} className="no-print">
                <button style={doc_s.miniBtn} onClick={(e) => { e.stopPropagation(); downloadFile(f); }} title="Télécharger">⬇</button>
                {canWrite && <button className="touch-target" style={doc_s.miniBtn} onClick={(e) => { e.stopPropagation(); setMoving(f); }} title="Déplacer" aria-label="Déplacer">↗</button>}
                {canWrite && <button className="touch-target" style={doc_s.miniBtn} onClick={(e) => { e.stopPropagation(); startRename(f); }} title="Renommer" aria-label="Renommer">✎</button>}
                {canWrite && <button style={{ ...doc_s.miniBtn, color: 'var(--danger-strong)' }} onClick={(e) => { e.stopPropagation(); deleteDoc(f); }} title="Supprimer">🗑</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nouveau dossier */}
      {moving && (
        <div style={doc_s.overlay} onClick={() => setMoving(null)}>
          <div style={doc_s.modal} onClick={e => e.stopPropagation()}>
            <div style={doc_s.modalHeader}>
              <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-serif)' }}>
                Déplacer "{moving.nom}"
              </div>
              <button style={doc_s.closeBtn} onClick={() => setMoving(null)}>✕</button>
            </div>
            <div style={{ padding: '14px 18px', maxHeight: 400, overflowY: 'auto' }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
                Choisissez la destination :
              </div>
              {/* Racine */}
              <button
                style={{ ...doc_s.moveDestBtn, fontWeight: 700 }}
                onClick={() => moveDoc(null)}
              >
                📁 Racine (Documents)
              </button>
              {/* Tous les dossiers disponibles sauf lui-même */}
              {allDocs
                .filter(d => d.type === 'folder' && d.id !== moving.id && d.parentId !== moving.id)
                .sort((a, b) => a.nom.localeCompare(b.nom))
                .map(folder => {
                  // Breadcrumb pour le dossier
                  const getPath = (id) => {
                    const parts = [];
                    let cur = id;
                    let safety = 0;
                    while (cur && safety < 6) {
                      const d = allDocs.find(x => x.id === cur);
                      if (!d) break;
                      parts.unshift(d.nom);
                      cur = d.parentId;
                      safety++;
                    }
                    return parts.join(' / ');
                  };
                  return (
                    <button
                      key={folder.id}
                      style={doc_s.moveDestBtn}
                      onClick={() => moveDoc(folder.id)}
                    >
                      📁 {getPath(folder.id)}
                    </button>
                  );
                })
              }
            </div>
          </div>
        </div>
      )}

      {/* Modal nouveau dossier */}
      {showNewFolder && (
        <div className="modal-sheet-overlay" style={doc_s.overlay} onClick={() => setShowNewFolder(false)}>
          <div className="modal-sheet" style={doc_s.modal} onClick={e => e.stopPropagation()}>
            <div style={doc_s.modalHeader}>
              <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-serif)' }}>Nouveau dossier</div>
              <button style={doc_s.closeBtn} onClick={() => setShowNewFolder(false)}>✕</button>
            </div>
            <div style={{ padding: 22 }}>
              <label style={doc_s.fieldLabel}>Nom du dossier</label>
              <input
                autoFocus
                style={doc_s.fieldInput}
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createFolder(); }}
                placeholder="Ex: Contrats, Fiches techniques…"
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button style={doc_s.ghostBtn} onClick={() => setShowNewFolder(false)}>Annuler</button>
                <button style={doc_s.addBtn} onClick={createFolder}>Créer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modale de prévisualisation inline (PDF / image) ─── */}
      {previewing && (() => {
        const isPDF = /\.pdf$/i.test(previewing.doc.nom || '');
        const isImage = /\.(jpe?g|png|gif|webp|svg)$/i.test(previewing.doc.nom || '');
        return (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
              display: 'flex', flexDirection: 'column', zIndex: 1000,
            }}
            onClick={() => setPreviewing(null)}
          >
            {/* Header de la modale */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                background: '#1f2937', color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-serif)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {previewing.doc.nom}
                </div>
                <div style={{ fontSize: 11, color: 'var(--border2)', marginTop: 2 }}>
                  {isPDF ? 'PDF' : isImage ? 'Image' : 'Fichier'} · Cliquez à l'extérieur pour fermer
                </div>
              </div>
              <button
                style={{
                  padding: '6px 12px', background: 'rgba(255,255,255,0.1)',
                  color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6,
                  cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12,
                }}
                onClick={(e) => { e.stopPropagation(); downloadFile(previewing.doc); }}
                title="Télécharger ce fichier"
              >⬇ Télécharger</button>
              <button
                style={{
                  padding: '6px 12px', background: 'rgba(255,255,255,0.1)',
                  color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6,
                  cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12,
                }}
                onClick={(e) => { e.stopPropagation(); browserWindow?.open(previewing.url, '_blank'); }}
                title="Ouvrir dans un nouvel onglet"
              >↗ Ouvrir</button>
              <button
                style={{
                  padding: '6px 14px', background: 'rgba(255,255,255,0.1)',
                  color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6,
                  cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 16, lineHeight: 1,
                }}
                onClick={(e) => { e.stopPropagation(); setPreviewing(null); }}
                title="Fermer (Échap)"
              >✕</button>
            </div>

            {/* Body : iframe pour PDF, image pour les images */}
            <div
              style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
              onClick={e => e.stopPropagation()}
            >
              {isPDF && (
                <iframe
                  src={previewing.url}
                  title={previewing.doc.nom}
                  style={{ width: '100%', height: '100%', border: 'none', background: '#fff', borderRadius: 6 }}
                />
              )}
              {isImage && (
                <img
                  src={previewing.url}
                  alt={previewing.doc.nom}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }}
                />
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
};

const doc_s = {
  root: { display: 'flex', flexDirection: 'column', gap: 16 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  breadcrumb: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  crumbBtn: { background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', padding: '4px 6px', borderRadius: 4 },
  crumbSep: { color: 'var(--text2)', fontSize: 14 },
  headerRight: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  addBtn: { padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  ghostBtn: { padding: '8px 14px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 },
  itemCard: {
    background: 'var(--surface)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 10,
    padding: '16px 12px', cursor: 'pointer', position: 'relative', transition: 'box-shadow 0.15s, transform 0.15s',
  },
  itemName: { fontSize: 13, fontWeight: 600, textAlign: 'center', marginTop: 6, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemMeta: { fontSize: 10, color: 'var(--text2)', textAlign: 'center', marginTop: 4 },
  itemActions: { position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2 },
  miniBtn: { width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.9)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 12, padding: 0, color: 'var(--text2)' },

  renameInput: { width: '100%', marginTop: 6, padding: '4px 6px', fontSize: 12, fontWeight: 600, textAlign: 'center', border: '1px solid var(--accent)', borderRadius: 4, fontFamily: 'var(--font)', background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' },

  empty: { padding: 60, textAlign: 'center', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--surface)', borderRadius: 12, width: 420, maxWidth: '90%' },
  modalHeader: { padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text2)' },
  fieldLabel: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldInput: { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box' },
  moveDestBtn: { display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', margin: '4px 0', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, color: 'var(--text)', transition: 'background 0.1s' },
};

export default Documents;
