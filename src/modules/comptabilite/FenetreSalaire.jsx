import React from 'react';
import { Fenetre, Options, st as fs } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { cloreSalaire, enregistrerSalaire } from './comptaService.js';
import { ajouterJours } from './periodesCompta.js';
import { lireMontant } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Fenêtre « Salaire de <nom> » : le salaire brut d'une personne, tel que sur
// son contrat, pour estimer le coût du personnel (D14). Jamais une fiche de
// salaire. Consultant et patron seulement, comme en base.
//
// Trois usages :
//   - saisir un premier salaire (ou un nouveau après un salaire arrêté) ;
//   - modifier le salaire enregistré (une erreur de saisie) ;
//   - changer de salaire dès une date : l'ancien s'arrête la veille et reste
//     compté pour les mois passés (une seule ligne ouverte par personne en
//     base). Si la nouvelle ligne est refusée, l'ancienne est rouverte.
// ─────────────────────────────────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const texteDe = (v) => (v == null ? '' : String(v));

export default function FenetreSalaire({ etabId, personne, mode, salaire, debutPropose, onClose, onEnregistre }) {
  // mode : 'nouveau' | 'modifier' | 'changer' ; salaire : celui à modifier ou à remplacer.
  const [f, setF] = React.useState(() => (mode === 'modifier' && salaire
    ? { mode: salaire.mode, montant: texteDe(salaire.montant), treizieme: salaire.treizieme !== false, debut: salaire.debut, fin: salaire.fin || '', note: salaire.note || '' }
    : { mode: salaire?.mode || 'mensuel', montant: '', treizieme: salaire ? salaire.treizieme !== false : true, debut: debutPropose || '', fin: '', note: '' }));
  const [enCours, setEnCours] = React.useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  const montant = lireMontant(f.montant);
  const apresAncien = mode !== 'changer' || (salaire && f.debut > salaire.debut);
  const valide = Number.isFinite(montant) && montant > 0 && montant < 1000000
    && ISO.test(f.debut || '') && (!f.fin || f.fin >= f.debut) && apresAncien;

  async function enregistrer() {
    if (!valide || enCours) return;
    setEnCours(true);
    try {
      const nouveau = { mode: f.mode, montant, treizieme: f.mode === 'mensuel' && f.treizieme, debut: f.debut, fin: f.fin || null, note: f.note };
      let error = null;
      if (mode === 'modifier') {
        ({ error } = await enregistrerSalaire(etabId, { ...nouveau, id: salaire.id }));
      } else if (mode === 'changer') {
        ({ error } = await cloreSalaire(salaire.id, ajouterJours(f.debut, -1)));
        if (!error) {
          ({ error } = await enregistrerSalaire(etabId, { ...nouveau, profileId: personne.userId }));
          // Nouvelle ligne refusée : l'ancien salaire reste ouvert, comme avant.
          if (error) await cloreSalaire(salaire.id, salaire.fin || null);
        }
      } else {
        ({ error } = await enregistrerSalaire(etabId, { ...nouveau, profileId: personne.userId }));
      }
      if (error) { notify(error, 'error'); return; }
      notify('Salaire enregistré.', 'success');
      onEnregistre?.();
      onClose();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Fenetre
      id="compta-salaire"
      titre={<><span>Salaire de</span> <span data-no-translate>{personne.nom}</span></>}
      sousTitre={mode === 'changer' ? 'Le salaire actuel s\'arrête la veille du nouveau ; il reste compté pour les mois passés.' : null}
      onClose={onClose}
      largeur={500}
      pied={(
        <>
          <button type="button" style={fs.secondaire} onClick={onClose} disabled={enCours}>Annuler</button>
          <button type="button" style={{ ...fs.primaire, opacity: valide && !enCours ? 1 : 0.5 }} onClick={enregistrer} disabled={!valide || enCours}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      )}
    >
      <Options
        nom="Type de salaire"
        valeur={f.mode}
        onChange={v => set('mode', v)}
        options={[
          { v: 'mensuel', label: 'Salaire mensuel' },
          { v: 'horaire', label: 'Salaire horaire' },
        ]}
      />
      <div style={st.bloc}>
        <label htmlFor="compta-salaire-montant" style={fs.label}>Montant brut (CHF)</label>
        <input id="compta-salaire-montant" style={{ ...fs.champ, fontFamily: 'var(--font-num)' }} inputMode="decimal" autoComplete="off" value={f.montant} onChange={e => set('montant', e.target.value)} />
        <span style={fs.remarque}>Salaire brut, tel que sur le contrat. Pour un salaire horaire : vacances et jours fériés compris.</span>
      </div>
      {f.mode === 'mensuel' && (
        <label style={st.case}>
          <span style={st.caseCible}>
            <input type="checkbox" checked={f.treizieme} onChange={e => set('treizieme', e.target.checked)} style={st.caseInput} />
          </span>
          <span style={{ fontSize: 14, color: 'var(--text)' }}>13e salaire</span>
        </label>
      )}
      <div style={st.grille}>
        <div style={st.bloc}>
          <label htmlFor="compta-salaire-debut" style={fs.label}>Depuis le</label>
          <input id="compta-salaire-debut" type="date" style={fs.champ} value={f.debut} min={mode === 'changer' && salaire ? ajouterJours(salaire.debut, 1) : undefined} onChange={e => set('debut', e.target.value)} />
        </div>
        <div style={st.bloc}>
          <label htmlFor="compta-salaire-fin" style={fs.label}>Jusqu'au (facultatif)</label>
          <input id="compta-salaire-fin" type="date" style={fs.champ} value={f.fin} min={f.debut || undefined} onChange={e => set('fin', e.target.value)} />
        </div>
      </div>
      <div style={st.bloc}>
        <label htmlFor="compta-salaire-note" style={fs.label}>Note</label>
        <input id="compta-salaire-note" style={fs.champ} value={f.note} onChange={e => set('note', e.target.value)} />
      </div>
      {!valide && f.montant !== '' && (
        <div style={{ ...fs.remarque, color: 'var(--danger-text)' }}>
          {apresAncien
            ? 'Un montant positif et une date de début ; la fin après le début.'
            : 'Le nouveau salaire commence après le début du salaire actuel.'}
        </div>
      )}
    </Fenetre>
  );
}

const st = {
  bloc: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  // Plancher de 200 px : un champ date natif iOS ne se rétrécit pas.
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 },
  // Case enveloppée dans une cible de 44 x 44 : une case nue de 18 px se rate au doigt.
  case: { display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', minHeight: 44, alignSelf: 'flex-start' },
  caseCible: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0 },
  caseInput: { width: 20, height: 20, margin: 0, accentColor: 'var(--accent)', cursor: 'pointer' },
};
