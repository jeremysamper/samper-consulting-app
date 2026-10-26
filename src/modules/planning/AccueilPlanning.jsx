import React from 'react';
import { CalendarClock, CalendarDays, LogIn, LogOut, Settings2, Users } from 'lucide-react';
import { Choix, Fenetre } from '../../components/ui/Fenetres.jsx';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil du module Planning : une tuile par tâche, sur la grille partagée
// AccueilModule. L'employé d'abord (pointer, ses horaires), puis l'équipe du
// jour et la semaine, « Gérer » en dernier. Une tuile hors droit n'est pas
// rendue.
//
// jour : null pour qui ne pointe pas ici (direction, compte de pointage
// partagé) ; sinon { action: 'arrivee' | 'depart' | 'horsPlanning', shift,
// termine, duree } (pointageDuJour.js). Nombres, heures et dates dans leurs
// propres nœuds : la phrase autour reste une entrée du glossaire.
// ─────────────────────────────────────────────────────────────────────────────

const jourCH = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

function etatDuJour(jour) {
  if (jour.enCours) return <>pointage en cours</>;
  if (jour.action === 'arrivee') return <>prévu à <span>{jour.shift.debut}</span></>;
  if (jour.action === 'depart') return <>en poste depuis <span>{jour.shift.pointageDebut}</span></>;
  if (jour.termine) return <>journée pointée, <span>{jour.duree}</span></>;
  return <>hors planning, ajouté au planning à votre nom</>;
}

export default function AccueilPlanning({ jour, prochain, equipe, semaine, canWrite, gerer, onPointer, onHoraires, onEquipe, onPlanning }) {
  const [gererOuvert, setGererOuvert] = React.useState(false);
  const fermer = React.useCallback(() => setGererOuvert(false), []);
  const choix = gerer.filter(Boolean);

  const tuiles = [
    jour && {
      id: 'pointer', Icone: jour.action === 'depart' ? LogOut : LogIn, libelle: jour.action === 'depart' ? 'Je pars' : 'J\'arrive',
      onClick: onPointer, etat: etatDuJour(jour),
    },
    jour && {
      id: 'horaires', Icone: CalendarClock, libelle: 'Mes horaires', onClick: onHoraires,
      etat: prochain ? <>prochain service : <span>{jourCH(prochain.date)}</span>, <span>{prochain.debut}</span></> : <>aucun service prévu</>,
    },
    {
      id: 'equipe', Icone: Users, libelle: 'L\'équipe aujourd\'hui', onClick: onEquipe,
      etat: equipe.total ? <><span>{equipe.pointes}</span> / <span>{equipe.total}</span> pointés</> : <>aucun horaire aujourd'hui</>,
    },
    {
      id: 'planning', Icone: CalendarDays, libelle: canWrite ? 'Faire le planning' : 'La semaine de l\'équipe', onClick: onPlanning,
      etat: semaine ? <><span>{semaine}</span> {semaine > 1 ? 'horaires cette semaine' : 'horaire cette semaine'}</> : <>aucun horaire cette semaine</>,
    },
    {
      id: 'gerer', Icone: Settings2, libelle: 'Gérer', onClick: () => setGererOuvert(true), visible: canWrite && choix.length > 0,
      etat: <>absences, modèles, groupes, export</>,
    },
  ];

  return (
    <>
      <AccueilModule tuiles={tuiles} />
      {gererOuvert && (
        <Fenetre id="planning-gerer-accueil" titre="Gérer le planning" onClose={fermer}>
          <div style={st.choix}>
            {choix.map(it => <Choix key={it.titre} {...it} onClick={() => { fermer(); it.onClick(); }} />)}
          </div>
        </Fenetre>
      )}
    </>
  );
}

const st = {
  choix: { display: 'flex', flexDirection: 'column', gap: 6 },
};
