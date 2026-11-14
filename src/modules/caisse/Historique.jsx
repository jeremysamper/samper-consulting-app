import React from 'react';
import { Btn, Input } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { zurichAjouterJours, zurichDateHeure, zurichNowMinutes, zurichToday } from '../../utils/zurichTime.js';
import * as caisse from '../../services/caisseService.js';
import * as tpe from '../../services/caisseTpeService.js';
import CarteDetail from './tpe/CarteDetail.jsx';
import { estPrise } from './tpe/ecranTpe.js';
import { detailTva, jourExploitation, numeroTicket, totalLigne } from './tva.js';

// ─────────────────────────────────────────────────────────────────────────────
// Historique des tickets (v7) : les tickets numérotés du jour d'exploitation
// en cours, puis recherche par numéro ou par date. Un tap ouvre le ticket :
// lignes, TVA, règlement, quittance. La direction (consultant, patron) annule
// un ticket encaissé avec un motif : rien ne s'efface, le ticket garde son
// numéro et passe « annulé » (RPC caisse_annuler_ticket). Les autres rôles ne
// voient pas le bouton, et la base refuse.
// Un ticket de test n'apparaît jamais ici (il n'a pas de numéro).
//
// Terminal relié (v9) : un paiement par carte passé par le terminal dit sa
// marque, ses quatre derniers chiffres et son autorisation. Annuler un ticket
// ne rembourse rien : le remboursement sur le terminal est un geste à part,
// explicite, de la direction. Tant qu'il n'est pas fait, le ticket annulé
// porte la mention « remboursement à faire sur le terminal ».
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const dateCH = (jour) => { const [a, m, j] = String(jour || '').split('-'); return j ? `${j}.${m}.${a}` : ''; };
const LIBELLES_MOYENS = { especes: 'Espèces', carte: 'Carte bancaire', autre: 'Autre' };

export default function Historique({ etablissementId, reglages, peutAnnuler = false, peutControler = false, onQuittance, terminaux = [] }) {
  const jourCourant = React.useMemo(() => jourExploitation({
    aujourdhui: zurichToday(), minutes: zurichNowMinutes(), finJournee: reglages.fin_journee,
    veille: (d) => zurichAjouterJours(d, -1),
  }), [reglages.fin_journee]);
  const [jour, setJour] = React.useState(jourCourant);
  const [numero, setNumero] = React.useState('');
  const [tickets, setTickets] = React.useState([]);
  const [erreur, setErreur] = React.useState(null);
  const [charge, setCharge] = React.useState(false);
  const [ouvert, setOuvert] = React.useState(null);
  const [controle, setControle] = React.useState(null);
  const tour = React.useRef(0);

  const charger = React.useCallback(async () => {
    if (!etablissementId) return;
    const moi = ++tour.current;
    const n = Number(numero);
    const { data, error } = await caisse.listTicketsHistorique(
      etablissementId, numero.trim() && Number.isInteger(n) && n > 0 ? { numero: n } : { jour },
    );
    if (moi !== tour.current) return;
    setCharge(true);
    if (error) { setErreur(error); return; }
    setErreur(null);
    setTickets(data);
  }, [etablissementId, jour, numero]);
  React.useEffect(() => { charger(); }, [charger]);

  async function controler() {
    const { data, error } = await caisse.verifierChaine(etablissementId);
    if (error) { notify(error, 'error'); return; }
    setControle(data);
  }

  const total = tickets.filter((t) => t.statut === 'encaisse').reduce((s, t) => s + Number(t.total_ttc || 0), 0);
  const parNumero = numero.trim() !== '';

  return (
    <div style={st.racine} data-caisse-historique="">
      <div style={st.barre}>
        <Btn variant="ghost" onClick={() => { setNumero(''); setJour(zurichAjouterJours(jour, -1)); }} style={st.btn44}>Jour précédent</Btn>
        <label style={st.champLabel}>
          <span style={st.petit}>Jour d'exploitation</span>
          <input type="date" value={jour} max={jourCourant} onChange={(e) => { if (e.target.value) { setNumero(''); setJour(e.target.value); } }} style={st.date} />
        </label>
        <Btn variant="ghost" disabled={jour >= jourCourant} onClick={() => { setNumero(''); setJour(zurichAjouterJours(jour, 1)); }} style={st.btn44}>Jour suivant</Btn>
        <label style={st.champLabel}>
          <span style={st.petit}>Chercher un numéro</span>
          <Input value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))} placeholder="Numéro de ticket" type="text" inputMode="numeric" style={st.champ} />
        </label>
      </div>

      {erreur && (
        <div style={st.erreur}>
          <p style={{ margin: 0 }}>{erreur}</p>
          <Btn variant="primary" onClick={charger} style={st.btn44}>Réessayer</Btn>
        </div>
      )}
      {!erreur && charge && !tickets.length && (
        <p style={st.vide}>{parNumero ? 'Aucun ticket ne porte ce numéro.' : 'Aucun ticket encaissé ce jour-là.'}</p>
      )}
      {!parNumero && tickets.length > 0 && (
        <p style={st.resume}>
          <span style={st.num}>{tickets.length}</span> <span>tickets,</span> <span style={st.num}>{chf(total)}</span> <span>CHF encaissés, annulés non comptés</span>
        </p>
      )}

      {tickets.length > 0 && (
      <div className="caisse-liste" data-cadre="" style={st.liste}>
        {tickets.map((t) => (
          <button key={t.id} type="button" style={st.rang} onClick={() => setOuvert(t.id)}>
            <span style={st.rangNumero} data-no-translate>{numeroTicket(t)}</span>
            <span style={st.rangInfos}>
              <span><span style={st.num}>{dateCH(t.jour_exploitation)}</span> <span style={st.num}>{t.closed_at ? zurichDateHeure(t.closed_at).heure : ''}</span></span>
              <span>
                {t.salle_tables?.nom ? <><span>Table</span> <span data-no-translate>{t.salle_tables.nom}</span></> : <span>Vente directe</span>}
                {t.a_emporter && <span>{' '}</span>}
                {t.a_emporter && <span>À emporter</span>}
              </span>
              {t.statut === 'annule' && <span style={st.annule}>Annulé</span>}
            </span>
            <span style={{ ...st.rangTotal, ...(t.statut === 'annule' ? st.barre2 : null) }}><span>{chf(t.total_ttc)}</span> <span>CHF</span></span>
          </button>
        ))}
      </div>
      )}

      {peutControler && (
        <div style={st.controle}>
          <Btn variant="ghost" onClick={controler} style={st.btn44}>Contrôler l'intégrité de la caisse</Btn>
          {controle && (
            <div style={st.controleCorps} data-cadre="" data-caisse-controle={controle.ok ? 'ok' : 'defaut'}>
              <p style={st.ligneForte}>{controle.ok ? 'Chaîne intacte : aucune pièce modifiée depuis son scellement.' : 'La chaîne est rompue : une pièce a été modifiée ou manque.'}</p>
              <p style={st.vide}>
                <span style={st.num}>{controle.tickets}</span> <span>tickets,</span> <span style={st.num}>{controle.annulations}</span> <span>annulations,</span> <span style={st.num}>{controle.clotures}</span> <span>clôtures contrôlés.</span>
              </p>
              {(controle.defauts || []).map((d, i) => (
                <p key={i} style={st.defaut} data-no-translate>{[d.piece, d.raison].filter(Boolean).join(' : ')}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {ouvert && (
        <FicheTicket
          id={ouvert}
          peutAnnuler={peutAnnuler}
          terminaux={terminaux}
          onQuittance={onQuittance}
          onChange={charger}
          onClose={() => setOuvert(null)}
        />
      )}
    </div>
  );
}

// ── Un ticket de l'historique : lecture, quittance, annulation tracée ──
function FicheTicket({ id, peutAnnuler, terminaux = [], onQuittance, onChange, onClose }) {
  const [ticket, setTicket] = React.useState(null);
  const [erreur, setErreur] = React.useState(null);
  const [annulation, setAnnulation] = React.useState(false);
  const [motif, setMotif] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  const [client, setClient] = React.useState({ nom: '', adresse: '' });

  useBackLayer(true, onClose, 'caisse-historique-ticket');
  const lire = React.useCallback(async () => {
    const { data, error } = await caisse.getTicketComplet(id);
    if (error) { setErreur(error); return; }
    setErreur(null);
    setTicket(data);
  }, [id]);
  React.useEffect(() => { lire(); }, [lire]);

  async function annuler() {
    if (enCours) return;
    if (motif.trim().length < 3) { notify('Un motif est obligatoire.', 'warning'); return; }
    setEnCours(true);
    try {
      const { error } = await caisse.annulerTicket(id, motif.trim());
      if (error) { notify(error, 'error'); return; }
      notify('Ticket annulé. Il garde son numéro et reste dans la caisse.', 'success');
      setAnnulation(false);
      await Promise.all([lire(), onChange?.()]);
    } finally {
      setEnCours(false);
    }
  }

  // Remboursement sur le terminal : la direction, sur un ticket annulé.
  async function rembourser(transaction) {
    if (enCours) return;
    setEnCours(true);
    try {
      const { data, error } = await tpe.rembourserPaiement(transaction.id);
      if (error) { notify(error, 'error'); return; }
      if (data.transaction.rembourse_statut === 'fait') notify('Paiement remboursé sur le terminal', 'success');
      else notify('Le remboursement a échoué : il reste à faire sur le terminal.', 'warning');
      await lire();
    } finally {
      setEnCours(false);
    }
  }
  const nomTerminal = (transaction) => terminaux.find((t) => t.id === transaction?.terminal_id)?.nom || null;

  return (
    <div className="modal-sheet-overlay" data-fenetre="" style={st.overlay} onClick={onClose}>
      <div className="modal-sheet" role="region" aria-label="Ticket encaissé" style={st.feuille} onClick={(e) => e.stopPropagation()} data-caisse-fiche-ticket="">
        <div style={st.enTete}>
          <div style={st.titre}>
            <span>Ticket</span> <span data-no-translate>{ticket ? numeroTicket(ticket) : ''}</span>
          </div>
          <Btn variant="ghost" onClick={onClose} style={st.btn44}>Fermer</Btn>
        </div>
        {erreur && <p style={st.vide}>{erreur}</p>}
        {ticket && (
          <>
            <p style={st.vide}>
              <span style={st.num}>{zurichDateHeure(ticket.closed_at).date}</span> <span style={st.num}>{zurichDateHeure(ticket.closed_at).heure}</span>
              {', '}
              {ticket.tableNom ? <><span>Table</span> <span data-no-translate>{ticket.tableNom}</span></> : <span>Vente directe</span>}
              {ticket.a_emporter && <>{', '}<span>À emporter</span></>}
            </p>
            {ticket.statut === 'annule' && (
              <div style={st.annuleBloc} data-cadre="">
                <p style={st.ligneForte}>
                  <span>Annulé le</span> <span style={st.num}>{ticket.annule_at ? zurichDateHeure(ticket.annule_at).date : ''}</span>
                </p>
                <p style={st.vide}><span>Motif :</span> <span data-no-translate>{ticket.annule_motif}</span></p>
              </div>
            )}
            <div>
              {ticket.lignes.map((l) => (
                <div key={l.id} style={st.ligne}>
                  <span style={st.ligneQte}>{Number(l.quantite)}</span>
                  <span style={st.ligneNom}>
                    <span data-no-translate>{l.libelle}</span>
                    {l.offert && <span style={st.petit}>Offert</span>}
                    {!l.offert && l.prix_origine != null && (
                      <span style={st.petit}><span>Remise</span> <span style={st.num}>{chf(l.remise_montant)}</span>{l.remise_motif ? <>{', '}<span data-no-translate>{l.remise_motif}</span></> : null}</span>
                    )}
                    <span style={st.petit}><span>TVA</span> <span style={st.num}>{String(Number(l.taux_tva ?? 8.1)).replace('.', ',')}</span> <span>%</span></span>
                  </span>
                  <span style={st.num}>{chf(totalLigne(l))}</span>
                </div>
              ))}
            </div>
            <div style={st.totalRang}>
              <span>Total TVA comprise</span>
              <span style={st.totalValeur}><span>{chf(ticket.total_ttc)}</span> <span style={st.petit}>CHF</span></span>
            </div>
            {detailTva(ticket.lignes).map((t) => (
              <p key={t.taux} style={st.vide}>
                <span>TVA</span> <span style={st.num}>{String(t.taux).replace('.', ',')}</span> <span>% :</span> <span style={st.num}>{chf(t.tva)}</span> <span>sur</span> <span style={st.num}>{chf(t.ttc)}</span>
              </p>
            ))}
            {ticket.paiements.map((p) => (
              <React.Fragment key={p.id}>
                <p style={st.vide}>
                  {p.libelle ? <span data-no-translate>{p.libelle}</span> : <span>{LIBELLES_MOYENS[p.moyen]}</span>}
                  {' '}<span style={st.num}>{chf(Number(p.montant) + Number(p.arrondi || 0))}</span>
                  {Number(p.pourboire) > 0 && <>{', '}<span>pourboire</span> <span style={st.num}>{chf(p.pourboire)}</span></>}
                </p>
                {p.tpe_transaction_id && (
                  <div style={st.carteReliee} data-caisse-carte-reliee="">
                    <p style={st.vide}>
                      <span>Carte, terminal relié</span>
                      {nomTerminal(p.transaction) && <>{' '}<span data-no-translate>{nomTerminal(p.transaction)}</span></>}
                      {p.transaction && <>{' : '}<CarteDetail transaction={p.transaction} /></>}
                      {p.transaction?.tranche && <>{', '}<span>accord confirmé à la main par un responsable</span></>}
                    </p>
                    {p.transaction?.rembourse_statut === 'fait' && <p style={st.vide}>Remboursé sur le terminal.</p>}
                    {ticket.statut === 'annule' && estPrise(p.transaction) && (
                      <>
                        <p style={st.ligneForte}>Remboursement à faire sur le terminal</p>
                        {p.transaction.rembourse_statut === 'echec' && (
                          <p style={st.vide}>
                            <span>La dernière demande a échoué.</span>
                            {p.transaction.rembourse_message && <>{' '}<span data-no-translate>{p.transaction.rembourse_message}</span></>}
                          </p>
                        )}
                        {peutAnnuler
                          ? <div><Btn variant="primary" disabled={enCours} onClick={() => rembourser(p.transaction)} style={st.btn44}>Rembourser sur le terminal</Btn></div>
                          : <p style={st.vide}>Le remboursement se fait par un consultant ou un patron.</p>}
                      </>
                    )}
                  </div>
                )}
              </React.Fragment>
            ))}

            {Number(ticket.total_ttc) > 400 && (
              <div style={st.bloc}>
                <Input value={client.nom} onChange={(e) => setClient((c) => ({ ...c, nom: e.target.value }))} placeholder="Nom du client" style={st.champ} />
                <Input value={client.adresse} onChange={(e) => setClient((c) => ({ ...c, adresse: e.target.value }))} placeholder="Adresse du client" style={st.champ} />
              </div>
            )}
            {annulation ? (
              <div style={st.bloc} data-caisse-annulation="">
                <p style={st.vide}>Le ticket garde son numéro, ses lignes et ses paiements. La clôture du jour porte l'écriture inverse.</p>
                {ticket.paiements.some((p) => p.tpe_transaction_id) && (
                  <p style={st.vide}>Annuler ne rembourse pas la carte : le remboursement sur le terminal sera proposé ensuite, sur ce ticket.</p>
                )}
                <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif de l'annulation" style={st.champ} />
                <div style={st.pied}>
                  <Btn variant="ghost" onClick={() => setAnnulation(false)} style={st.btn44}>Ne pas annuler</Btn>
                  <Btn variant="danger" disabled={enCours} onClick={annuler} style={st.btn44}>Annuler ce ticket</Btn>
                </div>
              </div>
            ) : (
              <div style={st.pied}>
                {peutAnnuler && ticket.statut === 'encaisse' && (
                  <Btn variant="danger" onClick={() => setAnnulation(true)} style={st.btn44}>Annuler ce ticket</Btn>
                )}
                <Btn variant="primary" onClick={() => onQuittance?.(ticket.id, client)} style={st.btn44}>Quittance</Btn>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const st = {
  racine: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, maxWidth: 720, minWidth: 0 },
  barre: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' },
  champLabel: { display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 200px', minWidth: 0 },
  petit: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  champ: { minHeight: 44, minWidth: 0, width: '100%', boxSizing: 'border-box' },
  date: {
    minHeight: 44, minWidth: 0, width: '100%', boxSizing: 'border-box', padding: '0 10px', fontFamily: 'var(--font)', fontSize: 'var(--t2)',
    color: 'var(--text)', background: 'var(--surface)', borderRadius: 'var(--r)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)',
  },
  btn44: { minHeight: 44, flexShrink: 0 },
  erreur: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', color: 'var(--text)' },
  vide: { color: 'var(--text3)', fontSize: 'var(--t2)', margin: 0, lineHeight: 1.4 },
  resume: { color: 'var(--text)', fontSize: 'var(--t2)', margin: 0 },
  num: { fontFamily: 'var(--font-num)' },
  // Liste dans une carte blanche (direction Galet) : une ligne par ticket,
  // séparée par son filet doux ; la dernière n'en porte pas (caisse.css).
  liste: {
    display: 'flex', flexDirection: 'column', minWidth: 0, padding: '4px 18px', boxSizing: 'border-box',
    background: 'var(--zone)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
  rang: {
    display: 'flex', alignItems: 'baseline', gap: 12, minHeight: 56, padding: '10px 0', width: '100%', boxSizing: 'border-box',
    borderRadius: 0, background: 'transparent', color: 'var(--text)',
    borderWidth: 0, borderBottomWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
    cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 'var(--t2)', textAlign: 'left',
  },
  rangNumero: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g2)', flexShrink: 0 },
  rangInfos: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0, fontSize: 'var(--t1)', color: 'var(--text2)' },
  rangTotal: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', flexShrink: 0 },
  barre2: { textDecoration: 'line-through', color: 'var(--text2)' },
  annule: { color: 'var(--danger-text, var(--text))', fontWeight: 'var(--g3)' },
  controle: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', marginTop: 8 },
  carteReliee: { display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 12, borderLeftWidth: 2, borderLeftStyle: 'solid', borderLeftColor: 'var(--border)' },
  controleCorps: {
    padding: '14px 18px', boxSizing: 'border-box', borderRadius: 'var(--r-lg)', background: 'var(--zone)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
    display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'stretch',
  },
  ligneForte: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', margin: 0 },
  defaut: { fontSize: 'var(--t1)', color: 'var(--text)', margin: 0, overflowWrap: 'anywhere' },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16,
  },
  feuille: {
    background: 'var(--surface)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    borderRadius: 'var(--r-lg)', padding: '20px 22px', width: 560, maxWidth: '100%',
    maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--sh-lg)', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  enTete: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titre: { fontSize: 20, fontWeight: 400, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.2, minWidth: 0 },
  annuleBloc: { padding: '10px 12px', borderRadius: 'var(--r-lg)', background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 2 },
  ligne: {
    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', fontSize: 15, color: 'var(--text)',
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
  },
  ligneQte: { fontFamily: 'var(--font-num)', fontWeight: 600, minWidth: 26, textAlign: 'right', flexShrink: 0 },
  ligneNom: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0, overflowWrap: 'anywhere' },
  totalRang: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 15, color: 'var(--text)' },
  totalValeur: { fontFamily: 'var(--font-num)', fontSize: 24, fontWeight: 600 },
  bloc: { display: 'flex', flexDirection: 'column', gap: 8 },
  pied: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 6 },
};
