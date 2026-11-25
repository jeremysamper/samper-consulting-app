// ─────────────────────────────────────────────────────────────────────────────
// Formules à prix fixe de la caisse (lot 09 du panel, 25.11.2026).
//
// Une formule (table caisse_formules) est une liste d'étapes ordonnées :
// { nom, suite, plat_ids }. Posée sur un ticket par la RPC caisse_poser_formule,
// elle devient une ligne par plat choisi, reliées par formule_groupe, dont les
// prix répartis font exactement le prix de la formule. L'écran n'envoie que
// des identifiants : aucun prix ne vient de lui.
//
// Fonctions pures, testées par formules.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────

import { enRupture } from './rupture.js';

export const FORMULE_NOM_MAX = 40;
export const ETAPE_NOM_MAX = 30;
export const ETAPES_MAX = 6;
export const PRODUITS_ETAPE_MAX = 40;
export const FORMULES_ACTIVES_MAX = 30;
export const PRIX_FORMULE_MAX = 10000;

const texte = (v, max) => String(v ?? '').trim().slice(0, max);

// Répartition du prix (D3) : au prorata des bases, par total cumulé, en
// centimes entiers. Part de rang i = arrondi(prix x cumul_i / somme) moins le
// même arrondi au rang i - 1 : la somme fait toujours le prix et aucune part
// n'est négative. Bases toutes nulles : parts égales (poids de 1). Arrondi au
// demi supérieur, écrit en entiers, comme round() de Postgres.
export function repartirFormule(prixCentimes, basesCentimes) {
  const prix = Math.max(0, Math.round(Number(prixCentimes) || 0));
  const bases = (basesCentimes || []).map((b) => Math.max(0, Math.round(Number(b) || 0)));
  if (!bases.length) return [];
  let somme = bases.reduce((s, b) => s + b, 0);
  const poids = somme > 0 ? bases : bases.map(() => 1);
  if (somme === 0) somme = poids.length;
  const arrondi = (cumul) => Math.floor((2 * prix * cumul + somme) / (2 * somme));
  let cumul = 0;
  let avant = 0;
  return poids.map((p) => {
    cumul += p;
    const fin = arrondi(cumul);
    const part = fin - avant;
    avant = fin;
    return part;
  });
}

// Normalise une ligne de caisse_formules. Rend null si la formule n'est pas
// utilisable (nom vide, prix hors bornes, aucune étape valable). Une étape
// sans produit est écartée ; un mode hors de 1 à 9 est ramené à 1.
export function lireFormule(brut) {
  if (!brut || typeof brut !== 'object') return null;
  const nom = texte(brut.nom, FORMULE_NOM_MAX);
  const prix = Math.round(Number(brut.prix) * 100) / 100;
  if (!nom || !Number.isFinite(prix) || prix <= 0 || prix >= PRIX_FORMULE_MAX) return null;
  const etapes = (Array.isArray(brut.etapes) ? brut.etapes : [])
    .map((e) => {
      if (!e || typeof e !== 'object') return null;
      const nomEtape = texte(e.nom, ETAPE_NOM_MAX);
      const ids = [...new Set((Array.isArray(e.plat_ids) ? e.plat_ids : [])
        .filter((id) => typeof id === 'string' && id))].slice(0, PRODUITS_ETAPE_MAX);
      if (!nomEtape || !ids.length) return null;
      const suite = Number(e.suite);
      return { nom: nomEtape, suite: Number.isInteger(suite) && suite >= 1 && suite <= 9 ? suite : 1, platIds: ids };
    })
    .filter(Boolean)
    .slice(0, ETAPES_MAX);
  if (!etapes.length) return null;
  return {
    id: brut.id,
    nom,
    prix,
    etapes,
    actif: brut.actif !== false,
    archivee: brut.archivee === true,
    createdAt: brut.created_at || null,
  };
}

// Une formule déjà passée par lireFormule (ses étapes portent platIds).
const estLue = (f) => Array.isArray(f?.etapes) && f.etapes.length > 0
  && f.etapes.every((e) => Array.isArray(e?.platIds));

// Les formules proposées sur la grille : actives et non archivées, dans
// l'ordre reçu. Chaque étape est réduite aux produits en vente (présents dans
// articles), chacun avec son drapeau de rupture. Une formule dont une étape
// n'a plus aucun produit vendable est rendue indisponible.
export function formulesProposees({ formules, articles, boutons, jourZurich }) {
  const parId = new Map((articles || []).filter(Boolean).map((a) => [a.id, a]));
  return (formules || [])
    .map((f) => (estLue(f) ? f : lireFormule(f)))
    .filter((f) => f && f.actif && !f.archivee)
    .map((f) => {
      const etapes = f.etapes.map((e) => {
        const produits = e.platIds
          .map((id) => parId.get(id))
          .filter(Boolean)
          .map((article) => ({ article, rupture: enRupture(boutons?.[article.id], jourZurich) }));
        return { ...e, produits };
      });
      const indisponible = etapes.some((e) => !e.produits.some((p) => !p.rupture));
      return { ...f, etapes, indisponible };
    });
}

// Les lignes d'une quittance, regroupées par formule : un bloc
// { formule: true, groupe, nom, lignes, total } prend la place de la première
// ligne de son groupe, les autres lignes restent à leur place.
export function blocsQuittance(lignes) {
  const blocs = [];
  const parGroupe = new Map();
  (lignes || []).forEach((l) => {
    const g = l?.formule_groupe;
    if (!g) { blocs.push({ formule: false, ligne: l }); return; }
    let bloc = parGroupe.get(g);
    if (!bloc) {
      bloc = { formule: true, groupe: g, nom: l.formule_nom || 'Formule', lignes: [] };
      parGroupe.set(g, bloc);
      blocs.push(bloc);
    }
    bloc.lignes.push(l);
  });
  blocs.forEach((b) => {
    if (!b.formule) return;
    const c = b.lignes.reduce((s, l) => s + Math.round(Number(l.quantite) * Number(l.prix_unitaire) * 100), 0);
    b.total = c / 100;
  });
  return blocs;
}

// Une étape où un seul produit est vendable : il est déjà choisi.
export function choixInitiaux(formule) {
  return (formule?.etapes || []).map((e) => {
    const vendables = (e.produits || []).filter((p) => !p.rupture);
    return vendables.length === 1 ? vendables[0].article.id : null;
  });
}

// Le corps que l'écran envoie à caisse_formules : jamais l'auteur ni l'id.
export function corpsFormule({ nom, prix, etapes, actif = true, archivee = false }) {
  return {
    nom: texte(nom, FORMULE_NOM_MAX),
    prix: Math.round(Number(prix) * 100) / 100,
    etapes: (etapes || []).map((e) => ({
      nom: texte(e.nom, ETAPE_NOM_MAX),
      suite: Number(e.suite) || 1,
      plat_ids: [...new Set(e.platIds || e.plat_ids || [])].slice(0, PRODUITS_ETAPE_MAX),
    })),
    actif,
    archivee,
  };
}

// Ce qui manque à une formule en cours d'édition, ou null. Phrases au vous.
export function erreurFormule({ nom, prix, etapes }) {
  if (!String(nom || '').trim()) return 'Donnez un nom à la formule.';
  const p = Number(String(prix ?? '').replace(',', '.'));
  if (!Number.isFinite(p) || p <= 0 || p >= PRIX_FORMULE_MAX) return 'Indiquez un prix entre 0 et 10 000 francs.';
  if (!etapes?.length) return 'Ajoutez au moins une étape.';
  if (etapes.length > ETAPES_MAX) return 'Une formule compte six étapes au plus.';
  for (const e of etapes) {
    if (!String(e.nom || '').trim()) return 'Donnez un nom à chaque étape.';
    if (!(e.platIds || []).length) return 'Cochez au moins un produit par étape.';
  }
  return null;
}
