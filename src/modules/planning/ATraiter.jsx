import React from 'react';
import { Btn, Panneau } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { periodeAbsence } from '../../utils/absences.js';
import { contexteDemande, demandesATraiter, PHRASE_DEMANDE } from './demandesConge.js';

// ─────────────────────────────────────────────────────────────────────────────
// « À traiter » (lot L5) : ce qui attend la décision de qui gère le planning.
// Les demandes de congé des employés, puis les échanges de services repris
// par un collègue (lot C2). Une carte par demande, avec ce qu'il faut savoir
// pour décider : la période, qui d'autre est absent, les services de la
// personne ces jours-là (ils passent à pourvoir si la demande est acceptée).
//
// Monté par l'accueil du module et par la grille (colonne à droite dès que la
// place le permet, en tête sinon : planning.css). Rien n'est rendu sans
// demande ouverte. Noms, dates et nombres dans leurs propres nœuds : les
// phrases autour restent des entrées du glossaire.
// ─────────────────────────────────────────────────────────────────────────────

const dateCH = (iso) => iso.split('-').reverse().join('.');
const majuscule = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

function Decision({ occupe, onRefuser, onAccepter }) {
  return (
    <div style={st.boutons}>
      <Btn disabled={occupe} onClick={onRefuser} style={st.bouton}>Refuser</Btn>
      <Btn variant="success" disabled={occupe} onClick={onAccepter} style={st.bouton}>Accepter</Btn>
    </div>
  );
}

function CarteDemande({ demande, absences, shifts, nomDe, occupe, onDecider }) {
  const c = contexteDemande({ demande, absences, shifts });
  return (
    <div style={st.item} data-demande-conge={demande.id}>
      <div style={st.titre}>
        <span data-no-translate>{nomDe(demande.userId)}</span> <span>{PHRASE_DEMANDE[demande.motif] || PHRASE_DEMANDE.conge}</span>
      </div>
      <div style={st.detail}>
        <span>{majuscule(periodeAbsence(demande))}</span>, <span data-no-translate>{c.jours}</span> <span>{c.jours > 1 ? 'jours' : 'jour'}</span>.
      </div>
      <div style={st.detail}>
        {c.autresAbsents.length
          ? <><span>Absences ces jours-là :</span> <span data-no-translate>{c.autresAbsents.map(nomDe).join(', ')}</span>.</>
          : <span>Aucune autre absence ces jours-là.</span>}
      </div>
      <div style={st.detail}>
        {c.services.length
          ? <><span data-no-translate>{c.services.length}</span> <span>{c.services.length > 1 ? 'services prévus ces jours-là, à pourvoir si vous acceptez.' : 'service prévu ces jours-là, à pourvoir si vous acceptez.'}</span></>
          : <span>Aucun service prévu ces jours-là.</span>}
      </div>
      <Decision occupe={occupe} onRefuser={() => onDecider(false)} onAccepter={() => onDecider(true)} />
    </div>
  );
}

function CarteEchange({ echange, shift, nomDe, occupe, onDecider }) {
  return (
    <div style={st.item} data-echange-a-valider={echange.id}>
      <div style={st.titre}>
        <span data-no-translate>{nomDe(echange.repreneur)}</span> <span>reprend le service de</span> <span data-no-translate>{nomDe(echange.demandeur)}</span>
      </div>
      {shift && (
        <div style={st.detail}>
          <span data-no-translate>{dateCH(shift.date)}, {shift.debut}-{shift.fin}</span>
        </div>
      )}
      <Decision occupe={occupe} onRefuser={() => onDecider(false)} onAccepter={() => onDecider(true)} />
    </div>
  );
}

export default function ATraiter({ demandes = [], echanges = [], absences = [], shifts = [], nomDe = () => '', onDeciderDemande = null, onDeciderEchange = null, style = null }) {
  const [occupe, setOccupe] = React.useState(null);
  const ouvertes = onDeciderDemande ? demandesATraiter(demandes) : [];
  const aValider = onDeciderEchange ? echanges.filter((e) => e.statut === 'repris') : [];
  const shiftParId = React.useMemo(() => new Map(shifts.map((x) => [x.id, x])), [shifts]);
  const total = ouvertes.length + aValider.length;
  if (!total) return null;

  const agir = async (cle, action, succes) => {
    setOccupe(cle);
    try {
      const err = await action();
      notify(err || succes, err ? 'error' : 'success');
    } finally {
      setOccupe(null);
    }
  };

  return (
    // Card ne transmet ni classe ni attribut : l'enveloppe les porte.
    <section data-a-traiter="" className="no-print" style={style}>
    <Panneau style={st.carte}>
      <div style={st.entete}>
        <div style={st.titreCarte}>À traiter</div>
        <span style={st.compte} data-no-translate>{total}</span>
      </div>
      <div className="pl-traiter-liste">
        {ouvertes.map((d) => (
          <CarteDemande
            key={d.id}
            demande={d}
            absences={absences}
            shifts={shifts}
            nomDe={nomDe}
            occupe={occupe === d.id}
            onDecider={(accepter) => agir(d.id, async () => (await onDeciderDemande(d.id, accepter)).error,
              accepter ? 'Demande acceptée : l\'absence est au planning.' : 'Demande refusée.')}
          />
        ))}
        {aValider.map((e) => (
          <CarteEchange
            key={e.id}
            echange={e}
            shift={shiftParId.get(e.shift_id)}
            nomDe={nomDe}
            occupe={occupe === e.id}
            onDecider={(accepter) => agir(e.id, () => onDeciderEchange(e.id, accepter),
              accepter ? 'Échange validé : le planning est à jour.' : 'Échange refusé.')}
          />
        ))}
      </div>
    </Panneau>
    </section>
  );
}

const st = {
  carte: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 },
  entete: { display: 'flex', alignItems: 'center', gap: 10 },
  titreCarte: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  compte: {
    minWidth: 28, height: 28, padding: '0 8px', borderRadius: 'var(--r-full)', background: 'var(--piste)', color: 'var(--text)',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--t1)', fontWeight: 'var(--g3)', fontFamily: 'var(--font-num)',
  },
  // Tuile intérieure : une demande, sa décision dessous.
  item: { background: 'var(--piste)', borderRadius: 'var(--r)', padding: 14, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  titre: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', lineHeight: 1.4 },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.5 },
  boutons: { display: 'flex', gap: 8, marginTop: 6 },
  bouton: { flex: '1 1 0', minHeight: 40, fontSize: 'var(--t2)' },
};
