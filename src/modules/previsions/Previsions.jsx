import { useState } from 'react';
import { SectionHeader } from '../../components/ui/index.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { canManageModule } from '../../data/demoData.js';
import ReservationForm from './ReservationForm.jsx';
import ReservationDetailModal from './ReservationDetailModal.jsx';
import RechercheResas from './RechercheResas.jsx';
import VueSemaine from './VueSemaine.jsx';
import VueJour from './VueJour.jsx';

// Tous les rôles ayant accès au module (réservations en lecture au minimum)
const ROLES_AUTORISES = ['consultant', 'patron', 'resp_cuisine', 'hote', 'serveur'];

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
  // Relance la recherche après une modification : sans ça, la liste continue
  // d'afficher la version d'avant la modification qu'on vient de faire.
  const [rechercheKey,  setRechercheKey]  = useState(0);
  const bumpRecherche = () => {
    setRechercheKey((k) => k + 1);
    setRefreshKey((k) => k + 1);
  };

  if (!ROLES_AUTORISES.includes(user?.role)) {
    return (
      <section style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 8 }}>
          Accès non autorisé à ce module.
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          Ce module est réservé aux rôles consultant, patron, responsable cuisine, hôte et serveur.
        </div>
      </section>
    );
  }

  const etabId         = etablissement?.id;
  // Créer / modifier / annuler des réservations : droit « gérer » du module
  // (Rôles & accès → Droits d'action ; défaut consultant/patron/resp_cuisine/hôte).
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

  return (
    <section style={{ padding: '20px 24px', position: 'relative', minHeight: '100%' }}>
      <div className="module-toolbar">
        <SectionHeader
          title="Prévisions"
          sub={selectedDate ? null : 'Vue semaine cuisine - couverts et particularités par jour'}
        />
        <div className="module-actions">
          {etabId && (
            <SearchToggle
              value={recherche}
              onChange={setRecherche}
              placeholder="Nom ou téléphone…"
            />
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

      {/* ── Recherche : elle prend toute la place tant qu'elle est ouverte,
             plutôt que de s'ajouter sous la semaine où on la perdrait de vue.
             Fermer la loupe efface le filtre et rend la vue normale. ── */}
      {etabId && recherche.trim() !== '' && (
        <RechercheResas
          etablissementId={etabId}
          terme={recherche}
          refreshKey={rechercheKey}
          onOuvrir={setResaTrouvee}
          onAllerAuJour={(d) => { setRecherche(''); setSelectedDate(d); }}
        />
      )}

      {/* ── Routeur local : vue semaine ↔ vue jour ── */}
      {etabId && recherche.trim() === '' && (
        <>
          {!selectedDate && (
            <VueSemaine
              etablissementId={etabId}
              onDayClick={setSelectedDate}
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
