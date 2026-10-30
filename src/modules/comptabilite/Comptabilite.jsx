import React from 'react';
import './compta.css';
import { canManageModule, getPermissionsForRole } from '../../data/demoData.js';
import { isPageActiveForEtab } from '../moduleConfig.js';
import { dbService } from '../../services/dbService.js';
import { navigateToPage } from '../../services/navigationService.js';
import { readJson, writeJson } from '../../utils/storage.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { Btn } from '../../components/ui/index.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { ECRAN_ACCUEIL, useEcranModule } from '../../components/parcours/useEcranModule.js';
import BandeauNonActualise from '../previsions/BandeauNonActualise.jsx';
import AccueilCompta from './AccueilCompta.jsx';
import BarrePeriode from './BarrePeriode.jsx';
import EcranEnsemble from './EcranEnsemble.jsx';
import EcranChiffreJour from './EcranChiffreJour.jsx';
import EcranVentes from './EcranVentes.jsx';
import EcranAchats from './EcranAchats.jsx';
import EcranCharges from './EcranCharges.jsx';
import FenetreReglages from './FenetreReglages.jsx';
import { useLecture } from './comptaService.js';
import { useCompta } from './useCompta.js';
import { ventesComparables } from './syntheseCompta.js';
import { Chf, pluriel, st as ui } from './comptaUi.jsx';
import {
  TYPES_PERIODE, libellePeriode, periodeAnnee, periodeCourante, periodeMois, periodePrecedente, periodeSuivante,
  periodeTrimestre, periodesInventaire,
} from './periodesCompta.js';

// ─────────────────────────────────────────────────────────────────────────────
// COMPTABILITÉ : tout ce qui touche à l'argent, de près ou de loin, pour la
// direction. La pré-comptabilité du terrain, jamais la tenue des comptes : le
// module prépare les chiffres et les pièces pour la fiduciaire.
//
// Droits (D4, D5) : lire les chiffres = rôle consultant ou patron, ou droit
// « Régler les factures » (factures_achat) ; saisir (chiffre du jour, charges
// fixes, réglages) = ce même droit. Qui voit le module sans pouvoir lire les
// chiffres (écart personnel) voit un seul écran d'explication et aucune
// lecture n'est lancée : la RLS rendrait des listes vides, qui mentiraient.
//
// Écrans (socle des parcours) : accueil (période, quatre cartes, ce qui
// manque, tuiles), Vue d'ensemble, Chiffre du jour, Ventes, Achats, Charges
// fixes. Calculs dans des fonctions pures (periodesCompta, ventesCompta,
// chargesFixes, syntheseCompta), lectures dans useCompta.
// ─────────────────────────────────────────────────────────────────────────────

const CLE_PERIODE = 'sc_comptabilite_periode';
const ECRANS_REPRIS = ['ensemble', 'ventes', 'achats', 'charges'];

export default function Comptabilite({ user, etablissement, setPage }) {
  const direction = ['consultant', 'patron'].includes(user?.role);
  const peutRegler = canManageModule(user?.role, 'factures_achat');
  if (!direction && !peutRegler) {
    return (
      <section className="compta" style={ui.page} data-compta-sans-droit="">
        <p style={ui.texte}>
          Ces chiffres sont réservés à la direction et aux personnes qui règlent les factures. Demandez à votre consultant le droit « Régler les factures ».
        </p>
      </section>
    );
  }
  return (
    <ModuleCompta
      key={etablissement?.id || 'aucun'}
      user={user}
      etablissement={etablissement}
      setPage={setPage}
      direction={direction}
      peutEcrire={peutRegler}
    />
  );
}

function ModuleCompta({ user, etablissement, setPage, direction, peutEcrire }) {
  const etabId = etablissement?.id || null;
  const aujourdhui = zurichToday();
  const legacySB = dbService.getBridge();
  const perms = getPermissionsForRole(user.role);
  const peutOuvrirAchats = perms.inventaire !== false && isPageActiveForEtab(etablissement, 'achats');

  // ── Période : type mémorisé par personne, période en cours par défaut ──
  const [type, setType] = React.useState(() => {
    const t = readJson(CLE_PERIODE, null)?.type;
    return TYPES_PERIODE.some(x => x.id === t) ? t : 'mois';
  });
  const [ancre, setAncre] = React.useState(null); // début de la période choisie ; null = en cours
  const [fenetre, setFenetre] = React.useState(null); // 'reglages'
  const [jourSaisie, setJourSaisie] = React.useState(null);

  const lireInventaires = React.useCallback(() => legacySB.db.listInventaires(etabId, { strict: true }), [etabId]);
  const inventaires = useLecture(`compta-inventaires|${etabId}`, lireInventaires, { actif: !!etabId && !!legacySB, tables: ['inventaires'] });
  const periodesInv = React.useMemo(() => periodesInventaire(inventaires.data || [], aujourdhui), [inventaires.data, aujourdhui]);

  const periode = React.useMemo(() => {
    if (type === 'inventaire') return (ancre && periodesInv.find(p => p.debut === ancre)) || periodesInv[periodesInv.length - 1] || null;
    if (!ancre) return periodeCourante(type, aujourdhui);
    if (type === 'trimestre') return periodeTrimestre(ancre);
    if (type === 'annee') return periodeAnnee(ancre);
    return periodeMois(ancre);
  }, [type, ancre, periodesInv, aujourdhui]);
  // Sans inventaire validé, les tuiles se lisent sur le mois en cours.
  const periodeCalcul = React.useMemo(() => periode || periodeMois(aujourdhui), [periode, aujourdhui]);
  const precedente = React.useMemo(() => (periode ? periodePrecedente(periode, { periodesInv }) : null), [periode, periodesInv]);
  const suivante = periode ? periodeSuivante(periode, aujourdhui, { periodesInv }) : null;

  const choisirType = (t) => {
    setType(t);
    setAncre(null);
    writeJson(CLE_PERIODE, { type: t });
  };

  const data = useCompta({ etablissement, periode: periodeCalcul, precedente, aujourdhui, inventaires });

  const { ecran, setEcran, retourAccueil } = useEcranModule('comptabilite', {
    repris: ECRANS_REPRIS,
    surRetour: () => setJourSaisie(null),
  });
  const ouvrir = (e) => { if (e) setEcran(e); };
  const ouvrirAchats = () => (typeof setPage === 'function' ? setPage('achats') : navigateToPage('achats'));

  const s = data.synthese;
  const { etats } = data;
  // Un manque ne s'affiche que si les lectures dont il dépend ont abouti.
  const manquesVisibles = s.manques.filter((m) => {
    if (m.id === 'jours') return etats.couverture === 'ready' && etats.ventes === 'ready' && data.ventesJour.status !== 'absente';
    if (['sansHt', 'sansTaux', 'doublons'].includes(m.id)) return etats.achats === 'ready';
    if (m.id === 'aucuneCharge') return data.charges.status === 'ready';
    if (m.id === 'inventaire') return etats.matiere === 'ready';
    return true;
  });

  const libelle = periode ? libellePeriode(periode) : '';
  const libellePrec = precedente ? libellePeriode(precedente) : '';
  const actions = peutEcrire
    ? [{ id: 'reglages', label: 'Réglages', detail: 'Méthode de TVA, charges sociales, coût horaire moyen.', onClick: () => setFenetre('reglages') }]
    : [];

  const barre = (
    <BarrePeriode
      type={type}
      onType={choisirType}
      libelle={libelle}
      peutPrecedent={!!precedente}
      peutSuivant={!!suivante}
      onPrecedent={() => precedente && setAncre(precedente.debut)}
      onSuivant={() => suivante && setAncre(suivante.debut)}
      actions={actions}
    />
  );

  const etatPeriode = libelle ? <><span>{libelle}</span>{libellePrec ? <>, <span>comparé à</span> <span>{libellePrec}</span></> : null}</> : null;

  return (
    <div className="compta" style={ui.page} data-compta="">
      {data.enEchec && <BandeauNonActualise onRetry={data.reloadTout} />}

      {ecran === ECRAN_ACCUEIL && (
        <AccueilCompta
          barre={barre}
          periode={periode}
          precedente={precedente}
          aujourdhui={aujourdhui}
          data={{ ...data, manquesVisibles }}
          direction={direction}
          onOuvrir={ouvrir}
        />
      )}

      {ecran === 'ensemble' && (
        <EcranTache titre="Vue d'ensemble" etat={etatPeriode} onRetour={retourAccueil}>
          <EcranEnsemble
            s={s}
            p={data.precedente}
            periode={periodeCalcul}
            precedente={precedente}
            hebergement={data.hebergement}
            comparable={etats.couverture === 'ready' && ventesComparables(data.precedente?.ventes)}
          />
        </EcranTache>
      )}

      {ecran === 'jour' && (
        <EcranTache titre="Chiffre du jour" etat="Montants TVA comprise, comme sur le ticket de caisse du soir." onRetour={retourAccueil}>
          <EcranChiffreJour
            etabId={etabId}
            aujourdhui={aujourdhui}
            jourInitial={jourSaisie}
            peutEcrire={peutEcrire}
            hebergement={data.hebergement}
            absente={data.ventesJour.status === 'absente'}
            parJourTout={data.parJourTout}
            joursOuverts={data.joursOuverts}
            horairesPrets={etats.couverture === 'ready'}
            onEnregistre={data.ventesJour.reload}
          />
        </EcranTache>
      )}

      {ecran === 'ventes' && (
        <EcranTache
          titre="Ventes"
          etat={!libelle ? null : s.ventes?.ttc != null
            ? <><span>{libelle}</span> : <Chf v={s.ventes.ttc} /> <span>TVA comprise</span></>
            : <span>{libelle}</span>}
          onRetour={retourAccueil}
        >
          <EcranVentes
            s={s}
            parJour={data.parJour}
            peutEcrire={peutEcrire && data.ventesJour.status === 'ready'}
            couverturePrete={etats.couverture === 'ready' && data.ventesJour.status !== 'absente'}
            hebergement={data.hebergement}
            onSaisir={(j) => { setJourSaisie(j); setEcran('jour'); }}
          />
        </EcranTache>
      )}

      {ecran === 'achats' && (
        <EcranTache
          titre="Achats"
          etat={libelle && etats.achats === 'ready'
            ? <><span>{libelle}</span> : <span>{s.matiere.factures}</span> <span>{pluriel(s.matiere.factures, 'facture,', 'factures,')}</span> <Chf v={s.matiere.achatsHt} /> <span>hors TVA</span></>
            : null}
          onRetour={retourAccueil}
          actions={peutOuvrirAchats ? <Btn variant="primary" onClick={ouvrirAchats} style={ui.primaire}>Ouvrir Factures & achats</Btn> : null}
        >
          <EcranAchats s={s} etat={etats.achats} />
        </EcranTache>
      )}

      {ecran === 'charges' && (
        <EcranCharges
          etabId={etabId}
          charges={data.charges}
          aujourdhui={aujourdhui}
          peutEcrire={peutEcrire}
          doublons={s.doublons}
          onRetour={retourAccueil}
          onChange={data.charges.reload}
        />
      )}

      {fenetre === 'reglages' && peutEcrire && (
        <FenetreReglages
          etabId={etabId}
          userId={user.id}
          reglages={data.reglages}
          absente={data.migrationAbsente}
          onClose={() => setFenetre(null)}
          onEnregistre={data.reloadTout}
        />
      )}
    </div>
  );
}
