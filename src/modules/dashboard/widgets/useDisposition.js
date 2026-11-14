import { useCallback, useEffect, useRef, useState } from 'react';
import { dbService } from '../../../services/dbService.js';
import { readJson, writeJson } from '../../../utils/storage.js';
import { notify } from '../../../components/toast/index.js';
import { messageErreur } from '../../../utils/messageErreur.js';
import { CLE, CLE_LOCALE, normaliser } from './dispositionLogique.js';

// ─────────────────────────────────────────────────────────────────────────────
// Disposition du tableau de bord de la personne connectée.
//
//   Lecture  copie locale d'abord (sc_tdb_disposition : affichage immédiat et
//            hors-ligne), puis la valeur du cache des réglages du pont
//            (user_settings, clé tdb_disposition) dès qu'il est prêt : elle
//            l'emporte, la disposition suit la personne d'un appareil à
//            l'autre. Le cache est chargé à la connexion en parallèle de
//            l'hydratation (App.jsx) : il peut ne pas l'être au montage, d'où
//            une sonde sans réseau, toutes les 400 ms pendant 15 s au plus.
//   Écriture copie locale, puis setUserSetting. En échec : notify d'erreur,
//            la disposition reste à l'écran et sur le poste, marquée « en
//            attente » ; elle repart au prochain montage.
// La copie locale porte l'identifiant de la personne : sur un appareil
// partagé (l'iPad de la cuisine), chacun retrouve la sienne. Rien ici ne
// touche au pointage : une lecture ou une écriture en échec ne bloque rien.
// ─────────────────────────────────────────────────────────────────────────────

const SONDE_MS = 400;
const SONDE_ESSAIS = 38;

function lireLocal(userId) {
  const brut = readJson(CLE_LOCALE, null);
  if (!brut || typeof brut !== 'object' || brut.userId !== userId) return { disposition: null, enAttente: false };
  return { disposition: normaliser(brut.disposition), enAttente: brut.enAttente === true };
}

const ecrireLocal = (userId, disposition, enAttente) => writeJson(CLE_LOCALE, { userId, disposition, enAttente });

export function useDisposition(userId) {
  const [etat, setEtat] = useState(() => lireLocal(userId));
  const etatRef = useRef(etat);
  etatRef.current = etat;

  const envoyer = useCallback(async (disposition, { silencieux = false } = {}) => {
    const db = dbService.getDb();
    try {
      if (!db?.setUserSetting) throw new Error('Connexion à la base indisponible.');
      await db.setUserSetting(CLE, disposition);
      ecrireLocal(userId, disposition, false);
      setEtat((prec) => (prec.disposition === disposition ? { disposition, enAttente: false } : prec));
      return true;
    } catch (err) {
      if (!silencieux) {
        notify(`Le tableau de bord n'a pas pu être enregistré : il reste sur cet appareil. ${messageErreur(err, 'tableau de bord')}`, 'error');
      }
      return false;
    }
  }, [userId]);

  useEffect(() => {
    setEtat(lireLocal(userId));
    let vivant = true;
    let minuterie = null;
    let essais = 0;
    const lireCache = () => {
      if (!vivant) return;
      const db = dbService.getDb();
      if (!db?.isUserSettingsCacheReady?.()) {
        essais += 1;
        if (essais < SONDE_ESSAIS) minuterie = setTimeout(lireCache, SONDE_MS);
        return;
      }
      const local = etatRef.current;
      // Écriture restée en attente sur ce poste : elle repart, et l'emporte.
      if (local.enAttente && local.disposition) {
        envoyer(local.disposition, { silencieux: true });
        return;
      }
      const gardee = normaliser(db.getUserSettingSync(CLE, null));
      if (!gardee) return;
      ecrireLocal(userId, gardee, false);
      setEtat({ disposition: gardee, enAttente: false });
    };
    lireCache();
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [userId, envoyer]);

  const enregistrer = useCallback((disposition) => {
    ecrireLocal(userId, disposition, true);
    setEtat({ disposition, enAttente: true });
    return envoyer(disposition);
  }, [userId, envoyer]);

  return { disposition: etat.disposition, enregistrer };
}
