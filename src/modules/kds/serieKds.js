// ─────────────────────────────────────────────────────────────────────────────
// Commandes passées par l'écran de cuisine, par tranche, sans React ni service
// (testé par node --test, serieKds.test.mjs), pour le module Statistiques.
// L'écran du passe ne garde aucun chiffre dans le temps : la série compte les
// commandes terminées (completedAt) au jour de Zurich de leur fin, et leur
// durée de l'ouverture du ticket à la fin, la mesure du minuteur d'un bon
// (bons.js : un bon part de l'ouverture de sa commande).
//   orders : [{ openedAt, completedAt }] (mapKdsOrderFromDB)
// ─────────────────────────────────────────────────────────────────────────────

import { zurichDateHeure } from '../../utils/zurichTime.js';

const ms = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : null; };

export function serieKds(orders, tranches) {
  const finies = (orders || []).filter((o) => ms(o?.completedAt) != null)
    .map((o) => {
      const debut = ms(o.openedAt);
      const fin = ms(o.completedAt);
      return { jour: zurichDateHeure(o.completedAt).jour, minutes: debut != null && fin >= debut ? (fin - debut) / 60000 : null };
    });
  return (tranches || []).map((t) => {
    const dedans = finies.filter((o) => o.jour >= t.debut && o.jour <= t.fin);
    const durees = dedans.filter((o) => o.minutes != null);
    return {
      debut: t.debut,
      fin: t.fin,
      vide: dedans.length === 0,
      terminees: dedans.length,
      minutesTotal: durees.reduce((s, o) => s + o.minutes, 0),
      nbDurees: durees.length,
      dureeMoyenne: durees.length ? durees.reduce((s, o) => s + o.minutes, 0) / durees.length : null,
    };
  });
}
