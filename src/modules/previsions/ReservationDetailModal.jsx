import { useState, useRef, useEffect } from 'react';
import { notify } from '../../components/toast/index.js';
import { useReservations } from '../../hooks/useReservations.js';
import { formatDateLongue } from '../../utils/dateHelpers.js';
import { STATUTS, metaStatut } from './statutsReservation.js';

export default function ReservationDetailModal({
  resa, onClose, onResaUpdated, onEdit, onStatut, canEdit = true,
}) {
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

  // Faux dès que la modale est fermée. On peut la fermer pendant l'annulation
  // (le fetch est borné, mais 25 s au doigt c'est long) : l'écriture va quand
  // même à son terme et son résultat s'affiche en toast, mais elle ne pilote
  // plus l'interface - elle refermerait la modale ouverte entre-temps.
  const ouverteRef = useRef(true);
  useEffect(() => {
    ouverteRef.current = true;
    return () => { ouverteRef.current = false; };
  }, []);

  async function handleDelete() {
    setDeleting(true);
    let res;
    try {
      res = await reservations.delete(resa.id);
    } finally {
      setDeleting(false);
    }
    if (res.error) {
      // Encore ouverte : on y reste pour laisser réessayer. Déjà fermée : le
      // toast doit dire de quelle réservation il s'agit.
      notify(ouverteRef.current ? res.error : `Annulation de la réservation ${resa.nom} impossible : ${res.error}`, 'error');
      return;
    }
    notify(`Réservation ${resa.nom} annulée`, 'success');
    onResaUpdated?.(resa.id);
    if (ouverteRef.current) onClose();
  }

  return (
    <div
      className="modal-sheet-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="modal-sheet"
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
          {/* Suivi du service. Ces états existaient en base depuis l'origine
              sans qu'aucun écran ne les expose : on ne pouvait pas savoir qui
              était déjà à table. */}
          {canEdit && onStatut && (
            <div style={{ paddingBottom: 12, marginBottom: 4 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, marginBottom: 6 }}>
                Statut
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {STATUTS.map((s) => {
                  const m     = metaStatut(s);
                  const actif = (resa.statut || 'confirme') === s;
                  return (
                    <button
                      key={s} type="button"
                      onClick={() => onStatut(resa, s)}
                      style={{
                        padding: '8px 13px', borderRadius: 20, minHeight: 40,
                        borderWidth: 1, borderStyle: 'solid',
                        borderColor: actif ? m.bordure : 'var(--border)',
                        background:  actif ? m.bg : 'var(--surface)',
                        color:       actif ? m.texte : 'var(--text2)',
                        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)',
                        cursor: 'pointer',
                      }}>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <LigneDetail label="Date"      valeur={resa.date_service && formatDateLongue(resa.date_service)} />
          <LigneDetail label="Service"   valeur={resa.service && (resa.service.charAt(0).toUpperCase() + resa.service.slice(1))} />
          <LigneDetail label="Heure"     valeur={(resa.heure_arrivee || '').slice(0, 5)} />
          <LigneDetail label="Couverts"  valeur={`${resa.nb_couverts} pax`} />
          {/* Numéro appelable : quand un groupe n'est pas arrivé à 20h30, on
              le rappelle depuis l'iPad, on ne recopie pas le numéro. */}
          <LigneDetail
            label="Téléphone"
            valeur={resa.telephone && (
              <a href={`tel:${String(resa.telephone).replace(/\s/g, '')}`}
                 style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                {resa.telephone}
              </a>
            )}
          />
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

        {/* Footer - état normal */}
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
                {/* « Annuler » et non « Supprimer » : l'action passe le
                    statut à 'annule', la ligne reste en base pour l'historique
                    et le prévisionnel se recalcule. Le libellé disait le
                    contraire de ce que fait le bouton. */}
                <button
                  type="button" onClick={() => setShowConfirm(true)}
                  style={{
                    padding: '9px 18px', borderRadius: 8,
                    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--danger-bd)',
                    background: 'var(--danger-bg-soft)',
                    color: 'var(--danger-text)', cursor: 'pointer',
                    fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
                  }}
                >
                  Annuler la résa
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

        {/* Footer - état confirmation */}
        {showConfirm && (
          <div style={{
            padding: '14px 18px', borderTop: '1px solid var(--danger-bd)',
            background: 'var(--danger-bg-soft)', display: 'flex', flexDirection: 'column', gap: 10,
            borderRadius: '0 0 14px 14px',
          }}>
            <div style={{ fontSize: 13, color: 'var(--danger-text)', fontWeight: 600, lineHeight: 1.4 }}>
              Annuler la réservation de {resa.nom}
              {resa.date_service ? ` du ${formatDateLongue(resa.date_service).toLowerCase()}` : ''}
              {resa.heure_arrivee ? ` à ${(resa.heure_arrivee).slice(0, 5)}` : ''} ?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {/* Jamais désactivé. Une fois l'annulation partie, revenir en
                  arrière ne l'arrêterait pas : le bouton devient « Fermer »
                  et le toast donnera l'issue. */}
              <button
                type="button" onClick={deleting ? onClose : () => setShowConfirm(false)}
                style={{
                  padding: '8px 16px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
                }}
              >
                {deleting ? 'Fermer' : 'Annuler'}
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
                {deleting ? 'Annulation…' : "Confirmer l'annulation"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
