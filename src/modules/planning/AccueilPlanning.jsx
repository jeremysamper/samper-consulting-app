import React from 'react';
import { CalendarClock, CalendarDays, LogIn, LogOut, Settings2, Users } from 'lucide-react';
import { Choix, Fenetre } from '../../components/ui/Fenetres.jsx';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import PastillePoints, { porteurPoints } from '../points/PastillePoints.jsx';
import { usePastillesPoints } from '../points/IndicateursPoints.jsx';
import ReperesPlanning, { CartePlanningEquipe } from './ReperesPlanning.jsx';
import { Panneau } from '../../components/ui/index.jsx';
import ATraiter from './ATraiter.jsx';

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
//
// Direction Galet : repères et carte de l'équipe du jour autour des tuiles
// (ReperesPlanning.jsx, planning.css). etats, heures et absents viennent des
// horaires et des absences que Planning.jsx a déjà chargés.
//
// « À traiter » (lot L5, ATraiter.jsx) : demandes de congé et échanges repris,
// pour qui gère le planning, au-dessus des tuiles.
// ─────────────────────────────────────────────────────────────────────────────

const jourCH = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

function etatDuJour(jour) {
  if (jour.enCours) return <>pointage en cours</>;
  if (jour.action === 'arrivee') return <>prévu à <span>{jour.shift.debut}</span></>;
  if (jour.action === 'depart') return <>en poste depuis <span>{jour.shift.pointageDebut}</span></>;
  if (jour.termine) return <>journée pointée, <span>{jour.duree}</span></>;
  return <>hors planning, ajouté au planning à votre nom</>;
}

export default function AccueilPlanning({ jour, prochain, equipe, semaine, etats, heures, absents, canWrite, gerer, onPointer, onHoraires, onEquipe, onPlanning, sansEquipe = false, aValider = [], shifts = [], nomDe = () => '', onDecider = null, demandes = [], absences = [], onDeciderDemande = null }) {
  const [gererOuvert, setGererOuvert] = React.useState(false);
  const fermer = React.useCallback(() => setGererOuvert(false), []);
  const choix = gerer.filter(Boolean);
  const pastilles = usePastillesPoints();

  const tuiles = [
    jour && {
      id: 'pointer', Icone: jour.action === 'depart' ? LogOut : LogIn, libelle: jour.action === 'depart' ? 'Je pars' : 'J\'arrive',
      onClick: onPointer, etat: etatDuJour(jour),
      pastille: jour.action === 'arrivee' ? <PastillePoints n={pastilles.pastillePointage(jour.shift)} /> : null,
    },
    jour && {
      id: 'horaires', Icone: CalendarClock, libelle: 'Mes horaires', onClick: onHoraires,
      etat: prochain ? <>prochain service : <span>{jourCH(prochain.date)}</span>, <span>{prochain.debut}</span></> : <>aucun service prévu</>,
    },
    {
      id: 'equipe', Icone: Users, libelle: 'L\'équipe aujourd\'hui', onClick: onEquipe,
      // Les chiffres du service sont sur la carte : la tuile mène à la liste.
      etat: equipe.total ? <>qui est là, qui a pointé</> : <>aucun horaire aujourd'hui</>,
    },
    {
      id: 'planning', Icone: CalendarDays, libelle: canWrite ? 'Faire le planning' : 'La semaine de l\'équipe', onClick: onPlanning,
      etat: semaine ? <><span>{semaine}</span> {semaine > 1 ? 'horaires cette semaine' : 'horaire cette semaine'}</> : <>aucun horaire cette semaine</>,
    },
    {
      id: 'gerer', Icone: Settings2, libelle: 'Gérer', onClick: () => setGererOuvert(true), visible: canWrite && choix.length > 0,
      etat: <>absences, export, réglages</>,
    },
  ];

  return (
    <>
      <div className="pl-page">
        {sansEquipe && (
          // Établissement neuf (lot A2) : sans équipe, « Faire le planning »
          // ouvre une grille vide. L'écran dit d'abord ce qui manque.
          <Panneau style={{ marginBottom: 24 }}>
            <p style={st.vide} data-planning-sans-equipe="">Votre équipe n'est pas encore dans l'app. Votre consultant crée le compte de chaque personne : envoyez-lui la liste, avec le rôle de chacun. Le planning se remplit ensuite ici.</p>
          </Panneau>
        )}
        {canWrite && (
          // Demandes de congé et échanges repris par un collègue (lots L5 et C2).
          <ATraiter
            demandes={demandes}
            echanges={aValider}
            absences={absences}
            shifts={shifts}
            nomDe={nomDe}
            onDeciderDemande={onDeciderDemande}
            onDeciderEchange={onDecider}
            style={{ marginBottom: 24 }}
          />
        )}
        <div className="pl-grille">
          <ReperesPlanning equipe={equipe} heures={heures} absents={absents} avecCarte={etats.total > 0} />
          <CartePlanningEquipe etats={etats} />
          <AccueilModule tuiles={tuiles} />
        </div>
      </div>
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
  vide: { margin: 0, fontSize: 'var(--t2)', lineHeight: 1.5, color: 'var(--text)' },
};
