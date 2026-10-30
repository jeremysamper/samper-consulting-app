import React from 'react';
import { Fenetre } from './planningUi.jsx';
import { pls } from './Planning.styles.js';
import { encadreStyle } from '../../components/ui/index.jsx';
import { planCopieVers, resumeDuplication } from './planningDuplication.js';
import { Resume } from './DupliquerModal.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// « Dupliquer vers… » (mode sélection) : les horaires cochés recopiés chez
// chaque personne et chaque jour choisis. Le plan vient de planCopieVers : un
// horaire qui chevauche la copie est remplacé, SAUF s'il est déjà pointé (la
// copie sur ce créneau est sautée), un jour d'absence est sauté, une case
// d'origine ne reçoit jamais sa propre copie. Le résumé avant validation dit
// ce qui sera créé, remplacé, gardé et sauté.
//
// Pendant l'écriture, « Annuler » devient « Fermer » et reste actif ; une
// écriture finie après fermeture affiche son issue sans piloter la fenêtre.
// ─────────────────────────────────────────────────────────────────────────────

export default function DupliquerVersModal({ sources, jours, employees, existants, estAbsent, etablissementId, onAppliquer, onFait, onClose }) {
  const ouvertRef = React.useRef(true);
  React.useEffect(() => { ouvertRef.current = true; return () => { ouvertRef.current = false; }; }, []);
  const [dates, setDates] = React.useState(() => new Set()); // l'utilisateur choisit les jours cibles
  const [userIds, setUserIds] = React.useState(() => new Set(sources.map(s => s.userId))); // employés d'origine pré-cochés
  const [enCours, setEnCours] = React.useState(false);

  const srcUserIds = new Set(sources.map(s => s.userId));
  const srcDates = new Set(sources.map(s => s.date));
  const plan = planCopieVers({ sources, userIds, dates, existants, estAbsent, etablissementId });
  const n = plan.aCreer.length;

  const basculer = (setter, valeur) => setter(prev => {
    const next = new Set(prev);
    if (next.has(valeur)) next.delete(valeur); else next.add(valeur);
    return next;
  });
  const toutesDates = jours.length > 0 && jours.every(d => dates.has(d.date));
  const tousEmployes = employees.length > 0 && employees.every(e => userIds.has(e.id));

  const valider = async () => {
    if (!n || enCours) return;
    setEnCours(true);
    try {
      await onAppliquer({ aCreer: plan.aCreer, aSupprimer: plan.aSupprimer });
      if (ouvertRef.current) onFait();
    } catch {
      // Message déjà affiché ; la fenêtre reste ouverte pour réessayer.
    } finally {
      if (ouvertRef.current) setEnCours(false);
    }
  };

  return (
    <Fenetre id="planning-dupliquer" titre="Dupliquer vers…" onClose={onClose} largeur={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Récapitulatif sélection */}
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>Horaires à dupliquer</div>
          <div style={{ fontSize: 13 }}>
            <strong>{sources.length}</strong> horaire{sources.length > 1 ? 's' : ''} sélectionné{sources.length > 1 ? 's' : ''}, copié{sources.length > 1 ? 's' : ''} pour chaque personne et chaque jour cochés ci-dessous
          </div>
        </div>

        {/* Sélection JOURS */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={pls.fieldLabel}>Jours cibles ({dates.size} sélectionnés)</label>
            <button
              style={{ ...pls.exportBtn, fontSize: 11, padding: '4px 8px' }}
              onClick={() => setDates(toutesDates ? new Set() : new Set(jours.map(d => d.date)))}
            >{toutesDates ? 'Tout désélectionner' : 'Tout sélectionner'}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
            {jours.map(d => {
              const checked = dates.has(d.date);
              return (
                <label
                  key={d.date}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 9px',
                    border: '1px solid transparent',
                    borderRadius: 6, fontSize: 11, cursor: 'pointer',
                    background: checked ? 'var(--accent-light)' : 'var(--surface)',
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => basculer(setDates, d.date)} />
                  <span style={{ flex: 1 }}>
                    {d.label}
                    {srcDates.has(d.date) && <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 4 }}>(origine)</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Sélection EMPLOYÉS */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={pls.fieldLabel}>Employés cibles ({userIds.size} sélectionnés)</label>
            <button
              style={{ ...pls.exportBtn, fontSize: 11, padding: '4px 8px' }}
              onClick={() => setUserIds(tousEmployes ? new Set() : new Set(employees.map(e => e.id)))}
            >{tousEmployes ? 'Tout désélectionner' : 'Tout sélectionner'}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {employees.map(emp => {
              const checked = userIds.has(emp.id);
              return (
                <label
                  key={emp.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                    border: '1px solid transparent',
                    borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    background: checked ? 'var(--accent-light)' : 'var(--surface)',
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => basculer(setUserIds, emp.id)} />
                  <div style={{ ...pls.empAvatar, background: 'var(--surface2)', color: 'var(--text2)', width: 22, height: 22, fontSize: 11 }}>{emp.avatar}</div>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {emp.prenom} {emp.nom}
                    {srcUserIds.has(emp.id) && <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 4 }}>(origine)</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Avertissement */}
        <div style={{ ...encadreStyle('alerte'), fontSize: 11 }}>
          Un horaire qui chevauche la copie est <strong>remplacé</strong>, sauf s'il est déjà pointé ; un horaire qui ne la chevauche pas (un midi quand on copie un soir) est gardé.
        </div>

        {/* Footer : ce qui sera créé, remplacé, gardé et sauté */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <span style={{ flex: '1 1 240px', minWidth: 0, fontSize: 12, color: n > 0 ? 'var(--text)' : 'var(--text2)' }} aria-live="polite">
            {n > 0
              ? <Resume parts={resumeDuplication(plan, { copies: ['horaire sera créé', 'horaires seront créés'] })} />
              : plan.pointesGardes > 0 || plan.joursAbsence > 0
                ? <>Aucun horaire à créer : <Resume parts={resumeDuplication(plan).slice(1)} /></>
                : 'Aucun horaire à créer'}
          </span>
          <button style={pls.exportBtn} onClick={onClose}>{enCours ? 'Fermer' : 'Annuler'}</button>
          <button
            style={{ ...pls.addBtn, opacity: n === 0 || enCours ? 0.5 : 1 }}
            onClick={valider}
            disabled={n === 0 || enCours}
          >
            {enCours ? 'Création…' : <>Dupliquer (<span>{n}</span>)</>}
          </button>
        </div>
      </div>
    </Fenetre>
  );
}
