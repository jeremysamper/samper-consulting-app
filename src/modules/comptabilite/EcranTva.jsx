import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import EtatAbsent from './EtatAbsent.jsx';
import { achatsPeriode } from './syntheseCompta.js';
import { doublonsCharges } from './chargesFixes.js';
import { Chf, Montant, dateCH, pluriel, st as ui, tauxTexte } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// TVA (droit « Régler les factures ») : l'état du décompte à déclarer et de
// celui en cours. Méthode effective : TVA sur les ventes par taux, impôt
// préalable des factures d'achat (mêmes montants que l'export fiduciaire) et
// des charges fixes, TVA estimée à payer. Taux de la dette fiscale nette :
// chiffre d'affaires TVA comprise fois le taux saisi. Une estimation pour
// préparer le décompte, jamais le décompte officiel. « Exporter l'état TVA »
// ouvre l'export pour la fiduciaire réglé sur le décompte affiché.
//
//   decomptes : [{ periode, etat }] de useCompta (précédent, en cours)
// ─────────────────────────────────────────────────────────────────────────────

const NOMS_TAUX = { 8.1: 'Sur place', 2.6: 'À l\'emporter', 3.8: 'Hébergement' };
const COLONNES_ACHATS = [['tva26', 2.6], ['tva81', 8.1], ['tva38', 3.8], ['tvaAutre', null]];

function Puce({ actif, onClick, titre, detail, id }) {
  return (
    <button type="button" role="radio" aria-checked={actif} data-cadre="" data-decompte={id} onClick={onClick} style={{ ...st.puce, ...(actif ? st.puceActive : null) }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{titre}</span>
      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{detail}</span>
    </button>
  );
}

function Ligne({ libelle, base, tva, fort, id }) {
  const style = fort ? { ...st.td, fontWeight: 500 } : st.td;
  const num = fort ? { ...st.tdNum, fontWeight: 500 } : st.tdNum;
  return (
    <tr data-ligne-tva={id}>
      <td style={style}>{libelle}</td>
      <td style={num}>{base === undefined ? null : <Montant v={base} />}</td>
      <td style={num}><Montant v={tva} /></td>
    </tr>
  );
}

export default function EcranTva({ decomptes, defaut, etat, chargesAbsentes, charges, docs, onExporter }) {
  const [choix, setChoix] = React.useState(defaut);
  const { periode, etat: e } = decomptes[choix] || decomptes[defaut];
  const effective = e.methode === 'effective';

  const doublons = React.useMemo(() => (charges ? doublonsCharges(charges, achatsPeriode(docs, periode).liste) : []), [charges, docs, periode]);

  if (etat === 'loading') return <p style={ui.remarque}>Chargement…</p>;
  if (etat === 'error') return <p style={{ ...ui.remarque, color: 'var(--danger-text)' }}>Lecture impossible pour l'instant. Nouvel essai en cours.</p>;

  const achats = e.achats;
  const lignesAchats = COLONNES_ACHATS.filter(([k]) => achats[k] != null);
  const cv = e.couverture;
  const incomplete = !!cv && e.ventesCompletes === false && e.ventes.ttc != null;

  return (
    <div style={ui.page} data-tva="">
      <div role="radiogroup" aria-label="Période de TVA" style={st.puces}>
        {decomptes.map((d, i) => (
          <Puce
            key={d.periode.debut}
            id={d.periode.enCours ? 'courant' : 'precedent'}
            actif={i === choix}
            onClick={() => setChoix(i)}
            titre={d.periode.libelle}
            detail={d.periode.enCours ? 'en cours' : <><span>à déclarer avant le</span> <span>{dateCH(d.periode.echeance)}</span></>}
          />
        ))}
      </div>

      {chargesAbsentes && <EtatAbsent />}

      {effective ? (
        <>
          <section style={ui.section} data-tva-ventes="">
            <div style={ui.sectionTitre}>TVA sur les ventes</div>
            {e.ventes.ttc == null ? <p style={ui.remarque}>Aucune vente connue sur cette période.</p> : (
              <div style={st.defile}>
                <table style={st.table}>
                  <thead>
                    <tr><th style={st.th}>Taux</th><th style={st.thNum}>Base hors TVA</th><th style={st.thNum}>TVA</th></tr>
                  </thead>
                  <tbody>
                    {e.ventes.parTaux.map(l => (
                      <Ligne
                        key={l.taux}
                        id={`ventes-${l.taux}`}
                        libelle={<><span>{NOMS_TAUX[l.taux] || 'Autre taux'}</span> <span style={{ color: 'var(--text2)' }}>{tauxTexte(l.taux)}</span></>}
                        base={l.ht}
                        tva={l.tva}
                      />
                    ))}
                    <Ligne id="ventes-total" libelle="Total" base={e.ventes.ht} tva={e.ventes.tva} fort />
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={ui.section} data-tva-prealable="">
            <div style={ui.sectionTitre}>Impôt préalable</div>
            <div style={st.defile}>
              <table style={st.table}>
                <tbody>
                  {lignesAchats.map(([k, taux]) => (
                    <Ligne
                      key={k}
                      id={`achats-${k}`}
                      libelle={<><span>Factures d'achat</span> <span style={{ color: 'var(--text2)' }}>{taux == null ? 'autre taux' : tauxTexte(taux)}</span></>}
                      tva={achats[k]}
                    />
                  ))}
                  {!lignesAchats.length && <Ligne id="achats-aucune" libelle="Factures d'achat" tva={0} />}
                  {e.charges.map(c => (
                    <Ligne
                      key={c.taux}
                      id={`charges-${c.taux}`}
                      libelle={<><span>Charges fixes (estimé)</span> <span style={{ color: 'var(--text2)' }}>{tauxTexte(c.taux)}</span></>}
                      tva={c.tva}
                    />
                  ))}
                  <Ligne id="prealable" libelle="Total de l'impôt préalable" tva={e.prealable} fort />
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <section style={ui.section} data-tva-tdfn="">
          <div style={ui.ligne}>
            <span style={ui.ligneTitre}>Chiffre d'affaires TVA comprise</span>
            <span style={ui.num}><Chf v={e.ventes.ttc} /></span>
          </div>
          <div style={ui.ligne}>
            <span style={ui.ligneTitre}>Votre taux de la dette fiscale nette</span>
            <span style={ui.num}>{e.tauxTdfn == null ? 'n/a' : tauxTexte(e.tauxTdfn)}</span>
          </div>
          {e.tauxTdfn == null && <p style={{ ...ui.texte, margin: 0, color: 'var(--warning-text)' }}>Saisissez votre taux de la dette fiscale nette dans les Réglages.</p>}
        </section>
      )}

      {/* Trop peu de jours de ventes : la TVA due (et un crédit) n'est pas à prendre telle quelle. */}
      {incomplete && (
        <p style={{ ...st.note, color: 'var(--warning-text)', fontWeight: 500 }} data-tva-incomplete="">
          <span>Chiffre d'affaires connu</span> <span>{cv.avec}</span> <span>{pluriel(cv.avec, 'jour sur', 'jours sur')}</span> <span>{cv.attendus}</span> <span>: TVA incomplète.</span>
        </p>
      )}
      <div style={st.total} data-tva-due="">
        {e.due != null && incomplete
          ? <><span>TVA estimée, ventes incomplètes :</span> <Chf v={e.due} /></>
          : e.due != null && e.due < 0
            ? <><span>Crédit de TVA estimé :</span> <Chf v={-e.due} /></>
            : <><span>TVA estimée à payer :</span> <Chf v={e.due} /></>}
      </div>

      <section style={{ ...ui.section, gap: 6 }} data-tva-notes="">
        {!incomplete && (
          <p style={st.note}>
            {cv
              ? <><span>Chiffre d'affaires connu</span> <span>{cv.avec}</span> <span>{pluriel(cv.avec, 'jour sur', 'jours sur')}</span> <span>{cv.attendus}</span>.</>
              : <><span>Chiffre d'affaires connu pour</span> <span>{e.ventes.nbJours}</span> <span>{pluriel(e.ventes.nbJours, 'jour de la période.', 'jours de la période.')}</span></>}
          </p>
        )}
        {effective && achats.nonDeduites > 0 && (
          <p style={{ ...st.note, color: 'var(--warning-text)' }} data-non-deduites="">
            <span>{achats.nonDeduites}</span> <span>{pluriel(achats.nonDeduites, 'facture d\'achat sans taux n\'est pas déduite : à vérifier dans Factures & achats.', 'factures d\'achat sans taux ne sont pas déduites : à vérifier dans Factures & achats.')}</span>
          </p>
        )}
        {effective && doublons.length > 0 && (
          <p style={{ ...st.note, color: 'var(--warning-text)' }}>
            <span>{doublons.length}</span> <span>{pluriel(doublons.length, 'possible doublon avec une charge fixe : sa TVA peut compter deux fois.', 'possibles doublons avec une charge fixe : leur TVA peut compter deux fois.')}</span>
          </p>
        )}
        <p style={st.note}>
          {effective
            ? 'Méthode effective : TVA des ventes moins l\'impôt préalable des factures d\'achat et des charges fixes. Les achats sont ceux de l\'export fiduciaire.'
            : 'Taux de la dette fiscale nette : le chiffre d\'affaires TVA comprise multiplié par votre taux, sans impôt préalable.'}
        </p>
        <p style={st.note}>Estimation pour préparer le décompte : votre fiduciaire établit le décompte officiel.</p>
      </section>

      {onExporter && (
        <div>
          <Btn onClick={() => onExporter(periode)} style={{ minHeight: 44 }}>Exporter l'état TVA</Btn>
        </div>
      )}
    </div>
  );
}

const st = {
  puces: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  puce: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minHeight: 44, padding: '8px 14px',
    borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', color: 'var(--text)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', background: 'var(--bg)',
  },
  puceActive: { borderColor: 'var(--accent)', background: 'var(--accent-light)' },
  defile: { overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' },
  table: { borderCollapse: 'collapse', minWidth: 320, width: '100%', fontSize: 14, color: 'var(--text)' },
  th: { textAlign: 'left', fontWeight: 500, fontSize: 12, color: 'var(--text2)', padding: '6px 8px 6px 0', borderBottom: '1px solid var(--border)' },
  thNum: { textAlign: 'right', fontWeight: 500, fontSize: 12, color: 'var(--text2)', padding: '6px 0 6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '10px 8px 10px 0', borderBottom: '1px solid var(--border)' },
  tdNum: { padding: '10px 0 10px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' },
  total: { fontSize: 17, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font-serif)', padding: '4px 0' },
  note: { margin: 0, fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 },
};
