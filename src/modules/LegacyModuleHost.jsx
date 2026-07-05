import { lazy, Suspense } from 'react';
import { navItems } from './moduleConfig.js';
import SafeModule from '../legacy/SafeModule.jsx';
import { getPermissionsForRole } from '../data/demoData.js';

// Loaders nommés : partagés entre lazy() et le préchargement idle ci-dessous.
// Un même import() est dédupliqué par Vite → précharger ne coûte qu'un fetch.
const loadCatalogue = () => import('./catalogue/Catalogue.jsx');
const loadCommande = () => import('./commande/Commande.jsx');
const loadConsultantTools = () => import('./consultant-tools/ConsultantTools.jsx');
const loadDashboard = () => import('./dashboard/Dashboard.jsx');
const loadDashboardMobile = () => import('./dashboard/DashboardMobile.jsx');
const loadDocuments = () => import('./documents/Documents.jsx');
const loadFactures = () => import('./factures/Factures.jsx');
const loadFAQAssistant = () => import('./faq/FAQAssistant.jsx');
const loadFichesSalle = () => import('./fiches-salle/FichesSalle.jsx');
const loadHACCP = () => import('./haccp/HACCP.jsx');
const loadInventaire = () => import('./inventaire/Inventaire.jsx');
const loadMessages = () => import('./messages/Messages.jsx');
const loadParametres = () => import('./parametres/Parametres.jsx');
const loadPertes = () => import('./pertes/Pertes.jsx');
const loadPlanning = () => import('./planning/Planning.jsx');
const loadRecettes = () => import('./recettes/Recettes.jsx');
const loadRoles = () => import('./roles/Roles.jsx');
const loadPrevisions = () => import('./previsions/Previsions.jsx');
const loadVentesPos = () => import('./pos/VentesPos.jsx');
const loadSOP = () => import('./sop/SOP.jsx');

const Catalogue = lazy(loadCatalogue);
const Commande = lazy(loadCommande);
const ConsultantTools = lazy(loadConsultantTools);
const Dashboard = lazy(loadDashboard);
const DashboardMobile = lazy(loadDashboardMobile);
const Documents = lazy(loadDocuments);
const Factures = lazy(loadFactures);
const FAQAssistant = lazy(loadFAQAssistant);
const FichesSalle = lazy(loadFichesSalle);
const HACCP = lazy(loadHACCP);
const Inventaire = lazy(loadInventaire);
const Messages = lazy(loadMessages);
const Parametres = lazy(loadParametres);
const Pertes = lazy(loadPertes);
const Planning = lazy(loadPlanning);
const Recettes = lazy(loadRecettes);
const Roles = lazy(loadRoles);
const Previsions = lazy(loadPrevisions);
const VentesPos = lazy(loadVentesPos);
const SOP = lazy(loadSOP);

// Modules du quotidien, préchargés en idle après le login pour que la première
// navigation soit instantanée (le chunk est déjà en cache navigateur).
// Ordre = priorité métier : brigade d'abord, consultant ensuite.
const PREFETCH_LOADERS = [
  loadDashboardMobile,
  loadDashboard,
  loadPlanning,
  loadHACCP,
  loadRecettes,
  loadInventaire,
  loadPertes,
  loadSOP,
  loadCommande,
];

let prefetchStarted = false;

export function prefetchCommonModules() {
  if (prefetchStarted || typeof window === 'undefined') return;
  prefetchStarted = true;

  // File séquentielle en idle : un chunk à la fois, jamais en concurrence avec
  // une interaction utilisateur ni avec l'hydratation post-login.
  const queue = [...PREFETCH_LOADERS];
  const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 800));

  const next = () => {
    const loader = queue.shift();
    if (!loader) return;
    loader().catch(() => {}).finally(() => idle(next));
  };
  idle(next);
}

export default function LegacyModuleHost({
  page,
  user,
  etablissement,
  isMobile,
  loadingEtablissement,
  error,
  setPage,
  legacyVersion,
  // Keep-alive : true seulement pour le module réellement affiché. Permet aux
  // modules gardés montés en arrière-plan de suspendre leurs effets « visibles »
  // (ex. marquage lu des messages privés).
  isActivePage = true
}) {
  const permissions = getPermissionsForRole(user.role);

  if (loadingEtablissement) {
    return <ModulePlaceholder page={page} message="Chargement de l'etablissement courant..." />;
  }

  if (error) {
    return <div className="form-alert error">{error.message || String(error)}</div>;
  }

  const accessDenied = <AccessDenied />;
  // Fallback Suspense volontairement vide : pendant le chargement du chunk, le
  // module est de toute façon monté masqué (cf. keep-alive dans App.jsx), donc
  // aucun « Chargement… » ne doit s'afficher pendant les transitions.
  const wrap = (name, element) => (
    <SafeModule name={name}>
      <Suspense fallback={null}>
        {element}
      </Suspense>
    </SafeModule>
  );
  const DashboardComponent = isMobile ? DashboardMobile : Dashboard;

  switch (page) {
    case 'dashboard':
      return wrap('Tableau de bord', <DashboardComponent user={user} etablissement={etablissement} setPage={setPage} />);
    case 'planning': {
      const PlanningComponent = Planning;
      return permissions.planning !== false
        ? wrap('Planning', <PlanningComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'pointage': {
      const PlanningComponent = Planning;
      return permissions.planning !== false
        ? wrap('Pointage', <PlanningComponent user={user} etablissement={etablissement} initialTab="pointage" />)
        : accessDenied;
    }
    case 'messages': {
      return permissions.messages !== false
        ? wrap('Messages privés', <Messages user={user} etablissement={etablissement} setPage={setPage} isActive={isActivePage} />)
        : accessDenied;
    }
    case 'cartes': {
      const RecettesComponent = Recettes;
      return permissions.recettes !== false
        ? wrap('Cartes & Recettes', <RecettesComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'inventaire': {
      const InventaireComponent = Inventaire;
      return permissions.inventaire !== false
        ? wrap('Inventaire', <InventaireComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'pertes': {
      const PertesComponent = Pertes;
      return permissions.pertes !== false
        ? wrap('Pertes', <PertesComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'haccp': {
      const HACCPComponent = HACCP;
      return permissions.haccp !== false
        ? wrap('HACCP', <HACCPComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'previsions': {
      return permissions.previsions === true
        ? wrap('Prévisions', <Previsions user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'fiches_salle': {
      const FichesSalleComponent = FichesSalle;
      return permissions.fiches_salle !== false
        ? wrap('Fiches salle', <FichesSalleComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'documents': {
      const DocumentsComponent = Documents;
      return permissions.documents !== false
        ? wrap('Documents', <DocumentsComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'faq': {
      const FAQAssistantComponent = FAQAssistant;
      // IA / assistant : réservé au consultant culinaire (garde dure, indépendante de la BDD).
      return user.role === 'consultant'
        ? wrap('FAQ & Assistant IA', <FAQAssistantComponent user={user} etablissement={etablissement} setPage={setPage} />)
        : accessDenied;
    }
    case 'catalogue': {
      const CatalogueComponent = Catalogue;
      return permissions.catalogue !== false
        ? wrap('Catalogue produits', <CatalogueComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'sop': {
      const SOPComponent = SOP;
      return permissions.sop !== false
        ? wrap('SOPs & Checklists', <SOPComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'consultant_tools': {
      const ConsultantToolsComponent = ConsultantTools;
      return permissions.consultant_tools !== false
        ? wrap('Outils consultant', <ConsultantToolsComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'factures': {
      const FacturesComponent = Factures;
      return user.role === 'consultant' && permissions.consultant_tools !== false
        ? wrap('Factures', <FacturesComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'parametres': {
      const ParametresComponent = Parametres;
      return user.role === 'consultant' && permissions.consultant_tools !== false
        ? wrap('Etablissements', <ParametresComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'roles': {
      const RolesComponent = Roles;
      return user.role === 'consultant' && permissions.consultant_tools !== false
        ? wrap('Roles et acces', <RolesComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'pos': {
      const VentesPosComponent = VentesPos;
      return permissions.pos !== false
        ? wrap('Ventes POS', <VentesPosComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'commande': {
      const CommandeComponent = Commande;
      return permissions.commande !== false
        ? wrap('Commande', <CommandeComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    default:
      return wrap('Tableau de bord', <DashboardComponent user={user} etablissement={etablissement} />);
  }
}

function AccessDenied() {
  return (
    <section className="module-placeholder">
      <div className="form-alert warning">Acces refuse pour ce module.</div>
    </section>
  );
}

function ModulePlaceholder({ page, message }) {
  const current = navItems.find((item) => item.id === page);

  return (
    <section className="module-placeholder">
      <div>
        <p className="eyebrow">Migration module</p>
        <h2>{current?.label || page}</h2>
        <p>{message || 'Le module demande est indisponible dans le runtime Vite actuel.'}</p>
      </div>
    </section>
  );
}
