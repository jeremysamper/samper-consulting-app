// ─────────────────────────────────────────────────────────────
// pdfFacture - prépare un document fournisseur pour la lecture IA.
//
// Les factures arrivent en PDF bien plus souvent qu'en photo, et de deux
// natures très différentes :
//
//   · PDF natif (confirmation de commande envoyée par mail) : le texte est
//     extractible. On l'envoie tel quel, sans vision. C'est plus fidèle sur
//     les chiffres — une colonne de montants mal alignée à l'oeil reste juste
//     dans le texte — et bien moins cher.
//
//   · PDF scanné (facture passée au scanner, souvent en CCITTFax noir et
//     blanc) : aucun texte. On rend chaque page en image pour la vision.
//
// Module à charger en import dynamique : pdf.js est volumineux.
// ─────────────────────────────────────────────────────────────

// Au-delà, la charge utile devient énorme et le modèle perd en précision.
// Même borne que MAX_PAGES_FACTURE côté edge function.
const MAX_PAGES = 5;

// Largeur de rendu des pages scannées. 1600 px suffit à lire une facture A4 ;
// au-delà on paie du poids sans gagner en lisibilité. Sur un document épais, on
// descend un peu : la charge utile part en base64, qui l'alourdit d'un tiers, et
// quatre pages pleine définition approchent les limites de l'edge function.
const largeurRendu = (nbPages) => (nbPages <= 2 ? 1600 : 1250);

// Au-delà, on considère le rendu bloqué. Une page A4 scannée se rend en moins
// d'une seconde sur un iPad récent ; 30 s laisse de la marge à un vieil appareil.
const RENDU_TIMEOUT_MS = 30000;

export function estPdf(file) {
  return !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
}

// Analyse un PDF et renvoie de quoi alimenter la tâche parse-facture.
//   { source: 'texte', texte, pages }
//   { source: 'scan',  images: [{ imageBase64, mediaType }], pages }
export async function preparerPdf(file) {
  const [{ pdfToText }, pdfjsLib] = await Promise.all([
    import('../import/pdfText.js'),
    import('pdfjs-dist'),
  ]);
  const buffer = await file.arrayBuffer();

  // pdfToText consomme le buffer ; on en garde une copie pour le rendu.
  const { text, scanned } = await pdfToText(buffer.slice(0));
  if (!scanned && text.trim().length > 80) {
    const pages = (text.match(/^# Page \d+/gm) || []).length || 1;
    return { source: 'texte', texte: text, pages };
  }

  // Scanné : rendu page par page, puis JPEG.
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const total = Math.min(pdf.numPages, MAX_PAGES);
  const largeur0 = largeurRendu(total);
  const images = [];
  for (let p = 1; p <= total; p++) {
    const page = await pdf.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: largeur0 / base.width });
    const largeur = Math.round(viewport.width);
    const hauteur = Math.round(viewport.height);

    // OffscreenCanvas de préférence : il rend hors du compositeur, donc le scan
    // continue même si l'onglet passe en arrière-plan. Un canvas du DOM, lui,
    // se fige dès que la page n'est plus visible — basculer d'application sur
    // iPad en plein scan suffirait à bloquer la lecture.
    const offscreen = typeof OffscreenCanvas !== 'undefined';
    const canvas = offscreen
      ? new OffscreenCanvas(largeur, hauteur)
      : Object.assign(document.createElement('canvas'), { width: largeur, height: hauteur });
    const ctx = canvas.getContext('2d');
    // Fond blanc : un scan noir et blanc a un fond transparent, qui vire au noir
    // une fois aplati en JPEG et rend la page illisible.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, largeur, hauteur);

    // intent 'print' et non 'display' : en mode display, pdf.js enchaîne ses
    // passes via requestAnimationFrame, qui est SUSPENDU dès que l'onglet passe
    // en arrière-plan. Un consultant qui bascule d'application pour regarder sa
    // facture verrait le scan se figer indéfiniment. En intention print, le
    // rendu se fait d'une traite, sans dépendre de l'animation.
    const tache = page.render({ canvasContext: ctx, viewport, intent: 'print' });
    let minuteur;
    try {
      await Promise.race([
        tache.promise,
        new Promise((_, rej) => {
          minuteur = setTimeout(() => rej(new Error(`Rendu de la page ${p} trop long.`)), RENDU_TIMEOUT_MS);
        }),
      ]);
    } catch (e) {
      try { tache.cancel(); } catch (_) { /* déjà terminée */ }
      throw e;
    } finally {
      clearTimeout(minuteur);
    }

    const base64 = offscreen
      ? await blobEnBase64(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 }))
      : (canvas.toDataURL('image/jpeg', 0.85).split(',')[1] || '');
    // Libère la mémoire : une page A4 à 1600 px pèse plusieurs Mo décompressée.
    canvas.width = 0; canvas.height = 0;
    page.cleanup();
    if (base64) images.push({ imageBase64: base64, mediaType: 'image/jpeg' });
  }
  if (!images.length) throw new Error('PDF illisible : ni texte ni page rendue.');
  return { source: 'scan', images, pages: pdf.numPages };
}

function blobEnBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(new Error('Lecture de la page rendue impossible.'));
    reader.readAsDataURL(blob);
  });
}
