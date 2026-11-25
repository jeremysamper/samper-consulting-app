// Données de démo du lot 5 du plan 15 (modules de bureau et routines). Elles
// complètent la base sans toucher aux jeux des autres lots :
//   - deux cadeaux demandés, à remettre depuis « À faire maintenant » ;
//   - une procédure commencée par Inès ce matin (« Reprendre ») et une
//     procédure rappelée à l'heure qu'il est quand la base est créée, pour
//     l'équipe au planning ;
//   - deux fiches salle en brouillon, à publier en un geste ;
//   - deux alertes de cuisine (relevé HACCP, pertes), à transmettre à la
//     brigade par « Prévenir l'équipe ».
// Rien de neuf pour le front déjà en ligne : il ne lit ni rappel ni roles
// visibles, et les alertes sont des lignes d'alert_instances ordinaires.
import { ETAB, aujourdhui, instant } from './base.js';

const ID = (n) => `00000000-0000-4000-8000-0000000005${String(n).padStart(2, '0')}`;

// Heure de Zurich au moment où la base du jour est créée, arrondie à l'heure.
function heureCourante() {
  const hh = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', hour12: false }).format(new Date());
  return `${String(Number(hh) % 24).padStart(2, '0')}:00`;
}

export function commandesCadeaux(cadeaux) {
  const c = (i) => cadeaux[i]?.id || null;
  return [
    { id: ID(1), etablissement_id: ETAB, user_id: 'demo-cuisinier', cadeau_id: c(4), cout: cadeaux[4]?.cout || 150, statut: 'demandee', note: null, created_at: instant(aujourdhui(), '08:20'), traitee_par: null, traitee_le: null },
    { id: ID(2), etablissement_id: ETAB, user_id: 'demo-serv-2', cadeau_id: c(5), cout: cadeaux[5]?.cout || 120, statut: 'demandee', note: null, created_at: instant(aujourdhui(), '10:05'), traitee_par: null, traitee_le: null },
  ].filter((k) => k.cadeau_id);
}

// La troisième procédure est rappelée « à l'heure qu'il est » (rappel à une
// heure), pour toute l'équipe : elle paraît chez qui travaille maintenant.
export function procedures(sops) {
  const heure = heureCourante();
  return sops.map((s, i) => (i === 2
    ? { ...s, rappel_actif: true, rappel_moment: 'heure', rappel_heure: `${heure}:00`, roles_designes: [], rappel_jours: null }
    : s));
}

export function executionsDuJour(sops) {
  const sop = sops[3];
  if (!sop) return { executions: [], etats: [] };
  const exec = {
    id: ID(10), sop_id: sop.id, etablissement_id: ETAB, operateur_id: 'demo-cuisinier', operateur_nom: 'Inès Garnier',
    date_execution: aujourdhui(), heure_debut: instant(aujourdhui(), '07:40'), heure_fin: null, statut: 'en_cours',
    total_etapes: 0, etapes_cochees: 0, notes: '',
  };
  return { executions: [exec], etats: [] };
}

export function fichesEnBrouillon(fiches) {
  return fiches.map((f, i) => (i === 1 || i === 4 ? { ...f, statut: 'brouillon' } : f));
}

export function alertesCuisine() {
  const a = (n, rule, severity, title, message, module, h) => ({
    id: ID(20 + n), etablissement_id: ETAB, rule_id: null, rule_type: rule, severity, title, message, link_module: module,
    status: 'active', target_roles: ['patron', 'resp_cuisine', 'consultant'], target_user_ids: null, dedupe_key: `${rule}-${aujourdhui()}`,
    created_at: instant(aujourdhui(), h), resolved_at: null,
  });
  return [
    a(1, 'haccp_releve_manquant', 'warning', 'Relevé HACCP manquant', 'Chambre froide positive : pas de relevé depuis 10:00.', 'haccp', '11:15'),
    a(2, 'pertes_elevees', 'critical', 'Pertes élevées', 'CHF 186 de pertes cette semaine, au-dessus du seuil de CHF 150.', 'pertes', '09:30'),
  ];
}
