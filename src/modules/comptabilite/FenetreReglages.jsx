import React from 'react';
import { Fenetre, Options, st as fs } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import EtatAbsent from './EtatAbsent.jsx';
import { enregistrerReglages } from './comptaService.js';
import { lireMontant } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// « Réglages de la comptabilité » de l'établissement : méthode de TVA (D16),
// charges sociales de l'employeur et coût horaire moyen (D14). Aucun taux de
// la dette fiscale nette n'est écrit dans le code : le patron saisit le sien.
// Écriture : droit « Régler les factures », comme en base.
// ─────────────────────────────────────────────────────────────────────────────

const texteDe = (v) => (v == null ? '' : String(v));

export default function FenetreReglages({ etabId, userId, reglages, absente, onClose, onEnregistre }) {
  const [f, setF] = React.useState(() => ({
    methodeTva: reglages.methodeTva || 'effective',
    tauxTdfn: texteDe(reglages.tauxTdfn),
    chargesSocialesPct: texteDe(reglages.chargesSocialesPct ?? 16),
    coutHoraireMoyen: texteDe(reglages.coutHoraireMoyen),
  }));
  const [enCours, setEnCours] = React.useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  const tdfn = lireMontant(f.tauxTdfn);
  const charges = lireMontant(f.chargesSocialesPct);
  const cout = lireMontant(f.coutHoraireMoyen);
  const valide = (f.methodeTva !== 'tdfn' || (Number.isFinite(tdfn) && tdfn > 0 && tdfn < 100))
    && Number.isFinite(charges) && charges >= 0 && charges <= 50
    && (cout === null || (Number.isFinite(cout) && cout > 0 && cout < 1000));

  async function enregistrer() {
    if (!valide || enCours) return;
    setEnCours(true);
    try {
      const { error } = await enregistrerReglages(etabId, { methodeTva: f.methodeTva, tauxTdfn: tdfn, chargesSocialesPct: charges, coutHoraireMoyen: cout }, userId);
      if (error) { notify(error, 'error'); return; }
      notify('Réglages enregistrés.', 'success');
      onEnregistre?.();
      onClose();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Fenetre
      id="compta-reglages"
      titre="Réglages de la comptabilité"
      onClose={onClose}
      largeur={500}
      pied={absente ? null : (
        <>
          <button type="button" style={fs.secondaire} onClick={onClose} disabled={enCours}>Annuler</button>
          <button type="button" style={{ ...fs.primaire, opacity: valide && !enCours ? 1 : 0.5 }} onClick={enregistrer} disabled={!valide || enCours}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      )}
    >
      {absente ? <EtatAbsent /> : (
        <>
          <div style={st.bloc}>
            <span style={fs.label}>Méthode de TVA</span>
            <Options
              nom="Méthode de TVA"
              valeur={f.methodeTva}
              onChange={v => set('methodeTva', v)}
              options={[
                { v: 'effective', label: 'Effective : ventes moins achats, décompte par trimestre' },
                { v: 'tdfn', label: 'Taux de la dette fiscale nette : décompte par semestre' },
              ]}
            />
          </div>
          {f.methodeTva === 'tdfn' && (
            <div style={st.bloc}>
              <label htmlFor="compta-tdfn" style={fs.label}>Votre taux de la dette fiscale nette (%)</label>
              <input id="compta-tdfn" style={fs.champ} inputMode="decimal" autoComplete="off" value={f.tauxTdfn} onChange={e => set('tauxTdfn', e.target.value)} />
            </div>
          )}
          <div style={st.bloc}>
            <label htmlFor="compta-charges-sociales" style={fs.label}>Charges sociales de l'employeur (%)</label>
            <input id="compta-charges-sociales" style={fs.champ} inputMode="decimal" autoComplete="off" value={f.chargesSocialesPct} onChange={e => set('chargesSocialesPct', e.target.value)} />
            <span style={fs.remarque}>Estimation prudente ; votre fiduciaire connaît le taux exact.</span>
          </div>
          <div style={st.bloc}>
            <label htmlFor="compta-cout-horaire" style={fs.label}>Coût horaire moyen, charges comprises (CHF)</label>
            <input id="compta-cout-horaire" style={fs.champ} inputMode="decimal" autoComplete="off" value={f.coutHoraireMoyen} onChange={e => set('coutHoraireMoyen', e.target.value)} />
            <span style={fs.remarque}>Pour les heures des personnes sans salaire saisi.</span>
          </div>
          {!valide && (
            <div style={{ ...fs.remarque, color: 'var(--danger-text)' }}>
              Un taux de la dette fiscale nette entre 0 et 100, des charges sociales entre 0 et 50 %, un coût horaire positif.
            </div>
          )}
        </>
      )}
    </Fenetre>
  );
}

const st = {
  bloc: { display: 'flex', flexDirection: 'column', gap: 4 },
};
