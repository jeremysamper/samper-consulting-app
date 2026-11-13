import React from 'react';
import {
  DEBIT_AUDIO, DUREE_MAX_S, TEXTE_VOCAL, cheminVocal, dureeBornee, nouvelUuid, peutEnregistrer,
  typeDepose, typeEnregistrement,
} from './vocal.js';

// Enregistreur d'un message vocal, partagé par la page Messages et le panneau
// de la barre du haut (chacun le sien). États :
//   repos      rien en cours
//   demande    le micro est demandé (l'appareil peut afficher son invite)
//   enregistre l'enregistrement court, deux minutes au plus
//   reecoute   l'enregistrement est arrêté, gardé dans l'appareil
//   envoi      dépôt du fichier puis insertion du message
//   refus      le micro est refusé (réglage du navigateur ou de l'appareil)
//   erreur     l'appareil n'a pas pu enregistrer
// Rien ne quitte l'appareil avant « Envoyer » : abandonner ne laisse ni
// fichier ni ligne (K8). Le micro est rendu dès l'arrêt. `pour` garde l'id du
// destinataire : le parent abandonne quand le fil affiché n'est plus le sien.
export function useEnregistreur() {
  const disponible = React.useMemo(() => peutEnregistrer(), []);
  const [etat, setEtat] = React.useState('repos');
  const [ecoule, setEcoule] = React.useState(0);
  const [enreg, setEnreg] = React.useState(null);
  const [pour, setPour] = React.useState(null);
  const r = React.useRef({ flux: null, rec: null, morceaux: [], debut: 0, minuteur: null, jeton: 0, enreg: null });

  const libererMicro = React.useCallback(() => {
    const x = r.current;
    if (x.minuteur) { clearInterval(x.minuteur); x.minuteur = null; }
    if (x.flux) { x.flux.getTracks().forEach((t) => { try { t.stop(); } catch { /* déjà arrêtée */ } }); x.flux = null; }
  }, []);

  const poserEnreg = React.useCallback((valeur) => {
    const x = r.current;
    if (x.enreg?.url && x.enreg !== valeur) URL.revokeObjectURL(x.enreg.url);
    x.enreg = valeur;
    setEnreg(valeur);
  }, []);

  const abandonner = React.useCallback(() => {
    const x = r.current;
    x.jeton += 1;
    if (x.rec) {
      x.rec.ondataavailable = null;
      x.rec.onstop = null;
      x.rec.onerror = null;
      if (x.rec.state !== 'inactive') { try { x.rec.stop(); } catch { /* déjà arrêté */ } }
      x.rec = null;
    }
    x.morceaux = [];
    libererMicro();
    poserEnreg(null);
    setEcoule(0);
    setPour(null);
    setEtat('repos');
  }, [libererMicro, poserEnreg]);

  // Appelé dans le geste même (toucher de Vocal ou du micro) : l'invite du
  // micro et le démarrage restent liés à l'action de la personne.
  const demarrer = React.useCallback(async (destinataire) => {
    const x = r.current;
    if (!disponible || x.rec) return;
    const jeton = ++x.jeton;
    poserEnreg(null);
    setEcoule(0);
    setPour(destinataire ?? null);
    setEtat('demande');
    let flux;
    try {
      flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      if (jeton !== x.jeton) return;
      setEtat(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'refus' : 'erreur');
      return;
    }
    if (jeton !== x.jeton) { flux.getTracks().forEach((t) => t.stop()); return; }
    const Enregistreur = window.MediaRecorder;
    const type = typeEnregistrement((t) => Enregistreur.isTypeSupported(t));
    let rec;
    try {
      rec = new Enregistreur(flux, { ...(type ? { mimeType: type } : null), audioBitsPerSecond: DEBIT_AUDIO });
    } catch {
      flux.getTracks().forEach((t) => t.stop());
      setEtat('erreur');
      return;
    }
    x.flux = flux;
    x.rec = rec;
    x.morceaux = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) x.morceaux.push(e.data); };
    // Erreur en plein enregistrement : le micro est rendu et l'enregistrement
    // jeté, mais `pour` reste, pour que la zone d'erreur parte avec son fil.
    rec.onerror = () => {
      if (jeton !== x.jeton) return;
      rec.ondataavailable = null;
      rec.onstop = null;
      rec.onerror = null;
      if (rec.state !== 'inactive') { try { rec.stop(); } catch { /* déjà arrêté */ } }
      x.rec = null;
      x.morceaux = [];
      libererMicro();
      setEtat('erreur');
    };
    rec.onstop = () => {
      if (jeton !== x.jeton) return;
      const duree = (performance.now() - x.debut) / 1000;
      const blob = new Blob(x.morceaux, { type: rec.mimeType || type || 'audio/webm' });
      x.rec = null;
      x.morceaux = [];
      libererMicro();
      if (!blob.size || !typeDepose(blob.type)) { setEtat('erreur'); return; }
      poserEnreg({ blob, url: URL.createObjectURL(blob), duree: Math.min(duree, DUREE_MAX_S) });
      setEtat('reecoute');
    };
    x.debut = performance.now();
    rec.start(1000);
    setEtat('enregistre');
    x.minuteur = setInterval(() => {
      const s = (performance.now() - x.debut) / 1000;
      setEcoule(Math.min(s, DUREE_MAX_S));
      if (s >= DUREE_MAX_S && x.rec && x.rec.state === 'recording') {
        clearInterval(x.minuteur);
        x.minuteur = null;
        x.rec.stop();
      }
    }, 250);
  }, [disponible, abandonner, libererMicro, poserEnreg]);

  const arreter = React.useCallback(() => {
    const x = r.current;
    if (!x.rec || x.rec.state !== 'recording') return;
    if (x.minuteur) { clearInterval(x.minuteur); x.minuteur = null; }
    setEcoule(Math.min((performance.now() - x.debut) / 1000, DUREE_MAX_S));
    x.rec.stop();
  }, []);

  // envoyer(fn) : fn reçoit l'enregistrement et fait le dépôt ; en cas
  // d'échec, la réécoute revient pour un nouvel essai, et l'erreur remonte.
  const envoyer = React.useCallback(async (fn) => {
    const x = r.current;
    const e = x.enreg;
    if (!e) return false;
    const jeton = x.jeton;
    setEtat('envoi');
    try {
      await fn(e);
    } catch (err) {
      if (jeton === x.jeton) setEtat('reecoute');
      throw err;
    }
    if (jeton === x.jeton) {
      poserEnreg(null);
      setPour(null);
      setEcoule(0);
      setEtat('repos');
    }
    return true;
  }, [poserEnreg]);

  // Démontage : le micro est rendu, la réécoute révoquée.
  React.useEffect(() => () => abandonner(), [abandonner]);

  return { disponible, etat, ecoule, enreg, pour, demarrer, arreter, abandonner, envoyer };
}

// Dépôt d'un vocal : fichier au chemin <expéditeur>/<uuid>.<ext>, type sans
// paramètre, durée bornée, puis le message qui le cite (legacySupabase retire
// le fichier si l'insertion échoue).
export function deposerVocal(bridge, { destinataire, expediteur, blob, duree }) {
  const contentType = typeDepose(blob.type);
  return bridge.db.sendPrivateVoiceMessage({
    recipientId: destinataire,
    senderId: expediteur,
    path: cheminVocal(expediteur, nouvelUuid(), contentType),
    blob,
    contentType,
    dureeS: dureeBornee(duree),
    message: TEXTE_VOCAL,
  });
}
