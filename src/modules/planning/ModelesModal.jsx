import React from 'react';
import { Fenetre, st } from './planningUi.jsx';
import { MODELES_DEFAUT, TYPES_HORAIRE, formatDuree, heuresModele } from './planningModeles.js';
import { notifyLegacy } from '../../legacy/legacyApi.js';

// ─────────────────────────────────────────────────────────────────────────────
// Modèles d'horaires de l'établissement : nom, heures, pause, et un second
// créneau pour une coupure. Ce sont les choix proposés quand on touche une case
// du planning.
// ─────────────────────────────────────────────────────────────────────────────

const segmentVide = (typeShift = 'midi') => ({ typeShift, debut: '10:00', fin: '15:00', pause: 0 });
const copie = (liste) => liste.map(m => ({ nom: m.nom, segments: m.segments.map(s => ({ ...s })) }));

export default function ModelesModal({ modeles, personnalises, onEnregistrer, onClose }) {
  const [liste, setListe] = React.useState(() => copie(modeles));
  const [enCours, setEnCours] = React.useState(false);

  const maj = (i, patch) => setListe(l => l.map((m, k) => (k === i ? { ...m, ...patch } : m)));
  const majSegment = (i, j, patch) => setListe(l => l.map((m, k) => (k === i
    ? { ...m, segments: m.segments.map((s, n) => (n === j ? { ...s, ...patch } : s)) }
    : m)));

  const enregistrer = async (valeur) => {
    if (enCours) return;
    const invalide = valeur.find(m => m.segments.some(s => !s.debut || !s.fin || s.fin <= s.debut));
    if (invalide) { notifyLegacy(`« ${invalide.nom || 'Sans nom'} » : la fin doit suivre le début.`, 'warning'); return; }
    setEnCours(true);
    const { error } = await onEnregistrer(valeur);
    setEnCours(false);
    if (error) { notifyLegacy(error, 'error'); return; }
    notifyLegacy('Modèles d\'horaires enregistrés.', 'success');
    onClose();
  };

  return (
    <Fenetre
      id="planning-modeles"
      titre="Modèles d'horaires"
      sousTitre="Proposés quand on touche une case du planning."
      onClose={onClose}
      largeur={620}
      pied={(
        <>
          {personnalises && (
            <button type="button" style={{ ...st.secondaire, marginRight: 'auto' }} onClick={() => enregistrer([])} disabled={enCours}>
              Revenir aux modèles par défaut
            </button>
          )}
          <button type="button" style={st.secondaire} onClick={onClose} disabled={enCours}>Annuler</button>
          <button type="button" style={st.primaire} onClick={() => enregistrer(liste)} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      )}
    >
      {liste.map((m, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input aria-label="Nom du modèle" style={{ ...st.champ, fontWeight: 700 }} value={m.nom} onChange={e => maj(i, { nom: e.target.value })} placeholder="Nom (ex. Midi)" />
            <span style={{ ...st.remarque, whiteSpace: 'nowrap' }}>{formatDuree(heuresModele(m))}</span>
            <button type="button" style={{ ...st.secondaire, color: 'var(--danger-strong)' }} onClick={() => setListe(l => l.filter((_, k) => k !== i))} aria-label={`Retirer ${m.nom || 'ce modèle'}`}>Retirer</button>
          </div>
          {m.segments.map((s, j) => (
            <div key={j} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 110px', minWidth: 0 }}>
                <label style={st.label}>Type</label>
                <select style={{ ...st.champ, marginTop: 4 }} value={s.typeShift} onChange={e => majSegment(i, j, { typeShift: e.target.value })}>
                  {Object.entries(TYPES_HORAIRE).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 96px', minWidth: 0 }}>
                <label style={st.label}>Début</label>
                <input type="time" style={{ ...st.champ, marginTop: 4 }} value={s.debut} onChange={e => majSegment(i, j, { debut: e.target.value })} />
              </div>
              <div style={{ flex: '1 1 96px', minWidth: 0 }}>
                <label style={st.label}>Fin</label>
                <input type="time" style={{ ...st.champ, marginTop: 4 }} value={s.fin} onChange={e => majSegment(i, j, { fin: e.target.value })} />
              </div>
              <div style={{ flex: '1 1 80px', minWidth: 0 }}>
                <label style={st.label}>Pause (min)</label>
                <input type="number" min="0" step="5" style={{ ...st.champ, marginTop: 4 }} value={s.pause} onChange={e => majSegment(i, j, { pause: Number(e.target.value) })} />
              </div>
              {m.segments.length > 1 && (
                <button type="button" style={st.secondaire} onClick={() => maj(i, { segments: m.segments.filter((_, n) => n !== j) })}>Retirer ce créneau</button>
              )}
            </div>
          ))}
          {m.segments.length < 2 && (
            <button type="button" style={{ ...st.secondaire, alignSelf: 'flex-start' }} onClick={() => maj(i, { segments: [...m.segments, { ...segmentVide('soir'), debut: '17:00', fin: '23:00' }] })}>
              + Second créneau (coupure)
            </button>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={st.secondaire} onClick={() => setListe(l => [...l, { nom: '', segments: [segmentVide()] }])}>+ Nouveau modèle</button>
        {!personnalises && <span style={{ ...st.remarque, alignSelf: 'center' }}>Ce sont les modèles par défaut ({MODELES_DEFAUT.length}). Modifie-les pour cet établissement.</span>}
      </div>
    </Fenetre>
  );
}
