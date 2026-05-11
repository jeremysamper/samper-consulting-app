// ═══════════════════════════════════════════════════════════════
// HACCP — Helpers de parsing et de conformité
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
