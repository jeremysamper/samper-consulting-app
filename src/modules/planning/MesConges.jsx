import React from 'react';
import { Btn, Panneau, ligneStyle } from '../../components/ui/index.jsx';
import { Fenetre, st as stF } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { confirmLegacy } from '../../legacy/legacyApi.js';
import { metaMotif, periodeAbsence } from '../../utils/absences.js';
import { LIBELLE_STATUT, MOTIFS_DEMANDE, mesDemandes, verifierDemande } from './demandesConge.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mes congés (lot L5), dans Mon planning : l'employé demande un congé et suit
// ses demandes. La demande part en 'demande' ; qui gère le planning l'accepte
// ou la refuse (« À traiter »). Tant qu'elle attend, la personne peut la
// retirer. Les gardes vivent en base (RLS) ; verifierDemande dit tôt ce que la
// base refuserait.
//
// lignes : ce que la RLS rend de la table absences (absences acceptées de
// l'établissement, demandes et refus de la personne) ; seules les siennes
// sont montrées.
// ─────────────────────────────────────────────────────────────────────────────

const TEINTE_STATUT = {
  demande: 'var(--warning-text)',
  acceptee: 'var(--success-text)',
  refusee: 'var(--danger-text)',
};

function FenetreDemande({ userId, aujourdhui, lignes, onDemander, onClose }) {
  const [form, setForm] = React.useState({ motif: 'conge', dateDebut: aujourdhui, dateFin: aujourdhui });
  const [enCours, setEnCours] = React.useState(false);
  const set = (cle, valeur) => setForm((f) => {
    const suivant = { ...f, [cle]: valeur };
    // Un début posé après la fin entraîne la fin avec lui.
    if (cle === 'dateDebut' && suivant.dateFin < valeur) suivant.dateFin = valeur;
    return suivant;
  });

  async function envoyer(e) {
    e.preventDefault();
    const erreur = verifierDemande({ ...form, aujourdhui, userId, lignes });
    if (erreur) { notify(erreur, 'error'); return; }
    setEnCours(true);
    try {
      const { error } = await onDemander({ userId, ...form });
      if (error) { notify(error, 'error'); return; }
      notify('Demande envoyée. La personne qui gère le planning va répondre.', 'success');
      onClose();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Fenetre
      id="planning-demande-conge"
      titre="Demander un congé"
      sousTitre="La personne qui gère le planning accepte ou refuse votre demande."
      onClose={onClose}
      pied={(
        <>
          <button type="button" style={stF.secondaire} onClick={onClose}>Annuler</button>
          <button type="submit" form="form-demande-conge" disabled={enCours} style={{ ...stF.primaire, opacity: enCours ? 0.65 : 1 }}>
            {enCours ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </>
      )}
    >
      <form id="form-demande-conge" onSubmit={envoyer} style={st.form}>
        <div style={stF.section}>
          <span style={stF.label}>Motif</span>
          <div style={st.motifs} role="radiogroup" aria-label="Motif">
            {MOTIFS_DEMANDE.map((id) => {
              const actif = form.motif === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={actif}
                  onClick={() => set('motif', id)}
                  style={{ ...st.motif, ...(actif ? st.motifActif : null) }}
                >
                  {metaMotif(id).label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={st.dates}>
          <div style={stF.section}>
            <label style={stF.label} htmlFor="demande-du">Du</label>
            <input id="demande-du" type="date" style={stF.champ} value={form.dateDebut} min={aujourdhui} onChange={(e) => set('dateDebut', e.target.value)} />
          </div>
          <div style={stF.section}>
            <label style={stF.label} htmlFor="demande-au">Au (inclus)</label>
            <input id="demande-au" type="date" style={stF.champ} value={form.dateFin} min={form.dateDebut} onChange={(e) => set('dateFin', e.target.value)} />
          </div>
        </div>
      </form>
    </Fenetre>
  );
}

export default function MesConges({ userId, aujourdhui, lignes = [], onDemander, onRetirer }) {
  const [ouvert, setOuvert] = React.useState(false);
  const [retrait, setRetrait] = React.useState(null);
  const fermer = React.useCallback(() => setOuvert(false), []);
  const miennes = mesDemandes({ lignes, userId, aujourdhui });

  async function retirer(a) {
    if (!confirmLegacy(`Retirer votre demande (${metaMotif(a.motif).label.toLowerCase()}, ${periodeAbsence(a)}) ?`)) return;
    setRetrait(a.id);
    try {
      const { error } = await onRetirer(a.id);
      notify(error || 'Demande retirée.', error ? 'error' : 'success');
    } finally {
      setRetrait(null);
    }
  }

  return (
    <section data-mes-conges="">
      <Panneau style={st.carte}>
        <div style={st.entete}>
          <div style={st.titre}>Mes congés</div>
          <Btn onClick={() => setOuvert(true)} style={st.demander}>Demander un congé</Btn>
        </div>
        {miennes.length === 0 ? (
          <div style={st.vide}>Aucune demande en cours.</div>
        ) : (
          <div className="pl-liste-conges">
            {miennes.map((a) => (
              <div key={a.id} style={st.ligne} data-ma-demande={a.statut}>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={st.motifLigne}>{metaMotif(a.motif).label}</span>
                  <span style={st.periode}>{periodeAbsence(a)}</span>
                </span>
                <span style={st.statut}>
                  <span aria-hidden="true" style={{ ...st.point, background: TEINTE_STATUT[a.statut] }} />
                  <span>{LIBELLE_STATUT[a.statut]}</span>
                </span>
                {a.statut === 'demande' && (
                  <Btn small disabled={retrait === a.id} onClick={() => retirer(a)}>Retirer</Btn>
                )}
              </div>
            ))}
          </div>
        )}
      </Panneau>
      {ouvert && (
        <FenetreDemande userId={userId} aujourdhui={aujourdhui} lignes={lignes} onDemander={onDemander} onClose={fermer} />
      )}
    </section>
  );
}

const st = {
  carte: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  entete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  titre: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  demander: { minHeight: 40, fontSize: 'var(--t2)' },
  vide: { fontSize: 'var(--t2)', color: 'var(--text2)' },
  ligne: { ...ligneStyle(), gap: 10, flexWrap: 'wrap', padding: '6px 0' },
  motifLigne: { display: 'block', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)' },
  periode: { display: 'block', fontSize: 'var(--t1)', color: 'var(--text2)' },
  statut: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text)', flexShrink: 0 },
  point: { width: 8, height: 8, borderRadius: 'var(--r-full)', flexShrink: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  motifs: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  motif: {
    minHeight: 40, padding: '8px 16px', borderRadius: 'var(--r-full)', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)',
    background: 'var(--btn-fond)', color: 'var(--btn-texte)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)',
  },
  motifActif: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' },
  dates: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 },
};
