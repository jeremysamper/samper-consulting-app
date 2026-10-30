import React from 'react';
import { encadreStyle, encadreTitreStyle } from '../../components/ui/index.jsx';
import { Mesure } from './ActionsCorrectives.jsx';
import { verdictReleve } from './haccpJour.js';

// ─────────────────────────────────────────────────────────────────────────────
// Liste de ce qui n'allait pas : relevés hors plage et contrôles signalés en
// problème, le plus récent d'abord, avec ce qui a été fait. Sur l'accueil
// (« À surveiller » : aujourd'hui et hier) et dans le registre (« Problèmes du
// mois »). Le parent choisit la période ; rien n'est rendu si la liste est vide.
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children }) => <span data-no-translate="">{children}</span>;

function Jour({ date, today }) {
  if (date === today) return <>aujourd'hui</>;
  const [y, m, d] = String(date).split('-').map(Number);
  if (new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10) === today) return <>hier</>;
  return <N>{`${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.`}</N>;
}

export default function ProblemesHaccp({ titre, releves = [], controles = [], zones, tpls, today }) {
  const items = [
    ...releves.map(r => ({ type: 'releve', cle: 'r' + r.id, date: r.date, heure: String(r.heure || '').slice(0, 5), r })),
    ...controles.map(c => ({ type: 'controle', cle: 'c' + c.id, date: c.date, heure: String(c.heure || '').slice(0, 5), c })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.heure.localeCompare(a.heure));
  if (!items.length) return null;

  return (
    <section style={st.cadre}>
      <div style={st.titre}>{titre}</div>
      {items.map(it => {
        if (it.type === 'releve') {
          const zone = zones.find(z => z.id === it.r.zoneId);
          const v = zone ? verdictReleve(zone, it.r.valeur) : null;
          const mot = v?.ton === 'danger' ? v.mot : 'À surveiller';
          return (
            <div key={it.cle} style={st.ligne}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={st.nom}>{zone?.nom}, <Jour date={it.date} today={today} /> à <N>{it.heure}</N></div>
                <div style={st.detail}>
                  <span style={st.mot}>{mot}</span>
                  {it.r.commentaire && <>. {it.r.commentaire}</>}
                </div>
              </div>
              <div style={st.valeur}><Mesure valeur={it.r.valeur} unite={zone?.unite || ''} /></div>
            </div>
          );
        }
        const tpl = tpls.find(t => t.id === it.c.templateId);
        return (
          <div key={it.cle} style={st.ligne}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={st.nom}>{tpl?.label}, <Jour date={it.date} today={today} /> à <N>{it.heure}</N></div>
              <div style={st.detail}>
                <span style={st.mot}>Problème signalé</span>
                {it.c.notes && <>. {it.c.notes}</>}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

const st = {
  // Encadré de statut (filet gauche au ton) : celui des anomalies d'avant.
  cadre: { ...encadreStyle('erreur') },
  titre: { padding: '2px 0 8px', fontSize: 14, ...encadreTitreStyle('erreur'), borderBottom: '1px solid var(--border)' },
  ligne: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' },
  nom: { fontSize: 14, fontWeight: 500, color: 'var(--text)' },
  detail: { fontSize: 13, color: 'var(--text)', marginTop: 2, lineHeight: 1.4 },
  mot: { color: 'var(--danger-strong)', fontWeight: 600 },
  valeur: { fontSize: 20, fontWeight: 700, color: 'var(--danger-strong)', fontFamily: 'var(--font-num)', flexShrink: 0 },
};
