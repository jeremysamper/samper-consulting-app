// Gestes autour d'un bon : l'imprimer (PDF dans un onglet), le partager (feuille
// de partage de l'appareil : Messages, WhatsApp, e-mail, AirDrop), l'envoyer
// par SMS avec son code.
import { notify } from '../../../components/toast/index.js';
import { construireBonCadeau, nomFichierBon } from './documentBon.js';
import { lienSms, texteSms } from './codeBon.js';

// La fenêtre s'ouvre avant le calcul : un bloqueur de fenêtres la refuserait
// après un await.
export async function imprimerBon(bon, maison) {
  let fenetre = null;
  try { fenetre = window.open('', '_blank'); } catch { fenetre = null; }
  try {
    const doc = await construireBonCadeau({ bon, maison });
    if (fenetre) fenetre.location.href = doc.output('bloburl');
    else doc.save(nomFichierBon(bon));
  } catch (e) {
    console.error('[bons cadeaux] pdf', e);
    fenetre?.close();
    notify("Le bon n'a pas pu être produit. Réessayez.", 'error');
  }
}

export function peutPartagerFichier() {
  try {
    const essai = new File([new Blob(['x'], { type: 'application/pdf' })], 'essai.pdf', { type: 'application/pdf' });
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
      && typeof navigator.canShare === 'function' && navigator.canShare({ files: [essai] });
  } catch {
    return false;
  }
}

export async function partagerBon(bon, maison) {
  try {
    const doc = await construireBonCadeau({ bon, maison });
    const fichier = new File([doc.output('blob')], nomFichierBon(bon), { type: 'application/pdf' });
    if (peutPartagerFichier()) {
      await navigator.share({ files: [fichier], title: `Bon cadeau ${bon.code}`, text: texteSms({ bon, maison: maison?.nom }) });
      return;
    }
    doc.save(nomFichierBon(bon));
  } catch (e) {
    if (e?.name === 'AbortError') return; // partage refermé par la personne
    console.error('[bons cadeaux] partage', e);
    notify("Le bon n'a pas pu être partagé. Imprimez-le ou envoyez son code par SMS.", 'error');
  }
}

export function envoyerSms(bon, maison) {
  window.location.href = lienSms(bon.telephone, texteSms({ bon, maison: maison?.nom }));
}
