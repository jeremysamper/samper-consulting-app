import { lazy, Suspense } from 'react';
import { estEnPause, isPageActiveForEtab, normalizePage, pageAccueil, peutOuvrirCompte } from './moduleConfig.js';
import SafeModule from '../legacy/SafeModule.jsx';
import { getPermissionsForRole } from '../data/demoData.js';
import { messageErreur } from '../utils/messageErreur.js';
import { Btn } from '../components/ui/index.jsx';

// Loaders nommés : partagés entre lazy() et le préchargement idle ci-dessous.
// Un même import() est dédupliqué par Vite → précharger ne coûte qu'un fetch.
const loadCatalogue = () => import('./catalogue/Catalogue.jsx');
const loadCommande = () => import('./commande/Commande.jsx');
const loadCompte = () => import('./compte/Compte.jsx');
const loadConsultantTools = () => import('./consultant-tools/ConsultantTools.jsx');
// Tableau de bord (les établissements de type Spa n'en ont pas, cf. moduleConfig).
const loadTableauDeBord = () => import('./dashboard/TableauDeBord.jsx');
const loadDocuments = () => import('./documents/Documents.jsx');
const loadFactures = () => import('./factures/Factures.jsx');
const loadFAQAssistant = () => import('./faq/FAQAssistant.jsx');
const loadFichesSalle = () => import('./fiches-salle/FichesSalle.jsx');
const loadGroupes = () => import('./groupes/Groupes.jsx');
const loadHACCP = () => import('./haccp/HACCP.jsx');
const loadInventaire = () => import('./inventaire/Inventaire.jsx');
const loadFacturesAchats = () => import('./factures-achats/FacturesAchats.jsx');
const loadJournal = () => import('./journal/Journal.jsx');
const loadKds = () => import('./kds/Kds.jsx');
const loadMep = () => import('./mep/MiseEnPlace.jsx');
const loadMessages = () => import('./messages/Messages.jsx');
const loadParametres = () => import('./parametres/Parametres.jsx');
const loadPertes = () => import('./pertes/Pertes.jsx');
const loadPlanning = () => import('./planning/Planning.jsx');
const loadRecettes = () => import('./recettes/Recettes.jsx');
const loadRoles = () => import('./roles/Roles.jsx');
const loadPrevisions = () => import('./previsions/Previsions.jsx');
const loadVentesPos = () => import('./pos/VentesPos.jsx');
const loadSOP = () => import('./sop/SOP.jsx');
const loadSpa = () => import('./spa/Spa.jsx');
// Branche Hôtel (lot H0) : modules « à activer » des établissements hôteliers.
const loadHebergement = () => import('./hebergement/Hebergement.jsx');
const loadEtages = () => import('./etages/Etages.jsx');
const loadDemandes = () => import('./demandes/Demandes.jsx');
// Page d'accueil de la coque tactile (gros boutons) ; sur ordinateur, la même
// page affiche le tableau de bord.
const loadAccueilTactile = () => import('../layouts/AccueilTactile.jsx');

const Catalogue = lazy(loadCatalogue);
const Commande = lazy(loadCommande);
const Compte = lazy(loadCompte);
const ConsultantTools = lazy(loadConsultantTools);
const TableauDeBord = lazy(loadTableauDeBord);
const Documents = lazy(loadDocuments);
const Factures = lazy(loadFactures);
const FAQAssistant = lazy(loadFAQAssistant);
const FichesSalle = lazy(loadFichesSalle);
const Groupes = lazy(loadGroupes);
const HACCP = lazy(loadHACCP);
const Inventaire = lazy(loadInventaire);
const FacturesAchats = lazy(loadFacturesAchats);
const Journal = lazy(loadJournal);
const Kds = lazy(loadKds);
const Mep = lazy(loadMep);
const Messages = lazy(loadMessages);
const Parametres = lazy(loadParametres);
const Pertes = lazy(loadPertes);
const Planning = lazy(loadPlanning);
const Recettes = lazy(loadRecettes);
const Roles = lazy(loadRoles);
const Previsions = lazy(loadPrevisions);
const VentesPos = lazy(loadVentesPos);
const SOP = lazy(loadSOP);
const Spa = lazy(loadSpa);
const Hebergement = lazy(loadHebergement);
const Etages = lazy(loadEtages);
const Demandes = lazy(loadDemandes);
const AccueilTactile = lazy(loadAccueilTactile);

// Modules du quotidien, préchargés en idle après le login pour que la première
// navigation soit instantanée (le chunk est déjà en cache navigateur).
// Ordre = priorité métier : brigade d'abord, consultant ensuite.
const PREFETCH_LOADERS = [
  loadTableauDeBord,
  loadPlanning,
  loadHACCP,
  loadRecettes,
  loadInventaire,
  loadPertes,
  loadSOP,
  loadCommande,
  loadMep,
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
  loadingEtablissement,
  error,
  onRetryEtablissement,
  setPage,
  legacyVersion,
  // Keep-alive : true seulement pour le module réellement affiché. Permet aux
  // modules gardés montés en arrière-plan de suspendre leurs effets « visibles »
  // (ex. marquage lu des messages privés).
  isActivePage = true,
  // Coque (useShellMode) : 'ordinateur' | 'tablette' | 'telephone'.
  shellMode = 'ordinateur'
}) {
  const tactile = shellMode === 'tablette' || shellMode === 'telephone';
  const permissions = getPermissionsForRole(user.role);

  if (loadingEtablissement) {
    return <ModulePlaceholder message="Chargement…" />;
  }

  if (error) {
    // L'établissement n'a pas pu être chargé (typiquement : réseau pas encore
    // remonté au réveil). useCurrentEtablissement réessaie déjà tout seul ; le
    // bouton évite d'attendre le prochain palier.
    return (
      <section className="module-placeholder">
        <p>{messageErreur(error, 'établissement', "L'établissement n'a pas pu être chargé.")}</p>
        {typeof onRetryEtablissement === 'function' && (
          <div>
            <Btn variant="primary" onClick={onRetryEtablissement}>Réessayer</Btn>
          </div>
        )}
      </section>
    );
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
  // Module non activé pour cet établissement (Paramètres) : page mémorisée
  // d'une session précédente, lien d'un autre module ou changement
  // d'établissement. On le dit plutôt que d'ouvrir un module caché du menu.
  if (!isPageActiveForEtab(etablissement, page)) {
    // Accueil d'un établissement sans tableau de bord (spa) : App redirige
    // aussitôt vers sa page d'accueil, rien à afficher d'ici là.
    if (normalizePage(page) === 'dashboard') return null;
    return <ModuleInactif page={page} etablissement={etablissement} user={user} setPage={setPage} shellMode={shellMode} />;
  }

  switch (page) {
    case 'dashboard':
      return wrap('Tableau de bord', <TableauDeBord user={user} etablissement={etablissement} setPage={setPage} />);
    case 'accueil':
      // Ordinateur : le tableau de bord, sans redirection (un iPad qui passe
      // du tactile au clavier ne rejoue rien). Spa sur ordinateur : App.jsx
      // redirige vers sa page d'accueil, rien à afficher d'ici là.
      if (tactile) return wrap('Accueil', <AccueilTactile />);
      if (!isPageActiveForEtab(etablissement, 'dashboard')) return null;
      return wrap('Tableau de bord', <TableauDeBord user={user} etablissement={etablissement} setPage={setPage} />);
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
    case 'journal': {
      // Garde dure par rôle, miroir de la RLS de journal_activite.
      return ['consultant', 'patron'].includes(user.role) && permissions.journal !== false
        ? wrap("Journal d'activité", <Journal user={user} etablissement={etablissement} />)
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
    case 'achats': {
      // Factures & achats : mêmes droits que l'Inventaire (clé inventaire).
      return permissions.inventaire !== false
        ? wrap('Factures & achats', <FacturesAchats user={user} etablissement={etablissement} />)
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
        ? wrap('Réservations', <Previsions user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'spa': {
      return permissions.spa !== false
        ? wrap('Spa', <Spa user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'groupes': {
      return permissions.groupes !== false
        ? wrap('Groupes', <Groupes user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'hebergement': {
      return permissions.hebergement !== false
        ? wrap('Hébergement', <Hebergement user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'etages': {
      return permissions.etages !== false
        ? wrap('Étages', <Etages user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'demandes': {
      return permissions.demandes !== false
        ? wrap('Demandes', <Demandes user={user} etablissement={etablissement} />)
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
        ? wrap('FAQ & Assistant', <FAQAssistantComponent user={user} etablissement={etablissement} setPage={setPage} />)
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
      // Outils IA : réservés au consultant culinaire (garde dure, indépendante de la BDD).
      return user.role === 'consultant' && permissions.consultant_tools !== false
        ? wrap('Outils consultant', <ConsultantToolsComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'compte': {
      // Espace Compte (paramètres, rôles, alertes) : même accès que les Outils
      // consultant, lu dans peutOuvrirCompte (le bouton « Compte » lit la même).
      const CompteComponent = Compte;
      return peutOuvrirCompte(user, permissions)
        ? wrap('Compte', <CompteComponent user={user} etablissement={etablissement} />)
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
    case 'mep': {
      const MepComponent = Mep;
      return permissions.mep !== false
        ? wrap('Mise en place', <MepComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'kds': {
      const KdsComponent = Kds;
      // Garde dure par rôle (miroir de la RLS lecture kds_orders) : la table
      // permissions en BDD n'a pas encore la clé kds, on ne s'y fie pas seule.
      const kitchenRole = ['consultant', 'resp_cuisine', 'cuisinier'].includes(user.role);
      return kitchenRole && permissions.kds !== false
        ? wrap('KDS Cuisine', <KdsComponent user={user} etablissement={etablissement} isActive={isActivePage} />)
        : accessDenied;
    }
    default:
      return wrap('Tableau de bord', <TableauDeBord user={user} etablissement={etablissement} setPage={setPage} />);
  }
}

function AccessDenied() {
  return (
    <section className="module-placeholder">
      <p>Vous n'avez pas accès à ce module. Votre consultant peut l'ouvrir pour votre rôle.</p>
    </section>
  );
}

function ModuleInactif({ page, etablissement, user, setPage, shellMode }) {
  const canGoHome = typeof setPage === 'function';
  const retourAccueil = () => setPage(pageAccueil(etablissement, getPermissionsForRole(user.role), shellMode));
  // Module mis de côté (moduleConfig.modulesEnPause) : pas d'invitation à
  // l'activer, il n'est proposé nulle part pour l'instant.
  // Le nom du module est déjà dans la barre du haut : pas de titre répété ici.
  // Un seul bouton principal ; « Retour à l'accueil » reste secondaire.
  if (estEnPause(page)) {
    return (
      <section className="module-placeholder">
        <div>
          <p>Ce module est mis de côté pour l'instant.</p>
          {canGoHome && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <Btn onClick={retourAccueil}>Retour à l'accueil</Btn>
            </div>
          )}
        </div>
      </section>
    );
  }
  return (
    <section className="module-placeholder">
      <div>
        <p>
          Ce module n'est pas activé pour {etablissement?.nom || 'cet établissement'}.
          {user.role === 'consultant'
            ? ' Vous pouvez l\'activer dans Paramètres, fiche de l\'établissement.'
            : ' Demandez à votre consultant de l\'activer si vous en avez besoin.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {canGoHome && user.role === 'consultant' && (
            <Btn variant="primary" onClick={() => setPage('parametres')}>Ouvrir les paramètres</Btn>
          )}
          {canGoHome && (
            <Btn onClick={retourAccueil}>Retour à l'accueil</Btn>
          )}
        </div>
      </div>
    </section>
  );
}

function ModulePlaceholder({ message }) {
  return (
    <section className="module-placeholder">
      <p>{message || "Ce module n'est pas disponible pour le moment."}</p>
    </section>
  );
}
