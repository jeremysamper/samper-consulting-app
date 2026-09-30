import { useState, useEffect } from 'react';
import { zurichNowMinutes } from '../../utils/zurichTime.js';
import { metaStatut, minutesDeRetard } from './statutsReservation.js';

// ═══════════════════════════════════════════════════════════════════════════
// Mode service : la colonne des réservations, à côté du plan de salle.
//
// Ce que l'hôte regarde en plein service, dans cet ordre : qui reste à
// confirmer, qui est attendu (et qui est en retard), qui est à table, qui est
// parti. Chaque ligne se glisse sur une table du plan (poignée ⠿) et se fait
// avancer d'un tap (« Arrivé », puis « Parti ») : pas de modale pour cocher
// une arrivée au coup de feu. Toucher le nom ouvre la fiche complète (no-show,
// modification, annulation).
// ═══════════════════════════════════════════════════════════════════════════

// Au-delà, une réservation attendue est signalée en retard.
const TOLERANCE_RETARD = 15;

// Minute courante à Zurich, rafraîchie toutes les 30 s : les retards
// apparaissent sans toucher à l'écran.
function useMinuteCourante() {
  const [minute, setMinute] = useState(() => zurichNowMinutes());
  useEffect(() => {
    const id = setInterval(() => setMinute(zurichNowMinutes()), 30000);
    return () => clearInterval(id);
  }, []);
  return minute;
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
// « 20 min », « 1 h 05 » : au-delà d'une heure, des minutes ne se lisent plus.
const duree = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);
const couverts = (liste) => liste.reduce((s, r) => s + (r.nb_couverts || 0), 0);

function BoutonAction({ label, ton, onClick }) {
  const couleurs = ton === 'succes'
    ? { bd: 'var(--success-bd)', bg: 'var(--success-bg-soft)', tx: 'var(--success-text)' }
    : { bd: 'var(--border)', bg: 'var(--surface)', tx: 'var(--text2)' };
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        flexShrink: 0, minHeight: 40, padding: '6px 12px', borderRadius: 20,
        borderWidth: 1, borderStyle: 'solid', borderColor: couleurs.bd,
        background: couleurs.bg, color: couleurs.tx,
        fontSize: 12, fontWeight: 700, fontFamily: 'var(--font)',
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function LigneResa({
  resa, date, minute, tables, canEdit, enCours,
  onPointerDownResa, onOpen, onStatut, onTraiter,
}) {
  const statut  = resa.statut || 'confirme';
  const retard  = minutesDeRetard(resa, date, minute);
  const enRetard = retard > TOLERANCE_RETARD;
  const tags    = Array.isArray(resa.reservation_tags) ? resa.reservation_tags : [];
  const allergies = tags.filter((t) => t.type_tag === 'allergene' && t.valeur).map((t) => t.valeur);
  const autres    = tags.filter((t) => t.type_tag !== 'allergene' && t.valeur).map((t) => t.valeur);
  const placee  = tables.length > 0;
  const termine = statut === 'parti' || statut === 'no_show';
  const deplacable = canEdit && !termine;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 8px', borderRadius: 10,
      borderWidth: 1, borderStyle: 'solid',
      borderColor: enRetard ? 'var(--danger-bd)' : 'var(--border)',
      background: 'var(--surface)',
      opacity: enCours ? 0.35 : termine ? 0.6 : 1,
    }}>
      {/* Poignée : seule zone où le doigt ne fait pas défiler la liste */}
      {deplacable && (
        <span
          data-plan-poignee={resa.id}
          onPointerDown={(e) => onPointerDownResa(e, resa)}
          aria-label={placee ? `Ajouter une table à ${resa.nom}` : `Placer ${resa.nom}`}
          title={placee ? 'Glisser sur une autre table pour agrandir ou changer la tablée' : 'Glisser sur une table'}
          style={{
            flexShrink: 0, width: 30, height: 44, marginLeft: -4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'grab', touchAction: 'none',
            color: 'var(--text3)', fontSize: 15, lineHeight: 1,
            userSelect: 'none', WebkitUserSelect: 'none',
          }}
        >
          ⠿
        </span>
      )}

      <button
        type="button"
        onClick={() => onOpen?.(resa)}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', background: 'none',
          border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: 'var(--font)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span style={{
            fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-num)', flexShrink: 0,
            color: enRetard ? 'var(--danger-text)' : 'var(--accent)',
          }}>
            {(resa.heure_arrivee || '').slice(0, 5)}
          </span>
          <span style={{
            fontSize: 13, fontWeight: 700, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
            textDecoration: statut === 'no_show' ? 'line-through' : 'none',
          }}>
            {resa.nom}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', flexShrink: 0 }}>
            {resa.nb_couverts} p.
          </span>
        </div>
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px',
          marginTop: 2, fontSize: 11, lineHeight: 1.35,
        }}>
          <span style={{ fontWeight: 700, color: placee ? 'var(--success-text)' : 'var(--text3)' }}>
            {placee ? `Table ${tables.join(' + ')}` : termine ? metaStatut(statut).label : 'À placer'}
          </span>
          {enRetard && (
            <span style={{ fontWeight: 700, color: 'var(--danger-text)' }}>
              retard {duree(retard)}
            </span>
          )}
          {resa.est_groupe && <span style={{ color: 'var(--info-text)', fontWeight: 600 }}>groupe</span>}
          {allergies.length > 0 && (
            <span style={{ color: 'var(--danger-text)', fontWeight: 700 }}>{allergies.join(', ')}</span>
          )}
          {autres.length > 0 && <span style={{ color: 'var(--text2)' }}>{autres.join(', ')}</span>}
        </div>
        {resa.notes_libres && (
          <div style={{
            fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {resa.notes_libres}
          </div>
        )}
      </button>

      {canEdit && statut === 'demande' && onTraiter && (
        <BoutonAction label="Confirmer" ton="succes" onClick={() => onTraiter(resa, 'confirmation')} />
      )}
      {canEdit && statut === 'confirme' && onStatut && (
        <BoutonAction label="Arrivé" ton="succes" onClick={() => onStatut(resa, 'arrive')} />
      )}
      {canEdit && statut === 'arrive' && onStatut && (
        <BoutonAction label="Parti" onClick={() => onStatut(resa, 'parti')} />
      )}
    </div>
  );
}

function Section({ titre, detail, children, ton }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
        fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
        color: ton === 'alerte' ? 'var(--warning-text)' : ton === 'succes' ? 'var(--success-text)' : 'var(--text2)',
      }}>
        <span>{titre}</span>
        {detail && <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: 'var(--text3)' }}>{detail}</span>}
      </div>
      {children}
    </section>
  );
}

export default function ServicePanneau({
  resas, date, tablesParResa, canEdit, dragResaId, retraitPossible,
  onPointerDownResa, onOpen, onStatut, onTraiter,
}) {
  const minute = useMinuteCourante();
  const [voirTermines, setVoirTermines] = useState(false);

  const demandes = resas.filter((r) => r.statut === 'demande');
  const attendus = resas.filter((r) => (r.statut || 'confirme') === 'confirme');
  const aTable   = resas.filter((r) => r.statut === 'arrive');
  const termines = resas.filter((r) => r.statut === 'parti' || r.statut === 'no_show');

  const ligne = (r) => (
    <LigneResa
      key={r.id}
      resa={r}
      date={date}
      minute={minute}
      tables={tablesParResa.get(r.id) || []}
      canEdit={canEdit}
      enCours={dragResaId === r.id}
      onPointerDownResa={onPointerDownResa}
      onOpen={onOpen}
      onStatut={onStatut}
      onTraiter={onTraiter}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {retraitPossible && (
        <div style={{
          padding: '10px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
          borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--accent)',
          color: 'var(--accent)', textAlign: 'center',
        }}>
          Lâche ici pour retirer du plan
        </div>
      )}

      {resas.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text3)', padding: '10px 2px', lineHeight: 1.5 }}>
          Aucune réservation sur ce service.
        </div>
      )}

      {demandes.length > 0 && (
        <Section titre={`À confirmer · ${demandes.length}`} detail={pluriel(couverts(demandes), 'couvert')} ton="alerte">
          {demandes.map(ligne)}
        </Section>
      )}

      {resas.length > 0 && (
        <Section titre={`Attendus · ${attendus.length}`} detail={pluriel(couverts(attendus), 'couvert')}>
          {attendus.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>Plus personne n'est attendu.</div>
            : attendus.map(ligne)}
        </Section>
      )}

      {aTable.length > 0 && (
        <Section titre={`À table · ${aTable.length}`} detail={pluriel(couverts(aTable), 'couvert')} ton="succes">
          {aTable.map(ligne)}
        </Section>
      )}

      {termines.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setVoirTermines((v) => !v)}
            aria-expanded={voirTermines}
            style={{
              width: '100%', minHeight: 40, padding: '6px 2px', textAlign: 'left',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
              fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
              color: 'var(--text3)',
            }}
          >
            {voirTermines ? '▾' : '▸'} Partis et no-shows · {termines.length}
          </button>
          {voirTermines && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {termines.map(ligne)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
