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
// Cartes cachées (colonne `cartes.masquee`, migration 20260825) : une carte
// masquée n'est servie qu'au rôle `consultant`. Le filtrage se fait ICI, dans la
// source unique, pour qu'aucun appelant ne puisse l'oublier - et il est
// fail-closed : `useCartes(etabId)` sans rôle explicite masque les cartes
// cachées. Le rôle se passe en option : `useCartes(etabId, { role: user.role })`.
// Masquer n'est pas archiver : la carte reste vivante et éditable pour le
// consultant, elle disparaît simplement de la vue de la brigade.
//
// L'ordre des onglets (colonne `cartes.ordre`, migration 20260805) est une
// donnée d'établissement partagée par toute la brigade, pas une préférence
// utilisateur : `reorderCartes` l'écrit pour tout le monde. Tant que la
// migration n'est pas appliquée, la liste retombe sur l'ordre de création et
// seul `reorderCartes` échoue - avec un message explicite.
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

export function useCartes(etabId, { role } = {}) {
  const legacySB = dbService.getBridge();
  const voitCartesMasquees = role === 'consultant';
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

  // Cartes cachées : retirées des DEUX listes pour les non-consultants, sinon
  // une carte masquée puis archivée réapparaîtrait dans la modale « Archives ».
  const visibles = React.useMemo(
    () => (voitCartesMasquees ? allCartes : allCartes.filter(c => c.masquee !== true)),
    [allCartes, voitCartesMasquees],
  );
  const cartes = React.useMemo(() => visibles.filter(c => !c.archive), [visibles]);
  const archivedCartes = React.useMemo(() => visibles.filter(c => c.archive === true), [visibles]);

  // Rang d'affichage à donner à une carte créée : juste après la dernière.
  // Renvoie undefined si AUCUNE carte ne porte de rang, c'est-à-dire tant que
  // la migration 20260805 n'est pas appliquée - upsertCarte n'enverra alors pas
  // la colonne et la création continue de fonctionner.
  const prochainOrdre = React.useCallback(() => {
    const rangs = allCartes.map(c => c.ordre).filter(n => Number.isFinite(n));
    return rangs.length ? Math.max(...rangs) + 1 : undefined;
  }, [allCartes]);

  // Crée une nouvelle carte ; renvoie la carte créée (ou null en cas d'échec).
  const addCarte = React.useCallback(async (nom) => {
    const cleanNom = String(nom || '').trim() || 'Nouvelle carte';
    const ordre = prochainOrdre();
    const carte = {
      id: 'carte-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      etablissementId: etabId,
      nom: cleanNom,
      dateDebut: null,
      dateFin: null,
      plats: [],
      // Une carte créée se pose à DROITE des existantes, jamais devant elles.
      ...(ordre !== undefined ? { ordre } : {}),
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
  }, [etabId, legacySB, demoData, prochainOrdre]);

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

  // Cache (masked=true) ou réaffiche (masked=false) une carte : elle sort des
  // onglets de tous les rôles sauf consultant. Rien n'est supprimé ni délié - la
  // carte reste complète et le consultant continue de la voir et de l'éditer.
  // Renvoie false si l'écriture a échoué (l'appelant garde alors l'état courant).
  const masquerCarte = React.useCallback(async (id, masked) => {
    const flag = masked !== false;
    if (legacySB) {
      try { await legacySB.db.setCarteMasquee(id, flag); }
      catch (err) {
        // 42703 / PGRST204 = colonne `masquee` absente : migration 20260825 pas
        // encore appliquée. Message lisible plutôt qu'un code SQL brut.
        const colonneAbsente = err?.code === '42703' || err?.code === 'PGRST204';
        notifyLegacy(
          colonneAbsente
            ? 'Masquage de carte indisponible : la mise à jour de la base n\'a pas encore été appliquée.'
            : 'Erreur masquage de carte : ' + (err.message || err),
          'error',
        );
        return false;
      }
    } else {
      const all = (readLegacyStorage('sc_cartes', demoData.cartes) || []).map(c => (c.id === id ? { ...c, masquee: flag } : c));
      demoData.cartes = all;
      writeLegacyStorage('sc_cartes', all);
    }
    setAllCartes(prev => prev.map(c => (c.id === id ? { ...c, masquee: flag } : c)));
    notifyLegacy(
      flag
        ? 'Carte cachée : seul le consultant la voit désormais.'
        : 'Carte de nouveau visible par toute l\'équipe.',
      'success',
    );
    return true;
  }, [legacySB, demoData]);

  // Réordonne les onglets. `orderedIds` = les cartes ACTIVES dans leur nouvel
  // ordre, de gauche à droite. Renvoie true si l'ordre est bien enregistré.
  //
  // Optimiste puis rollback : la barre d'onglets doit bouger sous le doigt,
  // mais un échec d'écriture (migration non appliquée, réseau coupé) ne doit
  // pas laisser à l'écran un ordre que la base ignore - au prochain rechargement
  // les onglets sauteraient en place sans explication.
  const reorderCartes = React.useCallback(async (orderedIds) => {
    const ids = (orderedIds || []).filter(Boolean);
    if (ids.length < 2) return false;
    const rangs = new Map(ids.map((id, i) => [id, i + 1]));
    const avant = allCartes;
    const applique = (list) => list.map(c => (rangs.has(c.id) ? { ...c, ordre: rangs.get(c.id) } : c));
    setAllCartes(prev => applique(prev));

    if (!legacySB) {
      const all = applique(readLegacyStorage('sc_cartes', demoData.cartes) || []);
      demoData.cartes = all;
      writeLegacyStorage('sc_cartes', all);
      return true;
    }
    try {
      await legacySB.db.setCartesOrdre(ids);
      notifyLegacy('Ordre des cartes enregistré.', 'success');
      return true;
    } catch (err) {
      setAllCartes(avant);
      // 42703 / PGRST204 = colonne `ordre` absente : la migration 20260805 n'a
      // pas encore été appliquée. Message explicite plutôt qu'un code SQL brut.
      const colonneAbsente = err?.code === '42703' || err?.code === 'PGRST204';
      notifyLegacy(
        colonneAbsente
          ? 'Ordre des cartes indisponible : la mise à jour de la base n\'a pas encore été appliquée.'
          : 'Erreur enregistrement de l\'ordre : ' + (err.message || err),
        'error',
      );
      return false;
    }
  }, [allCartes, legacySB, demoData]);

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

  return { cartes, archivedCartes, status, reload, addCarte, renameCarte, archiveCarte, masquerCarte, deleteCarte, reorderCartes };
}
