// Mode démo : fonctions RPC de la base, rejouées sur la base en mémoire.
// Chaque fonction rend la forme que l'app attend ; ce qui n'a pas de sens
// hors production rend une erreur claire au lieu d'un faux succès.
import { uuid } from './postgrest.js';

const heureZurich = () => new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
const jourZurich = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const maintenant = () => new Date().toISOString();

export class ErreurRpc extends Error {
  constructor(message, code = 'P0001') { super(message); this.code = code; }
}

function profilDe(ctx, id = ctx.uid) {
  return ctx.db.profiles.find((p) => p.id === id) || null;
}

const gere = (ctx) => ['consultant', 'patron', 'resp_cuisine'].includes(profilDe(ctx)?.role);

// ── Points ───────────────────────────────────────────────────────────────────

function soldeDe(ctx, userId, etab) {
  const credits = ctx.db.points_mouvements.filter((m) => m.user_id === userId && m.etablissement_id === etab)
    .reduce((s, m) => s + (m.sens === 'debit' ? -m.points : m.points), 0);
  const engages = ctx.db.points_commandes.filter((c) => c.user_id === userId && c.etablissement_id === etab && ['demandee', 'validee'].includes(c.statut))
    .reduce((s, c) => s + c.cout, 0);
  return credits - engages;
}

function gagneMois(ctx, userId, etab) {
  const mois = jourZurich().slice(0, 7);
  return ctx.db.points_mouvements.filter((m) => m.user_id === userId && m.etablissement_id === etab && m.sens !== 'debit' && String(m.created_at).slice(0, 7) === mois)
    .reduce((s, m) => s + m.points, 0);
}

// ── Caisse ───────────────────────────────────────────────────────────────────

function totalTicket(ctx, ticketId) {
  return ctx.db.caisse_lignes.filter((l) => l.ticket_id === ticketId && l.statut !== 'annule')
    .reduce((s, l) => s + (l.offert ? 0 : Number(l.prix_unitaire) * Number(l.quantite) - Number(l.remise_montant || 0)), 0);
}

const arrondi5 = (n) => Math.round(n * 20) / 20;

// ── Table des fonctions ─────────────────────────────────────────────────────

const RPC = {
  // Pointage : l'heure est celle de Zurich, comme la vraie fonction.
  pointer_arrivee(ctx, a) {
    const s = ctx.db.shifts.find((x) => x.id === (a.shift_id || a.p_shift_id));
    if (!s || s.pointage_debut) throw new ErreurRpc('Shift introuvable, non autorisé, ou déjà pointé');
    ctx.maj('shifts', s, { pointage_debut: heureZurich() });
    return { ...s };
  },
  pointer_depart(ctx, a) {
    const s = ctx.db.shifts.find((x) => x.id === (a.shift_id || a.p_shift_id));
    if (!s || !s.pointage_debut || s.pointage_fin) throw new ErreurRpc('Shift introuvable, non autorisé, pas d\'arrivée ou départ déjà pointé');
    ctx.maj('shifts', s, { pointage_fin: heureZurich() });
    return { ...s };
  },
  pointer_hors_planning(ctx, a) {
    const ex = ctx.db.shifts.find((x) => x.id === a.p_shift_id);
    if (ex) return { ...ex };
    const h = heureZurich();
    return ctx.inserer('shifts', {
      id: a.p_shift_id || uuid(), etablissement_id: a.p_etablissement_id, user_id: ctx.uid, date: jourZurich(), debut: h, fin: h,
      pause: 0, poste: null, type_shift: 'simple', statut: 'confirmé', pointage_debut: h, pointage_fin: null, note: 'Pointage hors planning',
    });
  },
  pointer_offline() { return { applique: true }; },

  planning_modeles_remplacer(ctx, a) {
    const etab = a.p_etablissement_id || a.p_etab;
    ctx.db.planning_modeles = ctx.db.planning_modeles.filter((m) => m.etablissement_id !== etab);
    (a.p_modeles || []).forEach((m, i) => ctx.inserer('planning_modeles', { ...m, etablissement_id: etab, ordre: i }));
    return ctx.db.planning_modeles.filter((m) => m.etablissement_id === etab);
  },

  // Inventaire : écriture d'une quantité comptée dans les lignes jsonb.
  inventaire_saisir_stock(ctx, a) {
    const inv = ctx.db.inventaires.find((i) => i.id === a.p_inventaire_id);
    if (!inv) throw new ErreurRpc('Inventaire introuvable');
    const lignes = (inv.lignes || []).map((l) => {
      if (l.id !== a.p_ligne_id) return l;
      const reel = a.p_stock_reel == null ? null : Number(a.p_stock_reel);
      const ecart = reel == null ? null : Math.round((reel - Number(l.stockTheo || 0)) * 100) / 100;
      return { ...l, stockReel: reel, ecart, valeur: reel == null ? 0 : Math.round(reel * Number(l.prixUnit || 0) * 100) / 100, ecartValeur: ecart == null ? null : Math.round(ecart * Number(l.prixUnit || 0) * 100) / 100, compteLe: maintenant() };
    });
    ctx.maj('inventaires', inv, { lignes, valeur_totale: Math.round(lignes.reduce((s, l) => s + (Number(l.valeur) || 0), 0) * 100) / 100 });
    return { ...inv };
  },
  inventaire_saisir_stock_zone(ctx, a) { return RPC.inventaire_saisir_stock(ctx, a); },
  inventaire_modifier_ligne(ctx, a) {
    const inv = ctx.db.inventaires.find((i) => i.id === a.p_inventaire_id);
    if (!inv) throw new ErreurRpc('Inventaire introuvable');
    const lignes = (inv.lignes || []).map((l) => (l.id === a.p_ligne_id ? { ...l, ...(a.p_valeurs || {}) } : l));
    ctx.maj('inventaires', inv, { lignes });
    return { ...inv };
  },

  // KDS : la démo n'est reliée à aucune caisse Lightspeed.
  kds_lightspeed_actif() { return false; },
  kds_bump_item() { return null; },
  kds_complete_order() { return null; },
  kds_set_suite() { return null; },

  // Points et boutique.
  points_etat(ctx, a) {
    const reg = ctx.db.points_reglages.find((r) => r.etablissement_id === a.p_etab);
    const role = profilDe(ctx)?.role;
    return { actif: Boolean(reg?.actif), participant: Boolean(reg?.actif && reg.roles_participants?.includes(role)), gere: ['consultant', 'patron'].includes(role) };
  },
  points_solde(ctx, a) { return soldeDe(ctx, ctx.uid, a.p_etab); },
  points_soldes(ctx, a) {
    const reg = ctx.db.points_reglages.find((r) => r.etablissement_id === a.p_etab);
    return ctx.db.profiles.filter((p) => p.etablissement_ids?.includes(a.p_etab)).map((p) => ({
      user_id: p.id, prenom: p.prenom, nom: p.nom, role: p.role, actif: p.actif,
      participant: Boolean(reg?.roles_participants?.includes(p.role)), exclu: Boolean(reg?.exclus?.includes(p.id)),
      solde: soldeDe(ctx, p.id, a.p_etab), gagne_mois: gagneMois(ctx, p.id, a.p_etab),
    }));
  },
  points_classement(ctx, a) {
    return RPC.points_soldes(ctx, a).filter((r) => r.participant && r.solde > 0)
      .sort((x, y) => y.solde - x.solde)
      .map((r) => ({ prenom: r.prenom, nom_initiale: r.nom?.[0] || '', solde: r.solde, moi: r.user_id === ctx.uid }));
  },
  points_indicateurs(ctx, a) {
    const mvts = ctx.db.points_mouvements.filter((m) => m.etablissement_id === a.p_etab);
    return { actif: true, mouvements: mvts.length, points: mvts.reduce((s, m) => s + m.points, 0) };
  },
  points_commander(ctx, a) {
    const cadeau = ctx.db.points_cadeaux.find((c) => c.id === a.p_cadeau_id);
    if (!cadeau) throw new ErreurRpc('Cadeau introuvable');
    if (soldeDe(ctx, ctx.uid, cadeau.etablissement_id) < cadeau.cout) throw new ErreurRpc('points: solde insuffisant');
    return ctx.inserer('points_commandes', { etablissement_id: cadeau.etablissement_id, user_id: ctx.uid, cadeau_id: cadeau.id, cout: cadeau.cout, statut: 'demandee', note: null, traitee_par: null, traitee_le: null });
  },
  points_annuler_commande(ctx, a) {
    const c = ctx.db.points_commandes.find((x) => x.id === a.p_commande_id);
    if (c) ctx.maj('points_commandes', c, { statut: 'annulee' });
    return c ? { ...c } : null;
  },
  points_traiter_commande(ctx, a) {
    const c = ctx.db.points_commandes.find((x) => x.id === a.p_commande_id);
    if (c) ctx.maj('points_commandes', c, { statut: a.p_statut || 'remise', traitee_par: ctx.uid, traitee_le: maintenant(), note: a.p_note ?? c.note });
    return c ? { ...c } : null;
  },
  points_regler(ctx, a) {
    const reg = ctx.db.points_reglages.find((r) => r.etablissement_id === a.p_etab);
    if (reg) ctx.maj('points_reglages', reg, { actif: a.p_actif ?? reg.actif, roles_participants: a.p_roles ?? reg.roles_participants, exclus: a.p_exclus ?? reg.exclus, bareme: a.p_bareme ?? reg.bareme });
    return reg ? { ...reg } : null;
  },
  points_regler_plafonds(ctx, a) {
    const reg = ctx.db.points_reglages.find((r) => r.etablissement_id === a.p_etab);
    if (reg) ctx.maj('points_reglages', reg, { plafond_jour_total: a.p_jour, plafond_mois_total: a.p_mois });
    return reg ? { ...reg } : null;
  },
  points_ajuster(ctx, a) {
    const m = ctx.inserer('points_mouvements', { etablissement_id: a.p_etab, user_id: a.p_user_id, points: Math.abs(Number(a.p_points) || 0), action: 'ajustement', source_table: null, source_id: null, sens: Number(a.p_points) < 0 ? 'debit' : 'credit', libelle: a.p_motif || 'Ajustement', created_by: ctx.uid, evenement: null });
    return soldeDe(ctx, m.user_id, a.p_etab);
  },

  // Caisse.
  caisse_ouvrir_ticket(ctx, a) {
    const ouvert = a.p_table_id ? ctx.db.caisse_tickets.find((t) => t.etablissement_id === a.p_etablissement_id && t.table_id === a.p_table_id && t.statut === 'ouvert' && !t.test) : null;
    if (ouvert) return { ticket_id: ouvert.id, reservation_id: ouvert.reservation_id, deja_ouvert: true };
    let reservationId = a.p_reservation_id || null;
    if (a.p_qui === 'reservation' && reservationId) {
      const r = ctx.db.reservations.find((x) => x.id === reservationId);
      if (r && r.statut !== 'arrive') ctx.maj('reservations', r, { statut: 'arrive' });
    }
    const heure = heureZurich().slice(0, 5);
    const t = ctx.inserer('caisse_tickets', {
      etablissement_id: a.p_etablissement_id, table_id: a.p_table_id || null, statut: 'ouvert', ouvert_par: ctx.uid, note: null, closed_at: null,
      reservation_id: reservationId, client_id: a.p_client_id || null, couverts: a.p_couverts || null, qui: a.p_qui || null, test: Boolean(a.p_test),
      numero: null, annee: null, service: heure < '16:00' ? 'midi' : 'soir', jour_exploitation: jourZurich(), a_emporter: false, total_ttc: null,
    });
    return { ticket_id: t.id, reservation_id: reservationId, deja_ouvert: false, ...(a.p_test ? { test: true } : {}) };
  },
  caisse_envoyer_bon(ctx, a) {
    const lignes = ctx.db.caisse_lignes.filter((l) => l.ticket_id === a.p_ticket_id && Number(l.suite) === Number(a.p_suite) && l.statut === 'en_attente');
    lignes.forEach((l) => ctx.maj('caisse_lignes', l, { statut: 'envoye', envoye_at: maintenant(), envoye_par: ctx.uid }));
    return { envoyees: lignes.length, suite: a.p_suite };
  },
  caisse_reclamer_suite(ctx, a) {
    const lignes = ctx.db.caisse_lignes.filter((l) => l.ticket_id === a.p_ticket_id && Number(l.suite) === Number(a.p_suite));
    lignes.forEach((l) => ctx.maj('caisse_lignes', l, { reclame_at: maintenant() }));
    return { reclamees: lignes.length, suite: a.p_suite };
  },
  caisse_remise(ctx, a) {
    const t = ctx.db.caisse_tickets.find((x) => x.id === a.p_ticket_id);
    if (!t) throw new ErreurRpc('caisse: ticket introuvable');
    const cibles = ctx.db.caisse_lignes.filter((l) => l.ticket_id === t.id && (!a.p_ligne_id || l.id === a.p_ligne_id));
    for (const l of cibles) {
      const brut = Number(l.prix_unitaire) * Number(l.quantite);
      if (a.p_genre === 'offert') ctx.maj('caisse_lignes', l, { offert: true, remise_motif: a.p_motif, remise_par: ctx.uid, remise_at: maintenant() });
      else if (a.p_genre === 'pourcent') ctx.maj('caisse_lignes', l, { remise_montant: Math.round(brut * Number(a.p_valeur || 0)) / 100, remise_motif: a.p_motif, remise_par: ctx.uid, remise_at: maintenant() });
      else if (a.p_genre === 'retirer') ctx.maj('caisse_lignes', l, { remise_montant: 0, offert: false, remise_motif: null, remise_par: null, remise_at: null });
      else ctx.maj('caisse_lignes', l, { remise_montant: Math.min(brut, Number(a.p_valeur || 0) / (a.p_ligne_id ? 1 : cibles.length)), remise_motif: a.p_motif, remise_par: ctx.uid, remise_at: maintenant() });
    }
    return { ticket_id: t.id, total: Math.round(totalTicket(ctx, t.id) * 100) / 100 };
  },
  caisse_encaisser(ctx, a) {
    const t = ctx.db.caisse_tickets.find((x) => x.id === a.p_ticket_id);
    if (!t || t.statut !== 'ouvert') throw new ErreurRpc('caisse: ticket deja encaisse ou introuvable');
    const total = Math.round(totalTicket(ctx, t.id) * 100) / 100;
    const especes = (a.p_paiements || []).some((p) => p.moyen === 'especes');
    const totalArrondi = especes ? arrondi5(total) : total;
    let paye = 0;
    let rendu = 0;
    let pourboire = 0;
    for (const p of a.p_paiements || []) {
      const montant = Number(p.montant) || 0;
      paye += montant;
      pourboire += Number(p.pourboire) || 0;
      if (p.moyen === 'especes' && p.recu != null) rendu += Math.max(0, Number(p.recu) - montant);
      ctx.inserer('caisse_paiements', { ticket_id: t.id, moyen: p.moyen, montant, encaisse_par: ctx.uid, libelle: p.libelle || null, pourboire: Number(p.pourboire) || 0, rendu: 0, arrondi: 0, tpe_transaction_id: null, bon_cadeau_id: null });
    }
    if (Math.abs(paye - totalArrondi) > 0.051) throw new ErreurRpc('caisse: les paiements ne font pas le total du ticket');
    const compteur = ctx.db.caisse_tickets.reduce((m, x) => Math.max(m, Number(x.numero) || 0), 1000) + 1;
    ctx.maj('caisse_tickets', t, { statut: 'encaisse', closed_at: maintenant(), total_ttc: total, numero: t.test ? null : compteur, annee: Number(jourZurich().slice(0, 4)), a_emporter: a.p_a_emporter ?? t.a_emporter });
    ctx.db.caisse_lignes.filter((l) => l.ticket_id === t.id && l.statut === 'en_attente').forEach((l) => ctx.maj('caisse_lignes', l, { statut: 'envoye', envoye_at: maintenant() }));
    return { ticket_id: t.id, test: Boolean(t.test), numero: t.numero, annee: t.annee, jour_exploitation: t.jour_exploitation, total, rendu: Math.round(rendu * 100) / 100, arrondi: Math.round((totalArrondi - total) * 100) / 100, pourboire };
  },
  caisse_annuler_ticket(ctx, a) {
    const t = ctx.db.caisse_tickets.find((x) => x.id === a.p_ticket_id);
    if (!t) throw new ErreurRpc('caisse: ticket introuvable');
    ctx.maj('caisse_tickets', t, { statut: 'annule', annule_motif: a.p_motif, annule_par: ctx.uid, annule_at: maintenant(), annule_jour: jourZurich() });
    return { ticket_id: t.id, statut: 'annule' };
  },
  caisse_journee(ctx, a) {
    const jour = jourZurich();
    const tickets = ctx.db.caisse_tickets.filter((t) => t.etablissement_id === a.p_etablissement_id && !t.test);
    const clotures = new Set(ctx.db.caisse_clotures.filter((c) => c.etablissement_id === a.p_etablissement_id).map((c) => c.jour_exploitation));
    const aCloturer = {};
    tickets.filter((t) => t.statut === 'encaisse' && t.jour_exploitation < jour && !clotures.has(t.jour_exploitation))
      .forEach((t) => { aCloturer[t.jour_exploitation] = (aCloturer[t.jour_exploitation] || 0) + 1; });
    return {
      jour,
      cloture: clotures.has(jour),
      tickets_du_jour: tickets.filter((t) => t.jour_exploitation === jour && t.statut === 'encaisse').length,
      a_cloturer: Object.entries(aCloturer).map(([j, n]) => ({ jour: j, tickets: n })),
      ouverts: tickets.filter((t) => t.statut === 'ouvert').length,
    };
  },
  caisse_cloturer_jour(ctx, a) {
    const jour = a.p_jour || jourZurich();
    const tickets = ctx.db.caisse_tickets.filter((t) => t.etablissement_id === a.p_etablissement_id && t.jour_exploitation === jour && t.statut === 'encaisse' && !t.test);
    const total = Math.round(tickets.reduce((s, t) => s + Number(t.total_ttc || 0), 0) * 100) / 100;
    const profil = profilDe(ctx);
    return ctx.inserer('caisse_clotures', {
      etablissement_id: a.p_etablissement_id, jour_exploitation: jour, numero: ctx.db.caisse_clotures.length + 1,
      totaux: { total_ttc: total, tickets: tickets.length }, fond_caisse: a.p_fond_caisse || 0, especes_comptees: a.p_especes_comptees ?? null,
      ecart: 0, motif: a.p_motif || null, cloture_par: ctx.uid, cloture_par_nom: profil ? `${profil.prenom} ${profil.nom}` : null,
      cloture_at: maintenant(), empreinte: null, empreinte_precedente: null, complement_de: null,
    });
  },
  caisse_verifier_chaine() { return { ok: true, rompue: false, verifie: 0 }; },
  caisse_test_etat() { return { actif: false }; },
  caisse_test_entrer() { throw new ErreurRpc('Le mode test de la caisse n\'est pas ouvert dans la démo.'); },
  caisse_test_sortir() { return { actif: false }; },
  caisse_vider_tests() { return { supprimes: 0 }; },
  caisse_corriger_reservation(ctx, a) {
    const r = ctx.db.reservations.find((x) => x.id === a.p_reservation_id);
    if (r) ctx.maj('reservations', r, { ...(a.p_nom ? { nom: a.p_nom } : {}), ...(a.p_couverts ? { nb_couverts: a.p_couverts } : {}), ...(a.p_statut ? { statut: a.p_statut } : {}) });
    return r ? { ...r } : null;
  },
  caisse_rapport_donnees(ctx, a) {
    const tickets = ctx.db.caisse_tickets.filter((t) => t.etablissement_id === a.p_etablissement_id && !t.test && t.jour_exploitation >= a.p_debut && t.jour_exploitation <= a.p_fin && t.statut !== 'ouvert');
    const ids = new Set(tickets.map((t) => t.id));
    return {
      tickets,
      lignes: ctx.db.caisse_lignes.filter((l) => ids.has(l.ticket_id)),
      paiements: ctx.db.caisse_paiements.filter((p) => ids.has(p.ticket_id)),
      clotures: ctx.db.caisse_clotures.filter((c) => c.etablissement_id === a.p_etablissement_id && c.jour_exploitation >= a.p_debut && c.jour_exploitation <= a.p_fin),
      bons: [],
      tpe: [],
    };
  },
  caisse_tpe_rapport() { return { transactions: [], bouclements: [] }; },
  caisse_tpe_bouclement_poser() { throw new ErreurRpc('Aucun terminal de paiement n\'est relié dans la démo.'); },
  caisse_bon_cadeau_emettre(ctx, a) {
    const code = 'DEMO-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const bon = ctx.inserer('caisse_bons_cadeaux', {
      etablissement_id: a.p_etablissement_id, code, montant_initial: a.p_montant, solde: a.p_montant, nom: a.p_nom || null, telephone: a.p_telephone || null,
      message: a.p_message || null, valable_jusqu_au: a.p_valable_jusqu_au || null, statut: 'actif', emis_par: ctx.uid, emis_at: maintenant(),
    });
    return { ...bon, bon_id: bon.id };
  },
  caisse_bon_cadeau_annuler(ctx, a) {
    const b = ctx.db.caisse_bons_cadeaux.find((x) => x.id === a.p_bon_id);
    if (b) ctx.maj('caisse_bons_cadeaux', b, { statut: 'annule', annule_par: ctx.uid, annule_at: maintenant(), annule_motif: a.p_motif || null });
    return b ? { ...b } : null;
  },
  caisse_bon_cadeau_prolonger(ctx, a) {
    const b = ctx.db.caisse_bons_cadeaux.find((x) => x.id === a.p_bon_id);
    if (b) ctx.maj('caisse_bons_cadeaux', b, { valable_jusqu_au: a.p_valable_jusqu_au });
    return b ? { ...b } : null;
  },
};

export function executerRpc(ctx, nom, args) {
  const f = RPC[nom];
  if (!f) {
    if (!gere(ctx) && /^points_|^caisse_/.test(nom)) throw new ErreurRpc('Action réservée.', '42501');
    throw new ErreurRpc('Cette action n\'est pas disponible dans la démo.');
  }
  return f(ctx, args || {});
}
