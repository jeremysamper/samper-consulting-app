import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Echeancier from '../factures-achats/Echeancier.jsx';
import { dateLongue } from '../inventaire/facturesLogic.js';
import { caMoyenParJour, previsionTresorerie, SEMAINES_PREVISION } from './tresorerie.js';
import { ajouterJours, libellePeriode } from './periodesCompta.js';
import { Chf, dateCH, pluriel, st as ui } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Trésorerie (droit « Régler les factures ») : l'échéancier des factures de
// Factures & achats, réutilisé tel quel, puis la prévision des 8 prochaines
// semaines (règle D18) : entrées estimées, sorties prévues (factures, charges
// fixes, TVA, salaires estimés), solde estimé depuis le dernier relevé
// importé (somme des comptes quand il y en a plusieurs). Un relevé de plus de
// 7 jours le dit : les paiements faits depuis ne sont pas déduits. Toucher une
// semaine déplie ses sorties. Lecture seule.
// ─────────────────────────────────────────────────────────────────────────────

function Ligne({ libelle, v, id }) {
  return (
    <div style={st.sousLigne} data-sortie={id}>
      <span>{libelle}</span>
      <span style={ui.num}><Chf v={v} /></span>
    </div>
  );
}

export default function EcranTresorerie({
  docs, charges, chargesAbsentes, decomptesTva, salaireMensuel, moisSalaires, direction, parJour, aujourdhui, solde, onRegler,
}) {
  const [ouverte, setOuverte] = React.useState(null);
  const ca = React.useMemo(() => caMoyenParJour(parJour, aujourdhui), [parJour, aujourdhui]);
  const echeancesTva = React.useMemo(() => (decomptesTva || []).map(d => ({
    date: d.periode.echeance, montant: d.etat.due, libelle: d.periode.libelle,
  })), [decomptesTva]);
  const soldeDepart = solde?.montant ?? null;
  const dateSolde = solde?.date || null;
  // Relevé ancien : les factures réglées et charges payées depuis manquent.
  const ancien = soldeDepart != null && !!dateSolde && dateSolde < ajouterJours(aujourdhui, -7);
  const p = React.useMemo(() => previsionTresorerie({
    aujourdhui, semaines: SEMAINES_PREVISION, docs, charges, echeancesTva, salaireMensuel: direction ? salaireMensuel : null,
    caMoyenJour: ca.moyenne, soldeDepart,
  }), [aujourdhui, docs, charges, echeancesTva, direction, salaireMensuel, ca.moyenne, soldeDepart]);

  return (
    <div style={ui.page} data-tresorerie="">
      <Echeancier docs={docs} aujourdhui={aujourdhui} onRegler={onRegler} />

      <section style={ui.section} data-prevision="">
        <div style={ui.sectionTitre}>Prévision</div>
        {ancien && (
          <p style={{ ...st.note, color: 'var(--warning-text)' }} data-releve-ancien="">
            <span>Relevé du</span> <span>{dateCH(dateSolde)}</span> <span>: importez un relevé récent, les paiements faits depuis ne sont pas déduits du solde.</span>
          </p>
        )}
        <div>
          {p.semaines.map((s, k) => {
            const deplie = ouverte === s.debut;
            const negatif = s.solde != null && s.solde < 0;
            return (
              <div key={s.debut} style={st.semaine} data-semaine={k + 1}>
                <button type="button" style={st.tete} aria-expanded={deplie} onClick={() => setOuverte(deplie ? null : s.debut)}>
                  {deplie ? <ChevronDown size={18} aria-hidden="true" style={st.chevron} /> : <ChevronRight size={18} aria-hidden="true" style={st.chevron} />}
                  <span style={st.corps}>
                    <span style={st.titre}>
                      {k === 0 ? 'Cette semaine' : <><span>Semaine du</span> <span>{dateLongue(s.debut, { sansAnnee: true })}</span></>}
                    </span>
                    <span style={st.chiffres}>
                      <span style={st.cell}>
                        <span>entrées estimées</span> {s.entrees == null ? <span>n/a</span> : <Chf v={s.entrees} entier />}
                      </span>
                      <span style={st.cell}>
                        <span>sorties prévues</span> <Chf v={s.sorties.total} entier />
                      </span>
                      <span style={{ ...st.cell, ...(negatif ? { color: 'var(--danger-text)' } : null) }} data-solde-semaine="">
                        {s.solde != null
                          ? <><span>solde estimé</span> <Chf v={s.solde} entier /></>
                          : <><span>flux cumulé</span> <Chf v={s.cumul} entier /></>}
                      </span>
                    </span>
                  </span>
                </button>
                {deplie && (
                  <div style={st.detail}>
                    <Ligne id="factures" libelle="Factures" v={s.sorties.factures} />
                    {s.detail.factures.map(x => (
                      <div key={x.facture.id} style={st.item}>
                        <span data-no-translate>{x.facture.fournisseurNom || 'Fournisseur non lu'}</span>
                        {x.enRetard ? <>, <span style={{ color: 'var(--danger-text)' }}>en retard</span></> : <>, <span>le</span> <span>{dateCH(x.facture.dateEcheance)}</span></>}
                        {' '}{x.montant == null ? <span>TTC à saisir</span> : <Chf v={x.montant} />}
                      </div>
                    ))}
                    <Ligne id="charges" libelle="Charges fixes" v={s.sorties.charges} />
                    {s.detail.charges.map(x => (
                      <div key={`${x.charge.id}-${x.date}`} style={st.item}>
                        <span data-no-translate>{x.charge.libelle}</span>, <span>le</span> <span>{dateCH(x.date)}</span> <Chf v={x.montant} />
                      </div>
                    ))}
                    <Ligne id="tva" libelle="TVA" v={s.sorties.tva} />
                    {s.detail.tva.map(x => (
                      <div key={x.date} style={st.item}><span>{x.libelle}</span>, <span>le</span> <span>{dateCH(x.date)}</span></div>
                    ))}
                    <Ligne id="salaires" libelle="Salaires estimés" v={s.sorties.salaires} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ ...ui.section, gap: 6 }} data-tresorerie-notes="">
        <p style={st.note}>
          {soldeDepart != null && solde.comptes > 1
            ? <><span>Solde de départ :</span> <Chf v={soldeDepart} /><span>, somme des derniers relevés de</span> <span>{solde.comptes}</span> <span>comptes, le plus ancien au</span> <span>{dateCH(dateSolde)}</span>.</>
            : soldeDepart != null
              ? <><span>Solde de départ :</span> <Chf v={soldeDepart} /> <span>au</span> <span>{dateCH(dateSolde)}</span><span>, dernier relevé importé.</span></>
              : solde ? 'Le dernier relevé ne donne pas de solde de fin : flux seuls.'
                : 'Importez un relevé bancaire pour partir du solde réel.'}
        </p>
        <p style={st.note}>
          {ca.moyenne != null
            ? 'Entrées estimées : moyenne du chiffre d\'affaires des 28 derniers jours.'
            : 'Pas assez de jours de chiffre d\'affaires pour estimer les entrées.'}
        </p>
        <p style={st.note}>
          {!direction ? 'Salaires : réservés à la direction, pas comptés ici.'
            : salaireMensuel != null
              ? <><span>Salaires estimés : coût du personnel de</span> <span>{libellePeriode(moisSalaires)}</span><span>, compté le dernier jour du mois.</span></>
              : 'Salaires : pas encore estimés, pas comptés ici.'}
        </p>
        {chargesAbsentes && <p style={st.note}>Charges fixes : pas encore activées, pas comptées ici.</p>}
        {p.sansEcheance.n > 0 && (
          <p style={st.note}>
            <span>{p.sansEcheance.n}</span> <span>{pluriel(p.sansEcheance.n, 'facture sans échéance n\'est pas placée dans les semaines.', 'factures sans échéance ne sont pas placées dans les semaines.')}</span>
          </p>
        )}
        <p style={st.note}>TVA : le montant estimé de chaque décompte, à son échéance. Une estimation pour voir venir, pas un plan de paiement.</p>
        {(decomptesTva || []).filter(d => d.etat.ventesCompletes === false && d.periode.echeance >= aujourdhui && d.periode.echeance <= p.fin).map(d => (
          <p key={d.periode.debut} style={{ ...st.note, color: 'var(--warning-text)' }} data-tva-incomplete="">
            <span>{d.periode.libelle}</span> <span>: chiffre d'affaires incomplet, le montant de la TVA n'est pas sûr.</span>
          </p>
        ))}
      </section>
    </div>
  );
}

const st = {
  semaine: { borderBottom: '1px solid var(--border)' },
  tete: {
    display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', minHeight: 44, padding: '10px 0', background: 'none',
    border: 'none', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
  },
  chevron: { flexShrink: 0, marginTop: 1, color: 'var(--text2)' },
  corps: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 },
  titre: { fontSize: 14, fontWeight: 500 },
  chiffres: { display: 'flex', flexWrap: 'wrap', gap: '2px 16px', fontSize: 13, color: 'var(--text2)' },
  cell: { whiteSpace: 'nowrap' },
  detail: { display: 'flex', flexDirection: 'column', gap: 4, padding: '0 0 12px 26px' },
  sousLigne: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: 'var(--text)', paddingTop: 4 },
  item: { fontSize: 12, color: 'var(--text2)', paddingLeft: 10, overflowWrap: 'anywhere' },
  note: { margin: 0, fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 },
};
