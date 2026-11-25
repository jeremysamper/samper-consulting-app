import { notify } from '../../../components/toast/index.js';
import { dbService } from '../../../services/dbService.js';
import { etatFacture } from './calculs.js';
import {
  CLES_MAILS, lienGmail, nomFichier, payloadDevis, payloadFacture, qrFacture, texteMail,
} from './documents.js';

// Gestes qui sortent de l'écran : PDF (jsPDF chargé à la demande) et brouillon
// Gmail préécrit. Gmail ne joint pas de fichier par lien : « Envoyer » ouvre
// le brouillon ET télécharge le PDF, à glisser dans le message.

export function lireModelesMail() {
  const db = dbService.getBridge()?.db;
  const lire = (cle) => {
    const v = db?.getUserSettingSync?.(cle, null);
    return v && typeof v === 'object' ? v : null;
  };
  return { devis: lire(CLES_MAILS.devis), facture: lire(CLES_MAILS.facture), relance: lire(CLES_MAILS.relance) };
}

const nomEtab = (ctx) => ctx.etablissement?.nom || '';

export async function pdfDevis(devis, ctx) {
  const { pdfUtils } = await import('../../../services/pdf.js');
  await pdfUtils.exportDocumentGroupePdf(
    payloadDevis(devis, { reglages: ctx.reglages, etablissementNom: nomEtab(ctx) }),
    { filename: nomFichier(devis, 'devis'), etablissement: ctx.etablissement },
  );
}

// La QR-facture n'accompagne qu'une facture émise, à payer par virement, avec
// un reste ; une identité de facturation incomplète sort le PDF sans bulletin
// et le dit.
export async function pdfFacture(facture, ctx) {
  const { pdfUtils } = await import('../../../services/pdf.js');
  const e = etatFacture(facture, ctx.paiements, ctx.aujourdhui);
  let qr = null;
  if (facture.statut === 'emise' && facture.modePrevu === 'virement' && e.reste > 0) {
    const r = qrFacture(facture, ctx.reglages, e.reste);
    qr = r.donnees;
    if (!qr) notify(`PDF sans bulletin de paiement : ${r.erreurs[0]}`, 'warning');
  }
  await pdfUtils.exportDocumentGroupePdf(
    payloadFacture(facture, { reglages: ctx.reglages, etablissementNom: nomEtab(ctx), paiements: ctx.paiements, aujourdhui: ctx.aujourdhui }),
    { filename: nomFichier(facture, 'facture'), etablissement: ctx.etablissement, qrFacture: qr },
  );
}

// Appelé dans le geste de l'utilisateur, AVANT tout await : un onglet ouvert
// après une attente serait bloqué comme fenêtre surgissante.
export function ouvrirBrouillon(type, doc, ctx) {
  const m = texteMail(type, doc, {
    reglages: ctx.reglages, etablissementNom: nomEtab(ctx), modeles: lireModelesMail(),
    aujourdhui: ctx.aujourdhui, paiements: ctx.paiements,
  });
  // Sans « noopener » dans les options : avec lui, window.open rend null même
  // quand l'onglet s'ouvre, et le blocage ne se verrait plus.
  const w = window.open(lienGmail(m), '_blank');
  if (w) w.opener = null;
  else notify("Le navigateur a bloqué l'ouverture de Gmail : autorisez les fenêtres pour cette page.", 'warning');
}
