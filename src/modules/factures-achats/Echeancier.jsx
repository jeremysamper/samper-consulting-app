import React from 'react';
import { BarresListe } from './GraphiquesAchats.jsx';
import { echeancier } from './analysesAchats.js';
import { statutPaiement, trierParEcheance } from '../inventaire/facturesLogic.js';
import { dateCH } from '../inventaire/inventaireLignes.js';
import { Btn } from '../../components/ui/index.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// « Échéances » (Factures & achats) : réservé au droit « Régler les
// factures » (factures_achat), comme tout statut de paiement dans l'app.
// Factures non réglées de tous les périmètres, en TTC (le montant à payer,
// comme « Je règle les factures ») ; une facture sans TTC est comptée à part.
// Le règlement lui-même reste dans « Je règle les factures ».
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Number(n) || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const Chf = ({ v }) => (v == null ? <span>n/a</span> : <><span>CHF</span> <span>{chf(v)}</span></>);
const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);

export default function Echeancier({ docs, aujourdhui, onRegler }) {
  const { tranches, aRegler } = React.useMemo(() => echeancier(docs, aujourdhui), [docs, aujourdhui]);
  const factures = React.useMemo(() => trierParEcheance(tranches.flatMap(t => t.factures)), [tranches]);

  const lignes = tranches.filter(t => t.factures.length).map(t => ({
    cle: t.id,
    label: t.label,
    valeur: t.montant || 0,
    couleur: t.id === 'retard' ? 'var(--danger-strong)' : t.id === 'sans' ? 'var(--text3)' : undefined,
    texte: <Chf v={t.montant} />,
    sousTexte: <><span>{t.factures.length}</span> {pluriel(t.factures.length, 'facture', 'factures')}{t.sansTTC ? <>, <span>{t.sansTTC}</span> sans TTC</> : null}</>,
  }));

  return (
    <div style={st.page}>
      <div style={st.enTete}>
        <div style={st.total}>
          {aRegler
            ? <><span>{aRegler}</span> {pluriel(aRegler, 'facture à régler', 'factures à régler')}, tous périmètres</>
            : <>Toutes les factures sont réglées.</>}
        </div>
        <Btn variant="primary" onClick={onRegler}>Je règle les factures</Btn>
      </div>

      <section style={st.section}>
        <div style={st.titre}>Échéancier</div>
        <BarresListe lignes={lignes} vide="n/a : aucune facture à régler" />
        <div style={st.calcul}>
          Montant à payer (TTC) des factures non réglées, rangées par date d'échéance, semaine du lundi au dimanche. Une facture sans TTC est comptée à part : n/a quand aucune facture de la tranche n'a de TTC.
        </div>
      </section>

      {factures.length > 0 && (
        <section style={st.section}>
          <div style={st.titre}>Factures à régler</div>
          <div style={st.liste}>
            {factures.map(f => {
              const retard = statutPaiement(f, aujourdhui) === 'en_retard';
              return (
                <div key={f.id} style={st.ligne}>
                  <span style={st.nom}>
                    <span data-no-translate>{f.fournisseurNom || 'Fournisseur non lu'}</span>
                    {f.numero ? <span style={st.numero} data-no-translate>{` n° ${f.numero}`}</span> : null}
                  </span>
                  <span style={{ ...st.detail, ...(retard ? st.retard : null) }}>
                    {f.dateEcheance ? <><span>échéance le</span> <span>{dateCH(f.dateEcheance)}</span></> : <span>sans échéance</span>}
                    {', '}<span data-no-translate>{(f.perimetre || '').trim() || 'Général'}</span>
                  </span>
                  <span style={st.montant}>{f.totalTTC != null ? <Chf v={f.totalTTC} /> : <span style={st.manque}>TTC à saisir</span>}</span>
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
  page: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  enTete: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 8 },
  total: { fontSize: 13, color: 'var(--text2)' },
  section: { display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 0 12px', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)', minWidth: 0 },
  titre: { fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text)', lineHeight: 1.2 },
  calcul: { fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 },
  liste: { display: 'flex', flexDirection: 'column' },
  ligne: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '2px 12px', padding: '8px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)', fontSize: 13 },
  nom: { color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  numero: { color: 'var(--text3)', fontSize: 12 },
  detail: { gridColumn: 1, color: 'var(--text2)', fontSize: 12 },
  retard: { color: 'var(--danger-text)' },
  montant: { gridColumn: 2, gridRow: '1 / span 2', alignSelf: 'center', textAlign: 'right', fontFamily: 'var(--font-num)', color: 'var(--text)', whiteSpace: 'nowrap' },
  manque: { color: 'var(--warning-text)', fontFamily: 'var(--font)', fontSize: 12 },
};
