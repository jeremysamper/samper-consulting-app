import { useState } from 'react';
import { HeartPulse, NotebookPen } from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { Champ, Modale, dateLongue, decalerJour, nomClient, st } from './spaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Compte rendu de fin de séance. Rédigé par le praticien en sortant de cabine,
// souvent sur un téléphone : quatre zones courtes dans l'ordre où la séance se
// raconte (ce qu'on a vu, ce qu'on a utilisé, ce que le client a dit, ce
// qu'on lui conseille), puis la prochaine venue en un tap (+2 sem., +1 mois…).
//
// Ouvert depuis un rendez-vous, il le passe à « terminé » ; un second compte
// rendu pour le même rendez-vous met à jour le premier (index unique en base).
// ─────────────────────────────────────────────────────────────────────────────

const RAPPELS = [
  { jours: 14, label: '2 semaines' },
  { jours: 21, label: '3 semaines' },
  { jours: 30, label: '1 mois' },
  { jours: 42, label: '6 semaines' },
  { jours: 90, label: '3 mois' },
];

export default function SeanceForm({ client, reservation = null, seance = null, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    dateSeance: seance?.dateSeance || reservation?.dateRdv || zurichToday(),
    soin: seance?.soin || reservation?.soinLibelle || '',
    praticien: seance?.praticien || reservation?.praticien || '',
    observations: seance?.observations || '',
    produits: seance?.produits || '',
    ressenti: seance?.ressenti || '',
    recommandations: seance?.recommandations || '',
    prochaineSeance: seance?.prochaineSeance || '',
  }));
  const [enCours, setEnCours] = useState(false);
  const set = (cle, valeur) => setForm((p) => ({ ...p, [cle]: valeur }));

  const vide = !['observations', 'produits', 'ressenti', 'recommandations'].some((k) => form[k].trim());

  async function enregistrer() {
    if (!form.dateSeance) { notify('La date de la séance est obligatoire.', 'error'); return; }
    if (vide && !window.confirm('Le compte rendu est vide. Enregistrer quand même ?')) return;
    setEnCours(true);
    try {
      const { error } = await onSave({
        ...form,
        clientId: client.id,
        reservationId: reservation?.id || seance?.reservationId || null,
      });
      if (error) { notify(error, 'error'); return; }
      notify('Compte rendu enregistré.', 'success');
      onClose();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modale
      surTitre={seance ? 'Compte rendu' : 'Fin de séance'}
      titre={nomClient(client)}
      titreBrut
      sousTitre={[form.soin, form.dateSeance ? dateLongue(form.dateSeance) : ''].filter(Boolean).join(', ')}
      onClose={onClose}
      largeur={600}
      pied={(
        <>
          <button type="button" onClick={onClose} style={st.discret}>Fermer</button>
          <button type="button" onClick={enregistrer} disabled={enCours} style={{ ...st.principal, opacity: enCours ? 0.6 : 1 }}>
            <NotebookPen size={17} strokeWidth={1.8} aria-hidden="true" />
            {enCours ? 'Enregistrement…' : (reservation && !seance ? 'Enregistrer et terminer' : 'Enregistrer')}
          </button>
        </>
      )}
    >
      {client?.notesSante && (
        <div style={st.encartSante}>
          <HeartPulse size={18} strokeWidth={1.8} color="var(--spa-sakura)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <span><strong>Santé :</strong> {client.notesSante}</span>
        </div>
      )}
      <div style={st.grille2}>
        <Champ label="Soin effectué" htmlFor="seance-soin">
          <input id="seance-soin" style={st.champ} value={form.soin} onChange={(e) => set('soin', e.target.value)} autoComplete="off" />
        </Champ>
        <Champ label="Praticien" htmlFor="seance-praticien">
          <input id="seance-praticien" style={st.champ} value={form.praticien} onChange={(e) => set('praticien', e.target.value)} autoComplete="off" />
        </Champ>
        <Champ label="Date" htmlFor="seance-date">
          <input id="seance-date" type="date" style={st.champ} value={form.dateSeance} onChange={(e) => set('dateSeance', e.target.value)} />
        </Champ>
      </div>
      <Champ label="Observations" htmlFor="seance-obs">
        <textarea id="seance-obs" style={st.zone} value={form.observations} onChange={(e) => set('observations', e.target.value)} placeholder="Zones travaillées, tensions, état de la peau…" />
      </Champ>
      <div style={st.grille2}>
        <Champ label="Produits utilisés" htmlFor="seance-produits">
          <textarea id="seance-produits" style={st.zone} value={form.produits} onChange={(e) => set('produits', e.target.value)} placeholder="Huiles, masques, soins…" />
        </Champ>
        <Champ label="Ressenti du client" htmlFor="seance-ressenti">
          <textarea id="seance-ressenti" style={st.zone} value={form.ressenti} onChange={(e) => set('ressenti', e.target.value)} placeholder="Ce qu'il ou elle a dit" />
        </Champ>
      </div>
      <Champ label="Conseils et recommandations" htmlFor="seance-reco">
        <textarea id="seance-reco" style={st.zone} value={form.recommandations} onChange={(e) => set('recommandations', e.target.value)} placeholder="Conseils donnés, soin suivant à proposer…" />
      </Champ>

      <div>
        <span style={st.label}>Prochaine venue conseillée</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {RAPPELS.map(({ jours, label }) => {
            const cible = decalerJour(form.dateSeance || zurichToday(), jours);
            const actif = form.prochaineSeance === cible;
            return (
              <button key={jours} type="button" aria-pressed={actif} onClick={() => set('prochaineSeance', actif ? '' : cible)} style={{ ...st.choix, minHeight: 38, ...(actif ? st.choixActif : null) }}>
                {label}
              </button>
            );
          })}
          <input
            type="date"
            aria-label="Date de la prochaine venue"
            min={form.dateSeance || undefined}
            style={{ ...st.champ, width: 'auto', minHeight: 38, borderRadius: 999 }}
            value={form.prochaineSeance}
            onChange={(e) => set('prochaineSeance', e.target.value)}
          />
        </div>
        <div style={st.aide}>
          {form.prochaineSeance ? `Rappelée sur la fiche du client : ${dateLongue(form.prochaineSeance)}.` : 'Facultatif. Rappelée sur la fiche du client.'}
        </div>
      </div>
    </Modale>
  );
}
