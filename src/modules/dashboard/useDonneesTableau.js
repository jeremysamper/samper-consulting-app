import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { addDays, isoDate, parseLocalDate } from '../../utils/dateHelpers.js';
import { mapGroupeFromDB } from '../../hooks/useGroupes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Données du tableau de bord (restaurants), lues sur des fenêtres courtes :
//   horaires           aujourd'hui → J+7 (l'équipe du jour, de demain, et le
//                      prochain service de chacun)
//   couverts           aujourd'hui → J+6 (previsions_jour, tenue à jour par
//                      trigger sur les réservations)
//   groupes            aujourd'hui → J+14, non annulés (fenêtre d'anticipation)
//   message consultant
//   HACCP              zones, tournées et relevés du jour (si le rôle y a accès)
//   gestion            pertes du mois et à valider, inventaires (direction)
// Les absences viennent de useAbsences, à part (partagé avec le Planning).
//
// Chaque source a son état : une lecture en échec garde la dernière valeur
// affichée (jamais d'écran « aucun groupe » sur un JWT expiré au réveil) et
// le tableau le signale discrètement. 'absent' = table pas encore créée.
// Tout est relu sur un changement realtime des tables concernées et au réveil
// de l'appareil (subscribeReload).
// ─────────────────────────────────────────────────────────────────────────────

const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const TABLES_SUIVIES = ['shifts', 'consultant_messages', 'groupe_evenements', 'previsions_jour', 'haccp_releves', 'pertes'];

const VIDE = {
  shifts: [], couverts: [], groupes: [], message: null,
  haccp: { zones: [], creneaux: [], releves: [] },
  pertes: [], inventaires: [],
};

// Résultat d'une lecture Supabase → données, ou erreur à signaler.
async function lire(requete) {
  const { data, error } = await requete;
  if (error) throw error;
  return data || [];
}

export function useDonneesTableau({ etablissementId, aujourdhui, avecHaccp, avecPertes, avecStock, avecCouverts, avecGroupes }) {
  const [donnees, setDonnees] = useState(VIDE);
  const [statuts, setStatuts] = useState({});
  const [pret, setPret] = useState(false);
  const rechargerRef = useRef(null);

  useEffect(() => {
    if (!etablissementId) { setPret(true); return undefined; }
    const bridge = dbService.getBridge();
    if (!bridge?.db) { setPret(true); return undefined; }
    let vivant = true;

    const j = (n) => isoDate(addDays(parseLocalDate(aujourdhui), n));
    const debutMois = `${aujourdhui.slice(0, 7)}-01`;

    const sources = {
      shifts: () => lire(supabase.from('shifts').select('*')
        .eq('etablissement_id', etablissementId).gte('date', aujourdhui).lte('date', j(7))
        .order('date').order('debut'))
        .then((rows) => rows.map((r) => bridge.db.mapShiftFromDB(r))),
      message: () => bridge.db.getConsultantMessage(etablissementId, { strict: true }),
      ...(avecCouverts ? {
        couverts: () => lire(supabase.from('previsions_jour')
          .select('date_service, couverts_midi, couverts_soir, couverts_brunch, nb_groupes')
          .eq('etablissement_id', etablissementId).gte('date_service', aujourdhui).lte('date_service', j(6))
          .order('date_service')),
      } : {}),
      ...(avecGroupes ? {
        groupes: () => lire(supabase.from('groupe_evenements').select('*')
          .eq('etablissement_id', etablissementId).eq('annule', false)
          .gte('date_evenement', aujourdhui).lte('date_evenement', j(14))
          .order('date_evenement').order('heure', { nullsFirst: true }))
          .then((rows) => rows.map(mapGroupeFromDB)),
      } : {}),
      ...(avecHaccp ? {
        haccp: async () => {
          const [zones, creneaux, releves] = await Promise.all([
            lire(supabase.from('haccp_zones').select('*').eq('etablissement_id', etablissementId)),
            lire(supabase.from('haccp_creneaux').select('*').eq('etablissement_id', etablissementId)),
            lire(supabase.from('haccp_releves').select('*').eq('etablissement_id', etablissementId).eq('date', aujourdhui)),
          ]);
          return {
            zones: zones.map((r) => bridge.db.mapHaccpZoneFromDB(r)),
            creneaux: creneaux.map((r) => bridge.db.mapHaccpCreneauFromDB(r)),
            releves: releves.map((r) => bridge.db.mapHaccpReleveFromDB(r)),
          };
        },
      } : {}),
      ...(avecPertes ? {
        pertes: () => lire(supabase.from('pertes').select('*')
          .eq('etablissement_id', etablissementId).or(`valide.eq.false,date.gte.${debutMois}`))
          .then((rows) => rows.map((r) => bridge.db.mapPerteFromDB(r))),
      } : {}),
      ...(avecStock ? {
        inventaires: () => bridge.db.listInventaires(etablissementId, { strict: true }),
      } : {}),
    };

    const recharger = async () => {
      const noms = Object.keys(sources);
      const resultats = await Promise.allSettled(noms.map((n) => sources[n]()));
      if (!vivant) return;
      const maj = {};
      const etats = {};
      resultats.forEach((res, i) => {
        const nom = noms[i];
        if (res.status === 'fulfilled') {
          maj[nom] = res.value ?? VIDE[nom];
          etats[nom] = 'ready';
        } else {
          const code = res.reason?.code;
          if (RELATION_ABSENTE.has(code)) { maj[nom] = VIDE[nom]; etats[nom] = 'absent'; }
          else { etats[nom] = 'error'; console.error(`[TableauDeBord] ${nom}`, res.reason); }
        }
      });
      setDonnees((prec) => ({ ...prec, ...maj }));
      setStatuts((prec) => ({ ...prec, ...etats }));
      setPret(true);
    };

    rechargerRef.current = recharger;
    recharger();

    const realtime = dbService.getRealtime();
    const desabonner = realtime?.subscribeReload
      ? realtime.subscribeReload(TABLES_SUIVIES, () => { if (vivant) recharger(); })
      : null;

    return () => {
      vivant = false;
      rechargerRef.current = null;
      if (desabonner) desabonner();
    };
  }, [etablissementId, aujourdhui, avecHaccp, avecPertes, avecStock, avecCouverts, avecGroupes]);

  // Remplacement local d'un horaire (pointage optimiste puis confirmé).
  const remplacerShift = useCallback((shift) => {
    setDonnees((d) => ({ ...d, shifts: d.shifts.map((s) => (s.id === shift.id ? shift : s)) }));
  }, []);
  const remettreShifts = useCallback((shifts) => setDonnees((d) => ({ ...d, shifts })), []);
  const recharger = useCallback(() => rechargerRef.current?.(), []);
  // Mise à jour locale d'une source (message publié), sans attendre le realtime.
  const maj = useCallback((nom, valeur) => setDonnees((d) => ({ ...d, [nom]: valeur })), []);

  return { ...donnees, statuts, pret, remplacerShift, remettreShifts, recharger, maj };
}
