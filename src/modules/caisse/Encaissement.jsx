import React from 'react';
import { ShoppingBag, WifiOff } from 'lucide-react';
import { Btn, Input } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import * as caisse from '../../services/caisseService.js';
import * as tpe from '../../services/caisseTpeService.js';
import FeuilleTerminal from './tpe/FeuilleTerminal.jsx';
import CarteDetail from './tpe/CarteDetail.jsx';
import { ROLES_TERMINAL, ROLES_TRANCHER, choisirTerminal, enRoute, paiementDe, reprise, terminauxPour } from './tpe/ecranTpe.js';
import { SEUIL_NOM_CLIENT, arrondiCinqCentimes, centimes, numeroTicket, preparerPaiements, totalLignes } from './tva.js';

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
  ticket, reglages, peutRemiser = false, modeTest = false, onEncaisse, onQuittance, onClose, reload,
  terminaux = [], role = null,
}) {
  const lignes = React.useMemo(() => ticket?.lignes || [], [ticket]);
  const total = totalLignes(lignes);
  const enLigne = useEnLigne();

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
  React.useEffect(() => { terminalOuvert.current = Boolean(feuille); }, [feuille]);

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
  const part = (() => {
    const n = nombre(montant);
    return n == null || montant === '' ? reste : Math.min(n, reste);
  })();
  const tip = nombre(pourboire) || 0;

  async function envoyer(paiements) {
    if (verrou.current) return;
    verrou.current = true;
    setEnCours(true);
    try {
      const { data, error } = await caisse.encaisserTicket(ticket.id, paiements, aEmporter);
      if (error) { notify(error, 'error'); reload?.(); return; }
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
    if (!enLigne || enCours || !tpePret || (part <= 0 && total > 0)) return;
    if (m.cle === 'especes') { setEspeces(m); setRecu(''); return; }
    const libelle = reglages.perso?.moyens_paiement ? m.libelle : null;
    // v9 : la carte part sur le terminal relié, s'il y en a un pour ce ticket.
    if (m.cle === 'carte' && terminal && !aLaMain && part > 0) {
      if (paiementEnRoute) return;
      setFeuille({ terminal, montant: part, pourboire: tip, libelle, reprise: null });
      return;
    }
    poser({ moyen: m.cle, libelle, montant: part, pourboire: tip });
  }

  // Le terminal a accepté : le paiement se pose avec SES chiffres. Posé
  // d'abord, envoyé ensuite : si l'encaissement échoue, la carte acceptée
  // reste à l'écran.
  function terminalApprouve(transaction) {
    const libelle = feuille?.libelle ?? libelleCarte;
    setFeuille(null);
    setPaiementEnRoute(null);
    if (poses.some((p) => p.tpe === transaction.id)) return;
    const suite = [...poses, paiementDe(transaction, libelle)];
    setPoses(suite);
    setMontant(''); setPourboire('');
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
    setMontant(''); setPourboire(''); setEspeces(null); setRecu('');
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
    poser({
      moyen: 'especes', libelle: reglages.perso?.moyens_paiement ? especes.libelle : null,
      montant: part, pourboire: tip, recu: valeurRecue,
    });
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

        <div style={st.grand}>
          <span style={st.grandLibelle}>Total</span>
          <span style={st.grandValeur} data-caisse-total=""><span>{chf(total)}</span> <span style={st.devise}>CHF</span></span>
        </div>
        {poses.length > 0 && (
          <div style={{ ...st.grand, ...st.reste }} data-cadre="">
            <span style={st.grandLibelle}>Reste à payer</span>
            <span style={st.grandValeur} data-caisse-reste=""><span>{chf(reste)}</span> <span style={st.devise}>CHF</span></span>
          </div>
        )}
        {poses.map((p, i) => (p.tpe ? (
          <div key={p.tpe} style={st.pose} data-caisse-pose="terminal">
            <span style={st.poseNomTerminal}>
              <span>Carte, terminal relié</span>
              <CarteDetail transaction={p} />
            </span>
            <span style={st.num}>{chf(p.montant)}</span>
            {peutRembourser
              ? <Btn variant="ghost" disabled={enCours || !enLigne} onClick={() => rembourserPose(p)} style={st.btn44}>Rembourser</Btn>
              : <span style={st.petit}>Payé sur le terminal</span>}
          </div>
        ) : (
          <div key={i} style={st.pose}>
            <span style={st.poseNom}>{p.libelle ? <span data-no-translate>{p.libelle}</span> : <span>{reglages.moyens_paiement.find((m) => m.cle === p.moyen)?.libelle || p.moyen}</span>}</span>
            <span style={st.num}>{chf(p.montant)}</span>
            <Btn variant="ghost" onClick={() => setPoses(poses.filter((_, j) => j !== i))} style={st.btn44}>Retirer</Btn>
          </div>
        )))}
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
          <Btn variant="primary" disabled={enCours || !enLigne} onClick={() => envoyer(poses)} style={st.btnMoyen}>Encaisser le ticket</Btn>
        )}
        {enAttente > 0 && (
          <p style={st.aide}><span style={st.num}>{enAttente}</span> <span>lignes pas encore envoyées en cuisine.</span></p>
        )}

        <Btn variant={aEmporter ? 'primary' : 'ghost'} onClick={() => setAEmporter((v) => !v)} style={st.btnEmporter} ariaLabel="À emporter">
          <ShoppingBag size={20} strokeWidth={1.75} aria-hidden="true" />
          <span>{aEmporter ? 'À emporter : oui' : 'À emporter'}</span>
        </Btn>
        {aEmporter && <p style={st.aide}>La TVA à emporter s'applique aux catégories réglées pour cela ; l'alcool reste au taux normal. La quittance le dit.</p>}

        {especes ? (
          <div style={st.bloc} data-caisse-especes="">
            <div style={st.grand}>
              <span style={st.grandLibelle}>À payer en espèces</span>
              <span style={st.grandValeur}><span>{chf(duEspeces)}</span> <span style={st.devise}>CHF</span></span>
            </div>
            <div style={st.sousTitre}>Reçu du client</div>
            <div style={st.rang}>
              {billets.map((b) => (
                <Btn key={b} variant="primary" disabled={enCours || !enLigne} onClick={() => validerEspeces(b)} style={st.btnMoyen}>
                  <span style={st.num}>{chf(b)}</span>
                </Btn>
              ))}
            </div>
            <div style={st.rang}>
              <Input value={recu} onChange={(e) => setRecu(e.target.value)} placeholder="Autre montant reçu" type="text" inputMode="decimal" style={st.champ} />
              <Btn variant="primary" disabled={enCours || !enLigne || recuN == null || recu === '' || rendu < 0} onClick={() => validerEspeces(recuN)} style={st.btn44}>Valider</Btn>
            </div>
            {rendu != null && rendu >= 0 && (
              <p style={st.ligneInfo}><span>À rendre :</span> <span style={st.num}>{chf(rendu)}</span> <span>CHF</span></p>
            )}
            {rendu != null && rendu < 0 && <p style={st.aide}>Le montant reçu ne couvre pas ce qui est dû.</p>}
            <Btn variant="ghost" onClick={() => setEspeces(null)} style={st.btn44}>Choisir un autre moyen</Btn>
          </div>
        ) : (
          <>
            <div style={st.rang}>
              <label style={st.champLabel}>
                <span style={st.sousTitre}>Montant de ce paiement</span>
                <Input value={montant} onChange={(e) => setMontant(e.target.value)} placeholder={chf(reste)} type="text" inputMode="decimal" style={st.champ} />
              </label>
              <label style={st.champLabel}>
                <span style={st.sousTitre}>Pourboire, à part</span>
                <Input value={pourboire} onChange={(e) => setPourboire(e.target.value)} placeholder="0.00" type="text" inputMode="decimal" style={st.champ} />
              </label>
            </div>
            <div style={st.moyens} data-caisse-moyens="">
              {reglages.moyens_paiement.map((m, i) => (
                <Btn key={m.cle + i} variant="primary" disabled={enCours || !enLigne || !tpePret || (m.cle === 'carte' && Boolean(terminal) && Boolean(paiementEnRoute))} onClick={() => toucherMoyen(m)} style={st.btnMoyen}>
                  {reglages.perso?.moyens_paiement ? <span data-no-translate>{m.libelle}</span> : m.libelle}
                </Btn>
              ))}
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
                  <Btn variant="ghost" disabled={enCours || !enLigne || !tpePret} onClick={() => toucherMoyen({ cle: 'carte', libelle: libelleCarte }, { aLaMain: true })} style={st.btn44}>Carte, terminal non relié</Btn>
                </div>
              </div>
            )}
            <p style={st.aide}>Pour payer en plusieurs moyens, changez le montant puis touchez le moyen : le reste se met à jour.</p>
          </>
        )}

        <div style={st.separateur} />
        {peutRemiser ? (
          remiseOuverte ? (
            <Remise ticket={ticket} lignes={lignes} onFait={() => { setRemiseOuverte(false); setPoses((courant) => courant.filter((p) => p.tpe)); reload?.(); }} onFermer={() => setRemiseOuverte(false)} />
          ) : (
            <Btn variant="ghost" onClick={() => setRemiseOuverte(true)} style={st.btn44}>Remise ou offert</Btn>
          )
        ) : (
          <p style={st.aide}>Remise ou offert : demandez à un responsable, il le pose avec un motif.</p>
        )}
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
    </div>
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
    borderRadius: 'var(--r-lg)', padding: '20px 22px', width: 560, maxWidth: '100%',
    maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--sh-lg)', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  enTete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titre: { fontSize: 20, fontWeight: 400, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.2 },
  grand: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, minWidth: 0 },
  grandLibelle: { fontSize: 15, color: 'var(--text2)' },
  grandValeur: { fontSize: 34, fontWeight: 600, fontFamily: 'var(--font-num)', lineHeight: 1.1, color: 'var(--text)' },
  devise: { fontSize: 15, fontWeight: 500, color: 'var(--text2)' },
  reste: { padding: '10px 12px', borderRadius: 'var(--r-lg)', background: 'var(--surface2)' },
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
};
