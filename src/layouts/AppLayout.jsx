import React from 'react';
import { navItems as NAV_ITEMS, isModuleActiveForEtab } from '../modules/moduleConfig.js';
import { getDemoData } from '../data/demoData.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useTheme } from '../hooks/useTheme.js';
import { useModuleLabels } from '../hooks/useModuleLabels.js';
import { useAlertInstances } from '../hooks/useAlertInstances.js';
import { useUnreadPrivateMessages } from '../hooks/useUnreadPrivateMessages.js';
import { useGroupesAlerte } from '../hooks/useGroupesAlerte.js';
import { usePosConnectionHealth } from '../hooks/usePosConnectionHealth.js';
import SamperMark from '../components/brand/SamperMark.jsx';
import PosTokenAlertBanner from '../components/PosTokenAlertBanner.jsx';
import OfflineBanner from '../components/OfflineBanner.jsx';
import HomeScreenIconBanner from '../components/HomeScreenIconBanner.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import ChangePasswordModal from '../modules/auth/ChangePasswordModal.jsx';
import EdgeSwipeBack, { isEdgeSwipeEnabled } from '../components/EdgeSwipeBack.jsx';
import { CommandPalette, ShortcutsHelp, MOD_LABEL, buildPaletteEntries, useGlobalShortcuts } from '../components/shortcuts/KeyboardShortcuts.jsx';
import { Bell, Moon, PanelLeftClose, PanelLeftOpen, Pencil, Search, Sun } from 'lucide-react';
import { useBackLayer, useCanGoBack } from '../hooks/useBackLayer.js';
import { goBack } from '../services/historyNav.js';
import NavOrganizer from '../components/nav/NavOrganizer.jsx';
import EtabSwitcher from '../components/nav/EtabSwitcher.jsx';
import AccountButton from '../components/nav/AccountButton.jsx';
import AccountModal from '../modules/auth/AccountModal.jsx';
import { applyNavOrder, useNavOrder } from '../hooks/useNavOrder.js';
import { navigateToPage } from '../services/navigationService.js';
import { confirmLegacy, notifyLegacy, readLegacyStorage, writeLegacyStorage } from '../legacy/legacyApi.js';
import { readJson, removeStorageKeys } from '../utils/storage.js';
import { dbService } from '../services/dbService.js';

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
  permissions: permissionsOverride
}) {
  const isMobile = useIsMobile();
  const { isDark, toggleTheme } = useTheme();
  const legacySB = dbService.getBridge();
  const DEMO_DATA = getDemoData();
  const scRead = readLegacyStorage;
  const scWrite = writeLegacyStorage;
  const setEtablissement = (nextEtablissement) => {
    if (!nextEtablissement?.id) return;
    onSelectEtablissement?.(nextEtablissement.id);
  };
  // DEUX états distincts, et non un seul partagé : le tiroir mobile s'ouvre à la
  // demande et se referme après navigation, la barre latérale desktop reste
  // ouverte tant que l'utilisateur ne la replie pas lui-même. Avec un état
  // commun, un basculement transitoire en présentation mobile refermait le
  // tiroir - et l'iPad revenait en desktop SANS barre latérale, sans que
  // personne ne l'ait repliée.
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [logoMenuOpen, setLogoMenuOpen] = React.useState(false);
  const [logoHover, setLogoHover] = React.useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = React.useState(false);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const [identityOverride, setIdentityOverride] = React.useState(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  // Décalage du tiroir pendant un glissé vers la gauche (null = au repos).
  const [drawerDrag, setDrawerDrag] = React.useState(null);
  const drawerGestureRef = React.useRef(null);
  const canGoBack = useCanGoBack();

  // Tiroir mobile ouvert = une entrée d'historique : le geste retour
  // (Android, glissé depuis le bord) le referme au lieu de quitter le module.
  const closeDrawer = React.useCallback(() => setDrawerOpen(false), []);
  useBackLayer(isMobile && drawerOpen, closeDrawer, 'drawer');

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

  // Nav filtrée : on cache TOUT module dont la permission est explicitement false.
  // Si la permission n'existe pas (undefined) → on suit la valeur par défaut du rôle dans DEMO_DATA.
  // Si la valeur par défaut est aussi absente → on affiche par défaut (nouveau module ajouté côté code).
  // Ordre du menu choisi par le consultant (partagé par tous les comptes).
  const { order: navOrder, save: saveNavOrder } = useNavOrder();
  const [organizing, setOrganizing] = React.useState(false);
  const isConsultant = user.role === 'consultant';
  const visibleNav = React.useMemo(() => applyNavOrder(NAV_ITEMS, navOrder).filter(item => {
    // IA / assistant / outils consultant : réservés au consultant culinaire,
    // même si la table permissions accorde le module à un autre rôle.
    if ((item.id === 'faq' || item.id === 'consultant_tools') && user.role !== 'consultant') return false;
    // KDS : rôles cuisine uniquement (miroir de la RLS kds_orders), la clé kds
    // n'existant pas encore dans la table permissions en BDD.
    if (item.id === 'kds' && !['consultant', 'resp_cuisine', 'cuisinier'].includes(user.role)) return false;
    // Modules choisis pour l'établissement courant (Paramètres), pour tous les
    // rôles consultant compris : le menu montre ce que l'équipe utilise.
    if (!isModuleActiveForEtab(etablissement, item.permKey)) return false;
    const permVal = perms[item.permKey];
    if (permVal === false) return false;
    if (permVal === true) return true;
    // permVal undefined : fallback sur les défauts du rôle
    const defaultPerms = (DEMO_DATA.permissions && DEMO_DATA.permissions[user.role]) || {};
    if (defaultPerms[item.permKey] === false) return false;
    return true;
  }), [perms, user.role, navOrder, etablissement]);
  const groupedNav = React.useMemo(() => visibleNav.reduce((groups, item) => {
    const groupName = item.group || 'Modules';
    const group = groups.find((entry) => entry.label === groupName);
    if (group) {
      group.items.push(item);
    } else {
      groups.push({ label: groupName, items: [item] });
    }
    return groups;
  }, []), [visibleNav]);
  // ─── Alertes configurables - Supabase (remplace DEMO_DATA) ──────
  const {
    alerts,
    unreadCount,
    dismiss: dismissAlert,
    dismissAll: dismissAllAlerts,
    markAllRead,
    loading: alertsLoading,
  } = useAlertInstances(etablissement?.id);

  // Le tiroir ne survit ni à une navigation ni au retour en présentation
  // desktop. La barre latérale desktop, elle, n'est jamais touchée ici.
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [currentPage, isMobile]);

  // Badge messages privés non lus (reçus, tous expéditeurs) sur l'item de nav
  const unreadMessages = useUnreadPrivateMessages(user?.id);
  // Groupes des 14 prochains jours pas encore prêts : l'alerte d'anticipation
  // doit se voir depuis n'importe quel module, sinon elle ne prévient personne.
  // Aucune requête pour un rôle qui n'a pas le module dans son menu.
  const groupesAPreparer = useGroupesAlerte(etablissement?.id, {
    enabled: visibleNav.some((item) => item.id === 'groupes'),
  });
  const navBadgeStyle = {
    fontSize: 10, fontWeight: 700,
    padding: '2px 7px', borderRadius: 99, minWidth: 14, textAlign: 'center',
    lineHeight: 1.4, flexShrink: 0,
  };
  const renderNavBadge = (itemId) => {
    if (itemId === 'messages' && unreadMessages > 0) {
      return <span style={{ ...navBadgeStyle, color: '#fff', background: 'var(--danger-strong)' }}>{unreadMessages}</span>;
    }
    if (itemId === 'groupes' && groupesAPreparer > 0) {
      return (
        <span
          title="Groupes à préparer dans les 14 prochains jours"
          /* Texte foncé sur ambre clair : du blanc sur --warning-strong tombait
             à ~2:1 de contraste, illisible de loin sur l'iPad du passe. */
          style={{
            ...navBadgeStyle, background: 'var(--warning-bg)', color: 'var(--warning-text)',
            boxShadow: 'inset 0 0 0 1px var(--warning-bd)',
          }}
        >
          {groupesAPreparer}
        </span>
      );
    }
    return null;
  };

  const handleSetPage = (p) => { setPage(p); setDrawerOpen(false); };

  const currentItem = NAV_ITEMS.find(n => n.id === currentPage);

  // Labels personnalisés globaux (module_labels table - portée tous établissements)
  // getLabelForModule(key, defaultLabel) → custom label ou defaultLabel si non défini
  const { getLabelForModule } = useModuleLabels();

  // ── Organiser le menu (consultant) ───────────────────────────────
  const startOrganizing = React.useCallback(() => {
    if (isMobile) setDrawerOpen(true);
    else setSidebarOpen(true);
    setOrganizing(true);
  }, [isMobile]);
  // Tiroir refermé = rangement abandonné (rien n'est enregistré).
  React.useEffect(() => {
    if (isMobile && !drawerOpen) setOrganizing(false);
  }, [isMobile, drawerOpen]);
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
      notifyLegacy('Enregistrement impossible : ' + (err?.message || err), 'error');
    }
  };
  const handleResetOrder = async () => {
    if (!confirmLegacy("Revenir à l'ordre par défaut du menu pour tous les comptes ?")) return;
    try {
      await saveNavOrder(null);
      setOrganizing(false);
      notifyLegacy('Ordre par défaut rétabli', 'success');
    } catch (err) {
      notifyLegacy('Enregistrement impossible : ' + (err?.message || err), 'error');
    }
  };
  const renderOrganizer = (variant) => (
    <NavOrganizer
      items={visibleNav}
      getLabel={getLabelForModule}
      onSave={handleSaveOrder}
      onCancel={() => setOrganizing(false)}
      onReset={handleResetOrder}
      variant={variant}
    />
  );

  // ── Liste des modules, seul contenu du milieu de la barre ────────
  // Plus d'intitulé de rubrique à l'écran : un filet sépare les rubriques, et
  // leur nom reste annoncé aux lecteurs d'écran (role group + aria-label).
  const renderNavGroups = ({ itemStyle, activeStyle, dividerStyle, activeMarker }) => groupedNav.map((group, index) => (
    <div key={group.label} role="group" aria-label={group.label}>
      {index > 0 && <div style={dividerStyle} aria-hidden="true" />}
      {group.items.map(item => {
        const active = currentPage === item.id;
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
      onOpen={() => { setDrawerOpen(false); setAccountOpen(true); }}
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
      onOrganize={isConsultant ? () => { setAccountOpen(false); startOrganizing(); } : null}
      onLogout={onLogout}
    />
  ) : null;

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
    onToggleSidebar: isMobile ? null : toggleSidebar,
  });

  // Échap referme ce que la coque a ouvert (panneau d'alertes, menu du logo,
  // tiroir). Les modales des modules gèrent leur propre Échap.
  React.useEffect(() => {
    if (!notifOpen && !logoMenuOpen && !drawerOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      setNotifOpen(false);
      setLogoMenuOpen(false);
      setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notifOpen, logoMenuOpen, drawerOpen]);

  // Une navigation (clic, raccourci, retour) referme les panneaux flottants.
  React.useEffect(() => {
    setNotifOpen(false);
    setHelpOpen(false);
  }, [currentPage]);

  const paletteEntries = React.useMemo(() => (paletteOpen ? buildPaletteEntries({
    navItems: visibleNav,
    getLabel: getLabelForModule,
    currentPage,
    onNavigate: handleSetPage,
    etabs,
    currentEtabId: etablissement?.id,
    onSelectEtab: setEtablissement,
    isDark,
    onToggleTheme: toggleTheme,
    onToggleSidebar: isMobile ? null : toggleSidebar,
    sidebarOpen,
    onOpenHelp: openHelp,
    onBack: goBack,
    canGoBack,
    onOrganize: isConsultant ? startOrganizing : null,
  }) : []), [paletteOpen, visibleNav, currentPage, etabs, etablissement?.id, isDark, isMobile, sidebarOpen, canGoBack, isConsultant, startOrganizing]);

  const shortcutsLayer = (
    <>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} entries={paletteEntries} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} touch={isEdgeSwipeEnabled()} />
      <EdgeSwipeBack onRootSwipe={() => (isMobile ? setDrawerOpen(true) : setSidebarOpen(true))} />
    </>
  );

  // Glisser le tiroir vers la gauche pour le refermer : il suit le doigt.
  const drawerTouch = {
    onTouchStart: (e) => {
      const t = e.touches[0];
      drawerGestureRef.current = { x0: t.clientX, y0: t.clientY, horizontal: null };
    },
    onTouchMove: (e) => {
      const g = drawerGestureRef.current;
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;
      if (g.horizontal === null) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        g.horizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (g.horizontal) setDrawerDrag(Math.min(0, dx));
    },
    onTouchEnd: () => {
      const g = drawerGestureRef.current;
      drawerGestureRef.current = null;
      if (g?.horizontal && drawerDrag !== null && drawerDrag < -70) setDrawerOpen(false);
      setDrawerDrag(null);
    },
  };
  drawerTouch.onTouchCancel = drawerTouch.onTouchEnd;

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
          notifyLegacy('Erreur enregistrement logo : ' + err.message, 'error');
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
        notifyLegacy('Erreur suppression logo : ' + err.message, 'error');
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
            fontSize: size > 30 ? 14 : 10, color: '#fff',
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
        <div style={{ fontSize: 10, color: 'var(--text2)', padding: '8px 12px 4px', borderTop: '1px solid var(--border)' }}>
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
          <div style={{ ...itemStyle, color: 'var(--text2)', fontStyle: 'italic', borderLeft: '3px solid var(--success-strong)' }}>
            Aucune alerte active
          </div>
        )}
        {/* Liste des alertes */}
        {alerts.map((alert) => (
          <div
            key={alert.id}
            style={{ ...itemStyle, borderLeft: `3px solid ${severityColor(alert.severity)}`, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start' }}
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
  // MOBILE BOTTOM NAV
  // ════════════════════════════════
  if (isMobile) {
    // ═══════════════════════════════════════════════════════════════
    // MOBILE v2 - Hamburger qui ouvre un drawer latéral gauche
    // ═══════════════════════════════════════════════════════════════
    return (
      <div style={mls.root}>
        {/* Bandeaux d'état (hors-ligne, sync des pointages, icône d'accueil)
            AU-DESSUS du header, comme en desktop : le header translucide flotte
            sur le contenu, un bandeau posé dessous passerait sous lui. */}
        <OfflineBanner />
        <HomeScreenIconBanner />

        {/* Scène : le header « verre » est posé en absolu sur la zone qui
            défile, le contenu passe dessous (--app-header-h, app.css). */}
        <div style={mls.stage}>
          <header style={mls.topbar} className="app-glass-bar">
            <button className="app-bar-btn" style={mls.hamburger} onClick={() => setDrawerOpen(true)} aria-label="Menu">
              <span style={mls.hamLine} />
              <span style={mls.hamLine} />
              <span style={mls.hamLine} />
            </button>

            {/* Titre central + établissement courant (sélecteur s'il y en a
                plusieurs) : l'établissement reste visible hors du tiroir. */}
            <EtabSwitcher
              variant="mobile"
              title={getLabelForModule(currentItem?.id, currentItem?.label) || 'Tableau de bord'}
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

          <main style={mls.content} className="mobile-module-content" onClick={() => { notifOpen && setNotifOpen(false); logoMenuOpen && setLogoMenuOpen(false); }}>
            {children}
          </main>
        </div>

        {/* ─── Overlay sombre (visible seulement quand le drawer est ouvert) ─── */}
        {drawerOpen && <div style={mls.overlay} onClick={() => setDrawerOpen(false)} />}

        {/* ─── Drawer latéral gauche ─── */}
        {/* inert fermé : hors écran, le tiroir restait atteignable au clavier
            et par le lecteur d'écran. */}
        <aside
          className="app-drawer"
          inert={drawerOpen ? undefined : ''}
          aria-label="Menu principal"
          {...(organizing ? {} : drawerTouch)}
          style={{
            ...mls.drawer,
            transform: drawerOpen ? `translateX(${drawerDrag || 0}px)` : 'translateX(-100%)',
            transition: drawerDrag !== null ? 'none' : mls.drawer.transition,
          }}
        >
          {/* Même contenu que la barre desktop : logo, modules, compte.
              L'établissement est passé dans le header. */}
          <div style={mls.drawerHead}>
            <div style={{ position: 'relative' }}>
              {renderLogoMark(36, 13)}
              {renderLogoMenu()}
            </div>
            <button style={mls.closeDrawer} onClick={() => setDrawerOpen(false)} aria-label="Fermer">✕</button>
          </div>

          <nav style={mls.drawerNav} aria-label="Modules" data-nav-scroll>
            {organizing ? renderOrganizer('mobile') : renderNavGroups({
              itemStyle: mls.drawerItem,
              activeStyle: mls.drawerItemActive,
              dividerStyle: mls.navDivider,
              activeMarker: <span style={{ color: 'var(--nav-accent)', fontSize: 16 }} aria-hidden="true">●</span>,
            })}
          </nav>

          <div style={mls.drawerFooter}>
            {renderAccountButton('mobile')}
          </div>
        </aside>

        {accountModal}
        {passwordModal}
        {shortcutsLayer}
      </div>
    );
  }

  // ════════════════════════════════
  // DESKTOP
  // ════════════════════════════════
  return (
    <div style={ls.root} onClick={() => { notifOpen && setNotifOpen(false); logoMenuOpen && setLogoMenuOpen(false); }}>
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
          {organizing ? renderOrganizer('desktop') : renderNavGroups({
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
                title={getLabelForModule(currentItem?.id, currentItem?.label) || 'Tableau de bord'}
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

          <main style={ls.content}>{children}</main>
        </div>
      </div>

      {accountModal}
      {passwordModal}
      {shortcutsLayer}
    </div>
  );
}

const ls = {
  // Desktop - navigation « encre pétrole » : la sidebar porte le dégradé de
  // marque (--nav-grad) dans les DEUX thèmes, avec les tokens nav-* pour les
  // textes et filets. Le tiroir mobile (mls) reçoit exactement le même
  // traitement : la cohérence sidebar/drawer est préservée en les changeant
  // ensemble. Fond transparent sur la coque : l'ambiance (--ambient) posée
  // sur <body> respire sous le contenu.
  // height 100% et non 100vh : #root porte déjà les zones de sécurité iOS, une
  // coque en 100vh dépasse par le bas de la hauteur de l'indicateur d'accueil et
  // fait sortir de l'écran le bas de la zone de contenu (barres d'action posées).
  root: { display: 'flex', height: '100%', fontFamily: 'var(--font)', background: 'transparent', overflow: 'hidden' },
  // minWidth 0 + overflow hidden : la barre peut s'animer jusqu'à width 0 sans
  // être bloquée par la taille min-content de ses enfants flex.
  sidebar: { background: 'var(--nav-grad)', display: 'flex', flexDirection: 'column', flexShrink: 0, minWidth: 0, overflow: 'hidden', borderRight: '1px solid var(--nav-border)', transition: 'width .2s cubic-bezier(.4,0,.2,1)' },
  // Haut de barre : le logo seul, aligné sur le texte des modules.
  sidebarTop: { display: 'flex', alignItems: 'center', padding: '18px 16px 12px', flexShrink: 0 },
  logoMenu: { position: 'absolute', top: '100%', left: 0, marginTop: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--sh-lg)', width: 200, zIndex: 300, overflow: 'hidden' },
  logoMenuBtn: { width: '100%', display: 'block', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', fontSize: 13, color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)' },
  nav: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 7px 12px', overflowY: 'auto' },
  // Filet entre deux rubriques, à la place de leur intitulé.
  navDivider: { height: 1, background: 'var(--nav-border)', margin: '7px 10px' },
  navItem: { display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 8, border: 'none', background: 'none', color: 'var(--nav-text)', cursor: 'pointer', fontSize: 13, fontWeight: 500, position: 'relative', transition: 'background .15s,color .15s,box-shadow .15s', fontFamily: 'var(--font)', width: '100%', textAlign: 'left', marginBottom: 1 },
  navActive: { background: 'var(--nav-active)', color: 'var(--nav-text-active)', fontWeight: 600, boxShadow: 'var(--nav-glow)' },
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
  notifDot: { position: 'absolute', top: 4, right: 4, background: 'var(--danger-strong)', color: '#fff', fontSize: 9, fontWeight: 700, width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  notifPanel: { position: 'absolute', right: 0, top: 46, width: 300, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-lg)', zIndex: 200 },
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

  // Mobile
  mobileRoot: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'var(--font)', background: 'var(--bg)' },
  mobileTopbar: { height: 54, background: 'var(--nav)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', flexShrink: 0, gap: 10 },
  mobileTitle: { flex: 1, color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-serif)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  mobileEtabSelect: { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', borderRadius: 5, padding: '4px 6px', fontSize: 11, maxWidth: 100, fontFamily: 'var(--font)' },
  mobileContent: { flex: 1, overflowY: 'auto', padding: '12px', WebkitOverflowScrolling: 'touch' },
  mobileNav: { display: 'flex', background: 'var(--surface)', borderTop: '1px solid var(--border)', flexShrink: 0, position: 'relative', zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom)' },
  mobileNavBtn: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 4px 10px', background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font)', gap: 2, minHeight: 58 },
  mobileNavActive: { color: 'var(--accent)' },
  mobileAvatar: { width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0 },
  moreDrawer: { position: 'absolute', bottom: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px 12px 0 0', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)', padding: '8px 0', maxHeight: '70vh', overflowY: 'auto' },
  moreItem: { display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', background: 'none', border: 'none', width: '100%', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)', transition: 'background .1s' },
};

// ═══════════════════════════════════════════════════════════════
// MOBILE LAYOUT STYLES (v2 - hamburger + drawer)
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
  hamburger: {
    width: 44, height: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    background: 'none', border: 'none', borderRadius: 12, cursor: 'pointer', padding: 10, flexShrink: 0,
  },
  hamLine: { width: 22, height: 2, background: 'var(--text)', borderRadius: 2, transition: 'all 0.15s' },
  iconBtn: { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'none', border: 'none', borderRadius: 12, color: 'var(--text)', cursor: 'pointer', position: 'relative', padding: 0 },
  notifDot: { position: 'absolute', top: 6, right: 6, background: 'var(--danger-strong)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 8, minWidth: 14, textAlign: 'center', lineHeight: 1 },
  notifPanel: { position: 'absolute', right: 0, top: 44, width: 300, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: 'var(--sh-lg)', zIndex: 100, maxHeight: 360, overflowY: 'auto' },
  notifHeader: { padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4 },
  notifItem: { padding: '10px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', lineHeight: 1.4 },

  // Overlay pétrole + léger flou : ici le contenu passe réellement sous le
  // voile, le backdrop-filter a donc un effet (contrairement aux topbars,
  // que rien ne recouvre : elles restent opaques exprès).
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,22,32,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 90, animation: 'fadeIn 0.2s' },

  // Drawer latéral gauche - même encre pétrole que la sidebar desktop
  drawer: {
    position: 'fixed', top: 0, left: 0, bottom: 0, width: '80%', maxWidth: 320,
    background: 'var(--nav-grad)',
    zIndex: 100,
    display: 'flex', flexDirection: 'column',
    transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: 'var(--sh-lg)',
  },
  // Haut du tiroir : le logo seul, et la fermeture.
  drawerHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 14px 8px 18px', flexShrink: 0,
  },
  closeDrawer: {
    width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)', border: '1px solid var(--nav-border)', borderRadius: 8,
    cursor: 'pointer', fontSize: 16, color: 'var(--nav-text)',
  },
  drawerNav: {
    flex: 1, overflowY: 'auto', padding: '4px 10px 12px',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  navDivider: { height: 1, background: 'var(--nav-border)', margin: '8px 12px' },
  drawerItem: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '13px 14px', borderRadius: 8,
    background: 'none', border: 'none', width: '100%',
    cursor: 'pointer', fontFamily: 'var(--font)',
    fontSize: 14, fontWeight: 600, color: 'var(--nav-text)',
    textAlign: 'left',
  },
  drawerItemActive: {
    background: 'var(--nav-active)', color: 'var(--nav-text-active)',
    boxShadow: 'var(--nav-glow)',
  },
  drawerIcon: { fontSize: 17, width: 24, textAlign: 'center', flexShrink: 0 },
  drawerFooter: {
    padding: '8px 8px 10px', flexShrink: 0,
    borderTop: '1px solid var(--nav-border)',
  },

  // minHeight 0 : sans lui, la taille minimale automatique d'un élément flex
  // vaut la hauteur de son contenu, <main> déborde la coque et ne défile pas.
  // Le haut démarre sous le header « verre » (voir ls.content).
  content: {
    flex: 1, minHeight: 0, padding: '16px 14px 24px', paddingTop: 'calc(var(--app-header-h) + 16px)',
    overflowY: 'auto', overflowX: 'hidden', maxWidth: '100%',
    scrollPaddingTop: 'var(--app-header-h)',
  },
};
