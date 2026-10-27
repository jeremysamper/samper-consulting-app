import React from 'react';
import { BarresComparees, BarresListe, BarresMois, CourbePrix } from './GraphiquesAchats.jsx';
import {
  datesAVerifier, depensesParMois, facturesDesDouzeMois, libelleMois, parFournisseur, parRayon, prixParProduit, trierDocuments,
} from './analysesAchats.js';
import { dateCH } from '../inventaire/inventaireLignes.js';
import { Btn } from '../../components/ui/index.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// « Analyses des dépenses » (Factures & achats) : ouvert à toute personne qui
// a le module ; les montants HT y sont déjà visibles dans Écarts et documents.
// Chaque graphique dit sous lui ce qu'il compte (calculs : analysesAchats.js).
// Nombres, dates et noms dans leurs propres nœuds : la phrase autour reste
// une entrée du glossaire au lieu de partir à l'IA à chaque valeur.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Number(n) || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const Chf = ({ v }) => (v == null ? <span>n/a</span> : <><span>CHF</span> <span>{chf(v)}</span></>);
const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);
// Mois en toutes lettres et année dans deux nœuds (le nom seul est au glossaire).
const MoisLong = ({ cle }) => <><span>{libelleMois(cle, { long: true })}</span> <span>{cle.slice(0, 4)}</span></>;
const MAX_FOURNISSEURS = 12;

export default function AnalysesAchats({ docs, perimetres, catalogue, aujourdhui, loadError, onVerifier }) {
  const [perimetre, setPerimetre] = React.useState('');
  const [produit, setProduit] = React.useState('');

  const { factures, bons, exclues } = React.useMemo(() => trierDocuments(docs, perimetre), [docs, perimetre]);
  const mois = React.useMemo(() => depensesParMois(factures, aujourdhui), [factures, aujourdhui]);
  const factures12 = React.useMemo(() => facturesDesDouzeMois(factures, aujourdhui), [factures, aujourdhui]);
  const fournisseurs = React.useMemo(() => parFournisseur(factures12), [factures12]);
  const rayons = React.useMemo(() => parRayon(factures12, catalogue), [factures12, catalogue]);
  const produits = React.useMemo(() => prixParProduit(factures12), [factures12]);
  const aVerifier = React.useMemo(() => datesAVerifier(factures), [factures]);
  const serie = produits.find(s => s.cle === produit) || produits[0] || null;

  const pointsMois = mois.points.map((p) => ({
    cle: p.cle,
    label: libelleMois(p.cle),
    valeur: p.valeur,
    detail: (
      <>
        <MoisLong cle={p.cle} /> : <Chf v={p.valeur} />
        {p.total ? <>, <span>{p.total}</span> {pluriel(p.total, 'facture', 'factures')}</> : null}
        {p.sansMontant ? <>, <span>{p.sansMontant}</span> sans montant</> : null}
      </>
    ),
  }));
  const pointsCompares = mois.points.map((p, i) => {
    const q = mois.precedents[i];
    return {
      cle: p.cle,
      label: libelleMois(p.cle),
      a: p.valeur,
      b: q.valeur,
      detail: (
        <>
          <MoisLong cle={p.cle} /> : <Chf v={p.valeur} /> ; <MoisLong cle={q.cle} /> : <Chf v={q.valeur} />
        </>
      ),
    };
  });
  const seriesComparees = [
    { id: 'a', label: '12 derniers mois', couleur: 'var(--accent)' },
    { id: 'b', label: 'Un an plus tôt', couleur: 'var(--accent)', opacite: 0.35 },
  ];

  const lignesFournisseurs = (() => {
    const tete = fournisseurs.slice(0, MAX_FOURNISSEURS);
    const reste = fournisseurs.slice(MAX_FOURNISSEURS);
    const lignes = tete.map(f => ({
      cle: f.cle,
      label: <span data-no-translate title={f.graphies.join(', ')}>{f.label}</span>,
      valeur: f.montant || 0,
      texte: <Chf v={f.montant} />,
      sousTexte: <><span>{f.total}</span> {pluriel(f.total, 'facture', 'factures')}{f.sansMontant ? <>, <span>{f.sansMontant}</span> sans montant</> : null}</>,
    }));
    if (reste.length) {
      const montant = reste.reduce((s, f) => s + (f.montant || 0), 0);
      lignes.push({ cle: '__autres__', label: 'Autres fournisseurs', valeur: montant, texte: <Chf v={montant} />, sousTexte: <><span>{reste.length}</span> fournisseurs</> });
    }
    return lignes;
  })();

  const lignesRayons = rayons.rayons.map(r => ({
    cle: r.cle,
    label: r.label,
    valeur: r.montant,
    couleur: r.nonClasse ? 'var(--text3)' : undefined,
    texte: <Chf v={r.montant} />,
    sousTexte: <><span>{r.lignes}</span> {pluriel(r.lignes, 'ligne', 'lignes')}</>,
  }));

  const pointsPrix = (serie?.points || []).map((p, i) => ({
    cle: `${p.date}-${i}`,
    date: p.date,
    valeur: p.prix,
    ariaLabel: `${dateCH(p.date)} ${chf(p.prix)}`,
    detail: <><span>{dateCH(p.date)}</span>, <span data-no-translate>{p.fournisseur}</span> : <Chf v={p.prix} /> / <span>{serie.unite}</span></>,
  }));

  return (
    <div style={st.page}>
      {loadError && <div style={st.alerte}>Données indisponibles pour le moment : les chiffres peuvent être incomplets.</div>}

      <div style={st.filtres}>
        <label style={st.filtre}>
          <span style={st.filtreLibelle}>Périmètre</span>
          <select value={perimetre} onChange={e => setPerimetre(e.target.value)} style={st.select} aria-label="Périmètre des analyses">
            <option value="">Tous les périmètres</option>
            {perimetres.map(p => <option key={p} value={p} data-no-translate>{p}</option>)}
          </select>
        </label>
      </div>

      <section style={st.section}>
        <div style={st.titre}>Dépenses par mois</div>
        <div style={st.total}>
          <span>Sur 12 mois :</span> <strong style={st.chiffre}><Chf v={mois.total.montant} /></strong>
          {', '}<span>{mois.total.n}</span> {pluriel(mois.total.n, 'facture chiffrée', 'factures chiffrées')}
          {mois.total.sansMontant ? <span style={st.manque}>, <span>{mois.total.sansMontant}</span> {pluriel(mois.total.sansMontant, 'facture sans aucun montant, non comptée', 'factures sans aucun montant, non comptées')}</span> : null}
        </div>
        <BarresMois points={pointsMois} />
        <div style={st.calcul}>
          Montant de chaque facture : total HT, à défaut TTC, à défaut somme des lignes lues. Mois de la date de facture. n/a : aucune facture chiffrée ce mois-là.
          {bons || exclues || mois.sansDate ? (
            <> Non additionnés :{bons ? <> <span>{bons}</span> {pluriel(bons, 'bon de livraison ou de commande', 'bons de livraison ou de commande')}</> : null}
              {exclues ? <>{bons ? ',' : ''} <span>{exclues}</span> {pluriel(exclues, 'facture exclue à la main', 'factures exclues à la main')}</> : null}
              {mois.sansDate ? <>{bons || exclues ? ',' : ''} <span>{mois.sansDate}</span> {pluriel(mois.sansDate, 'facture sans date', 'factures sans date')}</> : null}.</>
          ) : null}
        </div>
      </section>

      <section style={st.section}>
        <div style={st.titre}>Comparaison avec l'année précédente</div>
        <div style={st.total}>
          <span>12 derniers mois :</span> <strong style={st.chiffre}><Chf v={mois.total.montant} /></strong>
          {' ; '}<span>un an plus tôt :</span> <strong style={st.chiffre}><Chf v={mois.totalPrecedent.montant} /></strong>
          {mois.totalPrecedent.sansMontant ? <span style={st.manque}>, <span>{mois.totalPrecedent.sansMontant}</span> sans montant</span> : null}
        </div>
        <BarresComparees points={pointsCompares} series={seriesComparees} />
        <div style={st.calcul}>
          Chaque mois jusqu'à <MoisLong cle={mois.mois[11]} /> face au même mois un an plus tôt, même règle de montant. n/a : aucune facture chiffrée ni l'une ni l'autre année.
        </div>
      </section>

      <section style={st.section}>
        <div style={st.titre}>Par fournisseur, sur 12 mois</div>
        <BarresListe lignes={lignesFournisseurs} vide="n/a : aucune facture chiffrée sur 12 mois" />
        <div style={st.calcul}>
          Fournisseurs regroupés sans tenir compte des accents ni des majuscules ; une faute de frappe reste un fournisseur à part. Même règle de montant.
        </div>
      </section>

      <section style={st.section}>
        <div style={st.titre}>Par rayon, sur 12 mois</div>
        <BarresListe lignes={lignesRayons} vide="n/a : aucune ligne lue sur 12 mois" />
        <div style={st.calcul}>
          Chaque ligne lue (son montant) est rangée par le catalogue de l'établissement, puis par mots-clés. Non classé : rien de reconnu.
          {' '}<span>Réparti :</span> <Chf v={rayons.reparti} />.
          {rayons.nonRepartis ? <> <span>{rayons.nonRepartis}</span> {pluriel(rayons.nonRepartis, 'facture sans ligne lue n\'est pas répartie', 'factures sans ligne lue ne sont pas réparties')}{rayons.montantNonReparti != null ? <> (<Chf v={rayons.montantNonReparti} />)</> : null}.</> : null}
        </div>
      </section>

      <section style={st.section}>
        <div style={st.titre}>Évolution du prix d'un produit</div>
        {produits.length ? (
          <>
            <label style={st.filtre}>
              <span style={st.filtreLibelle}>Produit</span>
              <select value={serie?.cle || ''} onChange={e => setProduit(e.target.value)} style={st.select} aria-label="Produit suivi">
                {produits.map(s => <option key={s.cle} value={s.cle} data-no-translate>{s.nom} ({s.dates})</option>)}
              </select>
            </label>
            <CourbePrix
              points={pointsPrix}
              unite={serie.unite}
              libelleDebut={pointsPrix[0] ? dateCH(pointsPrix[0].date) : ''}
              libelleFin={pointsPrix.length ? dateCH(pointsPrix[pointsPrix.length - 1].date) : ''}
            />
          </>
        ) : (
          <div style={st.calcul}><span>n/a</span> : <span>aucune ligne lue avec un montant sur 12 mois.</span></div>
        )}
        <div style={st.calcul}>
          Prix payé = montant de la ligne divisé par la quantité livrée, ramenée au kg, au litre ou à la pièce (sinon par colis). Entre parenthèses : le nombre de dates connues.
        </div>
      </section>

      {aVerifier.length > 0 && (
        <section style={st.section}>
          <div style={st.titre}>Dates à vérifier</div>
          <div style={st.calcul}>
            Date de facture antérieure de plus d'un an à son enregistrement : l'année a peut-être été mal lue. Rien n'est corrigé d'office.
          </div>
          <div style={st.liste}>
            {aVerifier.map(d => (
              <div key={d.id} style={st.ligne}>
                <span style={st.ligneNom} data-no-translate>{d.fournisseurNom || 'Fournisseur non lu'}</span>
                <span style={st.ligneDetail}>
                  <span>facture du</span> <span>{dateCH(d.dateDocument)}</span>, <span>enregistrée le</span> <span>{dateCH(String(d.createdAt).slice(0, 10))}</span>
                </span>
              </div>
            ))}
          </div>
          <div><Btn variant="ghost" onClick={() => onVerifier(aVerifier.map(d => d.id))}>Vérifier ces dates</Btn></div>
        </section>
      )}
    </div>
  );
}

const st = {
  page: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  alerte: { color: 'var(--warning-text)', borderLeftWidth: 2, borderLeftStyle: 'solid', borderLeftColor: 'var(--warning-bd)', padding: '8px 0 8px 12px', fontSize: 12 },
  filtres: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' },
  filtre: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, maxWidth: '100%' },
  filtreLibelle: { fontSize: 12, color: 'var(--text2)' },
  select: { padding: '8px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', background: 'var(--surface)', fontFamily: 'var(--font)', maxWidth: '100%', minHeight: 40 },
  section: { display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 0 12px', borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)', minWidth: 0 },
  titre: { fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text)', lineHeight: 1.2 },
  total: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 },
  chiffre: { fontFamily: 'var(--font-num)', fontWeight: 500, color: 'var(--text)' },
  manque: { color: 'var(--warning-text)' },
  calcul: { fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 },
  liste: { display: 'flex', flexDirection: 'column', gap: 4 },
  ligne: { display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 13, alignItems: 'baseline' },
  ligneNom: { color: 'var(--text)', minWidth: 0 },
  ligneDetail: { color: 'var(--text2)', fontSize: 12 },
};
