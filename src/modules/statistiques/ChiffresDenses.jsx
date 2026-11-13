// ─────────────────────────────────────────────────────────────────────────────
// Présentation dense (S3) : au-dessus des graphiques, les valeurs d'une vue en
// lignes, une par mesure, avec la période comparée et l'écart. Elle porte plus
// de mesures qu'un graphique (D6 tient pour le graphique, pas pour ces lignes)
// et reprend d'un coup d'œil ce que montraient les écrans d'analyse partis.
// Aucun calcul ici : chaque ligne est la série d'une composition d'une seule
// mesure (composition.js), le total de la période et son écart compris.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Panneau } from '../../components/ui/index.jsx';
import SearchToggle from '../../components/ui/SearchToggle.jsx';
import { makeSearchMatcher } from '../../utils/searchText.js';
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
              {!l.etat && l.detail ? <span style={st.avant}>{l.detail.jour ? <><span>{l.detail.jour}</span> </> : null}<span data-no-translate>{l.detail.date}</span></span> : null}
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

// Tableau dense (S3) : une ligne par catégorie (plat, fiche), une colonne par
// mesure, et la ligne d'ensemble ; toutes les catégories, lues telles quelles
// dans la ventilation ou les valeurs d'aujourd'hui de la fonction d'origine.
//   tableau : { rangs: [{ cle, libelle, brut }], colonnes: [{ id, libelle, unite, parCle, total }],
//               libelleCategories, libelleTotal, choix: { cle, libelle, options, valeur } | null, etat }
const tb = {
  cadre: { overflowX: 'auto', maxWidth: '100%', minWidth: 0 },
  table: { borderCollapse: 'collapse', width: '100%', fontSize: 'var(--t2)' },
  th: { textAlign: 'right', padding: '8px 6px', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', color: 'var(--text2)', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)', verticalAlign: 'bottom' },
  td: { textAlign: 'right', padding: '8px 6px', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)', fontFamily: 'var(--font-num)', whiteSpace: 'nowrap' },
  nom: { textAlign: 'left', padding: '8px 6px', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)', minWidth: 120 },
  champ: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t1)', color: 'var(--text2)', marginBottom: 8, maxWidth: 360 },
  select: { minHeight: 44, padding: '8px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--t2)', fontFamily: 'var(--font)' },
};

// Au-delà de huit lignes, une loupe filtre les catégories par leur nom, comme
// la recherche des écrans d'origine (makeSearchMatcher).
const SEUIL_RECHERCHE = 8;

export function TableauDense({ tableau, onChoix, onReessayer }) {
  const [recherche, setRecherche] = useState('');
  if (!tableau) return null;
  if (tableau.etat === 'loading') return <Panneau style={{ padding: '8px 16px' }}><span style={st.etat}>Lecture en cours</span></Panneau>;
  if (tableau.etat === 'error') {
    return (
      <Panneau style={{ padding: '8px 16px' }}>
        <button type="button" onClick={onReessayer} style={{ ...st.etat, minHeight: 44, background: 'none', borderWidth: 0, cursor: 'pointer', color: 'var(--lien)' }}>Non lu, réessayer</button>
      </Panneau>
    );
  }
  const { colonnes, choix } = tableau;
  const correspond = makeSearchMatcher(recherche);
  const rangs = tableau.rangs.filter((r) => correspond(String(r.libelle || '')));
  return (
    <Panneau style={{ padding: '8px 16px' }}>
      {choix && choix.options.length > 1 ? (
        <label style={tb.champ}>
          <span>{choix.libelle}</span>
          <select style={tb.select} value={choix.valeur || ''} onChange={(e) => onChoix(choix.cle, e.target.value)} data-stat-tableau-choix="">
            {choix.options.map((o) => <option key={o.cle} value={o.cle} data-no-translate>{o.libelle}</option>)}
          </select>
        </label>
      ) : null}
      {tableau.rangs.length > SEUIL_RECHERCHE ? (
        <div style={{ marginBottom: 8 }}><SearchToggle value={recherche} onChange={setRecherche} placeholder="Rechercher…" /></div>
      ) : null}
      <div style={tb.cadre} data-defile="" data-stat-tableau="">
        <table style={tb.table}>
          <thead>
            <tr>
              <th style={{ ...tb.th, textAlign: 'left' }}>{tableau.libelleCategories}</th>
              {colonnes.map((c) => <th key={c.id} style={tb.th}>{c.libelle}</th>)}
            </tr>
          </thead>
          {/* La ligne d'ensemble en tête, sous les intitulés : elle se lit sans
              faire défiler une longue liste. */}
          {colonnes.some((c) => estNombre(c.total)) ? (
            <tbody>
              <tr data-stat-rang-total="">
                <td style={{ ...tb.nom, fontWeight: 'var(--g3)' }}>{tableau.libelleTotal}</td>
                {colonnes.map((c) => <td key={c.id} style={{ ...tb.td, fontWeight: 'var(--g3)' }}><Valeur v={c.total} unite={c.unite} /></td>)}
              </tr>
            </tbody>
          ) : null}
          <tbody>
            {rangs.map((r) => (
              <tr key={r.cle} data-stat-rang={r.cle}>
                <td style={tb.nom} data-no-translate={r.brut ? true : undefined}>{r.libelle}</td>
                {colonnes.map((c) => <td key={c.id} style={tb.td}><Valeur v={c.parCle.get(r.cle)} unite={c.unite} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panneau>
  );
}
