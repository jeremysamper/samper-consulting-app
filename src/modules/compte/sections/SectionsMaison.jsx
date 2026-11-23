import React from 'react';
import { Btn } from '../../../components/ui/index.jsx';
import { notify } from '../../../components/toast/index.js';
import { useReglagesMaison } from '../../../hooks/useReglagesMaison.js';
import { ChoixMultiple, ChampNombre, EtatMaison } from './reglagesMaisonUi.jsx';
import { Ligne, ui } from './reglagesUi.jsx';
import { synchroniserFermeturesEnLigne } from '../../previsions/fermeturesEnLigne.js';
import { zurichToday } from '../../../utils/zurichTime.js';

// ─────────────────────────────────────────────────────────────────────────────
// Deux réglages de « La maison » (18.11.2026), table reglages_maison :
//   Horaires et fermetures : jours fermés de la semaine et périodes datées.
//     Lus par l'évaluateur d'alertes (aucune alerte de pointage, de relevé
//     HACCP ni de ventes un jour fermé), le planning (en-tête « Fermé ») et le
//     tableau de bord.
//   Objectifs : coût matière, coût du personnel et chiffre visés, tracés dans
//     Statistiques.
// Écriture : consultant et patron (RLS), comme la garde de la section.
// ─────────────────────────────────────────────────────────────────────────────

const JOURS = [
  { id: 1, label: 'Lundi' }, { id: 2, label: 'Mardi' }, { id: 3, label: 'Mercredi' }, { id: 4, label: 'Jeudi' },
  { id: 5, label: 'Vendredi' }, { id: 6, label: 'Samedi' }, { id: 7, label: 'Dimanche' },
];
const dateCH = (iso) => iso.split('-').reverse().join('.');

export function SectionHorairesFermetures({ etablissement }) {
  const maison = useReglagesMaison(etablissement?.id || null);
  const [nouvelle, setNouvelle] = React.useState({ du: '', au: '', motif: '' });
  const [enCours, setEnCours] = React.useState(false);
  if (!etablissement?.id) return null;
  if (maison.status !== 'ready') return <EtatMaison status={maison.status} />;
  const f = maison.fermetures;

  const enregistrer = async (valeur) => {
    if (enCours) return false;
    setEnCours(true);
    const { error } = await maison.enregistrer('fermetures', valeur);
    setEnCours(false);
    if (error) { notify(error, 'error'); return false; }
    // La réservation en ligne lit ses jours fermés ici (plan 15, lot 2) : sa
    // page publique suit tout de suite.
    const sync = await synchroniserFermeturesEnLigne(etablissement.id, f, valeur, zurichToday());
    if (sync.error) {
      console.error('[fermetures] réservation en ligne', sync.error);
      notify("Les fermetures sont enregistrées. La réservation en ligne les prendra à son prochain enregistrement.", 'warning');
    }
    return true;
  };
  const ajouterPeriode = async () => {
    const { du, au } = nouvelle;
    if (!du || !au) { notify('Indiquez le premier et le dernier jour fermés.', 'warning'); return; }
    if (au < du) { notify('Le dernier jour vient avant le premier.', 'warning'); return; }
    const periodes = [...f.periodes, { du, au, motif: nouvelle.motif.trim().slice(0, 80) }].sort((a, b) => a.du.localeCompare(b.du));
    if (await enregistrer({ ...f, periodes })) setNouvelle({ du: '', au: '', motif: '' });
  };

  return (
    <div style={ui.liste} data-reglages-maison="fermetures">
      <Ligne
        colonne
        titre="Jours de fermeture"
        aide="Chaque semaine. Ces jours-là, aucune alerte de pointage, de relevé HACCP ni de ventes n'est envoyée, le planning les marque « Fermé » et la réservation en ligne ne propose rien."
      >
        <ChoixMultiple
          label="Jours de fermeture"
          options={JOURS}
          valeurs={f.joursFermes}
          onChange={(joursFermes) => enregistrer({ ...f, joursFermes })}
          desactive={enCours}
        />
      </Ligne>
      <Ligne colonne derniere titre="Périodes de fermeture" aide="Vacances, travaux, privatisation : du premier au dernier jour fermé, compris.">
        <div style={st.periodes}>
          {f.periodes.length === 0 && <p style={st.vide}>Aucune période de fermeture.</p>}
          {f.periodes.map((p) => (
            <div key={`${p.du}-${p.au}`} style={st.periode} data-periode-fermeture="">
              <span style={st.periodeTexte}>
                <span style={st.dates} data-no-translate="">{dateCH(p.du)} au {dateCH(p.au)}</span>
                {p.motif && <span style={st.motif} data-no-translate="">{p.motif}</span>}
              </span>
              <Btn variant="ghost" disabled={enCours} style={ui.btn44} onClick={() => enregistrer({ ...f, periodes: f.periodes.filter((x) => x !== p) })}>Retirer</Btn>
            </div>
          ))}
          <div style={st.ajout}>
            <label style={st.champBloc}>
              <span style={st.champLabel}>Du</span>
              <input type="date" value={nouvelle.du} onChange={(e) => setNouvelle((n) => ({ ...n, du: e.target.value, au: n.au || e.target.value }))} style={st.champ} />
            </label>
            <label style={st.champBloc}>
              <span style={st.champLabel}>Au</span>
              <input type="date" value={nouvelle.au} min={nouvelle.du || undefined} onChange={(e) => setNouvelle((n) => ({ ...n, au: e.target.value }))} style={st.champ} />
            </label>
            <label style={{ ...st.champBloc, flex: '2 1 200px' }}>
              <span style={st.champLabel}>Motif (facultatif)</span>
              <input type="text" value={nouvelle.motif} maxLength={80} placeholder="Vacances d'hiver" onChange={(e) => setNouvelle((n) => ({ ...n, motif: e.target.value }))} style={st.champ} />
            </label>
            <Btn variant="primary" disabled={enCours} style={{ ...ui.btn44, alignSelf: 'flex-end' }} onClick={ajouterPeriode}>Ajouter</Btn>
          </div>
        </div>
      </Ligne>
    </div>
  );
}

export function SectionObjectifs({ etablissement }) {
  const maison = useReglagesMaison(etablissement?.id || null);
  if (!etablissement?.id) return null;
  if (maison.status !== 'ready') return <EtatMaison status={maison.status} />;
  const o = maison.objectifs;
  const enregistrer = async (champ, valeur) => {
    const { error } = await maison.enregistrer('objectifs', { ...o, [champ]: valeur });
    if (error) notify(error, 'error');
  };
  return (
    <div style={ui.liste} data-reglages-maison="objectifs">
      <p style={st.intro}>Les objectifs se tracent dans Statistiques, sur le graphique de la mesure, et l'écart s'y lit en vert ou en rouge. Un champ vide : pas d'objectif.</p>
      <Ligne titre="Coût matière visé" aide="En pour cent du chiffre d'affaires hors TVA.">
        <ChampNombre label="Coût matière visé" valeur={o.matierePct} unite="%" min={1} max={99} onValider={(v) => enregistrer('matierePct', v)} />
      </Ligne>
      <Ligne titre="Coût du personnel visé" aide="En pour cent du chiffre d'affaires hors TVA. Visible de la direction seule, comme la mesure.">
        <ChampNombre label="Coût du personnel visé" valeur={o.personnelPct} unite="%" min={1} max={99} onValider={(v) => enregistrer('personnelPct', v)} />
      </Ligne>
      <Ligne derniere titre="Chiffre d'affaires visé" aide="Par mois, hors TVA.">
        <ChampNombre label="Chiffre d'affaires visé" valeur={o.caMensuelHt} unite="CHF" min={1} max={100000000} onValider={(v) => enregistrer('caMensuelHt', v)} />
      </Ligne>
    </div>
  );
}

const st = {
  intro: { margin: '0 0 4px', fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.45 },
  periodes: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  vide: { margin: 0, fontSize: 'var(--t2)', color: 'var(--text2)' },
  periode: { display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', minHeight: 'var(--ligne)', borderBottom: '1px solid var(--rule-soft)', flexWrap: 'wrap' },
  periodeTexte: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  dates: { fontSize: 'var(--t2)', color: 'var(--text)', fontFamily: 'var(--font-num)' },
  motif: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  ajout: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', paddingTop: 8 },
  champBloc: { display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 150px', minWidth: 0 },
  champLabel: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  champ: {
    minHeight: 'var(--controle)', boxSizing: 'border-box', width: '100%', maxWidth: '100%', padding: '0 12px',
    borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)',
    background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 'var(--t2)',
  },
};
