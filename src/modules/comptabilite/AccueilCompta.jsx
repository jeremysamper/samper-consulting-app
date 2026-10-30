import React from 'react';
import { Building2, Coins, Receipt, Scale, TrendingUp, Users } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import BarrePeriode from './BarrePeriode.jsx';
import CarteChiffre from './CarteChiffre.jsx';
import LigneManques from './LigneManques.jsx';
import EtatAbsent from './EtatAbsent.jsx';
import { Chf, pctTexte, pluriel } from './comptaUi.jsx';
import { ecart, ventesComparables } from './syntheseCompta.js';
import { libelleComparaison } from './periodesCompta.js';
import { moyenneMensuelle } from './chargesFixes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil de la Comptabilité (D22) : la période, quatre grandes cartes à un
// chiffre (chiffre d'affaires, coût matière, coût du personnel, résultat
// estimé), la ligne « Pour des chiffres justes », puis une tuile par tâche, et
// la phrase qui dit ce que le module n'est pas. Une tuile hors droit n'est pas
// rendue. Nombres et dates dans leurs propres nœuds.
// ─────────────────────────────────────────────────────────────────────────────

const PIED = 'La comptabilité de l\'app prépare vos chiffres et vos pièces pour la fiduciaire. Elle ne tient pas les comptes et n\'établit ni le décompte TVA officiel ni les salaires.';

function Comparaison({ a, b, precedente, comparable = true }) {
  if (!precedente || !comparable) return null;
  const e = ecart(a, b);
  if (e === 'n/a') return null;
  return <><span>{e}</span> <span>sur</span> <span>{libelleComparaison(precedente)}</span></>;
}

export default function AccueilCompta({
  barre, periode, precedente, aujourdhui, data, direction, onOuvrir,
}) {
  const s = data.synthese;
  const p = data.precedente;
  const { etats } = data;
  // Chiffre d'affaires et résultat ne se comparent qu'à une période précédente
  // dont les ventes sont connues (ventesComparables).
  const comparable = etats.couverture === 'ready' && ventesComparables(p?.ventes);

  const caLignes = [
    s.ca != null && (etats.couverture === 'ready' && s.ventes?.attendus
      ? <>hors TVA, <span>{s.ventes.avec}</span> <span>{pluriel(s.ventes.avec, 'jour sur', 'jours sur')}</span> <span>{s.ventes.attendus}</span></>
      : <>hors TVA</>),
    s.ca != null && <Comparaison a={s.ca} b={p?.ca} precedente={precedente} comparable={comparable} />,
  ];
  const matiereLignes = [
    s.ratios.matierePct != null && <><span>{pctTexte(s.ratios.matierePct)}</span> <span>du chiffre d'affaires</span></>,
    periode?.type === 'inventaire'
      ? (s.matiere.variationStock != null ? <>variation de stock comprise</> : <>pas d'inventaire au début ou à la fin</>)
      : <>sans variation de stock</>,
    s.matiere.ht != null && <Comparaison a={s.matiere.ht} b={p?.matiere.ht} precedente={precedente} />,
  ];
  const resultatLignes = [
    s.avantCharges
      ? <>avant charges fixes</>
      : <><span>après</span> <Chf v={s.charges} entier /> <span>de charges fixes</span></>,
    s.avantPersonnel && <>avant personnel</>,
    s.prorata && <><span>au prorata des jours écoulés,</span> <span>{s.prorata.ecoules}</span> <span>sur</span> <span>{s.prorata.total}</span></>,
    s.resultat != null && <Comparaison a={s.resultat} b={p?.resultat} precedente={precedente} comparable={comparable} />,
  ];

  // ── Tuiles ──
  const absenteVentes = data.ventesJour.status === 'absente';
  const absenteCharges = data.charges.status === 'absente';
  const jourDuJour = data.parJourTout.find(j => j.jour === aujourdhui && j.source);
  const moyenne = moyenneMensuelle(data.charges.lignes, aujourdhui);
  const nCharges = data.charges.lignes.length;
  const tuiles = [
    {
      id: 'jour', libelle: 'Chiffre du jour', Icone: Coins, onClick: () => onOuvrir('jour'),
      etat: absenteVentes ? <>Pas encore activé</>
        : data.ventesJour.status !== 'ready' ? null
          : jourDuJour ? <><span>aujourd'hui :</span> <Chf v={jourDuJour.ttc} /></> : <>aujourd'hui : pas encore saisi</>,
    },
    {
      id: 'ventes', libelle: 'Ventes', Icone: TrendingUp, onClick: () => onOuvrir('ventes'),
      etat: etats.ventes !== 'ready' ? null
        : s.ventes?.ttc != null ? <><Chf v={s.ventes.ttc} /> <span>TVA comprise</span></> : <>aucune vente connue</>,
    },
    {
      id: 'achats', libelle: 'Achats', Icone: Receipt, onClick: () => onOuvrir('achats'),
      etat: etats.achats !== 'ready' ? null
        : <><span>{s.matiere.factures}</span> <span>{pluriel(s.matiere.factures, 'facture,', 'factures,')}</span> <Chf v={s.matiere.achatsHt} /> <span>hors TVA</span></>,
    },
    {
      id: 'charges', libelle: 'Charges fixes', Icone: Building2, onClick: () => onOuvrir('charges'),
      etat: absenteCharges ? <>Pas encore activé</>
        : data.charges.status !== 'ready' ? null
          : nCharges ? <><span>{nCharges}</span> <span>{pluriel(nCharges, 'charge,', 'charges,')}</span> <Chf v={moyenne.ttc} /> <span>par mois</span></> : <>Aucune charge saisie</>,
    },
  ];

  return (
    <>
      {data.migrationAbsente && <EtatAbsent bandeau />}

      {barre}

      {periode ? (
        <>
          <div className="compta-cartes" data-cartes="">
            <CarteChiffre
              id="ca" titre="Chiffre d'affaires" Icone={TrendingUp} etat={etats.ventes}
              valeur={<Chf v={s.ca} entier />} lignes={caLignes} onClick={() => onOuvrir('ventes')}
            />
            <CarteChiffre
              id="matiere" titre="Coût matière" Icone={Receipt} etat={etats.matiere}
              valeur={<Chf v={s.matiere.ht} entier />} lignes={matiereLignes} onClick={() => onOuvrir('achats')}
            />
            <CarteChiffre
              id="personnel" titre="Coût du personnel" Icone={Users}
              valeur={<span style={{ color: 'var(--text3)' }}>n/a</span>}
              lignes={[direction ? <>arrive bientôt</> : <>réservé à la direction</>]}
            />
            <CarteChiffre
              id="resultat" titre="Résultat estimé" Icone={Scale} etat={etats.resultat}
              valeur={<Chf v={s.resultat} entier />} lignes={resultatLignes} onClick={() => onOuvrir('ensemble')}
              ton={s.resultat != null && s.resultat < 0 ? 'danger' : undefined}
            />
          </div>
          <LigneManques manques={data.manquesVisibles} onOuvrir={onOuvrir} />
        </>
      ) : (
        <p style={st.phrase}>Aucun inventaire validé : la période d'inventaire commence au premier inventaire validé.</p>
      )}

      <AccueilModule tuiles={tuiles} />

      <p style={st.pied} data-pied-compta="">{PIED}</p>
    </>
  );
}

const st = {
  phrase: { margin: 0, fontSize: 14, color: 'var(--text2)', lineHeight: 1.5 },
  pied: { margin: '4px 0 0', fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, maxWidth: 640 },
};
