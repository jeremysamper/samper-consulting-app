// ─────────────────────────────────────────────────────────────────────────────
// Zones de stockage d'un inventaire (Chambre froide, Congélateur, Économat...).
//
// Une zone est portée par chaque ligne (champ `zone` du JSONB `lignes`) : pas
// de table, pas de migration. Elle sert à deux choses : compter une zone après
// l'autre, dans l'ordre où l'on fait le tour, et ventiler l'état d'inventaire
// (colonne « Zone » et synthèse par zone de l'export).
// ─────────────────────────────────────────────────────────────────────────────

// Proposées dans les listes ; librement complétées par établissement.
export const ZONES_SUGGEREES = ['Chambre froide', 'Congélateur', 'Économat', 'Cave', 'Bar', 'Réserve'];

export const SANS_ZONE = 'Sans zone';

export const zoneOf = (ligne) => String(ligne?.zone || '').trim();

// Zones présentes dans des lignes, dans l'ordre du tour : les zones connues
// d'abord (chambre froide avant congélateur avant économat), les autres ensuite
// par ordre alphabétique.
export const ordreZones = (zones) => {
  const rang = (z) => {
    const i = ZONES_SUGGEREES.indexOf(z);
    return i === -1 ? ZONES_SUGGEREES.length : i;
  };
  return Array.from(new Set(zones.filter(Boolean)))
    .sort((a, b) => rang(a) - rang(b) || a.localeCompare(b, 'fr'));
};

export const zonesDesLignes = (lignes) => ordreZones((lignes || []).map(zoneOf));

// Options d'une liste de choix : zones déjà utilisées, puis suggestions.
export const optionsZones = (lignes) => ordreZones([...zonesDesLignes(lignes), ...ZONES_SUGGEREES]);
