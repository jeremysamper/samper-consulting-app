// ════════════════════════════════════════════════════════════════
// Glossaire statique FR → EN.
//
// Couvre le vocabulaire d'interface le plus fréquent (navigation, actions,
// statuts, en-têtes de tableaux, catégories produits). Ces chaînes sont
// traduites INSTANTANÉMENT, hors-ligne et sans aucun appel IA : c'est ce qui
// donne l'impression d'une app réellement bilingue au moment du basculement.
//
// Tout le reste (contenu saisi par les équipes : recettes, étapes, notes,
// commentaires…) part à l'IA, puis est mis en cache local. Voir domTranslator.js
//
// Les clés sont les chaînes françaises EXACTES telles qu'affichées. Les préfixes
// et suffixes non alphabétiques (emoji, flèches, « … », « : », « * ») sont
// gérés par le moteur : inutile de les répéter ici.
// ════════════════════════════════════════════════════════════════
import { normalizeSearch } from '../utils/searchText.js';

export const UI_GLOSSARY = {
  // ── Navigation / modules ──
  'Tableau de bord': 'Dashboard',
  'Planning & Pointage': 'Schedule & Time clock',
  'Planning': 'Schedule',
  'Pointage': 'Time clock',
  'Inventaire': 'Inventory',
  'Pertes': 'Waste',
  'Prévisions': 'Forecasts',
  'Commande': 'Ordering',
  'Mise en place': 'Mise en place',
  'Cartes & Recettes': 'Menus & Recipes',
  'Recettes': 'Recipes',
  'Cartes': 'Menus',
  'Carte': 'Menu',
  'Fiches salle': 'Service sheets',
  'Fiche salle': 'Service sheet',
  'Documents': 'Documents',
  'Factures': 'Invoices',
  'Facture': 'Invoice',
  'Ventes POS': 'POS sales',
  'KDS Cuisine': 'Kitchen KDS',
  'SOPs & Checklists': 'SOPs & Checklists',
  'Outils consultant': 'Consultant tools',
  'FAQ & Assistant IA': 'FAQ & AI assistant',
  'Messages privés': 'Private messages',
  'Messages': 'Messages',
  'Catalogue produits': 'Product catalogue',
  'Catalogue': 'Catalogue',
  'Paramètres': 'Settings',
  'Rôles': 'Roles',
  'Rôle': 'Role',
  'Établissement': 'Site',
  'Établissements': 'Sites',
  'Déconnexion': 'Sign out',
  'Connexion': 'Sign in',
  'Menu': 'Menu',
  'Retour': 'Back',
  'Accueil': 'Home',

  // ── Rôles ──
  'Consultant culinaire': 'Culinary consultant',
  'Patron / Directeur': 'Owner / Manager',
  'Responsable cuisine': 'Head chef',
  'Cuisinier': 'Cook',
  'Serveur / Serveuse': 'Waiter / Waitress',
  'Hôte / Réception': 'Host / Front desk',
  'Commis': 'Commis',
  'Chef de partie': 'Chef de partie',
  'Brigade': 'Brigade',
  'Cuisine': 'Kitchen',
  'Salle': 'Front of house',
  'Service': 'Service',
  'Équipe': 'Team',
  'Utilisateur': 'User',
  'Utilisateurs': 'Users',

  // ── Actions ──
  'Annuler': 'Cancel',
  'Fermer': 'Close',
  'Supprimer': 'Delete',
  'Enregistrer': 'Save',
  'Sauvegarder': 'Save',
  'Modifier': 'Edit',
  'Ajouter': 'Add',
  'Créer': 'Create',
  'Nouveau': 'New',
  'Nouvelle': 'New',
  'Imprimer': 'Print',
  'Exporter': 'Export',
  'Export PDF': 'Export PDF',
  'Exporter Excel': 'Export to Excel',
  'Importer': 'Import',
  'Rechercher': 'Search',
  'Filtrer': 'Filter',
  'Filtres': 'Filters',
  'Valider': 'Confirm',
  'Confirmer': 'Confirm',
  'Réessayer': 'Try again',
  'Renommer': 'Rename',
  'Dupliquer': 'Duplicate',
  'Déplacer': 'Move',
  'Retirer': 'Remove',
  'Ignorer': 'Skip',
  'Appliquer': 'Apply',
  'Réinitialiser': 'Reset',
  'Sélectionner': 'Select',
  'Tout sélectionner': 'Select all',
  'Tout désélectionner': 'Deselect all',
  'Développer': 'Expand',
  'Réduire': 'Collapse',
  'Voir': 'View',
  'Voir tout': 'View all',
  'Détails': 'Details',
  'Télécharger': 'Download',
  'Envoyer': 'Send',
  'Partager': 'Share',
  'Archiver': 'Archive',
  'Restaurer': 'Restore',
  // Cartes cachées : visibles du seul consultant.
  'Cacher': 'Hide',
  'Rendre visible': 'Make visible',
  'Cachée': 'Hidden',
  'Dupliquer la recette': 'Duplicate recipe',
  // Étiquettes DLC (HACCP). « + Ajouter une étiquette » se résout ici : les
  // affixes sont retirés avant lookup, le « + » est réappliqué après.
  'Ajouter une étiquette': 'Add a label',
  'Ajouter l\'étiquette': 'Add label',
  'Modifier l\'étiquette': 'Edit label',
  'Reconnecter': 'Reconnect',
  'Connecter Lightspeed': 'Connect Lightspeed',
  'Précédent': 'Previous',
  'Suivant': 'Next',
  'Terminer': 'Finish',
  'Continuer': 'Continue',
  'Mode clair': 'Light mode',
  'Mode sombre': 'Dark mode',
  'Rechercher un produit': 'Search for a product',
  'Rechercher une recette': 'Search for a recipe',
  'Rechercher un plat': 'Search for a dish',
  'Rechercher un ingrédient': 'Search for an ingredient',

  // ── Statuts ──
  'Statut': 'Status',
  'Actif': 'Active',
  'Inactif': 'Inactive',
  'Active': 'Active',
  'Brouillon': 'Draft',
  'Validé': 'Approved',
  'Validée': 'Approved',
  'Confirmé': 'Confirmed',
  'Confirmée': 'Confirmed',
  'Archivée': 'Archived',
  'Archivé': 'Archived',
  'En cours': 'In progress',
  'Terminé': 'Done',
  'Terminée': 'Done',
  'En attente': 'Pending',
  'En poste': 'On shift',
  'Absent': 'Absent',
  'Conforme': 'Compliant',
  'Non conforme': 'Non-compliant',
  'Tout conforme': 'All compliant',
  'Critique': 'Critical',
  'Alerte': 'Alert',
  'Alertes': 'Alerts',
  'Urgent': 'Urgent',
  'Interrompu': 'Interrupted',
  'Publié': 'Published',
  'Publiée': 'Published',
  'Congelable': 'Freezable',
  'Non congelable': 'Not freezable',
  'DLC dépassée': 'Past use-by date',
  'Pointage manquant': 'Missing time entry',
  'Aucun': 'None',
  'Aucune': 'None',
  'Tous': 'All',
  'Toutes': 'All',
  'Autre': 'Other',
  'Autres': 'Other',
  'Oui': 'Yes',
  'Non': 'No',

  // ── Champs / en-têtes ──
  'Nom': 'Name',
  'Prénom': 'First name',
  'Date': 'Date',
  'Heure': 'Time',
  'Quantité': 'Quantity',
  'Qté': 'Qty',
  'Unité': 'Unit',
  'Prix': 'Price',
  'Prix de vente': 'Selling price',
  'Coût': 'Cost',
  'Total': 'Total',
  'Catégorie': 'Category',
  'Catégories': 'Categories',
  'Produit': 'Product',
  'Produits': 'Products',
  'Ingrédient': 'Ingredient',
  'Ingrédients': 'Ingredients',
  'Étape': 'Step',
  'Étapes': 'Steps',
  'Portions': 'Servings',
  'Portion': 'Serving',
  // ── Recalcul des quantités dans la fiche recette ──
  'base': 'base',
  'portion': 'serving',
  'portions': 'servings',
  'Recalculé': 'Rescaled',
  'Revenir à la base': 'Back to base',
  'Change les portions, ou tape la quantité que tu as sur une ligne : toute la recette suit.':
    'Change the servings, or type the quantity you actually have on any line: the whole recipe follows.',
  'portion · fiche enregistrée inchangée': 'serving · saved recipe unchanged',
  'portions · fiche enregistrée inchangée': 'servings · saved recipe unchanged',
  'Allergènes': 'Allergens',
  'Allergène': 'Allergen',
  'Tableau des allergènes': 'Allergen table',
  'Notes': 'Notes',
  'Note': 'Note',
  'Commentaire': 'Comment',
  'Commentaires': 'Comments',
  'Description': 'Description',
  'Message': 'Message',
  'Email': 'Email',
  'Téléphone': 'Phone',
  'Adresse': 'Address',
  'Fournisseur': 'Supplier',
  'Fournisseurs': 'Suppliers',
  'Conditionnement': 'Pack size',
  'Référence': 'Reference',
  'Stock': 'Stock',
  'Stock théorique': 'Theoretical stock',
  'Stock réel': 'Actual stock',
  // ── Périmètres d'inventaire ──
  // Cuisine, Boissons et Surgelés sont déjà dans le glossaire (rôles et
  // catégories produits) : les redéclarer ici en ferait des clés en double.
  'Périmètre': 'Scope',
  'Périmètres': 'Scopes',
  '+ Périmètre': '+ Scope',
  'Général': 'General',
  'Cave': 'Cellar',
  'Économat sec': 'Dry store',
  'Matériel': 'Equipment',
  'Consommables': 'Consumables',
  'Nouvel inventaire': 'New inventory',
  'Périmètres en cours': 'Open scopes',
  'Nouveaux périmètres': 'New scopes',
  'Autre (saisir un nom)…': 'Other (enter a name)…',
  'Contenu de départ': 'Starting content',
  'Inventaire vierge': 'Blank inventory',
  "Date de l'inventaire": 'Inventory date',
  'Supprimer inventaire': 'Delete inventory',
  'Renommer le périmètre': 'Rename scope',
  'Nouveau nom': 'New name',
  'Fusionner': 'Merge',
  "Valider l'inventaire": 'Approve inventory',
  'Rouvrir': 'Reopen',
  'Écart': 'Variance',
  'Valeur': 'Value',
  'Opérateur': 'Operator',
  'Groupe': 'Group',
  'Type': 'Type',
  'Plat': 'Dish',
  'Plats': 'Dishes',
  'Menus': 'Menus',
  'Dressage': 'Plating',
  'Conservation': 'Storage',
  'Régénération': 'Reheating',
  'Température': 'Temperature',
  'Durée': 'Duration',
  'Arrivée': 'Clock in',
  'Départ': 'Clock out',
  'Ouverture': 'Opening',
  'Fermeture': 'Closing',
  'Ouverture / Fermeture': 'Opening / Closing',
  'Hygiène': 'Hygiene',
  'Sécurité': 'Safety',
  'Quotidien': 'Daily',
  'Hebdomadaire': 'Weekly',
  'Mensuel': 'Monthly',
  'Semaine': 'Week',
  'Mois': 'Month',
  'Jour': 'Day',
  'Aujourd\'hui': 'Today',
  'Hier': 'Yesterday',
  'Demain': 'Tomorrow',
  'Midi': 'Lunch',
  'Soir': 'Dinner',
  'Matin': 'Morning',

  // ── Jours ──
  'Lundi': 'Monday',
  'Mardi': 'Tuesday',
  'Mercredi': 'Wednesday',
  'Jeudi': 'Thursday',
  'Vendredi': 'Friday',
  'Samedi': 'Saturday',
  'Dimanche': 'Sunday',
  'Lun': 'Mon',
  'Mar': 'Tue',
  'Mer': 'Wed',
  'Jeu': 'Thu',
  'Ven': 'Fri',
  'Sam': 'Sat',
  'Dim': 'Sun',

  // ── Créneaux de relevé (HACCP) ──
  // Grille horaire des tournées de température : vocabulaire affiché à chaque
  // saisie, il n'a rien à faire dans les appels IA.
  'Créneaux de relevé': 'Reading time slots',
  'Créneau de relevé': 'Reading time slot',
  'Ajouter un créneau': 'Add a time slot',
  'Modifier le créneau': 'Edit time slot',
  'Créneau actif': 'Active time slot',
  'Tournées de relevé': 'Reading rounds',
  'Tournée': 'Round',
  'Nom de la tournée': 'Round name',
  'Heure prévue': 'Scheduled time',
  'Relevée': 'Done',
  'Maintenant': 'Now',
  // « Ouverture » et « Fermeture » sont déjà déclarés plus haut (horaires
  // d'établissement) : les redéclarer ici en ferait des clés en double.
  'Avant service midi': 'Before lunch service',
  'Après service midi': 'After lunch service',
  'Avant service soir': 'Before dinner service',
  'Après service soir': 'After dinner service',
  'Service unique': 'Single service',
  'Double service': 'Double service',

  // ── Étiquettes DLC (HACCP) ──
  'Étiquettes maison': 'House labels',
  'Étiquette maison': 'House label',
  'Nom de la préparation': 'Preparation name',
  'Préparation congelable': 'Can be frozen',
  'Non congelable': 'Cannot be frozen',

  // ── Catégories produits / recettes ──
  'Entrées': 'Starters',
  'Entrée': 'Starter',
  'Desserts': 'Desserts',
  'Dessert': 'Dessert',
  'Fromages': 'Cheeses',
  'Sauces': 'Sauces',
  'Fonds': 'Stocks',
  'Fonds & sauces': 'Stocks & sauces',
  'Amuse-bouches': 'Canapés',
  'Garnitures': 'Sides',
  'Viandes': 'Meat',
  'Poissons': 'Fish',
  'Poissons & fruits de mer': 'Fish & seafood',
  'Fruits & légumes': 'Fruit & vegetables',
  'Légumes': 'Vegetables',
  'Fruits': 'Fruit',
  'Épicerie sèche': 'Dry goods',
  'Produits laitiers': 'Dairy',
  'Crèmerie / fromages': 'Dairy / cheese',
  'Boulangerie / pâtisserie': 'Bakery / pastry',
  'Boissons': 'Beverages',
  'Alcools': 'Spirits',
  'Vins & alcools': 'Wine & spirits',
  'Surgelés': 'Frozen',
  'Condiments / sauces': 'Condiments / sauces',
  'Herbes / épices': 'Herbs / spices',
  'Hygiène / non alimentaire': 'Hygiene / non-food',
  'Œufs': 'Eggs',
  'Farine': 'Flour',
  'Sel': 'Salt',

  // ── États de chargement / erreurs ──
  'Chargement': 'Loading',
  'Chargement…': 'Loading…',
  // Écran de démarrage : au glossaire plutôt qu'à l'IA, c'est le tout premier
  // texte affiché et il doit être traduit instantanément, même hors ligne.
  'Connexion à votre espace': 'Connecting to your workspace',
  'Préparation de votre espace': 'Preparing your workspace',
  'Gestion culinaire': 'Culinary management',
  "J'ai compris": 'Got it',
  'Gestion culinaire professionnelle': 'Professional culinary management',
  'Enregistrement': 'Saving',
  'Génération': 'Generating',
  'Traitement': 'Processing',
  'Aucun résultat': 'No results',
  'Aucune donnée': 'No data',
  'Erreur': 'Error',
  'Erreur de chargement': 'Loading error',
  'Base de données indisponible.': 'Database unavailable.',
  'Supabase non configuré': 'Supabase not configured',
  'Le nom est obligatoire.': 'Name is required.',
  'Erreur technique. Réessaie ou contacte le support.':
    'Technical error. Try again or contact support.',
  'Export PDF indisponible pour le moment.': 'PDF export is unavailable right now.',
  'Enregistré': 'Saved',
  'Supprimé': 'Deleted',
  'Copié': 'Copied',
  'Hors ligne': 'Offline',
  'En ligne': 'Online',
};

// Chaînes à ne JAMAIS traduire : marques, sigles métier, unités.
// Le moteur les laisse telles quelles, même en mode English.
export const DO_NOT_TRANSLATE = new Set([
  'Samper Consulting', 'Lightspeed', 'Supabase', 'Vercel', 'PDF', 'CSV', 'Excel',
  'HACCP', 'DLC', 'DLU', 'SOP', 'SOPs', 'POS', 'KDS', 'MEP', 'CHF', 'TVA', 'IA', 'AI',
  'g', 'kg', 'ml', 'L', 'cl', 'pcs', 'cs', 'cc', '°C', '%', 'min', 'h',
]);

// Recherche insensible à la casse et aux accents, en repli de la clé exacte.
// On réutilise le normaliseur partagé de l'app (même repli ligatures/accents
// que la recherche des modules) plutôt qu'une variante locale.
const NORMALIZED = new Map();
for (const [fr, en] of Object.entries(UI_GLOSSARY)) {
  const key = normalizeSearch(fr);
  if (!NORMALIZED.has(key)) NORMALIZED.set(key, en);
}

/**
 * Traduit une chaîne via le glossaire statique.
 * Préserve la casse tout-majuscules (« SUPPRIMER » → « DELETE »).
 * @returns {string|null} la traduction, ou null si absente du glossaire.
 */
export function lookupGlossary(source) {
  const exact = UI_GLOSSARY[source];
  if (exact) return exact;

  const hit = NORMALIZED.get(normalizeSearch(source));
  if (!hit) return null;

  // « SUPPRIMER » (tout en majuscules, plus d'un caractère) → « DELETE »
  if (source.length > 1 && source === source.toUpperCase() && source !== source.toLowerCase()) {
    return hit.toUpperCase();
  }
  // « supprimer » (tout en minuscules) → « delete »
  if (source === source.toLowerCase()) return hit.toLowerCase();
  return hit;
}
