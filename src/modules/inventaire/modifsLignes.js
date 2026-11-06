// ─────────────────────────────────────────────────────────────────────────────
// Modification d'UNE ligne d'inventaire, sans React : la même règle que la RPC
// inventaire_modifier_ligne (migration 20261106b), appliquée sur l'appareil
// pour afficher tout de suite, puis rejouée par-dessus les données du serveur
// tant qu'elle attend le réseau (file hors-ligne).
//
// Opérations : 'ajout' (une fois), 'maj' (produit, categorie, unite, prixUnit,
// zone, zones ; null retire la clé ; les zones suivent avecZones), 'annuler_saisie'
// (sans effet si le produit a été recompté après le geste), 'suppression'.
// Rend une nouvelle liste ; écarts et valeurs sont recalculés par l'appelant.
// ─────────────────────────────────────────────────────────────────────────────

import { avecZones, sommeParZone } from './zones.js';

const CLES_MAJ = ['produit', 'categorie', 'unite', 'prixUnit'];

const apres = (a, b) => (a && b ? new Date(a).getTime() > new Date(b).getTime() : false);

export function appliquerModifLigne(lignes, { operation, ligneId, valeurs = {}, faitLe }) {
  const liste = lignes || [];
  const existe = liste.some(l => l.id === ligneId);
  if (operation === 'ajout') return existe ? liste : [...liste, { ...valeurs, id: ligneId }];
  if (!existe) return liste;
  if (operation === 'suppression') return liste.filter(l => l.id !== ligneId);
  return liste.map((l) => {
    if (l.id !== ligneId) return l;
    if (operation === 'maj') {
      let suite = { ...l };
      CLES_MAJ.filter(k => k in valeurs).forEach((k) => {
        if (valeurs[k] == null) delete suite[k];
        else suite[k] = valeurs[k];
      });
      if ('zones' in valeurs || 'zone' in valeurs) {
        const zones = Array.isArray(valeurs.zones) && valeurs.zones.length ? valeurs.zones : (valeurs.zone ? [valeurs.zone] : []);
        suite = avecZones(suite, zones);
      }
      return suite;
    }
    if (operation === 'annuler_saisie') {
      const zone = valeurs.zone || '';
      if (zone && l.parZone && l.parZone[zone]) {
        if (apres(l.parZone[zone].le, faitLe)) return l;
        const { [zone]: _retiree, ...reste } = l.parZone;
        return { ...l, parZone: reste, stockReel: sommeParZone(reste), compteLe: faitLe };
      }
      if (apres(l.compteLe, faitLe)) return l;
      const { parZone: _toutes, ...sansZones } = l;
      return { ...sansZones, stockReel: null, compteLe: faitLe };
    }
    return l;
  });
}

// Valeurs d'une ligne pour l'opération 'ajout' (l'id voyage à part).
export const valeursAjout = ({ id: _id, ...valeurs }) => valeurs;

// Valeurs d'un changement de zones : `zone` suit la première, `zones` n'est
// gardé que s'il y en a plusieurs.
export const valeursZones = (zones) => ({ zone: zones[0] || null, zones: zones.length > 1 ? zones : null });
