import { getDemoData } from '../data/demoData.js';
import { getBrowserWindow, notifyLegacy } from '../legacy/legacyApi.js';
import { readJson } from '../utils/storage.js';
import { ETIQUETTE_FONTS, ETIQUETTE_MEDIA } from '../utils/etiquettesDlc.js';
import {
  BRAND, PDF, RULE, THEME_VAR_OVERRIDES, PRINT_FONT_FACES, WEB_FONT,
} from '../design/brandTokens.js';
import { loadBrandFonts, registerBrandFonts, setBrandFont } from '../design/registerPdfFonts.js';
import {
  formaterIban, formaterReference, matriceQr, montantLisible, payloadSpc,
} from './qrFacture.js';

// ─────────────────────────────────────────────────────
// PDF & IMPRESSION - Mise en page A4 professionnelle
// ─────────────────────────────────────────────────────
// Direction artistique unique : toute couleur et toute police viennent de
// src/design/brandTokens.js, aucune valeur en dur ici. Trois niveaux
// typographiques et rien d'autre - voix (Lora), etiquette (Poppins Medium
// capitales interlettrees), donnee (Poppins Light) - et AUCUN gras : la
// hierarchie passe par le corps, la couleur et le changement de famille.

// ─── Encodage des captures html2canvas ──────────────────────────────────────
// jsPDF recopie un JPEG tel quel dans le fichier (DCTDecode), alors qu'il
// DECODE un PNG et reecrit les pixels bruts, non compresses : une facture A4
// pesait 9,1 Mo pour une image de 317 Ko, soit largeur x hauteur x 3 octets.
// En JPEG le meme document tombe sous les 300 Ko.
//
// Qualite 0,94 : le document est du texte fin sur blanc, c'est le pire cas pour
// un JPEG. En dessous, un halo apparait autour des capitales interlettrees et
// les filets de 0,5 pt se salissent. Au-dessus, le fichier grossit sans gain
// visible a l'impression. Verifie a l'oeil sur la facture et sur la carte.
//
// Ne concerne QUE les captures d'ecran. Le logo de l'etablissement reste en PNG
// (aplats et transparence, que le JPEG detruirait) et les generateurs
// vectoriels n'embarquent aucune image.
const CAPTURE_FORMAT = 'JPEG';
const CAPTURE_QUALITE = 0.94;

// ─── Échelle de capture ─────────────────────────────────────────────────────
// 3 vise environ 318 dpi sur la largeur imprimable A4, la finesse qu'on attend
// d'un document remis à un client. Le JPEG rend ce facteur abordable : ce qui
// pesait 9 Mo en PNG à l'échelle 2 tient sous le mégaoctet à l'échelle 3.
//
// Mais un canvas a une aire maximale, et sur iOS elle est basse : au-delà,
// Safari ne lève RIEN, il rend une image entièrement vide. Un inventaire de
// deux cents lignes ou un planning en paysage atteignent ce plafond, et le
// bug ne se verrait qu'au moment où la brigade ouvre le PDF. On vise donc 3
// et on redescend juste ce qu'il faut pour rester sous les limites.
const CAPTURE_ECHELLE = 3;
// Limites de Safari iOS, la plateforme la plus contrainte du parc : 16,7 Mpx
// d'aire et 8192 px de côté. Le côté valait 4096 jusqu'à iOS 11, une version
// qui ne fait pas tourner cette PWA - retenir 4096 ferait retomber un long
// inventaire sous l'échelle 2 d'avant, soit une perte de finesse pour parer un
// risque qui n'existe plus.
const CANVAS_AIRE_MAX = 16.7e6;
const CANVAS_COTE_MAX = 8192;

// Échelle des bandes quand on pagine. Pas CAPTURE_ECHELLE : une bande par page
// à l'échelle 3 donnait 11 Mo et 17 s sur un inventaire de quatre cents lignes,
// un fichier que personne n'ouvre. 2 correspond à ce que l'app produisait avant
// ce chantier, ce qui reste correct pour un tableau dense de service.
const ECHELLE_PAGINEE = 2;

// ─── Géométrie de la QR-facture suisse ──────────────────────────────────────
// Toutes les cotes viennent du Style Guide de la QR-facture et sont
// NORMATIVES : une banque refuse un récépissé mal dimensionné, et un scanner
// de guichet cherche le QR code à sa place exacte. Rien ici n'est un choix de
// mise en page, donc rien ici ne se règle à l'œil.
//
// A4 portrait. La QR-facture occupe toute la largeur sur les 105 mm du bas,
// coupée en récépissé (62 mm) et section paiement (148 mm), marges de 5 mm.
const QRB = {
  haut: 192,          // 297 - 105
  separation: 62,     // récépissé | section paiement
  recepisseX: 5,      // 62 - 2 × 5 mm de marge = 52 mm utiles
  recepisseL: 52,
  paiementX: 67,      // colonne gauche : titre, QR code, montant (51 mm)
  infoX: 118,         // colonne droite : informations (87 mm)
  infoL: 87,
  qrTaille: 46,       // hors zone de repos, elle-même de 5 mm
  qrY: 209,           // 192 + 17
  montantY: 260,      // 192 + 68, soit 5 mm sous le QR code
  depotY: 274,        // 192 + 82
  // Décalage de la colonne « Montant » par rapport à « Monnaie ». Il diffère
  // entre les deux blocs parce que les corps diffèrent : 6 pt au récépissé,
  // 8 pt à la section paiement, où « Monnaie » vient sinon toucher « Montant ».
  montantX: 12,
  montantXPaiement: 15,
  // Le cadre du montant à remplir fait 40 mm de large et doit rester dans la
  // colonne gauche, qui s'arrête à 118 mm : il commence donc plus à gauche que
  // le libellé, sans quoi ses coins d'angle iraient se poser au milieu du bloc
  // « Payable par ». Le libellé et la valeur, eux, restent à leur place.
  champMontantXPaiement: 78,
  // Interlignes imposés : 9 pt au récépissé, 11 pt à la section paiement.
  pasRecepisse: 3.175,
  pasPaiement: 3.881,
};

const MM_PAR_PT = 0.352778;

// La QR-facture est le seul export de l'app qui sorte de la DA de marque, et
// c'est voulu : la norme impose Helvetica/Arial, du GRAS pour les rubriques et
// du noir pur. Lora, Poppins et le bleu pétrole n'ont pas cours ici.
const QR_NOIR = 0;
const QR_BLANC = 255;

export const pdfUtils = {

  // ─── Chargement à la demande des libs lourdes (html2canvas + jsPDF) ──────
  // Importées dynamiquement pour ne PAS alourdir le bundle des modules qui
  // importent pdfUtils mais n'exportent pas systématiquement en PDF.
  // Les deux libs ne sont nécessaires qu'au moment d'un export/print réel.
  async _loadPdfLibs() {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    return { html2canvas, jsPDF };
  },

  // ─── Polices de marque cote WEB (capture html2canvas) ────────────────────
  // Le container capture vit dans le document courant : ses @font-face doivent
  // etre declarees dans CE document, et surtout resolues AVANT la capture.
  // Sans cette attente, html2canvas photographie le rendu en police de
  // substitution et le PDF sort dans une autre typographie que l'apercu.
  async _ensureWebFontsLoaded() {
    const win = getBrowserWindow();
    if (!win?.document) return;
    if (!win.document.getElementById('sc-brand-print-fonts')) {
      const style = win.document.createElement('style');
      style.id = 'sc-brand-print-fonts';
      style.textContent = PRINT_FONT_FACES;
      win.document.head.appendChild(style);
    }
    const fonts = win.document.fonts;
    if (!fonts?.load) return;
    try {
      await Promise.all([
        fonts.load("400 12pt 'Lora'"),
        fonts.load("italic 400 12pt 'Lora'"),
        fonts.load("300 12pt 'Poppins'"),
        fonts.load("500 12pt 'Poppins'"),
      ]);
    } catch { /* police indisponible : le repli CSS prend le relais */ }
  },

  // ─── Conteneur de capture ───────────────────────────────────────────────
  // Le DOM à photographier, monté hors écran avec la feuille de style d'export.
  // L'appelant doit le retirer (finally) : il reste dans le document tant que
  // html2canvas travaille dessus.
  _monterConteneurCapture(element, { orientation, title, etablissement, noBrand, noHeader }) {
    const container = document.createElement('div');
    container.className = 'pdf-render-root';
    // absolute, et surtout PAS fixed : html2canvas réancre un élément fixed sur
    // le viewport du document qu'il clone, si bien qu'une capture décalée en y
    // ne ramène que du blanc. En absolute, le conteneur a de vraies coordonnées
    // documentaires et chaque bande tombe où on la demande.
    container.style.cssText = `
      position: absolute; left: -9999px; top: 0;
      width: ${orientation === 'landscape' ? '1120px' : '794px'};
      background: ${BRAND.color.white}; padding: 40px;
      font-family: ${WEB_FONT.body}; font-weight: 300;
      color: ${BRAND.color.ink};
      z-index: -1; pointer-events: none;
    `;
    const clone = this._prepareClone(element);
    let headerHTML = '';
    if (!noHeader) {
      headerHTML = noBrand
        ? this._getPlainHeaderHTML(title, etablissement)
        : this._getHeaderHTML(title, etablissement);
    }
    container.innerHTML = `
      <style>${this._getPrintStyles(orientation)}</style>
      ${headerHTML}
      <div class="pdf-content">${clone.innerHTML}</div>
    `;
    document.body.appendChild(container);
    return container;
  },

  // ─── Où couper les pages ────────────────────────────────────────────────
  // Le rendu est une image : la coupe tombait tous les 277 mm, au pixel près,
  // sans regarder ce qu'il y avait là. Une ligne d'inventaire se retrouvait
  // sciée en deux, moitié en bas d'une page, moitié en haut de la suivante.
  //
  // On relève donc les bords hauts des éléments qu'on ne veut pas couper -
  // lignes de tableau, blocs, titres - et la page s'arrête au dernier qui
  // tienne. Rien n'est déplacé ni retiré : c'est le même document, coupé
  // ailleurs. La page se termine simplement un peu plus tôt, comme dans
  // n'importe quel document paginé.
  _pointsDeCoupe(container) {
    const haut = container.getBoundingClientRect().top;
    const points = new Set();
    // Uniquement des frontières ENTRE FRÈRES : enfants directs du contenu,
    // lignes d'un tableau, éléments d'une liste, blocs. Surtout pas un titre
    // quelconque : un h3 vit à l'intérieur d'une carte, couper là scinderait
    // la carte entre son étiquette et son titre (constaté sur le tableau de
    // bord HACCP). Mieux vaut une page qui finit tôt qu'un bloc coupé.
    container.querySelectorAll(
      '.pdf-content > *, .pdf-content tbody > tr, .pdf-content li, .pdf-content .section, .pdf-content .pdf-block, .pdf-content .kpi-card',
    ).forEach((el) => {
      const y = Math.round(el.getBoundingClientRect().top - haut);
      if (y > 0) points.add(y);
    });
    return [...points].sort((a, b) => a - b);
  },

  // Découpe en bandes calées sur ces points. Une bande ne dépasse jamais la
  // hauteur d'une page ; elle s'arrête avant si un point de coupe s'y prête.
  _bandesDePage(container, hauteurCss, bandeMaxCss) {
    const points = this._pointsDeCoupe(container);
    // Un élément plus haut qu'une page n'a aucun point de coupe utilisable :
    // on tranche alors franchement, sans quoi la boucle n'avancerait pas.
    // Ce plancher évite aussi les pages presque vides suivies d'un pavé.
    const minUtile = bandeMaxCss * 0.15;
    const bandes = [];
    let debut = 0;
    while (debut < hauteurCss - 1) {
      const limite = debut + bandeMaxCss;
      if (limite >= hauteurCss) { bandes.push([debut, hauteurCss - debut]); break; }
      let coupe = 0;
      for (const p of points) {
        if (p > debut + minUtile && p <= limite) coupe = p;
        else if (p > limite) break;
      }
      if (!coupe) coupe = limite;
      bandes.push([debut, coupe - debut]);
      debut = coupe;
    }
    return bandes.length ? bandes : [[0, hauteurCss]];
  },

  // ─── Capture paginée ────────────────────────────────────────────────────
  // UNE CAPTURE PAR PAGE, et non une image géante découpée à l'affichage.
  //
  // L'ancienne méthode photographiait le document entier puis reposait la même
  // image sur chaque page avec un décalage négatif. Le rendu était correct,
  // mais la hauteur du DOM devenait la hauteur du canvas : un inventaire de
  // quatre cents lignes demandait 13 000 px de haut, au-delà de ce qu'un canvas
  // accepte, et Safari rendait alors une page blanche sans lever d'erreur.
  //
  // En capturant bande par bande, la hauteur photographiée ne dépasse jamais
  // celle d'une page. La limite du canvas cesse d'être atteignable par la
  // longueur du document, et chaque bande étant courte, elle obtient l'échelle
  // maximale : un long inventaire sort désormais aussi net qu'une facture.
  //
  // Les bandes reprennent exactement le découpage précédent, donc la coupure
  // tombe au même endroit qu'avant : ce n'est pas une mise en page par lignes,
  // une ligne à cheval reste coupée. La faire respirer relèverait d'un autre
  // chantier, celui du contenu.
  async _pdfDepuisConteneur(container, { html2canvas, jsPDF, orientation, fitOnePage, qrFacture }) {
    const paysage = orientation === 'landscape';
    const pdf = new jsPDF(paysage ? 'l' : 'p', 'mm', 'a4');
    const pageWidth = paysage ? 297 : 210;
    const pageHeight = paysage ? 210 : 297;
    const margin = 10;
    const imgWidth = pageWidth - margin * 2;

    const largeurCss = container.offsetWidth;
    const hauteurCss = container.scrollHeight;

    // x et y sont RELATIFS À L'ÉLÉMENT, pas au document : le conteneur vit à
    // left:-9999px, lui passer sa coordonnée documentaire ferait photographier
    // 9999 px de vide à sa gauche. On ne décale donc que verticalement et on
    // laisse html2canvas déduire x et la largeur.
    const capturer = async (decalageY, hauteur, plafond) => {
      const canvas = await html2canvas(container, {
        scale: Math.min(plafond ?? CAPTURE_ECHELLE, this._echelleCapture(largeurCss, hauteur)),
        y: decalageY,
        height: hauteur,
        useCORS: true,
        backgroundColor: BRAND.color.white,
        logging: false,
      });
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error('Le rendu HTML→Canvas a produit une image vide. Vérifie que la zone à exporter contient du contenu visible.');
      }
      return canvas;
    };
    // Une capture mal cadrée ne lève rien : elle rend une image uniformément
    // blanche, et le défaut ne se voit qu'à l'ouverture du fichier. C'est
    // arrivé deux fois pendant la mise au point de ce découpage. On échantillonne
    // donc la première bande sur une grille éparse - quelques centaines de
    // points suffisent à distinguer une page de contenu d'une page vide, pour
    // un coût négligeable devant la capture elle-même.
    const estVide = (canvas) => {
      try {
        const ctx = canvas.getContext('2d');
        const pas = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 24));
        for (let y = 0; y < canvas.height; y += pas) {
          for (let x = 0; x < canvas.width; x += pas) {
            const [r, v, b] = ctx.getImageData(x, y, 1, 1).data;
            if (r < 248 || v < 248 || b < 248) return false;
          }
        }
        return true;
      } catch { return false; } // canvas illisible : on ne bloque pas l'export
    };

    const poser = (canvas, y, hauteurMm) => {
      pdf.addImage(canvas.toDataURL('image/jpeg', CAPTURE_QUALITE), CAPTURE_FORMAT,
        margin, y, imgWidth, hauteurMm);
    };

    // fitOnePage : tout doit tenir sur une page, il faut donc une seule image
    // réduite. Ces documents-là sont courts par construction (facture, carte).
    //
    // Une QR-facture emprunte forcément cette voie : le récépissé occupe les
    // 105 mm du bas, le contenu se réduit pour tenir au-dessus. Paginer serait
    // la seule alternative, mais un titre de paiement qui déborde sur une
    // deuxième page n'existe pas dans la norme.
    if (fitOnePage || qrFacture) {
      const canvas = await capturer(0, hauteurCss);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      // 6 mm de garde au-dessus du trait de découpe : la mention « à détacher »
      // s'y loge, et le contenu ne vient jamais lécher les pointillés.
      const hauteurDispo = qrFacture
        ? QRB.haut - margin - 6
        : pageHeight - margin * 2 - 8;
      if (imgHeight > hauteurDispo) {
        const reduction = hauteurDispo / imgHeight;
        const largeurFinale = imgWidth * reduction;
        pdf.addImage(canvas.toDataURL('image/jpeg', CAPTURE_QUALITE), CAPTURE_FORMAT,
          margin + (imgWidth - largeurFinale) / 2, margin, largeurFinale, hauteurDispo);
      } else {
        poser(canvas, margin, imgHeight);
      }
      if (qrFacture) this._dessinerQrFacture(pdf, qrFacture);
      return pdf;
    }

    // Une capture par page coûte une passe html2canvas par page, et html2canvas
    // reclone tout le DOM à chaque appel : sept pages, c'est 7 s contre 0,5 s
    // pour un cliché unique. On ne pagine donc QUE lorsque le cliché unique est
    // impossible, c'est-à-dire quand le document dépasse les limites du canvas
    // même à l'échelle 1 - il n'y a alors plus d'arbitrage, l'autre voie ne
    // produit rien d'exploitable. Tout le reste garde la voie rapide.
    const clicheUniquePossible = hauteurCss <= CANVAS_COTE_MAX
      && largeurCss <= CANVAS_COTE_MAX
      && largeurCss * hauteurCss <= CANVAS_AIRE_MAX;
    const bandeMaxCss = (pageHeight - margin * 2) * (largeurCss / imgWidth);
    const bandes = this._bandesDePage(container, hauteurCss, bandeMaxCss);

    if (clicheUniquePossible) {
      // Un seul cliché, puis on y taille les bandes au ciseau. Le découpage
      // d'un canvas déjà rendu est immédiat, sans rapport avec le coût d'une
      // nouvelle passe html2canvas : la voie rapide le reste.
      const canvas = await capturer(0, hauteurCss);
      if (estVide(canvas)) {
        throw new Error('La capture est ressortie vide : la zone à exporter n’a rien de visible, ou le cadrage de la capture est faux.');
      }
      const echelle = canvas.width / largeurCss;
      bandes.forEach(([debut, hauteur], p) => {
        const bande = document.createElement('canvas');
        bande.width = canvas.width;
        bande.height = Math.max(1, Math.round(hauteur * echelle));
        const ctx = bande.getContext('2d');
        ctx.fillStyle = BRAND.color.white;
        ctx.fillRect(0, 0, bande.width, bande.height);
        ctx.drawImage(canvas, 0, Math.round(debut * echelle), canvas.width, bande.height,
          0, 0, canvas.width, bande.height);
        if (p > 0) pdf.addPage();
        poser(bande, margin, (bande.height * imgWidth) / bande.width);
      });
      return pdf;
    }

    for (let p = 0; p < bandes.length; p += 1) {
      const [debut, hauteur] = bandes[p];
      if (hauteur < 1) break; // reliquat sous le pixel : pas de page vide
      const canvas = await capturer(debut, hauteur, ECHELLE_PAGINEE);
      if (p === 0 && estVide(canvas)) {
        throw new Error('La capture est ressortie vide : la zone à exporter n’a rien de visible, ou le cadrage de la capture est faux.');
      }
      if (p > 0) pdf.addPage();
      poser(canvas, margin, (canvas.height * imgWidth) / canvas.width);
    }
    return pdf;
  },

  // Échelle réellement applicable à cette capture : CAPTURE_ECHELLE tant que le
  // canvas reste sous les limites, moins sinon. Depuis la capture paginée, une
  // bande fait au plus une page de haut, donc le repli ne se déclenche
  // pratiquement plus - il reste le filet pour une page très dense.
  _echelleCapture(largeurCss, hauteurCss) {
    if (!largeurCss || !hauteurCss) return CAPTURE_ECHELLE;
    const parAire = Math.sqrt(CANVAS_AIRE_MAX / (largeurCss * hauteurCss));
    const parCote = Math.min(CANVAS_COTE_MAX / largeurCss, CANVAS_COTE_MAX / hauteurCss);
    // Plancher à 1 : en dessous, le texte devient illisible et il vaut mieux
    // laisser le navigateur échouer franchement que rendre un document inutile.
    return Math.max(1, Math.min(CAPTURE_ECHELLE, parAire, parCote));
  },

  // ═══════════════════════════════════════════════════════════════
  // QR-FACTURE SUISSE - dessin vectoriel du bas de page
  // ───────────────────────────────────────────────────────────────
  // Vectoriel et non capture, pour deux raisons qui ne sont pas esthétiques :
  // les cotes doivent tomber au dixième de millimètre, et un QR code raster
  // redimensionné par un lecteur PDF perd des modules. Les données arrivent
  // déjà construites et validées par services/qrFacture.js ; ici on ne fait
  // que poser de l'encre.
  // ═══════════════════════════════════════════════════════════════

  // Encode la charge utile et charge l'encodeur QR (import à la demande, il ne
  // sert qu'ici). Renvoie null quand aucune QR-facture n'est demandée, ce qui
  // laisse le reste du pipeline strictement inchangé pour les autres exports.
  async _preparerQrFacture(donnees) {
    if (!donnees) return null;
    return { donnees, matrice: await matriceQr(payloadSpc(donnees)) };
  },

  _dessinerQrFacture(doc, { donnees, matrice }) {
    if (!donnees || !matrice) return;
    // Le bloc va toujours sur la dernière page : c'est celle que le client a
    // sous les yeux quand il détache le récépissé.
    doc.setPage(doc.getNumberOfPages());

    // Fond blanc opaque : si la capture au-dessus a débordé d'un cheveu, elle
    // ne doit pas se retrouver derrière le QR code.
    doc.setFillColor(QR_BLANC, QR_BLANC, QR_BLANC);
    doc.rect(0, QRB.haut, 210, 105, 'F');
    doc.setTextColor(QR_NOIR, QR_NOIR, QR_NOIR);
    doc.setDrawColor(QR_NOIR, QR_NOIR, QR_NOIR);

    this._separationsQrFacture(doc);
    this._recepisseQrFacture(doc, donnees);
    this._sectionPaiementQrFacture(doc, donnees, matrice);
  },

  // Écrit un texte (replié sur `largeur` si fournie) et renvoie le haut de la
  // ligne suivante, pour empiler les blocs sans recompter les millimètres.
  _texteQr(doc, texte, x, haut, { taille, gras = false, largeur, pas, align = 'left' } = {}) {
    const t = pdfSafeText(texte);
    if (!t) return haut;
    doc.setFont('helvetica', gras ? 'bold' : 'normal');
    doc.setFontSize(taille);
    const interligne = pas || taille * MM_PAR_PT * 1.15;
    const lignes = largeur ? doc.splitTextToSize(t, largeur) : [t];
    lignes.forEach((ligne, i) => {
      doc.text(ligne, x, haut + i * interligne, { baseline: 'top', align });
    });
    return haut + lignes.length * interligne;
  },

  // Adresse structurée sur trois lignes : nom / rue + n° / NPA + localité.
  // Le pays n'est pas imprimé pour une adresse suisse - il l'est dans le QR,
  // mais l'afficher sur un paiement domestique alourdit sans rien apporter.
  _adresseQr(doc, adresse, x, haut, options) {
    if (!adresse) return haut;
    let y = this._texteQr(doc, adresse.nom, x, haut, options);
    const rue = [adresse.rue, adresse.numero].filter(Boolean).join(' ');
    y = this._texteQr(doc, rue, x, y, options);
    const localite = [adresse.npa, adresse.localite].filter(Boolean).join(' ');
    const prefixe = adresse.pays && adresse.pays !== 'CH' ? `${adresse.pays}-` : '';
    return this._texteQr(doc, `${prefixe}${localite}`, x, y, options);
  },

  // Champ laissé à remplir à la main : la norme impose des coins d'angle, pas
  // un cadre plein - un cadre plein ferait croire à une zone déjà servie.
  _cadreVideQr(doc, x, y, largeur, hauteur) {
    const bras = 3;
    doc.setLineWidth(0.25);
    doc.setDrawColor(QR_NOIR, QR_NOIR, QR_NOIR);
    const coins = [
      [[x, y + bras], [x, y], [x + bras, y]],
      [[x + largeur - bras, y], [x + largeur, y], [x + largeur, y + bras]],
      [[x + largeur, y + hauteur - bras], [x + largeur, y + hauteur], [x + largeur - bras, y + hauteur]],
      [[x + bras, y + hauteur], [x, y + hauteur], [x, y + hauteur - bras]],
    ];
    coins.forEach(([a, b, c]) => {
      doc.lines([[b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]]], a[0], a[1]);
    });
  },

  // Traits de découpe. Le symbole ciseaux n'existe pas dans l'encodage des
  // polices standard de jsPDF : on prend la mention de remplacement, que la
  // norme prévoit explicitement pour ce cas.
  _separationsQrFacture(doc) {
    doc.setLineWidth(0.2);
    doc.setDrawColor(QR_NOIR, QR_NOIR, QR_NOIR);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(0, QRB.haut, 210, QRB.haut);
    doc.line(QRB.separation, QRB.haut, QRB.separation, 297);
    doc.setLineDashPattern([], 0);
    this._texteQr(doc, 'Avant le versement à détacher selon le trait pointillé',
      205, QRB.haut - 3.5, { taille: 7, align: 'right' });
  },

  // ─── Récépissé (62 mm) ───────────────────────────────────────────────────
  // Rubriques en 6 pt gras, valeurs en 8 pt, le tout sur une grille de 9 pt.
  _recepisseQrFacture(doc, d) {
    const x = QRB.recepisseX;
    const largeur = QRB.recepisseL;
    const pas = QRB.pasRecepisse;
    const rubrique = { taille: 6, gras: true, largeur, pas };
    const valeur = { taille: 8, largeur, pas };

    this._texteQr(doc, 'Récépissé', x, QRB.haut + 5, { taille: 11, gras: true });

    let y = QRB.haut + 12;
    y = this._texteQr(doc, 'Compte / Payable à', x, y, rubrique);
    y = this._texteQr(doc, formaterIban(d.iban), x, y, valeur);
    y = this._adresseQr(doc, d.creancier, x, y, valeur) + pas * 0.5;

    if (d.reference) {
      y = this._texteQr(doc, 'Référence', x, y, rubrique);
      y = this._texteQr(doc, formaterReference(d.reference), x, y, valeur) + pas * 0.5;
    }

    y = this._texteQr(doc, d.debiteur ? 'Payable par' : 'Payable par (nom/adresse)', x, y, rubrique);
    if (d.debiteur) this._adresseQr(doc, d.debiteur, x, y, valeur);
    else this._cadreVideQr(doc, x, y, largeur, 20);

    const yMontant = QRB.montantY;
    const xMontant = x + QRB.montantX;
    this._texteQr(doc, 'Monnaie', x, yMontant, { taille: 6, gras: true });
    this._texteQr(doc, 'Montant', xMontant, yMontant, { taille: 6, gras: true });
    this._texteQr(doc, d.devise, x, yMontant + pas, { taille: 8 });
    if (d.montant != null) this._texteQr(doc, montantLisible(d.montant), xMontant, yMontant + pas, { taille: 8 });
    else this._cadreVideQr(doc, xMontant, yMontant + pas, 30, 10);

    this._texteQr(doc, 'Point de dépôt', x + largeur, QRB.depotY, { taille: 6, gras: true, align: 'right' });
  },

  // ─── Section paiement (148 mm) ───────────────────────────────────────────
  // Colonne gauche : titre, QR code, montant. Colonne droite : informations.
  // Rubriques en 8 pt gras, valeurs en 10 pt, grille de 11 pt.
  _sectionPaiementQrFacture(doc, d, matrice) {
    const pas = QRB.pasPaiement;
    const rubrique = { taille: 8, gras: true, largeur: QRB.infoL, pas };
    const valeur = { taille: 10, largeur: QRB.infoL, pas };

    this._texteQr(doc, 'Section paiement', QRB.paiementX, QRB.haut + 5, { taille: 11, gras: true });

    this._modulesQr(doc, matrice, QRB.paiementX, QRB.qrY, QRB.qrTaille);
    this._croixSuisseQr(doc, QRB.paiementX + QRB.qrTaille / 2, QRB.qrY + QRB.qrTaille / 2);

    const yMontant = QRB.montantY;
    const xMontant = QRB.paiementX + QRB.montantXPaiement;
    this._texteQr(doc, 'Monnaie', QRB.paiementX, yMontant, { taille: 8, gras: true });
    this._texteQr(doc, 'Montant', xMontant, yMontant, { taille: 8, gras: true });
    this._texteQr(doc, d.devise, QRB.paiementX, yMontant + pas, { taille: 10 });
    if (d.montant != null) {
      this._texteQr(doc, montantLisible(d.montant), xMontant, yMontant + pas, { taille: 10 });
    } else {
      this._cadreVideQr(doc, QRB.champMontantXPaiement, yMontant + pas, 40, 15);
    }

    let y = QRB.haut + 5;
    y = this._texteQr(doc, 'Compte / Payable à', QRB.infoX, y, rubrique);
    y = this._texteQr(doc, formaterIban(d.iban), QRB.infoX, y, valeur);
    y = this._adresseQr(doc, d.creancier, QRB.infoX, y, valeur) + pas * 0.5;

    if (d.reference) {
      y = this._texteQr(doc, 'Référence', QRB.infoX, y, rubrique);
      y = this._texteQr(doc, formaterReference(d.reference), QRB.infoX, y, valeur) + pas * 0.5;
    }
    if (d.message) {
      y = this._texteQr(doc, 'Informations supplémentaires', QRB.infoX, y, rubrique);
      y = this._texteQr(doc, d.message, QRB.infoX, y, valeur) + pas * 0.5;
    }

    y = this._texteQr(doc, d.debiteur ? 'Payable par' : 'Payable par (nom/adresse)', QRB.infoX, y, rubrique);
    if (d.debiteur) this._adresseQr(doc, d.debiteur, QRB.infoX, y, valeur);
    else this._cadreVideQr(doc, QRB.infoX, y, 65, 25);
  },

  // Modules du QR code. On fusionne les suites horizontales en un seul
  // rectangle : dix fois moins d'objets dans le fichier, et surtout aucun
  // liseré blanc entre deux modules voisins - un défaut qui ne se voit pas à
  // l'écran mais que les lecteurs de code accrochent.
  _modulesQr(doc, matrice, x, y, taille) {
    const pas = taille / matrice.taille;
    doc.setFillColor(QR_NOIR, QR_NOIR, QR_NOIR);
    for (let ligne = 0; ligne < matrice.taille; ligne += 1) {
      let debut = -1;
      for (let colonne = 0; colonne <= matrice.taille; colonne += 1) {
        const noir = colonne < matrice.taille && matrice.estNoir(ligne, colonne);
        if (noir && debut === -1) debut = colonne;
        if (!noir && debut !== -1) {
          doc.rect(x + debut * pas, y + ligne * pas, (colonne - debut) * pas, pas, 'F');
          debut = -1;
        }
      }
    }
  },

  // Croix suisse, 7 x 7 mm au centre du code : liseré blanc, carré noir, puis
  // la croix aux proportions du drapeau fédéral (bras 6/32, longueur 20/32).
  // Elle mange 2 % de la surface, très en dessous de ce que le niveau de
  // correction M encaisse.
  _croixSuisseQr(doc, cx, cy) {
    doc.setFillColor(QR_BLANC, QR_BLANC, QR_BLANC);
    doc.rect(cx - 3.5, cy - 3.5, 7, 7, 'F');
    doc.setFillColor(QR_NOIR, QR_NOIR, QR_NOIR);
    doc.rect(cx - 3.15, cy - 3.15, 6.3, 6.3, 'F');
    doc.setFillColor(QR_BLANC, QR_BLANC, QR_BLANC);
    doc.rect(cx - 0.59, cy - 1.97, 1.18, 3.94, 'F');
    doc.rect(cx - 1.97, cy - 0.59, 3.94, 1.18, 'F');
  },

  // ─── Override CSS variables en HEX pour le rendu PDF / print ────────────
  // html2canvas v1.4 ne supporte PAS oklch() et plante avec
  // "Attempting to parse an unsupported color function oklch".
  // En redéfinissant les CSS variables au niveau du container (.pdf-render-root),
  // toutes les `var(--text)`, `var(--bg)` etc. utilisées dans les inline styles
  // se résolvent en hex au moment où html2canvas lit les computed styles.
  // Pareil pour la fenêtre d'impression qui n'hérite pas des vars du document parent.
  // Les valeurs sont celles de la MARQUE, pas celles de l'écran : une vue
  // capturée doit sortir en document de marque, pas en copie d'écran.
  _getThemeVarOverrides() {
    return THEME_VAR_OVERRIDES;
  },

  _getPrintStyles(orientation = 'portrait') {
    const isLandscape = orientation === 'landscape';
    const C = BRAND.color;
    // Trois niveaux typographiques, jamais plus, et aucun gras : la hierarchie
    // vient du corps, de la couleur et du changement de famille. Ni ombre, ni
    // degrade, ni arrondi marque - rien de tout cela ne survit a l'impression.
    return `
      ${PRINT_FONT_FACES}
      ${this._getThemeVarOverrides()}
      @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: ${BRAND.page.marginMm}mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body {
        font-family: ${WEB_FONT.body}; font-weight: 300;
        color: ${C.ink};
        background: ${C.white};
        margin: 0; padding: 0;
        font-size: 10pt;
        line-height: 1.5;
      }
      /* Aucun gras nulle part : le DOM capture en contient, on le neutralise
         a la racine plutot que de compter sur chaque module. */
      .pdf-render-root, .pdf-render-root * { font-weight: 300 !important; box-shadow: none !important; text-shadow: none !important; }
      .pdf-render-root [style*="gradient"] { background-image: none !important; }

      /* ─── En-tete : identite, titre en Lora centre, filet plein ${'1,6'} pt ─── */
      .pdf-header { border-bottom: 1.6pt solid ${C.primary}; padding-bottom: 12px; margin-bottom: 22px; }
      .pdf-identity { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 14px; }
      .pdf-brand { display: flex; align-items: center; gap: 12px; }
      .pdf-logo {
        width: 40px; height: 40px;
        background: ${C.primary}; color: ${C.white};
        display: flex; align-items: center; justify-content: center;
        font-family: ${WEB_FONT.body}; font-weight: 500 !important;
        font-size: 12pt; letter-spacing: 0.09em;
        overflow: hidden;
      }
      .pdf-logo img { width: 100%; height: 100%; object-fit: cover; }
      .pdf-brand-name {
        font-family: ${WEB_FONT.body}; font-weight: 500 !important;
        font-size: 8pt; color: ${C.primary};
        text-transform: uppercase; letter-spacing: 0.13em;
      }
      .pdf-identity-meta {
        text-align: right; font-size: 8pt; color: ${C.stone}; line-height: 1.45;
      }
      .pdf-identity-etab {
        font-family: ${WEB_FONT.body}; font-weight: 500 !important;
        color: ${C.primary}; text-transform: uppercase; letter-spacing: 0.09em;
      }
      .pdf-doc-title {
        font-family: ${WEB_FONT.serif}; font-weight: 400 !important;
        font-size: 20pt; color: ${C.primary};
        text-align: center; letter-spacing: 0.02em; margin: 0;
      }
      .pdf-doc-date { text-align: center; font-size: 8pt; color: ${C.stone}; margin-top: 5px; }

      /* ─── Voix / etiquette / donnee ─────────────────────────────────── */
      h1, h2, h3 { margin: 0 0 10px 0; page-break-after: avoid; font-weight: 400 !important; }
      h1 { font-family: ${WEB_FONT.serif}; font-size: 16pt; color: ${C.primary}; }
      h2 {
        font-family: ${WEB_FONT.body}; font-weight: 500 !important;
        font-size: 8pt; margin-top: 18px;
        text-transform: uppercase; letter-spacing: 0.13em;
        color: ${C.primary};
        border-bottom: 0.5pt solid ${C.rule};
        padding-bottom: 5px;
      }
      h3 { font-family: ${WEB_FONT.serif}; font-size: 11pt; margin-top: 12px; color: ${C.ink}; }
      p { margin: 0 0 8px 0; }
      strong { color: ${C.primary}; }
      em { font-family: ${WEB_FONT.serif}; font-style: italic; color: ${C.stone}; }

      /* ─── Tableaux : en-tete plein, alternance, filets internes ──────── */
      table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; page-break-inside: auto; border: 0.5pt solid ${C.rule}; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      th {
        text-align: left; font-size: 7.2pt;
        font-family: ${WEB_FONT.body}; font-weight: 500 !important;
        background: ${C.primary}; color: ${C.white};
        text-transform: uppercase; letter-spacing: 0.13em;
        padding: 7px 8px;
      }
      td { padding: 6px 8px; font-size: 9pt; border-bottom: 0.5pt solid ${C.ruleLight}; color: ${C.ink}; }
      tbody tr:nth-child(even) td { background: ${C.zebra}; }
      tfoot td, tr.total td, tr[data-total] td {
        background: ${C.tint}; border-top: 1pt solid ${C.primary};
        font-family: ${WEB_FONT.serif};
      }

      /* ─── Blocs d'identite : barre laterale 2,2 pt en accent ─────────── */
      .pdf-block, .kpi-card {
        border: 0.5pt solid ${C.rule}; border-left: 2.2pt solid ${C.accent};
        padding: 10px 12px; background: ${C.white};
      }
      .kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 12px 0 18px; }
      .kpi-label {
        font-family: ${WEB_FONT.body}; font-weight: 500 !important;
        font-size: 7.2pt; color: ${C.stone};
        text-transform: uppercase; letter-spacing: 0.13em; margin-bottom: 5px;
      }
      .kpi-value { font-family: ${WEB_FONT.serif}; font-size: 13pt; color: ${C.primary}; }
      .badge {
        display: inline-block; padding: 2px 9px;
        font-family: ${WEB_FONT.body}; font-weight: 500 !important;
        font-size: 7.2pt; text-transform: uppercase; letter-spacing: 0.09em;
        background: ${C.tint}; color: ${C.primary}; border: 0.5pt solid ${C.rule};
      }
      .section { margin-bottom: 20px; page-break-inside: avoid; }

      /* ─── DOM clone : les composants React posent leurs propres cartes ──
         Elles arrivent ici avec var(--surface) / var(--border) deja resolues
         en tokens de marque ; on ne retouche que le trait et l'arrondi, qui
         ne survivent pas a l'impression. */
      .pdf-content > div { margin-bottom: 12px; }
      .pdf-content div[style*="border"][style*="radius"] {
        border-color: ${C.rule} !important;
        border-radius: 0 !important;
        background: ${C.white} !important;
      }
      .pdf-content a { color: ${C.primary}; text-decoration: none; }
      ul, ol { margin: 4px 0 12px 20px; padding: 0; }
      li { margin-bottom: 4px; font-size: 9pt; }
      .no-print, button, .pls-tabs, [class*="no-print"] { display: none !important; }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      [id*="planning-print"] > div > div:nth-child(1) { font-family: ${WEB_FONT.serif}; font-size: 13pt; margin-bottom: 8px; }
      /* Champs de saisie rendus comme du texte */
      input, select, textarea { border: none !important; background: transparent !important; padding: 0 !important; font: inherit; color: inherit; }
      .pdf-field-value { font-family: ${WEB_FONT.body}; color: ${C.ink}; }
    `;
  },

  _getHeaderHTML(title, etablissement) {
    // Le logo vient de l'établissement (DB) avec fallback sur l'ancien localStorage
    // pour les utilisateurs qui n'ont pas encore migré.
    const logo = etablissement?.logo_url
      || (() => { try { return readJson('sc_app_logo', null); } catch { return null; } })();
    const logoContent = logo
      ? `<div class="pdf-logo"><img src="${logo}" alt="logo"/></div>`
      : `<div class="pdf-logo">SC</div>`;
    const dateFmt = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' });
    const etabName = etablissement?.nom || '';
    const etabAdresse = etablissement?.adresse || '';

    return `
      <div class="pdf-header">
        <div class="pdf-identity">
          <div class="pdf-brand">
            ${logoContent}
            <div class="pdf-brand-name">Samper Consulting</div>
          </div>
          <div class="pdf-identity-meta">
            ${etabName ? `<div class="pdf-identity-etab">${etabName}</div>` : ''}
            ${etabAdresse ? `<div>${etabAdresse}</div>` : ''}
          </div>
        </div>
        <h1 class="pdf-doc-title">${title}</h1>
        <div class="pdf-doc-date">${dateFmt}</div>
      </div>
    `;
  },

  // En-tete sobre : titre et date, sans le bloc d'identite Samper. Meme
  // typographie et meme filet que l'en-tete complet - c'est la meme DA, on
  // n'y retire que l'emetteur (releve CCNT remis au collaborateur).
  _getPlainHeaderHTML(title, etablissement) {
    const dateFmt = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' });
    const etabName = etablissement?.nom || '';
    const etabAdresse = etablissement?.adresse || '';
    const sousTitre = [etabName, etabAdresse].filter(Boolean).join(' · ');
    return `
      <div class="pdf-header">
        <h1 class="pdf-doc-title">${title}</h1>
        <div class="pdf-doc-date">${sousTitre ? `${sousTitre}<br/>` : ''}${dateFmt}</div>
      </div>
    `;
  },

  _getCurrentEtablissement() {
    // L'établissement courant est désormais en DB (user_settings).
    // On lit la préférence DB si dispo, sinon fallback localStorage legacy, sinon premier de la liste.
    // Cette fonction reste synchrone : elle utilise DEMO_DATA hydraté + un fallback rapide.
    try {
      const etabId = readJson('sc_current_etab', null); // legacy fallback
      if (etabId) {
        const found = getDemoData().etablissements.find(e => e.id === etabId);
        if (found) return found;
      }
    } catch {}
    return getDemoData().etablissements[0];
  },

  _prepareClone(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('.no-print, button').forEach(el => el.remove());
    clone.querySelectorAll('input, select, textarea').forEach(el => {
      const span = document.createElement('span');
      const val = el.tagName === 'SELECT'
        ? (el.options[el.selectedIndex]?.textContent || el.value || '')
        : (el.value || el.textContent || '');
      span.textContent = val;
      span.className = 'pdf-field-value';
      el.replaceWith(span);
    });
    // Pas de strip des inline styles : les var() utilisées dans le DOM cloné
    // se résoudront via _getThemeVarOverrides() qui redéfinit ces vars en HEX
    // au niveau du container .pdf-render-root.
    return clone;
  },

  // ── IMPRESSION DIRECTE
  printElement(elementId, title = 'Document', options = {}) {
    const element = document.getElementById(elementId);
    if (!element) {
      notifyLegacy('Zone à imprimer introuvable : ' + elementId, 'error');
      return;
    }

    const etab = options.etablissement || this._getCurrentEtablissement();
    const orientation = options.orientation || 'portrait';
    const noBrand = !!options.noBrandHeader;
    const noHeader = !!options.noHeader;
    const printWindow = getBrowserWindow()?.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) { notifyLegacy('Impossible d’ouvrir la fenêtre d’impression.', 'error'); return; }
    const clone = this._prepareClone(element);

    // noHeader = aucun en-tête du tout (le contenu cloné parle de lui-même)
    // noBrand = en-tête sobre : titre + date, sans le bloc d'identité Samper
    // par défaut = en-tête complet
    let headerHTML = '';
    if (!noHeader) {
      headerHTML = noBrand
        ? this._getPlainHeaderHTML(title, etab)
        : this._getHeaderHTML(title, etab);
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8"/>
        <title>${title}</title>
        <style>${this._getPrintStyles(orientation)}</style>
      </head>
      <body class="pdf-render-root">
        ${headerHTML}
        <div class="pdf-content">${clone.innerHTML}</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    // On attend que les polices de marque soient resolues avant d'ouvrir la
    // boite d'impression : lancer print() trop tot fige la page dans la police
    // de substitution. Le delai reste un filet pour les navigateurs sans
    // document.fonts.
    const lancerImpression = () => { printWindow.focus(); printWindow.print(); };
    if (printWindow.document.fonts?.ready) {
      printWindow.document.fonts.ready.then(() => setTimeout(lancerImpression, 120));
    } else {
      setTimeout(lancerImpression, 500);
    }
  },

  // ── EXPORT PDF
  async exportElementToPdf(elementId, fileName = 'document.pdf', options = {}) {
    const element = document.getElementById(elementId);
    if (!element) { notifyLegacy('Zone à exporter introuvable : ' + elementId, 'error'); return; }

    const title = options.title || fileName.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
    const etab = options.etablissement || this._getCurrentEtablissement();
    const orientation = options.orientation || 'portrait';
    const noBrand = !!options.noBrandHeader;
    const noHeader = !!options.noHeader;
    const fitOnePage = !!options.fitOnePage;

    const container = this._monterConteneurCapture(element, {
      orientation, title, etablissement: etab, noBrand, noHeader,
    });

    try {
      const { html2canvas, jsPDF } = await this._loadPdfLibs();
      await this._ensureWebFontsLoaded();
      const qrFacture = await this._preparerQrFacture(options.qrFacture);
      const pdf = await this._pdfDepuisConteneur(container, { html2canvas, jsPDF, orientation, fitOnePage, qrFacture });

      // Aucun pied de page : l'identite, l'etablissement et la date vivent dans
      // l'en-tete du document. Un filet et une signature repetes en bas de page
      // n'appartiennent pas a la DA.

      pdf.save(fileName);
    } catch (err) {
      console.error('[pdf exportElementToPdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    } finally {
      try { document.body.removeChild(container); } catch (e) { /* déjà retiré */ }
    }
  },

  // ── EXPORT PDF en Blob (pour upload programmatique)
  async elementToBlobPDF(elementId, options = {}) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error('Zone à exporter introuvable : ' + elementId);

    const title = options.title || 'Document';
    const etab = options.etablissement || this._getCurrentEtablissement();
    const orientation = options.orientation || 'portrait';
    const noBrand = !!options.noBrandHeader;
    const noHeader = !!options.noHeader;
    const fitOnePage = !!options.fitOnePage;

    const container = this._monterConteneurCapture(element, {
      orientation, title, etablissement: etab, noBrand, noHeader,
    });

    try {
      const { html2canvas, jsPDF } = await this._loadPdfLibs();
      await this._ensureWebFontsLoaded();
      const qrFacture = await this._preparerQrFacture(options.qrFacture);
      const pdf = await this._pdfDepuisConteneur(container, { html2canvas, jsPDF, orientation, fitOnePage, qrFacture });

      // Aucun pied de page : l'identite, l'etablissement et la date vivent dans
      // l'en-tete du document. Un filet et une signature repetes en bas de page
      // n'appartiennent pas a la DA.

      // Retourne le PDF sous forme de Blob (pas de download)
      return pdf.output('blob');
    } catch (err) {
      console.error('[pdf elementToBlobPDF]', err);
      throw err;
    } finally {
      try { document.body.removeChild(container); } catch (e) { /* déjà retiré */ }
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // FICHE RECETTE - génération jsPDF NATIVE (vectorielle, 1 page A4)
  // ───────────────────────────────────────────────────────────────
  // Une fiche recette est un document texte à structure fixe : on la
  // génère en vectoriel plutôt qu'en capture html2canvas. Bénéfices :
  // net à l'impression, 1 page A4 garantie (fit-to-page), identique
  // desktop/mobile (ne lit plus le DOM écran), insensible au crash
  // oklch de html2canvas. jsPDF reste lazy-loaded (sans html2canvas).
  // Réservé à la fiche recette individuelle - les autres exports
  // (POS, J6b…) continuent d'utiliser exportElementToPdf.
  // ═══════════════════════════════════════════════════════════════

  // jsPDF ET les polices de marque : les deux doivent etre en memoire avant le
  // clic, puisque le dessin d'un lot d'etiquettes se fait ensuite sans le
  // moindre await (cf. precharger et construireEtiquettesDlcSync).
  async _loadJsPdf() {
    if (this._jsPdf) return this._jsPdf;
    const [{ jsPDF }] = await Promise.all([import('jspdf'), loadBrandFonts()]);
    this._jsPdf = jsPDF;
    return jsPDF;
  },

  // Document A4 portrait, polices de marque enregistrees. Point d'entree unique
  // des generateurs vectoriels : aucun ne construit son jsPDF lui-meme, sinon
  // un document finirait par sortir sans les polices.
  _nouveauDocA4(jsPDF, orientation = 'portrait') {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation });
    registerBrandFonts(doc);
    return doc;
  },

  // ═══════════════════════════════════════════════════════════════
  // PRIMITIVES DE LA DA - tous les generateurs vectoriels dessinent
  // avec celles-ci. Aucune couleur, aucune police, aucune epaisseur
  // de filet n'est ecrite ailleurs.
  // ═══════════════════════════════════════════════════════════════

  // Largeur reelle d'un texte interlettre : jsPDF mesure la chaine sans tenir
  // compte de charSpace, un titre centre sortirait donc decale de la moitie de
  // son interlettrage. On centre nous-memes a partir de la largeur vraie.
  _largeurTexte(doc, text, charSpace = 0) {
    const s = String(text || '');
    if (!s) return 0;
    return doc.getTextWidth(s) + charSpace * Math.max(0, s.length - 1);
  },

  _texteCentre(doc, text, cx, y, charSpace = 0) {
    const s = String(text || '');
    if (!s) return;
    doc.text(s, cx - this._largeurTexte(doc, s, charSpace) / 2, y, charSpace ? { charSpace } : undefined);
  },

  // Meme raison que _texteCentre : l'option align:'right' de jsPDF cale la
  // chaine sur sa largeur SANS interlettrage, la fin du mot depasse donc
  // l'ancre de tout l'espacement accumule. Un libelle de colonne finissait
  // rogne par le bord de la bande, une mention debordait dans la marge.
  _texteDroite(doc, text, xDroite, y, charSpace = 0) {
    const s = String(text || '');
    if (!s) return;
    doc.text(s, xDroite - this._largeurTexte(doc, s, charSpace), y, charSpace ? { charSpace } : undefined);
  },

  // En-tete commun : identite a gauche, etablissement a droite, titre en Lora
  // centre, filet plein de 1,6 pt en dessous. Repete a chaque page d'un
  // document multi-pages - une feuille separee du reste doit rester
  // identifiable. Retourne l'ordonnee ou le contenu commence.
  _enTeteDocument(doc, options = {}) {
    const { titre = '', sousTitre = '', meta = '', logoDataUrl = null } = options;
    const etab = (options.etablissement || '').toString();
    const M = BRAND.page.marginMm;
    const PAGE_W = doc.internal.pageSize.getWidth();
    const centreX = PAGE_W / 2;
    const headerH = 12;

    if (logoDataUrl) {
      try {
        const fmt = logoDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
        doc.addImage(logoDataUrl, fmt, M, M - 1, 20, headerH);
      } catch (e) { /* logo illisible : le nom de l'etablissement suffit */ }
    }
    if (etab) {
      setBrandFont(doc, 'label');
      doc.setFontSize(BRAND.size.sectionLabel);
      doc.setTextColor(...PDF.primary);
      this._texteDroite(doc, etab.toUpperCase(), PAGE_W - M, M + 5, BRAND.charSpace.label);
    }

    let y = M + headerH + 4;
    setBrandFont(doc, 'voice');
    doc.setTextColor(...PDF.primary);
    // Un nom de recette long ne doit ni deborder ni passer a la ligne : on
    // descend le corps du titre jusqu'a ce qu'il tienne dans la justification.
    const largeurMax = PAGE_W - 2 * M;
    let corpsTitre = BRAND.size.title;
    doc.setFontSize(corpsTitre);
    while (corpsTitre > 9 && this._largeurTexte(doc, titre, BRAND.charSpace.title) > largeurMax) {
      corpsTitre -= 0.25;
      doc.setFontSize(corpsTitre);
    }
    this._texteCentre(doc, titre, centreX, y, BRAND.charSpace.title);

    if (sousTitre) {
      y += 5;
      setBrandFont(doc, 'data');
      doc.setFontSize(BRAND.size.note);
      doc.setTextColor(...PDF.stone);
      this._texteCentre(doc, sousTitre, centreX, y);
    }
    if (meta) {
      y += 4;
      setBrandFont(doc, 'data');
      doc.setFontSize(BRAND.size.note);
      doc.setTextColor(...PDF.stone);
      this._texteCentre(doc, meta, centreX, y);
    }

    y += 4;
    doc.setDrawColor(...PDF.primary);
    doc.setLineWidth(RULE.strong);
    doc.line(M, y, PAGE_W - M, y);
    return y + 8;
  },

  // Titre de section : barre laterale d'accent de 2,2 pt, etiquette en
  // capitales interlettrees, filet fin sous le bloc.
  _titreSection(doc, label, x, y, w) {
    doc.setDrawColor(...PDF.accent);
    doc.setLineWidth(RULE.accentBar);
    doc.line(x + RULE.accentBar / 2, y - 3.1, x + RULE.accentBar / 2, y + 0.6);
    setBrandFont(doc, 'label');
    doc.setFontSize(BRAND.size.sectionLabel);
    doc.setTextColor(...PDF.primary);
    doc.text(String(label || '').toUpperCase(), x + 3.2, y, { charSpace: BRAND.charSpace.sectionLabel });
    doc.setDrawColor(...PDF.rule);
    doc.setLineWidth(RULE.medium);
    doc.line(x, y + 2.4, x + w, y + 2.4);
    return y + 7;
  },

  // Titre de bloc en Lora : sert quand le bloc porte un nom propre (une
  // categorie, une journee) plutot qu'une etiquette de rubrique.
  _titreBloc(doc, texte, x, y, w) {
    doc.setDrawColor(...PDF.accent);
    doc.setLineWidth(RULE.accentBar);
    doc.line(x + RULE.accentBar / 2, y - 3.4, x + RULE.accentBar / 2, y + 0.8);
    setBrandFont(doc, 'voice');
    doc.setFontSize(BRAND.size.blockTitle);
    doc.setTextColor(...PDF.primary);
    doc.text(String(texte || ''), x + 3.2, y);
    doc.setDrawColor(...PDF.rule);
    doc.setLineWidth(RULE.medium);
    doc.line(x, y + 2.4, x + w, y + 2.4);
    return y + 7;
  },

  // Bande d'en-tete de tableau : fond plein en couleur de marque, libelles
  // blancs en capitales interlettrees. `colonnes` = [{ label, x, align? }].
  _bandeTableau(doc, colonnes, x, y, w, h = 6) {
    doc.setFillColor(...PDF.primary);
    doc.rect(x, y, w, h, 'F');
    setBrandFont(doc, 'label');
    doc.setFontSize(BRAND.size.sectionLabel);
    doc.setTextColor(...PDF.white);
    const baseline = y + h / 2 + BRAND.size.sectionLabel * 0.3528 * 0.36;
    colonnes.forEach((c) => {
      const label = String(c.label || '').toUpperCase();
      if (c.align === 'right') {
        this._texteDroite(doc, label, c.x, baseline, BRAND.charSpace.label);
      } else {
        doc.text(label, c.x, baseline, { charSpace: BRAND.charSpace.label });
      }
    });
    return y + h + 4;
  },

  // Alternance de lignes. Dessinee AVANT le texte, sinon elle le recouvre.
  _fondZebre(doc, index, x, y, w, h) {
    if (index % 2 === 0) return;
    doc.setFillColor(...PDF.zebra);
    doc.rect(x, y, w, h, 'F');
  },

  // Ligne de total : fond en teinte claire, filet superieur en couleur de
  // marque. Le montant lui-meme reste en Lora, jamais en sans-serif.
  _fondTotal(doc, x, y, w, h) {
    doc.setFillColor(...PDF.tint);
    doc.rect(x, y, w, h, 'F');
    doc.setDrawColor(...PDF.primary);
    doc.setLineWidth(RULE.strong);
    doc.line(x, y, x + w, y);
  },

  _filetInterne(doc, x1, y, x2) {
    doc.setDrawColor(...PDF.ruleLight);
    doc.setLineWidth(RULE.hair);
    doc.line(x1, y, x2, y);
  },

  // Case a cocher. Cochee : fond de marque et coche blanche. Vide : filet seul.
  _caseACocher(doc, x, y, taille, cochee, couleurVide = PDF.stone) {
    if (cochee) {
      doc.setFillColor(...PDF.primary);
      doc.rect(x, y, taille, taille, 'F');
      doc.setDrawColor(...PDF.white);
      doc.setLineWidth(0.45);
      doc.line(x + taille * 0.24, y + taille * 0.53, x + taille * 0.42, y + taille * 0.76);
      doc.line(x + taille * 0.42, y + taille * 0.76, x + taille * 0.81, y + taille * 0.29);
    } else {
      doc.setDrawColor(...couleurVide);
      doc.setLineWidth(RULE.medium);
      doc.rect(x, y, taille, taille, 'S');
    }
  },

  // Folio des documents de CONFORMITE seulement (registre HACCP, checklist
  // SOP). Ce n'est pas le pied de page que la DA proscrit : ni filet, ni
  // signature, ni date repetee - le rang de la feuille et rien d'autre, pose
  // dans la marge basse. Un registre presente en controle se feuillette, et une
  // page detachee de la liasse doit pouvoir s'y remettre a sa place.
  // A appeler en toute fin de rendu, le total n'etant connu qu'a ce moment.
  _folio(doc) {
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i += 1) {
      doc.setPage(i);
      setBrandFont(doc, 'label');
      doc.setFontSize(BRAND.size.note);
      doc.setTextColor(...PDF.stone);
      this._texteCentre(doc, `${i} / ${total}`, PAGE_W / 2, PAGE_H - 10, BRAND.charSpace.label);
    }
  },

  // Bloc de visa : attendu sur un registre presente en controle. Ce n'est pas
  // un pied de page, c'est du contenu - il suit le dernier tableau.
  _blocVisa(doc, y) {
    const M = BRAND.page.marginMm;
    const PAGE_W = doc.internal.pageSize.getWidth();
    doc.setDrawColor(...PDF.rule);
    doc.setLineWidth(RULE.medium);
    doc.line(PAGE_W - M - 60, y, PAGE_W - M, y);
    setBrandFont(doc, 'label');
    doc.setFontSize(BRAND.size.note);
    doc.setTextColor(...PDF.stone);
    this._texteDroite(doc, 'DATE ET VISA DU RESPONSABLE', PAGE_W - M, y + 4, BRAND.charSpace.label);
  },

  // ─── Préchargement de jsPDF ───────────────────────────────────────────────
  // iOS n'autorise navigator.share que dans la tâche déclenchée par le geste de
  // l'utilisateur : le moindre await intercalé, fût-ce celui d'un import déjà
  // résolu, et le partage est refusé. Un onglet qui sait qu'il va produire un
  // PDF appelle donc ceci à son montage, pour que la construction soit ensuite
  // entièrement synchrone au moment du clic.
  precharger() {
    if (!this._prechargement) this._prechargement = this._loadJsPdf().catch(() => null);
    return this._prechargement;
  },

  jsPdfDisponible() {
    return !!this._jsPdf;
  },

  // Logo établissement → dataURL pour doc.addImage (jsPDF n'accepte pas
  // une URL distante directement). Échec silencieux : la fiche reste
  // propre sans logo (seul le nom de l'établissement subsiste).
  async _resolveLogoDataUrl(etablissement) {
    const src = etablissement?.logo_url
      || (() => { try { return readJson('sc_app_logo', null); } catch { return null; } })();
    if (!src || typeof src !== 'string') return null;
    if (src.startsWith('data:')) return src;
    const win = getBrowserWindow();
    if (!win || typeof win.Image === 'undefined') return null;
    return new Promise((resolve) => {
      try {
        const img = new win.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = win.document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch { resolve(null); } // canvas « tainted » (CORS) → on abandonne le logo
        };
        img.onerror = () => resolve(null);
        img.src = src;
      } catch { resolve(null); }
    });
  },

  // Point d'entrée public. `recette` est un objet déjà normalisé par le
  // module appelant (plat, famille, metaCells, ingredients, etapes,
  // notes, allergenesText) : la logique de rôle (food cost consultant)
  // et la résolution des allergènes restent côté module.
  // options : { etablissement, accent?, autoPrint?, filename?, logoDataUrl? }
  async exportRecettePdf(recette, options = {}) {
    try {
      const jsPDF = await this._loadJsPdf();
      const etab = options.etablissement || this._getCurrentEtablissement();
      const logoDataUrl = options.logoDataUrl !== undefined
        ? options.logoDataUrl
        : await this._resolveLogoDataUrl(etab);
      const doc = this._buildRecettePDF(jsPDF, recette, { ...options, etablissement: etab, logoDataUrl });
      if (options.autoPrint) {
        doc.autoPrint();
        const win = getBrowserWindow();
        const url = doc.output('bloburl');
        if (win) win.open(url, '_blank'); else doc.save(options.filename || 'fiche-recette.pdf');
      } else {
        doc.save(options.filename || 'fiche-recette.pdf');
      }
      return doc;
    } catch (err) {
      console.error('[pdf exportRecettePdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  // Export GROUPÉ : plusieurs fiches recette dans un seul PDF (1 fiche = 1 page A4).
  // Utilisé par « Export multiple » (un plat = toutes ses recettes, ou une sélection).
  async exportRecettesPdf(recettes, options = {}) {
    try {
      const list = (recettes || []).filter(Boolean);
      if (!list.length) { notifyLegacy('Aucune fiche à exporter.', 'warning'); return null; }
      const jsPDF = await this._loadJsPdf();
      const etab = options.etablissement || this._getCurrentEtablissement();
      const logoDataUrl = options.logoDataUrl !== undefined
        ? options.logoDataUrl
        : await this._resolveLogoDataUrl(etab);
      const doc = this._nouveauDocA4(jsPDF);
      list.forEach((rec, i) => {
        if (i > 0) doc.addPage();
        this._renderRecettePage(doc, rec, { ...options, etablissement: etab, logoDataUrl });
      });
      if (options.autoPrint) {
        doc.autoPrint();
        const win = getBrowserWindow();
        const url = doc.output('bloburl');
        if (win) win.open(url, '_blank'); else doc.save(options.filename || 'fiches-recettes.pdf');
      } else {
        doc.save(options.filename || 'fiches-recettes.pdf');
      }
      return doc;
    } catch (err) {
      console.error('[pdf exportRecettesPdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // ÉTIQUETTES DLC - poste d'étiquetage (onglet Étiquettes du module HACCP)
  // ───────────────────────────────────────────────────────────────
  // Une étiquette = UNE page à la dimension exacte du media (défaut :
  // prédécoupé Brother DK-11209, 62 × 29 mm), le massicot suivant alors les
  // prédécoupes. Le pavage de plusieurs étiquettes par feuille n'existe que
  // pour la bande continue, dont AirPrint ne propose aucune longueur.
  // Texte vectoriel natif, jsPDF lazy-loadé, aucun html2canvas.
  // Les dimensions viennent de utils/etiquettesDlc.js - rien en dur ici.
  //
  // etiquettes : [{ lignes: [{ role, text?, segments?, bold? }] }]
  //   role 'nom' | 'dlc' | 'corps' choisit la police, le contenu est
  //   construit par le module (lignesEtiquette).
  // options : { format?, autoPrint?, filename?, onProgress?, destination?, fenetre? }
  //   destination 'agent' : ne rien ouvrir ni télécharger, retourner le PDF en
  //   base64 pour l'envoyer à l'agent d'impression du restaurant.
  //   fenetre : onglet vide déjà ouvert par l'appelant au moment du clic, dans
  //   lequel afficher le PDF (contournement obligatoire du bloqueur iOS).
  // Retour : { doc, url, ouvert, base64? } - `url` reste exploitable par
  // l'appelant si le PDF n'a pas pu être affiché.
  // ═══════════════════════════════════════════════════════════════
  async exportEtiquettesDlcPdf(etiquettes, options = {}) {
    try {
      const list = (etiquettes || []).filter(e => e && Array.isArray(e.lignes) && e.lignes.length);
      if (!list.length) { notifyLegacy('Aucune étiquette à générer.', 'warning'); return null; }
      const jsPDF = await this._loadJsPdf();
      const { doc } = this._dessinerLotEtiquettes(jsPDF, list, options);
      const filename = options.filename || 'etiquettes-dlc.pdf';

      // Impression directe : le lot part vers l'agent du restaurant, l'app
      // n'ouvre rien du tout. On rend quand même `url` pour que l'appelant
      // puisse retomber sur le PDF si l'envoi échoue.
      if (options.destination === 'agent') {
        const url = doc.output('bloburl');
        const base64 = doc.output('datauristring').split('base64,').pop();
        return { doc, url, ouvert: false, base64 };
      }

      // Demande d'impression à l'ouverture, honorée par les visualiseurs de
      // bureau, ignorée sur iPad. AVANT output() : l'action est écrite dans le
      // fichier, l'ajouter après ne toucherait plus le blob déjà sérialisé.
      if (options.autoPrint) doc.autoPrint();
      const url = doc.output('bloburl');

      // ─── Le PDF, et rien autour ──────────────────────────────────────────
      // On n'imprime plus depuis une iframe : le navigateur imprime alors une
      // PAGE WEB et y ajoute ses propres en-tête et pied de page, d'où l'URL du
      // document qui ressortait IMPRIMÉE en bas de l'étiquette. Le visualiseur
      // PDF du système, lui, sort la page telle quelle, à la dimension exacte
      // du media.
      //
      // La fenêtre est ouverte par l'appelant AU MOMENT DU CLIC et passée ici
      // (options.fenetre) : iOS refuse tout window.open déclenché après une
      // promesse, et la génération en comporte plusieurs.
      let ouvert = false;
      const fenetre = options.fenetre;
      if (fenetre && !fenetre.closed) {
        try { fenetre.location.href = url; ouvert = true; } catch { ouvert = false; }
      }
      if (!ouvert) {
        const win = getBrowserWindow();
        if (win?.open(url, '_blank')) ouvert = true;
        else doc.save(filename); // dernier recours : le fichier, ouvert à la main
      }
      return { doc, url, ouvert };
    } catch (err) {
      console.error('[pdf exportEtiquettesDlcPdf]', err);
      notifyLegacy('Génération des étiquettes échouée : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  // ─── Dessin d'un lot, SYNCHRONE ───────────────────────────────────────────
  // Aucun await : c'est la condition pour que navigator.share reste autorisé par
  // iOS après le clic (cf. precharger). Le dessin d'une étiquette est du texte
  // vectoriel, quelques dizaines de millisecondes pour un gros lot - il n'y a
  // rien à rendre au navigateur entre deux pages.
  //
  // Géométrie de page : deux transports, deux contraintes.
  // Agent local : CUPS reçoit la dimension exacte de l'étiquette, une page =
  // une étiquette, le massicot suit les prédécoupes.
  // AirPrint : iOS met la page à l'échelle du format de papier de SA liste. Sur
  // un prédécoupé ce format existe et correspond ; sur une bande continue il
  // n'en existe aucun, d'où le pavage d'une feuille par plusieurs étiquettes
  // dès que pageHeightMm est renseigné (cf. ETIQUETTE_MEDIA).
  _dessinerLotEtiquettes(jsPDF, list, options = {}) {
    const cfg = { ...ETIQUETTE_MEDIA, ...(options.format || {}) };
    const versAgent = options.destination === 'agent';
    const pageW = versAgent ? cfg.widthMm : (cfg.pageWidthMm ?? cfg.widthMm);
    const pageH = versAgent ? cfg.heightMm : (cfg.pageHeightMm ?? cfg.heightMm);
    const margeY = versAgent ? 0 : (cfg.pageMarginYMm ?? 0);
    const parPage = Math.max(1, Math.floor((pageH - 2 * margeY) / cfg.heightMm));
    // jsPDF intervertit les côtés si l'orientation ne correspond pas : on la
    // déduit du format plutôt que de l'écrire en dur, sinon une feuille plus
    // haute que large ressortirait couchée.
    const format = [pageW, pageH];
    const orientation = pageW > pageH ? 'landscape' : 'portrait';
    const doc = new jsPDF({ unit: 'mm', format, orientation });
    registerBrandFonts(doc);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    for (let i = 0; i < list.length; i += 1) {
      const rang = i % parPage;
      if (i > 0 && rang === 0) doc.addPage(format, orientation);
      const offsetY = margeY + rang * cfg.heightMm;
      // Trait de coupe à la frontière de deux étiquettes voisines : c'est là que
      // la brigade sépare la feuille. Jamais au-dessus de la première, ce
      // bord-là est déjà coupé. Sans pavage (prédécoupé), rang vaut toujours 0.
      if (rang > 0 && cfg.traitCoupeMm) this._traitDeCoupe(doc, offsetY, pageW, cfg);
      this._renderEtiquetteDlc(doc, list[i], cfg, offsetY);
    }
    if (onProgress) onProgress(list.length, list.length);
    return { doc, cfg, parPage };
  },

  // Lot prêt à partager, construit SANS le moindre await. Réservé au chemin
  // « feuille de partage iOS » : l'appelant doit avoir appelé precharger() en
  // amont, faute de quoi jsPDF n'est pas là et la construction est impossible.
  // Retourne null plutôt que de lever : l'appelant retombe alors sur le chemin
  // asynchrone habituel.
  construireEtiquettesDlcSync(etiquettes, options = {}) {
    if (!this._jsPdf) return null;
    const list = (etiquettes || []).filter(e => e && Array.isArray(e.lignes) && e.lignes.length);
    if (!list.length) return null;
    try {
      const { doc } = this._dessinerLotEtiquettes(this._jsPdf, list, options);
      return { doc, blob: doc.output('blob') };
    } catch (err) {
      console.error('[pdf construireEtiquettesDlcSync]', err);
      return null;
    }
  },

  // Trait de coupe pointillé entre deux étiquettes voisines d'une même feuille.
  // Pointillé et non plein : c'est un repère de ciseaux, il ne doit pas se lire
  // comme le cadre d'une étiquette.
  _traitDeCoupe(doc, y, pageW, cfg) {
    const marge = cfg.marginXMm ?? 2;
    doc.setDrawColor(...PDF.thermalInk);
    doc.setLineWidth(cfg.traitCoupeMm ?? 0.15);
    doc.setLineDashPattern([1, 1.2], 0);
    doc.line(marge, y, pageW - marge, y);
    // Le pointillé est un état du document : sans remise à zéro, le cadre de
    // l'étiquette suivante sortirait en pointillé lui aussi.
    doc.setLineDashPattern([], 0);
  },

  // Rend UNE étiquette sur la page courante. Les lignes sont ajustées à la
  // largeur imprimable (paliers de police puis troncature), réduites si elles
  // ne tiennent pas en hauteur, puis réparties sur la hauteur restante : le
  // mode Surgélation, cinq lignes sur 24 mm, sert de calibre.
  // offsetY : position de l'étiquette dans la feuille, une feuille AirPrint en
  // portant plusieurs.
  _renderEtiquetteDlc(doc, etiquette, cfg, offsetY = 0) {
    const MM_PER_PT = 0.3528;
    const LINE_FACTOR = 1.15;   // interligne relatif au corps de police
    const SEGMENT_GAP = 3;      // mm entre température et mention en gras
    const F = ETIQUETTE_FONTS;
    // Marges asymétriques : la zone imprimable du media est plus étroite que
    // l'étiquette (cf. ETIQUETTE_MEDIA). Écrire au-delà ne produit pas une
    // erreur, ça sort une étiquette rognée.
    const mx = cfg.marginXMm ?? cfg.marginMm ?? 2;
    const my = cfg.marginYMm ?? cfg.marginMm ?? 2;
    // Filet de délimitation au bord de la zone imprimable, texte en retrait à
    // l'intérieur pour qu'aucune lettre ne vienne toucher le trait.
    const trait = cfg.cadreTraitMm ?? 0;
    const padX = trait > 0 ? (cfg.cadrePadXMm ?? 1.2) : 0;
    const padY = trait > 0 ? (cfg.cadrePadYMm ?? 0.8) : 0;
    const usableW = cfg.widthMm - 2 * mx - 2 * padX;
    const usableH = cfg.heightMm - 2 * my - 2 * padY;

    // Encre pleine, pas de couleur de marque : le media est monochrome, le bleu
    // pétrole sortirait en trame grise et l'étiquette perdrait le contraste qui
    // la rend lisible à bout de bras dans une chambre froide. L'identité passe
    // ici par la typographie seule (cf. THERMAL dans brandTokens).
    doc.setTextColor(...PDF.thermalInk);

    if (trait > 0) {
      // Le trait est centré sur le chemin : on rentre d'une demi-épaisseur pour
      // qu'il reste entièrement dans la zone que la tête d'impression couvre.
      doc.setDrawColor(...PDF.thermalInk);
      doc.setLineWidth(trait);
      doc.roundedRect(
        mx + trait / 2,
        offsetY + my + trait / 2,
        cfg.widthMm - 2 * mx - trait,
        cfg.heightMm - 2 * my - trait,
        cfg.cadreRayonMm ?? 0,
        cfg.cadreRayonMm ?? 0,
      );
    }

    // « bold » dans les données d'étiquette signifie « mention à faire
    // ressortir » (l'avertissement obligatoire du mode Surgélation). La DA n'a
    // pas de gras : c'est le changement de famille qui porte la hiérarchie,
    // Poppins Medium contre Poppins Light. L'ajustement se fait sur des mesures
    // réelles, il suit donc les métriques de la police retenue sans recalage.
    const widthAt = (text, size, fort) => {
      setBrandFont(doc, fort ? 'label' : 'data');
      doc.setFontSize(size);
      return doc.getTextWidth(text);
    };

    // Tronque au plancher de police : la lisibilité à bout de bras dans une
    // chambre froide passe avant la complétude du texte.
    // Marque de troncature en points ASCII et NON '…' : jsPDF mesure bien
    // l'ellipsie Unicode mais la supprime au rendu avec les polices standard
    // (vérifié : 'X…Y' sort '(XY) Tj'), on perdrait le marqueur en silence.
    const ELLIPSIS = '...';
    const truncate = (text, size, bold) => {
      if (widthAt(text, size, bold) <= usableW) return text;
      let cut = text;
      while (cut.length > 1 && widthAt(cut.trimEnd() + ELLIPSIS, size, bold) > usableW) cut = cut.slice(0, -1);
      return cut.trimEnd() + ELLIPSIS;
    };

    // Chaque ligne : segments + taille de police retenue.
    const lignes = etiquette.lignes.map((l) => {
      // Le nom du produit est la ligne d'identification : elle passe en
      // Poppins Medium comme les mentions à faire ressortir.
      const segments = (Array.isArray(l.segments) ? l.segments : [{ text: l.text, bold: l.bold }])
        .map(s => ({ text: pdfSafeText(s.text || ''), bold: l.role === 'nom' || !!(s.bold ?? l.bold) }))
        .filter(s => s.text !== '');
      const measure = (size) => segments.reduce(
        (w, s, i) => w + widthAt(s.text, size, s.bold) + (i > 0 ? SEGMENT_GAP : 0), 0);

      if (l.role === 'nom') {
        const size = F.nomLadder.find(s => measure(s) <= usableW) ?? F.nomLadder[F.nomLadder.length - 1];
        const fitted = measure(size) <= usableW
          ? segments
          : segments.map(s => ({ ...s, text: truncate(s.text, size, s.bold) }));
        return { segments: fitted, size };
      }

      // Lignes de corps et de DLC : on descend par demi-point jusqu'au plancher.
      let size = l.role === 'dlc' ? F.dlc : F.ligne;
      while (size > F.min && measure(size) > usableW) size -= 0.5;
      const fitted = measure(size) <= usableW
        ? segments
        : segments.map(s => ({ ...s, text: truncate(s.text, size, s.bold) }));
      return { segments: fitted, size };
    }).filter(l => l.segments.length);

    if (!lignes.length) return;

    // Ajustement à la HAUTEUR. Les paliers ci-dessus ne traitent que la largeur :
    // sur un media court, le mode Surgélation et ses cinq lignes peuvent déborder
    // sans que rien ne le signale - l'étiquette sort rognée. On réduit alors tout
    // le bloc d'un même facteur, ce qui préserve la hiérarchie nom / DLC / corps.
    // Une police plus petite ne déborde jamais en largeur : rien à recalculer.
    const hauteurBloc = (ls) => ls.reduce((s, l) => s + l.size * MM_PER_PT * LINE_FACTOR, 0);
    const brut = hauteurBloc(lignes);
    if (brut > usableH) {
      const facteur = usableH / brut;
      lignes.forEach((l) => { l.size = Math.max(F.min, l.size * facteur); });
    }

    // Répartition verticale : hauteur restante distribuée uniformément, ce qui
    // absorbe la différence entre un mode à quatre lignes et un à cinq.
    const hauteurs = lignes.map(l => l.size * MM_PER_PT * LINE_FACTOR);
    const totalTexte = hauteurs.reduce((s, h) => s + h, 0);
    const gap = Math.max(0, (usableH - totalTexte) / lignes.length);

    let y = offsetY + my + padY;
    lignes.forEach((l, i) => {
      y += hauteurs[i] * 0.8 + gap / 2;   // baseline
      let x = mx + padX;
      l.segments.forEach((s, j) => {
        setBrandFont(doc, s.bold ? 'label' : 'data');
        doc.setFontSize(l.size);
        doc.text(s.text, x, y);
        if (j < l.segments.length - 1) x += doc.getTextWidth(s.text) + SEGMENT_GAP;
      });
      y += hauteurs[i] * 0.2 + gap / 2;
    });
  },

  _buildRecettePDF(jsPDF, recette, options = {}) {
    const doc = this._nouveauDocA4(jsPDF);
    this._renderRecettePage(doc, recette, options);
    return doc;
  },

  // Rend UNE fiche recette sur la page courante de `doc`. Pour un export
  // multi-fiches, l'appelant fait doc.addPage() entre chaque appel.
  _renderRecettePage(doc, recette, options = {}) {
    const MM_PER_PT = 0.3528;
    const { logoDataUrl = null } = options;
    const etablissement = pdfSafeText((options.etablissement?.nom || 'Samper Consulting').toString());

    const plat       = pdfSafeText((recette.plat || recette.nom || 'Recette').toString().trim());
    const famille    = pdfSafeText((recette.famille || recette.categorie || '').toString().trim());
    const allergenes = pdfSafeText((recette.allergenesText || recette.allergenes || 'Aucun').toString().trim()) || 'Aucun';
    const metaCells  = (Array.isArray(recette.metaCells) ? recette.metaCells.filter(c => c && c.k && c.v) : [])
      .map(c => ({ k: pdfSafeText(c.k), v: pdfSafeText(c.v) }));
    const notes      = (Array.isArray(recette.notes)
      ? recette.notes.filter(n => n && n.label && n.text && String(n.text).trim())
      : []).map(n => ({ label: pdfSafeText(n.label), text: pdfSafeText(n.text) }));

    const ingredients = normalizeIngredients(recette.ingredients)
      .map(ing => ({ ...ing, nom: pdfSafeText(ing.nom), unite: pdfSafeText(ing.unite), qte: pdfSafeText(ing.qte) }));
    const etapes      = normalizeSteps(recette.etapes || recette.process || recette.steps).map(pdfSafeText);

    const PAGE_W = 210, PAGE_H = 297, M = BRAND.page.marginMm;
    const contentW = PAGE_W - 2 * M;

    // ---- En-tete de marque, dessine d'abord : il fixe le haut du corps ----
    const dateStr = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' });
    const metaTop = this._enTeteDocument(doc, {
      titre: plat,
      sousTitre: famille,
      meta: dateStr,
      etablissement,
      logoDataUrl,
    }) - 2;

    // ---- Geometrie verticale (sans collision) ----
    const metaH     = 11;
    const bodyTop   = metaTop + metaH + 6;
    // Le bloc allergenes est du CONTENU, pas un pied de page : il ferme la
    // fiche, ancre en bas puisque la page est unique par construction.
    const allergY   = PAGE_H - M - 6;
    const bodyBottom = allergY - 6;
    const bodyH = bodyBottom - bodyTop;

    // ---- Colonnes : gauche 40 % (ingrédients + notes), droite 58 % (process) ----
    const gutter = 7;
    const colLW = contentW * 0.40;
    const colRW = contentW - colLW - gutter;
    const colLX = M;
    const colRX = M + colLW + gutter;

    // ---- Fit-to-page : corps 10 pt → -0,25 pt jusqu'à tenir, plancher 7 pt ----
    const LINE_FACTOR = 1.28;
    const BODY_MIN = 7;
    // Les etiquettes de section ne suivent PAS la reduction du corps : elles
    // constituent un niveau typographique fixe de la DA. D'ou headMm constant,
    // exactement l'avance rendue par _titreSection.
    const HEAD_MM = 7;
    const setFonteQte = () => setBrandFont(doc, 'voice');
    const setFonteCorps = () => setBrandFont(doc, 'data');

    let body = 10;
    let geom = layoutGeom(body);
    let L = measure(body, geom);
    while (L.maxColH > bodyH && body > BODY_MIN) {
      body -= 0.25;
      geom = layoutGeom(body);
      L = measure(body, geom);
    }

    function layoutGeom(fontPt) {
      const lineMm = fontPt * MM_PER_PT * LINE_FACTOR;
      const headMm = HEAD_MM;
      const pastD  = Math.max(3.2, fontPt * 0.52);
      const pastInset = pastD + 2.5;
      const numPt  = Math.max(6, fontPt * 0.82);
      setFonteQte(); doc.setFontSize(fontPt);
      let qtyW = 0;
      ingredients.forEach((ing) => {
        const q = ing.qte ? `${ing.qte}${ing.unite ? ' ' + ing.unite : ''}` : '';
        qtyW = Math.max(qtyW, doc.getTextWidth(q));
      });
      qtyW = Math.min(qtyW + 2.5, 22);
      return { lineMm, headMm, pastD, pastInset, numPt, qtyW };
    }

    function measure(fontPt, g) {
      // Mesurer avec la police de RENDU : Poppins Light est plus large que la
      // police standard, mesurer avec l'autre ferait deborder la colonne.
      setFonteCorps(); doc.setFontSize(fontPt);
      // Colonne gauche : ingrédients (hanging indent) + notes (dressage/conservation)
      let leftH = g.headMm;
      ingredients.forEach((ing) => {
        const nameLines = doc.splitTextToSize(ing.nom || '', colLW - g.qtyW);
        leftH += Math.max(1, nameLines.length) * g.lineMm;
      });
      notes.forEach((n) => {
        const t = doc.splitTextToSize(String(n.text), colLW);
        leftH += 4 + g.headMm + t.length * g.lineMm;
      });
      // Colonne droite : étapes avec pastilles
      let rightH = g.headMm;
      etapes.forEach((s) => {
        const lines = doc.splitTextToSize(s, colRW - g.pastInset);
        const txtH = lines.length * g.lineMm;
        rightH += Math.max(g.pastD, txtH) + 2.4;
      });
      return { fontPt, ...g, maxColH: Math.max(leftH, rightH) };
    }

    // ---------- RENDU ----------
    // L'en-tete de marque est deja dessine plus haut (il fixait metaTop).

    // Bandeau metadonnees - N cellules egales, etiquette puis valeur en Lora
    if (metaCells.length) {
      const cellW = contentW / metaCells.length;
      doc.setDrawColor(...PDF.rule); doc.setLineWidth(RULE.medium);
      doc.line(M, metaTop, M + contentW, metaTop);
      doc.line(M, metaTop + metaH, M + contentW, metaTop + metaH);
      metaCells.forEach((c, i) => {
        const cx = M + i * cellW + 3;
        if (i > 0) {
          doc.setDrawColor(...PDF.ruleLight); doc.setLineWidth(RULE.medium);
          doc.line(M + i * cellW, metaTop + 1.5, M + i * cellW, metaTop + metaH - 1.5);
        }
        setBrandFont(doc, 'label'); doc.setFontSize(BRAND.size.sectionLabel); doc.setTextColor(...PDF.primary);
        doc.text(String(c.k).toUpperCase(), cx, metaTop + 4.3, { charSpace: BRAND.charSpace.label });
        setBrandFont(doc, 'voice'); doc.setFontSize(BRAND.size.amount); doc.setTextColor(...PDF.ink);
        doc.text(String(c.v), cx, metaTop + 9, { maxWidth: cellW - 5 });
      });
    }

    // Colonne gauche - INGREDIENTS (quantite en Lora + nom, hanging indent)
    let ly = bodyTop;
    ly = this._titreSection(doc, 'Ingrédients', colLX, ly, colLW);
    ingredients.forEach((ing) => {
      const q = ing.qte ? `${ing.qte}${ing.unite ? ' ' + ing.unite : ''}` : '';
      if (q) {
        setBrandFont(doc, 'voice'); doc.setFontSize(L.fontPt); doc.setTextColor(...PDF.primary);
        doc.text(q, colLX, ly);
      }
      setBrandFont(doc, 'data'); doc.setFontSize(L.fontPt); doc.setTextColor(...PDF.ink);
      const nameLines = doc.splitTextToSize(ing.nom || '', colLW - L.qtyW);
      nameLines.forEach((line, k) => { doc.text(line, colLX + L.qtyW, ly + k * L.lineMm); });
      ly += Math.max(1, nameLines.length) * L.lineMm;
    });

    // Notes (Dressage / Conservation) sous les ingredients
    notes.forEach((n) => {
      ly += 4;
      ly = this._titreSection(doc, n.label, colLX, ly, colLW);
      setBrandFont(doc, 'data'); doc.setFontSize(L.fontPt); doc.setTextColor(...PDF.ink);
      doc.splitTextToSize(String(n.text), colLW).forEach((line) => { doc.text(line, colLX, ly); ly += L.lineMm; });
    });

    // Colonne droite - PROCESS avec pastilles rondes numerotees
    let ry = bodyTop;
    ry = this._titreSection(doc, 'Process', colRX, ry, colRW);
    etapes.forEach((s, i) => {
      setBrandFont(doc, 'data'); doc.setFontSize(L.fontPt);
      const lines = doc.splitTextToSize(s, colRW - L.pastInset);
      const txtH = lines.length * L.lineMm;
      const rowH = Math.max(L.pastD, txtH);
      const cx = colRX + L.pastD / 2;
      const cy = ry + L.pastD / 2 - 0.3;
      doc.setFillColor(...PDF.primary); doc.circle(cx, cy, L.pastD / 2, 'F');
      setBrandFont(doc, 'label'); doc.setFontSize(L.numPt); doc.setTextColor(...PDF.white);
      doc.text(String(i + 1), cx, cy + L.numPt * MM_PER_PT * 0.36, { align: 'center' });
      setBrandFont(doc, 'data'); doc.setFontSize(L.fontPt); doc.setTextColor(...PDF.ink);
      lines.forEach((line, k) => { doc.text(line, colRX + L.pastInset, ry + L.lineMm * 0.78 + k * L.lineMm); });
      ry += rowH + 2.4;
    });

    // Separateur vertical entre colonnes
    doc.setDrawColor(...PDF.ruleLight); doc.setLineWidth(RULE.hair);
    doc.line(colRX - gutter / 2, bodyTop, colRX - gutter / 2, bodyBottom);

    // Allergenes : contenu de la fiche, pas un pied de page. Bloc mis en avant
    // sur fond teinte, filet superieur en couleur de marque.
    this._fondTotal(doc, M, allergY - 4.6, contentW, 8);
    setBrandFont(doc, 'label'); doc.setFontSize(BRAND.size.sectionLabel); doc.setTextColor(...PDF.primary);
    doc.text('ALLERGÈNES', M + 2.5, allergY, { charSpace: BRAND.charSpace.label });
    const largeurLabel = this._largeurTexte(doc, 'ALLERGÈNES', BRAND.charSpace.label) + 7;
    setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.body); doc.setTextColor(...PDF.ink);
    doc.text(allergenes, M + largeurLabel, allergY, { maxWidth: contentW - largeurLabel - 4 });
  },

  // ═══════════════════════════════════════════════════════════════
  // LISTE DE COMMANDE - génération jsPDF native (vectorielle, DA Samper)
  // Bon de commande propre, multi-pages, dans la charte de marque (titre en
  // Lora, sections par catégorie, cases à cocher). Cohérent avec la fiche
  // recette plutôt qu'une capture html2canvas de l'écran.
  // payload : { groups:[{categorie, items:[{nom, besoinText, qtyText, coche}]}], totalCount, cocheCount }
  // options : { etablissement, autoPrint, filename, logoDataUrl }
  // ═══════════════════════════════════════════════════════════════
  async exportCommandePdf(payload, options = {}) {
    try {
      const jsPDF = await this._loadJsPdf();
      const etab = options.etablissement || this._getCurrentEtablissement();
      const logoDataUrl = options.logoDataUrl !== undefined
        ? options.logoDataUrl
        : await this._resolveLogoDataUrl(etab);
      const doc = this._nouveauDocA4(jsPDF);
      this._renderCommande(doc, payload || {}, { ...options, etablissement: etab, logoDataUrl });
      if (options.autoPrint) {
        doc.autoPrint();
        const win = getBrowserWindow();
        const url = doc.output('bloburl');
        if (win) win.open(url, '_blank'); else doc.save(options.filename || 'liste-commande.pdf');
      } else {
        doc.save(options.filename || 'liste-commande.pdf');
      }
      return doc;
    } catch (err) {
      console.error('[pdf exportCommandePdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  _renderCommande(doc, payload, options = {}) {
    const PAGE_W = 210, PAGE_H = 297, M = BRAND.page.marginMm;
    const contentW = PAGE_W - 2 * M;
    const etabName = pdfSafeText((options.etablissement?.nom || 'Samper Consulting').toString());
    const logoDataUrl = options.logoDataUrl || null;
    const groups = Array.isArray(payload.groups) ? payload.groups : [];
    const totalCount = payload.totalCount != null ? payload.totalCount : groups.reduce((s, g) => s + (g.items?.length || 0), 0);
    const cocheCount = payload.cocheCount || 0;
    const cartesLabel = pdfSafeText((payload.cartesLabel || '').toString().trim());
    const dateStr = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' });

    // Colonnes calquees sur la liste de reference : ingredient a gauche, colonne
    // « Commande » a droite (case a cocher + espace pour ecrire la quantite a la
    // main). Aucun grammage recommande : ce sont les cuisiniers qui saisissent.
    const boxSize = 3.8;
    const checkRight = PAGE_W - M;         // bord droit de la case a cocher
    const checkX = checkRight - boxSize;   // coin gauche de la case
    const qtyRight = checkX - 4;           // quantite saisie, alignee a droite de la case
    const nomX = M;
    const nomMaxW = qtyRight - nomX - 20;  // laisse la place a la quantite manuscrite
    const bodyBottom = PAGE_H - M;
    const LINE_H = 4.6;

    const drawHeader = () => this._enTeteDocument(doc, {
      titre: 'Liste de commande',
      sousTitre: cartesLabel ? `Cartes : ${cartesLabel}` : '',
      meta: `${dateStr}  ·  ${totalCount} produit${totalCount > 1 ? 's' : ''}  ·  ${cocheCount} coché${cocheCount > 1 ? 's' : ''}`,
      etablissement: etabName,
      logoDataUrl,
    });

    let y = drawHeader();
    const ensureSpace = (h) => {
      if (y + h > bodyBottom) { doc.addPage(); y = drawHeader(); }
    };

    if (!groups.length) {
      setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.body); doc.setTextColor(...PDF.stone);
      doc.text('Aucun produit dans la liste.', M, y + 4);
    }

    groups.forEach((group) => {
      ensureSpace(20);
      y = this._titreBloc(doc, pdfSafeText(String(group.categorie || 'Autres')), M, y, contentW);
      y = this._bandeTableau(doc, [
        { label: 'Ingrédient', x: nomX + 2.5 },
        { label: 'Commande', x: checkRight - 2.5, align: 'right' },
      ], M, y - 4, contentW);

      (group.items || []).forEach((it, index) => {
        setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.body);
        const nameLines = doc.splitTextToSize(pdfSafeText(String(it.nom || '')), nomMaxW);
        const rowH = Math.max(7, nameLines.length * LINE_H + 2.4);
        ensureSpace(rowH);
        this._fondZebre(doc, index, M, y - 4, contentW, rowH);
        const boxY = y - 3;
        // Nom de l'ingredient a gauche
        setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.body); doc.setTextColor(...PDF.ink);
        nameLines.forEach((line, k) => doc.text(line, nomX + 2.5, y + k * LINE_H));
        // Quantite saisie (si renseignee) a gauche de la case ; sinon espace vierge a remplir
        if (it.qtyText) {
          setBrandFont(doc, 'voice'); doc.setFontSize(BRAND.size.amount); doc.setTextColor(...PDF.primary);
          doc.text(pdfSafeText(String(it.qtyText)), qtyRight, y, { align: 'right' });
        }
        this._caseACocher(doc, checkX, boxY, boxSize, it.coche);
        this._filetInterne(doc, M, y + rowH - 4, M + contentW);
        y += rowH;
      });
      y += 5;
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // MISE EN PLACE - liste de production (jsPDF natif, vectoriel, DA Samper)
  // Deux sections : Urgent (non congelable) en PREMIER, puis Grosse production.
  // Cases a cocher imprimees, multi-pages A4. Document lisible comme ecrit a la
  // main : pas de capitales criardes sur les titres de section, pas de tirets
  // cadratins, pas de marqueur genere.
  // payload : { titre, sousTitre, sections:[{ titre, hint, items:[{label, qtyText, aQualifier, fait}] }] }
  // options : { etablissement, autoPrint, filename, logoDataUrl }
  // ═══════════════════════════════════════════════════════════════
  async exportMepPdf(payload, options = {}) {
    try {
      const jsPDF = await this._loadJsPdf();
      const etab = options.etablissement || this._getCurrentEtablissement();
      const logoDataUrl = options.logoDataUrl !== undefined
        ? options.logoDataUrl
        : await this._resolveLogoDataUrl(etab);
      const doc = this._nouveauDocA4(jsPDF);
      this._renderMep(doc, payload || {}, { ...options, etablissement: etab, logoDataUrl });
      if (options.autoPrint) {
        doc.autoPrint();
        const win = getBrowserWindow();
        const url = doc.output('bloburl');
        if (win) win.open(url, '_blank'); else doc.save(options.filename || 'mise-en-place.pdf');
      } else {
        doc.save(options.filename || 'mise-en-place.pdf');
      }
      return doc;
    } catch (err) {
      console.error('[pdf exportMepPdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  _renderMep(doc, payload, options = {}) {
    const PAGE_W = 210, PAGE_H = 297, M = BRAND.page.marginMm;
    const contentW = PAGE_W - 2 * M;
    const etabName = pdfSafeText((options.etablissement?.nom || 'Samper Consulting').toString());
    const logoDataUrl = options.logoDataUrl || null;
    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    const totalCount = sections.reduce((s, g) => s + (g.items?.length || 0), 0);
    const faitCount = sections.reduce((s, g) => s + (g.items || []).filter(i => i.fait).length, 0);
    const titre = pdfSafeText((payload.titre || 'Liste de mise en place').toString());
    const sousTitre = pdfSafeText((payload.sousTitre || '').toString().trim());
    const dateStr = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' });

    // Meme visuel que la liste de commande : preparation a gauche, colonne « fait »
    // (case a cocher) a droite, quantite cible juste a gauche de la case.
    const boxSize = 3.8;
    const checkRight = PAGE_W - M;
    const checkX = checkRight - boxSize;
    const qtyRight = checkX - 4;
    const nomX = M;
    const nomMaxW = qtyRight - nomX - 24;
    const bodyBottom = PAGE_H - M;
    const LINE_H = 4.6;

    const drawHeader = () => this._enTeteDocument(doc, {
      titre,
      sousTitre,
      meta: `${dateStr}  ·  ${totalCount} préparation${totalCount > 1 ? 's' : ''}  ·  ${faitCount} faite${faitCount > 1 ? 's' : ''}`,
      etablissement: etabName,
      logoDataUrl,
    });

    let y = drawHeader();
    const ensureSpace = (h) => {
      if (y + h > bodyBottom) { doc.addPage(); y = drawHeader(); }
    };

    if (!totalCount) {
      setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.body); doc.setTextColor(...PDF.stone);
      doc.text('Aucune préparation dans cette liste.', M, y + 4);
    }

    sections.forEach((section) => {
      if (!(section.items || []).length) return;
      ensureSpace(22);
      y = this._titreBloc(doc, pdfSafeText(String(section.titre || '')), M, y, contentW);
      if (section.hint) {
        setBrandFont(doc, 'voiceItalic'); doc.setFontSize(BRAND.size.note); doc.setTextColor(...PDF.stone);
        doc.text(pdfSafeText(String(section.hint)), M + 3.2, y);
        y += 8; // la bande d'en-tete se pose 4 mm au-dessus de la ligne suivante
      }
      y = this._bandeTableau(doc, [
        { label: 'Préparation', x: nomX + 2.5 },
        { label: 'Fait', x: checkRight - 2.5, align: 'right' },
      ], M, y - 4, contentW);

      (section.items || []).forEach((it, index) => {
        setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.body);
        const nameLines = doc.splitTextToSize(pdfSafeText(String(it.label || '')), nomMaxW);
        const rowH = Math.max(7, nameLines.length * LINE_H + 2.4);
        ensureSpace(rowH);
        this._fondZebre(doc, index, M, y - 4, contentW, rowH);
        const boxY = y - 3;
        // Nom de la preparation a gauche
        setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.body); doc.setTextColor(...PDF.ink);
        nameLines.forEach((line, k) => doc.text(line, nomX + 2.5, y + k * LINE_H));
        if (it.aQualifier) {
          const largeur = doc.getTextWidth(nameLines[0]);
          setBrandFont(doc, 'voiceItalic'); doc.setFontSize(BRAND.size.note); doc.setTextColor(...PDF.accent);
          doc.text('à qualifier', nomX + 2.5 + largeur + 3, y);
        }
        // Quantite cible (si renseignee) a gauche de la case
        if (it.qtyText) {
          setBrandFont(doc, 'voice'); doc.setFontSize(BRAND.size.amount); doc.setTextColor(...PDF.primary);
          doc.text(pdfSafeText(String(it.qtyText)), qtyRight, y, { align: 'right' });
        }
        this._caseACocher(doc, checkX, boxY, boxSize, it.fait);
        this._filetInterne(doc, M, y + rowH - 4, M + contentW);
        y += rowH;
      });
      y += 5;
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // REGISTRE HACCP - relevés de température (jsPDF natif, vectoriel)
  // Journalier ou mensuel : le payload arrive déjà groupé par jour.
  // Généré en vectoriel (pas de capture html2canvas) : lignes jamais
  // coupées entre deux pages, en-têtes répétés, anomalies en rouge -
  // document présentable lors d'un contrôle d'hygiène. Même DA que la
  // fiche recette et la liste de commande.
  // payload : { periodeLabel, stats:{total,conformes,anomalies,taux},
  //   days:[{ dateLabel, rows:[{zone,heure,valeur,operateur,conforme,commentaire}] }] }
  // options : { etablissement, autoPrint, filename, logoDataUrl }
  // ═══════════════════════════════════════════════════════════════
  async exportHaccpRelevesPdf(payload, options = {}) {
    try {
      const jsPDF = await this._loadJsPdf();
      const etab = options.etablissement || this._getCurrentEtablissement();
      const logoDataUrl = options.logoDataUrl !== undefined
        ? options.logoDataUrl
        : await this._resolveLogoDataUrl(etab);
      const doc = this._nouveauDocA4(jsPDF);
      this._renderHaccpReleves(doc, payload || {}, { ...options, etablissement: etab, logoDataUrl });
      if (options.autoPrint) {
        doc.autoPrint();
        const win = getBrowserWindow();
        const url = doc.output('bloburl');
        if (win) win.open(url, '_blank'); else doc.save(options.filename || 'releves-haccp.pdf');
      } else {
        doc.save(options.filename || 'releves-haccp.pdf');
      }
      return doc;
    } catch (err) {
      console.error('[pdf exportHaccpRelevesPdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  _renderHaccpReleves(doc, payload, options = {}) {
    const PAGE_W = 210, PAGE_H = 297, M = BRAND.page.marginMm;
    const contentW = PAGE_W - 2 * M;
    const etabName = pdfSafeText((options.etablissement?.nom || 'Samper Consulting').toString());
    const logoDataUrl = options.logoDataUrl || null;
    const periodeLabel = pdfSafeText((payload.periodeLabel || '').toString());
    const stats = payload.stats || null;
    const days = (Array.isArray(payload.days) ? payload.days : []).map(d => ({
      dateLabel: pdfSafeText((d.dateLabel || '').toString()),
      rows: (d.rows || []).map(r => ({
        zone: pdfSafeText((r.zone || '').toString()),
        heure: pdfSafeText((r.heure || '').toString()),
        valeur: pdfSafeText((r.valeur || '').toString()),
        operateur: pdfSafeText((r.operateur || '').toString()),
        conforme: !!r.conforme,
        commentaire: pdfSafeText((r.commentaire || '').toString()),
      })),
    }));
    const dateStr = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' });

    // Colonnes : Zone | Heure | Valeur (droite) | Opérateur | Statut | Commentaire
    // Les libellés sont interlettrés : chaque colonne est dimensionnée sur la
    // largeur RÉELLE de son étiquette, sans quoi « OPÉRATEUR » et « CONFORME »
    // mordent sur la colonne voisine.
    const zoneX = M + 2.5,  zoneW = 37;
    const heureX = M + 42;
    const valRight = M + 70;
    const opX = M + 74,     opW = 26;
    const statutX = M + 102;
    const commX = M + 128,  commW = contentW - 130.5;
    const bodyBottom = PAGE_H - M;
    const LINE_H = 4.3;
    const COLONNES = [
      { label: 'Zone', x: zoneX },
      { label: 'Heure', x: heureX },
      { label: 'Valeur', x: valRight, align: 'right' },
      { label: 'Opérateur', x: opX },
      { label: 'Statut', x: statutX },
      { label: 'Commentaire', x: commX },
    ];

    const drawHeader = () => this._enTeteDocument(doc, {
      titre: 'Relevés de température',
      sousTitre: periodeLabel,
      meta: stats && stats.total != null
        ? `${stats.total} relevé${stats.total > 1 ? 's' : ''}  ·  ${stats.conformes} conforme${stats.conformes > 1 ? 's' : ''}  ·  ${stats.anomalies} anomalie${stats.anomalies > 1 ? 's' : ''}  ·  taux de conformité ${stats.taux}%`
        : dateStr,
      etablissement: etabName,
      logoDataUrl,
    });

    let y = drawHeader();
    const ensureSpace = (h, onNewPage) => {
      if (y + h > bodyBottom) {
        doc.addPage(); y = drawHeader();
        if (onNewPage) onNewPage();
      }
    };
    // En-tête de journée (répété avec « (suite) » quand un jour continue sur la page suivante)
    const dayHead = (label, suite = false) => {
      y = this._titreBloc(doc, label + (suite ? ' (suite)' : ''), M, y, contentW);
      y = this._bandeTableau(doc, COLONNES, M, y - 4, contentW);
    };

    if (!days.length) {
      setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.body); doc.setTextColor(...PDF.stone);
      doc.text('Aucun relevé pour cette période.', M, y + 4);
    }

    days.forEach((day) => {
      ensureSpace(24);
      dayHead(day.dateLabel);
      day.rows.forEach((r, index) => {
        setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.cell);
        const zoneLines = doc.splitTextToSize(r.zone || '-', zoneW);
        const opLines = doc.splitTextToSize(r.operateur || '-', opW);
        const commLines = doc.splitTextToSize(r.commentaire || '-', commW);
        const nLines = Math.max(zoneLines.length, opLines.length, commLines.length, 1);
        const rowH = Math.max(6, nLines * LINE_H + 1.7);
        ensureSpace(rowH, () => dayHead(day.dateLabel, true));
        this._fondZebre(doc, index, M, y - 3.4, contentW, rowH);
        // Une anomalie doit se voir sans lire : couleur d'alerte sur la valeur
        // et sur le statut, le reste de la ligne reste en encre courante.
        const statutColor = r.conforme ? PDF.ok : PDF.alert;
        setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.cell); doc.setTextColor(...PDF.ink);
        zoneLines.forEach((l, k) => doc.text(l, zoneX, y + k * LINE_H));
        doc.setTextColor(...PDF.stone);
        doc.text(r.heure || '-', heureX, y);
        setBrandFont(doc, 'voice'); doc.setFontSize(BRAND.size.amount); doc.setTextColor(...statutColor);
        doc.text(r.valeur || '-', valRight, y, { align: 'right' });
        setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.cell); doc.setTextColor(...PDF.stone);
        opLines.forEach((l, k) => doc.text(l, opX, y + k * LINE_H));
        setBrandFont(doc, 'label'); doc.setFontSize(BRAND.size.note); doc.setTextColor(...statutColor);
        doc.text(r.conforme ? 'CONFORME' : 'ANOMALIE', statutX, y, { charSpace: BRAND.charSpace.label });
        setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.cell);
        doc.setTextColor(...(r.commentaire ? (r.conforme ? PDF.ink : PDF.alert) : PDF.stone));
        commLines.forEach((l, k) => doc.text(l, commX, y + k * LINE_H));
        this._filetInterne(doc, M, y + rowH - 3.2, M + contentW);
        y += rowH;
      });
      y += 5;
    });

    // Visa du responsable : attendu sur un registre officiel présenté en contrôle
    if (days.length) {
      ensureSpace(18);
      y += 6;
      this._blocVisa(doc, y);
    }

    this._folio(doc);
  },

  // ═══════════════════════════════════════════════════════════════
  // EXÉCUTION DE SOP / CHECKLIST - génération jsPDF native
  // Rapport d'audit d'une checklist exécutée : qui, quand, quelles
  // étapes validées et - surtout - lesquelles ne l'ont pas été. Même
  // DA que les relevés HACCP (bleu petrole, filets fins, visa en pied)
  // puisque c'est le même usage : un document présenté en contrôle.
  // payload : {
  //   titre, categorie, dateLabel, heureDebut, heureFin, operateur,
  //   statutLabel, statutOk, total, cochees, notes,
  //   sections: [{ titre, etapes: [{ label, critique, cochee, heure, note }] }]
  // }
  // options : { etablissement, autoPrint, filename, logoDataUrl }
  // ═══════════════════════════════════════════════════════════════
  async exportSopExecutionPdf(payload, options = {}) {
    try {
      const jsPDF = await this._loadJsPdf();
      const etab = options.etablissement || this._getCurrentEtablissement();
      const logoDataUrl = options.logoDataUrl !== undefined
        ? options.logoDataUrl
        : await this._resolveLogoDataUrl(etab);
      const doc = this._nouveauDocA4(jsPDF);
      this._renderSopExecution(doc, payload || {}, { ...options, etablissement: etab, logoDataUrl });
      if (options.autoPrint) {
        doc.autoPrint();
        const win = getBrowserWindow();
        const url = doc.output('bloburl');
        if (win) win.open(url, '_blank'); else doc.save(options.filename || 'checklist.pdf');
      } else {
        doc.save(options.filename || 'checklist.pdf');
      }
      return doc;
    } catch (err) {
      console.error('[pdf exportSopExecutionPdf]', err);
      notifyLegacy('Export PDF échoué : ' + (err?.message || 'erreur inconnue'), 'error');
      throw err;
    }
  },

  _renderSopExecution(doc, payload, options = {}) {
    const PAGE_W = 210, PAGE_H = 297, M = BRAND.page.marginMm;
    const contentW = PAGE_W - 2 * M;
    const etabName = pdfSafeText((options.etablissement?.nom || 'Samper Consulting').toString());
    const logoDataUrl = options.logoDataUrl || null;

    const titre      = pdfSafeText((payload.titre || 'Checklist').toString());
    const categorie  = pdfSafeText((payload.categorie || '').toString());
    const dateLabel  = pdfSafeText((payload.dateLabel || '').toString());
    const heureDebut = pdfSafeText((payload.heureDebut || '-').toString());
    const heureFin   = pdfSafeText((payload.heureFin || '-').toString());
    const operateur  = pdfSafeText((payload.operateur || '-').toString());
    const statutLabel = pdfSafeText((payload.statutLabel || '').toString());
    const notes      = pdfSafeText((payload.notes || '').toString());
    const total   = Number(payload.total) || 0;
    const cochees = Number(payload.cochees) || 0;
    const taux    = total > 0 ? Math.round(cochees / total * 100) : 0;
    // statutOk : true = conforme, false = anomalie, null = neutre
    const statutColor = payload.statutOk === true ? PDF.ok : payload.statutOk === false ? PDF.alert : PDF.stone;
    const sections = (Array.isArray(payload.sections) ? payload.sections : []).map(s => ({
      titre: pdfSafeText((s.titre || '').toString()),
      etapes: (s.etapes || []).map(e => ({
        label: pdfSafeText((e.label || '').toString()),
        note: pdfSafeText((e.note || '').toString()),
        heure: pdfSafeText((e.heure || '').toString()),
        critique: !!e.critique,
        cochee: !!e.cochee,
      })),
    }));
    const dateStr = new Date().toLocaleDateString('fr-CH', { day: '2-digit', month: 'long', year: 'numeric' });

    // Colonnes : [case] Libellé de l'étape ......... CRITIQUE  heure de validation
    const boxSize = 3.8;
    const labelX = M + 6.5;
    const heureRight = PAGE_W - M;
    const critiqueRight = heureRight - 15;
    const labelW = contentW - 6.5 - 36;
    const bodyBottom = PAGE_H - M;
    const LINE_H = 4.3;

    // L'en-tête est répété sur chaque page : un rapport d'audit doit être
    // identifiable page par page, même si les feuilles sont séparées.
    const drawHeader = () => {
      let ty = this._enTeteDocument(doc, {
        titre,
        sousTitre: dateLabel + (categorie ? `   ·   ${categorie}` : ''),
        meta: `${heureDebut} -> ${heureFin}   ·   Opérateur : ${operateur}`,
        etablissement: etabName,
        logoDataUrl,
      });
      // Bandeau de statut : bloc mis en avant, barre laterale d'accent.
      const h = 8;
      doc.setFillColor(...PDF.tint);
      doc.rect(M, ty - 4, contentW, h, 'F');
      doc.setDrawColor(...PDF.accent);
      doc.setLineWidth(RULE.accentBar);
      doc.line(M + RULE.accentBar / 2, ty - 4, M + RULE.accentBar / 2, ty - 4 + h);
      setBrandFont(doc, 'label'); doc.setFontSize(BRAND.size.sectionLabel); doc.setTextColor(...statutColor);
      doc.text(statutLabel.toUpperCase(), M + 4, ty + 0.6, { charSpace: BRAND.charSpace.label });
      const statutW = this._largeurTexte(doc, statutLabel.toUpperCase(), BRAND.charSpace.label);
      setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.note); doc.setTextColor(...PDF.stone);
      doc.text(`   ·   ${cochees}/${total} étape${total > 1 ? 's' : ''} validée${cochees > 1 ? 's' : ''} (${taux}%)`, M + 4 + statutW, ty + 0.6);
      return ty + h + 3;
    };

    let y = drawHeader();
    const ensureSpace = (h, onNewPage) => {
      if (y + h > bodyBottom) {
        doc.addPage(); y = drawHeader();
        if (onNewPage) onNewPage();
      }
    };
    // Titre de section, répété avec « (suite) » quand elle déborde sur la page suivante
    const sectionHead = (sec, suite = false) => {
      const done = sec.etapes.filter(e => e.cochee).length;
      const yTitre = y;
      y = this._titreSection(doc, (sec.titre || 'Étapes') + (suite ? ' (suite)' : ''), M, y, contentW);
      setBrandFont(doc, 'voice'); doc.setFontSize(BRAND.size.note); doc.setTextColor(...PDF.stone);
      doc.text(`${done}/${sec.etapes.length}`, PAGE_W - M, yTitre, { align: 'right' });
    };

    if (!sections.length) {
      setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.body); doc.setTextColor(...PDF.stone);
      doc.text('Cette procédure ne contient aucune étape.', M, y + 4);
    }

    sections.forEach((sec) => {
      ensureSpace(18);
      sectionHead(sec);
      sec.etapes.forEach((et, index) => {
        setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.body);
        const lines = doc.splitTextToSize(et.label || '-', labelW);
        const noteLines = et.note ? doc.splitTextToSize(et.note, labelW) : [];
        const rowH = Math.max(6.5, (lines.length + noteLines.length) * LINE_H + 2);
        ensureSpace(rowH, () => sectionHead(sec, true));
        this._fondZebre(doc, index, M, y - 3.4, contentW, rowH);

        // Une étape critique non validée est le signal d'audit : la case, le
        // libellé et la mention passent en couleur d'alerte.
        const manqueCritique = et.critique && !et.cochee;
        this._caseACocher(doc, M + 1, y - 3, boxSize, et.cochee, et.critique ? PDF.alert : PDF.stone);

        setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.body);
        doc.setTextColor(...(manqueCritique ? PDF.alert : PDF.ink));
        lines.forEach((l, k) => doc.text(l, labelX, y + k * LINE_H));

        if (et.critique) {
          setBrandFont(doc, 'label'); doc.setFontSize(BRAND.size.note); doc.setTextColor(...PDF.alert);
          this._texteDroite(doc, 'CRITIQUE', critiqueRight, y, BRAND.charSpace.label);
        }
        if (et.cochee && et.heure) {
          setBrandFont(doc, 'voice'); doc.setFontSize(BRAND.size.note); doc.setTextColor(...PDF.stone);
          doc.text(et.heure, heureRight, y, { align: 'right' });
        }
        if (noteLines.length) {
          setBrandFont(doc, 'voiceItalic'); doc.setFontSize(BRAND.size.note); doc.setTextColor(...PDF.stone);
          noteLines.forEach((l, k) => doc.text(l, labelX, y + (lines.length + k) * LINE_H));
        }

        this._filetInterne(doc, M, y + rowH - 3.2, M + contentW);
        y += rowH;
      });
      y += 5;
    });

    // Notes de l'exécution (anomalies relevées par l'opérateur)
    if (notes) {
      setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.body);
      const noteLines = doc.splitTextToSize(notes, contentW);
      ensureSpace(12 + noteLines.length * LINE_H);
      y = this._titreSection(doc, 'Notes de l\'opérateur', M, y, contentW);
      setBrandFont(doc, 'data'); doc.setFontSize(BRAND.size.body); doc.setTextColor(...PDF.ink);
      noteLines.forEach((l) => { doc.text(l, M, y); y += LINE_H; });
      y += 2;
    }

    // Visa du responsable : attendu sur un document présenté en contrôle
    ensureSpace(18);
    y += 6;
    this._blocVisa(doc, y);

    this._folio(doc);
  },
};

// ─── Assainissement texte pour jsPDF ────────────────────────────────
// Les polices de marque sont sous-ensemblees sur le jeu latin : il couvre tout
// le francais (accents, ligature oe, euro) mais pas les symboles mathematiques,
// les fleches ni les pictogrammes, qui ressortiraient en case vide. On les
// remplace par un equivalent ASCII lisible et on translittere le reste plutot
// que de corrompre. Meme filet quand le repli sur la police standard s'applique,
// celle-ci n'encodant que le jeu cp1252.
//
// Les tirets cadratin et demi-cadratin sont ramenes au trait d'union : aucun
// rendu client ne doit en porter, et le trait d'union ne change ni le sens ni
// la lecture d'une plage de valeurs.
const PDF_CHAR_REPLACEMENTS = {
  '≈': '~', '≃': '~', '≅': '~', '∼': '~',
  '≤': '<=', '≥': '>=', '≠': '#', '≡': '=',
  '√': 'racine', '∞': 'infini', '∑': 'somme', '∆': 'delta', '∂': 'd',
  '→': '->', '←': '<-', '↔': '<->', '↑': 'haut', '↓': 'bas', '⇒': '=>',
  '⅓': '1/3', '⅔': '2/3', '⅕': '1/5', '⅖': '2/5', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
  '′': "'", '″': '"', '‴': "'''",
  '−': '-', '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '⁄': '/',
  '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x', '★': '*', '☆': '*', '●': '-', '◦': '-',
};

// Codepoints Unicode > 0xFF presents dans le sous-ensemble latin ET dans cp1252 :
// conserves tels quels quelle que soit la police effectivement utilisee.
const CP1252_EXTRA = new Set([
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022,
  0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
]);

function pdfSafeText(value) {
  if (value == null) return '';
  return String(value).replace(/[^\x00-\x7F]/g, (ch) => {
    if (Object.prototype.hasOwnProperty.call(PDF_CHAR_REPLACEMENTS, ch)) return PDF_CHAR_REPLACEMENTS[ch];
    const cp = ch.codePointAt(0);
    if (cp <= 0xFF || CP1252_EXTRA.has(cp)) return ch; // accents FR & extras cp1252 : OK
    const stripped = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    return /^[\x20-\x7E]*$/.test(stripped) ? stripped : '';
  });
}

// ─── Normalisation des entrées fiche recette ────────────────────────
// Acceptent un tableau d'objets OU un texte multi-lignes (robustesse).
function normalizeIngredients(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((it) =>
      typeof it === 'string'
        ? { nom: it }
        : { qte: it.qte ?? it.quantite ?? '', unite: it.unite ?? '', nom: it.nom ?? it.libelle ?? '' }
    );
  }
  return String(raw).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => ({ nom: l }));
}

function normalizeSteps(raw) {
  if (!raw) return [];
  // Retire une éventuelle numérotation existante (régénérée dans les pastilles).
  if (Array.isArray(raw)) return raw.map((s) => String(s).replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
  return String(raw).split(/\r?\n/).map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
}

export default pdfUtils;
