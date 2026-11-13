// ─────────────────────────────────────────────────────────────────────────────
// Présentation dense (S3) : au-dessus des graphiques, les valeurs d'une vue en
// lignes, une par mesure, avec la période comparée et l'écart. Elle porte plus
// de mesures qu'un graphique (D6 tient pour le graphique, pas pour ces lignes)
// et reprend d'un coup d'œil ce que montraient les écrans d'analyse partis.
// Aucun calcul ici : chaque ligne est la série d'une composition d'une seule
// mesure (composition.js), le total de la période et son écart compris.
// ─────────────────────────────────────────────────────────────────────────────

import { Panneau } from '../../components/ui/index.jsx';
import { Valeur } from './Graphique.jsx';
import { nombreDe } from './echelles.js';

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);

// Écart, comme le tableau : en points pour un pourcentage, sinon relatif.
function Ecart({ e, unite }) {
  if (!e || e.valeur == null) return <span>n/a</span>;
  if (unite === 'pct') return <span>{e.valeur > 0 ? '+' : ''}{nombreDe(e.valeur, unite)} pts</span>;
  return <span>{e.pct == null ? 'n/a' : `${e.pct > 0 ? '+' : ''}${nombreDe(e.pct, 'pct')} %`}</span>;
}

const st = {
  grille: { display: 'grid', columnGap: 24, minWidth: 0 },
  ligne: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, minWidth: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)', padding: '4px 0',
  },
  libelle: { fontSize: 'var(--t2)', color: 'var(--text)', minWidth: 0 },
  valeurs: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, textAlign: 'right' },
  valeur: { fontSize: 'var(--t2)', fontFamily: 'var(--font-num)', color: 'var(--text)', whiteSpace: 'nowrap' },
  avant: { fontSize: 'var(--t1)', color: 'var(--text2)', whiteSpace: 'nowrap' },
  etat: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  phrases: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10, fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.45 },
  titre: { fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)' },
};

//   lignes : [{ id, libelle, phrase, unite, total, totalComparaison, ecart, etat }]
// Sous les lignes, ce que compte chacune (la phrase du catalogue, D2), comme
// l'explication des écrans d'origine.
export default function ChiffresDenses({ lignes, colonnes = 1, libelleComparaison = '', onReessayer }) {
  if (!lignes || !lignes.length) return null;
  return (
    <Panneau style={{ padding: '8px 16px' }}>
      {libelleComparaison ? <div style={{ ...st.etat, padding: '4px 0' }}><span>Comparé à</span> <span>{libelleComparaison}</span></div> : null}
      <div style={{ ...st.grille, gridTemplateColumns: colonnes > 1 ? `repeat(${colonnes}, minmax(0, 1fr))` : 'minmax(0, 1fr)' }} data-stat-chiffres="">
        {lignes.map((l) => (
          <div key={l.id} style={st.ligne} data-stat-chiffre={l.id}>
            <span style={st.libelle}>{l.libelle}</span>
            <span style={st.valeurs}>
              {l.etat === 'loading' ? <span style={st.etat}>Lecture en cours</span> : null}
              {l.etat === 'error' ? (
                <button type="button" onClick={onReessayer} style={{ ...st.etat, minHeight: 44, background: 'none', borderWidth: 0, cursor: 'pointer', color: 'var(--lien)' }}>Non lu, réessayer</button>
              ) : null}
              {!l.etat ? <span style={st.valeur}><Valeur v={l.total} unite={l.unite} /></span> : null}
              {!l.etat && libelleComparaison && estNombre(l.totalComparaison) ? (
                <span style={st.avant} data-no-translate>
                  <Valeur v={l.totalComparaison} unite={l.unite} />, <Ecart e={l.ecart} unite={l.unite} />
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      {lignes.some((l) => l.phrase) ? (
        <div style={st.phrases} data-stat-chiffres-phrases="">
          <div style={st.titre}>D'où viennent ces chiffres</div>
          {lignes.filter((l) => l.phrase).map((l) => <div key={l.id}><strong style={{ fontWeight: 'var(--g3)' }}>{l.libelle}</strong> : <span>{l.phrase}</span></div>)}
        </div>
      ) : null}
    </Panneau>
  );
}
