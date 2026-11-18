import React from 'react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { normalizeName } from '../../services/recipeProductMatching.js';
import { toutesLesPages } from '../../utils/lirePages.js';
import { addDays, isoDate, parseLocalDate } from '../../utils/dateHelpers.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { effetsSurFiches } from '../catalogue/effetsHausseFiches.js';
import { ANCIENNETE_PRIX_JOURS, FENETRE_HAUSSES_JOURS } from './analysesAchats.js';
import { useHaussesPrix } from './haussesPrixDonnees.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hausses de prix pour le widget du tableau de bord : les MÊMES que l'écran
// « Hausses de prix » de Factures & achats (une seule source, les factures et
// les bons de livraison ; même seuil, même état « vu », par useHaussesPrix).
//   1. documents d'achat datés des FENETRE_HAUSSES_JOURS + ANCIENNETE_PRIX_JOURS
//      derniers jours : de quoi rendre les mêmes hausses que tout l'historique
//      (haussesPrix ne compare jamais à un prix de plus d'un an) ;
//   2. seuil et hausses vues (useHaussesPrix) ; seules les hausses à voir
//      sont rendues ;
//   3. s'il en reste : produits, fiches et alias du catalogue, pour relier
//      chaque hausse à un produit et donner son effet sur le coût matière
//      des fiches (effetsHausseFiches.js).
// Relier au catalogue, sans rapprochement flou : alias par numéro d'article
// (même fournisseur d'abord), alias par libellé, puis nom identique au
// produit. Sinon `produitId` null : l'effet n'est pas chiffré, et le dit.
// La garde est posée par l'appelant (`enabled`) : rien n'est lu sans elle.
// ─────────────────────────────────────────────────────────────────────────────

const UNITE_PRODUIT = { kg: 'kg', L: 'L', pièce: 'pcs' };
const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);

async function lireDocuments(etabId, depuis) {
  const db = dbService.getDb();
  if (!db?.mapAchatsDocumentFromDB) throw new Error('Lecture indisponible.');
  const { data, error } = await toutesLesPages((de, a) => supabase
    .from('achats_documents').select('*')
    .eq('etablissement_id', etabId).gte('date_document', depuis)
    .order('date_document').order('id').range(de, a));
  if (error) {
    if (RELATION_ABSENTE.has(String(error.code))) return [];
    throw error;
  }
  return (data || []).map((r) => db.mapAchatsDocumentFromDB(r));
}

async function lireAlias(refs, libelles) {
  const lire = async (colonne, valeurs) => {
    if (!valeurs.length) return [];
    const { data, error } = await supabase.from('produit_alias')
      .select('produit_id, fournisseur_id, libelle_norm, reference_fourn').in(colonne, valeurs);
    if (error) throw error;
    return data || [];
  };
  const [parRef, parLibelle] = await Promise.all([lire('reference_fourn', refs), lire('libelle_norm', libelles)]);
  return { parRef, parLibelle };
}

// Produit du catalogue d'une hausse, ou null. `ids` : produits de l'établissement.
export function produitDeHausse(h, { parRef, parLibelle }, produits) {
  const ids = new Set(produits.map((p) => p.id));
  if (h.reference) {
    const memeRef = parRef.filter((a) => a.reference_fourn === h.reference && ids.has(a.produit_id));
    const chezLui = memeRef.find((a) => h.fournisseurId && a.fournisseur_id === h.fournisseurId);
    if (chezLui) return chezLui.produit_id;
    const distincts = [...new Set(memeRef.map((a) => a.produit_id))];
    if (distincts.length === 1) return distincts[0];
  }
  const norm = normalizeName(h.libelle);
  const alias = norm ? [...new Set(parLibelle.filter((a) => a.libelle_norm === norm && ids.has(a.produit_id)).map((a) => a.produit_id))] : [];
  if (alias.length === 1) return alias[0];
  const nom = normalizeName(h.nom);
  const memeNom = nom ? produits.filter((p) => normalizeName(p.nom) === nom) : [];
  return memeNom.length === 1 ? memeNom[0].id : null;
}

async function lireEffets(etabId, hausses) {
  const db = dbService.getDb();
  if (!db?.listProduits || !db?.listRecettes) throw new Error('Lecture indisponible.');
  const produits = await db.listProduits(etabId, { strict: true }) || [];
  const refs = [...new Set(hausses.map((h) => h.reference).filter(Boolean))];
  const libelles = [...new Set(hausses.map((h) => normalizeName(h.libelle)).filter(Boolean))];
  const alias = await lireAlias(refs, libelles);
  const relies = hausses.map((h) => ({ h, produitId: produitDeHausse(h, alias, produits) }));
  const recettes = relies.some((x) => x.produitId) ? (await db.listRecettes(etabId, { strict: true }) || []) : [];
  const effets = new Map();
  relies.forEach(({ h, produitId }) => {
    if (!produitId) { effets.set(h.cle, { produitId: null, suitCatalogue: false, fiches: null }); return; }
    const e = effetsSurFiches({ produitId, unite: UNITE_PRODUIT[h.unite], ancien: h.prixAvant, nouveau: h.prix }, recettes, produits);
    effets.set(h.cle, { produitId, ...e });
  });
  return effets;
}

// { statut: 'absent' | 'chargement' | 'pret' | 'erreur', seuil, hausses }
// hausses : celles à voir, chacune avec { produitId, suitCatalogue, fiches }
// (fiches null : produit non relié ; absent tant que l'effet se lit).
export function useHaussesTableau({ etabId, userId, enabled }) {
  const aujourdhui = zurichToday();
  const debutLecture = React.useMemo(
    () => isoDate(addDays(parseLocalDate(aujourdhui), -(FENETRE_HAUSSES_JOURS + ANCIENNETE_PRIX_JOURS))),
    [aujourdhui],
  );
  const [docs, setDocs] = React.useState(null);
  const [erreur, setErreur] = React.useState(false);

  React.useEffect(() => {
    setDocs(null);
    setErreur(false);
    if (!enabled || !etabId) return undefined;
    let vivant = true;
    let lu = false;
    const relire = () => lireDocuments(etabId, debutLecture)
      .then((liste) => { if (vivant) { lu = true; setDocs(liste); setErreur(false); } })
      .catch((err) => {
        console.warn('[hausses de prix] documents', err);
        // Une relecture en échec garde les documents déjà lus.
        if (vivant && !lu) setErreur(true);
      });
    relire();
    const unsub = dbService.getRealtime()?.subscribeReload?.('achats_documents', relire);
    return () => { vivant = false; if (unsub) unsub(); };
  }, [etabId, enabled, debutLecture]);

  const h = useHaussesPrix(etabId, docs || [], userId, { actif: Boolean(enabled && etabId && docs) });

  const [effets, setEffets] = React.useState(() => new Map());
  // L'effet se relit quand la liste des hausses à voir change (`cles`), pas à
  // chaque rendu : la liste du moment est lue par référence.
  const aVoirRef = React.useRef(h.aVoir);
  aVoirRef.current = h.aVoir;
  // Rien tant que les hausses vues ne sont pas lues : la liste « à voir » du
  // chargement les compte encore toutes.
  const cles = h.etat === 'ready' ? h.aVoir.map((x) => x.cle).join('\n') : '';
  React.useEffect(() => {
    if (!enabled || !cles) { setEffets(new Map()); return undefined; }
    let vivant = true;
    lireEffets(etabId, aVoirRef.current)
      .then((m) => { if (vivant) setEffets(m); })
      .catch((err) => { console.warn('[hausses de prix] effet sur les fiches', err); });
    return () => { vivant = false; };
  }, [etabId, enabled, cles]);

  if (!enabled || !etabId) return { statut: 'absent', seuil: h.seuil, hausses: [] };
  if (erreur || h.etat === 'error') return { statut: 'erreur', seuil: h.seuil, hausses: [] };
  if (h.etat === 'absente') return { statut: 'absent', seuil: h.seuil, hausses: [] };
  if (!docs || h.etat === 'loading') return { statut: 'chargement', seuil: h.seuil, hausses: [] };
  return {
    statut: 'pret',
    seuil: h.seuil,
    hausses: h.aVoir.map((x) => ({ ...x, ...(effets.get(x.cle) || {}) })),
  };
}
