import React from 'react';
import { Fenetre, st as fs } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { ui } from '../compte/sections/reglagesUi.jsx';
import { ChoixMultiple } from '../compte/sections/reglagesMaisonUi.jsx';
import { CaseReglage, EtatModule } from '../compte/sections/reglagesModulesUi.jsx';
import { JOURS_SEMAINE } from '../haccp/JoursCreneau.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Section « SOP » de la page des réglages (plan 15, lot 2) : pour chaque
// procédure de la maison, sa fréquence, les rôles qui la font et son rappel
// (colonnes de sops : frequence, roles_designes, rappel_actif, rappel_moment,
// rappel_heure, rappel_jours). Les colonnes de réglage s'écrivent par la
// direction de la maison (déclencheur en base) ; le lot 5 les lit pour
// « À faire maintenant ». Le contenu des procédures reste dans le module.
// ─────────────────────────────────────────────────────────────────────────────

const FREQUENCES = [
  { id: 'quotidienne', label: 'Quotidienne' },
  { id: 'hebdomadaire', label: 'Hebdomadaire' },
  { id: 'mensuelle', label: 'Mensuelle' },
  { id: 'ponctuelle', label: 'Ponctuelle' },
];
const ROLES = [
  { id: 'patron', label: 'Patron' },
  { id: 'resp_cuisine', label: 'Responsable cuisine' },
  { id: 'cuisinier', label: 'Cuisinier' },
  { id: 'serveur', label: 'Serveur' },
  { id: 'hote', label: 'Hôte' },
  // Rôles hôtel (revue du 27.11.2026) : ils ouvrent les SOP (moduleConfig).
  { id: 'receptionniste', label: 'Réceptionniste' },
  { id: 'gouvernante', label: 'Gouvernante' },
  { id: 'femme_de_chambre', label: 'Femme / valet de chambre' },
  { id: 'technicien', label: 'Technicien(ne)' },
];
const MOMENTS = [
  { id: 'ouverture', label: "À l'ouverture" },
  { id: 'avant_service', label: 'Avant le service' },
  { id: 'apres_service', label: 'Après le service' },
  { id: 'fermeture', label: 'À la fermeture' },
  { id: 'heure', label: 'À une heure précise' },
];

function useSops(etabId) {
  const [etat, setEtat] = React.useState({ sops: [], status: 'loading' });
  const relire = React.useCallback(async () => {
    if (!etabId) return;
    const { data, error } = await supabase.from('sops').select('*')
      .eq('etablissement_id', etabId).eq('is_template', false).eq('actif', true).order('titre');
    if (error) { console.error('[sops] lecture', error); setEtat((e) => ({ ...e, status: 'error' })); return; }
    setEtat({ sops: data || [], status: 'ready' });
  }, [etabId]);
  React.useEffect(() => {
    relire();
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload ? realtime.subscribeReload(['sops'], relire) : null;
    return () => { if (unsub) unsub(); };
  }, [relire]);
  return { ...etat, relire };
}

export default function SectionReglagesSop({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { sops, status, relire } = useSops(etabId);
  const [edition, setEdition] = React.useState(null);
  if (!etabId) return null;
  if (status !== 'ready') return <EtatModule status={status} />;

  return (
    <div style={ui.liste} data-section-reglages="sop">
      <p style={st.intro}>Pour chaque procédure : sa fréquence, qui la fait et le rappel. Le contenu des procédures se rédige dans le module SOP.</p>
      {sops.length === 0 && <p style={st.intro}>Aucune procédure pour le moment.</p>}
      <div style={st.liste}>
        {sops.map((s) => (
          <button key={s.id} type="button" style={st.ligne} onClick={() => setEdition(s)} data-sop-reglage="">
            <span style={st.titre} data-no-translate="">{s.titre}</span>
            <span style={st.detail}>
              <span>{FREQUENCES.find((f) => f.id === s.frequence)?.label || 'Ponctuelle'}</span>
              <span>, </span>
              {s.roles_designes?.length
                ? s.roles_designes.map((r, i) => (
                  <React.Fragment key={r}>{i > 0 && ', '}<span>{ROLES.find((x) => x.id === r)?.label || r}</span></React.Fragment>
                ))
                : <span>toute l'équipe</span>}
              {s.rappel_actif && <><span>, </span><span>avec rappel</span></>}
            </span>
          </button>
        ))}
      </div>
      {edition && (
        <FenetreSop sop={edition} onClose={() => setEdition(null)} onSaved={() => { setEdition(null); relire(); }} />
      )}
    </div>
  );
}

function FenetreSop({ sop, onClose, onSaved }) {
  const [f, setF] = React.useState(() => ({
    frequence: sop.frequence || 'ponctuelle',
    roles: sop.roles_designes || [],
    rappelActif: !!sop.rappel_actif,
    moment: sop.rappel_moment || 'avant_service',
    heure: sop.rappel_heure ? String(sop.rappel_heure).slice(0, 5) : '',
    jours: Array.isArray(sop.rappel_jours) && sop.rappel_jours.length ? sop.rappel_jours : [1, 2, 3, 4, 5, 6, 7],
  }));
  const [enCours, setEnCours] = React.useState(false);
  const enregistrer = async () => {
    if (f.rappelActif && f.moment === 'heure' && !/^\d{2}:\d{2}$/.test(f.heure)) { notify("Indiquez l'heure du rappel.", 'warning'); return; }
    if (f.rappelActif && !f.jours.length) { notify('Choisissez au moins un jour de rappel.', 'warning'); return; }
    setEnCours(true);
    const { error } = await supabase.from('sops').update({
      frequence: f.frequence,
      roles_designes: f.roles,
      rappel_actif: f.rappelActif,
      rappel_moment: f.rappelActif ? f.moment : null,
      rappel_heure: f.rappelActif && f.moment === 'heure' ? `${f.heure}:00` : null,
      rappel_jours: f.rappelActif && f.jours.length < 7 ? f.jours : null,
    }).eq('id', sop.id);
    setEnCours(false);
    if (error) {
      console.error('[sops] réglage', error);
      notify(String(error.code) === '42501' ? 'Ces réglages sont réservés à la direction de la maison.' : "Les réglages n'ont pas pu être enregistrés. Réessayez.", 'error');
      return;
    }
    notify('Procédure réglée.', 'success');
    onSaved();
  };
  return (
    <Fenetre
      id="sop-reglage"
      titre="Régler la procédure"
      sousTitre={<span data-no-translate="">{sop.titre}</span>}
      onClose={onClose}
      largeur={560}
      pied={(
        <>
          <button type="button" style={fs.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={{ ...fs.primaire, opacity: enCours ? 0.6 : 1 }} disabled={enCours} onClick={enregistrer}>Enregistrer</button>
        </>
      )}
    >
      <label style={fs.section}>
        <span style={fs.label}>Fréquence</span>
        <select style={fs.champ} value={f.frequence} onChange={(e) => setF({ ...f, frequence: e.target.value })}>
          {FREQUENCES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <div style={fs.section}>
        <span style={fs.label}>Qui la fait</span>
        <ChoixMultiple label="Qui la fait" options={ROLES} valeurs={f.roles} onChange={(roles) => setF({ ...f, roles })} />
        <span style={fs.remarque}>Aucun rôle choisi : toute l'équipe.</span>
      </div>
      <div style={fs.section}>
        <CaseReglage libelle="Rappeler la procédure" coche={f.rappelActif} onChange={(v) => setF({ ...f, rappelActif: v })} />
        {f.rappelActif && (
          <>
            <label style={fs.section}>
              <span style={fs.label}>Moment du rappel</span>
              <select style={fs.champ} value={f.moment} onChange={(e) => setF({ ...f, moment: e.target.value })}>
                {MOMENTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </label>
            {f.moment === 'heure' && (
              <label style={fs.section}>
                <span style={fs.label}>Heure</span>
                <input type="time" style={{ ...fs.champ, maxWidth: 200 }} value={f.heure} onChange={(e) => setF({ ...f, heure: e.target.value })} />
              </label>
            )}
            <div style={fs.section}>
              <span style={fs.label}>Jours du rappel</span>
              <ChoixMultiple label="Jours du rappel" options={JOURS_SEMAINE} valeurs={f.jours} onChange={(jours) => setF({ ...f, jours })} />
            </div>
          </>
        )}
      </div>
    </Fenetre>
  );
}

const st = {
  intro: { margin: '0 0 8px', fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.45 },
  liste: { display: 'flex', flexDirection: 'column' },
  ligne: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', minHeight: 'var(--ligne-aeree)',
    padding: '8px 0', background: 'transparent', borderWidth: 0, borderStyle: 'none', borderRadius: 0,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)',
    textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)',
  },
  titre: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)' },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)' },
};
