import { useState } from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { libelleUnite } from './echelles.js';
import { MAX_SERIES, MAX_UNITES, peutCocher } from './vueStatistiques.js';

// Les cases d'un graphique : les mesures que la personne peut tracer, rangées
// par famille (D11 : une famille qu'elle ne voit pas ailleurs n'existe pas
// ici). Cocher recompose le graphique. Une case de trop (six séries, deux
// unités, D6) n'est pas cochée : le panneau le dit et propose un graphique de
// plus. Chaque ligne est une cible de 44 px, la case comprise.

const st = {
  famille: { marginBottom: 14 },
  titre: { fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ligne: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '2px 4px', cursor: 'pointer', borderRadius: 6, color: 'var(--text)', fontSize: 14 },
  case: { width: 20, height: 20, flexShrink: 0, accentColor: 'var(--accent)', margin: 0 },
  unite: { marginLeft: 'auto', fontSize: 12, color: 'var(--text3)', flexShrink: 0 },
  refus: { fontSize: 13, color: 'var(--warning-text)', background: 'var(--warning-bg-soft)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  etat: { fontSize: 13, color: 'var(--text2)', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
};

//   familles : [{ id, libelle, etat: 'ready' | 'loading' | 'error' }] visibles
//   mesures  : mesures visibles ; cochees : ids cochés dans ce graphique
export default function PanneauMesures({ familles, mesures, cochees, onChange, onReessayer, onAjouterGraphique, peutAjouter }) {
  const [refus, setRefus] = useState(null);
  const objets = cochees.map((id) => mesures.find((m) => m.id === id)).filter(Boolean);
  const basculer = (m) => {
    if (cochees.includes(m.id)) { setRefus(null); onChange(cochees.filter((id) => id !== m.id)); return; }
    const essai = peutCocher(objets, m);
    if (!essai.ok) { setRefus(essai.raison); return; }
    setRefus(null);
    onChange([...cochees, m.id]);
  };
  return (
    <div data-stat-cases="">
      {refus ? (
        <div style={st.refus} role="status">
          {refus === 'etat' ? <span>Une valeur d'aujourd'hui ne se trace qu'avec des valeurs d'aujourd'hui des mêmes plats ou fiches.</span> : null}
          {refus === 'series'
            ? <span><span>Un graphique porte</span> <span data-no-translate>{MAX_SERIES}</span> <span>séries au plus.</span></span>
            : refus === 'etat' ? null : <span><span>Un graphique porte</span> <span data-no-translate>{MAX_UNITES}</span> <span>unités au plus, une par axe.</span></span>}
          {peutAjouter ? <Btn variant="ghost" onClick={() => { setRefus(null); onAjouterGraphique(); }} style={{ minHeight: 44, alignSelf: 'flex-start' }}>Ajouter un graphique à côté</Btn> : null}
        </div>
      ) : null}
      {familles.map((f) => {
        const liste = mesures.filter((m) => m.famille === f.id);
        return (
          <div key={f.id} style={st.famille} data-stat-famille={f.id}>
            <div style={st.titre}><span>{f.libelle}</span></div>
            {f.etat === 'error' ? (
              <div style={st.etat} data-stat-non-lu={f.id}>
                <span>Non lu.</span>
                <Btn variant="ghost" onClick={() => onReessayer(f.id)} style={{ minHeight: 44 }}>Réessayer</Btn>
              </div>
            ) : null}
            {f.etat === 'loading' && !liste.length ? <div style={st.etat}>Lecture en cours</div> : null}
            {liste.map((m) => (
              <label key={m.id} style={st.ligne} data-stat-case={m.id}>
                <input type="checkbox" style={st.case} checked={cochees.includes(m.id)} onChange={() => basculer(m)} />
                <span style={{ minWidth: 0 }}>{m.libelle}</span>
                {libelleUnite(m.unite) ? <span style={st.unite} data-no-translate>{libelleUnite(m.unite)}</span> : null}
              </label>
            ))}
          </div>
        );
      })}
      {!familles.length ? <div style={st.etat}>Aucune famille de chiffres ne vous est ouverte dans cet établissement.</div> : null}
    </div>
  );
}
