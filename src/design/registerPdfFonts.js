// ─────────────────────────────────────────────────────────────────────────────
// Brand font embedding for jsPDF.
//
// The four static instances live in public/fonts (built by
// scripts/build-pdf-fonts.mjs). They are fetched once, kept in memory as
// base64, and handed to jsPDF through addFileToVFS + addFont.
//
// Loading is async, registering is NOT. That split is a hard requirement:
// `pdfUtils.construireEtiquettesDlcSync` builds a label batch with no await at
// all, because iOS only allows navigator.share inside the task started by the
// user's gesture and a single intervening promise loses the permission. So a
// tab that will produce a PDF calls `pdfUtils.precharger()` on mount, which
// warms jsPDF AND these fonts, and the click path stays synchronous.
//
// If the files cannot be fetched (a very old cache, a network failure before
// the service worker precached them) every helper degrades to the jsPDF core
// font. A document that prints off-brand beats an export that throws.
// ─────────────────────────────────────────────────────────────────────────────

import { BRAND } from './brandTokens.js';

const FACES = [
  { file: 'Lora-Regular.ttf', family: BRAND.font.serif },
  { file: 'Lora-Italic.ttf', family: BRAND.font.serifItalic },
  { file: 'Poppins-Light.ttf', family: BRAND.font.body },
  { file: 'Poppins-Medium.ttf', family: BRAND.font.label },
];

// The three typographic levels, plus the italic voice. Modules name a role and
// never a family, so the mapping stays in one place, fallback included.
export const ROLE = {
  voice: 'voice',           // Lora: document title, block titles, amounts
  voiceItalic: 'voiceItalic', // Lora Italic: notes
  label: 'label',           // Poppins Medium: section labels, table headers
  data: 'data',             // Poppins Light: body copy, cells
};

const ROLE_FAMILY = {
  voice: BRAND.font.serif,
  voiceItalic: BRAND.font.serifItalic,
  label: BRAND.font.label,
  data: BRAND.font.body,
};

// Core-font fallback. Never 'bold': the brand has no bold level, and losing the
// files must not smuggle one back in.
const ROLE_FALLBACK = {
  voice: ['times', 'normal'],
  voiceItalic: ['times', 'italic'],
  label: ['helvetica', 'normal'],
  data: ['helvetica', 'normal'],
};

let cache = null;      // { [file]: base64 } once every face has been read
let pending = null;    // in-flight load, so concurrent callers share one fetch

function assetUrl(file) {
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
  return `${base.endsWith('/') ? base : base + '/'}fonts/${file}`;
}

// btoa on a 48 KB font in one call is fine, but String.fromCharCode.apply is
// not: past ~100 k arguments it overflows the call stack. Chunked, it never does.
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Fetch and cache the four faces. Safe to call repeatedly. */
export function loadBrandFonts() {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = Promise.all(
    FACES.map(async (face) => {
      const res = await fetch(assetUrl(face.file));
      if (!res.ok) throw new Error(`${face.file}: HTTP ${res.status}`);
      return [face.file, toBase64(await res.arrayBuffer())];
    }),
  )
    .then((entries) => {
      cache = Object.fromEntries(entries);
      return cache;
    })
    .catch((err) => {
      console.warn('[brand fonts] indisponibles, repli sur les polices standard :', err?.message || err);
      pending = null;
      return null;
    });
  return pending;
}

/** True once the faces are in memory and registering will succeed. */
export function brandFontsReady() {
  return !!cache;
}

/**
 * Register the brand faces on `doc`. Synchronous by design. Returns false when
 * the files are not loaded yet, in which case the document renders with the
 * core fallback. jsPDF subsets on output and only writes the glyphs a document
 * actually uses, so registering all four rather than guessing which ones a
 * given page needs costs about 3 KB in the produced file.
 */
export function registerBrandFonts(doc) {
  if (!cache || !doc) return false;
  // jsPDF keeps the VFS per document: a second call on the same doc would
  // re-add identical entries for nothing.
  if (doc.__brandFonts) return true;
  try {
    FACES.forEach((face) => {
      doc.addFileToVFS(face.file, cache[face.file]);
      doc.addFont(face.file, face.family, 'normal');
    });
    doc.__brandFonts = true;
    return true;
  } catch (err) {
    console.warn('[brand fonts] enregistrement impossible :', err?.message || err);
    return false;
  }
}

/**
 * Select a typographic level on `doc`. The only way an export picks a font.
 * `setBrandFont(doc, 'label')` rather than a family and a weight.
 */
export function setBrandFont(doc, role) {
  const family = ROLE_FAMILY[role];
  if (doc.__brandFonts && family) {
    doc.setFont(family, 'normal');
    return;
  }
  const [fallbackFamily, fallbackStyle] = ROLE_FALLBACK[role] || ROLE_FALLBACK.data;
  doc.setFont(fallbackFamily, fallbackStyle);
}
