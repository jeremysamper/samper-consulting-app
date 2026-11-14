import React from 'react';
import { CalendarOff, Clock, UserCheck } from 'lucide-react';
import { Anneau, BoutonFleche, CarteAvant, CarteRepere, carteAvantStyles } from '../../components/ui/index.jsx';
import './planning.css';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil du Planning (direction Galet) : la rangée de repères et la carte de
// l'équipe du jour, posées par AccueilPlanning autour des tuiles. Rien n'est
// lu en plus : tout vient des horaires et des absences déjà chargés par
// Planning.jsx, sous les mêmes gardes que les tuiles.
//
//   repères      personnes pointées sur l'équipe du jour (le chiffre de la
//                tuile « L'équipe aujourd'hui ») ; heures prévues cette
//                semaine (heuresPrevues, accueilPlanning.js) ; absences du
//                jour et leurs noms (absencesDuJour, utils/absences.js)
//   carte nuit   l'équipe du jour par état de pointage, une tuile et un
//                anneau par état (equipeParEtat, accueilPlanning.js)
//
// La flèche de la carte ouvre « L'équipe aujourd'hui », comme sa tuile. Au
// téléphone (planning.css), le repère des personnes pointées n'est pas rendu :
// la carte le dit déjà. Sans horaire aujourd'hui, la carte n'est pas rendue.
// Nombres, durées et noms dans leurs propres nœuds : la phrase autour reste
// une entrée du glossaire. Crochets du banc : data-planning-reperes,
// data-repere, data-planning-carte, data-tuile-equipe.
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children }) => <span data-no-translate="">{children}</span>;

export default function ReperesPlanning({ equipe, heures, absents }) {
  return (
    <div className="pl-reperes" data-planning-reperes="">
      {equipe.total ? (
        <CarteRepere
          data-repere="pointes"
          Icone={UserCheck}
          valeur={equipe.pointes}
          libelle={<>{equipe.pointes > 1 ? 'pointés sur' : 'pointé sur'} <N>{equipe.total}</N></>}
          detail="aujourd'hui"
        />
      ) : (
        <CarteRepere data-repere="pointes" Icone={UserCheck} texte="aucun horaire aujourd'hui" />
      )}
      <CarteRepere
        data-repere="heures"
        Icone={Clock}
        valeur={heures}
        libelle="heures prévues cette semaine"
      />
      {absents.length ? (
        <CarteRepere
          data-repere="absences"
          Icone={CalendarOff}
          valeur={absents.length}
          libelle={absents.length > 1 ? 'absents aujourd\'hui' : 'absent aujourd\'hui'}
          detail={<N>{absents.join(', ')}</N>}
        />
      ) : (
        <CarteRepere data-repere="absences" Icone={CalendarOff} texte="Aucune absence aujourd'hui" />
      )}
    </div>
  );
}

const cs = carteAvantStyles('nuit');

const ETATS = [
  { id: 'en_poste', label: 'En poste', couleur: 'var(--carte-nuit-succes)' },
  { id: 'attendu', label: 'Attendu', couleur: 'var(--carte-nuit-info)' },
  { id: 'en_retard', label: 'Pas pointé', couleur: 'var(--carte-nuit-alerte)' },
  { id: 'termine', label: 'Terminé', couleur: 'var(--carte-nuit-doux)' },
];

export function CartePlanningEquipe({ etats, onOuvrir }) {
  if (!etats.total) return null;
  return (
    <CarteAvant ton="nuit" className="pl-carte-nuit" data-planning-carte="">
      <div style={st.tete}>
        <h2 style={{ ...cs.titre, ...st.titre }}>L&apos;équipe aujourd&apos;hui</h2>
        <BoutonFleche ton="nuit" onClick={onOuvrir} libelle="Ouvrir l'équipe du jour" />
      </div>
      <span style={st.total}>
        <span style={{ ...cs.chiffre, ...st.totalChiffre }} data-no-translate="">{etats.total}</span>
        <span style={cs.libelle}>{etats.total > 1 ? 'personnes au planning' : 'personne au planning'}</span>
      </span>
      <div className="pl-tuiles">
        {ETATS.map(e => (
          <div key={e.id} data-tuile-equipe={e.id} style={{ ...cs.tuile, ...st.tuile }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ ...cs.chiffre, ...st.tuileChiffre }} data-no-translate="">{etats[e.id]}</span>
              <span style={{ ...cs.libelle, ...st.tuileNom }}>{e.label}</span>
            </span>
            <Anneau part={etats.total ? etats[e.id] / etats.total : 0} couleur={e.couleur} piste="var(--carte-nuit)" />
          </div>
        ))}
      </div>
    </CarteAvant>
  );
}

const st = {
  tete: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  titre: { flex: '1 1 auto', margin: 0, fontSize: 'var(--t4)', lineHeight: 1.2 },
  total: { display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, marginTop: -6 },
  totalChiffre: { fontSize: 'var(--t5)' },
  tuile: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tuileChiffre: { display: 'block', fontSize: 'var(--t5)' },
  tuileNom: { display: 'block', marginTop: 4, fontSize: 'var(--t2)', color: 'var(--carte-nuit-texte)' },
};
