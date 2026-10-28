import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { getDemoData } from '../../data/demoData.js';
import { userDisplay } from '../../utils/userDisplay.js';
import { zurichAjouterJours, zurichDateHeure } from '../../utils/zurichTime.js';

// ─────────────────────────────────────────────────────────────────────────────
// Données de la branche Hôtel (migration 20261028_hotel_h0) : chambres, séjours
// et journal des statuts de ménage. Partagées par Hébergement, Étages et la
// carte « Aujourd'hui à l'hôtel » du tableau de bord.
//
// Un seul hook générique, useTableHotel, même contrat que useSpaTable :
//   'loading' aucune lecture n'a encore abouti
//   'ready'   données fiables (la liste peut être vide pour de vrai)
//   'error'   la première lecture a échoué
//   'absent'  la table n'existe pas (migration non appliquée)
// Une lecture en échec ne vide jamais la liste affichée.
//
// Nuitées en dates civiles (YYYY-MM-DD, comparables en texte) ; « aujourd'hui »
// est la date de Zurich (zurichToday), jamais celle du navigateur. Le jour du
// départ est un jour d'arrivée possible : deux séjours se gênent quand
// a.arrivee < b.depart et b.arrivee < a.depart, règle identique au déclencheur
// sejours_sans_chevauchement.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUTS_MENAGE = [
  { id: 'a_faire', label: 'À faire', ton: 'warning' },
  { id: 'en_cours', label: 'En cours', ton: 'info' },
  { id: 'propre', label: 'Propre', ton: 'success' },
  { id: 'inspectee', label: 'Inspectée', ton: 'success' },
  { id: 'hors_service', label: 'Hors service', ton: 'danger' },
];

export const STATUTS_SEJOUR = [
  { id: 'prevu', label: 'Prévu', ton: 'info' },
  { id: 'en_maison', label: 'En maison', ton: 'success' },
  { id: 'parti', label: 'Parti', ton: 'neutre' },
  { id: 'annule', label: 'Annulé', ton: 'neutre' },
  { id: 'no_show', label: 'No-show', ton: 'danger' },
];

export const PENSIONS = [
  { id: 'aucune', label: 'Sans pension' },
  { id: 'petit_dejeuner', label: 'Petit-déjeuner' },
  { id: 'demi', label: 'Demi-pension' },
  { id: 'complete', label: 'Pension complète' },
  { id: 'all_inclusive', label: 'All inclusive' },
];

export const libelleDe = (liste, id) => liste.find((x) => x.id === id)?.label || id || '';
export const tonDe = (liste, id) => liste.find((x) => x.id === id)?.ton || 'neutre';

// Un séjour qui occupe (ou occupera) sa chambre.
export const sejourOccupe = (s) => s.statut === 'prevu' || s.statut === 'en_maison';
export const nuiteesCommunes = (a, b) => a.arrivee < b.depart && b.arrivee < a.depart;
export const personnes = (s) => (s.nbAdultes || 0) + (s.nbEnfants || 0);

// Le séjour qui empêche `candidat` de prendre sa chambre, ou null. Même règle
// que le déclencheur : la base refuse ce que l'écran laisse passer, et l'écran
// prévient avant d'envoyer.
export function sejourEnConflit(sejours, candidat) {
  if (!candidat.chambreId || !sejourOccupe(candidat)) return null;
  return sejours.find((s) => s.id !== candidat.id && s.chambreId === candidat.chambreId
    && sejourOccupe(s) && nuiteesCommunes(s, candidat)) || null;
}

// Ordre des chambres : `ordre` puis numéro (101 avant 12 n'arrive pas : tri numérique).
export function trierChambres(chambres) {
  return [...chambres].sort((a, b) => (a.ordre - b.ordre)
    || String(a.numero).localeCompare(String(b.numero), 'fr', { numeric: true }));
}

export const arriveesDu = (sejours, jour) => sejours.filter((s) => s.arrivee === jour && sejourOccupe(s));
export const departsDu = (sejours, jour) => sejours.filter((s) => s.depart === jour && (s.statut === 'en_maison' || s.statut === 'parti'));
export const enMaison = (sejours) => sejours.filter((s) => s.statut === 'en_maison');
// Séjours prévus qui arrivent après `jour`, les plus proches d'abord.
export const aVenir = (sejours, jour) => sejours.filter((s) => s.statut === 'prevu' && s.arrivee > jour)
  .sort((a, b) => a.arrivee.localeCompare(b.arrivee) || a.nomHote.localeCompare(b.nomHote, 'fr'));

// Couverts du petit-déjeuner de demain : les séjours en maison qui ont une
// pension et dorment encore cette nuit (départ demain ou plus tard).
export function couvertsPetitDejeuner(sejours, jour) {
  const demain = zurichAjouterJours(jour, 1);
  return enMaison(sejours)
    .filter((s) => s.pension !== 'aucune' && s.depart >= demain)
    .reduce((n, s) => n + personnes(s), 0);
}

// Séjour occupant une chambre un jour donné (en maison ce jour, ou prévu
// aujourd'hui) : ce que l'écran Étages affiche sous le numéro.
export function sejourDeLaChambre(sejours, chambreId, jour) {
  const duJour = { arrivee: jour, depart: zurichAjouterJours(jour, 1), chambreId };
  return sejours.find((s) => s.chambreId === chambreId && sejourOccupe(s) && nuiteesCommunes(s, duJour)) || null;
}

// Équipe de l'établissement (DEMO_DATA.utilisateurs, hydraté à la connexion),
// pour attribuer une chambre : comptes actifs rattachés à l'établissement.
export function equipeDe(etabId) {
  const tous = getDemoData()?.utilisateurs || [];
  return tous
    .filter((u) => u && u.actif !== false && (!etabId || (u.etablissementIds || []).includes(etabId)))
    .map((u) => ({ id: u.id, nom: userDisplay(u.id).name }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export const nomPersonne = (id) => (id ? userDisplay(id).name : '');

// « 2026-11-03 » devient « 03.11.2026 » (format suisse, sans fuseau).
export function dateCourte(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

// Horodatage UTC affiché à l'heure de Zurich : « 03.11.2026 14:05 ».
export function dateHeureZurich(iso) {
  if (!iso) return '';
  const { date, heure } = zurichDateHeure(iso);
  return `${date} ${heure}`;
}

// ── Mappers (snake_case en base, camelCase dans l'app) ───────────────────────
export function mapChambre(r) {
  return {
    id: r.id,
    numero: r.numero || '',
    etage: r.etage || '',
    categorie: r.categorie || '',
    capacite: Number(r.capacite) || 1,
    statutMenage: r.statut_menage || 'a_faire',
    horsServiceMotif: r.hors_service_motif || '',
    attribueeA: r.attribuee_a || null,
    notes: r.notes || '',
    ordre: Number(r.ordre) || 0,
    actif: r.actif !== false,
    updatedAt: r.updated_at || null,
  };
}

export function mapSejour(r) {
  return {
    id: r.id,
    chambreId: r.chambre_id || null,
    clientId: r.client_id || null,
    nomHote: r.nom_hote || '',
    nbAdultes: Number(r.nb_adultes) || 0,
    nbEnfants: Number(r.nb_enfants) || 0,
    arrivee: r.arrivee || '',
    depart: r.depart || '',
    statut: r.statut || 'prevu',
    pension: r.pension || 'aucune',
    origine: r.origine || '',
    demandesSpeciales: r.demandes_speciales || '',
    notes: r.notes || '',
    createdBy: r.created_by || null,
    createdAt: r.created_at || null,
  };
}

export function mapJournal(r) {
  return {
    id: r.id,
    chambreId: r.chambre_id,
    ancien: r.ancien || null,
    nouveau: r.nouveau,
    par: r.par || null,
    at: r.at,
  };
}

// ── Erreurs ──────────────────────────────────────────────────────────────────
const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;

const MESSAGES_ERREUR = {
  '23505': 'Ce numéro de chambre existe déjà dans cet établissement.',
  '23514': 'Une des valeurs saisies est refusée (dates, capacité ou nombre de personnes).',
  '23503': 'Élément lié introuvable (chambre ou fiche client d\'un autre établissement ?).',
  '42501': 'Tu n\'as pas les droits pour cette action.',
};

export function messageErreur(error) {
  if (!error) return null;
  console.error('[hotel] erreur Supabase', error);
  if (RELATION_ABSENTE.has(error.code)) return 'Le socle hôtel n\'est pas encore activé sur la base de données.';
  // Déclencheur anti-chevauchement : le message de la base dit quel séjour gêne.
  if (error.code === '23P01') return String(error.message || '').replace(/^SEJOUR_CHEVAUCHEMENT:\s*/, 'Chambre déjà prise : ');
  if (error.code === '42501' && /CHAMBRE_FICHE_RESERVEE/.test(error.message || '')) {
    return 'La fiche de la chambre se modifie avec le droit Hébergement.';
  }
  return MESSAGES_ERREUR[String(error.code || '')] || 'Erreur technique. Réessaie ou contacte le support.';
}

// ── Lecture d'une table, en direct (realtime) ───────────────────────────────
export function useTableHotel(table, etabId, { map, filtres = [], cle = '', order = [], limit = 5000, actif = true } = {}) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(etabId && actif ? 'loading' : 'ready');
  const reloadRef = useRef(null);
  const mapRef = useRef(map);
  mapRef.current = map;
  const filtresRef = useRef(filtres);
  filtresRef.current = filtres;
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    if (!etabId || !actif) { setRows([]); setStatus('ready'); return undefined; }
    let mounted = true;
    let retryTimer = null;
    let retryDelay = RETRY_MIN_MS;
    let loadedOnce = false;

    const reload = async () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      let q = supabase.from(table).select('*').eq('etablissement_id', etabId);
      for (const [col, op, val] of filtresRef.current) q = q[op](col, val);
      for (const [col, asc] of orderRef.current) q = q.order(col, { ascending: asc !== false });
      const { data, error } = await q.limit(limit);
      if (!mounted) return;
      if (error) {
        if (RELATION_ABSENTE.has(error.code)) { setRows([]); setStatus('absent'); return; }
        console.error(`[hotel] lecture ${table}`, error);
        if (!loadedOnce) setStatus('error');
        retryTimer = setTimeout(reload, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
        return;
      }
      loadedOnce = true;
      retryDelay = RETRY_MIN_MS;
      setRows((data || []).map((r) => mapRef.current(r)));
      setStatus('ready');
    };

    reloadRef.current = reload;
    setStatus('loading');
    reload();
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload
      ? realtime.subscribeReload([table], () => { if (mounted) reload(); })
      : null;
    return () => {
      mounted = false;
      reloadRef.current = null;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsub) unsub();
    };
  }, [table, etabId, cle, limit, actif]);

  const reload = useCallback(() => reloadRef.current?.(), []);

  const actions = useMemo(() => {
    const remplacer = (row) => {
      const m = mapRef.current(row);
      setRows((liste) => [...liste.filter((x) => x.id !== m.id), m]);
      return m;
    };
    return {
      async inserer(valeurs) {
        const { data, error } = await supabase.from(table)
          .insert({ ...valeurs, etablissement_id: etabId }).select().single();
        if (error) return { data: null, error: messageErreur(error) };
        return { data: remplacer(data), error: null };
      },
      async modifier(id, valeurs) {
        const { data, error } = await supabase.from(table).update(valeurs).eq('id', id).select().single();
        if (error) return { data: null, error: messageErreur(error) };
        return { data: remplacer(data), error: null };
      },
      // Une suppression refusée par la RLS ne lève pas d'erreur : elle touche
      // zéro ligne. On relit ce qui a été supprimé avant de l'annoncer.
      async supprimer(id) {
        const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
        if (error) return { error: messageErreur(error) };
        if (!data || !data.length) return { error: 'Suppression impossible : ton rôle ne le permet pas, ou l\'élément n\'existe plus.' };
        setRows((liste) => liste.filter((x) => x.id !== id));
        return { error: null };
      },
    };
  }, [table, etabId]);

  return { rows, status, reload, ...actions };
}

export const useChambres = (etabId, options = {}) => useTableHotel('chambres', etabId, { map: mapChambre, order: [['ordre', true], ['numero', true]], ...options });
export const useSejours = (etabId, options = {}) => useTableHotel('sejours', etabId, { map: mapSejour, order: [['arrivee', true]], limit: 10000, ...options });
export const useJournalChambres = (etabId, options = {}) => useTableHotel('chambres_statut_journal', etabId, { map: mapJournal, order: [['at', false]], limit: 2000, ...options });

// ── Lot H1 : housekeeping complet ───────────────────────────────────────────
export const TYPES_LINGE = [
  { id: 'draps', label: 'Draps' },
  { id: 'serviettes', label: 'Serviettes' },
  { id: 'peignoirs', label: 'Peignoirs' },
  { id: 'tapis', label: 'Tapis de bain' },
  { id: 'autre', label: 'Autre' },
];
export const STATUTS_OBJET = [
  { id: 'trouve', label: 'Trouvé', ton: 'warning' },
  { id: 'rendu', label: 'Rendu', ton: 'success' },
  { id: 'jete', label: 'Jeté', ton: 'neutre' },
];

export function mapMinibar(r) {
  return { id: r.id, chambreId: r.chambre_id, sejourId: r.sejour_id || null, article: r.article || '', quantite: Number(r.quantite) || 1, note: r.note || '', par: r.par || null, createdAt: r.created_at || null };
}
export function mapObjet(r) {
  return {
    id: r.id, chambreId: r.chambre_id || null, sejourId: r.sejour_id || null, description: r.description || '', lieu: r.lieu || '',
    trouveLe: r.trouve_le || '', statut: r.statut || 'trouve', renduLe: r.rendu_le || null, renduA: r.rendu_a || '', note: r.note || '',
    par: r.par || null, createdAt: r.created_at || null,
  };
}
export function mapLinge(r) {
  return { id: r.id, chambreId: r.chambre_id || null, jour: r.jour || '', sens: r.sens || 'sale', type: r.type || 'autre', quantite: Number(r.quantite) || 1, note: r.note || '', par: r.par || null, createdAt: r.created_at || null };
}
export function mapTurndown(r) {
  return { id: r.id, chambreId: r.chambre_id, jour: r.jour || '', faitPar: r.fait_par || null, at: r.at || null };
}

export const useMinibar = (etabId, options = {}) => useTableHotel('chambres_minibar', etabId, { map: mapMinibar, order: [['created_at', false]], limit: 3000, ...options });
export const useObjetsTrouves = (etabId, options = {}) => useTableHotel('objets_trouves', etabId, { map: mapObjet, order: [['trouve_le', false]], limit: 2000, ...options });
export const useLinge = (etabId, options = {}) => useTableHotel('linge_mouvements', etabId, { map: mapLinge, order: [['created_at', false]], limit: 3000, ...options });
export const useTurndown = (etabId, options = {}) => useTableHotel('chambres_turndown', etabId, { map: mapTurndown, order: [['at', false]], limit: 2000, ...options });

// Totaux de linge d'un jour, par type et par sens.
export function totauxLinge(mouvements, jour) {
  const t = {};
  for (const m of mouvements) {
    if (m.jour !== jour) continue;
    const e = t[m.type] || (t[m.type] = { sale: 0, propre: 0 });
    e[m.sens] += m.quantite;
  }
  return t;
}

// ── Lot H2 : demandes interpôles ────────────────────────────────────────────
export const POLES = [
  { id: 'reception', label: 'Réception' },
  { id: 'etages', label: 'Étages' },
  { id: 'technique', label: 'Technique' },
  { id: 'cuisine', label: 'Cuisine' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'spa', label: 'Spa' },
  { id: 'direction', label: 'Direction' },
];
export const PRIORITES = [
  { id: 'basse', label: 'Basse', ton: 'neutre' },
  { id: 'normale', label: 'Normale', ton: 'info' },
  { id: 'haute', label: 'Haute', ton: 'warning' },
  { id: 'urgente', label: 'Urgente', ton: 'danger' },
];
export const STATUTS_DEMANDE = [
  { id: 'ouverte', label: 'Ouverte', ton: 'warning' },
  { id: 'en_cours', label: 'En cours', ton: 'info' },
  { id: 'faite', label: 'Faite', ton: 'success' },
  { id: 'annulee', label: 'Annulée', ton: 'neutre' },
];
export const ACTIONS_DEMANDE = { creee: 'Créée', statut: 'Statut', assignation: 'Attribuée à', escalade: 'Escalade', echeance: 'Échéance', pole: 'Pôle' };

// Pôle par défaut d'une personne, d'après son rôle : l'écran s'ouvre dessus.
export function poleDuRole(role) {
  if (role === 'receptionniste' || role === 'hote') return 'reception';
  if (role === 'gouvernante' || role === 'femme_de_chambre') return 'etages';
  if (role === 'technicien') return 'technique';
  if (role === 'cuisinier' || role === 'resp_cuisine') return 'cuisine';
  if (role === 'serveur') return 'restaurant';
  if (role === 'praticien_spa') return 'spa';
  return null;
}

export const demandeOuverte = (d) => d.statut === 'ouverte' || d.statut === 'en_cours';
export const demandeEnRetard = (d, maintenantIso) => demandeOuverte(d) && !!d.echeance && d.echeance < maintenantIso;

export function mapDemande(r) {
  return {
    id: r.id, chambreId: r.chambre_id || null, sejourId: r.sejour_id || null, origine: r.origine || 'hote', pole: r.pole || 'reception',
    titre: r.titre || '', detail: r.detail || '', photoUrl: r.photo_url || null, priorite: r.priorite || 'normale',
    echeance: r.echeance || null, statut: r.statut || 'ouverte', escaladee: r.escaladee === true, escaladeeAt: r.escaladee_at || null,
    assigneeA: r.assignee_a || null, creePar: r.cree_par || null, faitePar: r.faite_par || null, faiteAt: r.faite_at || null,
    createdAt: r.created_at || null, updatedAt: r.updated_at || null,
  };
}
export function mapDemandeJournal(r) {
  return { id: r.id, demandeId: r.demande_id, action: r.action, detail: r.detail || null, par: r.par || null, at: r.at };
}
export const useDemandes = (etabId, options = {}) => useTableHotel('demandes', etabId, { map: mapDemande, order: [['created_at', false]], limit: 5000, ...options });
export const useDemandesJournal = (etabId, options = {}) => useTableHotel('demandes_journal', etabId, { map: mapDemandeJournal, order: [['at', false]], limit: 5000, ...options });
