import React from 'react';
import { CreditCard } from 'lucide-react';
import { Btn, Input } from '../../../components/ui/index.jsx';
import { useBackLayer } from '../../../hooks/useBackLayer.js';
import * as tpe from '../../../services/caisseTpeService.js';
import { RYTHME_SUIVI_MS, etapeDe, titreFin } from './ecranTpe.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Présentez la carte sur le terminal » (caisse v9).
//
// La feuille envoie le montant au terminal par l'Edge Function caisse-tpe,
// puis redemande le statut toutes les deux secondes. Elle ne voit jamais une
// carte : elle reçoit « accepté », « refusé » ou rien.
//   - accepté : le paiement se pose (onApprouve), la feuille se ferme ;
//   - refusé, annulé, délai du terminal : le message en clair, retour aux
//     moyens de paiement ;
//   - sans réponse : « Regardez le terminal ». Rien n'est posé. On peut
//     redemander le statut ; si le terminal reste muet, seul un responsable
//     tranche, avec un motif (écrit au Journal d'activité).
// Une tentative = une référence tirée ici. Si le réseau coupe à l'envoi,
// « Réessayer » rejoue la MÊME référence : jamais deux débits pour un geste.
// Fermer la feuille pendant l'attente n'annule rien : le paiement continue
// sur le terminal, l'encaissement propose de le reprendre.
// Le nom du terminal et le message du prestataire sont des données :
// data-no-translate. Chaque nombre vit dans son propre nœud.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

function nouvelleReference() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const o = new Uint8Array(16);
  crypto.getRandomValues(o);
  o[6] = (o[6] & 0x0f) | 0x40;
  o[8] = (o[8] & 0x3f) | 0x80;
  const h = [...o].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export default function FeuilleTerminal({
  ticket, terminal, montant, pourboire = 0, reprise = null, peutTrancher = false,
  onApprouve, onChange, onFermer,
}) {
  const [transaction, setTransaction] = React.useState(reprise);
  const [erreur, setErreur] = React.useState(null); // { message, reseau }
  const [occupe, setOccupe] = React.useState(false);
  const [motif, setMotif] = React.useState('');
  const reference = React.useRef(reprise ? null : nouvelleReference());
  const vivant = React.useRef(true);
  const approuve = React.useRef(false);
  React.useEffect(() => () => { vivant.current = false; }, []);

  const total = Number(transaction?.montant ?? montant) + Number(transaction?.pourboire ?? pourboire);
  const tip = Number(transaction?.pourboire ?? pourboire);
  const etape = etapeDe(transaction);

  const recevoir = React.useCallback((t) => {
    if (!vivant.current || !t) return;
    setTransaction(t);
    onChange?.(t);
    if (t.statut === 'approuve' && !approuve.current) {
      approuve.current = true;
      onApprouve?.(t);
    }
  }, [onApprouve, onChange]);

  // L'envoi au terminal. Rejoué avec la même référence après une coupure.
  const envoyer = React.useCallback(async () => {
    setErreur(null);
    setOccupe(true);
    const { data, error, reseau } = await tpe.demarrerPaiement({
      ticketId: ticket.id, terminalId: terminal.id, montant, pourboire, reference: reference.current,
    });
    if (!vivant.current) return;
    setOccupe(false);
    if (error) { setErreur({ message: error, reseau: Boolean(reseau) }); return; }
    recevoir(data.transaction);
  }, [ticket.id, terminal.id, montant, pourboire, recevoir]);

  // Une seule fois à l'ouverture : la feuille porte une tentative.
  const ouverte = React.useRef(false);
  React.useEffect(() => {
    if (ouverte.current) return;
    ouverte.current = true;
    if (reprise) onChange?.(reprise);
    else envoyer();
  }, [reprise, onChange, envoyer]);

  // Le suivi : tant que le terminal attend la carte.
  const id = transaction?.id || null;
  React.useEffect(() => {
    if (!id || etape !== 'attente') return undefined;
    let arrete = false;
    let minuterie = null;
    const tour = async () => {
      const { data } = await tpe.statutPaiement(id);
      if (arrete || !vivant.current) return;
      if (data?.transaction) recevoir(data.transaction);
      minuterie = setTimeout(tour, RYTHME_SUIVI_MS);
    };
    minuterie = setTimeout(tour, RYTHME_SUIVI_MS);
    return () => { arrete = true; clearTimeout(minuterie); };
  }, [id, etape, recevoir]);

  useBackLayer(true, onFermer, 'caisse-terminal');

  async function agir(action) {
    if (occupe) return;
    setOccupe(true);
    setErreur(null);
    const { data, error } = await action();
    if (!vivant.current) return;
    setOccupe(false);
    if (error) { setErreur({ message: error, reseau: false }); return; }
    recevoir(data.transaction);
  }
  const annuler = () => agir(() => tpe.annulerPaiement(id));
  const redemander = () => agir(() => tpe.statutPaiement(id));
  const trancher = (decision) => {
    if (motif.trim().length < 3) { setErreur({ message: 'Un motif est obligatoire.', reseau: false }); return; }
    agir(() => tpe.trancherPaiement(id, decision, motif.trim()));
  };

  return (
    <div className="modal-sheet-overlay" data-fenetre="" style={st.overlay}>
      <div className="modal-sheet" role="region" aria-label="Paiement par carte sur le terminal" style={st.feuille} data-caisse-terminal={etape}>
        <div style={st.enTete}>
          <CreditCard size={22} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
          <div style={st.titre}>Paiement par carte</div>
        </div>
        <p style={st.aide}><span>Terminal :</span> <span data-no-translate>{terminal.nom}</span></p>
        {ticket.test && <p style={st.aide}>Mode test : terminal simulé, aucun argent ne bouge.</p>}

        <div style={st.grand}>
          <span style={st.grandLibelle}>À payer sur le terminal</span>
          <span style={st.grandValeur} data-terminal-montant=""><span>{chf(total)}</span> <span style={st.devise}>CHF</span></span>
        </div>
        {tip > 0 && (
          <p style={st.aide}><span>Dont pourboire, à part du total :</span> <span style={st.num}>{chf(tip)}</span> <span>CHF</span></p>
        )}

        {erreur && (
          <div style={st.alerte} data-cadre="" role="alert">
            <p style={st.ligneForte}>{erreur.message}</p>
            {erreur.reseau && !transaction && (
              <p style={st.aide}>La demande n'est peut-être pas partie. « Réessayer » renvoie la même demande : le client ne peut pas être débité deux fois.</p>
            )}
          </div>
        )}

        {(etape === 'envoi' || etape === 'attente') && !(erreur && !transaction) && (
          <div style={st.bloc}>
            <p style={st.ligneGrande} role="status">Présentez la carte sur le terminal</p>
            <p style={st.aide}>{etape === 'envoi' ? 'Envoi du montant au terminal...' : 'Le terminal attend la carte. La caisse reçoit la réponse toute seule.'}</p>
            <div style={st.pied}>
              <Btn variant="ghost" disabled={occupe || !id} onClick={annuler} style={st.btnAction}>Annuler</Btn>
            </div>
          </div>
        )}

        {erreur && !transaction && (
          <div style={st.pied}>
            <Btn variant="ghost" onClick={onFermer} style={st.btnAction}>Revenir aux moyens de paiement</Btn>
            {erreur.reseau && <Btn variant="primary" disabled={occupe} onClick={envoyer} style={st.btnAction}>Réessayer</Btn>}
          </div>
        )}

        {etape === 'accepte' && (
          <div style={{ ...st.alerte, ...st.succes }} data-cadre="">
            <p style={st.ligneGrande} role="status">Paiement accepté</p>
          </div>
        )}

        {etape === 'refuse' && (
          <div style={st.bloc}>
            <div style={st.alerte} data-cadre="">
              <p style={st.ligneGrande} role="status">{titreFin(transaction)}</p>
              {transaction.message && <p style={st.aide} data-no-translate>{transaction.message}</p>}
              <p style={st.aide}>Rien n'a été posé sur le ticket.</p>
            </div>
            <div style={st.pied}>
              <Btn variant="primary" onClick={onFermer} style={st.btnAction}>Revenir aux moyens de paiement</Btn>
            </div>
          </div>
        )}

        {etape === 'incertain' && (
          <div style={st.bloc}>
            <div style={st.alerte} data-cadre="">
              <p style={st.ligneGrande} role="status">Regardez le terminal</p>
              <p style={st.aide}>La caisse n'a pas reçu la réponse du terminal. Rien n'est posé sur le ticket, et aucune nouvelle demande ne part tant que ce paiement n'est pas éclairci.</p>
            </div>
            <div style={st.pied}>
              <Btn variant="primary" disabled={occupe} onClick={redemander} style={st.btnAction}>Redemander le statut</Btn>
            </div>
            {peutTrancher ? (
              <div style={st.bloc} data-terminal-trancher="">
                <div style={st.sousTitre}>Le terminal reste muet : trancher</div>
                <p style={st.aide}>Lisez le reçu ou l'écran du terminal. Votre choix et son motif sont écrits au Journal d'activité.</p>
                <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif, par exemple : reçu du terminal vu" style={st.champ} />
                <div style={st.pied}>
                  <Btn variant="ghost" disabled={occupe} onClick={() => trancher('non_paye')} style={st.btnAction}>Le terminal n'a rien débité</Btn>
                  <Btn variant="primary" disabled={occupe} onClick={() => trancher('paye')} style={st.btnAction}>Le terminal a accepté</Btn>
                </div>
              </div>
            ) : (
              <p style={st.aide}>Si le terminal reste muet, appelez un responsable : lui seul peut dire si le paiement est passé.</p>
            )}
            <div style={st.pied}>
              <Btn variant="ghost" onClick={onFermer} style={st.btn44}>Fermer</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const st = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1300, padding: 16,
  },
  feuille: {
    background: 'var(--surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    borderRadius: 'var(--r-lg)', padding: '20px 22px', width: 520, maxWidth: '100%',
    maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--sh-lg)', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--text)',
  },
  enTete: { display: 'flex', alignItems: 'center', gap: 10 },
  titre: { fontSize: 20, fontWeight: 400, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.2 },
  grand: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, minWidth: 0, flexWrap: 'wrap' },
  grandLibelle: { fontSize: 15, color: 'var(--text2)' },
  grandValeur: { fontSize: 40, fontWeight: 600, fontFamily: 'var(--font-num)', lineHeight: 1.1, color: 'var(--text)' },
  devise: { fontSize: 16, fontWeight: 500, color: 'var(--text2)' },
  num: { fontFamily: 'var(--font-num)', fontWeight: 600 },
  aide: { fontSize: 14, color: 'var(--text2)', margin: 0, lineHeight: 1.4 },
  ligneForte: { fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.35 },
  ligneGrande: { fontSize: 20, fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.25 },
  sousTitre: { fontSize: 13, fontWeight: 600, color: 'var(--text2)' },
  bloc: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  alerte: { padding: '12px 14px', borderRadius: 'var(--r-lg)', background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 6 },
  succes: { background: 'var(--success-bg-soft)' },
  champ: { minHeight: 48, minWidth: 0, width: '100%', boxSizing: 'border-box' },
  btnAction: { minHeight: 56, fontSize: 16, flex: '1 1 180px' },
  btn44: { minHeight: 44, flexShrink: 0 },
  pied: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' },
};
