// Lot 05 du panel : porter un ticket de caisse sur la note de la chambre.
// Logique pure, sans React ni Supabase (tests : noteChambre.test.mjs).
//
// Le paiement « chambre » est un paiement `autre` au libellé « Chambre », que
// caisse_encaisser accepte tel quel. La base reconnaît ce paiement par la même
// règle que estPaiementChambre (sejour_porter_ticket, sejour_tickets_a_porter).
import { numeroTicket } from './tva.js';
import { zurichAjouterJours, zurichToday } from '../../utils/zurichTime.js';

export const LIBELLE_CHAMBRE = 'Chambre';

// Jours pendant lesquels la réception peut encore viser un séjour parti.
export const JOURS_RATTRAPAGE = 14;

// Vrai pour un paiement `autre`, hors bon cadeau, dont le libellé commence par
// « chambre » (casse et espaces ignorés).
export function estPaiementChambre(p) {
  if (!p || p.moyen !== 'autre') return false;
  if (p.bonCadeau || p.bonCadeauId || p.bon_cadeau_id) return false;
  return String(p.libelle || '').trim().toLowerCase().startsWith('chambre');
}

// Le bouton « Sur la chambre » : module Hébergement actif, ticket hors test,
// aucun paiement « chambre » déjà posé.
export function boutonChambreVisible({ hebergementActif, test, poses } = {}) {
  if (!hebergementActif || test) return false;
  return !(poses || []).some(estPaiementChambre);
}

// Les séjours qu'on peut choisir : en maison, et partis depuis 14 jours au plus
// quand `avecPartis` (un séjour parti se date par son départ). Filtre par
// numéro de chambre exact ou bout de nom de l'hôte, tri par numéro de chambre.
export function sejoursPourChoix(sejours, chambres, texte = '', { avecPartis = false, aujourdhui = zurichToday() } = {}) {
  const parId = new Map((chambres || []).map((c) => [c.id, c]));
  const limite = zurichAjouterJours(aujourdhui, -JOURS_RATTRAPAGE);
  const q = String(texte || '').trim().toLowerCase();
  const garde = (s) => {
    if (s.statut === 'en_maison') return true;
    return avecPartis && s.statut === 'parti' && !!s.depart && s.depart >= limite;
  };
  return (sejours || [])
    .filter(garde)
    .map((s) => ({ sejour: s, chambre: parId.get(s.chambreId) || null }))
    .filter(({ sejour, chambre }) => {
      if (!q) return true;
      const numero = String(chambre?.numero || '').trim().toLowerCase();
      if (numero && numero === q) return true;
      return String(sejour.nomHote || '').toLowerCase().includes(q);
    })
    .sort((a, b) => String(a.chambre?.numero || '').localeCompare(String(b.chambre?.numero || ''), 'fr', { numeric: true })
      || String(a.sejour.nomHote || '').localeCompare(String(b.sejour.nomHote || ''), 'fr'));
}

// Le libellé de la ligne de note, comme la base l'écrit.
export function libelleLigneNote(ticket) {
  const n = numeroTicket(ticket);
  return n ? `Restaurant, ticket n° ${n}` : 'Restaurant';
}

// Une ligne de note venue de la Caisse (ticket porté ou contre-ligne).
export const ligneDeLaCaisse = (ligne) => String(ligne?.origine || '').startsWith('caisse');
