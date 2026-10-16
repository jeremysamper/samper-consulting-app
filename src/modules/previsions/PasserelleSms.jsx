import { useId, useState } from 'react';
import { AlertCircle, MessageSquareText, Smartphone } from 'lucide-react';
import { notify } from '../../components/toast/index.js';
import { appelerMailer } from '../spa/spaData.js';
import { st } from '../spa/spaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// SMS de réservation, envoyés avec la carte SIM du restaurant (réglages du
// module Réservations, direction).
//
// Un téléphone Android reste au restaurant avec la SIM et l'appli libre
// « SMS Gateway for Android ». Le restaurant recopie ici l'identifiant et le
// mot de passe affichés par l'appli ; spa-mailer les essaie (sms_connexion)
// avant de les garder, chiffrés. Ensuite, chaque confirmation de réservation
// part aussi par SMS quand le client a laissé un portable. L'état vient de la
// réponse « etat » de spa-mailer, lue par BoiteEnvoiReservations.
// ─────────────────────────────────────────────────────────────────────────────

function dateCourte(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ts));
}

export default function PasserelleSms({ etablissementId, sms, onRecharger, consultant }) {
  const [form, setForm] = useState(null); // { identifiant, motDePasse } ; null = fermé
  const [essai, setEssai] = useState(null); // numéro saisi pour le SMS d'essai ; null = fermé
  const [enCours, setEnCours] = useState(null); // 'connexion' | 'essai' | 'deconnexion'
  const id = useId();

  async function relier(e) {
    e.preventDefault();
    if (!form || enCours) return;
    if (!form.identifiant.trim() || !form.motDePasse.trim()) {
      notify("Recopiez l'identifiant et le mot de passe affichés dans l'appli du téléphone.", 'warning');
      return;
    }
    setEnCours('connexion');
    try {
      const { data, error } = await appelerMailer('sms_connexion', {
        etablissementId, identifiant: form.identifiant.trim(), motDePasse: form.motDePasse.trim(),
      });
      if (error || !data?.ok) { notify(error || "Le téléphone n'a pas pu être relié. Réessayez.", 'error'); return; }
      setForm(null);
      notify(`Téléphone relié (${data.appareil}). Envoyez-vous un SMS d'essai pour vérifier.`, 'success');
      onRecharger();
    } finally {
      setEnCours(null);
    }
  }

  async function envoyerEssai(e) {
    e.preventDefault();
    if (enCours || !essai?.trim()) return;
    setEnCours('essai');
    try {
      const { data, error } = await appelerMailer('sms_test', { etablissementId, numero: essai.trim() });
      if (error || !data?.ok) { notify(error || "Le SMS d'essai n'a pas pu partir.", 'error'); onRecharger(); return; }
      setEssai(null);
      notify(`SMS d'essai envoyé au ${essai.trim()}. Il arrive dans la minute si le téléphone du restaurant est allumé.`, 'success');
      onRecharger();
    } finally {
      setEnCours(null);
    }
  }

  async function delier() {
    if (enCours) return;
    if (!window.confirm('Délier le téléphone du restaurant ?\n\nLes confirmations de réservation ne partiront plus par SMS.')) return;
    setEnCours('deconnexion');
    try {
      const { error } = await appelerMailer('sms_deconnexion', { etablissementId });
      if (error) { notify(error, 'error'); return; }
      notify('Téléphone délié : plus aucun SMS ne part.', 'success');
      setForm(null);
      setEssai(null);
      onRecharger();
    } finally {
      setEnCours(null);
    }
  }

  const formulaire = form && (
    <form onSubmit={relier} style={s.formulaire}>
      <ol style={s.etapes}>
        <li>Mettez la carte SIM du restaurant dans un téléphone Android (même ancien), branché au chargeur, qui reste au restaurant.</li>
        <li>Sur ce téléphone, ouvrez <span data-no-translate>sms-gate.app</span> et installez l'appli « <span data-no-translate>SMS Gateway for Android</span> » (acceptez l'installation si le téléphone la demande).</li>
        <li>Dans l'appli, activez « <span data-no-translate>Cloud server</span> », puis touchez « <span data-no-translate>Offline</span> » : il passe à « <span data-no-translate>Online</span> » et affiche un identifiant et un mot de passe.</li>
        <li>Recopiez-les ici, puis « Relier le téléphone ».</li>
      </ol>
      <div style={{ ...st.grille2, marginTop: 12 }}>
        <div>
          <label style={st.label} htmlFor={`${id}-identifiant`}>Identifiant (dans l'appli)</label>
          <input
            id={`${id}-identifiant`}
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={form.identifiant}
            onChange={(e) => setForm((p) => ({ ...p, identifiant: e.target.value }))}
            style={st.champ}
          />
        </div>
        <div>
          <label style={st.label} htmlFor={`${id}-mdp`}>Mot de passe (dans l'appli)</label>
          <input
            id={`${id}-mdp`}
            type="password"
            autoComplete="new-password"
            value={form.motDePasse}
            onChange={(e) => setForm((p) => ({ ...p, motDePasse: e.target.value }))}
            style={st.champ}
          />
        </div>
      </div>
      <div style={{ ...s.aide, marginTop: 8 }}>
        Dans les réglages Android, retirez l'appli de l'économie de batterie, pour que les SMS partent sans attendre que l'écran se rallume.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="submit" disabled={Boolean(enCours)} style={{ ...st.principal, opacity: enCours ? 0.55 : 1 }}>
          {enCours === 'connexion' ? 'Vérification…' : 'Relier le téléphone'}
        </button>
        <button type="button" onClick={() => setForm(null)} style={st.discret}>Annuler</button>
      </div>
    </form>
  );

  // ── Aucun téléphone relié ──
  if (!sms) {
    return (
      <div style={s.carte}>
        <span aria-hidden="true" style={{ ...s.icone, color: 'var(--spa-mizu)' }}><Smartphone size={20} strokeWidth={1.8} /></span>
        <div style={s.texte}>
          <div style={s.titre}>Prévenez aussi le client par SMS</div>
          <div style={{ ...s.aide, marginTop: 2 }}>
            Les SMS partent du numéro de la carte SIM du restaurant, depuis un téléphone Android qui reste sur place. Un SMS part quand vous acceptez ou refusez une demande en ligne, et quand l'équipe enregistre une réservation ou en change la date, l'heure ou les couverts, si le client a laissé un numéro de portable.
          </div>
          {formulaire || (
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => setForm({ identifiant: '', motDePasse: '' })} style={st.secondaire}>
                <Smartphone size={16} strokeWidth={1.8} aria-hidden="true" /> Relier le téléphone du restaurant
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Téléphone en erreur (identifiants changés, appli réinstallée) ──
  if (sms.statut === 'erreur') {
    return (
      <div style={{ ...s.carte, background: 'var(--spa-sakura-soft)', borderColor: 'transparent' }}>
        <span aria-hidden="true" style={{ ...s.icone, color: 'var(--spa-sakura)' }}><AlertCircle size={20} strokeWidth={1.8} /></span>
        <div style={s.texte}>
          <div style={s.titre}>Le téléphone n'accepte plus les SMS</div>
          <div style={s.aide}>
            L'identifiant ou le mot de passe de l'appli a changé (appli réinstallée ?). Recopiez ceux affichés dans l'appli. En attendant, aucun SMS ne part.
            {consultant && sms.derniereErreur && <span style={{ display: 'block', marginTop: 4 }}>Détail : {sms.derniereErreur}</span>}
          </div>
          {formulaire || (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" onClick={() => setForm({ identifiant: '', motDePasse: '' })} disabled={Boolean(enCours)} style={st.principal}>
                Recopier les identifiants
              </button>
              <button type="button" onClick={delier} disabled={Boolean(enCours)} style={st.discret}>Délier</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Téléphone relié ──
  return (
    <div style={{ ...s.carte, background: 'var(--spa-matcha-soft)', borderColor: 'transparent' }}>
      <span aria-hidden="true" style={{ ...s.icone, color: 'var(--spa-matcha)' }}><MessageSquareText size={20} strokeWidth={1.8} /></span>
      <div style={s.texte}>
        <div style={s.titre}>Les SMS partent du téléphone du restaurant</div>
        <div style={{ fontSize: 15, fontWeight: 500, overflowWrap: 'anywhere' }} data-no-translate>{sms.appareil || 'Téléphone Android'}</div>
        <div style={s.aide}>
          Relié le {dateCourte(sms.connecteAt)}.{sms.dernierEnvoiAt ? ` Dernier SMS le ${dateCourte(sms.dernierEnvoiAt)}.` : ''} Gardez-le allumé, branché et connecté (wifi ou données mobiles).
          {consultant && sms.derniereErreur && <span style={{ display: 'block', marginTop: 4 }}>Dernier problème : {sms.derniereErreur}</span>}
        </div>
        {essai !== null ? (
          <form onSubmit={envoyerEssai} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <label style={st.label} htmlFor={`${id}-essai`}>Votre numéro de portable</label>
              <input
                id={`${id}-essai`}
                type="tel"
                autoComplete="off"
                value={essai}
                onChange={(e) => setEssai(e.target.value)}
                placeholder="079 123 45 67"
                style={st.champ}
              />
            </div>
            <button type="submit" disabled={Boolean(enCours) || !essai.trim()} style={{ ...st.principal, opacity: enCours || !essai.trim() ? 0.55 : 1 }}>
              {enCours === 'essai' ? 'Envoi…' : 'Envoyer'}
            </button>
            <button type="button" onClick={() => setEssai(null)} style={st.discret}>Annuler</button>
          </form>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" onClick={() => setEssai('')} disabled={Boolean(enCours)} style={st.secondaire}>Envoyer un SMS d'essai</button>
            <button type="button" onClick={delier} disabled={Boolean(enCours)} style={st.danger}>
              {enCours === 'deconnexion' ? 'Un instant…' : 'Délier'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Mêmes mesures que la boîte d'envoi (BoiteEnvoi.jsx), juste au-dessus.
const s = {
  carte: {
    display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 14,
    padding: '16px 18px', borderRadius: 'var(--spa-r)', background: 'var(--spa-surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spa-line)', boxShadow: 'var(--spa-shadow)',
  },
  icone: {
    width: 42, height: 42, borderRadius: 21, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--spa-surface)',
  },
  texte: { flex: '1 1 260px', minWidth: 0 },
  titre: { fontFamily: 'var(--font-serif)', fontSize: 19, lineHeight: 1.25, marginBottom: 2 },
  aide: { fontSize: 13, color: 'var(--spa-ink2)', lineHeight: 1.5, marginTop: 4 },
  etapes: { margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7, color: 'var(--spa-ink)' },
  formulaire: {
    marginTop: 14, padding: '14px 16px', borderRadius: 'var(--spa-r-sm)', background: 'var(--spa-surface2)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--spa-line)',
  },
};
