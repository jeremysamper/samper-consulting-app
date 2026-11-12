import { zurichToday } from '../../utils/zurichTime.js';
import BoiteEnvoi from './BoiteEnvoi.jsx';
import { Anniversaires, useEtatEnvoi } from './MailingSpa.jsx';
import { mapClient, useSpaParametres, useSpaTable } from './spaData.js';
import { st } from './spaUi.jsx';
import './spa.css';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Spa : e-mails » de la page des réglages : la boîte d'envoi et les
// bons d'anniversaire automatiques (objet, message, expéditeur, adresse de
// réponse, signature), tels qu'ils étaient en tête de l'onglet E-mails du Spa.
// Mêmes composants, mêmes lectures et mêmes écritures ; l'onglet garde les
// actualités et l'historique. La classe .spa donne ses couleurs à l'écran.
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionSpaEmails({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const clients = useSpaTable('spa_clients', etabId, { map: mapClient, limit: 10000 });
  const { parametres, status, enregistrer } = useSpaParametres(etabId);
  const { etat, erreurService, chargerEtat, configure, adresseEnvoi } = useEtatEnvoi(etabId);
  if (!etabId) return null;
  const actifs = clients.rows.filter((c) => !c.archive);
  return (
    <div className="spa" style={{ background: 'transparent' }}>
      <BoiteEnvoi
        etablissementId={etabId}
        etat={etat}
        erreurService={erreurService}
        onRecharger={chargerEtat}
        consultant={user?.role === 'consultant'}
      />
      <div style={{ height: 16 }} aria-hidden="true" />
      {(status === 'absent' || clients.status === 'absent') && <div style={st.encartAttention}>Cette partie n'est pas encore activée.</div>}
      {status === 'loading' && <div style={{ fontSize: 13, color: 'var(--spa-ink2)' }}>Chargement…</div>}
      {status !== 'loading' && status !== 'absent' && clients.status !== 'absent' && (
        <Anniversaires
          etablissement={etablissement}
          parametres={parametres}
          enregistrer={enregistrer}
          clients={actifs}
          aujourdhui={zurichToday()}
          envoiPossible={configure === true}
          adresseEnvoi={adresseEnvoi}
        />
      )}
    </div>
  );
}
