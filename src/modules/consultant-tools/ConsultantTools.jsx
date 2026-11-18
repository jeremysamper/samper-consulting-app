import React from 'react';
import SafeModule from '../../legacy/SafeModule.jsx';
import { getBrowserWindow } from '../../legacy/legacyApi.js';
import { readText, removeStorageKeys } from '../../utils/storage.js';
import { Factures } from '../factures/index.js';
import { ouvrirCompte } from '../../services/navigationService.js';
import { ongletCompteDepuisOutils } from '../moduleConfig.js';
import { cts } from './ConsultantTools.styles.js';

// ─────────────────────────────────────────────────────────────────────────────
// OUTILS CONSULTANT - la facturation client du consultant.
// Le Chiffrage (coûts, prix de vente, marges, liaison au catalogue) vit dans
// Cartes & Recettes depuis le 18.11.2026, sous le droit d'action « chiffrage »,
// pour que la direction et la comptabilité chiffrent seules. L'édition des
// fiches y est depuis le 27.10.2026. Rôles & accès, Établissements et Alertes
// sont passés dans l'espace Compte le 28.10.2026 : un lien vers l'un d'eux y
// mène (ongletCompteDepuisOutils).
// ─────────────────────────────────────────────────────────────────────────────

const ConsultantToolsGate = (props) => {
  if (props.user?.role !== 'consultant') {
    return (
      <div style={{ padding: 60, textAlign: 'center', maxWidth: 480, margin: '40px auto' }}>
        <div style={{ fontSize: 'var(--t3)', fontWeight: 'var(--g3)', marginTop: 12, fontFamily: 'var(--font)' }}>
          Accès réservé
        </div>
        <div style={{ fontSize: 'var(--t2)', color: 'var(--text2)', marginTop: 6, lineHeight: 1.5 }}>
          Le module "Outils consultant" est réservé au rôle consultant.
          Si vous pensez que c'est une erreur, contactez votre administrateur.
        </div>
      </div>
    );
  }
  return <ConsultantToolsInner {...props} />;
};

const ConsultantToolsInner = ({ user, etablissement }) => {
  // Clé ponctuelle qui nomme un onglet passé dans Compte : lue puis effacée,
  // renvoyée vers Compte une fois le module monté. Toute autre valeur (un
  // ancien onglet Chiffrage) est effacée sans suite.
  const [renvoiCompte] = React.useState(() => {
    const pre = readText('sc_consultant_tools_tab', '');
    if (pre) removeStorageKeys(['sc_consultant_tools_tab']);
    return ongletCompteDepuisOutils(pre);
  });
  React.useEffect(() => { if (renvoiCompte) ouvrirCompte(renvoiCompte); }, [renvoiCompte]);
  React.useEffect(() => {
    const browserWindow = getBrowserWindow();
    if (!browserWindow) return undefined;
    const handleTabNavigation = (event) => {
      const versCompte = ongletCompteDepuisOutils(event?.detail?.tab);
      if (versCompte) ouvrirCompte(versCompte);
    };
    browserWindow.addEventListener('sc:consultant-tools-tab', handleTabNavigation);
    return () => browserWindow.removeEventListener('sc:consultant-tools-tab', handleTabNavigation);
  }, []);

  if (!Factures) return <div style={cts.fallback}>Module Factures non chargé.</div>;
  return (
    <SafeModule name="Factures">
      {React.createElement(Factures, { user, etablissement })}
    </SafeModule>
  );
};

// On expose le Gate (qui vérifie le rôle) sous le nom ConsultantTools
// pour que le routing principal n'ait rien à changer.
export default ConsultantToolsGate;
