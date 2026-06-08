import { useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { useReservations } from '../../hooks/useReservations.js';

export default function ReservationDetailModal({ resa, onClose, onResaUpdated, onEdit, canEdit = true }) {
  const reservations  = useReservations(resa.etablissement_id);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting,    setDeleting]    = useState(false);
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

  async function handleDelete() {
    setDeleting(true);
    const { error } = await reservations.delete(resa.id);
    setDeleting(false);
    if (error) {
      notify(error, 'error');
      return; // modal reste ouvert → l'utilisateur peut réessayer
    }
    notify(`Réservation ${resa.nom} annulée`, 'success');
    onResaUpdated?.();
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
                      background: 'var(--danger-bg-soft)', color: 'var(--danger-text)', border: '1px solid var(--danger-bd)',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {t.valeur}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer — état normal */}
        {!showConfirm && (
          <div style={{
            padding: '12px 18px', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          }}>
            {canEdit && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button" onClick={() => onEdit?.(resa)}
                  style={{
                    padding: '9px 18px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--text)', cursor: 'pointer',
                    fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
                  }}
                >
                  Modifier
                </button>
                <button
                  type="button" onClick={() => setShowConfirm(true)}
                  style={{
                    padding: '9px 18px', borderRadius: 8,
                    border: '1px solid var(--danger-bd)', background: 'var(--danger-bg-soft)',
                    color: 'var(--danger-text)', cursor: 'pointer',
                    fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
                  }}
                >
                  Supprimer
                </button>
              </div>
            )}
            <button
              type="button" onClick={onClose}
              style={{
                padding: '9px 18px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text)', cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
                marginLeft: canEdit ? 0 : 'auto',
              }}
            >
              Fermer
            </button>
          </div>
        )}

        {/* Footer — état confirmation */}
        {showConfirm && (
          <div style={{
            padding: '14px 18px', borderTop: '1px solid var(--danger-bd)',
            background: 'var(--danger-bg-soft)', display: 'flex', flexDirection: 'column', gap: 10,
            borderRadius: '0 0 14px 14px',
          }}>
            <div style={{ fontSize: 13, color: 'var(--danger-text)', fontWeight: 600, lineHeight: 1.4 }}>
              Annuler la réservation de {resa.nom}
              {resa.date_service ? ` pour le ${resa.date_service}` : ''}
              {resa.heure_arrivee ? ` à ${(resa.heure_arrivee).slice(0, 5)}` : ''} ?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button" onClick={() => setShowConfirm(false)} disabled={deleting}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', cursor: deleting ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
                  opacity: deleting ? 0.5 : 1,
                }}
              >
                Annuler
              </button>
              <button
                type="button" onClick={handleDelete} disabled={deleting}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid var(--danger-text)',
                  background: deleting ? 'var(--danger-bd)' : 'var(--danger-text)',
                  color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? 'Suppression…' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
