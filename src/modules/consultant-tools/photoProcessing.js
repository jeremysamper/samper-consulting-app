// ─── Traitement d'images cote client (partage entre PhotoUploader et Tracabilite HACCP) ───
// On whitelist explicitement les MIME types pour eviter les surprises.
// SVG est exclu pour des raisons de securite (XSS via SVG inline), PDF/GIF/TIFF
// sont exclus car non adaptes a une photo.
export const ACCEPTED_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/heic', 'image/heif',
]);
// Certains telephones envoient un MIME vide pour les HEIC - on regarde l'extension en fallback.
export const HEIC_EXTENSIONS = new Set(['heic', 'heif']);

export const MAX_FILE_SIZE_MB = 10; // borne superieure avant compression
export const COMPRESSION_THRESHOLD_MB = 2; // si > 2 Mo on compresse
export const COMPRESSION_TARGET_MB = 1.5; // cible apres compression

export function getExtension(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

// Convertit un HEIC en JPEG via heic2any (charge en lazy import car ~50 KB gzip).
export async function convertHeicToJpeg(file) {
  const { default: heic2any } = await import('heic2any');
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  // heic2any peut retourner un array si le HEIC contenait plusieurs images
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const newName = (file.name || 'photo').replace(/\.(heic|heif)$/i, '.jpg');
  return new File([blob], newName, { type: 'image/jpeg' });
}

// Compresse si > seuil. Lazy import pour ne pas charger la lib si pas necessaire.
export async function maybeCompress(file) {
  if (file.size <= COMPRESSION_THRESHOLD_MB * 1024 * 1024) return file;
  const { default: imageCompression } = await import('browser-image-compression');
  return imageCompression(file, {
    maxSizeMB: COMPRESSION_TARGET_MB,
    maxWidthOrHeight: 2400,
    useWebWorker: true,
    fileType: 'image/jpeg',
  });
}
