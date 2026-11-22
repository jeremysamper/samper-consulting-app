// Commande et marchandise de la démo (lot 4a, migration
// 20261122b_lot4a_commande_base). Une commande par fournisseur et par
// livraison (deux brouillons, une envoyée, une reçue avec un écart), les
// produits habituels, les besoins d'un groupe, des pertes reliées au catalogue
// et à la mise en place, une liste J+1, deux règles de correspondance de
// Ventes POS et quelques lignes d'ingrédient à relier.
// Le front déjà en ligne ne lit aucune table neuve ; les colonnes ajoutées aux
// tables qu'il lit (produits, pertes, mise en place, fiches) ne changent rien
// à ce qu'il affiche.
import { ETAB, aujourdhui, jour, jourSemaine, instant } from './base.js';
import { FOURNISSEURS, PRODUITS, PRODUIT } from './catalogue.js';
import { PLATS, PLAT_RECETTES } from './cuisine.js';
import { COMMANDE_CIBLES } from './reglages.js';

// ── Règles partagées avec les déclencheurs de la démo ───────────────────────

// Règle D3, copie de commande_quantite_arrondie (base) : stock cible moins
// reste (connu seulement avec les deux), plus les besoins des groupes, arrondi
// au conditionnement supérieur. Null tant que rien n'est connu.
export function quantiteArrondie(cible, reste, groupes, conditionnement) {
  const partStock = cible == null || reste == null ? null : Math.max(Number(cible) - Number(reste), 0);
  const partGroupes = Math.max(Number(groupes) || 0, 0);
  if (partStock == null && partGroupes === 0) return null;
  const besoin = (partStock || 0) + partGroupes;
  if (besoin <= 0) return 0;
  const c = Number(conditionnement);
  if (!(c > 0)) return besoin;
  return Math.round(Math.ceil(besoin / c - 1e-9) * c * 1e6) / 1e6;
}

// 1 = lundi à 7 = dimanche, comme isodow.
export const jourIso = (isoJour) => jourSemaine(isoJour) || 7;

// Heure limite posée par la base : la veille de la livraison (selon le délai
// du fournisseur), à son heure limite, heure de Zurich.
export function envoyerAvant(dateLivraison, fournisseur) {
  if (!fournisseur?.heure_limite) return null;
  return instant(jour(-(fournisseur.delai_commande_jours ?? 1), dateLivraison), String(fournisseur.heure_limite).slice(0, 5));
}

// Conditionnement de commande lu dans le libellé, dans l'unité de référence
// du produit (même lecture que le remplissage data-20261122-conditionnement-qte).
export function conditionnementQte(pr) {
  const m = String(pr.conditionnement || '').toLowerCase().replace(',', '.')
    .match(/(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g|l|dl|cl|ml|pièces|pièce|pieces|piece|pcs|pc|pce)(?![a-zà-ÿ])/);
  if (!m) return null;
  const n = (m[1] ? Number(m[1]) : 1) * Number(m[2]);
  const facteur = { kg: 1000, g: 1, l: 1000, dl: 100, cl: 10, ml: 1 }[m[3]] ?? 1;
  const famille = ['kg', 'g'].includes(m[3]) ? 'g' : ['l', 'dl', 'cl', 'ml'].includes(m[3]) ? 'ml' : 'pce';
  const unite = ['pcs', 'pce'].includes(pr.unite_ref) ? 'pce' : pr.unite_ref;
  return famille === unite ? n * facteur : null;
}

export const avecConditionnement = (pr) => ({ ...pr, conditionnement_qte: conditionnementQte(pr) });

// ── Commandes ────────────────────────────────────────────────────────────────

const FOURN = Object.fromEntries(FOURNISSEURS.map((f) => [f.id, f]));

// Prochaine livraison du fournisseur encore commandable : un de ses jours de
// livraison dont l'heure limite n'est pas passée.
function prochaineLivraison(fournisseurId) {
  const f = FOURN[fournisseurId];
  const jours = f?.jours_livraison || [1, 2, 3, 4, 5];
  const maintenant = new Date().toISOString();
  for (let d = 1; d < 15; d += 1) {
    const date = jour(d);
    if (jours.includes(jourIso(date)) && (envoyerAvant(date, f) || '9') > maintenant) return date;
  }
  return jour(1);
}

const cibleDe = (produitId, date) => COMMANDE_CIBLES.find((c) => c.produit_id === produitId && c.jour_livraison === jourIso(date))?.quantite ?? null;

const CMD = {
  primeurs: '00000000-0000-4000-8000-0000000005a1',
  boucherie: '00000000-0000-4000-8000-0000000005a2',
  laiterie: '00000000-0000-4000-8000-0000000005a3',
  pecherie: '00000000-0000-4000-8000-0000000005a4',
};
const DOC_RECEPTION = 'ach-cmd-pecherie';

function commande(id, fournisseurId, date, statut, extra = {}) {
  const f = FOURN[fournisseurId];
  return {
    id,
    etablissement_id: ETAB,
    fournisseur_id: fournisseurId,
    fournisseur_nom: f.nom,
    date_livraison: date,
    envoyer_avant: envoyerAvant(date, f),
    statut,
    perimetre: 'Général',
    note: null,
    envoyee_at: null,
    envoyee_par: null,
    envoi_canal: null,
    recue_at: null,
    recue_par: null,
    achat_document_id: null,
    created_by: 'demo-chef',
    created_at: instant(aujourdhui(), '08:30'),
    updated_at: instant(aujourdhui(), '08:30'),
    ...extra,
  };
}

let numLigne = 0;
// Ligne reprise du produit comme le fait la base à la création.
function ligne(commandeId, date, cle, valeurs = {}) {
  const pr = PRODUIT[cle];
  numLigne += 1;
  const l = {
    id: `00000000-0000-4000-8000-0000000006${String(numLigne).padStart(2, '0')}`,
    commande_id: commandeId,
    produit_id: pr.id,
    nom: pr.nom,
    unite: pr.unite_ref,
    conditionnement: conditionnementQte(pr),
    conditionnement_libelle: pr.conditionnement,
    stock_cible: cibleDe(pr.id, date),
    reste: null,
    besoin_groupes: 0,
    quantite: null,
    prix_unitaire: pr.prix_unitaire,
    reference_fourn: pr.reference_fourn,
    source: 'cible',
    ordre: numLigne,
    statut_reception: null,
    quantite_recue: null,
    montant_recu: null,
    lot: null,
    dlc: null,
    note_reception: null,
    recu_par: null,
    recu_at: null,
    created_at: instant(aujourdhui(), '08:30'),
    updated_at: instant(aujourdhui(), '08:30'),
    ...valeurs,
  };
  return { ...l, quantite_calculee: quantiteArrondie(l.stock_cible, l.reste, l.besoin_groupes, l.conditionnement) };
}

export function genererCommandes() {
  numLigne = 0;
  const dPrim = prochaineLivraison('f-primeurs');
  const dBouch = prochaineLivraison('f-boucherie');
  const dLait = prochaineLivraison('f-laiterie');
  const dPech = jour(-1);
  const recueA = instant(dPech, '08:40');

  const commandes = [
    commande(CMD.primeurs, 'f-primeurs', dPrim, 'brouillon'),
    commande(CMD.boucherie, 'f-boucherie', dBouch, 'envoyee', {
      envoyee_at: instant(aujourdhui(), '09:15'), envoyee_par: 'demo-chef', envoi_canal: 'gmail',
      note: 'Merci de livrer avant 9 h par l\'entrée de service.',
    }),
    commande(CMD.laiterie, 'f-laiterie', dLait, 'brouillon'),
    commande(CMD.pecherie, 'f-pecherie', dPech, 'recue', {
      created_at: instant(jour(-2), '10:00'), updated_at: recueA,
      envoyee_at: instant(jour(-2), '10:05'), envoyee_par: 'demo-chef', envoi_canal: 'gmail',
      recue_at: recueA, recue_par: 'demo-cuisinier', achat_document_id: DOC_RECEPTION,
    }),
  ];

  // Le groupe de 18 personnes (dans deux jours) : 150 g de filet par personne.
  const groupe = { id: 'ge-1', nb_pax: 18 };
  const lignes = [
    ligne(CMD.primeurs, dPrim, 'courge', { reste: 2500 }),
    ligne(CMD.primeurs, dPrim, 'pomme-de-terre'),
    ligne(CMD.primeurs, dPrim, 'oignon', { reste: 1500 }),
    ligne(CMD.primeurs, dPrim, 'herbes', { source: 'habituel', quantite: 300 }),
    ligne(CMD.boucherie, dBouch, 'boeuf-filet', { reste: 1500, besoin_groupes: groupe.nb_pax * 150 }),
    ligne(CMD.boucherie, dBouch, 'volaille-supreme', { reste: 800 }),
    ligne(CMD.boucherie, dBouch, 'boeuf-hache', { source: 'habituel', quantite: 2500 }),
    ligne(CMD.laiterie, dLait, 'beurre', { source: 'habituel', quantite: 2000 }),
    ligne(CMD.laiterie, dLait, 'creme', { source: 'habituel' }),
    ligne(CMD.pecherie, dPech, 'fera', {
      source: 'habituel', quantite: 4000, statut_reception: 'recu', quantite_recue: 4000, montant_recu: 224,
      lot: 'LE-2211', dlc: jour(3), recu_par: 'demo-cuisinier', recu_at: recueA,
    }),
    ligne(CMD.pecherie, dPech, 'truite', {
      source: 'habituel', quantite: 4000, statut_reception: 'ecart', quantite_recue: 2000, montant_recu: 84,
      lot: 'VS-0907', dlc: jour(2), note_reception: 'Une caissette sur deux livrée.', recu_par: 'demo-cuisinier', recu_at: recueA,
    }),
  ];

  const groupes = [{
    id: '00000000-0000-4000-8000-0000000007a1', commande_id: CMD.boucherie, groupe_evenement_id: groupe.id,
    fournisseur_id: 'f-boucherie', nb_pax: groupe.nb_pax, created_by: 'demo-chef', created_at: instant(aujourdhui(), '08:45'),
  }];

  // Bon de livraison créé par la réception (commande_receptionner).
  const recues = lignes.filter((l) => l.commande_id === CMD.pecherie);
  const achat = {
    id: DOC_RECEPTION, etablissement_id: ETAB, perimetre: 'Général', type_document: 'bon_livraison',
    fournisseur_nom: FOURN['f-pecherie'].nom, fournisseur_id: 'f-pecherie', numero: 'BL-58812', date_document: dPech,
    total_ht: recues.reduce((s, l) => s + l.montant_recu, 0),
    lignes: recues.map((l) => ({
      libelle: l.nom, produitId: l.produit_id, produitNom: l.nom, lien: 'manuel',
      quantite: l.conditionnement ? Math.round((l.quantite_recue / l.conditionnement) * 1000) / 1000 : l.quantite_recue,
      quantiteTotale: l.quantite_recue, uniteTotale: l.unite, montantLigne: l.montant_recu,
      referenceFourn: l.reference_fourn || '', conditionnement: l.conditionnement_libelle || '',
      issues: l.statut_reception === 'ecart' ? ['écart à la réception'] : [],
    })),
    exclu: false, source: 'commande', nom_fichier: null, created_at: recueA, created_by: 'demo-cuisinier', updated_at: recueA,
    total_ttc: null, date_echeance: null, regle_le: null, regle_mode: null, regle_note: null, tva_taux: null, montant_tva: null,
  };

  return { commandes, commande_lignes: lignes, commande_groupes: groupes, achat };
}

// Produits habituels : [fournisseur, clé du produit, quantité proposée sans cible].
const HABITUELS = [
  ['f-primeurs', 'courge'], ['f-primeurs', 'pomme-de-terre'], ['f-primeurs', 'oignon'], ['f-primeurs', 'echalote'],
  ['f-primeurs', 'herbes', 300], ['f-primeurs', 'mache', 1000],
  ['f-boucherie', 'boeuf-filet'], ['f-boucherie', 'volaille-supreme'], ['f-boucherie', 'boeuf-hache', 2500],
  ['f-laiterie', 'beurre', 2000], ['f-laiterie', 'creme', 6000],
  ['f-pecherie', 'fera', 4000], ['f-pecherie', 'truite', 4000],
];
export const COMMANDE_HABITUELS = HABITUELS.map(([fournisseur, cle, quantite], i) => ({
  id: `00000000-0000-4000-8000-0000000008${String(i).padStart(2, '0')}`,
  etablissement_id: ETAB,
  fournisseur_id: fournisseur,
  produit_id: PRODUIT[cle].id,
  ordre: HABITUELS.slice(0, i).filter(([f]) => f === fournisseur).length,
  quantite_defaut: quantite ?? null,
  updated_by: 'demo-chef',
  created_at: '2026-03-01T08:00:00Z',
  updated_at: '2026-03-01T08:00:00Z',
}));

// ── Pertes ───────────────────────────────────────────────────────────────────

const PRODUIT_PAR_NOM = Object.fromEntries(PRODUITS.map((pr) => [pr.nom, pr.id]));

// Colonnes du lot 4a sur les pertes de la démo, plus trois déclarations pour
// que les produits fréquents aient un ordre. La dernière perte (« Beurre
// blanc ») devient un « jeté » de la mise en place du soir.
export function pertesLot4a(pertes, mepItems) {
  const beurreBlanc = mepItems.find((i) => i.recette_id === 'r-beurre-blanc');
  const enrichies = pertes.map((p) => ({ produit_id: PRODUIT_PAR_NOM[p.produit] || null, recette_id: null, mep_item_id: null, source: 'saisie', ...p }));
  const derniere = enrichies.find((p) => p.produit === 'Beurre blanc');
  if (derniere && beurreBlanc) Object.assign(derniere, { recette_id: 'r-beurre-blanc', mep_item_id: beurreBlanc.id, source: 'mep' });
  const ajout = (id, d, cle, quantite, unite, valeur, motif, par) => ({
    id, etablissement_id: ETAB, date: jour(d), produit: PRODUIT[cle].nom, categorie: PRODUIT[cle].categorie, quantite, unite,
    valeur_unit: valeur, motif, declare_par: par, valide: true, valide_par: 'demo-chef', commentaire: null,
    created_at: instant(jour(d), '22:10'), updated_at: instant(jour(d), '22:10'),
    produit_id: PRODUIT[cle].id, recette_id: null, mep_item_id: null, source: 'frequent',
  });
  return enrichies.concat([
    ajout('pe-lot4a-1', -4, 'creme', 1, 'l', 7.2, 'DLC dépassée', 'demo-cuisinier'),
    ajout('pe-lot4a-2', -9, 'creme', 2, 'l', 7.2, 'DLC dépassée', 'demo-cuis-2'),
    ajout('pe-lot4a-3', -7, 'fera', 0.3, 'kg', 56, 'Erreur de préparation', 'demo-cuisinier'),
  ]);
}

// ── Mise en place ────────────────────────────────────────────────────────────

const MEP_J1 = '00000000-0000-4000-8000-0000000000f3';

// Colonnes du lot 4a sur les listes existantes, et la liste de demain
// pré-remplie par les ventes et la prévision (origine « prevision »).
export function mepLot4a(listes, items) {
  const demain = jour(1);
  const listesEnrichies = listes.map((l) => ({ poste: null, modele_id: null, origine: 'manuel', base_calcul: null, ...l }));
  const itemsEnrichis = items.map((i) => ({ quantite_suggeree: null, origine: 'manuel', ...i }));
  listesEnrichies.push({
    id: MEP_J1, etablissement_id: ETAB, nom: 'Mise en place de demain', date_service: demain, created_by: 'demo-chef',
    created_at: instant(aujourdhui(), '15:00'), poste: 'Chaud', modele_id: '00000000-0000-4000-8000-0000000002a1', origine: 'prevision',
    base_calcul: { jours_ventes: 14, jour_semaine: jourIso(demain), couverts_prevus: 42, couverts_reference: 35 },
  });
  [
    ['veloute-courge', 'Velouté de courge', 6, 'l', true],
    ['sauce-poivre', 'Sauce au poivre', 2, 'l', false],
    ['gratin', 'Gratin dauphinois', 3, 'plaques', false],
  ].forEach(([r, label, quantite, unite, congelable], i) => itemsEnrichis.push({
    id: `00000000-0000-4000-8000-0000000009${String(i).padStart(2, '0')}`, liste_id: MEP_J1, recette_id: 'r-' + r, label,
    quantite, unite, congelable, fait: false, fait_par: null, fait_at: null, ordre: i, created_at: instant(aujourdhui(), '15:00'),
    quantite_suggeree: quantite, origine: 'ventes',
  }));
  return { mep_listes: listesEnrichies, mep_items: itemsEnrichis };
}

// ── Ventes POS ───────────────────────────────────────────────────────────────

// Une règle « ignorer » pour les suppléments, une règle « relier » qui couvre
// l'un des deux articles encore à relier (le dernier plat de la carte).
export function reglesPos() {
  const plat = PLATS[PLATS.length - 1];
  const fiche = PLAT_RECETTES.find((l) => l.plat_id === plat.id && l.role === 'principal')?.recette_id || null;
  const regles = [{
    id: '00000000-0000-4000-8000-000000000aa1', etablissement_id: ETAB, motif: 'SUPPLEMENT', mode: 'commence', action: 'ignorer',
    recette_id: null, priorite: 10, actif: true, updated_by: 'demo-chef', created_at: '2026-06-03T08:00:00Z', updated_at: '2026-06-03T08:00:00Z',
  }];
  if (fiche) {
    regles.push({
      id: '00000000-0000-4000-8000-000000000aa2', etablissement_id: ETAB, motif: plat.nom.toUpperCase().slice(0, 32), mode: 'exact', action: 'relier',
      recette_id: fiche, priorite: 0, actif: true, updated_by: 'demo-chef', created_at: '2026-06-03T08:00:00Z', updated_at: '2026-06-03T08:00:00Z',
    });
  }
  return regles;
}

// ── Catalogue : lignes d'ingrédient à relier ────────────────────────────────

// Trois lignes « échalote » et deux lignes d'herbes saisies à la main, sans
// produit, avec leurs suggestions (même forme qu'en production :
// matchSuggestions [{ nom, produitId, confidence }], needsReview).
export function ingredientsARelier(recettes) {
  const graphies = { 'p-echalote': ['Échalote', 'échalotes', 'Echalotes ciselées'], 'p-herbes': ['Persil', 'Ciboulette fraîche'] };
  const vus = { 'p-echalote': 0, 'p-herbes': 0 };
  return recettes.map((r) => {
    let change = false;
    const ingredients = (r.ingredients || []).map((x) => {
      const liste = graphies[x.produitId];
      if (!liste || vus[x.produitId] >= liste.length) return x;
      const nom = liste[vus[x.produitId]];
      const pr = PRODUITS.find((p) => p.id === x.produitId);
      vus[x.produitId] += 1;
      change = true;
      const { produitId, ...reste } = x;
      return { ...reste, nom, needsReview: true, matchSuggestions: [{ nom: pr.nom, produitId, confidence: 80 }] };
    });
    return change ? { ...r, ingredients } : r;
  });
}
