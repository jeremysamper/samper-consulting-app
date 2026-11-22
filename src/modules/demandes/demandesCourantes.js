// ─────────────────────────────────────────────────────────────────────────────
// Demandes courantes (plan 15, lot 6b) : règles pures, partagées par le
// formulaire « Nouvelle demande » et la section des réglages.
// ─────────────────────────────────────────────────────────────────────────────

// « 30 min », « 2 h », « 1 h 30 », « 2 j ».
export function delaiLisible(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return '';
  if (m % 1440 === 0) return `${m / 1440} j`;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const reste = m % 60;
  return reste ? `${h} h ${String(reste).padStart(2, '0')}` : `${h} h`;
}

// Échéance d'une demande courante : maintenant plus le délai, en ISO UTC.
export function echeanceDepuis(delaiMinutes, maintenantMs = Date.now()) {
  const m = Number(delaiMinutes);
  if (!Number.isFinite(m) || m <= 0) return null;
  return new Date(maintenantMs + m * 60000).toISOString();
}

// Les demandes courantes à montrer en tête du formulaire : celles du pôle de
// la personne d'abord, puis les autres, dans l'ordre de la maison.
export function trierCourantes(categories, poleDeLaPersonne) {
  const liste = Array.isArray(categories) ? categories : [];
  if (!poleDeLaPersonne) return liste;
  return [...liste.filter((c) => c.pole === poleDeLaPersonne), ...liste.filter((c) => c.pole !== poleDeLaPersonne)];
}
