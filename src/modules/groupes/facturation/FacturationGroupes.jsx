import { useMemo, useState } from 'react';
import { AlertTriangle, FileText, HandCoins, Wallet } from 'lucide-react';
import { CarteRepere, Panneau, SegmentedTabs } from '../../../components/ui/index.jsx';
import SearchToggle from '../../../components/ui/SearchToggle.jsx';
import { st } from '../../../components/ui/Fenetres.jsx';
import { ouvrirCompte } from '../../../services/navigationService.js';
import { makeSearchMatcher } from '../../../utils/searchText.js';
import {
  ETATS_FACTURE, STATUTS_DEVIS, chf, csvFacturation, dateFr, etatDevis, etatFacture, labelMode, reperesFacturation,
} from './calculs.js';
import { objetDocument } from './documents.js';
import { Pastille, TON_DEVIS, TON_FACTURE, sf } from './ui.jsx';
import './facturation.css';

// ─────────────────────────────────────────────────────────────────────────────
// Onglet « Devis et factures » de Groupes : repères (devis en cours, à
// encaisser, en retard, encaissé ce mois), puis trois listes dans une carte
// blanche : devis, factures, paiements, chacune avec ses filtres d'état et la
// loupe. Ouvrir une ligne ouvre sa fenêtre. Suivi à part de la Comptabilité
// (décision du 23.11.2026) : l'export CSV sert la fiduciaire.
// ─────────────────────────────────────────────────────────────────────────────

const FILTRES_DEVIS = [
  { id: 'en_cours', label: 'En cours', garde: (e) => e === 'brouillon' || e === 'envoye' },
  { id: 'accepte', label: 'Acceptés', garde: (e) => e === 'accepte' },
  { id: 'clos', label: 'Refusés ou expirés', garde: (e) => e === 'refuse' || e === 'expire' },
  { id: 'tous', label: 'Tous', garde: () => true },
];
const FILTRES_FACTURES = [
  { id: 'a_encaisser', label: 'À encaisser', garde: (e) => ['a_payer', 'partiel', 'en_retard'].includes(e) },
  { id: 'en_retard', label: 'En retard', garde: (e) => e === 'en_retard' },
  { id: 'prevue', label: 'Prévues', garde: (e) => e === 'prevue' },
  { id: 'payee', label: 'Payées', garde: (e) => e === 'payee' },
  { id: 'toutes', label: 'Toutes', garde: () => true },
];

export function telechargerCsv(facturation, aujourdhui, nomEtab) {
  const csv = csvFacturation({ factures: facturation.factures, paiements: facturation.paiements }, aujourdhui);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `factures-groupes-${String(nomEtab || '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${aujourdhui}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FacturationGroupes({ ctx, fenetres }) {
  const { facturation, aujourdhui, reglages } = ctx;
  const [vue, setVue] = useState('factures');
  const [filtreDevis, setFiltreDevis] = useState('en_cours');
  const [filtreFactures, setFiltreFactures] = useState('a_encaisser');
  const [recherche, setRecherche] = useState('');
  const correspond = useMemo(() => makeSearchMatcher(recherche), [recherche]);

  const reperes = useMemo(
    () => reperesFacturation({ devis: facturation.devis, factures: facturation.factures, paiements: facturation.paiements }, aujourdhui),
    [facturation.devis, facturation.factures, facturation.paiements, aujourdhui],
  );
  const facturesParId = useMemo(() => new Map(facturation.factures.map((f) => [f.id, f])), [facturation.factures]);

  const devisVus = useMemo(() => {
    const g = FILTRES_DEVIS.find((x) => x.id === filtreDevis)?.garde || (() => true);
    return facturation.devis
      .filter((d) => g(etatDevis(d, aujourdhui)))
      .filter((d) => correspond([d.numero, d.clientNom, d.clientContact, objetDocument(d)].join(' ')))
      .sort((a, b) => String(b.dateDevis).localeCompare(String(a.dateDevis)) || String(b.numero).localeCompare(String(a.numero)));
  }, [facturation.devis, filtreDevis, correspond, aujourdhui]);

  const facturesVues = useMemo(() => {
    const g = FILTRES_FACTURES.find((x) => x.id === filtreFactures)?.garde || (() => true);
    return facturation.factures
      .map((f) => ({ f, e: etatFacture(f, facturation.paiements, aujourdhui) }))
      .filter(({ e }) => g(e.etat))
      .filter(({ f }) => correspond([f.numero, f.clientNom, f.libelle, f.titre].join(' ')))
      .sort((a, b) => String(a.f.echeance || a.f.dateFacture || '9999').localeCompare(String(b.f.echeance || b.f.dateFacture || '9999')));
  }, [facturation.factures, facturation.paiements, filtreFactures, correspond, aujourdhui]);

  const paiementsVus = useMemo(() => facturation.paiements
    .filter((p) => {
      const f = facturesParId.get(p.factureId);
      return correspond([f?.numero, f?.clientNom, p.reference, labelMode(p.mode)].join(' '));
    })
    .sort((a, b) => String(b.datePaiement).localeCompare(String(a.datePaiement))), [facturation.paiements, facturesParId, correspond]);

  if (facturation.status === 'absent') {
    return <div style={sf.encart('alerte')}>Les devis et factures sont en cours d'activation : la base de données n'est pas encore en place.</div>;
  }
  if (facturation.status === 'error') {
    return (
      <div style={sf.encart('danger')}>
        Lecture des devis et factures impossible (connexion ?).{' '}
        <button type="button" style={{ ...st.secondaire, minHeight: 36, padding: '4px 12px' }} onClick={facturation.reload}>Réessayer</button>
      </div>
    );
  }
  if (facturation.status === 'loading') return <p style={sf.remarque}>Chargement…</p>;

  const identiteIncomplete = !reglages.raisonSociale || !reglages.npa || !reglages.localite || !reglages.iban;

  return (
    <div className="fac-page">
      {identiteIncomplete && (
        <div style={{ ...sf.encart('info'), display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ flex: '1 1 260px' }}>
            Complétez l'identité de facturation (raison sociale, adresse, IBAN, TVA) : elle s'imprime sur les devis et porte la QR-facture.
          </span>
          {['consultant', 'patron'].includes(ctx.user?.role) && (
            <button type="button" style={st.secondaire} onClick={() => ouvrirCompte('groupes_facturation')}>Ouvrir les réglages</button>
          )}
        </div>
      )}

      <div className="fac-reperes">
        <CarteRepere Icone={FileText} valeur={reperes.devisEnCours} libelle="devis en cours" detail={<span data-no-translate>CHF {chf(reperes.montantDevisEnCours)}</span>}
          onClick={() => { setVue('devis'); setFiltreDevis('en_cours'); }} />
        <CarteRepere Icone={Wallet} valeur={chf(reperes.aEncaisser)} libelle="à encaisser, en CHF" detail={<><span data-no-translate>{reperes.nbAEncaisser}</span> {reperes.nbAEncaisser > 1 ? 'factures' : 'facture'}</>}
          onClick={() => { setVue('factures'); setFiltreFactures('a_encaisser'); }} />
        <CarteRepere Icone={AlertTriangle} valeur={chf(reperes.enRetard)} libelle="en retard, en CHF" detail={<><span data-no-translate>{reperes.nbEnRetard}</span> {reperes.nbEnRetard > 1 ? 'factures' : 'facture'}</>}
          onClick={() => { setVue('factures'); setFiltreFactures('en_retard'); }} />
        <CarteRepere Icone={HandCoins} valeur={chf(reperes.encaisseMois)} libelle="encaissé ce mois, en CHF"
          onClick={() => setVue('paiements')} />
      </div>

      <div className="fac-barre">
        <SegmentedTabs
          tabs={[{ id: 'devis', label: 'Devis' }, { id: 'factures', label: 'Factures' }, { id: 'paiements', label: 'Paiements' }]}
          active={vue}
          onChange={setVue}
        />
        <span style={{ flex: '1 1 auto' }} />
        <SearchToggle value={recherche} onChange={setRecherche} placeholder="Client, numéro…" />
      </div>

      {vue !== 'paiements' && (
        <div className="fac-filtres" style={{ marginBottom: 12 }} role="group" aria-label="Filtrer">
          {(vue === 'devis' ? FILTRES_DEVIS : FILTRES_FACTURES).map((x) => {
            const actif = (vue === 'devis' ? filtreDevis : filtreFactures) === x.id;
            return (
              <button key={x.id} type="button" aria-pressed={actif} style={sf.pilule(actif)}
                onClick={() => (vue === 'devis' ? setFiltreDevis(x.id) : setFiltreFactures(x.id))}>
                {x.label}
              </button>
            );
          })}
        </div>
      )}

      <Panneau style={{ padding: '4px 18px' }}>
        <div className="fac-liste">
          {vue === 'devis' && (devisVus.length ? devisVus.map((d) => {
            const e = etatDevis(d, aujourdhui);
            return (
              <button key={d.id} type="button" style={{ ...sf.boutonLigne, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' }} onClick={() => fenetres.ouvrirDevis(d)}>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', overflowWrap: 'anywhere' }}>{d.clientNom}</span>
                  <span style={{ display: 'block', fontSize: 'var(--t1)', color: 'var(--text2)' }}>
                    <span data-no-translate>{d.numero}</span>, {objetDocument(d)}
                  </span>
                </span>
                <span style={{ ...sf.chiffre, fontSize: 'var(--t2)' }} data-no-translate>{chf(d.total)}</span>
                <Pastille ton={TON_DEVIS[e]}>{STATUTS_DEVIS[e]?.label}</Pastille>
              </button>
            );
          }) : <p style={{ ...sf.remarque, padding: '14px 0' }}>Aucun devis dans cette vue.</p>)}

          {vue === 'factures' && (facturesVues.length ? facturesVues.map(({ f, e }) => (
            <button key={f.id} type="button" style={{ ...sf.boutonLigne, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' }} onClick={() => fenetres.ouvrirFacture(f)}>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', overflowWrap: 'anywhere' }}>{f.clientNom}</span>
                <span style={{ display: 'block', fontSize: 'var(--t1)', color: 'var(--text2)' }}>
                  {f.numero ? <span data-no-translate>{f.numero}, </span> : null}{f.libelle || 'Facture'}
                  {f.echeance ? <>, échéance <span data-no-translate>{dateFr(f.echeance)}</span></> : null}
                </span>
              </span>
              <span style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ ...sf.chiffre, display: 'block', fontSize: 'var(--t2)' }} data-no-translate>{chf(f.montant)}</span>
                {e.etat === 'partiel' || (e.etat === 'en_retard' && e.paye > 0) ? (
                  <span style={{ display: 'block', fontSize: 'var(--t1)', color: 'var(--text2)' }}>reste <span data-no-translate>{chf(e.reste)}</span></span>
                ) : null}
              </span>
              <Pastille ton={TON_FACTURE[e.etat]}>{ETATS_FACTURE[e.etat].label}</Pastille>
            </button>
          )) : <p style={{ ...sf.remarque, padding: '14px 0' }}>Aucune facture dans cette vue.</p>)}

          {vue === 'paiements' && (paiementsVus.length ? paiementsVus.map((p) => {
            const f = facturesParId.get(p.factureId);
            return (
              <button key={p.id} type="button" style={{ ...sf.boutonLigne, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' }} onClick={() => f && fenetres.ouvrirFacture(f)}>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', overflowWrap: 'anywhere' }}>{f?.clientNom || 'Facture'}</span>
                  <span style={{ display: 'block', fontSize: 'var(--t1)', color: 'var(--text2)' }}>
                    <span data-no-translate>{dateFr(p.datePaiement)}</span>, {labelMode(p.mode)}
                    {f?.numero ? <>, <span data-no-translate>{f.numero}</span></> : null}
                    {p.reference ? `, ${p.reference}` : ''}
                  </span>
                </span>
                <span style={{ ...sf.chiffre, fontSize: 'var(--t2)' }} data-no-translate>{chf(p.montant)}</span>
              </button>
            );
          }) : <p style={{ ...sf.remarque, padding: '14px 0' }}>Aucun paiement saisi.</p>)}
        </div>
      </Panneau>
    </div>
  );
}
