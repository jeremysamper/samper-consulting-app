import React from 'react';
import { Fenetre, Options, st } from './planningUi.jsx';
import { ajouterJours, chevauche } from './planningModeles.js';

// ─────────────────────────────────────────────────────────────────────────────
// Dupliquer : une seule fenêtre pour recopier une semaine, les horaires d'une
// personne ou une journée, avec l'aperçu de ce qui va se passer avant de
// valider.
//
// Règles tenues :
// - conflit = chevauchement horaire, jamais « même personne, même jour » : un
//   midi et un soir coexistent (service coupé) ;
// - un horaire déjà pointé n'est jamais effacé, et rien n'est posé par-dessus ;
// - une personne absente (congé, formation, absence) ce jour-là n'en reçoit pas ;
// - les pointages ne sont jamais recopiés.
// ─────────────────────────────────────────────────────────────────────────────

const jourCourt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(',', '');
const jourLong = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
const periode = (debut) => {
  const fin = ajouterJours(debut, 6);
  const a = new Date(debut + 'T12:00:00');
  const b = new Date(fin + 'T12:00:00');
  const moisA = a.toLocaleDateString('fr-CH', { month: 'long' });
  const moisB = b.toLocaleDateString('fr-CH', { month: 'long' });
  return moisA === moisB ? `du ${a.getDate()} au ${b.getDate()} ${moisB}` : `du ${a.getDate()} ${moisA} au ${b.getDate()} ${moisB}`;
};
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
const estPointe = (s) => !!(s.pointageDebut || s.pointageFin);

// Calcule le plan de duplication. Pur : testable et rejouable à chaque clic.
export function planDuplication({ sources, cibles, existants, remplacer, remplacementLarge, estAbsent, etablissementId }) {
  // cibles(source) → liste des dates où recopier cet horaire
  const aCreer = [];
  const aSupprimer = new Set();
  let ignoresOccupe = 0;
  let ignoresAbsence = 0;
  let pointesGardes = 0;

  // Remplacement large (semaine) : la semaine cible de chaque personne concernée
  // repart de zéro, sauf ce qui est déjà pointé.
  if (remplacer && remplacementLarge) {
    remplacementLarge.forEach(({ userId, dates }) => {
      existants.forEach(e => {
        if (e.userId !== userId || !dates.has(e.date)) return;
        if (estPointe(e)) pointesGardes += 1; else aSupprimer.add(e.id);
      });
    });
  }

  sources.forEach(src => {
    cibles(src).forEach(date => {
      if (estAbsent && estAbsent(src.userId, date)) { ignoresAbsence += 1; return; }
      const enPlace = existants.filter(e => e.userId === src.userId && e.date === date && !aSupprimer.has(e.id) && chevauche(e.debut, e.fin, src.debut, src.fin));
      if (enPlace.length) {
        const bloquants = enPlace.filter(e => !remplacer || estPointe(e));
        if (bloquants.length) { ignoresOccupe += 1; return; }
        enPlace.forEach(e => aSupprimer.add(e.id));
      }
      if (aCreer.some(c => c.userId === src.userId && c.date === date && chevauche(c.debut, c.fin, src.debut, src.fin))) { ignoresOccupe += 1; return; }
      aCreer.push({
        etablissementId,
        userId: src.userId,
        date,
        debut: src.debut,
        fin: src.fin,
        pause: src.pause || 0,
        poste: src.poste || '',
        typeShift: src.typeShift || 'simple',
        statut: 'confirmé',
        note: src.note || null,
        pointageDebut: null,
        pointageFin: null,
      });
    });
  });

  return { aCreer, aSupprimer: [...aSupprimer], ignoresOccupe, ignoresAbsence, pointesGardes };
}

export default function DupliquerModal({ semaine, existants, employees, nomDe, estAbsent, etablissementId, onDupliquer, onClose }) {
  const [quoi, setQuoi] = React.useState('semaine'); // semaine | reprendre | personne | jour
  const [personneId, setPersonneId] = React.useState(employees[0]?.id || '');
  const [jourSource, setJourSource] = React.useState(semaine);
  const [nbSemaines, setNbSemaines] = React.useState(1);
  const [joursCibles, setJoursCibles] = React.useState(new Set());
  const [remplacer, setRemplacer] = React.useState(false);
  const [enCours, setEnCours] = React.useState(false);

  const joursSemaine = React.useMemo(() => Array.from({ length: 7 }, (_, i) => ajouterJours(semaine, i)), [semaine]);
  const semainePrec = ajouterJours(semaine, -7);
  const dansSemaine = (date, debut) => date >= debut && date <= ajouterJours(debut, 6);

  // Sources et cibles selon le choix
  const plan = React.useMemo(() => {
    let sources = [];
    let cibles = () => [];
    let remplacementLarge = null;
    const offsets = quoi === 'reprendre' ? [7] : Array.from({ length: nbSemaines }, (_, i) => 7 * (i + 1));
    if (quoi === 'semaine' || quoi === 'personne' || quoi === 'reprendre') {
      const debutSource = quoi === 'reprendre' ? semainePrec : semaine;
      sources = existants.filter(s => dansSemaine(s.date, debutSource) && (quoi !== 'personne' || s.userId === personneId));
      cibles = (s) => offsets.map(o => ajouterJours(s.date, o));
      const personnes = [...new Set(sources.map(s => s.userId))];
      const datesCibles = new Set();
      offsets.forEach(o => { for (let i = 0; i < 7; i++) datesCibles.add(ajouterJours(debutSource, o + i)); });
      remplacementLarge = personnes.map(userId => ({ userId, dates: datesCibles }));
    } else if (quoi === 'jour') {
      sources = existants.filter(s => s.date === jourSource);
      const dates = [...joursCibles].filter(d => d !== jourSource);
      cibles = () => dates;
    }
    return { sources, ...planDuplication({ sources, cibles, existants, remplacer, remplacementLarge, estAbsent, etablissementId }) };
  }, [quoi, personneId, jourSource, nbSemaines, joursCibles, remplacer, existants, semaine, semainePrec, estAbsent, etablissementId]);

  const nbPersonnes = new Set(plan.aCreer.map(c => c.userId)).size;
  const nbJours = new Set(plan.aCreer.map(c => c.date)).size;

  const valider = async () => {
    if (!plan.aCreer.length || enCours) return;
    setEnCours(true);
    try {
      await onDupliquer({ aCreer: plan.aCreer, aSupprimer: plan.aSupprimer });
      onClose();
    } catch {
      // Message déjà affiché ; la fenêtre reste ouverte pour réessayer.
    } finally {
      setEnCours(false);
    }
  };

  // Jours proposés comme cibles d'une journée : les deux semaines qui suivent le jour source.
  const joursProposes = Array.from({ length: 14 }, (_, i) => ajouterJours(jourSource, i + 1));
  const basculerJour = (d) => setJoursCibles(prev => {
    const n = new Set(prev);
    if (n.has(d)) n.delete(d); else n.add(d);
    return n;
  });

  return (
    <Fenetre
      id="planning-dupliquer"
      titre="Dupliquer des horaires"
      sousTitre={`Semaine ${periode(semaine)}`}
      onClose={onClose}
      largeur={520}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose} disabled={enCours}>Annuler</button>
          <button type="button" style={{ ...st.primaire, opacity: plan.aCreer.length && !enCours ? 1 : 0.5 }} onClick={valider} disabled={!plan.aCreer.length || enCours}>
            {enCours ? 'Duplication…' : `Dupliquer${plan.aCreer.length ? ` (${plan.aCreer.length})` : ''}`}
          </button>
        </>
      )}
    >
      <div>
        <div style={st.label}>Quoi</div>
        <Options
          nom="dupliquer-quoi"
          valeur={quoi}
          onChange={setQuoi}
          options={[
            { v: 'semaine', label: 'Toute la semaine affichée', detail: 'Les horaires de toute l\'équipe.' },
            { v: 'reprendre', label: 'Reprendre la semaine précédente', detail: `La semaine ${periode(semainePrec)}, recopiée sur celle-ci.` },
            { v: 'personne', label: 'La semaine d\'une personne' },
            { v: 'jour', label: 'Une journée', detail: 'Les horaires de toute l\'équipe ce jour-là, vers d\'autres jours.' },
          ]}
        />
      </div>

      {quoi === 'personne' && (
        <div>
          <label style={st.label} htmlFor="dupliquer-personne">Personne</label>
          <select id="dupliquer-personne" style={{ ...st.champ, marginTop: 4 }} value={personneId} onChange={e => setPersonneId(e.target.value)}>
            {employees.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>
        </div>
      )}

      {quoi === 'jour' && (
        <>
          <div>
            <label style={st.label} htmlFor="dupliquer-jour">Journée à recopier</label>
            <select id="dupliquer-jour" style={{ ...st.champ, marginTop: 4 }} value={jourSource} onChange={e => { setJourSource(e.target.value); setJoursCibles(new Set()); }}>
              {joursSemaine.map(d => <option key={d} value={d}>{jourLong(d)}</option>)}
            </select>
          </div>
          <div>
            <div style={st.label}>Vers ces jours</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {joursProposes.map(d => {
                const actif = joursCibles.has(d);
                return (
                  <button key={d} type="button" onClick={() => basculerJour(d)} aria-pressed={actif}
                    style={{ padding: '8px 10px', minHeight: 40, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', borderWidth: 1, borderStyle: 'solid', borderColor: actif ? 'var(--accent)' : 'var(--border)', background: actif ? 'var(--accent)' : 'var(--surface)', color: actif ? 'var(--on-accent)' : 'var(--text)' }}>
                    {jourCourt(d)}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {(quoi === 'semaine' || quoi === 'personne') && (
        <div>
          <label style={st.label} htmlFor="dupliquer-nb">Vers</label>
          <select id="dupliquer-nb" style={{ ...st.champ, marginTop: 4 }} value={nbSemaines} onChange={e => setNbSemaines(Number(e.target.value))}>
            <option value={1}>La semaine suivante</option>
            {[2, 3, 4, 6, 8].map(n => <option key={n} value={n}>Les {n} semaines suivantes</option>)}
          </select>
        </div>
      )}

      <div>
        <div style={st.label}>Si quelqu'un a déjà un horaire</div>
        <Options
          nom="dupliquer-existants"
          valeur={remplacer ? 'remplacer' : 'garder'}
          onChange={v => setRemplacer(v === 'remplacer')}
          options={[
            { v: 'garder', label: 'Garder l\'existant', detail: 'Seuls les créneaux libres sont remplis.' },
            { v: 'remplacer', label: quoi === 'jour' ? 'Remplacer les créneaux qui se chevauchent' : 'Remplacer ses horaires de la semaine', detail: 'Les horaires déjà pointés restent en place.' },
          ]}
        />
      </div>

      <div style={st.apercu} aria-live="polite">
        {plan.sources.length === 0
          ? (quoi === 'reprendre' ? 'La semaine précédente est vide.' : 'Rien à dupliquer ici.')
          : plan.aCreer.length === 0
            ? (quoi === 'jour' && joursCibles.size === 0 ? 'Choisis au moins un jour.' : 'Tout est déjà en place, rien ne sera créé.')
            : <>
                <strong>{pluriel(plan.aCreer.length, 'horaire sera créé', 'horaires seront créés')}</strong>, pour {pluriel(nbPersonnes, 'personne', 'personnes')} sur {pluriel(nbJours, 'jour', 'jours')}.
                {plan.aSupprimer.length > 0 && <> {pluriel(plan.aSupprimer.length, 'horaire existant sera remplacé', 'horaires existants seront remplacés')}.</>}
              </>}
        {(plan.ignoresOccupe > 0 || plan.ignoresAbsence > 0 || plan.pointesGardes > 0) && (
          <div style={{ ...st.remarque, marginTop: 4 }}>
            {[
              plan.ignoresOccupe > 0 && `${pluriel(plan.ignoresOccupe, 'créneau déjà pris', 'créneaux déjà pris')}, laissé${plan.ignoresOccupe > 1 ? 's' : ''} tel${plan.ignoresOccupe > 1 ? 's' : ''} quel${plan.ignoresOccupe > 1 ? 's' : ''}`,
              plan.ignoresAbsence > 0 && `${pluriel(plan.ignoresAbsence, 'jour d\'absence', 'jours d\'absence')} sauté${plan.ignoresAbsence > 1 ? 's' : ''}`,
              plan.pointesGardes > 0 && `${pluriel(plan.pointesGardes, 'horaire déjà pointé gardé', 'horaires déjà pointés gardés')}`,
            ].filter(Boolean).join(', ')}.
          </div>
        )}
      </div>
    </Fenetre>
  );
}
