// ─────────────────────────────────────────────────────────────────────────────
// Points & boutique : lectures et écritures (migration 20261114_points_boutique).
// Le registre, les commandes et les réglages ne s'écrivent que par les RPC ;
// seul le catalogue s'écrit en direct (policies réservées à qui gère).
// Une lecture en échec lève : l'écran dit « non actualisé » au lieu d'un vide.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from '../../services/supabase.js';

function verifier({ data, error }) {
  if (error) throw error;
  return data;
}

// Message lisible d'une erreur de RPC (les messages de la base sont en français).
export function messageErreurPoints(err, repli = "L'opération n'a pas abouti.") {
  const m = String(err?.message || '').trim();
  if (!m) return repli;
  if (/fetch|network|Failed to/i.test(m)) return 'Pas de réseau : réessayez dans un instant.';
  return m;
}

const mapMouvement = (r) => ({
  id: r.id,
  etablissementId: r.etablissement_id,
  userId: r.user_id,
  points: r.points,
  action: r.action,
  sourceTable: r.source_table,
  sourceId: r.source_id,
  sens: r.sens,
  libelle: r.libelle,
  createdAt: r.created_at,
  createdBy: r.created_by,
});

const mapCadeau = (r) => ({
  id: r.id,
  etablissementId: r.etablissement_id,
  nom: r.nom,
  description: r.description || '',
  cout: r.cout,
  stock: r.stock,
  actif: r.actif,
  ordre: r.ordre,
});

const mapCommande = (r) => ({
  id: r.id,
  etablissementId: r.etablissement_id,
  userId: r.user_id,
  cadeauId: r.cadeau_id,
  cout: r.cout,
  statut: r.statut,
  note: r.note || '',
  createdAt: r.created_at,
  traiteePar: r.traitee_par,
  traiteeLe: r.traitee_le,
});

export const pointsService = {
  async etat(etabId) {
    return verifier(await supabase.rpc('points_etat', { p_etab: etabId })) || { actif: false, participant: false, gere: false };
  },

  async solde(etabId) {
    return Number(verifier(await supabase.rpc('points_solde', { p_etab: etabId })) || 0);
  },

  // Ses 50 derniers mouvements (RLS : les siens seulement pour un employé).
  async mesMouvements(etabId, userId) {
    const data = verifier(await supabase.from('points_mouvements')
      .select('*').eq('etablissement_id', etabId).eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(50));
    return (data || []).map(mapMouvement);
  },

  // Mouvements d'une personne de l'équipe, pour qui gère.
  async mouvementsDe(etabId, userId) {
    return this.mesMouvements(etabId, userId);
  },

  async cadeaux(etabId) {
    const data = verifier(await supabase.from('points_cadeaux')
      .select('*').eq('etablissement_id', etabId)
      .order('ordre', { ascending: true }).order('cout', { ascending: true }));
    return (data || []).map(mapCadeau);
  },

  // Commandes : les siennes pour un employé, celles de l'établissement pour
  // qui gère (RLS).
  async commandes(etabId, { userId = null } = {}) {
    let q = supabase.from('points_commandes').select('*').eq('etablissement_id', etabId)
      .order('created_at', { ascending: false }).limit(200);
    if (userId) q = q.eq('user_id', userId);
    return (verifier(await q) || []).map(mapCommande);
  },

  async soldes(etabId) {
    const data = verifier(await supabase.rpc('points_soldes', { p_etab: etabId }));
    return (data || []).map((r) => ({
      userId: r.user_id,
      prenom: r.prenom || '',
      nom: r.nom || '',
      role: r.role,
      actif: r.actif,
      participant: r.participant,
      exclu: r.exclu,
      solde: Number(r.solde) || 0,
      gagneMois: Number(r.gagne_mois) || 0,
    }));
  },

  async commander(cadeauId) {
    return verifier(await supabase.rpc('points_commander', { p_cadeau_id: cadeauId }));
  },

  async annulerCommande(commandeId) {
    return verifier(await supabase.rpc('points_annuler_commande', { p_commande_id: commandeId }));
  },

  async traiterCommande(commandeId, statut, note = null) {
    return verifier(await supabase.rpc('points_traiter_commande', {
      p_commande_id: commandeId, p_statut: statut, p_note: note || null,
    }));
  },

  async regler(etabId, { actif = null, roles = null, exclus = null, bareme = null } = {}) {
    return verifier(await supabase.rpc('points_regler', {
      p_etab: etabId, p_actif: actif, p_roles: roles, p_exclus: exclus, p_bareme: bareme,
    }));
  },

  async ajuster(etabId, userId, points, motif) {
    return Number(verifier(await supabase.rpc('points_ajuster', {
      p_user: userId, p_etab: etabId, p_points: points, p_motif: motif,
    })) || 0);
  },

  async enregistrerCadeau(etabId, cadeau) {
    const payload = {
      etablissement_id: etabId,
      nom: String(cadeau.nom || '').trim(),
      description: String(cadeau.description || '').trim() || null,
      cout: Number(cadeau.cout),
      stock: cadeau.stock === '' || cadeau.stock == null ? null : Number(cadeau.stock),
      actif: cadeau.actif !== false,
      ordre: Number(cadeau.ordre) || 0,
    };
    const q = cadeau.id
      ? supabase.from('points_cadeaux').update(payload).eq('id', cadeau.id).select().single()
      : supabase.from('points_cadeaux').insert(payload).select().single();
    return mapCadeau(verifier(await q));
  },

  async supprimerCadeau(cadeauId) {
    verifier(await supabase.from('points_cadeaux').delete().eq('id', cadeauId));
  },
};
