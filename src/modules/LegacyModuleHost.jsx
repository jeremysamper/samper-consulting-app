import { lazy, Suspense } from 'react';
import { navItems } from './moduleConfig.js';
import SafeModule from '../legacy/SafeModule.jsx';
import { getPermissionsForRole } from '../data/demoData.js';

const Catalogue = lazy(() => import('./catalogue/Catalogue.jsx'));
const ConsultantTools = lazy(() => import('./consultant-tools/ConsultantTools.jsx'));
const Dashboard = lazy(() => import('./dashboard/Dashboard.jsx'));
const DashboardMobile = lazy(() => import('./dashboard/DashboardMobile.jsx'));
const Documents = lazy(() => import('./documents/Documents.jsx'));
const Factures = lazy(() => import('./factures/Factures.jsx'));
const FAQAssistant = lazy(() => import('./faq/FAQAssistant.jsx'));
const FichesSalle = lazy(() => import('./fiches-salle/FichesSalle.jsx'));
const HACCP = lazy(() => import('./haccp/HACCP.jsx'));
const Inventaire = lazy(() => import('./inventaire/Inventaire.jsx'));
const Parametres = lazy(() => import('./parametres/Parametres.jsx'));
const Pertes = lazy(() => import('./pertes/Pertes.jsx'));
const Planning = lazy(() => import('./planning/Planning.jsx'));
const Recettes = lazy(() => import('./recettes/Recettes.jsx'));
const Roles = lazy(() => import('./roles/Roles.jsx'));
const Previsions = lazy(() => import('./previsions/Previsions.jsx'));
const SOP = lazy(() => import('./sop/SOP.jsx'));

export default function LegacyModuleHost({
  page,
  user,
  etablissement,
  isMobile,
  loadingEtablissement,
  error,
  setPage,
  legacyVersion
}) {
  const permissions = getPermissionsForRole(user.role);

  if (loadingEtablissement) {
    return <ModulePlaceholder page={page} message="Chargement de l'etablissement courant..." />;
  }

  if (error) {
    return <div className="form-alert error">{error.message || String(error)}</div>;
  }

  const accessDenied = <AccessDenied />;
  const wrap = (name, element) => (
    <SafeModule name={name}>
      <Suspense fallback={<ModulePlaceholder page={page} message={`Chargement ${name}...`} />}>
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
      return permissions.faq !== false
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
