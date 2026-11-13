import { useEffect, useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { activerPush, desactiverPush, etatPush, testerPush } from '../../services/pushNotifications.js';
import { useReglageModifie } from '../../services/reglagesSignal.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Notifications » : prévenir CET appareil (téléphone, tablette du pass) à
// chaque nouvelle réservation en ligne de l'établissement affiché, et, pour
// qui ouvre la Caisse, quand la cuisine a préparé les plats envoyés. Chaque
// appareil s'active une fois ; l'envoi part du serveur (Edge Function
// « notifications »), même app fermée. Un seul abonnement pour tout : ce que
// l'appareil reçoit dépend des droits de la personne, relus à chaque envoi.
//
// Le panneau est une fenêtre centrée, rendue dans <body> (portail) : sur
// téléphone la barre d'actions défile (overflow) et coupait un panneau
// déroulant posé dedans, qui n'apparaissait jamais.
//
// L'état de l'appareil et les trois actions vivent dans un hook : la tuile
// « Prévenir cet appareil » de l'accueil du module en tire sa ligne d'état et
// ouvre le panneau.
// ─────────────────────────────────────────────────────────────────────────────

const MESSAGES = {
  'ios-a-installer': "Sur iPhone et iPad, ajoutez d'abord l'app à l'écran d'accueil (Safari : bouton Partager, puis « Sur l'écran d'accueil »), ouvrez-la depuis l'icône, puis revenez ici.",
  'non-supporte': 'Ce navigateur ne permet pas les notifications. Utilisez Chrome, Edge, Firefox ou Safari récent.',
  refuse: "Les notifications sont bloquées pour l'app sur cet appareil. Autorisez-les dans les réglages du navigateur (ou de l'app), puis revenez ici.",
};
// Le mode d'emploi de l'iPhone, repris tel quel par l'invitation de la Caisse.
export const MESSAGE_IOS = MESSAGES['ios-a-installer'];

// Ce que l'appareil reçoit, phrase entière par cas (la traduction du DOM
// travaille sur des chaînes fixes) : réservations seules, plats prêts seuls,
// les deux.
const TEXTES = {
  reservations: {
    titre: 'Nouvelles réservations en ligne',
    inactif: 'Recevez une notification sur cet appareil (téléphone, tablette) à chaque réservation faite sur votre site, même app fermée.',
    actif: 'Cet appareil est prévenu à chaque nouvelle réservation en ligne de cet établissement.',
  },
  platsPrets: {
    titre: 'Plats prêts en cuisine',
    inactif: 'Recevez une notification sur cet appareil (téléphone, tablette) quand la cuisine a préparé les plats que vous avez envoyés, même app fermée.',
    actif: 'Cet appareil est prévenu quand la cuisine a préparé les plats que vous avez envoyés.',
  },
  lesDeux: {
    titre: 'Réservations en ligne et plats prêts',
    inactif: 'Recevez une notification sur cet appareil (téléphone, tablette) à chaque réservation faite sur votre site, et quand la cuisine a préparé les plats que vous avez envoyés, même app fermée.',
    actif: 'Cet appareil est prévenu à chaque nouvelle réservation en ligne de cet établissement, et quand la cuisine a préparé les plats que vous avez envoyés.',
  },
};

// options.pageEssai : où mène le tap de la notification d'essai ('caisse' pour
// qui n'a pas Réservations ; sans valeur, Réservations).
export function useNotificationsAppareil(etablissementId, user, options = {}) {
  const pageEssai = options.pageEssai;
  const [etat, setEtat] = useState(null); // null = lecture en cours
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let vivant = true;
    setEtat(null);
    etatPush(etablissementId).then((e) => { if (vivant) setEtat(e); }).catch(() => { if (vivant) setEtat('non-supporte'); });
    return () => { vivant = false; };
  }, [etablissementId]);
  // Activé ou désactivé dans la page des réglages (section 'notifications') :
  // la tuile de Réservations restée montée relit l'état de l'appareil.
  useReglageModifie('notifications', () => {
    etatPush(etablissementId).then(setEtat).catch(() => {});
  });

  async function activer() {
    setEnCours(true);
    try {
      const { error } = await activerPush(etablissementId, user?.id);
      if (error) { notify(error, 'error'); setEtat(await etatPush(etablissementId)); return; }
      setEtat('actif');
      const t = await testerPush(pageEssai);
      notify(t.error ? 'Notifications activées sur cet appareil.' : 'Notifications activées : une notification d\'essai arrive.', 'success');
    } finally {
      setEnCours(false);
    }
  }

  async function tester() {
    setEnCours(true);
    try {
      const { data, error } = await testerPush(pageEssai);
      if (error) notify(error, 'error');
      else notify(data?.envoyes ? 'Notification d\'essai envoyée.' : 'Aucun appareil n\'a pu être joint.', data?.envoyes ? 'success' : 'warning');
    } finally {
      setEnCours(false);
    }
  }

  async function desactiver() {
    setEnCours(true);
    try {
      await desactiverPush(etablissementId);
      setEtat('inactif');
      notify('Notifications désactivées sur cet appareil.', 'info');
    } finally {
      setEnCours(false);
    }
  }

  return { etat, actif: etat === 'actif', enCours, activer, tester, desactiver };
}

// Le panneau, ouvert par la tuile de l'accueil. notifs : ce que rend
// useNotificationsAppareil.
// Depuis le 12.11.2026 : une section de la page des réglages
// (SectionNotificationsAppareil.jsx), le même contenu sans fenêtre ni voile.
// recoit : { reservations, platsPrets } (caisse/avisPret.js, ceQueRecoit) ;
// sans lui, le panneau parle des réservations, comme avant.
export function PanneauNotifications({ notifs, recoit }) {
  const { etat, actif, enCours, activer, tester, desactiver } = notifs;
  const platsPrets = recoit?.platsPrets === true;
  const reservations = recoit ? recoit.reservations === true : true;
  const t = platsPrets && reservations ? TEXTES.lesDeux : platsPrets ? TEXTES.platsPrets : TEXTES.reservations;

  return (
    <div style={s.section} role="region" aria-label="Notifications sur cet appareil">
      <div style={s.titre}>{t.titre}</div>
      {etat === null && <div style={s.texte}>Vérification…</div>}
      {MESSAGES[etat] && <div style={s.texte}>{MESSAGES[etat]}</div>}
      {etat === 'inactif' && (
        <>
          <div style={s.texte}>{t.inactif}</div>
          <button type="button" onClick={activer} disabled={enCours} style={s.principal}>
            {enCours ? 'Activation…' : 'Activer sur cet appareil'}
          </button>
        </>
      )}
      {actif && (
        <>
          <div style={s.texte}>{t.actif}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={tester} disabled={enCours} style={s.secondaire}>Envoyer un essai</button>
            <button type="button" onClick={desactiver} disabled={enCours} style={s.discret}>Désactiver</button>
          </div>
        </>
      )}
      {/* Le son et la vibration appartiennent au téléphone : l'app envoie un
          motif de vibration avec l'avis, elle ne coupe jamais le son. */}
      {platsPrets && (etat === 'inactif' || actif) && (
        <div style={s.texte} data-aide-vibreur="">
          <span>Pour vibrer sans sonner, mettez ce téléphone en mode vibreur.</span>{' '}
          <span>Le son et la vibration suivent les réglages de notification du téléphone.</span>
        </div>
      )}
    </div>
  );
}

const s = {
  voile: {
    position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  section: { display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 380, minWidth: 0 },
  panneau: {
    position: 'relative', width: 'min(380px, 100%)',
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)', padding: '20px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12,
  },
  fermer: {
    position: 'absolute', top: 6, right: 8, width: 40, height: 40, border: 'none', background: 'transparent',
    color: 'var(--text2)', fontSize: 24, cursor: 'pointer', lineHeight: 1,
  },
  titre: { fontSize: 16, fontWeight: 700, paddingRight: 32, color: 'var(--text)', fontFamily: 'var(--font-serif)' },
  texte: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 },
  principal: {
    padding: '10px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44,
  },
  secondaire: {
    padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 40,
  },
  discret: {
    padding: '9px 12px', borderRadius: 8, border: 'none', background: 'transparent',
    color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 40,
  },
};
