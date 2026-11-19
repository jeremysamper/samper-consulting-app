import { useState } from 'react';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { metaStatut } from './statutsReservation.js';
import { enRetard, hhmm, minutesDe } from '../salle/planTemps.js';
import { allergiesDe } from './PlanTable.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// La colonne des réservations du service, à côté du plan de salle.
//
// Ce que l'hôte regarde, dans cet ordre : ce qui reste à confirmer, ce qui
// reste à placer, qui est attendu (et qui est en retard), qui est à table,
// qui est parti. Une carte blanche, des lignes séparées par un filet doux.
//
// Toucher une ligne la choisit : sa table s'allume sur le plan. Une
// réservation sans table se place alors au toucher d'une table (les tables
// qui conviennent sont en pointillés). Chaque ligne porte un seul bouton :
// la table proposée pour celles à placer, « Arrivé » pour les attendues,
// « Parti » pour celles à table. La poignée garde le glisser sur le plan, à
// la souris et sur tablette.
// ─────────────────────────────────────────────────────────────────────────────

const couverts = (liste) => liste.reduce((s, r) => s + (Number(r.nb_couverts) || 0), 0);
const duree = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);

function Action({ label, ton = 'neutre', onClick, titre }) {
  const tons = {
    succes: { bg: 'var(--success-bg-soft)', tx: 'var(--success-text)', bd: 'var(--success-bd)' },
    neutre: { bg: 'var(--btn-fond)', tx: 'var(--btn-texte)', bd: 'var(--btn-bord)' },
    table: { bg: 'var(--piste)', tx: 'var(--text)', bd: 'var(--piste)' },
  };
  const c = tons[ton];
  return (
    <button
      type="button"
      title={titre}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        flexShrink: 0, minHeight: 36, padding: '6px 12px', borderRadius: 'var(--r-full)',
        borderWidth: 1, borderStyle: 'solid', borderColor: c.bd, background: c.bg, color: c.tx,
        fontSize: 'var(--t1)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function Ligne({
  resa, tables, minute, canEdit, glisser, choisie, enCours, proposition,
  onChoisir, onPointerDownResa, onPlacer, onStatut, onTraiter,
}) {
  const statut = resa.statut || 'confirme';
  const retard = enRetard(resa, minute);
  const placee = tables.length > 0;
  const termine = statut === 'parti' || statut === 'no_show';
  const allergies = allergiesDe(resa);
  const tags = (Array.isArray(resa.reservation_tags) ? resa.reservation_tags : [])
    .filter((t) => t.type_tag !== 'allergene' && t.valeur).map((t) => t.valeur);
  const heure = hhmm(minutesDe(resa.heure_arrivee) ?? 0);

  let action = null;
  if (canEdit && statut === 'demande' && onTraiter) action = <Action label="Confirmer" ton="succes" onClick={() => onTraiter(resa, 'confirmation')} />;
  else if (canEdit && !placee && !termine && proposition) action = <Action label={<><span>Table</span> <span data-no-translate="">{proposition}</span></>} ton="table" titre="Placer à la table proposée" onClick={() => onPlacer(resa)} />;
  else if (canEdit && statut === 'confirme' && onStatut) action = <Action label="Arrivé" ton="succes" onClick={() => onStatut(resa, 'arrive')} />;
  else if (canEdit && statut === 'arrive' && onStatut) action = <Action label="Parti" onClick={() => onStatut(resa, 'parti')} />;

  return (
    <div
      data-plan-ligne={resa.id}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, minHeight: 'var(--ligne-aeree)',
        padding: '4px 6px', margin: '0 -6px', borderRadius: 'var(--r)',
        borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: choisie ? 'transparent' : 'var(--rule-soft)',
        background: choisie ? 'var(--selection)' : 'transparent',
        opacity: enCours ? 0.4 : termine ? 0.7 : 1,
      }}
    >
      {canEdit && glisser && !termine && (
        <span
          data-plan-poignee={resa.id}
          onPointerDown={(e) => onPointerDownResa(e, resa)}
          aria-hidden="true"
          title={placee ? 'Glisser sur une autre table pour agrandir la tablée' : 'Glisser sur une table'}
          style={{
            flexShrink: 0, width: 24, height: 40, marginLeft: -4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text3)', cursor: 'grab', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
          }}
        >
          <GripVertical size={16} strokeWidth={2} />
        </span>
      )}
      <button
        type="button"
        onClick={() => onChoisir(resa)}
        aria-pressed={choisie}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: '4px 0',
          cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span data-no-translate="" style={{ fontFamily: 'var(--font-num)', fontSize: 'var(--t2)', color: retard ? 'var(--warning-text)' : 'var(--text2)', flexShrink: 0 }}>
            {heure}
          </span>
          <span data-no-translate="" style={{
            fontSize: 'var(--t2)', fontWeight: 'var(--g2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textDecoration: statut === 'no_show' ? 'line-through' : 'none',
          }}>
            {resa.nom}
          </span>
          <span style={{ fontSize: 'var(--t1)', color: 'var(--text2)', flexShrink: 0 }}>
            <span data-no-translate="">{resa.nb_couverts}</span> <span>couv.</span>
          </span>
        </span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0 8px', marginTop: 2, fontSize: 'var(--t1)', lineHeight: 1.4 }}>
          <span style={{ color: placee ? 'var(--text)' : 'var(--text3)', fontWeight: placee ? 'var(--g2)' : 'var(--g1)' }}>
            {placee
              ? <><span>Table</span> <span data-no-translate="">{tables.join(' + ')}</span></>
              : termine ? metaStatut(statut).label : 'À placer'}
          </span>
          {retard > 0 && (
            <span style={{ color: 'var(--warning-text)', fontWeight: 'var(--g2)' }}>
              <span>retard</span> <span data-no-translate="">{duree(retard)}</span>
            </span>
          )}
          {resa.est_groupe && <span style={{ color: 'var(--info-text)' }}>groupe</span>}
          {resa.passeport_gourmand && <span style={{ color: 'var(--success-text)' }}>Passeport gourmand</span>}
          {allergies.length > 0 && <span style={{ color: 'var(--danger-text)', fontWeight: 'var(--g2)' }} data-no-translate="">{allergies.join(', ')}</span>}
          {tags.length > 0 && <span style={{ color: 'var(--text2)' }} data-no-translate="">{tags.join(', ')}</span>}
        </span>
        {resa.notes_libres && (
          <span data-no-translate="" style={{ display: 'block', marginTop: 1, fontSize: 'var(--t1)', color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {resa.notes_libres}
          </span>
        )}
      </button>
      {action}
    </div>
  );
}

function Section({ titre, n, detail, ton, children }) {
  const couleur = ton === 'alerte' ? 'var(--warning-text)' : 'var(--text)';
  return (
    <section style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '10px 0 4px', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: couleur }}>
        <span>{titre}</span>
        <span data-no-translate="" style={{ fontWeight: 'var(--g1)', color: 'var(--text3)' }}>{n}</span>
        {detail && <span style={{ marginLeft: 'auto', fontSize: 'var(--t1)', fontWeight: 'var(--g1)', color: 'var(--text3)' }}>{detail}</span>}
      </div>
      {children}
    </section>
  );
}

export default function PlanListe({
  resas, tablesParResa, minute, canEdit, glisser = true, choisieId = null, dragResaId = null, retraitPossible = false,
  propositions = new Map(), onChoisir, onPointerDownResa, onPlacer, onStatut, onTraiter,
}) {
  const [voirTermines, setVoirTermines] = useState(false);
  const placee = (r) => (tablesParResa.get(r.id) || []).length > 0;
  const termine = (r) => r.statut === 'parti' || r.statut === 'no_show';
  const demandes = resas.filter((r) => r.statut === 'demande');
  const aPlacer = resas.filter((r) => !termine(r) && r.statut !== 'demande' && !placee(r));
  const attendus = resas.filter((r) => (r.statut || 'confirme') === 'confirme' && placee(r));
  const aTable = resas.filter((r) => r.statut === 'arrive' && placee(r));
  const termines = resas.filter(termine);

  const ligne = (r) => (
    <Ligne
      key={r.id}
      resa={r}
      tables={tablesParResa.get(r.id) || []}
      minute={minute}
      canEdit={canEdit}
      glisser={glisser}
      choisie={choisieId === r.id}
      enCours={dragResaId === r.id}
      proposition={propositions.get(r.id) || null}
      onChoisir={onChoisir}
      onPointerDownResa={onPointerDownResa}
      onPlacer={onPlacer}
      onStatut={onStatut}
      onTraiter={onTraiter}
    />
  );
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {retraitPossible && (
        <div style={{
          margin: '4px 0 6px', padding: '10px 12px', borderRadius: 'var(--r)', textAlign: 'center',
          borderWidth: 1, borderStyle: 'dashed', borderColor: 'var(--accent)', color: 'var(--text)',
          fontSize: 'var(--t1)', fontWeight: 'var(--g2)',
        }}>
          Lâchez ici pour retirer du plan
        </div>
      )}
      {resas.length === 0 && (
        <div style={{ padding: '14px 0', fontSize: 'var(--t2)', color: 'var(--text3)', lineHeight: 1.5 }}>
          Aucune réservation sur ce service.
        </div>
      )}
      {demandes.length > 0 && (
        <Section titre="À confirmer" n={demandes.length} detail={pluriel(couverts(demandes), 'couvert')} ton="alerte">{demandes.map(ligne)}</Section>
      )}
      {aPlacer.length > 0 && (
        <Section titre="À placer" n={aPlacer.length} detail={pluriel(couverts(aPlacer), 'couvert')}>{aPlacer.map(ligne)}</Section>
      )}
      {attendus.length > 0 && (
        <Section titre="Attendus" n={attendus.length} detail={pluriel(couverts(attendus), 'couvert')}>{attendus.map(ligne)}</Section>
      )}
      {aTable.length > 0 && (
        <Section titre="À table" n={aTable.length} detail={pluriel(couverts(aTable), 'couvert')}>{aTable.map(ligne)}</Section>
      )}
      {termines.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setVoirTermines((v) => !v)}
            aria-expanded={voirTermines}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%', minHeight: 44, padding: '6px 0', textAlign: 'left',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)',
              fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text2)',
            }}
          >
            {voirTermines ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
            <span>Partis et no-shows</span>
            <span data-no-translate="" style={{ fontWeight: 'var(--g1)', color: 'var(--text3)' }}>{termines.length}</span>
          </button>
          {voirTermines && termines.map(ligne)}
        </section>
      )}
    </div>
  );
}
