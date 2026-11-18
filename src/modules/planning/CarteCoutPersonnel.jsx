import React from 'react';
import { Panneau } from '../../components/ui/index.jsx';
import { useCompta } from '../comptabilite/useCompta.js';
import { Chf, pctTexte } from '../comptabilite/comptaUi.jsx';
import { decaler } from './conformiteCcnt.js';
import { SEMAINES_MOYENNE, caPrevu, coutPrevu, joursDe, partDuCa } from './coutPersonnel.js';

// ─────────────────────────────────────────────────────────────────────────────
// Carte « Coût du personnel » sous la grille du Planning : coût prévu de la
// semaine affichée et sa part du chiffre d'affaires, en total et par jour
// (règles dans coutPersonnel.js). Montée par Planning.jsx seulement pour qui
// voit les salaires dans la Comptabilité (consultant et patron, module
// Comptabilité ouvert) : pour les autres, aucune lecture ne part.
//
// Lectures : le hook useCompta de la Comptabilité, comme le module
// Statistiques (salaires estimés, contrats, réglages des charges, chiffre
// d'affaires par jour : saisie, caisse, notes de séjour), sur la semaine et
// les 4 semaines avant aujourd'hui. Les horaires sont ceux du Planning, passés
// par la page : un horaire modifié change le chiffre tout de suite.
// Hors impression (no-print).
// ─────────────────────────────────────────────────────────────────────────────

const SANS_INVENTAIRES = { data: [], status: 'ready' };
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const jourSemaine = (iso) => JOURS_COURTS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const jourMois = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const heures = (min) => (Math.round(min / 6) / 10).toLocaleString('fr-CH', { maximumFractionDigits: 1 });

function Jour({ iso }) {
  return <><span>{jourSemaine(iso)}</span> <span data-no-translate>{jourMois(iso)}</span></>;
}

function Liste({ items }) {
  return items.map((it, i) => (
    <React.Fragment key={it.cle}>
      {i > 0 && ', '}
      {it.contenu}
    </React.Fragment>
  ));
}

function Chiffre({ valeur, libelle }) {
  return (
    <div style={st.chiffre}>
      <div style={st.chiffreValeur}>{valeur}</div>
      <div style={st.chiffreLibelle}>{libelle}</div>
    </div>
  );
}

const TEXTE_RAISON = {
  chargement: 'calcul en cours',
  ca_non_lu: 'CA non lu',
  sans_horaire: 'aucun horaire',
  sans_taux: 'sans taux',
  sans_ca: 'CA manquant',
  ca_nul: 'CA nul',
};

function CarteCoutPersonnel({ etablissement, debut, fin, shifts, aujourdhui, nomDe, heuresEtab }) {
  const jours = React.useMemo(() => joursDe(debut, fin), [debut, fin]);
  // Fenêtre de lecture : la semaine, plus les 4 semaines avant aujourd'hui
  // quand la semaine porte aujourd'hui ou des jours à venir (moyenne).
  const periode = React.useMemo(() => {
    const debutMoyenne = decaler(aujourdhui, -7 * SEMAINES_MOYENNE);
    return { type: 'libre', debut: fin >= aujourdhui && debutMoyenne < debut ? debutMoyenne : debut, fin };
  }, [debut, fin, aujourdhui]);

  const compta = useCompta({ etablissement, periode, precedente: null, aujourdhui, inventaires: SANS_INVENTAIRES, direction: true, banque: false });
  const { salaires, contrats, reglages, reglagesLus, etats, parJourTout, notesCouvrent } = compta;

  const contratsStatut = contrats.status === 'absent' ? 'ready' : contrats.status;
  const coutEtat = salaires.status === 'error' || contratsStatut === 'error' ? 'error'
    : [salaires.status, contratsStatut, reglagesLus.status].includes('loading') ? 'loading' : 'ready';
  // Réglages illisibles : coût brut, sans charges ni coût moyen (dit à l'écran).
  const reglagesLisibles = reglagesLus.status !== 'error';
  const chargesPct = reglagesLisibles ? reglages.chargesSocialesPct : null;
  const coutMoyen = reglagesLisibles ? reglages.coutHoraireMoyen : null;

  const cout = React.useMemo(() => (coutEtat === 'ready' ? coutPrevu({
    jours, shifts, salaires: salaires.lignes, contrats: contrats.contrats, chargesPct, coutMoyen, heuresEtab,
  }) : null), [coutEtat, jours, shifts, salaires.lignes, contrats.contrats, chargesPct, coutMoyen, heuresEtab]);
  const ca = React.useMemo(
    () => caPrevu({ jours, ventes: parJourTout, statut: etats.ventes, aujourdhui, notesCouvrent }),
    [jours, parJourTout, etats.ventes, aujourdhui, notesCouvrent],
  );
  const part = React.useMemo(() => (cout ? partDuCa({ jours, cout, ca }) : null), [jours, cout, ca]);
  const nonActualise = [compta.ventesJour, compta.caisse, salaires, reglagesLus].some(l => l?.enEchec);

  // Comptabilité pas encore activée sur la base : rien à chiffrer.
  if (salaires.status === 'absente') return null;

  const titre = (
    <div style={st.entete}>
      <div style={st.titre}>Coût du personnel</div>
      <div style={st.semaine}><span>Semaine du</span> <Jour iso={debut} /></div>
    </div>
  );

  if (coutEtat !== 'ready' || !part) {
    return (
      <div className="no-print" data-cout-personnel="">
        <Panneau style={st.carte}>
          {titre}
          <p style={{ ...st.note, color: coutEtat === 'error' ? 'var(--danger-text)' : 'var(--text2)' }} data-cout-etat={coutEtat}>
            {coutEtat === 'error' ? 'Salaires non lus pour l\'instant. Nouvel essai en cours.' : 'Calcul du coût du personnel…'}
          </p>
        </Panneau>
      </div>
    );
  }

  const t = part.total;
  const valeurPart = t.part != null
    ? <span data-no-translate>{pctTexte(t.part * 100)}</span>
    : <span style={st.manque}>{t.raison === 'chargement' ? 'en calcul' : t.raison === 'sans_taux' ? 'sans taux' : 'non calculée'}</span>;
  const valeurCa = t.ht != null ? <Chf v={t.ht} entier /> : <span style={st.manque}>{t.raison === 'chargement' ? 'en calcul' : 'non lu'}</span>;

  return (
    <div className="no-print" data-cout-personnel="">
      <Panneau style={st.carte}>
        {titre}
        <div style={st.chiffres}>
          <Chiffre valeur={<span data-cout-total=""><Chf v={t.cout} entier /></span>} libelle={cout.chargesPct != null ? 'coût prévu, charges comprises' : 'coût brut, sans charges'} />
          <Chiffre
            valeur={<span data-cout-part="">{valeurPart}</span>}
            libelle={cout.minutesSansTaux > 0 && t.part != null ? 'du chiffre d\'affaires, heures sans taux non comprises' : 'du chiffre d\'affaires'}
          />
          <Chiffre valeur={valeurCa} libelle="CA hors TVA" />
        </div>

        <div style={st.jours} data-cout-jours="">
          {jours.map((j) => {
            const l = part.parJour[j];
            return (
              <div key={j} style={st.jour} data-cout-jour={j}>
                <div style={st.jourNom}><Jour iso={j} /></div>
                <div style={st.jourCout}>{l.minutes ? <Chf v={l.cout} entier /> : <span style={st.manque}><Chf v={0} entier /></span>}</div>
                <div style={st.jourPart}>
                  {l.part != null ? <span data-no-translate>{pctTexte(l.part * 100)}</span> : <span style={st.manque}>{TEXTE_RAISON[l.raison] || ''}</span>}
                </div>
                {l.minutes > 0 && (l.base === 'realise' || l.base === 'moyenne') && <div style={st.jourBase}>{l.base === 'realise' ? 'réalisé' : 'moyenne'}</div>}
                {l.minutesSansTaux > 0 && (
                  <div style={{ ...st.jourBase, color: 'var(--warning-text)' }}>
                    <span data-no-translate>{heures(l.minutesSansTaux)} h</span> <span>sans taux</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={st.notes}>
          <p style={st.note}>
            {cout.chargesPct != null
              ? <><span>Charges sociales comprises, au taux de la Comptabilité :</span> <span data-no-translate>{String(cout.chargesPct).replace('.', ',')} %</span>.</>
              : 'Coût brut, sans charges : les réglages de la Comptabilité ne sont pas lus.'}
          </p>
          <p style={st.note}>
            {part.bases.realise > 0 && part.bases.moyenne > 0 && 'CA hors TVA : réalisé pour les jours passés, moyenne des 4 dernières semaines pour aujourd\'hui et les jours à venir.'}
            {part.bases.realise > 0 && part.bases.moyenne === 0 && 'CA hors TVA réalisé.'}
            {part.bases.realise === 0 && part.bases.moyenne > 0 && 'CA hors TVA : moyenne des mêmes jours sur les 4 dernières semaines.'}
            {part.bases.realise === 0 && part.bases.moyenne === 0 && t.raison === 'ca_non_lu' && 'Chiffre d\'affaires non lu pour l\'instant : la part n\'est pas calculée. Nouvel essai en cours.'}
            {part.bases.realise === 0 && part.bases.moyenne === 0 && t.raison === 'chargement' && 'Lecture du chiffre d\'affaires en cours.'}
          </p>
          {part.joursSansCa.length > 0 && (
            <p style={st.note} data-cout-sans-ca="">
              <span>Sans chiffre d'affaires, hors de la part :</span>{' '}
              <Liste items={part.joursSansCa.map(j => ({ cle: j, contenu: <Jour iso={j} /> }))} />.
            </p>
          )}
          {cout.sansTaux.length > 0 && (
            <p style={{ ...st.note, color: 'var(--warning-text)' }} data-cout-sans-taux="">
              <span>Sans taux, heures non chiffrées :</span>{' '}
              <Liste items={cout.sansTaux.map(p => ({
                cle: p.userId,
                contenu: <><span data-no-translate>{nomDe(p.userId)}</span> <span data-no-translate>({heures(p.minutes)} h)</span></>,
              }))}
              />. <span>Saisissez leur salaire dans la Comptabilité.</span>
            </p>
          )}
          {cout.auCoutMoyen.length > 0 && (
            <p style={st.note} data-cout-moyen="">
              <span>Au coût horaire moyen de la maison :</span>{' '}
              <Liste items={cout.auCoutMoyen.map(id => ({ cle: id, contenu: <span data-no-translate>{nomDe(id)}</span> }))} />.
            </p>
          )}
          {nonActualise && <p style={st.note}>Chiffres pas actualisés. Nouvel essai en cours.</p>}
        </div>
      </Panneau>
    </div>
  );
}

// Une erreur de la carte ne doit jamais emporter la grille pendant le service :
// la carte se retire seule, l'erreur part dans la console.
class GardeCarte extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erreur: false };
  }

  static getDerivedStateFromError() {
    return { erreur: true };
  }

  componentDidCatch(error) {
    console.error('[planning] coût du personnel', error);
  }

  render() {
    return this.state.erreur ? null : this.props.children;
  }
}

export default function CarteCoutPersonnelGardee(props) {
  return <GardeCarte><CarteCoutPersonnel {...props} /></GardeCarte>;
}

const st = {
  carte: { padding: 16, marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, maxWidth: '100%' },
  entete: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 16px' },
  titre: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  semaine: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  chiffres: { display: 'flex', flexWrap: 'wrap', gap: '12px 32px' },
  chiffre: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  chiffreValeur: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t5)', color: 'var(--text)', lineHeight: 1.2 },
  chiffreLibelle: { fontSize: 'var(--t1)', color: 'var(--text3)' },
  jours: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 8 },
  jour: { background: 'var(--piste)', borderRadius: 'var(--r)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  jourNom: { fontSize: 'var(--t1)', color: 'var(--text2)', whiteSpace: 'nowrap' },
  jourCout: { fontSize: 'var(--t2)', color: 'var(--text)', fontWeight: 'var(--g2)' },
  jourPart: { fontSize: 'var(--t1)', color: 'var(--text)', fontFamily: 'var(--font-num)' },
  jourBase: { fontSize: 'var(--t1)', color: 'var(--text3)' },
  manque: { fontFamily: 'var(--font)', color: 'var(--text3)', fontSize: 'var(--t1)' },
  notes: { display: 'flex', flexDirection: 'column', gap: 4 },
  note: { margin: 0, fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.5 },
};
