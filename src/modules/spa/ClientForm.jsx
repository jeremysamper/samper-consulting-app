import { useState } from 'react';
import { HeartPulse, MailCheck } from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { Champ, Modale, age, st } from './spaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Création / modification d'une fiche client, en trois temps : qui, comment
// le joindre, ce qu'il faut savoir pour le soigner.
//
// L'accord e-mail est une carte à part, décochée par défaut : un client ne
// reçoit ni les nouvelles ni le bon d'anniversaire tant qu'il ne l'a pas
// accepté (nLPD / LCD). La base horodate l'accord et le retrait.
// ─────────────────────────────────────────────────────────────────────────────

const VIDE = {
  prenom: '', nom: '', email: '', telephone: '', dateNaissance: '', adresse: '',
  notesSante: '', preferences: '', notes: '', consentementMarketing: false,
};

const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function ClientForm({ client = null, initial = null, onSave, onClose }) {
  const [form, setForm] = useState(() => ({ ...VIDE, ...(initial || {}), ...(client || {}) }));
  const [enCours, setEnCours] = useState(false);
  const set = (cle, valeur) => setForm((p) => ({ ...p, [cle]: valeur }));
  const aujourdhui = zurichToday();
  const ageSaisi = age(form.dateNaissance, aujourdhui);

  async function enregistrer() {
    if (!form.prenom.trim() && !form.nom.trim()) { notify('Indique au moins le prénom ou le nom.', 'error'); return; }
    if (form.email.trim() && !EMAIL_OK.test(form.email.trim())) { notify("L'adresse e-mail n'est pas valide.", 'error'); return; }
    if (form.dateNaissance && form.dateNaissance > aujourdhui) { notify('La date de naissance est dans le futur.', 'error'); return; }
    if (form.consentementMarketing && !form.email.trim()) {
      notify('Sans adresse e-mail, le client ne pourra pas recevoir les nouvelles.', 'warning');
    }
    setEnCours(true);
    try {
      const { error, data } = await onSave(form);
      if (error) { notify(error, 'error'); return; }
      notify(client ? 'Fiche client mise à jour.' : 'Client ajouté.', 'success');
      onClose(data);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modale
      surTitre={client ? 'Modifier' : 'Nouveau client'}
      titre={client ? 'Fiche client' : 'Accueillir un client'}
      onClose={() => onClose(null)}
      largeur={620}
      pied={(
        <>
          <button type="button" onClick={() => onClose(null)} style={st.discret}>Fermer</button>
          <button type="button" onClick={enregistrer} disabled={enCours} style={{ ...st.principal, opacity: enCours ? 0.6 : 1 }}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      )}
    >
      <Bloc titre="Identité">
        <div style={st.grille2}>
          <Champ label="Prénom" htmlFor="spa-prenom">
            <input id="spa-prenom" style={st.champ} value={form.prenom} onChange={(e) => set('prenom', e.target.value)} autoComplete="off" />
          </Champ>
          <Champ label="Nom" htmlFor="spa-nom">
            <input id="spa-nom" style={st.champ} value={form.nom} onChange={(e) => set('nom', e.target.value)} autoComplete="off" />
          </Champ>
          <Champ
            label="Date de naissance"
            htmlFor="spa-naissance"
            aide={ageSaisi !== null ? `${ageSaisi} ans` : "Pour le bon cadeau d'anniversaire."}
          >
            <input id="spa-naissance" type="date" max={aujourdhui} style={st.champ} value={form.dateNaissance} onChange={(e) => set('dateNaissance', e.target.value)} />
          </Champ>
        </div>
      </Bloc>

      <Bloc titre="Contact">
        <div style={st.grille2}>
          <Champ label="Téléphone" htmlFor="spa-tel">
            <input id="spa-tel" type="tel" inputMode="tel" style={st.champ} value={form.telephone} onChange={(e) => set('telephone', e.target.value)} autoComplete="off" />
          </Champ>
          <Champ label="E-mail" htmlFor="spa-email">
            <input id="spa-email" type="email" inputMode="email" style={st.champ} value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />
          </Champ>
        </div>
        <div style={{ marginTop: 14 }}>
          <Champ label="Adresse" htmlFor="spa-adresse">
            <input id="spa-adresse" style={st.champ} value={form.adresse} onChange={(e) => set('adresse', e.target.value)} autoComplete="off" />
          </Champ>
        </div>
      </Bloc>

      <Bloc titre="Bien-être">
        <div style={{ ...st.encartSante, marginBottom: 12, fontSize: 13 }}>
          <HeartPulse size={17} strokeWidth={1.8} color="var(--spa-sakura)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>Données de santé : à noter avec l'accord du client. Elles ne sont visibles que par l'équipe du spa.</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Champ label="Santé : contre-indications, allergies" htmlFor="spa-sante">
            <textarea id="spa-sante" style={st.zone} value={form.notesSante} onChange={(e) => set('notesSante', e.target.value)} placeholder="Ex. allergie aux huiles de noix, grossesse, hypertension…" />
          </Champ>
          <Champ label="Préférences" htmlFor="spa-pref">
            <textarea id="spa-pref" style={st.zone} value={form.preferences} onChange={(e) => set('preferences', e.target.value)} placeholder="Pression, huiles, température, musique, praticien préféré…" />
          </Champ>
          <Champ label="Notes" htmlFor="spa-notes">
            <textarea id="spa-notes" style={{ ...st.zone, minHeight: 60 }} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Champ>
        </div>
      </Bloc>

      <label
        style={{
          ...st.caseLabel, padding: 16, borderRadius: 'var(--spa-r)',
          borderWidth: 1, borderStyle: 'solid',
          borderColor: form.consentementMarketing ? 'var(--spa-matcha)' : 'var(--spa-line)',
          background: form.consentementMarketing ? 'var(--spa-matcha-soft)' : 'var(--spa-surface2)',
        }}
      >
        <input
          type="checkbox"
          checked={form.consentementMarketing}
          onChange={(e) => set('consentementMarketing', e.target.checked)}
          style={st.case}
        />
        <span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            <MailCheck size={17} strokeWidth={1.8} aria-hidden="true" color="var(--spa-matcha)" />
            Le client accepte de recevoir nos e-mails
          </span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--spa-ink2)', marginTop: 4 }}>
            Nouvelles du spa et bon cadeau d'anniversaire. À cocher uniquement avec son accord ; il peut se désinscrire depuis chaque e-mail.
          </span>
        </span>
      </label>
    </Modale>
  );
}

function Bloc({ titre, children }) {
  return (
    <section>
      <h3 style={{ margin: '0 0 12px', fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 18, color: 'var(--spa-ink)' }}>{titre}</h3>
      {children}
    </section>
  );
}
