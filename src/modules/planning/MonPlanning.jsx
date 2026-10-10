import React from 'react';
import { ajouterJours, formatDuree, heuresSegment, typeHoraire } from './planningModeles.js';
import { jourLong, libellePeriode } from './planningExport.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mon planning : ce qu'un employé veut savoir en ouvrant le module. Quand est
// mon prochain service, quels jours je travaille cette semaine, combien
// d'heures. Une semaine à la fois, un jour par ligne, sans grille.
// ─────────────────────────────────────────────────────────────────────────────

const parHeure = (a, b) => (a.debut || '').localeCompare(b.debut || '');

const quand = (date, aujourdhui) => {
  if (date === aujourdhui) return 'aujourd\'hui';
  if (date === ajouterJours(aujourdhui, 1)) return 'demain';
  return jourLong(date).toLowerCase();
};

export default function MonPlanning({ userId, shifts, absenceDe, semaineInitiale, aujourdhui, maintenant, onExporter }) {
  const [semaine, setSemaine] = React.useState(semaineInitiale);
  const mesShifts = shifts.filter(s => s.userId === userId);
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(semaine, i));
  const totalSemaine = mesShifts
    .filter(s => s.date >= jours[0] && s.date <= jours[6])
    .reduce((t, s) => t + heuresSegment(s), 0);

  // Prochain service : le premier qui n'est pas encore terminé.
  const prochain = mesShifts
    .filter(s => s.date > aujourdhui || (s.date === aujourdhui && (s.fin || '') > maintenant))
    .sort((a, b) => a.date.localeCompare(b.date) || parHeure(a, b))[0] || null;

  return (
    <div style={s.racine}>
      <div style={s.prochain}>
        {prochain ? (
          <>
            <div style={s.prochainLabel}>Prochain service</div>
            <div style={s.prochainQuand}>
              {quand(prochain.date, aujourdhui).replace(/^./, c => c.toUpperCase())}, {typeHoraire(prochain.typeShift).label.toLowerCase()}
            </div>
            <div style={s.prochainHeures}>{prochain.debut} à {prochain.fin}{prochain.pause ? `, pause ${prochain.pause} min` : ''}</div>
          </>
        ) : (
          <div style={s.prochainQuand}>Aucun service prévu pour l'instant.</div>
        )}
      </div>

      <div style={s.navigation}>
        <button type="button" style={s.fleche} onClick={() => setSemaine(ajouterJours(semaine, -7))} aria-label="Semaine précédente">‹</button>
        <div style={s.periode}>
          <div style={s.periodeTitre}>Semaine {libellePeriode(jours[0], jours[6])}</div>
          <div style={s.total}>{totalSemaine ? `${formatDuree(totalSemaine)} prévues` : 'Aucun horaire'}</div>
        </div>
        <button type="button" style={s.fleche} onClick={() => setSemaine(ajouterJours(semaine, 7))} aria-label="Semaine suivante">›</button>
      </div>
      {semaine !== semaineInitiale && (
        <button type="button" style={s.retour} onClick={() => setSemaine(semaineInitiale)}>Revenir à cette semaine</button>
      )}

      <div>
        {jours.map(d => {
          const duJour = mesShifts.filter(x => x.date === d).sort(parHeure);
          const abs = absenceDe ? absenceDe(userId, d) : null;
          const estAujourdhui = d === aujourdhui;
          return (
            <div key={d} style={s.jour}>
              <div style={{ ...s.jourNom, ...(estAujourdhui ? { color: 'var(--accent)' } : null) }}>
                {jourLong(d)}{estAujourdhui ? ', aujourd\'hui' : ''}
              </div>
              <div style={s.horaires}>
                {abs && <div style={s.absence}>{abs}</div>}
                {duJour.length === 0 && !abs && <div style={s.repos}>Repos</div>}
                {duJour.map(x => {
                  const t = typeHoraire(x.typeShift);
                  return (
                    <div key={x.id} style={s.horaire}>
                      <span style={{ ...s.type, color: t.texte }}>{t.label}</span>
                      <span style={s.heures}>{x.debut} à {x.fin}</span>
                      <span style={s.duree}>{formatDuree(heuresSegment(x))}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {onExporter && (
        <button type="button" style={s.exporter} onClick={() => onExporter(semaine)}>Télécharger mon planning</button>
      )}
    </div>
  );
}

const s = {
  racine: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 },
  prochain: { padding: '4px 0 12px', borderBottom: '1px solid var(--border)' },
  prochainLabel: { fontSize: 12, fontWeight: 600, color: 'var(--text2)' },
  prochainQuand: { fontSize: 20, fontFamily: 'var(--font-serif)', color: 'var(--text)', marginTop: 2 },
  prochainHeures: { fontSize: 26, fontFamily: 'var(--font-num)', color: 'var(--accent)', marginTop: 2 },
  navigation: { display: 'flex', alignItems: 'center', gap: 8 },
  fleche: { width: 44, height: 44, flexShrink: 0, background: 'var(--surface2)', border: 'none', borderRadius: 8, fontSize: 20, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font)' },
  periode: { flex: 1, minWidth: 0, textAlign: 'center' },
  periodeTitre: { fontSize: 15, fontWeight: 700, color: 'var(--text)' },
  total: { fontSize: 13, color: 'var(--text2)', marginTop: 2 },
  retour: { alignSelf: 'center', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 36, fontFamily: 'var(--font)' },
  jour: { display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' },
  jourNom: { flex: '1 1 180px', fontSize: 14, fontWeight: 600, color: 'var(--text)', minWidth: 0 },
  horaires: { flex: '2 1 240px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  horaire: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  type: { fontSize: 13, fontWeight: 700, minWidth: 64 },
  heures: { fontSize: 16, fontFamily: 'var(--font-num)', color: 'var(--text)' },
  duree: { fontSize: 12, color: 'var(--text2)', marginLeft: 'auto' },
  repos: { fontSize: 14, color: 'var(--text3)' },
  absence: { fontSize: 13, fontWeight: 600, color: 'var(--warning-text)' },
  exporter: { alignSelf: 'flex-start', padding: '11px 16px', minHeight: 44, background: 'var(--surface2)', border: 'none', borderRadius: 8, color: 'var(--accent)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
};
