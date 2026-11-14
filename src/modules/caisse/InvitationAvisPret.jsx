import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { getPermissionsForRole } from '../../data/demoData.js';
import { supportPush } from '../../services/pushNotifications.js';
import { readText, writeText } from '../../utils/storage.js';
import { MESSAGE_IOS, useNotificationsAppareil } from '../previsions/NotificationsAppareil.jsx';
import { ceQueRecoit, clePlusTard, invitationAvisPret, pageEssai } from './avisPret.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Être prévenu quand c'est prêt » : la ligne de l'accueil de la Caisse qui
// propose d'activer les notifications sur cet appareil. Montrée seulement si
// l'appareil le permet et n'est pas abonné (invitationAvisPret) ; « Plus tard »
// la range pour de bon sur cet appareil, les réglages gardent le chemin
// (Réglages, Notifications sur cet appareil).
// L'abonnement passe par le même hook que Réservations : un seul canal.
// Aucun signal n'est ajouté dans l'app : la pastille « Prêt » ne change pas.
// ─────────────────────────────────────────────────────────────────────────────

export default function InvitationAvisPret({ user, etablissement }) {
  const cle = clePlusTard(user?.id);
  const [plusTard, setPlusTard] = React.useState(() => readText(cle, '') === '1');
  // Rangée, ou appareil sans notifications : rien n'est lu ni monté.
  if (!user?.id || !etablissement?.id || plusTard || supportPush() === 'non-supporte') return null;
  const remettre = () => { writeText(cle, '1'); setPlusTard(true); };
  return <Ligne user={user} etablissement={etablissement} onPlusTard={remettre} />;
}

function Ligne({ user, etablissement, onPlusTard }) {
  const recoit = ceQueRecoit({ user, permissions: getPermissionsForRole(user.role), etablissement });
  const { etat, enCours, activer } = useNotificationsAppareil(etablissement.id, user, { pageEssai: pageEssai(recoit) });
  const quoi = invitationAvisPret({ ouvreCaisse: recoit.platsPrets, etat, plusTard: false });
  if (!quoi) return null;

  return (
    <div style={st.ligne} data-cadre="" data-caisse-avis-pret={quoi} role="region" aria-label="Être prévenu quand c'est prêt">
      <div style={st.texte}>
        <span style={st.titre}>Être prévenu quand c&apos;est prêt</span>
        {quoi === 'activer'
          ? <span style={st.detail}>Cet appareil reçoit une notification quand la cuisine a préparé les plats que vous avez envoyés.</span>
          : <span style={st.detail}>{MESSAGE_IOS}</span>}
      </div>
      <span style={st.actions}>
        {quoi === 'activer' && (
          <Btn onClick={activer} disabled={enCours} style={st.btn}>{enCours ? 'Activation…' : 'Activer'}</Btn>
        )}
        <Btn variant="ghost" onClick={onPlusTard} disabled={enCours} style={st.btn}>Plus tard</Btn>
      </span>
    </div>
  );
}

// Même pied que les propositions de l'accueil de la caisse (vider les tests,
// caisse non clôturée) : un bloc à sa mesure, texte à gauche, gestes à droite,
// qui passe sur deux rangs quand la largeur manque.
const st = {
  ligne: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '12px 14px', marginBottom: 12, minWidth: 0,
    borderRadius: 'var(--r-lg)', background: 'var(--surface2)', color: 'var(--text)',
  },
  texte: { display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 260px', minWidth: 0 },
  titre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', lineHeight: 1.4 },
  detail: { fontSize: 'var(--t2)', lineHeight: 1.4, color: 'var(--text2)' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn: { minHeight: 44, flexShrink: 0 },
};
