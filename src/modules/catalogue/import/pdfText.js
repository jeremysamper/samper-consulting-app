// ─────────────────────────────────────────────────────────────
// pdfText - extraction du texte brut d'un PDF via pdf.js.
//
// Regroupe les fragments texte par ligne (coordonnée Y) pour préserver
// une structure proche du tableau d'origine, puis renvoie le texte page
// par page. Si le PDF est une image scannée (aucun texte sélectionnable),
// `scanned` vaut true.
//
// Module à charger en import dynamique : pdf.js est volumineux.
// ─────────────────────────────────────────────────────────────
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function pdfToText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = [];
  let totalLen = 0;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const buckets = [];
    for (const it of content.items) {
      const str = it.str || '';
      if (!str.trim()) continue;
      totalLen += str.trim().length;
      const y = Math.round(it.transform ? it.transform[5] : 0);
      let bucket = buckets.find(b => Math.abs(b.y - y) <= 3);
      if (!bucket) { bucket = { y, parts: [] }; buckets.push(bucket); }
      // On garde l'abscisse : l'ordre du flux de contenu n'est pas celui de la
      // page. Sans tri horizontal, les colonnes d'un tableau se mélangent et
      // « Montant » peut atterrir avant « Prix » sur une facture.
      bucket.parts.push({ x: it.transform ? it.transform[4] : 0, str });
    }
    const lines = buckets
      .sort((a, b) => b.y - a.y)
      .map(b => b.parts
        .sort((u, v) => u.x - v.x)
        .map(p => p.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim())
      .filter(Boolean);
    if (lines.length) pages.push(`# Page ${p}\n${lines.join('\n')}`);
  }

  return { text: pages.join('\n\n'), scanned: totalLen < 25 };
}
