import { useEffect, useState } from 'react';
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

export default function App() {
  const [page, setPageState] = useState(readInitialPage);
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
        <LegacyModuleHost
          page={page}
          user={auth.profile}
          etablissement={currentEtablissement.current}
          isMobile={isMobile}
          loadingEtablissement={currentEtablissement.loading}
          error={currentEtablissement.error}
          setPage={setPage}
          legacyVersion={legacyVersion}
        />
      </AppLayout>
    );
  }

  return (
    <>
      {content}
      <ToastContainer />
    </>
  );
}

function BootScreen({ title = '' }) {
  // Splash screen : logo SC (orange sur fond vert, cohérent avec l'icône PWA)
  // + barre de progression animée + nom de l'app.
  // Animation @keyframes spin + splashBar définis dans app.css.
  return (
    <main style={bootScreenStyles.root}>
      <div style={bootScreenStyles.center}>
        {/* Logo SC — identique à l'icône PWA : fond vert #0f1a12, lettres orange #c87f3e */}
        <div style={bootScreenStyles.logoBox}>SC</div>

        <div style={bootScreenStyles.brand}>Samper Consulting</div>
        {title && <div style={bootScreenStyles.subtitle}>{title}</div>}

        {/* Barre de progression */}
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
    background: 'var(--bg)',
    fontFamily: 'var(--font)',
    zIndex: 9999,
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: '#0f1a12',
    color: '#c87f3e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 20,
    fontFamily: 'var(--font-serif)',
    letterSpacing: 1,
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
  },
  brand: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text)',
    fontFamily: 'var(--font-serif)',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 11,
    color: 'var(--text2)',
    fontStyle: 'italic',
    marginTop: -8,
  },
  barTrack: {
    width: 80,
    height: 2,
    background: 'var(--border)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    width: '40%',
    background: '#c87f3e',
    borderRadius: 1,
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
