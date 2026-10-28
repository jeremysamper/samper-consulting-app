import React from 'react';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { Puce } from '../dashboard/tableauUi.jsx';
import { Champ, h } from './hotelUi.jsx';
import {
  PENSIONS, STATUTS_SEJOUR, dateCourte, libelleDe, personnes, sejourEnConflit, tonDe, trierChambres,
} from './hotelData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fiche d'un séjour : ce qu'il faut savoir d'un coup d'œil, puis les gestes du
// jour (affecter une chambre, check-in, check-out, no-show, annuler, modifier).
// Les gestes ne s'affichent qu'avec le droit « Modifier » d'Hébergement ; la
// base les refuse de même (RLS sejours_update). Le check-out remet la chambre
// « à faire » : c'est le module qui le fait (onCheckOut), et le journal des
// étages le note par déclencheur.
// ─────────────────────────────────────────────────────────────────────────────

export default function SejourFiche({ sejour, chambres, sejours, aujourdhui, peutGerer, onModifier, onAffecter, onStatut, onCheckOut, onClose }) {
  const s = sejour;
  const [chambreId, setChambreId] = React.useState(s.chambreId || '');
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState('');
  React.useEffect(() => { setChambreId(s.chambreId || ''); }, [s.chambreId]);

  const chambre = chambres.find((c) => c.id === s.chambreId) || null;
  const chambresTriees = trierChambres(chambres.filter((c) => c.actif || c.id === s.chambreId));
  const libre = (c) => !sejourEnConflit(sejours, { ...s, chambreId: c.id });
  const occupe = s.statut === 'prevu' || s.statut === 'en_maison';

  const lancer = async (nom, action) => {
    setErreur('');
    setEnCours(nom);
    const res = await action();
    setEnCours('');
    if (res?.error) setErreur(res.error);
    else if (res?.fermer) onClose();
  };

  const affecter = () => lancer('affecter', async () => {
    const cible = chambreId || null;
    if (cible) {
      const conflit = sejourEnConflit(sejours, { ...s, chambreId: cible });
      if (conflit) return { error: `Chambre déjà prise du ${dateCourte(conflit.arrivee)} au ${dateCourte(conflit.depart)} (${conflit.nomHote}).` };
    }
    return onAffecter(s, cible);
  });

  const checkIn = () => lancer('check_in', async () => {
    if (!s.chambreId) return { error: 'Affecte une chambre avant le check-in.' };
    return onStatut(s, 'en_maison');
  });

  const ligne = (label, valeur, brut = false) => (
    <div style={f.ligne}>
      <span style={f.label}>{label}</span>
      <span style={f.valeur} data-no-translate={brut ? '' : undefined}>{valeur}</span>
    </div>
  );

  return (
    <Fenetre
      id="sejour-fiche"
      titre={<span data-no-translate>{s.nomHote}</span>}
      sousTitre={<span data-no-translate>{dateCourte(s.arrivee)} - {dateCourte(s.depart)}</span>}
      onClose={onClose}
      largeur={560}
      pied={peutGerer ? (
        <>
          {occupe && (
            <button type="button" style={st.secondaire} onClick={() => lancer('annuler', () => onStatut(s, 'annule').then((r) => ({ ...r, fermer: !r?.error })))} disabled={!!enCours}>
              Annuler le séjour
            </button>
          )}
          <button type="button" style={st.secondaire} onClick={() => onModifier(s)} disabled={!!enCours}>Modifier</button>
          {s.statut === 'prevu' && (
            <button type="button" style={st.secondaire} onClick={() => lancer('no_show', () => onStatut(s, 'no_show').then((r) => ({ ...r, fermer: !r?.error })))} disabled={!!enCours}>
              No-show
            </button>
          )}
          {s.statut === 'prevu' && (
            <button type="button" style={st.primaire} onClick={checkIn} disabled={!!enCours}>Check-in</button>
          )}
          {s.statut === 'en_maison' && (
            <button type="button" style={st.primaire} onClick={() => lancer('check_out', () => onCheckOut(s).then((r) => ({ ...r, fermer: !r?.error })))} disabled={!!enCours}>
              Check-out
            </button>
          )}
        </>
      ) : null}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Puce ton={tonDe(STATUTS_SEJOUR, s.statut)}>{libelleDe(STATUTS_SEJOUR, s.statut)}</Puce>
        {s.statut === 'prevu' && s.arrivee === aujourdhui && <span style={h.detail}>Arrive aujourd'hui</span>}
        {s.statut === 'en_maison' && s.depart === aujourdhui && <span style={h.detail}>Part aujourd'hui</span>}
      </div>

      <div style={f.bloc}>
        {ligne('Chambre', chambre ? chambre.numero : 'Pas encore affectée', !!chambre)}
        {ligne('Personnes', <><span>{s.nbAdultes}</span> <span>{s.nbAdultes > 1 ? 'adultes' : 'adulte'}</span>{s.nbEnfants ? <>, <span>{s.nbEnfants}</span> <span>{s.nbEnfants > 1 ? 'enfants' : 'enfant'}</span></> : null}</>)}
        {ligne('Pension', libelleDe(PENSIONS, s.pension))}
        {s.origine && ligne('Origine', s.origine, true)}
        {s.demandesSpeciales && ligne('Demandes spéciales', s.demandesSpeciales, true)}
        {s.notes && ligne('Notes', s.notes, true)}
      </div>

      {peutGerer && occupe && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <Champ label={chambre ? 'Changer de chambre' : 'Affecter une chambre'}>
              <select style={h.saisie} value={chambreId} onChange={(e) => setChambreId(e.target.value)}>
                <option value="">Aucune chambre</option>
                {chambresTriees.map((c) => (
                  <option key={c.id} value={c.id} disabled={!libre(c) && c.id !== s.chambreId}>
                    {c.numero}{c.categorie ? ` (${c.categorie})` : ''}{libre(c) || c.id === s.chambreId ? '' : ' : prise'}
                  </option>
                ))}
              </select>
            </Champ>
          </div>
          <button type="button" style={st.secondaire} onClick={affecter} disabled={!!enCours || (chambreId || null) === (s.chambreId || null)}>
            {enCours === 'affecter' ? 'Enregistrement…' : 'Enregistrer la chambre'}
          </button>
        </div>
      )}

      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
      <div style={h.detail}>
        <span>{personnes(s)}</span> <span>{personnes(s) > 1 ? 'personnes au total.' : 'personne au total.'}</span>
      </div>
    </Fenetre>
  );
}

const f = {
  bloc: { display: 'flex', flexDirection: 'column', gap: 6 },
  ligne: { display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' },
  label: { fontSize: 12, fontWeight: 500, color: 'var(--text2)', flex: '0 0 140px' },
  valeur: { fontSize: 14, color: 'var(--text)', flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' },
};
