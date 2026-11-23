import React from 'react';
import { Check, FileWarning, Minus, Plus, ShoppingBag, WifiOff } from 'lucide-react';
import { Btn, Input, SegmentedTabs } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import * as caisse from '../../services/caisseService.js';
import * as tpe from '../../services/caisseTpeService.js';
import FeuilleTerminal from './tpe/FeuilleTerminal.jsx';
import CarteDetail from './tpe/CarteDetail.jsx';
import { ROLES_TERMINAL, ROLES_TRANCHER, choisirTerminal, enRoute, paiementDe, reprise, terminauxPour } from './tpe/ecranTpe.js';
import { SEUIL_NOM_CLIENT, arrondiCinqCentimes, centimes, detailTvaPrevu, numeroTicket, preparerPaiements, totalLigne, totalLignes } from './tva.js';
import { PARTS_MAX, PARTS_MIN, POURBOIRES_POURCENT, partParPlat, partsEgales, pourboireDe } from './partage.js';
import FeuilleBonCadeau from './bonsCadeaux/FeuilleBonCadeau.jsx';
import { manquesLegaux } from './reglages.js';
import ListeManques from './ListeManques.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Encaissement (v7) : une feuille, le total en grand, les moyens en gros
// boutons. Le cas courant reste à un tap : un moyen qui règle tout le reste
// encaisse aussitôt (les espèces passent par « reçu », pour afficher le rendu).
// Pour payer en plusieurs moyens, on change le montant puis on touche le
// moyen : le reste à payer se met à jour.
//
// L'écran ne fait que préparer : la base (RPC caisse_encaisser) contrôle les
// paiements, calcule l'arrondi des espèces et le rendu, fige la TVA de chaque
// ligne et pose le numéro du ticket. Hors réseau la caisse n'encaisse pas, et
// le dit : un ticket ne reçoit jamais un numéro que la base n'a pas posé.
//
// Remises et offerts : consultant, patron, resp_cuisine (RPC caisse_remise,
// motif obligatoire) ; le serveur demande, l'écran le lui dit.
// Les noms de produits et de moyens réglés par la maison sont des données :
// data-no-translate. Chaque nombre vit dans son propre nœud.
//
// Terminal relié (v9) : quand la maison a relié un terminal qui peut servir
// ce ticket, un tap sur « Carte » ouvre la feuille « Présentez la carte sur
// le terminal » ; accepté, le paiement se pose tout seul, avec le montant du
// terminal. « Carte, terminal non relié » reste là pour la saisie à la main
// (panne, terminal d'un autre prestataire). Un paiement accepté plus tôt et
// jamais encaissé (écran fermé, réseau coupé) se rattache au ticket à
// l'ouverture, sans second débit. Sans terminal réglé, rien de tout cela ne
// se charge ni ne s'affiche : l'écran est celui de la v7.
//
// Bon cadeau (19.11.2026) : « Bon cadeau » ouvre la feuille de lecture (QR à
// la caméra ou code tapé) ; le bon lu, son solde règle tout ou partie du
// reste. Le paiement se pose comme les autres (moyen « autre », libellé
// « Bon cadeau ») avec le code du bon ; la base le débite sous verrou au
// moment où le ticket s'encaisse, jamais avant.
//
// Addition partagée (lot L1, 22.11.2026) : la feuille passe en deux cartes,
// comme l'écran 06 du labo. À gauche, le partage : « Tout payer » (le reste,
// ou un montant tapé), « Par plat » (on coche des lignes ou une partie de
// leurs unités ; ce qui est réglé reste marqué tant que la feuille est
// ouverte) et « En parts égales » (2 à 12, la dernière prend l'arrondi), puis
// le pourboire en 5, 10 ou 15 % de la part ou en montant libre, toujours hors
// total. À droite : le total, la TVA par taux prévue (la base la fige à
// l'encaissement), les paiements posés, le reste, « Remise ou offert », puis
// les moyens, qui encaissent la part. Les calculs sont dans partage.js ; rien
// n'est écrit en base de plus qu'avant (le service ne transmet pas `partage`).
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const nombre = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const MOTIFS_RAPIDES = ['Geste commercial', 'Fidélité', 'Personnel', 'Erreur de commande'];

// Le terminal retenu par ce poste, par maison (préférence d'écran : le
// serveur vérifie de toute façon que le terminal est celui de la maison).
const cleTerminal = (etablissementId) => 'sc_caisse_terminal_' + (etablissementId || '');
function lireTerminalRetenu(etablissementId) {
  try { return localStorage.getItem(cleTerminal(etablissementId)); } catch { return null; }
}
function retenirTerminal(etablissementId, id) {
  try { localStorage.setItem(cleTerminal(etablissementId), id); } catch { /* préférence perdue, sans gravité */ }
}

function useEnLigne() {
  const [enLigne, setEnLigne] = React.useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  React.useEffect(() => {
    const oui = () => setEnLigne(true);
    const non = () => setEnLigne(false);
    window.addEventListener('online', oui);
    window.addEventListener('offline', non);
    return () => { window.removeEventListener('online', oui); window.removeEventListener('offline', non); };
  }, []);
  return enLigne;
}

export default function Encaissement({
  ticket, reglages, peutRemiser = false, modeTest = false, onEncaisse, onEnvoi, onQuittance, onClose, reload,
  terminaux = [], role = null, boutons = {}, categories = [], articles = [],
}) {
  const lignes = React.useMemo(() => ticket?.lignes || [], [ticket]);
  const total = totalLignes(lignes);
  const enLigne = useEnLigne();
  // Un vrai ticket ne s'encaisse pas sans les coordonnées légales de la
  // maison : sa quittance doit les porter (LTVA art. 26). Le ticket de test
  // passe, et des réglages pas encore lus ne bloquent rien.
  const manquesLegal = ticket?.test || reglages.reglagesLus === false ? [] : manquesLegaux(reglages.legal);
  const peutPayer = enLigne && manquesLegal.length === 0;

  const [aEmporter, setAEmporter] = React.useState(Boolean(ticket?.a_emporter));
  const [poses, setPoses] = React.useState([]); // paiements déjà posés (paiement en plusieurs moyens)
  const [montant, setMontant] = React.useState('');
  const [pourboire, setPourboire] = React.useState('');
  const [especes, setEspeces] = React.useState(null); // moyen « espèces » en cours de saisie
  const [recu, setRecu] = React.useState('');
  const [remiseOuverte, setRemiseOuverte] = React.useState(false);
  const [enCours, setEnCours] = React.useState(false);
  const [fait, setFait] = React.useState(null); // réponse de la base après encaissement
  const [client, setClient] = React.useState({ nom: '', adresse: '' });
  const [feuilleBon, setFeuilleBon] = React.useState(false);
  // Addition partagée (L1)
  const [mode, setMode] = React.useState('tout'); // 'tout' | 'plat' | 'parts'
  const [choix, setChoix] = React.useState({}); // par plat : id de ligne -> unités cochées
  const [nbParts, setNbParts] = React.useState(PARTS_MIN);
  const [choixPourboire, setChoixPourboire] = React.useState('aucun'); // 'aucun' | '5' | '10' | '15' | 'libre'
  const carteGauche = React.useRef(null);
  const verrou = React.useRef(false);

  // ── Terminal relié (v9) ──
  const aDesTerminaux = terminaux.length > 0;
  const utilisables = React.useMemo(() => terminauxPour(terminaux, ticket), [terminaux, ticket]);
  const [terminalRetenu, setTerminalRetenu] = React.useState(() => lireTerminalRetenu(ticket?.etablissement_id));
  const terminal = choisirTerminal(utilisables, terminalRetenu);
  const [feuille, setFeuille] = React.useState(null); // la feuille du terminal : { terminal, montant, pourboire, libelle, reprise }
  const [paiementEnRoute, setPaiementEnRoute] = React.useState(null);
  // 'sans' : la maison n'a jamais relié de terminal, rien n'est lu.
  const [lectureTpe, setLectureTpe] = React.useState(aDesTerminaux ? 'lecture' : 'sans');
  const peutRembourser = ROLES_TERMINAL.includes(role);
  const libelleCarte = reglages.perso?.moyens_paiement
    ? (reglages.moyens_paiement.find((m) => m.cle === 'carte')?.libelle || null)
    : null;

  // ouvrir : à l'ouverture de l'encaissement, un paiement resté en route
  // rouvre sa feuille. Après une fermeture voulue, on relit sans rouvrir.
  const chargerTpe = React.useCallback(async (ouvrir = false) => {
    if (!aDesTerminaux || !ticket?.id) return;
    const { data, error } = await tpe.listTransactionsTicket(ticket.id);
    if (error) { setLectureTpe('echec'); return; }
    // Un paiement accepté plus tôt se rattache au ticket, en tête.
    setPoses((courant) => {
      const { aPoser } = reprise(data, courant);
      return aPoser.length ? [...aPoser.map((t) => paiementDe(t, libelleCarte)), ...courant] : courant;
    });
    const suspendu = reprise(data).enRoute;
    setPaiementEnRoute(suspendu);
    if (suspendu && ouvrir) {
      const sonTerminal = terminaux.find((t) => t.id === suspendu.terminal_id);
      if (sonTerminal) setFeuille({ terminal: sonTerminal, montant: suspendu.montant, pourboire: suspendu.pourboire, libelle: libelleCarte, reprise: suspendu });
    }
    setLectureTpe('lue');
  }, [aDesTerminaux, ticket?.id, terminaux, libelleCarte]);
  React.useEffect(() => { chargerTpe(true); }, [chargerTpe]);
  const tpePret = lectureTpe === 'sans' || lectureTpe === 'lue';
  React.useEffect(() => { terminalOuvert.current = Boolean(feuille) || feuilleBon; }, [feuille, feuilleBon]);

  const fermer = React.useCallback(() => { if (fait) onEncaisse?.(fait); else onClose(); }, [fait, onEncaisse, onClose]);
  // v9 : tant que la feuille du terminal est ouverte, Échap ne ferme pas
  // l'encaissement derrière elle.
  const terminalOuvert = React.useRef(false);
  useBackLayer(true, fermer, 'caisse-encaissement');
  React.useEffect(() => {
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || terminalOuvert.current) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      e.preventDefault();
      fermer();
    };
    document.addEventListener('keydown', echap, true);
    return () => document.removeEventListener('keydown', echap, true);
  }, [fermer]);

  const dejaPose = poses.reduce((s, p) => s + centimes(p.montant), 0) / 100;
  const reste = Math.max(0, Math.round((total - dejaPose) * 100) / 100);
  // La part de ce paiement, selon le mode de partage. `partage` dit ce que le
  // paiement règle, pour marquer les plats et compter les parts ; un montant
  // qui n'est pas la part calculée (bon cadeau au solde trop court, terminal
  // qui rend un autre chiffre) ne marque rien.
  const parPlat = partParPlat({ lignes, poses, choix, reste });
  const parts = partsEgales({ total, poses, n: nbParts, reste });
  const minParts = Math.max(PARTS_MIN, Math.min(PARTS_MAX, parts.payees + (reste > 0 ? 1 : 0)));
  const part = (() => {
    if (mode === 'plat') return parPlat.part;
    if (mode === 'parts') return parts.part;
    const n = nombre(montant);
    return n == null || montant === '' ? reste : Math.min(n, reste);
  })();
  const partage = mode === 'plat' && Object.keys(parPlat.unites).length
    ? { mode: 'plat', unites: parPlat.unites }
    : (mode === 'parts' ? { mode: 'parts' } : null);
  const avecPartage = (paiement) => (partage && centimes(paiement.montant) === centimes(part) ? { ...paiement, partage } : paiement);
  const tip = pourboireDe(part, choixPourboire, pourboire);
  const rienAPayer = part <= 0 && total > 0;
  const tva = detailTvaPrevu(lignes, { boutons, categories, articles, aEmporter });
  function apresPose() {
    setMontant(''); setPourboire(''); setChoixPourboire('aucun'); setChoix({});
  }
  function changerMode(m) {
    setMode(m);
    setMontant('');
    if (m === 'parts' && nbParts < minParts) setNbParts(minParts);
  }

  async function envoyer(paiements) {
    if (verrou.current) return;
    if (manquesLegal.length) { notify('Coordonnées légales de la maison incomplètes : le ticket reste ouvert.', 'error'); return; }
    verrou.current = true;
    setEnCours(true);
    // Avant l'appel : le temps réel peut retirer le ticket de la liste des
    // tickets ouverts avant la réponse, la caisse garde donc son image.
    onEnvoi?.(ticket);
    try {
      const { data, error } = await caisse.encaisserTicket(ticket.id, paiements, aEmporter);
      if (error) { onEnvoi?.(null); notify(error, 'error'); reload?.(); return; }
      setFait(data);
      notify(modeTest ? 'Ticket de test encaissé' : 'Ticket encaissé', 'success');
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  }

  // Un tap sur un moyen : il prend la part affichée. S'il règle tout le reste,
  // le ticket s'encaisse ; sinon le paiement se pose et le reste diminue.
  function toucherMoyen(m, { aLaMain = false } = {}) {
    if (!peutPayer || enCours || !tpePret || (part <= 0 && total > 0)) return;
    if (m.cle === 'especes') { setEspeces(m); setRecu(''); return; }
    const libelle = reglages.perso?.moyens_paiement ? m.libelle : null;
    // v9 : la carte part sur le terminal relié, s'il y en a un pour ce ticket.
    if (m.cle === 'carte' && terminal && !aLaMain && part > 0) {
      if (paiementEnRoute) return;
      setFeuille({ terminal, montant: part, pourboire: tip, libelle, reprise: null, partage });
      return;
    }
    poser(avecPartage({ moyen: m.cle, libelle, montant: part, pourboire: tip }));
  }

  // Le terminal a accepté : le paiement se pose avec SES chiffres. Posé
  // d'abord, envoyé ensuite : si l'encaissement échoue, la carte acceptée
  // reste à l'écran.
  function terminalApprouve(transaction) {
    const libelle = feuille?.libelle ?? libelleCarte;
    const partageFeuille = feuille?.partage || null;
    const montantFeuille = feuille?.montant;
    setFeuille(null);
    setPaiementEnRoute(null);
    if (poses.some((p) => p.tpe === transaction.id)) return;
    const pose = paiementDe(transaction, libelle);
    const suite = [...poses, partageFeuille && centimes(pose.montant) === centimes(montantFeuille) ? { ...pose, partage: partageFeuille } : pose];
    setPoses(suite);
    apresPose();
    if (preparerPaiements({ total, paiements: suite, arrondiEspeces: reglages.arrondi_especes }).complet) envoyer(suite);
  }
  // La feuille fermée pendant l'attente n'annule rien : on relit où en est
  // le terminal, sans rouvrir la feuille.
  function fermerFeuilleTerminal() {
    setFeuille(null);
    chargerTpe(false);
  }
  async function rembourserPose(p) {
    if (enCours) return;
    setEnCours(true);
    try {
      const { data, error } = await tpe.rembourserPaiement(p.tpe);
      if (error) { notify(error, 'error'); return; }
      if (data.transaction.rembourse_statut === 'fait') {
        setPoses((courant) => courant.filter((x) => x.tpe !== p.tpe));
        notify('Paiement remboursé sur le terminal', 'success');
      } else {
        notify('Le remboursement a échoué : il reste à faire sur le terminal.', 'warning');
      }
    } finally {
      setEnCours(false);
    }
  }
  function reprendreEnRoute() {
    const sonTerminal = terminaux.find((t) => t.id === paiementEnRoute?.terminal_id);
    if (!sonTerminal) return;
    setFeuille({ terminal: sonTerminal, montant: paiementEnRoute.montant, pourboire: paiementEnRoute.pourboire, libelle: libelleCarte, reprise: paiementEnRoute });
  }

  function poser(paiement) {
    const suite = [...poses, paiement];
    const controle = preparerPaiements({ total, paiements: suite, arrondiEspeces: reglages.arrondi_especes });
    if (controle.complet) { envoyer(suite); return; }
    if (paiement.moyen === 'especes' && paiement.recu != null && controle.reste === 0) {
      notify('Les espèces reçues ne couvrent pas le montant dû.', 'warning');
      return;
    }
    setPoses(suite);
    apresPose(); setEspeces(null); setRecu('');
  }

  // Espèces : ce que le client doit sur cette part, arrondi compris si c'est
  // le dernier paiement en espèces du ticket.
  const duEspeces = (() => {
    if (!especes) return 0;
    const essai = preparerPaiements({
      total, arrondiEspeces: reglages.arrondi_especes,
      paiements: [...poses, { moyen: 'especes', montant: part, pourboire: tip }],
    });
    const derniere = essai.paiements[essai.paiements.length - 1];
    return Math.round((derniere.montant + derniere.arrondi + tip) * 100) / 100;
  })();
  const recuN = nombre(recu);
  const rendu = recuN == null || recu === '' ? null : Math.round((recuN - duEspeces) * 100) / 100;
  const billets = [...new Set([arrondiCinqCentimes(duEspeces), ...[10, 20, 50, 100, 200].map((b) => Math.ceil(duEspeces / b) * b)])]
    .filter((b) => b >= duEspeces).slice(0, 5);

  function validerEspeces(valeurRecue) {
    poser(avecPartage({
      moyen: 'especes', libelle: reglages.perso?.moyens_paiement ? especes.libelle : null,
      montant: part, pourboire: tip, recu: valeurRecue,
    }));
  }

  const enAttente = lignes.filter((l) => l.statut === 'en_attente').length;

  // ── Après l'encaissement : numéro, rendu, quittance ──
  if (fait) {
    const numero = numeroTicket(fait);
    return (
      <div className="modal-sheet-overlay" data-fenetre="" style={st.overlay}>
        <div className="modal-sheet" role="region" aria-label="Ticket encaissé" style={st.feuille} data-caisse-encaisse="">
          <div style={st.titre}>{fait.test ? 'Ticket de test encaissé' : 'Ticket encaissé'}</div>
          {fait.test ? (
            <p style={st.aide}>Mode test : aucun numéro, rien dans les chiffres ni dans la clôture.</p>
          ) : (
            <p style={st.ligneInfo}><span>Ticket n°</span> <span style={st.num} data-no-translate>{numero}</span></p>
          )}
          <div style={st.grand}>
            <span style={st.grandLibelle}>Total</span>
            <span style={st.grandValeur}><span>{chf(fait.total)}</span> <span style={st.devise}>CHF</span></span>
          </div>
          {Number(fait.rendu) > 0 && (
            <div style={{ ...st.grand, ...st.rendu }} data-cadre="">
              <span style={st.grandLibelle}>À rendre</span>
              <span style={st.grandValeur}><span>{chf(fait.rendu)}</span> <span style={st.devise}>CHF</span></span>
            </div>
          )}
          {Number(fait.arrondi) !== 0 && (
            <p style={st.aide}><span>Arrondi aux 5 centimes :</span> <span style={st.num}>{chf(fait.arrondi)}</span> <span>CHF</span></p>
          )}
          {Number(fait.pourboire) > 0 && (
            <p style={st.aide}><span>Pourboire, à part du total :</span> <span style={st.num}>{chf(fait.pourboire)}</span> <span>CHF</span></p>
          )}
          {(fait.bons_cadeaux || []).map((b) => (
            <p key={b.code} style={st.ligneInfo} data-caisse-reste-bon={b.code}>
              <span>Bon cadeau</span> <span style={st.num} data-no-translate>{b.code}</span>
              {Number(b.solde) > 0
                ? <><span>, il reste</span> <span style={st.num}>{chf(b.solde)}</span> <span>CHF sur le bon.</span></>
                : <span>, le bon est épuisé.</span>}
            </p>
          ))}
          {!fait.test && Number(fait.total) > SEUIL_NOM_CLIENT && (
            <div style={st.bloc}>
              <p style={st.aide}>Au-dessus de 400 francs, le client peut demander son nom et son adresse sur la quittance.</p>
              <Input value={client.nom} onChange={(e) => setClient((c) => ({ ...c, nom: e.target.value }))} placeholder="Nom du client" style={st.champ} />
              <Input value={client.adresse} onChange={(e) => setClient((c) => ({ ...c, adresse: e.target.value }))} placeholder="Adresse du client" style={st.champ} />
            </div>
          )}
          <div style={st.pied}>
            <Btn variant="ghost" onClick={() => onQuittance?.(ticket.id, client)} style={st.btnAction}>Quittance</Btn>
            <Btn variant="primary" onClick={fermer} style={st.btnAction}>Terminer</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-sheet-overlay" data-fenetre="" style={st.overlay} onClick={onClose}>
      <div className="modal-sheet" role="region" aria-label="Encaissement" style={st.feuille} onClick={(e) => e.stopPropagation()} data-caisse-encaissement="">
        <div style={st.enTete}>
          <div style={st.titre}>Encaisser</div>
          <Btn variant="ghost" onClick={onClose} style={st.btn44}>Revenir au ticket</Btn>
        </div>

        {!enLigne && (
          <div style={st.horsLigne} data-cadre="" role="alert">
            <WifiOff size={20} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>Pas de réseau : la caisse n'encaisse pas hors ligne. Le ticket reste ouvert, encaissez dès que le réseau revient.</span>
          </div>
        )}
        {manquesLegal.length > 0 && (
          <div style={st.horsLigne} data-cadre="" role="alert" data-caisse-legal-manquant="">
            <FileWarning size={20} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>
              <span>Encaissement impossible : la quittance doit porter les coordonnées de la maison.</span>
              {' '}<span>Il manque :</span> <ListeManques manques={manquesLegal} />.
              {' '}<span>Un responsable les saisit dans les réglages de la caisse, rubrique TVA et clôture. Le ticket reste ouvert.</span>
            </span>
          </div>
        )}

        <div className="caisse-addition">
          <div className="caisse-addition-grille">
            {/* ── Partage : mode, plats ou parts, pourboire ── */}
            <section ref={carteGauche} style={st.carte} data-cadre="" data-caisse-partage={remiseOuverte ? 'remise' : mode}>
              {remiseOuverte ? (
                <Remise ticket={ticket} lignes={lignes} onFait={() => { setRemiseOuverte(false); setPoses((courant) => courant.filter((p) => p.tpe)); setChoix({}); reload?.(); }} onFermer={() => setRemiseOuverte(false)} />
              ) : (
                <>
                  <SegmentedTabs
                    className="caisse-addition-modes"
                    tabs={[
                      { id: 'tout', label: 'Tout payer' },
                      { id: 'plat', label: 'Par plat' },
                      { id: 'parts', label: 'En parts égales' },
                    ]}
                    active={mode}
                    onChange={changerMode}
                  />

                  {mode === 'tout' && (
                    <div style={st.bloc} data-caisse-mode="tout">
                      <label style={{ ...st.champLabel, flex: 'none' }}>
                        <span style={st.sousTitre}>Montant de ce paiement</span>
                        <Input value={montant} onChange={(e) => setMontant(e.target.value)} placeholder={chf(reste)} type="text" inputMode="decimal" style={st.champ} />
                      </label>
                      <p style={st.aide}>Pour payer en plusieurs moyens, changez le montant puis touchez le moyen : le reste se met à jour.</p>
                    </div>
                  )}

                  {mode === 'plat' && (
                    <div style={st.bloc} data-caisse-mode="plat">
                      <p style={st.aide}>Cochez ce que ce client paie.</p>
                      <div className="caisse-bloc">
                        {parPlat.lignes.map((e) => {
                          const l = e.ligne;
                          const idNom = 'caisse-plat-' + l.id;
                          if (e.restant === 0) {
                            return (
                              <div key={l.id} style={{ ...st.plat, ...st.platRegle }} data-caisse-plat-regle="">
                                <span style={st.caseCible} aria-hidden="true"><span style={{ ...st.caseCarre, ...st.caseRegle }}><Check size={14} strokeWidth={2.5} /></span></span>
                                <span style={st.platNom}>
                                  <span><span style={st.num}>{Number(l.quantite)}</span> <span data-no-translate>{l.libelle}</span></span>
                                  <span style={st.regle}><span style={st.point} aria-hidden="true" /><span>Réglé</span></span>
                                </span>
                                <span style={st.platPrix}>{chf(totalLigne(l))}</span>
                              </div>
                            );
                          }
                          const coche = e.coche > 0;
                          return (
                            <div key={l.id} style={st.plat}>
                              <button
                                type="button" role="checkbox" aria-checked={coche} aria-labelledby={idNom}
                                onClick={() => setChoix((c) => ({ ...c, [l.id]: coche ? 0 : e.restant }))}
                                style={st.caseCible} data-caisse-coche={l.id}
                              >
                                <span style={{ ...st.caseCarre, ...(coche ? st.caseCochee : null) }}>{coche && <Check size={14} strokeWidth={2.5} />}</span>
                              </button>
                              <span style={st.platNom}>
                                <span id={idNom}><span style={st.num}>{Number(l.quantite)}</span> <span data-no-translate>{l.libelle}</span></span>
                                {e.reglees > 0 && (
                                  <span style={st.petit}><span style={st.num}>{e.reglees}</span> <span>sur</span> <span style={st.num}>{e.unites}</span> <span>déjà réglé</span></span>
                                )}
                                {e.restant > 1 && (
                                  <span style={st.pas}>
                                    <button type="button" aria-label="Une de moins" disabled={e.coche === 0} onClick={() => setChoix((c) => ({ ...c, [l.id]: e.coche - 1 }))} style={st.pasBtn}><Minus size={18} strokeWidth={2} aria-hidden="true" /></button>
                                    <span style={st.pasTexte}><span style={st.num}>{e.coche}</span> <span>sur</span> <span style={st.num}>{e.restant}</span></span>
                                    <button type="button" aria-label="Une de plus" disabled={e.coche >= e.restant} onClick={() => setChoix((c) => ({ ...c, [l.id]: e.coche + 1 }))} style={st.pasBtn}><Plus size={18} strokeWidth={2} aria-hidden="true" /></button>
                                  </span>
                                )}
                              </span>
                              <span style={st.platPrix}>{chf(coche ? e.montantCoche : e.montantRestant)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {mode === 'parts' && (
                    <div style={st.bloc} data-caisse-mode="parts">
                      <div style={st.partsRang}>
                        <span style={st.sousTitre}>Nombre de parts</span>
                        <span style={st.pas}>
                          <button type="button" aria-label="Une part de moins" disabled={nbParts <= minParts} onClick={() => setNbParts((n) => Math.max(minParts, n - 1))} style={st.pasBtn}><Minus size={18} strokeWidth={2} aria-hidden="true" /></button>
                          <span style={st.partsNombre} data-caisse-nb-parts="">{parts.n}</span>
                          <button type="button" aria-label="Une part de plus" disabled={nbParts >= PARTS_MAX} onClick={() => setNbParts((n) => Math.min(PARTS_MAX, n + 1))} style={st.pasBtn}><Plus size={18} strokeWidth={2} aria-hidden="true" /></button>
                        </span>
                      </div>
                      <div className="caisse-bloc">
                        {parts.montants.map((m, i) => (
                          <div key={i} style={{ ...st.plat, ...st.partLigne, ...(i < parts.payees ? st.platRegle : null) }} data-caisse-part={i < parts.payees ? 'reglee' : (i === parts.payees ? 'suivante' : '')}>
                            <span style={st.platNom}>
                              <span><span>Part</span> <span style={st.num}>{i + 1}</span></span>
                              {i < parts.payees && <span style={st.regle}><span style={st.point} aria-hidden="true" /><span>Réglée</span></span>}
                              {i === parts.payees && part > 0 && <span style={st.petit}>Celle qu'on encaisse</span>}
                            </span>
                            <span style={st.platPrix}>{chf(m)}</span>
                          </div>
                        ))}
                      </div>
                      <p style={st.aide}>La dernière part prend l'arrondi au centime.</p>
                    </div>
                  )}

                  <div style={st.bloc}>
                    <span style={st.sousTitre}>Pourboire, à part</span>
                    <div className="caisse-pourboires" data-caisse-pourboires="">
                      <Btn variant={choixPourboire === 'aucun' ? 'primary' : 'ghost'} onClick={() => setChoixPourboire('aucun')} style={st.pilule}>Aucun</Btn>
                      {POURBOIRES_POURCENT.map((p) => (
                        <Btn key={p} variant={choixPourboire === String(p) ? 'primary' : 'ghost'} onClick={() => setChoixPourboire(String(p))} style={st.pilule}>
                          <span>{p}</span> <span>%</span>
                        </Btn>
                      ))}
                      <Btn variant={choixPourboire === 'libre' ? 'primary' : 'ghost'} onClick={() => setChoixPourboire('libre')} style={st.pilule}>Autre</Btn>
                    </div>
                    {choixPourboire === 'libre' && (
                      <Input value={pourboire} onChange={(e) => setPourboire(e.target.value)} placeholder="0.00" type="text" inputMode="decimal" style={st.champ} />
                    )}
                  </div>
                </>
              )}
            </section>

            {/* ── Récap et paiement ── */}
            <section style={st.carte} data-cadre="" data-caisse-recap="">
              <div style={st.grand}>
                <span style={st.grandLibelle}>Total</span>
                <span style={st.grandValeur} data-caisse-total=""><span>{chf(total)}</span> <span style={st.devise}>CHF</span></span>
              </div>
              {tva.map((t) => (
                <div key={t.taux} style={st.tvaLigne} data-caisse-tva={t.taux}>
                  <span><span>dont TVA</span> <span style={st.num}>{String(t.taux).replace('.', ',')}</span> <span>%</span></span>
                  <span style={st.num}>{chf(t.tva)}</span>
                </div>
              ))}
              <Btn variant={aEmporter ? 'primary' : 'ghost'} onClick={() => setAEmporter((v) => !v)} style={st.btnEmporter} ariaLabel="À emporter">
                <ShoppingBag size={20} strokeWidth={1.75} aria-hidden="true" />
                <span>{aEmporter ? 'À emporter : oui' : 'À emporter'}</span>
              </Btn>
              {aEmporter && <p style={st.aide}>La TVA à emporter s'applique aux catégories réglées pour cela ; l'alcool reste au taux normal. La quittance le dit.</p>}

              {poses.length > 0 && <div style={st.separateur} />}
              {poses.map((p, i) => (p.tpe ? (
                <div key={p.tpe} style={st.pose} data-caisse-pose="terminal">
                  <span style={st.poseNomTerminal}>
                    <span>Carte, terminal relié</span>
                    <CarteDetail transaction={p} />
                    <DetailPartage pose={p} lignes={lignes} />
                  </span>
                  <span style={st.num}>{chf(p.montant)}</span>
                  {peutRembourser
                    ? <Btn variant="ghost" disabled={enCours || !enLigne} onClick={() => rembourserPose(p)} style={st.btn44}>Rembourser</Btn>
                    : <span style={st.petit}>Payé sur le terminal</span>}
                </div>
              ) : p.bonCadeau ? (
                <div key={'bon-' + p.bonCadeau} style={st.pose} data-caisse-pose="bon-cadeau">
                  <span style={st.poseNomTerminal}>
                    <span><span>Bon cadeau</span> <span style={st.num} data-no-translate>{p.bonCadeau}</span></span>
                    <DetailPartage pose={p} lignes={lignes} />
                  </span>
                  <span style={st.num}>{chf(p.montant)}</span>
                  <Btn variant="ghost" onClick={() => setPoses(poses.filter((_, j) => j !== i))} style={st.btn44}>Retirer</Btn>
                </div>
              ) : (
                <div key={i} style={st.pose} data-caisse-pose="">
                  <span style={st.poseNomTerminal}>
                    <span>{p.libelle ? <span data-no-translate>{p.libelle}</span> : <span>{reglages.moyens_paiement.find((m) => m.cle === p.moyen)?.libelle || p.moyen}</span>}</span>
                    <DetailPartage pose={p} lignes={lignes} />
                  </span>
                  <span style={st.num}>{chf(p.montant)}</span>
                  <Btn variant="ghost" onClick={() => setPoses(poses.filter((_, j) => j !== i))} style={st.btn44}>Retirer</Btn>
                </div>
              )))}
              <div style={{ ...st.grand, ...st.reste }} data-cadre="">
                <span style={st.grandLibelle}>Reste à payer</span>
                <span style={st.grandValeur} data-caisse-reste=""><span>{chf(reste)}</span> <span style={st.devise}>CHF</span></span>
              </div>
              {lectureTpe === 'echec' && (
                <div style={st.horsLigne} data-cadre="" role="alert">
                  <span style={st.alerteTexte}>Les paiements par carte de ce ticket n'ont pas pu être lus. Encaisser sans les relire pourrait oublier une carte déjà acceptée.</span>
                  <Btn variant="primary" onClick={() => { setLectureTpe('lecture'); chargerTpe(true); }} style={st.btn44}>Réessayer</Btn>
                </div>
              )}
              {paiementEnRoute && !feuille && (
                <div style={st.horsLigne} data-cadre="" role="alert" data-caisse-en-route="">
                  <span style={st.alerteTexte}>{paiementEnRoute.statut === 'incertain'
                    ? "Un paiement par carte attend d'être éclairci : regardez le terminal."
                    : 'Un paiement par carte est en route sur le terminal.'}</span>
                  <Btn variant="primary" onClick={reprendreEnRoute} style={st.btn44}>Reprendre</Btn>
                </div>
              )}
              {poses.length > 0 && reste === 0 && tpePret && !paiementEnRoute && (
                <Btn variant="primary" disabled={enCours || !peutPayer} onClick={() => envoyer(poses)} style={st.btnMoyen}>Encaisser le ticket</Btn>
              )}
              {enAttente > 0 && (
                <p style={st.aide}><span style={st.num}>{enAttente}</span> <span>lignes pas encore envoyées en cuisine.</span></p>
              )}
              {peutRemiser ? (
                <Btn
                  variant={remiseOuverte ? 'primary' : 'ghost'}
                  onClick={() => {
                    setRemiseOuverte((v) => !v);
                    requestAnimationFrame(() => carteGauche.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }));
                  }}
                  style={st.btnRemise}
                >
                  Remise ou offert
                </Btn>
              ) : (
                <p style={st.aide}>Remise ou offert : demandez à un responsable, il le pose avec un motif.</p>
              )}

              {especes ? (
                <>
                  <div style={st.separateur} />
                  <div style={st.bloc} data-caisse-especes="">
                    <div style={st.grand}>
                      <span style={st.grandLibelle}>À payer en espèces</span>
                      <span style={st.grandValeur}><span>{chf(duEspeces)}</span> <span style={st.devise}>CHF</span></span>
                    </div>
                    <div style={st.sousTitre}>Reçu du client</div>
                    <div style={st.rang}>
                      {billets.map((b) => (
                        <Btn key={b} variant="primary" disabled={enCours || !peutPayer} onClick={() => validerEspeces(b)} style={st.btnMoyen}>
                          <span style={st.num}>{chf(b)}</span>
                        </Btn>
                      ))}
                    </div>
                    <div style={st.rang}>
                      <Input value={recu} onChange={(e) => setRecu(e.target.value)} placeholder="Autre montant reçu" type="text" inputMode="decimal" style={st.champ} />
                      <Btn variant="primary" disabled={enCours || !peutPayer || recuN == null || recu === '' || rendu < 0} onClick={() => validerEspeces(recuN)} style={st.btn44}>Valider</Btn>
                    </div>
                    {rendu != null && rendu >= 0 && (
                      <p style={st.ligneInfo}><span>À rendre :</span> <span style={st.num}>{chf(rendu)}</span> <span>CHF</span></p>
                    )}
                    {rendu != null && rendu < 0 && <p style={st.aide}>Le montant reçu ne couvre pas ce qui est dû.</p>}
                    <Btn variant="ghost" onClick={() => setEspeces(null)} style={st.btn44}>Choisir un autre moyen</Btn>
                  </div>
                </>
              ) : (reste > 0 || poses.length === 0) && (
                <>
                  <div style={st.separateur} />
                  <div style={st.payerTitre} data-caisse-payer="">
                    <span style={st.payerLibelle}><span>Payer</span> <span style={st.num}>{chf(part)}</span> <span>CHF</span></span>
                    {tip > 0 && <span style={st.petit}><span>pourboire en plus :</span> <span style={st.num}>{chf(tip)}</span></span>}
                  </div>
                  {mode === 'plat' && rienAPayer && <p style={st.aide}>Cochez au moins un plat.</p>}
                  <div style={st.moyens} data-caisse-moyens="">
                    {reglages.moyens_paiement.map((m, i) => (
                      <Btn key={m.cle + i} variant="primary" disabled={enCours || !peutPayer || !tpePret || rienAPayer || (m.cle === 'carte' && Boolean(terminal) && Boolean(paiementEnRoute))} onClick={() => toucherMoyen(m)} style={st.btnMoyen}>
                        {reglages.perso?.moyens_paiement ? <span data-no-translate>{m.libelle}</span> : m.libelle}
                      </Btn>
                    ))}
                    <Btn variant="ghost" disabled={enCours || !peutPayer || !tpePret || rienAPayer} onClick={() => setFeuilleBon(true)} style={st.btnMoyen}>
                      Bon cadeau
                    </Btn>
                  </div>
                  {terminal && (
                    <div style={st.bloc} data-caisse-terminal-choix="">
                      <p style={st.aide}>
                        <span>La carte part sur le terminal</span> <span style={st.num} data-no-translate>{terminal.nom}</span><span>.</span>
                        {ticket.test && <span>{' '}</span>}
                        {ticket.test && <span>Terminal simulé : aucun argent ne bouge.</span>}
                      </p>
                      <div style={st.rang}>
                        {utilisables.length > 1 && utilisables.map((t) => (
                          <Btn key={t.id} variant={t.id === terminal.id ? 'primary' : 'ghost'} onClick={() => { retenirTerminal(ticket.etablissement_id, t.id); setTerminalRetenu(t.id); }} style={st.btn44}>
                            <span data-no-translate>{t.nom}</span>
                          </Btn>
                        ))}
                        <Btn variant="ghost" disabled={enCours || !peutPayer || !tpePret || rienAPayer} onClick={() => toucherMoyen({ cle: 'carte', libelle: libelleCarte }, { aLaMain: true })} style={st.btn44}>Carte, terminal non relié</Btn>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </div>
      {feuille && (
        <div onClick={(e) => e.stopPropagation()}>
          <FeuilleTerminal
            ticket={ticket}
            terminal={feuille.terminal}
            montant={feuille.montant}
            pourboire={feuille.pourboire}
            reprise={feuille.reprise}
            peutTrancher={ROLES_TRANCHER.includes(role)}
            onApprouve={terminalApprouve}
            onChange={(t) => setPaiementEnRoute(enRoute(t) ? t : null)}
            onFermer={fermerFeuilleTerminal}
          />
        </div>
      )}
      {feuilleBon && (
        // La fenêtre vit dans un portail, mais ses clics remontent l'arbre
        // React jusqu'au voile de l'encaissement : on les arrête ici.
        <div onClick={(e) => e.stopPropagation()}>
          <FeuilleBonCadeau
            etablissementId={ticket.etablissement_id}
            part={part}
            test={Boolean(ticket.test)}
            dejaPoses={poses.filter((p) => p.bonCadeau).map((p) => p.bonCadeau)}
            onRegler={(code, montantBon) => {
              setFeuilleBon(false);
              poser(avecPartage({ moyen: 'autre', libelle: 'Bon cadeau', montant: montantBon, pourboire: 0, bonCadeau: code }));
            }}
            onClose={() => setFeuilleBon(false)}
          />
        </div>
      )}
    </div>
  );
}

// Ce qu'un paiement posé « par plat » a réglé : « 1 Tartare, 2 Café ».
function DetailPartage({ pose, lignes }) {
  const unites = pose?.partage?.mode === 'plat' ? pose.partage.unites : null;
  if (!unites) return null;
  const parId = new Map((lignes || []).map((l) => [String(l.id), l]));
  const items = Object.entries(unites).filter(([id]) => parId.has(id));
  if (!items.length) return null;
  return (
    <span style={st.petit} data-caisse-pose-plats="">
      {items.map(([id, k], i) => (
        <React.Fragment key={id}>
          {i > 0 && <span>, </span>}
          <span style={st.num}>{k}</span> <span data-no-translate>{parId.get(id).libelle}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

// ── Remise ou offert, avec motif ──
function Remise({ ticket, lignes, onFait, onFermer }) {
  const [cible, setCible] = React.useState(''); // '' = tout le ticket
  const [genre, setGenre] = React.useState('pourcent');
  const [valeur, setValeur] = React.useState('10');
  const [motif, setMotif] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const remisees = lignes.some((l) => l.prix_origine != null);

  async function appliquer(g = genre) {
    if (enCours) return;
    const v = g === 'pourcent' || g === 'montant' ? nombre(valeur) : null;
    if ((g === 'pourcent' || g === 'montant') && (v == null || v <= 0)) { notify('Saisissez la valeur de la remise.', 'warning'); return; }
    if (g !== 'retirer' && motif.trim().length < 3) { notify('Un motif est obligatoire.', 'warning'); return; }
    setEnCours(true);
    try {
      const { error } = await caisse.remise({ ticketId: ticket.id, ligneId: cible || null, genre: g, valeur: v, motif: motif.trim() || null });
      if (error) { notify(error, 'error'); return; }
      notify(g === 'retirer' ? 'Remise retirée' : (g === 'offert' ? 'Offert posé' : 'Remise posée'), 'success');
      onFait();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div style={st.bloc} data-caisse-remise="">
      <div style={st.sousTitre}>Sur quoi</div>
      <div style={st.rang}>
        <Btn variant={cible === '' ? 'primary' : 'ghost'} onClick={() => setCible('')} style={st.btn44}>Tout le ticket</Btn>
        {lignes.map((l) => (
          <Btn key={l.id} variant={cible === l.id ? 'primary' : 'ghost'} onClick={() => setCible(l.id)} style={st.btn44}>
            <span style={st.num}>{Number(l.quantite)}</span> <span data-no-translate>{l.libelle}</span>
          </Btn>
        ))}
      </div>
      <div style={st.sousTitre}>Quoi</div>
      <div style={st.rang}>
        <Btn variant={genre === 'pourcent' ? 'primary' : 'ghost'} onClick={() => setGenre('pourcent')} style={st.btn44}>Remise en %</Btn>
        <Btn variant={genre === 'montant' ? 'primary' : 'ghost'} onClick={() => setGenre('montant')} style={st.btn44}>Remise en CHF</Btn>
        <Btn variant={genre === 'offert' ? 'primary' : 'ghost'} onClick={() => setGenre('offert')} style={st.btn44}>Offert</Btn>
      </div>
      {genre !== 'offert' && (
        <Input value={valeur} onChange={(e) => setValeur(e.target.value)} placeholder={genre === 'pourcent' ? 'Pourcentage' : 'Montant en CHF'} type="text" inputMode="decimal" style={st.champ} />
      )}
      <div style={st.sousTitre}>Motif</div>
      <div style={st.rang}>
        {MOTIFS_RAPIDES.map((m) => (
          <Btn key={m} variant={motif === m ? 'primary' : 'ghost'} onClick={() => setMotif(m)} style={st.btn44}>{m}</Btn>
        ))}
      </div>
      <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif de la remise" style={st.champ} />
      <div style={st.pied}>
        <Btn variant="ghost" onClick={onFermer} style={st.btn44}>Fermer</Btn>
        {remisees && <Btn variant="ghost" disabled={enCours} onClick={() => appliquer('retirer')} style={st.btn44}>Retirer la remise</Btn>}
        <Btn variant="primary" disabled={enCours} onClick={() => appliquer()} style={st.btn44}>Appliquer</Btn>
      </div>
    </div>
  );
}

const st = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1200, padding: 16,
  },
  feuille: {
    background: 'var(--surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    borderRadius: 'var(--r-lg)', padding: '20px 22px', width: 920, maxWidth: '100%',
    maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--sh-lg)', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  enTete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titre: { fontSize: 20, fontWeight: 400, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.2 },
  grand: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, minWidth: 0 },
  grandLibelle: { fontSize: 15, color: 'var(--text2)' },
  grandValeur: { fontSize: 34, fontWeight: 600, fontFamily: 'var(--font-num)', lineHeight: 1.1, color: 'var(--text)' },
  devise: { fontSize: 15, fontWeight: 500, color: 'var(--text2)' },
  reste: { padding: '10px 12px', borderRadius: 'var(--r)', background: 'var(--piste)' },
  rendu: { padding: '10px 12px', borderRadius: 'var(--r-lg)', background: 'var(--success-bg-soft)' },
  pose: {
    display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, fontSize: 15, color: 'var(--text)',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
  },
  poseNom: { flex: 1, minWidth: 0 },
  poseNomTerminal: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  petit: { fontSize: 13, color: 'var(--text2)' },
  alerteTexte: { flex: 1, minWidth: 0 },
  num: { fontFamily: 'var(--font-num)', fontWeight: 600 },
  aide: { fontSize: 13, color: 'var(--text2)', margin: 0, lineHeight: 1.4 },
  ligneInfo: { fontSize: 16, color: 'var(--text)', margin: 0 },
  sousTitre: { fontSize: 13, fontWeight: 600, color: 'var(--text2)' },
  bloc: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  rang: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' },
  champLabel: { display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 160px', minWidth: 0 },
  champ: { minHeight: 44, minWidth: 0, width: '100%', boxSizing: 'border-box' },
  moyens: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btnMoyen: { minHeight: 64, fontSize: 18, flex: '1 1 130px' },
  btnEmporter: { minHeight: 52, fontSize: 16, gap: 10, alignSelf: 'flex-start' },
  btnAction: { minHeight: 56, fontSize: 16, flex: '1 1 160px' },
  btn44: { minHeight: 44, flexShrink: 0 },
  pied: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 6 },
  separateur: { height: 1, background: 'var(--border)', margin: '6px 0' },
  horsLigne: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r-lg)',
    background: 'var(--warning-bg-soft, var(--surface2))', color: 'var(--text)', fontSize: 14, lineHeight: 1.35,
  },
  // ── Addition partagée (L1) : deux cartes imbriquées (filet, pas d'ombre) ──
  carte: {
    background: 'var(--zone)', borderRadius: 'var(--r-lg)', padding: 16, boxSizing: 'border-box',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
    display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
  },
  plat: {
    display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', alignItems: 'center', columnGap: 8,
    minHeight: 'var(--ligne-aeree)', padding: '4px 0', fontSize: 'var(--t3)', color: 'var(--text)',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
  },
  platRegle: { color: 'var(--text3)' },
  partLigne: { gridTemplateColumns: 'minmax(0, 1fr) auto' },
  caseCible: {
    width: 44, height: 44, display: 'grid', placeItems: 'center', padding: 0, margin: 0,
    background: 'transparent', borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent', cursor: 'pointer', color: 'var(--on-accent)',
  },
  caseCarre: {
    width: 22, height: 22, boxSizing: 'border-box', borderRadius: 'calc(var(--r-sm) / 2)', display: 'grid', placeItems: 'center',
    borderWidth: 2, borderStyle: 'solid', borderColor: 'var(--text)', background: 'var(--surface)',
  },
  caseCochee: { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' },
  caseRegle: { background: 'var(--piste)', borderColor: 'var(--rule-soft)', color: 'var(--text3)' },
  platNom: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, overflowWrap: 'anywhere' },
  platPrix: { fontFamily: 'var(--font-num)', fontSize: 'var(--t3)', textAlign: 'right', whiteSpace: 'nowrap' },
  regle: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--t1)', color: 'var(--success-text)' },
  point: { width: 8, height: 8, borderRadius: '50%', background: 'var(--success-fill)', flexShrink: 0 },
  pas: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  pasBtn: {
    width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', padding: 0, cursor: 'pointer',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', background: 'var(--btn-fond)', color: 'var(--btn-texte)',
  },
  pasTexte: { fontSize: 'var(--t2)', minWidth: 54, textAlign: 'center' },
  partsRang: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  partsNombre: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t6)', minWidth: 40, textAlign: 'center' },
  pilule: { minHeight: 44, padding: '0 6px', width: '100%', minWidth: 0 },
  tvaLigne: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--t2)', color: 'var(--text3)' },
  btnRemise: { minHeight: 48, width: '100%', fontSize: 'var(--t3)' },
  payerTitre: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
  payerLibelle: { fontSize: 'var(--t4)', fontWeight: 'var(--g2)', color: 'var(--text)' },
};
