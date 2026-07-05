import { useState } from 'react';
import { SectionHeader } from '../../components/ui/index.jsx';
import ReservationForm from './ReservationForm.jsx';
import VueSemaine from './VueSemaine.jsx';
import VueJour from './VueJour.jsx';

// Tous les rôles ayant accès au module (réservations en lecture au minimum)
const ROLES_AUTORISES = ['consultant', 'patron', 'resp_cuisine', 'hote', 'serveur'];

// Rôles pouvant créer / modifier / annuler des réservations
const ROLES_EDIT = ['consultant', 'patron', 'resp_cuisine', 'hote'];

// Rôles voyant les KPIs financiers (CA prévisionnel, etc.)
// Réservé pour les futurs affichages de chiffre d'affaires estimé.
const ROLES_FINANCIALS = ['consultant', 'patron', 'resp_cuisine'];

export default function Previsions({ user, etablissement }) {
  const [showForm,     setShowForm]     = useState(false);
  const [selectedDate, setSelectedDate] = useState(null); // null = vue semaine
  const [refreshKey,   setRefreshKey]   = useState(0);

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
  const canEdit        = ROLES_EDIT.includes(user?.role);
  // showFinancials réservé pour les futures sections KPIs CA
  // const showFinancials = ROLES_FINANCIALS.includes(user?.role);

  function handleSaved() {
    setRefreshKey((k) => k + 1);
    setShowForm(false);
  }

  return (
    <section style={{ padding: '20px 24px', position: 'relative', minHeight: '100%' }}>
      <div className="module-toolbar">
        <SectionHeader
          title="Prévisions"
          sub={selectedDate ? null : 'Vue semaine cuisine — couverts et particularités par jour'}
        />
        {canEdit && (
          <div className="module-actions">
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
          </div>
        )}
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

      {/* ── Routeur local : vue semaine ↔ vue jour ── */}
      {etabId && (
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
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
}
