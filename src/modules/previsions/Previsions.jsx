import { useState } from 'react';
import { SectionHeader } from '../../components/ui/index.jsx';
import ReservationForm from './ReservationForm.jsx';
import VueSemaine from './VueSemaine.jsx';
import VueJour from './VueJour.jsx';

const ROLES_AUTORISES = ['consultant', 'patron', 'resp_cuisine', 'hote'];

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
          Ce module est réservé aux rôles consultant, patron et responsable cuisine.
        </div>
      </section>
    );
  }

  const etabId = etablissement?.id;

  function handleSaved() {
    setRefreshKey((k) => k + 1);
    setShowForm(false);
  }

  return (
    <section style={{ padding: '20px 24px', position: 'relative', minHeight: '100%' }}>
      <SectionHeader
        title="Prévisions"
        sub={selectedDate ? null : 'Vue semaine cuisine — couverts et particularités par jour'}
      />

      {/* Bannière si pas d'établissement */}
      {!etabId && (
        <div style={{
          marginTop: 12, padding: '10px 14px', borderRadius: 8,
          background: '#fef9ec', border: '1px solid #fbbf24',
          color: '#92400e', fontSize: 13, fontFamily: 'var(--font)',
        }}>
          ⚠️ Aucun établissement sélectionné. Sélectionne un établissement avant de saisir des réservations.
        </div>
      )}

      {/* ── Routeur local : vue semaine ↔ vue jour ── */}
      {etabId && !selectedDate && (
        <VueSemaine
          etablissementId={etabId}
          onDayClick={setSelectedDate}
          refreshKey={refreshKey}
        />
      )}

      {etabId && selectedDate && (
        <VueJour
          etablissementId={etabId}
          date={selectedDate}
          onBack={() => setSelectedDate(null)}
          onResaUpdated={() => setRefreshKey((k) => k + 1)}
        />
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

      {/* FAB — intact depuis J2 */}
      <button
        type="button"
        onClick={() => etabId ? setShowForm(true) : null}
        disabled={!etabId}
        aria-label="Nouvelle réservation"
        title={etabId ? 'Nouvelle réservation' : "Sélectionne un établissement d'abord"}
        style={{
          position: 'fixed', bottom: 28, right: 24,
          width: 56, height: 56, borderRadius: '50%',
          background: etabId ? 'var(--accent)' : 'var(--border)',
          color: '#fff', border: 'none',
          cursor: etabId ? 'pointer' : 'not-allowed',
          fontSize: 28, fontWeight: 700,
          boxShadow: etabId ? '0 4px 20px rgba(0,0,0,0.18)' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, opacity: etabId ? 1 : 0.5,
        }}>
        +
      </button>

      {showForm && etabId && (
        <ReservationForm
          etablissementId={etabId}
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
}
