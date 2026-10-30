import React from 'react';
import { SelectionToolbar } from '../../components/ui/SelectionToolbar.jsx';
import { userDisplay } from '../../utils/userDisplay.js';
import { Mesure } from './ActionsCorrectives.jsx';
import ProgrammeDuJour from './ProgrammeDuJour.jsx';
import ProblemesHaccp from './ProblemesHaccp.jsx';
import { hcfg, hs } from './HACCP.styles.js';
import { heureEnMinutes, trierCreneaux } from './HACCP.utils.js';
import { etatTournees, verdictReleve } from './haccpJour.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Le registre » (écran releves) : les relevés jour par jour, à montrer en
// cas de contrôle. Le jour au choix, une phrase sur le mois, le programme de
// ce jour (non cliquable), le tableau des relevés (sélection et suppression
// pour qui gère le HACCP), puis les problèmes du mois. La liste des zones n'y
// est plus répétée : elle vit sur l'accueil.
// ─────────────────────────────────────────────────────────────────────────────

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const N = ({ children }) => <span data-no-translate="">{children}</span>;

export default function RegistreHaccp({
  date, setDate, today, maintenant, zones, releves, creneaux, tpls, controls,
  canManage, sel, bulkBusy, onSupprimer, onSupprimerSelection, onExporterSelection,
}) {
  const duJour = releves.filter(r => r.date === date);
  const mois = date.slice(0, 7);
  const duMois = releves.filter(r => (r.date || '').startsWith(mois));
  const horsPlageMois = duMois.filter(r => !r.conforme);
  const problemesCtrlMois = controls.filter(c => (c.date || '').startsWith(mois) && c.statut !== 'conforme');
  const moisLabel = capitalize(new Date(date + 'T12:00:00').toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' }));
  const jourLabel = new Date(date + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });

  // Programme de ce jour : sur un jour passé, une tournée incomplète est
  // « Pas fait » ; sur un jour à venir, tout est « Plus tard ».
  const zonesActives = zones.filter(z => z.actif);
  const actifs = trierCreneaux(creneaux.filter(c => c.actif));
  const minutes = date === today ? (heureEnMinutes(maintenant) ?? 0) : date < today ? 24 * 60 : -1;
  const tournees = zonesActives.length ? etatTournees(actifs, zonesActives, duJour, minutes) : [];

  const colonnes = (sel.active ? '28px ' : '') + '2fr 60px 90px 120px 120px 2fr' + (canManage ? ' 90px' : '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input type="date" aria-label="Jour" style={{ ...hs.datePicker, minHeight: 44, minWidth: 200 }} value={date} onChange={e => e.target.value && setDate(e.target.value)} />
        <div style={{ fontSize: 14, color: 'var(--text)' }}>
          <N>{moisLabel}</N> : <N>{duMois.length}</N> relevés, <N>{horsPlageMois.length}</N> trop chaud ou trop froid.
        </div>
      </div>

      <ProgrammeDuJour
        tournees={tournees}
        aujourdhui={date === today}
        titre={<>Le programme du <N>{jourLabel}</N></>}
      />

      <div id="haccp-releves-print" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Relevés du <N>{jourLabel}</N></div>
          {canManage && !sel.active && duJour.length > 0 && (
            <button className="no-print" onClick={sel.enter} style={hs.exportBtn}>Sélectionner</button>
          )}
        </div>
        {sel.active && (
          <SelectionToolbar
            count={sel.count}
            total={duJour.length}
            allSelected={sel.count > 0 && sel.count === duJour.length}
            onToggleAll={() => (sel.count === duJour.length ? sel.clear() : sel.selectAll(duJour.map(r => r.id)))}
            onDelete={onSupprimerSelection}
            onExport={onExporterSelection}
            exportLabel="Exporter Excel"
            onCancel={sel.exit}
            busy={bulkBusy}
          />
        )}
        <div style={hs.tableCard} className="grid-table-scroll">
          {duJour.length === 0 && <div style={hs.empty}>Aucun relevé pour cette date.</div>}
          {duJour.length > 0 && (
            <div className="grid-table-row" style={{ ...hs.relHead, gridTemplateColumns: colonnes }}>
              {sel.active && <span className="no-print" />}
              <span>Frigo ou appareil</span><span>Heure</span><span style={{ textAlign: 'right' }}>Valeur</span><span>Par</span><span>Résultat</span><span>Ce qui a été fait</span>
              {canManage && <span className="no-print">Action</span>}
            </div>
          )}
          {duJour.map(r => {
            const zone = zones.find(z => z.id === r.zoneId);
            const v = zone ? verdictReleve(zone, r.valeur) : null;
            const mot = r.conforme ? 'Bon' : (v?.ton === 'danger' ? v.mot : 'À surveiller');
            const couleur = r.conforme ? 'var(--success-text)' : 'var(--danger-strong)';
            return (
              <div key={r.id} className="grid-table-row" style={{ ...hs.relRow, gridTemplateColumns: colonnes, ...(sel.active && sel.isSelected(r.id) ? { background: 'var(--bg)' } : {}) }}>
                {sel.active && (
                  <label className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 28, minHeight: 44, cursor: 'pointer' }}>
                    <input type="checkbox" checked={sel.isSelected(r.id)} onChange={() => sel.toggle(r.id)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                  </label>
                )}
                <span style={{ fontSize: 13, fontWeight: 500 }}>{zone?.nom}</span>
                <span style={hs.cell}><N>{String(r.heure || '').slice(0, 5)}</N></span>
                <span style={{ ...hs.cell, textAlign: 'right', fontWeight: 700, color: couleur, fontSize: 15, fontFamily: 'var(--font-num)' }}><Mesure valeur={r.valeur} unite={zone?.unite || ''} /></span>
                <span style={hs.cell}><N>{userDisplay(r.operateur).name}</N></span>
                <span style={{ ...hs.cell, color: couleur, fontWeight: 600 }}>{mot}</span>
                <span style={{ ...hs.cell, color: r.commentaire ? 'var(--text)' : 'var(--text2)', fontSize: 12 }}>{r.commentaire || '-'}</span>
                {canManage && <span className="no-print"><button className="btn-suppr-discret" style={hcfg.deleteBtn} onClick={() => onSupprimer(r.id)}>Supprimer</button></span>}
              </div>
            );
          })}
        </div>
      </div>

      <ProblemesHaccp
        titre="Problèmes du mois"
        releves={horsPlageMois}
        controles={problemesCtrlMois}
        zones={zones}
        tpls={tpls}
        today={today}
      />
    </div>
  );
}
