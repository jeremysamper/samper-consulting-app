import React from 'react';
import { Fenetre, Choix, st } from './planningUi.jsx';
import { chevauche, formatDuree, heuresModele, libelleModele, libelleSegment, typeHoraire } from './planningModeles.js';

// ─────────────────────────────────────────────────────────────────────────────
// Saisie en un geste : on touche une case, on choisit un modèle, l'horaire est
// posé. Sans personne connue (ajout depuis la vue du jour sur téléphone), on la
// choisit d'abord. « Autre horaire » ouvre le formulaire complet.
// ─────────────────────────────────────────────────────────────────────────────

const dateLongue = (iso) => {
  const s = new Date(iso + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function SaisieRapide({ date, userId: userIdInitial = '', employees, nomDe, modeles, existants, onPoser, onAutre, onClose }) {
  const [userId, setUserId] = React.useState(userIdInitial);
  const [enCours, setEnCours] = React.useState(false);
  const duJour = existants
    .filter(s => s.userId === userId && s.date === date)
    .sort((a, b) => (a.debut || '').localeCompare(b.debut || ''));

  const poser = async (modele) => {
    if (!userId || enCours) return;
    setEnCours(true);
    try {
      await onPoser(modele, userId, date);
      onClose();
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Fenetre
      id="planning-saisie-rapide"
      titre={dateLongue(date)}
      sousTitre={userIdInitial ? nomDe(userIdInitial) : 'Choisis la personne, puis l\'horaire'}
      onClose={onClose}
    >
      {!userIdInitial && (
        <div>
          <label style={st.label} htmlFor="saisie-rapide-personne">Personne</label>
          <select id="saisie-rapide-personne" style={{ ...st.champ, marginTop: 4 }} value={userId} onChange={e => setUserId(e.target.value)}>
            <option value="">Choisir…</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}
          </select>
        </div>
      )}

      {duJour.length > 0 && (
        <div style={st.remarque}>
          Déjà prévu ce jour : {duJour.map(s => `${typeHoraire(s.typeShift).label.toLowerCase()} ${libelleSegment(s)}`).join(', ')}.
        </div>
      )}

      <div style={st.section}>
        {modeles.map(m => {
          const libres = (m.segments || []).filter(s => !duJour.some(e => chevauche(e.debut, e.fin, s.debut, s.fin)));
          const occupe = libres.length === 0;
          const partiel = !occupe && libres.length < (m.segments || []).length;
          return (
            <Choix
              key={m.id}
              titre={m.nom}
              detail={occupe
                ? 'Ce créneau est déjà occupé.'
                : `${libelleModele(m)}, ${formatDuree(heuresModele(m))}${partiel ? ' (seule la partie libre sera posée)' : ''}`}
              disabled={!userId || occupe || enCours}
              onClick={() => poser(m)}
            />
          );
        })}
        <Choix
          titre="Autre horaire"
          detail="Heures, pause et poste au choix."
          disabled={!userId}
          onClick={() => { onClose(); onAutre(userId, date); }}
        />
      </div>
    </Fenetre>
  );
}
