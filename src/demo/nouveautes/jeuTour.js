// Retouches du jeu de démo pour le tour des nouveautés (?nouveautes=1 seulement).
// Elles corrigent ce que la mesure du lot 7 a vu manquer au jeu, pour que
// chaque nouveauté se voie. Sans le paramètre, creerBase() rend le jeu de
// l'intégration, intact.
import { ETAB, instant, jour } from '../donnees/base.js';
import { defaultPermissions } from '../../modules/moduleConfig.js';

const uidTour = (bloc, n) => `00000000-0000-4000-${bloc}-${String(n).padStart(12, '0')}`;

// Points : le cuisinier affichait « Mon solde, -88 points » (cadeau demandé au
// lot 5 au-delà de ses gains). Un mois de gestes en plus le remet au-dessus.
function soldeDuCuisinier(t) {
  const lignes = t.points_mouvements || [];
  const commande = (t.points_commandes || []).find((c) => c.user_id === 'demo-cuisinier');
  const gagne = lignes.filter((m) => m.user_id === 'demo-cuisinier').reduce((s, m) => s + (m.sens === 'debit' ? -1 : 1) * Number(m.points || 0), 0);
  const manque = Number(commande?.cout || 0) + 60 - gagne;
  if (manque <= 0) return;
  const gestes = [['inventaire_ligne', 'Inventaire compté'], ['haccp_releve', 'Relevé HACCP'], ['mep_faite', 'Mise en place cochée']];
  const nb = Math.ceil(manque / 9);
  for (let i = 0; i < nb; i += 1) {
    const [action, libelle] = gestes[i % gestes.length];
    lignes.push({
      id: uidTour('8f01', i + 1), etablissement_id: ETAB, user_id: 'demo-cuisinier', points: 9, action,
      source_table: null, source_id: null, sens: 'credit', libelle,
      created_at: instant(jour(-28 + (i % 27)), '10:30'), created_by: null, evenement: null,
    });
  }
}

// Réception : la persona « Réception » de la démo a le rôle hote, alors que le
// droit « gérer » d'Hébergement va par défaut au rôle receptionniste. La
// maison de démo le lui coche, comme Réglages > Rôles le ferait : le check-in
// paraît sur sa fiche d'arrivée.
function droitsDeLaReception(t) {
  if (t.permissions?.length) return;
  t.permissions = Object.entries(defaultPermissions).map(([role_key, perms]) => ({
    role_key,
    perms: role_key === 'hote' ? { ...perms, 'manage:hebergement': true } : perms,
    updated_at: '2026-11-01T08:00:00Z',
  }));
}

// KDS : la caisse avait trois tables, dont deux envoyées en cuisine, et le KDS
// disait « 0 à faire ». En base, l'envoi d'un bon pose kds_orders et
// kds_order_items ; le jeu ne les avait pas. Un bon par table envoyée, ses
// plats seulement (les boissons partent au bar).
function bonsDuKds(t) {
  if ((t.kds_orders || []).length) return;
  const boissons = new Set((t.plats || []).filter((p) => p.categorie === 'Boissons').map((p) => p.id));
  const nomTable = new Map((t.salle_tables || []).map((x) => [x.id, x.nom]));
  const ouverts = (t.caisse_tickets || []).filter((x) => x.statut === 'ouvert' && x.table_id);
  let n = 0;
  ouverts.forEach((ticket, rang) => {
    const plats = (t.caisse_lignes || []).filter((l) => l.ticket_id === ticket.id && l.statut === 'envoye' && !boissons.has(l.plat_id));
    if (!plats.length) return;
    const id = uidTour('8f02', rang + 1);
    const ouvert = plats[0].envoye_at || ticket.created_at;
    t.kds_orders.push({
      id, etablissement_id: ETAB, ls_check_uuid: `caisse:${ticket.id}:1:tour`, table_no: nomTable.get(ticket.table_id) || null,
      couverts: ticket.couverts || null, opened_at: ouvert, status: 'open', completed_at: null,
    });
    plats.forEach((l) => {
      n += 1;
      t.kds_order_items.push({
        id: uidTour('8f03', n), kds_order_id: id, ls_line_key: `caisse:${l.id}`, nom: l.libelle, sku: null,
        qty: l.quantite, modifiers: [], cours: null, fired_at: ouvert, active: true, a_suivre: false,
        bump_status: 'pending', bumped_at: null, bumped_by: null,
      });
    });
  });
}

// Fiches salle : tous les plats avaient leur fiche, « Depuis une recette »
// répondait « Tous les plats ont déjà une fiche salle ». Le dernier plat perd
// la sienne (ni l'une des deux fiches en brouillon, ni une fiche de carte vue
// en premier).
function unPlatSansFiche(t) {
  const fiches = t.fiches_salle || [];
  const derniere = [...fiches].reverse().find((f) => f.statut !== 'brouillon');
  if (!derniere) return;
  t.fiches_salle = fiches.filter((f) => f.id !== derniere.id);
  t.carte_fiches_salle = (t.carte_fiches_salle || []).filter((l) => l.fiche_salle_id !== derniere.id);
}

// Comptabilité : aucun manque dans la démo, la liste « Pour des chiffres
// justes » ne se voyait pas. La dernière facture du mois perd son taux de TVA.
function uneFactureSansTaux(t) {
  const factures = (t.achats_documents || []).filter((d) => d.type_document === 'facture' && /^ach-\d+$/.test(d.id));
  const derniere = factures.sort((a, b) => String(b.date_document).localeCompare(String(a.date_document)))[0];
  if (!derniere) return;
  derniere.tva_taux = null;
  derniere.montant_tva = null;
  derniere.total_ttc = null;
}

// Réservations : la démo ne travaille pas le lundi (ni réservation ni horaire),
// mais aucun jour de fermeture n'était déclaré : la semaine disait « Libre ».
// Le lundi devient un jour fermé, comme Réglages > Horaires et fermetures.
function lundiFerme(t) {
  if ((t.reglages_maison || []).some((r) => r.etablissement_id === ETAB)) return;
  t.reglages_maison = [...(t.reglages_maison || []), { etablissement_id: ETAB, fermetures: { jours_fermes: [1], services_fermes: {}, periodes: [] }, pointage: null, updated_at: '2026-11-01T08:00:00Z' }];
}

export function ajusterBasePourLeTour(t) {
  lundiFerme(t);
  soldeDuCuisinier(t);
  droitsDeLaReception(t);
  bonsDuKds(t);
  unPlatSansFiche(t);
  uneFactureSansTaux(t);
  return t;
}
