import React from 'react';
import { History } from 'lucide-react';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { canManageModule } from '../../data/demoData.js';
import { zurichToday } from '../../utils/zurichTime.js';
import { Puce } from '../dashboard/tableauUi.jsx';
import {
  STATUTS_MENAGE, dateCourte, dateHeureZurich, equipeDe, libelleDe, nomPersonne, sejourDeLaChambre, tonDe,
  trierChambres, useChambres, useJournalChambres, useSejours,
} from '../hebergement/hotelData.js';
import { Champ, Vide, h } from '../hebergement/hotelUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Étages (branche Hôtel, lot H0) : les chambres par étage, avec leur statut de
// ménage, qui s'en occupe et ce qui s'y passe aujourd'hui. Les chambres qui
// attendent une arrivée aujourd'hui sont en tête : ce sont celles à finir
// d'abord. Changer le statut est un geste : un bouton par statut, sur la
// carte de la chambre. iPad et téléphone d'abord : des cartes, jamais un
// tableau large ; les boutons font 44 px au doigt.
//
// Droits : toute l'équipe qui a le module lit ; statut, attribution et motif
// hors service demandent la case « Modifier » d'Étages (ou d'Hébergement), que
// la base vérifie de même (RLS chambres_update + chambres_garde_colonnes).
// L'historique vient du journal écrit par déclencheur.
// ─────────────────────────────────────────────────────────────────────────────

export default function Etages({ user, etablissement }) {
  const etabId = etablissement?.id || null;
  const role = user?.role;
  const peutGerer = canManageModule(role, 'etages') || canManageModule(role, 'hebergement');
  const [aujourdhui, setAujourdhui] = React.useState(() => zurichToday());
  React.useEffect(() => {
    const id = setInterval(() => setAujourdhui(zurichToday()), 60000);
    return () => clearInterval(id);
  }, []);

  const chambres = useChambres(etabId);
  const sejours = useSejours(etabId);
  const journal = useJournalChambres(etabId);
  const equipe = React.useMemo(() => equipeDe(etabId), [etabId]);

  const [motifPour, setMotifPour] = React.useState(null); // chambre à passer hors service
  const [historiquePour, setHistoriquePour] = React.useState(null); // chambre
  const [enCours, setEnCours] = React.useState('');

  const actives = trierChambres(chambres.rows.filter((c) => c.actif));
  const sejourDe = (c) => sejourDeLaChambre(sejours.rows, c.id, aujourdhui);
  const arriveAujourdhui = (c) => sejours.rows.some((s) => s.chambreId === c.id && s.statut === 'prevu' && s.arrivee === aujourdhui);
  const enTete = actives.filter(arriveAujourdhui);
  const etages = [...new Set(actives.map((c) => c.etage || ''))];

  const changer = async (c, valeurs, message) => {
    setEnCours(c.id);
    const res = await chambres.modifier(c.id, valeurs);
    setEnCours('');
    if (res.error) notify(res.error, 'error');
    else {
      if (message) notify(message, 'success');
      // Le journal est écrit par déclencheur : on le relit sans attendre le
      // realtime, pour que l'historique montre tout de suite le changement.
      journal.reload();
    }
    return res;
  };
  const changerStatut = (c, statut) => {
    if (statut === c.statutMenage) return;
    if (statut === 'hors_service') { setMotifPour(c); return; }
    changer(c, { statut_menage: statut, hors_service_motif: null }, `Chambre ${c.numero} : ${libelleDe(STATUTS_MENAGE, statut).toLowerCase()}.`);
  };
  const attribuer = (c, userId) => changer(c, { attribuee_a: userId || null }, userId ? `Chambre ${c.numero} attribuée.` : `Chambre ${c.numero} : attribution retirée.`);

  const nbParStatut = STATUTS_MENAGE.map((s) => ({ ...s, n: actives.filter((c) => c.statutMenage === s.id).length }));

  return (
    <section className="etages" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, maxWidth: '100%' }}>
      {!etabId && <Vide>Aucun établissement sélectionné.</Vide>}
      {etabId && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }} aria-label="Chambres par statut">
          {nbParStatut.map((s) => (
            <Puce key={s.id} ton={s.ton} style={{ fontSize: 13, padding: '4px 10px' }}>
              <span>{s.n}</span><span aria-hidden="true"> </span><span>{s.label}</span>
            </Puce>
          ))}
        </div>
      )}
      {etabId && chambres.status === 'absent' && <Vide>Le socle hôtel n'est pas encore activé sur la base de données.</Vide>}
      {etabId && chambres.status === 'ready' && !actives.length && <Vide>Aucune chambre active. Les chambres se créent dans Hébergement.</Vide>}
      {etabId && chambres.status === 'error' && <Vide>Les chambres n'ont pas pu être lues. Nouvel essai en cours…</Vide>}

      {etabId && enTete.length > 0 && (
        <Groupe titre={<span>Arrivées du jour</span>}>
          {enTete.map((c) => (
            <CarteChambre key={c.id} chambre={c} sejour={sejourDe(c)} aujourdhui={aujourdhui} equipe={equipe} peutGerer={peutGerer}
              enCours={enCours === c.id} onStatut={changerStatut} onAttribuer={attribuer} onHistorique={setHistoriquePour} arrivee />
          ))}
        </Groupe>
      )}

      {etabId && etages.map((etage) => (
        <Groupe key={etage || 'sans'} titre={etage ? <><span>Étage</span> <span data-no-translate>{etage}</span></> : <span>Sans étage</span>}>
          {actives.filter((c) => (c.etage || '') === etage).map((c) => (
            <CarteChambre key={c.id} chambre={c} sejour={sejourDe(c)} aujourdhui={aujourdhui} equipe={equipe} peutGerer={peutGerer}
              enCours={enCours === c.id} onStatut={changerStatut} onAttribuer={attribuer} onHistorique={setHistoriquePour} arrivee={arriveAujourdhui(c)} />
          ))}
        </Groupe>
      ))}

      {motifPour && (
        <MotifHorsService
          chambre={motifPour}
          onClose={() => setMotifPour(null)}
          onValider={async (motif) => {
            const res = await changer(motifPour, { statut_menage: 'hors_service', hors_service_motif: motif || null }, `Chambre ${motifPour.numero} hors service.`);
            if (!res.error) setMotifPour(null);
          }}
        />
      )}
      {historiquePour && (
        <Historique chambre={historiquePour} journal={journal} onClose={() => setHistoriquePour(null)} />
      )}
    </section>
  );
}

function Groupe({ titre, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={h.sousTitre}>{titre}</div>
      <div style={e.grille}>{children}</div>
    </div>
  );
}

function CarteChambre({ chambre: c, sejour: s, aujourdhui, equipe, peutGerer, enCours, onStatut, onAttribuer, onHistorique, arrivee }) {
  const occupant = s ? (
    <span style={h.detail}>
      {s.statut === 'en_maison'
        ? <>{s.depart === aujourdhui ? <span>Part aujourd'hui</span> : <><span>En maison jusqu'au</span> <span>{dateCourte(s.depart)}</span></>}</>
        : <><span>Arrive aujourd'hui</span></>}
      <span aria-hidden="true"> </span>
      <span data-no-translate>{s.nomHote}</span>
    </span>
  ) : <span style={h.detail}>Libre</span>;

  return (
    <div style={{ ...e.carte, ...(arrivee ? e.carteArrivee : null) }} data-chambre={c.numero} data-statut={c.statutMenage}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={e.numero} data-no-translate>{c.numero}</span>
        <Puce ton={tonDe(STATUTS_MENAGE, c.statutMenage)}>{libelleDe(STATUTS_MENAGE, c.statutMenage)}</Puce>
      </div>
      {c.categorie && <span style={h.detail} data-no-translate>{c.categorie}</span>}
      {occupant}
      {c.statutMenage === 'hors_service' && c.horsServiceMotif && (
        <span style={h.detail}><span>Motif :</span> <span data-no-translate>{c.horsServiceMotif}</span></span>
      )}
      {c.attribueeA && !peutGerer && (
        <span style={h.detail}><span>Attribuée à</span> <span data-no-translate>{nomPersonne(c.attribueeA)}</span></span>
      )}
      {peutGerer && (
        <div style={e.statuts} role="group" aria-label={`Statut de la chambre ${c.numero}`}>
          {STATUTS_MENAGE.map((st_) => {
            const actif = st_.id === c.statutMenage;
            return (
              <button
                key={st_.id}
                type="button"
                className="ui-btn"
                aria-pressed={actif}
                disabled={enCours}
                onClick={() => onStatut(c, st_.id)}
                style={{ ...e.bouton, ...(actif ? e.boutonActif : null) }}
              >
                {st_.label}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {peutGerer && (
          <div style={{ flex: '1 1 140px', minWidth: 0 }}>
            <Champ label="Attribuée à">
              <select style={h.saisie} value={c.attribueeA || ''} onChange={(ev) => onAttribuer(c, ev.target.value)} disabled={enCours}>
                <option value="">Pas attribuée</option>
                {equipe.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                {c.attribueeA && !equipe.some((p) => p.id === c.attribueeA) && <option value={c.attribueeA}>{nomPersonne(c.attribueeA)}</option>}
              </select>
            </Champ>
          </div>
        )}
        <button type="button" className="ui-btn ui-btn--ghost" style={e.historique} onClick={() => onHistorique(c)} aria-label={`Historique de la chambre ${c.numero}`}>
          <History size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Historique</span>
        </button>
      </div>
    </div>
  );
}

function MotifHorsService({ chambre, onClose, onValider }) {
  const [motif, setMotif] = React.useState(chambre.horsServiceMotif || '');
  return (
    <Fenetre
      id="chambre-hors-service"
      titre={<><span>Chambre</span> <span data-no-translate>{chambre.numero}</span> <span>hors service</span></>}
      sousTitre="Le motif est visible par toute l'équipe."
      onClose={onClose}
      pied={(
        <>
          <button type="button" style={st.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={st.primaire} onClick={() => onValider(motif.trim())}>Mettre hors service</button>
        </>
      )}
    >
      <Champ label="Motif">
        <input style={h.saisie} value={motif} onChange={(ev) => setMotif(ev.target.value)} placeholder="Fuite, travaux, chauffage…" autoFocus />
      </Champ>
    </Fenetre>
  );
}

function Historique({ chambre, journal, onClose }) {
  const lignes = journal.rows.filter((l) => l.chambreId === chambre.id);
  return (
    <Fenetre
      id="chambre-historique"
      titre={<><span>Historique de la chambre</span> <span data-no-translate>{chambre.numero}</span></>}
      onClose={onClose}
      largeur={520}
    >
      {journal.status === 'loading' && <Vide>Chargement…</Vide>}
      {journal.status !== 'loading' && !lignes.length && <Vide>Aucun changement de statut pour l'instant.</Vide>}
      {lignes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lignes.map((l) => (
            <div key={l.id} style={e.ligneJournal}>
              <span style={{ ...h.detail, fontVariantNumeric: 'tabular-nums' }} data-no-translate>{dateHeureZurich(l.at)}</span>
              <span style={{ fontSize: 14, color: 'var(--text)' }}>
                {l.ancien ? <><span>{libelleDe(STATUTS_MENAGE, l.ancien)}</span> <span>vers</span> <span>{libelleDe(STATUTS_MENAGE, l.nouveau)}</span></> : <><span>Créée</span> <span>{libelleDe(STATUTS_MENAGE, l.nouveau).toLowerCase()}</span></>}
              </span>
              <span style={h.detail}>{l.par ? <span data-no-translate>{nomPersonne(l.par)}</span> : <span>Système</span>}</span>
            </div>
          ))}
        </div>
      )}
    </Fenetre>
  );
}

const e = {
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 12 },
  carte: {
    display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, padding: '14px 16px', boxSizing: 'border-box',
    background: 'var(--surface)', color: 'var(--text)', borderRadius: 'var(--r)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  },
  carteArrivee: { borderColor: 'var(--accent)' },
  numero: { fontFamily: 'var(--font-num)', fontSize: 26, lineHeight: 1.05, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  statuts: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  bouton: {
    minHeight: 44, padding: '8px 12px', fontSize: 13, fontFamily: 'var(--font)', fontWeight: 500, cursor: 'pointer',
    background: 'var(--surface2)', color: 'var(--text)', borderRadius: 'var(--r-sm)',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'transparent', flex: '1 1 auto',
  },
  boutonActif: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)', fontWeight: 700 },
  historique: {
    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '8px 12px', fontSize: 13, fontFamily: 'var(--font)',
    background: 'var(--surface)', color: 'var(--text)', borderRadius: 'var(--r-sm)', cursor: 'pointer',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', flexShrink: 0,
  },
  ligneJournal: { display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid var(--border)' },
};
