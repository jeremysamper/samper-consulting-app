import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { getDemoData } from '../../data/demoData.js';
import { userDisplay } from '../../utils/userDisplay.js';
import { zurichAjouterJours, zurichDateHeure, zurichMinuitIso } from '../../utils/zurichTime.js';

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
    hoteId: r.hote_id || null,
    tarifId: r.tarif_id || null,
    forfaitId: r.forfait_id || null,
    identifiant: r.identifiant || '',
    prixNuit: r.prix_nuit == null ? null : Number(r.prix_nuit),
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
  // Fichier des hôtes : un e-mail actif par fiche (uq_hotes_email).
  if (error.code === '23505' && /uq_hotes_email/.test(error.message || '')) {
    return 'Une fiche hôte active porte déjà cet e-mail. Ouvre-la, ou laisse l\'e-mail vide sur la seconde personne.';
  }
  // Lot H5 : bracelets, inscriptions, capacité, droits des forfaits.
  const msg = String(error.message || '');
  if (error.code === '23505' && /uq_sejours_identifiant_actif/.test(msg)) return 'Ce numéro de bracelet ou de carte est déjà porté par un autre séjour en cours.';
  if (error.code === '23505' && /uq_activite_inscriptions/.test(msg)) return 'Ce séjour est déjà inscrit à cette activité.';
  if (/^ACTIVITE_COMPLETE:/.test(msg)) return msg.replace(/^ACTIVITE_COMPLETE:\s*/, 'Activité complète : ') + '.';
  if (/^DROIT_EPUISE:/.test(msg)) return msg.replace(/^DROIT_EPUISE:\s*/, 'Droit épuisé : ') + '.';
  if (/^ACTIVITE_ANNULEE:/.test(msg)) return 'Cette activité est annulée.';
  if (/^SEJOUR_INACTIF:/.test(msg)) return 'Ce séjour est annulé ou terminé.';
  if (/^SEJOUR_AVEC_HISTORIQUE:/.test(msg)) return 'Ce séjour porte une note, un registre, des inscriptions ou des consommations : il s\'annule, il ne se supprime pas.';
  if (/^INSCRIPTION_RESERVEE:/.test(msg)) return 'Déplacer une inscription demande le droit Modifier d\'Activités.';
  if (/^DROIT_INCONNU:/.test(msg)) return 'Ce droit n\'est pas dans le forfait du séjour.';
  if (error.code === '42501' && /CHAMBRE_FICHE_RESERVEE/.test(error.message || '')) {
    return 'La fiche de la chambre se modifie avec le droit Hébergement.';
  }
  return MESSAGES_ERREUR[String(error.code || '')] || 'Erreur technique. Réessaie ou contacte le support.';
}

// ── Lecture d'une table, en direct (realtime) ───────────────────────────────
export function useTableHotel(table, etabId, { map, filtres = [], cle = '', order = [], limit = 5000, actif = true, colonneId = 'id' } = {}) {
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
        const { data, error } = await supabase.from(table).update(valeurs).eq(colonneId, id).select().single();
        if (error) return { data: null, error: messageErreur(error) };
        return { data: remplacer(data), error: null };
      },
      // Une suppression refusée par la RLS ne lève pas d'erreur : elle touche
      // zéro ligne. On relit ce qui a été supprimé avant de l'annoncer.
      async supprimer(id) {
        const { data, error } = await supabase.from(table).delete().eq(colonneId, id).select(colonneId);
        if (error) return { error: messageErreur(error) };
        if (!data || !data.length) return { error: 'Suppression impossible : ton rôle ne le permet pas, ou l\'élément n\'existe plus.' };
        setRows((liste) => liste.filter((x) => x.id !== id));
        return { error: null };
      },
    };
  }, [table, etabId, colonneId]);

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

// ── Lot H3 : fiche hôte unique ──────────────────────────────────────────────
export const LANGUES = [
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Allemand' },
  { id: 'it', label: 'Italien' },
  { id: 'en', label: 'Anglais' },
  { id: 'es', label: 'Espagnol' },
  { id: 'autre', label: 'Autre langue' },
];
export const nomHote = (h) => (h ? `${h.prenom || ''} ${h.nom || ''}`.trim() : '');
export function mapHote(r) {
  return {
    id: r.id, prenom: r.prenom || '', nom: r.nom || '', email: r.email || '', telephone: r.telephone || '', langue: r.langue || 'fr',
    dateNaissance: r.date_naissance || '', nationalite: r.nationalite || '', allergies: r.allergies || '', preferences: r.preferences || '',
    occasions: r.occasions || '', vip: r.vip === true, notes: r.notes || '', consentementMarketing: r.consentement_marketing === true,
    consentementAt: r.consentement_at || null, consentementSource: r.consentement_source || null, desinscritAt: r.desinscrit_at || null,
    resaClientId: r.resa_client_id || null, spaClientId: r.spa_client_id || null, archive: r.archive === true,
    createdBy: r.created_by || null, createdAt: r.created_at || null, updatedAt: r.updated_at || null,
  };
}
// Fiches des fichiers voisins (restaurant, spa), pour relier la même personne.
export const mapClientVoisin = (r) => ({ id: r.id, prenom: r.prenom || '', nom: r.nom || '', email: r.email || '', telephone: r.telephone || '', archive: r.archive === true });
export const useHotes = (etabId, options = {}) => useTableHotel('hotes', etabId, { map: mapHote, order: [['nom', true], ['prenom', true]], limit: 10000, ...options });
export const useResaClients = (etabId, options = {}) => useTableHotel('resa_clients', etabId, { map: mapClientVoisin, order: [['nom', true]], limit: 10000, ...options });
export const useSpaClients = (etabId, options = {}) => useTableHotel('spa_clients', etabId, { map: mapClientVoisin, order: [['nom', true]], limit: 10000, ...options });

// ── Lot H4 : tarifs, note de séjour, occupants et registre ─────────────────
export const TYPES_LIGNE = [
  { id: 'nuitee', label: 'Nuitée' },
  { id: 'pension', label: 'Pension' },
  { id: 'taxe_sejour', label: 'Taxe de séjour' },
  { id: 'taxe_hebergement', label: 'Taxe d\'hébergement' },
  { id: 'extra', label: 'Extra' },
  { id: 'remise', label: 'Remise' },
  { id: 'paiement', label: 'Encaissement' },
];
// Lignes que « Nuitées et taxes » recalcule ; les autres sont saisies à la main.
export const TYPES_AUTOMATIQUES = ['nuitee', 'pension', 'taxe_sejour', 'taxe_hebergement'];
export const PIECES_IDENTITE = [
  { id: '', label: 'Aucune' },
  { id: 'passeport', label: 'Passeport' },
  { id: 'carte_identite', label: 'Carte d\'identité' },
  { id: 'permis', label: 'Permis de séjour' },
  { id: 'autre', label: 'Autre pièce' },
];

export function mapReglages(r) {
  return {
    id: r.etablissement_id, etablissementId: r.etablissement_id, commune: r.commune || '',
    taxeSejourAdulte: Number(r.taxe_sejour_adulte) || 0, taxeSejourEnfant: Number(r.taxe_sejour_enfant) || 0,
    ageEnfantExonere: Number(r.age_enfant_exonere) || 0, ageEnfantReduit: Number(r.age_enfant_reduit) || 0,
    taxeHebergement: Number(r.taxe_hebergement) || 0, tvaTaux: r.tva_taux == null ? 3.8 : Number(r.tva_taux),
    numeroHesta: r.numero_hesta || '', mentionNote: r.mention_note || '', updatedAt: r.updated_at || null,
  };
}
export const REGLAGES_DEFAUT = { commune: '', taxeSejourAdulte: 0, taxeSejourEnfant: 0, ageEnfantExonere: 6, ageEnfantReduit: 16, taxeHebergement: 0, tvaTaux: 3.8, numeroHesta: '', mentionNote: '' };
export function mapTarif(r) {
  return {
    id: r.id, nom: r.nom || '', categorie: r.categorie || '', pension: r.pension || 'petit_dejeuner', prixNuit: Number(r.prix_nuit) || 0,
    personnesIncluses: Number(r.personnes_incluses) || 1, prixPersonneSup: Number(r.prix_personne_sup) || 0, prixEnfant: Number(r.prix_enfant) || 0,
    valableDu: r.valable_du || '', valableAu: r.valable_au || '', actif: r.actif !== false, ordre: Number(r.ordre) || 0,
  };
}
export function mapOccupant(r) {
  return {
    id: r.id, sejourId: r.sejour_id, hoteId: r.hote_id || null, prenom: r.prenom || '', nom: r.nom || '', dateNaissance: r.date_naissance || '',
    nationalite: r.nationalite || '', domicileAdresse: r.domicile_adresse || '', domicileLocalite: r.domicile_localite || '', domicilePays: r.domicile_pays || '',
    pieceType: r.piece_type || '', pieceNumero: r.piece_numero || '', arrivee: r.arrivee || '', depart: r.depart || '',
    exonereTaxe: r.exonere_taxe === true, exonereMotif: r.exonere_motif || '', createdBy: r.created_by || null, createdAt: r.created_at || null,
  };
}
export function mapLigne(r) {
  return {
    id: r.id, sejourId: r.sejour_id, jour: r.jour || '', type: r.type || 'extra', libelle: r.libelle || '', quantite: Number(r.quantite) || 0,
    prixUnitaire: Number(r.prix_unitaire) || 0, montant: Number(r.montant) || 0, tvaTaux: r.tva_taux == null ? null : Number(r.tva_taux),
    note: r.note || '', createdBy: r.created_by || null, createdAt: r.created_at || null,
  };
}
export const useTarifs = (etabId, options = {}) => useTableHotel('tarifs', etabId, { map: mapTarif, order: [['ordre', true], ['nom', true]], limit: 500, ...options });
// Une ligne par établissement, sans colonne id : la clé est etablissement_id.
export const useReglagesHotel = (etabId, options = {}) => useTableHotel('hotel_reglages', etabId, { map: mapReglages, limit: 1, colonneId: 'etablissement_id', ...options });
export const useOccupants = (etabId, options = {}) => useTableHotel('sejour_occupants', etabId, { map: mapOccupant, order: [['arrivee', true], ['nom', true]], limit: 20000, ...options });
export const useLignesSejour = (etabId, options = {}) => useTableHotel('sejour_lignes', etabId, { map: mapLigne, order: [['jour', true], ['created_at', true]], limit: 50000, ...options });

export const nuitsDe = (s) => Math.max(0, Math.round((Date.parse(`${s.depart}T12:00:00`) - Date.parse(`${s.arrivee}T12:00:00`)) / 86400000));
// Montant en francs : « 1'234.50 ».
export function chf(n) {
  const v = Number(n) || 0;
  const [ent, dec] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '\'')}.${dec}`;
}
// Âge révolu d'une personne à une date donnée, ou null sans date de naissance.
export function ageAu(dateNaissance, jour) {
  if (!dateNaissance || !jour) return null;
  const [ny, nm, nd] = dateNaissance.split('-').map(Number);
  const [jy, jm, jd] = jour.split('-').map(Number);
  let age = jy - ny;
  if (jm < nm || (jm === nm && jd < nd)) age -= 1;
  return age;
}
// Tarifs utilisables pour un séjour : actifs, de la catégorie de la chambre
// (ou sans catégorie), valables le jour d'arrivée.
export function tarifsApplicables(tarifs, sejour, chambre) {
  return tarifs.filter((t) => (t.actif || t.id === sejour?.tarifId)
    && (!t.categorie || !chambre?.categorie || t.categorie === chambre.categorie)
    && (!t.valableDu || !sejour?.arrivee || t.valableDu <= sejour.arrivee)
    && (!t.valableAu || !sejour?.arrivee || t.valableAu >= sejour.arrivee));
}
export const prixNuitDe = (sejour, tarif) => (sejour?.prixNuit != null ? sejour.prixNuit : tarif ? tarif.prixNuit : null);

// Lignes automatiques d'un séjour : une nuitée par nuit au prix convenu (ou du
// tarif), le supplément des personnes au-delà des personnes incluses, les
// enfants, puis les taxes par personne et par nuit. Les occupants enregistrés
// font foi pour les taxes (âge, exonération) ; sans occupants, les nombres du
// séjour (enfants au tarif enfant). Sans tarif ni prix convenu, aucune nuitée.
export function lignesAutomatiques(sejour, tarif, reglages, occupants = []) {
  const nuits = nuitsDe(sejour);
  const lignes = [];
  if (!nuits) return lignes;
  const prix = prixNuitDe(sejour, tarif);
  const r = reglages || REGLAGES_DEFAUT;
  const tva = r.tvaTaux;
  if (prix != null) {
    lignes.push({ jour: sejour.arrivee, type: 'nuitee', libelle: `Nuitée${tarif ? `, ${tarif.nom}` : ''}`, quantite: nuits, prix_unitaire: prix, tva_taux: tva });
    const incluses = tarif ? tarif.personnesIncluses : 2;
    const adultesSup = Math.max(0, (sejour.nbAdultes || 0) - incluses);
    if (tarif && adultesSup > 0 && tarif.prixPersonneSup > 0) {
      lignes.push({ jour: sejour.arrivee, type: 'nuitee', libelle: 'Personne supplémentaire', quantite: nuits * adultesSup, prix_unitaire: tarif.prixPersonneSup, tva_taux: tva });
    }
    if (tarif && (sejour.nbEnfants || 0) > 0 && tarif.prixEnfant > 0) {
      lignes.push({ jour: sejour.arrivee, type: 'nuitee', libelle: 'Enfant', quantite: nuits * sejour.nbEnfants, prix_unitaire: tarif.prixEnfant, tva_taux: tva });
    }
  }
  const mesOccupants = occupants.filter((o) => o.sejourId === sejour.id);
  let adultes = 0;
  let enfants = 0;
  if (mesOccupants.length) {
    for (const o of mesOccupants) {
      const age = ageAu(o.dateNaissance, sejour.arrivee);
      if (o.exonereTaxe || (age != null && age < r.ageEnfantExonere)) continue;
      if (age != null && age < r.ageEnfantReduit) enfants += 1;
      else adultes += 1;
    }
  } else {
    adultes = sejour.nbAdultes || 0;
    enfants = sejour.nbEnfants || 0;
  }
  if (r.taxeSejourAdulte > 0 && adultes > 0) lignes.push({ jour: sejour.arrivee, type: 'taxe_sejour', libelle: 'Taxe de séjour, adulte', quantite: nuits * adultes, prix_unitaire: r.taxeSejourAdulte, tva_taux: null });
  if (r.taxeSejourEnfant > 0 && enfants > 0) lignes.push({ jour: sejour.arrivee, type: 'taxe_sejour', libelle: 'Taxe de séjour, enfant', quantite: nuits * enfants, prix_unitaire: r.taxeSejourEnfant, tva_taux: null });
  const assujettis = adultes + enfants;
  if (r.taxeHebergement > 0 && assujettis > 0) lignes.push({ jour: sejour.arrivee, type: 'taxe_hebergement', libelle: 'Taxe d\'hébergement', quantite: nuits * assujettis, prix_unitaire: r.taxeHebergement, tva_taux: null });
  return lignes;
}

// Totaux d'une note : total dû (hors encaissements), encaissé, solde, TVA incluse.
export function totauxNote(lignes) {
  let total = 0;
  let encaisse = 0;
  let tva = 0;
  for (const l of lignes) {
    if (l.type === 'paiement') encaisse += -l.montant;
    else {
      total += l.montant;
      if (l.tvaTaux) tva += l.montant - l.montant / (1 + l.tvaTaux / 100);
    }
  }
  const arrondi = (x) => Math.round(x * 100) / 100;
  return { total: arrondi(total), encaisse: arrondi(encaisse), solde: arrondi(total - encaisse), tva: arrondi(tva) };
}

// ── Registre et statistiques d'un mois (YYYY-MM) ────────────────────────────
export const premierDuMois = (mois) => `${mois}-01`;
export function finDuMois(mois) {
  const [y, m] = mois.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export const joursDuMois = (mois) => Number(finDuMois(mois).slice(8, 10));
// Nuits d'un intervalle [arrivee, depart) qui tombent dans le mois.
export function nuitsDansLeMois(arrivee, depart, mois) {
  const debut = premierDuMois(mois);
  const fin = zurichAjouterJours(finDuMois(mois), 1);
  const a = arrivee > debut ? arrivee : debut;
  const d = depart < fin ? depart : fin;
  return d > a ? nuitsDe({ arrivee: a, depart: d }) : 0;
}
const sejourCompte = (s) => s.statut === 'en_maison' || s.statut === 'parti';

// Chiffres du mois : nuitées chambres (séjours en maison ou partis), nuitées
// personnes (occupants, sinon personnes du séjour), arrivées, taux d'occupation
// (nuitées chambres sur chambres actives fois jours), durée moyenne, prix
// moyen par nuitée vendue (lignes nuitée du mois), taxes du mois, et la
// répartition HESTA par pays de domicile.
export function statsMois({ sejours, chambres, occupants, lignes, mois }) {
  const debut = premierDuMois(mois);
  const fin = finDuMois(mois);
  const duMois = sejours.filter((s) => sejourCompte(s) && s.arrivee <= fin && s.depart > debut);
  const nuiteesChambres = duMois.reduce((n, s) => n + nuitsDansLeMois(s.arrivee, s.depart, mois), 0);
  const arrivees = duMois.filter((s) => s.arrivee >= debut && s.arrivee <= fin);
  const idsDuMois = new Set(duMois.map((s) => s.id));
  const parSejour = new Map();
  for (const o of occupants) {
    if (!idsDuMois.has(o.sejourId)) continue;
    parSejour.set(o.sejourId, [...(parSejour.get(o.sejourId) || []), o]);
  }
  let nuiteesPersonnes = 0;
  let arriveesPersonnes = 0;
  const parPays = new Map();
  const compter = (pays, nuitees, arriveesN) => {
    const cle = (pays || '').trim() || 'Non renseigné';
    const e = parPays.get(cle) || { pays: cle, arrivees: 0, nuitees: 0 };
    e.nuitees += nuitees;
    e.arrivees += arriveesN;
    nuiteesPersonnes += nuitees;
    arriveesPersonnes += arriveesN;
    parPays.set(cle, e);
  };
  for (const s of duMois) {
    const liste = parSejour.get(s.id);
    if (liste && liste.length) {
      for (const o of liste) {
        const arr = o.arrivee || s.arrivee;
        compter(o.domicilePays || o.nationalite, nuitsDansLeMois(arr, o.depart || s.depart, mois), arr >= debut && arr <= fin ? 1 : 0);
      }
    } else {
      const p = personnes(s) || 1;
      compter('', nuitsDansLeMois(s.arrivee, s.depart, mois) * p, s.arrivee >= debut && s.arrivee <= fin ? p : 0);
    }
  }
  const chambresActives = chambres.filter((c) => c.actif).length;
  const capacite = chambresActives * joursDuMois(mois);
  const lignesDuMois = lignes.filter((l) => l.jour >= debut && l.jour <= fin);
  const caNuitees = lignesDuMois.filter((l) => l.type === 'nuitee').reduce((n, l) => n + l.montant, 0);
  const taxes = { sejour: 0, hebergement: 0 };
  for (const l of lignesDuMois) {
    if (l.type === 'taxe_sejour') taxes.sejour += l.montant;
    if (l.type === 'taxe_hebergement') taxes.hebergement += l.montant;
  }
  const dureeMoyenne = arrivees.length ? arrivees.reduce((n, s) => n + nuitsDe(s), 0) / arrivees.length : 0;
  return {
    nuiteesChambres, nuiteesPersonnes, arrivees: arrivees.length, arriveesPersonnes,
    tauxOccupation: capacite ? nuiteesChambres / capacite : 0, chambresActives,
    dureeMoyenne, prixMoyen: nuiteesChambres ? caNuitees / nuiteesChambres : 0, caNuitees,
    taxes, parPays: [...parPays.values()].sort((a, b) => b.nuitees - a.nuitees || a.pays.localeCompare(b.pays, 'fr')),
  };
}

// Registre des nuitées du mois : une ligne par personne hébergée dont le
// séjour touche le mois (LHR, RS 935.1 : le registre se tient par personne).
export function registreDuMois({ sejours, occupants, chambres, mois }) {
  const debut = premierDuMois(mois);
  const fin = finDuMois(mois);
  const parId = new Map(sejours.map((s) => [s.id, s]));
  const numero = (id) => chambres.find((c) => c.id === id)?.numero || '';
  return occupants
    .filter((o) => { const s = parId.get(o.sejourId); return s && sejourCompte(s) && o.arrivee <= fin && o.depart > debut; })
    .map((o) => ({ ...o, chambre: numero(parId.get(o.sejourId)?.chambreId), nomSejour: parId.get(o.sejourId)?.nomHote || '' }))
    .sort((a, b) => a.arrivee.localeCompare(b.arrivee) || a.nom.localeCompare(b.nom, 'fr'));
}

// CSV à points-virgules (Excel suisse), guillemets doublés, BOM pour les accents.
// Une cellule qui commence par =, +, -, @, tabulation ou retour chariot est
// précédée d'une apostrophe : un tableur ne l'exécute pas comme une formule.
export function versCsv(entetes, lignes) {
  const cellule = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${[entetes, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n')}`;
}
export function telechargerTexte(nomFichier, contenu, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([contenu], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Lot H5 : forfaits, activités, inscriptions, consommations ──────────────
export const CATEGORIES_DROIT = [
  { id: 'restauration', label: 'Restauration' },
  { id: 'boissons', label: 'Boissons' },
  { id: 'spa', label: 'Spa' },
  { id: 'activites', label: 'Activités' },
  { id: 'autre', label: 'Autre' },
];
export const STATUTS_INSCRIPTION = [
  { id: 'inscrit', label: 'Inscrit', ton: 'info' },
  { id: 'present', label: 'Présent', ton: 'success' },
  { id: 'annule', label: 'Annulé', ton: 'neutre' },
];

export function mapForfait(r) {
  return { id: r.id, nom: r.nom || '', description: r.description || '', prixParNuit: Number(r.prix_par_nuit) || 0, actif: r.actif !== false, ordre: Number(r.ordre) || 0 };
}
export function mapDroit(r) {
  return {
    id: r.id, forfaitId: r.forfait_id, libelle: r.libelle || '', categorie: r.categorie || 'autre',
    quantiteParSejour: r.quantite_par_sejour == null ? null : Number(r.quantite_par_sejour),
    quantiteParJour: r.quantite_par_jour == null ? null : Number(r.quantite_par_jour), ordre: Number(r.ordre) || 0,
  };
}
export function mapActivite(r) {
  return {
    id: r.id, titre: r.titre || '', description: r.description || '', lieu: r.lieu || '', debut: r.debut, fin: r.fin,
    places: r.places == null ? null : Number(r.places), prix: Number(r.prix) || 0, inclusForfait: r.inclus_forfait !== false,
    responsable: r.responsable || null, annulee: r.annulee === true, createdBy: r.created_by || null, createdAt: r.created_at || null,
  };
}
export function mapInscription(r) {
  return { id: r.id, activiteId: r.activite_id, sejourId: r.sejour_id, nbPersonnes: Number(r.nb_personnes) || 1, statut: r.statut || 'inscrit', note: r.note || '', createdBy: r.created_by || null, createdAt: r.created_at || null };
}
export function mapConsommation(r) {
  return { id: r.id, sejourId: r.sejour_id, droitId: r.droit_id || null, libelle: r.libelle || '', quantite: Number(r.quantite) || 1, jour: r.jour || '', lieu: r.lieu || '', at: r.at || null, par: r.par || null };
}
export const useForfaits = (etabId, options = {}) => useTableHotel('forfaits', etabId, { map: mapForfait, order: [['ordre', true], ['nom', true]], limit: 200, ...options });
export const useForfaitDroits = (etabId, options = {}) => useTableHotel('forfait_droits', etabId, { map: mapDroit, order: [['ordre', true], ['libelle', true]], limit: 2000, ...options });
export const useActivites = (etabId, options = {}) => useTableHotel('activites', etabId, { map: mapActivite, order: [['debut', true]], limit: 5000, ...options });
export const useInscriptions = (etabId, options = {}) => useTableHotel('activite_inscriptions', etabId, { map: mapInscription, order: [['created_at', true]], limit: 20000, ...options });
export const useConsommations = (etabId, options = {}) => useTableHotel('consommations', etabId, { map: mapConsommation, order: [['at', false]], limit: 20000, ...options });

// Jour de Zurich (YYYY-MM-DD) d'un horodatage, et heure « 07:00 ».
export function jourZurich(iso) {
  if (!iso) return '';
  const { date } = zurichDateHeure(iso);
  const [d, m, y] = date.split('.');
  return `${y}-${m}-${d}`;
}
export const heureZurich = (iso) => (iso ? zurichDateHeure(iso).heure : '');
// Horodatage ISO d'un jour de Zurich à une heure donnée (« 07:00 »).
export function isoZurich(jour, heure) {
  const [hh, mm] = String(heure || '00:00').split(':').map(Number);
  return new Date(Date.parse(zurichMinuitIso(jour)) + ((hh || 0) * 60 + (mm || 0)) * 60000).toISOString();
}
export const activitesDuJour = (activites, jour) => activites.filter((a) => jourZurich(a.debut) === jour);
export const inscriptionsActives = (inscriptions, activiteId) => inscriptions.filter((i) => i.activiteId === activiteId && i.statut !== 'annule');
export function placesPrises(activite, inscriptions) {
  return inscriptionsActives(inscriptions, activite.id).reduce((n, i) => n + i.nbPersonnes, 0);
}
export function placesRestantes(activite, inscriptions) {
  if (activite.places == null) return null;
  return Math.max(0, activite.places - placesPrises(activite, inscriptions));
}
export const sejoursActifs = (sejours) => sejours.filter((s) => s.statut === 'prevu' || s.statut === 'en_maison');
// Séjour trouvé par son bracelet (exact, sans casse) ou par un bout de nom.
export function trouverSejour(sejours, texte) {
  const t = String(texte || '').trim().toLowerCase();
  if (!t) return [];
  const actifs = sejoursActifs(sejours);
  const parBracelet = actifs.filter((s) => (s.identifiant || '').trim().toLowerCase() === t);
  if (parBracelet.length) return parBracelet;
  return actifs.filter((s) => s.nomHote.toLowerCase().includes(t) || (s.identifiant || '').toLowerCase().includes(t));
}
// État des droits d'un séjour : consommé sur le séjour, consommé le jour, et
// ce qui reste (null = sans limite). Un droit est épuisé quand l'une des
// deux limites est atteinte.
export function droitsRestants(droits, consommations, sejour, jour) {
  const miennes = consommations.filter((c) => c.sejourId === sejour.id);
  return droits.filter((d) => d.forfaitId === sejour.forfaitId).map((d) => {
    const surSejour = miennes.filter((c) => c.droitId === d.id).reduce((n, c) => n + c.quantite, 0);
    const surJour = miennes.filter((c) => c.droitId === d.id && c.jour === jour).reduce((n, c) => n + c.quantite, 0);
    const resteSejour = d.quantiteParSejour == null ? null : Math.max(0, d.quantiteParSejour - surSejour);
    const resteJour = d.quantiteParJour == null ? null : Math.max(0, d.quantiteParJour - surJour);
    return { droit: d, surSejour, surJour, resteSejour, resteJour, epuise: resteSejour === 0 || resteJour === 0 };
  });
}

// ── Lot H6 : passations, canaux, tâches récurrentes ────────────────────────
export const SERVICES_PASSATION = [
  { id: 'matin', label: 'Matin' },
  { id: 'apres_midi', label: 'Après-midi' },
  { id: 'soir', label: 'Soir' },
  { id: 'nuit', label: 'Nuit' },
];
export const RECURRENCES = [
  { id: 'quotidien', label: 'Chaque jour' },
  { id: 'hebdomadaire', label: 'Chaque semaine' },
  { id: 'mensuel', label: 'Chaque mois' },
];
export const JOURS_SEMAINE = [
  { id: 1, label: 'Lundi' }, { id: 2, label: 'Mardi' }, { id: 3, label: 'Mercredi' }, { id: 4, label: 'Jeudi' },
  { id: 5, label: 'Vendredi' }, { id: 6, label: 'Samedi' }, { id: 7, label: 'Dimanche' },
];
export const CANAL_TOUS = { id: 'tous', label: 'Toute l\'équipe' };

export function mapPassation(r) {
  return { id: r.id, pole: r.pole || 'reception', jour: r.jour || '', service: r.service || 'matin', contenu: r.contenu || '', important: r.important === true, createdBy: r.created_by || null, createdAt: r.created_at || null, updatedAt: r.updated_at || null };
}
export const mapLecture = (r) => ({ id: r.id, passationId: r.passation_id, userId: r.user_id, at: r.at || null });
export function mapMessageCanal(r) {
  return { id: r.id, canal: r.canal || 'tous', contenu: r.contenu || '', mentions: Array.isArray(r.mentions) ? r.mentions : [], createdBy: r.created_by || null, createdAt: r.created_at || null };
}
export function mapTacheRecurrente(r) {
  return {
    id: r.id, pole: r.pole || 'reception', titre: r.titre || '', detail: r.detail || '', recurrence: r.recurrence || 'quotidien',
    jourSemaine: r.jour_semaine == null ? null : Number(r.jour_semaine), jourMois: r.jour_mois == null ? null : Number(r.jour_mois),
    heure: r.heure ? String(r.heure).slice(0, 5) : '', actif: r.actif !== false, ordre: Number(r.ordre) || 0,
  };
}
export const mapTacheFaite = (r) => ({ id: r.id, tacheId: r.tache_id, jour: r.jour || '', faitPar: r.fait_par || null, at: r.at || null });
export const usePassations = (etabId, options = {}) => useTableHotel('passations', etabId, { map: mapPassation, order: [['jour', false], ['created_at', false]], limit: 3000, ...options });
export const usePassationLectures = (etabId, options = {}) => useTableHotel('passation_lectures', etabId, { map: mapLecture, limit: 20000, ...options });
export const useMessagesCanaux = (etabId, options = {}) => useTableHotel('canaux_messages', etabId, { map: mapMessageCanal, order: [['created_at', false]], limit: 3000, ...options });
export const useTachesRecurrentes = (etabId, options = {}) => useTableHotel('taches_recurrentes', etabId, { map: mapTacheRecurrente, order: [['ordre', true], ['titre', true]], limit: 1000, ...options });
export const useTachesFaites = (etabId, options = {}) => useTableHotel('taches_faites', etabId, { map: mapTacheFaite, order: [['jour', false]], limit: 20000, ...options });

// Une tâche récurrente tombe-t-elle ce jour (YYYY-MM-DD) ? Semaine ISO : lundi = 1.
export function tacheDueLe(t, jour) {
  if (!t.actif) return false;
  if (t.recurrence === 'quotidien') return true;
  const [y, m, d] = jour.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (t.recurrence === 'hebdomadaire') return ((date.getUTCDay() + 6) % 7) + 1 === t.jourSemaine;
  if (t.recurrence === 'mensuel') {
    const dernier = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return d === Math.min(t.jourMois, dernier);
  }
  return false;
}
export const libelleRecurrence = (t) => (t.recurrence === 'hebdomadaire' ? `${libelleDe(RECURRENCES, t.recurrence)}, ${libelleDe(JOURS_SEMAINE, t.jourSemaine).toLowerCase()}`
  : t.recurrence === 'mensuel' ? `${libelleDe(RECURRENCES, t.recurrence)}, le ${t.jourMois}` : libelleDe(RECURRENCES, t.recurrence));
// Passations non lues par une personne : celles des sept derniers jours qu'elle n'a pas marquées lues.
export function passationsNonLues(passations, lectures, userId, aujourdhui) {
  const depuis = zurichAjouterJours(aujourdhui, -7);
  const lues = new Set(lectures.filter((l) => l.userId === userId).map((l) => l.passationId));
  return passations.filter((p) => p.jour >= depuis && !lues.has(p.id) && p.createdBy !== userId);
}
