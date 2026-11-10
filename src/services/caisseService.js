import { supabase } from './supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Caisse v1 : tickets, lignes, paiements (migration 20261105_caisse_v1).
//
// Toutes les lectures renvoient { data, error } et JAMAIS un tableau vide en
// cas d'échec : un service sans ticket et un service qu'on n'a pas réussi à
// lire ne se ressemblent pas à l'écran. Les écritures renvoient { data, error }
// ou { error } ; l'erreur est un message affichable.
//
// Les bons partent vers le KDS par la RPC caisse_envoyer_bon UNIQUEMENT :
// le client n'écrit jamais kds_orders / kds_order_items lui-même.
// ─────────────────────────────────────────────────────────────────────────────

const MESSAGES = {
  '42501': "Vous n'avez pas les droits pour cette action.",
  '23514': 'Valeur hors limites (quantité, prix ou suite invalide).',
  '23503': 'Ticket ou article introuvable.',
  '23505': 'Ce nom existe déjà.',
};

function mapError(error, fallback) {
  if (!error) return null;
  console.error('[caisseService]', error);
  const code = String(error.code || '');
  if (MESSAGES[code]) return MESSAGES[code];
  // Les gardes de la base (déclencheurs caisse_*) lèvent des messages en
  // français déjà lisibles : les montrer tels quels.
  if (/^caisse/.test(String(error.message || ''))) return error.message;
  return fallback || 'Erreur technique. Réessayez.';
}

// Tickets ouverts de l'établissement, avec leurs lignes.
export async function listTicketsOuverts(etablissementId) {
  const { data, error } = await supabase
    .from('caisse_tickets')
    .select('*, caisse_lignes(*)')
    .eq('etablissement_id', etablissementId)
    .eq('statut', 'ouvert')
    .order('created_at', { ascending: true });
  if (error) return { data: null, error: mapError(error, 'Tickets illisibles. Réessayez.') };
  const tickets = (data || []).map((t) => ({
    ...t,
    lignes: [...(t.caisse_lignes || [])].sort((a, b) =>
      (a.suite - b.suite) || String(a.created_at).localeCompare(String(b.created_at))),
  }));
  return { data: tickets, error: null };
}

export async function creerTicket(etablissementId, tableId) {
  const { data, error } = await supabase
    .from('caisse_tickets')
    .insert({ etablissement_id: etablissementId, table_id: tableId || null })
    .select()
    .single();
  if (error) return { data: null, error: mapError(error) };
  return { data, error: null };
}

export async function majTicket(id, partial) {
  const { data, error } = await supabase
    .from('caisse_tickets')
    .update(partial)
    .eq('id', id)
    .select()
    .single();
  if (error) return { data: null, error: mapError(error) };
  return { data, error: null };
}

// Suppression d'un ticket ouvert encore vide (table ouverte par erreur).
export async function supprimerTicket(id) {
  const { error } = await supabase.from('caisse_tickets').delete().eq('id', id);
  if (error) return { error: mapError(error) };
  return { error: null };
}

export async function ajouterLigne(ligne) {
  const { data, error } = await supabase
    .from('caisse_lignes')
    .insert({
      ticket_id: ligne.ticketId,
      plat_id: ligne.platId || null,
      libelle: ligne.libelle,
      quantite: ligne.quantite ?? 1,
      prix_unitaire: ligne.prixUnitaire ?? 0,
      suite: ligne.suite ?? 1,
      note: ligne.note || null,
    })
    .select()
    .single();
  if (error) return { data: null, error: mapError(error) };
  return { data, error: null };
}

export async function majLigne(id, partial) {
  const { data, error } = await supabase
    .from('caisse_lignes')
    .update(partial)
    .eq('id', id)
    .select()
    .single();
  if (error) return { data: null, error: mapError(error) };
  return { data, error: null };
}

export async function supprimerLigne(id) {
  const { error } = await supabase.from('caisse_lignes').delete().eq('id', id);
  if (error) return { error: mapError(error) };
  return { error: null };
}

// Derniers « sans ... » poses dans l'etablissement (rappel en chips de la
// fiche de ligne). Lu depuis les options des lignes recentes, aucun stockage
// double ; jamais bloquant : une erreur rend simplement une liste vide.
export async function listSansRecents(etablissementId, limite = 8) {
  const { data, error } = await supabase
    .from('caisse_lignes')
    .select('options, created_at, caisse_tickets!inner(etablissement_id)')
    .eq('caisse_tickets.etablissement_id', etablissementId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) { console.warn('[caisseService] listSansRecents', error); return { data: [] }; }
  const vus = [];
  (data || []).forEach((r) => (Array.isArray(r.options) ? r.options : []).forEach((o) => {
    if (o && o.type === 'sans' && o.valeur && !vus.includes(o.valeur)) vus.push(o.valeur);
  }));
  return { data: vus.slice(0, limite) };
}

// Habillage des boutons produits (caisse_boutons, v3) : une ligne par plat.
// Lecture pour tout membre ; ecriture reservee en RLS a consultant, patron
// et resp_cuisine. Rend une table plat_id -> ligne.
export async function listBoutons(etablissementId) {
  const { data, error } = await supabase
    .from('caisse_boutons')
    .select('*')
    .eq('etablissement_id', etablissementId);
  if (error) { console.warn('[caisseService] listBoutons', error); return { data: {} }; }
  const parPlat = {};
  (data || []).forEach((b) => { parPlat[b.plat_id] = b; });
  return { data: parPlat };
}

// Habillage vide (ni nom court, ni couleur, ni picto) : les trois colonnes
// repassent a null. La ligne reste : depuis la v4 elle porte aussi la
// categorie et le rang du produit, qu'un habillage vide ne doit pas emporter.
// L'upsert ne nomme que les colonnes d'habillage : categorie_id et ordre ne
// sont jamais touches ici.
export async function upsertBouton({ etablissementId, platId, nomCourt, couleur, picto }) {
  const { error } = await supabase
    .from('caisse_boutons')
    .upsert({
      etablissement_id: etablissementId,
      plat_id: platId,
      nom_court: nomCourt || null,
      couleur: couleur || null,
      picto: picto || null,
    }, { onConflict: 'plat_id' });
  if (error) return { error: mapError(error, "L'habillage n'a pas pu etre enregistre.") };
  return { error: null };
}

// ── Catégories de caisse (caisse_categories, v4) ──
// Lecture pour tout membre ; écriture réservée en RLS à consultant, patron et
// resp_cuisine. Une lecture en échec rend error (jamais une liste vide) :
// l'écran garde alors les dernières catégories connues.
export async function listCategories(etablissementId) {
  const { data, error } = await supabase
    .from('caisse_categories')
    .select('*')
    .eq('etablissement_id', etablissementId)
    .order('ordre', { ascending: true });
  if (error) return { data: null, error: mapError(error, 'Catégories illisibles. Réessayez.') };
  return { data: data || [], error: null };
}

// Crée une ou plusieurs catégories (la première écriture d'une maison pose
// d'un coup les catégories par défaut du code). Rend les lignes créées.
export async function creerCategories(etablissementId, categories) {
  const lignes = (categories || []).map((c) => ({
    etablissement_id: etablissementId,
    nom: String(c.nom || '').trim(),
    ordre: c.ordre ?? 0,
    couleur: c.couleur || null,
    picto: c.picto || null,
  }));
  const { data, error } = await supabase.from('caisse_categories').insert(lignes).select();
  if (error) return { data: null, error: mapError(error, "La catégorie n'a pas pu être créée.") };
  return { data: data || [], error: null };
}

// Une écriture qui n'atteint aucune ligne (RLS) n'est pas un succès : sans
// ligne rendue, le droit manque.
export async function majCategorie(id, partial) {
  const { data, error } = await supabase.from('caisse_categories').update(partial).eq('id', id).select();
  if (error) return { error: mapError(error, "La catégorie n'a pas pu être modifiée.") };
  if (!data?.length) return { error: MESSAGES['42501'] };
  return { error: null };
}

export async function supprimerCategorie(id) {
  const { data, error } = await supabase.from('caisse_categories').delete().eq('id', id).select();
  if (error) return { error: mapError(error, "La catégorie n'a pas pu être supprimée.") };
  if (!data?.length) return { error: MESSAGES['42501'] };
  return { error: null };
}

// Nouvel ordre des catégories : ids dans l'ordre voulu, un rang par ligne.
export async function ordonnerCategories(ids) {
  const resultats = await Promise.all((ids || []).map((id, i) =>
    supabase.from('caisse_categories').update({ ordre: i }).eq('id', id).select('id')));
  const rate = resultats.find((r) => r.error || !r.data?.length);
  if (rate) return { error: rate.error ? mapError(rate.error, "L'ordre n'a pas pu être enregistré.") : MESSAGES['42501'] };
  return { error: null };
}

// Range des produits dans une catégorie (ou les en retire : categorieId null).
// Une ligne caisse_boutons par plat ; l'upsert ne nomme que categorie_id, donc
// l'habillage et le rang déjà posés restent.
export async function rangerProduits(etablissementId, platIds, categorieId) {
  const lignes = (platIds || []).map((platId) => ({
    etablissement_id: etablissementId, plat_id: platId, categorie_id: categorieId || null,
  }));
  if (!lignes.length) return { error: null };
  const { data, error } = await supabase.from('caisse_boutons').upsert(lignes, { onConflict: 'plat_id' }).select('plat_id');
  if (error) return { error: mapError(error, "Le rangement n'a pas pu être enregistré.") };
  if ((data || []).length !== lignes.length) return { error: MESSAGES['42501'] };
  return { error: null };
}

// Ordre des produits dans leur catégorie : ids de plats dans l'ordre voulu.
export async function ordonnerProduits(etablissementId, platIds) {
  const lignes = (platIds || []).map((platId, i) => ({
    etablissement_id: etablissementId, plat_id: platId, ordre: i,
  }));
  if (!lignes.length) return { error: null };
  const { data, error } = await supabase.from('caisse_boutons').upsert(lignes, { onConflict: 'plat_id' }).select('plat_id');
  if (error) return { error: mapError(error, "L'ordre n'a pas pu être enregistré.") };
  if ((data || []).length !== lignes.length) return { error: MESSAGES['42501'] };
  return { error: null };
}

// ── Réglages de la caisse (caisse_reglages, v4) ──
// Rend la config telle qu'en base ({} sans ligne) ; la fusion sur les défauts
// se fait dans modules/caisse/reglages.js.
export async function getReglages(etablissementId) {
  const { data, error } = await supabase
    .from('caisse_reglages')
    .select('config')
    .eq('etablissement_id', etablissementId)
    .maybeSingle();
  if (error) return { data: null, error: mapError(error, 'Réglages illisibles. Réessayez.') };
  return { data: data?.config || {}, error: null };
}

export async function saveReglages(etablissementId, config) {
  const { data, error } = await supabase
    .from('caisse_reglages')
    .upsert({ etablissement_id: etablissementId, config }, { onConflict: 'etablissement_id' })
    .select('etablissement_id');
  if (error) return { error: mapError(error, "Les réglages n'ont pas pu être enregistrés.") };
  if (!data?.length) return { error: MESSAGES['42501'] };
  return { error: null };
}

// Envoi du bon : UNE RPC, idempotente au double tap (le second appel trouve
// zéro ligne en attente et ne crée aucun bon). Rend { bon_id, lignes }.
export async function envoyerBon(ticketId, suite) {
  const { data, error } = await supabase.rpc('caisse_envoyer_bon', {
    p_ticket_id: ticketId,
    p_suite: suite,
  });
  if (error) return { data: null, error: mapError(error, "L'envoi du bon a échoué. Réessayez.") };
  return { data, error: null };
}

// Fait passer les lignes en attente d'une suite à la suivante (« À suivre »).
export async function passerSuiteSuivante(ticketId, suite) {
  const { error } = await supabase
    .from('caisse_lignes')
    .update({ suite: Math.min(9, suite + 1) })
    .eq('ticket_id', ticketId)
    .eq('suite', suite)
    .eq('statut', 'en_attente');
  if (error) return { error: mapError(error) };
  return { error: null };
}

// Encaissement : enregistre le paiement puis clôt le ticket. Si la clôture
// échoue après le paiement, le paiement est retiré (retour à l'état d'avant,
// jamais un ticket ouvert avec un paiement fantôme) avant de remonter l'erreur.
// moyen = la famille (especes, carte, autre) ; libelle = le nom que la maison
// a donné à ce moyen dans ses réglages (v4), absent pour un moyen par défaut.
export async function encaisser(ticketId, moyen, montant, libelle = null) {
  const { data: paiement, error: e1 } = await supabase
    .from('caisse_paiements')
    .insert({ ticket_id: ticketId, moyen, montant, ...(libelle ? { libelle } : null) })
    .select()
    .single();
  if (e1) return { error: mapError(e1, "L'encaissement a échoué. Réessayez.") };
  const { error: e2 } = await supabase
    .from('caisse_tickets')
    .update({ statut: 'encaisse', closed_at: new Date().toISOString() })
    .eq('id', ticketId);
  if (e2) {
    await supabase.from('caisse_paiements').delete().eq('id', paiement.id);
    return { error: mapError(e2, "L'encaissement a échoué. Réessayez.") };
  }
  return { error: null };
}

// Fusion : les lignes du ticket source rejoignent le ticket cible, puis le
// ticket source (vide) est supprimé. Les deux doivent être ouverts (garde en
// base). Si la suppression échoue, la fusion des lignes reste valable : le
// ticket source vide se supprime depuis la liste des tickets.
export async function fusionnerTickets(sourceId, cibleId) {
  const { error: e1 } = await supabase
    .from('caisse_lignes')
    .update({ ticket_id: cibleId })
    .eq('ticket_id', sourceId);
  if (e1) return { error: mapError(e1, 'La fusion a échoué. Réessayez.') };
  const { error: e2 } = await supabase.from('caisse_tickets').delete().eq('id', sourceId);
  if (e2) return { error: mapError(e2, 'Lignes fusionnées, ancien ticket à supprimer à la main.') };
  return { error: null };
}
