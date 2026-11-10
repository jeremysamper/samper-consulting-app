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

// Habillage vide (ni nom court, ni couleur, ni picto) : la ligne disparait.
export async function upsertBouton({ etablissementId, platId, nomCourt, couleur, picto }) {
  if (!nomCourt && !couleur && !picto) {
    const { error } = await supabase.from('caisse_boutons').delete().eq('plat_id', platId);
    if (error) return { error: mapError(error) };
    return { error: null };
  }
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
export async function encaisser(ticketId, moyen, montant) {
  const { data: paiement, error: e1 } = await supabase
    .from('caisse_paiements')
    .insert({ ticket_id: ticketId, moyen, montant })
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
