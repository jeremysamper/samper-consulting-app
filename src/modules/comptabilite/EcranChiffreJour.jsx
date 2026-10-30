import React from 'react';
import { supabase } from '../../services/supabase.js';
import { notify } from '../../components/toast/index.js';
import { Btn } from '../../components/ui/index.jsx';
import SegmentedTabs from '../../components/ui/SegmentedTabs.jsx';
import EtatAbsent from './EtatAbsent.jsx';
import { MAPPERS, enregistrerChiffreJour, useLecture } from './comptaService.js';
import { TAUX_VENTES, derniersJours } from './ventesCompta.js';
import { ajouterJours } from './periodesCompta.js';
import { Chf, chf, dateCH, jourCourt, lireMontant, st as ui } from './comptaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Chiffre du jour : le chiffre d'affaires d'un jour, TVA comprise, par taux,
// comme sur le ticket de caisse du soir. Une saisie remplace la caisse pour ce
// jour. Le jour choisi est relu en base à chaque changement (un jour hors de
// la fenêtre lue par l'accueil n'est jamais pris pour vide : enregistrer
// effacerait alors un taux déjà saisi). Les 14 derniers jours dessous :
// toucher un jour le choisit.
// ─────────────────────────────────────────────────────────────────────────────

const CHOIX = [
  { id: 'aujourdhui', label: 'Aujourd\'hui' },
  { id: 'hier', label: 'Hier' },
  { id: 'autre', label: 'Autre jour' },
];

function Formulaire({ etabId, jour, lignes, taux, peutEcrire, posTtc, onEnregistre }) {
  const [valeurs, setValeurs] = React.useState(() => Object.fromEntries(taux.map((t) => {
    const l = lignes.find(x => x.taux === t.taux);
    return [t.cle, l ? String(l.montantTtc) : ''];
  })));
  const [enCours, setEnCours] = React.useState(false);
  const lus = Object.fromEntries(taux.map(t => [t.cle, lireMontant(valeurs[t.cle])]));
  const valide = Object.values(lus).every(v => v === null || Number.isFinite(v));
  const total = Object.values(lus).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  const saisi = Object.values(lus).some(v => v !== null);

  async function enregistrer() {
    if (!valide || enCours || !peutEcrire) return;
    setEnCours(true);
    try {
      const { error } = await enregistrerChiffreJour(etabId, jour, lus);
      if (error) { notify(error, 'error'); return; }
      notify(`Chiffre du ${dateCH(jour)} enregistré.`, 'success');
      onEnregistre?.();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div style={st.formulaire} data-formulaire-jour={jour}>
      {taux.map(t => (
        <label key={t.cle} className="compta-champ-taux" htmlFor={`compta-jour-${t.cle}`}>
          <span style={st.label}>{t.label}</span>
          <span style={st.champLigne}>
            <input
              id={`compta-jour-${t.cle}`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={valeurs[t.cle]}
              readOnly={!peutEcrire}
              onChange={e => setValeurs(v => ({ ...v, [t.cle]: e.target.value }))}
              style={{ ...st.champ, ...(Number.isNaN(lus[t.cle]) ? { borderColor: 'var(--danger-bd)' } : null) }}
            />
            <span style={st.unite}>CHF</span>
          </span>
        </label>
      ))}
      {!valide && <div style={{ ...ui.remarque, color: 'var(--danger-text)' }}>Un montant en francs, avec au plus deux décimales.</div>}
      <div style={st.total}>
        <span>Total du jour :</span> <span style={{ fontFamily: 'var(--font-num)' }}><span>CHF</span> <span>{chf(total)}</span></span>
      </div>
      {posTtc != null && (
        <div style={ui.remarque}>
          <span>La caisse a enregistré</span> <Chf v={posTtc} /> <span>ce jour-là. Une saisie ici la remplace pour ce jour.</span>
        </div>
      )}
      {peutEcrire ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Btn variant="primary" onClick={enregistrer} disabled={!valide || enCours || (!saisi && !lignes.length)} style={ui.primaire}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </Btn>
        </div>
      ) : (
        <div style={ui.remarque}>Seule une personne qui règle les factures peut saisir le chiffre d'affaires.</div>
      )}
    </div>
  );
}

export default function EcranChiffreJour({
  etabId, aujourdhui, jourInitial, peutEcrire, hebergement, absente, parJourTout, joursOuverts, horairesPrets, onEnregistre, notesCouvrent = false,
}) {
  const hier = ajouterJours(aujourdhui, -1);
  const [choix, setChoix] = React.useState(() => (!jourInitial || jourInitial === aujourdhui ? 'aujourdhui' : jourInitial === hier ? 'hier' : 'autre'));
  const [dateAutre, setDateAutre] = React.useState(jourInitial && jourInitial !== aujourdhui && jourInitial !== hier ? jourInitial : hier);
  const jour = choix === 'aujourdhui' ? aujourdhui : choix === 'hier' ? hier : dateAutre;
  const jourValide = /^\d{4}-\d{2}-\d{2}$/.test(String(jour || '')) && jour <= aujourdhui;

  const lireJour = React.useCallback(async () => {
    const { data, error } = await supabase.from('ventes_jour').select('*').eq('etablissement_id', etabId).eq('jour', jour);
    if (error) throw error;
    return (data || []).map(MAPPERS.ventes_jour);
  }, [etabId, jour]);
  const duJour = useLecture(`compta-jour|${etabId}|${jour}`, lireJour, { actif: !absente && !!etabId && jourValide, tables: ['ventes_jour'] });

  const taux = TAUX_VENTES.filter(t => t.taux !== 3.8 || hebergement || (duJour.data || []).some(l => l.taux === 3.8));
  const posTtc = parJourTout.find(j => j.jour === jour)?.posTtc ?? null;

  const quatorze = derniersJours(aujourdhui, 14);
  const ouvertsConnus = horairesPrets && quatorze.some(j => joursOuverts.has(j));
  const choisir = (j) => {
    if (j === aujourdhui) setChoix('aujourdhui');
    else if (j === hier) setChoix('hier');
    else { setChoix('autre'); setDateAutre(j); }
  };

  if (absente) return <EtatAbsent />;

  return (
    <div style={ui.page}>
      <div style={st.choixJour}>
        <SegmentedTabs tabs={CHOIX} active={choix} onChange={setChoix} />
        {choix === 'autre' && (
          <input
            type="date"
            aria-label="Jour"
            value={dateAutre || ''}
            max={aujourdhui}
            onChange={e => setDateAutre(e.target.value)}
            style={st.date}
          />
        )}
      </div>

      {!jourValide ? (
        <div style={ui.remarque}>Choisissez un jour passé ou aujourd'hui.</div>
      ) : duJour.status === 'loading' ? (
        <div style={ui.remarque}>Chargement…</div>
      ) : duJour.status === 'error' ? (
        <div style={{ ...ui.remarque, color: 'var(--danger-text)' }}>Lecture impossible pour l'instant. Nouvel essai en cours.</div>
      ) : (
        <Formulaire
          key={jour}
          etabId={etabId}
          jour={jour}
          lignes={duJour.data || []}
          taux={taux}
          peutEcrire={peutEcrire}
          posTtc={posTtc}
          onEnregistre={() => { duJour.reload(); onEnregistre?.(); }}
        />
      )}

      <section style={ui.section} data-quatorze="">
        <div style={ui.sectionTitre}>Les 14 derniers jours</div>
        <div>
          {quatorze.map((j) => {
            const v = parJourTout.find(x => x.jour === j);
            const etat = v?.source
              ? <><Chf v={v.ttc} /> <span style={st.etatJour}>{v.source === 'manuel' ? 'saisi' : 'caisse'}</span></>
              // Hôtel sans saisie ni caisse : les notes de séjour font le jour.
              : notesCouvrent && v?.avecNotes ? <><Chf v={v.ttc} /> <span style={st.etatJour}>notes de séjour</span></>
              : j === aujourdhui ? <span style={st.etatJour}>pas encore saisi</span>
                : ouvertsConnus && !joursOuverts.has(j) ? <span style={st.etatJour}>fermé</span>
                  : <span style={{ ...st.etatJour, color: 'var(--warning-text)' }}>manque</span>;
            return (
              <button
                key={j}
                type="button"
                className="compta-jour"
                data-cadre=""
                data-jour={j}
                onClick={() => choisir(j)}
                style={{ ...st.jour, ...(j === jour ? st.jourActif : null) }}
              >
                <span style={{ minWidth: 0 }}>{jourCourt(j)}</span>
                <span style={st.jourDroite}>{etat}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const st = {
  choixJour: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 },
  date: {
    minWidth: 200, minHeight: 44, padding: '8px 10px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
    borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14, boxSizing: 'border-box',
  },
  formulaire: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 },
  label: { fontSize: 14, color: 'var(--text)' },
  champLigne: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  champ: {
    flex: '1 1 auto', minWidth: 0, minHeight: 44, padding: '10px 12px', textAlign: 'right',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 8,
    background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-num)', fontSize: 16, boxSizing: 'border-box',
  },
  unite: { fontSize: 13, color: 'var(--text2)', flexShrink: 0 },
  total: { fontSize: 15, color: 'var(--text)', fontWeight: 500 },
  jour: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', minHeight: 44,
    padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text)',
    fontFamily: 'var(--font)', fontSize: 14, textAlign: 'left', cursor: 'pointer', boxSizing: 'border-box',
  },
  jourActif: { background: 'var(--accent-light)' },
  jourDroite: { display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 },
  etatJour: { fontSize: 12, color: 'var(--text2)' },
};
