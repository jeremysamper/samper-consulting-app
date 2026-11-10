import React from 'react';
import { Btn, Input } from '../../components/ui/index.jsx';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { COUVERTS_MAX } from './clients.js';
import { ListeReservations, st as stQui } from './QuiEstLa.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// « Corriger » : la feuille du bandeau du ticket (v5). Le service répare une
// erreur de réservation sans quitter la caisse, et seulement ceci :
//   - le nom et les couverts de la réservation du ticket ;
//   - arrivé, ou no-show ;
//   - changer la réservation rattachée au ticket.
// Chaque geste passe par la RPC caisse_corriger_reservation (onCorriger), qui
// refuse tout le reste et laisse une trace au Journal d'activité. Une
// réservation de groupe garde son nom et ses couverts : ils se corrigent dans
// Groupes, la base le refuse ici et l'écran ne le propose pas.
// Les noms sont des données : data-no-translate ; la valeur d'un champ n'est
// jamais traduite.
// ─────────────────────────────────────────────────────────────────────────────

export default function CorrigerClient({ reservation, reservations, tableId, enCours = false, onCorriger, onClose }) {
  const [nom, setNom] = React.useState(reservation?.nom || '');
  const [couverts, setCouverts] = React.useState(reservation?.nb_couverts || 1);
  // La réservation change (rattachement, realtime) : le formulaire la suit.
  React.useEffect(() => {
    setNom(reservation?.nom || '');
    setCouverts(reservation?.nb_couverts || 1);
  }, [reservation?.id, reservation?.nom, reservation?.nb_couverts]);

  useBackLayer(true, onClose, 'caisse-corriger');
  React.useEffect(() => {
    const echap = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', echap, true);
    return () => document.removeEventListener('keydown', echap, true);
  }, [onClose]);

  const groupe = Boolean(reservation?.groupe_evenement_id);
  const nomPropre = nom.trim();
  const change = reservation
    && ((nomPropre && nomPropre !== reservation.nom) || couverts !== reservation.nb_couverts);
  const autres = reservations.filter((r) => r.id !== reservation?.id);

  function enregistrer() {
    if (!reservation || !change || !nomPropre) return;
    onCorriger({
      reservationId: reservation.id,
      nom: nomPropre !== reservation.nom ? nomPropre : null,
      couverts: couverts !== reservation.nb_couverts ? couverts : null,
    }, 'Réservation corrigée');
  }

  function marquer(statut) {
    if (!reservation) return;
    if (statut === 'no_show' && !window.confirm('Marquer cette réservation en no-show ?')) return;
    onCorriger({ reservationId: reservation.id, statut }, statut === 'no_show' ? 'Réservation marquée no-show' : 'Réservation marquée arrivée');
  }

  return (
    <div className="modal-sheet-overlay" data-fenetre="" style={stQui.overlay} onClick={onClose}>
      <div className="modal-sheet" role="region" aria-label="Corriger le client de la table" data-caisse-corriger="" style={stQui.feuille} onClick={(e) => e.stopPropagation()}>
        <div style={stQui.enTete}>
          <div style={{ minWidth: 0 }}>
            <div style={stQui.titre}>Corriger le client de la table</div>
            {reservation && <div style={stQui.sousTitre} data-no-translate>{reservation.nom}</div>}
          </div>
          <Btn variant="ghost" onClick={onClose} style={stQui.btn44}>Fermer</Btn>
        </div>

        {reservation && (
          <div style={stQui.colonne}>
            <div style={stQui.rangTitre}>Nom et couverts</div>
            {groupe ? (
              <p style={stQui.vide}>Réservation d'un groupe : le nom et les couverts se corrigent dans Groupes.</p>
            ) : (
              <>
                <Input value={nom} onChange={(e) => setNom(e.target.value.slice(0, 120))} placeholder="Nom de la réservation" style={{ minHeight: 44 }} />
                <div style={stQui.ligne}>
                  <Btn variant="ghost" disabled={couverts <= 1} onClick={() => setCouverts((c) => Math.max(1, c - 1))} style={st.btnPas} ariaLabel="Un couvert de moins">-1</Btn>
                  <span style={st.couverts}><span style={stQui.num}>{couverts}</span> <span style={st.couvertsMot}>couverts</span></span>
                  <Btn variant="ghost" disabled={couverts >= COUVERTS_MAX} onClick={() => setCouverts((c) => Math.min(COUVERTS_MAX, c + 1))} style={st.btnPas} ariaLabel="Un couvert de plus">+1</Btn>
                  <Btn variant="primary" disabled={enCours || !change || !nomPropre} onClick={enregistrer} style={{ ...stQui.btn44, marginLeft: 'auto' }}>Enregistrer</Btn>
                </div>
              </>
            )}

            <div style={stQui.rangTitre}>Statut de la réservation</div>
            <div style={stQui.ligne}>
              {(reservation.statut === 'confirme' || reservation.statut === 'no_show') && (
                <Btn variant="ghost" disabled={enCours} onClick={() => marquer('arrive')} style={st.btnStatut}>Marquer arrivé</Btn>
              )}
              {(reservation.statut === 'confirme' || reservation.statut === 'arrive') && (
                <Btn variant="ghost" disabled={enCours} onClick={() => marquer('no_show')} style={st.btnStatut}>Marquer no-show</Btn>
              )}
            </div>
          </div>
        )}

        <div style={stQui.colonne}>
          <div style={stQui.rangTitre}>{reservation ? 'Changer de réservation' : 'Rattacher une réservation'}</div>
          <ListeReservations
            reservations={autres}
            tableId={tableId}
            disabled={enCours}
            vide="Aucune autre réservation attendue aujourd'hui."
            onChoisir={(r) => onCorriger({ reservationId: r.id, rattacher: true }, 'Ticket rattaché à la réservation')}
          />
        </div>
      </div>
    </div>
  );
}

const st = {
  btnPas: { minHeight: 44, minWidth: 56, flexShrink: 0, fontFamily: 'var(--font-num)', fontSize: 16 },
  btnStatut: { minHeight: 52, flex: '1 1 160px', fontSize: 15 },
  couverts: { fontSize: 22, fontWeight: 600, minWidth: 96, textAlign: 'center', color: 'var(--text)' },
  couvertsMot: { fontSize: 13, fontWeight: 400, color: 'var(--text2)' },
};
