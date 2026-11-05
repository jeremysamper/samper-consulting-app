import React from 'react';
import { PLAN_W, PLAN_H } from '../../hooks/usePlanSalle.js';
import { TabBar } from '../../components/ui/index.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Plan de salle compact, en lecture : une vignette par salle, les tables
// posées aux coordonnées du canevas virtuel 1000 x 700 (usePlanSalle), mises
// à l'échelle en pourcentages. Aucune édition ici : un tap sur une table
// appelle onTapTable. Une table qui porte un ticket ouvert est marquée
// (fond accent). Sans mobilier dessiné, repli en liste de boutons.
// Les noms de tables sont des données : data-no-translate.
// ─────────────────────────────────────────────────────────────────────────────

export default function PlanTables({ salles, tables, ticketsParTable, onTapTable }) {
  const sallesAvecTables = (salles || []).filter((s) => (tables || []).some((t) => t.salle_id === s.id));
  const [salleId, setSalleId] = React.useState(null);
  const tablesActives = (tables || []).filter((t) => t.actif !== false);

  if (!tablesActives.length) return null;

  // Tables sans salle (plan d'avant les espaces) : une vignette unique.
  const horsSalle = tablesActives.filter((t) => !t.salle_id);
  const onglets = sallesAvecTables.map((s) => ({ id: s.id, label: s.nom }));
  if (horsSalle.length && onglets.length) onglets.push({ id: '_autres', label: 'Autres tables' });
  const actif = salleId || onglets[0]?.id || '_autres';
  const visibles = actif === '_autres' || !onglets.length
    ? horsSalle
    : tablesActives.filter((t) => t.salle_id === actif);

  return (
    <div style={st.bloc}>
      {onglets.length > 1 && (
        <TabBar tabs={onglets} active={actif} onChange={setSalleId} />
      )}
      <div style={st.canevas} data-no-translate>
        {visibles.map((t) => {
          const ticket = ticketsParTable?.[t.id];
          const ronde = t.forme === 'ronde' || t.forme === 'tabouret';
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTapTable(t, ticket)}
              style={{
                ...st.table,
                left: `${(t.pos_x / PLAN_W) * 100}%`,
                top: `${(t.pos_y / PLAN_H) * 100}%`,
                width: `${(t.largeur / PLAN_W) * 100}%`,
                height: `${(t.hauteur / PLAN_H) * 100}%`,
                borderRadius: ronde ? '50%' : 10,
                ...(ticket ? st.tableOccupee : null),
              }}
            >
              <span style={st.tableNom}>{t.nom}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const st = {
  bloc: { display: 'flex', flexDirection: 'column', gap: 10 },
  canevas: {
    position: 'relative',
    width: '100%',
    maxWidth: 900,
    aspectRatio: '10 / 7',
    background: 'var(--surface2)',
    borderRadius: 'var(--r-lg)',
    overflow: 'hidden',
  },
  // Cibles tactiles : jamais sous 44 px, même pour un tabouret minuscule.
  table: {
    position: 'absolute',
    minWidth: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--surface)',
    color: 'var(--text)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    cursor: 'pointer',
    padding: 0,
  },
  tableOccupee: {
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    borderColor: 'var(--accent)',
  },
  tableNom: { fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-num)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', padding: '0 2px' },
};
