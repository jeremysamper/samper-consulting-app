// ─────────────────────────────────────────────────────────────
// Helpers temps Europe/Zurich - indépendants du fuseau et de l'horloge du device.
//
// Le pointage « live » reste la source de vérité côté serveur : les RPC Supabase
// `pointer_arrivee` / `pointer_depart` posent l'heure via
// `now() AT TIME ZONE 'Europe/Zurich'`. Ces helpers servent uniquement côté UI à :
//   (a) déterminer le « jour » courant à Zurich (frontière de minuit correcte),
//   (b) afficher une heure optimiste le temps que le serveur confirme,
//   (c) colorer un libellé de ponctualité (en avance / à l'heure / en retard).
// Ils ne bloquent JAMAIS une action de pointage.
// ─────────────────────────────────────────────────────────────

const ZURICH_TZ = 'Europe/Zurich';

// Date du jour à Zurich au format YYYY-MM-DD (et non la date UTC du device).
// Corrige le cas des services du soir : après minuit à Zurich, le bon jour est pris
// en compte même si l'horloge UTC est encore la veille.
export function zurichToday() {
  // 'en-CA' produit nativement le format YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZURICH_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// Minutes écoulées depuis minuit à Zurich (de 0 à 1439), indépendamment du fuseau du device.
export function zurichNowMinutes() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZURICH_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const h = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
  return h * 60 + m;
}

// Heure courante à Zurich au format HH:MM - utilisée pour l'affichage optimiste
// avant la confirmation serveur (qui peut la corriger d'une minute près).
export function zurichClock() {
  const total = zurichNowMinutes();
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Indicateur visuel de ponctualité par rapport à l'heure de début prévue (heure Zurich).
// PUREMENT COSMÉTIQUE : ne conditionne jamais la disponibilité du bouton.
// Tolérance de ±30 min autour du début pour « à l'heure ».
export function punctualityVsStart(debut) {
  if (!debut) return null;
  const [dh, dm] = debut.split(':').map(Number);
  if (Number.isNaN(dh) || Number.isNaN(dm)) return null;
  const start = dh * 60 + dm;
  const diff = zurichNowMinutes() - start; // négatif = avant le début prévu
  if (diff < -30) return { key: 'avance', label: 'En avance' };
  if (diff <= 30) return { key: 'heure', label: "À l'heure" };
  return { key: 'retard', label: 'En retard' };
}

// ─────────────────────────────────────────────────────────────
// Semaines du lundi au lundi, à l'heure de Zurich (écrans hebdomadaires).
// ─────────────────────────────────────────────────────────────

// Décale une date YYYY-MM-DD de n jours (calcul de calendrier, sans fuseau).
export function zurichAjouterJours(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Lundi de la semaine d'une date YYYY-MM-DD (par défaut : aujourd'hui à Zurich).
export function zurichLundi(dateStr = zurichToday()) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const jour = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = dimanche
  return zurichAjouterJours(dateStr, -((jour + 6) % 7));
}

function partiesZurich(instant) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: ZURICH_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map((p) => [p.type, p.value]));
}

// Instant (ISO UTC) de minuit à Zurich pour une date YYYY-MM-DD : borne de
// requête sur un timestamptz. Deux passes absorbent l'heure d'été.
export function zurichMinuitIso(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const cible = Date.UTC(y, m - 1, d);
  let t = cible;
  for (let i = 0; i < 2; i += 1) {
    const p = partiesZurich(new Date(t));
    t += cible - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  }
  return new Date(t).toISOString();
}

// Jour (YYYY-MM-DD), date (JJ.MM.AAAA) et heure (HH:MM) à Zurich d'un horodatage.
export function zurichDateHeure(iso) {
  const p = partiesZurich(new Date(iso));
  return { jour: `${p.year}-${p.month}-${p.day}`, date: `${p.day}.${p.month}.${p.year}`, heure: `${p.hour}:${p.minute}` };
}
