import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase.js';
import { dbService } from '../services/dbService.js';
import { addDays, isoDate, parseLocalDate } from '../utils/dateHelpers.js';
import { zurichToday } from '../utils/zurichTime.js';
import { JOURS_ANTICIPATION } from '../modules/groupes/typesGroupe.js';

// Fichier à part de useGroupes.js, volontairement : ce hook est importé par la
// coque (AppLayout), donc embarqué dans le bundle de démarrage. Le garder avec
// useGroupes y aurait tiré tout le CRUD du module, que seul l'écran Groupes
// (chunk chargé à la demande) utilise.

const TABLE = 'groupe_evenements';
const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);

// ─────────────────────────────────────────────────────────────────────────────
// useGroupesAlerte - nombre de groupes des 14 prochains jours qui ne sont pas
// encore prêts. Alimente la pastille du menu : l'alerte d'anticipation doit se
// voir SANS ouvrir le module, sinon elle ne prévient personne.
//
// Un comptage en échec ne remet JAMAIS la pastille à zéro : elle garde sa
// dernière valeur et la lecture est retentée. Une pastille qui disparaît une
// heure sur une coupure wifi, c'est l'alerte qui se tait au pire moment.
//
// GET d'une seule ligne avec count exact, et non HEAD : sur un HEAD, PostgREST
// répond sans corps et postgrest-js rend alors error = null même quand la table
// n'existe pas. Le GET rapporte le code (42P01 / PGRST205), ce qui permet de
// tout arrêter - horloge et canal realtime - tant que la migration 20260920
// n'est pas appliquée, au lieu de relancer un 404 à chaque réveil de tablette.
// ─────────────────────────────────────────────────────────────────────────────
const RETRY_ALERTE_MS = 30000;

export function useGroupesAlerte(etablissementId, { enabled = true } = {}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!etablissementId || !enabled) { setCount(0); return undefined; }
    let mounted = true;
    let retryTimer = null;
    let horloge = null;
    let unsub = null;

    const arreter = () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (horloge) { clearInterval(horloge); horloge = null; }
      if (unsub) { unsub(); unsub = null; }
    };

    const compter = async () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      const debut = zurichToday();
      const fin = isoDate(addDays(parseLocalDate(debut), JOURS_ANTICIPATION));
      const { count: n, error } = await supabase
        .from(TABLE)
        .select('id', { count: 'exact' })
        .eq('etablissement_id', etablissementId)
        .eq('annule', false)
        .neq('statut', 'pret')
        .gte('date_evenement', debut)
        .lte('date_evenement', fin)
        .limit(1);
      if (!mounted) return;
      if (error) {
        if (RELATION_ABSENTE.has(error.code)) {
          // Rien à réessayer : la table n'apparaîtra pas toute seule.
          setCount(0);
          arreter();
          return;
        }
        retryTimer = setTimeout(compter, RETRY_ALERTE_MS);
        return;
      }
      setCount(n || 0);
    };

    const realtime = dbService.getRealtime();
    unsub = realtime?.subscribeReload
      ? realtime.subscribeReload([TABLE], () => { if (mounted) compter(); })
      : null;
    // La fenêtre glisse avec le calendrier : une tablette laissée allumée doit
    // voir entrer le groupe de J+14 sans qu'on la recharge.
    horloge = setInterval(compter, 60 * 60 * 1000);
    compter();

    return () => {
      mounted = false;
      arreter();
    };
  }, [etablissementId, enabled]);

  return count;
}
