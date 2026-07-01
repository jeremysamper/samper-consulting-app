import React from 'react';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import {
  ACCEPTED_MIME, HEIC_EXTENSIONS, MAX_FILE_SIZE_MB, COMPRESSION_THRESHOLD_MB,
  getExtension, convertHeicToJpeg, maybeCompress,
} from './photoProcessing.js';

export default function PhotoUploader({ photoUrl, onUpload, onRemove, size = 100, emoji = '📖' }) {
  const fileRef = React.useRef(null);
  const [busy, setBusy] = React.useState(false);
  const [busyLabel, setBusyLabel] = React.useState('');

  const handleChange = async (e) => {
    const original = e.target.files?.[0];
    if (!original) return;

    // ─── Validation MIME / extension ───
    const ext = getExtension(original.name);
    const isHeic = HEIC_EXTENSIONS.has(ext) || /^image\/(heic|heif)$/i.test(original.type);
    const mime = original.type || (isHeic ? 'image/heic' : '');

    if (!isHeic && !ACCEPTED_MIME.has(mime)) {
      // Rejet explicite avec message clair par cas
      if (mime === 'application/pdf' || ext === 'pdf') {
        notifyLegacy('Les PDF ne sont pas acceptés pour une photo de plat. Choisissez une image JPG, PNG, WebP ou HEIC.', 'error');
      } else if (mime === 'image/gif' || ext === 'gif') {
        notifyLegacy('Les GIF ne sont pas acceptés (poids excessif). Préférez une JPG ou PNG.', 'error');
      } else if (mime === 'image/svg+xml' || ext === 'svg') {
        notifyLegacy('Les fichiers SVG ne sont pas acceptés. Utilisez une JPG ou PNG.', 'error');
      } else if (mime === 'image/tiff' || ext === 'tiff' || ext === 'tif') {
        notifyLegacy('Les TIFF ne sont pas acceptés (poids excessif). Convertissez en JPG.', 'error');
      } else {
        notifyLegacy(`Format non supporté (${mime || ext || 'inconnu'}). Formats acceptés : JPG, PNG, WebP, HEIC.`, 'error');
      }
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    // ─── Validation taille ───
    if (original.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      notifyLegacy(`Image trop volumineuse (${(original.size / 1024 / 1024).toFixed(1)} Mo). Limite : ${MAX_FILE_SIZE_MB} Mo.`, 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setBusy(true);
    try {
      let file = original;

      // ─── Conversion HEIC → JPEG si nécessaire ───
      // Les HEIC ne s'affichent pas dans la plupart des navigateurs (sauf Safari).
      // On convertit côté client pour stocker un format universel.
      if (isHeic) {
        setBusyLabel('Conversion HEIC…');
        try {
          file = await convertHeicToJpeg(file);
        } catch (err) {
          console.error('[PhotoUploader] HEIC conversion failed', err);
          notifyLegacy('Impossible de convertir cette photo HEIC. Réessayez avec un format JPG/PNG.', 'error');
          return;
        }
      }

      // ─── Compression si > seuil ───
      if (file.size > COMPRESSION_THRESHOLD_MB * 1024 * 1024) {
        setBusyLabel('Compression…');
        try {
          const compressed = await maybeCompress(file);
          // Garde-fou : si la compression a augmenté la taille (rare), on garde l'original
          file = compressed.size < file.size ? compressed : file;
        } catch (err) {
          console.warn('[PhotoUploader] compression failed, upload original', err);
          // Non-bloquant : on upload l'original
        }
      }

      // ─── Upload final ───
      setBusyLabel('Envoi…');
      await onUpload(file);
    } catch (err) {
      console.error('[PhotoUploader] upload error', err);
      notifyLegacy('Erreur pendant le traitement de la photo : ' + (err?.message || 'inconnue'), 'error');
    } finally {
      setBusy(false);
      setBusyLabel('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {photoUrl ? (
        <img src={photoUrl} alt="" style={{ width: size, height: size, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}/>
      ) : (
        <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 8, fontSize: size / 3, color: 'var(--text2)' }}>
          {emoji}
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 4, right: 4, display: 'flex', gap: 4 }}>
        <button
          type="button"
          style={{ minWidth: 26, height: 26, padding: busy ? '0 6px' : 0, borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: busy ? 'wait' : 'pointer', fontSize: 11, whiteSpace: 'nowrap' }}
          title={photoUrl ? 'Changer la photo' : 'Ajouter une photo'}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >{busy ? (busyLabel || '⏳') : '📷'}</button>
        {photoUrl && !busy && (
          <button
            type="button"
            style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(220,38,38,0.85)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}
            title="Retirer la photo"
            onClick={onRemove}
          >✕</button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </div>
  );
}
