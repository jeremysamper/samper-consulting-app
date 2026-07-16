export const roles = {
  consultant:   { label: 'Consultant culinaire',  color: '#003042' },
  patron:       { label: 'Patron / Directeur',    color: '#1a5276' },
  resp_cuisine: { label: 'Responsable cuisine',   color: '#1e6b40' },
  cuisinier:    { label: 'Cuisinier',             color: '#6c3483' },
  serveur:      { label: 'Serveur / Serveuse',    color: '#2e7ab8' },
  hote:         { label: 'Hôte / Réception',      color: '#0e7490' },
};

export const defaultPermissions = {
  consultant:   { dashboard: true,  planning: true,  recettes: true,  inventaire: true,  pertes: true,  haccp: true,  sop: true,  fiches_salle: true,  documents: true,  catalogue: true,  consultant_tools: true,  faq: true,  previsions: true,  pos: true,  commande: true, mep: true,  kds: true,  messages: true },
  patron:       { dashboard: true,  planning: true,  recettes: true,  inventaire: true,  pertes: true,  haccp: true,  sop: true,  fiches_salle: true,  documents: true,  catalogue: true,  consultant_tools: false, faq: false,  previsions: true,  pos: true,  commande: true, mep: true,  kds: false, messages: true },
  resp_cuisine: { dashboard: true,  planning: true,  recettes: true,  inventaire: true,  pertes: true,  haccp: true,  sop: true,  fiches_salle: true,  documents: true,  catalogue: true,  consultant_tools: false, faq: false,  previsions: true,  pos: true,  commande: true, mep: true,  kds: true,  messages: true },
  cuisinier:    { dashboard: true,  planning: true,  recettes: true,  inventaire: false, pertes: true,  haccp: true,  sop: true,  fiches_salle: false, documents: true,  catalogue: true,  consultant_tools: false, faq: false,  previsions: false, pos: true,  commande: true, mep: true,  kds: true,  messages: true },
  serveur:      { dashboard: true,  planning: true,  recettes: false, inventaire: false, pertes: false, haccp: false, sop: true,  fiches_salle: true,  documents: true,  catalogue: false, consultant_tools: false, faq: false,  previsions: true,  pos: false, commande: true, mep: false, kds: false, messages: true },
  hote:         { dashboard: false, planning: false, recettes: false, inventaire: false, pertes: false, haccp: false, sop: false, fiches_salle: false, documents: false, catalogue: false, consultant_tools: false, faq: false, previsions: true,  pos: false, commande: true, mep: false, kds: false, messages: true },
};

// Modules dont le droit « gérer » (modifier + supprimer) est configurable
// par rôle dans Rôles & accès → onglet « Droits d'action ».
// `defaultRoles` : rôles autorisés tant qu'aucun droit explicite n'est stocké
// en base ; sans cette clé, defaultManageRoles s'applique. Les défauts
// reproduisent les gardes historiques de chaque module.
// Volontairement absents : dashboard et messages (aucune action à restreindre),
// commande (la génération = IA, consultant only), kds (écran opérationnel du
// passe) et les pages consultant-only (garde dure par rôle dans LegacyModuleHost).
export const manageableModules = [
  { id: 'planning', label: 'Planning & Pointage', defaultRoles: ['consultant', 'patron', 'resp_cuisine'] },
  { id: 'recettes', label: 'Cartes & Recettes', defaultRoles: ['consultant', 'patron', 'resp_cuisine'] },
  { id: 'inventaire', label: 'Inventaire', defaultRoles: ['consultant', 'patron', 'resp_cuisine'] },
  { id: 'pertes', label: 'Pertes' },
  { id: 'haccp', label: 'HACCP' },
  { id: 'sop', label: 'SOPs & Checklists' },
  { id: 'fiches_salle', label: 'Fiches salle' },
  { id: 'documents', label: 'Documents' },
  { id: 'catalogue', label: 'Catalogue produits' },
  { id: 'previsions', label: 'Prévisions', defaultRoles: ['consultant', 'patron', 'resp_cuisine', 'hote'] },
  { id: 'mep', label: 'Mise en place', defaultRoles: ['resp_cuisine', 'cuisinier'] },
  { id: 'pos', label: 'Ventes POS', defaultRoles: ['consultant', 'patron', 'resp_cuisine'] },
];

// Rôles autorisés à gérer un module quand aucun droit explicite n'est défini.
export const defaultManageRoles = ['consultant', 'patron'];

// Rôles par défaut du droit « gérer » d'un module (defaultRoles du module,
// sinon defaultManageRoles).
export function getDefaultManageRoles(moduleId) {
  const entry = manageableModules.find((m) => m.id === moduleId);
  return entry?.defaultRoles || defaultManageRoles;
}

export const navItems = [
  { id: 'dashboard', label: 'Tableau de bord', mobileLabel: 'Accueil', icon: '◉', group: 'Général', permKey: 'dashboard' },
  { id: 'planning', label: 'Planning & Pointage', mobileLabel: 'Planning', icon: '◷', group: 'Général', permKey: 'planning' },
  { id: 'messages', label: 'Messages privés', mobileLabel: 'Messages', icon: '✉', group: 'Général', permKey: 'messages' },
  { id: 'cartes', label: 'Cartes & Recettes', mobileLabel: 'Recettes', icon: '◈', group: 'Cuisine', permKey: 'recettes' },
  { id: 'inventaire', label: 'Inventaire', icon: '▦', group: 'Cuisine', permKey: 'inventaire' },
  { id: 'pertes', label: 'Pertes', icon: '◬', group: 'Cuisine', permKey: 'pertes' },
  { id: 'haccp', label: 'HACCP', mobileLabel: 'HACCP', icon: '◎', group: 'Cuisine', permKey: 'haccp' },
  { id: 'sop', label: 'SOPs & Checklists', icon: '◻', group: 'Documents', permKey: 'sop' },
  { id: 'fiches_salle', label: 'Fiches salle', icon: '□', group: 'Documents', permKey: 'fiches_salle' },
  { id: 'documents', label: 'Documents', icon: '◱', group: 'Documents', permKey: 'documents' },
  { id: 'catalogue', label: 'Catalogue produits', icon: '◇', group: 'Consultant', permKey: 'catalogue' },
  { id: 'consultant_tools', label: 'Outils consultant', mobileLabel: 'Outils', icon: '◆', group: 'Consultant', permKey: 'consultant_tools' },
  { id: 'previsions', label: 'Prévisions', icon: '◐', group: 'Cuisine', permKey: 'previsions' },
  { id: 'commande', label: 'Commande', mobileLabel: 'Commande', icon: '◰', group: 'Cuisine', permKey: 'commande' },
  { id: 'mep', label: 'Mise en place', mobileLabel: 'Mise en place', icon: '◲', group: 'Cuisine', permKey: 'mep' },
  { id: 'pos', label: 'Ventes POS', icon: '◑', group: 'Cuisine', permKey: 'pos' },
  { id: 'kds', label: 'KDS Cuisine', mobileLabel: 'KDS', icon: '▣', group: 'Cuisine', permKey: 'kds' },
  { id: 'faq', label: 'FAQ & Assistant IA', mobileLabel: 'FAQ', icon: '✦', group: 'Aide', permKey: 'faq' }
];

// ─────────────────────────────────────────────────────────────────────────────
// Modules consultant-only - non présents dans navItems ni defaultPermissions.
// Leur accès est géré par condition directe dans LegacyModuleHost.jsx :
//   user.role === 'consultant' && permissions.consultant_tools !== false
//
//   • factures    → Facturation client        src/modules/factures/
//   • parametres  → Paramètres établissement  src/modules/parametres/
//   • roles       → Gestion rôles & accès     src/modules/roles/
// ─────────────────────────────────────────────────────────────────────────────

const pageAliases = {
  recettes: 'cartes',
  outils: 'consultant_tools',
  outils_consultant: 'consultant_tools',
  simulation: 'consultant_tools',
  simulation_carte: 'consultant_tools',
  roles_acces: 'roles',
  etablissements: 'parametres',
  assistant: 'faq',
  assistant_ia: 'faq',
  faq_ia: 'faq'
};

const consultantToolsTabAliases = {
  outils: 'recettes',
  outils_consultant: 'recettes',
  simulation: 'simulation',
  simulation_carte: 'simulation'
};

export function normalizePage(page) {
  return pageAliases[page] || page || 'dashboard';
}

export function getConsultantToolsTabForPage(page) {
  return consultantToolsTabAliases[page] || null;
}
