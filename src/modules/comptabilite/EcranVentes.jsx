import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import { zurichLundi } from '../../utils/zurichTime.js';
import { dateLongue } from '../inventaire/facturesLogic.js';
import { Chf, Montant, chf, jourCourt, pluriel, st as ui, tauxTexte } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Ventes de la période : par taux (TVA comprise, hors TVA, TVA), d'où elles
// viennent, les jours ouverts sans chiffre (chacun avec « Saisir »), puis le
// détail par jour, replié par semaine.
// ─────────────────────────────────────────────────────────────────────────────

const NOMS_TAUX = { 8.1: 'Sur place', 2.6: 'À l\'emporter', 3.8: 'Hébergement' };

export default function EcranVentes({ s, parJour, peutEcrire, couverturePrete, hebergement, onSaisir }) {
  const v = s.ventes || { parTaux: [], jours: { manuel: 0, pos: 0, notes: 0 }, notesTtc: 0, manquants: [] };
  const [ouvertes, setOuvertes] = React.useState(() => new Set());
  const basculer = (cle) => setOuvertes((o) => {
    const n = new Set(o);
    if (n.has(cle)) n.delete(cle); else n.add(cle);
    return n;
  });

  const semaines = React.useMemo(() => {
    const parSemaine = new Map();
    parJour.filter(j => j.source || j.avecNotes).forEach((j) => {
      const lundi = zurichLundi(j.jour);
      if (!parSemaine.has(lundi)) parSemaine.set(lundi, { lundi, jours: [], ttc: 0 });
      const x = parSemaine.get(lundi);
      x.jours.push(j);
      x.ttc += j.ttc;
    });
    return [...parSemaine.values()].sort((a, b) => b.lundi.localeCompare(a.lundi))
      .map(x => ({ ...x, jours: x.jours.sort((a, b) => b.jour.localeCompare(a.jour)) }));
  }, [parJour]);

  return (
    <div style={ui.page}>
      {v.ttc == null ? (
        <p style={ui.texte}>Aucune vente connue sur cette période : saisissez le chiffre du jour, ou reliez la caisse.</p>
      ) : (
        <div style={st.defile}>
          <table style={st.table} data-ventes-taux="">
            <thead>
              <tr>
                <th style={st.th}>Taux</th>
                <th style={st.thNum}>TVA comprise</th>
                <th style={st.thNum}>Hors TVA</th>
                <th style={st.thNum}>TVA</th>
              </tr>
            </thead>
            <tbody>
              {v.parTaux.map(l => (
                <tr key={l.taux}>
                  <td style={st.td}><span>{NOMS_TAUX[l.taux] || 'Autre taux'}</span> <span style={{ color: 'var(--text2)' }}>{tauxTexte(l.taux)}</span></td>
                  <td style={st.tdNum}><Montant v={l.ttc} /></td>
                  <td style={st.tdNum}><Montant v={l.ht} /></td>
                  <td style={st.tdNum}><Montant v={l.tva} /></td>
                </tr>
              ))}
              <tr>
                <td style={{ ...st.td, fontWeight: 500 }}>Total</td>
                <td style={{ ...st.tdNum, fontWeight: 500 }}><Montant v={v.ttc} /></td>
                <td style={{ ...st.tdNum, fontWeight: 500 }}><Montant v={v.ht} /></td>
                <td style={{ ...st.tdNum, fontWeight: 500 }}><Montant v={v.tva} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p style={ui.remarque}>
        <span>Saisi à la main</span> <span>{v.jours.manuel}</span> <span>{pluriel(v.jours.manuel, 'jour,', 'jours,')}</span>{' '}
        <span>caisse</span> <span>{v.jours.pos}</span> <span>{pluriel(v.jours.pos, 'jour', 'jours')}</span>
        {(hebergement || v.notesTtc) ? <>, <span>notes de séjour</span> <span>CHF</span> <span>{chf(v.notesTtc)}</span></> : null}.
        {v.jours.pos > 0 && <> <span>La caisse ne distingue pas la vente à l'emporter : ses montants sont comptés à 8,1 %.</span></>}
      </p>

      {couverturePrete && v.manquants.length > 0 && (
        <section style={ui.section} data-jours-manquants="">
          <div style={ui.sectionTitre}>Jours sans chiffre d'affaires</div>
          <div>
            {v.manquants.slice().reverse().map(j => (
              <div key={j} style={ui.ligne}>
                <span style={ui.ligneTitre}>{jourCourt(j)}</span>
                {peutEcrire && <Btn small onClick={() => onSaisir(j)} style={{ minHeight: 40 }}>Saisir</Btn>}
              </div>
            ))}
          </div>
        </section>
      )}

      {semaines.length > 0 && (
        <section style={ui.section} data-ventes-jours="">
          <div style={ui.sectionTitre}>Par jour</div>
          <div>
            {semaines.map((sem) => {
              const ouverte = ouvertes.has(sem.lundi);
              const Chevron = ouverte ? ChevronDown : ChevronRight;
              return (
                <div key={sem.lundi}>
                  <button type="button" data-cadre="" style={st.semaine} onClick={() => basculer(sem.lundi)} aria-expanded={ouverte}>
                    <Chevron size={16} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}><span>Semaine du</span> <span>{dateLongue(sem.lundi, { sansAnnee: true })}</span></span>
                    <Chf v={sem.ttc} />
                  </button>
                  {ouverte && sem.jours.map(j => (
                    <div key={j.jour} style={{ ...ui.ligne, paddingLeft: 24 }}>
                      <span style={ui.ligneTitre}>{jourCourt(j.jour)}</span>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <Chf v={j.ttc} />
                        <span style={ui.ligneDetail}>{j.source === 'manuel' ? 'saisi' : j.source === 'pos' ? 'caisse' : 'notes de séjour'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

const st = {
  defile: { overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' },
  table: { borderCollapse: 'collapse', minWidth: 440, width: '100%', fontSize: 14, color: 'var(--text)' },
  th: { textAlign: 'left', fontWeight: 500, fontSize: 12, color: 'var(--text2)', padding: '6px 8px 6px 0', borderBottom: '1px solid var(--border)' },
  thNum: { textAlign: 'right', fontWeight: 500, fontSize: 12, color: 'var(--text2)', padding: '6px 0 6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '10px 8px 10px 0', borderBottom: '1px solid var(--border)' },
  tdNum: { padding: '10px 0 10px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right' },
  semaine: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '8px 4px', border: 'none',
    borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontFamily: 'var(--font)',
    fontSize: 14, textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box', borderRadius: 0,
  },
};
