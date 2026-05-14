import React from 'react';
import { notifyLegacy } from '../../legacy/legacyApi.js';

// ─── Formats acceptés ───
// On whitelist explicitement les MIME types pour éviter les surprises.
// SVG est exclu pour des raisons de sécurité (XSS via SVG inline), PDF/GIF/TIFF
// sont exclus car non adaptés à une photo de plat.
const ACCEPTED_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/heic', 'image/heif',
]);
// Certains téléphones envoient un MIME vide pour les HEIC — on regarde l'extension en fallback.
const HEIC_EXTENSIONS = new Set(['heic', 'heif']);

const MAX_FILE_SIZE_MB = 10; // borne supérieure avant compression
const COMPRESSION_THRESHOLD_MB = 2; // si > 2 Mo on compresse
const COMPRESSION_TARGET_MB = 1.5; // cible après compression

function getExtension(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

// Convertit un HEIC en JPEG via heic2any (chargé en lazy import car ~50 KB gzip).
async function convertHeicToJpeg(file) {
  const { default: heic2any } = await import('heic2any');
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  // heic2any peut retourner un array si le HEIC contenait plusieurs images
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const newName = (file.name || 'photo').replace(/\.(heic|heif)$/i, '.jpg');
  return new File([blob], newName, { type: 'image/jpeg' });
}

// Compresse si > seuil. Lazy import pour ne pas charger la lib si pas nécessaire.
async function maybeCompress(file) {
  if (file.size <= COMPRESSION_THRESHOLD_MB * 1024 * 1024) return file;
  const { default: imageCompression } = await import('browser-image-compression');
  return imageCompression(file, {
    maxSizeMB: COMPRESSION_TARGET_MB,
    maxWidthOrHeight: 2400, // photos de plats — pas besoin de 4K
    useWebWorker: true,
    fileType: 'image/jpeg',
  });
}

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
