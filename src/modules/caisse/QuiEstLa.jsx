import React from 'react';
import { CalendarCheck, ContactRound, Footprints } from 'lucide-react';
import { Btn, Input } from '../../components/ui/index.jsx';
import { useBackLayer } from '../../hooks/useBackLayer.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import * as caisse from '../../services/caisseService.js';
import { COUVERTS_MAX, COUVERTS_RAPIDES, allergiesDe, estSurTable, heureCourte } from './clients.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Qui est à cette table ? » : la feuille qui s'ouvre au tap sur une table
// libre (v5). Trois réponses, en gros boutons :
//   - une réservation du jour. Celles posées sur cette table sont proposées
//     d'emblée, en tête : table réservée ouverte en deux gestes (la table,
//     puis la réservation). Les autres se cherchent par nom ;
//   - un client de passage : le nombre de couverts en un tap ;
//   - un compte client : une fiche du fichier clients, puis les couverts.
//     Ni e-mail ni téléphone à l'écran de la caisse.
// La feuille ne crée rien elle-même : elle rend le choix à onChoisir, qui
// appelle la RPC caisse_ouvrir_ticket (idempotente au double tap).
// Refermable par le geste retour et par Échap. Les noms de clients, de
// réservations et de tables sont des données : data-no-translate. Chaque
// nombre vit dans son propre noeud (traduction du DOM).
// ─────────────────────────────────────────────────────────────────────────────

const nomFiche = (c) => [c?.prenom, c?.nom].filter(Boolean).join(' ').trim() || 'Client';

// Une réservation en rang tappable : heure, nom, couverts, allergies.
export function RangReservation({ resa, tableId, principal = false, disabled = false, onClick }) {
  const allergies = allergiesDe(resa);
  const ici = tableId && estSurTable(resa, tableId);
  return (
    <button
      type="button"
      data-cadre=""
      data-resa={resa.id}
      disabled={disabled}
      onClick={onClick}
      style={{ ...st.rang, ...(principal ? st.rangPrincipal : null), opacity: disabled ? 0.6 : 1 }}
    >
      <span style={st.rangHeure}>{heureCourte(resa.heure_arrivee)}</span>
      <span style={st.rangCorps}>
        <span style={st.rangNom} data-no-translate>{resa.nom}</span>
        <span style={{ ...st.rangDetail, ...(principal ? st.detailPrincipal : null) }}>
          <span><span style={st.num}>{resa.nb_couverts}</span> <span>couverts</span></span>
          {resa.statut === 'arrive' && <span>déjà à l'accueil</span>}
          {ici && <span>sur cette table</span>}
        </span>
        {allergies.length > 0 && (
          <span style={{ ...st.rangDetail, ...(principal ? st.detailPrincipal : null) }}>
            <span>Allergies :</span> <span data-no-translate>{allergies.join(', ')}</span>
          </span>
        )}
      </span>
    </button>
  );
}

// Recherche et liste des réservations qu'on peut asseoir.
export function ListeReservations({ reservations, tableId, disabled, onChoisir, vide = 'Aucune réservation attendue aujourd\'hui.' }) {
  const [recherche, setRecherche] = React.useState('');
  const match = makeSearchMatcher(recherche);
  const visibles = recherche.trim() ? reservations.filter((r) => match(r.nom)) : reservations;
  return (
    <div style={st.colonne}>
      {reservations.length > 6 && (
        <Input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher un nom"
          style={{ minHeight: 44 }}
        />
      )}
      {!reservations.length && <p style={st.vide}>{vide}</p>}
      {reservations.length > 0 && !visibles.length && <p style={st.vide}>Aucune réservation à ce nom.</p>}
      {visibles.map((r) => (
        <RangReservation key={r.id} resa={r} tableId={tableId} disabled={disabled} onClick={() => onChoisir(r)} />
      ))}
    </div>
  );
}

// Couverts en un tap (1 à 8), puis « + » pour un nombre plus grand.
export function CasesCouverts({ disabled, onChoisir }) {
  const [plus, setPlus] = React.useState(false);
  const [autre, setAutre] = React.useState('');
  const n = Math.min(COUVERTS_MAX, Number(autre) || 0);
  return (
    <div style={st.colonne}>
      <div style={st.cases}>
        {COUVERTS_RAPIDES.map((c) => (
          <button
            key={c}
            type="button"
            data-cadre=""
            data-couverts={c}
            disabled={disabled}
            onClick={() => onChoisir(c)}
            style={{ ...st.case, opacity: disabled ? 0.6 : 1 }}
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          data-cadre=""
          disabled={disabled}
          onClick={() => setPlus(true)}
          aria-label="Plus de 8 couverts"
          style={{ ...st.case, ...(plus ? st.caseActive : null) }}
        >
          +
        </button>
      </div>
      {plus && (
        <div style={st.ligne}>
          <Input
            value={autre}
            onChange={(e) => setAutre(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="Nombre de couverts"
            type="text"
            inputMode="numeric"
            style={{ flex: 1, minWidth: 120, minHeight: 44 }}
          />
          <Btn variant="primary" disabled={disabled || n < 1} onClick={() => onChoisir(n)} style={st.btn44}>Ouvrir la table</Btn>
        </div>
      )}
    </div>
  );
}

export default function QuiEstLa({ table, etablissementId, reservations, enCours = false, onChoisir, onClose }) {
  const [etape, setEtape] = React.useState('menu'); // menu | reservations | passage | compte | compteCouverts
  const [clients, setClients] = React.useState(null);
  const [erreurClients, setErreurClients] = React.useState(null);
  const [rechercheClient, setRechercheClient] = React.useState('');
  const [client, setClient] = React.useState(null);

  useBackLayer(true, onClose, 'caisse-qui');
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

  // Le fichier clients n'est lu que si on en a besoin.
  React.useEffect(() => {
    if (etape !== 'compte' || clients || !etablissementId) return undefined;
    let vivant = true;
    caisse.listClients(etablissementId).then(({ data, error }) => {
      if (!vivant) return;
      if (error) { setErreurClients(error); return; }
      setErreurClients(null);
      setClients(data);
    });
    return () => { vivant = false; };
  }, [etape, clients, etablissementId]);

  const surTable = reservations.filter((r) => estSurTable(r, table.id));
  const match = makeSearchMatcher(rechercheClient);
  const trouves = rechercheClient.trim().length >= 2
    ? (clients || []).filter((c) => match(c.nom, c.prenom, nomFiche(c))).slice(0, 30)
    : [];

  const retour = <Btn variant="ghost" onClick={() => setEtape('menu')} style={st.btn44}>Retour</Btn>;

  return (
    <div className="modal-sheet-overlay" data-fenetre="" style={st.overlay} onClick={onClose}>
      <div className="modal-sheet" role="region" aria-label="Qui est à cette table ?" data-caisse-qui={etape} style={st.feuille} onClick={(e) => e.stopPropagation()}>
        <div style={st.enTete}>
          <div style={{ minWidth: 0 }}>
            <div style={st.titre}>Qui est à cette table ?</div>
            <div style={st.sousTitre}><span>Table</span> <span data-no-translate>{table.nom}</span></div>
          </div>
          <Btn variant="ghost" onClick={onClose} style={st.btn44}>Fermer</Btn>
        </div>

        {etape === 'menu' && (
          <div style={st.colonne}>
            {surTable.length > 0 && (
              <>
                <div style={st.rangTitre}>Réservée pour cette table</div>
                {surTable.map((r) => (
                  <RangReservation
                    key={r.id}
                    resa={r}
                    principal={surTable.length === 1}
                    disabled={enCours}
                    onClick={() => onChoisir({ qui: 'reservation', reservationId: r.id })}
                  />
                ))}
                <div style={st.rangTitre}>Ou bien</div>
              </>
            )}
            <button type="button" data-cadre="" data-qui="reservation" style={st.choix} onClick={() => setEtape('reservations')}>
              <CalendarCheck size={26} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={st.choixCorps}>
                <span style={st.choixNom}>Une réservation</span>
                <span style={st.choixEtat}><span style={st.num}>{reservations.length}</span> <span>attendues aujourd'hui</span></span>
              </span>
            </button>
            <button type="button" data-cadre="" data-qui="passage" style={st.choix} onClick={() => setEtape('passage')}>
              <Footprints size={26} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={st.choixCorps}>
                <span style={st.choixNom}>Client de passage</span>
                <span style={st.choixEtat}>Sans réservation, compté avec ses couverts</span>
              </span>
            </button>
            <button type="button" data-cadre="" data-qui="compte" style={st.choix} onClick={() => setEtape('compte')}>
              <ContactRound size={26} strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={st.choixCorps}>
                <span style={st.choixNom}>Compte client</span>
                <span style={st.choixEtat}>Une fiche du fichier clients</span>
              </span>
            </button>
          </div>
        )}

        {etape === 'reservations' && (
          <div style={st.colonne}>
            <div style={st.rangTitre}>Réservations du jour</div>
            <ListeReservations
              reservations={reservations}
              tableId={table.id}
              disabled={enCours}
              onChoisir={(r) => onChoisir({ qui: 'reservation', reservationId: r.id })}
            />
            <div>{retour}</div>
          </div>
        )}

        {etape === 'passage' && (
          <div style={st.colonne}>
            <div style={st.rangTitre}>Combien de couverts ?</div>
            <CasesCouverts disabled={enCours} onChoisir={(n) => onChoisir({ qui: 'passage', couverts: n })} />
            <div>{retour}</div>
          </div>
        )}

        {etape === 'compte' && (
          <div style={st.colonne}>
            <div style={st.rangTitre}>Chercher dans le fichier clients</div>
            <Input
              value={rechercheClient}
              onChange={(e) => setRechercheClient(e.target.value)}
              placeholder="Nom ou prénom"
              style={{ minHeight: 44 }}
            />
            {erreurClients && <p style={st.vide}>{erreurClients}</p>}
            {!erreurClients && !clients && <p style={st.vide}>Chargement…</p>}
            {clients && rechercheClient.trim().length < 2 && <p style={st.vide}>Tapez au moins deux lettres.</p>}
            {clients && rechercheClient.trim().length >= 2 && !trouves.length && <p style={st.vide}>Aucune fiche à ce nom.</p>}
            {trouves.map((c) => (
              <button
                key={c.id}
                type="button"
                data-cadre=""
                data-client={c.id}
                style={st.rang}
                onClick={() => { setClient(c); setEtape('compteCouverts'); }}
              >
                <span style={st.rangCorps}>
                  <span style={st.rangNom} data-no-translate>{nomFiche(c)}</span>
                  {c.allergies && (
                    <span style={st.rangDetail}><span>Allergies :</span> <span data-no-translate>{c.allergies}</span></span>
                  )}
                </span>
              </button>
            ))}
            <div>{retour}</div>
          </div>
        )}

        {etape === 'compteCouverts' && client && (
          <div style={st.colonne}>
            <div style={st.rangTitre}>
              <span>Combien de couverts pour</span> <span data-no-translate>{nomFiche(client)}</span> <span>?</span>
            </div>
            {client.allergies && (
              <p style={st.vide}><span>Allergies :</span> <span data-no-translate>{client.allergies}</span></p>
            )}
            <CasesCouverts disabled={enCours} onChoisir={(n) => onChoisir({ qui: 'compte', clientId: client.id, couverts: n })} />
            <div><Btn variant="ghost" onClick={() => setEtape('compte')} style={st.btn44}>Retour</Btn></div>
          </div>
        )}
      </div>
    </div>
  );
}

export const st = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1200, padding: 16,
  },
  feuille: {
    background: 'var(--surface)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    borderRadius: 'var(--r-lg)', padding: '20px 22px', width: 560, maxWidth: '100%',
    maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden',
    boxShadow: 'var(--sh-lg)', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  enTete: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  titre: { fontSize: 20, fontWeight: 500, fontFamily: 'var(--font-serif)', color: 'var(--text)', lineHeight: 1.2 },
  sousTitre: { fontSize: 13, color: 'var(--text2)', marginTop: 2 },
  colonne: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  ligne: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  rangTitre: { fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '6px 0 0' },
  vide: { color: 'var(--text2)', fontSize: 14, margin: 0 },
  num: { fontFamily: 'var(--font-num)' },
  btn44: { minHeight: 44, flexShrink: 0 },
  // Gros boutons des trois choix.
  choix: {
    display: 'flex', alignItems: 'center', gap: 14, minHeight: 68, width: '100%', padding: '12px 16px',
    borderRadius: 'var(--r-lg)', background: 'var(--surface)', color: 'var(--accent)', border: 'none',
    cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', boxSizing: 'border-box',
    boxShadow: 'inset 0 0 0 1px var(--btn-bord)',
  },
  choixCorps: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  choixNom: { fontSize: 17, fontWeight: 500, lineHeight: 1.2 },
  choixEtat: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.3 },
  // Une réservation en rang tappable.
  rang: {
    display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, width: '100%', padding: '10px 14px',
    borderRadius: 'var(--r-lg)', background: 'var(--surface)', color: 'var(--text)', border: 'none',
    cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 15, textAlign: 'left', boxSizing: 'border-box',
    boxShadow: 'inset 0 0 0 1px var(--btn-bord)',
  },
  rangPrincipal: { background: 'var(--accent)', color: 'var(--on-accent)', minHeight: 72, boxShadow: 'none' },
  rangHeure: { fontFamily: 'var(--font-num)', fontSize: 18, fontWeight: 600, flexShrink: 0, minWidth: 52 },
  rangCorps: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 },
  rangNom: { fontSize: 16, fontWeight: 600, lineHeight: 1.2, overflowWrap: 'anywhere' },
  rangDetail: { display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.3 },
  detailPrincipal: { color: 'var(--on-accent)' },
  // Cases de couverts : 1 à 8, puis « + ».
  cases: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 },
  case: {
    minHeight: 60, borderRadius: 'var(--r-lg)', background: 'var(--surface)', color: 'var(--text)', border: 'none',
    cursor: 'pointer', fontFamily: 'var(--font-num)', fontSize: 22, fontWeight: 600,
    boxShadow: 'inset 0 0 0 1px var(--btn-bord)',
  },
  caseActive: { background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: 'none' },
};
