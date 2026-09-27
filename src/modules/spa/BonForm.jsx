import { useState } from 'react';
import { Send } from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { zurichToday } from '../../utils/zurichTime.js';
import BonCarte from './BonCarte.jsx';
import { Champ, Modale, decalerJour, nomClient, st } from './spaUi.jsx';
import { appelerMailer } from './spaData.js';

// Offrir un bon cadeau à un client, tout de suite, par e-mail. Le bon se
// dessine pendant la saisie ; le code définitif est généré par le serveur
// (spa-mailer) et le bon apparaît ensuite sur la fiche.
export default function BonForm({ client, etablissementId, valeurDefaut, validiteDefaut = 60, onClose, onEnvoye }) {
  const [form, setForm] = useState({ valeur: valeurDefaut || '', validiteJours: validiteDefaut, message: '' });
  const [enCours, setEnCours] = useState(false);
  const set = (cle, valeur) => setForm((p) => ({ ...p, [cle]: valeur }));
  const aujourdhui = zurichToday();

  async function envoyer() {
    if (!form.valeur.trim()) { notify('Indique ce que le bon offre.', 'error'); return; }
    setEnCours(true);
    try {
      const { data, error } = await appelerMailer('bon', {
        etablissementId, clientId: client.id,
        valeur: form.valeur.trim(), validiteJours: Number(form.validiteJours) || 60, message: form.message.trim(),
      });
      if (error) { notify(error, 'error'); return; }
      notify(`Bon ${data?.code || ''} envoyé à ${client.email}.`, 'success');
      onEnvoye?.();
      onClose();
    } finally {
      setEnCours(false);
    }
  }

  const apercu = {
    code: '••••-••••', motif: 'cadeau', valeur: form.valeur || 'Ce que le bon offre',
    message: form.message, valableJusqu: decalerJour(aujourdhui, Math.max(1, Number(form.validiteJours) || 60)),
  };

  return (
    <Modale
      surTitre="Offrir un bon cadeau"
      titre={nomClient(client)}
      titreBrut
      sousTitre={client.email || 'Pas d\'adresse e-mail'}
      onClose={onClose}
      largeur={520}
      pied={(
        <>
          <button type="button" onClick={onClose} style={st.discret}>Fermer</button>
          <button type="button" onClick={envoyer} disabled={enCours || !client.email} style={{ ...st.principal, opacity: enCours || !client.email ? 0.6 : 1 }}>
            <Send size={16} strokeWidth={1.8} aria-hidden="true" /> {enCours ? 'Envoi…' : 'Envoyer le bon'}
          </button>
        </>
      )}
    >
      {!client.email && <div style={st.encartAttention}>Ajoute d'abord l'adresse e-mail du client sur sa fiche.</div>}
      <BonCarte bon={apercu} aujourdhui={aujourdhui} />
      <Champ label="Le bon offre" htmlFor="bon-valeur">
        <input id="bon-valeur" style={st.champ} value={form.valeur} onChange={(e) => set('valeur', e.target.value)} placeholder="Ex. un massage de 30 minutes" />
      </Champ>
      <Champ label="Valable (jours)" htmlFor="bon-validite">
        <input id="bon-validite" type="number" min={1} max={730} inputMode="numeric" style={{ ...st.champ, maxWidth: 160 }} value={form.validiteJours} onChange={(e) => set('validiteJours', e.target.value)} />
      </Champ>
      <Champ label="Petit mot (facultatif)" htmlFor="bon-message">
        <textarea id="bon-message" style={{ ...st.zone, minHeight: 64 }} value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="Merci pour votre fidélité…" />
      </Champ>
    </Modale>
  );
}
