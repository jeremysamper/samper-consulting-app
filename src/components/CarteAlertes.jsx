import React from 'react';
import { Btn } from './ui/index.jsx';
import { supabase } from '../services/supabase.js';
import { dbService } from '../services/dbService.js';
import { supportPush } from '../services/pushNotifications.js';
import { useNotificationsAppareil } from '../modules/previsions/NotificationsAppareil.jsx';
import { readText, writeText } from '../utils/storage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Carte « Alertes sur cet appareil », sur la page d'accueil dès la première
// utilisation : Activer (la demande du navigateur part de ce toucher) ou Plus
// tard. Elle s'efface pour de bon après l'un ou l'autre.
//
// Proposée seulement à qui une règle d'alerte active de l'établissement vise
// (rôle dans target_roles, défaut consultant et patron comme alerts-evaluator ;
// ou toute personne quand la règle « pointage manquant » prévient l'employé du
// shift), ET qui voit déjà Réservations : un abonnement reçoit aussi les
// nouvelles réservations en ligne, nom du client compris (notifications,
// nouvelle_resa, tous les abonnés de l'établissement).
//
// Abonnement : le même chemin que Réservations (useNotificationsAppareil).
// « Plus tard » : user_settings (alertes_carte), avec un miroir local.
// iPhone dans Safari : la carte explique l'ajout à l'écran d'accueil ;
// « Compris » ne vaut que pour cet appareil, l'app installée a son propre
// stockage et propose alors Activer. Refus du navigateur : expliqué une fois
// par appareil.
// ─────────────────────────────────────────────────────────────────────────────

const REGLAGE = 'alertes_carte';
const DEFAUT_ROLES = ['consultant', 'patron'];

export function estViseParRegles(regles, role) {
  return (regles || []).some((r) => (r.target_roles ?? DEFAUT_ROLES).includes(role)
    || (r.rule_type === 'pointage_manquant' && r.rule_config?.notify_employee !== false));
}

export default function CarteAlertes({ user, etablissement, voitReservations, bas = 0 }) {
  const etabId = etablissement?.id || null;
  const cleLocale = `sc_alertes_plus_tard_${user.id}`;
  const [plusTard, setPlusTard] = React.useState(() => readText(cleLocale, '') === '1');
  const [reglageLu, setReglageLu] = React.useState(false);
  const [vise, setVise] = React.useState(false);

  React.useEffect(() => {
    let vivant = true;
    const db = dbService.getDb();
    Promise.resolve(db?.getUserSetting?.(REGLAGE))
      .then((v) => { if (vivant && v?.plus_tard) setPlusTard(true); })
      .catch(() => {})
      .finally(() => { if (vivant) setReglageLu(true); });
    return () => { vivant = false; };
  }, [user.id]);

  React.useEffect(() => {
    setVise(false);
    if (!etabId || !voitReservations || plusTard || supportPush() === 'non-supporte') return undefined;
    let vivant = true;
    supabase.from('alert_rules').select('rule_type, rule_config, target_roles')
      .eq('etablissement_id', etabId).eq('is_active', true)
      .then(({ data, error }) => { if (vivant && !error) setVise(estViseParRegles(data, user.role)); });
    return () => { vivant = false; };
  }, [etabId, voitReservations, plusTard, user.role]);

  const remettre = () => {
    setPlusTard(true);
    writeText(cleLocale, '1');
    Promise.resolve(dbService.getDb()?.setUserSetting?.(REGLAGE, { plus_tard: new Date().toISOString() }))
      .catch((err) => console.warn('[CarteAlertes] Plus tard non enregistré', err));
  };

  if (!reglageLu || plusTard || !vise) return null;
  return <CarteEtat user={user} etabId={etabId} onPlusTard={remettre} bas={bas} />;
}

// État de cet appareil (useNotificationsAppareil), lu seulement pour qui est visé.
function CarteEtat({ user, etabId, onPlusTard, bas }) {
  const { etat, enCours, activer } = useNotificationsAppareil(etabId, user);
  const cleRefus = `sc_alertes_refus_explique_${user.id}`;
  const cleIos = `sc_alertes_ios_compris_${user.id}`;
  const [vu, setVu] = React.useState(() => ({ refus: readText(cleRefus, '') === '1', ios: readText(cleIos, '') === '1' }));
  const compris = (cle, champ) => { writeText(cle, '1'); setVu((v) => ({ ...v, [champ]: true })); };

  if (etat === 'inactif') {
    return (
      <Cadre bas={bas} titre="Alertes sur cet appareil">
        <p style={st.texte}>Recevez en notification les alertes de l&apos;établissement et les nouvelles réservations en ligne, même app fermée.</p>
        <div style={st.boutons}>
          <Btn variant="primary" onClick={activer} disabled={enCours} style={st.bouton}>{enCours ? 'Activation…' : 'Activer'}</Btn>
          <Btn variant="ghost" onClick={onPlusTard} disabled={enCours} style={st.bouton}>Plus tard</Btn>
        </div>
      </Cadre>
    );
  }
  if (etat === 'ios-a-installer' && !vu.ios) {
    return (
      <Cadre bas={bas} titre="Alertes sur cet appareil">
        <p style={st.texte}>Sur iPhone et iPad, ajoutez d&apos;abord l&apos;app à l&apos;écran d&apos;accueil : dans Safari, touchez Partager, puis « Sur l&apos;écran d&apos;accueil ». Ouvrez-la ensuite depuis son icône pour activer les alertes.</p>
        <div style={st.boutons}>
          <Btn variant="ghost" onClick={() => compris(cleIos, 'ios')} style={st.bouton}>Compris</Btn>
        </div>
      </Cadre>
    );
  }
  if (etat === 'refuse' && !vu.refus) {
    return (
      <Cadre bas={bas} titre="Notifications bloquées sur cet appareil">
        <p style={st.texte}>Pour recevoir les alertes, autorisez les notifications de l&apos;app dans les réglages du navigateur ou de l&apos;appareil, puis revenez ici.</p>
        <div style={st.boutons}>
          <Btn variant="ghost" onClick={() => compris(cleRefus, 'refus')} style={st.bouton}>Compris</Btn>
        </div>
      </Cadre>
    );
  }
  return null;
}

// data-cadre : la carte garde son fond et son filet (règle « Plus de carrés »).
function Cadre({ titre, bas, children }) {
  return (
    <section data-cadre="" data-carte-alertes="" aria-label={titre} style={{ ...st.carte, marginBottom: bas }}>
      <h2 style={st.titre}>{titre}</h2>
      {children}
    </section>
  );
}

const st = {
  carte: {
    display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px',
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
    maxWidth: 900, width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font)',
  },
  titre: { margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font)' },
  texte: { margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--text2)' },
  boutons: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  bouton: { minHeight: 44, flexShrink: 0 },
};
