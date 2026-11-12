import { useMemo, useState } from 'react';
import ReglagesEnLigne from './ReglagesEnLigne.jsx';
import { mapReservation, mapSeance, mapSoin, plancherReservations, useSpaTable } from './spaData.js';
import { st } from './spaUi.jsx';
import './spa.css';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Spa, réservation en ligne » de la page des réglages : monte
// ReglagesEnLigne tel quel et lui lit ce que Spa.jsx lui passait, par les
// mêmes lectures (carte des soins ; praticiens déduits des rendez-vous et des
// séances). La classe .spa donne ses couleurs à l'écran, le fond reste celui
// de la page (comme la boîte d'envoi dans les réglages de Réservations).
// ─────────────────────────────────────────────────────────────────────────────

export default function SectionSpaEnLigne({ etablissement }) {
  const etabId = etablissement?.id || null;
  const [depuis] = useState(plancherReservations);
  const soins = useSpaTable('spa_soins', etabId, { map: mapSoin });
  const reservations = useSpaTable('spa_reservations', etabId, {
    map: mapReservation, filtres: [['date_rdv', 'gte', depuis]], cle: depuis, order: [['date_rdv', true]], limit: 10000,
  });
  const seances = useSpaTable('spa_seances', etabId, { map: mapSeance, limit: 10000 });
  const praticiens = useMemo(
    () => [...new Set([...reservations.rows.map((r) => r.praticien), ...seances.rows.map((s) => s.praticien)].filter(Boolean))].sort(),
    [reservations.rows, seances.rows]
  );

  if (!etabId) return null;
  const absent = [soins, reservations].some((t) => t.status === 'absent');
  return (
    <div className="spa" style={{ background: 'transparent' }}>
      {absent ? (
        <div style={st.encartAttention}>Le module Spa n'est pas encore activé pour cet établissement.</div>
      ) : (
        <ReglagesEnLigne
          etablissement={etablissement}
          soins={soins.rows}
          praticiens={praticiens}
          onModifierSoin={soins.modifier}
        />
      )}
    </div>
  );
}
