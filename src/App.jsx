import { useDeferredValue, useEffect, useState } from 'react';
import { ToastContainer, installToastGlobals, notify } from './components/toast/index.js';
import AppLayout from './layouts/AppLayout.jsx';
import Auth from './modules/auth/Auth.jsx';
import LegacyModuleHost from './modules/LegacyModuleHost.jsx';
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
  const deferredPage = useDeferredValue(page);
  const isModuleSwitching = page !== deferredPage;
  // Ensemble des pages gardées montées (LRU plafonné). Le module visible est
  // celui de `deferredPage` ; les autres restent montés mais en display:none.
  const [mountedPages, setMountedPages] = useState(() => [readInitialPage()]);
  useEffect(() => {
    setMountedPages(prev => (prev[0] === page
      ? prev
      : [page, ...prev.filter(p => p !== page)].slice(0, KEEP_ALIVE_MAX)));
  }, [page]);
  // Garantit que la page actuellement visible (deferredPage) est toujours rendue,
  // même pendant le bref décalage avant que l'effet ci-dessus ne l'ajoute.
  const pagesToRender = mountedPages.includes(deferredPage)
    ? mountedPages
    : [deferredPage, ...mountedPages];
  const [legacyState, setLegacyState] = useState({ loading: true, error: null });
  const [legacyVersion, setLegacyVersion] = useState(0);
  const auth = useAuth();
  const currentEtablissement = useCurrentEtablissement(auth.profile);
  const isMobile = useIsMobile();

  useEffect(() => {
    installToastGlobals();
    writeLegacyGlobal('SafeModule', SafeModule);
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
      await auth.signOut();
      dbService.getDb()?.clearUserSettingsCache?.();
      setPage('dashboard');
      notify('Deconnexion effectuee', 'info');
    } catch (err) {
      notify(err?.message || 'Erreur pendant la deconnexion', 'error');
    }
  }

  async function handleSelectEtablissement(id) {
    try {
      await currentEtablissement.selectEtablissement(id);
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
    content = <BootScreen title="Chargement des modules" />;
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
        {/* Keep-alive : chaque module visité reste monté ; seul le module actif
            (deferredPage) est affiché. display:contents préserve la mise en page
            (le module reste enfant direct de <main>). Revenir sur un module
            récent est instantané, sans réécran de chargement. */}
        {pagesToRender.map((p) => (
          <div key={p} style={{ display: p === deferredPage ? 'contents' : 'none' }}>
            <LegacyModuleHost
              page={p}
              user={auth.profile}
              etablissement={currentEtablissement.current}
              isMobile={isMobile}
              loadingEtablissement={currentEtablissement.loading}
              error={currentEtablissement.error}
              setPage={setPage}
              legacyVersion={legacyVersion}
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

function BootScreen({ title = '' }) {
  // Splash screen : fond vert sombre degrade + halo doux, logo SC vert,
  // nom de l'app et barre de progression animee (@keyframes splashBar dans app.css).
  return (
    <main style={bootScreenStyles.root}>
      <div style={bootScreenStyles.glow} />
      <div style={bootScreenStyles.center}>
        <div style={bootScreenStyles.logoBox}>SC</div>

        <div style={bootScreenStyles.brand}>Samper Consulting</div>
        {title && <div style={bootScreenStyles.subtitle}>{title}</div>}

        <div style={bootScreenStyles.barTrack}>
          <div style={bootScreenStyles.barFill} />
        </div>
      </div>
    </main>
  );
}

const bootScreenStyles = {
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(125% 85% at 50% 12%, #21452f 0%, #15281b 48%, #0c160f 100%)',
    fontFamily: 'var(--font)',
    zIndex: 9999,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: '-22%',
    left: '50%',
    width: 560,
    height: 560,
    transform: 'translateX(-50%)',
    background: 'radial-gradient(circle, rgba(130,178,127,0.22) 0%, rgba(130,178,127,0) 68%)',
    pointerEvents: 'none',
  },
  center: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 18,
  },
  logoBox: {
    width: 76,
    height: 76,
    borderRadius: 22,
    background: 'linear-gradient(155deg, #244a32 0%, #15281b 100%)',
    color: '#82b27f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 30,
    fontFamily: 'var(--font-serif)',
    letterSpacing: 1,
    border: '1px solid rgba(130,178,127,0.28)',
    boxShadow: '0 10px 34px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)',
  },
  brand: {
    fontSize: 18,
    fontWeight: 700,
    color: '#ece7de',
    fontFamily: 'var(--font-serif)',
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 11.5,
    color: 'rgba(236,231,222,0.5)',
    fontStyle: 'italic',
    marginTop: -10,
  },
  barTrack: {
    marginTop: 6,
    width: 132,
    height: 3,
    background: 'rgba(255,255,255,0.09)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    width: '42%',
    background: 'linear-gradient(90deg, #588157 0%, #9ec79a 100%)',
    borderRadius: 3,
    boxShadow: '0 0 12px rgba(130,178,127,0.5)',
    animation: 'splashBar 1.2s ease-in-out infinite',
  },
};

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
