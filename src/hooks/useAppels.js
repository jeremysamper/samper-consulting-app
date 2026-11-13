import React from 'react';
import { dbService } from '../services/dbService.js';
import { appelSuivi, attacher, recevoir } from '../modules/messages/moteurAppel.js';
import { peutAppeler } from '../modules/messages/appels.js';

// Appels audio dans l'app (lot C4) : le canal de la coque.
//
// Un seul canal pour toute l'app, sur la table appels (audit C5, section 13),
// ouvert par le premier lecteur et fermé par le dernier, sur le modèle de
// useUnreadPrivateMessages. Ni la page Messages ni un composant d'écran n'en
// ouvre un : la vue Appels relit son journal par surChangementAppels.
//
// Chaque événement relit les appels vivants de la personne (sonne, en cours)
// et l'appel que cet appareil suit, puis les passe au moteur. Au réveil de
// l'appareil, subscribeReload rejoue la même lecture : le moteur compare
// chaque sonnerie à son échéance (expire_a) et n'en fait jamais sonner une
// échue.
const COLONNES = 'id,appelant_id,appele_id,etat,cree_a,expire_a,repondu_a,fini_a,duree_s,duree_approx,via_relais,offre,reponse';

const partage = { userId: null, lecteurs: 0, off: null, enCours: false, encore: false };
const abonnes = new Set();

async function relire() {
  const { userId } = partage;
  const c = dbService.getClient();
  if (!userId || !c) return;
  // Une lecture à la fois ; un événement arrivé pendant la lecture en
  // demande une autre, aussitôt après.
  if (partage.enCours) { partage.encore = true; return; }
  partage.enCours = true;
  try {
    const suivi = appelSuivi();
    let q = c.from('appels').select(COLONNES);
    q = suivi ? q.or(`etat.in.(sonne,en_cours),id.eq.${suivi}`) : q.in('etat', ['sonne', 'en_cours']);
    const { data, error } = await q.order('cree_a', { ascending: false }).limit(6);
    if (!error && partage.userId === userId) recevoir(data || []);
  } catch { /* la prochaine notification relira */ }
  finally {
    partage.enCours = false;
    if (partage.encore) { partage.encore = false; relire(); }
  }
}

function surChangement() {
  relire();
  abonnes.forEach((fn) => {
    try { fn(); } catch { /* un abonné ne bloque pas les autres */ }
  });
}

function fermerCanal() {
  if (partage.off) { partage.off(); partage.off = null; }
}

function rejoindre(userId) {
  if (partage.userId !== userId) {
    fermerCanal();
    partage.userId = userId;
    attacher(userId);
  }
  partage.lecteurs += 1;
  if (!partage.off) {
    const rt = dbService.getRealtime();
    partage.off = rt?.subscribeReload ? rt.subscribeReload('appels', surChangement, { debounceMs: 150 }) : null;
  }
  relire();
  return () => {
    partage.lecteurs -= 1;
    if (partage.lecteurs <= 0) {
      partage.lecteurs = 0;
      fermerCanal();
      partage.userId = null;
      attacher(null);
    }
  };
}

// Changements de la table appels vus par le canal de la coque (journal de la
// vue Appels) ; rend la fonction de désabonnement.
export function surChangementAppels(fn) {
  abonnes.add(fn);
  return () => { abonnes.delete(fn); };
}

// À monter une fois par la coque. Sans WebRTC ni micro, l'appareil ne peut ni
// appeler ni répondre : aucun canal, aucune sonnerie.
export function useAppels(userId) {
  React.useEffect(() => {
    if (!userId || !peutAppeler() || !dbService.getClient()) return undefined;
    return rejoindre(userId);
  }, [userId]);
}
