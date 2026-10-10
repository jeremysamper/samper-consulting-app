import React from 'react';
import { Folder, FileText, Image as ImageIcon, File as FileIcon, MoreVertical, ChevronRight } from 'lucide-react';
import { canManageModule, getPermissionsForRole } from '../../data/demoData.js';
import { confirmLegacy, getBrowserWindow, notifyLegacy } from '../../legacy/legacyApi.js';
import { readText, removeStorageKeys } from '../../utils/storage.js';
import { dbService } from '../../services/dbService.js';
import { useSelection } from '../../hooks/useSelection.js';
import { useResumeRefresh } from '../../hooks/useResumeRefresh.js';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { makeSearchMatcher } from '../../utils/searchText.js';

// ═════════════════════════════════════════════════════════════════════════════
// MODULE DOCUMENTS - dossiers et fichiers de l'établissement
//
// Chaque établissement a son arborescence (table `documents`, fichiers dans le
// bucket `documents` sous <etablissement_id>/…). La RLS cloisonne par
// établissement, et depuis la migration 20261002 un déclencheur refuse tout
// rangement dans un dossier d'un autre établissement, dans un fichier, ou dans
// un de ses propres sous-dossiers — deux dossiers du Panorama avaient fini
// rangés chez Woodland, invisibles des deux côtés.
//
// Factures (classement automatique des factures) et Outils consultant (cartes
// envoyées dans « Draft ») écrivent aussi ici : même table, mêmes helpers.
//
// Lecture STRICTE : une lecture ratée (réveil de tablette, réseau) est
// annoncée et réessayée, jamais affichée comme « Aucun document ».
// ═════════════════════════════════════════════════════════════════════════════

const TAILLE_MAX = 50 * 1024 * 1024; // limite du bucket

// Formats acceptés : ceux autorisés par le bucket. Le type est déduit de
// l'extension quand le navigateur ne le donne pas (photos HEIC sur Safari).
const FORMATS = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif',
};
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif';

const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;

const extensionDe = (nom) => (/\.([a-z0-9]+)$/i.exec(String(nom || ''))?.[1] || '').toLowerCase();

// 'folder' | 'pdf' | 'image' | 'autre'
const natureDe = (doc) => {
  if (doc.type === 'folder') return 'folder';
  const ext = extensionDe(doc.nom);
  if (ext === 'pdf' || doc.mimeType === 'application/pdf') return 'pdf';
  if (/^image\//.test(doc.mimeType || '') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)) return 'image';
  return 'autre';
};

// Tri naturel : « 2 - Février » avant « 10 - Octobre », accents ignorés.
const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
const trier = (a, b) => {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
  return collator.compare(a.nom || '', b.nom || '');
};

const formatTaille = (octets) => {
  if (!octets) return '';
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
};

const formatDate = (ts) => (ts
  ? new Date(ts).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Zurich' })
  : '');

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

const Documents = ({ user, etablissement }) => {
  const etabId = etablissement?.id || 'etab-1';
  const browserWindow = getBrowserWindow();
  const legacySB = dbService.getBridge();

  const perms = getPermissionsForRole(user.role);
  const canRead = perms.documents !== false;
  const canWrite = canRead && canManageModule(user.role, 'documents');

  const [allDocs, setAllDocs] = React.useState([]);
  // 'loading' = premier chargement · 'ready' · 'error' = dernière lecture
  // ratée, la liste affichée est la précédente (conservée).
  const [status, setStatus] = React.useState(legacySB ? 'loading' : 'ready');
  const [currentFolder, setCurrentFolder] = React.useState(null); // null = racine
  const [search, setSearch] = React.useState('');
  const [upload, setUpload] = React.useState(null); // { fait, total, nom } | null
  const [dragOver, setDragOver] = React.useState(false);
  const [nouveauDossier, setNouveauDossier] = React.useState(null); // nom en saisie | null
  const [renommage, setRenommage] = React.useState(null); // { doc, nom } | null
  const [deplacement, setDeplacement] = React.useState(null); // doc | null
  const [actions, setActions] = React.useState(null); // doc dont le menu est ouvert
  const [apercu, setApercu] = React.useState(null); // { doc, url } | null
  const [busy, setBusy] = React.useState(false);
  const sel = useSelection();
  const fileInputRef = React.useRef(null);

  // Échap ferme l'aperçu.
  React.useEffect(() => {
    if (!apercu) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setApercu(null); };
    browserWindow?.addEventListener('keydown', onKey);
    return () => browserWindow?.removeEventListener('keydown', onKey);
  }, [apercu, browserWindow]);

  // ═══ Chargement, temps réel, réveil ═══
  const reloadRef = React.useRef(null);
  React.useEffect(() => {
    if (!legacySB) return undefined;
    let mounted = true;
    let retryTimer = null;
    let retryDelay = RETRY_MIN_MS;
    const reload = async () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      try {
        const docs = await legacySB.db.listDocuments(etabId, { strict: true });
        if (!mounted) return;
        setAllDocs(Array.isArray(docs) ? docs : []);
        setStatus('ready');
        retryDelay = RETRY_MIN_MS;
      } catch (err) {
        if (!mounted) return;
        console.error('[Documents load]', err);
        setStatus('error');
        retryTimer = setTimeout(reload, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
      }
    };
    reloadRef.current = reload;
    reload();
    const unsub = legacySB.realtime.subscribeReload('documents', reload);
    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (reloadRef.current === reload) reloadRef.current = null;
      unsub && unsub();
    };
  }, [etabId, legacySB]);
  const recharger = React.useCallback(() => { reloadRef.current && reloadRef.current(); }, []);
  useResumeRefresh(recharger);

  // ═══ Index de l'arborescence ═══
  const parId = React.useMemo(() => new Map(allDocs.map(d => [d.id, d])), [allDocs]);
  const enfants = React.useMemo(() => {
    const m = new Map();
    allDocs.forEach(d => {
      const k = d.parentId || null;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d);
    });
    m.forEach(l => l.sort(trier));
    return m;
  }, [allDocs]);

  // Dossier ouvert depuis un autre module (carte envoyée dans « Draft »).
  React.useEffect(() => {
    if (status !== 'ready') return;
    const id = readText('sc_documents_open_folder', '');
    if (!id) return;
    if (parId.get(id)?.type === 'folder') setCurrentFolder(id);
    removeStorageKeys(['sc_documents_open_folder']);
  }, [status, parId]);

  // Dossier courant supprimé ou déplacé hors d'atteinte (autre poste) : retour
  // à la racine plutôt qu'un écran vide sans chemin.
  React.useEffect(() => {
    if (status === 'ready' && currentFolder && !parId.has(currentFolder)) setCurrentFolder(null);
  }, [status, currentFolder, parId]);

  const chemin = React.useCallback((id) => {
    const parts = [];
    let cur = id;
    for (let i = 0; cur && i < 50; i += 1) {
      const d = parId.get(cur);
      if (!d) break;
      parts.unshift(d);
      cur = d.parentId;
    }
    return parts;
  }, [parId]);

  // Tous les descendants d'un dossier (pour le menu de déplacement et le
  // message de suppression).
  const descendants = React.useCallback((id) => {
    const out = [];
    const pile = [...(enfants.get(id) || [])];
    while (pile.length) {
      const d = pile.pop();
      out.push(d);
      if (d.type === 'folder') pile.push(...(enfants.get(d.id) || []));
    }
    return out;
  }, [enfants]);

  // ═══ Liste affichée ═══
  // Recherche : dans TOUT l'établissement, chemin affiché sous chaque résultat.
  const recherche = search.trim();
  const liste = React.useMemo(() => {
    if (!recherche) return enfants.get(currentFolder) || [];
    const match = makeSearchMatcher(recherche);
    return allDocs.filter(d => match(d.nom)).sort(trier);
  }, [recherche, allDocs, enfants, currentFolder]);

  const filAriane = chemin(currentFolder);
  const dossierCourant = currentFolder ? parId.get(currentFolder) : null;

  // ═══ Import ═══
  const importer = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || !legacySB || !canWrite) return;
    const refuses = [];
    const valides = [];
    files.forEach((file) => {
      const mime = FORMATS[extensionDe(file.name)] || (Object.values(FORMATS).includes(file.type) ? file.type : null);
      if (!mime) refuses.push(`${file.name} : format non accepté (PDF ou photo)`);
      else if (file.size > TAILLE_MAX) refuses.push(`${file.name} : plus de 50 Mo`);
      else valides.push({ file, mime });
    });
    if (refuses.length) notifyLegacy(`Ignoré${refuses.length > 1 ? 's' : ''} : ${refuses.join(' · ')}`, 'warning');
    if (!valides.length) return;

    const parentId = currentFolder;
    let ok = 0;
    for (let i = 0; i < valides.length; i += 1) {
      const { file, mime } = valides[i];
      setUpload({ fait: i, total: valides.length, nom: file.name });
      try {
        await legacySB.db.uploadFile({ etablissementId: etabId, parentId, file, userId: user.id, contentType: mime });
        ok += 1;
      } catch (err) {
        console.error('[Documents upload]', err);
        notifyLegacy(`« ${file.name} » n'a pas pu être importé : ${err.message || err}`, 'error');
      }
    }
    setUpload(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (ok) notifyLegacy(`${pluriel(ok, 'document')} importé${ok > 1 ? 's' : ''}.`, 'success');
    recharger();
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (canWrite && !upload) importer(e.dataTransfer?.files);
  };

  // ═══ Ouvrir, télécharger ═══
  const ouvrir = async (doc) => {
    if (doc.type === 'folder') { setSearch(''); setCurrentFolder(doc.id); return; }
    if (!legacySB) return;
    try {
      const url = await legacySB.db.getFileURL(doc.storagePath);
      const nature = natureDe(doc);
      if (nature === 'pdf' || nature === 'image') setApercu({ doc, url });
      else browserWindow?.open(url, '_blank');
    } catch (err) {
      notifyLegacy('Ouverture impossible : ' + (err.message || err), 'error');
    }
  };

  // URL signée « pièce jointe » : le fichier s'enregistre, y compris sur iPad,
  // au lieu de s'ouvrir dans un onglet.
  const telecharger = async (doc) => {
    if (!legacySB || doc.type !== 'file') return;
    try {
      const url = await legacySB.db.getFileURL(doc.storagePath, { download: doc.nom });
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      notifyLegacy('Téléchargement impossible : ' + (err.message || err), 'error');
    }
  };

  // ═══ Dossiers, renommage, déplacement, suppression ═══
  const nomPris = (nom, parentId, saufId = null) => {
    const cle = nom.trim().toLowerCase();
    return (enfants.get(parentId || null) || []).some(d => d.id !== saufId && (d.nom || '').trim().toLowerCase() === cle);
  };

  const creerDossier = async () => {
    const nom = (nouveauDossier || '').trim();
    if (!nom || !legacySB) return;
    if (nomPris(nom, currentFolder)) { notifyLegacy(`« ${nom} » existe déjà ici.`, 'warning'); return; }
    setBusy(true);
    try {
      await legacySB.db.createFolder({ etablissementId: etabId, parentId: currentFolder, nom, userId: user.id });
      setNouveauDossier(null);
      recharger();
    } catch (err) {
      notifyLegacy('Création impossible : ' + (err.message || err), 'error');
    } finally { setBusy(false); }
  };

  const renommer = async () => {
    if (!renommage || !legacySB) return;
    const { doc } = renommage;
    let nom = renommage.nom.trim();
    if (!nom || nom === doc.nom) { setRenommage(null); return; }
    // L'extension d'un fichier est conservée : sans elle, l'aperçu et le
    // téléchargement ne sauraient plus quel type ouvrir.
    const ext = extensionDe(doc.nom);
    if (doc.type === 'file' && ext && extensionDe(nom) !== ext) nom = `${nom}.${ext}`;
    if (nomPris(nom, doc.parentId, doc.id)) { notifyLegacy(`« ${nom} » existe déjà dans ce dossier.`, 'warning'); return; }
    setBusy(true);
    try {
      await legacySB.db.renameDocument(doc.id, nom);
      setRenommage(null);
      recharger();
    } catch (err) {
      notifyLegacy('Renommage impossible : ' + (err.message || err), 'error');
    } finally { setBusy(false); }
  };

  const deplacer = async (cibleId) => {
    const doc = deplacement;
    if (!doc || !legacySB) return;
    if ((doc.parentId || null) === (cibleId || null)) { setDeplacement(null); return; }
    setBusy(true);
    try {
      // Le déclencheur en base refuse aussi les boucles et les dossiers d'un
      // autre établissement : son message remonte tel quel.
      await legacySB.db.moveDocument(doc.id, cibleId);
      setDeplacement(null);
      const dest = cibleId ? parId.get(cibleId)?.nom : 'Documents';
      notifyLegacy(`« ${doc.nom} » déplacé dans ${dest}.`, 'success');
      recharger();
    } catch (err) {
      notifyLegacy('Déplacement impossible : ' + (err.message || err), 'error');
    } finally { setBusy(false); }
  };

  const messageSuppression = (docs) => {
    const contenus = docs.filter(d => d.type === 'folder').flatMap(d => descendants(d.id));
    const nbFichiers = contenus.filter(d => d.type === 'file').length;
    const nbDossiers = contenus.filter(d => d.type === 'folder').length;
    const tete = docs.length === 1 ? `Supprimer « ${docs[0].nom} » ?` : `Supprimer ${pluriel(docs.length, 'élément')} ?`;
    if (!contenus.length) return `${tete}\n\nCette action est définitive.`;
    const detail = [nbFichiers && pluriel(nbFichiers, 'fichier'), nbDossiers && pluriel(nbDossiers, 'sous-dossier')].filter(Boolean).join(' et ');
    return `${tete}\n\nLe contenu sera supprimé avec : ${detail}. Cette action est définitive.`;
  };

  const supprimer = async (docs) => {
    if (!docs.length || !legacySB) return;
    if (!confirmLegacy(messageSuppression(docs))) return;
    setBusy(true);
    let ok = 0;
    for (const doc of docs) {
      try { await legacySB.db.deleteDocument(doc); ok += 1; }
      catch (err) { console.error('[Documents delete]', err); notifyLegacy(`« ${doc.nom} » n'a pas pu être supprimé : ${err.message || err}`, 'error'); }
    }
    setBusy(false);
    if (sel.active) sel.exit();
    if (ok) notifyLegacy(`${pluriel(ok, 'élément')} supprimé${ok > 1 ? 's' : ''}.`, 'success');
    recharger();
  };

  // Destinations de déplacement : arborescence complète, sans le document
  // déplacé ni ses sous-dossiers (le ranger dedans le ferait disparaître).
  const destinations = React.useMemo(() => {
    if (!deplacement) return [];
    const exclus = new Set([deplacement.id, ...descendants(deplacement.id).map(d => d.id)]);
    const out = [];
    const parcourir = (parentId, niveau) => {
      (enfants.get(parentId) || []).forEach((d) => {
        if (d.type !== 'folder' || exclus.has(d.id)) return;
        out.push({ dossier: d, niveau });
        parcourir(d.id, niveau + 1);
      });
    };
    parcourir(null, 1);
    return out;
  }, [deplacement, enfants, descendants]);

  if (!canRead) {
    return (
      <div style={ds.vide}>
        <div style={ds.videTitre}>Accès restreint</div>
        <div style={ds.videTexte}>Votre rôle n'a pas accès aux documents.</div>
      </div>
    );
  }

  // ═══ Rendu ═══
  const metaDe = (doc) => {
    if (doc.type === 'folder') {
      const n = (enfants.get(doc.id) || []).length;
      return n ? pluriel(n, 'élément') : 'Vide';
    }
    return [formatTaille(doc.taille), formatDate(doc.createdAt)].filter(Boolean).join(' · ');
  };

  const icone = (doc) => {
    const nature = natureDe(doc);
    const Comp = nature === 'folder' ? Folder : nature === 'pdf' ? FileText : nature === 'image' ? ImageIcon : FileIcon;
    return (
      <span style={{ ...ds.icone, ...(nature === 'folder' ? ds.iconeDossier : null) }} aria-hidden="true">
        <Comp size={20} strokeWidth={1.8} />
      </span>
    );
  };

  const ligne = (doc) => {
    const selectionne = sel.active && sel.isSelected(doc.id);
    // En recherche, chaque résultat dit où il se trouve.
    const ou = recherche ? (chemin(doc.parentId).map(d => d.nom).join(' / ') || 'Documents') : '';
    return (
      <div
        key={doc.id}
        role="button"
        tabIndex={0}
        style={{ ...ds.ligne, ...(selectionne ? ds.ligneSel : null) }}
        onClick={() => (sel.active ? sel.toggle(doc.id) : ouvrir(doc))}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel.active ? sel.toggle(doc.id) : ouvrir(doc); } }}
        aria-label={doc.type === 'folder' ? `Ouvrir le dossier ${doc.nom}` : `Ouvrir ${doc.nom}`}
      >
        {sel.active && (
          <label style={ds.caseCible} onClick={e => e.stopPropagation()}>
            <input type="checkbox" checked={selectionne} onChange={() => sel.toggle(doc.id)} style={ds.case} aria-label={`Sélectionner ${doc.nom}`} />
          </label>
        )}
        {icone(doc)}
        <div style={ds.ligneInfo}>
          <div style={ds.ligneNom}>{doc.nom}</div>
          <div style={ds.ligneMeta}>{ou ? `Dans ${ou} · ${metaDe(doc)}` : metaDe(doc)}</div>
        </div>
        {!sel.active && (
          <button
            type="button"
            style={ds.menuBtn}
            aria-label={`Actions pour ${doc.nom}`}
            onClick={(e) => { e.stopPropagation(); setActions(doc); }}
            onKeyDown={e => e.stopPropagation()}
          >
            <MoreVertical size={18} />
          </button>
        )}
        {!sel.active && doc.type === 'folder' && <ChevronRight size={18} style={{ color: 'var(--text3)', flexShrink: 0 }} aria-hidden="true" />}
      </div>
    );
  };

  return (
    <div
      style={ds.root}
      onDragOver={canWrite ? (e) => { e.preventDefault(); if (!dragOver) setDragOver(true); } : undefined}
      onDragLeave={canWrite ? (e) => { if (e.currentTarget === e.target) setDragOver(false); } : undefined}
      onDrop={canWrite ? onDrop : undefined}
    >
      {/* ── Chemin + actions ── */}
      <div style={ds.entete}>
        <nav style={ds.fil} aria-label="Emplacement">
          <button type="button" style={{ ...ds.filBtn, ...(currentFolder ? null : ds.filBtnActif) }} onClick={() => setCurrentFolder(null)}>Documents</button>
          {filAriane.map((f, i) => (
            <React.Fragment key={f.id}>
              <span style={ds.filSep} aria-hidden="true">/</span>
              <button
                type="button"
                style={{ ...ds.filBtn, ...(i === filAriane.length - 1 ? ds.filBtnActif : null) }}
                onClick={() => setCurrentFolder(f.id)}
              >{f.nom}</button>
            </React.Fragment>
          ))}
        </nav>
        <div className="module-actions">
          <SearchToggle value={search} onChange={setSearch} placeholder="Rechercher dans tous les dossiers…" />
          {canWrite && !sel.active && liste.length > 0 && (
            <button type="button" style={ds.btnGhost} onClick={sel.enter}>Sélectionner</button>
          )}
          {canWrite && (
            <>
              <button type="button" style={ds.btnGhost} onClick={() => setNouveauDossier('')}>Nouveau dossier</button>
              <label style={{ ...ds.btnPrimaire, cursor: upload ? 'wait' : 'pointer', opacity: upload ? 0.7 : 1 }}>
                {upload ? `Import ${upload.fait + 1}/${upload.total}…` : 'Importer'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => importer(e.target.files)}
                  disabled={!!upload}
                />
              </label>
            </>
          )}
        </div>
      </div>

      {/* ── Lecture en échec : la liste précédente reste affichée ── */}
      {status === 'error' && (
        <div style={ds.banniere}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong>Documents indisponibles pour le moment.</strong> La dernière lecture a échoué (réseau ou session expirée) ; nouvel essai automatique en cours.
          </span>
          <button type="button" style={ds.btnGhost} onClick={recharger}>Réessayer</button>
        </div>
      )}

      {sel.active && (
        <SelectionToolbar
          count={sel.count}
          total={liste.length}
          allSelected={sel.count > 0 && sel.count === liste.length}
          onToggleAll={() => (sel.count === liste.length ? sel.clear() : sel.selectAll(liste.map(d => d.id)))}
          onDelete={() => supprimer(allDocs.filter(d => sel.ids.has(d.id)))}
          onCancel={sel.exit}
          busy={busy}
        />
      )}

      {/* ── Zone de dépôt (glisser des fichiers depuis l'ordinateur) ── */}
      {dragOver && canWrite && (
        <div style={ds.depot}>Déposez vos PDF ou photos pour les importer dans {dossierCourant ? `« ${dossierCourant.nom} »` : 'Documents'}</div>
      )}

      {/* ── Contenu ── */}
      {status === 'loading' ? (
        <div style={ds.vide}><div style={ds.videTexte}>Chargement des documents…</div></div>
      ) : liste.length === 0 ? (
        <div style={ds.vide}>
          <div style={ds.videTitre}>
            {recherche ? `Aucun document ne correspond à « ${recherche} »`
              : status === 'error' ? 'Documents indisponibles'
                : currentFolder ? 'Ce dossier est vide' : 'Aucun document'}
          </div>
          {canWrite && !recherche && status !== 'error' && (
            <div style={ds.videTexte}>Importez des PDF ou des photos, ou glissez-les ici depuis l'ordinateur.</div>
          )}
        </div>
      ) : (
        <div style={ds.liste}>
          {recherche && <div style={ds.listeTitre}>{pluriel(liste.length, 'résultat')} dans tous les dossiers</div>}
          {liste.map(ligne)}
        </div>
      )}

      {/* ── Menu d'actions d'un élément ── */}
      {actions && (
        <div className="modal-sheet-overlay" style={ds.overlay} onClick={() => setActions(null)}>
          <div className="modal-sheet" style={ds.modal} onClick={e => e.stopPropagation()}>
            <div style={ds.modalTete}>
              <div style={ds.modalTitre}>{actions.nom}</div>
              <button type="button" style={ds.fermer} onClick={() => setActions(null)} aria-label="Fermer">✕</button>
            </div>
            <div style={ds.menuListe}>
              <button type="button" style={ds.menuItem} onClick={() => { const d = actions; setActions(null); ouvrir(d); }}>Ouvrir</button>
              {actions.type === 'file' && (
                <button type="button" style={ds.menuItem} onClick={() => { const d = actions; setActions(null); telecharger(d); }}>Télécharger</button>
              )}
              {canWrite && (
                <>
                  <button type="button" style={ds.menuItem} onClick={() => { const d = actions; setActions(null); setRenommage({ doc: d, nom: d.nom }); }}>Renommer</button>
                  <button type="button" style={ds.menuItem} onClick={() => { const d = actions; setActions(null); setDeplacement(d); }}>Déplacer</button>
                  <button type="button" style={{ ...ds.menuItem, color: 'var(--danger-strong)' }} onClick={() => { const d = actions; setActions(null); supprimer([d]); }}>Supprimer</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Nouveau dossier ── */}
      {nouveauDossier !== null && (
        <div className="modal-sheet-overlay" style={ds.overlay} onClick={() => setNouveauDossier(null)}>
          <div className="modal-sheet" style={ds.modal} onClick={e => e.stopPropagation()}>
            <div style={ds.modalTete}>
              <div style={ds.modalTitre}>Nouveau dossier</div>
              <button type="button" style={ds.fermer} onClick={() => setNouveauDossier(null)} aria-label="Fermer">✕</button>
            </div>
            <div style={ds.modalCorps}>
              <label style={ds.champLabel}>Nom du dossier</label>
              <input
                autoFocus
                style={ds.champ}
                value={nouveauDossier}
                onChange={e => setNouveauDossier(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') creerDossier(); }}
                placeholder="Ex : Contrats, Fiches techniques…"
              />
              <div style={ds.aide}>Créé dans {dossierCourant ? `« ${dossierCourant.nom} »` : 'Documents'}.</div>
              <div style={ds.modalPied}>
                <button type="button" style={ds.btnGhost} onClick={() => setNouveauDossier(null)}>Annuler</button>
                <button type="button" style={{ ...ds.btnPrimaire, opacity: nouveauDossier.trim() && !busy ? 1 : 0.5 }} disabled={!nouveauDossier.trim() || busy} onClick={creerDossier}>Créer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Renommer ── */}
      {renommage && (
        <div className="modal-sheet-overlay" style={ds.overlay} onClick={() => setRenommage(null)}>
          <div className="modal-sheet" style={ds.modal} onClick={e => e.stopPropagation()}>
            <div style={ds.modalTete}>
              <div style={ds.modalTitre}>Renommer</div>
              <button type="button" style={ds.fermer} onClick={() => setRenommage(null)} aria-label="Fermer">✕</button>
            </div>
            <div style={ds.modalCorps}>
              <input
                autoFocus
                style={ds.champ}
                value={renommage.nom}
                onChange={e => setRenommage(r => ({ ...r, nom: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') renommer(); }}
              />
              {renommage.doc.type === 'file' && extensionDe(renommage.doc.nom) && (
                <div style={ds.aide}>L'extension .{extensionDe(renommage.doc.nom)} est conservée.</div>
              )}
              <div style={ds.modalPied}>
                <button type="button" style={ds.btnGhost} onClick={() => setRenommage(null)}>Annuler</button>
                <button type="button" style={{ ...ds.btnPrimaire, opacity: renommage.nom.trim() && !busy ? 1 : 0.5 }} disabled={!renommage.nom.trim() || busy} onClick={renommer}>Renommer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Déplacer ── */}
      {deplacement && (
        <div className="modal-sheet-overlay" style={ds.overlay} onClick={() => setDeplacement(null)}>
          <div className="modal-sheet" style={{ ...ds.modal, width: 480 }} onClick={e => e.stopPropagation()}>
            <div style={ds.modalTete}>
              <div style={ds.modalTitre}>Déplacer « {deplacement.nom} »</div>
              <button type="button" style={ds.fermer} onClick={() => setDeplacement(null)} aria-label="Fermer">✕</button>
            </div>
            <div style={{ ...ds.modalCorps, paddingTop: 10, maxHeight: '60vh', overflowY: 'auto' }}>
              {[{ dossier: null, niveau: 0 }, ...destinations].map(({ dossier, niveau }) => {
                const id = dossier ? dossier.id : null;
                const actuel = (deplacement.parentId || null) === id;
                return (
                  <button
                    key={id || 'racine'}
                    type="button"
                    disabled={actuel || busy}
                    style={{ ...ds.destBtn, paddingLeft: 14 + niveau * 18, ...(actuel ? ds.destActuel : null) }}
                    onClick={() => deplacer(id)}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>{dossier ? dossier.nom : 'Documents (racine)'}</span>
                    {actuel && <span style={ds.destNote}>Emplacement actuel</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Aperçu PDF / photo ── */}
      {apercu && (() => {
        const nature = natureDe(apercu.doc);
        return (
          <div style={ds.apercuFond} onClick={() => setApercu(null)}>
            <div style={ds.apercuTete} onClick={e => e.stopPropagation()}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={ds.apercuNom}>{apercu.doc.nom}</div>
                <div style={ds.apercuMeta}>{metaDe(apercu.doc)}</div>
              </div>
              {/* Liens directs : l'URL est déjà signée, le tap reste un geste
                  utilisateur et l'ouverture n'est pas bloquée sur iPad (où un
                  PDF intégré n'affiche souvent que sa première page). */}
              <a href={apercu.url} target="_blank" rel="noreferrer" style={ds.apercuBtn}>Plein écran</a>
              <button type="button" style={ds.apercuBtn} onClick={() => telecharger(apercu.doc)}>Télécharger</button>
              <button type="button" style={ds.apercuBtn} onClick={() => setApercu(null)} aria-label="Fermer">✕</button>
            </div>
            <div style={ds.apercuCorps} onClick={e => e.stopPropagation()}>
              {nature === 'pdf' && <iframe src={apercu.url} title={apercu.doc.nom} style={ds.apercuPdf} />}
              {nature === 'image' && <img src={apercu.url} alt={apercu.doc.nom} style={ds.apercuImg} />}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

const ds = {
  root: { display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 },
  entete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  fil: { display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', minWidth: 0 },
  filBtn: { background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', padding: '6px 8px', borderRadius: 6, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  filBtnActif: { color: 'var(--text)' },
  filSep: { color: 'var(--text3)', fontSize: 14 },
  btnPrimaire: { padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  btnGhost: { padding: '8px 14px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 },

  banniere: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '11px 14px', background: 'var(--warning-bg)', border: '1px solid var(--warning-bd)', borderRadius: 10, color: 'var(--warning-text)', fontSize: 12.5, lineHeight: 1.5 },
  depot: { padding: '18px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'var(--bg)', border: '2px dashed var(--accent)', borderRadius: 12 },

  liste: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-xs)', overflow: 'hidden' },
  listeTitre: { padding: '10px 14px', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)' },
  // Base de bordure en borderWidth/Style/Color : la sélection ne surcharge
  // que borderColor (cf. npm run lint:borders).
  ligne: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px 10px 14px', minHeight: 60, cursor: 'pointer', borderWidth: '0 0 1px 0', borderStyle: 'solid', borderColor: 'var(--border)', background: 'transparent', outline: 'none' },
  ligneSel: { background: 'var(--bg)', borderColor: 'var(--accent)' },
  icone: { width: 28, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text2)' },
  iconeDossier: { color: 'var(--accent)' },
  ligneInfo: { flex: 1, minWidth: 0 },
  ligneNom: { fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  ligneMeta: { fontSize: 11.5, color: 'var(--text2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // 44 × 44 : cible tactile pleine, flexShrink 0 contre le min-height global.
  menuBtn: { width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 10, color: 'var(--text2)', cursor: 'pointer', padding: 0 },
  caseCible: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, margin: '-4px -6px -4px -8px', flexShrink: 0 },
  case: { width: 20, height: 20, margin: 0, accentColor: 'var(--accent)' },

  vide: { padding: '48px 20px', textAlign: 'center', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12 },
  videTitre: { fontSize: 15, fontWeight: 600, color: 'var(--text)' },
  videTexte: { fontSize: 13, color: 'var(--text2)', marginTop: 6 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modal: { background: 'var(--surface)', borderRadius: 14, width: 420, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalTete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 },
  modalTitre: { fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-serif)', color: 'var(--text)', minWidth: 0, overflowWrap: 'anywhere' },
  fermer: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text2)', flexShrink: 0 },
  modalCorps: { padding: '18px 18px 20px' },
  modalPied: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 },
  menuListe: { display: 'flex', flexDirection: 'column', padding: 6 },
  menuItem: { minHeight: 48, flexShrink: 0, padding: '0 16px', textAlign: 'left', background: 'none', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)' },
  champLabel: { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  // 16 px : en dessous, Safari iOS zoome la page au focus.
  champ: { width: '100%', padding: '11px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 16, color: 'var(--text)', background: 'var(--bg)', fontFamily: 'var(--font)', boxSizing: 'border-box', outline: 'none' },
  aide: { fontSize: 11.5, color: 'var(--text2)', marginTop: 6 },
  destBtn: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, flexShrink: 0, textAlign: 'left', padding: '8px 14px', margin: '3px 0', background: 'var(--bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13.5, color: 'var(--text)' },
  destActuel: { cursor: 'default', opacity: 0.6, borderColor: 'var(--accent)' },
  destNote: { fontSize: 11, color: 'var(--text2)', flexShrink: 0 },

  apercuFond: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', zIndex: 1000 },
  apercuTete: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(0,0,0,0.55)', color: '#fff', flexWrap: 'wrap' },
  apercuNom: { fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  apercuMeta: { fontSize: 11, opacity: 0.75, marginTop: 2 },
  apercuBtn: { display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 14px', background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, textDecoration: 'none', flexShrink: 0 },
  apercuCorps: { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 },
  apercuPdf: { width: '100%', height: '100%', border: 'none', background: '#fff', borderRadius: 6 },
  apercuImg: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 },
};

export default Documents;
