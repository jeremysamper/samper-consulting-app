import { useState, useEffect, useRef } from 'react';
import { Btn } from '../../components/ui/index.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import { notify } from '../../components/toast/index.js';
import { useReservations } from '../../hooks/useReservations.js';
import { useResumeRefresh } from '../../hooks/useResumeRefresh.js';
import { useOrdreLectures } from '../../hooks/useOrdreLectures.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { formatDateLongue } from '../../utils/dateHelpers.js';
import { metaStatut, estPresent } from './statutsReservation.js';
import BandeauNonActualise from './BandeauNonActualise.jsx';
import ReservationDetailModal from './ReservationDetailModal.jsx';
import ReservationForm from './ReservationForm.jsx';
import PlanSalle from './PlanSalle.jsx';

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
function ResaCard({ resa, isMobile, onClick, onStatut, canEdit }) {
  const [hovered, setHovered] = useState(false);
  const tags = Array.isArray(resa.reservation_tags) ? resa.reservation_tags : [];
  const statut = resa.statut || 'confirme';
  const meta   = metaStatut(statut);
  const traite = statut !== 'confirme';

  return (
    <div
      role="button" tabIndex={0}
      onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 14px', borderRadius: 8,
        borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
        // Un liseré de statut plutôt qu'un fond teinté : la carte reste
        // lisible et l'état se lit d'un coup d'œil en balayant la colonne.
        borderLeftWidth: 3,
        borderLeftColor: traite ? meta.bordure : 'transparent',
        background: hovered ? 'var(--bg)' : 'var(--surface)',
        opacity: statut === 'parti' || statut === 'no_show' ? 0.6 : 1,
        cursor: 'pointer', transition: 'background 0.1s',
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '60px 1fr auto',
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

      {/* Statut : un tap suffit pour asseoir la table, le reste des états
          (parti, no-show) vit dans la fiche détail. Pendant le coup de feu on
          n'ouvre pas une modale pour cocher une arrivée. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        justifySelf: isMobile ? 'start' : 'end',
        marginTop: isMobile ? 4 : 0,
      }}>
        {canEdit && statut === 'confirme' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStatut?.(resa, 'arrive'); }}
            style={{
              padding: '6px 12px', borderRadius: 20, minHeight: 32,
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--success-bd)',
              background: 'var(--success-bg-soft)', color: 'var(--success-text)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
              whiteSpace: 'nowrap',
            }}>
            Arrivé
          </button>
        )}
        {traite && (
          <span style={{
            padding: '3px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700,
            borderWidth: 1, borderStyle: 'solid', borderColor: meta.bordure,
            background: meta.bg, color: meta.texte, fontFamily: 'var(--font)',
            whiteSpace: 'nowrap',
          }}>
            {meta.court}
          </span>
        )}
        {!isMobile && <span style={{ fontSize: 16, color: 'var(--text3)' }}>›</span>}
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────
export default function VueJour({ etablissementId, date, onBack, onResaUpdated, refreshKey, canEdit = true }) {
  const isMobile    = useIsMobile();
  const reservations = useReservations(etablissementId);
  const [resas,        setResas]        = useState(null);
  // Vrai d'entrée : sans ça le premier rendu, avant la première lecture,
  // annonçait « Aucune réservation ce jour ».
  const [loading,      setLoading]      = useState(Boolean(etablissementId && date));
  const [error,        setError]        = useState(null);
  const [nonActualise, setNonActualise] = useState(false);
  const [selectedResa, setSelectedResa] = useState(null);
  const [editingResa,  setEditingResa]  = useState(null);
  const [vue,          setVue]          = useState('liste'); // 'liste' | 'plan'
  const [creating,     setCreating]     = useState(false);

  // Reprise, retour d'une modification et bouton « Réessayer » peuvent lancer
  // des lectures qui se croisent : voir useOrdreLectures.
  const lectures   = useOrdreLectures();
  // Jour (établissement + date) dont les réservations sont à l'écran.
  const afficheRef = useRef(null);

  async function load() {
    if (!etablissementId || !date) return;
    const cle     = `${etablissementId}|${date}`;
    const lecture = lectures.lancer(cle);
    // Ce jour est déjà affiché (reprise après veille, retour d'une
    // modification) : relecture SILENCIEUSE. La liste et le plan de salle
    // restent montés, sans « Chargement… », et sont remplacés à l'arrivée.
    // Sinon on repart de zéro : les résas d'un autre jour sous ce titre
    // mentiraient.
    const silencieux = afficheRef.current === cle;
    if (!silencieux) {
      afficheRef.current = null;
      setResas(null);
      setLoading(true);
      setError(null);
      setNonActualise(false);
    }

    let res;
    try {
      res = await reservations.findByDate(date);
    } catch (e) {
      console.error('[VueJour] lecture des réservations', e);
      res = { data: null, error: 'Erreur technique. Réessaie ou contacte le support.' };
    }

    if (res.error) {
      if (!lecture.signalerEchec()) return;
      setLoading(false);
      // Une liste valide n'est jamais écrasée par un échec : elle reste
      // affichée, avec un bandeau qui dit qu'elle n'a pas pu être actualisée.
      if (silencieux) setNonActualise(true);
      else setError(res.error);
      return;
    }
    if (!lecture.appliquer()) return;
    afficheRef.current = cle;
    setResas((res.data || []).filter((r) => r.statut !== 'annule'));
    setLoading(false);
    setError(null);
    setNonActualise(false);
  }

  // refreshKey : une résa créée depuis le bandeau du module (ou modifiée par
  // une modale fermée avant la fin de son écriture) doit aussi apparaître ici.
  useEffect(() => { load(); }, [date, etablissementId, refreshKey]); // load est défini dans le composant, stable par construction

  // Réveil de la tablette, retour du réseau : resumeCoordinator décide du
  // moment (session saine d'abord), la relecture est silencieuse.
  useResumeRefresh(load);

  // Mise à jour optimiste : pendant le service, cocher une arrivée doit
  // répondre au doigt et non au réseau. En cas d'échec on remet l'état
  // d'avant plutôt que de laisser l'écran mentir.
  async function changerStatut(resa, statut) {
    const avant = resa.statut;
    setResas((prev) => (prev || []).map((r) => (r.id === resa.id ? { ...r, statut } : r)));
    const { error: err } = await reservations.setStatut(resa.id, statut);
    if (err) {
      setResas((prev) => (prev || []).map((r) => (r.id === resa.id ? { ...r, statut: avant } : r)));
      notify(err, 'error');
      return;
    }
    notify(`${resa.nom} · ${metaStatut(statut).label.toLowerCase()}`, 'success');
    // Un no-show sort des couverts prévus (trigger côté base) : la vue
    // semaine doit s'en apercevoir.
    if (statut === 'no_show' || avant === 'no_show') onResaUpdated?.();
  }

  const actives       = resas || [];
  // Un no-show n'est pas un couvert : le trigger l'exclut déjà de
  // previsions_jour, donc de la vue semaine. Le compter ici afficherait 14 au
  // jour et 10 à la semaine pour le même service. Les no-shows restent
  // visibles dans la liste - c'est le total qui les ignore.
  const comptees      = actives.filter((r) => r.statut !== 'no_show');
  const totalCouverts = comptees.reduce((s, r) => s + (r.nb_couverts || 0), 0);
  const totalGroupes  = comptees.filter((r) => r.est_groupe).length;
  const attables      = actives.filter((r) => r.statut === 'arrive')
    .reduce((s, r) => s + (r.nb_couverts || 0), 0);
  const resteAVenir   = actives.filter((r) => r.statut === 'confirme')
    .reduce((s, r) => s + (r.nb_couverts || 0), 0);
  const serviceEnCours = actives.some((r) => !estPresent(r.statut) || r.statut === 'arrive');

  return (
    <div>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginTop: 16, marginBottom: 14, flexWrap: 'wrap',
      }}>
        <Btn small onClick={onBack}>← Semaine</Btn>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
            {formatDateLongue(date)}
          </div>
          {!loading && actives.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>
              {totalCouverts} couvert{totalCouverts > 1 ? 's' : ''}
              {totalGroupes > 0 ? ` · ${totalGroupes} groupe${totalGroupes > 1 ? 's' : ''}` : ''}
              {serviceEnCours && attables > 0 && (
                <>
                  {' · '}
                  <span style={{ color: 'var(--success-text)', fontWeight: 700 }}>
                    {attables} à table
                  </span>
                  {resteAVenir > 0 ? ` · ${resteAVenir} attendu${resteAVenir > 1 ? 's' : ''}` : ''}
                </>
              )}
            </div>
          )}
        </div>
        {/* Ajout depuis le jour affiché : le bouton du bandeau de module
            ouvrait toujours le formulaire sur aujourd'hui, obligeant à
            resaisir la date qu'on avait justement sous les yeux. */}
        {canEdit && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{
              padding: '9px 16px', borderRadius: 8, border: 'none', minHeight: 44,
              background: 'var(--accent)', color: '#fff',
              fontSize: 13, fontWeight: 600, fontFamily: 'var(--font)',
              cursor: 'pointer', flexShrink: 0,
            }}>
            + Réservation
          </button>
        )}
      </div>

      {/* ── Liste ↔ plan de salle ── */}
      <SegmentedTabs
        tabs={[
          { id: 'liste', label: 'Liste' },
          { id: 'plan',  label: 'Plan de salle' },
        ]}
        active={vue}
        onChange={setVue}
        size="sm"
        style={{ marginBottom: 12 }}
      />

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

      {/* ── Relecture en échec : la liste affichée reste en place. En vue
             plan, c'est PlanSalle qui porte l'unique bandeau. ── */}
      {nonActualise && vue !== 'plan' && <BandeauNonActualise onRetry={load} />}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 13 }}>
          Chargement…
        </div>
      )}

      {/* ── Plan de salle ── */}
      {vue === 'plan' && !loading && !error && (
        <PlanSalle
          etablissementId={etablissementId}
          date={date}
          resas={actives}
          canEdit={canEdit}
          onOpenResa={setSelectedResa}
          resasNonActualisees={nonActualise}
          onRelireResas={load}
        />
      )}

      {/* ── État vide ── */}
      {vue === 'liste' && !loading && !error && actives.length === 0 && (
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
      {vue === 'liste' && !loading && actives.length > 0 && SERVICES_ORDER.map((svc) => {
        const groupe = actives
          .filter((r) => r.service === svc)
          .sort((a, b) => (a.heure_arrivee || '').localeCompare(b.heure_arrivee || ''));
        if (!groupe.length) return null;
        // Même règle que le total du jour : le no-show ne compte pas.
        const sub  = groupe.filter((r) => r.statut !== 'no_show')
          .reduce((s, r) => s + (r.nb_couverts || 0), 0);
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
                  canEdit={canEdit}
                  onStatut={changerStatut}
                  onClick={() => setSelectedResa(resa)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Modal détail ──
          onResaUpdated / onSaved relisent sans refermer à l'aveugle : c'est la
          modale qui se ferme elle-même, et seulement si elle est encore
          ouverte. Fermée pendant l'écriture, son écriture aboutit quand même,
          et refermer ici fermerait la modale ouverte entre-temps. Seule
          exception : une fiche rouverte sur la résa que l'on vient d'annuler. */}
      {selectedResa && (
        <ReservationDetailModal
          resa={actives.find((r) => r.id === selectedResa.id) || selectedResa}
          onClose={() => setSelectedResa(null)}
          onEdit={canEdit ? (resa) => { setSelectedResa(null); setEditingResa(resa); } : undefined}
          onStatut={canEdit ? changerStatut : undefined}
          onResaUpdated={(annuleeId) => {
            if (annuleeId) {
              setSelectedResa((cur) => (cur?.id === annuleeId ? null : cur));
              setEditingResa((cur) => (cur?.id === annuleeId ? null : cur));
            }
            load();
            onResaUpdated?.();
          }}
          canEdit={canEdit}
        />
      )}

      {/* ── Création pour le jour affiché ── */}
      {canEdit && creating && (
        <ReservationForm
          etablissementId={etablissementId}
          initialDate={date}
          onClose={() => setCreating(false)}
          onSaved={() => { load(); onResaUpdated?.(); }}
        />
      )}

      {/* ── Formulaire modification (rôles éditeurs uniquement) ── */}
      {canEdit && editingResa && (
        <ReservationForm
          etablissementId={etablissementId}
          initialResa={editingResa}
          onClose={() => setEditingResa(null)}
          onSaved={() => { load(); onResaUpdated?.(); }}
        />
      )}
    </div>
  );
}
