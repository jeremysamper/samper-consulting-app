export const roles = {
  consultant:   { label: 'Consultant culinaire',  color: '#003042' },
  patron:       { label: 'Patron / Directeur',    color: '#1a5276' },
  resp_cuisine: { label: 'Responsable cuisine',   color: '#1e6b40' },
  cuisinier:    { label: 'Cuisinier',             color: '#6c3483' },
  serveur:      { label: 'Serveur / Serveuse',    color: '#2e7ab8' },
  hote:         { label: 'Hôte / Réception',      color: '#0e7490' },
  praticien_spa: { label: 'Praticien(ne) spa',    color: '#2f6f77' },
  // Branche Hôtel (lot H1) : réception, gouvernante, femmes et valets de
  // chambre, technique. Mêmes listes dans create-user (validation.ts),
  // ai-proxy (ALL_ROLES) et spa-mailer (ROLES_EQUIPE).
  receptionniste:   { label: 'Réceptionniste',       color: '#2874a6' },
  gouvernante:      { label: 'Gouvernante',          color: '#7d6608' },
  femme_de_chambre: { label: 'Femme / valet de chambre', color: '#b7950b' },
  technicien:       { label: 'Technicien(ne)',       color: '#616a6b' },
};

export const defaultPermissions = {
  consultant:   { dashboard: true,  planning: true,  recettes: true,  inventaire: true,  pertes: true,  haccp: true,  sop: true,  fiches_salle: true,  documents: true,  catalogue: true,  consultant_tools: true,  faq: true,  previsions: true,  pos: true,  commande: true, mep: true,  kds: true,  messages: true, groupes: true, spa: true, journal: true, hebergement: true, etages: true , demandes: true, activites: true },
  patron:       { dashboard: true,  planning: true,  recettes: true,  inventaire: true,  pertes: true,  haccp: true,  sop: true,  fiches_salle: true,  documents: true,  catalogue: true,  consultant_tools: false, faq: false,  previsions: true,  pos: true,  commande: true, mep: true,  kds: false, messages: true, groupes: true, spa: true, journal: true, hebergement: true, etages: true , demandes: true, activites: true },
  resp_cuisine: { dashboard: true,  planning: true,  recettes: true,  inventaire: true,  pertes: true,  haccp: true,  sop: true,  fiches_salle: true,  documents: true,  catalogue: true,  consultant_tools: false, faq: false,  previsions: true,  pos: true,  commande: true, mep: true,  kds: true,  messages: true, groupes: true, spa: true, journal: false, hebergement: true, etages: false , demandes: true, activites: true },
  cuisinier:    { dashboard: true,  planning: true,  recettes: true,  inventaire: false, pertes: true,  haccp: true,  sop: true,  fiches_salle: false, documents: true,  catalogue: true,  consultant_tools: false, faq: false,  previsions: false, pos: true,  commande: true, mep: true,  kds: true,  messages: true, groupes: true, spa: true, journal: false, hebergement: false, etages: false , demandes: true, activites: true },
  serveur:      { dashboard: true,  planning: true,  recettes: false, inventaire: false, pertes: false, haccp: false, sop: true,  fiches_salle: true,  documents: true,  catalogue: false, consultant_tools: false, faq: false,  previsions: true,  pos: false, commande: true, mep: false, kds: false, messages: true, groupes: true, spa: true, journal: false, hebergement: false, etages: false , demandes: true, activites: true },
  hote:         { dashboard: false, planning: false, recettes: false, inventaire: false, pertes: false, haccp: false, sop: false, fiches_salle: false, documents: false, catalogue: false, consultant_tools: false, faq: false, previsions: true,  pos: false, commande: true, mep: false, kds: false, messages: true, groupes: true, spa: true, journal: false, hebergement: true, etages: true , demandes: true, activites: true },
  // Praticien(ne) spa : les soins en cabine. Spa & clients, son planning et la
  // messagerie ; rien de la cuisine ni de la salle.
  praticien_spa: { dashboard: false, planning: true, recettes: false, inventaire: false, pertes: false, haccp: false, sop: false, fiches_salle: false, documents: false, catalogue: false, consultant_tools: false, faq: false, previsions: false, pos: false, commande: false, mep: false, kds: false, messages: true, groupes: false, spa: true, journal: false, hebergement: false, etages: false , demandes: false, activites: false },
  // Rôles hôtel (lot H1). La réception tient les séjours, les réservations de
  // table et les groupes ; la gouvernante et les femmes et valets de chambre
  // tiennent les étages (la gouvernante lit aussi les séjours pour préparer
  // les arrivées) ; la technique lit les étages (chambres hors service) en
  // attendant son module (lot H8).
  receptionniste:   { dashboard: true,  planning: true,  recettes: false, inventaire: false, pertes: false, haccp: false, sop: false, fiches_salle: false, documents: true,  catalogue: false, consultant_tools: false, faq: false, previsions: true,  pos: false, commande: false, mep: false, kds: false, messages: true, groupes: true,  spa: false, journal: false, hebergement: true,  etages: true , demandes: true, activites: true },
  gouvernante:      { dashboard: true,  planning: true,  recettes: false, inventaire: false, pertes: false, haccp: false, sop: true,  fiches_salle: false, documents: true,  catalogue: false, consultant_tools: false, faq: false, previsions: false, pos: false, commande: false, mep: false, kds: false, messages: true, groupes: false, spa: false, journal: false, hebergement: true,  etages: true , demandes: true, activites: false },
  femme_de_chambre: { dashboard: false, planning: true,  recettes: false, inventaire: false, pertes: false, haccp: false, sop: true,  fiches_salle: false, documents: false, catalogue: false, consultant_tools: false, faq: false, previsions: false, pos: false, commande: false, mep: false, kds: false, messages: true, groupes: false, spa: false, journal: false, hebergement: false, etages: true , demandes: true, activites: false },
  technicien:       { dashboard: false, planning: true,  recettes: false, inventaire: false, pertes: false, haccp: false, sop: false, fiches_salle: false, documents: true,  catalogue: false, consultant_tools: false, faq: false, previsions: false, pos: false, commande: false, mep: false, kds: false, messages: true, groupes: false, spa: false, journal: false, hebergement: false, etages: true , demandes: true, activites: false },
};

// Modules dont le droit « gérer » (modifier + supprimer) est configurable
// dans Rôles & accès (case « Modifier », réglée personne par personne ;
// le rôle donne la valeur de départ).
// `defaultRoles` : rôles autorisés tant qu'aucun droit explicite n'est stocké
// en base ; sans cette clé, defaultManageRoles s'applique. Les défauts
// reproduisent les gardes historiques de chaque module.
// groupes : « gérer » = créer / modifier / annuler un groupe. Faire avancer
// l'état (à lire → lu → prêt) reste ouvert à tous les rôles, c'est le principe
// du code couleur. Défaut calqué sur le trigger (migration 20260920, élargie
// au cuisinier par 20260926).
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
  { id: 'previsions', label: 'Réservations', defaultRoles: ['consultant', 'patron', 'resp_cuisine', 'hote'] },
  { id: 'groupes', label: 'Groupes', defaultRoles: ['consultant', 'patron', 'resp_cuisine', 'cuisinier', 'hote'] },
  { id: 'mep', label: 'Mise en place', defaultRoles: ['resp_cuisine', 'cuisinier'] },
  { id: 'pos', label: 'Ventes POS', defaultRoles: ['consultant', 'patron', 'resp_cuisine'] },
  // spa : prendre les rendez-vous, tenir les fiches clients, rédiger les
  // comptes rendus de séance. Ouvert à toute l'équipe du spa par défaut.
  { id: 'spa', label: 'Spa', defaultRoles: ['consultant', 'patron', 'resp_cuisine', 'cuisinier', 'serveur', 'hote', 'praticien_spa'] },
  // Branche Hôtel (lot H0). hebergement : créer et modifier les séjours, les
  // chambres et leurs catégories. etages : changer le statut de ménage d'une
  // chambre, l'attribuer à quelqu'un, noter un motif hors service. La base lit
  // les mêmes cases (user_peut_gerer, migration 20261028_hotel_h0) : cochables
  // pour n'importe qui, sans verrou rolesEcritureBase.
  // Lot H1 : la réception gère les séjours ; gouvernante, femmes et valets de
  // chambre et réception changent les statuts (migration 20261028_hotel_h1,
  // mêmes rôles par défaut dans les policies).
  { id: 'hebergement', label: 'Hébergement', defaultRoles: ['consultant', 'patron', 'receptionniste'] },
  { id: 'etages', label: 'Étages', defaultRoles: ['consultant', 'patron', 'gouvernante', 'femme_de_chambre', 'receptionniste'] },
  // demandes (lot H2) : « gérer » = supprimer une demande ; créer et faire
  // avancer restent ouverts à toute l'équipe (RLS demandes_insert et _update).
  { id: 'demandes', label: 'Demandes', defaultRoles: ['consultant', 'patron', 'receptionniste'] },
  // activites (lot H5) : « gérer » = créer et modifier le programme, supprimer
  // une inscription ou une consommation ; inscrire et pointer restent ouverts à
  // toute l'équipe (RLS activite_inscriptions et consommations). Les forfaits
  // et leurs droits se modifient en direction seulement (policies).
  { id: 'activites', label: 'Activités et forfaits', defaultRoles: ['consultant', 'patron', 'receptionniste', 'hote'] },
];

// Rôles que la BASE laisse écrire dans un module (RLS fondée sur le rôle, relevée
// en prod le 30.09.2026). Un droit « gérer » accordé hors de ces rôles serait
// refusé par Supabase : canManageModule le refuse aussi, et Rôles & accès
// verrouille la case. Module absent = la base ne filtre que par établissement,
// ou suit elle-même la case « Modifier ».
//   mep        : mep_listes, mep_items
//   pos        : pos_item_recipe_mapping
// Réservations (previsions) : retiré le 01.10.2026. La RLS de ses cinq tables
// appelle user_peut_gerer('previsions', …) (migration 20261001), qui lit la
// même case « Modifier » que le front : cochable pour n'importe qui.
// Groupes : retiré le 28.10.2026, même mécanique (user_peut_gerer('groupes', …)
// dans la politique INSERT et le trigger, migration 20261028).
export const rolesEcritureBase = {
  mep:        ['consultant', 'resp_cuisine', 'cuisinier'],
  pos:        ['consultant', 'patron', 'resp_cuisine'],
};

// Rôles autorisés à gérer un module quand aucun droit explicite n'est défini.
export const defaultManageRoles = ['consultant', 'patron'];

// Droits d'action plus fins qu'un module entier, rattachés à un module. Même
// stockage que « gérer » (clé manage:<id> dans permissions et
// permissions_utilisateurs) : canManageModule(role, id) les lit côté front,
// user_peut_gerer(id, …) côté base.
//   factures_achat : marquer une facture d'achat réglée (Inventaire, onglet
//   Factures). Vérifié en base par le déclencheur achats_documents_garde_reglement
//   (migration 20261007), avec les mêmes rôles par défaut : les tenir en phase.
//   fiches : créer, modifier et dupliquer les fiches et les plats dans
//   Cartes & Recettes. Demande aussi « Modifier » du module (requiertGerer).
//   Garde de présentation seulement : recettes, plats, plat_recettes et
//   carte_plats ne vérifient en base que l'établissement (user_can_access_etab).
export const droitsAction = [
  { id: 'factures_achat', module: 'inventaire', label: 'Régler les factures', defaultRoles: ['consultant', 'patron'] },
  { id: 'fiches', module: 'recettes', label: 'Créer et modifier les fiches', defaultRoles: ['consultant', 'patron'], requiertGerer: true },
  //   inspection : passer une chambre « inspectée » (Étages, lot H1). Vérifié
  //   en base par le déclencheur chambres_garde_colonnes (migration
  //   20261028_hotel_h1), mêmes rôles par défaut : les tenir en phase.
  { id: 'inspection', module: 'etages', label: 'Inspecter les chambres', defaultRoles: ['consultant', 'patron', 'gouvernante'], requiertGerer: true },
];

// Rôles par défaut du droit « gérer » d'un module ou d'un droit d'action
// (defaultRoles de l'entrée, sinon defaultManageRoles).
export function getDefaultManageRoles(moduleId) {
  const entry = manageableModules.find((m) => m.id === moduleId)
    || droitsAction.find((d) => d.id === moduleId);
  return entry?.defaultRoles || defaultManageRoles;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modules mis de côté : leur code reste dans src/modules/<dossier>/, mais ils
// sortent du menu, de la palette de commandes, des liens des autres modules et
// des routes (une page mémorisée ou un lien tombe sur un écran « mis de côté »).
// Pour ressortir un module : retirer son id de cette liste, rien d'autre.
//   • faq  → FAQ & Assistant IA (src/modules/faq/), mis de côté le 29.09.2026.
//     La traduction de l'app passe aussi par ai-proxy mais pas par ce module :
//     elle n'est pas concernée.
// ─────────────────────────────────────────────────────────────────────────────
export const modulesEnPause = ['faq'];

// Tous les modules, mis de côté compris (libellés des écrans « mis de côté »).
export const tousLesNavItems = [
  // Pas de mobileLabel : sur la page d'accueil tactile, le bouton du tableau
  // de bord s'appelle « Tableau de bord » (l'accueil, c'est la page elle-même).
  { id: 'dashboard', label: 'Tableau de bord', icon: '◉', group: 'Général', permKey: 'dashboard' },
  { id: 'planning', label: 'Planning & Pointage', mobileLabel: 'Planning', icon: '◷', group: 'Général', permKey: 'planning' },
  { id: 'messages', label: 'Messages privés', mobileLabel: 'Messages', icon: '✉', group: 'Général', permKey: 'messages' },
  // Journal d'activité : consultant et patron seulement (garde dure, miroir de la RLS).
  { id: 'journal', label: "Journal d'activité", mobileLabel: 'Journal', icon: '☰', group: 'Général', permKey: 'journal' },
  { id: 'cartes', label: 'Cartes & Recettes', mobileLabel: 'Recettes', icon: '◈', group: 'Cuisine', permKey: 'recettes' },
  { id: 'inventaire', label: 'Inventaire', icon: '▦', group: 'Cuisine', permKey: 'inventaire' },
  // Factures & achats : entrée à part, rattachée aux droits de l'Inventaire
  // (même clé, comme le pointage sur le planning) : visible pour les mêmes
  // personnes, dans les mêmes établissements. `rattacheA` : pas de case à
  // elle dans Paramètres ni dans Rôles & accès, pas de chiffre Alt, placée
  // juste après son module tant que l'ordre du menu ne la range pas.
  { id: 'achats', label: 'Factures & achats', icon: '▧', group: 'Cuisine', permKey: 'inventaire', rattacheA: 'inventaire' },
  { id: 'pertes', label: 'Pertes', icon: '◬', group: 'Cuisine', permKey: 'pertes' },
  { id: 'haccp', label: 'HACCP', mobileLabel: 'HACCP', icon: '◎', group: 'Cuisine', permKey: 'haccp' },
  { id: 'sop', label: 'SOPs & Checklists', icon: '◻', group: 'Documents', permKey: 'sop' },
  { id: 'fiches_salle', label: 'Fiches salle', icon: '□', group: 'Documents', permKey: 'fiches_salle' },
  { id: 'documents', label: 'Documents', icon: '◱', group: 'Documents', permKey: 'documents' },
  { id: 'catalogue', label: 'Catalogue produits', icon: '◇', group: 'Consultant', permKey: 'catalogue' },
  { id: 'consultant_tools', label: 'Outils consultant', mobileLabel: 'Outils', icon: '◆', group: 'Consultant', permKey: 'consultant_tools' },
  { id: 'previsions', label: 'Réservations', icon: '◐', group: 'Cuisine', permKey: 'previsions' },
  { id: 'groupes', label: 'Groupes', icon: '▤', group: 'Cuisine', permKey: 'groupes' },
  { id: 'commande', label: 'Commande', mobileLabel: 'Commande', icon: '◰', group: 'Cuisine', permKey: 'commande' },
  { id: 'mep', label: 'Mise en place', mobileLabel: 'Mise en place', icon: '◲', group: 'Cuisine', permKey: 'mep' },
  { id: 'pos', label: 'Ventes POS', icon: '◑', group: 'Cuisine', permKey: 'pos' },
  { id: 'kds', label: 'KDS Cuisine', mobileLabel: 'KDS', icon: '▣', group: 'Cuisine', permKey: 'kds' },
  { id: 'spa', label: 'Spa & clients', mobileLabel: 'Spa', icon: '❀', group: 'Spa', permKey: 'spa' },
  // Branche Hôtel (lot H0) : modules « à activer », cochés d'office quand le
  // type de l'établissement est Hôtel ou Hôtel-Restaurant (TYPES_HOTEL).
  { id: 'hebergement', label: 'Hébergement', icon: '⌂', group: 'Hôtel', permKey: 'hebergement' },
  { id: 'etages', label: 'Étages', icon: '▥', group: 'Hôtel', permKey: 'etages' },
  // Lot H2 : demandes d'un hôte ou d'un collègue adressées à un pôle.
  { id: 'demandes', label: 'Demandes', icon: '◉', group: 'Hôtel', permKey: 'demandes' },
  // Lot H5 : programme d'activités, forfaits all inclusive et consommations.
  { id: 'activites', label: 'Activités', icon: '✦', group: 'Hôtel', permKey: 'activites' },
  { id: 'faq', label: 'FAQ & Assistant', mobileLabel: 'FAQ', icon: '✦', group: 'Aide', permKey: 'faq' }
];

export const navItems = tousLesNavItems.filter((item) => !modulesEnPause.includes(item.id));

// ─────────────────────────────────────────────────────────────────────────────
// Modules activés par établissement (colonne etablissements.modules_actifs).
// Le consultant choisit, établissement par établissement, les modules proposés
// dans le menu. Se cumule avec les permissions par rôle : un module doit être
// activé pour l'établissement ET permis au rôle pour apparaître.
//
// Toujours présents, jamais désactivables : le tableau de bord (page d'accueil,
// point de chute de toute navigation ; sauf dans un spa, voir TYPE_SPA) et les
// outils du consultant, qui travaillent sur tous ses établissements.
// ─────────────────────────────────────────────────────────────────────────────
export const alwaysOnModuleKeys = ['dashboard', 'consultant_tools', 'faq', 'journal'];

// Modules que le consultant peut activer ou non, dans l'ordre du menu par défaut.
// Une entrée rattachée suit la case de son module.
export const etabToggleableModules = navItems.filter((item) => !alwaysOnModuleKeys.includes(item.permKey) && !item.rattacheA);

// Modules « à activer » : hors du périmètre restaurant, ils ne s'affichent que
// dans un établissement qui les a explicitement cochés. Un établissement jamais
// réglé (modules_actifs NULL) ne les voit donc pas : le spa n'apparaît pas au
// Rucher le jour de sa mise en ligne, ni Hébergement et Étages aux hôtels déjà
// en base tant que le consultant ne les a pas cochés.
export const optInModuleKeys = ['spa', 'hebergement', 'etages', 'demandes', 'activites'];

// Modules d'un établissement jamais réglé (modules_actifs NULL).
export const defaultEtabModuleKeys = etabToggleableModules
  .map((item) => item.permKey)
  .filter((key) => !optInModuleKeys.includes(key));

// ─────────────────────────────────────────────────────────────────────────────
// Types d'établissement (colonne etablissements.type, texte libre en base).
//
// Un spa n'a pas l'outillage d'un restaurant : à sa création, seuls « Spa &
// clients » et « Planning & Pointage » sont cochés, et il n'a PAS de tableau de
// bord (sa page d'accueil est le module Spa). Le consultant garde ses outils.
// ─────────────────────────────────────────────────────────────────────────────
export const TYPE_SPA = 'Spa';
export const TYPES_ETABLISSEMENT = [
  'Restaurant', 'Restaurant gastronomique', 'Brasserie', 'Bistrot', 'Hôtel-Restaurant', 'Hôtel', 'Café-Restaurant',
  'Traiteur', 'Collectivité', TYPE_SPA, 'Autre',
];
export const MODULES_SPA = ['spa', 'planning'];

const normaliserType = (type) => String(type || '').trim().toLowerCase();
export const estTypeSpa = (type) => normaliserType(type) === TYPE_SPA.toLowerCase();
export const estEtablissementSpa = (etablissement) => estTypeSpa(etablissement?.type);

// Branche Hôtel (lot H0) : un hôtel garde tout l'outillage restaurant et reçoit
// en plus Hébergement et Étages. Le type ne ferme rien : il préremplit
// modules_actifs au choix du type, le consultant ajuste ensuite. Un hôtel déjà
// en base ne change pas tant que ses modules ne sont pas recochés.
export const TYPES_HOTEL = ['Hôtel', 'Hôtel-Restaurant'];
export const MODULES_HOTEL = ['hebergement', 'etages', 'demandes', 'activites'];
export const estTypeHotel = (type) => TYPES_HOTEL.some((t) => t.toLowerCase() === normaliserType(type));
export const estEtablissementHotel = (etablissement) => estTypeHotel(etablissement?.type);

// Modules cochés d'office quand on choisit un type (null = modules standard).
export const modulesParDefautDuType = (type) => {
  if (estTypeSpa(type)) return [...MODULES_SPA];
  if (estTypeHotel(type)) return [...defaultEtabModuleKeys, ...MODULES_HOTEL];
  return null;
};

// modulesActifs null / absent = tous les modules sauf ceux « à activer ».
export function isModuleActiveForEtab(etablissement, permKey) {
  if (permKey === 'dashboard' && estEtablissementSpa(etablissement)) return false;
  if (!permKey || alwaysOnModuleKeys.includes(permKey)) return true;
  const actifs = etablissement?.modulesActifs;
  if (!Array.isArray(actifs)) return !optInModuleKeys.includes(permKey);
  return actifs.includes(permKey);
}

// Coque tactile (tablette, téléphone, useShellMode) : la page d'accueil à gros
// boutons, quel que soit l'établissement (un spa y a Spa, Planning, Messages).
// Ordinateur : le tableau de bord quand l'établissement en a un ; sinon le
// module Spa pour un spa, à défaut le premier module du menu activé et permis
// au rôle.
export function pageAccueil(etablissement, permissions = {}, shellMode = 'ordinateur') {
  if (shellMode === 'tablette' || shellMode === 'telephone') return 'accueil';
  if (isModuleActiveForEtab(etablissement, 'dashboard')) return 'dashboard';
  const permis = (item) => isModuleActiveForEtab(etablissement, item.permKey) && permissions[item.permKey] !== false;
  const spa = navItems.find((item) => item.id === 'spa');
  if (estEtablissementSpa(etablissement) && spa && permis(spa)) return 'spa';
  const premier = navItems.find((item) => !alwaysOnModuleKeys.includes(item.permKey) && permis(item));
  return premier?.id || 'dashboard';
}

// Même règle à partir d'un identifiant de page (raccourcis, liens internes).
// Les pages hors menu (paramètres, rôles, factures) ne sont jamais filtrées.
const pagePermKeys = { pointage: 'planning' };
export function estEnPause(page) {
  return modulesEnPause.includes(normalizePage(page));
}

export function isPageActiveForEtab(etablissement, page) {
  const id = normalizePage(page);
  if (modulesEnPause.includes(id)) return false;
  const permKey = pagePermKeys[id] || navItems.find((item) => item.id === id)?.permKey;
  return isModuleActiveForEtab(etablissement, permKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Modules consultant-only - non présents dans navItems ni defaultPermissions.
// Leur accès est géré par condition directe dans LegacyModuleHost.jsx :
//   user.role === 'consultant' && permissions.consultant_tools !== false
//
//   • factures    → Facturation client        src/modules/factures/
//   • parametres  → Paramètres établissement  src/modules/parametres/
//   • roles       → Gestion rôles & accès     src/modules/roles/
//   • compte      → Espace Compte             src/modules/compte/
// ─────────────────────────────────────────────────────────────────────────────

// Espace Compte (D18) : l'administration de l'app des brigades, sortie des
// Outils consultant le 28.10.2026 (Paramètres, Rôles & accès, Alertes, plus
// tard Abonnement). Ouvert à qui ouvre les Outils consultant aujourd'hui, et à
// personne d'autre. L7 l'ouvrira au patron (D16) : cette fonction, et la liste
// des rôles de chaque onglet dans Compte.jsx, sont les deux seuls endroits à
// changer. Le bouton « Compte » (barre latérale, accueil tactile, palette) et
// LegacyModuleHost lisent cette fonction.
export function peutOuvrirCompte(user, permissions = {}) {
  return user?.role === 'consultant' && permissions?.consultant_tools !== false;
}

// Entrée « Compte » de la palette Ctrl+K : hors du menu (pas de case de droit,
// pas de chiffre Alt), rattachée aux Outils consultant comme Factures & achats
// l'est à l'Inventaire.
export const ENTREE_COMPTE = { id: 'compte', label: 'Compte', group: 'Consultant', rattacheA: 'consultant_tools' };

// Onglets d'administration des Outils consultant passés dans Compte : un
// ancien lien vers l'un d'eux ouvre Compte sur l'onglet correspondant.
const ongletsCompteDepuisOutils = { roles: 'roles', etablissements: 'parametres', alertes: 'alertes' };
export function ongletCompteDepuisOutils(tab) {
  return ongletsCompteDepuisOutils[tab] || null;
}

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
  outils: 'chiffrage',
  outils_consultant: 'chiffrage',
  // Onglet Simulation retiré le 27.10.2026 : ses anciens liens ouvrent Chiffrage.
  simulation: 'chiffrage',
  simulation_carte: 'chiffrage'
};

export function normalizePage(page) {
  return pageAliases[page] || page || 'dashboard';
}

export function getConsultantToolsTabForPage(page) {
  return consultantToolsTabAliases[page] || null;
}
