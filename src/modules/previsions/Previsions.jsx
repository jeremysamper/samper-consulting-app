import { useEffect, useState } from 'react';
import { Btn } from '../../components/ui/index.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { ECRAN_ACCUEIL, useEcranModule } from '../../components/parcours/useEcranModule.js';
import RechercheFiches from '../recettes/RechercheFiches.jsx';
import ReservationForm from './ReservationForm.jsx';
import ReservationDetailModal from './ReservationDetailModal.jsx';
import RechercheResas from './RechercheResas.jsx';
import VueSemaine from './VueSemaine.jsx';
import VueJour from './VueJour.jsx';
import DemandesEnLigne from './DemandesEnLigne.jsx';
import { peutGererReservations } from './gardeEnLigne.js';
import ClientsResa from './ClientsResa.jsx';
import { useReservationsJour } from './useReservationsJour.js';
import { removeStorageKeys } from '../../utils/storage.js';
import { zurichToday } from '../../utils/zurichTime.js';
// Le champ de recherche reprend celui de Cartes & Recettes (.rc-recherche).
import '../recettes/recettes.css';
import './reservations.css';

// Tuile Le rapport (statistiques, lecture seule) : la direction, l'hôte et le
// responsable cuisine (anticipation des couverts). Masqué pour le service, la
// cuisine et le spa, même quand le module leur est ouvert (décision de Jérémy,
// 15.10.2026). La base ne filtre que par établissement : c'est un choix
// d'écran, pas une garde. La liste des rôles est dans rapport/gardeRapport.js.
// Depuis le 14.11.2026 le rapport s'ouvre dans Statistiques (analyse
// « Réservations », pour ces mêmes rôles) : la tuile a quitté cet accueil.

// Plus de mode service ici depuis le 14.11.2026 (décision de Jérémy) : ce
// module met les réservations en place, le service se joue dans la Caisse,
// qui ouvre ses tables sur le plan organisé ici. La clé qui rouvrait le mode
// service d'un iPad rechargé est effacée au montage.
const CLE_MODE_SERVICE = 'sc_resa_mode_service';

// Réglages de la réservation en ligne : la direction (gardeEnLigne.js). Ils
// vivent dans la page des réglages, section 'reservation_en_ligne'.

// Écrans ouverts depuis la barre. Le planning est l'écran d'arrivée : il n'a
// pas d'en-tête de tâche.
const TITRES_ECRAN = {
  plan: 'Organiser mes réservations',
  clients: 'Les clients',
};

// ─────────────────────────────────────────────────────────────────────────────
// Depuis le 17.11.2026 (décision de Jérémy), le module s'ouvre sur le planning
// des réservations, avec la barre de Cartes & Recettes en tête : le champ de
// recherche, puis « Je réserve une table » (action principale, droit gérer),
// « Organiser mes réservations » et « Les clients ». Plus d'accueil à tuiles
// ni de repères du jour. Une recherche montre ses résultats à la place du
// planning ; la vider rend le planning. Organiser et Les clients restent des
// écrans de tâche : Retour, Échap et le geste retour ramènent au planning.
// ─────────────────────────────────────────────────────────────────────────────

export default function Previsions({ user, etablissement }) {
  const [showForm,     setShowForm]     = useState(false);
  const [selectedDate, setSelectedDate] = useState(null); // null = vue semaine
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [recherche,     setRecherche]     = useState('');
  const [resaTrouvee,   setResaTrouvee]   = useState(null);
  const [resaEnEdition, setResaEnEdition] = useState(null);
  useEffect(() => { removeStorageKeys([CLE_MODE_SERVICE]); }, []);
  // Relance la recherche après une modification : sans ça, la liste continue
  // d'afficher la version d'avant la modification qu'on vient de faire.
  const [rechercheKey,  setRechercheKey]  = useState(0);
  const bumpRecherche = () => {
    setRechercheKey((k) => k + 1);
    setRefreshKey((k) => k + 1);
  };

  // Écran du parcours : le planning à l'arrivée, puis un écran par tâche.
  // Aucun écran n'est repris à l'ouverture suivante.
  const { ecran, setEcran, retourAccueil } = useEcranModule('reservations');

  // Fiche ouverte depuis la recherche : statuts et demandes en ligne passent
  // par la même source que la vue jour (le jour de la réservation trouvée),
  // sinon la fiche affiche « Demande en ligne à confirmer » sans bouton.
  const jourTrouvee = useReservationsJour(etablissement?.id, resaTrouvee?.date_service || null, { onChange: bumpRecherche });
  async function traiterTrouvee(resa, evenement) {
    const ok = await jourTrouvee.traiter(resa, evenement);
    if (ok && evenement === 'refus') setResaTrouvee((cur) => (cur?.id === resa.id ? null : cur));
  }

  // Pas de liste de rôles ici : l'accès au module se règle personne par
  // personne dans Rôles & accès, et LegacyModuleHost l'applique déjà. Une
  // liste en dur refusait un cuisinier à qui l'on avait ouvert le module.

  const etabId         = etablissement?.id;
  // Créer / modifier / annuler des réservations : droit « gérer » du module
  // (Rôles & accès, case « Modifier » ; défaut consultant/patron/resp_cuisine/hôte).
  const canEdit        = peutGererReservations(user?.role);

  const surPlanning = ecran === ECRAN_ACCUEIL;
  const aujourdhui = zurichToday();

  // Échap sur un écran de tâche ramène au planning (useEcranModule), sauf
  // quand une fenêtre du module est ouverte par-dessus : formulaire, fiche,
  // fiche de table, gestion des salles. Elles ne sont pas des Fenetre : on les
  // reconnaît à leur couche de retour (useBackLayer, en tête de l'historique)
  // ou à leur voile fixe posé dans <main>. Échap n'y fait alors rien. Phase de
  // capture : passe avant useEcranModule, qui laisse la main à un Échap déjà
  // traité.
  useEffect(() => {
    if (surPlanning) return undefined;
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const calque = window.history.state?.layer;
      if ((calque && calque !== 'reservations-ecran') || document.querySelector('main [style*="position: fixed"]')) e.preventDefault();
    };
    document.addEventListener('keydown', echap, true);
    return () => document.removeEventListener('keydown', echap, true);
  }, [surPlanning]);

  // Fait relire les vues (semaine ou jour, via refreshKey) et rien d'autre : le
  // formulaire se ferme lui-même s'il est encore ouvert. Le fermer ici cassait
  // « + Saisir une autre » et, après une fermeture en cours d'enregistrement,
  // fermait le formulaire rouvert entre-temps.
  function handleSaved() {
    setRefreshKey((k) => k + 1);
  }

  // Un jour choisi ailleurs (demande en ligne, résultat de recherche) s'ouvre
  // dans le planning.
  function allerAuJour(date) {
    setRecherche('');
    setSelectedDate(date);
  }

  const etatEcran = {
    clients: <>le fichier, rempli par les réservations</>,
  };
  const enRecherche = recherche.trim() !== '';

  return (
    <section style={{ position: 'relative', minHeight: '100%' }}>
      {/* Bannière si pas d'établissement */}
      {!etabId && (
        <div style={{
          marginTop: 12, padding: '10px 0 10px 12px',   borderLeft: '2px solid var(--warning-bd)',
          color: 'var(--warning-text)', fontSize: 'var(--t2)', fontFamily: 'var(--font)',
        }}>
          Aucun établissement sélectionné. Sélectionnez un établissement avant de saisir des réservations.
        </div>
      )}

      {/* ── La barre : le champ d'abord, puis l'action principale et les
             écrans du module. Le conteneur ne porte que la barre : les vues
             et leurs fenêtres fixes restent hors de lui. ── */}
      {etabId && surPlanning && (
        <div className="resa-page no-print">
          <div className="resa-tete">
            <RechercheFiches value={recherche} onChange={setRecherche} placeholder="Nom ou téléphone" />
            <div className="module-actions resa-actions">
              {canEdit && <Btn variant="primary" onClick={() => setShowForm(true)}>Je réserve une table</Btn>}
              <Btn onClick={() => setEcran('plan')} title="Le jour d'aujourd'hui sur le plan de salle">Organiser mes réservations</Btn>
              <Btn onClick={() => setEcran('clients')}>Les clients</Btn>
            </div>
          </div>
        </div>
      )}

      {etabId && !surPlanning && (
        <EcranTache titre={TITRES_ECRAN[ecran]} etat={etatEcran[ecran] || null} onRetour={retourAccueil} />
      )}

      {/* ── Le planning : la semaine, puis le jour ; les demandes venues du
             site en tête, pour qui peut les traiter. Une recherche montre ses
             résultats à la place. « Nouvelle réservation » vit dans la barre :
             les vues ne rendent pas la leur. ── */}
      {etabId && surPlanning && (
        <>
          {canEdit && (
            <DemandesEnLigne
              etablissementId={etabId}
              refreshKey={refreshKey}
              onTraitee={() => setRefreshKey((k) => k + 1)}
              onAllerAuJour={allerAuJour}
            />
          )}
          {enRecherche && (
            <RechercheResas
              etablissementId={etabId}
              terme={recherche}
              refreshKey={rechercheKey}
              onOuvrir={setResaTrouvee}
              onAllerAuJour={allerAuJour}
            />
          )}
          {!enRecherche && !selectedDate && (
            <VueSemaine
              etablissementId={etabId}
              onDayClick={setSelectedDate}
              onOpenResa={setResaTrouvee}
              refreshKey={refreshKey}
            />
          )}
          {!enRecherche && selectedDate && (
            <VueJour
              etablissementId={etabId}
              date={selectedDate}
              onBack={() => setSelectedDate(null)}
              onResaUpdated={() => setRefreshKey((k) => k + 1)}
              refreshKey={refreshKey}
              canEdit={canEdit}
              boutonNouvelle={false}
            />
          )}
        </>
      )}

      {/* ── Organiser mes réservations : le jour d'aujourd'hui, ouvert sur
             le plan, pour poser chaque réservation sur sa table. ── */}
      {etabId && ecran === 'plan' && (
        <VueJour
          etablissementId={etabId}
          date={aujourdhui}
          vueInitiale="plan"
          compact
          onResaUpdated={() => setRefreshKey((k) => k + 1)}
          refreshKey={refreshKey}
          canEdit={canEdit}
          onNouvelle={canEdit && etabId ? () => setShowForm(true) : null}
        />
      )}

      {etabId && ecran === 'clients' && (
        <ClientsResa etablissementId={etabId} canEdit={canEdit} peutEffacer={['consultant', 'patron'].includes(user?.role)} refreshKey={refreshKey} />
      )}

      {/* État vide si pas d'établissement */}
      {!etabId && (
        <div style={{
          marginTop: 48, display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 12, textAlign: 'center',
        }}>
          <div style={{ fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', fontFamily: 'var(--font)' }}>
            Sélectionnez un établissement
          </div>
          <div style={{ fontSize: 'var(--t2)', color: 'var(--text2)', maxWidth: 300, lineHeight: 1.6 }}>
            La vue semaine s'affichera une fois un établissement sélectionné.
          </div>
        </div>
      )}

      {canEdit && showForm && etabId && (
        <ReservationForm
          etablissementId={etabId}
          // Pré-remplie sur le jour consulté : quand on regarde samedi, le
          // formulaire ne doit pas s'ouvrir sur aujourd'hui.
          initialDate={(surPlanning && !enRecherche && selectedDate) || undefined}
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}

      {/* Fiche ouverte depuis un résultat de recherche ou un nom de la
          semaine. Modifiable : décaler une résa qu'on vient de retrouver au
          téléphone est précisément ce pour quoi on l'a cherchée. */}
      {resaTrouvee && (
        <ReservationDetailModal
          resa={jourTrouvee.resas?.find((r) => r.id === resaTrouvee.id) || resaTrouvee}
          canEdit={canEdit}
          onStatut={canEdit ? jourTrouvee.changerStatut : undefined}
          onTraiter={canEdit ? traiterTrouvee : undefined}
          onEdit={canEdit ? (r) => { setResaTrouvee(null); setResaEnEdition(r); } : undefined}
          onClose={() => setResaTrouvee(null)}
          onResaUpdated={() => { setResaTrouvee(null); bumpRecherche(); }}
        />
      )}

      {canEdit && resaEnEdition && etabId && (
        <ReservationForm
          etablissementId={etabId}
          initialResa={resaEnEdition}
          onClose={() => setResaEnEdition(null)}
          onSaved={() => { setResaEnEdition(null); bumpRecherche(); }}
        />
      )}
    </section>
  );
}
