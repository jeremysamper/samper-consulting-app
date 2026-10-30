import React from 'react';
import { Montant, chf, dateCH, pctTexte, pluriel, st as ui, tauxTexte } from './comptaUi.jsx';
import { ecart } from './syntheseCompta.js';
import { libellePeriode } from './periodesCompta.js';
import { TAUX_VENTES } from './ventesCompta.js';

// ─────────────────────────────────────────────────────────────────────────────
// Vue d'ensemble : le compte de résultat estimé de la période, comparé à la
// période précédente, puis d'où vient chaque chiffre. Quatre colonnes sur un
// conteneur large ; sur téléphone, libellé et valeur, la période précédente
// et l'écart en petit dessous (compta.css). Le coût du personnel n'est montré
// qu'à la direction (consultant, patron).
// ─────────────────────────────────────────────────────────────────────────────

const NOMS_TAUX = { 8.1: 'sur place', 2.6: 'à l\'emporter', 3.8: 'hébergement' };

function Valeur({ v, pct, danger }) {
  if (v == null) return <span style={{ color: 'var(--text3)' }}>n/a</span>;
  return (
    <span style={{ fontFamily: 'var(--font-num)', whiteSpace: 'nowrap', ...(danger && v < 0 ? { color: 'var(--danger-text)' } : null) }}>
      {pct ? pctTexte(v) : chf(v)}
    </span>
  );
}

// Un rang qui dépend du chiffre d'affaires (r.ventes) ne montre ni la valeur
// de la période précédente ni l'écart quand celle-ci n'est pas comparable :
// « 249,8 % » calculé sur 1 jour de ventes sur 9 serait faux. La colonne dit
// « incomplet » à la place.
function Rang({ r, libellePrec, comparable }) {
  const montrerB = comparable || !r.ventes;
  const avecEcart = !r.pct && !r.texte && !r.sansEcart && montrerB;
  const e = avecEcart ? ecart(r.a, r.b) : null;
  const prec = montrerB ? <Valeur v={r.b} pct={r.pct} />
    : r.b == null ? <Valeur v={null} /> : <span style={{ fontSize: 12, color: 'var(--text2)' }}>incomplet</span>;
  return (
    <div className={`compta-rang${r.fort ? ' compta-rang--fort' : ''}`} data-rang={r.id}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--text)' }}>{r.label}</div>
        {r.detail && <div style={{ ...ui.ligneDetail, fontWeight: 400, marginTop: 2 }}>{r.detail}</div>}
      </div>
      <div style={{ textAlign: 'right' }}>
        {r.texte ? <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 400 }}>{r.texte}</span> : <Valeur v={r.a} pct={r.pct} danger={r.danger} />}
      </div>
      <div className="compta-col-prec" style={{ fontWeight: 400, color: 'var(--text2)' }}>
        {r.texte ? null : prec}
      </div>
      <div className="compta-col-ecart" style={{ fontSize: 13, fontWeight: 400, color: 'var(--text2)', fontFamily: 'var(--font-num)' }}>
        {e && e !== 'n/a' ? e : null}
      </div>
      {!r.texte && libellePrec && (
        <div className="compta-sous-prec" style={{ ...ui.ligneDetail, fontWeight: 400 }}>
          <span>{libellePrec}</span> : {prec}{e && e !== 'n/a' ? <>, <span>{e}</span></> : null}
        </div>
      )}
    </div>
  );
}

export default function EcranEnsemble({ s, p, periode, precedente, hebergement, comparable, direction, etatPersonnel, reglages }) {
  const libelleCourant = libellePeriode(periode);
  const libellePrec = precedente ? libellePeriode(precedente) : '';

  const taux = TAUX_VENTES.filter(t => t.taux !== 3.8 || hebergement || s.ventes?.parTaux?.some(l => l.taux === 3.8));
  const detailCa = s.ca == null ? null : (
    <>
      {taux.map((t, i) => {
        const l = s.ventes.parTaux.find(x => x.taux === t.taux);
        return (
          <React.Fragment key={t.cle}>
            {i > 0 && ' ; '}
            <span>{NOMS_TAUX[t.taux]}</span> <span>{tauxTexte(t.taux)}</span> <Montant v={l ? l.ht : null} />
          </React.Fragment>
        );
      })}
    </>
  );
  const stock = s.matiere.stock;
  const detailMatiere = (
    <>
      <span>achats hors TVA</span> <Montant v={s.matiere.achatsHt} /> ;{' '}
      {periode.type !== 'inventaire'
        ? <span>variation de stock : sans (période d'inventaire seulement)</span>
        : stock.valeur != null
          ? <><span>variation de stock :</span> <Montant v={stock.valeur} /></>
          : <span>variation de stock : pas d'inventaire au début ou à la fin</span>}
    </>
  );

  const prorata = s.prorata ? <><span>au prorata des jours écoulés,</span> <span>{s.prorata.ecoules}</span> <span>sur</span> <span>{s.prorata.total}</span></> : null;
  // Personnel : hors direction, la ligne le dit au lieu d'un chiffre.
  const textePersonnel = !direction ? 'réservé à la direction'
    : etatPersonnel === 'absente' ? 'pas encore activé'
      : etatPersonnel === 'loading' ? 'chargement…'
        : etatPersonnel === 'error' ? 'lecture impossible' : null;
  // Résultat : avant personnel (aucun coût chiffré), ou personnel partiel.
  const detailResultat = s.avantPersonnel ? <span style={st.reserve}>avant personnel</span>
    : s.personnelPartiel ? <span style={st.reserve}>personnel partiel</span> : null;
  // TVA calculée sur trop peu de jours de ventes (tvaCompta, ventesCompletes).
  const cvTva = s.tvaCouverture;
  const detailTva = s.tvaEstimee != null && s.tvaComplete === false && cvTva ? (
    <span style={st.reserve}>
      <span>TVA incomplète, chiffre d'affaires connu</span> <span>{cvTva.avec}</span> <span>{pluriel(cvTva.avec, 'jour sur', 'jours sur')}</span> <span>{cvTva.attendus}</span>
    </span>
  ) : null;
  const rangs = [
    { id: 'ca', label: 'Chiffre d\'affaires hors TVA', a: s.ca, b: p?.ca, fort: true, ventes: true, detail: detailCa },
    { id: 'matiere', label: 'Coût matière', a: s.matiere.ht, b: p?.matiere.ht, detail: detailMatiere },
    { id: 'marge', label: 'Marge brute', a: s.margeBrute, b: p?.margeBrute, fort: true, danger: true, ventes: true },
    { id: 'personnel', label: 'Coût du personnel estimé', texte: textePersonnel, a: s.personnel, b: p?.personnel, detail: textePersonnel ? null : prorata },
    { id: 'charges', label: 'Charges fixes hors TVA', a: s.charges, b: p?.charges, detail: prorata },
    { id: 'resultat', label: 'Résultat d\'exploitation estimé', a: s.resultat, b: p?.resultat, fort: true, danger: true, ventes: true, detail: detailResultat },
    { id: 'matierePct', label: 'Coût matière en % du chiffre d\'affaires', pct: true, ventes: true, a: s.ratios.matierePct, b: p?.ratios.matierePct },
    { id: 'personnelPct', label: 'Coût du personnel en % du chiffre d\'affaires', pct: true, ventes: true, texte: textePersonnel, a: s.ratios.personnelPct, b: p?.ratios.personnelPct },
    { id: 'tva', label: 'TVA estimée à payer sur la période', a: s.tvaEstimee, b: p?.tvaEstimee, pct: false, sansEcart: true, ventes: true, detail: detailTva },
  ];

  const v = s.ventes || { jours: { manuel: 0, pos: 0, notes: 0 }, notesTtc: 0 };
  const nCharges = s.chargesDetail?.lignes.length || 0;
  const pd = s.personnelDetail;
  const tdfn = reglages?.methodeTva === 'tdfn';

  return (
    <div style={ui.page}>
      <div className="compta-tableau" data-ensemble="">
        <div className="compta-rang compta-rang-tete" style={{ fontSize: 12, color: 'var(--text2)' }}>
          <span />
          <span style={{ textAlign: 'right' }}>{libelleCourant}</span>
          <span style={{ textAlign: 'right' }}>{libellePrec}</span>
          <span style={{ textAlign: 'right' }}>écart</span>
        </div>
        {rangs.map(r => <Rang key={r.id} r={r} libellePrec={libellePrec} comparable={comparable} />)}
      </div>
      {precedente && !comparable && p?.ventes?.attendus > 0 && (
        <p style={st.source} data-incomparable="">
          <span>{libellePrec}</span> : <span>chiffre d'affaires connu</span> <span>{p.ventes.avec}</span> <span>{pluriel(p.ventes.avec, 'jour sur', 'jours sur')}</span> <span>{p.ventes.attendus}</span> ;{' '}
          <span>pas de comparaison pour ce qui dépend du chiffre d'affaires (marge, résultat, ratios, TVA).</span>
        </p>
      )}

      <section style={ui.section} data-sources="">
        <div style={ui.sectionTitre}>D'où viennent ces chiffres</div>
        <p style={st.source}>
          <span>Chiffre d'affaires : saisi à la main</span> <span>{v.jours.manuel}</span> <span>{pluriel(v.jours.manuel, 'jour,', 'jours,')}</span>{' '}
          <span>caisse</span> <span>{v.jours.pos}</span> <span>{pluriel(v.jours.pos, 'jour', 'jours')}</span>
          {(hebergement || v.notesTtc) ? <>, <span>notes de séjour</span> <span>CHF</span> <span>{chf(v.notesTtc)}</span></> : null}.
          {v.jours.pos > 0 && <> <span>La caisse ne distingue pas la vente à l'emporter : ses montants sont comptés à 8,1 %.</span></>}
        </p>
        <p style={st.source}>
          <span>Coût matière : factures d'achat hors TVA de la période ;</span>{' '}
          {s.matiere.sansHt > 0 && <><span>{s.matiere.sansHt}</span> <span>{pluriel(s.matiere.sansHt, 'comptée TVA comprise faute de montant hors TVA ;', 'comptées TVA comprise faute de montant hors TVA ;')}</span>{' '}</>}
          <span>les bons de livraison ne sont pas additionnés.</span>
        </p>
        {periode.type === 'inventaire' && stock.valeur != null && (
          <p style={st.source}>
            <span>Variation de stock : inventaires validés du</span> <span>{dateCH(stock.dateDebut)}</span> <span>et du</span> <span>{dateCH(stock.dateFin)}</span>.
          </p>
        )}
        {pd && (
          <p style={st.source} data-source-personnel="">
            <span>Personnel :</span> <span>{pd.parSource.mensuel + pd.parSource.horaire}</span>{' '}
            <span>{pluriel(pd.parSource.mensuel + pd.parSource.horaire, 'salaire saisi,', 'salaires saisis,')}</span>{' '}
            <span>{pd.parSource.moyen}</span> <span>au coût moyen, charges sociales de</span> <span>{pd.chargesPct}</span> <span>%.</span>
          </p>
        )}
        {s.chargesDetail && (
          <p style={st.source}>
            <span>Charges fixes :</span> <span>{nCharges}</span> <span>{pluriel(nCharges, 'charge répartie par mois.', 'charges réparties par mois.')}</span>
          </p>
        )}
        <p style={st.source} data-source-tva="">
          {!tdfn ? <span>TVA : ventes moins TVA des achats et des charges fixes, méthode effective.</span>
            : reglages?.tauxTdfn != null
              ? <><span>TVA : chiffre d'affaires TVA comprise fois votre taux de la dette fiscale nette de</span> <span>{tauxTexte(reglages.tauxTdfn)}</span>.</>
              : <span>TVA : saisissez votre taux de la dette fiscale nette dans les Réglages.</span>}
        </p>
      </section>
    </div>
  );
}

const st = {
  reserve: { color: 'var(--warning-text)' },
  source: { margin: 0, fontSize: 13, color: 'var(--text2)', lineHeight: 1.55 },
};
