import { useEffect, useRef, useState } from 'react';
import BootScreen from './components/brand/BootScreen.jsx';
import { ToastContainer, installToastGlobals, notify } from './components/toast/index.js';
import AppLayout from './layouts/AppLayout.jsx';
import Auth from './modules/auth/Auth.jsx';
import LegacyModuleHost, { prefetchCommonModules } from './modules/LegacyModuleHost.jsx';
import { useAuth } from './hooks/useAuth.js';
import { useCurrentEtablissement } from './hooks/useCurrentEtablissement.js';
import { useIsMobile } from './hooks/useIsMobile.js';
import SafeModule from './legacy/SafeModule.jsx';
import { loadLegacyModules } from './legacy/loadLegacyModules.js';
import { getHydrateFromSupabase, removeLegacyGlobal, writeLegacyGlobal } from './legacy/legacyApi.js';
import { getPermissionsForRole } from './data/demoData.js';
import { getConsultantToolsTabForPage, normalizePage } from './modules/moduleConfig.js';
import { readText, UI_STORAGE_KEYS, writeText } from './utils/storage.js';
import { dbService } from './services/dbService.js';
import { setNavigationHandler } from './services/navigationService.js';
import { getPendingPunchCount, startPunchSync } from './services/offline/punchSync.js';
import { purgeAllDataCaches, purgeEtabDataCaches } from './services/offline/offlineCaches.js';
import { clearTranslationCache } from './i18n/domTranslator.js';

function readInitialPage() {
  return normalizePage(readText(UI_STORAGE_KEYS.page, 'dashboard'));
}

// Keep-alive : nombre maximum de modules gardés montés simultanément.
// Revenir sur un module récent est alors instantané (données déjà chargées,
// pas de réécran « Chargement… »). Plafonné pour borner les abonnements
// realtime restés actifs en arrière-plan.
const KEEP_ALIVE_MAX = 3;

export default function App() {
  const [page, setPageState] = useState(readInitialPage);
  // Transition douce entre modules : la nav (highlight) suit `page` immédiatement,
  // mais le CONTENU suit `deferredPage`. Pendant le chargement d'un module non
  // encore en cache, React garde le module précédent affiché (pas de flash du
  // fallback Suspense) ; quand c'est prêt, le nouveau module apparaît en fondu.
  // Transition sans écran « Chargement… » : le module cible est monté tout de
  // suite mais MASQUÉ (display:none), le temps qu'il charge chunk + données en
  // arrière-plan ; on ne l'affiche (`visiblePage`) qu'une fois prêt. Un module
  // déjà chargé (revisité, gardé monté) s'affiche instantanément.
  const [visiblePage, setVisiblePage] = useState(readInitialPage);
  const readyPagesRef = useRef(new Set([readInitialPage()]));
  const [mountedPages, setMountedPages] = useState(() => [readInitialPage()]);
  const isModuleSwitching = page !== visiblePage;

  // Monte la page cible (chargement en arrière-plan, masqué). Plafond + 1 pour
  // tolérer la cible en cours de chargement en plus des modules gardés.
  useEffect(() => {
    setMountedPages(prev => (prev.includes(page) ? prev : [page, ...prev].slice(0, KEEP_ALIVE_MAX + 1)));
  }, [page]);

  // Bascule l'affichage : immédiate si le module est déjà chargé, sinon après un
  // court délai pendant lequel il charge ses données (masqué) → aucun « Chargement… ».
  useEffect(() => {
    if (page === visiblePage) return undefined;
    if (readyPagesRef.current.has(page)) { setVisiblePage(page); return undefined; }
    const timer = setTimeout(() => { readyPagesRef.current.add(page); setVisiblePage(page); }, 300);
    return () => clearTimeout(timer);
  }, [page, visiblePage]);

  // Promeut la page affichée en tête du LRU et resserre au plafond (libère les
  // abonnements realtime des modules les plus anciens).
  useEffect(() => {
    setMountedPages(prev => [visiblePage, ...prev.filter(p => p !== visiblePage)].slice(0, KEEP_ALIVE_MAX));
  }, [visiblePage]);

  // Garde l'ensemble « prêt » en phase avec les modules réellement montés : un
  // module évincé du LRU est démonté → il devra recharger à la prochaine visite.
  useEffect(() => {
    const ready = readyPagesRef.current;
    ready.forEach(p => { if (!mountedPages.includes(p)) ready.delete(p); });
  }, [mountedPages]);

  const pagesToRender = Array.from(new Set([page, visiblePage, ...mountedPages]));
  const [legacyState, setLegacyState] = useState({ loading: true, error: null });
  const [legacyVersion, setLegacyVersion] = useState(0);
  const auth = useAuth();
  const currentEtablissement = useCurrentEtablissement(auth.profile);
  const isMobile = useIsMobile();

  useEffect(() => {
    installToastGlobals();
    writeLegacyGlobal('SafeModule', SafeModule);
    // File de punches hors-ligne : rejeu au retour du réseau + compteur global.
    startPunchSync();
  }, []);

  useEffect(() => {
    if (!auth.profile || legacyState.loading || legacyState.error) return;
    let mounted = true;

    (async () => {
      try {
        const legacyDb = dbService.getDb();
        const hydrateFromSupabase = getHydrateFromSupabase();

        // Les deux sont indépendants (user_settings d'un côté ; etabs/profils/
        // permissions de l'autre) → on les lance en parallèle au lieu de les
        // enchaîner en série, ce qui retire un aller-retour réseau de la synchro
        // post-login. Optimisation sûre quelle que soit la cause de la lenteur.
        await Promise.all([
          legacyDb?.loadAllUserSettings ? legacyDb.loadAllUserSettings() : null,
          hydrateFromSupabase ? hydrateFromSupabase() : null,
        ]);
        if (mounted) setLegacyVersion((version) => version + 1);
        // La synchro critique est terminée : on précharge les chunks des
        // modules courants en idle pour des navigations instantanées.
        prefetchCommonModules();
      } catch (err) {
        console.warn('[Vite legacy] Synchronisation post-login echouee', err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [auth.profile, legacyState.loading, legacyState.error]);

  useEffect(() => {
    let mounted = true;

    loadLegacyModules()
      .then(() => {
        if (mounted) setLegacyState({ loading: false, error: null });
      })
      .catch((err) => {
        console.error('[Vite legacy] Chargement impossible', err);
        if (mounted) setLegacyState({ loading: false, error: err });
      });

    return () => {
      mounted = false;
    };
  }, []);

  function setPage(nextPage) {
    const consultantToolsTab = getConsultantToolsTabForPage(nextPage);
    if (consultantToolsTab) {
      writeText(UI_STORAGE_KEYS.consultantToolsTab, consultantToolsTab);
    }
    const normalized = normalizePage(nextPage);
    setPageState(normalized);
    writeText(UI_STORAGE_KEYS.page, normalized);
  }

  useEffect(() => {
    setNavigationHandler(setPage);
    writeLegacyGlobal('setPage', setPage);
    return () => {
      setNavigationHandler(null);
      removeLegacyGlobal('setPage');
    };
  }, []);

  async function handleLogout() {
    try {
      const pendingPunches = getPendingPunchCount();
      await auth.signOut();
      dbService.getDb()?.clearUserSettingsCache?.();
      // Purge des caches SW de données : un autre utilisateur de cet appareil
      // ne doit rien pouvoir relire hors-ligne. La file de punches (IndexedDB)
      // est conservée : elle repartira à la prochaine session de ce compte.
      purgeAllDataCaches();
      // Même raison : le cache de traduction contient des noms de recettes.
      clearTranslationCache();
      setPage('dashboard');
      notify('Deconnexion effectuee', 'info');
      if (pendingPunches > 0) {
        notify(`${pendingPunches} pointage(s) non synchronise(s) : ils partiront a la prochaine connexion de ce compte`, 'warning');
      }
    } catch (err) {
      notify(err?.message || 'Erreur pendant la deconnexion', 'error');
    }
  }

  async function handleSelectEtablissement(id) {
    try {
      await currentEtablissement.selectEtablissement(id);
      // Purge des caches de données scopés établissement (défense en profondeur,
      // les clés d'URL portent déjà etablissement_id).
      purgeEtabDataCaches();
      notify('Etablissement mis a jour', 'info');
    } catch (err) {
      notify(err?.message || "Impossible de changer d'etablissement", 'error');
    }
  }

  let content;

  if (auth.loading) {
    content = <BootScreen />;
  } else if (!auth.profile) {
    content = <Auth onSignIn={auth.signIn} onResetPassword={auth.resetPassword} onNavigateToDashboard={() => setPage('dashboard')} />;
  } else if (auth.profile.actif === false) {
    content = <DisabledAccount onLogout={handleLogout} />;
  } else if (legacyState.loading) {
    content = <BootScreen title="Préparation de votre espace" />;
  } else if (legacyState.error) {
    content = <LegacyLoadError error={legacyState.error} />;
  } else {
    content = (
      <AppLayout
        user={auth.profile}
        currentPage={page}
        setPage={setPage}
        onLogout={handleLogout}
        etablissements={currentEtablissement.etablissements}
        etablissement={currentEtablissement.current}
        onSelectEtablissement={handleSelectEtablissement}
        permissions={getPermissionsForRole(auth.profile.role)}
      >
        {/* Keep-alive : chaque module visité reste monté ; seul le module prêt
            (visiblePage) est affiché. display:contents préserve la mise en page
            (le module reste enfant direct de <main>). Les modules en cours de
            chargement sont montés mais masqués → pas d'écran « Chargement… ».
            La clé inclut l'établissement courant : en changer REMONTE tous les
            modules à neuf (états internes compris - fiche ouverte, onglet,
            sélection…). Sans ça, un module gardé monté rechargeait ses données
            mais conservait l'état de l'ancien établissement à l'écran. */}
        {pagesToRender.map((p) => (
          <div key={`${p}::${currentEtablissement.currentId || 'boot'}`} style={{ display: p === visiblePage ? 'contents' : 'none' }}>
            <LegacyModuleHost
              page={p}
              user={auth.profile}
              etablissement={currentEtablissement.current}
              isMobile={isMobile}
              loadingEtablissement={currentEtablissement.loading}
              error={currentEtablissement.error}
              setPage={setPage}
              legacyVersion={legacyVersion}
              isActivePage={p === visiblePage}
            />
          </div>
        ))}
      </AppLayout>
    );
  }

  return (
    <>
      {isModuleSwitching && <div className="route-progress" aria-hidden="true" />}
      {content}
      <ToastContainer />
    </>
  );
}

function LegacyLoadError({ error }) {
  return (
    <main className="migration-page">
      <section className="migration-panel compact-panel">
        <p className="eyebrow">Migration Vite</p>
        <h1>Modules legacy non charges</h1>
        <p className="intro">{error?.message || String(error)}</p>
      </section>
    </main>
  );
}

function DisabledAccount({ onLogout }) {
  return (
    <main className="migration-page">
      <section className="migration-panel compact-panel">
        <p className="eyebrow">Compte desactive</p>
        <h1>Acces suspendu</h1>
        <p className="intro">Ce profil existe mais il est desactive. Contacte le consultant pour reactiver l'acces.</p>
        <button className="primary-action inline" type="button" onClick={onLogout}>Se deconnecter</button>
      </section>
    </main>
  );
}
