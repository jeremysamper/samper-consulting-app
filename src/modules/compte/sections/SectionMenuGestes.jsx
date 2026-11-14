import React from 'react';
import Interrupteur from '../../roles/Interrupteur.jsx';
import { Btn } from '../../../components/ui/index.jsx';
import { getBrowserWindow } from '../../../legacy/legacyApi.js';
import { estTactile } from '../../../hooks/useShellMode.js';
import { useShell } from '../../../layouts/ShellContext.js';
import { ecrirePreference, reinitialiserPreferences, usePreferences } from '../../../services/preferencesAppareil.js';
import { ChoixPilules, Ligne, ui } from './reglagesUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Menu et gestes » (Cet appareil).
//   Présentation : la coque, choisie d'après l'écran (Automatique) ou forcée
//     (clé sc_shell, lue au chargement par useShellMode : l'app se recharge).
//   Menu déplié : à l'ordinateur, le même état que le bouton à gauche du titre
//     et Ctrl + B (la coque le fournit et reste seule à écrire sc_menu_deplie).
//   Geste de retour par le bord : clé sc_edge_swipe, suivie en direct par
//     EdgeSwipeBack. Proposé sur tablette et téléphone.
// ─────────────────────────────────────────────────────────────────────────────

const PRESENTATIONS = [
  { id: 'auto', label: 'Automatique' },
  { id: 'ordinateur', label: 'Ordinateur' },
  { id: 'tablette', label: 'Tablette' },
  { id: 'telephone', label: 'Téléphone' },
];

const GESTES = [
  { id: 'auto', label: 'Automatique' },
  { id: 'on', label: 'Activé' },
  { id: 'off', label: 'Désactivé' },
];

export default function SectionMenuGestes({ shellMode = 'ordinateur' }) {
  const prefs = usePreferences();
  const shell = useShell();
  const menu = shell?.reglages?.menu || null;
  // La présentation en cours a été lue au chargement : un autre choix demande
  // de recharger l'app.
  const [coqueDuChargement] = React.useState(prefs.coque);
  const aRecharger = prefs.coque !== coqueDuChargement;
  const montrerGeste = estTactile(shellMode) || prefs.gesteBord !== 'auto';

  const recharger = () => { getBrowserWindow()?.location?.reload(); };

  return (
    <div style={ui.liste}>
      <Ligne colonne titre="Présentation" aide="Automatique choisit d'après l'écran. Ordinateur : le menu sur le côté. Tablette et Téléphone : la page d'accueil en tuiles.">
        <ChoixPilules label="Présentation" valeur={prefs.coque} options={PRESENTATIONS} onChange={(v) => ecrirePreference('coque', v)} />
        {aRecharger && (
          <div style={st.recharger}>
            <span style={st.note}>L'app se recharge pour changer de présentation.</span>
            <Btn variant="primary" onClick={recharger} style={ui.btn44}>Recharger l'app</Btn>
          </div>
        )}
      </Ligne>
      {menu && (
        <Ligne derniere={!montrerGeste} titre="Menu déplié" aide="Les modules avec leur nom plutôt que le rail d'icônes. Le bouton à gauche du titre et Ctrl + B font la même chose.">
          <Interrupteur checked={menu.deplie} onChange={menu.basculer} label="Menu déplié" />
        </Ligne>
      )}
      {montrerGeste && (
        <Ligne colonne derniere titre="Geste de retour par le bord" aide="Glisser depuis le bord gauche de l'écran pour revenir en arrière. Automatique : seulement dans l'app installée sur iPhone et iPad, où le système n'a pas ce geste.">
          <ChoixPilules label="Geste de retour par le bord" valeur={prefs.gesteBord} options={GESTES} onChange={(v) => ecrirePreference('gesteBord', v)} />
        </Ligne>
      )}
      <div style={ui.pied}>
        <Btn variant="ghost" onClick={() => reinitialiserPreferences(['coque', 'gesteBord'])} style={ui.btn44}>Réinitialiser</Btn>
      </div>
    </div>
  );
}

const st = {
  recharger: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 4 },
  note: { fontSize: 'var(--t2)', color: 'var(--text2)' },
};
