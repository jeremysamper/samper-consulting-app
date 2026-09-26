import React from 'react';
import { dbService } from '../services/dbService.js';
import { readJson, writeJson } from '../utils/storage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Ordre des modules dans le menu, choisi par le consultant et partagé par TOUS
// les comptes (app_settings.nav_order : lecture pour tous, écriture consultant
// seulement par RLS). Valeur : JSON [{ id, group }] dans l'ordre d'affichage ;
// `group` permet aussi de ranger un module dans une autre rubrique.
//
// Un module ajouté au code après l'enregistrement de l'ordre n'y figure pas :
// il se place à la fin de sa rubrique par défaut, jamais masqué.
// Copie locale (sc_nav_order) : le menu s'affiche tout de suite dans le bon
// ordre au démarrage, avant la réponse de Supabase.
// ─────────────────────────────────────────────────────────────────────────────

const SETTING_KEY = 'nav_order';
const CACHE_KEY = 'sc_nav_order';

export function parseNavOrder(value) {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return null;
    const clean = parsed.filter((e) => e && typeof e.id === 'string');
    return clean.length ? clean : null;
  } catch {
    return null;
  }
}

export function applyNavOrder(items, order) {
  if (!order?.length) return items;
  const pos = new Map(order.map((e, i) => [e.id, i]));
  const groupOf = new Map(order.map((e) => [e.id, e.group]));
  const result = items
    .filter((item) => pos.has(item.id))
    .map((item) => ({ ...item, group: groupOf.get(item.id) || item.group }))
    .sort((a, b) => pos.get(a.id) - pos.get(b.id));
  items.filter((item) => !pos.has(item.id)).forEach((item) => {
    let at = -1;
    for (let k = result.length - 1; k >= 0; k -= 1) {
      if (result[k].group === item.group) { at = k; break; }
    }
    if (at === -1) result.push(item);
    else result.splice(at + 1, 0, item);
  });
  return result;
}

export function useNavOrder() {
  const [order, setOrder] = React.useState(() => parseNavOrder(readJson(CACHE_KEY, null)));

  React.useEffect(() => {
    let mounted = true;
    const db = dbService.getDb();
    if (!db?.getSetting) return undefined;
    db.getSetting(SETTING_KEY).then((value) => {
      if (!mounted) return;
      const parsed = parseNavOrder(value);
      setOrder(parsed);
      writeJson(CACHE_KEY, parsed);
    }).catch(() => { /* lecture en échec : on garde la copie locale */ });
    return () => { mounted = false; };
  }, []);

  const save = React.useCallback(async (nextOrder) => {
    const db = dbService.getDb();
    if (!db?.setSetting) throw new Error('Connexion indisponible');
    const clean = parseNavOrder(nextOrder);
    await db.setSetting(SETTING_KEY, clean ? JSON.stringify(clean) : '');
    setOrder(clean);
    writeJson(CACHE_KEY, clean);
  }, []);

  return { order, save };
}
