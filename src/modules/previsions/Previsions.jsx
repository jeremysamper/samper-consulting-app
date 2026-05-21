import { useState } from 'react';
import { SectionHeader } from '../../components/ui/index.jsx';
import ReservationForm from './ReservationForm.jsx';

const ROLES_AUTORISES = ['consultant', 'patron', 'resp_cuisine', 'hote'];

export default function Previsions({ user, etablissement }) {
  const [showForm, setShowForm] = useState(false);

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

  return (
    <section style={{ padding: '20px 24px', position: 'relative', minHeight: '100%' }}>
      <SectionHeader
        title="Prévisions"
        sub="Vue semaine cuisine — couverts et particularités par jour"
      />

      {/* État vide — vue semaine en J3 */}
      <div style={{
        marginTop: 48, display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 12, textAlign: 'center',
      }}>
        <div style={{ fontSize: 42, opacity: 0.2 }}>◐</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
          La vue semaine arrive en J3
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 300, lineHeight: 1.6 }}>
          Commence par saisir des réservations avec le bouton ci-dessous.
          <br />
          Elles alimenteront automatiquement les prévisions du chef.
        </div>
      </div>

      {/* FAB + Nouvelle réservation */}
      <button
        type="button"
        onClick={() => setShowForm(true)}
        aria-label="Nouvelle réservation"
        title="Nouvelle réservation"
        style={{
          position: 'fixed', bottom: 28, right: 24,
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--accent)', color: '#fff', border: 'none',
          cursor: 'pointer', fontSize: 28, fontWeight: 700,
          boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100,
        }}>
        +
      </button>

      {showForm && (
        <ReservationForm
          etablissementId={etablissement?.id}
          onClose={() => setShowForm(false)}
          onSaved={() => { /* rafraîchissement vue semaine branché en J3 */ }}
        />
      )}
    </section>
  );
}
