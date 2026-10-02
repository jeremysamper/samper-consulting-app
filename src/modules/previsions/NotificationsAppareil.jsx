import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { notify } from '../../components/toast/index.js';
import { activerPush, desactiverPush, etatPush, testerPush } from '../../services/pushNotifications.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Notifications » : prévenir CET appareil (téléphone, tablette du pass) à
// chaque nouvelle réservation en ligne de l'établissement affiché. Chaque
// appareil s'active une fois ; l'envoi part du serveur (Edge Function
// « notifications »), même app fermée.
//
// Le panneau est une fenêtre centrée, rendue dans <body> (portail) : sur
// téléphone la barre d'actions défile (overflow) et coupait un panneau
// déroulant posé dedans, qui n'apparaissait jamais.
// ─────────────────────────────────────────────────────────────────────────────

const MESSAGES = {
  'ios-a-installer': "Sur iPhone et iPad, ajoutez d'abord l'app à l'écran d'accueil (Safari : bouton Partager, puis « Sur l'écran d'accueil »), ouvrez-la depuis l'icône, puis revenez ici.",
  'non-supporte': 'Ce navigateur ne permet pas les notifications. Utilisez Chrome, Edge, Firefox ou Safari récent.',
  refuse: "Les notifications sont bloquées pour l'app sur cet appareil. Autorisez-les dans les réglages du navigateur (ou de l'app), puis revenez ici.",
};

export default function NotificationsAppareil({ etablissementId, user }) {
  const [etat, setEtat] = useState(null); // null = lecture en cours
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let vivant = true;
    setEtat(null);
    etatPush(etablissementId).then((e) => { if (vivant) setEtat(e); }).catch(() => { if (vivant) setEtat('non-supporte'); });
    return () => { vivant = false; };
  }, [etablissementId]);

  useEffect(() => {
    if (!ouvert) return undefined;
    const echap = (e) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [ouvert]);

  async function activer() {
    setEnCours(true);
    try {
      const { error } = await activerPush(etablissementId, user?.id);
      if (error) { notify(error, 'error'); setEtat(await etatPush(etablissementId)); return; }
      setEtat('actif');
      const t = await testerPush();
      notify(t.error ? 'Notifications activées sur cet appareil.' : 'Notifications activées : une notification d\'essai arrive.', 'success');
    } finally {
      setEnCours(false);
    }
  }

  async function tester() {
    setEnCours(true);
    try {
      const { data, error } = await testerPush();
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

  const actif = etat === 'actif';
  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        title="Être prévenu sur cet appareil à chaque réservation en ligne"
        style={{
          ...s.bouton,
          ...(actif ? { borderColor: 'var(--success-bd)', color: 'var(--success-text)', background: 'var(--success-bg-soft)' } : null),
        }}
      >
        {actif ? 'Notifications activées' : 'Notifications'}
      </button>
      {ouvert && createPortal(
        <div style={s.voile} onClick={(e) => { if (e.target === e.currentTarget) setOuvert(false); }}>
        <div style={s.panneau} role="dialog" aria-modal="true" aria-label="Notifications sur cet appareil">
          <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" style={s.fermer}>×</button>
          <div style={s.titre}>Nouvelles réservations en ligne</div>
          {etat === null && <div style={s.texte}>Vérification…</div>}
          {MESSAGES[etat] && <div style={s.texte}>{MESSAGES[etat]}</div>}
          {etat === 'inactif' && (
            <>
              <div style={s.texte}>
                Recevez une notification sur cet appareil (téléphone, tablette) à chaque réservation faite sur votre site, même app fermée.
              </div>
              <button type="button" onClick={activer} disabled={enCours} style={s.principal}>
                {enCours ? 'Activation…' : 'Activer sur cet appareil'}
              </button>
            </>
          )}
          {actif && (
            <>
              <div style={s.texte}>Cet appareil est prévenu à chaque nouvelle réservation en ligne de cet établissement.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={tester} disabled={enCours} style={s.secondaire}>Envoyer un essai</button>
                <button type="button" onClick={desactiver} disabled={enCours} style={s.discret}>Désactiver</button>
              </div>
            </>
          )}
        </div>
        </div>,
        document.body,
      )}
    </>
  );
}

const s = {
  bouton: {
    padding: '9px 16px', borderRadius: 8, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600,
    fontFamily: 'var(--font)', cursor: 'pointer',
  },
  voile: {
    position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
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
    padding: '10px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 44,
  },
  secondaire: {
    padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 40,
  },
  discret: {
    padding: '9px 12px', borderRadius: 8, border: 'none', background: 'transparent',
    color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)', minHeight: 40,
  },
};
