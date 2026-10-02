import { useState } from 'react';
import { SectionHeader } from '../../components/ui/index.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { canManageModule } from '../../data/demoData.js';
import ReservationForm from './ReservationForm.jsx';
import ReservationDetailModal from './ReservationDetailModal.jsx';
import RechercheResas from './RechercheResas.jsx';
import VueSemaine from './VueSemaine.jsx';
import VueJour from './VueJour.jsx';
import DemandesEnLigne from './DemandesEnLigne.jsx';
import ReglagesTableEnLigne from './ReglagesTableEnLigne.jsx';
import NotificationsAppareil from './NotificationsAppareil.jsx';
import ModeService from './ModeService.jsx';
import ClientsResa from './ClientsResa.jsx';
import { readText, writeText, removeStorageKeys } from '../../utils/storage.js';
import { zurichToday } from '../../utils/zurichTime.js';

// Mode service resté ouvert sur cet appareil (valeur : id de l'établissement).
// L'iPad de l'entrée qui recharge en plein service (mise à jour, réveil)
// retombe dans le mode service du jour au lieu de la semaine.
const CLE_MODE_SERVICE = 'sc_resa_mode_service';

// Réglages de la réservation en ligne : la direction, comme pour le Spa (et la
// RLS de reservation_en_ligne_parametres).
const ROLES_EN_LIGNE = ['consultant', 'patron'];

// Rôles voyant les KPIs financiers (CA prévisionnel, etc.)
// Réservé pour les futurs affichages de chiffre d'affaires estimé.
const ROLES_FINANCIALS = ['consultant', 'patron', 'resp_cuisine'];

export default function Previsions({ user, etablissement }) {
  const [showForm,     setShowForm]     = useState(false);
  const [selectedDate, setSelectedDate] = useState(null); // null = vue semaine
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [recherche,     setRecherche]     = useState('');
  const [resaTrouvee,   setResaTrouvee]   = useState(null);
  const [resaEnEdition, setResaEnEdition] = useState(null);
  const [reglagesEnLigne, setReglagesEnLigne] = useState(false);
  // Planning (semaine, jour) ou fichier clients.
  const [onglet, setOnglet] = useState('planning');
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

  // Pas de liste de rôles ici : l'accès au module se règle personne par
  // personne dans Rôles & accès, et LegacyModuleHost l'applique déjà. Une
  // liste en dur refusait un cuisinier à qui l'on avait ouvert le module.

  const etabId         = etablissement?.id;
  // Créer / modifier / annuler des réservations : droit « gérer » du module
  // (Rôles & accès, case « Modifier » ; défaut consultant/patron/resp_cuisine/hôte).
  const canEdit        = canManageModule(user?.role, 'previsions');
  // showFinancials réservé pour les futures sections KPIs CA
  // const showFinancials = ROLES_FINANCIALS.includes(user?.role);

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

  return (
    <section style={{ padding: '20px 24px', position: 'relative', minHeight: '100%' }}>
      <div className="module-toolbar">
        <SectionHeader
          title="Réservations"
          sub={onglet === 'clients' ? 'Fichier clients, rempli par les réservations' : selectedDate ? null : 'Planning de la semaine, service par service'}
        />
        <div className="module-actions">
          {/* Prévenir ce téléphone / cette tablette à chaque réservation en
              ligne. En tête : visible sur téléphone sans faire défiler. */}
          {etabId && <NotificationsAppareil etablissementId={etabId} user={user} />}
          {/* Le plan de salle en un tap : écran scindé plan + réservations du
              service en cours. Il n'était accessible que par la vue d'un jour,
              puis l'onglet « Plan de salle ». */}
          {etabId && (
            <button
              type="button"
              onClick={() => ouvrirModeService(zurichToday())}
              title="Plan de salle et réservations attendues, côte à côte"
              style={{
                padding: '9px 16px', borderRadius: 8,
                borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--accent)',
                background: 'var(--surface)', color: 'var(--accent)',
                fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer',
              }}>
              Mode service
            </button>
          )}
          {/* La loupe cherche dans les réservations ; l'onglet Clients a sa
              propre recherche. */}
          {etabId && onglet === 'planning' && (
            <SearchToggle
              value={recherche}
              onChange={setRecherche}
              placeholder="Nom ou téléphone…"
            />
          )}
          {etabId && ROLES_EN_LIGNE.includes(user?.role) && (
            <button
              type="button"
              onClick={() => setReglagesEnLigne(true)}
              style={{
                padding: '9px 16px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text)', fontSize: 13, fontWeight: 600,
                fontFamily: 'var(--font)', cursor: 'pointer',
              }}>
              Réservation en ligne & e-mails
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => etabId ? setShowForm(true) : null}
              disabled={!etabId}
              title={etabId ? 'Nouvelle réservation' : "Sélectionne un établissement d'abord"}
              style={{
                padding: '9px 16px', borderRadius: 8, border: 'none',
                background: etabId ? 'var(--accent)' : 'var(--border)',
                color: '#fff', fontSize: 13, fontWeight: 600,
                fontFamily: 'var(--font)',
                cursor: etabId ? 'pointer' : 'not-allowed',
                opacity: etabId ? 1 : 0.6,
              }}>
              + Nouvelle réservation
            </button>
          )}
        </div>
      </div>

      {/* Bannière si pas d'établissement */}
      {!etabId && (
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 8,
          background: 'var(--warning-bg-soft)', border: '1px solid var(--warning-bd)',
          color: 'var(--warning-text)', fontSize: 13, fontFamily: 'var(--font)',
        }}>
          ⚠️ Aucun établissement sélectionné. Sélectionne un établissement avant de saisir des réservations.
        </div>
      )}

      {etabId && (
        <SegmentedTabs
          tabs={[{ id: 'planning', label: 'Planning' }, { id: 'clients', label: 'Clients' }]}
          active={onglet}
          onChange={(id) => { setOnglet(id); setRecherche(''); }}
          style={{ marginTop: 14 }}
        />
      )}

      {etabId && onglet === 'clients' && (
        <ClientsResa etablissementId={etabId} canEdit={canEdit} refreshKey={refreshKey} />
      )}

      {/* ── Recherche : elle prend toute la place tant qu'elle est ouverte,
             plutôt que de s'ajouter sous la semaine où on la perdrait de vue.
             Fermer la loupe efface le filtre et rend la vue normale. ── */}
      {etabId && onglet === 'planning' && recherche.trim() !== '' && (
        <RechercheResas
          etablissementId={etabId}
          terme={recherche}
          refreshKey={rechercheKey}
          onOuvrir={setResaTrouvee}
          onAllerAuJour={(d) => { setRecherche(''); setSelectedDate(d); }}
        />
      )}

      {/* ── Routeur local : vue semaine ↔ vue jour ── */}
      {etabId && onglet === 'planning' && recherche.trim() === '' && (
        <>
          {/* Demandes venues du site, à confirmer : en tête, quel que soit le
              jour affiché. */}
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
            />
          )}
        </>
      )}

      {/* État vide si pas d'établissement */}
      {!etabId && (
        <div style={{
          marginTop: 48, display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 12, textAlign: 'center',
        }}>
          <div style={{ fontSize: 42, opacity: 0.2 }}>◐</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
            Sélectionne un établissement
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

      {/* Fiche ouverte depuis un résultat de recherche. Modifiable : décaler
          une résa qu'on vient de retrouver au téléphone est précisément ce
          pour quoi on l'a cherchée. */}
      {resaTrouvee && (
        <ReservationDetailModal
          resa={resaTrouvee}
          canEdit={canEdit}
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

      {reglagesEnLigne && etabId && (
        <ReglagesTableEnLigne etablissement={etablissement} consultant={user?.role === 'consultant'} onClose={() => setReglagesEnLigne(false)} />
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
