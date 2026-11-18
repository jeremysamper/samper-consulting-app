import React from 'react';
import { st as fs } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { SEUIL_HAUSSE_DEFAUT } from './analysesAchats.js';
import { enregistrerSeuilHausse, lireSeuilHausse } from './haussesPrixDonnees.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Hausses de prix » de la page des réglages (Factures & achats) :
// le seuil d'alerte de l'établissement, en pour cent (compta_reglages,
// seuil_hausse_prix_pct, 5 par défaut, de 1 à 50 comme en base). Écriture :
// droit « Régler les factures », comme la garde du registre et la base.
// Après un enregistrement, le module resté monté relit (signal de changement).
// ─────────────────────────────────────────────────────────────────────────────

const lirePct = (t) => {
  const v = Number(String(t || '').trim().replace(',', '.').replace(/\s*%$/, ''));
  return Number.isFinite(v) ? v : null;
};

export default function SectionHaussesPrix({ user, etablissement, signaler }) {
  const etabId = etablissement?.id || null;
  const [lu, setLu] = React.useState(null); // null = chargement, 'erreur', ou le seuil
  const [saisie, setSaisie] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);

  React.useEffect(() => {
    let vivant = true;
    if (!etabId) return undefined;
    lireSeuilHausse(etabId)
      .then((v) => { if (vivant) { setLu(v); setSaisie(String(v).replace('.', ',')); } })
      .catch((err) => { console.error('[seuil hausses]', err); if (vivant) setLu('erreur'); });
    return () => { vivant = false; };
  }, [etabId]);

  if (!etabId) return null;
  if (lu === null) return <p style={st.attente}>Chargement…</p>;
  if (lu === 'erreur') return <p style={st.attente}>Le seuil n'a pas pu être lu. Réessayez dans un instant.</p>;

  const pct = lirePct(saisie);
  const valide = pct != null && pct >= 1 && pct <= 50;
  const change = valide && pct !== lu;

  async function enregistrer() {
    if (!change || enCours) return;
    setEnCours(true);
    try {
      await enregistrerSeuilHausse(etabId, pct, user?.id || null);
      setLu(pct);
      notify('Seuil enregistré.', 'success');
      signaler?.();
    } catch (err) {
      console.error('[seuil hausses]', err);
      notify("Le seuil n'a pas pu être enregistré. Réessayez dans un instant.", 'error');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div style={st.page}>
      <div style={st.bloc}>
        <label htmlFor="achats-seuil-hausse" style={fs.label}>Alerter dès une hausse de (%)</label>
        <input
          id="achats-seuil-hausse" style={{ ...fs.champ, maxWidth: 160 }} inputMode="decimal" autoComplete="off"
          value={saisie} onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') enregistrer(); }}
        />
        <span style={fs.remarque}>
          <span>Prix à l'unité (kilo, litre ou pièce) d'un article, comparé à son prix précédent chez le même fournisseur. Par défaut :</span>
          {' '}<span>{`${SEUIL_HAUSSE_DEFAUT} %`}</span><span>.</span>
        </span>
        {!valide && <span style={{ ...fs.remarque, color: 'var(--danger-text)' }}>Un seuil entre 1 et 50 %.</span>}
      </div>
      <div>
        <button type="button" style={{ ...fs.primaire, opacity: change && !enCours ? 1 : 0.5 }} onClick={enregistrer} disabled={!change || enCours}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

const st = {
  page: { display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 },
  bloc: { display: 'flex', flexDirection: 'column', gap: 4 },
  attente: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
};
