import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { Fenetre } from '../../components/ui/Fenetres.jsx';
import { heureCourte } from './clients.js';

// ─────────────────────────────────────────────────────────────────────────────
// Bandeau du service, en tête du plan de la caisse (26.11.2026) : combien de
// réservations sont arrivées, prévues, en retard ou en no-show pour le service
// du moment, avec leurs couverts. Un toucher sur un chiffre ouvre la liste.
// Dans la liste « En retard », la salle pose « Arrivé » ou, passé le délai
// réglé, « No-show » : un toucher par réservation, jamais rien de seul (RPC
// caisse_corriger_reservation, appelée par Caisse.jsx). Dans la liste
// « Arrivées », une arrivée qu'aucun ticket ouvert ne porte (ticket annulé,
// arrivée cochée sans ticket) peut libérer sa table : la réservation passe à
// parti et reste comptée dans les arrivées. En mode test, les listes se lisent
// sans geste : le poste n'écrit rien dans les réservations.
// Les comptes viennent de reservationsDuService (accueilCaisse.js).
// Les noms des clients et des tables sont des données : data-no-translate.
// ─────────────────────────────────────────────────────────────────────────────

const N = ({ children, style }) => <span data-no-translate="" style={style}>{children}</span>;

const VOLETS = {
  arrivees: { titre: 'Arrivées', un: 'arrivée', plusieurs: 'arrivées', vide: "Personne n'est encore arrivé pour ce service." },
  prevues: { titre: 'Prévues', un: 'prévue', plusieurs: 'prévues', vide: "Plus aucune réservation n'est attendue pour ce service." },
  retard: { titre: 'En retard', un: 'en retard', plusieurs: 'en retard', vide: "Aucune réservation n'est en retard." },
  noShow: { titre: 'No-show', un: 'no-show', plusieurs: 'no-show', vide: "Aucun no-show pour ce service." },
};

// Tables d'une réservation, par leur nom, dans l'ordre du plan.
function tablesDe(resa, nomsTables) {
  return (resa.reservation_tables || [])
    .map((l) => nomsTables.get(l.table_id))
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

// Les deux gestes d'une réservation en retard, partagés avec « À faire
// maintenant » (PlanTables.jsx).
export function GestesRetard({ resa, onPoser, enCours = false, delaiMinutes }) {
  return (
    <span style={st.gestes}>
      <Btn variant="ghost" disabled={enCours} onClick={() => onPoser(resa, 'arrive')} style={st.geste}>Arrivé sans ticket</Btn>
      {resa.peutNoShow
        ? <Btn variant="danger" disabled={enCours} onClick={() => onPoser(resa, 'no_show')} style={st.geste}>No-show</Btn>
        : <span style={st.attente}><span>No-show proposé dès</span> <span style={st.num}>{delaiMinutes}</span> <span>min</span></span>}
    </span>
  );
}

// colonne : posé dans la colonne de droite du plan (grand écran), les quatre
// chiffres deux par deux, avec leurs couverts.
export default function BandeauService({ service, resas, nomsTables = new Map(), actions = true, statutEnCours = null, onPoser, delaiMinutes = 30, colonne = false }) {
  const [volet, setVolet] = React.useState(null);
  const { couverts } = resas;
  const segments = [
    { cle: 'arrivees', n: resas.arrivees.length, ton: resas.arrivees.length ? 'succes' : null, detail: <Couverts n={couverts.arrivees} /> },
    {
      cle: 'prevues', n: resas.prevues.length, ton: null,
      detail: resas.prochaine
        ? <span><span>prochaine à</span> <span style={st.num}>{resas.prochaine}</span></span>
        : <Couverts n={couverts.prevues} />,
    },
    { cle: 'retard', n: resas.retard.length, ton: resas.retard.length ? 'alerte' : null, detail: <Couverts n={couverts.retard} /> },
    { cle: 'noShow', n: resas.noShow.length, ton: resas.noShow.length ? 'danger' : null, detail: <Couverts n={couverts.noShow} /> },
  ];
  const liste = volet ? resas[volet] : [];

  return (
    <div className={colonne ? 'caisse-service caisse-service--colonne' : 'caisse-service'} data-caisse-service="">
      <div className="caisse-service-grille" data-cadre="" style={st.carte} role="group" aria-label={service === 'midi' ? 'Réservations de ce midi' : 'Réservations de ce soir'}>
        <span className="caisse-service-titre" style={st.titre}>{service === 'midi' ? 'Ce midi' : 'Ce soir'}</span>
        {segments.map((s) => (
          <button
            key={s.cle}
            type="button"
            data-caisse-service-segment={s.cle}
            onClick={() => setVolet(s.cle)}
            style={{ ...st.segment, ...(s.ton ? TONS[s.ton].fond : null) }}
          >
            <span style={{ ...st.chiffre, ...(s.ton ? TONS[s.ton].encre : null) }}><N>{s.n}</N></span>
            <span style={st.libelle}>{s.n > 1 ? VOLETS[s.cle].plusieurs : VOLETS[s.cle].un}</span>
            <span className="caisse-service-detail" style={st.detail}>{s.detail}</span>
          </button>
        ))}
      </div>
      {volet && (
        <Fenetre
          id={'caisse-service-' + volet}
          titre={VOLETS[volet].titre}
          sousTitre={service === 'midi' ? 'Réservations de ce midi' : 'Réservations de ce soir'}
          onClose={() => setVolet(null)}
          largeur={520}
        >
          {!liste.length && <p style={st.vide}>{VOLETS[volet].vide}</p>}
          {liste.length > 0 && (
            <div className="caisse-liste" style={st.liste}>
              {liste.map((r) => {
                const tables = tablesDe(r, nomsTables);
                return (
                  <div key={r.id} style={st.rang} data-caisse-service-resa={r.id}>
                    <span style={st.heure}>{heureCourte(r.heure_arrivee)}</span>
                    <span style={st.infos}>
                      <N style={st.nom}>{r.nom}</N>
                      <span style={st.ligne}>
                        <Couverts n={r.nb_couverts} />
                        {tables.length > 0 && <span><span>{tables.length > 1 ? 'tables' : 'table'}</span> <N>{tables.join(', ')}</N></span>}
                        {volet === 'retard' && <span><span>attendue depuis</span> <span style={st.num}>{r.retard}</span> <span>min</span></span>}
                      </span>
                    </span>
                    {volet === 'retard' && actions && (
                      <GestesRetard resa={r} onPoser={onPoser} enCours={statutEnCours === r.id} delaiMinutes={delaiMinutes} />
                    )}
                    {volet === 'arrivees' && actions && r.peutLiberer && (
                      <Btn
                        variant="ghost"
                        disabled={statutEnCours === r.id}
                        onClick={() => onPoser(r, 'parti')}
                        style={st.geste}
                      >
                        Libérer la table
                      </Btn>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Fenetre>
      )}
    </div>
  );
}

function Couverts({ n }) {
  return <span><span style={st.num}>{n || 0}</span> <span>couv.</span></span>;
}

const TONS = {
  succes: { fond: { background: 'var(--success-bg-soft)' }, encre: { color: 'var(--success-text)' } },
  alerte: { fond: { background: 'var(--warning-bg-soft)' }, encre: { color: 'var(--warning-text)' } },
  danger: { fond: null, encre: { color: 'var(--danger-text)' } },
};

const st = {
  carte: {
    display: 'grid', alignItems: 'stretch', gap: 6, padding: 6, boxSizing: 'border-box', minWidth: 0,
    background: 'var(--zone)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--sh)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
  },
  titre: { alignSelf: 'center', padding: '0 10px', fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', whiteSpace: 'nowrap' },
  segment: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 1, minWidth: 0, minHeight: 56,
    padding: '6px 12px', boxSizing: 'border-box', cursor: 'pointer', textAlign: 'left',
    background: 'transparent', color: 'var(--text)', borderRadius: 'var(--r)', borderWidth: 0, fontFamily: 'var(--font)',
  },
  chiffre: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t5)', lineHeight: 1.1, color: 'var(--text)' },
  libelle: { fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text)', whiteSpace: 'nowrap' },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)', whiteSpace: 'nowrap' },
  num: { fontFamily: 'var(--font-num)' },
  vide: { color: 'var(--text3)', fontSize: 'var(--t2)', margin: 0 },
  liste: { display: 'flex', flexDirection: 'column' },
  rang: {
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 12px', minHeight: 56, padding: '10px 0', boxSizing: 'border-box',
    borderWidth: 0, borderBottomWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)', color: 'var(--text)',
  },
  heure: { fontFamily: 'var(--font-num)', fontSize: 'var(--t3)', minWidth: 52, flexShrink: 0 },
  infos: { display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 180px', minWidth: 0 },
  nom: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', overflowWrap: 'anywhere' },
  ligne: { display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 'var(--t1)', color: 'var(--text2)' },
  gestes: { display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  geste: { minHeight: 44 },
  attente: { fontSize: 'var(--t1)', color: 'var(--text3)' },
};
