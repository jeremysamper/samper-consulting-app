import React from 'react';
import { PanneauNotifications, useNotificationsAppareil } from './NotificationsAppareil.jsx';
import { ceQueRecoit, pageEssai } from '../caisse/avisPret.js';
import { isPageActiveForEtab, peutOuvrirPage } from '../moduleConfig.js';
import { notify } from '../../components/toast/index.js';
import { avisMessagesActif, demanderPermissionAvis, reglerAvisMessages } from '../../services/avisMessages.js';
import { CaseReglage } from '../compte/sections/reglagesModulesUi.jsx';

// Section « Notifications sur cet appareil » de la page des réglages : le
// panneau d'origine, posé dans la page, avec l'état et les trois gestes du
// même hook que la tuile « Prévenir cet appareil » de Réservations.
// Ouverte à qui voit Réservations, ouvre la Caisse ou les Messages
// (registreReglages) : le panneau annonce ce que la personne reçoit d'après
// ses droits, et l'essai de qui n'a pas Réservations ramène à la Caisse.
// Plan 15, lot 2 : l'avis d'un nouveau message se règle ici aussi.
export default function SectionNotificationsAppareil({ user, etablissement, permissions }) {
  const etabId = etablissement?.id || null;
  const recoit = ceQueRecoit({ user, permissions, etablissement });
  const notifs = useNotificationsAppareil(etabId, user, { pageEssai: pageEssai(recoit) });
  const voitMessages = peutOuvrirPage('messages', user, permissions) && isPageActiveForEtab(etablissement, 'messages');
  if (!etabId) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {(recoit.reservations || recoit.platsPrets) && <PanneauNotifications notifs={notifs} recoit={recoit} />}
      {voitMessages && <AvisMessages />}
    </div>
  );
}

function AvisMessages() {
  const [actif, setActif] = React.useState(avisMessagesActif);
  const basculer = async (oui) => {
    reglerAvisMessages(oui);
    setActif(oui);
    if (!oui) return;
    const permission = await demanderPermissionAvis();
    if (permission === 'denied') notify("L'avis s'affiche dans l'app. Le navigateur refuse les notifications quand l'app est en arrière-plan.", 'warning');
  };
  return (
    <div data-reglage-avis-messages="">
      <div style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', marginBottom: 4 }}>Messages</div>
      <CaseReglage
        libelle="Me prévenir d'un nouveau message"
        aide="Sur cet appareil, pendant que l'app est ouverte ou en arrière-plan. Le contenu du message ne s'affiche pas."
        coche={actif}
        onChange={basculer}
      />
    </div>
  );
}
