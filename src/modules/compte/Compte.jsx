import React from 'react';
import SafeModule from '../../legacy/SafeModule.jsx';
import { getBrowserWindow } from '../../legacy/legacyApi.js';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { readText, writeText, removeStorageKeys, UI_STORAGE_KEYS } from '../../utils/storage.js';
import { ongletCompteDepuisOutils } from '../moduleConfig.js';
import { Parametres } from '../parametres/index.js';
import { Roles } from '../roles/index.js';
import AlertRules from '../consultant-tools/AlertRules.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// ESPACE COMPTE (D14, D18) - l'administration de l'app des brigades : les
// paramètres des établissements, les rôles et les accès, les règles d'alerte,
// plus tard l'abonnement. Sorti des Outils consultant le 28.10.2026 : mêmes
// écrans, mêmes props, chaque onglet isolé dans un SafeModule.
//
// Accès : peutOuvrirCompte (moduleConfig), garde de LegacyModuleHost. Chaque
// onglet porte la liste des rôles qui le voient, consultant seul aujourd'hui ;
// L7 (D16) ouvrira ici ce que le patron pourra voir.
// ─────────────────────────────────────────────────────────────────────────────

const ONGLETS = [
  { id: 'parametres', label: 'Paramètres', roles: ['consultant'] },
  { id: 'roles', label: 'Rôles & accès', roles: ['consultant'] },
  { id: 'alertes', label: 'Alertes', roles: ['consultant'] },
];

// Priorité : clé ponctuelle (ouvrirCompte, ancien lien des Outils) > dernier
// onglet visité > onglet d'administration où l'on travaillait dans les Outils
// consultant (première ouverture) > Paramètres.
function ongletInitial(ids) {
  try {
    const pre = readText(UI_STORAGE_KEYS.compteTab, '');
    if (pre) {
      removeStorageKeys([UI_STORAGE_KEYS.compteTab]);
      if (ids.includes(pre)) return pre;
    }
    const last = readText(UI_STORAGE_KEYS.compteLastTab, '');
    if (ids.includes(last)) return last;
    const depuisOutils = ongletCompteDepuisOutils(readText(UI_STORAGE_KEYS.consultantToolsLastTab, ''));
    if (ids.includes(depuisOutils)) return depuisOutils;
  } catch (e) { /* stockage indisponible : premier onglet */ }
  return ids[0];
}

export default function Compte({ user, etablissement }) {
  const role = user?.role;
  const onglets = ONGLETS.filter((o) => o.roles.includes(role));
  const [actif, setActif] = React.useState(() => ongletInitial(onglets.map((o) => o.id)));
  React.useEffect(() => { if (actif) writeText(UI_STORAGE_KEYS.compteLastTab, actif); }, [actif]);
  // Compte déjà monté (keep-alive) : ouvrirCompte prévient par un événement.
  React.useEffect(() => {
    const browserWindow = getBrowserWindow();
    if (!browserWindow) return undefined;
    const surOnglet = (event) => {
      const tab = event?.detail?.tab;
      if (ONGLETS.some((o) => o.id === tab && o.roles.includes(role))) {
        removeStorageKeys([UI_STORAGE_KEYS.compteTab]);
        setActif(tab);
      }
    };
    browserWindow.addEventListener('sc:compte-tab', surOnglet);
    return () => browserWindow.removeEventListener('sc:compte-tab', surOnglet);
  }, [role]);

  // Aucun onglet pour ce rôle : LegacyModuleHost ne l'ouvre pas, rien à montrer.
  if (!onglets.length) return null;

  const contenu = actif === 'roles'
    ? <SafeModule name="Rôles & accès"><Roles user={user} /></SafeModule>
    : actif === 'alertes'
      ? <SafeModule name="Alertes"><AlertRules user={user} etablissement={etablissement} /></SafeModule>
      : <SafeModule name="Paramètres"><Parametres user={user} /></SafeModule>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="no-print" style={{ marginBottom: 14 }}>
        <SegmentedTabs active={actif} onChange={setActif} tabs={onglets} />
      </div>
      {contenu}
    </div>
  );
}
