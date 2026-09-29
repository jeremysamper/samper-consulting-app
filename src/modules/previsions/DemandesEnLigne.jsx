import { useEffect, useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { useResumeRefresh } from '../../hooks/useResumeRefresh.js';
import { formatDateLongue } from '../../utils/dateHelpers.js';
import { listerDemandes, traiterDemande } from './reservationEnLigne.js';

// ─────────────────────────────────────────────────────────────────────────────
// Demandes de réservation venues du site, en tête du module.
//
// Une demande en ligne n'est pas une réservation comme les autres : le client
// attend une réponse. Elle doit se voir sans chercher dans quel jour elle est
// tombée, et se traiter d'un geste. Confirmer ou refuser prévient le client
// par e-mail (quand l'envoi est branché), sinon le toast rappelle de l'appeler.
// Rien ne s'affiche tant qu'il n'y a aucune demande.
// ─────────────────────────────────────────────────────────────────────────────

const SERVICES = { midi: 'Midi', soir: 'Soir', brunch: 'Brunch' };

export default function DemandesEnLigne({ etablissementId, refreshKey, onTraitee, onAllerAuJour }) {
  const [demandes, setDemandes] = useState([]);
  const [enCours, setEnCours] = useState(null); // id en cours de traitement

  async function charger() {
    if (!etablissementId) return;
    const { data } = await listerDemandes(etablissementId);
    setDemandes(data);
  }

  useEffect(() => { charger(); }, [etablissementId, refreshKey]); // charger est défini dans le composant, stable par construction
  useResumeRefresh(charger);

  async function traiter(resa, evenement) {
    if (evenement === 'refus' && !window.confirm(`Refuser la demande de ${resa.nom} (${resa.nb_couverts} pers.) du ${formatDateLongue(resa.date_service).toLowerCase()} ?`)) return;
    setEnCours(resa.id);
    const res = await traiterDemande(resa, evenement);
    setEnCours(null);
    if (res.error) { notify(res.error, 'error'); return; }
    notify(res.message, res.ton);
    setDemandes((prev) => prev.filter((r) => r.id !== resa.id));
    onTraitee?.();
  }

  if (!demandes.length) return null;

  return (
    <section
      aria-label="Demandes en ligne à confirmer"
      style={{
        marginTop: 14, padding: '12px 14px', borderRadius: 10,
        background: 'var(--warning-bg-soft)', border: '1px solid var(--warning-bd)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning-text)', marginBottom: 8 }}>
        {demandes.length === 1 ? '1 demande en ligne à confirmer' : `${demandes.length} demandes en ligne à confirmer`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {demandes.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '10px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)',
            }}
          >
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {r.nom} <span style={{ fontWeight: 500, color: 'var(--text2)' }}>· {r.nb_couverts} pers.</span>
              </div>
              <button
                type="button"
                onClick={() => onAllerAuJour?.(r.date_service)}
                style={{
                  padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
                  fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font)', fontWeight: 600,
                }}
              >
                {formatDateLongue(r.date_service)} · {SERVICES[r.service] || r.service} {(r.heure_arrivee || '').slice(0, 5)}
              </button>
              {r.notes_libres && (
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, overflowWrap: 'anywhere' }}>{r.notes_libres}</div>
              )}
              {r.telephone && (
                <a href={`tel:${String(r.telephone).replace(/\s/g, '')}`} style={{ display: 'block', width: 'fit-content', fontSize: 12, color: 'var(--text2)', textDecoration: 'none' }}>
                  {r.telephone}
                </a>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                disabled={enCours === r.id}
                onClick={() => traiter(r, 'refus')}
                style={{
                  padding: '8px 14px', minHeight: 40, borderRadius: 20, cursor: 'pointer',
                  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
                  background: 'var(--surface)', color: 'var(--text2)',
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)',
                }}
              >
                Refuser
              </button>
              <button
                type="button"
                disabled={enCours === r.id}
                onClick={() => traiter(r, 'confirmation')}
                style={{
                  padding: '8px 14px', minHeight: 40, borderRadius: 20, cursor: 'pointer',
                  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--success-bd)',
                  background: 'var(--success-bg-soft)', color: 'var(--success-text)',
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)',
                  opacity: enCours === r.id ? 0.6 : 1,
                }}
              >
                {enCours === r.id ? '…' : 'Confirmer'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
