import { lazy, Suspense } from 'react';
import { estEnPause, isPageActiveForEtab, normalizePage, pageAccueil, peutOuvrirPage } from './moduleConfig.js';
import { peutOuvrirStatistiques } from './statistiques/gardesStatistiques.js';
import SafeModule from '../legacy/SafeModule.jsx';
import { PageActive } from '../components/parcours/pageActive.js';
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
// Comptabilité : module de la direction, pas de préchargement idle (D25).
const loadComptabilite = () => import('./comptabilite/Comptabilite.jsx');
// Statistiques : module de la direction, pas de préchargement idle non plus.
const loadStatistiques = () => import('./statistiques/Statistiques.jsx');
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
// Caisse v1 : prise de commande en salle, bons vers le KDS, ventes directes.
const loadCaisse = () => import('./caisse/Caisse.jsx');
const loadSOP = () => import('./sop/SOP.jsx');
const loadSpa = () => import('./spa/Spa.jsx');
// Branche Hôtel (lot H0) : modules « à activer » des établissements hôteliers.
const loadHebergement = () => import('./hebergement/Hebergement.jsx');
const loadEtages = () => import('./etages/Etages.jsx');
const loadDemandes = () => import('./demandes/Demandes.jsx');
const loadActivites = () => import('./activites/Activites.jsx');
const loadPassations = () => import('./passations/Passations.jsx');
const loadRepas = () => import('./repas/Repas.jsx');
const loadTechnique = () => import('./technique/Technique.jsx');
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
const Comptabilite = lazy(loadComptabilite);
const Statistiques = lazy(loadStatistiques);
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
const Caisse = lazy(loadCaisse);
const SOP = lazy(loadSOP);
const Spa = lazy(loadSpa);
const Hebergement = lazy(loadHebergement);
const Etages = lazy(loadEtages);
const Demandes = lazy(loadDemandes);
const Activites = lazy(loadActivites);
const Passations = lazy(loadPassations);
const Repas = lazy(loadRepas);
const Technique = lazy(loadTechnique);
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
    <PageActive.Provider value={isActivePage}>
      <SafeModule name={name}>
        <Suspense fallback={null}>
          {element}
        </Suspense>
      </SafeModule>
    </PageActive.Provider>
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
      return peutOuvrirPage('planning', user, permissions)
        ? wrap('Planning', <PlanningComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'pointage': {
      const PlanningComponent = Planning;
      return peutOuvrirPage('pointage', user, permissions)
        ? wrap('Pointage', <PlanningComponent user={user} etablissement={etablissement} initialTab="pointage" />)
        : accessDenied;
    }
    case 'messages': {
      return peutOuvrirPage('messages', user, permissions)
        ? wrap('Messages privés', <Messages user={user} etablissement={etablissement} setPage={setPage} isActive={isActivePage} />)
        : accessDenied;
    }
    case 'journal': {
      // Garde dure par rôle, miroir de la RLS de journal_activite.
      return peutOuvrirPage('journal', user, permissions)
        ? wrap("Journal d'activité", <Journal user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'comptabilite': {
      // Une clé absente ne vaut jamais « ouvert » (comme Réservations) : la
      // direction par défaut, un écart personnel possible (Rôles & accès).
      return peutOuvrirPage('comptabilite', user, permissions)
        ? wrap('Comptabilité', <Comptabilite user={user} etablissement={etablissement} setPage={setPage} />)
        : accessDenied;
    }
    case 'statistiques': {
      // Une clé absente ne vaut jamais « ouvert » (comme la Comptabilité).
      // Dans le module, chaque famille de chiffres garde la garde de son
      // écran d'origine : personne n'y voit un chiffre qu'il ne voit pas ailleurs.
      // S3 : qui voyait un écran d'analyse devenu raccourci, sans la clé,
      // garde l'accès par ce raccourci (gardesStatistiques.js).
      return peutOuvrirStatistiques(user, permissions, etablissement)
        ? wrap('Statistiques', <Statistiques user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'cartes': {
      const RecettesComponent = Recettes;
      return peutOuvrirPage('cartes', user, permissions)
        ? wrap('Cartes & Recettes', <RecettesComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'inventaire': {
      const InventaireComponent = Inventaire;
      return peutOuvrirPage('inventaire', user, permissions)
        ? wrap('Inventaire', <InventaireComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'achats': {
      // Factures & achats : mêmes droits que l'Inventaire (clé inventaire).
      return peutOuvrirPage('achats', user, permissions)
        ? wrap('Factures & achats', <FacturesAchats user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'pertes': {
      const PertesComponent = Pertes;
      return peutOuvrirPage('pertes', user, permissions)
        ? wrap('Pertes', <PertesComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'haccp': {
      const HACCPComponent = HACCP;
      return peutOuvrirPage('haccp', user, permissions)
        ? wrap('HACCP', <HACCPComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'previsions': {
      return peutOuvrirPage('previsions', user, permissions)
        ? wrap('Réservations', <Previsions user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'spa': {
      return peutOuvrirPage('spa', user, permissions)
        ? wrap('Spa', <Spa user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'groupes': {
      return peutOuvrirPage('groupes', user, permissions)
        ? wrap('Groupes', <Groupes user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'hebergement': {
      return peutOuvrirPage('hebergement', user, permissions)
        ? wrap('Hébergement', <Hebergement user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'etages': {
      return peutOuvrirPage('etages', user, permissions)
        ? wrap('Étages', <Etages user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'demandes': {
      return peutOuvrirPage('demandes', user, permissions)
        ? wrap('Demandes', <Demandes user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'activites': {
      return peutOuvrirPage('activites', user, permissions)
        ? wrap('Activités', <Activites user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'passations': {
      return peutOuvrirPage('passations', user, permissions)
        ? wrap('Passations', <Passations user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'repas': {
      return peutOuvrirPage('repas', user, permissions)
        ? wrap('Repas hôtel', <Repas user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'technique': {
      return peutOuvrirPage('technique', user, permissions)
        ? wrap('Technique', <Technique user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'fiches_salle': {
      const FichesSalleComponent = FichesSalle;
      return peutOuvrirPage('fiches_salle', user, permissions)
        ? wrap('Fiches salle', <FichesSalleComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'documents': {
      const DocumentsComponent = Documents;
      return peutOuvrirPage('documents', user, permissions)
        ? wrap('Documents', <DocumentsComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'faq': {
      const FAQAssistantComponent = FAQAssistant;
      // IA / assistant : réservé au consultant culinaire (garde dure, indépendante de la BDD).
      return peutOuvrirPage('faq', user, permissions)
        ? wrap('FAQ & Assistant', <FAQAssistantComponent user={user} etablissement={etablissement} setPage={setPage} />)
        : accessDenied;
    }
    case 'catalogue': {
      const CatalogueComponent = Catalogue;
      return peutOuvrirPage('catalogue', user, permissions)
        ? wrap('Catalogue produits', <CatalogueComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'sop': {
      const SOPComponent = SOP;
      return peutOuvrirPage('sop', user, permissions)
        ? wrap('SOPs & Checklists', <SOPComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'consultant_tools': {
      const ConsultantToolsComponent = ConsultantTools;
      // Outils IA : réservés au consultant culinaire (garde dure, indépendante de la BDD).
      return peutOuvrirPage('consultant_tools', user, permissions)
        ? wrap('Outils consultant', <ConsultantToolsComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'compte': {
      // Page des réglages : ouverte à toute personne connectée, chacune n'y
      // voit que ses sections (compte/registreReglages.js).
      const CompteComponent = Compte;
      return peutOuvrirPage('compte', user, permissions)
        ? wrap('Réglages', <CompteComponent user={user} etablissement={etablissement} shellMode={shellMode} isActive={isActivePage} legacyVersion={legacyVersion} />)
        : accessDenied;
    }
    case 'factures': {
      const FacturesComponent = Factures;
      return peutOuvrirPage('factures', user, permissions)
        ? wrap('Factures', <FacturesComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'parametres': {
      const ParametresComponent = Parametres;
      return peutOuvrirPage('parametres', user, permissions)
        ? wrap('Etablissements', <ParametresComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'roles': {
      const RolesComponent = Roles;
      return peutOuvrirPage('roles', user, permissions)
        ? wrap('Roles et acces', <RolesComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'caisse': {
      // Une clé absente ne vaut jamais « ouvert » (comme Réservations) : les
      // défauts du code donnent la caisse à consultant, patron, resp_cuisine
      // et serveur ; réglable ensuite par rôle et par personne.
      return peutOuvrirPage('caisse', user, permissions)
        ? wrap('Caisse', <Caisse user={user} etablissement={etablissement} legacyVersion={legacyVersion} />)
        : accessDenied;
    }
    case 'pos': {
      const VentesPosComponent = VentesPos;
      return peutOuvrirPage('pos', user, permissions)
        ? wrap('Ventes POS', <VentesPosComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'commande': {
      const CommandeComponent = Commande;
      return peutOuvrirPage('commande', user, permissions)
        ? wrap('Commande', <CommandeComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'mep': {
      const MepComponent = Mep;
      return peutOuvrirPage('mep', user, permissions)
        ? wrap('Mise en place', <MepComponent user={user} etablissement={etablissement} />)
        : accessDenied;
    }
    case 'kds': {
      const KdsComponent = Kds;
      // Garde dure par rôle (miroir de la RLS lecture kds_orders) : la table
      // permissions en BDD n'a pas encore la clé kds, on ne s'y fie pas seule
      // (peutOuvrirPage).
      return peutOuvrirPage('kds', user, permissions)
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
