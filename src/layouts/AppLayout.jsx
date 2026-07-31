import React from 'react';
import { navItems as NAV_ITEMS } from '../modules/moduleConfig.js';
import { getDemoData } from '../data/demoData.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useTheme } from '../hooks/useTheme.js';
import { useModuleLabels } from '../hooks/useModuleLabels.js';
import { useAlertInstances } from '../hooks/useAlertInstances.js';
import { useUnreadPrivateMessages } from '../hooks/useUnreadPrivateMessages.js';
import { usePosConnectionHealth } from '../hooks/usePosConnectionHealth.js';
import PosTokenAlertBanner from '../components/PosTokenAlertBanner.jsx';
import OfflineBanner from '../components/OfflineBanner.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
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
  const roleInfo = DEMO_DATA.roles[user.role] || { label: user?.role || 'Utilisateur', couleur: '#003042' };

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
  const visibleNav = React.useMemo(() => NAV_ITEMS.filter(item => {
    // IA / assistant / outils consultant : réservés au consultant culinaire,
    // même si la table permissions accorde le module à un autre rôle.
    if ((item.id === 'faq' || item.id === 'consultant_tools') && user.role !== 'consultant') return false;
    // KDS : rôles cuisine uniquement (miroir de la RLS kds_orders), la clé kds
    // n'existant pas encore dans la table permissions en BDD.
    if (item.id === 'kds' && !['consultant', 'resp_cuisine', 'cuisinier'].includes(user.role)) return false;
    const permVal = perms[item.permKey];
    if (permVal === false) return false;
    if (permVal === true) return true;
    // permVal undefined : fallback sur les défauts du rôle
    const defaultPerms = (DEMO_DATA.permissions && DEMO_DATA.permissions[user.role]) || {};
    if (defaultPerms[item.permKey] === false) return false;
    return true;
  }), [perms, user.role]);
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

  // Badge messages privés non lus (consultant → utilisateur) sur l'item de nav
  const unreadMessages = useUnreadPrivateMessages(user?.id);
  const renderNavBadge = (itemId) => (
    itemId === 'messages' && unreadMessages > 0 ? (
      <span style={{
        background: 'var(--danger-strong)', color: '#fff', fontSize: 10, fontWeight: 700,
        padding: '2px 7px', borderRadius: 99, minWidth: 14, textAlign: 'center',
        lineHeight: 1.4, flexShrink: 0,
      }}>{unreadMessages}</span>
    ) : null
  );

  const handleSetPage = (p) => { setPage(p); setDrawerOpen(false); };

  const currentItem = NAV_ITEMS.find(n => n.id === currentPage);
  const todayLabel = new Date().toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });

  // Labels personnalisés globaux (module_labels table - portée tous établissements)
  // getLabelForModule(key, defaultLabel) → custom label ou defaultLabel si non défini
  const { getLabelForModule } = useModuleLabels();

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
          notifyLegacy('✓ Logo mis à jour pour ' + etablissement.nom, 'success');
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
    if (!confirmLegacy('Revenir au logo par défaut "SC" pour ' + etablissement.nom + ' ?')) return;
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
  // afin d'éviter le problème des composants définis à l'intérieur d'autres composants
  const renderLogoMark = (size = 34, fontSize = 12) => (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: appLogo ? 'transparent' : 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize, color: '#fff',
      fontFamily: 'var(--font-serif)', letterSpacing: 1, flexShrink: 0,
      overflow: 'hidden', position: 'relative',
      cursor: canEditLogo ? 'pointer' : 'default',
      border: canEditLogo && logoHover ? '2px dashed var(--accent)' : '2px solid transparent',
      transition: 'border 0.15s',
    }}
    onMouseEnter={() => canEditLogo && setLogoHover(true)}
    onMouseLeave={() => setLogoHover(false)}
    onClick={canEditLogo ? (e) => { e.stopPropagation(); setLogoMenuOpen(!logoMenuOpen); } : undefined}
    title={canEditLogo ? 'Cliquer pour changer le logo' : ''}>
      {appLogo
        ? <img src={appLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : 'SC'}
      {canEditLogo && logoHover && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size > 30 ? 14 : 10, color: '#fff',
        }}>
          ✎
        </div>
      )}
    </div>
  );

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
          📁 Changer le logo
        </button>
        {appLogo && (
          <button style={{ ...ls.logoMenuBtn, color: 'var(--danger-strong)' }} onClick={handleLogoRemove}>
            🗑 Retirer le logo
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
            ✓ Aucune alerte active
          </div>
        )}
        {/* Liste des alertes */}
        {alerts.map((alert) => (
          <div
            key={alert.id}
            style={{ ...itemStyle, borderLeft: `3px solid ${severityColor(alert.severity)}`, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start' }}
            onClick={() => handleAlertClick(alert)}
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
        {/* ─── Header fixe en haut ─── */}
        <header style={mls.topbar}>
          {/* Bouton hamburger */}
          <button style={mls.hamburger} onClick={() => setDrawerOpen(true)} aria-label="Menu">
            <span style={mls.hamLine} />
            <span style={mls.hamLine} />
            <span style={mls.hamLine} />
          </button>

          {/* Titre central */}
          <div style={mls.title}>{getLabelForModule(currentItem?.id, currentItem?.label) || 'Tableau de bord'}</div>

          {/* Cloche notifications à droite */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
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
              style={mls.themeBtn}
              onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
              aria-label={isDark ? 'Mode clair' : 'Mode sombre'}
              title={isDark ? 'Mode clair' : 'Mode sombre'}
            >
              {isDark ? '☀' : '◑'}
            </button>
            <button style={mls.bellBtn} onClick={() => { const opening = !notifOpen; setNotifOpen(opening); if (opening && unreadCount > 0) markAllRead(); }}>
              <span style={{ fontSize: 20 }}>🔔</span>
              {unreadCount > 0 && <div style={mls.notifDot}>{unreadCount}</div>}
            </button>
            {notifOpen && renderAlertPanel(mls.notifPanel, mls.notifHeader, mls.notifItem)}
          </div>
        </header>

        {/* ─── Bandeau d'état hors-ligne / sync pointages / mise à jour ─── */}
        <OfflineBanner />

        {/* ─── Overlay sombre (visible seulement quand le drawer est ouvert) ─── */}
        {drawerOpen && <div style={mls.overlay} onClick={() => setDrawerOpen(false)} />}

        {/* ─── Drawer latéral gauche ─── */}
        <aside style={{ ...mls.drawer, transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)' }}>
          {/* Header drawer : logo + nom consulting + fermeture */}
          <div style={mls.drawerHead}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative' }}>
                {renderLogoMark(36, 13)}
                {renderLogoMenu()}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>Samper</div>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>Consulting</div>
              </div>
            </div>
            <button style={mls.closeDrawer} onClick={() => setDrawerOpen(false)} aria-label="Fermer">✕</button>
          </div>

          {/* Carte utilisateur */}
          <div style={mls.userCard}>
            <div style={{ ...mls.drawerAvatar, background: roleInfo.couleur }}>{user.avatar}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.prenom} {user.nom}</div>
              <div style={{ fontSize: 11, color: roleInfo.couleur, fontWeight: 600 }}>{roleInfo.label}</div>
            </div>
          </div>

          {/* Switch établissement - visible si l'utilisateur a accès à 2+ établissements */}
          {etabs.length > 1 && (
            <div style={mls.etabSwitcher}>
              <div style={mls.etabSwitcherLabel}>Établissement</div>
              {etabs.map(et => {
                const active = etablissement?.id === et.id;
                return (
                  <button
                    key={et.id}
                    style={{ ...mls.etabOption, ...(active ? mls.etabOptionActive : {}) }}
                    onClick={() => { setEtablissement(et); setDrawerOpen(false); }}
                  >
                    <span style={{ ...mls.etabDot, background: et.couleur || 'var(--accent)' }} />
                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{et.nom}</span>
                    {active && <span style={{ color: 'var(--accent)', fontSize: 14 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Si un seul établissement, juste afficher son nom */}
          {etabs.length === 1 && etablissement && (
            <div style={mls.etabSingle}>
              <span style={{ ...mls.etabDot, background: etablissement.couleur || 'var(--accent)' }} />
              <span>{etablissement.nom}</span>
            </div>
          )}

          {/* Liste des modules */}
          <nav style={mls.drawerNav}>
            {groupedNav.map(group => (
              <div key={group.label}>
                <div style={mls.drawerGroupLabel}>{group.label}</div>
                {group.items.map(item => {
                  const active = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      style={{ ...mls.drawerItem, ...(active ? mls.drawerItemActive : {}) }}
                      onClick={() => handleSetPage(item.id)}
                    >
                      <span style={{ flex: 1, textAlign: 'left' }}>{getLabelForModule(item.id, item.label)}</span>
                      {renderNavBadge(item.id)}
                      {active && <span style={{ color: 'var(--accent)', fontSize: 16 }}>●</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Bouton déconnexion en bas */}
          <div style={mls.drawerFooter}>
            <button style={mls.logoutBtn} onClick={onLogout}>
              Se déconnecter
            </button>
          </div>
        </aside>

        {/* ─── Contenu principal ─── */}
        <main style={mls.content} className="mobile-module-content" onClick={() => { notifOpen && setNotifOpen(false); logoMenuOpen && setLogoMenuOpen(false); }}>
          {children}
        </main>
      </div>
    );
  }

  // ════════════════════════════════
  // DESKTOP
  // ════════════════════════════════
  return (
    <div style={ls.root} onClick={() => { notifOpen && setNotifOpen(false); logoMenuOpen && setLogoMenuOpen(false); }}>
      {/* Repliée = la barre disparaît complètement (width 0 + visibility hidden
          après la transition) ; une languette fixée au bord gauche la rouvre. */}
      <aside style={{
        ...ls.sidebar,
        width: sidebarOpen ? 234 : 0,
        borderRight: sidebarOpen ? '1px solid var(--border)' : 'none',
        visibility: sidebarOpen ? 'visible' : 'hidden',
        transition: sidebarOpen
          ? 'width .2s cubic-bezier(.4,0,.2,1)'
          : 'width .2s cubic-bezier(.4,0,.2,1), visibility 0s linear .2s',
      }}>
        <div style={ls.sidebarTop}>
          <div style={ls.logoWrap}>
            <div style={{ position: 'relative' }}>
              {renderLogoMark(34, 12)}
              {renderLogoMenu()}
            </div>
            <div style={ls.logoText}>
              <div style={ls.logoName}>Samper Consulting</div>
              <div style={ls.logoSub}>Gestion culinaire</div>
            </div>
          </div>
          <button style={ls.toggleBtn} onClick={() => setSidebarOpen(false)} aria-label="Masquer le menu" title="Masquer le menu">
            ❮
          </button>
        </div>

        {/* Sélecteur d'établissement : même UI que le drawer mobile (liste
            d'options avec pastille couleur + ✓ actif) - feedback immédiat du
            changement, contrairement à l'ancien <select> sombre. */}
        {etabs.length > 1 && (
          <div style={ls.etabWrap}>
            <div style={ls.etabLabel}>Établissement</div>
            <div style={ls.etabList}>
              {etabs.map(et => {
                const active = etablissement?.id === et.id;
                return (
                  <button
                    key={et.id}
                    style={{ ...ls.etabOption, ...(active ? ls.etabOptionActive : {}) }}
                    onClick={() => setEtablissement(et)}
                  >
                    <span style={{ ...ls.etabDot, background: et.couleur || 'var(--accent)' }} />
                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{et.nom}</span>
                    {active && <span style={{ color: 'var(--accent)', fontSize: 13, flexShrink: 0 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {etabs.length === 1 && etablissement && (
          <div style={ls.etabWrap}>
            <div style={ls.etabLabel}>Établissement</div>
            <div style={ls.etabSingle}>
              <span style={{ ...ls.etabDot, background: etablissement.couleur || 'var(--accent)' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{etablissement.nom}</span>
            </div>
          </div>
        )}

        <nav style={ls.nav}>
          {groupedNav.map(group => (
            <div key={group.label} style={ls.navGroup}>
              <div style={ls.navGroupLabel}>{group.label}</div>
              {group.items.map(item => {
                const active = currentPage === item.id;
                return (
                  <button key={item.id}
                    style={{ ...ls.navItem, ...(active ? ls.navActive : {}) }}
                    onClick={() => handleSetPage(item.id)}>
                    <span style={{ ...ls.navLabel, flex: 1 }}>{getLabelForModule(item.id, item.label)}</span>
                    {renderNavBadge(item.id)}
                    {active && <div style={ls.navActiveLine} />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={ls.userArea}>
          <div style={{ ...ls.avatar, background: roleInfo.couleur }}>{user.avatar}</div>
          <div style={ls.userInfo}>
            <div style={ls.userName}>{user.prenom} {user.nom}</div>
            <div style={{ ...ls.userRole, color: roleInfo.couleur }}>{roleInfo.label}</div>
          </div>
        </div>
      </aside>

      {/* Languette de réouverture - visible uniquement quand la barre est repliée.
          Onglet collé au bord gauche, à mi-hauteur, façon flèche PiP iPhone. */}
      {!sidebarOpen && (
        <button
          style={ls.sidebarPeek}
          onClick={() => setSidebarOpen(true)}
          aria-label="Afficher le menu"
          title="Afficher le menu"
        >
          ❯
        </button>
      )}

      <div style={ls.main}>
        {showPosBanner && (
          <PosTokenAlertBanner
            unhealthy={posUnhealthy}
            onReconnect={handleReconnect}
          />
        )}
        {/* Bandeau d'état hors-ligne / sync pointages / mise à jour */}
        <OfflineBanner />
        <header style={ls.topbar}>
          <div style={ls.topbarLeft}>
            <div style={ls.titleBlock}>
              <div style={ls.pageTitle}>{getLabelForModule(currentItem?.id, currentItem?.label) || 'Tableau de bord'}</div>
              <div style={ls.topbarSub}>{todayLabel}</div>
            </div>
            {etablissement && (
              <div style={ls.etabBadge}>
                <span style={ls.etabBadgeDot} />
                {etablissement.nom}
              </div>
            )}
          </div>
          <div style={ls.topbarRight}>
            <LanguageToggle etablissementId={etablissement?.id || null} />
            <button
              type="button"
              style={ls.themeBtn}
              onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
              aria-label={isDark ? 'Mode clair' : 'Mode sombre'}
              title={isDark ? 'Mode clair' : 'Mode sombre'}
            >
              {isDark ? '☀' : '◑'}
            </button>
            <div style={{ position: 'relative' }}>
              <button style={ls.iconBtn} onClick={(e) => { e.stopPropagation(); const opening = !notifOpen; setNotifOpen(opening); if (opening && unreadCount > 0) markAllRead(); }}>
                <span>🔔</span>
                {unreadCount > 0 && <div style={ls.notifDot}>{unreadCount}</div>}
              </button>
              {notifOpen && renderAlertPanel(ls.notifPanel, ls.notifHeader, ls.notifItem)}
            </div>
            <div style={ls.topbarDivider} />
            <button style={ls.logoutBtn} onClick={onLogout}>Déconnexion</button>
          </div>
        </header>

        <main style={ls.content}>{children}</main>
      </div>
    </div>
  );
}

const ls = {
  // Desktop - même langage visuel que le drawer mobile : tokens du thème
  // (surface/text/border/accent) au lieu du fond sombre --nav + blancs en dur.
  // Blanc en mode clair, surface sombre en mode sombre, sans couleur codée en dur.
  // height 100% et non 100vh : #root porte déjà les zones de sécurité iOS, une
  // coque en 100vh dépasse par le bas de la hauteur de l'indicateur d'accueil et
  // fait sortir de l'écran le bas de la zone de contenu (barres d'action posées).
  root: { display: 'flex', height: '100%', fontFamily: 'var(--font)', background: 'var(--bg)', overflow: 'hidden' },
  // minWidth 0 + overflow hidden : la barre peut s'animer jusqu'à width 0 sans
  // être bloquée par la taille min-content de ses enfants flex.
  sidebar: { background: 'var(--surface)', display: 'flex', flexDirection: 'column', flexShrink: 0, minWidth: 0, overflow: 'hidden', borderRight: '1px solid var(--border)', transition: 'width .2s cubic-bezier(.4,0,.2,1)' },
  sidebarPeek: { position: 'fixed', left: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px 10px 18px 7px', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 12px 12px 0', boxShadow: '2px 0 12px rgba(0,0,0,0.10)', color: 'var(--text2)', fontSize: 14, lineHeight: 1, cursor: 'pointer', fontFamily: 'var(--font)', animation: 'sidebarPeekIn .25s ease .12s both' },
  sidebarTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 14px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 10, overflow: 'visible' },
  logoText: { overflow: 'hidden' },
  logoName: { color: 'var(--text)', fontWeight: 700, fontSize: 14, lineHeight: 1.2, whiteSpace: 'nowrap', fontFamily: 'var(--font-serif)' },
  logoSub: { color: 'var(--text2)', fontSize: 10, whiteSpace: 'nowrap' },
  logoMenu: { position: 'absolute', top: '100%', left: 0, marginTop: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', width: 200, zIndex: 300, overflow: 'hidden' },
  logoMenuBtn: { width: '100%', display: 'block', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', fontSize: 13, color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)' },
  toggleBtn: { background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, padding: 4, flexShrink: 0 },
  etabWrap: { padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  etabLabel: { color: 'var(--text2)', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  etabList: { display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 180, overflowY: 'auto' },
  // flexShrink:0 : dans une colonne flex scrollable, les <button> se font
  // comprimer par le min-height global mobile → lignes superposées.
  etabOption: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', minHeight: 36, flexShrink: 0 },
  etabOptionActive: { border: '1px solid var(--accent)', background: 'var(--accent-light)', color: 'var(--accent)' },
  etabDot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  etabSingle: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', padding: '2px 0' },
  nav: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 7px 12px', overflowY: 'auto' },
  navGroup: { marginBottom: 2 },
  navGroupLabel: { fontSize: 9, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text3)', padding: '10px 8px 4px' },
  navItem: { display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 500, position: 'relative', transition: 'background .15s,color .15s', fontFamily: 'var(--font)', width: '100%', textAlign: 'left', marginBottom: 1 },
  navActive: { background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 700 },
  navActiveLine: { position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 18, background: 'var(--accent)', borderRadius: 2 },
  navLabel: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userArea: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, boxSizing: 'border-box' },
  avatar: { width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0 },
  userInfo: { overflow: 'hidden' },
  userName: { color: 'var(--text)', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  userRole: { fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topbar: { height: 56, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 0 18px', flexShrink: 0 },
  topbarLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  titleBlock: { minWidth: 0 },
  pageTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  topbarSub: { fontSize: 11, color: 'var(--text3)', textTransform: 'capitalize', marginTop: 1 },
  etabBadge: { display: 'flex', alignItems: 'center', gap: 6, background: 'var(--accent-light)', border: '1px solid var(--accent-bd)', color: 'var(--accent)', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, whiteSpace: 'nowrap' },
  etabBadgeDot: { width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 },
  topbarRight: { display: 'flex', alignItems: 'center', gap: 12 },
  themeBtn: { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', padding: 0, borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, position: 'relative', padding: 4 },
  notifDot: { position: 'absolute', top: 0, right: 0, background: 'var(--danger-strong)', color: '#fff', fontSize: 9, fontWeight: 700, width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  notifPanel: { position: 'absolute', right: 0, top: 40, width: 300, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 200 },
  notifHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5 },
  notifItem: { padding: '10px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', lineHeight: 1.4 },
  topbarDivider: { width: 1, height: 20, background: 'var(--border)' },
  logoutBtn: { background: 'none', border: '1px solid var(--border)', color: 'var(--text2)', padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)' },
  content: { flex: 1, overflowY: 'auto', overflowX: 'hidden', maxWidth: '100%', padding: '24px' },

  // Mobile
  mobileRoot: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'var(--font)', background: 'var(--bg)' },
  mobileTopbar: { height: 54, background: 'var(--nav)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', flexShrink: 0, gap: 10 },
  mobileTitle: { flex: 1, color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-serif)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  mobileEtabSelect: { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', borderRadius: 5, padding: '4px 6px', fontSize: 11, maxWidth: 100, fontFamily: 'var(--font)' },
  mobileContent: { flex: 1, overflowY: 'auto', padding: '12px', WebkitOverflowScrolling: 'touch' },
  mobileNav: { display: 'flex', background: 'var(--surface)', borderTop: '1px solid var(--border)', flexShrink: 0, position: 'relative', zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom)' },
  mobileNavBtn: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 4px 10px', background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font)', gap: 2, minHeight: 58 },
  mobileNavActive: { color: 'var(--accent)' },
  mobileAvatar: { width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0 },
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
  root: { height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: 'var(--font)' },

  // Header fixe haut
  topbar: {
    position: 'sticky', top: 0, zIndex: 50, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    minHeight: 56,
  },
  hamburger: {
    width: 44, height: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    background: 'none', border: 'none', cursor: 'pointer', padding: 10,
  },
  hamLine: { width: 22, height: 2, background: 'var(--text)', borderRadius: 2, transition: 'all 0.15s' },
  title: { fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-serif)', color: 'var(--text)', textAlign: 'center', flex: 1, paddingLeft: 8, paddingRight: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  themeBtn: { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 15, fontWeight: 700, flexShrink: 0 },
  bellBtn: { width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', position: 'relative', padding: 0 },
  notifDot: { position: 'absolute', top: 6, right: 6, background: 'var(--danger-strong)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 8, minWidth: 14, textAlign: 'center', lineHeight: 1 },
  notifPanel: { position: 'absolute', right: 0, top: 44, width: 300, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', zIndex: 100, maxHeight: 360, overflowY: 'auto' },
  notifHeader: { padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.4 },
  notifItem: { padding: '10px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)', lineHeight: 1.4 },

  // Overlay sombre quand drawer ouvert
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 90, animation: 'fadeIn 0.2s' },

  // Drawer latéral gauche
  drawer: {
    position: 'fixed', top: 0, left: 0, bottom: 0, width: '80%', maxWidth: 320,
    background: 'var(--surface)',
    zIndex: 100,
    display: 'flex', flexDirection: 'column',
    transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '4px 0 24px rgba(0,0,0,0.12)',
  },
  drawerHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 18px',
    borderBottom: '1px solid var(--border)',
  },
  closeDrawer: {
    width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
    cursor: 'pointer', fontSize: 16, color: 'var(--text2)',
  },
  userCard: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 18px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg)',
  },
  drawerAvatar: {
    width: 42, height: 42, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
  },
  drawerNav: {
    flex: 1, overflowY: 'auto', padding: '12px 10px',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  drawerGroupLabel: {
    fontSize: 10, fontWeight: 800, color: 'var(--text2)',
    textTransform: 'uppercase', letterSpacing: 0.6,
    padding: '10px 6px 5px',
  },
  etabSwitcher: {
    padding: '12px 14px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg)',
  },
  etabSwitcherLabel: {
    fontSize: 10, fontWeight: 700, color: 'var(--text2)',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8,
  },
  etabOption: {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '10px 12px',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, marginBottom: 6,
    cursor: 'pointer', fontFamily: 'var(--font)',
    fontSize: 13, fontWeight: 600, color: 'var(--text)',
    minHeight: 40,
  },
  etabOptionActive: {
    border: '1px solid var(--accent)', background: 'var(--accent-light)',
    color: 'var(--accent)',
  },
  etabDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  etabSingle: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg)',
    fontSize: 12, fontWeight: 600, color: 'var(--text2)',
  },
  drawerItem: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '13px 14px', borderRadius: 8,
    background: 'none', border: 'none', width: '100%',
    cursor: 'pointer', fontFamily: 'var(--font)',
    fontSize: 14, fontWeight: 600, color: 'var(--text)',
    textAlign: 'left',
  },
  drawerItemActive: {
    background: 'var(--accent-light)', color: 'var(--accent)',
  },
  drawerIcon: { fontSize: 17, width: 24, textAlign: 'center', flexShrink: 0 },
  drawerFooter: {
    padding: '12px 14px',
    borderTop: '1px solid var(--border)',
  },
  logoutBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%',
    padding: '11px 14px', background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text2)', cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
  },

  // minHeight 0 : sans lui, la taille minimale automatique d'un élément flex
  // vaut la hauteur de son contenu, <main> déborde la coque et ne défile pas.
  content: { flex: 1, minHeight: 0, padding: '16px 14px 24px', overflowY: 'auto', overflowX: 'hidden', maxWidth: '100%' },
};
