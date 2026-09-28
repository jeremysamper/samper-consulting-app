// ─────────────────────────────────────────────────────────────────────────────
// Chiffres des titres en Satoshi.
//
// Les titres sont en Zodiak (--font-serif) et ses chiffres d'affichage
// détonnent. Le CSS ne sait pas cibler des caractères, mais une police déclarée
// avec un unicode-range réduit aux chiffres, placée en tête de pile, ne sert
// QUE pour les chiffres : --font-serif = "SC Chiffres", "Zodiak", … (app.css).
// Les lettres, absentes de sa plage, retombent sur Zodiak.
//
// Satoshi vient de Fontshare, dont les URL de fichiers sont hachées : on lit la
// feuille Fontshare et on redéclare ses fichiers sous le nom "SC Chiffres".
// L'URL de la feuille diffère volontairement de celle du <link> de
// vite-index.html : le service worker a mis en cache la réponse du <link>, qui
// est opaque (requête no-cors) et donc illisible par un fetch cors.
//
// En cas d'échec (hors-ligne sans cache, refus CORS), rien ne se passe : une
// famille inconnue est ignorée et les titres gardent les chiffres de Zodiak.
// ─────────────────────────────────────────────────────────────────────────────

export const DIGIT_FAMILY = 'SC Chiffres';
const CSS_URL = 'https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap';
const DIGITS = 'U+0030-0039';

const read = (block, prop) => new RegExp(`${prop}\\s*:\\s*([^;}]+)`).exec(block)?.[1]?.trim();

/** Les blocs @font-face d'une feuille : { src, weight, style }. */
export function parseFontFaces(cssText) {
  const blocks = String(cssText || '').match(/@font-face\s*{[^}]*}/g) || [];
  return blocks
    .map((block) => ({
      // URL relatives au protocole (//cdn.fontshare.com/…) : explicitées, le
      // constructeur FontFace n'a pas à deviner le schéma.
      src: read(block, 'src')?.replace(/url\((['"]?)\/\//g, 'url($1https://'),
      weight: read(block, 'font-weight') || '400',
      style: read(block, 'font-style') || 'normal',
    }))
    .filter((face) => face.src);
}

let installed = null;

/** Déclare "SC Chiffres". Une seule fois ; ne rejette jamais. */
export function installDigitFont({ cssUrl = CSS_URL } = {}) {
  if (installed) return installed;
  installed = (async () => {
    const { FontFace } = globalThis;
    if (typeof document === 'undefined' || !document.fonts || typeof FontFace !== 'function') return 0;
    try {
      const res = await fetch(cssUrl, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) return 0;
      const faces = parseFontFaces(await res.text());
      faces.forEach(({ src, weight, style }) => {
        document.fonts.add(new FontFace(DIGIT_FAMILY, src, { weight, style, unicodeRange: DIGITS, display: 'swap' }));
      });
      return faces.length;
    } catch (err) {
      console.warn('[chiffres] Satoshi indisponible pour les chiffres des titres :', err?.message || err);
      return 0;
    }
  })();
  return installed;
}
