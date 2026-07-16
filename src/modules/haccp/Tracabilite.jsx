import React from 'react';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { readText, writeText } from '../../utils/storage.js';
import { hs } from './HACCP.styles.js';
import {
  ACCEPTED_MIME, HEIC_EXTENSIONS, MAX_FILE_SIZE_MB, COMPRESSION_THRESHOLD_MB,
  getExtension, convertHeicToJpeg, maybeCompress,
} from '../consultant-tools/photoProcessing.js';
import { Camera, ChevronLeft, Trash2, X } from 'lucide-react';
import { userDisplayName } from '../../utils/userDisplay.js';

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const todayStr = () => new Date().toISOString().slice(0, 10);

// Une fois l'explication caméra acceptée sur cet appareil, on ne la remontre
// plus : la demande d'autorisation système suffit ensuite.
const CAMERA_ACK_KEY = 'sc_haccp_camera_ack';

// ─── Regroupe les entrées par Année > Mois > Jour ───
function groupByDate(items) {
  const byYear = {};
  for (const it of items) {
    if (!it.date) continue;
    const [y, m, d] = it.date.split('-');
    byYear[y] = byYear[y] || {};
    byYear[y][m] = byYear[y][m] || {};
    byYear[y][m][d] = byYear[y][m][d] || [];
    byYear[y][m][d].push(it);
  }
  return byYear;
}

const gStyles = {
  crumb: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text2)', marginBottom: 4 },
  crumbBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, fontSize: 13, padding: 0, fontFamily: 'var(--font)' },
  tileGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 },
  tile: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 12px', textAlign: 'center', cursor: 'pointer', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font)' },
  tileCount: { fontSize: 11, color: 'var(--text2)', fontWeight: 400, marginTop: 4 },
  photoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10 },
  photoTile: { position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer', aspectRatio: '1', background: 'var(--bg)' },
  photoImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  photoLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, padding: '4px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  lightboxImg: { width: '100%', maxHeight: '55vh', objectFit: 'contain', background: 'var(--bg)', borderRadius: 8 },
  // Aperçu de VALIDATION : grand format pour juger la netteté de l'étiquette
  // avant d'enregistrer (un 140px ne permettait pas de voir si c'était flou).
  preview: { width: '100%', maxHeight: '42vh', objectFit: 'contain', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', display: 'block', margin: '0 auto 10px' },
  previewHint: { fontSize: 12, color: 'var(--text2)', textAlign: 'center', marginBottom: 14 },
};

export default function Tracabilite({ etabId, legacySB, user, demoData, canWrite, canManage, registerCaptureTrigger }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const [year, setYear] = React.useState(null);
  const [month, setMonth] = React.useState(null);
  const [day, setDay] = React.useState(null);

  const [pending, setPending] = React.useState(null); // { file, previewUrl }
  const [form, setForm] = React.useState({ produit: '', notes: '', date: todayStr() });
  const [busy, setBusy] = React.useState(false);
  const [busyLabel, setBusyLabel] = React.useState('');
  const [lightbox, setLightbox] = React.useState(null);
  // Pop-up d'explication avant le tout premier accès caméra de l'appareil.
  const [showCameraInfo, setShowCameraInfo] = React.useState(false);

  const fileRef = React.useRef(null);

  // ─── Chargement paresseux : uniquement à l'activation de l'onglet (ce composant n'est monté que là) ───
  React.useEffect(() => {
    if (!legacySB) { setLoading(false); return; }
    let mounted = true;
    const reload = async () => {
      try {
        const rows = await legacySB.db.listHaccpTracabilite(etabId);
        if (mounted) setItems(rows);
      } catch (err) { console.error('[Tracabilite load]', err); }
      finally { if (mounted) setLoading(false); }
    };
    reload();
    const unsub = legacySB.realtime.subscribeReload(['haccp_tracabilite'], reload);
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId, legacySB]);

  // Premier usage sur l'appareil : on explique d'abord pourquoi la caméra est
  // sollicitée (pop-up), et c'est le bouton du pop-up qui ouvre la capture
  // (même geste utilisateur, donc le click programmé reste autorisé).
  const openPicker = React.useCallback(() => {
    if (readText(CAMERA_ACK_KEY) !== '1') { setShowCameraInfo(true); return; }
    fileRef.current?.click();
  }, []);
  const acceptCameraInfo = () => {
    writeText(CAMERA_ACK_KEY, '1');
    setShowCameraInfo(false);
    fileRef.current?.click();
  };
  React.useEffect(() => {
    if (!canWrite) return;
    // openPicker directement : registerCaptureTrigger enveloppe déjà la
    // fonction pour setState. L'ancien « () => openPicker » faisait que le
    // clic du bouton renvoyait la fonction au lieu de l'exécuter.
    registerCaptureTrigger && registerCaptureTrigger(openPicker);
  }, [registerCaptureTrigger, openPicker, canWrite]);

  const handleFile = async (e) => {
    const original = e.target.files?.[0];
    if (!original) return;

    const ext = getExtension(original.name);
    const isHeic = HEIC_EXTENSIONS.has(ext) || /^image\/(heic|heif)$/i.test(original.type);
    const mime = original.type || (isHeic ? 'image/heic' : '');

    if (!isHeic && !ACCEPTED_MIME.has(mime)) {
      notifyLegacy(`Format non supporté (${mime || ext || 'inconnu'}). Formats acceptés : JPG, PNG, WebP, HEIC.`, 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (original.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      notifyLegacy(`Image trop volumineuse (${(original.size / 1024 / 1024).toFixed(1)} Mo). Limite : ${MAX_FILE_SIZE_MB} Mo.`, 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setBusy(true);
    try {
      let file = original;
      if (isHeic) {
        setBusyLabel('Conversion HEIC…');
        try { file = await convertHeicToJpeg(file); }
        catch (err) {
          console.error('[Tracabilite] HEIC conversion failed', err);
          notifyLegacy('Impossible de convertir cette photo HEIC. Réessayez avec un format JPG/PNG.', 'error');
          return;
        }
      }
      if (file.size > COMPRESSION_THRESHOLD_MB * 1024 * 1024) {
        setBusyLabel('Compression…');
        try {
          const compressed = await maybeCompress(file);
          file = compressed.size < file.size ? compressed : file;
        } catch (err) { console.warn('[Tracabilite] compression failed, upload original', err); }
      }
      setPending({ file, previewUrl: URL.createObjectURL(file) });
      setForm({ produit: '', notes: '', date: todayStr() });
    } finally {
      setBusy(false);
      setBusyLabel('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const cancelPending = () => {
    if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
  };

  // Photo ratée (floue, mal cadrée) : on jette l'actuelle et on rouvre la
  // caméra dans la foulée - même geste utilisateur, donc le click programmé
  // sur l'input file reste autorisé par le navigateur.
  const retakePending = () => {
    cancelPending();
    fileRef.current?.click();
  };

  const savePending = async () => {
    if (!pending) return;
    setBusy(true);
    setBusyLabel('Envoi…');
    try {
      const { path, url } = await legacySB.db.uploadHaccpPhoto({ etabId, file: pending.file });
      const created = await legacySB.db.createHaccpTracabilite({
        etablissementId: etabId,
        date: form.date || todayStr(),
        produit: form.produit.trim(),
        photoUrl: url,
        storagePath: path,
        operateur: user?.id || null,
        notes: form.notes.trim(),
      });
      // Mise à jour optimiste : la photo apparaît tout de suite, sans attendre
      // l'aller-retour realtime (qui reste la source de vérité en cas d'écart).
      if (created) setItems(prev => [created, ...prev.filter(x => x.id !== created.id)]);
      notifyLegacy('Photo enregistrée', 'success');
      cancelPending();
    } catch (err) {
      console.error('[Tracabilite] save error', err);
      notifyLegacy('Erreur pendant l\'enregistrement : ' + (err?.message || 'inconnue'), 'error');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const deleteEntry = async (entry) => {
    if (!window.confirm('Supprimer cette photo de traçabilité ?')) return;
    try {
      await legacySB.db.deleteHaccpTracabilite(entry.id, entry.storagePath);
      setItems(prev => prev.filter(x => x.id !== entry.id));
      setLightbox(null);
      notifyLegacy('Photo supprimée', 'success');
    } catch (err) {
      console.error('[Tracabilite] delete error', err);
      notifyLegacy('Erreur pendant la suppression : ' + (err?.message || 'inconnue'), 'error');
    }
  };

  const grouped = React.useMemo(() => groupByDate(items), [items]);
  const years = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  // Si la branche affichée disparaît (suppression de la dernière photo du
  // jour/mois/année, localement ou via realtime), on remonte d'un niveau au
  // lieu de rendre grouped[...] undefined (crash du module).
  React.useEffect(() => {
    if (year && !grouped[year]) { setYear(null); setMonth(null); setDay(null); return; }
    if (year && month && !grouped[year][month]) { setMonth(null); setDay(null); return; }
    if (year && month && day && !grouped[year][month][day]) setDay(null);
  }, [grouped, year, month, day]);

  if (loading) return <div style={hs.empty}>Chargement…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />

      {/* ── Breadcrumb ── */}
      <div style={gStyles.crumb}>
        {(year || month || day) && (
          <button style={gStyles.crumbBtn} onClick={() => { setYear(null); setMonth(null); setDay(null); }}>
            <ChevronLeft size={14} style={{ verticalAlign: 'middle' }} /> Toutes les années
          </button>
        )}
        {year && !month && <span>{year}</span>}
        {year && month && (
          <>
            <span>·</span>
            <button style={gStyles.crumbBtn} onClick={() => { setMonth(null); setDay(null); }}>{year}</button>
          </>
        )}
        {year && month && !day && <span>{MOIS[Number(month) - 1]}</span>}
        {year && month && day && (
          <>
            <span>·</span>
            <button style={gStyles.crumbBtn} onClick={() => setDay(null)}>{MOIS[Number(month) - 1]}</button>
            <span>·</span>
            <span>{day}</span>
          </>
        )}
      </div>

      {/* ── Niveau Année ── */}
      {!year && (
        years.length === 0 ? <div style={hs.empty}>Aucune photo de traçabilité pour le moment.</div> : (
          <div style={gStyles.tileGrid}>
            {years.map(y => {
              const count = Object.values(grouped[y]).reduce((s, days) => s + Object.values(days).reduce((s2, arr) => s2 + arr.length, 0), 0);
              return (
                <div key={y} style={gStyles.tile} onClick={() => setYear(y)}>
                  {y}
                  <div style={gStyles.tileCount}>{count} photo{count > 1 ? 's' : ''}</div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Niveau Mois ── */}
      {year && !month && (
        <div style={gStyles.tileGrid}>
          {Object.keys(grouped[year] || {}).sort((a, b) => b.localeCompare(a)).map(m => {
            const count = Object.values(grouped[year][m]).reduce((s, arr) => s + arr.length, 0);
            return (
              <div key={m} style={gStyles.tile} onClick={() => setMonth(m)}>
                {MOIS[Number(m) - 1]}
                <div style={gStyles.tileCount}>{count} photo{count > 1 ? 's' : ''}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Niveau Jour ── */}
      {year && month && !day && (
        <div style={gStyles.tileGrid}>
          {Object.keys(grouped[year]?.[month] || {}).sort((a, b) => b.localeCompare(a)).map(d => (
            <div key={d} style={gStyles.tile} onClick={() => setDay(d)}>
              {d} {MOIS[Number(month) - 1]}
              <div style={gStyles.tileCount}>{grouped[year][month][d].length} photo{grouped[year][month][d].length > 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Grille de photos du jour ── */}
      {year && month && day && (
        <div style={gStyles.photoGrid}>
          {(grouped[year]?.[month]?.[day] || []).map(entry => (
            <div key={entry.id} style={gStyles.photoTile} onClick={() => setLightbox(entry)}>
              <img src={entry.photoUrl} alt={entry.produit || 'Photo traçabilité'} style={gStyles.photoImg} />
              {entry.produit && <div style={gStyles.photoLabel}>{entry.produit}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── Formulaire après capture ── */}
      {pending && (
        <div style={hs.overlay} onClick={cancelPending}>
          <div style={hs.modal} onClick={e => e.stopPropagation()}>
            <div style={hs.modalHeader}>
              <span style={hs.modalTitle}>Nouvelle photo de traçabilité</span>
              <button style={hs.closeBtn} onClick={cancelPending} disabled={busy}><X size={18} /></button>
            </div>
            <div style={hs.modalBody}>
              <img src={pending.previewUrl} alt="Aperçu de la photo à valider" style={gStyles.preview} />
              <div style={gStyles.previewHint}>Vérifiez que l'étiquette est nette et lisible avant d'enregistrer.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Date</label>
                  <input type="date" style={hs.fInput} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} disabled={busy} />
                </div>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Produit / fournisseur (optionnel)</label>
                  <input type="text" style={hs.fInput} placeholder="ex : Filet de bœuf – Boucherie Martin" value={form.produit} onChange={e => setForm(f => ({ ...f, produit: e.target.value }))} disabled={busy} />
                </div>
                <div style={hs.field}>
                  <label style={hs.fLabel}>Notes (n° de lot, DLC…)</label>
                  <input type="text" style={hs.fInput} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} disabled={busy} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                <button style={hs.cancelBtn} onClick={cancelPending} disabled={busy}>Annuler</button>
                <button style={hs.cancelBtn} onClick={retakePending} disabled={busy}>
                  <Camera size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Reprendre la photo
                </button>
                <button style={hs.saveBtn} onClick={savePending} disabled={busy}>{busy ? (busyLabel || '…') : '✓ Valider et enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Pop-up explication caméra (premier usage) ── */}
      {showCameraInfo && (
        <div style={hs.overlay} onClick={() => setShowCameraInfo(false)}>
          <div className="modal-sheet" style={hs.modal} onClick={e => e.stopPropagation()}>
            <div style={hs.modalHeader}>
              <span style={hs.modalTitle}>Accès à la caméra</span>
              <button style={hs.closeBtn} onClick={() => setShowCameraInfo(false)}><X size={18} /></button>
            </div>
            <div style={hs.modalBody}>
              <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 14px' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={26} />
                </div>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.55, textAlign: 'center' }}>
                Pour la traçabilité HACCP, l'application utilise l'appareil photo afin de
                photographier les étiquettes des produits.
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.55, textAlign: 'center', marginTop: 10 }}>
                La caméra n'est sollicitée que lorsque vous prenez une photo depuis ce module,
                jamais en arrière-plan. Votre appareil peut vous demander d'autoriser l'accès :
                acceptez pour continuer.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
                <button style={hs.cancelBtn} onClick={() => setShowCameraInfo(false)}>Annuler</button>
                <button style={hs.saveBtn} onClick={acceptCameraInfo}>
                  <Camera size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />Autoriser et prendre une photo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <div style={hs.overlay} onClick={() => setLightbox(null)}>
          <div style={hs.modal} onClick={e => e.stopPropagation()}>
            <div style={hs.modalHeader}>
              <span style={hs.modalTitle}>{lightbox.produit || 'Photo traçabilité'}</span>
              <button style={hs.closeBtn} onClick={() => setLightbox(null)}><X size={18} /></button>
            </div>
            <div style={hs.modalBody}>
              <img src={lightbox.photoUrl} alt="" style={gStyles.lightboxImg} />
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>Date : {lightbox.date}</span>
                {lightbox.operateur && <span>Opérateur : {userDisplayName(lightbox.operateur)}</span>}
                {lightbox.notes && <span>Notes : {lightbox.notes}</span>}
              </div>
              {canManage && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                  <button style={hs.cancelBtn} onClick={() => deleteEntry(lightbox)}><Trash2 size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Supprimer</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
