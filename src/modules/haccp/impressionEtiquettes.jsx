import React from 'react';
import { getBrowserWindow, notifyLegacy } from '../../legacy/legacyApi.js';
import { pdfUtils } from '../../services/pdf.js';
import { agentDisponible, attendreImpression, envoyerLot } from '../../services/printQueue.js';
import { hs } from './HACCP.styles.js';

// ─────────────────────────────────────────────────────────────────────────────
// IMPRESSION D'UN LOT D'ÉTIQUETTES DLC
//
// Le circuit d'impression du poste d'étiquetage, sorti du composant pour servir
// aussi au raccourci « Étiquette » de Cartes & Recettes. Les deux écrans
// impriment donc exactement de la même façon : agent local si joignable, sinon
// feuille de partage, sinon PDF ouvert dans un onglet.
//
// L'appelant passe ses setters d'état : le circuit ne tient aucun état propre.
// ─────────────────────────────────────────────────────────────────────────────

// Feuille de partage du système : le PDF y arrive directement, « Imprimer » est
// sous le pouce, et l'écran d'aperçu disparaît du parcours. C'est le chemin le
// plus court qu'une page web puisse offrir sur iPad : aucun navigateur n'expose
// d'impression silencieuse, seul l'agent local sait faire mieux.
//
// Rien d'asynchrone ici : iOS n'autorise le partage que dans la tâche du geste
// utilisateur. Le PDF est donc construit sur place, jsPDF ayant été préchargé
// au montage de l'écran.
const partagerPdf = (blob, nomFichier) => {
  const win = getBrowserWindow();
  const nav = win?.navigator;
  if (!nav?.share || typeof win.File !== 'function') return null;
  try {
    const fichier = new win.File([blob], nomFichier, { type: 'application/pdf' });
    // canShare avec des fichiers : la seule façon de savoir AVANT d'appeler si
    // le système acceptera un PDF. Un share() refusé consommerait le geste.
    if (!nav.canShare?.({ files: [fichier] })) return null;
    return nav.share({ files: [fichier], title: nomFichier });
  } catch {
    return null;
  }
};

// Onglet vide ouvert dans la foulée du clic, garni du PDF une fois celui-ci
// prêt. Sans ce pré-ouvrage, iOS bloque l'ouverture : la génération comporte
// des await, et Safari n'autorise window.open que dans la tâche déclenchée par
// le geste de l'utilisateur.
const ouvrirOngletVide = () => {
  const win = getBrowserWindow();
  try { return win?.open('', '_blank') || null; } catch { return null; }
};

const fermerOnglet = (onglet) => {
  try { onglet?.close(); } catch { /* déjà fermé */ }
};

// À appeler DIRECTEMENT depuis le gestionnaire de clic, sans await avant :
// le chemin de partage et l'onglet pré-ouvert exigent la tâche du geste.
//   etiquettes : [{ lignes }] - une entrée = une page = une étiquette
//   modeLot    : trace côté file d'impression ('frais', 'frais+surgelation'…)
//   urls       : tableau où ranger les blob URL, libérées par l'appelant
export async function imprimerLot({
  etiquettes, nomFichier, modeLot, agent, etabId, userId, urls,
  setBusy, setProgress, setDernierLot, setAgent,
}) {
  const nb = etiquettes.length;
  const pluriel = nb > 1 ? 's' : '';
  const garder = (url) => { if (url) urls.push(url); };

  // ─── Chemin le plus court : la feuille de partage, sans écran d'aperçu ───
  // Tout est synchrone jusqu'à l'appel de partage, sans quoi iOS le refuse.
  // On ne re-vérifie pas l'agent ici : ce chemin n'est pris que s'il était
  // déjà absent, et une requête réseau ferait perdre le geste utilisateur.
  if (!agent && pdfUtils.jsPdfDisponible?.()) {
    const lot = pdfUtils.construireEtiquettesDlcSync(etiquettes, {});
    const promesse = lot && partagerPdf(lot.blob, nomFichier);
    if (promesse) {
      const url = lot.doc.output('bloburl');
      garder(url);
      setBusy(true);
      try {
        await promesse;
        setDernierLot({ url, nb, ouvert: true, viaPartage: true });
        notifyLegacy(`${nb} étiquette${pluriel} envoyée${pluriel} à l'impression.`, 'success');
      } catch (err) {
        // AbortError = feuille refermée par l'opérateur : rien à signaler,
        // mais on garde le PDF sous la main pour qu'il n'ait pas à relancer.
        if (err?.name !== 'AbortError') console.warn('[Etiquettes partage]', err);
        setDernierLot({ url, nb, ouvert: false, viaPartage: true });
      } finally {
        setBusy(false);
      }
      return;
    }
  }

  // Onglet ouvert AVANT le moindre await, et rempli avec le PDF une fois
  // celui-ci prêt : iOS refuse window.open dès qu'une promesse s'est
  // intercalée depuis le geste de l'opérateur. Inutile si l'impression part
  // par l'agent : on le referme alors, mais seulement une fois le lot déposé.
  const fenetrePdf = agent ? null : ouvrirOngletVide();

  setBusy(true);
  // Indicateur de progression au-delà de 50 étiquettes seulement : en dessous,
  // la génération est trop rapide pour qu'il serve à autre chose qu'à clignoter.
  const suivi = nb > 50 && setProgress;
  if (suivi) setProgress({ done: 0, total: nb });
  const onProgress = suivi ? (done, total) => setProgress({ done, total }) : undefined;

  try {
    // ─── Impression directe, si l'agent du restaurant est joignable ───
    // Vérification juste avant l'envoi et non seulement au montage : l'écran
    // peut rester ouvert des heures, l'agent peut être tombé entre-temps.
    const agentActuel = await agentDisponible(etabId);
    setAgent(agentActuel);

    if (agentActuel) {
      const res = await pdfUtils.exportEtiquettesDlcPdf(etiquettes, { destination: 'agent', onProgress });
      garder(res?.url);
      try {
        const jobId = await envoyerLot({
          etabId, pdfBase64: res.base64, nbEtiquettes: nb, mode: modeLot, userId,
        });
        // Le lot est déposé : plus rien à afficher, l'onglet de secours part.
        fermerOnglet(fenetrePdf);
        setDernierLot({ url: res.url, nb, viaAgent: true, etat: 'envoye' });
        notifyLegacy(`${nb} étiquette${pluriel} envoyée${pluriel} à l'imprimante.`, 'success');

        const fin = await attendreImpression(jobId);
        if (fin.statut === 'imprime') {
          setDernierLot(l => (l ? { ...l, etat: 'imprime' } : l));
        } else if (fin.statut === 'erreur') {
          setDernierLot(l => (l ? { ...l, etat: 'erreur', erreur: fin.erreur } : l));
          notifyLegacy('L\'imprimante a refusé le lot : ' + (fin.erreur || 'erreur inconnue'), 'error');
        } else {
          // L'agent n'a pas répondu à temps : le lot reste dans la file et
          // partira à son retour. Rien n'est perdu, mais on le dit.
          setDernierLot(l => (l ? { ...l, etat: 'attente' } : l));
          notifyLegacy('Lot en attente : l\'imprimante n\'a pas encore répondu.', 'warning');
        }
        return;
      } catch (err) {
        // Dépôt impossible : on ne laisse pas la brigade sans étiquettes,
        // on bascule sur l'ouverture du PDF.
        console.error('[Etiquettes envoyerLot]', err);
        notifyLegacy('Envoi direct impossible, ouverture du PDF.', 'warning');
        setAgent(null);
      }
    }

    // ─── PDF ouvert dans le visualiseur (aucun agent, ou envoi échoué) ───
    const res = await pdfUtils.exportEtiquettesDlcPdf(etiquettes, {
      autoPrint: true,
      filename: nomFichier,
      onProgress,
      fenetre: fenetrePdf,
    });
    if (res?.url) {
      garder(res.url);
      setDernierLot({ url: res.url, nb, ouvert: !!res.ouvert });
    }
    notifyLegacy(`${nb} étiquette${pluriel} générée${pluriel}.`, 'success');
  } catch {
    // Onglet vide laissé derrière soi = onglet à refermer à la main.
    fermerOnglet(fenetrePdf);
    /* notify déjà géré dans le service */
  } finally {
    setBusy(false);
    if (suivi) setProgress(null);
  }
}

const bandeauBase = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--success-bg-soft)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--success-bd)', borderRadius: 10, fontSize: 12, color: 'var(--text2)' };

// ── Dernier lot ──
// Le lien vers le PDF ne s'affiche que si l'ouverture automatique n'a pas eu
// lieu : filet de sécurité, pas étape de la marche normale.
export const DernierLot = ({ lot }) => {
  if (!lot) return null;
  return (
    <div style={{
      ...bandeauBase,
      ...(lot.etat === 'erreur'
        ? { background: 'var(--danger-bg-soft)', borderColor: 'var(--danger-bd)' }
        : lot.etat === 'attente'
          ? { background: 'var(--warning-bg)', borderColor: 'var(--warning-bd)' }
          : null),
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        {lot.nb} étiquette{lot.nb > 1 ? 's' : ''}
        {!lot.viaAgent && lot.viaPartage && (lot.ouvert
          ? <> parti{lot.nb > 1 ? 'es' : 'e'} à l'impression.</>
          : <> prête{lot.nb > 1 ? 's' : ''}, mais la feuille d'impression a été refermée :</>)}
        {!lot.viaAgent && !lot.viaPartage && (lot.ouvert
          ? <> prête{lot.nb > 1 ? 's' : ''} dans le PDF : Partager › Imprimer.</>
          : <> prête{lot.nb > 1 ? 's' : ''}, mais le PDF ne s'est pas ouvert tout seul :</>)}
        {lot.viaAgent && lot.etat === 'envoye' && ' envoyée(s) à l\'imprimante, impression en cours…'}
        {lot.viaAgent && lot.etat === 'imprime' && ' imprimée(s).'}
        {lot.viaAgent && lot.etat === 'attente' && ' en attente : l\'imprimante n\'a pas encore répondu. Le lot partira dès son retour.'}
        {lot.viaAgent && lot.etat === 'erreur' && ` refusée(s) par l'imprimante : ${lot.erreur || 'erreur inconnue'}.`}
      </span>
      {/* Chemin de secours uniquement : ouverture bloquée par le navigateur,
          ou lot refusé/en attente côté agent. Sinon, aucun lien affiché. */}
      {((!lot.viaAgent && !lot.ouvert) || lot.etat === 'erreur' || lot.etat === 'attente') && (
        <a
          href={lot.url}
          target="_blank"
          rel="noreferrer"
          style={{ ...hs.exportBtn, flexShrink: 0, textDecoration: 'none', display: 'inline-block' }}
        >Ouvrir le PDF</a>
      )}
    </div>
  );
};
