import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { formatDateLongue } from '../../utils/dateHelpers.js';
import { zurichClock, zurichToday } from '../../utils/zurichTime.js';
import { SERVICE_META, SERVICES_AFFICHES, serviceAffiche, serviceEnCours } from './statutsReservation.js';
import { useReservationsJour } from './useReservationsJour.js';
import ReservationDetailModal from './ReservationDetailModal.jsx';
import ReservationForm from './ReservationForm.jsx';
import PlanSalle from './PlanSalle.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// Mode service : l'écran de l'hôte pendant le service, en plein écran.
//
// Écran scindé en deux : le plan de salle à gauche, les réservations du
// service à droite (à confirmer, attendues, à table, parties). On place un
// client en le glissant sur une table, on coche son arrivée d'un tap. Tout
// est en temps réel : l'iPad de l'entrée et l'écran du bureau voient le même
// service.
//
// Plein écran par un portail sur <body> : le menu et la barre du haut ne
// mangent pas la place du plan. « Quitter » ou le geste retour referment.
// ═══════════════════════════════════════════════════════════════════════════

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const couverts = (liste) => liste.reduce((s, r) => s + (r.nb_couverts || 0), 0);

function Horloge() {
  const [heure, setHeure] = useState(() => zurichClock());
  useEffect(() => {
    const id = setInterval(() => setHeure(zurichClock()), 15000);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-num)', color: 'var(--text)' }}>
      {heure}
    </span>
  );
}

function Compteur({ valeur, label, couleur }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
      <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-num)', color: couleur || 'var(--text)' }}>
        {valeur}
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text3)' }}>
        {label}
      </span>
    </div>
  );
}

export default function ModeService({ etablissementId, date, canEdit, onClose, onChange }) {
  const isMobile = useIsMobile();
  const {
    resas, loading, error, nonActualise, load, changerStatut, traiter: traiterJour,
  } = useReservationsJour(etablissementId, date, { onChange, tempsReel: true });
  const [service,      setService]      = useState(null);
  const [selectedResa, setSelectedResa] = useState(null);
  const [editingResa,  setEditingResa]  = useState(null);
  const [creating,     setCreating]     = useState(false);

  // Le geste retour (Android, glissé depuis le bord, Alt+←) quitte le mode
  // service au lieu de quitter le module.
  useBackLayer(true, onClose, 'mode-service');

  // Service ouvert d'office, une fois les réservations connues : celui de
  // l'heure qu'il est (voir serviceEnCours).
  useEffect(() => {
    if (service === null && resas !== null) setService(serviceEnCours(date, resas));
  }, [service, resas, date]);

  async function traiter(resa, evenement) {
    const ok = await traiterJour(resa, evenement);
    if (ok && evenement === 'refus') setSelectedResa((cur) => (cur?.id === resa.id ? null : cur));
  }

  const actives   = resas || [];
  const svc       = service || 'soir';
  // Brunch compris dans le midi : c'est le midi du dimanche.
  const duService = actives.filter((r) => serviceAffiche(r.service) === svc);
  const aTable    = duService.filter((r) => r.statut === 'arrive');
  const attendus  = duService.filter((r) => r.statut === 'confirme' || r.statut === 'demande');
  const prevus    = duService.filter((r) => r.statut !== 'no_show');
  const parService = Object.fromEntries(SERVICES_AFFICHES.map((s) => [
    s, couverts(actives.filter((r) => serviceAffiche(r.service) === s && r.statut !== 'no_show')),
  ]));
  const onglets = SERVICES_AFFICHES;
  const aujourdhui = date === zurichToday();

  const ecran = (
    // Pas role="dialog" : sur mobile, app.css donne 8 px de marge à tout
    // dialogue (fenêtres modales), et le plein écran laissait voir la page.
    <div
      role="region"
      aria-label="Mode service"
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* ── En-tête ── */}
      <header style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: isMobile ? 10 : 18,
        padding: isMobile ? '10px 12px' : '12px 18px',
        background: 'var(--surface)',
        borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>
            Mode service
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {formatDateLongue(date)}{aujourdhui ? '' : ', pas aujourd’hui'}
          </div>
        </div>

        {service !== null && (
          <SegmentedTabs
            tabs={onglets.map((s) => ({
              id: s,
              label: parService[s] ? `${SERVICE_META[s].label} (${parService[s]})` : SERVICE_META[s].label,
            }))}
            active={svc}
            onChange={setService}
          />
        )}

        {service !== null && !isMobile && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Compteur valeur={couverts(aTable)} label="à table" couleur="var(--success-text)" />
            <Compteur valeur={couverts(attendus)} label="attendus" couleur="var(--accent)" />
            <Compteur valeur={couverts(prevus)} label="couverts" />
          </div>
        )}

        <div style={{ flex: 1 }} />

        {aujourdhui && !isMobile && <Horloge />}

        {canEdit && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              minHeight: 44, padding: '9px 16px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: 'var(--on-accent)',
              fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer',
            }}
          >
            + Réservation
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{
            minHeight: 44, padding: '9px 16px', borderRadius: 8,
            borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
            background: 'var(--surface)', color: 'var(--text)',
            fontSize: 13, fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer',
          }}
        >
          Quitter
        </button>

        {/* Compteurs sur téléphone : une ligne à part, sous les boutons. */}
        {service !== null && isMobile && (
          <div style={{ width: '100%', fontSize: 12, color: 'var(--text2)' }}>
            <strong style={{ color: 'var(--success-text)' }}>{pluriel(couverts(aTable), 'couvert')} à table</strong>
            {', '}{couverts(attendus)} attendus, {pluriel(couverts(prevus), 'couvert')} prévus
          </div>
        )}
      </header>

      {/* ── Plan + réservations ── */}
      <main style={{
        flex: 1, minHeight: 0,
        padding: isMobile ? 10 : 14,
        overflowY: isMobile ? 'auto' : 'hidden',
        // Le défilement du téléphone ne passe pas à la page restée derrière.
        overscrollBehavior: 'contain',
        display: 'flex', flexDirection: 'column',
      }}>
        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, background: 'var(--danger-bg-soft)',
            borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--danger-bd)',
            color: 'var(--danger-text)', fontSize: 13, marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <span>{error}</span>
            <button type="button" onClick={load} style={{
              minHeight: 40, padding: '6px 12px', borderRadius: 6,
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--danger-bd)',
              background: 'transparent', color: 'var(--danger-text)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
            }}>
              Réessayer
            </button>
          </div>
        )}

        {(loading || (service === null && !error)) && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text3)', fontSize: 13 }}>
            Chargement du service…
          </div>
        )}

        {!loading && !error && service !== null && (
          <div style={{ flex: 1, minHeight: 0 }}>
            <PlanSalle
              etablissementId={etablissementId}
              date={date}
              resas={actives}
              canEdit={canEdit}
              variante="service"
              service={svc}
              onOpenResa={setSelectedResa}
              onStatut={canEdit ? changerStatut : undefined}
              onTraiter={canEdit ? traiter : undefined}
              resasNonActualisees={nonActualise}
              onRelireResas={load}
              onResasModifiees={() => { load(); onChange?.(); }}
            />
          </div>
        )}
      </main>

      {/* ── Fiche d'une réservation ──
          Même contrat que la vue jour : la modale se ferme elle-même, le parent
          relit seulement ; seule une résa annulée ferme sa propre fiche. */}
      {selectedResa && (
        <ReservationDetailModal
          resa={actives.find((r) => r.id === selectedResa.id) || selectedResa}
          onClose={() => setSelectedResa(null)}
          onEdit={canEdit ? (resa) => { setSelectedResa(null); setEditingResa(resa); } : undefined}
          onStatut={canEdit ? changerStatut : undefined}
          onTraiter={canEdit ? traiter : undefined}
          onResaUpdated={(annuleeId) => {
            if (annuleeId) {
              setSelectedResa((cur) => (cur?.id === annuleeId ? null : cur));
              setEditingResa((cur) => (cur?.id === annuleeId ? null : cur));
            }
            load();
            onChange?.();
          }}
          canEdit={canEdit}
        />
      )}

      {/* ── Client de passage ou appel pendant le service : pré-rempli sur
             le jour et le service affichés. ── */}
      {canEdit && creating && (
        <ReservationForm
          etablissementId={etablissementId}
          initialDate={date}
          initialService={svc}
          onClose={() => setCreating(false)}
          onSaved={() => { load(); onChange?.(); }}
        />
      )}

      {canEdit && editingResa && (
        <ReservationForm
          key={editingResa.id}
          etablissementId={etablissementId}
          initialResa={editingResa}
          onClose={() => setEditingResa(null)}
          onSaved={() => { load(); onChange?.(); }}
        />
      )}
    </div>
  );

  return typeof document === 'undefined' ? ecran : createPortal(ecran, document.body);
}
