export const roles = {
  consultant: { label: 'Consultant culinaire', color: '#92702A' },
  patron: { label: 'Patron / Directeur', color: '#1a5276' },
  resp_cuisine: { label: 'Responsable cuisine', color: '#1e6b40' },
  cuisinier: { label: 'Cuisinier', color: '#6c3483' },
  serveur: { label: 'Serveur / Serveuse', color: '#2e7ab8' }
};

export const defaultPermissions = {
  consultant: { dashboard: true, planning: true, recettes: true, inventaire: true, pertes: true, haccp: true, sop: true, fiches_salle: true, documents: true, catalogue: true, consultant_tools: true, faq: true },
  patron: { dashboard: true, planning: true, recettes: true, inventaire: true, pertes: true, haccp: true, sop: true, fiches_salle: true, documents: true, catalogue: true, consultant_tools: false, faq: true },
  resp_cuisine: { dashboard: true, planning: true, recettes: true, inventaire: true, pertes: true, haccp: true, sop: true, fiches_salle: true, documents: true, catalogue: true, consultant_tools: false, faq: true },
  cuisinier: { dashboard: true, planning: true, recettes: true, inventaire: false, pertes: true, haccp: true, sop: true, fiches_salle: false, documents: true, catalogue: true, consultant_tools: false, faq: true },
  serveur: { dashboard: true, planning: true, recettes: false, inventaire: false, pertes: false, haccp: false, sop: true, fiches_salle: true, documents: true, catalogue: false, consultant_tools: false, faq: true }
};

// Modules dont le droit « gérer » (modifier + supprimer) est configurable
// par rôle dans Rôles & accès → onglet « Droits d'action ».
// Par défaut, seuls consultant et patron peuvent gérer ces modules.
export const manageableModules = [
  { id: 'fiches_salle', label: 'Fiches salle' },
  { id: 'sop', label: 'SOPs & Checklists' },
  { id: 'pertes', label: 'Pertes' },
  { id: 'haccp', label: 'HACCP' },
  { id: 'documents', label: 'Documents' },
];

// Rôles autorisés à gérer un module quand aucun droit explicite n'est défini.
export const defaultManageRoles = ['consultant', 'patron'];

export const navItems = [
  { id: 'dashboard', label: 'Tableau de bord', mobileLabel: 'Accueil', icon: '◉', group: 'Général', permKey: 'dashboard' },
  { id: 'planning', label: 'Planning & Pointage', mobileLabel: 'Planning', icon: '◷', group: 'Général', permKey: 'planning' },
  { id: 'cartes', label: 'Cartes & Recettes', mobileLabel: 'Recettes', icon: '◈', group: 'Cuisine', permKey: 'recettes' },
  { id: 'inventaire', label: 'Inventaire', icon: '▦', group: 'Cuisine', permKey: 'inventaire' },
  { id: 'pertes', label: 'Pertes', icon: '◬', group: 'Cuisine', permKey: 'pertes' },
  { id: 'haccp', label: 'HACCP', mobileLabel: 'HACCP', icon: '◎', group: 'Cuisine', permKey: 'haccp' },
  { id: 'sop', label: 'SOPs & Checklists', icon: '◻', group: 'Documents', permKey: 'sop' },
  { id: 'fiches_salle', label: 'Fiches salle', icon: '□', group: 'Documents', permKey: 'fiches_salle' },
  { id: 'documents', label: 'Documents', icon: '◱', group: 'Documents', permKey: 'documents' },
  { id: 'catalogue', label: 'Catalogue produits', icon: '◇', group: 'Consultant', permKey: 'catalogue' },
  { id: 'consultant_tools', label: 'Outils consultant', mobileLabel: 'Outils', icon: '◆', group: 'Consultant', permKey: 'consultant_tools' },
  { id: 'faq', label: 'FAQ & Assistant IA', mobileLabel: 'FAQ', icon: '✦', group: 'Aide', permKey: 'faq' }
];

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
