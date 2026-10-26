import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Input } from '../../components/ui/index.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { ECRAN_ACCUEIL, useEcranModule } from '../../components/parcours/useEcranModule.js';
import { canManageModule } from '../../data/demoData.js';
import AccueilReservations from './AccueilReservations.jsx';
import ReservationForm from './ReservationForm.jsx';
import ReservationDetailModal from './ReservationDetailModal.jsx';
import RechercheResas from './RechercheResas.jsx';
import VueSemaine from './VueSemaine.jsx';
import VueJour from './VueJour.jsx';
import DemandesEnLigne from './DemandesEnLigne.jsx';
import ReglagesTableEnLigne from './ReglagesTableEnLigne.jsx';
import { PanneauNotifications, useNotificationsAppareil } from './NotificationsAppareil.jsx';
import ModeService from './ModeService.jsx';
import ClientsResa from './ClientsResa.jsx';
import { useReservationsJour } from './useReservationsJour.js';
import { readText, writeText, removeStorageKeys } from '../../utils/storage.js';
import { zurichToday } from '../../utils/zurichTime.js';

// Rapport chargé à la demande : le planning, ouvert toute la journée sur
// l'iPad de l'entrée, ne porte pas le poids des statistiques.
const RapportReservations = lazy(() => import('./rapport/RapportReservations.jsx'));

// Écran Le rapport (statistiques, lecture seule) : la direction, l'hôte et le
// responsable cuisine (anticipation des couverts). Masqué pour le service, la
// cuisine et le spa, même quand le module leur est ouvert (décision de Jérémy,
// 15.10.2026). La base ne filtre que par établissement : c'est un choix
// d'écran, pas une garde.
const ROLES_RAPPORT = ['consultant', 'patron', 'resp_cuisine', 'hote'];

// Mode service resté ouvert sur cet appareil (valeur : id de l'établissement).
// L'iPad de l'entrée qui recharge en plein service (mise à jour, réveil)
// retombe dans le mode service du jour au lieu de l'accueil du module.
const CLE_MODE_SERVICE = 'sc_resa_mode_service';

// Réglages de la réservation en ligne : la direction, comme pour le Spa (et la
// RLS de reservation_en_ligne_parametres).
const ROLES_EN_LIGNE = ['consultant', 'patron'];

// Rôles voyant les KPIs financiers (CA prévisionnel, etc.)
// Réservé pour les futurs affichages de chiffre d'affaires estimé.
const ROLES_FINANCIALS = ['consultant', 'patron', 'resp_cuisine'];

// Écrans du parcours (l'accueil a ses tuiles, sans en-tête de tâche).
const TITRES_ECRAN = {
  planning: 'Le planning',
  plan: 'Le plan de salle',
  chercher: 'Je cherche une réservation',
  clients: 'Les clients',
  rapport: 'Le rapport',
};

export default function Previsions({ user, etablissement }) {
  const [showForm,     setShowForm]     = useState(false);
  const [selectedDate, setSelectedDate] = useState(null); // null = vue semaine
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [recherche,     setRecherche]     = useState('');
  const [resaTrouvee,   setResaTrouvee]   = useState(null);
  const [resaEnEdition, setResaEnEdition] = useState(null);
  const [reglagesEnLigne, setReglagesEnLigne] = useState(false);
  const [notificationsOuvertes, setNotificationsOuvertes] = useState(false);
  // Le champ de « Je cherche une réservation » prend la main quand on vient de
  // toucher sa tuile.
  const [champAuToucher, setChampAuToucher] = useState(false);
  // Date affichée en mode service (écran scindé plan + réservations), null
  // quand il est fermé.
  const [modeService, setModeService] = useState(() => (
    etablissement?.id && readText(CLE_MODE_SERVICE) === etablissement.id ? zurichToday() : null
  ));
  // Relance la recherche après une modification : sans ça, la liste continue
  // d'afficher la version d'avant la modification qu'on vient de faire.
  const [rechercheKey,  setRechercheKey]  = useState(0);
  const bumpRecherche = () => {
    setRechercheKey((k) => k + 1);
    setRefreshKey((k) => k + 1);
  };

  // Écran du parcours : l'accueil (une tuile par tâche), puis un écran par
  // tâche. Aucun écran n'est repris à l'ouverture suivante : seul le mode
  // service du jour se rouvre, par sa propre clé. Revenir à l'accueil referme
  // le jour ouvert, la recherche et la fiche trouvée.
  const { ecran, setEcran, retourAccueil } = useEcranModule('reservations', {
    surRetour: () => {
      setSelectedDate(null);
      setRecherche('');
      setResaTrouvee(null);
      setChampAuToucher(false);
    },
  });

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
  const canEdit        = canManageModule(user?.role, 'previsions');
  const voitRapport    = ROLES_RAPPORT.includes(user?.role);
  const voitReglages   = ROLES_EN_LIGNE.includes(user?.role);
  // showFinancials réservé pour les futures sections KPIs CA
  // const showFinancials = ROLES_FINANCIALS.includes(user?.role);

  const surAccueil = ecran === ECRAN_ACCUEIL;
  const aujourdhui = zurichToday();

  // Ligne d'état de la tuile Ce soir : couverts du jour (no-shows exclus,
  // comme la vue jour). Lecture seule, à l'accueil.
  const jourAccueil = useReservationsJour(etabId, surAccueil ? aujourdhui : null, { refreshKey });
  const couvertsDuJour = jourAccueil.resas && !jourAccueil.error
    ? jourAccueil.resas.filter((r) => r.statut !== 'no_show').reduce((s, r) => s + (r.nb_couverts || 0), 0)
    : null;

  const notifications = useNotificationsAppareil(etabId, user);
  const fermerNotifications = useCallback(() => setNotificationsOuvertes(false), []);

  // Échap sur un écran de tâche ramène à l'accueil du module (useEcranModule),
  // sauf quand une fenêtre du module est ouverte par-dessus : formulaire,
  // fiche, mode service, fiche de table, gestion des salles. Elles ne sont pas
  // des Fenetre : on les reconnaît à leur couche de retour (useBackLayer, en
  // tête de l'historique) ou à leur voile fixe posé dans <main>. Échap n'y fait
  // alors rien, comme avant les écrans. Phase de capture : passe avant
  // useEcranModule, qui laisse la main à un Échap déjà traité.
  useEffect(() => {
    if (surAccueil) return undefined;
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const calque = window.history.state?.layer;
      if ((calque && calque !== 'reservations-ecran') || document.querySelector('main [style*="position: fixed"]')) e.preventDefault();
    };
    document.addEventListener('keydown', echap, true);
    return () => document.removeEventListener('keydown', echap, true);
  }, [surAccueil]);

  // Fait relire les vues (semaine ou jour, via refreshKey) et rien d'autre : le
  // formulaire se ferme lui-même s'il est encore ouvert. Le fermer ici cassait
  // « + Saisir une autre » et, après une fermeture en cours d'enregistrement,
  // fermait le formulaire rouvert entre-temps.
  function handleSaved() {
    setRefreshKey((k) => k + 1);
  }

  // Seul le mode service du jour est retenu d'un chargement à l'autre : rouvrir
  // demain sur la date d'hier tromperait l'hôte.
  function ouvrirModeService(date) {
    setModeService(date);
    if (date === zurichToday()) writeText(CLE_MODE_SERVICE, etabId);
    else removeStorageKeys([CLE_MODE_SERVICE]);
  }

  function fermerModeService() {
    setModeService(null);
    removeStorageKeys([CLE_MODE_SERVICE]);
    setRefreshKey((k) => k + 1);
  }

  // Un jour choisi ailleurs (demande en ligne, résultat de recherche) s'ouvre
  // dans Le planning.
  function allerAuJour(date) {
    setRecherche('');
    setSelectedDate(date);
    setEcran('planning');
  }

  const etatEcran = {
    planning: selectedDate ? null : <>la semaine, service par service</>,
    chercher: <>par le nom ou le téléphone, toutes dates</>,
    clients: <>le fichier, rempli par les réservations</>,
    rapport: <>l'activité des réservations, en lecture seule</>,
  };

  return (
    <section style={{ padding: '20px 24px', position: 'relative', minHeight: '100%' }}>
      {/* Bannière si pas d'établissement */}
      {!etabId && (
        <div style={{
          marginTop: 12, padding: '10px 0 10px 12px',   borderLeft: '2px solid var(--warning-bd)',
          color: 'var(--warning-text)', fontSize: 13, fontFamily: 'var(--font)',
        }}>
          Aucun établissement sélectionné. Sélectionnez un établissement avant de saisir des réservations.
        </div>
      )}

      {/* ── Accueil : les demandes venues du site en tête, pour qui peut les
             traiter, confirmées ou refusées d'un geste ; puis les tuiles. ── */}
      {etabId && surAccueil && canEdit && (
        <DemandesEnLigne
          etablissementId={etabId}
          refreshKey={refreshKey}
          onTraitee={() => setRefreshKey((k) => k + 1)}
          onAllerAuJour={allerAuJour}
          style={st.demandesAccueil}
        />
      )}

      {etabId && surAccueil && (
        <AccueilReservations
          couverts={couvertsDuJour}
          notificationsActives={notifications.actif}
          canEdit={canEdit}
          voitRapport={voitRapport}
          voitReglages={voitReglages}
          onReserver={() => setShowForm(true)}
          onService={() => ouvrirModeService(zurichToday())}
          onPlanning={() => setEcran('planning')}
          onPlan={() => setEcran('plan')}
          onChercher={() => { setChampAuToucher(true); setEcran('chercher'); }}
          onClients={() => setEcran('clients')}
          onRapport={() => setEcran('rapport')}
          onNotifications={() => setNotificationsOuvertes(true)}
          onReglages={() => setReglagesEnLigne(true)}
        />
      )}

      {etabId && !surAccueil && (
        <EcranTache titre={TITRES_ECRAN[ecran]} etat={etatEcran[ecran] || null} onRetour={retourAccueil} />
      )}

      {/* ── Le planning : la semaine, puis le jour, tels qu'avant ; les
             demandes venues du site en tête, quel que soit le jour affiché. ── */}
      {etabId && ecran === 'planning' && (
        <>
          {canEdit && (
            <DemandesEnLigne
              etablissementId={etabId}
              refreshKey={refreshKey}
              onTraitee={() => setRefreshKey((k) => k + 1)}
              onAllerAuJour={setSelectedDate}
            />
          )}
          {!selectedDate && (
            <VueSemaine
              etablissementId={etabId}
              onDayClick={setSelectedDate}
              onOpenResa={setResaTrouvee}
              onNouvelle={canEdit && etabId ? () => setShowForm(true) : null}
              refreshKey={refreshKey}
            />
          )}
          {selectedDate && (
            <VueJour
              etablissementId={etabId}
              date={selectedDate}
              onBack={() => setSelectedDate(null)}
              onResaUpdated={() => setRefreshKey((k) => k + 1)}
              refreshKey={refreshKey}
              canEdit={canEdit}
              onModeService={ouvrirModeService}
              onNouvelle={canEdit && etabId ? () => setShowForm(true) : null}
            />
          )}
        </>
      )}

      {/* ── Le plan de salle : le jour d'aujourd'hui, ouvert sur le plan. ── */}
      {etabId && ecran === 'plan' && (
        <VueJour
          etablissementId={etabId}
          date={aujourdhui}
          vueInitiale="plan"
          compact
          onResaUpdated={() => setRefreshKey((k) => k + 1)}
          refreshKey={refreshKey}
          canEdit={canEdit}
          onModeService={ouvrirModeService}
          onNouvelle={canEdit && etabId ? () => setShowForm(true) : null}
        />
      )}

      {/* ── Je cherche une réservation : le champ ouvert, puis les résultats
             d'aujourd'hui (fiche, Voir le jour). ── */}
      {etabId && ecran === 'chercher' && (
        <>
          <Input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoFocus={champAuToucher}
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Nom ou téléphone"
            aria-label="Nom ou téléphone"
            style={st.champ}
          />
          {recherche.trim() !== '' && (
            <RechercheResas
              etablissementId={etabId}
              terme={recherche}
              refreshKey={rechercheKey}
              onOuvrir={setResaTrouvee}
              onAllerAuJour={allerAuJour}
            />
          )}
        </>
      )}

      {etabId && ecran === 'clients' && (
        <ClientsResa etablissementId={etabId} canEdit={canEdit} refreshKey={refreshKey} />
      )}

      {etabId && ecran === 'rapport' && voitRapport && (
        <Suspense fallback={<div style={{ marginTop: 28, fontSize: 14, color: 'var(--text2)' }}>Chargement du rapport…</div>}>
          <RapportReservations key={etabId} etablissementId={etabId} />
        </Suspense>
      )}

      {/* État vide si pas d'établissement */}
      {!etabId && (
        <div style={{
          marginTop: 48, display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 12, textAlign: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
            Sélectionnez un établissement
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 300, lineHeight: 1.6 }}>
            La vue semaine s'affichera une fois un établissement sélectionné.
          </div>
        </div>
      )}

      {canEdit && showForm && etabId && (
        <ReservationForm
          etablissementId={etabId}
          // Pré-remplie sur le jour consulté : quand on regarde samedi, le
          // formulaire ne doit pas s'ouvrir sur aujourd'hui.
          initialDate={selectedDate || undefined}
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

      {modeService && etabId && (
        <ModeService
          etablissementId={etabId}
          date={modeService}
          canEdit={canEdit}
          onClose={fermerModeService}
          onChange={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {reglagesEnLigne && etabId && voitReglages && (
        <ReglagesTableEnLigne etablissement={etablissement} consultant={user?.role === 'consultant'} onClose={() => setReglagesEnLigne(false)} />
      )}

      {notificationsOuvertes && etabId && (
        <PanneauNotifications notifs={notifications} onFermer={fermerNotifications} />
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

const st = {
  // 16 px : iOS ne zoome pas sur le champ quand il prend la main.
  champ: { marginTop: 16, fontSize: 16, padding: '12px 14px', minHeight: 44 },
  // Premier bloc de l'accueil : pas de marge au-dessus, un écart avant les tuiles.
  demandesAccueil: { marginTop: 0, marginBottom: 16 },
};
