import React from 'react';
import { dbService } from '../services/dbService.js';
import { getDemoData } from '../data/demoData.js';
import { notifyLegacy, readLegacyStorage, writeLegacyStorage } from '../legacy/legacyApi.js';

// ─────────────────────────────────────────────────────────────────────────────
// useCartes — source unique pour la liste des cartes (menus) d'un établissement.
// Charge depuis Supabase + abonnement realtime ; repli localStorage en mode démo.
// Expose les opérations de gestion (ajout / renommage / suppression) partagées
// par « Cartes & Recettes » et « Fiches salle ».
//
// La suppression d'une carte n'efface AUCUN plat / recette / fiche : seules les
// liaisons carte_plats / carte_fiches_salle sont retirées (ON DELETE CASCADE).
// ─────────────────────────────────────────────────────────────────────────────

export function useCartes(etabId) {
  const legacySB = dbService.getBridge();
  const demoData = getDemoData();
  const [cartes, setCartes] = React.useState(() =>
    legacySB ? [] : (readLegacyStorage('sc_cartes', demoData.cartes) || []).filter(c => (c.etablissementId || 'etab-1') === etabId)
  );

  React.useEffect(() => {
    if (!legacySB) {
      setCartes((readLegacyStorage('sc_cartes', demoData.cartes) || []).filter(c => (c.etablissementId || 'etab-1') === etabId));
      return undefined;
    }
    let mounted = true;
    const reload = async () => {
      try { const c = await legacySB.db.listCartes(etabId); if (mounted) setCartes(Array.isArray(c) ? c : []); }
      catch (e) { /* le realtime relancera */ }
    };
    reload();
    const unsub = legacySB.realtime.subscribeReload('cartes', reload);
    return () => { mounted = false; unsub && unsub(); };
  }, [etabId, legacySB, demoData]);

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
        setCartes(prev => (prev.some(c => c.id === saved.id) ? prev : [...prev, saved]));
        return saved;
      } catch (err) { notifyLegacy('Erreur création de carte : ' + (err.message || err), 'error'); return null; }
    }
    const all = readLegacyStorage('sc_cartes', demoData.cartes) || [];
    all.push(carte);
    demoData.cartes = all;
    writeLegacyStorage('sc_cartes', all);
    setCartes(prev => [...prev, carte]);
    return carte;
  }, [etabId, legacySB, demoData]);

  // Renomme / met à jour les dates d'une carte existante.
  const renameCarte = React.useCallback(async (id, patch) => {
    const current = cartes.find(c => c.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    if (legacySB) {
      try {
        const saved = await legacySB.db.upsertCarte(next);
        setCartes(prev => prev.map(c => (c.id === id ? saved : c)));
      } catch (err) { notifyLegacy('Erreur mise à jour de carte : ' + (err.message || err), 'error'); }
      return;
    }
    const all = (readLegacyStorage('sc_cartes', demoData.cartes) || []).map(c => (c.id === id ? next : c));
    demoData.cartes = all;
    writeLegacyStorage('sc_cartes', all);
    setCartes(prev => prev.map(c => (c.id === id ? next : c)));
  }, [cartes, legacySB, demoData]);

  const deleteCarte = React.useCallback(async (id) => {
    if (legacySB) {
      try { await legacySB.db.deleteCarte(id); }
      catch (err) { notifyLegacy('Erreur suppression de carte : ' + (err.message || err), 'error'); return; }
    } else {
      const all = (readLegacyStorage('sc_cartes', demoData.cartes) || []).filter(c => c.id !== id);
      demoData.cartes = all;
      writeLegacyStorage('sc_cartes', all);
    }
    setCartes(prev => prev.filter(c => c.id !== id));
  }, [legacySB, demoData]);

  return { cartes, addCarte, renameCarte, deleteCarte };
}
