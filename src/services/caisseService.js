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

// Le refus que la base rend quand le poste n'est plus en mode test (mode
// expiré, ou quitté depuis un autre onglet). L'écran s'en sert pour revenir
// de lui-même en mode normal.
const MODE_TEST_INACTIF = 'caisse: mode test inactif sur ce poste';
const estRefusModeTest = (error) => String(error?.message || '') === MODE_TEST_INACTIF;

// Refus des RPC de la v5 (caisse_ouvrir_ticket, caisse_corriger_reservation) :
// la base les lève sans accents, l'écran les dit en clair.
const MESSAGES_RPC = {
  'caisse: acces refuse': "Vous n'avez pas les droits pour cette action.",
  'caisse: table inconnue pour cet etablissement': 'Cette table ne fait plus partie du plan de salle.',
  'caisse: reservation introuvable': 'Réservation introuvable.',
  "caisse: reservation d'un autre jour": "Cette réservation n'est pas du jour.",
  "caisse: cette reservation n'est pas attendue": "Cette réservation n'est plus attendue (annulée, partie ou no-show).",
  'caisse: fiche client introuvable': 'Fiche client introuvable ou archivée.',
  'caisse: nombre de couverts invalide': 'Nombre de couverts invalide (de 1 à 99).',
  'caisse: le nom ne peut pas etre vide': 'Le nom ne peut pas être vide.',
  'caisse: nom trop long': 'Nom trop long.',
  'caisse: ticket introuvable': 'Ticket introuvable.',
  'caisse: ce statut ne se pose pas depuis la caisse': 'Ce statut ne se pose pas depuis la caisse.',
  'caisse: le statut de cette reservation ne se change pas ici': 'Le statut de cette réservation se change dans Réservations.',
  'caisse: reservation de groupe, nom et couverts se corrigent dans Groupes': "Réservation d'un groupe : le nom et les couverts se corrigent dans Groupes.",
  'caisse: correction non enregistree': "La correction n'a pas été enregistrée. Réessayez.",
  // v6 : mode test, annonce des suites, retour « prêt ».
  [MODE_TEST_INACTIF]: "Le mode test n'est plus actif sur ce poste.",
  'caisse: poste invalide': 'Ce poste est mal identifié. Rechargez la page.',
  "caisse: un ticket de test s'ouvre depuis un poste en mode test": "Un ticket de test s'ouvre depuis un poste en mode test.",
  "caisse: le drapeau de test d'un ticket ne change jamais": "Un ticket de test reste un ticket de test.",
  'caisse: un ticket de test et un ticket reel ne se reunissent pas': 'Un ticket de test et un vrai ticket ne se réunissent pas.',
  "caisse: l'etat cuisine d'une ligne ne s'ecrit pas depuis l'ecran": "L'état cuisine d'une ligne ne se change pas ici.",
  "caisse: une ligne annoncee ne part que par l'envoi du bon": "Une ligne annoncée en cuisine ne part que par l'envoi du bon.",
};

function mapError(error, fallback) {
  if (!error) return null;
  console.error('[caisseService]', error);
  const brut = String(error.message || '');
  if (MESSAGES_RPC[brut]) return MESSAGES_RPC[brut];
  if (/^caisse: ticket \w+ fige$/.test(brut)) return 'Ce ticket est clos : il ne se corrige plus.';
  const code = String(error.code || '');
  if (MESSAGES[code]) return MESSAGES[code];
  // Les gardes de la base (déclencheurs caisse_*) lèvent des messages en
  // français déjà lisibles : les montrer tels quels.
  if (/^caisse/.test(String(error.message || ''))) return error.message;
  return fallback || 'Erreur technique. Réessayez.';
}

// Tickets ouverts de l'établissement, avec leurs lignes.
// v6 : un poste normal ne lit jamais un ticket de test, un poste en mode test
// ne lit que ceux-là. Le filtre est toujours posé (fermé par défaut).
export async function listTicketsOuverts(etablissementId, { test = false } = {}) {
  const { data, error } = await supabase
    .from('caisse_tickets')
    .select('*, caisse_lignes(*)')
    .eq('etablissement_id', etablissementId)
    .eq('statut', 'ouvert')
    .eq('test', Boolean(test))
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

// ── Qui est à la table (v5, migration 20261110_caisse_v5) ──
// Ouvre le ticket d'une table au nom d'une réservation, d'un client de passage
// ou d'une fiche du fichier clients. UNE RPC : le rôle serveur n'écrit pas les
// réservations lui-même. Idempotente au double tap (le second appel rend le
// ticket du premier, deja_ouvert vrai). La vente directe reste creerTicket.
// qui = 'reservation' | 'passage' | 'compte'.
// v6, mode test : test = true, le nom du poste et sa clé (rendue par
// testEntrer, gardée sur l'appareil). La base ouvre alors un ticket de test,
// sans rien écrire dans les réservations ni dans le fichier clients ; la table
// devient facultative (vente directe d'essai). Si le poste n'est plus en mode
// test, le refus est signalé par modeTestInactif.
export async function ouvrirTicket({
  etablissementId, tableId = null, qui = null, reservationId = null, clientId = null, couverts = null,
  test = false, poste = null, posteCle = null,
}) {
  const { data, error } = await supabase.rpc('caisse_ouvrir_ticket', {
    p_etablissement_id: etablissementId,
    p_table_id: tableId,
    p_qui: qui,
    p_reservation_id: reservationId,
    p_client_id: clientId,
    p_couverts: couverts,
    ...(test ? { p_test: true, p_poste: poste, p_poste_cle: posteCle } : null),
  });
  if (error) {
    return {
      data: null,
      error: mapError(error, "La table n'a pas pu être ouverte. Réessayez."),
      modeTestInactif: estRefusModeTest(error),
    };
  }
  return { data, error: null };
}

// ── Mode test (v6, migration 20261110_caisse_v6) ──
// Entrer : consultant, patron, resp_cuisine. La base rend alors la clé du
// poste (data.cle), une seule fois : l'appareil la garde, c'est elle qui
// prouve ensuite qu'il est bien le poste passé en mode test. Sortir :
// l'appareil qui tient la clé (toute personne qui a la caisse), ou un des
// trois rôles ; vider en sortant, ou vider seul : les trois mêmes rôles.
// Chaque geste laisse une ligne au journal du mode test.
export async function testEntrer(etablissementId, poste) {
  const { data, error } = await supabase.rpc('caisse_test_entrer', {
    p_etablissement_id: etablissementId, p_poste: poste,
  });
  if (error) return { data: null, error: mapError(error, "Le mode test n'a pas pu être activé. Réessayez.") };
  return { data, error: null };
}

export async function testSortir(etablissementId, poste, cle, vider = false) {
  const { data, error } = await supabase.rpc('caisse_test_sortir', {
    p_etablissement_id: etablissementId, p_poste: poste, p_cle: cle || null, p_vider: Boolean(vider),
  });
  if (error) return { data: null, error: mapError(error, "Le mode test n'a pas pu être quitté. Réessayez.") };
  return { data, error: null };
}

// Supprime TOUS les tickets de test de la maison, pas seulement ceux de ce
// poste (lignes, paiements et bons de cuisine de test compris). Rend
// { tickets, montant }.
export async function viderTests(etablissementId, poste) {
  const { data, error } = await supabase.rpc('caisse_vider_tests', {
    p_etablissement_id: etablissementId, p_poste: poste,
  });
  if (error) return { data: null, error: mapError(error, "Les tickets de test n'ont pas pu être vidés. Réessayez.") };
  return { data, error: null };
}

// L'état du poste vu par la base : { actif, tickets }.
export async function testEtat(etablissementId, poste, cle) {
  const { data, error } = await supabase.rpc('caisse_test_etat', {
    p_etablissement_id: etablissementId, p_poste: poste, p_cle: cle || null,
  });
  if (error) return { data: null, error: mapError(error, 'État du mode test illisible.') };
  return { data, error: null };
}

// Journal du mode test : lisible par consultant et patron (RLS), vide pour
// les autres rôles.
export async function listJournalTests(etablissementId, limite = 30) {
  const { data, error } = await supabase
    .from('caisse_tests_journal')
    .select('id, action, poste, auteur_nom, auteur_role, nombre, montant, detail, created_at')
    .eq('etablissement_id', etablissementId)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) return { data: null, error: mapError(error, 'Journal du mode test illisible.') };
  return { data: data || [], error: null };
}

// Correction d'une réservation par le service : rattachement du ticket, nom,
// couverts, statut vers 'arrive' ou 'no_show'. Rien d'autre ne s'écrit par ce
// chemin, et chaque correction laisse une ligne au Journal d'activité.
// Sans ticket (liste « Réservations sans ticket ») : ticketId absent.
export async function corrigerReservation({ etablissementId, reservationId, ticketId = null, nom = null, couverts = null, statut = null }) {
  const { data, error } = await supabase.rpc('caisse_corriger_reservation', {
    p_etablissement_id: etablissementId,
    p_reservation_id: reservationId,
    p_ticket_id: ticketId,
    p_nom: nom,
    p_couverts: couverts,
    p_statut: statut,
  });
  if (error) return { data: null, error: mapError(error, "La correction n'a pas pu être enregistrée. Réessayez.") };
  return { data, error: null };
}

// Réservations des jours donnés (aujourd'hui, et la veille pour un service qui
// passe minuit), annulées exclues, avec les tables posées et ce que la salle
// doit savoir du client. Ni e-mail ni téléphone : la caisse ne les lit pas.
export async function listReservations(etablissementId, dates) {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, nom, nb_couverts, heure_arrivee, date_service, service, statut, origine, client_id, groupe_evenement_id, reservation_tables(table_id), reservation_tags(type_tag, valeur), resa_clients(prenom, nom, allergies)')
    .eq('etablissement_id', etablissementId)
    .in('date_service', dates)
    .neq('statut', 'annule')
    .order('date_service', { ascending: true })
    .order('heure_arrivee', { ascending: true });
  if (error) return { data: null, error: mapError(error, 'Réservations illisibles. Réessayez.') };
  return { data: data || [], error: null };
}

// Fichier clients pour la recherche de la caisse : nom, prénom, allergies.
// Les coordonnées ne quittent pas la base.
export async function listClients(etablissementId) {
  const { data, error } = await supabase
    .from('resa_clients')
    .select('id, prenom, nom, allergies')
    .eq('etablissement_id', etablissementId)
    .eq('archive', false)
    .order('nom', { ascending: true })
    .limit(2000);
  if (error) return { data: null, error: mapError(error, 'Fichier clients illisible. Réessayez.') };
  return { data: data || [], error: null };
}

// Tickets d'un client pour sa fiche : ceux rattachés à sa fiche, et ceux
// ouverts sur l'une de ses réservations (un ticket pris avant le rattachement
// de la fiche garde client_id à null). Tickets annulés exclus. Lecture
// ouverte à tout membre de l'établissement (policy caisse_tickets_select).
export async function listTicketsClient(clientId, reservationIds = []) {
  // Le filtre .or() de PostgREST est du texte : seuls des identifiants simples
  // y entrent (lettres, chiffres, tirets), jamais une chaîne saisie.
  const simple = (id) => /^[\w-]+$/.test(String(id));
  if (!simple(clientId)) return { data: [], error: null };
  const ids = (reservationIds || []).filter(simple);
  let requete = supabase
    .from('caisse_tickets')
    .select('id, statut, created_at, closed_at, couverts, table_id, salle_tables(nom), caisse_lignes(libelle, quantite, prix_unitaire)')
    .neq('statut', 'annule')
    // v6 : jamais un ticket de test sur une fiche client.
    .eq('test', false)
    .order('created_at', { ascending: false })
    .limit(200);
  requete = ids.length
    ? requete.or(`client_id.eq.${clientId},reservation_id.in.(${ids.join(',')})`)
    : requete.eq('client_id', clientId);
  const { data, error } = await requete;
  if (error) return { data: null, error: mapError(error, 'Tickets illisibles. Réessayez.') };
  return { data: data || [], error: null };
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
    .select('options, created_at, caisse_tickets!inner(etablissement_id, test)')
    .eq('caisse_tickets.etablissement_id', etablissementId)
    // v6 : les essais du mode test ne nourrissent pas les rappels de la maison.
    .eq('caisse_tickets.test', false)
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

// Réclamer une suite (v6) : UNE RPC, même garde et même idempotence que
// l'envoi. Les plats annoncés en cuisine au premier envoi y sont libérés (pas
// recréés), ceux ajoutés depuis y partent. Rend { bon_id, lignes, annonces }.
export async function reclamerSuite(ticketId, suite) {
  const { data, error } = await supabase.rpc('caisse_reclamer_suite', {
    p_ticket_id: ticketId,
    p_suite: suite,
  });
  if (error) return { data: null, error: mapError(error, "La suite n'a pas pu être réclamée. Réessayez.") };
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
