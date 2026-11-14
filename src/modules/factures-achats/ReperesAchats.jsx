import React from 'react';
import { AlarmClock, Banknote, ChartLine } from 'lucide-react';
import { Arc, Barres, CarteAvant, CarteRepere, Panneau, carteAvantStyles, ligneStyle } from '../../components/ui/index.jsx';
import { dateCH } from '../inventaire/inventaireLignes.js';
import { depensesSixMois, partsFournisseurs, prochainesEcheances, reperesAchats } from './accueilAchats.js';
import './achats.css';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil de Factures & achats (direction Galet) : la rangée de repères, la
// liste des prochaines échéances et les deux cartes pastel, posées par
// AccueilInventaire (vue « achats ») autour des tuiles. Rien n'est lu en plus :
// tout vient des documents d'achat déjà chargés, comptés par accueilAchats.js.
//
//   repères      factures à régler et en retard (droit « Régler les
//                factures », comme leurs tuiles), dépenses des 12 mois (comme
//                la tuile des analyses)
//   échéances    (carte blanche) les factures à régler les plus pressées ;
//                même droit que la tuile « Échéances », qui l'ouvre
//   soleil       les dépenses des six derniers mois
//   ciel         les dépenses des 12 mois par fournisseur
//
// Les deux cartes pastel ont la garde de la tuile des analyses (aucune garde
// de plus que la page) ; la tuile ouvre les analyses, les cartes n'ont pas de
// flèche en plus (une seule façon d'ouvrir une chose). Une carte sans donnée
// n'est pas rendue. Au téléphone (achats.css) : une seule carte de mise en
// avant (les dépenses), pas de liste des échéances (la tuile y mène), et le
// repère des dépenses, que la carte répète, n'est pas rendu.
// Nombres, dates et noms dans leurs propres nœuds : la phrase autour reste une
// entrée du glossaire. Crochets du banc : data-achats-reperes, data-repere,
// data-achats-echeances, data-carte.
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children }) => <span data-no-translate="">{children}</span>;
const chf = (n) => (Number(n) || 0).toLocaleString('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)', 'var(--serie-5)', 'var(--serie-6)'];

export default function ReperesAchats({ docs, aujourdhui, canRegler, depenses }) {
  const r = React.useMemo(() => (canRegler ? reperesAchats(docs, aujourdhui) : null), [docs, aujourdhui, canRegler]);
  return (
    <div className="ach-reperes" data-achats-reperes="">
      {r && (
        <CarteRepere
          data-repere="a-regler"
          Icone={Banknote}
          valeur={r.aRegler.n}
          libelle={r.aRegler.n > 1 ? 'factures à régler' : 'facture à régler'}
          detail={r.aRegler.n
            ? <><span>CHF</span> <N>{chf(r.aRegler.montant)}</N>{r.aRegler.sansTTC ? <>, <N>{r.aRegler.sansTTC}</N> sans TTC</> : null}</>
            : <>tout est réglé</>}
        />
      )}
      {r && (
        <CarteRepere
          data-repere="en-retard"
          Icone={AlarmClock}
          valeur={r.enRetard.n ? <span style={{ color: 'var(--danger-strong)' }}>{r.enRetard.n}</span> : 0}
          libelle="en retard"
          detail={r.prochaine
            ? <>prochaine le <N>{dateCH(r.prochaine)}</N></>
            : <>aucune échéance à venir</>}
        />
      )}
      {depenses && (
        depenses.montant == null ? (
          <CarteRepere data-repere="depenses" Icone={ChartLine} texte="aucune facture chiffrée sur 12 mois" />
        ) : (
          <CarteRepere
            data-repere="depenses"
            Icone={ChartLine}
            valeur={<span style={st.montant}>{`CHF ${chf(depenses.montant)}`}</span>}
            libelle="dépenses sur 12 mois"
            detail={<><N>{depenses.n}</N> {depenses.n > 1 ? 'factures chiffrées' : 'facture chiffrée'}</>}
          />
        )
      )}
    </div>
  );
}

// La liste des échéances et les deux cartes pastel, enfants directs de la
// grille de l'accueil (achats.css les range).
export function CartesAchats({ docs, aujourdhui, canRegler }) {
  return (
    <>
      {canRegler && <ListeEcheances docs={docs} aujourdhui={aujourdhui} />}
      <div className="ach-cartes">
        <CarteSixMois docs={docs} aujourdhui={aujourdhui} />
        <CarteFournisseurs docs={docs} aujourdhui={aujourdhui} />
      </div>
    </>
  );
}

function ListeEcheances({ docs, aujourdhui }) {
  const e = React.useMemo(() => prochainesEcheances(docs, aujourdhui, 5), [docs, aujourdhui]);
  return (
    <div className="ach-echeances" data-achats-echeances="">
      <Panneau style={st.panneau}>
        <div style={st.teteCarte}>
          <h2 style={st.titreCarte}>Prochaines échéances</h2>
        </div>
        {e.lignes.length === 0 ? (
          <p style={st.vide}>Toutes les factures sont réglées.</p>
        ) : (
          <div>
            {e.lignes.map((f, i) => (
              <div key={f.id} style={{ ...ligneStyle({ derniere: i === e.lignes.length - 1 && !e.reste }), ...st.ligne }}>
                <span style={st.colonneNom}>
                  <span style={st.nom}>
                    <N>{f.fournisseur || 'Fournisseur non lu'}</N>
                    {f.numero ? <span style={st.numero}> <N>{`n° ${f.numero}`}</N></span> : null}
                  </span>
                  <span style={st.detail}>
                    {f.enRetard && <span aria-hidden="true" style={st.point} />}
                    {f.enRetard && <span style={st.retard}>en retard</span>}
                    {f.enRetard && ', '}
                    {f.dateEcheance ? <><span>échéance le</span> <N>{dateCH(f.dateEcheance)}</N></> : <span>sans échéance</span>}
                  </span>
                </span>
                <span style={st.montantLigne}>
                  {f.montant != null ? <><span>CHF</span> <N>{chf(f.montant)}</N></> : <span style={st.manque}>TTC à saisir</span>}
                </span>
              </div>
            ))}
            {e.reste > 0 && (
              <p style={st.reste}><N>{e.reste}</N> {e.reste > 1 ? 'autres factures à régler' : 'autre facture à régler'}</p>
            )}
          </div>
        )}
      </Panneau>
    </div>
  );
}

function CarteSixMois({ docs, aujourdhui }) {
  const s = React.useMemo(() => depensesSixMois(docs, aujourdhui), [docs, aujourdhui]);
  if (s.total == null) return null;
  const c = carteAvantStyles('soleil');
  return (
    <CarteAvant
      ton="soleil"
      className="ach-soleil"
      data-carte="six-mois"
      titre={<span style={st.titrePastel}>Six derniers mois</span>}
    >
      <p style={st.ligneChiffre}>
        <span style={c.chiffre} data-no-translate="">{`CHF ${chf(s.total)}`}</span>
        <span style={c.libelle}>de dépenses</span>
      </p>
      <div className="ach-barres">
        <Barres
          valeurs={s.mois.map(m => Math.round(m.valeur))}
          libelles={s.mois.map(m => m.libelle)}
          fort={s.mois.length - 1}
          encre="var(--carte-soleil-texte)"
        />
      </div>
    </CarteAvant>
  );
}

function CarteFournisseurs({ docs, aujourdhui }) {
  const p = React.useMemo(() => partsFournisseurs(docs, aujourdhui, 4), [docs, aujourdhui]);
  if (p.total == null) return null;
  const c = carteAvantStyles('ciel');
  const parts = p.lignes.map((l, i) => ({ valeur: l.montant, couleur: SERIES[Math.min(i, SERIES.length - 1)] }));
  return (
    <CarteAvant
      ton="ciel"
      className="ach-ciel"
      data-carte="fournisseurs"
      titre={<span style={st.titrePastel}>Par fournisseur, sur 12 mois</span>}
    >
      <div className="ach-repartition">
        <Arc parts={parts} total={p.total} piste="var(--surface)">
          <span style={{ ...c.chiffre, fontSize: 'var(--t4)' }} data-no-translate="">{`CHF ${chf(p.total)}`}</span>
        </Arc>
        <div style={st.legende}>
          {p.lignes.map((l, i) => (
            <div key={l.cle} style={st.legendeLigne}>
              <span aria-hidden="true" style={{ ...st.pointSerie, background: SERIES[Math.min(i, SERIES.length - 1)] }} />
              <span style={st.fournisseur}>
                {l.autres ? <><N>{l.n}</N> {l.n > 1 ? 'autres fournisseurs' : 'autre fournisseur'}</> : <N>{l.label}</N>}
              </span>
              <span style={st.valeur} data-no-translate="">{chf(l.montant)}</span>
              <span style={st.part} data-no-translate="">{`${l.part} %`}</span>
            </div>
          ))}
        </div>
      </div>
    </CarteAvant>
  );
}

const st = {
  // Un montant dans un repère : une taille qui tient dans un tiers de ligne.
  montant: { display: 'inline-block', fontSize: 'var(--t5)', lineHeight: 1.15, overflowWrap: 'anywhere' },
  panneau: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  teteCarte: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 },
  titreCarte: { margin: 0, fontFamily: 'var(--font)', fontSize: 'var(--t3)', fontWeight: 'var(--g3)', lineHeight: 1.25, color: 'var(--text)' },
  vide: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text3)' },
  ligne: { justifyContent: 'space-between' },
  colonneNom: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, padding: '6px 0' },
  nom: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', minWidth: 0, overflowWrap: 'anywhere' },
  numero: { fontWeight: 'var(--g1)', color: 'var(--text3)' },
  detail: { fontSize: 'var(--t1)', lineHeight: 1.4, color: 'var(--text2)' },
  point: { display: 'inline-block', width: 8, height: 8, marginRight: 6, borderRadius: '50%', background: 'var(--danger-strong)', verticalAlign: 'middle' },
  retard: { color: 'var(--danger-text)', fontWeight: 'var(--g2)' },
  montantLigne: { flexShrink: 0, textAlign: 'right', fontFamily: 'var(--font-num)', fontSize: 'var(--t2)', color: 'var(--text)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  manque: { color: 'var(--warning-text)', fontFamily: 'var(--font)', fontSize: 'var(--t1)' },
  reste: { margin: '8px 0 0', fontSize: 'var(--t1)', color: 'var(--text3)' },
  titrePastel: { fontSize: 'var(--t3)', lineHeight: 1.25 },
  ligneChiffre: { display: 'flex', alignItems: 'baseline', gap: 8, margin: 0, flexWrap: 'wrap' },
  legende: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  legendeLigne: { display: 'grid', gridTemplateColumns: '10px minmax(0, 1fr) auto 44px', alignItems: 'center', gap: 10, fontSize: 'var(--t2)', color: 'var(--carte-ciel-texte)' },
  pointSerie: { width: 10, height: 10, borderRadius: '50%' },
  fournisseur: { fontWeight: 'var(--g2)', minWidth: 0, overflowWrap: 'anywhere' },
  valeur: { fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  part: { textAlign: 'right', fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' },
};
