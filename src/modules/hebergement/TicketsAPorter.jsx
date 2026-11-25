import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { numeroTicket } from '../caisse/tva.js';
import { listerTicketsAPorter, porterTicketSurNote } from '../../services/noteChambreService.js';
import { chf, dateCourte, dateHeureZurich, nomPersonne } from './hotelData.js';
import { Liste, Vide, h } from './hotelUi.jsx';
import ChoixSejour from './ChoixSejour.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Lot 05 du panel : les tickets de la Caisse payés « Chambre » qui n'ont pas
// trouvé leur note (le second appel a échoué, ou la maison a un moyen
// « chambre » à elle). La réception les porte en deux touchers. La base ne
// garde pas la chambre choisie à la Caisse : la table, l'heure et la personne
// qui a encaissé sont les repères pour la retrouver.
// ─────────────────────────────────────────────────────────────────────────────

// La liste, pour la tuile et pour l'écran. status : 'loading' | 'ready' | 'error'.
// Une erreur n'est jamais une liste vide.
export function useTicketsAPorter(etabId, { actif = true } = {}) {
  const [rows, setRows] = React.useState([]);
  const [status, setStatus] = React.useState(actif && etabId ? 'loading' : 'ready');
  const [erreur, setErreur] = React.useState(null);
  const tour = React.useRef(0);
  const reload = React.useCallback(async () => {
    if (!actif || !etabId) { setRows([]); setStatus('ready'); return; }
    const moi = ++tour.current;
    const { data, error } = await listerTicketsAPorter(etabId);
    if (moi !== tour.current) return;
    if (error) { setStatus('error'); setErreur(error); return; }
    setRows(data);
    setErreur(null);
    setStatus('ready');
  }, [actif, etabId]);
  React.useEffect(() => {
    reload();
    return () => { tour.current += 1; };
  }, [reload]);
  return { rows, status, erreur, reload };
}

export default function TicketsAPorter({ etabId, tickets, onPorte }) {
  const [vise, setVise] = React.useState(null); // le ticket à porter
  const { rows, status, reload } = tickets;

  async function porter(sejour) {
    const t = vise;
    if (!t) return;
    const { error } = await porterTicketSurNote(t.ticket_id, sejour.id);
    if (error) { notify(error, 'error'); reload(); return; }
    notify('Le ticket est porté sur la note de la chambre.', 'success');
    setVise(null);
    reload();
    onPorte?.();
  }

  if (status === 'error') {
    return (
      <Vide>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <span role="alert">Les tickets ne se lisent pas. Réessayez.</span>
          <Btn variant="ghost" onClick={reload} style={{ minHeight: 44 }}>Réessayer</Btn>
        </span>
      </Vide>
    );
  }
  if (status !== 'ready') return <Vide>Chargement…</Vide>;
  if (!rows.length) return <Vide>Aucun ticket à porter sur une note.</Vide>;

  return (
    <>
      <p style={{ ...h.detail, margin: 0 }}>Ces tickets sont payés sur la chambre et ne sont sur aucune note. Ils restent ici 14 jours.</p>
      <Liste>
        {rows.map((t) => (
          <div key={t.ticket_id} style={{ ...h.ligne, cursor: 'default' }} data-ticket-a-porter={t.ticket_id}>
            <span style={h.ligneGauche}>
              <span style={h.nomHote}>
                <span>Ticket n°</span> <span data-no-translate>{numeroTicket(t)}</span>
              </span>
              <span style={h.detail}>
                <span data-no-translate>{dateHeureZurich(t.closed_at) || dateCourte(t.jour)}</span>
                {t.table_nom ? <>, <span>table</span> <span data-no-translate>{t.table_nom}</span></> : <>, <span>vente directe</span></>}
                {t.libelle ? <>, <span data-no-translate>{t.libelle}</span></> : null}
                {t.encaisse_par ? <>, <span>encaissé par</span> <span data-no-translate>{nomPersonne(t.encaisse_par)}</span></> : null}
              </span>
            </span>
            <span style={h.ligneDroite}>
              <span style={{ ...h.chambre, fontFamily: 'var(--font-num)' }}><span data-no-translate>{chf(t.montant)}</span> <span>CHF</span></span>
              <Btn variant="ghost" onClick={() => setVise(t)} style={{ minHeight: 44 }}>Porter sur une note</Btn>
            </span>
          </div>
        ))}
      </Liste>
      {vise && (
        <ChoixSejour
          etablissementId={etabId}
          montant={vise.montant}
          avecPartis
          onChoisir={porter}
          onClose={() => setVise(null)}
        />
      )}
    </>
  );
}
