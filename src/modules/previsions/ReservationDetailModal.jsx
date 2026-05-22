export default function ReservationDetailModal({ resa, onClose }) {
  const tags = Array.isArray(resa.reservation_tags) ? resa.reservation_tags : [];

  function LigneDetail({ label, valeur }) {
    if (!valeur && valeur !== 0) return null;
    return (
      <div style={{
        display: 'flex', gap: 12, padding: '7px 0',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          fontSize: 12, color: 'var(--text3)', minWidth: 110,
          fontWeight: 600, flexShrink: 0,
        }}>
          {label}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>
          {valeur}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)', borderRadius: 14,
          width: 400, maxWidth: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            fontWeight: 700, fontSize: 14, color: 'var(--text)',
            fontFamily: 'var(--font-serif)',
          }}>
            {resa.nom}
          </div>
          <button
            type="button" onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: 20,
              cursor: 'pointer', color: 'var(--text2)', padding: 4, lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Corps scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
          <LigneDetail label="Date"      valeur={resa.date_service} />
          <LigneDetail label="Service"   valeur={resa.service && (resa.service.charAt(0).toUpperCase() + resa.service.slice(1))} />
          <LigneDetail label="Heure"     valeur={(resa.heure_arrivee || '').slice(0, 5)} />
          <LigneDetail label="Couverts"  valeur={`${resa.nb_couverts} pax`} />
          <LigneDetail label="Téléphone" valeur={resa.telephone} />
          {resa.est_groupe && <LigneDetail label="Type" valeur="Groupe" />}
          <LigneDetail label="Notes"     valeur={resa.notes_libres} />
          {tags.length > 0 && (
            <div style={{
              display: 'flex', gap: 12, padding: '7px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                fontSize: 12, color: 'var(--text3)', minWidth: 110,
                fontWeight: 600, flexShrink: 0,
              }}>
                Tags
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {tags.map((t) => (
                  <span
                    key={`${t.type_tag}-${t.valeur}`}
                    style={{
                      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {t.valeur}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div style={{
            marginTop: 14, padding: '8px 12px', borderRadius: 8,
            background: 'var(--bg)', fontSize: 11, color: 'var(--text3)', fontStyle: 'italic',
          }}>
            Édition et suppression disponibles en J4.
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 18px', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button
            type="button" onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--text)', cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
