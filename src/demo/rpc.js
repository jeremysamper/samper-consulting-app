// Mode démo : fonctions RPC de la base, rejouées sur la base en mémoire.
// Chaque fonction rend la forme que l'app attend ; ce qui n'a pas de sens
// hors production rend une erreur claire au lieu d'un faux succès.
import { uuid } from './postgrest.js';
import { planEnLigne } from '../reservation/choixTable.js';
import { repartirFormule } from '../modules/caisse/formules.js';

const heureZurich = () => new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
const jourZurich = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const maintenant = () => new Date().toISOString();

// Lot 01 : compteur des numéros de retrait, en mémoire, par établissement et
// par jour de Zurich. Il ne repart jamais sous le plus grand numéro déjà posé
// aujourd'hui (la base de démo survit à un rechargement, la mémoire non).
const retraitsJour = new Map();
function retraitSuivant(ctx, etab) {
  const jour = jourZurich();
  const cle = `${etab}|${jour}`;
  const dejaPoses = ctx.db.caisse_tickets
    .filter((x) => x.etablissement_id === etab && x.retrait_numero != null
      && new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date(x.created_at)) === jour)
    .reduce((m, x) => Math.max(m, Number(x.retrait_numero)), 0);
  const n = Math.max(retraitsJour.get(cle) || 0, dejaPoses) + 1;
  retraitsJour.set(cle, n);
  return n;
}

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

// ── Note de la chambre (lot 05 du panel) ────────────────────────────────────
// Mêmes refus que sejour_porter_ticket, sejour_tickets_a_porter et
// sejour_reports_verifier. Les rôles sont ceux des défauts de la base
// (caisse_peut_utiliser, user_peut_gerer('hebergement', ...)).
const peutCaisseDemo = (ctx) => ['consultant', 'patron', 'resp_cuisine', 'serveur'].includes(profilDe(ctx)?.role);
const peutHotelDemo = (ctx) => ['consultant', 'patron', 'receptionniste'].includes(profilDe(ctx)?.role);
function compteNote(ctx) {
  if (!ctx.uid) throw new ErreurRpc('note: connexion requise', '42501');
  if (!profilDe(ctx)?.role) throw new ErreurRpc('note: compte sans rôle', '42501');
}
const estChambre = (p) => p.moyen === 'autre' && !p.bon_cadeau_id && String(p.libelle || '').trim().toLowerCase().startsWith('chambre');
const montantChambre = (ctx, ticketId) => Math.round(ctx.db.caisse_paiements
  .filter((p) => p.ticket_id === ticketId && estChambre(p)).reduce((s, p) => s + Number(p.montant || 0), 0) * 100) / 100;
const numeroNote = (t) => `${t.annee}-${String(t.numero).padStart(6, '0')}`;
const ligneOrigine = (ctx, origine, id) => ctx.db.sejour_lignes.find((l) => l.origine === origine && l.origine_id === id);

// ── Borne de pointage (lot L6) ───────────────────────────────────────────────
// Même contrat que les fonctions de la base (pointer_borne, borne_etat...).
// Empreinte de démonstration (FNV-1a) : la démo n'a rien à protéger, seule la
// forme compte (le jeton et le code ne sont jamais gardés en clair).

export const MESSAGE_BORNE_DEMO = "Le pointage se fait à la borne de l'établissement.";

export function empreinteDemo(texte) {
  let h = 0x811c9dc5;
  for (const c of String(texte)) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const tablesBorne = (ctx) => {
  ctx.db.bornes_pointage ||= [];
  ctx.db.bornes_pointage_essais ||= [];
  ctx.db.pointage_codes ||= [];
  return ctx.db;
};

const estDirection = (ctx) => ['consultant', 'patron'].includes(profilDe(ctx)?.role);

function borneSeulement(ctx, etab) {
  const r = (ctx.db.reglages_maison || []).find((x) => x.etablissement_id === etab);
  return r?.pointage?.borne_seulement === true;
}

const enMinutes = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };

function jetonDemo() {
  const octets = new Uint8Array(32);
  globalThis.crypto.getRandomValues(octets);
  return Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
}

const heureDe = (iso) => new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

// ── Table des fonctions ─────────────────────────────────────────────────────

// ── Marchandise (lot 4a) ─────────────────────────────────────────────────────
// Même contrat que pertes_frequentes et recettes_relier_ingredients (migration
// 20261122b_lot4a_commande_base).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const arrondiA = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

function jourMoins(jours) {
  const d = new Date(jourZurich() + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - jours);
  return d.toISOString().slice(0, 10);
}

function pertesFrequentes(ctx, a) {
  const jours = Math.min(Math.max(Number(a.p_jours ?? 60) || 60, 1), 365);
  const limite = Math.min(Math.max(Number(a.p_limite ?? 12) || 12, 1), 50);
  const depuis = jourMoins(jours);
  const groupes = new Map();
  (ctx.db.pertes || [])
    .filter((p) => p.etablissement_id === a.p_etablissement_id && p.date >= depuis && String(p.produit || '').trim())
    .forEach((p) => {
      const cle = p.produit_id ? 'p:' + p.produit_id : p.recette_id ? 'r:' + p.recette_id : 'n:' + String(p.produit).trim().toLowerCase();
      const g = groupes.get(cle);
      const plusRecente = !g || p.date > g.derniere.date || (p.date === g.derniere.date && String(p.created_at || '') > String(g.derniere.created_at || ''));
      groupes.set(cle, { nb: (g?.nb || 0) + 1, derniere: plusRecente ? p : g.derniere });
    });
  return [...groupes.entries()]
    .sort(([, x], [, y]) => (y.nb - x.nb) || (y.derniere.date > x.derniere.date ? 1 : y.derniere.date < x.derniere.date ? -1 : 0)
      || String(x.derniere.produit).localeCompare(String(y.derniere.produit)))
    .slice(0, limite)
    .map(([cle, { nb, derniere: d }]) => ({
      cle, produit_id: d.produit_id ?? null, recette_id: d.recette_id ?? null, produit: d.produit, categorie: d.categorie ?? null,
      unite: d.unite ?? null, quantite: d.quantite ?? null, valeur_unit: d.valeur_unit ?? null, motif: d.motif ?? null, nb, derniere: d.date,
    }));
}

function relierIngredients(ctx, a) {
  const liens = a.p_liens;
  if (!Array.isArray(liens) || liens.length > 5000) throw new ErreurRpc('Liens invalides.', '22023');
  if (liens.some((e) => !e || typeof e !== 'object' || !e.recette_id || !e.ingredient_id
    || (e.prix_unit != null && typeof e.prix_unit !== 'number') || (e.unite != null && typeof e.unite !== 'string'))) {
    throw new ErreurRpc('Chaque lien donne recette_id et ingredient_id ; prix_unit est un nombre, unite un texte.', '22023');
  }
  const produit = (ctx.db.produits || []).find((p) => p.id === a.p_produit_id);
  if (!produit) throw new ErreurRpc('Produit introuvable.', 'P0002');
  const attendus = new Set(liens.map((e) => `${e.recette_id}|${e.ingredient_id}`)).size;
  const parRecette = new Map();
  liens.forEach((e) => {
    if (!parRecette.has(e.recette_id)) parRecette.set(e.recette_id, new Map());
    parRecette.get(e.recette_id).set(String(e.ingredient_id), e);
  });
  let relies = 0;
  for (const r of ctx.db.recettes || []) {
    const m = parRecette.get(r.id);
    if (!m || r.etablissement_id !== produit.etablissement_id || !Array.isArray(r.ingredients)) continue;
    let n = 0;
    const ingredients = r.ingredients.map((x) => {
      if (!x || typeof x !== 'object' || !m.has(String(x.id))) return x;
      n += 1;
      const l = m.get(String(x.id));
      const { needsReview: _revoir, matchSuggestions: _suggestions, ...reste } = x;
      return { ...reste, produitId: produit.id, ...(typeof l.prix_unit === 'number' ? { prixUnit: l.prix_unit } : {}), ...(typeof l.unite === 'string' ? { unite: l.unite } : {}) };
    });
    if (n) { ctx.maj('recettes', r, { ingredients, updated_at: maintenant() }); relies += n; }
  }
  return { relies, attendus };
}

const RPC = {
  pertes_frequentes: pertesFrequentes,
  recettes_relier_ingredients: relierIngredients,
  // Pointage : l'heure est celle de Zurich, comme la vraie fonction.
  pointer_arrivee(ctx, a) {
    const s = ctx.db.shifts.find((x) => x.id === (a.shift_id || a.p_shift_id));
    if (borneSeulement(ctx, s?.etablissement_id)) throw new ErreurRpc(MESSAGE_BORNE_DEMO);
    if (!s || s.pointage_debut) throw new ErreurRpc('Shift introuvable, non autorisé, ou déjà pointé');
    ctx.maj('shifts', s, { pointage_debut: heureZurich() });
    return { ...s };
  },
  pointer_depart(ctx, a) {
    const s = ctx.db.shifts.find((x) => x.id === (a.shift_id || a.p_shift_id));
    if (borneSeulement(ctx, s?.etablissement_id)) throw new ErreurRpc(MESSAGE_BORNE_DEMO);
    if (!s || !s.pointage_debut || s.pointage_fin) throw new ErreurRpc('Shift introuvable, non autorisé, pas d\'arrivée ou départ déjà pointé');
    ctx.maj('shifts', s, { pointage_fin: heureZurich() });
    return { ...s };
  },
  pointer_hors_planning(ctx, a) {
    if (borneSeulement(ctx, a.p_etablissement_id)) throw new ErreurRpc(MESSAGE_BORNE_DEMO);
    const ex = ctx.db.shifts.find((x) => x.id === a.p_shift_id);
    if (ex) return { ...ex };
    const h = heureZurich();
    return ctx.inserer('shifts', {
      id: a.p_shift_id || uuid(), etablissement_id: a.p_etablissement_id, user_id: ctx.uid, date: jourZurich(), debut: h, fin: h,
      pause: 0, poste: null, type_shift: 'simple', statut: 'confirmé', pointage_debut: h, pointage_fin: null, note: 'Pointage hors planning',
    });
  },
  pointer_offline(ctx, a) {
    const s = ctx.db.shifts.find((x) => x.id === a.p_shift_id);
    if (borneSeulement(ctx, s?.etablissement_id || a.p_etablissement_id)) throw new ErreurRpc(MESSAGE_BORNE_DEMO);
    return { applique: true };
  },

  borne_declarer(ctx, a) {
    tablesBorne(ctx);
    if (!estDirection(ctx)) throw new ErreurRpc('Seule la direction déclare une borne.');
    const nom = String(a.p_nom || '').trim();
    if (!nom || nom.length > 60) throw new ErreurRpc('Donnez un nom à la borne (60 caractères au plus).');
    const jeton = jetonDemo();
    const b = ctx.inserer('bornes_pointage', {
      id: uuid(), etablissement_id: a.p_etablissement_id, nom, jeton_empreinte: empreinteDemo(jeton), creee_par: ctx.uid,
      creee_le: maintenant(), revoquee_le: null, dernier_usage_le: null,
    });
    return { id: b.id, nom: b.nom, etablissement_id: b.etablissement_id, creee_le: b.creee_le, jeton };
  },
  borne_revoquer(ctx, a) {
    const db = tablesBorne(ctx);
    if (!estDirection(ctx)) throw new ErreurRpc('Seule la direction révoque une borne.');
    const b = db.bornes_pointage.find((x) => x.id === a.p_borne_id);
    if (!b || b.revoquee_le) return false;
    ctx.maj('bornes_pointage', b, { revoquee_le: maintenant() });
    return true;
  },
  borne_etat(ctx, a) {
    const db = tablesBorne(ctx);
    const b = String(a.p_jeton || '').length === 64 ? db.bornes_pointage.find((x) => x.jeton_empreinte === empreinteDemo(a.p_jeton)) : null;
    if (!b) return { valide: false, raison: 'borne_inconnue' };
    if (b.revoquee_le) return { valide: false, raison: 'revoquee' };
    const e = (ctx.db.etablissements || []).find((x) => x.id === b.etablissement_id);
    return { valide: true, nom: b.nom, etablissement_id: b.etablissement_id, etablissement_nom: e?.nom || '' };
  },
  pointer_borne(ctx, a) {
    const db = tablesBorne(ctx);
    const b = String(a.p_jeton || '').length === 64 ? db.bornes_pointage.find((x) => x.jeton_empreinte === empreinteDemo(a.p_jeton)) : null;
    if (!b) return { ok: false, raison: 'borne_inconnue' };
    if (a.p_client_uuid) {
      const prec = db.bornes_pointage_essais.find((e) => e.client_uuid === a.p_client_uuid);
      if (prec) return { ok: ['arrivee', 'depart', 'deja'].includes(prec.resultat), raison: prec.resultat, doublon: true };
    }
    const quand = a.p_event_at || maintenant();
    const journal = (resultat, extra = {}) => ctx.inserer('bornes_pointage_essais', {
      id: uuid(), borne_id: b.id, etablissement_id: b.etablissement_id, user_id: null, resultat, client_uuid: a.p_client_uuid || null, event_at: quand, created_at: maintenant(), ...extra,
    });
    if (b.revoquee_le) { journal('revoquee'); return { ok: false, raison: 'revoquee' }; }
    // 5 codes faux en 5 minutes : attente jusqu'à 5 minutes après le dernier.
    const derniers = db.bornes_pointage_essais.filter((e) => e.borne_id === b.id && e.resultat === 'code_faux')
      .map((e) => Date.parse(e.created_at)).sort((x, y) => y - x).slice(0, 5);
    if (derniers.length === 5 && derniers[0] - derniers[4] <= 300000 && Date.now() < derniers[0] + 300000) {
      return { ok: false, raison: 'attente', secondes: Math.max(1, Math.ceil((derniers[0] + 300000 - Date.now()) / 1000)) };
    }
    const echecs = db.bornes_pointage_essais.filter((e) => e.borne_id === b.id && e.resultat === 'code_faux' && Date.now() - Date.parse(e.created_at) < 300000);
    const code = String(a.p_code || '');
    const c = /^[0-9]{4}$/.test(code)
      ? db.pointage_codes.find((x) => x.etablissement_id === b.etablissement_id && x.code_empreinte === empreinteDemo(b.etablissement_id + ':' + code))
      : null;
    const p = c ? profilDe(ctx, c.user_id) : null;
    if (!p || p.actif === false || !(p.etablissement_ids || []).includes(b.etablissement_id)) {
      journal('code_faux');
      return { ok: false, raison: 'code_faux', restants: Math.max(0, 4 - echecs.length) };
    }
    const h = heureZurich().slice(0, 5);
    const j = jourZurich();
    const fiche = { prenom: p.prenom || '', nom: p.nom || '' };
    const recent = db.bornes_pointage_essais
      .filter((e) => e.user_id === p.id && ['arrivee', 'depart'].includes(e.resultat) && Date.now() - Date.parse(e.event_at) < 120000)
      .sort((x, y) => Date.parse(y.event_at) - Date.parse(x.event_at))[0];
    if (recent) {
      journal('deja', { user_id: p.id });
      return { ok: true, raison: 'deja', type: recent.resultat, heure: heureDe(recent.event_at), ...fiche };
    }
    const duJour = ctx.db.shifts.filter((s) => s.user_id === p.id && s.etablissement_id === b.etablissement_id && s.date === j);
    const ouvert = duJour.find((s) => s.pointage_debut && !s.pointage_fin);
    let type = 'arrivee';
    let hors = false;
    if (ouvert) {
      ctx.maj('shifts', ouvert, { pointage_fin: h, pointage_fin_auto: false });
      type = 'depart';
    } else {
      const prochain = duJour.filter((s) => !s.pointage_debut)
        .sort((x, y) => Math.abs(enMinutes(x.debut) - enMinutes(h)) - Math.abs(enMinutes(y.debut) - enMinutes(h)))[0];
      if (prochain) ctx.maj('shifts', prochain, { pointage_debut: h });
      else {
        ctx.inserer('shifts', {
          id: uuid(), etablissement_id: b.etablissement_id, user_id: p.id, date: j, debut: h, fin: h, pause: 0, poste: null,
          type_shift: 'simple', statut: 'confirmé', pointage_debut: h, pointage_fin: null, note: 'Pointage hors planning',
        });
        hors = true;
      }
    }
    journal(type, { user_id: p.id });
    ctx.maj('bornes_pointage', b, { dernier_usage_le: maintenant() });
    return { ok: true, raison: type, type, heure: h, ...fiche, hors_planning: hors };
  },
  pointage_code_definir(ctx, a) {
    const db = tablesBorne(ctx);
    const code = String(a.p_code || '');
    if (!/^[0-9]{4}$/.test(code)) return { ok: false, raison: 'format' };
    if (/^(.)\1{3}$/.test(code) || '0123456789'.includes(code) || '9876543210'.includes(code)) return { ok: false, raison: 'trop_simple' };
    const emp = empreinteDemo(a.p_etablissement_id + ':' + code);
    if (db.pointage_codes.some((x) => x.etablissement_id === a.p_etablissement_id && x.code_empreinte === emp && x.user_id !== ctx.uid)) return { ok: false, raison: 'indisponible' };
    const mien = db.pointage_codes.find((x) => x.user_id === ctx.uid && x.etablissement_id === a.p_etablissement_id);
    if (mien) ctx.maj('pointage_codes', mien, { code_empreinte: emp, maj_le: maintenant() });
    else ctx.inserer('pointage_codes', { user_id: ctx.uid, etablissement_id: a.p_etablissement_id, code_empreinte: emp, maj_le: maintenant() });
    return { ok: true };
  },
  pointage_code_etat(ctx, a) {
    const c = tablesBorne(ctx).pointage_codes.find((x) => x.user_id === ctx.uid && x.etablissement_id === a.p_etablissement_id);
    return { defini: Boolean(c), maj_le: c?.maj_le || null };
  },
  pointage_codes_equipe(ctx, a) {
    if (!estDirection(ctx)) throw new ErreurRpc('Réservé à la direction.');
    return tablesBorne(ctx).pointage_codes.filter((x) => x.etablissement_id === a.p_etablissement_id).map((x) => ({ user_id: x.user_id, maj_le: x.maj_le }));
  },
  pointage_code_reinitialiser(ctx, a) {
    if (!estDirection(ctx)) throw new ErreurRpc('Seule la direction réinitialise un code.');
    const db = tablesBorne(ctx);
    const avant = db.pointage_codes.length;
    db.pointage_codes = db.pointage_codes.filter((x) => !(x.user_id === a.p_user_id && x.etablissement_id === a.p_etablissement_id));
    return db.pointage_codes.length < avant;
  },

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
    // Lot 01 : au premier envoi d'un ticket sans table, hors test et hors
    // commande par QR, le numéro de retrait du jour (caisse_bon_interne).
    const t = ctx.db.caisse_tickets.find((x) => x.id === a.p_ticket_id);
    if (lignes.length && t && !t.table_id && !t.test && t.retrait_numero == null
      && !String(t.note || '').startsWith('Commande QR de')) {
      ctx.maj('caisse_tickets', t, { retrait_numero: retraitSuivant(ctx, t.etablissement_id) });
    }
    lignes.forEach((l) => ctx.maj('caisse_lignes', l, { statut: 'envoye', envoye_at: maintenant(), envoye_par: ctx.uid }));
    return { envoyees: lignes.length, suite: a.p_suite };
  },
  caisse_reclamer_suite(ctx, a) {
    const lignes = ctx.db.caisse_lignes.filter((l) => l.ticket_id === a.p_ticket_id && Number(l.suite) === Number(a.p_suite));
    lignes.forEach((l) => ctx.maj('caisse_lignes', l, { reclame_at: maintenant() }));
    return { reclamees: lignes.length, suite: a.p_suite };
  },
  // Rupture d'un produit (lot L2) : comme la vraie fonction, n'écrit que
  // rupture_le, au jour de Zurich, pour l'habillage et le serveur.
  caisse_poser_rupture(ctx, a) {
    if (!['consultant', 'patron', 'resp_cuisine', 'serveur'].includes(profilDe(ctx)?.role)) {
      throw new ErreurRpc('caisse: rupture reservee', '42501');
    }
    if (!ctx.db.plats.some((p) => p.id === a.p_plat_id && p.etablissement_id === a.p_etablissement_id)) {
      throw new ErreurRpc('caisse: plat inconnu pour cet etablissement');
    }
    const jour = a.p_rupture ? jourZurich() : null;
    const b = ctx.db.caisse_boutons.find((x) => x.plat_id === a.p_plat_id);
    if (b && b.etablissement_id !== a.p_etablissement_id) throw new ErreurRpc('caisse: plat inconnu pour cet etablissement');
    if (b) ctx.maj('caisse_boutons', b, { rupture_le: jour, updated_at: maintenant() });
    else ctx.inserer('caisse_boutons', { etablissement_id: a.p_etablissement_id, plat_id: a.p_plat_id, rupture_le: jour });
    return jour;
  },
  // Formules à prix fixe (lot 09) : mêmes refus que la vraie fonction, et
  // la même répartition du prix (repartirFormule, D3). La démo ne rejoue pas
  // les déclencheurs : c'est l'écran qui y tient les règles de D9 (D18).
  caisse_poser_formule(ctx, a) {
    if (!ctx.uid) throw new ErreurRpc('caisse: connexion requise', '42501');
    const t = ctx.db.caisse_tickets.find((x) => x.id === a.p_ticket_id);
    if (!t) throw new ErreurRpc('caisse: ticket introuvable');
    if (!peutCaisseDemo(ctx)) throw new ErreurRpc('caisse: acces refuse', '42501');
    const deja = ctx.db.caisse_lignes.filter((l) => l.formule_groupe === a.p_groupe);
    if (deja.some((l) => l.ticket_id !== t.id)) throw new ErreurRpc('caisse: groupe de formule deja pris');
    if (deja.length) return { groupe: a.p_groupe, lignes: deja.length, deja: true };
    if (t.statut !== 'ouvert') throw new ErreurRpc("caisse: le ticket n'est pas ouvert");
    const f = (ctx.db.caisse_formules || []).find((x) => x.id === a.p_formule_id && x.etablissement_id === t.etablissement_id);
    if (!f || !f.actif || f.archivee) throw new ErreurRpc('caisse: formule indisponible');
    const choix = Array.isArray(a.p_choix) ? a.p_choix : [];
    if (choix.length !== f.etapes.length) throw new ErreurRpc('caisse: un produit par etape');
    const jour = jourZurich();
    const plats = f.etapes.map((e, i) => {
      if (typeof choix[i] !== 'string') throw new ErreurRpc('caisse: un produit par etape');
      if (!e.plat_ids.includes(choix[i])) throw new ErreurRpc("caisse: produit hors de l'etape");
      const p = ctx.db.plats.find((x) => x.id === choix[i] && x.etablissement_id === t.etablissement_id);
      if (!p || p.actif === false) throw new ErreurRpc('caisse: produit indisponible');
      const b = ctx.db.caisse_boutons.find((x) => x.plat_id === p.id && x.etablissement_id === t.etablissement_id);
      if (b && String(b.rupture_le || '').slice(0, 10) === jour) throw new ErreurRpc('caisse: produit en rupture');
      return { p, suite: e.suite };
    });
    const parts = repartirFormule(Math.round(Number(f.prix) * 100), plats.map(({ p }) => Math.round(Number(p.prix_vente || 0) * 100)));
    const base = Date.now();
    plats.forEach(({ p, suite }, i) => ctx.inserer('caisse_lignes', {
      ticket_id: t.id, plat_id: p.id, libelle: p.nom, quantite: 1, prix_unitaire: parts[i] / 100, suite,
      formule_id: f.id, formule_groupe: a.p_groupe, formule_nom: String(f.nom).slice(0, 40),
      created_at: new Date(base + i + 1).toISOString(),
    }));
    return { groupe: a.p_groupe, lignes: plats.length, total: Number(f.prix), deja: false };
  },
  caisse_retirer_formule(ctx, a) {
    if (!ctx.uid) throw new ErreurRpc('caisse: connexion requise', '42501');
    const t = ctx.db.caisse_tickets.find((x) => x.id === a.p_ticket_id);
    if (!t) throw new ErreurRpc('caisse: ticket introuvable');
    if (!peutCaisseDemo(ctx)) throw new ErreurRpc('caisse: acces refuse', '42501');
    if (t.statut !== 'ouvert') throw new ErreurRpc('caisse: ticket fige, lignes comprises');
    const groupe = ctx.db.caisse_lignes.filter((l) => l.formule_groupe === a.p_groupe);
    if (groupe.some((l) => l.ticket_id !== t.id)) throw new ErreurRpc('caisse: formule partagee entre deux tickets');
    if (groupe.some((l) => l.statut !== 'en_attente') && !estDirection(ctx)) {
      throw new ErreurRpc('caisse: ligne deja envoyee (retrait par la direction seulement)');
    }
    groupe.forEach((l) => ctx.supprimer('caisse_lignes', l));
    return groupe.length;
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
  sejour_porter_ticket(ctx, a) {
    compteNote(ctx);
    if (!a.p_ticket_id || !a.p_sejour_id) throw new ErreurRpc('note: ticket ou séjour manquant', '22023');
    const t = ctx.db.caisse_tickets.find((x) => x.id === a.p_ticket_id);
    if (!t) throw new ErreurRpc('note: ticket introuvable', 'P0002');
    const hotel = peutHotelDemo(ctx);
    if (!peutCaisseDemo(ctx) && !hotel) throw new ErreurRpc('note: accès refusé', '42501');
    const deja = ligneOrigine(ctx, 'caisse_ticket', t.id);
    if (deja) {
      if (deja.sejour_id === a.p_sejour_id) return { ligne_id: deja.id, sejour_id: deja.sejour_id, montant: deja.montant, deja: true };
      throw new ErreurRpc('note: ticket déjà porté sur une autre note', '23505');
    }
    if (t.test) throw new ErreurRpc('note: ticket de test', '22023');
    if (t.statut !== 'encaisse' || t.numero == null) throw new ErreurRpc('note: ticket non encaissé', '22023');
    if (!t.closed_at || new Date(t.closed_at).getTime() < Date.now() - 14 * 86400000) throw new ErreurRpc('note: ticket trop ancien', '22023');
    const s = ctx.db.sejours.find((x) => x.id === a.p_sejour_id);
    if (!s || s.etablissement_id !== t.etablissement_id) throw new ErreurRpc('note: séjour introuvable', 'P0002');
    const limiteDepart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date(Date.now() - 14 * 86400000));
    if (!(s.statut === 'en_maison' || (s.statut === 'parti' && hotel && String(s.depart) >= limiteDepart))) throw new ErreurRpc('note: séjour pas en maison', '22023');
    const montant = montantChambre(ctx, t.id);
    if (!(montant > 0)) throw new ErreurRpc('note: aucun paiement sur la chambre', '22023');
    const l = ctx.inserer('sejour_lignes', {
      etablissement_id: t.etablissement_id, sejour_id: s.id, jour: t.jour_exploitation || jourZurich(), type: 'extra',
      libelle: `Restaurant, ticket n° ${numeroNote(t)}`, quantite: 1, prix_unitaire: montant, tva_taux: null,
      origine: 'caisse_ticket', origine_id: t.id, note: null,
    });
    return { ligne_id: l.id, sejour_id: s.id, montant, deja: false };
  },
  sejour_tickets_a_porter(ctx, a) {
    compteNote(ctx);
    if (!a.p_etablissement_id || !peutHotelDemo(ctx)) throw new ErreurRpc('note: accès refusé', '42501');
    const limite = Date.now() - 14 * 86400000;
    const tables = new Map((ctx.db.salle_tables || []).map((x) => [x.id, x.nom]));
    return ctx.db.caisse_tickets
      .filter((t) => t.etablissement_id === a.p_etablissement_id && t.statut === 'encaisse' && !t.test && t.numero != null
        && t.closed_at && new Date(t.closed_at).getTime() >= limite && !ligneOrigine(ctx, 'caisse_ticket', t.id))
      .map((t) => {
        const ps = ctx.db.caisse_paiements.filter((p) => p.ticket_id === t.id && estChambre(p));
        return { t, ps, montant: montantChambre(ctx, t.id) };
      })
      .filter((x) => x.montant > 0)
      .sort((x, y) => String(y.t.closed_at).localeCompare(String(x.t.closed_at)))
      .slice(0, 200)
      .map(({ t, ps, montant }) => ({
        ticket_id: t.id, numero: t.numero, annee: t.annee, jour: t.jour_exploitation, closed_at: t.closed_at, montant,
        libelle: ps.map((p) => p.libelle).sort()[0] || null, table_nom: tables.get(t.table_id) || null,
        encaisse_par: ps.map((p) => p.encaisse_par).sort()[0] || null,
      }));
  },
  sejour_reports_verifier(ctx, a) {
    compteNote(ctx);
    const s = ctx.db.sejours.find((x) => x.id === a.p_sejour_id);
    if (!s) throw new ErreurRpc('note: séjour introuvable', 'P0002');
    if (!peutHotelDemo(ctx)) throw new ErreurRpc('note: accès refusé', '42501');
    let n = 0;
    ctx.db.sejour_lignes.filter((l) => l.sejour_id === s.id && l.origine === 'caisse_ticket').forEach((l) => {
      const t = ctx.db.caisse_tickets.find((x) => x.id === l.origine_id);
      if (!t || t.statut !== 'annule' || ligneOrigine(ctx, 'caisse_annulation', t.id)) return;
      ctx.inserer('sejour_lignes', {
        etablissement_id: s.etablissement_id, sejour_id: s.id, jour: t.annule_jour || jourZurich(), type: 'remise',
        libelle: `Annulation du ticket n° ${numeroNote(t)}`, quantite: 1, prix_unitaire: -Number(l.prix_unitaire), tva_taux: null,
        origine: 'caisse_annulation', origine_id: t.id, note: null,
      });
      n += 1;
    });
    return n;
  },
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
    // Même forme que la fonction de la base : le jour d'exploitation sous la
    // clé jour, et options réduit à l'élément format (lot C).
    return {
      tickets: tickets.map((t) => ({ ...t, jour: t.jour_exploitation })),
      lignes: ctx.db.caisse_lignes.filter((l) => ids.has(l.ticket_id))
        .map((l) => ({ ...l, options: (Array.isArray(l.options) ? l.options : []).filter((o) => o?.type === 'format') })),
      paiements: ctx.db.caisse_paiements.filter((p) => ids.has(p.ticket_id)),
      clotures: ctx.db.caisse_clotures.filter((c) => c.etablissement_id === a.p_etablissement_id && c.jour_exploitation >= a.p_debut && c.jour_exploitation <= a.p_fin),
      bons: [],
      tpe: [],
    };
  },
  // Réservation de table en ligne (lot L9) : plan des salles ouvertes au
  // choix, même calcul et même forme que la fonction de la base.
  table_en_ligne_plan(ctx, a) {
    const params = (ctx.db.reservation_en_ligne_parametres || [])
      .find((p) => p.slug === String(a.p_adresse || '').trim().toLowerCase() && p.en_ligne_actif);
    if (!params || !a.p_jour || !a.p_heure || a.p_personnes == null) return { ouvert: false, raison: params ? 'parametres' : 'ferme' };
    const [h, m] = heureZurich().split(':').map(Number);
    return planEnLigne({
      params, salles: ctx.db.salles, tables: ctx.db.salle_tables, elements: ctx.db.salle_elements || [],
      reservations: ctx.db.reservations, liens: ctx.db.reservation_tables || [], ajustements: ctx.db.salle_tables_service || [],
      jour: a.p_jour, heure: String(a.p_heure).slice(0, 5), personnes: a.p_personnes, service: a.p_service || null,
      aujourdhui: jourZurich(), maintenant: h * 60 + m,
    });
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

  // Commande par QR (lot L3) : mêmes réponses que commande_qr_accepter et
  // commande_qr_refuser. Le bon de cuisine n'est pas simulé : les lignes
  // passent « envoyées », comme caisse_envoyer_bon de la démo. Une ligne qui
  // nomme un format (Carte des boissons, lot A) est posée au prix du format
  // à cet instant, avec son option ; un format disparu refuse la commande.
  commande_qr_accepter(ctx, a) {
    const c = (ctx.db.caisse_commandes_qr || []).find((x) => x.id === a.p_commande_id);
    if (!c) throw new ErreurRpc('commande_qr: commande introuvable');
    if (c.statut !== 'a_valider') return { deja: c.statut, ticket_id: c.ticket_id };
    if (Date.now() - new Date(c.created_at).getTime() > 3 * 3600000) {
      ctx.maj('caisse_commandes_qr', c, { statut: 'refusee', motif_refus: 'Commande expirée', traitee_par: ctx.uid, traitee_at: maintenant() });
      return { deja: 'refusee', expiree: true };
    }
    const plats = new Map(ctx.db.plats.map((p) => [p.id, p]));
    const formats = new Map((ctx.db.plat_formats || []).map((f) => [f.id, f]));
    const aPoser = (c.lignes || []).flatMap((l) => {
      const p = plats.get(l.plat_id);
      if (!p) return [];
      if (!l.format_id) return [{ plat_id: p.id, libelle: p.nom, quantite: l.quantite, prix_unitaire: p.prix_vente, options: [] }];
      const f = formats.get(l.format_id);
      if (!f || f.plat_id !== p.id) throw new ErreurRpc('commande_qr: un produit a disparu, commande a refuser');
      return [{ plat_id: p.id, libelle: `${p.nom}, ${f.libelle}`, quantite: l.quantite, prix_unitaire: f.prix,
        options: [{ type: 'format', id: f.id, valeur: f.libelle }] }];
    });
    let ticketId;
    if (!c.au_bar) {
      ticketId = RPC.caisse_ouvrir_ticket(ctx, { p_etablissement_id: c.etablissement_id, p_table_id: c.table_id, p_qui: 'passage', p_couverts: 1 }).ticket_id;
    } else {
      const heure = heureZurich().slice(0, 5);
      ticketId = ctx.inserer('caisse_tickets', {
        etablissement_id: c.etablissement_id, table_id: null, statut: 'ouvert', ouvert_par: ctx.uid, note: `Commande QR de ${c.prenom}`, closed_at: null,
        reservation_id: null, client_id: null, couverts: null, qui: null, test: false, numero: null, annee: null,
        service: heure < '16:00' ? 'midi' : 'soir', jour_exploitation: jourZurich(), a_emporter: false, total_ttc: null,
      }).id;
    }
    aPoser.forEach((l) => {
      ctx.inserer('caisse_lignes', {
        ticket_id: ticketId, ...l, suite: 1, statut: 'envoye', envoye_at: maintenant(), envoye_par: ctx.uid,
      });
    });
    ctx.maj('caisse_commandes_qr', c, { statut: 'acceptee', ticket_id: ticketId, traitee_par: ctx.uid, traitee_at: maintenant() });
    return { ticket_id: ticketId, lignes: (c.lignes || []).length, bon_id: null };
  },
  commande_qr_refuser(ctx, a) {
    const c = (ctx.db.caisse_commandes_qr || []).find((x) => x.id === a.p_commande_id);
    if (!c) throw new ErreurRpc('commande_qr: commande introuvable');
    if (c.statut !== 'a_valider') return { deja: c.statut };
    const motif = String(a.p_motif || '').trim();
    if (motif.length < 3 || motif.length > 200) throw new ErreurRpc('commande_qr: motif de 3 a 200 signes');
    ctx.maj('caisse_commandes_qr', c, { statut: 'refusee', motif_refus: motif, traitee_par: ctx.uid, traitee_at: maintenant() });
    return { ok: true };
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
