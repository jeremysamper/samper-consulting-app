import { useState, useEffect } from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { useReservations } from '../../hooks/useReservations.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { formatDateLongue } from '../../utils/dateHelpers.js';
import ReservationDetailModal from './ReservationDetailModal.jsx';
import ReservationForm from './ReservationForm.jsx';

const SERVICES_ORDER = ['midi', 'soir', 'brunch'];
const SERVICE_META = {
  midi:   { label: 'Midi',   color: '#ea580c' },
  soir:   { label: 'Soir',   color: 'var(--info-text)' },
  brunch: { label: 'Brunch', color: '#059669' },
};
const TAG_COLORS = {
  allergene: { bg: 'var(--danger-bg-soft)', color: 'var(--danger-text)', border: 'var(--danger-bd)' },
  regime:    { bg: 'var(--success-bg-soft)', color: 'var(--success-text)', border: 'var(--success-bd)' },
  occasion:  { bg: 'var(--ai-bg-soft)', color: 'var(--ai-text)', border: 'var(--ai-bd)' },
  autre:     { bg: 'var(--surface)', color: 'var(--text)', border: 'var(--border)' },
};

// ── Carte réservation ──────────────────────────────────────
function ResaCard({ resa, isMobile, onClick }) {
  const [hovered, setHovered] = useState(false);
  const tags = Array.isArray(resa.reservation_tags) ? resa.reservation_tags : [];

  return (
    <div
      role="button" tabIndex={0}
      onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 14px', borderRadius: 8,
        border: '1px solid var(--border)',
        background: hovered ? 'var(--bg)' : 'var(--surface)',
        cursor: 'pointer', transition: 'background 0.1s',
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '60px 1fr 20px',
        gap: isMobile ? 3 : 12, alignItems: 'center',
      }}
    >
      {/* Heure */}
      <div style={{
        fontSize: isMobile ? 12 : 15, fontWeight: 800,
        color: 'var(--accent)', fontFamily: 'var(--font-serif)',
      }}>
        {(resa.heure_arrivee || '').slice(0, 5)}
      </div>

      {/* Infos principales */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
            {resa.nom}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            · {resa.nb_couverts} pax
          </span>
          {resa.est_groupe && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
              background: 'var(--info-bg-soft)', color: 'var(--info-text)', border: '1px solid #bfdbfe',
            }}>
              Groupe
            </span>
          )}
        </div>
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {tags.map((t) => {
              const c = TAG_COLORS[t.type_tag] || TAG_COLORS.autre;
              return (
                <span
                  key={`${t.type_tag}-${t.valeur}`}
                  style={{
                    padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                    background: c.bg, color: c.color, border: `1px solid ${c.border}`,
                    fontFamily: 'var(--font)',
                  }}
                >
                  {t.valeur}
                </span>
              );
            })}
          </div>
        )}
        {resa.notes_libres && (
          <div style={{
            fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', marginTop: 3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: isMobile ? 220 : 380,
          }}>
            {resa.notes_libres}
          </div>
        )}
      </div>

      {/* Chevron desktop */}
      {!isMobile && (
        <div style={{ fontSize: 16, color: 'var(--text3)' }}>›</div>
      )}
    </div>
  );
}

// ── Composant principal ────────────────────────────────────
export default function VueJour({ etablissementId, date, onBack, onResaUpdated, canEdit = true }) {
  const isMobile    = useIsMobile();
  const reservations = useReservations(etablissementId);
  const [resas,        setResas]        = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [selectedResa, setSelectedResa] = useState(null);
  const [editingResa,  setEditingResa]  = useState(null);

  async function load() {
    if (!etablissementId || !date) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await reservations.findByDate(date);
      if (err) { setError(err); return; }
      setResas((data || []).filter((r) => r.statut !== 'annule'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [date, etablissementId]); // load est défini dans le composant, stable par construction

  const actives       = resas || [];
  const totalCouverts = actives.reduce((s, r) => s + (r.nb_couverts || 0), 0);
  const totalGroupes  = actives.filter((r) => r.est_groupe).length;

  return (
    <div>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginTop: 16, marginBottom: 14, flexWrap: 'wrap',
      }}>
        <Btn small onClick={onBack}>← Semaine</Btn>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
            {formatDateLongue(date)}
          </div>
          {!loading && actives.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>
              {totalCouverts} couvert{totalCouverts > 1 ? 's' : ''}
              {totalGroupes > 0 ? ` · ${totalGroupes} groupe${totalGroupes > 1 ? 's' : ''}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* ── Erreur ── */}
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, background: 'var(--danger-bg-soft)',
          border: '1px solid var(--danger-bd)', color: 'var(--danger-text)', fontSize: 13,
          marginBottom: 12, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12,
        }}>
          <span>{error}</span>
          <Btn small variant="danger" onClick={load}>Réessayer</Btn>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 13 }}>
          Chargement…
        </div>
      )}

      {/* ── État vide ── */}
      {!loading && !error && actives.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 36, opacity: 0.18, marginBottom: 10 }}>◐</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-serif)', marginBottom: 6 }}>
            Aucune réservation ce jour
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            Reviens à la semaine ou ajoute-en une avec le bouton +
          </div>
        </div>
      )}

      {/* ── Résas regroupées par service ── */}
      {!loading && actives.length > 0 && SERVICES_ORDER.map((svc) => {
        const groupe = actives
          .filter((r) => r.service === svc)
          .sort((a, b) => (a.heure_arrivee || '').localeCompare(b.heure_arrivee || ''));
        if (!groupe.length) return null;
        const sub  = groupe.reduce((s, r) => s + (r.nb_couverts || 0), 0);
        const meta = SERVICE_META[svc];

        return (
          <div key={svc} style={{ marginBottom: 20 }}>
            {/* En-tête de section */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 7, paddingBottom: 5,
              borderBottom: `2px solid ${meta.color}22`,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: 0.5, color: meta.color,
              }}>
                {meta.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                {sub} pax
              </span>
            </div>
            {/* Cartes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groupe.map((resa) => (
                <ResaCard
                  key={resa.id}
                  resa={resa}
                  isMobile={isMobile}
                  onClick={() => setSelectedResa(resa)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Modal détail ── */}
      {selectedResa && (
        <ReservationDetailModal
          resa={selectedResa}
          onClose={() => setSelectedResa(null)}
          onEdit={canEdit ? (resa) => { setSelectedResa(null); setEditingResa(resa); } : undefined}
          onResaUpdated={() => { setSelectedResa(null); load(); onResaUpdated?.(); }}
          canEdit={canEdit}
        />
      )}

      {/* ── Formulaire modification (rôles éditeurs uniquement) ── */}
      {canEdit && editingResa && (
        <ReservationForm
          etablissementId={etablissementId}
          initialResa={editingResa}
          onClose={() => setEditingResa(null)}
          onSaved={() => { setEditingResa(null); load(); onResaUpdated?.(); }}
        />
      )}
    </div>
  );
}
