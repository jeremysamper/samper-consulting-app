import { useEffect, useRef, useState } from 'react';
import { notify } from '../../components/toast/index.js';
import { useReservations } from '../../hooks/useReservations.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { zurichNowMinutes } from '../../utils/zurichTime.js';
import { SERVICE_META } from './statutsReservation.js';
import { caseStyle } from './SaisieMobile.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// Client de passage, depuis le mode service : un client entre sans avoir
// réservé, on le compte en deux touchers (« + Passage », puis le nombre de
// couverts). Le nom est facultatif ; sans lui, la réservation s'appelle
// « Passage ».
//
// La réservation est créée « arrivée », à l'heure qu'il est (arrondie aux
// 5 minutes inférieures), sur le service affiché, avec l'origine 'passage'
// (migration 20261015_reservations_origine_passage) : le rapport des
// réservations la compte à part de l'équipe et du site. Aucune confirmation
// n'est envoyée, le client est déjà là. La table se donne ensuite sur le plan
// (glisser, ou « Assigner la table ») ; pour un client qu'on installe tout de
// suite à une table précise, « Client de passage » de la fiche de la table
// fait les deux d'un coup.
//
// Fermer pendant l'écriture reste possible : l'enregistrement va à son terme,
// son issue s'affiche en toast et le parent relit (voir ouvertRef).
// ═══════════════════════════════════════════════════════════════════════════

const COUVERTS_RAPIDES = [1, 2, 3, 4, 5, 6, 7, 8];
const PAS_HEURE = 5;
const pad = (n) => String(n).padStart(2, '0');

// 20:37 devient 20:35.
function heureArrondie() {
  const m = zurichNowMinutes();
  const t = m - (m % PAS_HEURE);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

export default function PassageRapide({ etablissementId, date, service, onClose, onSaved }) {
  const reservations = useReservations(etablissementId);
  const [nom, setNom] = useState('');
  const [autre, setAutre] = useState('');
  const [envoi, setEnvoi] = useState(false);
  // Garde synchrone : deux touchers rapprochés ne créent pas deux passages.
  const enCours = useRef(false);
  const ouvertRef = useRef(true);
  useEffect(() => {
    ouvertRef.current = true;
    return () => { ouvertRef.current = false; };
  }, []);

  useBackLayer(true, onClose, 'passage-rapide');

  const nbAutre = Number(autre) || 0;

  async function installer(n) {
    if (enCours.current || !(n >= 1)) return;
    enCours.current = true;
    setEnvoi(true);
    const heure = heureArrondie();
    const { data: resa, error } = await reservations.create({
      date_service:  date,
      service,
      heure_arrivee: heure,
      nb_couverts:   n,
      nom:           nom.trim() || 'Passage',
      est_groupe:    false,
      statut:        'arrive',
      origine:       'passage',
    });
    enCours.current = false;
    if (ouvertRef.current) setEnvoi(false);
    if (error || !resa) {
      notify(error || 'Client de passage non enregistré.', 'error');
      return;
    }
    notify(`${resa.nom}, ${n} couvert${n > 1 ? 's' : ''}, à table depuis ${heure}.`, 'success');
    onSaved?.(resa);
    if (ouvertRef.current) onClose();
  }

  const libelleService = SERVICE_META[service]?.label || service;

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
        role="dialog"
        aria-label="Client de passage"
        className="modal-sheet"
        style={{
          background: 'var(--surface)', borderRadius: 14,
          width: 420, maxWidth: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '14px 18px',
          borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
              Client de passage
            </div>
            {/* Deux nœuds de texte : la phrase est au glossaire, le service
                aussi. */}
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              <span>Sans réservation, installé maintenant</span>{' '}
              <span>({libelleService})</span>
            </div>
          </div>
          {/* Jamais désactivé, même pendant l'écriture (voir ouvertRef). */}
          <button
            type="button" onClick={onClose} aria-label="Fermer" className="ui-fermer"
            style={{
              background: 'none', border: 'none', fontSize: 22, minWidth: 44, minHeight: 44,
              cursor: 'pointer', color: 'var(--text2)', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Pas de focus d'office : le clavier cacherait les cases, et le
              nom n'est presque jamais demandé. */}
          <div>
            <label htmlFor="passage-nom" style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 5, display: 'block' }}>
              Nom{' '}
              <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optionnel)</span>
            </label>
            <input
              id="passage-nom"
              type="text"
              placeholder="Passage"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              autoComplete="off"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              style={{
                width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '9px 12px',
                borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8,
                background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 16,
              }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>
              Combien de couverts ?
            </div>
            {/* Un toucher sur un nombre enregistre le passage. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
              {COUVERTS_RAPIDES.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={envoi}
                  onClick={() => installer(n)}
                  aria-label={`${n} couvert${n > 1 ? 's' : ''}`}
                  style={caseStyle(false, {
                    minHeight: 52, fontFamily: 'var(--font-num)', fontSize: 18, fontWeight: 700,
                    cursor: envoi ? 'not-allowed' : 'pointer', opacity: envoi ? 0.5 : 1,
                  })}
                >
                  {n}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
              {envoi ? 'Enregistrement…' : 'Un toucher sur un nombre enregistre le passage.'}
            </div>
          </div>

          {/* Au-delà de 8 : au pavé numérique, puis le bouton. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="done"
              aria-label="Autre nombre de couverts" placeholder="Autre nombre"
              value={autre}
              onChange={(e) => setAutre(e.target.value.replace(/\D/g, '').slice(0, 2))}
              onKeyDown={(e) => { if (e.key === 'Enter' && nbAutre >= 1) installer(nbAutre); }}
              style={{
                width: 130, minWidth: 0, boxSizing: 'border-box', minHeight: 44, borderRadius: 10,
                textAlign: 'center', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
                background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-num)', fontSize: 17,
              }}
            />
            <button
              type="button"
              disabled={envoi || nbAutre < 1}
              onClick={() => installer(nbAutre)}
              style={{
                flex: 1, minHeight: 44, padding: '8px 12px', borderRadius: 10,
                borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--accent)',
                background: 'var(--accent)', color: 'var(--on-accent)',
                fontSize: 14, fontWeight: 700, fontFamily: 'var(--font)',
                cursor: envoi || nbAutre < 1 ? 'not-allowed' : 'pointer',
                opacity: envoi || nbAutre < 1 ? 0.5 : 1,
              }}
            >
              Installer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
