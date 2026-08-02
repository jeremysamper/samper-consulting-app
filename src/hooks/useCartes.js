import React from 'react';
import { dbService } from '../services/dbService.js';
import { getDemoData } from '../data/demoData.js';
import { notifyLegacy, readLegacyStorage, writeLegacyStorage } from '../legacy/legacyApi.js';
import { useResumeRefresh } from './useResumeRefresh.js';

// ─────────────────────────────────────────────────────────────────────────────
// useCartes - source unique pour la liste des cartes (menus) d'un établissement.
// Charge depuis Supabase + abonnement realtime ; repli localStorage en mode démo.
// Expose les opérations de gestion (ajout / renommage / archivage / suppression)
// partagées par « Cartes & Recettes » et « Fiches salle ».
//
// `cartes` ne contient que les cartes actives ; les archivées sont dans
// `archivedCartes` (restaurables via archiveCarte(id, false)). L'archivage ne
// touche à aucune liaison carte_plats / carte_fiches_salle.
//
// La suppression d'une carte n'efface AUCUN plat / recette / fiche : seules les
// liaisons carte_plats / carte_fiches_salle sont retirées (ON DELETE CASCADE).
//
// Robustesse au réveil (tablette en veille, absence prolongée) : une lecture en
// échec (réseau coupé, JWT expiré) ne vide JAMAIS la liste, elle laisse la
// dernière version connue à l'écran et reprogramme un essai. `status` dit si on
// détient des données fiables ; l'UI ne doit annoncer « Aucune carte » que sur
// status === 'ready'. Sans ça un simple 401 au réveil affichait un
// établissement vide alors que ses cartes étaient bien en base.
// ─────────────────────────────────────────────────────────────────────────────

const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;

export function useCartes(etabId) {
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const [allCartes, setAllCartes] = React.useState(() =>
    legacySB ? [] : (readLegacyStorage('sc_cartes', demoData.cartes) || []).filter(c => (c.etablissementId || 'etab-1') === etabId)
  );
  // 'loading' : aucune lecture n'a encore abouti · 'ready' : on détient des
  // données valides · 'error' : la première lecture a échoué (rien à afficher).
  const [status, setStatus] = React.useState(() => (legacySB ? 'loading' : 'ready'));
  // Rechargement de l'effet courant, exposé aux appelants (bouton « Réessayer »).
  const reloadRef = React.useRef(null);

  React.useEffect(() => {
    if (!legacySB) {
      setAllCartes((readLegacyStorage('sc_cartes', demoData.cartes) || []).filter(c => (c.etablissementId || 'etab-1') === etabId));
      setStatus('ready');
      return undefined;
    }
    let mounted = true;
    let retryTimer = null;
    let retryDelay = RETRY_MIN_MS;
    let loadedOnce = false;

    const reload = async () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      try {
        const c = await legacySB.db.listCartes(etabId, { strict: true });
        if (!mounted) return;
        setAllCartes(Array.isArray(c) ? c : []);
        loadedOnce = true;
        retryDelay = RETRY_MIN_MS;
        setStatus('ready');
      } catch (e) {
        if (!mounted) return;
        // Échec : on conserve la liste affichée et on réessaie, en doublant
        // l'attente. Le retry est programmé même onglet caché : au réveil d'une
        // tablette l'appareil peut se déclarer « hidden » au moment précis de
        // l'échec, et attendre un prochain événement de visibilité qui ne
        // viendra pas laisserait justement l'écran vide. Les navigateurs
        // bridant déjà les timers en arrière-plan, le coût reste nul.
        if (!loadedOnce) setStatus('error');
        retryTimer = setTimeout(reload, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
      }
    };

    reloadRef.current = reload;
    // Changement d'établissement : on repart d'un état « en cours », sinon un
    // échec de lecture sur le nouvel établissement passerait pour un vide fiable.
    setStatus('loading');
    reload();
    const unsub = legacySB.realtime.subscribeReload('cartes', reload);
    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (reloadRef.current === reload) reloadRef.current = null;
      unsub && unsub();
    };
  }, [etabId, legacySB, demoData]);

  const reload = React.useCallback(() => { reloadRef.current && reloadRef.current(); }, []);
  // Réveil de la tablette / retour d'onglet / retour du réseau : le canal
  // realtime a pu mourir pendant la veille, on refait une lecture.
  useResumeRefresh(reload);

  const cartes = React.useMemo(() => allCartes.filter(c => !c.archive), [allCartes]);
  const archivedCartes = React.useMemo(() => allCartes.filter(c => c.archive === true), [allCartes]);

  // Crée une nouvelle carte ; renvoie la carte créée (ou null en cas d'échec).
  const addCarte = React.useCallback(async (nom) => {
    const cleanNom = String(nom || '').trim() || 'Nouvelle carte';
    const carte = {
      id: 'carte-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      etablissementId: etabId,
      nom: cleanNom,
      dateDebut: null,
      dateFin: null,
      plats: [],
    };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertCarte(carte);
        setAllCartes(prev => (prev.some(c => c.id === saved.id) ? prev : [...prev, saved]));
        // L'écriture a abouti : la liste à l'écran est de nouveau fiable, même
        // si la dernière lecture avait échoué (réseau revenu entre-temps).
        setStatus('ready');
        return saved;
      } catch (err) { notifyLegacy('Erreur création de carte : ' + (err.message || err), 'error'); return null; }
    }
    const all = readLegacyStorage('sc_cartes', demoData.cartes) || [];
    all.push(carte);
    demoData.cartes = all;
    writeLegacyStorage('sc_cartes', all);
    setAllCartes(prev => [...prev, carte]);
    return carte;
  }, [etabId, legacySB, demoData]);

  // Renomme / met à jour les dates d'une carte existante.
  const renameCarte = React.useCallback(async (id, patch) => {
    const current = allCartes.find(c => c.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertCarte(next);
        setAllCartes(prev => prev.map(c => (c.id === id ? saved : c)));
      } catch (err) { notifyLegacy('Erreur mise à jour de carte : ' + (err.message || err), 'error'); }
      return;
    }
    const all = (readLegacyStorage('sc_cartes', demoData.cartes) || []).map(c => (c.id === id ? next : c));
    demoData.cartes = all;
    writeLegacyStorage('sc_cartes', all);
    setAllCartes(prev => prev.map(c => (c.id === id ? next : c)));
  }, [allCartes, legacySB, demoData]);

  // Archive (archived=true) ou restaure (archived=false) une carte.
  // Aucun plat / recette / fiche n'est touché : la carte sort simplement des
  // onglets. Renvoie false si l'écriture a échoué (l'appelant garde alors l'onglet).
  const archiveCarte = React.useCallback(async (id, archived) => {
    const flag = archived !== false;
    if (legacySB) {
      try { await legacySB.db.setCarteArchive(id, flag); }
      catch (err) { notifyLegacy('Erreur archivage de carte : ' + (err.message || err), 'error'); return false; }
    } else {
      const all = (readLegacyStorage('sc_cartes', demoData.cartes) || []).map(c => (c.id === id ? { ...c, archive: flag } : c));
      demoData.cartes = all;
      writeLegacyStorage('sc_cartes', all);
    }
    setAllCartes(prev => prev.map(c => (c.id === id ? { ...c, archive: flag } : c)));
    notifyLegacy(flag ? 'Carte archivée. Retrouvez-la via le bouton « Archives ».' : 'Carte restaurée.', 'success');
    return true;
  }, [legacySB, demoData]);

  const deleteCarte = React.useCallback(async (id) => {
    if (legacySB) {
      try { await legacySB.db.deleteCarte(id); }
      catch (err) { notifyLegacy('Erreur suppression de carte : ' + (err.message || err), 'error'); return; }
    } else {
      const all = (readLegacyStorage('sc_cartes', demoData.cartes) || []).filter(c => c.id !== id);
      demoData.cartes = all;
      writeLegacyStorage('sc_cartes', all);
    }
    setAllCartes(prev => prev.filter(c => c.id !== id));
  }, [legacySB, demoData]);

  return { cartes, archivedCartes, status, reload, addCarte, renameCarte, archiveCarte, deleteCarte };
}
