// ═══════════════════════════════════════════════════════════════
// HACCP : rendu jsPDF du dossier du contrôle (vectoriel, A4 portrait).
// ═══════════════════════════════════════════════════════════════
// Le dossier arrive assemblé par dossierControle.js. Ce fichier ne fait que
// l'écrire, avec les primitives de la DA de src/services/pdf.js (en-tête,
// titres de section, bandes de tableau, zébrure, folio, visa) : aucune
// couleur, aucune police ni aucun filet n'est défini ici. Le document reste en
// français quelle que soit la langue de l'écran : c'est un registre HACCP.
//
// Page 1 : page de garde, écrite en dernier pour porter le numéro de page de
// chaque rubrique. Chaque rubrique commence sur une nouvelle page ; un tableau
// coupé par une page répète sa bande d'en-tête. Pas de capitales, pas de gras.

import { pdfSafeText, pdfUtils } from '../../services/pdf.js';
import { BRAND, PDF } from '../../design/brandTokens.js';
import { setBrandFont } from '../../design/registerPdfFonts.js';

const PAGE_W = 210;
const PAGE_H = 297;
const LIGNE_H = 4.3;
// Ligne de tableau d'une seule ligne de texte (4,3 + 1,5 de respiration).
const HAUTEUR_LIGNE = 5.8;
const TITRE_DOCUMENT = 'Dossier d\'autocontrôle HACCP';

// pdfSafeText laisse passer « … », que jsPDF mesure mais n'écrit pas.
const texte = (v) => pdfSafeText(v == null ? '' : String(v)).replace(/\u2026/g, '...');

const jours = (n) => (n == null ? '-' : `${n} ${n > 1 ? 'jours' : 'jour'}`);

export function renderDossierControle(doc, d, options = {}) {
  const M = BRAND.page.marginMm;
  const contentW = PAGE_W - 2 * M;
  const basCorps = PAGE_H - M;
  const etab = texte(d.etablissement);
  const logoDataUrl = options.logoDataUrl || null;
  const pageDe = {};
  let y = 0;

  const enTete = () => pdfUtils._enTeteDocument(doc, {
    titre: TITRE_DOCUMENT,
    sousTitre: texte(d.periode.label),
    etablissement: etab,
    logoDataUrl,
  });
  const nouvellePage = () => { doc.addPage(); y = enTete(); };
  const place = (h, surNouvellePage) => {
    if (y + h <= basCorps) return;
    nouvellePage();
    if (surNouvellePage) surNouvellePage();
  };

  const tronquer = (t, w) => {
    if (doc.getTextWidth(t) <= w) return t;
    let s = t;
    while (s.length && doc.getTextWidth(s + '...') > w) s = s.slice(0, -1);
    return s.trimEnd() + '...';
  };

  const police = (role, taille, couleur) => {
    setBrandFont(doc, role);
    doc.setFontSize(taille);
    doc.setTextColor(...couleur);
  };

  // Paragraphe courant, coupé à la largeur du texte.
  const paragraphe = (t, { couleur = PDF.ink, taille = BRAND.size.body, x = M, w = contentW } = {}) => {
    police('data', taille, couleur);
    const lignes = doc.splitTextToSize(texte(t), w);
    lignes.forEach((l) => {
      place(LIGNE_H + 1);
      doc.text(l, x, y);
      y += LIGNE_H + 0.6;
    });
    y += 2;
  };

  const section = (id, titre) => {
    nouvellePage();
    pageDe[id] = doc.internal.getNumberOfPages();
    y = pdfUtils._titreSection(doc, texte(titre), M, y, contentW);
  };

  // n : lignes du tableau qui suit. Un jour n'est coupé que s'il reste au
  // moins 4 lignes avant la coupure et 3 après : jamais de « (suite) » d'une
  // seule ligne, et pas de demi-page blanche pour autant.
  const bloc = (titre, n = 0) => {
    if (n) {
      // 13 mm : titre du jour (7) et bande d'en-tête (6) avant la première ligne.
      const tiennent = Math.floor((basCorps - y - 13) / HAUTEUR_LIGNE);
      if (tiennent < n && (tiennent < 4 || n - tiennent < 3)) nouvellePage();
    }
    place(26);
    y = pdfUtils._titreBloc(doc, texte(titre), M, y, contentW);
  };

  // Tableau : colonnes [{ label, x, w, align?, role?, taille?, couleur?(l),
  // valeur(l), tronquer? }]. Les lignes ne se coupent jamais entre deux pages.
  const tableau = (colonnes, lignes, { suite = null } = {}) => {
    const bande = () => {
      y = pdfUtils._bandeTableau(doc, colonnes.map(c => ({
        label: c.label, x: c.align === 'right' ? c.x + c.w : c.x, align: c.align,
      })), M, y - 4, contentW);
    };
    const reprise = () => {
      if (suite) y = pdfUtils._titreBloc(doc, texte(`${suite} (suite)`), M, y, contentW);
      bande();
    };
    place(18);
    bande();
    lignes.forEach((l, i) => {
      const cellules = colonnes.map((c) => {
        police(c.role || 'data', c.taille || BRAND.size.cell, PDF.ink);
        const t = texte(c.valeur(l)) || '-';
        return c.tronquer ? [tronquer(t, c.w)] : doc.splitTextToSize(t, c.w);
      });
      const n = Math.max(1, ...cellules.map(cel => cel.length));
      const h = Math.max(HAUTEUR_LIGNE, n * LIGNE_H + 1.5);
      place(h, reprise);
      pdfUtils._fondZebre(doc, i, M, y - 3.4, contentW, h);
      colonnes.forEach((c, k) => {
        police(c.role || 'data', c.taille || BRAND.size.cell, c.couleur ? c.couleur(l) : PDF.ink);
        cellules[k].forEach((t, j) => {
          if (c.align === 'right') pdfUtils._texteDroite(doc, t, c.x + c.w, y + j * LIGNE_H);
          else doc.text(t, c.x, y + j * LIGNE_H);
        });
      });
      pdfUtils._filetInterne(doc, M, y + h - 3.2, M + contentW);
      y += h;
    });
    y += 5;
  };

  const couleurResultat = (l) => (l.conforme ? PDF.ok : PDF.alert);
  const x = (dx) => M + dx;
  const reste = (dx) => contentW - dx - 2;

  // Le corps commence en page 2 ; la page 1 reste vide jusqu'à la fin.
  // ─── Relevés de températures ───
  if (d.releves) {
    const r = d.releves;
    section('releves', 'Relevés de températures');
    paragraphe(`${r.total} relevé${r.total > 1 ? 's' : ''} sur la période : ${r.conformes} conforme${r.conformes > 1 ? 's' : ''}, ${r.horsPlage} hors plage. Taux de conformité : ${r.taux} %.`);
    bloc('Synthèse par appareil');
    tableau([
      { label: 'Appareil', x: x(2.5), w: 50, valeur: l => l.nom },
      { label: 'Plage attendue', x: x(55), w: 40, valeur: l => l.plage },
      { label: 'Relevés', x: x(97), w: 15, align: 'right', valeur: l => String(l.total) },
      { label: 'Hors plage', x: x(114), w: 18, align: 'right', valeur: l => String(l.horsPlage), couleur: l => (l.horsPlage ? PDF.alert : PDF.ink) },
      { label: 'Minimum', x: x(134), w: 17, align: 'right', valeur: l => l.min },
      { label: 'Maximum', x: x(153), w: 18.5, align: 'right', valeur: l => l.max },
    ], r.parZone);
    r.jours.forEach((j) => {
      bloc(j.label, j.lignes.length);
      tableau([
        { label: 'Appareil', x: x(2.5), w: 40, valeur: l => l.zone },
        { label: 'Heure', x: x(44), w: 11, valeur: l => l.heure },
        { label: 'Valeur', x: x(56), w: 16, align: 'right', role: 'voice', taille: BRAND.size.amount, valeur: l => l.valeur, couleur: couleurResultat },
        { label: 'Par', x: x(76), w: 26, tronquer: true, valeur: l => l.par },
        { label: 'Résultat', x: x(104), w: 24, role: 'label', taille: BRAND.size.note, valeur: l => l.resultat, couleur: couleurResultat },
        { label: 'Commentaire', x: x(130), w: reste(130), valeur: l => l.commentaire },
      ], j.lignes, { suite: j.label });
    });

    // ─── Actions correctives ───
    section('actions', 'Actions correctives');
    if (!r.actions.length) {
      paragraphe('Aucun relevé hors plage sur la période : aucune action corrective n\'était à faire.');
    } else {
      paragraphe('Chaque relevé hors plage, avec ce que l\'équipe a noté avoir fait. « Aucune action notée » : rien n\'a été écrit dans l\'app au moment du relevé.');
      tableau([
        { label: 'Date', x: x(2.5), w: 17, valeur: l => l.date },
        { label: 'Heure', x: x(21), w: 10, valeur: l => l.heure },
        { label: 'Appareil', x: x(32), w: 34, valeur: l => l.zone },
        { label: 'Valeur', x: x(67), w: 17, align: 'right', role: 'voice', taille: BRAND.size.amount, valeur: l => l.valeur, couleur: () => PDF.alert },
        { label: 'Résultat', x: x(88), w: 24, role: 'label', taille: BRAND.size.note, valeur: l => l.resultat, couleur: () => PDF.alert },
        { label: 'Ce qui a été fait', x: x(114), w: reste(114), valeur: l => l.fait || 'Aucune action notée', couleur: l => (l.fait ? PDF.ink : PDF.alert) },
      ], r.actions);
    }
  }

  // ─── Contrôles du jour ───
  if (d.controles) {
    const c = d.controles;
    section('controles', 'Contrôles du jour');
    paragraphe(`${c.total} contrôle${c.total > 1 ? 's' : ''} enregistré${c.total > 1 ? 's' : ''} sur la période : ${c.conformes} conforme${c.conformes > 1 ? 's' : ''}, ${c.problemes} avec un problème signalé.`);
    if (c.couvertureDepuis) {
      const [a, m, j] = c.couvertureDepuis.split('-');
      paragraphe(`L'app n'a pu lire que les contrôles à partir du ${j}.${m}.${a}. Ceux d'avant cette date ne figurent pas dans ce dossier.`, { couleur: PDF.alert });
    }
    bloc('Synthèse par contrôle');
    tableau([
      { label: 'Contrôle', x: x(2.5), w: 80, valeur: l => l.nom },
      { label: 'Fréquence prévue', x: x(86), w: 46, tronquer: true, valeur: l => l.frequence },
      { label: 'Faits', x: x(134), w: 16, align: 'right', valeur: l => String(l.faits) },
      { label: 'Problèmes', x: x(152), w: 19.5, align: 'right', valeur: l => String(l.problemes), couleur: l => (l.problemes ? PDF.alert : PDF.ink) },
    ], c.parModele);
    bloc('Détail des contrôles');
    tableau([
      { label: 'Date', x: x(2.5), w: 17, valeur: l => l.date },
      { label: 'Heure', x: x(21), w: 10, valeur: l => l.heure },
      { label: 'Contrôle', x: x(32), w: 56, valeur: l => l.nom },
      { label: 'Par', x: x(90), w: 24, tronquer: true, valeur: l => l.par },
      { label: 'Résultat', x: x(116), w: 22, role: 'label', taille: BRAND.size.note, valeur: l => l.resultat, couleur: couleurResultat },
      { label: 'Notes', x: x(140), w: reste(140), valeur: l => l.notes },
    ], c.jours.flatMap(j => j.lignes), { suite: 'Détail des contrôles' });

    // ─── Problèmes signalés ───
    section('problemes', 'Problèmes signalés');
    if (!c.signales.length) {
      paragraphe('Aucun problème signalé lors des contrôles de la période.');
    } else {
      paragraphe('Les contrôles où l\'équipe a signalé un problème, avec sa note.');
      tableau([
        { label: 'Date', x: x(2.5), w: 17, valeur: l => l.date },
        { label: 'Heure', x: x(21), w: 10, valeur: l => l.heure },
        { label: 'Contrôle', x: x(32), w: 56, valeur: l => l.nom },
        { label: 'Par', x: x(90), w: 24, tronquer: true, valeur: l => l.par },
        { label: 'Note', x: x(116), w: reste(116), valeur: l => l.notes || 'Aucune note', couleur: l => (l.notes ? PDF.ink : PDF.stone) },
      ], c.signales);
    }
  }

  // ─── Traçabilité ───
  if (d.tracabilite.length) {
    section('tracabilite', 'Traçabilité des produits reçus');
    paragraphe('Les photos des étiquettes des produits reçus ou ouverts, prises dans l\'app. Les photos elles-mêmes se montrent dans l\'app, module HACCP.');
    tableau([
      { label: 'Date', x: x(2.5), w: 17, valeur: l => l.date },
      { label: 'Produit', x: x(21), w: 60, valeur: l => l.produit },
      { label: 'Par', x: x(83), w: 32, tronquer: true, valeur: l => l.par },
      { label: 'Notes', x: x(117), w: reste(117), valeur: l => l.notes },
    ], d.tracabilite);
  }

  // ─── Étiquettes DLC ───
  if (d.dlc.lignes.length) {
    const dd = d.dlc.dureeDefaut || {};
    section('dlc', 'Étiquettes DLC : durées de vie');
    paragraphe('Les durées de vie saisies dans l\'app. L\'app s\'en sert pour calculer la date limite imprimée sur chaque étiquette. Elle ne garde pas la liste des étiquettes imprimées. Un tiret : la préparation n\'est pas surgelée.');
    if (d.dlc.parDefaut > 0) {
      const n = d.dlc.parDefaut;
      paragraphe(`${n} autre${n > 1 ? 's' : ''} fiche${n > 1 ? 's' : ''} n'${n > 1 ? 'ont' : 'a'} pas de durée saisie : l'app y applique ${jours(dd.frais)} au frais et ${jours(dd.decongele)} après décongélation.`);
    }
    tableau([
      { label: 'Préparation', x: x(2.5), w: 62, valeur: l => l.nom },
      { label: 'Source', x: x(66), w: 30, valeur: l => l.source },
      { label: 'Au frais', x: x(98), w: 20, align: 'right', valeur: l => jours(l.frais) },
      { label: 'Surgelé', x: x(120), w: 20, align: 'right', valeur: l => jours(l.congele) },
      { label: 'Après décongélation', x: x(142), w: 29.5, align: 'right', valeur: l => jours(l.decongele) },
    ], d.dlc.lignes);
  }

  // ─── À fournir par l'établissement ───
  section('a_fournir', 'À fournir par l\'établissement');
  paragraphe('L\'app ne contient pas les documents suivants. Joignez-les à ce dossier ou montrez-les à l\'inspecteur.');
  y += 2;
  d.aFournir.forEach((item) => {
    police('data', BRAND.size.body, PDF.ink);
    const detail = doc.splitTextToSize(texte(item.detail), contentW - 10);
    const h = 5 + detail.length * (LIGNE_H + 0.4) + 4;
    place(h);
    pdfUtils._caseACocher(doc, M, y - 3, 3.6, false);
    police('label', BRAND.size.blockTitle, PDF.primary);
    doc.text(texte(item.titre), M + 7, y);
    police('data', BRAND.size.body, PDF.ink);
    detail.forEach((l, k) => doc.text(l, M + 7, y + 5 + k * (LIGNE_H + 0.4)));
    y += h;
  });

  // ─── Page de garde (page 1), écrite en dernier ───
  doc.setPage(1);
  y = pdfUtils._enTeteDocument(doc, {
    titre: TITRE_DOCUMENT,
    sousTitre: 'Remis au contrôle des denrées alimentaires',
    etablissement: etab,
    logoDataUrl,
  });
  y += 14;
  police('voice', BRAND.size.title * 1.6, PDF.primary);
  doc.splitTextToSize(etab || 'Établissement', contentW).forEach((l) => {
    pdfUtils._texteCentre(doc, l, PAGE_W / 2, y);
    y += 10;
  });
  y += 8;
  const infos = [
    ['Période', `${texte(d.periode.label)} (${d.periode.jours} jours)`],
    ['Édité le', d.heureEdition ? `${d.editeLe} à ${d.heureEdition}` : d.editeLe],
  ];
  infos.forEach(([label, valeur]) => {
    police('label', BRAND.size.sectionLabel, PDF.stone);
    doc.text(label, M, y);
    police('data', BRAND.size.blockTitle, PDF.ink);
    doc.text(texte(valeur), M + 30, y);
    y += 7;
  });
  y += 6;
  y = pdfUtils._titreSection(doc, 'Contenu du dossier', M, y, contentW);
  d.sections.forEach((s) => {
    police('data', BRAND.size.body, PDF.ink);
    doc.text(texte(s.titre), M + 3.2, y);
    police('data', BRAND.size.note, PDF.stone);
    doc.text(texte(s.resume), M + 82, y);
    if (pageDe[s.id]) {
      police('label', BRAND.size.note, PDF.primary);
      pdfUtils._texteDroite(doc, `page ${pageDe[s.id]}`, M + contentW, y);
    }
    pdfUtils._filetInterne(doc, M, y + 2.6, M + contentW);
    y += 7.5;
  });
  y += 6;
  police('data', BRAND.size.note, PDF.stone);
  doc.splitTextToSize(texte('Ce dossier reprend les enregistrements faits dans l\'app pour cet établissement sur la période. Il ne contient que ce qui y a été saisi. La dernière rubrique liste ce que l\'établissement doit fournir à côté.'), contentW).forEach((l) => {
    doc.text(l, M, y);
    y += LIGNE_H;
  });
  pdfUtils._blocVisa(doc, PAGE_H - M - 16);

  pdfUtils._folio(doc);
  return doc;
}

// Point d'entrée de l'écran : jsPDF chargé à la demande, logo de
// l'établissement si on le trouve, puis téléchargement.
export async function exporterDossierControlePdf(dossier, { etablissement, filename } = {}) {
  const jsPDF = await pdfUtils._loadJsPdf();
  const logoDataUrl = await pdfUtils._resolveLogoDataUrl(etablissement);
  const doc = pdfUtils._nouveauDocA4(jsPDF);
  renderDossierControle(doc, dossier, { logoDataUrl });
  doc.save(filename || 'dossier-controle.pdf');
  return doc;
}
