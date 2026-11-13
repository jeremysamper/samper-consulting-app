import React from 'react';
import { navItems as NAV_ITEMS, ENTREE_COMPTE, peutOuvrirCompte, pageAccueil } from '../modules/moduleConfig.js';
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
import CompteButton from '../components/nav/CompteButton.jsx';
import TotpRappel from '../components/nav/TotpRappel.jsx';
import { peutChangerLogo, peutOrganiserMenu, regleLaCoque } from '../components/nav/gardesCoque.js';
import NavBadge from '../components/nav/NavBadge.jsx';
import MessagerieBarre from '../components/nav/MessagerieBarre.jsx';
import CarteAlertes from '../components/CarteAlertes.jsx';
import { ShellProvider } from './ShellContext.js';
import { applyNavOrder } from '../hooks/useNavOrder.js';
import { navigateToPage, ouvrirCompte as ouvrirSection } from '../services/navigationService.js';
import { confirmLegacy, notifyLegacy, readLegacyStorage, writeLegacyStorage } from '../legacy/legacyApi.js';
import { readJson, readText, removeStorageKeys, writeText } from '../utils/storage.js';
import { getModuleIcon } from '../modules/moduleIcons.js';
import { dbService } from '../services/dbService.js';
import { messageErreur } from '../utils/messageErreur.js';

// Marge de page : le jeton --marge (app.css), 32 px dès 768 px de large. Les
// pages de cette liste gardent en coque tactile la marge serrée d'avant, à
// toute largeur. Mesure du banc, 12.11.2026, à 32 px à la tablette : le
// dernier contrôle du Spa coûtait un défilement de plus, et la grille des
// produits de la caisse passait de quatre colonnes à trois. Un écran ne perd
// jamais un geste pour une marge.
const PAGES_MARGE_SERREE = new Set(['spa', 'caisse']);

// Pages hors navItems : réservées au consultant (ouvertes depuis le compte),
// et la page d'accueil de la coque tactile.
const PAGES_HORS_MENU = { factures: 'Factures', parametres: 'Paramètres', roles: 'Rôles et accès', compte: 'Réglages', accueil: 'Accueil' };

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
  // Menu de l'ordinateur : un rail d'icônes par défaut, déplié en menu à
  // libellés par le bouton de la barre du haut (ou Ctrl/Cmd + B). Le choix est
  // gardé sur le poste (sc_menu_deplie) ; seul ce bouton l'écrit.
  const [sidebarOpen, setSidebarOpen] = React.useState(() => readText('sc_menu_deplie', '0') === '1');
  const menuDeplieRef = React.useRef(sidebarOpen);
  menuDeplieRef.current = sidebarOpen;
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [msgOpen, setMsgOpen] = React.useState(false);
  const [logoHover, setLogoHover] = React.useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = React.useState(false);
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

  // ── Messagerie de la barre du haut ─────────────────────────────
  // Même garde que la tuile et l'entrée de menu : le module Messages est dans
  // le menu de la personne. Ouvrir la messagerie referme les alertes, et
  // inversement.
  const messagerieVisible = visibleNav.some((item) => item.id === 'messages');
  const toggleNotif = () => {
    const opening = !notifOpen;
    setNotifOpen(opening);
    if (opening) setMsgOpen(false);
    if (opening && unreadCount > 0) markAllRead();
  };
  const changerMessagerie = React.useCallback((ouvert) => {
    setMsgOpen(ouvert);
    if (ouvert) setNotifOpen(false);
  }, []);
  const renderMessagerie = (btnStyle, dotStyle, iconSize) => (messagerieVisible ? (
    <MessagerieBarre
      user={user}
      open={msgOpen}
      onOpenChange={changerMessagerie}
      unread={badges.messages}
      shellMode={shellMode}
      onToutVoir={() => { handleSetPage('messages'); setMsgOpen(false); }}
      btnStyle={btnStyle}
      dotStyle={dotStyle}
      iconSize={iconSize}
    />
  ) : null);

  // ── Carte d'activation des alertes ─────────────────────────────
  // Un seul exemplaire : l'accueil tactile la pose sous son en-tête
  // (ShellContext) ; à l'ordinateur elle ouvre la page d'accueil de
  // l'établissement (tableau de bord, sinon premier module), gardée montée
  // et masquée ailleurs pour ne pas relire à chaque retour.
  const voitReservations = visibleNav.some((item) => item.id === 'previsions');
  const carteAlertes = (
    <CarteAlertes user={user} etablissement={etablissement} voitReservations={voitReservations} bas={tactile ? 0 : 16} />
  );
  const surAccueilOrdinateur = pageAffichee === 'accueil' || pageAffichee === pageAccueil(etablissement, perms, 'ordinateur');

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
  // En rail (rail = true) : le picto du module dans un cercle, son libellé en
  // info-bulle et pour les lecteurs d'écran.
  const renderNavGroups = ({ itemStyle, activeStyle, dividerStyle, rail = false }) => groupedNav.map((group, index) => (
    <div key={group.label} role="group" aria-label={group.label}>
      {index > 0 && <div style={dividerStyle} aria-hidden="true" />}
      {group.items.map(item => {
        // Page « accueil » sur ordinateur (iPad passé de tactile à clavier) :
        // elle affiche le tableau de bord, c'est lui qui est surligné.
        const active = currentPage === item.id || (currentPage === 'accueil' && item.id === 'dashboard');
        const libelle = getLabelForModule(item.id, item.label);
        const Icone = rail ? getModuleIcon(item.id) : null;
        return (
          <button
            key={item.id}
            type="button"
            className="sc-nav-item"
            style={{ ...itemStyle, ...(active ? activeStyle : {}) }}
            aria-current={active ? 'page' : undefined}
            title={rail ? libelle : undefined}
            onClick={() => handleSetPage(item.id)}
          >
            {Icone ? <Icone size={20} strokeWidth={1.75} aria-hidden="true" /> : null}
            <span style={rail ? ls.navLabelCache : ls.navLabel}>{libelle}</span>
            {rail ? <NavBadge itemId={item.id} badges={badges} style={ls.railBadge} /> : renderNavBadge(item.id)}
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
  // « Mon compte » est une section de la page des réglages : le clic sur son
  // nom ouvre la page dessus.
  const ouvrirMonCompte = React.useCallback(() => ouvrirSection('mon_compte'), []);
  const renderAccountButton = (variant, style) => (
    <AccountButton
      user={accountUser}
      variant={variant}
      onOpen={ouvrirMonCompte}
      style={style}
    />
  );
  // Page des réglages : bouton sur la ligne de « Mon compte », entrée de la
  // palette et de l'accueil tactile, pour toute personne connectée
  // (peutOuvrirCompte, la garde de LegacyModuleHost) ; chacune n'y voit que ses
  // sections.
  const compteOuvrable = peutOuvrirCompte(user);
  const ouvrirCompte = compteOuvrable ? () => handleSetPage('compte') : null;
  // Rappel du code à usage unique (consultant sans facteur vérifié) : même
  // rangée que les autres bandeaux, « Activer » ouvre Mon compte.
  const rappelTotp = <TotpRappel user={user} onActiver={ouvrirMonCompte} compteOuvert={currentPage === 'compte'} />;

  // Ce que la page d'accueil tactile lit (ShellContext) : la même liste de
  // modules et les mêmes badges que la barre latérale, le compte, la navigation.
  const shellValue = {
    mode: shellMode, visibleNav, groupedNav, badges, getLabelForModule,
    setPage: handleSetPage, etablissement, etabs, accountUser,
    openAccount: ouvrirMonCompte,
    openCompte: ouvrirCompte, compteActif: currentPage === 'compte',
    carteAlertes: tactile ? carteAlertes : null,
  };

  // ── Raccourcis clavier, palette Ctrl/⌘+K, Échap ───────────────
  const toggleSidebar = React.useCallback(() => {
    const suivant = !menuDeplieRef.current;
    writeText('sc_menu_deplie', suivant ? '1' : '0');
    setSidebarOpen(suivant);
  }, []);
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

  // Échap referme ce que la coque a ouvert (alertes, messagerie).
  // Les modales des modules gèrent leur propre Échap.
  React.useEffect(() => {
    if (!notifOpen && !msgOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      setNotifOpen(false);
      setMsgOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notifOpen, msgOpen]);

  // Une navigation (clic, raccourci, retour) referme les panneaux flottants.
  React.useEffect(() => {
    setNotifOpen(false);
    setMsgOpen(false);
    setHelpOpen(false);
  }, [currentPage]);

  // Un clic dans la page referme les panneaux de la barre du haut.
  const fermerPanneaux = () => {
    if (notifOpen) setNotifOpen(false);
    if (msgOpen) setMsgOpen(false);
  };

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
  // L'espace Compte aussi, en fin de liste, pour qui peut l'ouvrir.
  const paletteNav = React.useMemo(() => {
    const liste = tactile ? [{ id: 'accueil', label: 'Accueil', group: 'Général' }, ...visibleNav] : visibleNav;
    return compteOuvrable ? [...liste, ENTREE_COMPTE] : liste;
  }, [tactile, visibleNav, compteOuvrable]);
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
    onOrganize: peutOrganiserMenu(user.role, shellMode) ? startOrganizing : null,
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
  const canEditLogo = regleLaCoque(user.role);

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
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLogoRemove = async () => {
    if (!etablissement?.id) return;
    if (!confirmLegacy('Revenir au logo Ritmo par défaut pour ' + etablissement.nom + ' ?')) return;
    if (legacySB) {
      try {
        await legacySB.db.updateEtablissementLogo(etablissement.id, null);
      } catch (err) {
        notifyLegacy('Logo non supprimé. ' + messageErreur(err, 'logo'), 'error');
        return;
      }
    }
    removeStorageKeys(['sc_app_logo']) // nettoyage legacy
  };

  // Ce que la page des réglages reçoit de la coque (sections Mon compte,
  // Ordre du menu, Logo) : les mêmes gestes que la fenêtre Mon compte, le menu
  // du logo et la palette, sous les mêmes gardes (gardesCoque.js).
  shellValue.reglages = {
    compte: {
      onSaved: (updated) => setIdentityOverride({
        id: updated.id, prenom: updated.prenom, nom: updated.nom, avatar: updated.avatar,
      }),
      onChangePassword: () => setPasswordModalOpen(true),
      onLogout,
    },
    organiserMenu: peutOrganiserMenu(user.role, shellMode) ? startOrganizing : null,
    logo: peutChangerLogo(user.role, shellMode)
      ? { url: appLogo, nom: etablissement?.nom || '', onUpload: handleLogoUpload, onRemove: handleLogoRemove }
      : null,
  };

  // LogoMark : fonction de rendu (pas un composant React)
  // afin d'éviter le problème des composants définis à l'intérieur d'autres composants.
  // Consultant : le logo est un vrai <button> (atteignable au clavier) ; .mini
  // le soustrait à la règle tactile globale qui l'étirerait à 44 px de haut.
  const renderLogoMark = (size = 34) => {
    const LogoTag = canEditLogo ? 'button' : 'div';
    return (
      <LogoTag
        {...(canEditLogo ? {
          type: 'button',
          className: 'mini',
          'aria-label': 'Changer le logo',
        } : {})}
        style={{
          width: size, height: size, borderRadius: 'var(--r-sm)', padding: 0,
          // Le logo d'un établissement se pose sur une pastille à la couleur
          // du menu d'avant Office (--logo-fond) : un logo importé clair, sur
          // fond transparent, garde l'allure qu'il avait sur le menu sombre.
          // Sans logo, on affiche la marque Ritmo (fond pétrole intégré au
          // SVG) et le conteneur reste transparent.
          background: appLogo ? 'var(--logo-fond)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden', position: 'relative',
          cursor: canEditLogo ? 'pointer' : 'default',
          // --nav-accent et non --accent : le pointillé pétrole disparaissait
          // sur l'encre de la barre.
          border: canEditLogo && logoHover ? '2px dashed var(--nav-accent)' : '2px solid transparent',
          transition: 'border 0.15s',
        }}
        onMouseEnter={() => canEditLogo && setLogoHover(true)}
        onMouseLeave={() => setLogoHover(false)}
        onClick={canEditLogo ? (e) => { e.stopPropagation(); ouvrirSection('logo'); } : undefined}
        title={canEditLogo ? 'Cliquer pour changer le logo' : undefined}
      >
        {appLogo
          ? <img src={appLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <SamperMark size={size} radius={0} title="Ritmo" style={{ width: '100%', height: '100%', display: 'block' }} />}
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

  // Le logo se change dans la page des réglages (section 'logo', mêmes gestes
  // et mêmes limites) : le clic sur le logo de la barre y mène.

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
              style={{ background: 'none', border: 'none', fontSize: 'var(--t1)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font)', padding: '2px 6px' }}
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
              <div style={{ fontWeight: 'var(--g3)', fontSize: 13, color: 'var(--text)' }}>{alert.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 }}>{alert.message}</div>
              <div style={{ fontSize: 'var(--t1)', color: 'var(--text3)', marginTop: 4 }}>{formatRelativeTime(alert.created_at)}</div>
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
        {rappelTotp}

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
              {renderMessagerie(mls.iconBtn, mls.notifDot, 20)}
              <button
                type="button"
                className="app-bar-btn"
                style={mls.iconBtn}
                onClick={toggleNotif}
                aria-label={unreadCount > 0 ? `Alertes (${unreadCount} non lues)` : 'Alertes'}
                aria-expanded={notifOpen}
              >
                <Bell size={20} strokeWidth={2} aria-hidden="true" />
                {unreadCount > 0 && <div style={mls.notifDot}>{unreadCount}</div>}
              </button>
              {notifOpen && renderAlertPanel(mls.notifPanel, mls.notifHeader, mls.notifItem)}
            </div>
          </header>

          <main ref={mainRef} style={mls.content} className="mobile-module-content" data-marge={PAGES_MARGE_SERREE.has(pageAffichee) ? 'serree' : undefined} onClick={fermerPanneaux}>
            {children}
          </main>
        </div>

        {passwordModal}
        {shortcutsLayer}
      </div>
      </ShellProvider>
    );
  }

  // ════════════════════════════════
  // DESKTOP
  // ════════════════════════════════
  // Le rangement du menu (« Organiser le menu ») a besoin des libellés.
  const menuLarge = sidebarOpen || organizing;
  // --largeur-menu : place prise par la barre latérale, pour les barres fixes
  // en bas d'écran qui doivent commencer après elle (sélection du Planning).
  return (
    <ShellProvider value={shellValue}>
    <div style={{ ...ls.root, '--largeur-menu': menuLarge ? '234px' : '76px' }} onClick={fermerPanneaux}>
      {/* Menu de l'ordinateur : le logo en haut, les modules, les réglages en
          bas. Replié, c'est un rail d'icônes de 76 px (un cercle par module,
          l'entrée choisie en aplat sombre) ; déplié, le menu à libellés de
          234 px. L'établissement et le compte sont dans la barre du haut, le
          bouton de la barre replie et déplie. */}
      <aside
        id="app-sidebar"
        aria-label="Menu principal"
        style={{ ...ls.sidebar, width: menuLarge ? 234 : 76 }}
      >
        <div style={menuLarge ? ls.sidebarTop : ls.sidebarTopRail}>
          <div style={{ position: 'relative' }}>
            {renderLogoMark(36, 13)}
          </div>
        </div>

        <nav style={menuLarge ? ls.nav : ls.navRail} className={menuLarge ? undefined : 'sc-nav-rail'} aria-label="Modules" data-nav-scroll>
          {organizing ? renderOrganizer() : renderNavGroups(menuLarge
            ? { itemStyle: ls.navItem, activeStyle: ls.navActive, dividerStyle: ls.navDivider }
            : { itemStyle: ls.railItem, activeStyle: ls.navActive, dividerStyle: ls.railDivider, rail: true })}
        </nav>

        {ouvrirCompte ? (
          <div style={menuLarge ? ls.userArea : ls.userAreaRail}>
            <CompteButton onOpen={ouvrirCompte} actif={currentPage === 'compte'} rail={!menuLarge} />
          </div>
        ) : null}
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
        {rappelTotp}
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
            {/* Recherche en pilule, langue, thème, messages, alertes, puis le
                compte. La déconnexion est dans « Mon compte » (clic sur son
                nom, à droite de la barre). */}
            <div style={ls.topbarRight} className="topbar-right">
              <button
                type="button"
                className="app-bar-recherche"
                onClick={(e) => { e.stopPropagation(); togglePalette(true); }}
                aria-label="Aller à un module"
                aria-keyshortcuts={MOD_LABEL === '⌘' ? 'Meta+K' : 'Control+K'}
                title={`Aller à… (${MOD_LABEL} K)`}
              >
                <Search size={18} strokeWidth={2} aria-hidden="true" />
                <span>Aller à un module</span>
                <span className="sc-kbd" data-no-translate="">{MOD_LABEL} K</span>
              </button>
              <LanguageToggle compact etablissementId={etablissement?.id || null} />
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
              {renderMessagerie(ls.iconBtn, ls.notifDot, 18)}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="app-bar-btn"
                  style={ls.iconBtn}
                  onClick={(e) => { e.stopPropagation(); toggleNotif(); }}
                  aria-label={unreadCount > 0 ? `Alertes (${unreadCount} non lues)` : 'Alertes'}
                  aria-expanded={notifOpen}
                  title="Alertes"
                >
                  <Bell size={18} strokeWidth={2} aria-hidden="true" />
                  {unreadCount > 0 && <div style={ls.notifDot}>{unreadCount}</div>}
                </button>
                {notifOpen && renderAlertPanel(ls.notifPanel, ls.notifHeader, ls.notifItem)}
              </div>
              {renderAccountButton('barre')}
            </div>
          </header>

          <main ref={mainRef} style={ls.content}>
            <div hidden={!surAccueilOrdinateur}>{carteAlertes}</div>
            {children}
          </main>
        </div>
      </div>

      {passwordModal}
      {shortcutsLayer}
    </div>
    </ShellProvider>
  );
}

const ls = {
  // Ordinateur : le menu est posé sur le fond de page (--nav vaut --bg), sans
  // filet à droite ; ses entrées sont des pilules, l'entrée choisie un aplat
  // sombre (--nav-active, texte --nav-text-active). La coque tactile (mls)
  // n'a pas de menu. Fond transparent sur la coque : la couleur de page est
  // celle de <body>.
  // height 100% et non 100vh : #root porte déjà les zones de sécurité iOS, une
  // coque en 100vh dépasse par le bas de la hauteur de l'indicateur d'accueil et
  // fait sortir de l'écran le bas de la zone de contenu (barres d'action posées).
  root: { display: 'flex', height: '100%', fontFamily: 'var(--font)', background: 'transparent', overflow: 'hidden' },
  // minWidth 0 + overflow hidden : la barre peut s'animer jusqu'à width 0 sans
  // être bloquée par la taille min-content de ses enfants flex.
  sidebar: { background: 'var(--nav)', display: 'flex', flexDirection: 'column', flexShrink: 0, minWidth: 0, overflow: 'hidden', transition: 'width .2s cubic-bezier(.4,0,.2,1)' },
  // Haut de barre : le logo seul, aligné sur le texte des modules.
  sidebarTop: { display: 'flex', alignItems: 'center', padding: '18px 16px 12px', flexShrink: 0 },
  sidebarTopRail: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px 0 12px', flexShrink: 0 },
  nav: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 7px 12px', overflowY: 'auto' },
  // Rail d'icônes : un cercle de 44 px par module, à la couleur des cartes ;
  // l'entrée choisie prend l'aplat sombre (navActive). Le libellé reste dans
  // le bouton, hors de vue (navLabelCache), et en info-bulle.
  navRail: { flex: 1, display: 'flex', flexDirection: 'column', padding: '8px 0 12px', overflowY: 'auto', overflowX: 'hidden' },
  railItem: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0, margin: '0 auto 6px', padding: 0, borderRadius: '50%', border: 'none', background: 'var(--surface)', color: 'var(--nav-text)', cursor: 'pointer', position: 'relative', transition: 'background .15s,color .15s' },
  railDivider: { height: 1, background: 'var(--nav-border)', margin: '4px 20px 10px' },
  railBadge: { position: 'absolute', top: -4, right: -6, padding: '1px 5px' },
  navLabelCache: { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 },
  // Filet entre deux rubriques, à la place de leur intitulé.
  navDivider: { height: 1, background: 'var(--nav-border)', margin: '7px 10px' },
  navItem: { display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', borderRadius: 'var(--r-full)', border: 'none', background: 'none', color: 'var(--nav-text)', cursor: 'pointer', fontSize: 13, fontWeight: 'var(--g2)', position: 'relative', transition: 'background .15s,color .15s,box-shadow .15s', fontFamily: 'var(--font)', width: '100%', textAlign: 'left', marginBottom: 1 },
  navActive: { background: 'var(--nav-active)', color: 'var(--nav-text-active)', fontWeight: 'var(--g2)' },
  navLabel: { flex: 1, minWidth: 0, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  // Pied de barre : le nom de l'utilisateur (menu de compte, UserMenu.jsx).
  // Pied du menu : les réglages (une pilule, ou un cercle dans le rail).
  userArea: { padding: '8px 10px 12px', borderTop: '1px solid var(--nav-border)', flexShrink: 0 },
  userAreaRail: { padding: '8px 0 12px', display: 'flex', justifyContent: 'center', borderTop: '1px solid var(--nav-border)', flexShrink: 0 },
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
  // Bouton de repli : la même cible de 44 px que les autres, son cercle de
  // 40 px peint par .app-bar-btn ; les marges gardent le titre à sa place.
  sidebarToggle: { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: -10, marginRight: -2, background: 'none', border: 'none', borderRadius: '50%', color: 'var(--text2)', cursor: 'pointer', padding: 0 },
  // Les boutons du header : même cible de 44 px, le picto dans un cercle de
  // 40 px à la couleur des cartes (fond, retrait et survol : .app-bar-btn dans
  // app.css), comme le sélecteur de langue compact.
  iconBtn: { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'none', border: 'none', borderRadius: '50%', color: 'var(--text2)', cursor: 'pointer', position: 'relative', padding: 0 },
  // Compteur d'alertes : une seule forme, ordinateur et téléphone (pilule qui
  // s'élargit au-delà de 9).
  notifDot: { position: 'absolute', top: 4, right: 4, background: 'var(--danger-fill)', color: 'var(--on-danger)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  // Hauteur bornée : une longue liste d'alertes sortait du bas de la zone
  // (overflow hidden) sans pouvoir défiler.
  notifPanel: { position: 'absolute', right: 0, top: 46, width: 300, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--rule-soft)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh-lg)', zIndex: 200 },
  notifHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)' },
  notifItem: { padding: '10px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', lineHeight: 1.4 },
  // minHeight 0 : sans lui <main> prend la hauteur de son contenu et ne défile pas.
  // La marge de page est le jeton --marge (app.css), lu ici et par la coque
  // tactile seulement, jamais par un module. Le haut démarre sous le header
  // (padding = header + marge). Un élément position: sticky des modules
  // s'arrête sous le padding de son conteneur de défilement : leurs top: 0
  // retombent donc une marge sous le header.
  // scroll-padding : « faire défiler jusqu'à » ne cache pas la cible sous lui.
  content: {
    flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', maxWidth: '100%',
    padding: 'var(--marge)', paddingTop: 'calc(var(--app-header-h) + var(--marge))',
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
  iconBtn: { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'none', border: 'none', borderRadius: '50%', color: 'var(--text)', cursor: 'pointer', position: 'relative', padding: 0 },
  notifDot: { position: 'absolute', top: 6, right: 6, background: 'var(--danger-fill)', color: 'var(--on-danger)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', minWidth: 16, height: 16, padding: '0 4px', boxSizing: 'border-box', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  notifPanel: { position: 'absolute', right: 0, top: 44, width: 300, background: 'var(--surface)', border: '1px solid var(--rule-soft)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh-lg)', zIndex: 100, maxHeight: 360, overflowY: 'auto' },
  notifHeader: { padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)' },
  notifItem: { padding: '10px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', lineHeight: 1.4 },

  // minHeight 0 : sans lui, la taille minimale automatique d'un élément flex
  // vaut la hauteur de son contenu, <main> déborde la coque et ne défile pas.
  // Le haut démarre sous le header « verre » (voir ls.content). Marge de page :
  // le jeton --marge, que la feuille ramène à 14 px au téléphone et sur les
  // pages de PAGES_MARGE_SERREE (.mobile-module-content, app.css) ; le haut
  // et le bas gardent alors leurs 16 et 24 px d'avant.
  content: {
    flex: 1, minHeight: 0, padding: 'var(--marge)', paddingBottom: 'max(24px, var(--marge))', paddingTop: 'calc(var(--app-header-h) + max(16px, var(--marge)))',
    overflowY: 'auto', overflowX: 'hidden', maxWidth: '100%',
    scrollPaddingTop: 'var(--app-header-h)',
  },
};
