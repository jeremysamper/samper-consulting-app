// ─────────────────────────────────────────────────────────────────────────────
// Plan d'occupation des chambres (lot 16 du panel) : fonctions pures, sans
// React et sans hotelData.js (qui lit Supabase à son chargement), testées sous
// Node. Une colonne est une nuit : un séjour du 3 au 5 occupe les nuits du 3 et
// du 4, la case du 5 est libre (même règle que le déclencheur
// sejours_sans_chevauchement et que nuiteesCommunes). Le plan affiche : la
// fenêtre de séjour et la base décident de toute écriture.
// La date du jour est toujours passée (date de Zurich) : rien ici ne lit l'heure.
// ─────────────────────────────────────────────────────────────────────────────

import { zurichAjouterJours } from '../../utils/zurichTime.js';

export const NB_NUITS = 14;
export const PAS = 7;

export function nuitsDuPlan(debut, n = NB_NUITS) {
  return Array.from({ length: n }, (_, i) => zurichAjouterJours(debut, i));
}

// Prévu et en maison : visibles. Parti : visible sur ses nuits d'avant
// aujourd'hui seulement (un départ anticipé libère la chambre). Annulé et
// no-show : jamais.
export function sejourVisible(sejour, aujourdhui) {
  if (!sejour) return false;
  if (sejour.statut === 'prevu' || sejour.statut === 'en_maison') return true;
  if (sejour.statut === 'parti') return !!sejour.arrivee && sejour.arrivee < aujourdhui;
  return false;
}

// Nuits réellement occupées par un séjour visible : [arrivee, depart[, un
// séjour parti borné à aujourd'hui (sa dernière nuit est la veille).
function bornes(sejour, aujourdhui) {
  if (!sejourVisible(sejour, aujourdhui) || !sejour.arrivee || !sejour.depart) return null;
  const fin = sejour.statut === 'parti' && sejour.depart > aujourdhui ? aujourdhui : sejour.depart;
  return fin > sejour.arrivee ? { a: sejour.arrivee, d: fin } : null;
}

const horsService = (c) => c.statutMenage === 'hors_service';
const parArrivee = (x, y) => String(x.arrivee).localeCompare(String(y.arrivee))
  || String(x.nomHote || '').localeCompare(String(y.nomHote || ''), 'fr')
  || String(x.id || '').localeCompare(String(y.id || ''));

export function lignesDuPlan({ chambres = [], sejours = [], debut, n = NB_NUITS, aujourdhui }) {
  const nuits = nuitsDuPlan(debut, n);
  const finFenetre = zurichAjouterJours(debut, n);
  // Séjours visibles qui touchent la fenêtre, par chambre.
  const parChambre = new Map();
  for (const s of sejours) {
    if (!s || !s.chambreId) continue;
    const b = bornes(s, aujourdhui);
    if (!b || !(b.a < finFenetre && debut < b.d)) continue;
    if (!parChambre.has(s.chambreId)) parChambre.set(s.chambreId, []);
    parChambre.get(s.chambreId).push({ s, ...b });
  }

  const lignes = [];
  for (const chambre of chambres) {
    const siens = (parChambre.get(chambre.id) || []).sort((x, y) => parArrivee(x.s, y.s));
    if (!chambre.actif && !siens.length) continue;
    // Le premier par date d'arrivée garde une nuit disputée ; l'autre est
    // raccourci (cas qu'empêche le déclencheur, mais possible sur des données
    // d'avant lui).
    const occ = new Array(n).fill(null);
    for (const o of siens) {
      for (let i = 0; i < n; i += 1) {
        if (nuits[i] >= o.a && nuits[i] < o.d && !occ[i]) occ[i] = o;
      }
    }
    const cellules = [];
    let i = 0;
    while (i < n) {
      const o = occ[i];
      if (!o) {
        cellules.push({ type: 'libre', nuit: nuits[i], passee: nuits[i] < aujourdhui });
        i += 1;
        continue;
      }
      let j = i;
      while (j < n && occ[j] === o) j += 1;
      cellules.push({
        type: 'sejour',
        sejour: o.s,
        largeur: j - i,
        coupeAvant: i === 0 && o.a < debut,
        coupeApres: j === n && o.d > finFenetre,
      });
      i = j;
    }
    lignes.push({ chambre, horsService: horsService(chambre), cellules });
  }
  return lignes;
}

// Pour chaque nuit : les chambres actives, hors service exclues, dont la case
// est libre dans lignesDuPlan. Même calcul que les barres : le pied et la
// grille ne se contredisent jamais.
export function libresParNuit({ chambres = [], sejours = [], debut, n = NB_NUITS, aujourdhui }) {
  const compte = new Array(n).fill(0);
  for (const ligne of lignesDuPlan({ chambres, sejours, debut, n, aujourdhui })) {
    if (!ligne.chambre.actif || ligne.horsService) continue;
    let i = 0;
    for (const c of ligne.cellules) {
      if (c.type === 'libre') { compte[i] += 1; i += 1; } else i += c.largeur;
    }
  }
  return compte;
}

// Séjours prévus ou en maison qui touchent la fenêtre sans chambre connue.
export function sansChambre({ chambres = [], sejours = [], debut, n = NB_NUITS }) {
  const ids = new Set(chambres.map((c) => c.id));
  const finFenetre = zurichAjouterJours(debut, n);
  return sejours
    .filter((s) => s && (s.statut === 'prevu' || s.statut === 'en_maison')
      && s.arrivee < finFenetre && debut < s.depart
      && (!s.chambreId || !ids.has(s.chambreId)))
    .sort(parArrivee);
}
