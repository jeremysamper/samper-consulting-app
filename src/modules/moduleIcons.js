import {
  BookOpen, CalendarCheck, CalendarClock, CircleQuestionMark, CookingPot, Flower2, FolderOpen,
  LayoutDashboard, LayoutGrid, ListChecks, MessageSquare, Monitor, Package, Receipt, ScrollText,
  ShieldCheck, ShoppingCart, Tags, Trash2, Users, Utensils, Wrench,
} from 'lucide-react';

// Pictogramme au trait (lucide) de chaque module, pour les gros boutons de la
// page d'accueil tactile. Jamais d'emoji. Le champ `icon` de tousLesNavItems
// (symboles texte) reste celui de la palette de commandes.
const ICONES = {
  dashboard: LayoutDashboard,
  planning: CalendarClock,
  messages: MessageSquare,
  journal: ScrollText,
  cartes: BookOpen,
  inventaire: Package,
  pertes: Trash2,
  haccp: ShieldCheck,
  sop: ListChecks,
  fiches_salle: Utensils,
  documents: FolderOpen,
  catalogue: Tags,
  consultant_tools: Wrench,
  previsions: CalendarCheck,
  groupes: Users,
  commande: ShoppingCart,
  mep: CookingPot,
  pos: Receipt,
  kds: Monitor,
  spa: Flower2,
  faq: CircleQuestionMark,
};

// Module sans pictogramme attitré (ajouté au code après cette table) : grille.
export function getModuleIcon(id) {
  return ICONES[id] || LayoutGrid;
}
