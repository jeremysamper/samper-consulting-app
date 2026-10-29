import React from 'react';
import { Fenetre, st } from './planningUi.jsx';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { contratDuJour } from './soldesHeures.js';

// ─────────────────────────────────────────────────────────────────────────────
// Contrats (Gérer > Contrats) : une ligne par personne de l'établissement,
// avec son taux, ses heures par semaine, ses vacances, son début et sa fin.
// Ils donnent les heures dues du solde du mois. Réservé à qui gère le Planning
// (la base refuse les autres). Chacun voit son propre solde dans Mes horaires.
// ─────────────────────────────────────────────────────────────────────────────

const dateCH = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
const nombre = (v) => String(v).replace('.', ',');

// Contrat affiché pour une personne : celui du jour, sinon le plus récent.
function contratDe(contrats, userId, aujourdhui) {
  const siens = contrats.filter(c => c.profileId === userId);
  return contratDuJour(siens, aujourdhui) || siens.sort((a, b) => b.debut.localeCompare(a.debut))[0] || null;
}

export default function ContratsModal({ personnes, contrats, status, enregistrer, aujourdhui, heuresDefaut, onClose }) {
  const [edition, setEdition] = React.useState(null); // { userId, form }
  const [enCours, setEnCours] = React.useState(false);

  const tries = React.useMemo(
    () => [...personnes].sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, 'fr')),
    [personnes],
  );

  const ouvrir = (userId, contrat) => setEdition({
    userId,
    form: contrat
      ? { ...contrat }
      : { profileId: userId, taux: 100, heuresSemaine: heuresDefaut, vacancesJours: 25, debut: `${aujourdhui.slice(0, 7)}-01`, fin: null, note: '' },
  });
  const set = (k, v) => setEdition(e => ({ ...e, form: { ...e.form, [k]: v } }));

  const f = edition?.form;
  const valide = f && Number(f.taux) > 0 && Number(f.taux) <= 100
    && Number(f.heuresSemaine) > 0 && Number(f.heuresSemaine) <= 60
    && Number(f.vacancesJours) >= 0 && f.debut && (!f.fin || f.fin >= f.debut);

  async function enregistrerEdition() {
    if (!valide || enCours) return;
    setEnCours(true);
    try {
      const { error } = await enregistrer(f);
      if (error) { notifyLegacy(error, 'error'); return; }
      notifyLegacy('Contrat enregistré.', 'success');
      setEdition(null);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Fenetre id="planning-contrats" titre="Contrats" onClose={onClose} largeur={560}>
      <div style={st.remarque}>
        Le taux et les heures par semaine donnent les heures dues de chaque mois. Congés, vacances, formations et jours fériés sont déduits ; une absence ne l'est pas.
      </div>

      {status === 'loading' && <div style={st.remarque}>Chargement…</div>}
      {status === 'error' && <div style={{ ...st.remarque, color: 'var(--danger-text)' }}>Contrats indisponibles pour l'instant. Nouvel essai en cours.</div>}
      {!tries.length && <div style={st.remarque}>Aucun équipier dans cet établissement.</div>}

      <div style={s.liste}>
        {tries.map((p) => {
          const c = contratDe(contrats, p.id, aujourdhui);
          const termine = c?.fin && c.fin < aujourdhui;
          const ouvert = edition?.userId === p.id;
          return (
            <div key={p.id} style={s.ligne} data-contrat={p.id}>
              <div style={s.entete}>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={s.nom} data-no-translate>{p.prenom} {p.nom}</div>
                  {c ? (
                    <div style={s.resume}>
                      <span><span>{nombre(c.taux)}</span> <span>%</span></span>
                      <span><span>{nombre(c.heuresSemaine)}</span> <span>h par semaine</span></span>
                      <span><span>{nombre(c.vacancesJours)}</span> <span>jours de vacances</span></span>
                      <span><span>Début</span> <span>{dateCH(c.debut)}</span></span>
                      {c.fin && <span><span>{termine ? 'Terminé le' : 'Fin'}</span> <span>{dateCH(c.fin)}</span></span>}
                    </div>
                  ) : (
                    <div style={s.resume}><span>Pas de contrat</span></div>
                  )}
                </div>
                {!ouvert && (
                  <div style={s.boutons}>
                    {c && <button type="button" style={st.secondaire} onClick={() => ouvrir(p.id, c)}>Modifier</button>}
                    {(!c || termine) && <button type="button" style={st.secondaire} onClick={() => ouvrir(p.id, null)}>{c ? 'Nouveau contrat' : 'Ajouter un contrat'}</button>}
                  </div>
                )}
              </div>

              {ouvert && (
                <div style={s.form}>
                  <div style={s.grille}>
                    <Champ id="contrat-taux" label="Taux (%)" type="number" min="1" max="100" step="5" value={f.taux} onChange={v => set('taux', v)} />
                    <Champ id="contrat-heures" label="Heures par semaine" type="number" min="1" max="60" step="0.5" value={f.heuresSemaine} onChange={v => set('heuresSemaine', v)} />
                    <Champ id="contrat-vacances" label="Vacances (jours par an)" type="number" min="0" step="1" value={f.vacancesJours} onChange={v => set('vacancesJours', v)} />
                    <Champ id="contrat-debut" label="Début" type="date" value={f.debut || ''} onChange={v => set('debut', v)} />
                    <Champ id="contrat-fin" label="Fin (si connue)" type="date" value={f.fin || ''} onChange={v => set('fin', v || null)} />
                  </div>
                  <Champ id="contrat-note" label="Note (visible par la personne)" value={f.note || ''} onChange={v => set('note', v)} />
                  {!valide && <div style={{ ...st.remarque, color: 'var(--danger-text)' }}>Taux entre 1 et 100, heures par semaine entre 1 et 60, fin après le début.</div>}
                  <div style={s.boutons}>
                    <button type="button" style={st.secondaire} onClick={() => setEdition(null)} disabled={enCours}>Annuler</button>
                    <button type="button" style={{ ...st.primaire, opacity: valide && !enCours ? 1 : 0.5 }} onClick={enregistrerEdition} disabled={!valide || enCours}>
                      {enCours ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Fenetre>
  );
}

function Champ({ id, label, onChange, ...props }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={st.label} htmlFor={id}>{label}</label>
      <input id={id} style={{ ...st.champ, marginTop: 4 }} onChange={e => onChange(e.target.value)} {...props} />
    </div>
  );
}

const s = {
  liste: { display: 'flex', flexDirection: 'column', gap: 8 },
  ligne: { display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--bg)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)' },
  entete: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  nom: { fontSize: 14, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  resume: { display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 12, color: 'var(--text2)', marginTop: 2 },
  boutons: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  // Plancher de 200 px : un champ date natif iOS ne se rétrécit pas.
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 },
};
