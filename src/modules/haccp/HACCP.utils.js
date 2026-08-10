// ═══════════════════════════════════════════════════════════════
// HACCP - Helpers de parsing et de conformité
// ═══════════════════════════════════════════════════════════════
// Source unique de vérité pour le calcul de conformité d'un relevé
// par rapport à la plage [min, max] d'une zone HACCP.
//
// Cas couverts :
//   - Virgules françaises ("-18,5" → -18.5)
//   - Caractère minus Unicode "−" (U+2212) issu de claviers/copier-coller
//   - Espaces parasites en début/fin de saisie
//   - Bornes inclusives (v >= min && v <= max)
//   - Auto-swap si une zone a min > max (erreur de saisie côté config)
// ═══════════════════════════════════════════════════════════════

// Parse robuste vers Number. Retourne NaN pour les entrées invalides.
// Utilise Number() (strict) plutôt que parseFloat() (qui tronque "12abc" en 12).
export function parseHaccpNumber(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  const normalized = String(value)
    .trim()
    .replace(/−/g, '-') // minus Unicode → minus ASCII
    .replace(',', '.');       // virgule française → point décimal
  if (normalized === '') return NaN;
  return Number(normalized);
}

// Détermine si une valeur est conforme à la plage de la zone HACCP.
// Retourne null si la valeur est non parsable, true si conforme, false sinon.
// Bornes incluses : min <= v <= max.
// Si la zone a min > max (saisie inversée par erreur), on swap silencieusement
// pour le calcul sans toucher la DB.
export function isReleveConforme(zone, valeur) {
  const v = parseHaccpNumber(valeur);
  if (Number.isNaN(v)) return null;

  const minRaw = zone?.min;
  const maxRaw = zone?.max;
  const hasMin = minRaw !== null && minRaw !== undefined && minRaw !== '';
  const hasMax = maxRaw !== null && maxRaw !== undefined && maxRaw !== '';

  let min = hasMin ? parseHaccpNumber(minRaw) : NaN;
  let max = hasMax ? parseHaccpNumber(maxRaw) : NaN;

  // Auto-swap si la zone a été configurée avec min > max
  if (!Number.isNaN(min) && !Number.isNaN(max) && min > max) {
    const tmp = min;
    min = max;
    max = tmp;
  }

  if (!Number.isNaN(min) && v < min) return false;
  if (!Number.isNaN(max) && v > max) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════
// Créneaux de relevé - rattachement d'une heure à une tournée
// ═══════════════════════════════════════════════════════════════

// 'HH:MM' → minutes depuis minuit. Retourne null si l'entrée est inexploitable.
// Tolère 'HH:MM:SS' (format renvoyé par Postgres pour un `time`).
export function heureEnMinutes(heure) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(heure || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Créneau dont l'heure prévue est la plus proche d'une heure donnée.
// Sert à deux choses : proposer le bon créneau par défaut au moment de la
// saisie, et rattacher a posteriori un relevé à une tournée pour le suivi
// « fait / à faire » du jour.
//
// Rattachement au plus proche SANS fenêtre de tolérance : un relevé pris à
// 09:40 alors que les créneaux sont 07:00 et 18:00 compte pour la tournée du
// matin. Une fenêtre stricte laisserait des relevés orphelins et afficherait
// « 0 zone relevée » sur une tournée pourtant faite — pire que le décalage.
//
// Le rattachement est purement indicatif : l'heure réellement enregistrée sur
// le relevé n'est jamais réécrite.
export function creneauLePlusProche(creneaux, heure) {
  const cible = heureEnMinutes(heure);
  if (cible == null || !Array.isArray(creneaux) || creneaux.length === 0) return null;
  let best = null;
  let bestDist = Infinity;
  for (const c of creneaux) {
    const m = heureEnMinutes(c?.heure);
    if (m == null) continue;
    const dist = Math.abs(m - cible);
    if (dist < bestDist) { best = c; bestDist = dist; }
  }
  return best;
}

// Tri d'affichage des créneaux : chronologique, comme la journée se déroule.
export function trierCreneaux(creneaux) {
  return (creneaux || []).slice().sort((a, b) =>
    (heureEnMinutes(a.heure) ?? 0) - (heureEnMinutes(b.heure) ?? 0));
}
