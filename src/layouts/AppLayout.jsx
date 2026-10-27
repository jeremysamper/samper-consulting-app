import React from 'react';
import { navItems as NAV_ITEMS } from '../modules/moduleConfig.js';
import { getDemoData } from '../data/demoData.js';
import { useTheme } from '../hooks/useTheme.js';
import { useModuleLabels } from '../hooks/useModuleLabels.js';
import { useAlertInstances } from '../hooks/useAlertInstances.js';
import { useVisibleNav } from '../hooks/useVisibleNav.js';
import { usePosConnectionHealth } from '../hooks/usePosConnectionHealth.js';
import SamperMark from '../components/brand/SamperMark.jsx';
import PosTokenAlertBanner from '../components/PosTokenAlertBanner.jsx';
import OfflineBanner from '../components/OfflineBanner.jsx';
import HomeScreenIconBanner from '../components/HomeScreenIconBanner.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import ChangePasswordModal from '../modules/auth/ChangePasswordModal.jsx';
import EdgeSwipeBack, { isEdgeSwipeEnabled } from '../components/EdgeSwipeBack.jsx';
import { CommandPalette, ShortcutsHelp, MOD_LABEL, buildPaletteEntries, useGlobalShortcuts } from '../components/shortcuts/KeyboardShortcuts.jsx';
import { Bell, House, Moon, PanelLeftClose, PanelLeftOpen, Pencil, Search, Sun } from 'lucide-react';
import { useCanGoBack } from '../hooks/useBackLayer.js';
import { goBack, goHome as goHomeHistory } from '../services/historyNav.js';
import NavOrganizer from '../components/nav/NavOrganizer.jsx';
import EtabSwitcher from '../components/nav/EtabSwitcher.jsx';
import AccountButton from '../components/nav/AccountButton.jsx';
import AccountModal from '../modules/auth/AccountModal.jsx';
import NavBadge from '../components/nav/NavBadge.jsx';
import { ShellProvider } from './ShellContext.js';
import { applyNavOrder } from '../hooks/useNavOrder.js';
import { navigateToPage } from '../services/navigationService.js';
import { confirmLegacy, notifyLegacy, readLegacyStorage, writeLegacyStorage } from '../legacy/legacyApi.js';
import { readJson, removeStorageKeys } from '../utils/storage.js';
import { dbService } from '../services/dbService.js';
import { messageErreur } from '../utils/messageErreur.js';

// Pages hors navItems : réservées au consultant (ouvertes depuis le compte),
// et la page d'accueil de la coque tactile.
const PAGES_HORS_MENU = { factures: 'Factures', parametres: 'Paramètres', roles: 'Rôles et accès', accueil: 'Accueil' };

/** Temps relatif lisible depuis une date ISO (ex: "il y a 3 min") */
function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'À l\'instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} jour${days > 1 ? 's' : ''}`;
}

export default function AppLayout({
  user,
  currentPage,
  setPage,
  onLogout,
  children,
  etablissements = [],
  etablissement,
  onSelectEtablissement,
  permissions: permissionsOverride,
  // Mode de présentation de la coque (useShellMode, posé par App.jsx) :
  // 'ordinateur' | 'tablette' | 'telephone'.
  shellMode = 'ordinateur',
  // Page dont le contenu est à l'écran (visiblePage d'App.jsx) : suit
  // currentPage, 300 ms plus tard quand le module demandé charge encore.
  pageAffichee = currentPage
}) {
  // Tablette et téléphone partagent la coque tactile (page d'accueil, bouton
  // Accueil) ; l'ordinateur garde barre latérale et raccourcis.
  const tactile = shellMode !== 'ordinateur';
  const { isDark, toggleTheme } = useTheme();
  const legacySB = dbService.getBridge();
  const DEMO_DATA = getDemoData();
  const scRead = readLegacyStorage;
  const scWrite = writeLegacyStorage;
  const setEtablissement = (nextEtablissement) => {
    if (!nextEtablissement?.id) return;
    onSelectEtablissement?.(nextEtablissement.id);
  };
  // Barre latérale (ordinateur) : reste ouverte tant que l'utilisateur ne la
  // replie pas lui-même ; un passage transitoire par la coque tactile (iPad
  // qui change de pointeur) ne la touche pas.
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [logoMenuOpen, setLogoMenuOpen] = React.useState(false);
  const [logoHover, setLogoHover] = React.useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [identityOverride, setIdentityOverride] = React.useState(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const canGoBack = useCanGoBack();

  // Modale « changer mon mot de passe » : rendue à l'identique dans la coque
  // mobile et la coque desktop, qui ont deux arbres de rendu séparés.
  const passwordModal = passwordModalOpen ? (
    <ChangePasswordModal email={user.email} onClose={() => setPasswordModalOpen(false)} />
  ) : null;

  // Logo applicatif = logo de l'établissement courant (stocké dans etablissements.logo_url DB).
  // Migration douce : si rien en DB et qu'il y a une valeur localStorage, on la pousse en DB.
  const appLogo = etablissement?.logo_url || null;
  const fileInputRef = React.useRef(null);

  // ─── Migration douce localStorage → DB pour le logo (one-shot par établissement) ───
  // Si le user a déjà un logo dans localStorage mais que l'établissement n'en a pas en DB,
  // on pousse le logo localStorage vers la DB une seule fois, puis on nettoie localStorage.
  React.useEffect(() => {
    if (!legacySB || !etablissement?.id) return;
    if (etablissement.logo_url) return; // déjà en DB, rien à faire
    const localLogo = readJson('sc_app_logo', null);
    if (!localLogo) return;
    // On pousse en DB et on nettoie le localStorage
    (async () => {
      try {
        await legacySB.db.updateEtablissementLogo(etablissement.id, localLogo);
        removeStorageKeys(['sc_app_logo']);
      } catch (err) {
        console.warn('[Migration logo] échec, on garde localStorage', err);
      }
    })();
  }, [etablissement?.id, etablissement?.logo_url]);

  // Permissions dynamiques (relues à chaque render depuis DEMO_DATA, hydraté depuis localStorage)
  const perms = permissionsOverride || DEMO_DATA.permissions[user.role] || {};

  // Établissements accessibles à l'utilisateur - en state live synchronisé avec Supabase
  const [etabsAll, setEtabsAll] = React.useState(() => etablissements.length ? etablissements : (DEMO_DATA.etablissements || []));
  React.useEffect(() => {
    if (etablissements.length) setEtabsAll(etablissements);
  }, [etablissements]);
  React.useEffect(() => {
    if (!legacySB) return;
    let mounted = true;
    let unsub = null;

    const reload = async () => {
      try {
        const rows = await legacySB.db.listEtablissements();
        if (!mounted) return;
        const mapped = (rows || []).map(r => ({
          id: r.id, nom: r.nom, type: r.type, adresse: r.adresse, tel: r.tel,
          email: r.email, couleur: r.couleur, actif: r.actif, notes: r.notes,
          ccntHeuresSemaine: r.ccnt_heures_semaine,
          logo_url: r.logo_url, // utilisé pour le logo applicatif et les PDF de facture
        }));
        // Ne jamais écraser une liste valide par un résultat vide (lecture
        // transitoirement KO) : le sélecteur d'établissement disparaîtrait
        // jusqu'au redémarrage de l'app.
        if (!mapped.length) return;
        setEtabsAll(mapped);
        DEMO_DATA.etablissements = mapped;
      } catch (err) { console.error('[Layout etabs]', err); }
    };

    reload();
    unsub = legacySB.realtime.subscribeReload('etablissements', reload);
    return () => { mounted = false; unsub && unsub(); };
  }, []);

  const etabs = user.etablissementIds?.length ? etabsAll.filter(e => user.etablissementIds.includes(e.id)) : etabsAll;

  // Persister l'établissement courant en DB (user_settings.current_etab_id) pour que
  // l'utilisateur retrouve son établissement à la connexion depuis n'importe quel device.
  // On garde aussi un mirror localStorage (legacy) pour pdf-utils qui est synchrone.
  React.useEffect(() => {
    if (!etablissement?.id) return;
    // 1. Mirror localStorage (legacy, lu par pdf-utils _getCurrentEtablissement de manière synchrone)
    try { scWrite('sc_current_etab', etablissement.id); } catch(e) {}
    // 2. Source de vérité : DB (user_settings)
    if (legacySB?.db?.setUserSetting) {
      legacySB.db.setUserSetting('current_etab_id', etablissement.id).catch(err => {
        console.warn('[Layout] save current_etab_id failed', err);
      });
    }
  }, [etablissement?.id]);

  // Modules visibles, rangés par rubrique, avec leurs badges : useVisibleNav
  // (filtres de rôle et d'établissement, ordre du consultant). La page
  // d'accueil tactile lit la même liste par ShellContext.
  const { visibleNav, groupedNav, navOrder, saveNavOrder, badges } = useVisibleNav({ user, etablissement, perms });
  const [organizing, setOrganizing] = React.useState(false);
  const isConsultant = user.role === 'consultant';
  // ─── Alertes configurables - Supabase (remplace DEMO_DATA) ──────
  const {
    alerts,
    unreadCount,
    dismiss: dismissAlert,
    dismissAll: dismissAllAlerts,
    markAllRead,
    loading: alertsLoading,
  } = useAlertInstances(etablissement?.id);

  // Badge d'un module (messages non lus, groupes à préparer) : NavBadge, le
  // même composant que sur la page d'accueil tactile.
  const renderNavBadge = (itemId) => <NavBadge itemId={itemId} badges={badges} />;

  const handleSetPage = (p) => setPage(p);
  // Bouton Accueil et glissé depuis le bord (coque tactile) : retour à
  // l'entrée « accueil » déjà dans l'historique, sinon nouvelle entrée.
  const goHome = () => goHomeHistory('accueil', () => handleSetPage('accueil'));

  const currentItem = NAV_ITEMS.find(n => n.id === currentPage);

  // Labels personnalisés globaux (module_labels table - portée tous établissements)
  // getLabelForModule(key, defaultLabel) → custom label ou defaultLabel si non défini
  const { getLabelForModule } = useModuleLabels();
  // Titre de la barre du haut : les pages hors menu (ouvertes depuis le
  // compte) ont leur propre nom, sinon elles s'affichaient « Tableau de bord ».
  const titrePage = currentItem
    ? getLabelForModule(currentItem.id, currentItem.label)
    : (PAGES_HORS_MENU[currentPage] || 'Tableau de bord');

  // ── Organiser le menu (consultant) ───────────────────────────────
  // Ordinateur seulement : la coque tactile n'a pas de barre à ranger.
  const startOrganizing = React.useCallback(() => {
    setSidebarOpen(true);
    setOrganizing(true);
  }, []);
  const handleSaveOrder = async (order, renames = {}) => {
    try {
      // Les modules que le consultant ne voit pas ici (inactifs dans cet
      // établissement, réservés à un autre rôle) gardent leur place et suivent
      // les rubriques renommées ou supprimées : sinon ils recréeraient, dans
      // les autres établissements, une rubrique sous l'ancien nom.
      const shown = new Set(order.map((o) => o.id));
      const kept = applyNavOrder(NAV_ITEMS, navOrder)
        .filter((item) => !shown.has(item.id))
        .map((item) => ({ id: item.id, group: renames[item.group] || item.group }));
      await saveNavOrder([...order, ...kept]);
      setOrganizing(false);
      notifyLegacy('Ordre du menu enregistré pour tous les comptes', 'success');
    } catch (err) {
      notifyLegacy('Enregistrement impossible. ' + messageErreur(err, 'menu'), 'error');
    }
  };
  const handleResetOrder = async () => {
    if (!confirmLegacy("Revenir à l'ordre par défaut du menu pour tous les comptes ?")) return;
    try {
      await saveNavOrder(null);
      setOrganizing(false);
      notifyLegacy('Ordre par défaut rétabli', 'success');
    } catch (err) {
      notifyLegacy('Enregistrement impossible. ' + messageErreur(err, 'menu'), 'error');
    }
  };
  const renderOrganizer = () => (
    <NavOrganizer
      items={visibleNav}
      getLabel={getLabelForModule}
      onSave={handleSaveOrder}
      onCancel={() => setOrganizing(false)}
      onReset={handleResetOrder}
    />
  );

  // ── Liste des modules, seul contenu du milieu de la barre ────────
  // Plus d'intitulé de rubrique à l'écran : un filet sépare les rubriques, et
  // leur nom reste annoncé aux lecteurs d'écran (role group + aria-label).
  const renderNavGroups = ({ itemStyle, activeStyle, dividerStyle, activeMarker }) => groupedNav.map((group, index) => (
    <div key={group.label} role="group" aria-label={group.label}>
      {index > 0 && <div style={dividerStyle} aria-hidden="true" />}
      {group.items.map(item => {
        // Page « accueil » sur ordinateur (iPad passé de tactile à clavier) :
        // elle affiche le tableau de bord, c'est lui qui est surligné.
        const active = currentPage === item.id || (currentPage === 'accueil' && item.id === 'dashboard');
        return (
          <button
            key={item.id}
            type="button"
            className="sc-nav-item"
            style={{ ...itemStyle, ...(active ? activeStyle : {}) }}
            aria-current={active ? 'page' : undefined}
            onClick={() => handleSetPage(item.id)}
          >
            <span style={ls.navLabel}>{getLabelForModule(item.id, item.label)}</span>
            {renderNavBadge(item.id)}
            {active && activeMarker}
          </button>
        );
      })}
    </div>
  ));

  // ── Mon compte (clic sur son nom) ───────────────────────────────
  // Nom enregistré depuis le panneau : affiché tout de suite par surcharge
  // locale, sans recréer auth.profile. Un nouvel objet profil relancerait toute
  // la synchro post-login (App.jsx) ; le profil réel suit au prochain
  // rechargement naturel (retour au premier plan, connexion suivante).
  const accountUser = identityOverride?.id === user.id ? { ...user, ...identityOverride } : user;
  const renderAccountButton = (variant) => (
    <AccountButton
      user={accountUser}
      variant={variant}
      onOpen={() => setAccountOpen(true)}
    />
  );
  const accountModal = accountOpen ? (
    <AccountModal
      user={accountUser}
      onClose={() => setAccountOpen(false)}
      onSaved={(updated) => setIdentityOverride({
        id: updated.id, prenom: updated.prenom, nom: updated.nom, avatar: updated.avatar,
      })}
      onChangePassword={() => { setAccountOpen(false); setPasswordModalOpen(true); }}
      onOrganize={isConsultant && !tactile ? () => { setAccountOpen(false); startOrganizing(); } : null}
      onLogout={onLogout}
    />
  ) : null;

  // Ce que la page d'accueil tactile lit (ShellContext) : la même liste de
  // modules et les mêmes badges que la barre latérale, le compte, la navigation.
  const shellValue = {
    mode: shellMode, visibleNav, groupedNav, badges, getLabelForModule,
    setPage: handleSetPage, etablissement, etabs, accountUser,
    openAccount: () => setAccountOpen(true),
  };

  // ── Raccourcis clavier, palette Ctrl/⌘+K, Échap ───────────────
  const toggleSidebar = React.useCallback(() => setSidebarOpen((o) => !o), []);
  const togglePalette = React.useCallback((forceOpen) => {
    setHelpOpen(false);
    setPaletteOpen((o) => (forceOpen === true ? true : !o));
  }, []);
  const openHelp = React.useCallback(() => { setPaletteOpen(false); setHelpOpen(true); }, []);
  useGlobalShortcuts({
    navItems: visibleNav,
    onNavigate: handleSetPage,
    onTogglePalette: togglePalette,
    onOpenHelp: openHelp,
    onToggleSidebar: tactile ? null : toggleSidebar,
  });

  // Échap referme ce que la coque a ouvert (panneau d'alertes, menu du logo).
  // Les modales des modules gèrent leur propre Échap.
  React.useEffect(() => {
    if (!notifOpen && !logoMenuOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      setNotifOpen(false);
      setLogoMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notifOpen, logoMenuOpen]);

  // Une navigation (clic, raccourci, retour) referme les panneaux flottants.
  React.useEffect(() => {
    setNotifOpen(false);
    setHelpOpen(false);
  }, [currentPage]);

  // Défilement de <main>, seul conteneur qui défile dans les trois coques. Un
  // module ouvert part du haut, en-tête en vue : sans remise, il gardait le
  // défilement de la page quittée (accueil tactile défilé, en-tête hors de
  // l'écran). Une page retrouvée par l'historique (retour, bouton Accueil)
  // reprend sa place : gardée montée par App.jsx, elle est restée telle quelle.
  // La remise suit la page affichée et non la page demandée : la page quittée
  // reste à l'écran le temps que le module demandé charge, sans sauter en haut.
  const mainRef = React.useRef(null);
  const positionsRef = React.useRef(new Map());
  const pageAfficheeRef = React.useRef(pageAffichee);
  const pageRetrouveeRef = React.useRef(null);
  React.useEffect(() => {
    const onPop = (e) => { pageRetrouveeRef.current = e.state?.page || null; };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Place de la page affichée, notée quand une autre est demandée : elle est
  // encore à l'écran, le module demandé est monté masqué.
  React.useLayoutEffect(() => {
    if (mainRef.current) positionsRef.current.set(pageAfficheeRef.current, mainRef.current.scrollTop);
  }, [currentPage]);
  React.useLayoutEffect(() => {
    if (pageAfficheeRef.current === pageAffichee) return;
    pageAfficheeRef.current = pageAffichee;
    const retrouvee = pageRetrouveeRef.current === pageAffichee;
    pageRetrouveeRef.current = null;
    if (mainRef.current) mainRef.current.scrollTop = retrouvee ? (positionsRef.current.get(pageAffichee) || 0) : 0;
  }, [pageAffichee]);

  // En coque tactile, la page d'accueil est une entrée de la palette comme un
  // module (elle n'est pas dans visibleNav : pas un module, pas de permission).
  const paletteNav = React.useMemo(
    () => (tactile ? [{ id: 'accueil', label: 'Accueil', group: 'Général' }, ...visibleNav] : visibleNav),
    [tactile, visibleNav],
  );
  const paletteEntries = React.useMemo(() => (paletteOpen ? buildPaletteEntries({
    navItems: paletteNav,
    getLabel: getLabelForModule,
    currentPage,
    onNavigate: handleSetPage,
    etabs,
    currentEtabId: etablissement?.id,
    onSelectEtab: setEtablissement,
    isDark,
    onToggleTheme: toggleTheme,
    onToggleSidebar: tactile ? null : toggleSidebar,
    sidebarOpen,
    onOpenHelp: openHelp,
    onBack: goBack,
    canGoBack,
    onOrganize: isConsultant && !tactile ? startOrganizing : null,
  }) : []), [paletteOpen, paletteNav, currentPage, etabs, etablissement?.id, isDark, tactile, sidebarOpen, canGoBack, isConsultant, startOrganizing]);

  const shortcutsLayer = (
    <>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} entries={paletteEntries} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} touch={isEdgeSwipeEnabled()} />
      <EdgeSwipeBack onRootSwipe={() => (tactile ? goHome() : setSidebarOpen(true))} />
    </>
  );

  // ── Bandeau alerte token POS expiré ────────────────────────────
  // Visible uniquement pour consultant / patron / resp_cuisine.
  // Les rôles cuisinier, serveur, hôte ne voient JAMAIS ce bandeau.
  const POS_BANNER_ROLES = ['consultant', 'patron', 'resp_cuisine'];
  const bannerEnabled = POS_BANNER_ROLES.includes(user?.role);
  const { unhealthy: posUnhealthy, hasIssue: posHasIssue, loading: posLoading } =
    usePosConnectionHealth({ enabled: bannerEnabled });
  const showPosBanner = bannerEnabled && !posLoading && posHasIssue;
  const handleReconnect = () => handleSetPage('parametres');

  // ── Logo upload (consultant uniquement)
  const canEditLogo = user.role === 'consultant';

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notifyLegacy('Veuillez sélectionner une image (PNG, JPG, SVG).', 'warning');
      return;
    }
    if (file.size > 500 * 1024) {
      notifyLegacy('Image trop lourde (max 500 Ko). Merci d\'en choisir une plus petite.', 'warning');
      return;
    }
    if (!etablissement?.id) {
      notifyLegacy('Aucun établissement sélectionné.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = async ev => {
      const dataUrl = ev.target.result;
      // 1. On met à jour la DB (synchronisé multi-device)
      if (legacySB) {
        try {
          await legacySB.db.updateEtablissementLogo(etablissement.id, dataUrl);
          notifyLegacy('Logo mis à jour pour ' + etablissement.nom, 'success');
        } catch (err) {
          notifyLegacy('Logo non enregistré. ' + messageErreur(err, 'logo'), 'error');
          return;
        }
      }
      // 2. Petit delay puis le realtime de etablissements va rafraîchir l'UI naturellement.
      // Pas besoin de setState manuel : le subscribe sur 'etablissements' va déclencher la mise à jour.
      setLogoMenuOpen(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLogoRemove = async () => {
    if (!etablissement?.id) return;
    if (!confirmLegacy('Revenir au logo Samper par défaut pour ' + etablissement.nom + ' ?')) return;
    if (legacySB) {
      try {
        await legacySB.db.updateEtablissementLogo(etablissement.id, null);
      } catch (err) {
        notifyLegacy('Logo non supprimé. ' + messageErreur(err, 'logo'), 'error');
        return;
      }
    }
    removeStorageKeys(['sc_app_logo']) // nettoyage legacy
    setLogoMenuOpen(false);
  };

  // LogoMark et LogoMenu : fonctions de rendu (pas des composants React)
  // afin d'éviter le problème des composants définis à l'intérieur d'autres composants.
  // Consultant : le logo est un vrai <button> (atteignable au clavier) ; .mini
  // le soustrait à la règle tactile globale qui l'étirerait à 44 px de haut.
  const renderLogoMark = (size = 34, fontSize = 12) => {
    const LogoTag = canEditLogo ? 'button' : 'div';
    return (
      <LogoTag
        {...(canEditLogo ? {
          type: 'button',
          className: 'mini',
          'aria-haspopup': 'menu',
          'aria-expanded': logoMenuOpen,
          'aria-label': 'Changer le logo',
        } : {})}
        style={{
          width: size, height: size, borderRadius: 8, padding: 0,
          // Sans logo d'établissement, on affiche la marque Samper (fond pétrole
          // intégré au SVG) : le conteneur reste transparent, sinon le --accent
          // clair du mode sombre déborderait en liseré.
          background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize, color: '#fff',
          fontFamily: 'var(--font-serif)', letterSpacing: 1, flexShrink: 0,
          overflow: 'hidden', position: 'relative',
          cursor: canEditLogo ? 'pointer' : 'default',
          // --nav-accent et non --accent : le pointillé pétrole disparaissait
          // sur l'encre de la barre.
          border: canEditLogo && logoHover ? '2px dashed var(--nav-accent)' : '2px solid transparent',
          transition: 'border 0.15s',
        }}
        onMouseEnter={() => canEditLogo && setLogoHover(true)}
        onMouseLeave={() => setLogoHover(false)}
        onClick={canEditLogo ? (e) => { e.stopPropagation(); setLogoMenuOpen(!logoMenuOpen); } : undefined}
        title={canEditLogo ? 'Cliquer pour changer le logo' : undefined}
      >
        {appLogo
          ? <img src={appLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <SamperMark size={size} radius={0} title="Samper Consulting" style={{ width: '100%', height: '100%', display: 'block' }} />}
        {canEditLogo && logoHover && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size > 30 ? 14 : 11, color: '#fff',
          }}>
            <Pencil size={size > 30 ? 16 : 12} aria-hidden="true" />
          </div>
        )}
      </LogoTag>
    );
  };

  const renderLogoMenu = () => (
    logoMenuOpen && canEditLogo && (
      <div style={ls.logoMenu} onClick={e => e.stopPropagation()}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleLogoUpload}
        />
        <button style={ls.logoMenuBtn} onClick={() => fileInputRef.current?.click()}>
          Changer le logo
        </button>
        {appLogo && (
          <button style={{ ...ls.logoMenuBtn, color: 'var(--danger-strong)' }} onClick={handleLogoRemove}>
            Retirer le logo
          </button>
        )}
        <div style={{ fontSize: 11, color: 'var(--text2)', padding: '8px 12px 4px', borderTop: '1px solid var(--border)' }}>
          Max 500 Ko. PNG, JPG ou SVG.
        </div>
      </div>
    )
  );

  // ─── Panel d'alertes - rendu partagé desktop + mobile ────────────
  // panelStyle / headerStyle / itemStyle viennent de ls ou mls selon le contexte.
  const handleAlertClick = async (alert) => {
    await dismissAlert(alert.id);
    setNotifOpen(false);
    if (alert.link_module) navigateToPage(alert.link_module);
  };

  const renderAlertPanel = (panelStyle, headerStyle, itemStyle) => {
    const severityColor = (sev) => {
      if (sev === 'critical') return 'var(--danger-strong)';
      if (sev === 'info') return 'var(--info-strong)';
      return 'var(--warning-strong)'; // warning (défaut)
    };
    return (
      <div style={panelStyle}>
        {/* En-tête */}
        <div style={{ ...headerStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Alertes{alerts.length > 0 ? ` (${alerts.length})` : ''}</span>
          {alerts.length > 0 && (
            <button
              style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font)', padding: '2px 6px' }}
              onClick={dismissAllAlerts}
            >Tout effacer</button>
          )}
        </div>
        {/* Chargement */}
        {alertsLoading && (
          <div style={{ padding: '16px', fontSize: 13, color: 'var(--text2)', textAlign: 'center' }}>Chargement…</div>
        )}
        {/* État vide */}
        {!alertsLoading && alerts.length === 0 && (
          <div style={{ ...itemStyle, color: 'var(--text2)', fontStyle: 'italic', borderLeft: '2px solid var(--success-bd)' }}>
            Aucune alerte active
          </div>
        )}
        {/* Liste des alertes */}
        {alerts.map((alert) => (
          <div
            key={alert.id}
            style={{ ...itemStyle, borderLeft: `2px solid ${severityColor(alert.severity)}`, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start' }}
            className="mini"
            role="button"
            tabIndex={0}
            onClick={() => handleAlertClick(alert)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleAlertClick(alert); }
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{alert.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 }}>{alert.message}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{formatRelativeTime(alert.created_at)}</div>
            </div>
            <button
              style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text2)', cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
              onClick={(e) => { e.stopPropagation(); dismissAlert(alert.id); }}
              aria-label="Fermer"
            >×</button>
          </div>
        ))}
      </div>
    );
  };

  // ════════════════════════════════
  // COQUE TACTILE (tablette et téléphone)
  // ════════════════════════════════
  // Ni barre latérale ni tiroir : la liste des modules est la page d'accueil
  // (AccueilTactile, rendue par LegacyModuleHost). Header « verre » : bouton
  // Accueil à gauche, titre et établissement au centre, langue, thème et
  // alertes à droite. Les bandeaux restent au-dessus du header.
  if (tactile) {
    return (
      <ShellProvider value={shellValue}>
      <div style={mls.root}>
        <OfflineBanner />
        <HomeScreenIconBanner />

        <div style={mls.stage}>
          <header style={mls.topbar} className="app-glass-bar">
            <button
              type="button"
              className="app-bar-btn"
              style={mls.iconBtn}
              onClick={goHome}
              aria-label="Accueil"
              aria-current={currentPage === 'accueil' ? 'page' : undefined}
              title="Accueil"
            >
              <House size={24} strokeWidth={2} aria-hidden="true" />
            </button>

            <EtabSwitcher
              variant="mobile"
              title={titrePage}
              etabs={etabs}
              current={etablissement}
              onSelect={setEtablissement}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
              {showPosBanner && (
                <PosTokenAlertBanner
                  unhealthy={posUnhealthy}
                  onReconnect={handleReconnect}
                  variant="pill"
                />
              )}
              <LanguageToggle compact etablissementId={etablissement?.id || null} />
              <button
                type="button"
                className="app-bar-btn"
                style={mls.iconBtn}
                onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
                aria-label={isDark ? 'Mode clair' : 'Mode sombre'}
                title={isDark ? 'Mode clair' : 'Mode sombre'}
              >
                {isDark ? <Sun size={20} strokeWidth={2} aria-hidden="true" /> : <Moon size={20} strokeWidth={2} aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="app-bar-btn"
                style={mls.iconBtn}
                onClick={() => { const opening = !notifOpen; setNotifOpen(opening); if (opening && unreadCount > 0) markAllRead(); }}
                aria-label={unreadCount > 0 ? `Alertes (${unreadCount} non lues)` : 'Alertes'}
                aria-expanded={notifOpen}
              >
                <Bell size={20} strokeWidth={2} aria-hidden="true" />
                {unreadCount > 0 && <div style={mls.notifDot}>{unreadCount}</div>}
              </button>
              {notifOpen && renderAlertPanel(mls.notifPanel, mls.notifHeader, mls.notifItem)}
            </div>
          </header>

          <main ref={mainRef} style={mls.content} className="mobile-module-content" onClick={() => { notifOpen && setNotifOpen(false); logoMenuOpen && setLogoMenuOpen(false); }}>
            {children}
          </main>
        </div>

        {accountModal}
        {passwordModal}
        {shortcutsLayer}
      </div>
      </ShellProvider>
    );
  }

  // ════════════════════════════════
  // DESKTOP
  // ════════════════════════════════
  // --largeur-menu : place prise par la barre latérale, pour les barres fixes
  // en bas d'écran qui doivent commencer après elle (sélection du Planning).
  return (
    <ShellProvider value={shellValue}>
    <div style={{ ...ls.root, '--largeur-menu': sidebarOpen ? '234px' : '0px' }} onClick={() => { notifOpen && setNotifOpen(false); logoMenuOpen && setLogoMenuOpen(false); }}>
      {/* Barre au strict minimum : logo en haut, modules, nom de l'utilisateur
          en bas. L'établissement est dans le header, les actions de compte
          dans le menu du nom, le repli dans le bouton du header.
          Repliée = la barre disparaît complètement (width 0 + visibility
          hidden après la transition). */}
      <aside
        id="app-sidebar"
        aria-label="Menu principal"
        style={{
          ...ls.sidebar,
          width: sidebarOpen ? 234 : 0,
          borderRight: sidebarOpen ? '1px solid var(--nav-border)' : 'none',
          visibility: sidebarOpen ? 'visible' : 'hidden',
          transition: sidebarOpen
            ? 'width .2s cubic-bezier(.4,0,.2,1)'
            : 'width .2s cubic-bezier(.4,0,.2,1), visibility 0s linear .2s',
        }}
      >
        <div style={ls.sidebarTop}>
          <div style={{ position: 'relative' }}>
            {renderLogoMark(36, 13)}
            {renderLogoMenu()}
          </div>
        </div>

        <nav style={ls.nav} aria-label="Modules" data-nav-scroll>
          {organizing ? renderOrganizer() : renderNavGroups({
            itemStyle: ls.navItem,
            activeStyle: ls.navActive,
            dividerStyle: ls.navDivider,
            activeMarker: <span style={ls.navActiveLine} aria-hidden="true" />,
          })}
        </nav>

        <div style={ls.userArea}>
          {renderAccountButton('desktop')}
        </div>
      </aside>

      <div style={ls.main}>
        {showPosBanner && (
          <PosTokenAlertBanner
            unhealthy={posUnhealthy}
            onReconnect={handleReconnect}
          />
        )}
        {/* Bandeau d'état hors-ligne / sync pointages / mise à jour */}
        <OfflineBanner />
        <HomeScreenIconBanner />
        {/* Scène : le header « verre » est posé en absolu sur la zone qui
            défile, le contenu passe dessous (--app-header-h, app.css). */}
        <div style={ls.stage}>
          <header style={ls.topbar} className="topbar-desktop app-glass-bar">
            <div style={ls.topbarLeft}>
              {/* Un seul bouton, toujours au même endroit, pour replier et
                  rouvrir la barre (remplace ❮ dans la barre et la languette). */}
              <button
                type="button"
                className="app-bar-btn"
                style={ls.sidebarToggle}
                onClick={(e) => { e.stopPropagation(); toggleSidebar(); }}
                aria-controls="app-sidebar"
                aria-expanded={sidebarOpen}
                aria-label={sidebarOpen ? 'Masquer le menu' : 'Afficher le menu'}
                aria-keyshortcuts={MOD_LABEL === '⌘' ? 'Meta+B' : 'Control+B'}
                title={`${sidebarOpen ? 'Masquer le menu' : 'Afficher le menu'} (${MOD_LABEL} B)`}
              >
                {sidebarOpen
                  ? <PanelLeftClose size={18} strokeWidth={2} aria-hidden="true" />
                  : <PanelLeftOpen size={18} strokeWidth={2} aria-hidden="true" />}
              </button>
              {/* Titre + établissement (sélecteur s'il y en a plusieurs). */}
              <EtabSwitcher
                title={titrePage}
                etabs={etabs}
                current={etablissement}
                onSelect={setEtablissement}
              />
            </div>
            {/* Quatre boutons, rien d'autre : langue, recherche, thème,
                alertes. La déconnexion est dans « Mon compte » (clic sur le
                nom, en bas de la barre latérale). */}
            <div style={ls.topbarRight} className="topbar-right">
              <LanguageToggle compact etablissementId={etablissement?.id || null} />
              <button
                type="button"
                className="app-bar-btn"
                style={ls.iconBtn}
                onClick={(e) => { e.stopPropagation(); togglePalette(true); }}
                aria-label="Aller à un module"
                aria-keyshortcuts={MOD_LABEL === '⌘' ? 'Meta+K' : 'Control+K'}
                title={`Aller à… (${MOD_LABEL} K)`}
              >
                <Search size={18} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="app-bar-btn"
                style={ls.iconBtn}
                onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
                aria-label={isDark ? 'Mode clair' : 'Mode sombre'}
                title={isDark ? 'Mode clair' : 'Mode sombre'}
              >
                {isDark ? <Sun size={18} strokeWidth={2} aria-hidden="true" /> : <Moon size={18} strokeWidth={2} aria-hidden="true" />}
              </button>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="app-bar-btn"
                  style={ls.iconBtn}
                  onClick={(e) => { e.stopPropagation(); const opening = !notifOpen; setNotifOpen(opening); if (opening && unreadCount > 0) markAllRead(); }}
                  aria-label={unreadCount > 0 ? `Alertes (${unreadCount} non lues)` : 'Alertes'}
                  aria-expanded={notifOpen}
                  title="Alertes"
                >
                  <Bell size={18} strokeWidth={2} aria-hidden="true" />
                  {unreadCount > 0 && <div style={ls.notifDot}>{unreadCount}</div>}
                </button>
                {notifOpen && renderAlertPanel(ls.notifPanel, ls.notifHeader, ls.notifItem)}
              </div>
            </div>
          </header>

          <main ref={mainRef} style={ls.content}>{children}</main>
        </div>
      </div>

      {accountModal}
      {passwordModal}
      {shortcutsLayer}
    </div>
    </ShellProvider>
  );
}

const ls = {
  // Desktop - navigation « encre pétrole » : la sidebar est en aplat uni
  // (--nav, sans dégradé) dans les DEUX thèmes, avec les tokens nav-* pour les
  // textes et filets. La coque tactile (mls) n'a pas de barre : seul son
  // header « verre » reprend ces tokens. Fond transparent sur la coque :
  // l'ambiance (--ambient) posée sur <body> respire sous le contenu.
  // height 100% et non 100vh : #root porte déjà les zones de sécurité iOS, une
  // coque en 100vh dépasse par le bas de la hauteur de l'indicateur d'accueil et
  // fait sortir de l'écran le bas de la zone de contenu (barres d'action posées).
  root: { display: 'flex', height: '100%', fontFamily: 'var(--font)', background: 'transparent', overflow: 'hidden' },
  // minWidth 0 + overflow hidden : la barre peut s'animer jusqu'à width 0 sans
  // être bloquée par la taille min-content de ses enfants flex.
  sidebar: { background: 'var(--nav)', display: 'flex', flexDirection: 'column', flexShrink: 0, minWidth: 0, overflow: 'hidden', borderRight: '1px solid var(--nav-border)', transition: 'width .2s cubic-bezier(.4,0,.2,1)' },
  // Haut de barre : le logo seul, aligné sur le texte des modules.
  sidebarTop: { display: 'flex', alignItems: 'center', padding: '18px 16px 12px', flexShrink: 0 },
  logoMenu: { position: 'absolute', top: '100%', left: 0, marginTop: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--sh-lg)', width: 200, zIndex: 300, overflow: 'hidden' },
  logoMenuBtn: { width: '100%', display: 'block', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', fontSize: 13, color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)' },
  nav: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 7px 12px', overflowY: 'auto' },
  // Filet entre deux rubriques, à la place de leur intitulé.
  navDivider: { height: 1, background: 'var(--nav-border)', margin: '7px 10px' },
  navItem: { display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 8, border: 'none', background: 'none', color: 'var(--nav-text)', cursor: 'pointer', fontSize: 13, fontWeight: 500, position: 'relative', transition: 'background .15s,color .15s,box-shadow .15s', fontFamily: 'var(--font)', width: '100%', textAlign: 'left', marginBottom: 1 },
  navActive: { background: 'var(--nav-active)', color: 'var(--nav-text-active)', fontWeight: 500, boxShadow: 'var(--nav-glow)' },
  navActiveLine: { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 16, background: 'var(--nav-accent)', borderRadius: 2, opacity: 0.85 },
  navLabel: { flex: 1, minWidth: 0, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  // Pied de barre : le nom de l'utilisateur (menu de compte, UserMenu.jsx).
  userArea: { padding: '8px 6px 10px', borderTop: '1px solid var(--nav-border)', flexShrink: 0 },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  // Scène du header « verre » : il est posé en absolu, <main> défile dessous.
  // --app-header-h = hauteur du header, reprise par le padding haut de <main>.
  stage: { position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', '--app-header-h': '56px' },
  // Fond, flou et filet : classe .app-glass-bar (app.css). zIndex 20 : au-dessus
  // des en-têtes collants des modules (≤ 10), sous leurs modales (≥ 1000).
  topbar: { position: 'absolute', top: 0, left: 0, right: 0, height: 56, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 0 18px' },
  // Le côté gauche cède la place (titre en points de suspension), le côté
  // droit jamais : ses boutons écrasés devenaient intouchables.
  topbarLeft: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 auto', marginRight: 12 },
  topbarRight: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 },
  sidebarToggle: { width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: -8, background: 'none', border: 'none', borderRadius: 12, color: 'var(--text2)', cursor: 'pointer', padding: 0 },
  // Les quatre boutons du header : même carré de 44 px, sans bordure (survol :
  // .app-bar-btn dans app.css), comme le sélecteur de langue compact.
  iconBtn: { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'none', border: 'none', borderRadius: 12, color: 'var(--text2)', cursor: 'pointer', position: 'relative', padding: 0 },
  // Compteur d'alertes : une seule forme, ordinateur et téléphone (pilule qui
  // s'élargit au-delà de 9).
  notifDot: { position: 'absolute', top: 4, right: 4, background: 'var(--danger-fill)', color: 'var(--on-danger)', fontSize: 11, fontWeight: 700, minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  // Hauteur bornée : une longue liste d'alertes sortait du bas de la zone
  // (overflow hidden) sans pouvoir défiler.
  notifPanel: { position: 'absolute', right: 0, top: 46, width: 300, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-lg)', zIndex: 200 },
  notifHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5 },
  notifItem: { padding: '10px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', lineHeight: 1.4 },
  // minHeight 0 : sans lui <main> prend la hauteur de son contenu et ne défile pas.
  // Le haut démarre sous le header (padding = header + 24 px). Un élément
  // position: sticky des modules s'arrête sous le padding de son conteneur de
  // défilement : leurs top: 0 retombent donc 24 px sous le header, comme avant.
  // scroll-padding : « faire défiler jusqu'à » ne cache pas la cible sous lui.
  content: {
    flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', maxWidth: '100%',
    padding: '24px', paddingTop: 'calc(var(--app-header-h) + 24px)',
    scrollPaddingTop: 'var(--app-header-h)',
  },

};

// ═══════════════════════════════════════════════════════════════
// COQUE TACTILE (tablette et téléphone) : styles
// ═══════════════════════════════════════════════════════════════
const mls = {
  // Coque de hauteur FIXE dont seul <main> défile, exactement comme en desktop.
  // Avec l'ancien minHeight:100vh, c'est #root qui défilait et <main> prenait la
  // hauteur de son contenu : il restait une « boîte de défilement » (overflowY
  // auto) qui ne défilait jamais, ce qui neutralise position:sticky. Les barres
  // d'action posées en bas d'un module - dont « Générer les étiquettes » -
  // repartaient donc tout en bas de la page au lieu de rester sous la main.
  // height 100% et non 100vh : #root est déjà borné aux zones de sécurité iOS,
  // 100vh déborderait par le bas de la hauteur de l'indicateur d'accueil.
  root: { height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'transparent', fontFamily: 'var(--font)' },

  // Scène du header « verre » (voir ls.stage).
  stage: { position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', '--app-header-h': '60px' },

  // Header « verre » posé en absolu sur la zone qui défile. Fond, flou et
  // filet : classe .app-glass-bar (app.css).
  topbar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, height: 60,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
    padding: '0 8px',
  },
  iconBtn: { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'none', border: 'none', borderRadius: 12, color: 'var(--text)', cursor: 'pointer', position: 'relative', padding: 0 },
  notifDot: { position: 'absolute', top: 6, right: 6, background: 'var(--danger-fill)', color: 'var(--on-danger)', fontSize: 11, fontWeight: 700, minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  notifPanel: { position: 'absolute', right: 0, top: 44, width: 300, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-lg)', zIndex: 100, maxHeight: 360, overflowY: 'auto' },
  notifHeader: { padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4 },
  notifItem: { padding: '10px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', lineHeight: 1.4 },

  // minHeight 0 : sans lui, la taille minimale automatique d'un élément flex
  // vaut la hauteur de son contenu, <main> déborde la coque et ne défile pas.
  // Le haut démarre sous le header « verre » (voir ls.content).
  content: {
    flex: 1, minHeight: 0, padding: '16px 14px 24px', paddingTop: 'calc(var(--app-header-h) + 16px)',
    overflowY: 'auto', overflowX: 'hidden', maxWidth: '100%',
    scrollPaddingTop: 'var(--app-header-h)',
  },
};
